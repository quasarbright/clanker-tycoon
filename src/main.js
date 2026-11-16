// The game screen. Phases: menu (pick a level) → plan (hire, write instructions) → run → end.
// You're on the floor yourself: walk with WASD / arrow keys or by clicking, and use the action bar
// (or Space and number keys) at a station. Shipping pays; with money you hire robots, give them
// instructions, and they do the work too. A level ends when today's order is filled.
import {
  newGame, step, resume, setProgram, setNow, goToDesk, atDesk, addWorker, removeWorker, playerGo, playerWalkTo,
  playerSteer, playerDo, orderLineText, actProgress, boxProgress, hasAttr, STATIONS, DESK, RULES, COLORS,
} from "./sim.js";
import { CANDIDATES, SKILLS, ATTRIBUTES, compile, respond } from "./brains.js";
import { LEVELS } from "./levels.js";
import { backendLabel } from "./llm.js";

const $ = (sel, root = document) => root.querySelector(sel);
const floor = $("#floor");
let game = null;
let level = LEVELS[0];
let phase = "menu";
let paused = false;
let started = false; // the clock starts on your first move
let lastFrame = performance.now();
let lastVersion = -1, lastStat = null, lastClock = null, lastOrder = "", lastHands = "", lastHiring = "";
const ui = { bots: {}, cards: {}, stations: {}, desk: {}, thinking: {}, bubbleTimers: {}, oopsTimers: {} };

// The thinking budget: how many thoughts a worker can spend on their own (something unexpected, or
// think() in their program). It refills slowly while the shift runs; Smart workers hold more and
// refill faster. Talking to them is free: they always answer you.
const BUDGET = { max: 3, every: 20, smartMax: 5, smartEvery: 12 };
// The same problem coming back this soon after they thought about it sends them to your desk.
const REPEAT_WINDOW = 45;
// Progress lives in memory only for now (no localStorage while iterating). Every level is open.
let unlocked = LEVELS.length;
const best = {}; // best[levelId] = { time, stars }

$("#backendNote").textContent = `Workers run on ${backendLabel}.`;

const STATION_HINTS = {
  BELT_A: "widgets arrive here",
  PAINT: "repaints a widget, wears with use",
  PACK: "3 widgets → 1 box",
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
      ${b ? `<span class="ct-level-done">${"★".repeat(b.stars)} ${fmtTime(b.time)}</span>` : ""}
    </button>`;
  }).join("");
  document.querySelectorAll(".ct-level").forEach((b) => b.addEventListener("click", () => openLevel(LEVELS.find((L) => L.id === +b.dataset.level))));
}

function showMenu() {
  setPhase("menu");
  paused = false;
  renderLevels();
  $("#endScreen").classList.add("is-hidden");
  $("#pauseScreen").classList.add("is-hidden");
  $("#startScreen").classList.remove("is-hidden");
}

// ---------- building the floor ----------

const PLAYER = { id: "you", name: "You", color: "#f4f1e8" };

function makeBot(id, name, color, isYou) {
  const bot = document.createElement("div");
  bot.className = "ct-bot" + (isYou ? " is-you" : "");
  bot.style.setProperty("--c", color);
  bot.innerHTML = `<div class="ct-bot-head"><div class="ct-bot-eyes"><i></i><i></i></div><div class="ct-bot-held"></div></div><div class="ct-bot-bar"><i></i></div><div class="ct-bot-name">${name}</div>`;
  floor.append(bot);
  ui.bots[id] = bot;
  return bot;
}

function buildFloor() {
  floor.querySelectorAll(".ct-st, .ct-belt, .ct-desk, .ct-bot, .ct-float, .ct-truckbay").forEach((el) => el.remove());
  ui.stations = {}; ui.bots = {};
  const belt = document.createElement("div");
  belt.className = "ct-belt";
  belt.style.top = `${(STATIONS.BELT_A.y / 64) * 100}%`;
  belt.style.width = `${STATIONS.BELT_A.x}%`;
  belt.innerHTML = `<div class="ct-belt-tread"></div>`;
  floor.append(belt);
  for (const key of level.stations) {
    const st = STATIONS[key];
    const el = document.createElement("div");
    el.className = "ct-st";
    el.dataset.key = key;
    el.style.left = `${st.x}%`; el.style.top = `${(st.y / 64) * 100}%`;
    const cap = key.startsWith("BIN_") ? RULES.binCap : key === "PACK" ? RULES.packCap : key === "PAINT" ? RULES.paintCap : key === "BELT_A" ? RULES.beltCap : null;
    const hint = key === "DOCK" ? (level.ship === "widgets" ? "ship widgets here" : "ship boxes here") : STATION_HINTS[key];
    el.innerHTML = `<div class="ct-st-label"><span>${st.label}</span><span class="ct-st-cap"></span></div><div class="ct-st-hint">${hint}</div><div class="ct-st-items"></div>`
      + (key === "PAINT" ? `<div class="ct-wear" data-tooltip="Wear. At 100% the machine stops until someone with Repair services it."><i></i></div>` : "");
    el.dataset.cap = cap ?? "";
    floor.append(el);
    ui.stations[key] = el;
  }
  // The main line, drawn between the tiles, through whichever stations this level has.
  const line = ["BELT_A", "PAINT", "PACK", "DOCK"].filter((k) => level.stations.includes(k));
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
  for (const w of game.workers) makeBot(w.id, w.hire.name, w.hire.color).addEventListener("click", (e) => { e.stopPropagation(); focusCard(w); });
  lastVersion = -1;
}

const itemHTML = (it, clickable = false) => it.kind === "box"
  ? `<span class="ct-box${it.building ? " is-building" : ""}" data-id="${it.id ?? ""}"${clickable && !it.building ? ` data-pick="box"` : ""}>${it.building ? `<span class="ct-box-fill"></span>` : ""}${it.colors.map((c) => `<i class="c-${c}"></i>`).join("")}</span>`
  : `<span class="ct-dot c-${it.color}${packPick.has(it.id) ? " is-picked" : ""}" data-id="${it.id ?? ""}"${clickable ? ` data-pick="${it.color}"` : ""}></span>`;

// Widgets you've picked at Pack to box up (ids). Cleared when you pack or walk away.
const packPick = new Set();

// ---------- moving yourself ----------

// Click a station to walk there; click something in it to walk there and pick that up; click the
// floor to walk to that spot.
floor.addEventListener("click", (e) => {
  if (phase === "plan") { nudgeStart(); return; }
  if (phase !== "run" || paused || !game || game.over) return;
  const pick = e.target.closest("[data-pick]");
  const st = e.target.closest(".ct-st");
  const p = game.player;
  // Standing at Pack: clicking a widget there picks it (or un-picks it) for the next box.
  if (st && pick && st.dataset.key === "PACK" && p.station === "PACK" && !p.act && pick.dataset.pick !== "box") {
    const id = +pick.closest("[data-id]").dataset.id;
    if (packPick.has(id)) packPick.delete(id);
    else if (packPick.size < 3) packPick.add(id);
    lastVersion = -1; lastHands = "";
    return;
  }
  if (st) {
    const then = pick ? (pick.dataset.pick === "box" ? { action: "pickUp" } : { action: "pickUp", color: pick.dataset.pick }) : null;
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
  const reading = game.workers.find((w) => w.compiling);
  if (reading) { nudgeStart(); feed(`${reading.hire.name} is still reading their instructions.`, "is-sys"); return; }
  started = true;
  setPhase("run");
  feed(game.workers.length ? "Shift started. Hiring is closed until the next one." : "Shift started.", "is-sys");
  keepTyped();
  buildCrew(); // drop the Let go buttons
  lastHiring = "";
}
$("#goBtn").addEventListener("click", begin);
function nudgeStart() {
  const b = $("#goBtn");
  b.classList.remove("is-nudged"); void b.offsetWidth; b.classList.add("is-nudged");
}

function doAct(act) {
  playerDo(game, act.a);
  if (act.a.action === "pack") packPick.clear();
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
      // Click widgets at Pack to choose which 3 go in the box; with nothing picked, the first 3.
      const widgets = items.filter((i) => i.kind === "widget");
      for (const id of [...packPick]) if (!widgets.some((i) => i.id === id)) packPick.delete(id);
      if (packPick.size === 3) acts.push({ label: "Pack these 3", a: { action: "pack", ids: [...packPick] } });
      else if (packPick.size) acts.push({ label: `Pick ${3 - packPick.size} more to pack`, disabled: true });
      else if (widgets.length >= 3) acts.push({ label: "Pack 3", a: { action: "pack" } });
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
  if (p.station === "PACK" && !busy && !p.holding) body += `<span class="ct-hands-note">Click widgets at Pack to choose which go in the box.</span>`;
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

function renderHiring() {
  const box = $("#hiring");
  const hired = new Set(game.workers.map((w) => w.id));
  const open = level.pool.map((id) => CANDIDATES.find((c) => c.id === id)).filter((c) => !hired.has(c.id));
  const sig = `${started}|${open.map((c) => c.id).join()}`;
  if (sig === lastHiring) return;
  lastHiring = sig;
  if (!level.pool.length && !game.workers.length) { box.innerHTML = ""; return; }
  const payroll = game.workers.reduce((a, w) => a + w.hire.wage, 0);
  const head = `<div class="ct-row"><span class="ct-label">Hire</span><span class="ct-wage" style="margin-left:auto">payroll $${payroll}/min</span></div>`;
  if (started) { box.innerHTML = head + `<p class="ct-blurb">Hiring's closed while the shift runs. You can hire before the next one.</p>`; return; }
  box.innerHTML = head + (open.length ? open.map((c) => `
    <div class="ct-candidate" style="--c:${c.color}">
      <span class="ct-face"></span>
      <div class="ct-candidate-info"><b>${c.name}</b> <span class="ct-wage">$${c.wage}/min</span><br><span class="ct-blurb">${c.blurb}</span>${skillBadges(c)}</div>
      <button class="ct-btn is-gold" type="button" data-hire="${c.id}">Hire</button>
    </div>`).join("") : `<p class="ct-blurb">${level.pool.length ? "You've hired everyone available." : "Nobody's looking for work here."}</p>`);
  box.querySelectorAll("[data-hire]").forEach((b) => b.addEventListener("click", () => hire(b.dataset.hire)));
}

// Hiring or letting someone go rebuilds the floor and the cards; keep what's typed in the cards.
function keepTyped() {
  for (const w of game.workers) {
    if (!ui.cards[w.id]) continue;
    const v = $("textarea", ui.cards[w.id]).value;
    w.draft = v !== (w.orders ?? "") ? v : null; // only unsent edits count as a draft
  }
}
function hire(id) {
  const c = CANDIDATES.find((h) => h.id === id);
  if (started) return;
  keepTyped();
  const w = addWorker(game, c);
  feed(`You hired ${c.name}.`, "is-sys");
  rebuildCrew();
  focusCard(w);
}
function fire(id) {
  if (started) return;
  keepTyped();
  const w = worker(id);
  removeWorker(game, id);
  clearDesk(w);
  feed(`You let ${w.hire.name} go.`, "is-sys");
  rebuildCrew();
}
function rebuildCrew() {
  buildFloor();
  buildCrew();
  lastHiring = "";
  renderHiring();
}

// ---------- crew cards ----------

function buildCrew() {
  const crew = $("#crew");
  crew.innerHTML = "";
  ui.cards = {};
  for (const w of game.workers) {
    const h = w.hire;
    const card = document.createElement("div");
    card.className = "ct-card";
    card.style.setProperty("--c", h.color);
    card.innerHTML = `
      <div class="ct-card-head">
        <span class="ct-face"></span><span class="ct-card-name">${h.name}</span><span class="ct-wage">$${h.wage}/min</span>
        <span class="ct-status"></span>
        <span class="ct-pips"></span>
        ${started ? "" : `<button class="ct-btn ct-small-btn" type="button" data-fire>Let go</button>`}
      </div>
      <p class="ct-blurb">${h.blurb}</p>
      ${skillBadges(h)}
      <div class="ct-card-body">
        <span class="ct-label">${h.name}'s instructions</span>
        <textarea class="ct-textarea" rows="3" placeholder="Tell ${h.name} what to do, in your own words."></textarea>
        <div class="ct-row"><button class="ct-btn is-gold" data-orders>Give instructions</button></div>
        <div class="ct-compile-err" hidden></div>
        <div class="ct-now" hidden></div>
        <form class="ct-row" data-talk>
          <input class="ct-input" placeholder="Say something to ${h.name}…" autocomplete="off">
          <button class="ct-btn" type="submit">Say</button>
        </form>
      </div>`;
    const ta = $("textarea", card);
    ta.value = w.draft ?? w.orders ?? "";
    $("[data-fire]", card)?.addEventListener("click", (e) => { e.stopPropagation(); fire(w.id); });
    for (const el of [$(".ct-card-head", card), $(".ct-blurb", card)]) el.addEventListener("click", () => focusCard(w));
    card.addEventListener("focusin", () => highlight(w));
    $("[data-orders]", card).addEventListener("click", () => {
      const text = ta.value.trim();
      if (!text) { ta.focus(); return; }
      w.draft = null;
      giveInstructions(w, text);
    });
    ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) $("[data-orders]", card).click(); });
    $("[data-talk]", card).addEventListener("submit", (e) => {
      e.preventDefault();
      const input = $("input", e.currentTarget);
      const text = input.value.trim();
      if (!text) return;
      input.value = "";
      message(w, "message", text);
    });
    crew.append(card);
    ui.cards[w.id] = card;
    w._cardSig = null;
  }
}

// Clicking a robot or its card's name/description: highlight both, and put the cursor where
// you'd type to them next (their instructions if they have none, the desk reply if they're
// waiting on you, otherwise the talk box).
function highlight(w) {
  for (const [id, c] of Object.entries(ui.cards)) c.classList.toggle("is-focused", id === w.id);
  for (const [id, b] of Object.entries(ui.bots)) b.classList.toggle("is-selected", id === w.id);
}
function focusCard(w) {
  const card = ui.cards[w.id];
  highlight(w);
  card.scrollIntoView({ block: "nearest", behavior: "smooth" });
  const target = atDesk(w) ? ui.desk[w.id]?.querySelector("input") : w.orders ? $("[data-talk] input", card) : $("textarea", card);
  target?.focus({ preventScroll: true });
}

// What the card says about a worker right now, and the thinking budget as pips.
function cardState(w) {
  if (w.compiling) return ["reading instructions…", "is-thinking"];
  if (ui.thinking[w.id]) return ["thinking…", "is-thinking"];
  if (atDesk(w)) return ["at your desk", "is-waiting"];
  if (w.compileError) return ["can't do these instructions", "is-error"];
  if (w.now) return ["doing a one-off", ""];
  if (w.gen) return ["working", ""];
  return [w.orders ? "out of things to do" : "no instructions", ""];
}
function renderCard(w) {
  const card = ui.cards[w.id];
  if (!card) return;
  const b = budgetOf(w);
  const [st, cls] = cardState(w);
  const sig = `${st}|${b.n}/${b.max}|${w.now?.summary}|${w.compileError}|${w.orders}`;
  if (sig === w._cardSig) return;
  w._cardSig = sig;
  const status = $(".ct-status", card);
  status.textContent = st;
  status.className = `ct-status ${cls}`;
  card.classList.toggle("is-waiting", atDesk(w));
  const pips = $(".ct-pips", card);
  pips.innerHTML = Array.from({ length: b.max }, (_, i) => `<i class="${i < b.n ? "is-on" : ""}"></i>`).join("");
  pips.dataset.tooltip = `Thinking budget: ${b.n} of ${b.max}. ${w.hire.name} spends one to think through something unexpected; it refills by one every ${b.every}s while the shift runs. Talking to them is free.`;
  const err = $(".ct-compile-err", card);
  err.hidden = !w.compileError;
  if (w.compileError) err.innerHTML = `<b>${w.hire.name} can't do these instructions:</b> ${escapeHTML(w.compileError)}`;
  const now = $(".ct-now", card);
  now.hidden = !w.now;
  if (w.now) now.innerHTML = `<span class="ct-label">Doing now, then back to the instructions</span> ${escapeHTML(w.now.summary)}`;
  // A thought can rewrite the instructions; the card always shows the current ones.
  const ta = $("textarea", card);
  if (w.orders && w.draft == null && document.activeElement !== ta && ta.value !== w.orders) ta.value = w.orders;
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
const nameOf = (w) => (w.isPlayer ? "You" : w.hire.name);
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
  w.compileError = null;
  w.compiling = (w.compiling || 0) + 1;
  feed(`<b>You → ${w.hire.name}</b> (instructions): ${escapeHTML(text)}`, "is-boss");
  bubble(w, "…", { thinking: true, hold: true });
  try {
    const r = await compile(g, w, text);
    if (!alive(g, w)) return;
    w.compiling--;
    if (w.orders !== text) return; // newer instructions came in meanwhile
    clearBubble(w);
    bubble(w, r.reply);
    feed(`<b>${w.hire.name}:</b> ${escapeHTML(r.reply)}`);
    w.now = null;
    if (r.skillError) {
      w.compileError = r.skillError;
      w.gen = null;
      feed(`${w.hire.name} can't do those instructions: ${escapeHTML(r.skillError)}`, "is-err");
    } else {
      setProgram(g, w, r.ast);
      w.lastThought = null;
    }
  } catch (e) {
    if (!alive(g, w)) return;
    w.compiling--;
    if (w.orders !== text) return;
    clearBubble(w);
    bubble(w, "(static)");
    w.compileError = "I couldn't make sense of them. Try saying it another way.";
    feed(`${w.hire.name} couldn't turn those instructions into work: ${escapeHTML(e.message)}`, "is-err");
  }
}

/** You said something to a worker ("message"), or yelled to the floor ("yell"). Always answered. */
function message(w, kind, text) {
  if (kind === "message") feed(`<b>You → ${w.hire.name}:</b> ${escapeHTML(text)}`, "is-boss");
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

const LABELS = { talk: "just talking", once: "one-off", change: "new instructions", boss: "needs you" };

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
    feed(`Couldn't reach the model for ${w.hire.name}: ${escapeHTML(e.message)}`, "is-err");
    return false;
  }
  if (!alive(g, w)) return false;
  setThinking(w, -1);
  const label = r.kind === "once" ? `one-off: ${escapeHTML(r.summary)}` : LABELS[r.kind];
  feed(`<b>${w.hire.name}:</b> ${escapeHTML(r.reply)} <span class="ct-kind">(${label})</span>`);
  if (r.kind === "boss") {
    if (!atDesk(w)) goToDesk(g, w, trigger.text);
    deskMessage(w, escapeHTML(r.reply));
    return true;
  }
  bubble(w, r.reply);
  if (r.kind === "once") {
    w.now = { summary: r.summary };
    setNow(g, w, r.nowAst);
  } else if (r.kind === "change") {
    w.orders = r.instructions;
    w.draft = null;
    w.compileError = null;
    w.now = null;
    setProgram(g, w, r.ast);
    ui.cards[w.id]?.classList.remove("is-changed"); void ui.cards[w.id]?.offsetWidth;
    ui.cards[w.id]?.classList.add("is-changed");
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
  return "I got tangled up in my instructions. Can you tell me again, another way?";
}

function onUnexpected(w, ev) {
  if (atDesk(w) || ui.thinking[w.id] || w.compiling) return; // already on it
  const problem = `${ev.reason}: ${ev.detail}`;
  const repeat = w.lastThought?.problem === problem && game.t - w.lastThought.t < REPEAT_WINDOW;
  if (!repeat && budgetOf(w).n > 0) {
    const text = ev.reason === "ended" ? `${ev.detail}.` : ev.reason === "stuck" ? `you keep failing: ${ev.detail}.`
      : `your program broke down (${ev.detail}), so you've stopped working.`;
    think(w, { kind: "unexpected", text }, problem);
    return;
  }
  // Out of thoughts, or thinking didn't fix it: come and ask.
  goToDesk(game, w, ev.detail);
  const line = deskLine(ev);
  deskMessage(w, escapeHTML(line));
  feed(`<b>${w.hire.name}</b> (coming to your desk): ${escapeHTML(line)}`);
}

$("#yellForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = $("#yellInput");
  const text = input.value.trim();
  if (!text || !game || !game.workers.length) return;
  input.value = "";
  feed(`<b>You (yelling):</b> ${escapeHTML(text)}`, "is-boss");
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

/** A worker at your desk gets a row under the floor with the whole message and a reply box. */
function deskMessage(w, html) {
  let el = ui.desk[w.id];
  if (!el) {
    el = document.createElement("div");
    el.className = "ct-deskmsg";
    el.style.setProperty("--c", w.hire.color);
    el.innerHTML = `<span class="ct-face"></span><div class="ct-deskmsg-text"></div>
      <form><input class="ct-input" placeholder="Answer ${w.hire.name}…" autocomplete="off"><button class="ct-btn is-gold" type="submit">Reply</button></form>`;
    $("form", el).addEventListener("submit", (e) => {
      e.preventDefault();
      const input = $("input", el);
      const text = input.value.trim();
      if (!text) return;
      input.value = "";
      message(w, "message", text);
    });
    $("#deskPanel").append(el);
    ui.desk[w.id] = el;
  }
  $(".ct-deskmsg-text", el).innerHTML = `<b>${w.hire.name}:</b> ${html}`;
  bubble(w, "Boss?", { problem: true, hold: true });
}
function clearDesk(w) {
  ui.desk[w.id]?.remove();
  delete ui.desk[w.id];
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
function feed(html, cls = "") {
  const box = $("#feed");
  const stick = box.scrollHeight - box.scrollTop - box.clientHeight < 30;
  const line = document.createElement("div");
  line.className = `ct-line ${cls}`;
  line.innerHTML = html;
  box.append(line);
  while (box.children.length > 200) box.firstChild.remove();
  if (stick) box.scrollTop = box.scrollHeight;
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
    const w = ev.worker && worker(ev.worker);
    switch (ev.type) {
      case "say":
        bubble(w, ev.text);
        if (lastSaid[w.id] !== ev.text) feed(`<b>${w.hire.name}:</b> ${escapeHTML(ev.text)}`);
        lastSaid[w.id] = ev.text;
        break;
      case "fail": if (w) oops(w, w.isPlayer ? ev.why.replace(/^I'm /, "you're ").replace(/\bmy\b/g, "your") : `can't: ${ev.why}`); break;
      case "unexpected": if (w && !w.isPlayer) onUnexpected(w, ev); break;
      case "thinkRequest":
        // think() in a program only goes ahead with budget left; otherwise they carry on.
        if (w && !ui.thinking[w.id] && budgetOf(w).n > 0) think(w, { kind: "think", text: ev.reason || "(no reason given)" }, `think: ${ev.reason}`);
        break;
      case "nowDone":
        if (w?.now) feed(`${w.hire.name} finished the one-off (${escapeHTML(w.now.summary)}) and went back to their instructions.`, "is-sys");
        if (w) w.now = null;
        break;
      case "worn":
        feed(`The paint machine is worn out and stopped. It needs servicing.`, "is-sys");
        floater("worn out", STATIONS.PAINT.x, STATIONS.PAINT.y - 8, true);
        break;
      case "serviced": feed(`${nameOf(w)} serviced the paint machine.`, "is-sys"); break;
      case "ship": {
        const what = ev.item === "widget" ? `a ${ev.colors[0]} widget`
          : ev.colors.every((c) => c === ev.colors[0]) ? `a ${ev.colors[0]} box` : `a mixed box (${ev.colors.join(", ")})`;
        feed(ev.matched ? `${nameOf(w)} shipped ${what}.` : `${nameOf(w)} shipped ${what} that isn't on the order. Wasted.`, "is-sys");
        floater(ev.matched ? "+1" : "not ordered", STATIONS.DOCK.x, STATIONS.DOCK.y - 8, !ev.matched);
        haul(ev.item === "widget" ? { kind: "widget", color: ev.colors[0] } : { kind: "box", colors: ev.colors });
        break;
      }
      case "gaveUp": clearBubble(w); clearDesk(w); feed(`${w.hire.name} gave up waiting and went back to work.`, "is-sys"); break;
      case "end": endLevel(); break;
    }
  }
}

// ---------- the loop ----------

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
    const held = w.holding ? itemHTML(w.holding) : "";
    if (bot._held !== held) { bot.querySelector(".ct-bot-held").innerHTML = held; bot._held = held; }
    // Anything that takes time shows how far along it is (waiting fills toward giving up).
    const pr = actProgress(game, w);
    const bar = bot.querySelector(".ct-bot-bar");
    bar.classList.toggle("is-on", !!pr);
    bar.classList.toggle("is-waiting", !!pr?.waiting);
    if (pr) bar.firstElementChild.style.transform = `scaleX(${pr.p})`;
    if (w.isPlayer) continue;
    if (!atDesk(w) && ui.desk[w.id]) { clearDesk(w); clearBubble(w); }
    if (started && !game.over) refill(w);
    renderCard(w);
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
  const labor = `$${Math.floor(game.laborCost)}`;
  if ($("#labor").textContent !== labor) $("#labor").textContent = labor;
  if (game.player.station !== "PACK" && packPick.size) { packPick.clear(); lastVersion = -1; }
  // Center stat: how much of today's order has shipped.
  const total = game.order.reduce((a, l) => a + l.count, 0), done = game.order.reduce((a, l) => a + l.done, 0);
  const stat = `${done}/${total}`;
  if (stat !== lastStat) { lastStat = stat; $("#stat").textContent = stat; }
  const clock = fmtTime(game.t);
  if (clock !== lastClock) { lastClock = clock; $("#clock").textContent = clock; }
  const order = game.order.map((l) => `${l.color}${l.done}`).join();
  if (order !== lastOrder) {
    lastOrder = order;
    $("#orders").innerHTML = game.order.map((l) => {
      const icon = level.ship === "boxes"
        ? `<span class="ct-ticket-dots">${(l.color === "any" ? `<span class="ct-dot c-any"></span>` : `<span class="ct-dot c-${l.color}"></span>`).repeat(3)}</span>`
        : `<span class="ct-dot ${l.color === "any" ? "c-any" : `c-${l.color}`}"></span>`;
      return `<span class="ct-ticket ${l.done >= l.count ? "is-done" : ""}" title="${orderLineText(level, l)}">${icon}<span class="ct-ticket-pay">${l.done}/${l.count}</span></span>`;
    }).join("");
  }
  renderHands();
  renderHiring();
  renderCoach();
}

// One line on the floor telling you what to do next.
function renderCoach() {
  let text = "";
  const deskVisitor = game.workers.find((w) => ui.desk[w.id]);
  const idle = game.workers.find((w) => !w.orders && !w.compiling);
  const cantDo = game.workers.find((w) => w.compileError);
  const open = level.pool.map((id) => CANDIDATES.find((c) => c.id === id)).filter((c) => !game.workers.some((w) => w.id === c.id));
  if (phase === "plan") text = idle ? `${level.start} ${idle.hire.name} still needs instructions.`
    : cantDo ? `${cantDo.hire.name} can't do their instructions. Change them, or let ${cantDo.hire.name} go.`
    : level.start + (level.pool.length ? "" : " Press <b>Start</b> when you're ready.");
  else if (deskVisitor) text = `${deskVisitor.hire.name} came to your desk. Answer below the floor.`;
  else if (idle) text = `${idle.hire.name} is waiting for instructions. Write them in their card and press <b>Give instructions</b>.`;
  else if (cantDo) text = `${cantDo.hire.name} can't do their instructions. Give them ones they can do.`;
  const el = $("#coach");
  if (el._text !== text) { el.innerHTML = text; el._text = text; }
}

function frame(now) {
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  if (game && phase === "run" && started && !paused && !game.over) { step(game, dt); handleEvents(); }
  if (game) render();
  requestAnimationFrame(frame);
}

// ---------- screens ----------

function openLevel(L) {
  level = L;
  game = newGame(L, []);
  started = false;
  lastVersion = -1; lastStat = null; lastClock = null; lastOrder = ""; lastHands = ""; lastHiring = "";
  ui.thinking = {};
  Object.keys(ui.desk).forEach((id) => clearDesk({ id }));
  keysDown.clear();
  buildFloor();
  buildCrew();
  renderHiring();
  $("#levelName").textContent = `Level ${L.id}: ${L.name}`;
  $("#feed").innerHTML = "";
  feed(level.pool.length ? "Hire your crew and write their instructions, then press Start." : "Press Start when you're ready.", "is-sys");
  packPick.clear();
  $("#startScreen").classList.add("is-hidden");
  $("#endScreen").classList.add("is-hidden");
  $("#pauseScreen").classList.add("is-hidden");
  paused = false;
  setPhase("plan");
}

function endLevel() {
  setPhase("end");
  const t = game.t;
  const stars = t <= level.stars[0] ? 3 : t <= level.stars[1] ? 2 : 1;
  const prev = best[level.id];
  if (!prev || t < prev.time) best[level.id] = { time: t, stars };
  const starSVG = `<svg viewBox="0 0 24 24"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"/></svg>`;
  const cut = ["finish", `≤ ${fmtTime(level.stars[1])}`, `≤ ${fmtTime(level.stars[0])}`];
  $("#endTitle").textContent = "Order filled";
  $("#stars").innerHTML = [0, 1, 2].map((i) => `<div class="ct-star ${i < stars ? "is-on" : ""}">${starSVG}<span>${cut[i]}</span></div>`).join("");
  $("#endStats").innerHTML = [["Time", fmtTime(t)], ["Labor cost", `$${Math.round(game.laborCost)}`], ["Crew", game.workers.length]]
    .map(([l, v]) => `<div><div class="ct-label">${l}</div><div class="ct-stat-value">${v}</div></div>`).join("");
  const next = LEVELS.find((L) => L.id === level.id + 1);
  const btns = [];
  if (next) btns.push(`<button class="ct-btn is-gold" data-go="next">Next: ${next.name}</button>`);
  btns.push(`<button class="ct-btn ${next ? "" : "is-gold"}" data-go="again">Try again</button>`);
  btns.push(`<button class="ct-btn" data-go="menu">Levels</button>`);
  $("#endBtns").innerHTML = btns.join("");
  $("#endBtns").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.go === "next") openLevel(next);
    else if (b.dataset.go === "again") openLevel(level);
    else showMenu();
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
$("#restartBtn").addEventListener("click", () => openLevel(level));
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
  get game() { return game; }, get phase() { return phase; }, get started() { return started; },
  openLevel: (n) => openLevel(LEVELS[n - 1]), unlockAll: () => { unlocked = LEVELS.length; renderLevels(); },
  step: (dt) => { if (started) step(game, dt); handleEvents(); render(); },
  give: (id, text) => giveInstructions(worker(id), text), say: (id, text) => message(worker(id), "message", text),
  setPaused, begin, hire, playerActions,
};
