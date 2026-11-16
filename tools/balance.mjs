// Plays the full-floor order headless with hand-written crews (no player), to see how long a crew
// takes and whether the star times are sane. Run: node tools/balance.mjs
import { newGame, step, setScript } from "../src/sim.js";
import { LEVELS } from "../src/levels.js";
const robot = (r) => ({ ...r, wage: 3 + 2 * r.skills.length });
const m = (station) => ({ action: "moveTo", station });
const L = LEVELS.find((l) => l.name === "Full floor");
const CREWS = {
  "one robot, any color": [[robot({ id: "a", skills: ["fast"] }), [m("BELT_A"), { action: "pickUp" }, m("PACK"), { action: "putDown" }, { action: "pack" }, { action: "pickUp" }, m("DOCK"), { action: "putDown" }]]],
  "haulers paint green, packer ships": [
    [robot({ id: "a", skills: ["fast"] }), [m("BELT_A"), { action: "pickUp" }, m("PAINT"), { action: "paint", color: "green" }, { action: "fix" }, m("PACK"), { action: "putDown" }]],
    [robot({ id: "b", skills: ["fast"] }), [m("BELT_A"), { action: "pickUp" }, m("PAINT"), { action: "paint", color: "green" }, { action: "fix" }, m("PACK"), { action: "putDown" }]],
    [robot({ id: "c", skills: ["patient"] }), [m("PACK"), { action: "pack" }, { action: "pickUp" }, m("DOCK"), { action: "putDown" }]],
  ],
};
for (const [name, crew] of Object.entries(CREWS)) {
  const times = [1, 2, 3, 4].map((seed) => {
    const g = newGame(L, crew.map(([h]) => h), seed);
    g.workers.forEach((w, i) => setScript(g, w, crew[i][1]));
    while (!g.over && g.t < 600) { step(g, 1 / 30); g.events.length = 0; }
    return g.won ? `${g.t.toFixed(0)}s` : `unfinished (${g.order.map((l) => `${l.color} ${l.done}/${l.count}`).join(", ")})`;
  });
  console.log(name.padEnd(36), times.join("  "));
}
