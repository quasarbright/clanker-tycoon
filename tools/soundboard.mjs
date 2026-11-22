// Builds the soundboard (decision 97): a page that plays every sound on its own, and a replay of a
// factory at full steam with each sound where the game would play it.
//   node tools/soundboard.mjs [out dir]      default logs/soundboard/
// Writes index.html, replay.json and sounds/*.mp3 into the out dir; publish that folder as the
// artifact (index.html is the page, the rest go up as its files). After changing a sound, run
// tools/sounds.mjs, then this, then republish.
//
// The replay is recorded headless from the real sim with hand-written programs (no model calls),
// and the sounds in it come from src/sound.js's own rules, so the page has no game logic: it draws
// dots and boxes and plays the sound names it's given at the times it's given.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { newGame, step, setProgram, playerGo, toolNamesFor, STATIONS, FLOOR, CRATE } from "../src/sim.js";
import { parseProgram, checkProgram } from "../src/lang.js";
import { SOUNDS, eventCues, footstepCues, createSoundPlayer } from "../src/sound.js";

const ROOT = new URL("..", import.meta.url).pathname;
const OUT = process.argv[2] ?? join(ROOT, "logs/soundboard");
const SECONDS = 75, DT = 1 / 30, FRAME = 0.1;

// A floor with everything on it: both paint machines and the assembler.
const LEVEL = {
  id: "soundboard", name: "Full steam",
  stations: ["SUPPLY", "PAINT", "PAINT_2", "PACK", "DOCK", "BIN_1", "BIN_2", "ASSEMBLE"],
  ship: "boxes", colors: ["red"],
  order: [{ color: "crate", count: 99 }, { color: "red", count: 3 }],
  shift: 999, wear: 20, caps: { PACK: 12 },
};
const robot = (id, name, skills, attributes = []) => ({ id, name, skills, attributes, wage: 5 });
const CREW = [
  [robot("nib", "Nib", [], ["fast"]), `while (true) { move("SUPPLY"); pickUp("red"); move("PACK"); while (count("PACK", "red") >= 3) wait(1); putDown(); }`],
  [robot("bolt", "Bolt", ["painting"]), `while (true) { if (wear("PAINT") >= 100) { wait(1); } else { move("SUPPLY"); pickUp("red"); move("PAINT"); paint("blue"); move("PACK"); while (count("PACK", "blue") >= 3) wait(1); putDown(); } }`],
  [robot("dot", "Dot", ["painting"]), `while (true) { if (wear("PAINT_2") >= 100) { wait(1); } else { move("SUPPLY"); pickUp("red"); move("PAINT_2"); paint("green"); move("PACK"); while (count("PACK", "green") >= 3) wait(1); putDown(); } }`],
  [robot("pip", "Pip", ["packing"]), `while (true) { move("PACK"); if (count("PACK", "red") >= 3) pack("red"); else if (count("PACK", "blue") >= 3) pack("blue"); else if (count("PACK", "green") >= 3) pack("green"); else wait(1); }`],
  // Gary feeds the assembler one box of each color, and ships any spare red box: once the 3 red
  // boxes on the order are in, those spares are what "not ordered" sounds like.
  [robot("gary", "Gary", [], ["fast"]), `while (true) { move("PACK");
    if (boxes("ASSEMBLE", "blue") < 1 && boxes("PACK", "blue") > 0) { pickUpBox("blue"); move("ASSEMBLE"); putDown(); }
    else if (boxes("ASSEMBLE", "green") < 1 && boxes("PACK", "green") > 0) { pickUpBox("green"); move("ASSEMBLE"); putDown(); }
    else if (boxes("ASSEMBLE", "red") < 1 && boxes("PACK", "red") > 0) { pickUpBox("red"); move("ASSEMBLE"); putDown(); }
    else if (boxes("PACK", "red") > 2) { pickUpBox("red"); move("DOCK"); putDown(); }
    else wait(1); }`],
  [robot("vex", "Vex", ["assembly"]), `while (true) { move("ASSEMBLE"); if (crates("ASSEMBLE") > 0) { pickUpCrate(); move("DOCK"); putDown(); } else if (boxes("ASSEMBLE", "red") > 0 && boxes("ASSEMBLE", "blue") > 0 && boxes("ASSEMBLE", "green") > 0) assemble(); else wait(1); }`],
  [robot("rusty", "Rusty", ["repair"]), `while (true) { if (wear("PAINT") >= 100) { move("PAINT"); service(); } else if (wear("PAINT_2") >= 100) { move("PAINT_2"); service(); } else if (wear("ASSEMBLE") >= 100) { move("ASSEMBLE"); service(); } else { move("BIN_2"); wait(1); } }`],
];

function program(hire, src) {
  const ast = parseProgram(src);
  const problems = checkProgram(ast, toolNamesFor(hire, LEVEL));
  if (problems.length) throw new Error(`${hire.name}: ${problems.map((p) => p.message).join("; ")}`);
  return ast;
}

// What someone holds, or a station's items, as short codes: r g b (widgets), R G B (boxes), C (crate).
const code = (it) => (!it ? "" : it.kind === "crate" ? "C" : it.kind === "box" ? it.colors[0][0].toUpperCase() : it.color[0]);

function record() {
  const g = newGame(LEVEL, CREW.map(([h]) => h), 7);
  g.workers.forEach((w, i) => setProgram(g, w, program(CREW[i][0], CREW[i][1])));
  const people = [g.player, ...g.workers];
  const feet = new Map(), cues = [{ t: 0, sound: "whistle", x: 50, text: "Start" }], frames = [];
  const name = (id) => people.find((p) => p.id === id)?.hire.name ?? id;
  const say = (ev) => {
    const who = name(ev.worker);
    switch (ev.type) {
      case "pickUp": return `${who} picks up a ${ev.item}`;
      case "putDown": return `${who} puts a ${ev.item} down at ${STATIONS[ev.station].label}`;
      case "work": return `${who} ${{ pack: "packs a box", paint: "paints", assemble: "assembles a crate", service: "services" }[ev.kind]} at ${STATIONS[ev.station].label}`;
      case "ship": return `${who} ships a ${ev.item === "crate" ? "crate" : `${ev.colors[0]} ${ev.item}`}${ev.matched ? "" : ", not ordered"}`;
      case "worn": return `${STATIONS[ev.station].label} wears out`;
      case "fail": return `${who} can't: ${ev.why}`;
      default: return `${who}: ${ev.type}`;
    }
  };
  // You lend a hand on the green line: carry a red widget to Paint 2, paint it green, bring it to Pack.
  const youNext = () => {
    const h = g.player.holding, pack = g.stations.PACK;
    if (!h) return ["SUPPLY", { action: "pickUp", color: "red" }];
    if (h.color === "red") return g.wear.PAINT_2 >= 100 ? ["PAINT_2", { action: "service" }] : ["PAINT_2", { action: "paint", color: "green" }];
    return pack.filter((i) => i.color === "green").length < 3 ? ["PACK", { action: "putDown" }] : null;
  };
  let nextFrame = 0;
  while (g.t < SECONDS) {
    const m = !g.player.act && youNext();
    if (m) playerGo(g, ...m);
    step(g, DT);
    for (const c of footstepCues(g, feet)) cues.push({ t: g.t, ...c });
    for (const ev of g.events.splice(0)) {
      const [c] = eventCues(g, [ev]);
      if (c) cues.push({ t: g.t, ...c, text: say(ev).replace(/^You (\w+?)s\b/, "You $1") });
    }
    if (g.t >= nextFrame) {
      nextFrame += FRAME;
      frames.push({
        p: people.map((w) => [+w.x.toFixed(1), +w.y.toFixed(1), code(w.holding)]),
        s: Object.fromEntries(Object.entries(g.stations).map(([key, items]) => [key, key === "SUPPLY" ? "" : items.map(code).join("")])),
        w: Object.fromEntries(Object.entries(g.wear).map(([key, v]) => [key, Math.round(v)])),
      });
    }
  }
  cues.push({ t: SECONDS - 0.05, sound: "whistle", x: 50, text: "The replay's shift ends" });
  for (const c of cues) { c.t = +c.t.toFixed(3); c.x = Math.round(c.x); }
  cues.sort((a, b) => a.t - b.t);
  return {
    seconds: SECONDS, frame: FRAME, floor: FLOOR,
    stations: Object.fromEntries(LEVEL.stations.map((k) => [k, { x: STATIONS[k].x, y: STATIONS[k].y, label: STATIONS[k].label }])),
    people: people.map((w) => ({ name: w.hire.name, fast: !!w.hire.attributes?.includes("fast"), you: !!w.isPlayer })),
    frames, cues,
    shipped: { crates: g.order[0].done, red: g.order[1].done, wasted: g.wasted },
  };
}

const replay = record();
mkdirSync(join(OUT, "sounds"), { recursive: true });
for (const f of readdirSync(join(ROOT, "sounds"))) copyFileSync(join(ROOT, "sounds", f), join(OUT, "sounds", f));
writeFileSync(join(OUT, "replay.json"), JSON.stringify(replay));
const html = readFileSync(join(ROOT, "tools/soundboard.template.html"), "utf8")
  .replace("/*SOUNDS*/", () => JSON.stringify(SOUNDS))
  .replace("/*PLAYER*/", () => createSoundPlayer.toString())
  .replace("/*MADE*/", () => new Date().toISOString().slice(0, 10));
writeFileSync(join(OUT, "index.html"), html);
const counts = {};
for (const c of replay.cues) counts[c.sound] = (counts[c.sound] ?? 0) + 1;
console.log(`${OUT}: ${replay.frames.length} frames, ${replay.cues.length} sounds`, counts, replay.shipped);
