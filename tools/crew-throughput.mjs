// Board 2 with you hand-playing plus two cheap recruits, a hauler and a packer (Mark, decision 96).
// Boxes shipped over a quarter (3 shifts), on the starting floor and with Supply and Pack swapped.
//   node tools/crew-throughput.mjs
import { newGame, step, setProgram, playerGo, toolNamesFor } from "../src/sim.js";
import { parseProgram, checkProgram } from "../src/lang.js";
import { LEVELS } from "../src/levels.js";
import { newBusiness, quarterLevel, QUARTER_SHIFTS } from "../src/business.js";
import { place } from "../src/floor.js";

const base = LEVELS.find((L) => L.id === 7);
const HAUL = `while (needs("red") > 0) { move("SUPPLY"); pickUp("red"); move("PACK"); putDown(); }`;
const PACK = `while (needsAny() > 0) { move("PACK"); if (count("PACK", "red") >= 3) pack("red"); if (boxes("PACK") > 0) { pickUpBox(); move("DOCK"); putDown(); } else wait(1); }`;
const hauler = { id: "nib", name: "Nib", skills: [], attributes: [], wage: 5 };
const packer = { id: "cog", name: "Cog", skills: ["packing"], attributes: [], wage: 10 };
const program = (h, L, src) => { const ast = parseProgram(src); const p = checkProgram(ast, toolNamesFor(h, L)); if (p.length) throw new Error(p[0].message); return ast; };

// What you do with your own hands each time you're free.
const YOU = {
  "you idle": () => null,
  "you haul": (g) => (g.player.holding ? ["PACK", { action: "putDown" }] : ["SUPPLY", { action: "pickUp" }]),
  "you ship boxes, else haul": (g) => {
    const p = g.player, pack = g.stations.PACK;
    if (p.holding?.kind === "box") return ["DOCK", { action: "putDown" }];
    if (p.holding) return ["PACK", { action: "putDown" }];
    if (pack.some((i) => i.kind === "box" && !i.building)) return ["PACK", { action: "pickUp" }];
    return ["SUPPLY", { action: "pickUp" }];
  },
  "you do the whole loop too": (g) => {
    const p = g.player, pack = g.stations.PACK;
    if (p.holding?.kind === "box") return ["DOCK", { action: "putDown" }];
    if (p.holding) return ["PACK", { action: "putDown" }];
    if (pack.some((i) => i.kind === "box" && !i.building)) return ["PACK", { action: "pickUp" }];
    if (pack.filter((i) => i.kind === "widget").length >= 3) return ["PACK", { action: "pack" }];
    return ["SUPPLY", { action: "pickUp" }];
  },
};

function quarter(biz, you, seed) {
  const L = quarterLevel(base, biz, [{ id: "x", color: "red", count: 999, pay: 1 }]);
  let done = [0];
  const per = [];
  for (let shift = 1; shift <= QUARTER_SHIFTS; shift++) {
    const g = newGame(L, [hauler, packer], seed * 10 + shift, { done });
    setProgram(g, g.workers[0], program(hauler, L, HAUL));
    setProgram(g, g.workers[1], program(packer, L, PACK));
    while (g.t < L.shift) {
      const m = !g.player.act && YOU[you](g);
      if (m) playerGo(g, ...m);
      step(g, 1 / 30); g.events.length = 0;
    }
    per.push(g.order[0].done - done[0]);
    done = g.order.map((l) => l.done);
  }
  return per;
}

for (const [floor, fix] of [["starting floor", () => {}], ["Supply and Pack swapped", (b) => place(b.floor, "PACK", b.floor.at.SUPPLY)]]) {
  console.log(`\n${floor}: boxes per shift (3 shifts), quarter total; board 2 asks 54 (Small) or 99 (Large)`);
  for (const you of Object.keys(YOU)) {
    const runs = [1, 2].map((seed) => { const b = newBusiness(); fix(b); const per = quarter(b, you, seed); return `${per.join("+")} = ${per.reduce((a, n) => a + n, 0)}`; });
    console.log(`  ${you.padEnd(28)} ${runs.join("   ")}`);
  }
}
