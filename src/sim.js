// The factory: plain state plus step(). No DOM and no model calls, so it runs headless too.
// Workers run looping action scripts. The model only writes scripts and lines of dialogue; every
// fumble, jam and failure happens here, in code.

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
export const COLORS = ["red", "blue", "green"];
export const ACTIONS = ["moveTo", "pickUp", "putDown", "paint", "pack", "fix", "wait", "say", "askBoss"];
const PHYSICAL = new Set(["moveTo", "pickUp", "putDown", "paint", "pack", "fix"]);

export const RULES = {
  speed: 22,            // floor units per second
  binCap: 5, packCap: 6, paintCap: 3, beltCap: 8,
  beltEvery: 3.2,       // seconds between new widgets
  shift: 240,           // seconds
  payrollEvery: 60,
  startCash: 20,
  jamChance: 0.12,      // per paint job
  scrapPay: 5,
  beltWait: 6,          // how long pickUp waits at the belt for a widget
  stuckAfter: 6,        // failed actions (walking aside) in a row before a worker comes to complain
  reportCooldown: 40,
  deskWait: 30,         // how long a worker waits at your desk before going back
};
const DUR = { pickUp: 0.5, putDown: 0.5, paint: 1.5, pack: 2, fix: 3, say: 1 };
const ORDER_PAY = { red: 30, blue: 30, green: 40 };

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const randColor = (rng) => { const r = rng(); return r < 0.4 ? "red" : r < 0.8 ? "blue" : "green"; };
const newOrder = (s) => { const color = randColor(s.rng); return { id: ++s.ids, color, pay: ORDER_PAY[color] }; };
const label = (st) => STATIONS[st]?.label ?? st;
const itemName = (it) => (it.kind === "box" ? "box" : `${it.color} widget`);

/** A new game of `level` (see levels.js) with these hires, in level order. */
export function newGame(level, hires, seed = (Math.random() * 2 ** 32) >>> 0) {
  const s = {
    t: 0, seed, rng: mulberry32(seed), ids: 0, version: 0, level,
    cash: level.payroll ? RULES.startCash : 0, shipped: 0, filled: 0, scrap: 0, wagesPaid: 0, earned: 0,
    stations: Object.fromEntries(level.stations.map((k) => [k, []])),
    paintJammed: false, orders: [], workers: [], events: [],
    nextBelt: 1, nextPayroll: RULES.payrollEvery, over: false, won: false,
  };
  if (level.orders) for (let i = 0; i < 3; i++) s.orders.push(newOrder(s));
  // A few widgets already waiting, so there's something on the floor before the clock starts.
  for (let i = 0; i < 4; i++) s.stations.BELT_A.push({ kind: "widget", color: randColor(s.rng) });
  hires.forEach((hire, i) => s.workers.push({
    id: hire.id, hire, index: i,
    x: STATIONS.DOCK.x, y: STATIONS.DOCK.y, station: "DOCK", holding: null,
    script: [], pc: 0, cur: -1, act: null, waiting: null, returnTo: null,
    fails: 0, failLog: [], lastReport: -1e9,
  }));
  return s;
}

const emit = (s, ev) => s.events.push({ t: s.t, ...ev });

export function step(s, dt) {
  if (s.over) return;
  s.t += dt;
  while (s.t >= s.nextBelt) {
    s.nextBelt += RULES.beltEvery;
    if (s.stations.BELT_A.length < RULES.beltCap) { s.stations.BELT_A.push({ kind: "widget", color: randColor(s.rng) }); s.version++; }
  }
  if (s.level.payroll && s.t >= s.nextPayroll) {
    s.nextPayroll += RULES.payrollEvery;
    const wages = s.workers.reduce((a, w) => a + w.hire.wage, 0);
    s.cash -= wages; s.wagesPaid += wages;
    emit(s, { type: "payroll", amount: wages });
  }
  for (const w of s.workers) stepWorker(s, w);
  if (!s.over && s.level.shift && s.t >= s.level.shift) { s.over = true; emit(s, { type: "end" }); }
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
  w.act = { ...extra, from: { x: w.x, y: w.y }, to: { x, y }, start: s.t, until: s.t + Math.max(0.2, dist / RULES.speed) };
}

// Robots are drawn a little below their position (standing in front of the station), so the
// desk spot sits above the desk.
const deskSpot = (w) => ({ x: DESK.x, y: DESK.y - 17 });

function start(s, w, a) {
  switch (a.action) {
    case "moveTo": {
      const st = a.station in s.stations && STATIONS[a.station];
      if (!st) return fail(s, w, a, `there's no ${label(a.station)} in this factory`);
      return walk(s, w, st.x, st.y, { a, kind: "moveTo", arrive: a.station });
    }
    case "askBoss": {
      emit(s, { type: "ask", worker: w.id, text: String(a.question || a.text || "Boss?") });
      return goToDesk(s, w, "ask");
    }
    case "wait":
      w.act = { a, kind: "wait", until: s.t + Math.min(20, Math.max(0.5, +a.seconds || 1)) };
      return;
    case "say":
      emit(s, { type: "say", worker: w.id, text: String(a.text || "") });
      w.act = { a, kind: "say", until: s.t + DUR.say };
      return;
    default:
      if (!(a.action in DUR)) return fail(s, w, a, `I don't know how to "${a.action}"`);
      w.act = { a, kind: a.action, until: s.t + DUR[a.action] };
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
    case "toDesk": w.waiting = { reason: act.reason, until: s.t + RULES.deskWait }; return;
    case "pickUp": return pickUp(s, w, a, act);
    case "putDown": return putDown(s, w, a);
    case "paint": return paint(s, w, a);
    case "pack": return pack(s, w, a);
    case "fix": return fix(s, w, a);
    default: return; // wait, say
  }
}

function fumbled(s, w, it) {
  if (s.rng() >= w.hire.fumble) return false;
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
  else if (w.station === "PACK") idx = items.findIndex((i) => i.kind === "box"); // no color at Pack = a finished box
  else idx = items.length ? 0 : -1;
  if (idx < 0) {
    // At the belt, wait a bit for the next widget to come along.
    if (w.station === "BELT_A" && (act.waited ?? 0) < RULES.beltWait) {
      w.act = { ...act, waited: (act.waited ?? 0) + 0.5, until: s.t + 0.5 };
      return;
    }
    const what = color ? `${color} widget` : w.station === "PACK" ? "finished box" : "anything";
    return fail(s, w, a, `there's no ${what} at ${label(w.station)}`);
  }
  const it = items.splice(idx, 1)[0];
  s.version++;
  if (!fumbled(s, w, it)) w.holding = it;
  ok(s, w, a);
}

function putDown(s, w, a) {
  if (!w.station) return fail(s, w, a, "I'm not at a station");
  if (!w.holding) return fail(s, w, a, "my hands are empty");
  const st = w.station;
  if (st === "DOCK") {
    if (s.level.ship !== "widgets" && w.holding.kind !== "box") return fail(s, w, a, "only boxes can ship from the dock");
    ship(s, w, w.holding);
    w.holding = null; s.version++;
    return ok(s, w, a);
  }
  const cap = st.startsWith("BIN_") ? RULES.binCap : st === "PACK" ? RULES.packCap : st === "PAINT" ? RULES.paintCap : RULES.beltCap;
  if (s.stations[st].length >= cap) return fail(s, w, a, `${label(st)} is full`);
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

function pack(s, w, a) {
  if (w.station !== "PACK") return fail(s, w, a, "I'm not at the pack station");
  const items = s.stations.PACK;
  const widgets = items.filter((i) => i.kind === "widget");
  if (widgets.length < 3) return fail(s, w, a, `there are only ${widgets.length} widgets at Pack, a box needs 3`);
  const colors = [];
  for (let j = 0; j < items.length && colors.length < 3; ) {
    if (items[j].kind === "widget") colors.push(items.splice(j, 1)[0].color); else j++;
  }
  items.push({ kind: "box", colors }); s.version++;
  ok(s, w, a);
}

function fix(s, w, a) {
  if (w.station === "PAINT" && s.paintJammed) {
    s.paintJammed = false; s.version++;
    emit(s, { type: "fixed", worker: w.id });
    return ok(s, w, a);
  }
  fail(s, w, a, "there's nothing to fix here");
}

function ship(s, w, item) {
  const L = s.level;
  let pay, matched = true;
  const colors = item.kind === "box" ? item.colors : [item.color];
  if (L.ship === "widgets") pay = L.widgetPay;
  else if (L.ship === "boxes") pay = L.boxPay;
  else {
    const same = colors.every((c) => c === colors[0]);
    const idx = same ? s.orders.findIndex((o) => o.color === colors[0]) : -1;
    matched = idx >= 0;
    if (matched) { pay = s.orders[idx].pay; s.orders[idx] = newOrder(s); s.filled++; }
    else { pay = RULES.scrapPay; s.scrap++; }
  }
  s.cash += pay; s.earned += pay; s.shipped++;
  emit(s, { type: "ship", worker: w.id, pay, matched, item: item.kind, colors });
  if (L.goal && s.shipped >= L.goal.ship) { s.over = true; s.won = true; emit(s, { type: "end" }); }
}

// Only real work resets the failure count. Walking doesn't, or a worker whose every lap fails
// would never notice they're stuck.
function ok(s, w, a) { if (PHYSICAL.has(a?.action) && a.action !== "moveTo") w.fails = 0; }

function fail(s, w, a, why) {
  w.fails++;
  w.failLog.push({ t: s.t, action: a?.action, why });
  if (w.failLog.length > 6) w.failLog.shift();
  emit(s, { type: "fail", worker: w.id, action: a?.action, why });
  if (w.fails >= RULES.stuckAfter && s.t - w.lastReport >= RULES.reportCooldown) {
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
  if (walkBack && back) walk(s, w, back.x, back.y, { kind: "moveTo", arrive: w.returnTo, a: { action: "moveTo", station: w.returnTo } });
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
  if (w.hire.sight === "near") {
    return { you, here: w.station ? describe(s.stations[w.station]) : "nothing", note: "You can only see your own station." };
  }
  const floor = {};
  for (const k of Object.keys(s.stations)) floor[k] = describe(s.stations[k]);
  const view = { you, floor };
  if ("PAINT" in s.stations) view.paintMachine = s.paintJammed ? "JAMMED" : "working";
  if (s.level.orders) view.openOrders = s.orders.map((o) => `box of 3 ${o.color} pays $${o.pay}`);
  if (s.level.goal) view.goal = `ship ${s.level.goal.ship} ${s.level.ship}; ${s.shipped} shipped so far`;
  const others = s.workers.filter((o) => o !== w);
  if (others.length) view.coworkers = Object.fromEntries(others.map((o) => [o.hire.name, `at ${whereText(o)}, holding ${holdingText(o)}`]));
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
