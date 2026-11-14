// Calls Claude Haiku 5.5 through headless Claude Code (`claude -p`), which bills to the
// Claude plan. Agent behavior is stripped: our own system prompt, no tools, no MCP, no
// CLAUDE.md/skills/hooks (--safe-mode), no session files, and the process runs from an empty
// directory so nothing from the workspace is discovered.
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export const MODEL = "claude-haiku-5-5";
const CWD = path.join(tmpdir(), "clanker-haiku-empty-cwd");
mkdirSync(CWD, { recursive: true });

// Inherit the environment: that's where the claude.ai login comes from in this setup.
const ENV = { ...process.env };
// The desktop app sets CLAUDE_EFFORT for its own session; drop it so only --effort applies.
delete ENV.CLAUDE_EFFORT;

/**
 * One conversation. `turns` is an array of user messages; each becomes one model turn.
 * Returns timings (ms, relative to spawn), per-turn results, and the raw stream lines.
 */
export function ask({ system, turns, schema = null, effort = null, env = {}, timeoutMs = 180000 }) {
  const args = [
    "-p", "--model", MODEL,
    "--system-prompt", system,
    "--tools", "",
    "--strict-mcp-config",
    "--safe-mode",
    "--setting-sources", "",
    "--no-session-persistence",
    "--input-format", "stream-json",
    "--output-format", "stream-json",
    "--include-partial-messages",
    "--verbose",
  ];
  if (schema) args.push("--json-schema", JSON.stringify(schema));
  if (effort) args.push("--effort", effort);

  return new Promise((resolve) => {
    const t0 = performance.now();
    const ms = () => Math.round((performance.now() - t0) * 10) / 10;
    const child = spawn("claude", args, { cwd: CWD, env: { ...ENV, ...env }, stdio: ["pipe", "pipe", "pipe"] });
    const lines = [];
    let buf = "", stderr = "";
    const results = [];
    // Per-turn timing marks, filled as stream events arrive.
    let cur = null;
    const newTurn = () => ({ t_message_start: null, t_first_token: null, t_last_token: null, t_result: null, text: "" });
    let initAt = null;

    const onLine = (line) => {
      if (!line.trim()) return;
      const at = ms();
      let ev;
      try { ev = JSON.parse(line); } catch { lines.push({ at, raw: line }); return; }
      if (!(ev.type === "stream_event" && ev.event?.type === "content_block_delta")) lines.push({ at, ev });
      if (ev.type === "system" && ev.subtype === "init") initAt ??= at;
      if (ev.type === "stream_event") {
        const e = ev.event || {};
        if (e.type === "message_start") { cur ??= newTurn(); cur.t_message_start ??= at; }
        if (e.type === "content_block_delta") {
          cur ??= newTurn();
          const d = e.delta || {};
          const piece = d.text ?? d.partial_json ?? d.thinking ?? "";
          if (piece) { cur.t_first_token ??= at; cur.t_last_token = at; }
          if (d.text) cur.text += d.text;
        }
      }
      if (ev.type === "result") {
        cur ??= newTurn();
        cur.t_result = at;
        results.push({ ...cur, result: ev });
        cur = null;
        sendNext();
      }
    };

    child.stdout.on("data", (d) => {
      buf += d.toString();
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) { onLine(buf.slice(0, nl)); buf = buf.slice(nl + 1); }
    });
    child.stderr.on("data", (d) => { stderr += d.toString(); });
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (buf.trim()) onLine(buf);
      resolve({ code, wall_ms: ms(), init_ms: initAt, turns: results, stderr, lines, args: args.filter((a) => a !== system) });
    });

    // Send one user message per turn, and the next only after the previous turn's result.
    // (Messages queued while a turn is running get merged into a single next turn.)
    let next = 0;
    function sendNext() {
      if (next < turns.length) {
        child.stdin.write(JSON.stringify({ type: "user", message: { role: "user", content: turns[next++] } }) + "\n");
      } else {
        child.stdin.end();
      }
    }
    sendNext();
  });
}

// Pull the useful bits out of one turn's result event.
export function summarize(turn) {
  const r = turn.result || {};
  const u = r.usage || {};
  const output = u.output_tokens ?? 0;
  const genMs = turn.t_first_token != null && turn.t_last_token != null ? turn.t_last_token - turn.t_first_token : null;
  return {
    is_error: !!r.is_error,
    error: r.is_error ? r.result : null,
    text: r.result ?? turn.text,
    structured: r.structured_output ?? null,
    duration_ms: r.duration_ms ?? null,
    duration_api_ms_cumulative: r.duration_api_ms ?? null,
    ttft_ms: r.ttft_ms ?? null,
    ttft_stream_ms: r.ttft_stream_ms ?? null,
    time_to_request_ms: r.time_to_request_ms ?? null,
    cost_usd_cumulative_cli: r.total_cost_usd ?? null,
    iterations: u.iterations?.length ?? null,
    input_tokens: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
    input_uncached: u.input_tokens ?? 0,
    cache_read: u.cache_read_input_tokens ?? 0,
    cache_write: u.cache_creation_input_tokens ?? 0,
    output_tokens: output,
    thinking_tokens: u.output_tokens_details?.thinking_tokens ?? 0,
    t_message_start: turn.t_message_start,
    t_first_token: turn.t_first_token,
    t_last_token: turn.t_last_token,
    t_result: turn.t_result,
    // Decode rate over the whole response stream (message_start -> last token), so hidden
    // thinking tokens are counted in the time they took.
    decode_tok_per_s: turn.t_message_start != null && turn.t_last_token > turn.t_message_start
      ? output / ((turn.t_last_token - turn.t_message_start) / 1000) : null,
    visible_stream_ms: genMs,
    model_usage: r.modelUsage ?? null,
    num_turns: r.num_turns,
    stop_reason: r.stop_reason,
    terminal_reason: r.terminal_reason,
  };
}
