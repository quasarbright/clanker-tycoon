// The game screen. Phases: menu (pick a level) → plan (hire, write instructions) → run → end.
// You're on the floor yourself: walk with WASD / arrow keys or by clicking, and use the action bar
// (or Space and number keys) at a station. Shipping pays; with money you hire robots, give them
// instructions, and they do the work too. A level ends when today's order is filled.
import {
  newGame, step, resume, setProgram, setNow, goToDesk, atDesk, addWorker, removeWorker, playerGo, playerWalkTo,
  playerSteer, playerDo, orderLineText, actProgress, boxProgress, hasAttr, STATIONS, DESK, RULES, COLORS, supplyColors, capOf, kindOf, CRATE,
} from "./sim.js";
import { CANDIDATES, SKILLS, ATTRIBUTES, compile, respond, ownerName } from "./brains.js";
import { LEVELS } from "./levels.js";
import { backendLabel, useFakeLlm, BACKEND } from "./llm.js";
import { getKey, setKey, signIn, finishSignIn } from "./openrouter-auth.js";
import { WORDS, applyWords, aloneLine } from "./words.js";
import { startShift, logEvent, downloadLog } from "./playlog.js";
import { SLOTS, ANCHORS, inSlot, place, store, keepInStorage, placeLeftovers } from "./floor.js";
import { headLooks, toolLooks, faceHTML, ownerHeadSVG, ownerHatSVG, ownerPhoto } from "./looks.js";
import { newQuarter, shiftPayroll, payShift, closeShift, nextShift, restartShift, money, signed as signedText, shippedOf, shiftCost } from "./quarter.js";
import { LENDER, SHOP, QUARTER_SHIFTS, newBusiness, board, hasMachine, missingFor, trainableNow, canAdd, floorLevel, buy, owns, quarterLevel, payouts, settle, borrow, repayOf, forecast, debtOf, shareOf,
  RECRUITS, recruitPrice, TRAIN_PRICE, TRAINABLE, TRAINABLE_ATTRS, robotOf, recruit, train, recruitOffers, machineOffers, crewCost,
  randomBusinessName, outOfBusiness, START_MONEY, cheapestWage } from "./business.js";
import { headline } from "./headlines.js";
import { REP, wholePips, offerShare, pipsText, deltaText, gainOf, afterQuarter, ruined, onTheEdge } from "./reputation.js";
import { SKILL_TIER, wageOf } from "./wages.js";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
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

/**
 * After a shift with more to go: plain counts, "15 of 20 shipped, 2 shifts left." No projection:
 * a pace assumes the work goes evenly, which often isn't true (Mike, decision 72).
 */
// Signed money on screen: the sign in the UI font, whose minus reads as a minus next to the mono
// digits (JetBrains Mono draws U+2212 about as short as a hyphen).
/** Greyed-out things you can't afford say how much you're short, the same everywhere (Recruit, Buy,
 *  Train, Schedule). */
const shortNoteFor = (cost, have) => (have < cost ? `<span class="ct-short">$${cost - Math.floor(have)} short</span>` : "");
// Money colors (Mike, decision 82): green for money you have or earn, red for costs and losses.
const GAIN = "ct-gain", LOSS = "ct-loss";
const signed = (n) => { const t = signedText(n); return `<span class="ct-sign">${t[0]}</span>${t.slice(1)}`; };
function countsLine(counts, done, shiftsLeft) {
  const { total, now } = shippedOf(counts, done);
  return `${now} of ${total} shipped, ${shiftsLeft} ${shiftsLeft === 1 ? "shift" : "shifts"} left.`;
}

/**
 * A robot as a card: face, name, pay per shift, skills and traits, and (optionally) their blurb,
 * an action on the right (Schedule, Recruit …) and something underneath (training buttons). The
 * same everywhere a robot is listed: the crew list, Recruit, Training. `cls` sets the container's
 * look for where it sits.
 */
function robotCard(r, { cls = "", blurb = true, action = "", extra = "" } = {}) {
  return `<div class="ct-robot ${cls}" style="--c:${r.color}">
    ${faceHTML(r)}<div class="ct-robot-info"><div><b>${r.name}</b> <span class="ct-wage">$${r.wage}/shift</span></div>${skillBadges(r)}${blurb ? `<div class="ct-robot-blurb">${r.blurb}</div>` : ""}</div>
    ${action ? `<div class="ct-robot-act">${action}</div>` : ""}${extra}
  </div>`;
}

/**
 * An order ticket: three dots of the color (one for loose widgets) and a count, the same
 * everywhere (the floor, the end cards, the board). Options: `cls`, `tip` (a tooltip), `pay` (a
 * contract's pay, shown after the count; `paid` checks it), `loose` (widgets, not boxes).
 */
function ticketHTML(color, count, { cls = "", tip = "", pay = null, paid = false, loose = false } = {}) {
  const dot = `<span class="ct-dot ${color === "any" ? "c-any" : `c-${color}`}"></span>`;
  // A crate (decision 85) is a red, a blue and a green box together.
  const icon = color === "crate" ? `<span class="ct-ticket-dots is-crate">${CRATE.map((c) => `<span class="ct-dot c-${c}"></span>`).join("")}</span>`
    : loose ? dot : `<span class="ct-ticket-dots">${dot.repeat(3)}</span>`;
  const money = pay == null ? "" : `<span class="ct-ticket-money">${paid ? CHECK : ""}$${pay}</span>`;
  return `<span class="ct-ticket ${cls}" ${tip ? `data-tooltip="${tip}"` : ""}>${icon}<span class="ct-ticket-pay">${count}</span>${money}</span>`;
}

// ---------- the web build: an OpenRouter key (decision #65) ----------
// On the web the robots think with Claude Haiku through OpenRouter, on the player's own key: sign
// in with OpenRouter, or paste a key. The key is stored where all of Mike's sites look for it.
let accessNote = "";
function renderAccess() {
  const el = $("#access");
  el.hidden = BACKEND !== "openrouter";
  if (el.hidden) return;
  const key = getKey();
  if (key) {
    el.innerHTML = `<div class="ct-access-row"><span class="ct-key-ok">${CHECK} Connected to OpenRouter</span>
      <span class="ct-or">key ending ${escapeHTML(key.slice(-4))}</span>
      <button class="ct-btn" type="button" data-forget style="margin-left:auto">Remove key</button></div>
      ${accessNote ? `<p>${accessNote}</p>` : ""}`;
    el.querySelector("[data-forget]").addEventListener("click", () => { accessNote = ""; setKey(null); });
    return;
  }
  el.innerHTML = `<p>The robots think with Claude Haiku through OpenRouter, on your own OpenRouter account. A level costs about a cent.</p>
    ${accessNote ? `<p class="is-bad">${accessNote}</p>` : ""}
    <div class="ct-access-row"><button class="ct-btn is-gold" type="button" data-signin>Sign in with OpenRouter</button>
      <span class="ct-or">or paste a key</span></div>
    <openrouter-key></openrouter-key>`;
  el.querySelector("[data-signin]").addEventListener("click", () => signIn());
}
// Started at the bottom of this file, once everything it uses is defined.
function initAccess() {
  document.addEventListener("openrouter-key-change", () => renderAccess());
  renderAccess();
  finishSignIn().then((r) => {
    if (!r) return;
    accessNote = r.status === "signed-in" ? "You're signed in. The key is saved in this browser only." : `Sign-in didn't work: ${escapeHTML(r.error)}`;
    renderAccess();
  });
}

const STATION_HINTS = {
  SUPPLY: "raw widgets",
  PAINT: "repaints a widget, wears with use",
  PACK: "3 of one color → 1 box",
  DOCK: "ship from here",
  BIN_1: "storage",
  BIN_2: "storage",
  PAINT_2: "repaints a widget, wears with use",
  ASSEMBLE: "red + blue + green box → 1 crate",
  ASSEMBLE_2: "red + blue + green box → 1 crate",
};
/** Machines with a wear meter. */
const wears = (key) => ["PAINT", "ASSEMBLE"].includes(kindOf(key));

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
  logEvent(null, "menu");
  setPhase("menu");
  paused = false;
  renderLevels();
  $("#endScreen").classList.add("is-hidden");
  $("#pauseScreen").classList.add("is-hidden");
  $("#boardScreen").classList.add("is-hidden");
  $("#licenseScreen").classList.add("is-hidden");
  $("#gameoverScreen").classList.add("is-hidden");
  document.body.classList.remove("is-quiet");
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
  const hat = isYou ? ownerHatSVG() : "";
  bot.innerHTML = `<div class="ct-bot-head">${hat}<div class="ct-bot-eyes"><i></i><i></i></div>${looks}<div class="ct-bot-held"></div></div><div class="ct-bot-bar"><i></i></div><div class="ct-bot-name">${name}</div>`;
  floor.append(bot);
  ui.bots[id] = bot;
  return bot;
}

// What the supply gives out, said plainly with the colors: "● red, never runs out".
function supplyHint() {
  const dot = (c) => `<span class="ct-dot c-${c}"></span>`;
  return `${supplyColors(level).map((c) => `${dot(c)} ${c}`).join(", ")}, never runs out`;
}

/** A station's tile at floor position `at` (the floor and the editor draw the same tile). */
function stationEl(key, at) {
  const st = STATIONS[key];
  const el = document.createElement("div");
  el.className = "ct-st";
  el.dataset.key = key;
  el.style.left = `${at.x}%`; el.style.top = `${(at.y / 64) * 100}%`;
  const cap = ["PACK", "PAINT", "BIN", "ASSEMBLE"].includes(kindOf(key)) ? capOf(level, key) : null;
  const hint = key === "DOCK" ? (level.ship === "widgets" ? "ship widgets here" : "ship boxes here") : key === "SUPPLY" ? supplyHint() : STATION_HINTS[key];
  if (key === "SUPPLY") el.dataset.tooltip = "Raw widgets. Take as many as you like; it never runs out.";
  el.innerHTML = `<div class="ct-st-label"><span>${st.label}</span><span class="ct-st-cap"></span></div><div class="ct-st-hint">${hint}</div><div class="ct-st-items"></div>`
    + (wears(key) ? `<div class="ct-wear" data-tooltip="Wear. At 100% the machine stops until someone with Repair services it."><i></i></div>` : "");
  el.dataset.cap = cap ?? "";
  return el;
}

function buildFloor() {
  floor.querySelectorAll(".ct-st, .ct-desk, .ct-bot, .ct-float, .ct-truckbay").forEach((el) => el.remove());
  ui.stations = {}; ui.bots = {};
  for (const key of level.stations) {
    const el = stationEl(key, STATIONS[key]);
    floor.append(el);
    ui.stations[key] = el;
  }
  // The main line, drawn between the tiles, through whichever stations this level has.
  // Through the Assembler only when the quarter has crates to make.
  const crates = level.order.some((l) => l.color === "crate");
  const line = ["SUPPLY", "PAINT", "PACK", ...(crates ? ["ASSEMBLE"] : []), "DOCK"].filter((k) => level.stations.includes(k));
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

const itemHTML = (it, clickable = false) => it.kind === "crate"
  ? `<span class="ct-crate${it.building ? " is-building" : ""}" data-id="${it.id ?? ""}"${clickable && !it.building ? ` data-pick="crate"` : ""}>${it.building ? `<span class="ct-box-fill"></span>` : ""}${CRATE.map((c) => `<i class="c-${c}"></i>`).join("")}</span>`
  : it.kind === "box"
  ? `<span class="ct-box${it.building ? " is-building" : ""}" data-id="${it.id ?? ""}"${clickable && !it.building ? ` data-pick="box"` : ""}>${it.building ? `<span class="ct-box-fill"></span>` : ""}${it.colors.map((c) => `<i class="c-${c}"></i>`).join("")}</span>`
  : `<span class="ct-dot c-${it.color}" data-id="${it.id ?? ""}"${clickable ? ` data-pick="${it.color}"` : ""}></span>`;


// ---------- moving yourself ----------

// Click a station to walk there; click something in it to walk there and pick that up; click the
// floor to walk to that spot.
floor.addEventListener("click", (e) => {
  if (editing) return;
  if (phase === "plan") { nudgeStart(); return; }
  if (phase !== "run" || paused || !game || game.over) return;
  const pick = e.target.closest("[data-pick]");
  const st = e.target.closest(".ct-st");
  const p = game.player;
  if (st) {
    const then = pick ? (pick.dataset.pick === "box" ? { action: "pickUp", box: true } : pick.dataset.pick === "crate" ? { action: "pickUp", crate: true } : { action: "pickUp", color: pick.dataset.pick }) : null;
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
function begin({ force = false } = {}) {
  if (started || phase !== "plan") return;
  if (!force && startBlocker()) { nudgeStart(); return; }
  if (editing) closeEditor();
  // Something you bought and didn't place or set aside goes into the nearest free slot (Mark's spec).
  if (onBusinessFloor() && biz.floor.fresh?.length) {
    const placed = placeLeftovers(biz.floor);
    if (placed.length) { logEvent(0, "floor_auto", { placed, at: { ...biz.floor.at } }); relayout(); }
  }
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
$("#goBtn").addEventListener("click", () => begin());
// In a quarter, the budget has to cover the crew's pay for the shift before it starts.
const payroll = () => shiftPayroll(game.workers.map((w) => w.hire));
const cantPay = () => !!quarter && payroll() > quarter.money;
const cantAfford = (c) => !!quarter && payroll() + c.wage > quarter.money;
/** Why Start can't be pressed yet, in words (null when it can). One rule: on a crew level someone
 *  has to be scheduled, everyone scheduled has to be Ready, and the budget has to cover them. */
const names = (ws) => ws.map((w) => w.hire.name).join(" and ");
function startBlocker() {
  if (cantPay()) return `This crew costs $${payroll()} for the shift, and you have ${money(quarter.money)}. ${WORDS.takeSomeoneOff} to start.`;
  if (!game.workers.length) {
    // Too broke for even your cheapest robot: you can still work the shift alone (Mark: being broke
    // flows into missed contracts, and reputation, instead of a separate ending).
    const broke = cheapestOnRoster()?.wage > quarter?.money;
    return level.pool.length && !broke ? `${WORDS.schedule} your crew for this shift and give them instructions first.` : null;
  }
  const notReady = game.workers.filter((w) => cardState(w)[0] !== "Ready");
  if (!notReady.length) return null;
  const busy = notReady.filter((w) => cardState(w)[1] === "is-busy");
  if (busy.length) return `Waiting for ${names(busy)} to finish ${busy.length === 1 ? cardState(busy[0])[0].toLowerCase() : "reading and thinking"}.`;
  return `Not everyone is ready: ${notReady.map((w) => `${w.hire.name} ${cardState(w)[0].toLowerCase()}`).join(", ")}.`;
}
// Next to Start: who's ready, who's still reading, who can't do theirs. Start waits for the readers.
/** In a quarter, the cheapest robot you could put on the shift (null outside one). */
const cheapestOnRoster = () => (quarter && level.roster ? Object.values(level.roster).reduce((a, r) => (!a || r.wage < a.wage ? r : a), null) : null);
function renderReady() {
  if (phase !== "plan") return;
  const short = cantPay();
  const blocker = startBlocker();
  const sig = game.workers.map((w) => `${w.id}:${cardState(w)[0]}`).join() + blocker + (quarter ? `${payroll()}/${quarter.money}` : "");
  if (sig === lastReady) return;
  lastReady = sig;
  renderFloorEdit(); // Edit floor waits while anyone is still reading
  renderShiftCost(short);
  $("#goBtn").disabled = !!blocker;
  $("#goBtn").dataset.tooltip = blocker || "";
  const el = $("#crewReady");
  if (short) {
    el.innerHTML = `<span class="ct-planbar-note is-bad">${blocker}</span>`;
    return;
  }
  if (!game.workers.length) {
    const cheapest = cheapestOnRoster();
    el.innerHTML = cheapest && cheapest.wage > quarter.money ? `<span class="ct-planbar-note is-bad">${aloneLine(cheapest.name, cheapest.wage, quarter.money)}</span>`
      : level.pool.length ? `<span class="ct-planbar-note">${WORDS.schedule} your crew for this shift and give them instructions first. Start begins the clock; the schedule is set then.</span>` : "";
    return;
  }
  el.innerHTML = game.workers.map((w) => {
    const [st, cls] = cardState(w);
    return `<span class="ct-ready ${cls}" style="--c:${w.hire.color}"><i class="ct-face"></i><b>${w.hire.name}</b> ${cls === "is-busy" ? busyHTML(st.toLowerCase()) : st.toLowerCase()}</span>`;
  }).join("");
}
/** By Start, in a quarter: this shift's crew pay, the budget after it, and whether shifts like it
 *  cover the rest of the quarter. Updates as robots go on or off the shift (Pam's plan, decision 71). */
function renderShiftCost(short) {
  const el = $("#shiftCost");
  const p = payroll();
  el.hidden = !quarter || short || !p;
  if (el.hidden) return;
  const c = shiftCost(quarter.money, p, quarter.shift, level.quarter.shifts);
  el.innerHTML = `This shift <b class="ct-loss">$${c.pay}</b> <i>·</i> funds after <b class="${c.covers ? "" : "is-plain"}">${money(c.after)}</b> <i>·</i> `
    + (c.covers ? (quarter.shift >= level.quarter.shifts ? "the last shift" : "covers the rest of the quarter") : `<span class="is-bad">short for shift ${c.shortAt}</span>`);
}
function nudgeStart() {
  logEvent(null, "start_blocked", { why: startBlocker() });
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
  const kind = kindOf(st);
  if (p.holding) {
    if (kind === "PAINT" && p.holding.kind === "widget") {
      for (const c of COLORS) if (c !== p.holding.color) acts.push({ label: `Paint ${c}`, a: { action: "paint", color: c } });
    }
    const canDrop = st === "DOCK" ? (level.ship === "widgets" || p.holding.kind !== "widget") : kind === "ASSEMBLE" ? p.holding.kind === "box" : true;
    // At the paint machine painting comes first (Space); everywhere else putting it down does.
    const drop = { label: st === "DOCK" ? "Ship it" : "Put down", a: { action: "putDown" } };
    if (canDrop) kind === "PAINT" ? acts.push(drop) : acts.unshift(drop);
  } else {
    if (kind === "ASSEMBLE") {
      const has = (c) => items.some((i) => i.kind === "box" && !i.building && i.colors.every((x) => x === c));
      if (CRATE.every(has)) acts.push({ label: "Assemble a crate", a: { action: "assemble" } });
      if (items.some((i) => i.kind === "crate" && !i.building)) acts.push({ label: "Pick up crate", a: { action: "pickUp", crate: true } });
      for (const c of CRATE) if (has(c)) acts.push({ label: `Pick up ${c} box`, a: { action: "pickUp", box: true, color: c } });
    }
    if (kind === "BIN") for (const c of COLORS) if (items.some((i) => i.kind === "box" && !i.building && i.colors.every((x) => x === c))) acts.push({ label: `Pick up ${c} box`, a: { action: "pickUp", box: true, color: c } });
    if (kind === "PACK") {
      // One button per color there are 3 of: a box is one color, wherever the widgets sit. The
      // colors the order still needs come first.
      const needed = (c) => game.order.some((l) => l.done < l.count && (l.color === c || l.color === "any"));
      const ready = COLORS.filter((c) => items.filter((i) => i.kind === "widget" && i.color === c).length >= 3);
      for (const c of [...ready.filter(needed), ...ready.filter((c) => !needed(c))]) acts.push({ label: `Pack ${c}`, a: { action: "pack", color: c } });
      if (items.some((i) => i.kind === "box" && !i.building)) acts.push({ label: "Pick up box", a: { action: "pickUp", box: true } });
    }
    for (const c of COLORS) if (items.some((i) => i.kind === "widget" && i.color === c)) acts.push({ label: `Pick up ${c}`, a: { action: "pickUp", color: c } });
  }
  if (wears(st) && game.wear[st] > 0) {
    const worn = game.wear[st] >= 100;
    const act = { label: worn ? "Service the machine" : `Service (${Math.round(game.wear[st])}% worn)`, a: { action: "service" } };
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

// "No skills" only when there's nothing else to show: a robot with a trait shows the trait.
const skillBadges = (h) => `<div class="ct-skills">${h.skills.length
  ? h.skills.map((k) => `<span class="ct-skill" data-tooltip="${SKILLS[k].label}: ${SKILLS[k].tip}">${SKILLS[k].label}</span>`).join("")
  : h.attributes?.length ? "" : `<span class="ct-skill is-none" data-tooltip="No skills: carries things between stations, but can't pack, paint or repair.">No skills</span>`}${
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
// You put robots on a shift and take them off it, never hire or fire (words.js, decision #58).
const words = () => ({ hire: WORDS.schedule, fire: WORDS.offShift });

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
  if (ui.open !== id) logEvent(clockT(), "chat_open", { worker: id });
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
        <span class="ct-chip ${r.cls}">${r.cls === "is-ok" ? CHECK : r.cls === "is-bad" ? ALERT : ""}${r.cls === "is-busy" ? busyHTML(r.st) : r.st}</span>
        <span class="ct-convo-prev ${r.bad ? "is-bad" : ""}">${escapeHTML(r.prev)}</span>
      </button>`).join("")
    + (cands.length ? `<div class="ct-list-head ${rows.length ? "is-sep" : ""}"><span class="ct-label">${words().hire}</span>${rows.length ? "" : `<span class="ct-wage">before the shift starts</span>`}</div>`
      + cands.map((c) => {
        // In a quarter you can't hire past what the budget covers for this shift.
        const broke = cantAfford(c);
        const tip = broke ? `With ${c.name} the crew would cost $${payroll() + c.wage} for the shift, and you have ${money(quarter.money)}.` : "";
        return robotCard(c, { cls: "ct-cand", action: `<button class="ct-btn ct-small-btn" type="button" data-hire="${c.id}" ${broke ? "disabled" : ""} ${tip ? `data-tooltip="${tip}"` : ""}>${words().hire}</button>${broke ? shortNoteFor(payroll() + c.wage, quarter.money) : ""}` });
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
//   who: "you" | "them" | "sys"; kind: "yell" | "problem" | "desk" | "divider"
//   effect (a reply to you): what it did to their instructions, shown as one marker (EFFECTS)
function logLine(w, who, text, kind = "", effect) {
  // A divider with nothing said after it is replaced, so empty shifts don't stack up dividers.
  if (kind === "divider" && w.log?.at(-1)?.kind === "divider") w.log.pop();
  (w.log ??= []).push({ who, text, kind, effect });
  logEvent(clockT(), "chat", { worker: w.id, who, text, kind: kind || undefined, effect: effect?.type });
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
    return `<div class="ct-msg is-them ${l.kind === "problem" ? "is-bad" : ""} ${l.kind === "desk" ? "is-desk" : ""}">${tag}${escapeHTML(l.text)}${effectHTML(l.effect)}</div>`;
  });
  if (busy) lines.push(`<div class="ct-msg is-sys is-busyline">${busyHTML(`${w.hire.name} is ${busyWord(w)}`)}</div>`);
  el.innerHTML = lines.join("");
  el.hidden = !lines.length;
  // Every new message scrolls to the bottom, and so does anything that changes the log's size while
  // you're reading the latest (the instructions row appearing above it, the window resizing).
  el._stick = true;
  el.scrollTop = el.scrollHeight;
}

// The chip on a worker's row: where they stand right now.
function cardState(w) {
  if (phase === "end") return ["Shift over", "is-off"];
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
// Reading or thinking looks the same everywhere (crew chip, status bar, chat, floor): the word,
// pulsing. Never dots or a speech bubble, which read as someone talking.
const busyWord = (w) => (w.compiling ? "reading" : "thinking");
const busyHTML = (text) => `<span class="ct-busy">${escapeHTML(text)}</span>`;
// What a reply did to the robot's instructions: every reply to you ends in exactly one of these.
const EFFECTS = {
  new: { label: () => "New instructions", icon: "check" },
  change: { label: () => "Changed instructions", icon: "check" },
  once: { label: (e) => `One-off: ${e.summary}`, icon: "once" },
  none: { label: () => "No change to instructions", icon: "none" },
};
const EFFECT_ICONS = {
  check: CHECK,
  once: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  none: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`,
};
function effectHTML(e) {
  if (!e) return "";
  const k = EFFECTS[e.type];
  return `<span class="ct-effect is-${e.type}">${EFFECT_ICONS[k.icon]}${escapeHTML(k.label(e))}</span>`;
}
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
  pips.innerHTML = `<span>thoughts</span>` + Array.from({ length: b.max }, (_, i) => `<i class="${i < b.n ? "is-on" : ""}"></i>`).join("");
  pips.dataset.tooltip = `Thoughts: ${b.n} of ${b.max}. ${w.hire.name} spends one to think through something unexpected; it refills by one every ${b.every}s while the shift runs. Talking to them is free.`;
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
  showBusy(w);
}
/** Over a robot on the floor while it reads or thinks: the word, pulsing, no speech bubble. */
function showBusy(w) {
  const bot = ui.bots[w.id];
  if (!bot) return;
  const on = !!(w.compiling || ui.thinking[w.id]);
  let tag = bot.querySelector(".ct-bot-busy");
  if (!on) { tag?.remove(); return; }
  if (!tag) { tag = document.createElement("div"); tag.className = "ct-bot-busy ct-busy"; bot.append(tag); }
  tag.textContent = busyWord(w);
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
  clearBubble(w);
  showBusy(w);
  let r;
  try {
    r = await compile(g, w, text);
  } catch (e) {
    r = { error: e };
  }
  if (!alive(g, w)) return;
  w.compiling--;
  showBusy(w);
  if (w.orders !== text) return; // newer instructions came in meanwhile
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
    logLine(w, "them", r.reply, "", { type: "new" });
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
  logLine(w, "them", r.reply, "", r.kind === "once" ? { type: "once", summary: r.summary } : { type: r.kind === "change" ? "change" : "none" });
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
  if (ev.reason === "full") return `${ev.detail}. What should I do?`;
  return "I got tangled up in my instructions. Can you tell me again, another way?";
}

function onUnexpected(w, ev) {
  if (atDesk(w) || ui.thinking[w.id] || w.compiling) return; // already on it
  const problem = `${ev.reason}: ${ev.detail}`;
  const repeat = w.lastThought?.problem === problem && game.t - w.lastThought.t < REPEAT_WINDOW;
  if (!repeat && budgetOf(w).n > 0) {
    const text = ev.reason === "ended" ? `${ev.detail}.` : ev.reason === "stuck" ? `you keep failing: ${ev.detail}.`
      : ev.reason === "stalled" ? `${ev.detail}, and the order isn't done. Is something you're doing (or waiting for) holding up the line?`
      : ev.reason === "full" ? `${ev.detail}. Nobody has made room. Is your routine waiting on something only you could do (like packing what's there first)?`
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
  bubble(w, ownerName(level) ? `${ownerName(level)}?` : "Got a minute?", { problem: true, hold: true });
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
        floater("worn out", STATIONS[ev.station ?? "PAINT"].x, STATIONS[ev.station ?? "PAINT"].y - 8, true);
        break;
      case "ship": {
        floater(ev.matched ? "+1" : "not ordered", STATIONS.DOCK.x, STATIONS.DOCK.y - 8, !ev.matched);
        haul(ev.item === "widget" ? { kind: "widget", color: ev.colors[0] } : ev.item === "crate" ? { kind: "crate" } : { kind: "box", colors: ev.colors });
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
    wear: { ...game.wear }, order: game.order.map((l) => `${l.color} ${l.done}/${l.count}`).join(", "),
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
      if (wears(key)) {
        el.querySelector(".ct-wear i").style.transform = `scaleX(${game.wear[key] / 100})`;
        el.classList.toggle("is-worn", game.wear[key] >= 100);
      }
    }
  }
  for (const [key, el] of Object.entries(ui.stations)) el.classList.toggle("is-here", game.player.station === key && !game.player.act);
  // Boxes being packed fill in.
  for (const fill of floor.querySelectorAll(".ct-box.is-building .ct-box-fill, .ct-crate.is-building .ct-box-fill")) {
    const id = +fill.parentElement.dataset.id;
    const box = Object.values(game.stations).flat().find((i) => i.id === id);
    if (box) fill.style.transform = `scaleX(${boxProgress(game, box)})`;
  }
  // In a quarter: the money left (the crew's pay comes out at Start). Otherwise what the crew costs.
  // At the end of a business quarter it's the budget after the clients pay, the same as the card.
  const labor = quarter ? money(quarter.money + (quarter.payout ?? 0)) : `$${started ? game.laborCost : payroll()}`;
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
      // A contract's ticket also says what it pays; once it's all shipped, that money is coming.
      const c = level.contracts?.[i], full = l.done >= l.count;
      return c ? ticketHTML(l.color, `${l.done}/${l.count}`, { cls: full ? "is-shipped" : "", tip: `${c.count} ${c.color} boxes. Pays $${c.pay} at the end of the quarter if they've all shipped.`, pay: c.pay, paid: full })
        : ticketHTML(l.color, `${l.done}/${l.count}`, { cls: full ? "is-done" : "", tip: orderLineText(level, l), loose: level.ship !== "boxes" });
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
    ? `Shift ${quarter.shift} of ${level.quarter.shifts}. What's shipped counts toward the ${level.contracts ? "contracts" : "quota"}, and your crew is still here. Change who's on the shift or their instructions, then press <b>Start</b>.`
    : level.start;
  // Before the shift, who still needs instructions is said by their crew chip and by Start's status
  // bar, not again here (decision 71).
  if (phase === "plan") text = cantDo ? `${cantDo.hire.name} can't do their instructions; their chat says why. Change them, or let ${cantDo.hire.name} go.`
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
function openLevel(L, { again = false, shift = "restart", keepCrew = false, relaid = false } = {}) {
  // A new quarter of contracts keeps the crew from the last one, with their instructions; so does
  // the same shift on a floor you just rearranged (`relaid`).
  const crew = (again && game?.level === L) || (keepCrew && game?.level.contracts) || relaid ? game.workers : [];
  const ran = started || phase === "end";
  if (!L.quarter) quarter = null;
  else if (!again || shift === "new") quarter = newQuarter(L);
  else if (shift === "next") nextShift(quarter);
  else if (ran) restartShift(quarter);
  if (quarter) quarter.payout = 0; // set only on the quarter card, until you leave it
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
    contracts: L.contracts ? { picked: L.contracts.map(({ id, color, count, pay }) => ({ id, color, count, pay })), machines: biz?.machines.map((x) => x.key) ?? [], floor: biz?.floor.at } : undefined });
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
  $("#laborLabel").textContent = quarter ? WORDS.funds.toLowerCase() : WORDS.labor;
  $(".ct-cash").classList.toggle("is-funds", !!quarter); // in a quarter, your funds are big (Mike)
  $("#startScreen").classList.add("is-hidden");
  $("#boardScreen").classList.add("is-hidden");
  $("#endScreen").classList.add("is-hidden");
  $("#pauseScreen").classList.add("is-hidden");
  paused = false;
  setPhase("plan");
  renderFloorEdit();
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
  setEndStats("", [[won ? "Finished in" : "Shipped", won ? fmtTime(t) : `${done}/${total}`], ["Labor cost", `$${Math.round(game.laborCost)}`, LOSS], ["Crew", game.workers.length]]);
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
  $("#endScreen .ct-mascot").hidden = false;
  $("#endScreen").classList.remove("is-hidden");
}

// A quarter's shift ended: the quota's met, there's another shift to go, or the quarter's over.
/** The numbers on a shift or quarter card, all in one row however many there are, under `top`. */
function setEndStats(top, stats) {
  const el = $("#endStats");
  el.classList.remove("is-shown");
  el.style.setProperty("--n", stats.length);
  el.innerHTML = top + stats.map(([l, v, cls = ""]) => `<div><div class="ct-label">${l}</div><div class="ct-stat-value ${cls}">${v}</div></div>`).join("");
}
/** Said when the quarter ends before its last shift: which shifts are skipped. */
function earlyLine(n, of) {
  if (n >= of) return "";
  const skipped = of - n === 1 ? `shift ${of} is` : of - n === 2 ? `shifts ${n + 1} and ${of} are` : `shifts ${n + 1} to ${of} are`;
  return `Everything shipped in shift ${n} of ${of}, so the quarter ends early and ${skipped} skipped.`;
}
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
  const stats = won ? [["Shifts", `${n} of ${Q.shifts}`], [`${WORDS.crewPay}, all shifts`, spent, LOSS], [WORDS.funds, left, GAIN]]
    : !last ? [[`Shipped ${WORDS.thisShift.toLowerCase()}`, `${done - shippedBefore}`], [`${WORDS.crewPay} ${WORDS.thisShift.toLowerCase()}`, `$${Math.round(game.laborCost)}`, LOSS], [WORDS.funds, left, GAIN]]
    : [["Shipped", `${done}/${total}`], [`${WORDS.crewPay}, all shifts`, spent, LOSS], [WORDS.funds, left, GAIN]];
  $("#endTitle").textContent = won ? "Quota met" : !last ? `Shift ${n} done` : "Quota missed";
  const shiftsLeft = Q.shifts - n;
  $("#endNote").textContent = won ? `${earlyLine(n, Q.shifts)} You saved ${left} of your $${Q.budget} in funds.`.trim()
    : !last ? `${countsLine(level.order.map((l) => l.count), quarter.done, shiftsLeft)} Your crew and their instructions stay; change who's on the shift before the next one if you like.`
    : "The quarter ended short of the quota.";
  // What's still to ship, as the same tickets the floor shows.
  const togo = won ? "" : `<div class="ct-end-togo"><span class="ct-label">Still to ship</span>${level.order.map((l, i) => {
    const n = l.count - quarter.done[i];
    return n > 0 ? ticketHTML(l.color, n) : "";
  }).join("")}</div>`;
  setEndStats(togo, stats);
  const btns = won || last
    ? [["new", "Try again", true], ...(won ? [] : [["restart", WORDS.replayShift]])]
    : [["next", "Next shift", true], ["restart", WORDS.replayShift]];
  $("#endBtns").innerHTML = btns.map(([go, text, gold]) => `<button class="ct-btn ${gold ? "is-gold" : ""}" data-go="${go}">${text}</button>`).join("")
    + `<button class="ct-btn" data-go="menu">Levels</button>`;
  $("#endBtns").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.go === "menu") showMenu();
    else openLevel(level, { again: true, shift: b.dataset.go });
  }));
  $("#endScreen .ct-mascot").hidden = false;
  $("#endScreen").classList.remove("is-hidden");
}

// ---------- the floor editor (decision 85) ----------
// Before a shift on your business's floor you can rearrange it: drag a machine to an open slot, or
// onto another one to swap the two; drag it to "In storage" to take it off the floor. Done lays the
// shift out again on the new floor with the same crew and instructions. Supply, the dock and your
// desk are bolted down.

const ICON_LOCK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
const ICON_MOVE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M5 9l-3 3 3 3M9 5l3-3 3 3"/></svg>`;
let editing = false, drag = null;
const onBusinessFloor = () => !!(biz && level?.contracts && level.positions);
const nameOf = (key) => STATIONS[key].label;
const andList = (xs) => xs.join(", ").replace(/, ([^,]*)$/, " and $1");

/** The plan bar's Edit floor button: it pulses while something new waits in storage (Mike). */
function renderFloorEdit() {
  const show = onBusinessFloor() && phase === "plan";
  $("#floorEdit").hidden = !show;
  if (!show) return;
  const f = biz.floor, fresh = f.fresh ?? [];
  const reading = game.workers.find((w) => w.compiling);
  const btn = $("#editFloorBtn");
  btn.classList.toggle("is-new", fresh.length > 0);
  btn.disabled = !!reading;
  if (reading) btn.dataset.tooltip = `${reading.hire.name} is still reading their instructions.`; else delete btn.dataset.tooltip;
  $("#storageBadge").hidden = !f.storage.length;
  $("#storageBadge").textContent = f.storage.length;
  $("#newNote").hidden = !fresh.length;
  $("#newNote").innerHTML = fresh.length ? `New: <b>${andList(fresh.map(nameOf))}</b> <button class="ct-link" id="keepStored">Keep in storage</button>` : "";
  $("#newNote").dataset.tooltip = fresh.length ? `Bought and waiting in storage. Place ${fresh.length > 1 ? "them" : "it"} with Edit floor, or Start puts ${fresh.length > 1 ? "them" : "it"} in the nearest free slot.` : "";
  $("#keepStored")?.addEventListener("click", () => { keepInStorage(biz.floor); logEvent(null, "floor_keep", { storage: [...biz.floor.storage] }); renderFloorEdit(); });
}

function openEditor() {
  if (!onBusinessFloor() || phase !== "plan" || started) return;
  editing = true;
  document.body.classList.add("is-editing");
  logEvent(null, "floor_edit", { at: { ...biz.floor.at }, storage: [...biz.floor.storage] });
  renderEditor();
}
$("#editFloorBtn").addEventListener("click", openEditor);

function closeEditor() {
  editing = false; drag = null;
  document.body.classList.remove("is-editing");
}
$("#doneEditBtn").addEventListener("click", () => {
  closeEditor();
  logEvent(null, "floor_done", { at: { ...biz.floor.at }, storage: [...biz.floor.storage] });
  relayout();
});

/** The same shift again on the floor as it's laid out now: same crew, same instructions. */
function relayout() {
  openLevel({ ...level, ...floorLevel(biz) }, { again: true, relaid: true });
}

/** Draw the blueprint: slots, the bolted-down anchors, your machines where they stand, the storage list. */
function renderEditor() {
  const f = biz.floor;
  $("#slots").innerHTML = SLOTS.map((p, i) => `<div class="ct-slot" data-slot="${i}" style="left:${p.x}%;top:${(p.y / 64) * 100}%"></div>`).join("");
  floor.querySelectorAll(".ct-st").forEach((el) => el.remove());
  ui.stations = {};
  for (const key of Object.keys(ANCHORS)) {
    const el = stationEl(key, ANCHORS[key]);
    el.classList.add("is-anchor");
    el.insertAdjacentHTML("beforeend", `<span class="ct-handle" data-tooltip="Bolted down">${ICON_LOCK}</span>`);
    floor.append(el);
  }
  for (const [key, i] of Object.entries(f.at)) {
    const el = stationEl(key, SLOTS[i]);
    el.classList.add("is-movable");
    el.dataset.move = key;
    el.insertAdjacentHTML("beforeend", `<span class="ct-handle">${ICON_MOVE}</span>`);
    floor.append(el);
  }
  const desk = floor.querySelector(".ct-desk");
  if (desk && !desk.querySelector(".ct-handle")) desk.insertAdjacentHTML("beforeend", `<span class="ct-handle">${ICON_LOCK}</span>`);
  const fresh = f.fresh ?? [];
  $("#storage").innerHTML = f.storage.length ? f.storage.map((key) => `<div class="ct-stored" data-move="${key}">
      <span class="ct-stored-crate">${nameOf(key)}</span>
      <div><b>${nameOf(key)}${fresh.includes(key) ? `<span class="ct-new-tag">New</span>` : ""}</b><span>${STATION_HINTS[key]}. Drag it onto the floor.</span></div>
    </div>`).join("") : `<div class="ct-storage-empty">Nothing in storage. Drag a machine here to take it off the floor.</div>`;
}

/** Where on the floor a point is, in floor units, and the slot it's over (if any). */
function dropTarget(e) {
  const r = floor.getBoundingClientRect(), k = r.width / 100;
  const x = (e.clientX - r.left) / k, y = (e.clientY - r.top) / k;
  const over = document.elementFromPoint(e.clientX, e.clientY);
  if (over?.closest(".ct-storage")) return { x, y, storage: true };
  const i = SLOTS.findIndex((p) => Math.abs(p.x - x) <= 9 && Math.abs(p.y - y) <= 9);
  return { x, y, slot: i >= 0 ? i : null };
}

document.addEventListener("pointerdown", (e) => {
  if (!editing) return;
  const src = e.target.closest("[data-move]");
  if (!src) return;
  e.preventDefault();
  const key = src.dataset.move;
  const ghost = stationEl(key, { x: 0, y: 0 });
  ghost.classList.add("ct-drag-ghost");
  floor.append(ghost);
  src.classList.add("is-lifted");
  drag = { key, src, ghost, from: biz.floor.at[key] ?? null };
  moveDrag(e);
});

function moveDrag(e) {
  if (!drag) return;
  const t = dropTarget(e);
  drag.ghost.style.left = `${t.x}%`; drag.ghost.style.top = `${(t.y / 64) * 100}%`;
  floor.querySelectorAll(".ct-slot").forEach((el) => { el.className = "ct-slot"; el.innerHTML = ""; });
  $("#storage").classList.toggle("is-target", !!t.storage && drag.from != null);
  drag.target = t;
  if (t.slot == null) return;
  const el = floor.querySelector(`[data-slot="${t.slot}"]`), other = inSlot(biz.floor, t.slot);
  el.classList.add("is-target");
  if (other && other !== drag.key) {
    // Swap: both slots light up, and the other machine shows where it will go (Mike's pick).
    el.classList.add("is-swap");
    el.innerHTML = `<span class="ct-slot-tag">Swap with ${nameOf(other)}</span>`;
    if (drag.from != null) {
      const back = floor.querySelector(`[data-slot="${drag.from}"]`);
      back.classList.add("is-preview");
      back.textContent = `${nameOf(other)} goes here`;
    } else el.innerHTML = `<span class="ct-slot-tag">Swap: ${nameOf(other)} goes to storage</span>`;
  }
}
document.addEventListener("pointermove", moveDrag);

document.addEventListener("pointerup", (e) => {
  if (!drag) return;
  const t = dropTarget(e), { key } = drag;
  drag.ghost.remove();
  drag.src.classList.remove("is-lifted");
  $("#storage").classList.remove("is-target");
  drag = null;
  let moved = null;
  if (t.storage) moved = store(biz.floor, key) ? { key, to: "storage" } : null;
  else if (t.slot != null) moved = place(biz.floor, key, t.slot);
  if (moved) logEvent(null, "floor_move", { ...moved, at: { ...biz.floor.at }, storage: [...biz.floor.storage] });
  renderEditor();
});

// ---------- your business: the contract board ----------

const BUSINESS = LEVELS.find((L) => L.business);
let picked = []; // contracts picked on the board for the coming quarter

/** Between quarters: pick this quarter's contracts, buy equipment. */
function openBoard() {
  if (!biz) { biz = newBusiness(); logEvent(null, "run_start"); }
  // A new business is named on its license first; a business that can't go on gets the front page.
  if (!biz.owner) return openLicense();
  const over = outOfBusiness(biz, CANDIDATES);
  if (over) return showGameOver(over);
  picked = [];
  logEvent(null, "board", { business: biz.name, quarter: biz.quarters + 1, funds: Math.floor(biz.money), rep: biz.rep, loans: [...biz.loans],
    crew: biz.crew.map((id) => ({ id, ...pick(robotOf(biz, CANDIDATES.find((c) => c.id === id)), "skills", "attributes", "wage") })),
    offers: board(biz).map((c) => pick(c, "id", "size", "color", "count", "pay", "fullCount", "fullPay", "needs")), last: biz.last });
  setPhase("menu");
  paused = false;
  for (const id of ["startScreen", "endScreen", "pauseScreen"]) $(`#${id}`).classList.add("is-hidden");
  renderBoard();
  $("#boardScreen").classList.remove("is-hidden");
}

// ---------- reputation on the board (decisions 78, 79) ----------

const possessive = (name) => (/s$/i.test(name) ? `${name}'` : `${name}'s`);
/** A pie for one pip, filled `thirds` of 3. */
function pieHTML(thirds) {
  if (thirds >= 3) return `<svg class="ct-pie" viewBox="0 0 22 22" aria-hidden="true"><circle class="bg" cx="11" cy="11" r="10"/><circle class="full" cx="11" cy="11" r="10"/></svg>`;
  if (thirds <= 0) return `<svg class="ct-pie" viewBox="0 0 22 22" aria-hidden="true"><circle class="bg" cx="11" cy="11" r="10"/></svg>`;
  const a = (thirds / 3) * 2 * Math.PI, x = 11 + 10 * Math.sin(a), y = 11 - 10 * Math.cos(a);
  return `<svg class="ct-pie" viewBox="0 0 22 22" aria-hidden="true"><circle class="bg" cx="11" cy="11" r="10"/><path d="M11 11V1A10 10 0 ${a > Math.PI ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)}Z"/></svg>`;
}
/** Three pies for a reputation, in thirds. */
const piesHTML = (rep) => `<span class="ct-rep-pies">${[0, 1, 2].map((i) => pieHTML(Math.max(0, Math.min(3, rep - i * 3)))).join("")}</span>`;
const offerPct = (rep) => Math.round(offerShare(rep) * 100);
/** Under Funds: the pips, "2⅓ of 3 · offers at 80%", and a warning at one pip. */
function renderRep() {
  const rep = biz.rep ?? REP.max, danger = onTheEdge(rep);
  const el = $("#bizRep");
  el.classList.toggle("is-danger", danger);
  el.classList.toggle("is-full", rep >= REP.max); // green at full reputation (Mike)
  el.innerHTML = `<span class="ct-cash-label">${WORDS.reputation}</span>${piesHTML(rep)}<span class="ct-rep-text">${pipsText(rep)} of 3 · offers at ${offerPct(rep)}%</span>`
    + (danger ? `<span class="ct-rep-warn">One more missed contract and the name ${escapeHTML(biz.name)} is mud.</span>` : "");
  $("#missLine").innerHTML = `Miss any contract: <b>−1 reputation</b>`;
}
/** A contract's boxes and pay as offered, the full numbers struck through beside them when
 *  reputation has lowered them (with Mike's hover lines), and what shipping it wins back. */
function offerNumbers(c) {
  const pct = offerPct(biz.rep ?? REP.max), who = escapeHTML(possessive(biz.name));
  const struck = (full, now, tip) => (full != null && full !== now ? `<s class="ct-struck" data-tooltip="${tip}">${full}</s>` : "");
  return `<span class="ct-size-count">${c.count} ${c.color === "crate" ? "crates" : "boxes"}${struck(c.fullCount, c.count, `Clients ask for ${pct}% of the ${c.color === "crate" ? "crates" : "boxes"} while ${who} reputation is questionable. Restore reputation for the full ${c.fullCount}.`)}</span>
    <span class="ct-offer-pay">$${c.pay}${struck(c.fullPay, c.pay, `Clients pay ${pct}% while ${who} reputation is questionable. Restore reputation for the full $${c.fullPay}.`).replace(">" + c.fullPay + "<", ">$" + c.fullPay + "<")}</span>
    <span class="ct-rep-gain">Ship it: ${deltaText(gainOf(c))} reputation</span>`;
}

// Under a contract's pay: what you keep of it, if part goes to the lender.
const keepLine = (c) => (biz.loans.length ? `<span class="ct-offer-keep">you keep $${c.pay - repayOf(biz, c.pay)}</span>` : "");

function renderBoard() {
  const pct = `${Math.round(LENDER.share * 100)}%`, now = `${Math.round(shareOf(biz) * 100)}%`;
  // Anything on the board you can't afford yet is greyed out and says how much you're short, the
  // same way everywhere (Recruit, Buy, Training): `short` disables it, `shortNote` says by how much.
  const short = (n) => (biz.money < n ? `disabled data-tooltip="It costs $${n}, and you have ${money(biz.money)}."` : "");
  const shortNote = (n) => shortNoteFor(n, biz.money);
  $("#bizMoney").textContent = money(biz.money);
  // The most a shift can cost: everyone on it. The real cost shows by Start while you schedule.
  $("#bizCrewCost").innerHTML = biz.crew.length ? `Whole crew <span class="ct-loss">$${crewCost(biz, CANDIDATES)}</span> a shift` : "";
  $("#boardTitle").textContent = `Quarter ${biz.quarters + 1}`;
  $("#boardBiz").textContent = biz.name;
  renderRep();
  // How the last quarter went, one quiet line (not in the first quarter).
  const L = biz.last;
  $("#boardLast").hidden = !L;
  if (L) $("#boardLast").innerHTML = `${WORDS.lastQuarter}: ${L.won} of ${L.of} ${L.of === 1 ? "contract" : "contracts"} shipped, <b class="${L.net >= 0 ? "is-in" : "is-out"}">${signed(L.net)}</b>`;
  $("#boardShifts").textContent = `${QUARTER_SHIFTS} shifts. Every contract is due at the end of the last one.`;
  // The lender: no interest; each loan takes 10% of every contract you finish until it's paid back.
  const n = biz.loans.length;
  $("#investorLine").innerHTML = n >= LENDER.max
    ? `"I'm not lending you any more money until you pay up, deadbeat! You owe me <b class="is-debt">$${debtOf(biz)}</b> on ${n} loans, and I take <b class="is-debt">${now}</b> of every contract you finish until you're paid up."`
    : n
    ? `"You owe me <b class="is-debt">$${debtOf(biz)}</b>${n > 1 ? ` on ${n} loans` : ""}, and I take <b class="is-debt">${now}</b> of every contract you finish until you're paid up."`
    : `"Short on cash? Borrow from me, no interest. Each loan takes ${pct} of every contract you finish until it's paid off; two loans take ${Math.round(LENDER.share * 200)}%."`;
  $("#loans").innerHTML = LENDER.amounts.map((a, i) => `<button class="ct-btn" data-loan="${i}" ${n >= LENDER.max ? "disabled" : ""} data-tooltip="${n >= LENDER.max ? `You have ${LENDER.max} loans, the most he'll give. He's paid back from your contracts, 10% of each per loan.`
    : `You'd owe $${a}, paid back by ${pct} of every contract you finish${n ? `, on top of the ${now} you already pay` : ""}.`}">Borrow $${a}</button>`).join("");
  $("#loans").querySelectorAll("[data-loan]").forEach((b) => b.addEventListener("click", () => {
    if (borrow(biz, +b.dataset.loan)) { logEvent(null, "borrow", { amount: LENDER.amounts[+b.dataset.loan], funds: Math.floor(biz.money), loans: [...biz.loans] }); renderBoard(); }
  }));

  // ----- contracts: one card with a small and a large size (take one or neither), and a side one
  const offers = board(biz);
  picked = picked.filter((p) => offers.some((c) => c.id === p.id));
  const isOn = (c) => picked.some((p) => p.id === c.id);
  const [small, large, side, crates] = offers;
  const blocked = (c) => missingFor(biz, c);
  const size = (c) => `<button type="button" class="ct-size ${isOn(c) ? "is-on" : ""}" data-contract="${c.id}" ${blocked(c) ? "disabled" : ""}>
      <span class="ct-size-name">${isOn(c) ? CHECK : ""}${c.size === "small" ? "Small" : "Large"}</span>
      ${offerNumbers(c)}${keepLine(c)}
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
        ${offerNumbers(side)}${keepLine(side)}
      </button></div>
      <div class="ct-offer-note is-bad">${blocked(side)}</div>${painted(side)}
    </div>${crates ? `
    <div class="ct-offer ct-side ${isOn(crates) ? "is-picked" : ""}">
      <div class="ct-offer-head">${ticketHTML("crate", "")}<b>Crates</b><span class="ct-offer-keep">Assembler contract</span></div>
      <div class="ct-sizes"><button type="button" class="ct-size ${isOn(crates) ? "is-on" : ""}" data-contract="${crates.id}" ${blocked(crates) ? "disabled" : ""}>
        <span class="ct-size-name">${isOn(crates) ? CHECK : ""}${isOn(crates) ? "Taking it" : "Take it"}</span>
        ${offerNumbers(crates)}${keepLine(crates)}
      </button></div>
      <div class="ct-offer-note is-bad">${blocked(crates)}</div><span class="ct-offer-keep">Each crate is a red, a blue and a green box.</span>
    </div>` : ""}`;
  $("#offers").querySelectorAll("[data-contract]").forEach((b) => b.addEventListener("click", () => {
    const c = offers.find((o) => o.id === b.dataset.contract);
    // Taking one size drops the other: a quarter's contracts never share a color.
    picked = isOn(c) ? picked.filter((p) => p.id !== c.id) : [...picked.filter((p) => p.color !== c.color), c];
    logEvent(null, "pick", { contract: c.id, on: isOn(c), picked: picked.map((p) => p.id) });
    renderBoard();
  }));
  const boxesIn = (c) => c.count * (c.color === "crate" ? 3 : 1);
  const total = picked.reduce((a, c) => a + boxesIn(c), 0);
  $("#boardGo").disabled = !picked.length;
  $("#boardGo").textContent = WORDS.startQuarter;
  $("#boardNote").textContent = !picked.length ? "Pick at least one contract."
    : `${total} boxes in ${QUARTER_SHIFTS} shifts. A contract only pays if all its boxes ship.`;
  // The quarter at a glance: your money is the budget wages come out of (you don't know them until
  // the shifts run), and what the picked contracts bring in at the end if they all ship.
  const f = forecast(biz, picked);
  const row = (label, v, cls = "", tip = "") => `<span class="${cls}" ${tip ? `data-tooltip="${tip}"` : ""}>${label}</span><b class="${cls}">${v}</b>`;
  $("#forecast").innerHTML = !picked.length ? "" : row("Contracts pay, if they all ship", signed(f.pay), "is-in")
    + (n ? row(`${WORDS.toLender} (${now})`, signed(-f.repay), "is-out", `After this quarter you'd owe $${f.debtAfter}.`)
      + row("You keep", signed(f.gain), "is-total") : "");

  // ----- recruit: three robots this visit
  $("#recruits").innerHTML = recruitOffers(biz).map((id) => {
    const r = robotOf(biz, CANDIDATES.find((c) => c.id === id)), done = biz.crew.includes(id), price = recruitPrice(biz, id);
    return robotCard(r, { cls: `ct-biz-bot ${done ? "is-done" : ""}`, action: `${done ? `<span class="ct-owned">${CHECK} ${WORDS.recruited}</span>` : `<button class="ct-btn is-gold" data-recruit="${id}" ${short(price)}>${WORDS.recruit} $${price}</button>${shortNote(price)}`}` });
  }).join("") || `<p class="ct-offer-note">Everyone's already on your crew.</p>`;

  // ----- training: your crew
  $("#crewNote").textContent = `$${TRAIN_PRICE} a skill or trait. Each adds $5 a shift to their pay; a third skill, or a third trait, adds $${SKILL_TIER.extra} more.`;
  $("#bizCrew").innerHTML = biz.crew.map((id) => {
    const r = robotOf(biz, CANDIDATES.find((c) => c.id === id));
    // One Train picker per robot: what's left to learn, and what each adds to their pay.
    const item = (k, isSkill) => {
      const after = isSkill ? wageOf([...r.skills, k], r.attributes) : wageOf(r.skills, [...r.attributes, k]);
      const broke = biz.money < TRAIN_PRICE;
      return `<button class="ct-train-item" data-train="${id}:${k}" ${broke ? short(TRAIN_PRICE) : `data-tooltip="${(isSkill ? SKILLS : ATTRIBUTES)[k].tip}"`}>${(isSkill ? SKILLS : ATTRIBUTES)[k].label}<span>${signed(after - r.wage)} a shift${broke ? ` · ${shortNote(TRAIN_PRICE)}` : ""}</span></button>`;
    };
    const skills = trainableNow(biz).filter((k) => !r.skills.includes(k)), traits = TRAINABLE_ATTRS.filter((k) => !r.attributes.includes(k));
    const open = trainOpen === id;
    const menu = !open ? "" : `<div class="ct-train-menu">${skills.length ? `<div class="ct-train-head">Skills · $${TRAIN_PRICE} each</div>${skills.map((k) => item(k, true)).join("")}` : ""}${
      traits.length ? `<div class="ct-train-head">Traits · $${TRAIN_PRICE} each</div>${traits.map((k) => item(k, false)).join("")}` : ""}</div>`;
    // Nothing in the list affordable (everything costs the same): the Train button itself is
    // greyed out with the same "short" note as Recruit and Buy.
    const picker = skills.length + traits.length
      ? `<div class="ct-train-pick"><button class="ct-btn ct-train-open ${open ? "is-on" : ""}" data-train-open="${id}" aria-expanded="${open}" ${short(TRAIN_PRICE)}>Train ${CHEVRON_DOWN}</button>${shortNote(TRAIN_PRICE)}${menu}</div>`
      : `<span class="ct-owned">Knows everything</span>`;
    return robotCard(r, { cls: "ct-biz-bot ct-trainee", blurb: false, action: picker });
  }).join("");

  // ----- machines: three this visit, and what's on your floor
  const mine = [...biz.machines.map((x) => STATIONS[x.key].label), ...biz.upgrades.map((id) => SHOP.find((m) => m.id === id).name)];
  $("#machines").innerHTML = machineOffers(biz).map((m) => {
    // A floor machine you can still buy a second of stays buyable; it's "bought" only once you can't.
    const done = biz.boughtNow.includes(m.id) && !(m.station && canAdd(biz, m));
    const replaces = m.station && biz.machines.some((x) => SHOP.find((y) => y.id === x.id).kind === m.kind) ? " A second one: it goes in storage as " + STATIONS[`${m.station}_2`].label + "." : m.station ? " It goes in storage; place it with Edit floor." : "";
    return `<div class="ct-biz-bot ct-machine ${done ? "is-done" : ""}">
      <div><div><b>${m.name}</b></div><div class="ct-biz-blurb">${m.blurb}${replaces}</div></div>
      <div class="ct-biz-act">${done ? `<span class="ct-owned">${CHECK} ${WORDS.bought}</span>` : `<button class="ct-btn is-gold" data-buy="${m.id}" ${short(m.price)}>Buy $${m.price}</button>${shortNote(m.price)}`}</div>
    </div>`;
  }).join("") + `<p class="ct-offer-note">Bought so far: ${mine.length ? mine.join(", ") : "nothing yet"}.</p>`;

  $("#boardScreen").querySelectorAll("[data-recruit]").forEach((b) => b.addEventListener("click", () => {
    if (recruit(biz, b.dataset.recruit)) { logEvent(null, "recruit", { robot: b.dataset.recruit, funds: Math.floor(biz.money) }); renderBoard(); }
  }));
  $("#boardScreen").querySelectorAll("[data-buy]").forEach((b) => b.addEventListener("click", () => {
    if (buy(biz, b.dataset.buy)) { logEvent(null, "buy", { machine: b.dataset.buy, funds: Math.floor(biz.money) }); renderBoard(); }
  }));
  $("#boardScreen").querySelectorAll("[data-train]").forEach((b) => b.addEventListener("click", (e) => {
    e.stopPropagation();
    const [id, k] = b.dataset.train.split(":");
    if (train(biz, CANDIDATES.find((c) => c.id === id), k)) { logEvent(null, "train", { robot: id, learned: k, funds: Math.floor(biz.money) }); trainOpen = null; renderBoard(); }
  }));
  placeTrainMenu();
  $("#boardScreen").querySelectorAll("[data-train-open]").forEach((b) => b.addEventListener("click", (e) => {
    e.stopPropagation();
    trainOpen = trainOpen === b.dataset.trainOpen ? null : b.dataset.trainOpen;
    renderBoard();
  }));
}
const cap = (s) => s[0].toUpperCase() + s.slice(1);
/** Just these fields of an object, for the log. */
const pick = (o, ...keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));

// The web build has no server to write logs to: a small "Download log" link saves this browser's
// play log to send after a playtest (decision 83). Also with ?log on any build.
$("#downloadLog").hidden = !(BACKEND === "openrouter" || new URLSearchParams(location.search).has("log"));
$("#downloadLog").addEventListener("click", () => { logEvent(null, "download_log"); downloadLog(); });

// ---------- a new business: the license (decision 74) ----------

/** Shrink an input's font so its text (or placeholder) fits its width, between `max` and `min` px. */
const measure = document.createElement("canvas").getContext("2d");
function fitInput(el, max, min) {
  el.style.fontSize = `${max}px`;
  const cs = getComputedStyle(el);
  measure.font = `${cs.fontStyle} ${cs.fontWeight} ${max}px ${cs.fontFamily}`;
  const text = el.value || el.placeholder;
  const room = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 4;
  const w = measure.measureText(cs.textTransform === "uppercase" ? text.toUpperCase() : text).width;
  el.style.fontSize = `${Math.max(min, Math.min(max, Math.floor(max * room / Math.max(1, w))))}px`;
}
/** Shrink the headline until every word fits its column and the whole page fits the window. */
function fitHeadline() {
  const hl = $("#paperHeadline"), paper = $("#gameoverPaper");
  for (let size = 46; size >= 24; size -= 2) {
    hl.style.fontSize = `${size}px`;
    if (hl.scrollWidth <= hl.clientWidth + 1 && paper.scrollHeight <= paper.clientHeight + 1) return;
  }
}
const fitLicense = () => { fitInput($("#licenseName"), 38, 20); fitInput($("#licenseOwner"), 30, 14); };
const LENDER_LINES = { before: "Sign at the bottom.", after: "Lovely name. I'll remember it." };

function openLicense() {
  setPhase("menu");
  for (const id of ["startScreen", "endScreen", "pauseScreen", "boardScreen", "gameoverScreen"]) $(`#${id}`).classList.add("is-hidden");
  $("#licenseName").value = randomBusinessName();
  $("#licenseOwner").value = "";
  $("#licenseCapital").textContent = `capital: $${START_MONEY}`;
  $("#licenseStamp").classList.remove("is-stamped");
  for (const el of $$("#licenseScreen input, #licenseScreen button")) el.disabled = false;
  $("#licenseLender").textContent = `"${LENDER_LINES.before}"`;
  checkLicense();
  document.body.classList.add("is-quiet");
  $("#licenseScreen").classList.remove("is-hidden");
  fitLicense();
  document.fonts.ready.then(fitLicense); // measure again once the license's fonts have loaded
  $("#licenseOwner").focus();
}
/** Open for business waits for both names, and says which one is missing. */
function checkLicense() {
  const name = $("#licenseName").value.trim(), owner = $("#licenseOwner").value.trim();
  const why = !name ? "Name your business first." : !owner ? "Sign your name as the owner first." : "";
  $("#licenseGo").disabled = !!why;
  $("#licenseWhy").textContent = why;
  return !why;
}
$("#licenseName").addEventListener("input", () => { checkLicense(); fitLicense(); });
$("#licenseOwner").addEventListener("input", () => { checkLicense(); fitLicense(); });
document.fonts.addEventListener?.("loadingdone", () => { if (!$("#licenseScreen").classList.contains("is-hidden")) fitLicense(); });
$("#licenseDice").addEventListener("click", () => { $("#licenseName").value = randomBusinessName($("#licenseName").value); checkLicense(); fitLicense(); });
$("#licenseForm").addEventListener("submit", (e) => {
  e.preventDefault();
  if (!checkLicense() || $("#licenseStamp").classList.contains("is-stamped")) return;
  biz.name = $("#licenseName").value.trim();
  biz.owner = $("#licenseOwner").value.trim();
  logEvent(null, "license", { business: biz.name, owner: biz.owner });
  for (const el of $$("#licenseScreen input, #licenseScreen button")) el.disabled = true;
  $("#licenseWhy").textContent = "";
  // The lender stamps it, then you're on the board.
  $("#licenseStamp").classList.add("is-stamped");
  $("#licenseLender").textContent = `"${LENDER_LINES.after}"`;
  setTimeout(() => { $("#licenseScreen").classList.add("is-hidden"); document.body.classList.remove("is-quiet"); openBoard(); }, LICENSE_STAMP_MS);
});
const LICENSE_STAMP_MS = 900;

// ---------- out of business: the paper lands on your floor (decision 74) ----------

// The panel says why in terms of reputation, whatever ended the run (Mike, decision 76): going
// under is the business's name being ruined, not a bank balance.
const REPUTATION_GONE = (b) => `The name ${b.name} is mud. No client in the Widget District will sign another contract with it.`;
const GAMEOVER_WHY = { broke: REPUTATION_GONE, reputation: REPUTATION_GONE };
/** The run is over. `reason` is a key of GAMEOVER_WHY; reputation will trigger it too, later. */
function showGameOver(reason) {
  setPhase("menu");
  for (const id of ["startScreen", "endScreen", "pauseScreen", "boardScreen", "licenseScreen"]) $(`#${id}`).classList.add("is-hidden");
  const b = biz;
  $("#paperQuarter").textContent = `Quarter ${b.quarters + 1}`;
  const hl = headline(reason, b.name, b.quarters + b.wins);
  // Which photo the paper runs: its own seed, so it doesn't always pair with the same headline.
  // (window.ct.photoSeed picks one in tests and screenshots.)
  const photo = ownerPhoto(window.ct?.photoSeed ?? b.quarters * 3 + b.taken + b.wins * 2);
  $("#paperHeadline").textContent = hl;
  logEvent(null, "gameover", { reason, headline: hl, photo: photo.face, quarters: b.quarters, wins: b.wins, taken: b.taken, best: b.best, revenue: b.revenue, costs: b.costs, funds: Math.floor(b.money), owed: debtOf(b), rep: b.rep });
  $("#paperPhoto").innerHTML = ownerHeadSVG(photo.face);
  $("#paperCaption").textContent = photo.caption(b.name);
  $("#paperColumn").textContent = (b.wins ? `${b.name} shipped ${b.wins} of ${b.taken} contracts in ${b.quarters} ${b.quarters === 1 ? "quarter" : "quarters"} of business. `
    : `${b.name} never shipped a contract. `) + `Robots on the floor declined to comment, as commenting was not part of their instructions.`;
  $("#gameoverWhy").textContent = GAMEOVER_WHY[reason](b);
  const rows = [["Quarters survived", b.quarters], ["Contracts shipped", b.taken ? `${b.wins} of ${b.taken}` : "None"],
    ...(b.best != null ? [["Best quarter", signedText(b.best), b.best < 0 ? LOSS : GAIN]] : []),
    ["Total revenue", `$${Math.round(b.revenue ?? 0)}`, GAIN], ["Total costs", `$${Math.round(b.costs ?? 0)}`, LOSS],
    [WORDS.fundsLeft, money(b.money), GAIN], ["Owed the lender", `$${debtOf(b)}`, debtOf(b) ? LOSS : ""]];
  $("#gameoverStats").innerHTML = rows.map(([l, v, cls = ""]) => `<div><span>${l}</span><b class="${cls}">${v}</b></div>`).join("");
  document.body.classList.add("is-quiet");
  $("#gameoverScreen").classList.remove("is-hidden");
  fitHeadline();
  document.fonts.ready.then(fitHeadline);
}
$("#gameoverNew").addEventListener("click", () => { logEvent(null, "new_run"); biz = null; $("#gameoverScreen").classList.add("is-hidden"); document.body.classList.remove("is-quiet"); openBoard(); });
$("#gameoverMenu").addEventListener("click", () => { $("#gameoverScreen").classList.add("is-hidden"); document.body.classList.remove("is-quiet"); showMenu(); });
// The open Train picker (a robot id), if any. A click anywhere else or Escape closes it.
let trainOpen = null;
const CHEVRON_DOWN = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const closeTraining = () => { if (trainOpen) { trainOpen = null; renderBoard(); } };
/** The open Train menu floats over the board (fixed), under its button, or above it when there's
 *  no room below, so the Training column's scroll box never cuts it off. */
function placeTrainMenu() {
  const menu = $(".ct-train-menu");
  if (!menu) return;
  const r = menu.parentElement.querySelector(".ct-train-open").getBoundingClientRect();
  const h = menu.offsetHeight, w = menu.offsetWidth;
  const below = r.bottom + 6 + h <= innerHeight - 8;
  menu.style.top = `${below ? r.bottom + 6 : Math.max(8, r.top - 6 - h)}px`;
  menu.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, r.right - w))}px`;
}
document.addEventListener("scroll", () => trainOpen && closeTraining(), true);
addEventListener("resize", () => placeTrainMenu());
document.addEventListener("click", (e) => { if (trainOpen && !e.target.closest?.(".ct-train-pick")) closeTraining(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeTraining(); });
$("#boardMenuBtn").addEventListener("click", () => showMenu());
$("#boardGo").addEventListener("click", () => {
  if (!picked.length) return;
  // In the order the board lists them, so the tickets on the floor match the board.
  const offers = board(biz).filter((c) => picked.some((p) => p.id === c.id));
  logEvent(null, "quarter_start", { quarter: biz.quarters + 1, contracts: offers.map((c) => pick(c, "id", "size", "color", "count", "pay")), funds: Math.floor(biz.money), rep: biz.rep });
  openLevel(quarterLevel(BUSINESS, biz, offers, CANDIDATES), { keepCrew: true });
});

// A shift of the quarter ended: everything shipped, there's another shift, or the quarter's over.
// At the end each contract that shipped in full pays, and part of it goes to the lender if you owe him.
function endBusinessShift(won, last, done, total, shippedBefore) {
  const cs = level.contracts, n = quarter.shift;
  logEvent(game.t, "end", { won, contracts: cs.map((c) => c.id), quarter: { shift: n, of: QUARTER_SHIFTS }, shipped: `${done}/${total}`, labor: Math.round(game.laborCost), money: Math.floor(quarter.money), crew: crewSummary() });
  const over = won || last;
  const pays = payouts(cs, quarter.done, [...biz.loans]);
  const paid = pays.reduce((a, p) => a + p.pay, 0), cut = pays.reduce((a, p) => a + p.cut, 0);
  const shipped = pays.filter((p) => p.won).length;
  $("#endTitle").textContent = won ? (n < QUARTER_SHIFTS ? "Quarter over early" : "Every contract shipped") : over ? "Quarter over" : `Shift ${n} done`;
  const shiftsLeft = QUARTER_SHIFTS - n;
  quarter.payout = over ? paid - cut : 0;
  // No mascot on the business cards: that face is the lender's, and sits by his cut in the recap.
  $("#endScreen .ct-mascot").hidden = true;
  $("#endNote").textContent = won ? earlyLine(n, QUARTER_SHIFTS)
    : over ? (shipped ? `${shipped} of ${cs.length} contracts shipped in full and paid. ${cs.length - shipped === 1 ? "The other pays nothing." : "The others pay nothing."}` : "No contract shipped in full, so nobody pays.")
    : `${shiftsLeft} ${shiftsLeft === 1 ? "shift" : "shifts"} left. Your crew and their instructions stay; change who's on the shift before the next one if you like.`;
  // Each contract: its ticket, what shipped of it, and (at the end) what it paid.
  // On the quarter card the stamps land one after another once the card is up (STAMP_MS apart).
  const rows = `<div class="ct-end-contracts">${pays.map((p, i) => `<div class="ct-end-contract ${p.won ? "is-done" : over ? "is-missed" : ""} ${over ? "has-stamp" : ""}" style="--d:${STAMP_START_MS + i * STAMP_MS}ms">
      ${ticketHTML(p.c.color, p.c.count)}<span>${Math.min(quarter.done[i], p.c.count)} of ${p.c.count} shipped</span>
      ${over ? `<span class="ct-stamp ${p.won ? "is-shipped" : "is-missed"}">${p.won ? `Shipped ${deltaText(gainOf(p.c))}` : `Missed ${deltaText(-REP.miss)}`}</span>` : ""}
      <b>${p.won ? `$${p.c.pay}` : over ? "$0" : `pays $${p.c.pay}`}</b></div>`).join("")}</div>`;
  // The quarter card adds up the whole quarter; a shift card says what that shift did.
  const crewPayAll = Math.round(level.quarter.budget - quarter.money);
  const stats = over ? [["Paid", `$${paid}`], [`${WORDS.crewPay}, all shifts`, `$${crewPayAll}`], ...(cut ? [[WORDS.toLender, `$${cut}`]] : []), [WORDS.funds, money(quarter.money + paid - cut)]]
    : [[`Shipped ${WORDS.thisShift.toLowerCase()}`, `${done - shippedBefore}`], [`${WORDS.crewPay} ${WORDS.thisShift.toLowerCase()}`, `$${Math.round(game.laborCost)}`, LOSS], [WORDS.funds, money(quarter.money), GAIN]];
  const repBefore = biz.rep ?? REP.max, repAfter = afterQuarter(repBefore, pays);
  if (over) setEndStats(rows + recapHTML({ start: level.quarter.budget, paid, cut, crew: crewPayAll, rep: [repBefore, repAfter] }), []);
  else setEndStats(rows, stats);
  const btns = over ? [["board", WORDS.toBoard, true]]
    : [["next", "Next shift", true], ["restart", WORDS.replayShift]];
  $("#endBtns").innerHTML = btns.map(([go, text, gold]) => `<button class="ct-btn ${gold ? "is-gold" : ""}" data-go="${go}">${text}</button>`).join("")
    + `<button class="ct-btn" data-go="menu">Levels</button>`;
  $("#endBtns").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    logEvent(null, "end_card", { go: b.dataset.go });
    if (b.dataset.go === "menu") showMenu();
    else if (b.dataset.go === "board") {
      const before = { funds: Math.floor(level.quarter.budget), rep: biz.rep };
      settle(biz, cs, quarter.done, quarter.money);
      logEvent(null, "quarter_settle", { quarter: biz.quarters, before, after: { funds: Math.floor(biz.money), rep: biz.rep }, crewPay: Math.round(level.quarter.budget - quarter.money),
        contracts: payouts(cs, quarter.done).map((p, i) => ({ id: p.c.id, count: p.c.count, shipped: quarter.done[i], won: p.won, pay: p.pay })), last: biz.last, loans: [...biz.loans] });
      openBoard();
    }
    else openLevel(level, { again: true, shift: b.dataset.go });
  }));
  $("#endScreen").classList.remove("is-hidden");
}

/**
 * The quarter's recap under the contracts, read top to bottom like a receipt: what you started with,
 * what came in and went out (no $0 lines), the budget now, and the quarter's result. Lines tally in
 * one after another; a click on the card shows them all at once (Pam's spec, decision 72).
 */
function recapHTML({ start, paid, cut, crew, rep }) {
  const now = start + paid - cut - crew, net = now - start;
  const lender = `<img class="ct-recap-face" src="favicon.svg" alt="">`;
  const lines = [
    [WORDS.startedWith, money(start), "is-in"],
    ...(paid ? [[WORDS.contractsPaid, signed(paid), "is-in"]] : []),
    ...(cut ? [[`${WORDS.lendersCut} ${lender}`, signed(-cut), "is-out"]] : []),
    ...(crew ? [[WORDS.crewPayAll, signed(-crew), "is-out"]] : []),
    [WORDS.fundsNow, money(now), "is-total"],
  ];
  const row = ([l, v, cls], i) => `<span class="${cls}" style="--i:${i}">${l}</span><b class="${cls}" style="--i:${i}">${v}</b>`;
  const [before, after] = rep ?? [REP.max, REP.max], i = lines.length;
  const repRow = `<div class="ct-recap-rep" style="--i:${i + 1}"><span>${WORDS.reputation}</span><span class="ct-rep-pies">${piesHTML(before)}<span class="arrow">→</span>${piesHTML(after)}</span></div>
    <div class="ct-recap-next ${ruined(after) ? "is-out" : ""}" style="--i:${i + 1}">${ruined(after) ? `No client will sign with ${escapeHTML(biz.name)} again.` : `Next quarter: offers at ${offerPct(after)}% of size and pay`}</div>`;
  return `<div class="ct-recap">${lines.map(row).join("")}
    <div class="ct-recap-net ${net >= 0 ? "is-in" : "is-out"}" style="--i:${i}">${WORDS.thisQuarter} <b>${signed(net)}</b></div>${repRow}</div>`;
}
$("#endScreen").addEventListener("click", () => { $(".ct-recap")?.classList.add("is-shown"); $("#endStats").classList.add("is-shown"); });
const STAMP_START_MS = 450, STAMP_MS = 450;

function setPaused(p) {
  if (p !== paused) logEvent(game?.t ?? null, p ? "pause" : "resume");
  paused = p;
  keysDown.clear();
  if (game) playerSteer(game, 0, 0);
  $("#pauseScreen").classList.toggle("is-hidden", !p);
}

$("#pauseBtn").addEventListener("click", () => { if ((phase === "run" && !game.over) || phase === "plan") setPaused(!paused); });
$("#resumeBtn").addEventListener("click", () => setPaused(false));
// The pause card sits on the floor; clicks on it aren't moves on the floor.
$("#pauseScreen").addEventListener("click", (e) => e.stopPropagation());
$("#restartBtn").addEventListener("click", () => { logEvent(game?.t ?? null, "restart_shift"); openLevel(level, { again: true }); });
$("#menuBtn").addEventListener("click", () => showMenu());

applyWords();
renderLevels();
initAccess();
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
  setPaused, begin: () => begin({ force: true }), startBlocker: () => startBlocker(), thinking: (id, d) => setThinking(worker(id), d), hire, playerActions, openBoard, renderBoard, get biz() { return biz; }, set biz(b) { biz = b; },
  buy: (id) => buy(biz, id), openEditor, closeEditor, relayout, get editing() { return editing; }, get level() { return level; },
  showGameOver: (r) => showGameOver(r), license: (name, owner) => { if (!biz) biz = newBusiness(); biz.name = name; biz.owner = owner; },
  useFakeLlm, // e2e: answer model calls without a model
};
