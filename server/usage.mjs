// What the model calls cost at API prices, from logs/llm.jsonl. Each call since 2026-11-17 logs its
// token counts and the cost `claude -p` reports for it (`usage`). Older lines have neither and are
// counted separately, estimated from prompt length (about 4 characters a token).
//   node server/usage.mjs                  totals for the whole log
//   node server/usage.mjs --since 2d       the last two days (also 12h, 30m, 1w)
//   node server/usage.mjs --since 2026-11-17 --until 2026-11-18   a date range
//   node server/usage.mjs --source play    only one source (play, test, check, ...)
// Totals are split by source: "play" is Mike playing in a browser, "test" automated browsers,
// "check" tools/thinking-check.mjs. Lines from before sources were logged count as play, or test
// when they were marked test. (tools/lang-experiment calls claude itself and isn't in this log.)

// Claude Haiku 5.5, per million tokens. Cache reads cost a tenth of input; cache writes 1.25x.
export const PRICES = { input: 0.10, output: 0.50, cacheRead: 0.01, cacheWrite: 0.125 };

/** The cost of one call's usage at `prices`, in dollars. */
export function costOf(u, prices = PRICES) {
  return ((u.input ?? 0) * prices.input + (u.output ?? 0) * prices.output
    + (u.cacheRead ?? 0) * prices.cacheRead + (u.cacheWrite ?? 0) * prices.cacheWrite) / 1e6;
}

/** "2d" / "12h" / "30m" / "1w" back from `now`, or a date; a Date either way (null for nothing). */
export function parseWhen(s, now = Date.now()) {
  if (!s) return null;
  const m = /^(\d+(?:\.\d+)?)\s*([mhdw])$/.exec(s.trim());
  if (m) return new Date(now - +m[1] * { m: 6e4, h: 3.6e6, d: 8.64e7, w: 6.048e8 }[m[2]]);
  const d = new Date(s);
  if (isNaN(d)) throw new Error(`can't read "${s}" as a time: use 2d, 12h, 30m, 1w or a date`);
  return d;
}

/** Where a call came from. */
export const sourceOf = (l) => l.source ?? (l.test ? "test" : "play");

/** Log lines inside [since, until). */
export const within = (lines, since, until) => lines.filter((l) => {
  const t = new Date(l.at);
  return (!since || t >= since) && (!until || t < until);
});

/** Totals over log lines (parsed objects). */
export function totals(lines, prices = PRICES) {
  const t = { calls: 0, measured: 0, input: 0, output: 0, thinking: 0, cacheRead: 0, cacheWrite: 0, cost: 0, cliCost: 0, unmeasured: 0, estimatedCost: 0 };
  for (const l of lines) {
    t.calls++;
    const u = l.usage;
    if (!u) {
      // Before usage was logged: estimate from the prompt and reply length.
      t.unmeasured++;
      const inTok = ((l.system?.length ?? 0) + (l.prompt?.length ?? 0)) / 4, outTok = JSON.stringify(l.data ?? "").length / 4;
      t.estimatedCost += costOf({ input: inTok, output: outTok }, prices);
      continue;
    }
    t.measured++;
    for (const k of ["input", "output", "thinking", "cacheRead", "cacheWrite"]) t[k] += u[k] ?? 0;
    t.cost += costOf(u, prices);
    t.cliCost += u.costUsd ?? 0;
  }
  return t;
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const { readFile } = await import("node:fs/promises");
  const path = await import("node:path");
  const file = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "logs", "llm.jsonl");
  const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
  const since = parseWhen(arg("--since")), until = parseWhen(arg("--until"));
  const all = (await readFile(file, "utf8").catch(() => "")).split("\n").filter(Boolean)
    .map((s) => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);
  const src = arg("--source");
  const lines = within(all, since, until).filter((l) => !src || sourceOf(l) === src);
  const t = totals(lines);
  const bySource = Object.groupBy ? Object.groupBy(lines, sourceOf) : lines.reduce((g, l) => ((g[sourceOf(l)] ??= []).push(l), g), {});
  const day = since || until ? ` from ${since?.toISOString() ?? "the start"} to ${until?.toISOString() ?? "now"}` : "";
  const $ = (n) => `$${n.toFixed(n < 1 ? 4 : 2)}`;
  console.log(`${t.calls} calls${day}`);
  console.log(`  measured: ${t.measured} calls, ${t.input} input + ${t.cacheRead} cache read + ${t.cacheWrite} cache write, ${t.output} output (${t.thinking} thinking)`);
  console.log(`  cost at API prices: ${$(t.cost)} (claude -p says ${$(t.cliCost)})`);
  if (t.unmeasured) console.log(`  before usage was logged: ${t.unmeasured} calls, about ${$(t.estimatedCost)} (estimated from length)`);
  for (const [s, ls] of Object.entries(bySource)) {
    const u = totals(ls);
    console.log(`  ${s.padEnd(6)} ${String(u.calls).padStart(5)} calls  ${$(u.cost)} measured${u.unmeasured ? ` + about ${$(u.estimatedCost)} estimated` : ""}`);
  }
}
