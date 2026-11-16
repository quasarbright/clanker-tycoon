// Plays shifts headless with hand-written scripts, to check the economy and the star cutoffs.
import { newGame as newLevelGame, step, setScript } from "../src/sim.js";
import { LEVELS } from "../src/levels.js";
const newGame = (hires, seed) => newLevelGame(LEVELS[2], hires, seed);
// The old three-robot crew, with today's skills: Gary fast, Doris careful + patient, Blip none.
// (Same data as brains.js, copied so this runs in plain node without the browser-only llm.js.)
const robot = (r) => ({ ...r, wage: 3 + 2 * r.skills.length });
const HIRES = [
  robot({ id: "gary", name: "Gary-7", skills: ["fast"] }),
  robot({ id: "doris", name: "Doris", skills: ["careful", "patient"] }),
  robot({ id: "blip", name: "Blip", skills: [] }),
];
const m = (station) => ({ action: "moveTo", station });
const STRATS = {
  "nothing": {},
  "one carrier, any color": { doris: [m("BELT_A"), { action: "pickUp" }, m("PACK"), { action: "putDown" }, { action: "pack" }, { action: "pickUp" }, m("DOCK"), { action: "putDown" }] },
  "all red, painted": {
    doris: [m("BELT_A"), { action: "pickUp" }, m("PAINT"), { action: "paint", color: "red" }, { action: "fix" }, m("PACK"), { action: "putDown" }],
    blip: [m("BELT_A"), { action: "pickUp" }, m("PAINT"), { action: "paint", color: "red" }, { action: "fix" }, m("PACK"), { action: "putDown" }],
    gary: [m("PACK"), { action: "pack" }, { action: "pickUp" }, m("DOCK"), { action: "putDown" }],
  },
  "paint to first order": null, // filled in below: adapts color every loop like a sharp player would
};
function run(name, seed) {
  const g = newGame(HIRES, seed);
  const strat = STRATS[name] || {};
  for (const w of g.workers) if (strat[w.id]) setScript(g, w, strat[w.id]);
  let fails = 0;
  while (!g.over) {
    if (name === "paint to first order") {
      const c = g.orders[0].color;
      for (const w of g.workers) {
        const want = w.id === "gary"
          ? [m("PACK"), { action: "pack" }, { action: "pickUp" }, m("DOCK"), { action: "putDown" }]
          : [m("BELT_A"), { action: "pickUp" }, m("PAINT"), { action: "paint", color: c }, { action: "fix" }, m("PACK"), { action: "putDown" }];
        if (JSON.stringify(w.script) !== JSON.stringify(want) && w.pc === 0) setScript(g, w, want);
      }
    }
    step(g, 1 / 30);
    for (const e of g.events.splice(0)) if (e.type === "fail") fails++;
  }
  return { profit: Math.round(g.cash - 20), filled: g.filled, scrap: g.scrap, fails };
}
for (const name of Object.keys(STRATS)) {
  const rs = [1, 2, 3, 4, 5, 6].map((s) => run(name, s));
  const avg = (k) => (rs.reduce((a, r) => a + r[k], 0) / rs.length).toFixed(1);
  console.log(name.padEnd(26), "profit", rs.map((r) => r.profit).join(" "), "| avg", avg("profit"), "filled", avg("filled"), "scrap", avg("scrap"), "fails", avg("fails"));
}
