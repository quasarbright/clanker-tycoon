// The play log: what happened in each shift you play, so a later session can look up "the time
// Blip stood at the supply doing nothing" and see exactly what happened. Lines go to the local
// server, which appends them to logs/play/<date>.jsonl. Each line has the page session, the shift
// (one per attempt at a level) and the game time. Model calls in logs/llm.jsonl carry the same
// shift id. Automated test browsers (navigator.webdriver) don't log unless the URL has ?playlog.
// On a web build there's no server and the posts quietly fail.

const enabled = !navigator.webdriver || new URLSearchParams(location.search).has("playlog");
const session = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "-" + Math.random().toString(36).slice(2, 6);
let attempts = 0;
let buffer = [];
let timer = null;

/** The current shift's id ("<session>/<n>"), or null before the first one. Model calls are tagged with it. */
export let shiftId = null;
export const isTest = !!navigator.webdriver;

/** A new shift: a level opened, or Try again. */
export function startShift(level, extra = {}) {
  shiftId = `${session}/${++attempts}`;
  logEvent(null, "shift", { level: level.id, name: level.name, ...extra });
}

/** One thing that happened. `t` is game time in seconds (null before the clock starts). */
export function logEvent(t, type, data = {}) {
  if (!enabled || !shiftId) return;
  buffer.push({ at: new Date().toISOString(), shift: shiftId, test: isTest || undefined, t: t == null ? null : Math.round(t * 10) / 10, type, ...data });
  if (type === "end" || buffer.length > 200) flush();
  else timer ??= setTimeout(flush, 2000);
}

function flush() {
  clearTimeout(timer);
  timer = null;
  if (!buffer.length) return;
  const lines = buffer;
  buffer = [];
  fetch("/api/play", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lines }), keepalive: true }).catch(() => {});
}
addEventListener("pagehide", flush);
