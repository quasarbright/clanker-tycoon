// How many boxes one person ships alone in a shift on level 7's floor (perfect reactions, the Pack loop).
//   node tools/solo-throughput.mjs
import { newGame, step, playerGo } from "../src/sim.js";
import { LEVELS } from "../src/levels.js";
import { newBusiness, quarterLevel, QUARTER_SHIFTS } from "../src/business.js";
import { place } from "../src/floor.js";
const base = LEVELS.find((L) => L.id === 7);
function nextMove(g) {
  const p = g.player, pack = g.stations.PACK;
  if (p.holding?.kind === "box") return ["DOCK", { action: "putDown" }];
  if (p.holding) return ["PACK", { action: "putDown" }];
  if (pack.some((i) => i.kind === "box" && !i.building)) return ["PACK", { action: "pickUp" }];
  if (pack.filter((i) => i.kind === "widget").length >= 3) return ["PACK", { action: "pack" }];
  return ["SUPPLY", { action: "pickUp" }];
}
for (const [name, fix] of [["starting floor (Supply by the Dock)", () => {}], ["swapped (Supply and Pack swapped)", (b) => place(b.floor, "PACK", b.floor.at.SUPPLY)]]) {
  const biz = newBusiness(); biz.crew = []; fix(biz);
  const L = quarterLevel(base, biz, [{ id: "x", color: "red", count: 999, pay: 1 }]);
  const per = [1, 2, 3].map((seed) => {
    const g = newGame(L, [], seed); let t = 0;
    while (g.t < L.shift) { if (!g.player.act) playerGo(g, ...nextMove(g)); step(g, 1 / 30); g.events.length = 0; }
    return g.order[0].done;
  });
  console.log(`${name}: layout ${JSON.stringify(biz.floor.at)}; boxes per ${L.shift}s shift: ${per.join(", ")}; x${QUARTER_SHIFTS} shifts = ${per.map((n) => n * QUARTER_SHIFTS).join(", ")}`);
}
