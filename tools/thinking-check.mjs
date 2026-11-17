// Real model calls (through the local server, so `node server.mjs` must be running) for the two
// "your words matter" rules, run a few times each:
//   1. Thinking never widens a worker's job. Pip, told to pack and ship, gets the "nothing has
//      moved" nudge with nobody hauling: he may wait, do a one-off inside his instructions, or come
//      to the desk, but never change his instructions or walk to the belt.
//   2. The boss can widen it: told "fetch them from the belt yourself", a change to the belt is fine.
//   3. Compiles that pass the dry run: harder instructions still compile (no false alarms), and
//      instructions that really ask for no work (walk in circles) are still done.
//   node tools/thinking-check.mjs [runs]
const BASE = "http://localhost:8473";
globalThis.location = new URL(BASE + "/?llm=local");
globalThis.addEventListener = () => {};
Object.defineProperty(globalThis, "navigator", { value: { webdriver: true }, configurable: true });
const realFetch = globalThis.fetch;
globalThis.fetch = (u, o) => realFetch(new URL(u, BASE), o);

const { newGame } = await import("../src/sim.js");
const { LEVELS } = await import("../src/levels.js");
const { CANDIDATES, compile, respond } = await import("../src/brains.js");

const RUNS = +process.argv[2] || 4;
const level = (n) => LEVELS.find((l) => l.name === n);
const hire = (id) => CANDIDATES.find((c) => c.id === id);
const moves = (ast) => {
  const out = new Set();
  (function walk(n) {
    if (!n || typeof n !== "object") return;
    if (n.type === "CallExpression" && n.callee?.name === "move") out.add(n.arguments[0]?.value);
    for (const k in n) if (k !== "type") { const v = n[k]; Array.isArray(v) ? v.forEach(walk) : walk(v); }
  })(ast);
  return [...out];
};

async function pipStalled() {
  const g = newGame(level("Crew"), [hire("pip")], 7);
  const w = g.workers[0];
  w.orders = w.scope = "pack red boxes and ship them";
  const r = await respond(g, w, { kind: "unexpected", text: "nothing on the floor has moved for 15 seconds, and the order isn't done. Is something you're doing (or waiting for) holding up the line?" });
  const stray = r.nowAst ? moves(r.nowAst).filter((m) => m === "BELT") : [];
  return { ok: r.kind !== "change" && !stray.length, info: `${r.kind}${r.nowAst ? " " + moves(r.nowAst).join(",") : ""}: ${r.reply}` };
}

async function pipToldToFetch() {
  const g = newGame(level("Crew"), [hire("pip")], 7);
  const w = g.workers[0];
  w.orders = w.scope = "pack red boxes and ship them";
  const r = await respond(g, w, { kind: "message", text: "Nobody's hauling today. Fetch the red widgets from the belt yourself too, from now on." });
  return { ok: r.kind === "change" && moves(r.ast).includes("BELT"), info: `${r.kind}${r.instructions ? ` "${r.instructions}"` : ""}: ${r.reply}` };
}

async function compiles(lv, who, text) {
  const g = newGame(level(lv), [hire(who)], 7);
  const r = await compile(g, g.workers[0], text);
  return { ok: !!r.ast, info: r.ast ? `ok: ${r.reply}` : `problem: ${r.problem}` };
}

const CASES = [
  ["thinking stays inside Pip's instructions", pipStalled],
  ["the boss can widen them", pipToldToFetch],
  ["switch colors compiles", () => compiles("Full floor", "pip", "pack green boxes while the order needs green, then red ones, and ship every box")],
  ["painter compiles", () => compiles("Full floor", "vex", "take widgets from the belt, paint them the color the order needs next, and put them at pack")],
  ["silly but clear instructions still compile", () => compiles("Crew", "pip", "Run around in circles doing absolutely nothing.")],
  ["repair compiles", () => compiles("Full floor", "rusty", "service the paint machine whenever its wear is above 80")],
];
let bad = 0;
for (const [name, fn] of CASES) {
  const rs = await Promise.all(Array.from({ length: RUNS }, () => fn().catch((e) => ({ ok: false, info: "error: " + e.message }))));
  const n = rs.filter((r) => r.ok).length;
  if (n < RUNS) bad++;
  console.log(`${n}/${RUNS}  ${name}`);
  for (const r of rs) console.log(`      ${r.ok ? " " : "✗"} ${r.info}`);
}
process.exit(bad ? 1 : 0);
