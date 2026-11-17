// The dry run: before a worker takes a new program, play it for a while in a private copy of the
// floor and check that it gets something done. About 1 compiled program in 10 never makes progress
// (it only ships boxes nobody packs, say), and this catches it before the shift instead of 15
// seconds of nothing in the middle of it.
//
// The worker is alone on the copy, so their coworkers' part has to come from somewhere: a stage
// hand keeps the things they'd be handed within reach (widgets of the color the order wants on the
// supply and at Pack, and a finished box at Pack unless the instructions ask this worker to pack).
// With everything they need on hand, a program that still does no work is broken, whatever the
// rest of the crew does. A second try with the paint machine worn out covers a worker whose only
// work is servicing it. No model calls; it takes a few milliseconds.
import { newGame, step, setProgram, RULES } from "./sim.js";

const SECONDS = 40, DT = 1 / 20;

// "pack red boxes" asks for packing; "bring widgets to Pack" names the station, not the work.
const ASKS_TO_PACK = /(?<!\b(?:to|at|from|the|into|by|near)\s+)\bpack(?:s|ing|ed)?\b/i;

/** The color the order wants next, for the stage hand to supply. */
function wanted(L) {
  const line = L.order.find((l) => l.color !== "any") ?? L.order[0];
  return line.color === "any" ? (L.colors ?? ["red"])[0] : line.color;
}

function stageHand(g, color, boxes) {
  const add = (st, it) => g.stations[st].push({ id: ++g.ids, ...it });
  const pack = g.stations.PACK;
  if (!pack) return;
  // Leave room at Pack: a worker whose job is bringing things there needs space to put them down.
  if (pack.filter((i) => i.kind === "widget" && i.color === color).length < 3 && pack.length < RULES.packCap - 2) add("PACK", { kind: "widget", color });
  if (boxes && !pack.some((i) => i.kind === "box") && pack.length < RULES.packCap - 2) add("PACK", { kind: "box", colors: [color, color, color] });
}

/**
 * Play `ast` for worker `hire` on level `L`. `crew` is everyone hired (coworkers stand by idle,
 * so questions about them still have answers). Resolves to { ok: true } or { ok: false, why }
 * where `why` says what the program did instead, for the model.
 */
export function dryRun(L, hire, crew, ast, instructions) {
  const hires = [hire, ...crew.filter((h) => h.id !== hire.id)];
  const color = wanted(L);
  const boxes = !(hire.skills.includes("packing") && ASKS_TO_PACK.test(instructions ?? ""));
  let last;
  for (const worn of L.stations.includes("PAINT") ? [false, true] : [false]) {
    const g = newGame({ ...L, shift: null }, hires, 1);
    if (worn) g.wear.PAINT = 100;
    const w = g.workers[0];
    setProgram(g, w, ast);
    const visited = new Set(), fails = [];
    let broke = null, next = 0;
    while (g.t < SECONDS && !g.over) {
      if (g.t >= next) { stageHand(g, color, boxes); next += 0.5; }
      step(g, DT);
      if (w.station) visited.add(w.station);
      for (const e of g.events.splice(0)) {
        if (e.worker !== w.id) continue;
        if (e.type === "fail") fails.push(e.why);
        if (e.type === "unexpected" && (e.reason === "loop" || e.reason === "error")) broke = e.detail;
      }
      if (w.worked || broke) break;
      if (!w.gen && !w.act) break; // the program ended
    }
    if (w.worked) return { ok: true };
    last = { broke, fails, visited, ended: !w.gen };
  }
  const what = last.broke ? `it broke down (${last.broke})`
    : last.fails.length ? `everything it tried failed (${[...new Set(last.fails)].slice(-3).join("; ")})`
    : last.ended ? "it finished without doing anything"
    : "it only walked and waited";
  const where = last.visited.size ? `, at ${[...last.visited].join(", ")}` : "";
  return { ok: false, why: `In a ${SECONDS}-second practice run, with ${color} widgets at the supply and at PACK${boxes ? " and a finished box at PACK" : ""}, your program never put anything down, packed, painted or serviced anything: ${what}${where}. It has to actually do the work your instructions describe.` };
}
