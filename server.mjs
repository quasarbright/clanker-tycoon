// Local dev server for clanker tycoon.
// Serves the static game and forwards model calls to Claude Haiku 5.5 through headless Claude Code
// (`claude -p`), which bills to your Claude plan. It holds no game logic: a web build deletes this
// file and switches the game's backend to OpenRouter (see src/llm.js).
//
//   node server.mjs [port]     then open http://localhost:<port>
//   LLM_BRIDGE=<dir> node server.mjs [port]
//                              model calls go through files in <dir> instead of `claude -p`, for
//                              automated playtests in a cloud session (server/bridge.mjs,
//                              docs/cloud-playtest.md). The browser side doesn't change.
//
// It listens on 127.0.0.1 only, since it runs `claude` with your login.
import http from "node:http";
import { readFile, appendFile, mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ask, summarize, MODEL } from "./server/claude.mjs";
import { bridgeAsk, prepare as prepareBridge } from "./server/bridge.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = +process.argv[2] || 8473;
const MAX_CLAUDE = 4; // concurrent `claude -p` processes
const LOG = path.join(ROOT, "logs", "llm.jsonl");
const PLAY = path.join(ROOT, "logs", "play"); // one file per day of play, see src/playlog.js
await mkdir(PLAY, { recursive: true });
const BRIDGE = process.env.LLM_BRIDGE ? path.resolve(process.env.LLM_BRIDGE) : null;
if (BRIDGE) await prepareBridge(BRIDGE);

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".mp3": "audio/mpeg",
};

let running = 0;
const waiting = [];
async function withSlot(fn) {
  if (running >= MAX_CLAUDE) await new Promise((r) => waiting.push(r));
  running++;
  try { return await fn(); } finally { running--; waiting.shift()?.(); }
}

function send(res, status, body, type = "application/json") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

// The newest modification time of the game's files. A tab compares it with what it loaded, so a
// tab left open across an update says so instead of quietly running old code.
async function gameVersion() {
  const files = ["index.html", ...(await readdir(path.join(ROOT, "src"))).map((f) => path.join("src", f))];
  const times = await Promise.all(files.map((f) => stat(path.join(ROOT, f)).then((s) => s.mtimeMs, () => 0)));
  return Math.max(...times);
}

function parseLoose(text) {
  if (!text) return null;
  const t = text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  try { return JSON.parse(t); } catch { return null; }
}

async function handleLlm(req, res) {
  let body = "";
  for await (const chunk of req) body += chunk;
  let input;
  try { input = JSON.parse(body); } catch { return send(res, 400, { error: "bad JSON" }); }
  const { system, prompt, schema, shift, test } = input;
  const source = typeof input.source === "string" ? input.source.slice(0, 20) : test ? "test" : "play";
  if (typeof system !== "string" || typeof prompt !== "string") return send(res, 400, { error: "need system and prompt" });

  const started = Date.now();
  if (BRIDGE) return handleBridge(res, { system, prompt, schema, shift, test, source, started });
  // A normal call takes 2–7 s. Now and then `claude -p` hangs; give up after 40 s and try once more.
  const call = () => withSlot(() => ask({ system, turns: [prompt], schema: schema || null, effort: "low", timeoutMs: 40000 }));
  let out = await call();
  if (!out.turns[0]) { console.error(`retrying after ${out.timedOut ? "timeout" : `exit ${out.code}`}`); out = await call(); }
  const turn = out.turns[0];
  if (!turn) {
    console.error("claude -p gave no result", out.code, out.stderr.slice(-800));
    return send(res, 502, { error: `claude -p exited (${out.code}) without a result. ${out.stderr.slice(-300)}` });
  }
  const s = summarize(turn);
  if (s.is_error) {
    console.error("model error:", String(s.error).slice(0, 300));
    return send(res, 502, { error: String(s.error || "model error") });
  }
  const data = s.structured ?? parseLoose(s.text) ?? { reply: s.text };
  console.log(`llm ${Date.now() - started}ms in=${s.input_tokens} out=${s.output_tokens} (thinking ${s.thinking_tokens})`);
  // Every call, so a worker doing something odd can be traced back to what it was told and decided.
  // Real usage too: tokens and what `claude -p` says the call cost at API prices (server/usage.mjs totals it).
  // Everything `claude -p` reported about the call, with the timestamp on the line, so any period can be totaled later.
  const usage = { input: s.input_uncached, cacheRead: s.cache_read, cacheWrite: s.cache_write, output: s.output_tokens, thinking: s.thinking_tokens,
    costUsd: s.cost_usd_cumulative_cli, model: MODEL, durationMs: s.duration_ms, apiMs: s.duration_api_ms_cumulative, ttftMs: s.ttft_ms, iterations: s.iterations };
  appendFile(LOG, JSON.stringify({ at: new Date().toISOString(), source, shift, test, ms: Date.now() - started, usage, system, prompt, data }) + "\n").catch(() => {});
  send(res, 200, { data, ms: Date.now() - started, tokens: { input: s.input_tokens, output: s.output_tokens } });
}

// The same call through the file bridge: whoever answers it stands in for the model.
async function handleBridge(res, { system, prompt, schema, shift, test, source, started }) {
  let data;
  try { data = await bridgeAsk({ dir: BRIDGE, system, prompt, schema, meta: { shift, source } }); } catch (e) {
    console.error("bridge:", e.message);
    return send(res, 502, { error: e.message });
  }
  console.log(`llm (bridge) ${Date.now() - started}ms`);
  appendFile(LOG, JSON.stringify({ at: new Date().toISOString(), source, shift, test, ms: Date.now() - started, usage: { model: "bridge" }, system, prompt, data }) + "\n").catch(() => {});
  send(res, 200, { data, ms: Date.now() - started });
}

// The play log: the game posts batches of lines, appended to that day's file.
async function handlePlay(req, res) {
  let body = "";
  for await (const chunk of req) body += chunk;
  let lines;
  try { lines = JSON.parse(body).lines; } catch { return send(res, 400, { error: "bad JSON" }); }
  if (!Array.isArray(lines)) return send(res, 400, { error: "need lines" });
  const day = new Date().toISOString().slice(0, 10);
  await appendFile(path.join(PLAY, `${day}.jsonl`), lines.map((l) => JSON.stringify(l) + "\n").join(""));
  send(res, 200, { ok: true });
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/api/llm" && req.method === "POST") return await handleLlm(req, res);
    if (url.pathname === "/api/play" && req.method === "POST") return await handlePlay(req, res);
    if (url.pathname === "/api/version") return send(res, 200, { version: await gameVersion() });
    let p = decodeURIComponent(url.pathname);
    if (p.endsWith("/")) p += "index.html";
    const file = path.normalize(path.join(ROOT, p));
    const hidden = ["server", "logs", ".git"].some((d) => file.startsWith(path.join(ROOT, d) + path.sep));
    if (!file.startsWith(ROOT + path.sep) || hidden) return send(res, 404, "not found", "text/plain");
    const data = await readFile(file).catch(() => null);
    if (!data) return send(res, 404, "not found", "text/plain");
    send(res, 200, data, MIME[path.extname(file)] || "application/octet-stream");
  } catch (e) {
    console.error(e);
    send(res, 500, { error: String(e.message || e) });
  }
}).listen(PORT, "127.0.0.1", () => console.log(`clanker tycoon on http://localhost:${PORT}${BRIDGE ? ` (model calls through the file bridge in ${BRIDGE})` : ""}`));
