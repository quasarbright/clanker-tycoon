// The rules of the floor (src/sim.js, src/lang.js, src/quarter.js), on small made-up floors so they
// don't depend on any level's layout or numbers. These change less than the levels do.
import { test } from "node:test";
import assert from "node:assert/strict";
import { newGame, step, setProgram, RULES, toolNamesFor } from "../src/sim.js";
import { parseProgram, checkProgram } from "../src/lang.js";
import { newQuarter, payShift, closeShift, nextShift, restartShift, shiftPayroll, shippedOf, signed } from "../src/quarter.js";

const FLOOR = (extra = {}) => ({
  id: 99, name: "Test floor", stations: ["SUPPLY", "PAINT", "PACK", "DOCK", "BIN_1", "BIN_2"],
  ship: "boxes", colors: ["red"], order: [{ color: "red", count: 50 }], pool: [], ...extra,
});
const bot = (id, skills = [], attributes = []) => ({ id, name: id, skills, attributes, wage: 5 });
function play(L, crew, seconds, onEvent = () => {}) {
  const g = newGame(L, crew.map(([h]) => h), 1);
  crew.forEach(([, src], i) => setProgram(g, g.workers[i], parseProgram(src)));
  while (g.t < seconds && !g.over) { step(g, 1 / 30); for (const e of g.events.splice(0)) onEvent(e, g); }
  return g;
}
const put = (g, st, n, color = "red") => { for (let i = 0; i < n; i++) g.stations[st].push({ id: 9000 + Math.random(), kind: "widget", color }); };
const PAINT_LOOP = (color = "blue") => `while (true) { move("SUPPLY"); pickUp("red"); move("PAINT"); paint("${color}"); move("BIN_1"); putDown(); }`;

// ---------- wear ----------

test("every paint job wears the machine 10%, and at 100% it stops painting", () => {
  const fails = [];
  const g = play(FLOOR({ caps: { BIN: 99 } }), [[bot("p", ["painting"]), PAINT_LOOP()]], 120, (e) => { if (e.type === "fail") fails.push(e.why); });
  assert.equal(g.wear.PAINT, 100);
  assert.equal(g.stations.BIN_1.filter((i) => i.color === "blue").length, 10);
  assert.ok(fails.some((f) => /needs servicing/.test(f)));
});

test("a level's wear setting and a Steady painter both slow the wear", () => {
  let g = play(FLOOR({ wear: 5, caps: { BIN: 99 } }), [[bot("p", ["painting"]), PAINT_LOOP()]], 25);
  const jobs = g.stations.BIN_1.length;
  assert.equal(g.wear.PAINT, Math.min(100, jobs * 5));
  g = play(FLOOR({ caps: { BIN: 99 } }), [[bot("p", ["painting"], ["steady"]), PAINT_LOOP()]], 25);
  assert.equal(g.wear.PAINT, Math.min(100, g.stations.BIN_1.length * 5), "Steady halves the wear");
});

test("servicing resets wear, but only for a robot with Repair; others silently do nothing", () => {
  const fix = `while (true) { move("PAINT"); service(); wait(1); }`;
  for (const [skills, after] of [[["repair"], 0], [[], 80]]) {
    const g = newGame(FLOOR(), [bot("f", skills)], 1);
    g.wear.PAINT = 80;
    setProgram(g, g.workers[0], parseProgram(fix));
    while (g.t < 10) { step(g, 1 / 30); g.events.length = 0; }
    assert.equal(g.wear.PAINT, after, `skills ${skills}`);
  }
});

// ---------- packing and shipping ----------

test("a box is three of one color, taken from wherever they sit at Pack", () => {
  const g = newGame(FLOOR({ order: [{ color: "blue", count: 1 }] }), [bot("k", ["packing"])], 1);
  put(g, "PACK", 1, "blue"); put(g, "PACK", 1, "red"); put(g, "PACK", 1, "blue"); put(g, "PACK", 1, "red"); put(g, "PACK", 1, "blue");
  setProgram(g, g.workers[0], parseProgram(`move("PACK"); pack("blue");`));
  while (g.t < 10) { step(g, 1 / 30); g.events.length = 0; }
  const box = g.stations.PACK.find((i) => i.kind === "box");
  assert.deepEqual(box.colors, ["blue", "blue", "blue"]);
  assert.equal(g.stations.PACK.filter((i) => i.kind === "widget").map((i) => i.color).join(), "red,red");
});

test("pack() with only two of a color fails instead of making a mixed box", () => {
  const fails = [];
  const g = newGame(FLOOR(), [bot("k", ["packing"])], 1);
  put(g, "PACK", 2, "red"); put(g, "PACK", 1, "blue");
  setProgram(g, g.workers[0], parseProgram(`move("PACK"); pack();`));
  while (g.t < 20) { step(g, 1 / 30); for (const e of g.events.splice(0)) if (e.type === "fail") fails.push(e.why); }
  assert.ok(!g.stations.PACK.some((i) => i.kind === "box"));
  assert.ok(fails.some((f) => /a box needs 3/.test(f)));
});

test("on a boxes level loose widgets don't ship, boxes do, and a box the order doesn't want is wasted", () => {
  const fails = [];
  const L = FLOOR({ order: [{ color: "red", count: 5 }] });
  const g = newGame(L, [bot("s")], 1);
  g.workers[0].holding = { id: 1, kind: "widget", color: "red" };
  setProgram(g, g.workers[0], parseProgram(`move("DOCK"); putDown();`));
  while (g.t < 10) { step(g, 1 / 30); for (const e of g.events.splice(0)) if (e.type === "fail") fails.push(e.why); }
  assert.ok(fails.some((f) => /only boxes can ship/.test(f)));
  assert.equal(g.order[0].done, 0);

  const g2 = newGame(L, [bot("s")], 1);
  g2.workers[0].holding = { id: 2, kind: "box", colors: ["blue", "blue", "blue"] };
  setProgram(g2, g2.workers[0], parseProgram(`move("DOCK"); putDown();`));
  while (g2.t < 10) { step(g2, 1 / 30); g2.events.length = 0; }
  assert.equal(g2.order[0].done, 0);
  assert.equal(g2.wasted, 1);
});

test("the shift is won the moment the order is complete, and lost when the clock runs out", () => {
  const L = FLOOR({ order: [{ color: "red", count: 1 }], shift: 30 });
  let g = newGame(L, [bot("s")], 1);
  g.workers[0].holding = { id: 3, kind: "box", colors: ["red", "red", "red"] };
  setProgram(g, g.workers[0], parseProgram(`move("DOCK"); putDown();`));
  while (!g.over) { step(g, 1 / 30); g.events.length = 0; }
  assert.equal(g.won, true);
  assert.ok(g.t < 30);
  g = play(L, [[bot("s"), `while (true) { wait(1); }`]], 60);
  assert.equal(g.over, true);
  assert.equal(g.won, false);
  assert.equal(g.t, 30);
});

// ---------- carrying and capacity ----------

test("a robot holds one thing at a time", () => {
  const fails = [];
  play(FLOOR(), [[bot("h"), `move("SUPPLY"); pickUp("red"); pickUp("red");`]], 10, (e) => { if (e.type === "fail") fails.push(e.why); });
  assert.ok(fails.some((f) => /hands are full/.test(f)));
});

test("stations hold only so much: bins 5, Pack 6, and bought upgrades raise them", () => {
  for (const [caps, bin] of [[undefined, RULES.binCap], [{ BIN: 10 }, 10]]) {
    const g = play(FLOOR({ caps }), [[bot("h"), `while (true) { move("SUPPLY"); pickUp("red"); move("BIN_1"); putDown(); }`]], 90);
    assert.equal(g.stations.BIN_1.length, bin);
  }
  const g = play(FLOOR({ caps: { PACK: 9 } }), [[bot("h"), `while (true) { move("SUPPLY"); pickUp("red"); move("PACK"); putDown(); }`]], 120);
  assert.equal(g.stations.PACK.length, 9);
});

// ---------- attributes ----------

test("Fast robots walk 1.5x as fast", () => {
  const arrive = (attrs) => {
    const g = newGame(FLOOR(), [bot("w", [], attrs)], 1);
    setProgram(g, g.workers[0], parseProgram(`move("SUPPLY"); wait(30);`));
    while (g.workers[0].station !== "SUPPLY") step(g, 1 / 60);
    return g.t;
  };
  const slow = arrive([]), fast = arrive(["fast"]);
  assert.ok(Math.abs(slow / fast - 1.5) < 0.15, `slow ${slow} fast ${fast}`);
});

test("Nimble robots work machines faster", () => {
  const packTime = (attrs) => {
    const g = newGame(FLOOR(), [bot("k", ["packing"], attrs)], 1);
    put(g, "PACK", 3);
    g.workers[0].station = "PACK";
    Object.assign(g.workers[0], { x: 70, y: 18 });
    setProgram(g, g.workers[0], parseProgram(`pack("red"); wait(30);`));
    let done = null;
    while (g.t < 10 && done == null) { step(g, 1 / 60); if (g.stations.PACK.some((i) => i.kind === "box" && !i.building)) done = g.t; }
    return done;
  };
  assert.ok(packTime(["nimble"]) < packTime([]) * 0.8);
});

// ---------- skills in programs ----------

test("using primary work without the skill is a compile error; side tasks are allowed", () => {
  const L = FLOOR();
  const tools = toolNamesFor(bot("x"), L);
  assert.ok(checkProgram(parseProgram(`pack("red");`), tools).some((p) => p.kind === "skill"));
  assert.ok(checkProgram(parseProgram(`paint("blue");`), tools).some((p) => p.kind === "skill"));
  assert.deepEqual(checkProgram(parseProgram(`move("PAINT"); service();`), tools), []);
  assert.deepEqual(checkProgram(parseProgram(`pack("red");`), toolNamesFor(bot("y", ["packing"]), L)), []);
});

// ---------- nothing moving ----------

test("a floor where nothing has moved for a while is unexpected for everyone", () => {
  const seen = [];
  play(FLOOR(), [[bot("a"), `while (true) { wait(1); }`], [bot("b"), `while (true) { wait(1); }`]], RULES.stallAfter + 2, (e) => { if (e.type === "unexpected") seen.push(e); });
  assert.deepEqual(seen.filter((e) => e.reason === "stalled").map((e) => e.worker).sort(), ["a", "b"]);
});

// ---------- money across a quarter ----------

test("a quarter: Start pays the crew, shipped boxes carry over, a replay undoes the shift", () => {
  const L = FLOOR({ order: [{ color: "red", count: 10 }], quarter: { shifts: 3, budget: 50 } });
  const q = newQuarter(L);
  const crew = [bot("a"), bot("b")];
  assert.equal(shiftPayroll(crew), 10);
  const g = newGame(L, crew, 1, { done: q.done });
  payShift(q, g);
  assert.equal(q.money, 40);
  g.order[0].done = 4;
  closeShift(q, g);
  assert.deepEqual(q.done, [4]);
  restartShift(q);
  assert.equal(q.money, 50);
  assert.deepEqual(q.done, [0]);
  payShift(q, g); closeShift(q, g); nextShift(q);
  assert.equal(q.shift, 2);
  const g2 = newGame(L, crew, 1, { done: q.done });
  assert.equal(g2.order[0].done, 4, "the next shift starts from what's shipped");
});

test("the shift card's counts: what's shipped of the quarter, no projection (decision 72)", () => {
  assert.deepEqual(shippedOf([20], [6]), { total: 20, now: 6 });
  assert.deepEqual(shippedOf([20, 9], [12, 9]), { total: 29, now: 21 });
  assert.equal(shippedOf([10], [15]).now, 10, "extra boxes of a finished line don't count");
});

test("signed money uses a real minus sign (Pam's review, decision 72)", () => {
  assert.equal(signed(150), "+$150");
  assert.equal(signed(-15), "\u2212$15");
  assert.equal(signed(0), "+$0");
});

// ---------- your own floor: a second paint machine and the assembler (decision 85) ----------

const box = (g, st, c) => g.stations[st].push({ id: ++g.ids, kind: "box", colors: [c, c, c] });

test("two paint machines wear separately; PAINT_2 paints like PAINT", async () => {
  const { kindOf } = await import("../src/sim.js");
  assert.equal(kindOf("PAINT_2"), "PAINT"); assert.equal(kindOf("BIN_1"), "BIN"); assert.equal(kindOf("ASSEMBLE"), "ASSEMBLE");
  const L = FLOOR({ stations: ["SUPPLY", "PAINT", "PAINT_2", "PACK", "DOCK", "BIN_1", "BIN_2"], wearOf: { PAINT: 10, PAINT_2: 5 }, caps: { BIN: 99 } });
  const loop2 = `while (true) { move("SUPPLY"); pickUp("red"); move("PAINT_2"); paint("green"); move("BIN_1"); putDown(); }`;
  const g = play(L, [[bot("p", ["painting"]), loop2]], 20);
  const jobs = g.stations.BIN_1.filter((i) => i.color === "green").length;
  assert.ok(jobs > 0);
  assert.equal(g.wear.PAINT_2, jobs * 5, "its own wear rate");
  assert.equal(g.wear.PAINT, 0, "the other machine untouched");
});

test("the assembler: a red, a blue and a green box become a crate, which ships for a crates order", () => {
  const L = FLOOR({ stations: ["SUPPLY", "PACK", "ASSEMBLE", "DOCK"], order: [{ color: "crate", count: 1 }] });
  const g = newGame(L, [bot("a", ["assembly"])], 1);
  for (const c of ["red", "blue", "green"]) box(g, "ASSEMBLE", c);
  setProgram(g, g.workers[0], parseProgram(`move("ASSEMBLE"); assemble(); pickUpCrate(); move("DOCK"); putDown();`));
  while (g.t < 30 && !g.over) step(g, 1 / 30);
  assert.ok(g.won, "the crate shipped and filled the order");
  assert.equal(g.order[0].done, 1);
  assert.equal(g.wear.ASSEMBLE, 10, "assembling wears it like painting");
});

test("assembling needs one box of each color, and the Assembly skill; only boxes go in", () => {
  const L = FLOOR({ stations: ["SUPPLY", "PACK", "ASSEMBLE", "DOCK"], order: [{ color: "crate", count: 1 }] });
  const fails = [];
  const g = newGame(L, [bot("a", ["assembly"]), bot("b")], 1);
  box(g, "ASSEMBLE", "red"); box(g, "ASSEMBLE", "red"); box(g, "ASSEMBLE", "blue");
  setProgram(g, g.workers[0], parseProgram(`move("ASSEMBLE"); assemble();`));
  setProgram(g, g.workers[1], parseProgram(`move("SUPPLY"); pickUp("red"); move("ASSEMBLE"); putDown();`));
  while (g.t < 20) { step(g, 1 / 30); for (const e of g.events.splice(0)) if (e.type === "fail") fails.push(e.why); }
  assert.ok(fails.some((f) => /no green box/.test(f)), fails.join("; "));
  assert.ok(fails.some((f) => /only boxes go in the assembler/.test(f)));
  assert.ok(!toolNamesFor(bot("b"), L).actions.includes("assemble"), "no skill, no assemble()");
  assert.ok(toolNamesFor(bot("a", ["assembly"]), L).actions.includes("assemble"));
  assert.ok(toolNamesFor(bot("b"), L).actions.includes("service"), "anyone may service it (a side task)");
});

test("a crate doesn't count for a boxes order, and a box doesn't count for a crates order", () => {
  const L = FLOOR({ stations: ["SUPPLY", "ASSEMBLE", "DOCK"], order: [{ color: "red", count: 1 }, { color: "crate", count: 1 }] });
  const g = newGame(L, [bot("a")], 1);
  g.stations.ASSEMBLE.push({ id: ++g.ids, kind: "crate" });
  box(g, "ASSEMBLE", "blue");
  setProgram(g, g.workers[0], parseProgram(`move("ASSEMBLE"); pickUpCrate(); move("DOCK"); putDown(); move("ASSEMBLE"); pickUpBox("blue"); move("DOCK"); putDown();`));
  while (g.t < 20 && !g.over) step(g, 1 / 30);
  assert.deepEqual(g.order.map((l) => l.done), [0, 1]);
  assert.equal(g.wasted, 1);
});

test("a business floor's layout moves the stations, and an ordinary level puts them back", async () => {
  const { STATIONS } = await import("../src/sim.js");
  const home = { ...STATIONS.PACK };
  newGame(FLOOR({ positions: { PACK: { x: 34, y: 56 } } }), [], 1);
  assert.deepEqual([STATIONS.PACK.x, STATIONS.PACK.y], [34, 56]);
  newGame(FLOOR(), [], 1);
  assert.deepEqual([STATIONS.PACK.x, STATIONS.PACK.y], [home.x, home.y]);
});
