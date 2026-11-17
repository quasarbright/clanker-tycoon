// The floor (src/sim.js): the supply, station capacity, and what a stuck worker raises.
import { test } from "node:test";
import assert from "node:assert/strict";
import { newGame, step, setProgram, capOf, RULES } from "../src/sim.js";
import { parseProgram } from "../src/lang.js";
import { LEVELS } from "../src/levels.js";

const level = (name) => LEVELS.find((l) => l.name === name);
const hire = (id, skills = [], attributes = []) => ({ id, name: id, skills, attributes, wage: 5 });
const run = (g, seconds, onEvent = () => {}) => {
  while (g.t < seconds && !g.over) { step(g, 1 / 30); for (const e of g.events.splice(0)) onEvent(e); }
};

test("the supply never runs out and gives out the level's colors", () => {
  const L = level("Crew");
  const g = newGame(L, [hire("b")], 1);
  const before = g.stations.SUPPLY.length;
  setProgram(g, g.workers[0], parseProgram(`while (true) { move("SUPPLY"); pickUp("red"); move("DOCK"); putDown(); }`));
  run(g, 30);
  assert.equal(g.stations.SUPPLY.length, before);
  assert.ok(g.stations.SUPPLY.every((i) => i.color === "red"));
});

test("old programs that say BELT still go to the supply", () => {
  const g = newGame(level("Crew"), [hire("b")], 1);
  setProgram(g, g.workers[0], parseProgram(`move("BELT"); pickUp("red");`));
  run(g, 10);
  assert.equal(g.workers[0].holding?.color, "red");
});

test("station capacity: defaults, and a level's caps raise them", () => {
  const L = level("First quarter");
  assert.equal(capOf(L, "PACK"), RULES.packCap);
  assert.equal(capOf(L, "BIN_1"), RULES.binCap);
  assert.equal(capOf({ ...L, caps: { PACK: 9, BIN: 10 } }, "PACK"), 9);
  assert.equal(capOf({ ...L, caps: { PACK: 9, BIN: 10 } }, "BIN_2"), 10);
});

test("giving up at a full station is unexpected right away, not after six failures (decision 63)", () => {
  const L = level("Crew");
  const g = newGame({ ...L, shift: null }, [hire("b")], 1);
  for (let i = 0; i < capOf(L, "PACK"); i++) g.stations.PACK.push({ id: 1000 + i, kind: "widget", color: "red" });
  setProgram(g, g.workers[0], parseProgram(`while (true) { move("SUPPLY"); pickUp("red"); move("PACK"); putDown(); }`));
  const seen = [];
  run(g, RULES.stationWait + 6, (e) => { if (e.type === "unexpected") seen.push(e); });
  const full = seen.find((e) => e.reason === "full");
  assert.ok(full, `expected a "full" unexpected, got ${JSON.stringify(seen)}`);
  assert.match(full.detail, /Pack is full/);
});

test("a level 6 quarter: two haulers and a packer ship red boxes", () => {
  const L = level("First quarter");
  const g = newGame(L, [hire("h1"), hire("h2"), hire("p", ["packing"])], 1);
  const haul = `while (needs("red") > 0) { move("SUPPLY"); pickUp("red"); move("PACK"); putDown(); }`;
  const pack = `while (needsAny() > 0) { move("PACK"); if (count("PACK", "red") >= 3) pack("red"); if (boxes("PACK") > 0) { pickUpBox(); move("DOCK"); putDown(); } else wait(1); }`;
  [haul, haul, pack].forEach((src, i) => setProgram(g, g.workers[i], parseProgram(src)));
  run(g, L.shift);
  assert.ok(g.order[0].done >= 15, `shipped ${g.order[0].done} red boxes`);
});
