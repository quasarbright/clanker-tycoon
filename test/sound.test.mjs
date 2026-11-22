// Sound (decision 97). Mike: machines make a sound, picking up and putting down, moving, moving with
// Fast (wheels), a satisfying ding on a delivery and a less nice sound for "not ordered".
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { newGame, step, playerGo, setProgram, toolNamesFor } from "../src/sim.js";
import { parseProgram, checkProgram } from "../src/lang.js";
import { SOUNDS, soundOf, eventCues, footstepCues } from "../src/sound.js";

const ROOT = new URL("..", import.meta.url).pathname;
const L = { id: "t", name: "t", stations: ["SUPPLY", "PAINT", "PACK", "DOCK"], ship: "widgets", colors: ["red"], order: [{ color: "red", count: 1 }], wear: 100 };
const robot = (id, attributes = [], skills = []) => ({ id, name: id, skills, attributes, wage: 5 });

/** Run `g` until `done()` or `sec` seconds, collecting every sound. */
function listen(g, sec, done = () => false, feet = new Map()) {
  const heard = [];
  while (g.t < sec && !g.over && !done()) {
    step(g, 1 / 30);
    heard.push(...footstepCues(g, feet).map((c) => c.sound));
    heard.push(...eventCues(g, g.events.splice(0)).map((c) => c.sound));
  }
  return heard;
}

test("every sound has a file in sounds/", () => {
  for (const name of Object.keys(SOUNDS)) assert.ok(existsSync(join(ROOT, "sounds", `${name}.mp3`)), `sounds/${name}.mp3`);
});

test("every sound tools/sounds.mjs can make is one the game knows, and vice versa", () => {
  const src = readFileSync(join(ROOT, "tools/sounds.mjs"), "utf8");
  const recipes = [...src.slice(src.indexOf("const RECIPES")).matchAll(/^  (\w+): \(\) =>/gm)].map((m) => m[1]);
  assert.deepEqual(recipes.sort(), Object.keys(SOUNDS).sort());
});

test("picking up, putting down and shipping by hand each make their sound", () => {
  const g = newGame(L, []);
  const heard = [];
  playerGo(g, "SUPPLY", { action: "pickUp" });
  heard.push(...listen(g, 10, () => g.player.holding));
  playerGo(g, "PACK", { action: "putDown" });
  heard.push(...listen(g, 20, () => !g.player.holding));
  assert.ok(heard.includes("pickup"), heard.join());
  assert.ok(heard.includes("putdown"), heard.join());
  assert.ok(heard.includes("step"), "you walked: footsteps");
  playerGo(g, "PACK", { action: "pickUp", color: "red" });
  listen(g, 30, () => g.player.holding);
  playerGo(g, "DOCK", { action: "putDown" });
  assert.ok(listen(g, 40).includes("ding"), "an ordered widget shipped: ding");
});

test("shipping something nobody ordered makes the not-ordered sound, not the ding", () => {
  assert.equal(soundOf({ type: "ship", matched: true }), "ding");
  assert.equal(soundOf({ type: "ship", matched: false }), "nope");
  const g = newGame({ ...L, order: [{ color: "blue", count: 1 }] }, []);
  playerGo(g, "SUPPLY", { action: "pickUp" });
  listen(g, 10, () => g.player.holding);
  playerGo(g, "DOCK", { action: "putDown" });
  const heard = listen(g, 20);
  assert.ok(heard.includes("nope") && !heard.includes("ding"), heard.join());
});

test("a Fast robot rolls on wheels; everyone else steps", () => {
  const prog = (h) => { const ast = parseProgram(`move("DOCK"); move("SUPPLY");`); assert.deepEqual(checkProgram(ast, toolNamesFor(h, L)), []); return ast; };
  for (const [h, sound, other] of [[robot("zip", ["fast"]), "roll", "step"], [robot("plod"), "step", "roll"]]) {
    const g = newGame(L, [h]);
    g.player.x = 4; g.player.y = 60; // out of the way, standing still
    setProgram(g, g.workers[0], prog(h));
    const heard = listen(g, 10);
    assert.ok(heard.filter((s) => s === sound).length >= 3, `${h.id}: ${heard.join()}`);
    assert.ok(!heard.includes(other), `${h.id} never makes the ${other} sound`);
  }
});

test("standing still is silent, and a jump (a new shift) isn't a footstep", () => {
  const g = newGame(L, [robot("a")]);
  const feet = new Map();
  assert.deepEqual(listen(g, 3, () => false, feet), []);
  g.workers[0].x += 40;
  assert.deepEqual(footstepCues(g, feet), []);
});

test("machines make their sound: painting, servicing, wearing out", () => {
  const g = newGame(L, []);
  const heard = [];
  playerGo(g, "SUPPLY", { action: "pickUp" });
  listen(g, 10, () => g.player.holding);
  playerGo(g, "PAINT", { action: "paint", color: "blue" });
  heard.push(...listen(g, 20, () => g.player.holding.color === "blue" && !g.player.act));
  playerGo(g, "PAINT", { action: "service" });
  heard.push(...listen(g, 30, () => g.wear.PAINT === 0));
  for (const s of ["paint", "worn", "service"]) assert.ok(heard.includes(s), `${s}: ${heard.join()}`);
  // A paint job that can't happen (worn, nothing in hand) doesn't spray.
  const h = newGame(L, []);
  h.wear.PAINT = 100;
  playerGo(h, "PAINT", { action: "paint", color: "blue" });
  const tried = listen(h, 10, () => h.player.station === "PAINT" && !h.player.act);
  assert.ok(!tried.includes("paint"), tried.join());
});

test("the soundboard builds: every sound on it, and a replay with deliveries, a miss, wheels and footsteps", () => {
  const out = mkdtempSync(join(tmpdir(), "soundboard-"));
  execFileSync("node", [join(ROOT, "tools/soundboard.mjs"), out]);
  const html = readFileSync(join(out, "index.html"), "utf8");
  for (const name of Object.keys(SOUNDS)) { assert.ok(html.includes(`"${name}"`), name); assert.ok(existsSync(join(out, "sounds", `${name}.mp3`)), name); }
  assert.ok(!html.includes("/*SOUNDS*/") && !html.includes("/*PLAYER*/"), "the template was filled in");
  const replay = JSON.parse(readFileSync(join(out, "replay.json"), "utf8"));
  const heard = new Set(replay.cues.map((c) => c.sound));
  for (const s of ["whistle", "step", "roll", "pickup", "putdown", "pack", "paint", "assemble", "service", "worn", "ding", "nope"]) assert.ok(heard.has(s), s);
  assert.ok(replay.cues.every((c, i) => i === 0 || c.t >= replay.cues[i - 1].t), "cues in time order");
});
