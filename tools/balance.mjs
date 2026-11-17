// Plays levels headless with hand-written worker programs (the same JS subset the model writes),
// to check the sim and the shift lengths. No model calls.
//   node tools/balance.mjs
import { newGame, step, setProgram, toolNamesFor } from "../src/sim.js";
import { parseProgram, checkProgram } from "../src/lang.js";
import { LEVELS } from "../src/levels.js";
import { board, quarterLevel, payouts, SHOP, QUARTER_SHIFTS } from "../src/business.js";

const robot = (id, skills, attributes = []) => ({ id, name: id, skills, attributes, wage: 5 + 5 * (skills.length + attributes.length) });
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

// ---------- the quarter ----------
// A plan is the crew for each shift (the last one repeats). Money: each robot's flat rate for the
// shift, paid at Start. Each shift starts from what's shipped so far, on a fresh floor, as in the
// game. Prints the quota progress after each shift and the money left.
const Q = level("First quarter");
const QB = { blip: [[], []], dot: [[], []], pip: [["packing"], []], gary: [["packing"], ["fast"]], rusty: [["repair"], ["steady"]], vex: [["painting"], ["fast", "smart"]] };
// "you" stands in for the player servicing the paint machine yourself: a free repair worker.
QB.you = [["repair"], []];
const qr = (id) => (id === "you" ? { ...robot(id, ...QB[id]), wage: 0 } : robot(id, ...QB[id]));
const Q_HAUL = `while (needs("red") > 0) { move("BELT"); pickUp("red"); move("PACK"); putDown(); }`;
const Q_PACK = `while (needsAny() > 0) { move("PACK"); let c = "none"; for (const k of ["blue", "red"]) { if (c == "none" && needs(k) > 0 && count("PACK", k) >= 3) c = k; } if (c != "none") pack(c); if (boxes("PACK") > 0) { pickUpBox(); move("DOCK"); putDown(); } else wait(1); }`;
const Q_PAINT = `while (needs("blue") > 0) { if (wear("PAINT") >= 100) { wait(1); } else { move("BELT"); pickUp("red"); move("PAINT"); paint("blue"); move("PACK"); putDown(); } }`;
const Q_FIX = `while (needsAny() > 0) { if (wear("PAINT") >= 80) { move("PAINT"); service(); } else wait(1); }`;
const Q_PROG = { blip: Q_HAUL, dot: Q_HAUL, pip: Q_PACK, gary: Q_PACK, vex: Q_PAINT, rusty: Q_FIX, you: Q_FIX };

function quarter(plan, seed) {
  let money = Q.quarter.budget, done = Q.order.map(() => 0);
  const log = []; // what's shipped after each shift
  for (let shift = 1; shift <= Q.quarter.shifts; shift++) {
    const ids = plan[Math.min(shift, plan.length) - 1];
    const hires = ids.map(qr);
    const payroll = hires.reduce((a, h) => a + h.wage, 0);
    if (payroll > money) return `${log.join(" ")} can't pay shift ${shift}`;
    money -= payroll;
    const g = newGame(Q, hires, seed * 10 + shift, { done });
    g.workers.forEach((w, i) => setProgram(g, w, program(hires[i], Q, Q_PROG[hires[i].id])));
    while (!g.over) { step(g, 1 / 30); g.events.length = 0; }
    done = g.order.map((l) => l.done);
    log.push(done.join("+"));
    if (g.won) return `${log.join(" ")} met, $${Math.round(money)} left`;
  }
  return `${log.join(" ")} missed, $${Math.round(money)} left`;
}

const PLANS = [
  ["hauler + packer", [["blip", "pip"]]],
  ["2 haulers + packer", [["blip", "dot", "pip"]]],
  ["painter + packer", [["vex", "pip"]]],
  ["painter + hauler + packer", [["vex", "blip", "pip"]]],
  ["painter + 2 haulers + packer", [["vex", "blip", "dot", "pip"]]],
  ["everyone", [["vex", "blip", "dot", "pip", "rusty"]]],
  ["painter + repair + hauler + packer", [["vex", "rusty", "blip", "pip"]]],
  ["big shift 1, then painter + packer", [["vex", "blip", "dot", "pip"], ["vex", "pip"]]],
  ["haulers first, then painter", [["blip", "dot", "pip"], ["vex", "pip"]]],
  ["haulers first, then painter + repair", [["blip", "dot", "pip"], ["vex", "rusty", "pip"]]],
  ["you service; painter + packer", [["you", "vex", "pip"]]],
  ["you service; painter + hauler + packer", [["you", "vex", "blip", "pip"]]],
  ["you service; painter + 2 haulers + packer", [["you", "vex", "blip", "dot", "pip"]]],
];
console.log(`\n${Q.name}: quota ${Q.order.map((l) => `${l.count} ${l.color}`).join(" + ")}, ${Q.quarter.shifts} shifts of ${Q.shift}s, budget $${Q.quarter.budget}`);
for (const [name, plan] of PLANS) console.log(name.padEnd(38), [1, 2].map((seed) => quarter(plan, seed).padEnd(34)).join(" "));

// ---------- your business (src/business.js) ----------
// A quarter's pick of contracts (one per color, all due at the quarter's end), played by a few
// crews, with each paint machine. Prints what shipped after each shift, the wages, what the
// contracts paid after the investor's cut, and the profit.
const B_HAUL = `while (needs("red") > 0) { move("BELT"); pickUp("red"); move("PACK"); putDown(); }`;
const B_PACK = `while (needsAny() > 0) { move("PACK"); let c = "none"; for (const k of ["blue", "green", "red"]) { if (c == "none" && needs(k) > 0 && count("PACK", k) >= 3) c = k; } if (c != "none") pack(c); if (boxes("PACK") > 0) { pickUpBox(); move("DOCK"); putDown(); } else wait(1); }`;
const B_PAINT = `while (needs("blue") + needs("green") > 0) { const c = needs("blue") > 0 ? "blue" : "green"; if (wear("PAINT") >= 100) { wait(1); } else { move("BELT"); pickUp("red"); move("PAINT"); paint(c); move("PACK"); putDown(); } }`;
const B_PROG = { blip: B_HAUL, dot: B_HAUL, pip: B_PACK, gary: B_PACK, vex: B_PAINT, rusty: Q_FIX, you: Q_FIX };
function businessQuarter(L, plan, seed) {
  let wages = 0, done = L.order.map(() => 0);
  const log = [];
  for (let shift = 1; shift <= L.quarter.shifts; shift++) {
    const hires = plan.map(qr);
    wages += hires.reduce((a, h) => a + h.wage, 0);
    const g = newGame(L, hires, seed * 10 + shift, { done });
    g.workers.forEach((w, i) => setProgram(g, w, program(hires[i], L, B_PROG[hires[i].id])));
    while (!g.over) { step(g, 1 / 30); g.events.length = 0; }
    done = g.order.map((l) => l.done);
    log.push(done.join("+"));
    if (g.won) break;
  }
  const paid = payouts(L.contracts, done).reduce((a, p) => a + p.pay - p.cut, 0);
  return `${log.join(" ").padEnd(26)} wages $${String(wages).padEnd(4)} paid $${String(paid).padEnd(4)} profit $${paid - wages}`;
}
const CREWS = {
  red: [["hauler + packer", ["blip", "pip"]], ["2 haulers + packer", ["blip", "dot", "pip"]]],
  paint: [["painter + packer", ["vex", "pip"]], ["you service; painter + packer", ["you", "vex", "pip"]]],
  both: [["painter + hauler + packer", ["vex", "blip", "pip"]], ["you service; painter + hauler + packer", ["you", "vex", "blip", "pip"]],
    ["painter + repair + hauler + packer", ["vex", "rusty", "blip", "pip"]], ["you service; painter + 2 haulers + packer", ["you", "vex", "blip", "dot", "pip"]]],
};
// Every pick of up to one contract per color.
function picks(cs) {
  let out = [[]];
  for (const color of ["red", "blue", "green"]) {
    const of = cs.filter((c) => c.color === color);
    out = out.flatMap((p) => [p, ...of.map((c) => [...p, c])]);
  }
  return out.filter((p) => p.length);
}
for (let quarters = 0; quarters < 3; quarters++) {
  console.log(`\nBoard ${quarters + 1} (${QUARTER_SHIFTS} shifts)`);
  for (const pick of picks(board({ quarters }))) {
    const paint = pick.some((c) => c.needs), red = pick.some((c) => !c.needs);
    console.log(`  ${pick.map((c) => `${c.count} ${c.color} $${c.pay}`).join(" + ")}`);
    for (const m of paint ? SHOP : [null]) {
      const L = quarterLevel(Q, { money: 9999, owned: m?.id ?? null, crew: [], trained: {} }, pick);
      for (const [name, plan] of CREWS[paint && red ? "both" : paint ? "paint" : "red"]) {
        console.log(`    ${(m ? m.id + ": " : "") + name}`.padEnd(52), businessQuarter(L, plan, 1));
      }
    }
  }
}
