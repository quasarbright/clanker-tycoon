// Plays levels headless with hand-written worker programs (the same JS subset the model writes),
// to check the sim and the shift lengths. No model calls.
//   node tools/balance.mjs
import { newGame, step, setProgram, toolNamesFor } from "../src/sim.js";
import { parseProgram, checkProgram } from "../src/lang.js";
import { LEVELS } from "../src/levels.js";

const robot = (id, skills, attributes = []) => ({ id, name: id, skills, attributes, wage: 3 + 2 * (skills.length + attributes.length) });
const level = (name) => LEVELS.find((l) => l.name === name);

function program(hire, L, src) {
  const ast = parseProgram(src);
  const problems = checkProgram(ast, toolNamesFor(hire, L));
  if (problems.length) throw new Error(`${hire.id}: ${problems.map((p) => p.message).join("; ")}`);
  return ast;
}

function run(L, crew, seed) {
  const g = newGame(L, crew.map(([h]) => h), seed);
  g.workers.forEach((w, i) => setProgram(g, w, program(crew[i][0], L, crew[i][1])));
  const seen = {};
  while (!g.over && g.t < 400) {
    step(g, 1 / 30);
    for (const e of g.events.splice(0)) {
      if (e.type !== "unexpected" && e.type !== "worn") continue;
      const k = e.type + (e.reason ? `:${e.reason}` : "");
      seen[k] = (seen[k] || 0) + 1;
    }
  }
  return `${g.won ? g.t.toFixed(0) + "s" : g.over ? "out of time" : "unfinished"}${Object.keys(seen).length ? " " + JSON.stringify(seen) : ""}`;
}

const HAUL = `while (true) { move("BELT"); pickUp("red"); move("PACK"); putDown(); }`;
const PACKER = `while (needsAny() > 0) { move("PACK"); if (count("PACK", "red") >= 3) pack("red"); if (boxes("PACK") > 0) { pickUpBox(); move("DOCK"); putDown(); } else wait(1); }`;
const PAINTER = `while (true) { move("BELT"); pickUp(); move("PAINT"); paint(needs("green") > 0 ? "green" : "red"); move("PACK"); putDown(); }`;
const COLOR_PACKER = `while (true) { move("PACK"); const c = needs("green") > 0 ? "green" : "red"; if (count("PACK", c) >= 3) pack(c); if (boxes("PACK") > 0) { pickUpBox(); move("DOCK"); putDown(); } else wait(1); }`;

const CASES = [
  ["Crew: 2 haulers + 1 packer", level("Crew"), [[robot("a", [], ["fast"]), HAUL], [robot("b", []), HAUL], [robot("c", ["packing"]), PACKER]]],
  ["Crew: 1 hauler + 1 packer", level("Crew"), [[robot("b", []), HAUL], [robot("c", ["packing"]), PACKER]]],
  ["Crew: 1 packer does it all", level("Crew"), [[robot("c", ["packing"]), `while (needsAny() > 0) { if (count("PACK", "red") >= 3) { move("PACK"); pack("red"); pickUpBox(); move("DOCK"); putDown(); } else { move("BELT"); pickUp("red"); move("PACK"); putDown(); } }`]]],
  ["Crew: packer program ends early", level("Crew"), [[robot("c", ["packing"]), `move("PACK");`]]],
  ["Full floor: painter + packer, no servicing", level("Full floor"), [[robot("p1", ["painting"]), PAINTER], [robot("pk", ["packing"]), COLOR_PACKER]]],
  ["Full floor: + repair worker watching wear", level("Full floor"), [[robot("p1", ["painting"]), PAINTER], [robot("pk", ["packing"]), COLOR_PACKER],
    [robot("fix", ["repair"]), `while (true) { if (wear("PAINT") >= 80) { move("PAINT"); service(); } else wait(1); }`]]],
];

for (const [name, L, crew] of CASES) {
  console.log(name.padEnd(46), [1, 2, 3].map((seed) => run(L, crew, seed)).join("   "));
}
