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
//
// A worker who packs gets one more try that starts with Pack full of the color the order wants
// (decision #63). A routine that walks up holding something and waits for room, instead of packing
// to make room, jams the line in play: nobody else can clear a full Pack.
import { newGame, step, setProgram, RULES, capOf, kindOf, CRATE } from "./sim.js";

const SECONDS = 40, DT = 1 / 20;

// "pack red boxes" asks for packing; "bring widgets to Pack" names the station, not the work.
const ASKS_TO_PACK = /(?<!\b(?:to|at|from|the|into|by|near)\s+)\bpack(?:s|ing|ed)?\b/i;

/** The color the order wants next, for the stage hand to supply. */
function wanted(L) {
  const line = L.order.find((l) => l.color !== "any" && l.color !== "crate") ?? L.order[0];
  return line.color === "any" || line.color === "crate" ? (L.colors ?? ["red"])[0] : line.color;
}

function stageHand(g, color, boxes) {
  const add = (st, it) => g.stations[st].push({ id: ++g.ids, ...it });
  // An assembler gets the three boxes a crate needs, and a finished crate to carry off.
  for (const st of Object.keys(g.stations).filter((k) => kindOf(k) === "ASSEMBLE")) {
    const at = g.stations[st];
    for (const c of CRATE) if (!at.some((i) => i.kind === "box" && i.colors[0] === c) && at.length < RULES.assembleCap - 1) add(st, { kind: "box", colors: [c, c, c] });
    if (!at.some((i) => i.kind === "crate") && at.length < RULES.assembleCap) add(st, { kind: "crate" });
  }
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
  // Instructions that say to ship have to actually ship something, not just pack (decision #67:
  // a packer whose routine packed and walked to the dock empty-handed jammed a whole quarter).
  const wantsShip = /\bship/i.test(instructions ?? "") && L.stations.includes("DOCK");
  let last;
  const wears = L.stations.some((k) => ["PAINT", "ASSEMBLE"].includes(kindOf(k)));
  for (const worn of wears ? [false, true] : [false]) {
    const g = newGame({ ...L, shift: null }, hires, 1);
    if (worn) for (const k of Object.keys(g.wear)) g.wear[k] = 100;
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
      if (broke || (w.worked && (!wantsShip || g.shipped > 0))) break;
      if (!w.gen && !w.act) break; // the program ended
    }
    if (w.worked && (!wantsShip || g.shipped > 0)) { last = null; break; }
    last = { broke, fails, visited, ended: !w.gen, noShip: w.worked && wantsShip };
  }
  if (!last) return boxes ? { ok: true } : fullPack(L, hires, ast, color);
  if (last.noShip) return { ok: false, why: `In a ${SECONDS}-second practice run your program did some of the work but never shipped anything, and your instructions say to ship. To ship a box: pick it up at PACK (pickUpBox), carry it to DOCK and put it down there.` };
  const what = last.broke ? `it broke down (${last.broke})`
    : last.fails.length ? `everything it tried failed (${[...new Set(last.fails)].slice(-3).join("; ")})`
    : last.ended ? "it finished without doing anything"
    : "it only walked and waited";
  const where = last.visited.size ? `, at ${[...last.visited].join(", ")}` : "";
  return { ok: false, why: `In a ${SECONDS}-second practice run, with ${color} widgets at the supply and at PACK${boxes ? " and a finished box at PACK" : ""}, your program never put anything down, packed, painted, assembled or serviced anything: ${what}${where}. It has to actually do the work your instructions describe.` };
}

// A packer facing a full Pack: they should pack to make room, not wait for it.
function fullPack(L, hires, ast, color) {
  if (!L.stations.includes("PACK")) return { ok: true };
  const g = newGame({ ...L, shift: null }, hires, 1);
  const cap = capOf(L, "PACK");
  for (let i = 0; i < cap; i++) g.stations.PACK.push({ id: ++g.ids, kind: "widget", color });
  const w = g.workers[0];
  setProgram(g, w, ast);
  while (g.t < 20 && !g.over) {
    step(g, DT);
    for (const e of g.events.splice(0)) {
      if (e.worker !== w.id) continue;
      const jam = (e.type === "fail" && /PACK is full|Pack is full/i.test(e.why)) || (e.type === "unexpected" && e.reason === "full");
      if (jam) return { ok: false, why: `In a practice run that starts with PACK full (${cap} ${color} widgets), your program waited at PACK holding something, for room that never came, instead of packing a box to make room. Nobody else can clear a full PACK. Pack first when PACK has 3 of a color (check space("PACK") before putting down).` };
    }
    if (w.worked) return { ok: true };
  }
  return { ok: true };
}
