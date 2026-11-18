// The factory: plain state plus step(). No DOM and no model calls, so it runs headless too.
//
// Workers run programs written in the worker language (lang.js), compiled from their instructions.
// The interpreter hands the sim one action at a time; the sim carries it out over however long it
// takes and passes back whether it worked. A worker can also have a queue of one-time steps (from
// a message or a thought) that runs before their program continues. When something unexpected
// happens (they keep failing, their program loops without acting or errors, or it ends before the
// order is done) the sim raises an "unexpected" event; the screen decides whether they think about
// it or come to your desk. You (the player) are on the floor too and use the same action code.
import { runProgram } from "./lang.js";

export const FLOOR = { w: 100, h: 64 };
export const STATIONS = {
  SUPPLY: { x: 20, y: 12, label: "Supply" },
  PAINT:  { x: 45, y: 12, label: "Paint" },
  PACK:   { x: 70, y: 12, label: "Pack" },
  DOCK:   { x: 89, y: 37, label: "Dock" },
  BIN_1:  { x: 26, y: 37, label: "Bin 1" },
  BIN_2:  { x: 50, y: 37, label: "Bin 2" },
};
// Raw widgets come from the supply, which never runs out (decision #57; there used to be a belt that
// brought one every few seconds). Old programs that say "BELT" still mean the supply.
const stationKey = (name) => (name === "BELT" ? "SUPPLY" : name);
export const programStationName = (key) => key;
/** The widget colors the supply gives out: the level's colors, red by default. */
export const supplyColors = (level) => level.colors ?? ["red"];
export const DESK = { x: 70, y: 58 };
// Half-size of a station's tile in floor units, and how far from its edge a robot stands.
const TILE = { hw: 8, hh: 5.5 }, STAND = 4;

/** Where to stand to use a station, on whichever side is nearest to `from`. */
export function standPoint(key, from) {
  const st = STATIONS[key];
  const x0 = st.x - TILE.hw - STAND, x1 = st.x + TILE.hw + STAND;
  const y0 = st.y - TILE.hh - STAND, y1 = st.y + TILE.hh + STAND;
  let x = Math.min(x1, Math.max(x0, from.x)), y = Math.min(y1, Math.max(y0, from.y));
  if (x > x0 && x < x1 && y > y0 && y < y1) {
    // Already inside the ring: step out to the nearest edge.
    const d = [x - x0, x1 - x, y - y0, y1 - y], m = Math.min(...d);
    if (m === d[0]) x = x0; else if (m === d[1]) x = x1; else if (m === d[2]) y = y0; else y = y1;
  }
  return { x: Math.min(97, Math.max(3, x)), y: Math.min(61, Math.max(4, y)) };
}

/** How far a point is from a station's tile (0 if on it). */
function distToTile(key, x, y) {
  const st = STATIONS[key];
  const dx = Math.max(0, Math.abs(x - st.x) - TILE.hw), dy = Math.max(0, Math.abs(y - st.y) - TILE.hh);
  return Math.hypot(dx, dy);
}
export const COLORS = ["red", "blue", "green"];

// Skills are things a worker knows how to do; attributes are traits (docs/worker-agent-design.md).
export const SKILL_ACTIONS = { packing: "pack", painting: "paint", repair: "service" };
const PRIMARY = { pack: "packing", paint: "painting" }; // without the skill: a compile error
const SIDE = { service: "repair" };                      // without the skill: silently nothing

export const RULES = {
  speed: 22,            // floor units per second
  binCap: 5, packCap: 6, paintCap: 3,
  supplyShown: 4,       // widgets of each color drawn at the supply (it never runs out)
  reach: 6,             // how close to a station's tile you have to stand to use it (corners are 4√2 ≈ 5.7 away)
  stationWait: 8,       // how long a worker waits anywhere else (for a box, for room, for 3 widgets)
  fastSpeed: 1.5,       // walking speed multiplier for Fast workers
  nimble: 0.6,          // machine work takes this much as long for Nimble workers
  steady: 0.5,          // machines wear this much as fast in a Steady worker's hands
  wear: 10,             // wear per paint job, out of 100, unless the level says otherwise
  stuckAfter: 6,        // failed actions (walking aside) in a row that count as "stuck"
  stuckCooldown: 20,    // seconds before the same worker can be "stuck" again
  stallAfter: 15,       // nothing on the floor moved for this long: everyone gets an unexpected "stalled"
  deskWait: 30,         // how long a worker waits at your desk before going back
};
// Picking up and putting down are instant. Everything that takes time shows its progress
// (actProgress below), so nothing on the floor just sits there.
const DUR = { pickUp: 0, putDown: 0, paint: 1.5, pack: 2, service: 3, say: 1 };

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const label = (st) => STATIONS[st]?.label ?? st;
const widget = (s, color) => ({ id: ++s.ids, kind: "widget", color });
const itemName = (it) => (it.kind === "box" ? "box" : `${it.color} widget`);

/**
 * A new game of `level` (see levels.js) with these hires, in level order. `done` (one count per
 * order line) starts the order part-shipped: a quarter's later shifts carry its quota forward.
 */
export function newGame(level, hires, seed = (Math.random() * 2 ** 32) >>> 0, { done } = {}) {
  const s = {
    t: 0, seed, rng: mulberry32(seed), ids: 0, version: 0, level,
    shipped: 0, counted: 0, wasted: 0, laborCost: 0,
    stations: Object.fromEntries(level.stations.map((k) => [k, []])),
    wear: level.stations.includes("PAINT") ? { PAINT: 0 } : {},
    workers: [], events: [],
    order: level.order.map((l, i) => ({ ...l, done: done?.[i] ?? 0 })),
    over: false, won: false, lastProgress: 0,
    // You. Starts by the desk; same shape as a worker so the same action code runs for both.
    // You know every skill.
    player: {
      id: "you", isPlayer: true, index: -1,
      hire: { id: "you", name: "You", skills: Object.keys(SKILL_ACTIONS), attributes: [], wage: 0 },
      x: DESK.x, y: DESK.y - 8, station: null, holding: null, act: null, next: null,
      vx: 0, vy: 0, fails: 0, failLog: [],
    },
  };
  // The supply's stock, drawn on the floor; taking one puts another in its place.
  if (s.stations.SUPPLY) for (const c of supplyColors(level)) for (let i = 0; i < RULES.supplyShown; i++) s.stations.SUPPLY.push(widget(s, c));
  for (const hire of hires) addWorker(s, hire);
  return s;
}

/** Hire someone onto the floor. They start at the dock with no program. */
export function addWorker(s, hire) {
  const at = standPoint("DOCK", { x: DESK.x + 8, y: DESK.y }), i = s.workers.length;
  const { x, y } = spawnSpot(s, at);
  const w = {
    id: hire.id, hire, index: i,
    x, y, station: i === 0 ? "DOCK" : null, holding: null,
    gen: null, nowGen: null, lastOk: undefined, programEnded: false,
    act: null, waiting: null, returnTo: null,
    fails: 0, failLog: [], lastStuck: -1e9,
  };
  s.workers.push(w);
  return w;
}

/** Where a new robot starts: by the dock, the first spot along the row that's at least a
 *  robot-width (SPAWN_GAP) from you (at the desk) and from every robot already there. */
export const SPAWN_GAP = 8.5; // a robot with a box in hand is about 8 wide
function spawnSpot(s, at) {
  const others = [s.player, ...s.workers].filter(Boolean);
  const free = (x) => others.every((o) => Math.hypot(o.x - x, o.y - at.y) >= SPAWN_GAP);
  for (let k = 0; k < 40; k++) {
    const step = k % 2 ? -Math.ceil(k / 2) : k / 2; // 0, -1, 1, -2, 2, ...
    const x = at.x + SPAWN_GAP * step;
    if (x >= 4 && x <= FLOOR.w - 4 && free(x)) return { x, y: at.y };
  }
  return { x: Math.max(4, at.x - SPAWN_GAP * s.workers.length), y: at.y };
}

export function removeWorker(s, id) {
  s.workers = s.workers.filter((w) => w.id !== id);
  s.workers.forEach((w, i) => (w.index = i));
}

export const hasSkill = (w, skill) => !!w.hire.skills?.includes(skill);
export const hasAttr = (w, attr) => !!w.hire.attributes?.includes(attr);

const emit = (s, ev) => s.events.push({ t: s.t, ...ev });

export function step(s, dt) {
  if (s.over) return;
  s.t += dt;
  // Levels with a crew have a shift length: the order has to ship before it runs out.
  if (s.level.shift && s.t >= s.level.shift) {
    s.t = s.level.shift;
    s.over = true; s.won = false;
    emit(s, { type: "end" });
    return;
  }
  stepPlayer(s, s.player, dt);
  for (const w of s.workers) stepWorker(s, w);
  // A line can jam with nobody failing: a packer waiting for a condition that never comes true, a
  // hauler waiting for room. If nothing has been picked up, put down, packed, painted or serviced
  // for a while, that's unexpected for everyone on the floor.
  if (s.workers.length && s.t - s.lastProgress >= RULES.stallAfter) {
    s.lastProgress = s.t;
    for (const w of s.workers) emit(s, { type: "unexpected", worker: w.id, reason: "stalled", detail: `nothing on the floor has moved for ${RULES.stallAfter} seconds` });
  }
}

// ---------- the tools a program gets ----------

/** Names of the actions and questions this worker's programs may use in this level. */
export function toolNamesFor(hire, level) {
  const has = (k) => level.stations.includes(k);
  const actions = ["move", "pickUp", "putDown", "wait", "say", "think"];
  if (has("PACK")) actions.push("pickUpBox");
  if (has("PACK") && hire.skills.includes("packing")) actions.push("pack");
  if (has("PAINT") && hire.skills.includes("painting")) actions.push("paint");
  if (has("PAINT")) actions.push("service"); // a side task: anyone may include it
  const queries = ["holding", "count", "boxes", "space", "needs", "needsAny", "where", "holds"];
  if (has("PAINT")) queries.push("wear");
  return { actions, queries, known: ["move", "pickUp", "pickUpBox", "putDown", "pack", "paint", "service", "wait", "say", "think"] };
}

function makeTools(s, w) {
  const color = (c) => (COLORS.includes(c) ? c : null);
  const actions = {
    move: (st) => ({ action: "moveTo", station: stationKey(st) }),
    pickUp: (c) => ({ action: "pickUp", color: color(c) }),
    pickUpBox: () => ({ action: "pickUp", box: true }),
    putDown: () => ({ action: "putDown" }),
    pack: (c) => ({ action: "pack", color: color(c) }),
    paint: (c) => ({ action: "paint", color: c }),
    service: () => ({ action: "service" }),
    wait: (sec) => ({ action: "wait", seconds: sec }),
    say: (text) => ({ action: "say", text }),
    think: (reason) => ({ action: "think", reason }),
  };
  const at = (st) => s.stations[stationKey(st)] ?? [];
  const holdingOf = (x) => (!x.holding ? "nothing" : x.holding.kind === "box" ? "box" : x.holding.color);
  const findPerson = (name) => [s.player, ...s.workers].find((x) => x.hire.name.toLowerCase() === String(name).toLowerCase() || (name === "boss" && x.isPlayer));
  const queries = {
    holding: () => holdingOf(w),
    count: (st, c) => at(st).filter((i) => i.kind === "widget" && (!c || i.color === c)).length,
    boxes: (st) => at(st).filter((i) => i.kind === "box" && !i.building).length,
    space: (st) => Math.max(0, capOf(s.level, stationKey(st)) - at(st).length),
    needs: (c) => s.order.filter((l) => l.color === c || l.color === "any").reduce((a, l) => a + l.count - l.done, 0),
    needsAny: () => s.order.reduce((a, l) => a + l.count - l.done, 0),
    wear: (st) => Math.round(s.wear[stationKey(st)] ?? 0),
    where: (name) => { const x = findPerson(name); return x ? programStationName(x.station ?? "walking") : "nobody"; },
    holds: (name) => { const x = findPerson(name); return x ? holdingOf(x) : "nothing"; },
  };
  return { actions, queries };
}

/** How much a station holds. A level's `caps` ({ PACK, BIN }) can raise it: bought upgrades. */
export const capOf = (level, st) => (st.startsWith("BIN_") ? level.caps?.BIN ?? RULES.binCap : st === "PACK" ? level.caps?.PACK ?? RULES.packCap
  : st === "PAINT" ? RULES.paintCap : st === "DOCK" ? Infinity : 0);

/** Give a worker a (parsed, checked) program. It starts from the top. */
export function setProgram(s, w, ast) {
  w.ast = ast; // kept so "Try again" can start the next shift with the same routine
  w.gen = runProgram(ast, makeTools(s, w));
  w.programEnded = false;
  w.fails = 0;
  w.lastOk = undefined;
  resume(s, w, { walkBack: false });
}

/** Queue one-time steps (a parsed program) to run before the worker's program continues. */
export function setNow(s, w, ast) {
  w.nowGen = runProgram(ast, makeTools(s, w));
  w.lastOk = undefined;
  resume(s, w, { walkBack: false });
}

// ---------- you ----------

/** The station you're close enough to use, if any. */
function stationNear(s, x, y) {
  let best = null, bestD = RULES.reach;
  for (const k of Object.keys(s.stations)) {
    const d = distToTile(k, x, y);
    if (d <= bestD) { best = k; bestD = d; }
  }
  return best;
}

function stepPlayer(s, p, dt) {
  if (p.act) {
    advance(s, p);
    if (!p.act && p.next) { const a = p.next; p.next = null; playerDo(s, a); }
    return;
  }
  if (p.vx || p.vy) {
    const len = Math.hypot(p.vx, p.vy);
    p.x = Math.min(97, Math.max(3, p.x + (p.vx / len) * RULES.speed * dt));
    p.y = Math.min(61, Math.max(4, p.y + (p.vy / len) * RULES.speed * dt));
    p.station = stationNear(s, p.x, p.y);
  }
}

/** Walk to a station (cancels whatever walk you were on), then optionally do `then` there. */
export function playerGo(s, station, then = null) {
  const p = s.player;
  if (p.act && p.act.kind !== "moveTo" && p.act.kind !== "walkTo") return; // busy with your hands
  const st = STATIONS[station];
  if (!st || !(station in s.stations)) return;
  p.next = then;
  if (p.station === station && !p.act) { p.next = null; if (then) playerDo(s, then); return; }
  const to = standPoint(station, p);
  walk(s, p, to.x, to.y, { kind: "moveTo", arrive: station, a: { action: "moveTo", station } });
}

/** Walk to a spot on the floor. */
export function playerWalkTo(s, x, y) {
  const p = s.player;
  if (p.act && p.act.kind !== "moveTo" && p.act.kind !== "walkTo") return;
  p.next = null;
  walk(s, p, Math.min(97, Math.max(3, x)), Math.min(61, Math.max(4, y)), { kind: "walkTo" });
}

/** Keyboard movement: a direction to walk in, or 0,0 to stop. Cancels a click-walk. */
export function playerSteer(s, vx, vy) {
  const p = s.player;
  p.vx = vx; p.vy = vy;
  if ((vx || vy) && (p.act?.kind === "moveTo" || p.act?.kind === "walkTo")) { p.act = null; p.next = null; }
}

/** Do something with your hands where you stand: pickUp, putDown, paint, pack, service. */
export function playerDo(s, a) {
  const p = s.player;
  if (p.act) return;
  p.station = stationNear(s, p.x, p.y);
  if (!p.station) return fail(s, p, a, "you're not at a station");
  start(s, p, a);
}

// ---------- workers ----------

function stepWorker(s, w) {
  if (w.act) return advance(s, w);
  if (w.waiting) {
    if (s.t < w.waiting.until) return;
    emit(s, { type: "gaveUp", worker: w.id });
    resume(s, w);
    return;
  }
  const gen = w.nowGen ?? w.gen;
  if (!gen) return;
  let r;
  try {
    r = gen.next(w.lastOk);
  } catch (e) {
    // The program looped without acting, or hit an error: drop it and raise it as unexpected.
    if (gen === w.nowGen) w.nowGen = null; else w.gen = null;
    emit(s, { type: "unexpected", worker: w.id, reason: e.kind === "loop" ? "loop" : "error", detail: e.message });
    return;
  }
  w.lastOk = undefined;
  if (r.done) {
    if (gen === w.nowGen) { w.nowGen = null; emit(s, { type: "nowDone", worker: w.id }); return; }
    w.gen = null;
    w.programEnded = true;
    if (s.order.some((l) => l.done < l.count)) {
      emit(s, { type: "unexpected", worker: w.id, reason: "ended", detail: "my program finished, but the order isn't done" });
    }
    return;
  }
  start(s, w, r.value);
}

function walk(s, w, x, y, extra) {
  const dist = Math.hypot(x - w.x, y - w.y);
  w.station = null;
  w.act = { ...extra, from: { x: w.x, y: w.y }, to: { x, y }, start: s.t, until: s.t + Math.max(0.2, dist / (RULES.speed * (hasAttr(w, "fast") ? RULES.fastSpeed : 1))) };
}

// Workers who come to talk stand just above your desk.
const deskSpot = (w) => ({ x: DESK.x, y: DESK.y - 8 });

const machineTime = (w, kind) => DUR[kind] * (hasAttr(w, "nimble") ? RULES.nimble : 1);

function start(s, w, a) {
  switch (a.action) {
    case "moveTo": {
      const st = a.station in s.stations && STATIONS[a.station];
      if (!st) return fail(s, w, a, `there's no ${label(a.station)} in this factory`);
      if (w.station === a.station) return ok(s, w, a);
      const to = standPoint(a.station, w);
      return walk(s, w, to.x, to.y, { a, kind: "moveTo", arrive: a.station });
    }
    case "wait":
      w.act = { a, kind: "wait", start: s.t, until: s.t + Math.min(20, Math.max(0.5, +a.seconds || 1)) };
      return;
    case "say":
      emit(s, { type: "say", worker: w.id, text: String(a.text ?? "") });
      w.act = { a, kind: "say", start: s.t, until: s.t + DUR.say };
      return;
    case "think":
      // Thinking doesn't stop the worker: ask for a thought and carry on.
      // (A short pause, so a program that calls think() in a tight loop can't fire it every frame.)
      emit(s, { type: "thinkRequest", worker: w.id, reason: String(a.reason ?? "") });
      w.act = { a, kind: "wait", start: s.t, until: s.t + 0.5 };
      return;
    case "pack": case "paint":
      if (!w.isPlayer && !hasSkill(w, PRIMARY[a.action])) return fail(s, w, a, `I don't know how to ${a.action}`);
      w.act = { a, kind: a.action, start: s.t, until: s.t + (a.action === "pack" ? 0 : machineTime(w, a.action)) };
      return;
    case "service":
      // A side task: without the Repair skill it quietly does nothing.
      if (!w.isPlayer && !hasSkill(w, SIDE.service)) return ok(s, w, a);
      w.act = { a, kind: "service", start: s.t, until: s.t + (w.station === "PAINT" && s.wear.PAINT > 0 ? machineTime(w, "service") : 0) };
      return;
    case "pickUp": case "putDown":
      w.act = { a, kind: a.action, start: s.t, until: s.t };
      return;
    default:
      return fail(s, w, a, `I don't know how to "${a.action}"`);
  }
}

function advance(s, w) {
  const act = w.act;
  if (act.to) {
    const k = Math.min(1, (s.t - act.start) / (act.until - act.start));
    w.x = act.from.x + (act.to.x - act.from.x) * k;
    w.y = act.from.y + (act.to.y - act.from.y) * k;
  }
  if (s.t < act.until) return;
  w.act = null;
  finish(s, w, act);
}

function finish(s, w, act) {
  const a = act.a;
  switch (act.kind) {
    case "moveTo": w.station = act.arrive; return ok(s, w, a);
    case "walkTo": w.station = stationNear(s, w.x, w.y); return;
    case "toDesk": w.waiting = { reason: act.reason, until: s.t + RULES.deskWait }; return;
    case "pickUp": return pickUp(s, w, a, act);
    case "putDown": return putDown(s, w, a, act);
    case "paint": return paint(s, w, a);
    case "pack": return pack(s, w, a, act);
    case "service": return service(s, w, a);
    default: w.lastOk = true; return; // wait, say
  }
}

// Workers wait a little for what they need (a box, room in a bin, three
// widgets to pack) instead of failing right away. You don't: you just try again.
// Returns true if they're waiting another half second.
function keepWaiting(s, w, act) {
  if (w.isPlayer) return false;
  const limit = RULES.stationWait;
  if ((act.waited ?? 0) >= limit) return false;
  w.act = { ...act, waited: (act.waited ?? 0) + 0.5, limit, until: s.t + 0.5 };
  return true;
}

function pickUp(s, w, a, act) {
  if (!w.station) return fail(s, w, a, "I'm not at a station");
  if (w.holding) return fail(s, w, a, `my hands are full (holding a ${itemName(w.holding)})`);
  const items = s.stations[w.station];
  const color = COLORS.includes(a.color) ? a.color : null;
  let idx;
  if (a.box || (!color && w.station === "PACK")) idx = items.findIndex((i) => i.kind === "box" && !i.building);
  else if (color) idx = items.findIndex((i) => i.kind === "widget" && i.color === color);
  else idx = items.findIndex((i) => i.kind === "widget");
  if (idx < 0) {
    if (keepWaiting(s, w, act)) return;
    const what = a.box || (!color && w.station === "PACK") ? "finished box" : color ? `${color} widget` : "widget";
    return fail(s, w, a, `there's no ${what} at ${label(w.station)}`);
  }
  w.holding = items.splice(idx, 1)[0];
  // The supply never runs out: another of that color takes its place.
  if (w.station === "SUPPLY" && w.holding.kind === "widget") items.splice(idx, 0, widget(s, w.holding.color));
  s.version++;
  ok(s, w, a);
}

function putDown(s, w, a, act) {
  if (!w.station) return fail(s, w, a, "I'm not at a station");
  if (!w.holding) return fail(s, w, a, "my hands are empty");
  const st = w.station;
  if (st === "DOCK") {
    if (s.level.ship === "boxes" && w.holding.kind !== "box") return fail(s, w, a, "only boxes can ship from the dock");
    ship(s, w, w.holding);
    w.holding = null; s.version++;
    return ok(s, w, a);
  }
  if (s.stations[st].length >= capOf(s.level, st)) {
    if (keepWaiting(s, w, act)) return;
    fail(s, w, a, `${label(st)} is full`);
    // Gave up waiting for room: that's unexpected right away (decision #63), not after six of these.
    // Holding something at a full station usually means a jam nobody else will clear.
    if (!w.isPlayer && s.t - w.lastStuck >= RULES.stuckCooldown) {
      w.lastStuck = s.t; w.fails = 0;
      emit(s, { type: "unexpected", worker: w.id, reason: "full", detail: `${label(st)} is full and I waited ${RULES.stationWait} seconds for room, holding a ${itemName(w.holding)}` });
    }
    return;
  }
  s.stations[st].push(w.holding);
  w.holding = null; s.version++;
  ok(s, w, a);
}

function paint(s, w, a) {
  if (w.station !== "PAINT") return fail(s, w, a, "I'm not at the paint machine");
  if (!w.holding || w.holding.kind !== "widget") return fail(s, w, a, "I'm not holding a widget to paint");
  if (!COLORS.includes(a.color)) return fail(s, w, a, `there's no ${a.color || "such"} paint`);
  if (s.wear.PAINT >= 100) return fail(s, w, a, "the paint machine needs servicing");
  w.holding.color = a.color; s.version++;
  // Machines wear predictably: every job adds a bit, less in a Steady worker's hands.
  s.wear.PAINT = Math.min(100, s.wear.PAINT + (s.level.wear ?? RULES.wear) * (hasAttr(w, "steady") ? RULES.steady : 1));
  if (s.wear.PAINT >= 100) emit(s, { type: "worn", worker: w.id });
  ok(s, w, a);
}

// Packing happens in place: the 3 widgets turn into a box that fills in over DUR.pack seconds, then
// it's a finished box someone can pick up. You choose which 3 (a.ids); a worker can name a color
// (a.color); otherwise it's the first 3 widgets there.
function pack(s, w, a, act) {
  if (w.station !== "PACK") return fail(s, w, a, "I'm not at the pack station");
  const items = s.stations.PACK;
  if (act.box) { // done building
    delete act.box.building; s.version++;
    return ok(s, w, a);
  }
  // A box is always one color: "pack red" takes 3 red widgets from wherever they sit at Pack, so
  // the order things were dropped off doesn't matter. pack() with no color packs a color there are
  // 3 of, the one the order still needs first.
  const widgets = items.filter((i) => i.kind === "widget");
  const of = (c) => widgets.filter((i) => i.color === c);
  let color = COLORS.includes(a.color) ? a.color : null;
  if (!color) {
    const ready = COLORS.filter((c) => of(c).length >= 3);
    const needed = (c) => s.order.some((l) => l.done < l.count && (l.color === c || l.color === "any"));
    color = ready.find(needed) ?? ready[0] ?? null;
  }
  const pool = color ? of(color) : [];
  if (pool.length < 3) {
    const what = a.color ? `${a.color} widgets` : "widgets of one color";
    return keepWaiting(s, w, act) || fail(s, w, a, `there are only ${a.color ? pool.length : Math.max(0, ...COLORS.map((c) => of(c).length))} ${what} at Pack, a box needs 3`);
  }
  const chosen = pool.slice(0, 3);
  for (const it of chosen) items.splice(items.indexOf(it), 1);
  const time = machineTime(w, "pack");
  const box = { id: ++s.ids, kind: "box", colors: chosen.map((i) => i.color), building: { start: s.t, until: s.t + time } };
  items.push(box); s.version++;
  w.act = { a, kind: "pack", box, start: s.t, until: s.t + time };
}

function service(s, w, a) {
  if (w.station !== "PAINT") return fail(s, w, a, "I'm not at the paint machine");
  if (s.wear.PAINT > 0) { s.wear.PAINT = 0; s.version++; s.lastProgress = s.t; w.worked = (w.worked ?? 0) + 1; emit(s, { type: "serviced", worker: w.id }); }
  ok(s, w, a);
}

/** Does this item count toward this line of the order? */
function fits(line, item) {
  if (item.kind === "box") return line.color === "any" || item.colors.every((c) => c === line.color);
  return line.color === "any" || item.color === line.color;
}

function ship(s, w, item) {
  const colors = item.kind === "box" ? item.colors : [item.color];
  const line = s.order.find((l) => l.done < l.count && fits(l, item));
  if (line) { line.done++; s.counted++; } else s.wasted++;
  s.shipped++;
  emit(s, { type: "ship", worker: w.id, matched: !!line, item: item.kind, colors });
  if (s.order.every((l) => l.done >= l.count)) { s.over = true; s.won = true; emit(s, { type: "end" }); }
}

// Only real work resets the failure count. Walking doesn't, or a worker whose every lap fails
// would never notice they're stuck.
function ok(s, w, a) {
  w.lastOk = true;
  if (a?.action && a.action !== "moveTo") w.fails = 0;
  if (["pickUp", "putDown", "pack", "paint"].includes(a?.action)) s.lastProgress = s.t;
  // Work that leaves something done (the pre-shift dry run counts these; picking up alone isn't).
  if (["putDown", "pack", "paint"].includes(a?.action)) w.worked = (w.worked ?? 0) + 1;
}

function fail(s, w, a, why) {
  w.lastOk = false;
  w.fails++;
  w.failLog.push({ t: s.t, action: a?.action, why });
  if (w.failLog.length > 6) w.failLog.shift();
  emit(s, { type: "fail", worker: w.id, action: a?.action, why });
  if (!w.isPlayer && w.fails >= RULES.stuckAfter && s.t - w.lastStuck >= RULES.stuckCooldown) {
    w.lastStuck = s.t; w.fails = 0;
    emit(s, { type: "unexpected", worker: w.id, reason: "stuck", detail: w.failLog.slice(-4).map((f) => f.why).join("; ") });
  }
}

/** Send a worker to your desk to wait for you. */
export function goToDesk(s, w, reason) {
  w.returnTo = w.station ?? w.returnTo;
  const p = deskSpot(w);
  walk(s, w, p.x, p.y, { kind: "toDesk", reason });
}

/** Is this worker at (or walking to) your desk, waiting to hear from you? */
export const atDesk = (w) => !!w.waiting || w.act?.kind === "toDesk";

/** Send a worker back to work: back to where they were, unless `walkBack` is false. */
export function resume(s, w, { walkBack = true } = {}) {
  if (!atDesk(w)) return;
  w.waiting = null;
  if (w.act?.kind === "toDesk") w.act = null;
  const back = w.returnTo && STATIONS[w.returnTo];
  if (walkBack && back) {
    const to = standPoint(w.returnTo, w);
    walk(s, w, to.x, to.y, { kind: "moveTo", arrive: w.returnTo, a: { action: "moveTo", station: w.returnTo } });
  }
}

// ---------- what a worker can see, for prompts ----------

function describe(items) {
  if (!items.length) return "empty";
  const n = {};
  for (const it of items) {
    const k = it.kind === "box" ? `${it.colors.every((c) => c === it.colors[0]) ? it.colors[0] : "mixed"} packed box` : `${it.color} widget`;
    n[k] = (n[k] || 0) + 1;
  }
  return Object.entries(n).map(([k, v]) => `${v} ${k}${v > 1 ? (k.endsWith("box") ? "es" : "s") : ""}`).join(", ");
}
const holdingText = (w) => (w.holding ? (w.holding.kind === "box" ? "a box" : `a ${w.holding.color} widget`) : "nothing");
const whereText = (w) => (w.station ? programStationName(w.station) : atDesk(w) ? "the owner's desk" : "walking");

export function viewFor(s, w) {
  const you = { at: whereText(w), holding: holdingText(w) };
  const floor = {};
  for (const k of Object.keys(s.stations)) floor[programStationName(k)] = describe(s.stations[k]);
  const view = { you, floor };
  if ("PAINT" in s.stations) view.paintMachineWear = `${Math.round(s.wear.PAINT)}% (it stops at 100% until serviced)`;
  view.order = s.order.map((l) => orderLineText(s.level, l));
  view.boss = `works on the floor too: at ${whereText(s.player)}, holding ${holdingText(s.player)}`;
  const others = s.workers.filter((o) => o !== w);
  // Coworkers' instructions too, so a worker knows the rest of the line is covered and sticks to
  // their own part.
  if (others.length) view.coworkers = Object.fromEntries(others.map((o) => [o.hire.name,
    `at ${whereText(o)}, holding ${holdingText(o)}${o.orders ? `, instructions: "${o.orders}"` : ", no instructions yet"}`]));
  return view;
}

/** "2 of 5 green boxes shipped" etc. */
export function orderLineText(L, l) {
  const what = L.ship === "boxes" ? (l.color === "any" ? "boxes (any color)" : `${l.color} boxes`) : (l.color === "any" ? "widgets (any color)" : `${l.color} widgets`);
  return `${l.done} of ${l.count} ${what} shipped`;
}

/**
 * How far along someone is with what they're doing, 0..1, or null if nothing timed is going on.
 * Waiting for something counts too (it runs toward when they'd give up).
 */
export function actProgress(s, w) {
  const act = w.act;
  if (!act || act.to) return null; // walking shows itself
  if (act.kind === "wait") return null; // a program's own pause (wait(1) between checks) is just standing by
  if (act.limit) return { p: Math.min(1, (act.waited ?? 0) / act.limit), waiting: true };
  if (act.until > act.start) return { p: Math.min(1, (s.t - act.start) / (act.until - act.start)), waiting: false };
  return null;
}

/** 0..1 for a box being packed. */
export const boxProgress = (s, box) => (box.building ? Math.min(1, (s.t - box.building.start) / (box.building.until - box.building.start)) : 1);
