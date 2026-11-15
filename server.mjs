// Local dev server for clanker tycoon.
// Serves the static game and forwards model calls to Claude Haiku 5.5 through headless Claude Code
// (`claude -p`), which bills to your Claude plan. It holds no game logic: a web build deletes this
// file and switches the game's backend to OpenRouter (see src/llm.js).
//
//   node server.mjs [port]     then open http://localhost:<port>
//
// It listens on 127.0.0.1 only, since it runs `claude` with your login.
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ask, summarize } from "./server/claude.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = +process.argv[2] || 8473;
const MAX_CLAUDE = 4; // concurrent `claude -p` processes

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
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
  const { system, prompt, schema } = input;
  if (typeof system !== "string" || typeof prompt !== "string") return send(res, 400, { error: "need system and prompt" });

  const started = Date.now();
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
  if (s.is_error) return send(res, 502, { error: String(s.error || "model error") });
  const data = s.structured ?? parseLoose(s.text) ?? { reply: s.text };
  console.log(`llm ${Date.now() - started}ms in=${s.input_tokens} out=${s.output_tokens} (thinking ${s.thinking_tokens})`);
  send(res, 200, { data, ms: Date.now() - started, tokens: { input: s.input_tokens, output: s.output_tokens } });
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/api/llm" && req.method === "POST") return await handleLlm(req, res);
    let p = decodeURIComponent(url.pathname);
    if (p.endsWith("/")) p += "index.html";
    const file = path.normalize(path.join(ROOT, p));
    if (!file.startsWith(ROOT + path.sep) || file.includes(`${path.sep}server${path.sep}`)) return send(res, 404, "not found", "text/plain");
    const data = await readFile(file).catch(() => null);
    if (!data) return send(res, 404, "not found", "text/plain");
    send(res, 200, data, MIME[path.extname(file)] || "application/octet-stream");
  } catch (e) {
    console.error(e);
    send(res, 500, { error: String(e.message || e) });
  }
}).listen(PORT, "127.0.0.1", () => console.log(`clanker tycoon on http://localhost:${PORT}`));
