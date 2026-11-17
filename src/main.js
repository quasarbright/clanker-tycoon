// The game screen. Phases: menu (pick a level) → plan (hire, write instructions) → run → end.
// You're on the floor yourself: walk with WASD / arrow keys or by clicking, and use the action bar
// (or Space and number keys) at a station. Shipping pays; with money you hire robots, give them
// instructions, and they do the work too. A level ends when today's order is filled.
import {
  newGame, step, resume, setProgram, setNow, goToDesk, atDesk, addWorker, removeWorker, playerGo, playerWalkTo,
  playerSteer, playerDo, orderLineText, actProgress, boxProgress, hasAttr, STATIONS, DESK, RULES, COLORS, supplyColors, capOf,
} from "./sim.js";
import { CANDIDATES, SKILLS, ATTRIBUTES, compile, respond } from "./brains.js";
import { LEVELS } from "./levels.js";
import { backendLabel } from "./llm.js";
import { startShift, logEvent } from "./playlog.js";
import { headLooks, toolLooks, faceHTML } from "./looks.js";
import { newQuarter, shiftPayroll, payShift, closeShift, nextShift, restartShift, money } from "./quarter.js";
import { LENDER, SHOP, QUARTER_SHIFTS, newBusiness, board, hasMachine, buy, owns, quarterLevel, payouts, settle, borrow, repayOf, forecast,
  RECRUITS, recruitPrice, TRAIN_PRICE, TRAINABLE, TRAINABLE_ATTRS, robotOf, recruit, train, recruitOffers, machineOffers } from "./business.js";
import { SKILL_TIER, wageOf } from "./wages.js";

const $ = (sel, root = document) => root.querySelector(sel);
const floor = $("#floor");
let game = null;
let level = LEVELS[0];
let phase = "menu";
let paused = false;
let started = false; // the clock starts on your first move
let lastFrame = performance.now();
let lastVersion = -1, lastClock = null, lastOrder = "", lastHands = "", lastList = "", lastReady = "";
const ui = { bots: {}, stations: {}, thinking: {}, bubbleTimers: {}, oopsTimers: {}, open: null };

// The thinking budget: how many thoughts a worker can spend on their own (something unexpected, or
// think() in their program). It refills slowly while the shift runs; Smart workers hold more and
// refill faster. Talking to them is free: they always answer you.
const BUDGET = { max: 3, every: 20, smartMax: 5, smartEvery: 12 };
// The same problem coming back this soon after they thought about it sends them to your desk.
const REPEAT_WINDOW = 45;
// Progress lives in memory only for now (no localStorage while iterating). Every level is open.
let unlocked = LEVELS.length;
const best = {}; // best[levelId] = { time }: your fastest filled order; { left } for a quarter: the most money left
let quarter = null; // the quarter being played (quarter.js), when the level is one
let biz = null; // your business (business.js), once you've opened level 7; lives in memory like the rest

$("#backendNote").textContent = `Workers run on ${backendLabel}.`;

const STATION_HINTS = {
  SUPPLY: "raw widgets",
  PAINT: "repaints a widget, wears with use",
  PACK: "3 of one color → 1 box",
  DOCK: "ship from here",
  BIN_1: "storage",
  BIN_2: "storage",
};

function setPhase(p) {
  phase = p;
  document.body.dataset.phase = p;
}

// ---------- level picker ----------

function renderLevels() {
  $("#levels").innerHTML = LEVELS.map((L) => {
    const open = L.id <= unlocked;
    const b = best[L.id];
    return `<button class="ct-level" data-level="${L.id}" ${open ? "" : "disabled"}>
      <span class="ct-level-num">${L.id}</span>
      <span><span class="ct-level-name">${open ? L.name : "???"}</span><br><span class="ct-level-blurb">${open ? L.blurb : "Finish the level before."}</span></span>
      ${b ? `<span class="ct-level-done">${CHECK} ${b.left != null ? `${money(b.left)} left` : fmtTime(b.time)}</span>` : ""}
    </button>`;
  }).join("");
  document.querySelectorAll(".ct-level").forEach((b) => b.addEventListener("click", () => {
    const L = LEVELS.find((L) => L.id === +b.dataset.level);
    if (L.business) openBoard(); else openLevel(L);
  }));
}

function showMenu() {
  setPhase("menu");
  paused = false;
  renderLevels();
  $("#endScreen").classList.add("is-hidden");
  $("#pauseScreen").classList.add("is-hidden");
  $("#boardScreen").classList.add("is-hidden");
  $("#startScreen").classList.remove("is-hidden");
}

// ---------- building the floor ----------

const PLAYER = { id: "you", name: "You", color: "#f4f1e8" };

function makeBot(id, name, color, isYou, hire) {
  const bot = document.createElement("div");
  bot.className = "ct-bot" + (isYou ? " is-you" : "");
  bot.style.setProperty("--c", color);
  // A robot's skills and attributes show on them (looks.js): tools in hand, glasses, a bolt.
  const looks = hire ? headLooks(hire) + toolLooks(hire) : "";
  bot.innerHTML = `<div class="ct-bot-head"><div class="ct-bot-eyes"><i></i><i></i></div>${looks}<div class="ct-bot-held"></div></div><div class="ct-bot-bar"><i></i></div><div class="ct-bot-name">${name}</div>`;
  floor.append(bot);
  ui.bots[id] = bot;
  return bot;
}

// What the supply gives out, said plainly with the colors: "● red, never runs out".
function supplyHint() {
  const dot = (c) => `<span class="ct-dot c-${c}"></span>`;
  return `${supplyColors(level).map((c) => `${dot(c)} ${c}`).join(", ")}, never runs out`;
}

function buildFloor() {
  floor.querySelectorAll(".ct-st, .ct-desk, .ct-bot, .ct-float, .ct-truckbay").forEach((el) => el.remove());
  ui.stations = {}; ui.bots = {};
  for (const key of level.stations) {
    const st = STATIONS[key];
    const el = document.createElement("div");
    el.className = "ct-st";
    el.dataset.key = key;
    el.style.left = `${st.x}%`; el.style.top = `${(st.y / 64) * 100}%`;
    const cap = ["PACK", "PAINT"].includes(key) || key.startsWith("BIN_") ? capOf(level, key) : null;
    const hint = key === "DOCK" ? (level.ship === "widgets" ? "ship widgets here" : "ship boxes here") : key === "SUPPLY" ? supplyHint() : STATION_HINTS[key];
    if (key === "SUPPLY") el.dataset.tooltip = "Raw widgets. Take as many as you like; it never runs out.";
    el.innerHTML = `<div class="ct-st-label"><span>${st.label}</span><span class="ct-st-cap"></span></div><div class="ct-st-hint">${hint}</div><div class="ct-st-items"></div>`
      + (key === "PAINT" ? `<div class="ct-wear" data-tooltip="Wear. At 100% the machine stops until someone with Repair services it."><i></i></div>` : "");
    el.dataset.cap = cap ?? "";
    floor.append(el);
    ui.stations[key] = el;
  }
  // The main line, drawn between the tiles, through whichever stations this level has.
  const line = ["SUPPLY", "PAINT", "PACK", "DOCK"].filter((k) => level.stations.includes(k));
  const seg = (a, b) => {
    const A = STATIONS[a], B = STATIONS[b];
    const dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy);
    // leave the tiles: how far along the line before it exits a 15×10 tile
    const out = Math.min(dx ? 7.5 / Math.abs(dx / len) : 1e9, dy ? 5 / Math.abs(dy / len) : 1e9) + 1;
    const x1 = A.x + (dx / len) * out, y1 = A.y + (dy / len) * out;
    const x2 = B.x - (dx / len) * (out + 2.4), y2 = B.y - (dy / len) * (out + 2.4);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" marker-end="url(#arrowhead)"/>`;
  };
  $("#lineArrows").innerHTML = line.slice(1).map((k, i) => seg(line[i], k)).join("");
  const desk = document.createElement("div");
  desk.className = "ct-desk";
  desk.style.left = `${DESK.x}%`; desk.style.top = `${(DESK.y / 64) * 100}%`;
  desk.textContent = "Your desk";
  // Loading bay above the dock. The bay clips the truck so it drives off the edge of the floor.
  const bay = document.createElement("div");
  bay.className = "ct-truckbay";
  bay.style.top = `${((STATIONS.DOCK.y - 15) / 64) * 100}%`;
  bay.innerHTML = `<div class="ct-truck">
    <svg viewBox="0 0 48 24" aria-hidden="true">
      <rect x="1" y="3" width="30" height="14" rx="1.5" fill="#6b7280"/>
      <rect x="3" y="5" width="26" height="10" rx="1" fill="#4b5260"/>
      <path d="M32 7h8l6 6v4H32z" fill="#f2c230"/>
      <path d="M36 9h4l3.5 4H36z" fill="#1b1f24"/>
      <rect x="0" y="16" width="47" height="2.5" rx="1" fill="#2c323a"/>
      <circle cx="9" cy="19.5" r="3.2" fill="#121417" stroke="#5b6072" stroke-width="1.4"/>
      <circle cx="23" cy="19.5" r="3.2" fill="#121417" stroke="#5b6072" stroke-width="1.4"/>
      <circle cx="40" cy="19.5" r="3.2" fill="#121417" stroke="#5b6072" stroke-width="1.4"/>
    </svg>
    <div class="ct-truck-cargo"></div>
  </div>`;
  floor.append(bay);
  floor.append(desk);
  makeBot("you", PLAYER.name, PLAYER.color, true);
  for (const w of game.workers) makeBot(w.id, w.hire.name, w.hire.color, false, w.hire).addEventListener("click", (e) => { e.stopPropagation(); focusCard(w); });
  lastVersion = -1;
}

const itemHTML = (it, clickable = false) => it.kind === "box"
  ? `<span class="ct-box${it.building ? " is-building" : ""}" data-id="${it.id ?? ""}"${clickable && !it.building ? ` data-pick="box"` : ""}>${it.building ? `<span class="ct-box-fill"></span>` : ""}${it.colors.map((c) => `<i class="c-${c}"></i>`).join("")}</span>`
  : `<span class="ct-dot c-${it.color}" data-id="${it.id ?? ""}"${clickable ? ` data-pick="${it.color}"` : ""}></span>`;


// ---------- moving yourself ----------

// Click a station to walk there; click something in it to walk there and pick that up; click the
// floor to walk to that spot.
floor.addEventListener("click", (e) => {
  if (phase === "plan") { nudgeStart(); return; }
  if (phase !== "run" || paused || !game || game.over) return;
  const pick = e.target.closest("[data-pick]");
  const st = e.target.closest(".ct-st");
  const p = game.player;
  if (st) {
    const then = pick ? (pick.dataset.pick === "box" ? { action: "pickUp" } : { action: "pickUp", color: pick.dataset.pick }) : null;
    logEvent(game.t, "you", { go: st.dataset.key, then });
    playerGo(game, st.dataset.key, then);
    return;
  }
  if (e.target.closest(".ct-bot, .ct-desk, .ct-coach")) return;
  const r = floor.getBoundingClientRect(), k = r.width / 100;
  playerWalkTo(game, (e.clientX - r.left) / k, (e.clientY - r.top) / k);
});

const keysDown = new Set();
const typing = (e) => e.target.closest?.("input, textarea, select");
function steerFromKeys() {
  const has = (...ks) => ks.some((k) => keysDown.has(k));
  const vx = (has("d", "arrowright") ? 1 : 0) - (has("a", "arrowleft") ? 1 : 0);
  const vy = (has("s", "arrowdown") ? 1 : 0) - (has("w", "arrowup") ? 1 : 0);
  if (game) playerSteer(game, vx, vy);
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && phase === "run" && !game.over) { setPaused(!paused); return; }
  if (phase === "plan" && !typing(e) && /^(w|a|s|d|arrow.*| )$/.test(e.key.toLowerCase())) { e.preventDefault(); nudgeStart(); return; }
  if (phase !== "run" || paused || typing(e) || e.metaKey || e.ctrlKey) return;
  const key = e.key.toLowerCase();
  if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) {
    e.preventDefault();
    keysDown.add(key); steerFromKeys();
  } else if (key === " " || /^[1-9]$/.test(key)) {
    e.preventDefault();
    const acts = playerActions();
    const act = (key === " " ? acts[0] : acts[+key - 1]);
    if (act?.disabled) return;
    if (act) doAct(act);
  }
});
document.addEventListener("keyup", (e) => { keysDown.delete(e.key.toLowerCase()); steerFromKeys(); });
window.addEventListener("blur", () => { keysDown.clear(); steerFromKeys(); });

/** The Start button: the clock starts, you and your crew start moving, hiring closes. */
function begin() {
  if (started || phase !== "plan") return;
  if (game.workers.some((w) => w.compiling) || cantPay()) { nudgeStart(); return; }
  started = true;
  setPhase("run");
  // The crew is paid their flat rate for the shift as it starts.
  if (quarter) payShift(quarter, game);
  else game.laborCost = payroll();
  lastSnap = -1e9;
  logEvent(0, "start", { crew: crewSummary() });
  keepTyped();
  buildCrew(); // drop the Let go buttons and the Hire row
}
$("#goBtn").addEventListener("click", begin);
// In a quarter, the budget has to cover the crew's pay for the shift before it starts.
const payroll = () => shiftPayroll(game.workers.map((w) => w.hire));
const cantPay = () => !!quarter && payroll() > quarter.money;
const cantAfford = (c) => !!quarter && payroll() + c.wage > quarter.money;
// Next to Start: who's ready, who's still reading, who can't do theirs. Start waits for the readers.
function renderReady() {
  if (phase !== "plan") return;
  const reading = game.workers.some((w) => w.compiling);
  const short = cantPay();
  const sig = game.workers.map((w) => `${w.id}:${cardState(w)[0]}`).join() + reading + short;
  if (sig === lastReady) return;
  lastReady = sig;
  $("#goBtn").disabled = reading || short;
  $("#goBtn").dataset.tooltip = reading ? "Waiting for everyone to finish reading their instructions."
    : short ? `This crew costs $${payroll()} for the shift, and you have ${money(quarter.money)}. ${level.roster ? "Take someone off the shift." : "Let someone go."}` : "";
  const el = $("#crewReady");
  if (short) {
    el.innerHTML = `<span class="ct-planbar-note is-bad">This crew costs $${payroll()} for the shift, and you have ${money(quarter.money)}. ${level.roster ? "Take someone off the shift" : "Let someone go"} to start.</span>`;
    return;
  }
  if (!game.workers.length) {
    el.innerHTML = level.pool.length ? `<span class="ct-planbar-note">${level.roster ? "Schedule your crew for this shift and give instructions first. Start begins the clock." : "Hire and give instructions first. Start begins the clock; hiring closes then."}</span>` : "";
    return;
  }
  el.innerHTML = game.workers.map((w) => {
    const [st, cls] = cardState(w);
    return `<span class="ct-ready ${cls}" style="--c:${w.hire.color}"><i class="ct-face"></i><b>${w.hire.name}</b> ${st.toLowerCase()}${cls === "is-busy" ? DOTS : ""}</span>`;
  }).join("");
}
function nudgeStart() {
  const b = $("#goBtn");
  b.classList.remove("is-nudged"); void b.offsetWidth; b.classList.add("is-nudged");
}

function doAct(act) {
  logEvent(game.t, "you", { action: act.a });
  playerDo(game, act.a);
  lastVersion = -1;
}

// What you can do where you're standing, best guess first (Space does the first one).
function playerActions() {
  const p = game.player, st = p.station;
  if (!st || p.act) return []; // not at a station, walking, or busy
  const items = game.stations[st];
  const acts = [];
  if (p.holding) {
    if (st === "PAINT" && p.holding.kind === "widget") {
      for (const c of COLORS) if (c !== p.holding.color) acts.push({ label: `Paint ${c}`, a: { action: "paint", color: c } });
    }
    const canDrop = st === "DOCK" ? (level.ship === "widgets" || p.holding.kind === "box") : true;
    // At the paint machine painting comes first (Space); everywhere else putting it down does.
    const drop = { label: st === "DOCK" ? "Ship it" : "Put down", a: { action: "putDown" } };
    if (canDrop) st === "PAINT" ? acts.push(drop) : acts.unshift(drop);
  } else {
    if (st === "PACK") {
      // One button per color there are 3 of: a box is one color, wherever the widgets sit. The
      // colors the order still needs come first.
      const needed = (c) => game.order.some((l) => l.done < l.count && (l.color === c || l.color === "any"));
      const ready = COLORS.filter((c) => items.filter((i) => i.kind === "widget" && i.color === c).length >= 3);
      for (const c of [...ready.filter(needed), ...ready.filter((c) => !needed(c))]) acts.push({ label: `Pack ${c}`, a: { action: "pack", color: c } });
      if (items.some((i) => i.kind === "box" && !i.building)) acts.push({ label: "Pick up box", a: { action: "pickUp" } });
    }
    for (const c of COLORS) if (items.some((i) => i.kind === "widget" && i.color === c)) acts.push({ label: `Pick up ${c}`, a: { action: "pickUp", color: c } });
  }
  if (st === "PAINT" && game.wear.PAINT > 0) {
    const worn = game.wear.PAINT >= 100;
    const act = { label: worn ? "Service the machine" : `Service (${Math.round(game.wear.PAINT)}% worn)`, a: { action: "service" } };
    worn ? acts.unshift(act) : acts.push(act);
  }
  return acts;
}

function renderHands() {
  const p = game.player;
  const busy = p.act && p.act.kind !== "moveTo" && p.act.kind !== "walkTo";
  const acts = playerActions();
  const where = p.station ? STATIONS[p.station].label : null;
  const holding = p.holding ? (p.holding.kind === "box" ? "a box" : `a ${p.holding.color} widget`) : "nothing";
  const sig = `${p.station}|${holding}|${busy}|${acts.map((a) => a.label).join(",")}`;
  if (sig === lastHands) return;
  lastHands = sig;
  const head = `<span class="ct-hands-where"><b>You</b>${where ? ` at ${where}` : ""}, holding ${holding}</span>`;
  let body;
  if (busy) body = `<span class="ct-hands-note">Working…</span>`;
  else if (acts.length) body = acts.map((a, i) => `<button class="ct-btn ${i === 0 && !a.disabled ? "is-gold" : ""}" type="button" data-act="${i}" ${a.disabled ? "disabled" : ""}>${a.label}${a.disabled ? "" : `<kbd>${i === 0 ? "Space" : i + 1}</kbd>`}</button>`).join("");
  else if (!where) body = `<span class="ct-hands-note">Walk to a station: click it, or use WASD / arrow keys.</span>`;
  else body = `<span class="ct-hands-note">Nothing to do here right now.</span>`;
  $("#hands").innerHTML = head + `<span class="ct-hands-acts">${body}</span>`;
  $("#hands").querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", () => {
    const act = playerActions()[+b.dataset.act];
    if (act && !act.disabled) doAct(act);
  }));
}

// ---------- hiring ----------

const skillBadges = (h) => `<div class="ct-skills">${h.skills.length
  ? h.skills.map((k) => `<span class="ct-skill" data-tooltip="${SKILLS[k].label}: ${SKILLS[k].tip}">${SKILLS[k].label}</span>`).join("")
  : `<span class="ct-skill is-none" data-tooltip="No skills: carries things between stations, but can't pack, paint or repair.">No skills</span>`}${
  (h.attributes ?? []).map((k) => `<span class="ct-skill is-attr" data-tooltip="${ATTRIBUTES[k].label}: ${ATTRIBUTES[k].tip}">${ATTRIBUTES[k].label}</span>`).join("")}</div>`;

// A robot as this level has them: your business's crew can have trained skills (business.js).
const candidate = (id) => level.roster?.[id] ?? CANDIDATES.find((c) => c.id === id);
function hire(id) {
  const c = candidate(id);
  if (started) return;
  if (cantAfford(c)) return;
  keepTyped();
  const w = addWorker(game, c);
  logEvent(null, "hire", { worker: id });
  rebuildCrew();
  openChat(w.id);
}
function fire(id) {
  if (started) return;
  keepTyped();
  removeWorker(game, id);
  logEvent(null, "fire", { worker: id });
  ui.open = null;
  rebuildCrew();
}
function rebuildCrew() {
  buildFloor();
  buildCrew();
}

// ---------- the crew list and the open chat ----------
// Like a messages app: one row per worker (face, name, status, their last line, a dot for anything
// unread) and the open conversation under it. Clicking a row or a robot on the floor opens theirs.
// The people you can hire are in the same list, under the crew, until the shift starts. On a phone the sidebar shows the
// list or one chat, with a Back button.

const CHEVRON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const BACK = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const openCandidates = () => level.pool.map(candidate).filter((c) => !game.workers.some((w) => w.id === c.id));
const canHire = () => !started && level.pool.length > 0;
// In your business the robots are already your crew: you schedule them for a shift, not hire them.
const words = () => (level.roster ? { hire: "Schedule", fire: "Off shift" } : { hire: "Hire", fire: "Let go" });

// Called after hiring, firing, a new shift or Start: pick what's open and draw everything fresh.
function buildCrew() {
  const open = worker(ui.open) && ui.open !== "you" ? ui.open : null;
  ui.open = open ?? game.workers[0]?.id ?? null;
  lastList = "";
  buildChat();
  $(".ct-side").hidden = !game.workers.length && !level.pool.length;
}

/** Open a worker's conversation, saving what you'd typed in the one you leave. */
function openChat(id, { focus = true } = {}) {
  keepTyped();
  ui.open = id;
  lastList = "";
  buildChat();
  $(".ct-side").classList.add("is-chat");
  const w = worker(id);
  if (w) highlight(w);
  if (focus) $("#chat textarea")?.focus({ preventScroll: true });
}
// Hiring or letting someone go rebuilds the floor and the chat; keep what's typed.
function keepTyped() {
  const w = ui.open && worker(ui.open);
  const ta = $("#chat textarea");
  if (w && ta) w.draft = ta.value || null;
}

function renderList() {
  const rows = game.workers.map((w) => {
    const [st, cls] = cardState(w);
    const last = (w.log ?? []).filter((l) => l.who !== "sys").at(-1);
    const prev = last ? (last.who === "you" ? `You: ${last.text}` : last.text) : w.hire.blurb;
    const unread = ui.open !== w.id && (w.log ?? []).slice(w.seen ?? 0).some((l) => l.who === "them");
    return { w, st, cls, prev, bad: last?.kind === "problem", unread };
  });
  const sig = JSON.stringify([ui.open, started, canHire(), quarter && !started && quarter.money - payroll(), openCandidates().map((c) => c.id), rows.map((r) => [r.w.id, r.st, r.prev, r.unread, atDesk(r.w)])]);
  if (sig === lastList) return;
  lastList = sig;
  const list = $("#crew");
  // The crew first (only once there is one), then whoever you can still hire, each with a Hire
  // button on their row. Hiring moves them up and opens their chat. The hire part goes once the
  // shift starts.
  const cands = canHire() ? openCandidates() : [];
  list.innerHTML = (rows.length ? `<div class="ct-list-head"><span class="ct-label">Crew</span><span class="ct-wage">$${payroll()} a shift</span></div>` : "")
    + rows.map((r) => `<button type="button" class="ct-convo ${ui.open === r.w.id ? "is-open" : ""} ${atDesk(r.w) ? "is-waiting" : ""}" data-open="${r.w.id}" style="--c:${r.w.hire.color}">
        ${r.unread ? `<span class="ct-unread" aria-label="unread"></span>` : ""}
        ${faceHTML(r.w.hire)}<b>${r.w.hire.name}</b>
        <span class="ct-chip ${r.cls}">${r.cls === "is-ok" ? CHECK : r.cls === "is-bad" ? ALERT : ""}${r.st}${r.cls === "is-busy" ? DOTS : ""}</span>
        <span class="ct-convo-prev ${r.bad ? "is-bad" : ""}">${escapeHTML(r.prev)}</span>
      </button>`).join("")
    + (cands.length ? `<div class="ct-list-head ${rows.length ? "is-sep" : ""}"><span class="ct-label">${words().hire}</span>${rows.length ? "" : `<span class="ct-wage">before the shift starts</span>`}</div>`
      + cands.map((c) => {
        // In a quarter you can't hire past what the budget covers for this shift.
        const broke = cantAfford(c);
        const tip = broke ? `With ${c.name} the crew would cost $${payroll() + c.wage} for the shift, and you have ${money(quarter.money)}.` : "";
        return `<div class="ct-cand" style="--c:${c.color}">
          ${faceHTML(c)}<span><b>${c.name}</b> <span class="ct-wage">$${c.wage}/shift</span></span>
          <button class="ct-btn is-gold ct-small-btn" type="button" data-hire="${c.id}" ${broke ? "disabled" : ""} ${tip ? `data-tooltip="${tip}"` : ""}>${words().hire}</button>
          <span class="ct-cand-line">${skillBadges(c)}<span>${c.blurb}</span></span>
        </div>`;
      }).join("") : "");
  list.hidden = !list.innerHTML;
  list.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => openChat(b.dataset.open)));
  list.querySelectorAll("[data-hire]").forEach((b) => b.addEventListener("click", () => hire(b.dataset.hire)));
}

// The open panel: one worker's conversation.
function buildChat() {
  const box = $("#chat");
  const w = ui.open ? worker(ui.open) : null;
  const back = `<button class="ct-back" type="button" data-back>${BACK}Crew</button>`;
  if (w) {
    const h = w.hire;
    box.style.setProperty("--c", h.color);
    box.innerHTML = `
      <div class="ct-chat-head">
        ${back}${faceHTML(h)}
        <div class="ct-chat-who"><b>${h.name}</b><span class="ct-wage">$${h.wage}/shift</span></div>
        <span class="ct-pips"></span>
        ${started ? "" : `<button class="ct-btn ct-small-btn" type="button" data-fire>${words().fire}</button>`}
      </div>
      <p class="ct-blurb">${h.blurb}</p>
      ${skillBadges(h)}
      <div class="ct-now" hidden></div>
      <details class="ct-pin" hidden><summary>${CHEVRON}<span class="ct-label">Instructions</span><span class="ct-pin-peek"></span></summary><div class="ct-pin-text"></div></details>
      <div class="ct-log"></div>
      <form class="ct-compose">
        <textarea class="ct-textarea" rows="2"></textarea>
        <button class="ct-btn is-gold" type="submit">Send</button>
      </form>`;
    const ta = $("textarea", box);
    ta.value = w.draft ?? "";
    $("[data-fire]", box)?.addEventListener("click", () => fire(w.id));
    // One conversation. Before a worker has working instructions, what you say becomes them; after
    // that, they decide whether a message changes their instructions, is a one-off, or is just talk.
    const send = () => {
      const text = ta.value.trim();
      if (!text) { ta.focus(); return; }
      ta.value = "";
      w.draft = null;
      if (!w.ast || w.compileError) giveInstructions(w, text);
      else message(w, "message", text);
    };
    $(".ct-compose", box).addEventListener("submit", (e) => { e.preventDefault(); send(); });
    // Enter sends; Shift+Enter is a new line.
    ta.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" || e.shiftKey) return;
      e.preventDefault();
      send();
    });
    const log = $(".ct-log", box);
    log._stick = true;
    log.addEventListener("scroll", () => { log._stick = log.scrollHeight - log.scrollTop - log.clientHeight < 24; });
    new ResizeObserver(() => { if (log._stick) log.scrollTop = log.scrollHeight; }).observe(log);
    w._cardSig = null;
    w._logSig = null;
  } else {
    box.innerHTML = "";
  }
  box.hidden = !box.innerHTML;
  $("[data-back]", box)?.addEventListener("click", () => { keepTyped(); $(".ct-side").classList.remove("is-chat"); });
}

// Clicking a robot: highlight it, and open its conversation.
function highlight(w) {
  for (const [id, b] of Object.entries(ui.bots)) b.classList.toggle("is-selected", id === w.id);
}
function focusCard(w) {
  openChat(w.id);
  $(".ct-side").scrollIntoView({ block: "nearest", behavior: "smooth" });
}

// The conversation: what you said, what they said back, and what happened.
//   who: "you" | "them" | "sys"; kind: "yell" | "problem" | "desk" | a label
function logLine(w, who, text, kind = "") {
  (w.log ??= []).push({ who, text, kind });
  logEvent(clockT(), "chat", { worker: w.id, who, text, kind: kind || undefined });
  if (w.log.length > 150) { w.log.shift(); w.seen = Math.max(0, (w.seen ?? 0) - 1); }
}
function renderLog(w, box) {
  const busy = w.compiling || ui.thinking[w.id];
  const sig = `${w.log?.length ?? 0}|${busy}`;
  if (sig === w._logSig) return;
  w._logSig = sig;
  const el = $(".ct-log", box);
  const lines = (w.log ?? []).map((l) => {
    if (l.kind === "divider") return `<div class="ct-divider"><span>${escapeHTML(l.text)}</span></div>`;
    if (l.who === "sys") return `<div class="ct-msg is-sys">${escapeHTML(l.text)}</div>`;
    if (l.who === "you") {
      const tag = l.kind === "yell" ? "To everyone" : "";
      return `<div class="ct-msg is-you">${tag ? `<span class="ct-label">${tag}</span>` : ""}${escapeHTML(l.text)}</div>`;
    }
    const tag = l.kind === "desk" ? `<span class="ct-label">At your desk</span>` : "";
    const note = l.kind && !["problem", "desk"].includes(l.kind) ? ` <span class="ct-kind">(${escapeHTML(l.kind)})</span>` : "";
    return `<div class="ct-msg is-them ${l.kind === "problem" ? "is-bad" : ""} ${l.kind === "desk" ? "is-desk" : ""}">${tag}${escapeHTML(l.text)}${note}</div>`;
  });
  if (busy) lines.push(`<div class="ct-msg is-them is-typing" aria-label="${w.compiling ? "reading" : "thinking"}"><span class="ct-dots"><i></i><i></i><i></i></span></div>`);
  el.innerHTML = lines.join("");
  el.hidden = !lines.length;
  // Every new message scrolls to the bottom, and so does anything that changes the log's size while
  // you're reading the latest (the instructions row appearing above it, the window resizing).
  el._stick = true;
  el.scrollTop = el.scrollHeight;
}

// The chip on a worker's row: where they stand right now.
function cardState(w) {
  if (w.compiling) return ["Reading", "is-busy"];
  if (ui.thinking[w.id]) return ["Thinking", "is-busy"];
  if (atDesk(w)) return ["At your desk", "is-desk"];
  if (w.compileError) return ["Can't do this", "is-bad"];
  if (!w.ast) return ["Needs instructions", started ? "is-need" : "is-bad"];
  if (!started) return ["Ready", "is-ok"];
  if (w.now) return ["Doing a one-off", "is-ok"];
  if (w.gen && !w.programEnded) return ["Working", "is-ok"];
  return ["Out of things to do", "is-need"];
}
const CHECK = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ALERT = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M12 7.5v5.5M12 16.5h.01" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`;
const DOTS = `<span class="ct-dots"><i></i><i></i><i></i></span>`;
function renderChat() {
  const w = ui.open ? worker(ui.open) : null;
  const box = $("#chat");
  if (!w || box.hidden) return;
  w.seen = w.log?.length ?? 0;
  renderLog(w, box);
  const b = budgetOf(w);
  const sig = `${b.n}/${b.max}|${w.now?.summary}|${w.orders}|${!!w.ast}|${w.compileError}|${atDesk(w)}`;
  if (sig === w._cardSig) return;
  w._cardSig = sig;
  const pips = $(".ct-pips", box);
  pips.innerHTML = Array.from({ length: b.max }, (_, i) => `<i class="${i < b.n ? "is-on" : ""}"></i>`).join("");
  pips.dataset.tooltip = `Thinking budget: ${b.n} of ${b.max}. ${w.hire.name} spends one to think through something unexpected; it refills by one every ${b.every}s while the shift runs. Talking to them is free.`;
  // Their working instructions, as they wrote them down, collapsed to one line. Hidden until they
  // have some.
  $(".ct-pin", box).hidden = !w.ast || !w.orders;
  $(".ct-pin-text", box).textContent = w.orders ?? "";
  $(".ct-pin-peek", box).textContent = w.orders ?? "";
  const now = $(".ct-now", box);
  now.hidden = !w.now;
  if (w.now) now.innerHTML = `<span class="ct-label">Doing now, then back to the instructions</span> ${escapeHTML(w.now.summary)}`;
  $("textarea", box).placeholder = atDesk(w) ? `Answer ${w.hire.name}…`
    : !w.ast || w.compileError ? `Tell ${w.hire.name} what to do, in your own words.` : `Talk to ${w.hire.name}…`;
}
// A worker changed their own instructions: their row flashes.
function flashRow(w) {
  const row = $(`#crew [data-open="${w.id}"]`);
  row?.classList.remove("is-changed"); void row?.offsetWidth; row?.classList.add("is-changed");
}

function budgetOf(w) {
  if (!w.budget) {
    const smart = hasAttr(w, "smart");
    const max = smart ? BUDGET.smartMax : BUDGET.max;
    w.budget = { n: max, max, every: smart ? BUDGET.smartEvery : BUDGET.every, next: null };
  }
  return w.budget;
}
function refill(w) {
  const b = budgetOf(w);
  if (b.n >= b.max) { b.next = null; return; }
  b.next ??= game.t + b.every;
  if (game.t >= b.next) { b.n++; b.next = b.n < b.max ? game.t + b.every : null; }
}

const worker = (id) => (id === "you" ? game.player : game.workers.find((w) => w.id === id));
const escapeHTML = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// ---------- talking to the model ----------

// A worker thinking shows "…" in a bubble, plus "?" when something unexpected set it off or "!"
// when you did (a message or a yell).
function setThinking(w, delta, mark) {
  ui.thinking[w.id] = Math.max(0, (ui.thinking[w.id] || 0) + delta);
  const on = ui.thinking[w.id] > 0;
  const bot = ui.bots[w.id];
  bot?.classList.toggle("is-thinking", on);
  if (on && mark) {
    bot?.querySelector(".ct-mark")?.remove();
    const m = document.createElement("div");
    m.className = `ct-mark${mark === "?" ? " is-q" : ""}`;
    m.textContent = mark;
    bot?.append(m);
  }
  if (!on) bot?.querySelector(".ct-mark")?.remove();
  if (on) { if (!atDesk(w)) bubble(w, "…", { thinking: true, hold: true }); }
  else if (bot?.querySelector(".ct-bubble.is-thinking")) clearBubble(w);
}

const alive = (g, w) => g === game && g.workers.includes(w);

/** New instructions: the worker writes a program for them. Mid-shift, they switch over to it. */
async function giveInstructions(w, text) {
  const g = game;
  // Record the instructions now, before the model answers, so coworkers who get theirs at the same
  // time see them. (Without this Pip, told to pack and ship, saw nobody hauling and fetched widgets
  // too.)
  w.orders = text;
  w.draft = null;
  w.compileError = null;
  w.compiling = (w.compiling || 0) + 1;
  logLine(w, "you", text);
  bubble(w, "…", { thinking: true, hold: true });
  let r;
  try {
    r = await compile(g, w, text);
  } catch (e) {
    r = { error: e };
  }
  if (!alive(g, w)) return;
  w.compiling--;
  if (w.orders !== text) return; // newer instructions came in meanwhile
  clearBubble(w);
  w.now = null;
  if (r.error) {
    // The model itself couldn't be reached: that's not the worker's fault, so say what happened.
    bubble(w, "(static)");
    w.compileError = "couldn't reach the model";
    w.gen = null; w.ast = null;
    logLine(w, "sys", `Couldn't reach the model (${r.error.message}). Give the instructions again.`);
  } else if (r.problem) {
    w.compileError = r.problem;
    w.gen = null; w.ast = null;
    logLine(w, "them", r.problem, "problem");
  } else {
    logLine(w, "them", r.reply);
    w.orders = r.instructions;
    w.scope = text; // your own words: what thinking is checked against (brains.js)
    logEvent(clockT(), "instructions", { worker: w.id, text: r.instructions });
    setProgram(g, w, r.ast);
    w.lastThought = null;
  }
}

/** You said something to a worker ("message"), or yelled to the floor ("yell"). Always answered. */
function message(w, kind, text) {
  if (kind === "message") logLine(w, "you", text);
  else logLine(w, "you", text, "yell");
  // You answered: someone waiting at your desk stays for the rest of the conversation.
  if (w.waiting) w.waiting.until = Infinity;
  return wake(w, { kind, text }, "!");
}

/** Something unexpected happened, or their program called think(): spend a thought on it. */
function think(w, trigger, problem) {
  budgetOf(w).n--;
  w.lastThought = { problem, t: game.t };
  return wake(w, trigger, "?");
}

/** Call the model and act on the answer. Resolves true if they answered. */
async function wake(w, trigger, mark) {
  const g = game;
  setThinking(w, +1, mark);
  let r;
  try {
    r = await respond(g, w, trigger);
  } catch (e) {
    if (!alive(g, w)) return false;
    setThinking(w, -1);
    if (w.waiting) w.waiting.until = g.t + RULES.deskWait;
    bubble(w, "(static)");
    logLine(w, "sys", `Couldn't reach the model (${e.message}).`);
    return false;
  }
  if (!alive(g, w)) return false;
  setThinking(w, -1);
  if (r.kind === "boss") {
    if (!atDesk(w)) goToDesk(g, w, trigger.text);
    deskMessage(w, r.reply);
    return true;
  }
  logLine(w, "them", r.reply, r.kind === "once" ? `one-off: ${r.summary}` : r.kind === "change" ? "changed their instructions" : "");
  bubble(w, r.reply);
  if (r.kind === "once") {
    w.now = { summary: r.summary };
    setNow(g, w, r.nowAst);
  } else if (r.kind === "change") {
    w.orders = r.instructions;
    w.scope = r.scope;
    logEvent(clockT(), "instructions", { worker: w.id, text: r.instructions, changed: true });
    w.draft = null;
    w.compileError = null;
    w.now = null;
    setProgram(g, w, r.ast);
    flashRow(w);
  }
  clearDesk(w);
  resume(g, w);
  return true;
}

// What a worker says at your desk when they came over without thinking it through first (they're
// out of thinking budget, or the same problem came back).
function deskLine(ev) {
  if (ev.reason === "ended") return "I've done everything you told me, but the order isn't done yet. What should I do next?";
  if (ev.reason === "stuck") return `I keep running into trouble: ${ev.detail}. What should I do?`;
  if (ev.reason === "stalled") return "Nothing's moving on the floor and I don't know why. What should I do?";
  return "I got tangled up in my instructions. Can you tell me again, another way?";
}

function onUnexpected(w, ev) {
  if (atDesk(w) || ui.thinking[w.id] || w.compiling) return; // already on it
  const problem = `${ev.reason}: ${ev.detail}`;
  const repeat = w.lastThought?.problem === problem && game.t - w.lastThought.t < REPEAT_WINDOW;
  if (!repeat && budgetOf(w).n > 0) {
    const text = ev.reason === "ended" ? `${ev.detail}.` : ev.reason === "stuck" ? `you keep failing: ${ev.detail}.`
      : ev.reason === "stalled" ? `${ev.detail}, and the order isn't done. Is something you're doing (or waiting for) holding up the line?`
      : `your program broke down (${ev.detail}), so you've stopped working.`;
    think(w, { kind: "unexpected", text }, problem);
    return;
  }
  // Out of thoughts, or thinking didn't fix it: come and ask.
  goToDesk(game, w, ev.detail);
  const line = deskLine(ev);
  deskMessage(w, line);
}

$("#yellForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = $("#yellInput");
  const text = input.value.trim();
  if (!text || !game || !game.workers.length) return;
  input.value = "";
  for (const w of game.workers) message(w, "yell", text);
});

// ---------- speech bubbles, the desk, feed, floaters ----------

function bubble(w, text, { thinking = false, problem = false, hold = false } = {}) {
  const bot = ui.bots[w.id];
  if (!bot) return;
  clearBubble(w);
  const b = document.createElement("div");
  b.className = "ct-bubble" + (thinking ? " is-thinking" : "") + (problem ? " is-problem" : "");
  if (w.x > 72) b.classList.add("is-right"); else if (w.x < 26) b.classList.add("is-left");
  // Bubbles stay short so neighbors don't cover each other; the floor radio has the whole line.
  b.textContent = text.length > 90 ? `${text.slice(0, 87).replace(/\s+\S*$/, "")}…` : text;
  bot.append(b);
  if (!hold) ui.bubbleTimers[w.id] = setTimeout(() => b.remove(), Math.min(7000, 2500 + text.length * 45));
}
function clearBubble(w) {
  clearTimeout(ui.bubbleTimers[w.id]);
  ui.bots[w.id]?.querySelectorAll(".ct-bubble").forEach((b) => b.remove());
}

/** A worker at your desk: their question goes in their card, and the card lights up. */
function deskMessage(w, text) {
  logLine(w, "them", text, "desk");
  w._cardSig = null;
  bubble(w, "Boss?", { problem: true, hold: true });
}
function clearDesk(w) {
  if (w._cardSig !== undefined) w._cardSig = null;
}

function oops(w, text) {
  const bot = ui.bots[w.id];
  if (!bot) return;
  bot.querySelector(".ct-oops")?.remove();
  clearTimeout(ui.oopsTimers[w.id]);
  const el = document.createElement("div");
  el.className = "ct-oops";
  el.textContent = text;
  bot.append(el);
  ui.oopsTimers[w.id] = setTimeout(() => el.remove(), 2200);
}
// The truck at the dock: whatever ships goes in the back, it drives off, and the next one backs in.
// Two quick shipments in a row just restart the trip with the newest load.
function haul(item) {
  const truck = $(".ct-truck", floor);
  if (!truck) return;
  $(".ct-truck-cargo", truck).innerHTML = itemHTML(item);
  truck.classList.remove("is-hauling");
  void truck.offsetWidth; // restart the animation
  truck.classList.add("is-hauling");
}

function floater(text, x, y, scrap) {
  const el = document.createElement("div");
  el.className = "ct-float" + (scrap ? " is-scrap" : "");
  el.textContent = text;
  el.style.left = `${x}%`; el.style.top = `${(y / 64) * 100}%`;
  floor.append(el);
  setTimeout(() => el.remove(), 1700);
}

const lastSaid = {};

function handleEvents() {
  for (const ev of game.events.splice(0)) {
    if (ev.type !== "say") { const { type, t, ...rest } = ev; logEvent(t, "sim", { event: type, ...rest }); }
    const w = ev.worker && worker(ev.worker);
    switch (ev.type) {
      case "say":
        bubble(w, ev.text);
        if (lastSaid[w.id] !== ev.text) logLine(w, "them", ev.text);
        lastSaid[w.id] = ev.text;
        break;
      case "fail": if (w) oops(w, w.isPlayer ? ev.why.replace(/^I'm /, "you're ").replace(/\bmy\b/g, "your") : `can't: ${ev.why}`); break;
      case "unexpected": if (w && !w.isPlayer) onUnexpected(w, ev); break;
      case "thinkRequest":
        // think() in a program only goes ahead with budget left; otherwise they carry on.
        if (w && !ui.thinking[w.id] && budgetOf(w).n > 0) think(w, { kind: "think", text: ev.reason || "(no reason given)" }, `think: ${ev.reason}`);
        break;
      case "nowDone":
        if (w?.now) logLine(w, "sys", `Finished the one-off (${w.now.summary}), back to the instructions.`);
        if (w) w.now = null;
        break;
      case "worn":
        floater("worn out", STATIONS.PAINT.x, STATIONS.PAINT.y - 8, true);
        break;
      case "ship": {
        floater(ev.matched ? "+1" : "not ordered", STATIONS.DOCK.x, STATIONS.DOCK.y - 8, !ev.matched);
        haul(ev.item === "widget" ? { kind: "widget", color: ev.colors[0] } : { kind: "box", colors: ev.colors });
        break;
      }
      case "gaveUp": clearBubble(w); clearDesk(w); logLine(w, "sys", "Gave up waiting at your desk and went back to work."); break;
      case "end": endLevel(); break;
    }
  }
}

// ---------- the loop ----------

// Game time for the play log: null until the clock starts.
const clockT = () => (started ? game.t : null);
const crewSummary = () => game.workers.map((w) => ({ worker: w.id, instructions: w.ast ? w.orders : null, problem: w.compileError || undefined }));
// Every few seconds of play, where everyone is and what they're doing.
let lastSnap = -1e9;
function snapshot() {
  if (game.t - lastSnap < 5) return;
  lastSnap = game.t;
  const who = (w) => ({ id: w.id, x: Math.round(w.x), y: Math.round(w.y), at: w.station, holding: w.holding ? (w.holding.kind === "box" ? `box:${w.holding.colors.join("")}` : w.holding.color) : null,
    doing: w.act ? (w.act.limit ? `waiting(${w.act.a?.action})` : w.act.kind ?? w.act.a?.action) : null, desk: atDesk(w) || undefined });
  logEvent(game.t, "snapshot", {
    you: who(game.player), workers: game.workers.map(who),
    stations: Object.fromEntries(Object.entries(game.stations).map(([k, items]) => [k, items.map((i) => (i.kind === "box" ? `box:${i.colors.join("")}` : i.color))])),
    wear: game.wear.PAINT, order: game.order.map((l) => `${l.color} ${l.done}/${l.count}`).join(", "),
  });
}

const HOURGLASS = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h12M6 22h12M7 2v4l5 6-5 6v4M17 2v4l-5 6 5 6v4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
/** What a worker holding on at a station is waiting for, as HTML for their tag. */
function waitingFor(w) {
  const a = w.act?.a ?? {};
  const dot = (c) => `<span class="ct-dot c-${c}"></span>`;
  if (a.action === "putDown") return "room";
  if (a.action === "pack") return a.color ? `3 ${dot(a.color)}` : "3 widgets";
  if (a.action === "pickUp") {
    if (a.box || (!a.color && w.station === "PACK")) return "a box";
    return a.color ? dot(a.color) : "a widget";
  }
  return "something";
}

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function render() {
  const k = floor.clientWidth / 100;
  floor.style.setProperty("--u", `${k}px`);
  const everyone = [game.player, ...game.workers];
  // Robots standing in the same spot spread out side by side.
  const spots = new Map();
  for (const w of everyone) {
    const key = `${Math.round(w.x / 3)},${Math.round(w.y / 3)}`;
    if (!spots.has(key)) spots.set(key, []);
    spots.get(key).push(w);
  }
  const spreads = new Map();
  for (const group of spots.values()) group.forEach((w, i) => spreads.set(w, (i - (group.length - 1) / 2) * 6.5));
  for (const w of everyone) {
    const bot = ui.bots[w.id];
    if (!bot) continue;
    const x = Math.min(96, Math.max(4, w.x + (spreads.get(w) ?? 0)));
    bot.style.transform = `translate(${x * k}px, ${w.y * k}px)`;
    // Moving since last frame turns a Fast robot's wheels, backwards when heading left.
    const dx = w.x - (bot._x ?? w.x), dy = w.y - (bot._y ?? w.y);
    const moving = Math.hypot(dx, dy) > 1e-3;
    if (moving !== bot._moving) { bot.classList.toggle("is-moving", moving); bot._moving = moving; }
    if (moving && Math.abs(dx) > 1e-3) bot.classList.toggle("is-backwards", dx < 0);
    bot._x = w.x; bot._y = w.y;
    const held = w.holding ? itemHTML(w.holding) : "";
    if (bot._held !== held) { bot.querySelector(".ct-bot-held").innerHTML = held; bot._held = held; }
    // Anything that takes time shows how far along it is (waiting fills toward giving up).
    // Work that takes time fills a bar. Waiting on something at a station says so in words instead.
    const pr = actProgress(game, w);
    const working = pr && !pr.waiting;
    const bar = bot.querySelector(".ct-bot-bar");
    bar.classList.toggle("is-on", !!working);
    if (working) bar.firstElementChild.style.transform = `scaleX(${pr.p})`;
    const wait = pr?.waiting ? waitingFor(w) : "";
    if (bot._wait !== wait) {
      bot._wait = wait;
      bot.querySelector(".ct-wait")?.remove();
      if (wait) bot.insertAdjacentHTML("beforeend", `<div class="ct-wait">${HOURGLASS}<span>waiting for</span>${wait}</div>`);
    }
    if (w.isPlayer) continue;
    if (!atDesk(w) && w._wasAtDesk) clearBubble(w);
    w._wasAtDesk = atDesk(w);
    if (started && !game.over) refill(w);
  }
  if (game.version !== lastVersion) {
    lastVersion = game.version;
    for (const [key, el] of Object.entries(ui.stations)) {
      const items = game.stations[key];
      el.querySelector(".ct-st-items").innerHTML = items.map((it) => itemHTML(it, true)).join("");
      el.querySelector(".ct-st-cap").textContent = el.dataset.cap ? `${items.length}/${el.dataset.cap}` : "";
      if (key === "PAINT") {
        el.querySelector(".ct-wear i").style.transform = `scaleX(${game.wear.PAINT / 100})`;
        el.classList.toggle("is-worn", game.wear.PAINT >= 100);
      }
    }
  }
  for (const [key, el] of Object.entries(ui.stations)) el.classList.toggle("is-here", game.player.station === key && !game.player.act);
  // Boxes being packed fill in.
  for (const fill of floor.querySelectorAll(".ct-box.is-building .ct-box-fill")) {
    const id = +fill.parentElement.dataset.id;
    const box = game.stations.PACK?.find((i) => i.id === id);
    if (box) fill.style.transform = `scaleX(${boxProgress(game, box)})`;
  }
  // In a quarter: the money left (the crew's pay comes out at Start). Otherwise what the crew costs.
  const labor = quarter ? money(quarter.money) : `$${started ? game.laborCost : payroll()}`;
  if ($("#labor").textContent !== labor) $("#labor").textContent = labor;
  // With a shift length the clock counts down what's left of it.
  const left = level.shift ? Math.max(0, level.shift - game.t) : null;
  const clock = left == null ? fmtTime(game.t) : `${fmtTime(Math.ceil(left))} left`;
  if (clock !== lastClock) {
    lastClock = clock;
    $("#clock").textContent = clock;
    $("#clock").classList.toggle("is-low", left != null && left <= 10);
  }
  renderReady();
  const order = game.order.map((l) => `${l.color}${l.done}`).join();
  if (order !== lastOrder) {
    lastOrder = order;
    $("#orders").innerHTML = game.order.map((l, i) => {
      const icon = level.ship === "boxes"
        ? `<span class="ct-ticket-dots">${(l.color === "any" ? `<span class="ct-dot c-any"></span>` : `<span class="ct-dot c-${l.color}"></span>`).repeat(3)}</span>`
        : `<span class="ct-dot ${l.color === "any" ? "c-any" : `c-${l.color}`}"></span>`;
      // A contract's ticket also says what it pays; once it's all shipped, that money is coming.
      const c = level.contracts?.[i], full = l.done >= l.count;
      if (c) return `<span class="ct-ticket ${full ? "is-shipped" : ""}" data-tooltip="${c.count} ${c.color} boxes. Pays $${c.pay} at the end of the quarter if they've all shipped.">${icon}<span class="ct-ticket-pay">${l.done}/${l.count}</span><span class="ct-ticket-money">${full ? CHECK : ""}$${c.pay}</span></span>`;
      return `<span class="ct-ticket ${full ? "is-done" : ""}" title="${orderLineText(level, l)}">${icon}<span class="ct-ticket-pay">${l.done}/${l.count}</span></span>`;
    }).join("");
  }
  renderHands();
  renderList();
  renderChat();
  renderCoach();
}

// One line on the floor telling you what to do next.
function renderCoach() {
  let text = "";
  const deskVisitor = game.workers.find((w) => atDesk(w));
  const idle = game.workers.find((w) => !w.ast && !w.compiling && !w.compileError);
  const cantDo = game.workers.find((w) => w.compileError);
  const worn = level.worn && game.wear.PAINT >= 100;
  // A quarter's later shifts say where you stand instead of the level's opening line.
  const start = quarter && quarter.shift > 1
    ? `Shift ${quarter.shift} of ${level.quarter.shifts}. What's shipped counts toward the ${level.contracts ? "contracts" : "quota"}, and your crew is still here. Hire, let people go or change instructions, then press <b>Start</b>.`
    : level.start;
  if (phase === "plan") text = idle ? `${start} ${idle.hire.name} still needs instructions: tell them what to do in their chat.`
    : cantDo ? `${cantDo.hire.name} can't do their instructions; their chat says why. Change them, or let ${cantDo.hire.name} go.`
    : start + (level.pool.length ? "" : " Press <b>Start</b> when you're ready.");
  else if (worn) text = level.worn;
  else if (deskVisitor) text = `${deskVisitor.hire.name} came to your desk. Answer in their chat.`;
  else if (idle) text = `${idle.hire.name} is waiting for instructions. Tell them what to do in their chat.`;
  else if (cantDo) text = `${cantDo.hire.name} can't do their instructions; their chat says why.`;
  const el = $("#coach");
  if (el._text !== text) { el.innerHTML = text; el._text = text; }
}

function frame(now) {
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  if (game && phase === "run" && started && !paused && !game.over) { step(game, dt); handleEvents(); snapshot(); }
  if (game) render();
  requestAnimationFrame(frame);
}

// ---------- screens ----------

/**
 * Open a level at the start of its shift. With `again`, the same crew comes back with the same
 * instructions (and the routines they already worked out), ready to edit before you press Start.
 * In a quarter, `shift` says which shift that is: "restart" plays this one again (undoing what it
 * spent and shipped, if it ran), "next" moves on to the next one, and "new" starts the quarter over.
 */
function openLevel(L, { again = false, shift = "restart", keepCrew = false } = {}) {
  // A new quarter of contracts keeps the crew from the last one, with their instructions.
  const crew = (again && game?.level === L) || (keepCrew && game?.level.contracts) ? game.workers : [];
  const ran = started || phase === "end";
  if (!L.quarter) quarter = null;
  else if (!again || shift === "new") quarter = newQuarter(L);
  else if (shift === "next") nextShift(quarter);
  else if (ran) restartShift(quarter);
  level = L;
  game = newGame(L, [], undefined, { done: quarter?.done });
  for (const old of crew) {
    // Skills trained between quarters come with them.
    const w = addWorker(game, L.roster?.[old.id] ?? old.hire);
    Object.assign(w, { orders: old.orders, scope: old.scope, compileError: old.compileError, memory: old.memory, draft: null });
    if (old.ast && !old.compileError) setProgram(game, w, old.ast);
    // The conversation carries on from shift to shift, with a divider where the new one starts.
    w.log = old.log ?? [];
    w.seen = old.seen;
    if (ran) logLine(w, "sys", quarter && shift !== "new" ? `Shift ${quarter.shift}${shift === "restart" ? ", again" : ""}` : "New shift", "divider");
    else if (keepCrew) logLine(w, "sys", "New quarter", "divider");
  }
  startShift(L, { again, crew: crewSummary(), quarter: quarter ? { shift: quarter.shift, money: Math.floor(quarter.money), done: quarter.done } : undefined,
    contracts: L.contracts ? { picked: L.contracts.map(({ id, color, count, pay }) => ({ id, color, count, pay })), machine: biz?.owned ?? null } : undefined });
  started = false;
  lastVersion = -1; lastClock = null; lastOrder = ""; lastHands = ""; lastList = ""; lastReady = "";
  ui.thinking = {};
  keysDown.clear();
  ui.open = null;
  $(".ct-side").classList.remove("is-chat");
  buildFloor();
  buildCrew();
  // In a quarter, which shift this is, big enough to see at a glance, with a pip per shift.
  $("#levelName").innerHTML = quarter ? `<span class="ct-shift-of">Shift ${quarter.shift} of ${L.quarter.shifts}<span class="ct-shift-pips">${
    Array.from({ length: L.quarter.shifts }, (_, k) => `<i class="${k + 1 < quarter.shift ? "is-past" : k + 1 === quarter.shift ? "is-now" : ""}"></i>`).join("")}</span></span>` : `Level ${L.id}: ${L.name}`;
  $("#goalLabel").textContent = L.contracts ? "Contracts" : quarter ? "This quarter" : "Today's order";
  $("#laborLabel").textContent = L.contracts ? "money" : quarter ? "budget" : "labor";
  $("#startScreen").classList.add("is-hidden");
  $("#boardScreen").classList.add("is-hidden");
  $("#endScreen").classList.add("is-hidden");
  $("#pauseScreen").classList.add("is-hidden");
  paused = false;
  setPhase("plan");
}

function endLevel() {
  setPhase("end");
  if (quarter) return endQuarterShift();
  const t = game.t;
  const won = game.won;
  if (won && (!best[level.id] || t < best[level.id].time)) best[level.id] = { time: t };
  const total = game.order.reduce((a, l) => a + l.count, 0), done = game.order.reduce((a, l) => a + l.done, 0);
  logEvent(t, "end", { won, shipped: `${done}/${total}`, labor: Math.round(game.laborCost), crew: crewSummary() });
  $("#endTitle").textContent = won ? "Order filled" : "Shift over";
  $("#endNote").textContent = won ? "" : "The order didn't ship before the shift ended. Try again keeps your crew and their instructions.";
  $("#endStats").innerHTML = [[won ? "Time" : "Shipped", won ? fmtTime(t) : `${done}/${total}`], ["Labor cost", `$${Math.round(game.laborCost)}`], ["Crew", game.workers.length]]
    .map(([l, v]) => `<div><div class="ct-label">${l}</div><div class="ct-stat-value">${v}</div></div>`).join("");
  const next = won && LEVELS.find((L) => L.id === level.id + 1);
  const btns = [];
  if (next) btns.push(`<button class="ct-btn is-gold" data-go="next">Next: ${next.name}</button>`);
  btns.push(`<button class="ct-btn ${next ? "" : "is-gold"}" data-go="again">Try again</button>`);
  btns.push(`<button class="ct-btn" data-go="menu">Levels</button>`);
  $("#endBtns").innerHTML = btns.join("");
  $("#endBtns").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.go === "next") openLevel(next);
    else if (b.dataset.go === "again") openLevel(level, { again: true });
    else showMenu();
  }));
  $("#endScreen").classList.remove("is-hidden");
}

// A quarter's shift ended: the quota's met, there's another shift to go, or the quarter's over.
function endQuarterShift() {
  const Q = level.quarter, n = quarter.shift;
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const shippedBefore = sum(quarter.done);
  closeShift(quarter, game);
  const total = sum(level.order.map((l) => l.count)), done = sum(quarter.done);
  const won = game.won, last = n >= Q.shifts;
  if (level.contracts) return endBusinessShift(won, last, done, total, shippedBefore);
  const left = money(quarter.money), spent = money(Q.budget - quarter.money);
  logEvent(game.t, "end", { won, quarter: { shift: n, of: Q.shifts }, shipped: `${done}/${total}`, labor: Math.round(game.laborCost), money: Math.floor(quarter.money), crew: crewSummary() });
  if (won && (!best[level.id] || quarter.money > best[level.id].left)) best[level.id] = { left: quarter.money };
  // The quarter ends as soon as the quota ships; what's left of the budget is saved.
  const stats = won ? [["Shifts", `${n} of ${Q.shifts}`], ["Spent", spent], ["Saved", left]]
    : !last ? [["Shipped", `${done - shippedBefore}`], ["Crew pay", `$${Math.round(game.laborCost)}`], ["Budget left", left]]
    : [["Shipped", `${done}/${total}`], ["Spent", spent], ["Left", left]];
  $("#endTitle").textContent = won ? "Quota met" : !last ? `Shift ${n} done` : "Quota missed";
  const shiftsLeft = Q.shifts - n;
  $("#endNote").textContent = won ? `You shipped the quarter's quota in ${n === 1 ? "one shift" : `${n} shifts`} and saved ${left} of your $${Q.budget} budget.`
    : !last ? `${shiftsLeft} ${shiftsLeft === 1 ? "shift" : "shifts"} left. Your crew and their instructions stay; hire or let people go before the next one.`
    : "The quarter ended short of the quota.";
  // What's still to ship, as the same tickets the floor shows.
  const togo = won ? "" : `<div class="ct-end-togo"><span class="ct-label">Still to ship</span>${level.order.map((l, i) => {
    const n = l.count - quarter.done[i];
    return n > 0 ? `<span class="ct-ticket"><span class="ct-ticket-dots">${`<span class="ct-dot c-${l.color}"></span>`.repeat(3)}</span><span class="ct-ticket-pay">${n}</span></span>` : "";
  }).join("")}</div>`;
  $("#endStats").innerHTML = togo + stats.map(([l, v]) => `<div><div class="ct-label">${l}</div><div class="ct-stat-value">${v}</div></div>`).join("");
  const btns = won || last
    ? [["new", "Try again", true], ...(won ? [] : [["restart", "Replay this shift"]])]
    : [["next", "Next shift", true], ["restart", "Replay this shift"]];
  $("#endBtns").innerHTML = btns.map(([go, text, gold]) => `<button class="ct-btn ${gold ? "is-gold" : ""}" data-go="${go}">${text}</button>`).join("")
    + `<button class="ct-btn" data-go="menu">Levels</button>`;
  $("#endBtns").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.go === "menu") showMenu();
    else openLevel(level, { again: true, shift: b.dataset.go });
  }));
  $("#endScreen").classList.remove("is-hidden");
}

// ---------- your business: the contract board ----------

const ticketHTML = (color, count) => `<span class="ct-ticket"><span class="ct-ticket-dots">${`<span class="ct-dot c-${color}"></span>`.repeat(3)}</span><span class="ct-ticket-pay">${count}</span></span>`;
const BUSINESS = LEVELS.find((L) => L.business);
let picked = []; // contracts picked on the board for the coming quarter

/** Between quarters: pick this quarter's contracts, buy equipment. */
function openBoard() {
  if (!biz) biz = newBusiness();
  picked = [];
  setPhase("menu");
  paused = false;
  for (const id of ["startScreen", "endScreen", "pauseScreen"]) $(`#${id}`).classList.add("is-hidden");
  renderBoard();
  $("#boardScreen").classList.remove("is-hidden");
}

// Under a contract's pay: what you keep of it, if part goes to the lender.
const keepLine = (c) => (biz.debt ? `<span class="ct-offer-keep">you keep $${c.pay - repayOf(biz.debt, c.pay)}</span>` : "");

function renderBoard() {
  const pct = `${Math.round(LENDER.share * 100)}%`;
  const short = (n) => (biz.money < n ? `disabled data-tooltip="You have ${money(biz.money)}."` : "");
  $("#bizMoney").textContent = money(biz.money);
  $("#boardTitle").textContent = `Quarter ${biz.quarters + 1}`;
  $("#boardShifts").textContent = `${QUARTER_SHIFTS} shifts. Every contract is due at the end of the last one.`;
  // The lender: borrow now, and ${pct} of every contract you finish goes to him until it's paid back.
  $("#investorLine").innerHTML = biz.debt
    ? `"You owe me <b class="is-debt">$${biz.debt}</b>. I take ${pct} of every contract you finish until it's paid. Numbers must go up."`
    : `"Short on cash? Borrow from me, and I take ${pct} of every contract you finish until you've paid it back, with interest."`;
  $("#loans").innerHTML = LENDER.loans.map((l, i) => `<button class="ct-btn" data-loan="${i}" data-tooltip="You'd owe $${l.owe}: $${l.amount} plus $${l.owe - l.amount} interest.">Borrow $${l.amount}</button>`).join("");
  $("#loans").querySelectorAll("[data-loan]").forEach((b) => b.addEventListener("click", () => { if (borrow(biz, +b.dataset.loan)) renderBoard(); }));

  // ----- contracts: one card with a small and a large size (take one or neither), and a side one
  const offers = board(biz);
  picked = picked.filter((p) => offers.some((c) => c.id === p.id));
  const isOn = (c) => picked.some((p) => p.id === c.id);
  const [small, large, side] = offers;
  const blocked = (c) => (!hasMachine(biz, c.needs) ? `Needs a paint machine, and you don't own one yet.` : "");
  const size = (c) => `<button type="button" class="ct-size ${isOn(c) ? "is-on" : ""}" data-contract="${c.id}" ${blocked(c) ? "disabled" : ""}>
      <span class="ct-size-name">${isOn(c) ? CHECK : ""}${c.size === "small" ? "Small" : "Large"}</span>
      <span class="ct-size-count">${c.count} boxes</span>
      <span class="ct-offer-pay">$${c.pay}</span>${keepLine(c)}
    </button>`;
  const painted = (c) => (c.needs ? `<span class="ct-offer-keep">Painted: the supply only gives out red.</span>` : "");
  $("#offers").innerHTML = `<div class="ct-offer ct-pair ${isOn(small) || isOn(large) ? "is-picked" : ""}">
      <div class="ct-offer-head">${ticketHTML(small.color, "")}<b>${cap(small.color)} boxes</b><span class="ct-offer-keep">Pick one size</span></div>
      <div class="ct-sizes">${size(small)}${size(large)}</div>
      <div class="ct-offer-note is-bad">${blocked(small)}</div>${painted(small)}
    </div>
    <div class="ct-offer ct-side ${isOn(side) ? "is-picked" : ""}">
      <div class="ct-offer-head">${ticketHTML(side.color, "")}<b>${cap(side.color)} boxes</b><span class="ct-offer-keep">Side contract</span></div>
      <div class="ct-sizes"><button type="button" class="ct-size ${isOn(side) ? "is-on" : ""}" data-contract="${side.id}" ${blocked(side) ? "disabled" : ""}>
        <span class="ct-size-name">${isOn(side) ? CHECK : ""}${isOn(side) ? "Taking it" : "Take it"}</span>
        <span class="ct-size-count">${side.count} boxes</span>
        <span class="ct-offer-pay">$${side.pay}</span>${keepLine(side)}
      </button></div>
      <div class="ct-offer-note is-bad">${blocked(side)}</div>${painted(side)}
    </div>`;
  $("#offers").querySelectorAll("[data-contract]").forEach((b) => b.addEventListener("click", () => {
    const c = offers.find((o) => o.id === b.dataset.contract);
    // Taking one size drops the other: a quarter's contracts never share a color.
    picked = isOn(c) ? picked.filter((p) => p.id !== c.id) : [...picked.filter((p) => p.color !== c.color), c];
    renderBoard();
  }));
  const total = picked.reduce((a, c) => a + c.count, 0);
  $("#boardGo").disabled = !picked.length;
  $("#boardGo").textContent = "Start the quarter";
  $("#boardNote").textContent = !picked.length ? "Pick at least one contract."
    : `${total} boxes in ${QUARTER_SHIFTS} shifts. A contract only pays if all its boxes ship.`;
  // What happens this quarter if every picked contract ships, with the whole crew on every shift.
  const crewWage = biz.crew.reduce((a, id) => a + robotOf(biz, CANDIDATES.find((c) => c.id === id)).wage, 0);
  const f = forecast(biz, picked, crewWage * QUARTER_SHIFTS);
  const row = (label, v, cls = "", tip = "") => `<span class="${cls}" ${tip ? `data-tooltip="${tip}"` : ""}>${label}</span><b class="${cls}">${v}</b>`;
  $("#forecast").innerHTML = row("Your money now", money(f.start))
    + row("Contracts pay, if they all ship", `+$${f.pay}`, "is-in")
    + (biz.debt ? row("To the lender", `−$${f.repay}`, "is-out", `${pct} of each contract until your $${biz.debt} debt is paid. After this quarter you'd owe $${f.debtAfter}.`) : "")
    + row(`Wages, whole crew, ${QUARTER_SHIFTS} shifts`, `−$${f.wages}`, "is-out", `$${crewWage} a shift if you schedule everyone. Fewer robots on a shift cost less.`)
    + row("At the end of the quarter", money(f.end), "is-total");

  // ----- recruit: three robots this visit
  $("#recruits").innerHTML = recruitOffers(biz).map((id) => {
    const r = robotOf(biz, CANDIDATES.find((c) => c.id === id)), done = biz.crew.includes(id), price = recruitPrice(biz, id);
    return `<div class="ct-biz-bot ${done ? "is-done" : ""}" style="--c:${r.color}">
      ${faceHTML(r)}<div><div><b>${r.name}</b> <span class="ct-wage">$${r.wage}/shift</span></div>${skillBadges(r)}<div class="ct-biz-blurb">${r.blurb}</div></div>
      <div class="ct-biz-act">${done ? `<span class="ct-owned">${CHECK} Recruited</span>` : `<button class="ct-btn is-gold" data-recruit="${id}" ${short(price)}>Recruit $${price}</button>`}</div>
    </div>`;
  }).join("") || `<p class="ct-offer-note">Everyone's already on your crew.</p>`;

  // ----- training: your crew
  $("#crewNote").textContent = `$${TRAIN_PRICE} a skill or trait. Each adds $5 a shift to their pay; a third skill, or a third trait, adds $${SKILL_TIER.extra} more.`;
  $("#bizCrew").innerHTML = biz.crew.map((id) => {
    const r = robotOf(biz, CANDIDATES.find((c) => c.id === id));
    const btn = (k, isSkill) => {
      const after = isSkill ? wageOf([...r.skills, k], r.attributes) : wageOf(r.skills, [...r.attributes, k]);
      const tip = biz.money < TRAIN_PRICE ? short(TRAIN_PRICE) : `data-tooltip="${(isSkill ? SKILLS : ATTRIBUTES)[k].tip} ${r.name} would then cost $${after} a shift."`;
      return `<button class="ct-train-btn ${isSkill ? "" : "is-trait"}" data-train="${id}:${k}" ${tip}>+ ${(isSkill ? SKILLS : ATTRIBUTES)[k].label}</button>`;
    };
    return `<div class="ct-biz-bot ct-trainee" style="--c:${r.color}">
      ${faceHTML(r)}<div><div><b>${r.name}</b> <span class="ct-wage">$${r.wage}/shift</span></div>${skillBadges(r)}</div>
      <div class="ct-train-row">${TRAINABLE.filter((k) => !r.skills.includes(k)).map((k) => btn(k, true)).join("")}${
        TRAINABLE_ATTRS.filter((k) => !r.attributes.includes(k)).map((k) => btn(k, false)).join("")}</div>
    </div>`;
  }).join("");

  // ----- machines: three this visit, and what's on your floor
  const mine = SHOP.filter((m) => owns(biz, m.id));
  $("#machines").innerHTML = machineOffers(biz).map((m) => {
    const done = owns(biz, m.id) && biz.boughtNow.includes(m.id);
    const replaces = m.kind === "paint" && biz.owned && !owns(biz, m.id) ? " Replaces your paint machine." : "";
    return `<div class="ct-biz-bot ct-machine ${done ? "is-done" : ""}">
      <div><div><b>${m.name}</b></div><div class="ct-biz-blurb">${m.blurb}${replaces}</div></div>
      <div class="ct-biz-act">${done ? `<span class="ct-owned">${CHECK} Bought</span>` : `<button class="ct-btn is-gold" data-buy="${m.id}" ${short(m.price)}>Buy $${m.price}</button>`}</div>
    </div>`;
  }).join("") + `<p class="ct-offer-note">On your floor: ${mine.length ? mine.map((m) => m.name.toLowerCase()).join(", ") : "nothing yet"}.</p>`;

  $("#boardScreen").querySelectorAll("[data-recruit]").forEach((b) => b.addEventListener("click", () => { if (recruit(biz, b.dataset.recruit)) renderBoard(); }));
  $("#boardScreen").querySelectorAll("[data-buy]").forEach((b) => b.addEventListener("click", () => { if (buy(biz, b.dataset.buy)) renderBoard(); }));
  $("#boardScreen").querySelectorAll("[data-train]").forEach((b) => b.addEventListener("click", () => {
    const [id, k] = b.dataset.train.split(":");
    if (train(biz, CANDIDATES.find((c) => c.id === id), k)) renderBoard();
  }));
}
const cap = (s) => s[0].toUpperCase() + s.slice(1);
$("#boardMenuBtn").addEventListener("click", () => showMenu());
$("#boardGo").addEventListener("click", () => {
  if (!picked.length) return;
  // In the order the board lists them, so the tickets on the floor match the board.
  const offers = board(biz).filter((c) => picked.some((p) => p.id === c.id));
  openLevel(quarterLevel(BUSINESS, biz, offers, CANDIDATES), { keepCrew: true });
});

// A shift of the quarter ended: everything shipped, there's another shift, or the quarter's over.
// At the end each contract that shipped in full pays, and part of it goes to the lender if you owe him.
function endBusinessShift(won, last, done, total, shippedBefore) {
  const cs = level.contracts, n = quarter.shift;
  logEvent(game.t, "end", { won, contracts: cs.map((c) => c.id), quarter: { shift: n, of: QUARTER_SHIFTS }, shipped: `${done}/${total}`, labor: Math.round(game.laborCost), money: Math.floor(quarter.money), crew: crewSummary() });
  const over = won || last;
  const pays = payouts(cs, quarter.done, biz.debt);
  const paid = pays.reduce((a, p) => a + p.pay, 0), cut = pays.reduce((a, p) => a + p.cut, 0);
  const shipped = pays.filter((p) => p.won).length;
  $("#endTitle").textContent = won ? "Every contract shipped" : over ? "Quarter over" : `Shift ${n} done`;
  const shiftsLeft = QUARTER_SHIFTS - n;
  $("#endNote").textContent = won ? `The clients paid $${paid}${cut ? `, and $${cut} of it went to the lender` : ""}.`
    : over ? (shipped ? `${shipped} of ${cs.length} contracts shipped in full and paid. The others pay nothing.` : "No contract shipped in full, so nobody pays.")
    : `${shiftsLeft} ${shiftsLeft === 1 ? "shift" : "shifts"} left in the quarter. Your crew and their instructions stay.`;
  // Each contract: its ticket, what shipped of it, and (at the end) what it paid.
  const rows = `<div class="ct-end-contracts">${pays.map((p, i) => `<div class="ct-end-contract ${p.won ? "is-done" : over ? "is-missed" : ""}">
      ${ticketHTML(p.c.color, p.c.count)}<span>${Math.min(quarter.done[i], p.c.count)} of ${p.c.count} shipped</span>
      <b>${p.won ? `$${p.c.pay}` : over ? "$0" : `pays $${p.c.pay}`}</b></div>`).join("")}</div>`;
  const stats = over ? [["Paid", `$${paid}`], ...(biz.debt ? [["To the lender", `$${cut}`]] : [["Crew pay", `$${Math.round(game.laborCost)}`]]), ["Your money", money(quarter.money + paid - cut)]]
    : [["Shipped", `${done - shippedBefore}`], ["Crew pay", `$${Math.round(game.laborCost)}`], ["Your money", money(quarter.money)]];
  $("#endStats").innerHTML = rows + stats.map(([l, v]) => `<div><div class="ct-label">${l}</div><div class="ct-stat-value">${v}</div></div>`).join("");
  const btns = won ? [["board", "Next quarter", true]]
    : last ? [["board", "Next quarter", true], ["restart", "Replay this shift"]]
    : [["next", "Next shift", true], ["restart", "Replay this shift"]];
  $("#endBtns").innerHTML = btns.map(([go, text, gold]) => `<button class="ct-btn ${gold ? "is-gold" : ""}" data-go="${go}">${text}</button>`).join("");
  $("#endBtns").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.go === "board") { settle(biz, cs, quarter.done, quarter.money); openBoard(); }
    else openLevel(level, { again: true, shift: b.dataset.go });
  }));
  $("#endScreen").classList.remove("is-hidden");
}

function setPaused(p) {
  paused = p;
  keysDown.clear();
  if (game) playerSteer(game, 0, 0);
  $("#pauseScreen").classList.toggle("is-hidden", !p);
}

$("#pauseBtn").addEventListener("click", () => { if ((phase === "run" && !game.over) || phase === "plan") setPaused(!paused); });
$("#resumeBtn").addEventListener("click", () => setPaused(false));
// The pause card sits on the floor; clicks on it aren't moves on the floor.
$("#pauseScreen").addEventListener("click", (e) => e.stopPropagation());
$("#restartBtn").addEventListener("click", () => openLevel(level, { again: true }));
$("#menuBtn").addEventListener("click", () => showMenu());

renderLevels();
requestAnimationFrame(frame);

// While iterating locally: if the game's files change after this tab loaded, say so, so an old tab
// doesn't quietly keep running old code. (No server on a web build: the fetch fails and nothing shows.)
(async () => {
  const version = () => fetch("/api/version", { cache: "no-store" }).then((r) => r.json()).then((j) => j.version);
  let loaded;
  try { loaded = await version(); } catch { return; }
  setInterval(async () => {
    try {
      if ((await version()) !== loaded && !$("#staleBanner")) {
        const b = document.createElement("div");
        b.id = "staleBanner";
        b.className = "ct-stale";
        b.innerHTML = `The game was updated since this tab opened. <button class="ct-btn is-gold" type="button">Reload</button>`;
        b.querySelector("button").addEventListener("click", () => location.reload());
        document.body.append(b);
      }
    } catch { /* server restarting */ }
  }, 4000);
})();

// Test hook: drive the game from Playwright or the console.
window.ct = {
  get game() { return game; }, get phase() { return phase; }, get started() { return started; }, get quarter() { return quarter; },
  openLevel: (n) => openLevel(LEVELS[n - 1]), unlockAll: () => { unlocked = LEVELS.length; renderLevels(); },
  step: (dt) => { if (started) step(game, dt); handleEvents(); render(); },
  give: (id, text) => giveInstructions(worker(id), text), say: (id, text) => message(worker(id), "message", text),
  setPaused, begin, hire, playerActions, openBoard, get biz() { return biz; },
};
