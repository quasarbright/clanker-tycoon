// The play log: everything that happens while you play, so a later session can look up "the time
// Blip stood at the supply doing nothing" (or "the quarter my funds went weird") and see exactly
// what happened. Mike (2026-11-18): "I want our logs to be pretty comprehensive, so if I do a
// playtest and then I report that something was weird ... you will be able to look at logs".
//
// Each line has the wall-clock time, the page session, the shift (one per attempt at a level; "/0"
// before the first, on the board), the game time and a `type`. Model calls in logs/llm.jsonl carry
// the same shift id.
//   local (node server.mjs)  lines go to the server, which appends them to logs/play/<date>.jsonl
//   web build (Pages)        no server: lines stay in this browser (memory and localStorage) and
//                            "Download log" saves them as a .jsonl file to send (decision 83)
// Automated test browsers (navigator.webdriver) don't log unless the URL has ?playlog.
// `tools/playlog.mjs` reads either kind and prints a shift's or a run's timeline.

const params = new URLSearchParams(location.search);
const enabled = !navigator.webdriver || params.has("playlog");
const onLocalhost = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
const session = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "-" + Math.random().toString(36).slice(2, 6);
let attempts = 0;
let buffer = [];
let timer = null;

/** The current shift's id ("<session>/<n>"; "<session>/0" before the first). Model calls are tagged with it. */
export let shiftId = `${session}/0`;
export const isTest = !!navigator.webdriver;

// Kept in the browser too, for the web build's Download log: the whole page session in memory, and
// the newest lines in localStorage so a reload doesn't lose the playtest.
const STORE = "clanker-tycoon:log";
const STORE_MAX = 2_500_000; // characters
export const kept = [];
let stored = "";
try { stored = localStorage.getItem(STORE) ?? ""; } catch {}

/** A new shift: a level opened, or Try again. */
export function startShift(level, extra = {}) {
  shiftId = `${session}/${++attempts}`;
  logEvent(null, "shift", { level: level.id, name: level.name, ...extra });
}

/** One thing that happened. `t` is game time in seconds (null when the clock isn't running). */
export function logEvent(t, type, data = {}) {
  if (!enabled) return;
  const line = { at: new Date().toISOString(), shift: shiftId, test: isTest || undefined, t: t == null ? null : Math.round(t * 10) / 10, type, ...data };
  kept.push(line);
  buffer.push(line);
  if (type === "end" || type === "error" || buffer.length > 200) flush();
  else timer ??= setTimeout(flush, 2000);
}

function flush() {
  clearTimeout(timer);
  timer = null;
  if (!buffer.length) return;
  const lines = buffer;
  buffer = [];
  if (onLocalhost) fetch("/api/play", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lines }), keepalive: true }).catch(() => {});
  // The browser copy: append, then drop the oldest lines past the cap.
  stored += lines.map((l) => JSON.stringify(l) + "\n").join("");
  if (stored.length > STORE_MAX) stored = stored.slice(stored.indexOf("\n", stored.length - STORE_MAX) + 1);
  try { localStorage.setItem(STORE, stored); } catch {}
}
addEventListener("pagehide", flush);

/** The log kept in this browser (earlier sessions too, up to the cap), as JSON lines. */
export function logText() { flush(); return stored; }

/** Save the browser's log as a file (the web build's Download log). */
export function downloadLog() {
  const blob = new Blob([logText()], { type: "application/x-ndjson" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `clanker-tycoon-log-${session}.jsonl`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Errors go in the log too: uncaught ones, rejected promises, and console.error.
addEventListener("error", (e) => logEvent(null, "error", { message: e.message, where: `${e.filename ?? ""}:${e.lineno ?? ""}:${e.colno ?? ""}`, stack: e.error?.stack }));
addEventListener("unhandledrejection", (e) => logEvent(null, "error", { message: String(e.reason?.message ?? e.reason), stack: e.reason?.stack, rejected: true }));
const consoleError = console.error.bind(console);
console.error = (...args) => {
  logEvent(null, "error", { message: args.map((a) => (a instanceof Error ? a.message : typeof a === "string" ? a : JSON.stringify(a))).join(" "), console: true });
  consoleError(...args);
};
