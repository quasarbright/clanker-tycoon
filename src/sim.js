// The factory: plain state plus step(). No DOM and no model calls, so it runs headless too.
// Workers run looping action scripts. The model only writes scripts and lines of dialogue; every
// fumble, jam and failure happens here, in code. You (the player) are on the floor too: you walk
// around and do the same actions by hand, through the same code.

export const FLOOR = { w: 100, h: 64 };
export const STATIONS = {
  BELT_A: { x: 20, y: 12, label: "Belt" },
  PAINT:  { x: 45, y: 12, label: "Paint" },
  PACK:   { x: 70, y: 12, label: "Pack" },
  DOCK:   { x: 89, y: 37, label: "Dock" },
  BIN_1:  { x: 26, y: 37, label: "Bin 1" },
  BIN_2:  { x: 50, y: 37, label: "Bin 2" },
};
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
export const ACTIONS = ["moveTo", "pickUp", "putDown", "paint", "pack", "fix", "wait", "say", "askBoss"];
const PHYSICAL = new Set(["moveTo", "pickUp", "putDown", "paint", "pack", "fix"]);

export const RULES = {
  speed: 22,            // floor units per second
  binCap: 5, packCap: 6, paintCap: 3, beltCap: 8,
  beltEvery: 3.2,       // seconds between new widgets
  jamChance: 0.12,      // per paint job
  reach: 6,             // how close to a station's tile you have to stand to use it (corners are 4√2 ≈ 5.7 away)
  beltWait: 6,          // how long anyone waits at the belt for a widget
  patientWait: 8,       // how long a Patient worker waits anywhere else (for a box, for space, for widgets)
  fumble: 0.05,         // chance to drop what you pick up or put down, unless Careful
  fastSpeed: 1.5,       // walking speed multiplier for Fast workers
  stuckAfter: 6,        // failed actions (walking aside) in a row before a worker comes to complain
  reportCooldown: 40,
  deskWait: 30,         // how long a worker waits at your desk before going back
};
// Picking up and putting down are instant. Everything that takes time shows its progress
// (actProgress below), so nothing on the floor just sits there.
const DUR = { pickUp: 0, putDown: 0, paint: 1.5, pack: 2, fix: 3, say: 1 };

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// New widgets: the level's colors (levels.js), or all three with green rarest.
const randColor = (s) => {
  const cs = s.level.colors ?? COLORS;
  if (cs.length === 1) return cs[0];
  const r = s.rng();
  return r < 0.4 ? "red" : r < 0.8 ? "blue" : "green";
};
const label = (st) => STATIONS[st]?.label ?? st;
const widget = (s) => ({ id: ++s.ids, kind: "widget", color: randColor(s) });
const itemName = (it) => (it.kind === "box" ? "box" : `${it.color} widget`);

/** A new game of `level` (see levels.js) with these hires, in level order. */
export function newGame(level, hires, seed = (Math.random() * 2 ** 32) >>> 0) {
  const s = {
    t: 0, seed, rng: mulberry32(seed), ids: 0, version: 0, level,
    shipped: 0, counted: 0, wasted: 0, laborCost: 0,
    stations: Object.fromEntries(level.stations.map((k) => [k, []])),
    paintJammed: false, workers: [], events: [],
    order: level.order.map((l) => ({ ...l, done: 0 })),
    nextBelt: 1, over: false, won: false,
    // You. Starts by the desk; same shape as a worker so the same action code runs for both.
    player: {
      id: "you", isPlayer: true, index: -1,
      hire: { id: "you", name: "You", skills: ["careful"], wage: 0 },
      x: DESK.x, y: DESK.y - 8, station: null, holding: null, act: null, next: null,
      vx: 0, vy: 0, fails: 0, failLog: [], lastReport: 0, script: [],
    },
  };
  // A few widgets already waiting, so there's something on the floor before the clock starts.
  for (let i = 0; i < 4; i++) s.stations.BELT_A.push(widget(s));
  for (const hire of hires) addWorker(s, hire);
  return s;
}

/** Hire someone onto the floor. They start at the dock with no instructions. */
export function addWorker(s, hire) {
  const w = {
    id: hire.id, hire, index: s.workers.length,
    ...standPoint("DOCK", { x: DESK.x + 8, y: DESK.y }), station: "DOCK", holding: null,
    script: [], pc: 0, cur: -1, act: null, waiting: null, returnTo: null,
    fails: 0, failLog: [], lastReport: -1e9,
  };
  s.workers.push(w);
  return w;
}

export function removeWorker(s, id) {
  s.workers = s.workers.filter((w) => w.id !== id);
  s.workers.forEach((w, i) => (w.index = i));
}

/** Skills: "fast", "careful", "patient". */
export const hasSkill = (w, skill) => !!w.hire.skills?.includes(skill);

const emit = (s, ev) => s.events.push({ t: s.t, ...ev });

export function step(s, dt) {
  if (s.over) return;
  s.t += dt;
  while (s.t >= s.nextBelt) {
    s.nextBelt += RULES.beltEvery;
    // A full belt drops its oldest widget off the end, so new ones keep coming.
    if (s.stations.BELT_A.length >= RULES.beltCap) s.stations.BELT_A.shift();
    s.stations.BELT_A.push(widget(s));
    s.version++;
  }
  // Wages, by the second, while the shift runs.
  s.laborCost += s.workers.reduce((a, w) => a + w.hire.wage, 0) * dt / 60;
  stepPlayer(s, s.player, dt);
  for (const w of s.workers) stepWorker(s, w);
}

// ---- you ----

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

/** Do something with your hands where you stand: pickUp, putDown, paint, pack, fix. */
export function playerDo(s, a) {
  const p = s.player;
  if (p.act) return;
  p.station = stationNear(s, p.x, p.y);
  if (!p.station) return fail(s, p, a, "you're not at a station");
  start(s, p, a);
}

function stepWorker(s, w) {
  if (w.act) return advance(s, w);
  if (w.waiting) {
    if (s.t < w.waiting.until) return;
    emit(s, { type: "gaveUp", worker: w.id });
    resume(s, w);
    return;
  }
  if (!w.script.length) return;
  if (w.pc >= w.script.length) {
    w.pc = 0;
    // A script with nothing physical in it would just chatter forever: run it once, then stop.
    if (!w.script.some((a) => PHYSICAL.has(a.action))) { w.script = []; w.cur = -1; return; }
  }
  w.cur = w.pc;
  start(s, w, w.script[w.pc++]);
}

function walk(s, w, x, y, extra) {
  const dist = Math.hypot(x - w.x, y - w.y);
  w.station = null;
  w.act = { ...extra, from: { x: w.x, y: w.y }, to: { x, y }, start: s.t, until: s.t + Math.max(0.2, dist / (RULES.speed * (hasSkill(w, "fast") ? RULES.fastSpeed : 1))) };
}

// Workers who come to talk stand just above your desk.
const deskSpot = (w) => ({ x: DESK.x, y: DESK.y - 8 });

function start(s, w, a) {
  switch (a.action) {
    case "moveTo": {
      const st = a.station in s.stations && STATIONS[a.station];
      if (!st) return fail(s, w, a, `there's no ${label(a.station)} in this factory`);
      const to = standPoint(a.station, w);
      return walk(s, w, to.x, to.y, { a, kind: "moveTo", arrive: a.station });
    }
    case "askBoss": {
      emit(s, { type: "ask", worker: w.id, text: String(a.question || a.text || "Boss?") });
      return goToDesk(s, w, "ask");
    }
    case "wait":
      w.act = { a, kind: "wait", start: s.t, until: s.t + Math.min(20, Math.max(0.5, +a.seconds || 1)) };
      return;
    case "say":
      emit(s, { type: "say", worker: w.id, text: String(a.text || "") });
      w.act = { a, kind: "say", start: s.t, until: s.t + DUR.say };
      return;
    default:
      if (!(a.action in DUR)) return fail(s, w, a, `I don't know how to "${a.action}"`);
      // Packing checks for widgets first and starts building the box right away (see pack).
      w.act = { a, kind: a.action, start: s.t, until: s.t + (a.action === "pack" ? 0 : DUR[a.action]) };
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
    case "fix": return fix(s, w, a);
    default: return; // wait, say
  }
}

// Everyone waits at the belt for the next widget. A Patient worker also waits anywhere else for
// what they need (a box, room in a bin, three widgets to pack) instead of failing right away.
// Returns true if they're waiting another half second.
function keepWaiting(s, w, act) {
  if (w.isPlayer) return false;
  const limit = w.station === "BELT_A" ? RULES.beltWait : hasSkill(w, "patient") ? RULES.patientWait : 0;
  if ((act.waited ?? 0) >= limit) return false;
  w.act = { ...act, waited: (act.waited ?? 0) + 0.5, limit, until: s.t + 0.5 };
  return true;
}

function fumbled(s, w, it) {
  if (hasSkill(w, "careful") || s.rng() >= RULES.fumble) return false;
  emit(s, { type: "fumble", worker: w.id, item: itemName(it) });
  return true;
}

function pickUp(s, w, a, act) {
  if (!w.station) return fail(s, w, a, "I'm not at a station");
  if (w.holding) return fail(s, w, a, `my hands are full (holding a ${itemName(w.holding)})`);
  const items = s.stations[w.station];
  const color = COLORS.includes(a.color) ? a.color : null;
  let idx;
  if (color) idx = items.findIndex((i) => i.kind === "widget" && i.color === color);
  else if (w.station === "PACK") idx = items.findIndex((i) => i.kind === "box" && !i.building); // no color at Pack = a finished box
  else idx = items.findIndex((i) => !i.building);
  if (idx < 0) {
    if (keepWaiting(s, w, act)) return;
    const what = color ? `${color} widget` : w.station === "PACK" ? "finished box" : "anything";
    return fail(s, w, a, `there's no ${what} at ${label(w.station)}`);
  }
  const it = items.splice(idx, 1)[0];
  s.version++;
  if (!fumbled(s, w, it)) w.holding = it;
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
  const cap = st.startsWith("BIN_") ? RULES.binCap : st === "PACK" ? RULES.packCap : st === "PAINT" ? RULES.paintCap : RULES.beltCap;
  if (s.stations[st].length >= cap) return keepWaiting(s, w, act) || fail(s, w, a, `${label(st)} is full`);
  const it = w.holding;
  w.holding = null; s.version++;
  if (!fumbled(s, w, it)) s.stations[st].push(it);
  ok(s, w, a);
}

function paint(s, w, a) {
  if (w.station !== "PAINT") return fail(s, w, a, "I'm not at the paint machine");
  if (!w.holding || w.holding.kind !== "widget") return fail(s, w, a, "I'm not holding a widget to paint");
  if (!COLORS.includes(a.color)) return fail(s, w, a, `there's no ${a.color || "such"} paint`);
  if (s.paintJammed) return fail(s, w, a, "the paint machine is jammed");
  w.holding.color = a.color; s.version++;
  if (s.rng() < RULES.jamChance) { s.paintJammed = true; emit(s, { type: "jam", worker: w.id }); }
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
  let chosen;
  if (a.ids?.length) {
    chosen = a.ids.map((id) => items.find((i) => i.id === id && i.kind === "widget"));
    if (chosen.length !== 3 || chosen.some((i) => !i)) return fail(s, w, a, "pick 3 widgets at Pack to box up");
  } else {
    const pool = items.filter((i) => i.kind === "widget" && (!a.color || i.color === a.color));
    if (pool.length < 3) {
      const what = a.color ? `${a.color} widgets` : "widgets";
      return keepWaiting(s, w, act) || fail(s, w, a, `there are only ${pool.length} ${what} at Pack, a box needs 3`);
    }
    chosen = pool.slice(0, 3);
  }
  for (const it of chosen) items.splice(items.indexOf(it), 1);
  const box = { id: ++s.ids, kind: "box", colors: chosen.map((i) => i.color), building: { start: s.t, until: s.t + DUR.pack } };
  items.push(box); s.version++;
  w.act = { a, kind: "pack", box, start: s.t, until: s.t + DUR.pack };
}

function fix(s, w, a) {
  if (w.station === "PAINT" && s.paintJammed) {
    s.paintJammed = false; s.version++;
    emit(s, { type: "fixed", worker: w.id });
    return ok(s, w, a);
  }
  fail(s, w, a, "there's nothing to fix here");
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
function ok(s, w, a) { if (PHYSICAL.has(a?.action) && a.action !== "moveTo") w.fails = 0; }

function fail(s, w, a, why) {
  w.fails++;
  w.failLog.push({ t: s.t, action: a?.action, why });
  if (w.failLog.length > 6) w.failLog.shift();
  emit(s, { type: "fail", worker: w.id, action: a?.action, why });
  if (!w.isPlayer && w.fails >= RULES.stuckAfter && s.t - w.lastReport >= RULES.reportCooldown) {
    w.lastReport = s.t; w.fails = 0;
    emit(s, { type: "stuck", worker: w.id, failures: w.failLog.slice(-4) });
    goToDesk(s, w, "stuck");
  }
}

function goToDesk(s, w, reason) {
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

/** Give a worker a new script. It starts from the top once their current action finishes. */
export function setScript(s, w, actions) {
  w.script = actions; w.pc = 0; w.cur = -1; w.fails = 0;
  resume(s, w, { walkBack: actions[0]?.action !== "moveTo" });
}

// ---- what a worker can see, for prompts ----

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
const whereText = (w) => (w.station ? w.station : atDesk(w) ? "the boss's desk" : "walking");

export function viewFor(s, w) {
  const you = { at: whereText(w), holding: holdingText(w) };
  const floor = {};
  for (const k of Object.keys(s.stations)) floor[k] = describe(s.stations[k]);
  const view = { you, floor };
  if ("PAINT" in s.stations) view.paintMachine = s.paintJammed ? "JAMMED" : "working";
  view.order = s.order.map((l) => orderLineText(s.level, l));
  view.boss = `the boss works on the floor too: at ${whereText(s.player)}, holding ${holdingText(s.player)}`;
  const others = s.workers.filter((o) => o !== w);
  // Coworkers' instructions too, so a worker knows the rest of the line is covered and sticks to
  // their own part.
  if (others.length) view.coworkers = Object.fromEntries(others.map((o) => [o.hire.name,
    `at ${whereText(o)}, holding ${holdingText(o)}${o.orders ? `, instructions: "${o.orders}"` : ""}`]));
  return view;
}

/** Short label for one action, for showing scripts. */
export function actionLabel(a) {
  switch (a.action) {
    case "moveTo": return `→ ${label(a.station)}`;
    case "pickUp": return a.color ? `pick up ${a.color}` : "pick up";
    case "putDown": return "put down";
    case "paint": return `paint ${a.color ?? "?"}`;
    case "wait": return `wait ${a.seconds ?? 1}s`;
    case "say": return `say “${a.text ?? ""}”`;
    case "pack": return "pack a box";
    case "fix": return "fix paint";
    case "askBoss": return "ask you";
    default: return a.action;
  }
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
  if (act.limit) return { p: Math.min(1, (act.waited ?? 0) / act.limit), waiting: true };
  if (act.until > act.start) return { p: Math.min(1, (s.t - act.start) / (act.until - act.start)), waiting: false };
  return null;
}

/** 0..1 for a box being packed. */
export const boxProgress = (s, box) => (box.building ? Math.min(1, (s.t - box.building.start) / (box.building.until - box.building.start)) : 1);
