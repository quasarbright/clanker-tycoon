// Plays the by-hand levels headless as a player with perfect reactions, to set star times.
//   node tools/player-check.mjs
import { newGame, step, playerGo } from "../src/sim.js";
import { LEVELS } from "../src/levels.js";

// Level 1: belt → dock forever. Level 2: three widgets to Pack, pack, carry the box to the dock.
function nextMove(g) {
  const p = g.player;
  if (g.level.ship === "widgets") return p.holding ? ["DOCK", { action: "putDown" }] : ["BELT_A", { action: "pickUp" }];
  const pack = g.stations.PACK;
  if (p.holding?.kind === "box") return ["DOCK", { action: "putDown" }];
  if (p.holding) return ["PACK", { action: "putDown" }];
  if (pack.some((i) => i.kind === "box")) return ["PACK", { action: "pickUp" }];
  if (pack.filter((i) => i.kind === "widget").length >= 3) return ["PACK", { action: "pack" }];
  return ["BELT_A", { action: "pickUp" }];
}

for (const L of LEVELS.filter((L) => L.id <= 2)) {
  const times = [1, 2, 3].map((seed) => {
    const g = newGame(L, [], seed);
    while (!g.over && g.t < 400) {
      if (!g.player.act) playerGo(g, ...nextMove(g));
      step(g, 1 / 30);
      g.events.length = 0;
    }
    return g.t.toFixed(1) + "s";
  });
  console.log(`level ${L.id} by hand: ${times.join("  ")}   stars at ${L.stars.join(" / ")}s`);
}
