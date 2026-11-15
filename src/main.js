// The game screen. Phases: menu (pick a level) → plan (write every job) → loading (the crew reads
// their jobs) → run (the clock goes; you can still talk, yell and change jobs) → end.
import { newGame, step, resume, setScript, atDesk, STATIONS, DESK, RULES, actionLabel } from "./sim.js";
import { HIRES, respond, report } from "./brains.js";
import { LEVELS } from "./levels.js";
import { backendLabel } from "./llm.js";

const $ = (sel, root = document) => root.querySelector(sel);
const floor = $("#floor");
let game = null;
let level = LEVELS[0];
let phase = "menu";
let paused = false;
let lastFrame = performance.now();
let lastVersion = -1, lastStat = null, lastClock = null, lastOrders = "";
const ui = { bots: {}, cards: {}, stations: {}, desk: {}, thinking: {}, bubbleTimers: {}, oopsTimers: {} };
// Progress and jobs live in memory only for now (no localStorage while iterating).
let unlocked = 1;
const done = new Set();
const jobs = {}; // jobs[levelId][workerId] = { text, script, memory }

$("#backendNote").textContent = `Workers run on ${backendLabel}.`;

const STATION_HINTS = {
  BELT_A: "widgets arrive here",
  PAINT: "repaints a widget",
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
    return `<button class="ct-level" data-level="${L.id}" ${open ? "" : "disabled"}>
      <span class="ct-level-num">${L.id}</span>
      <span><span class="ct-level-name">${open ? L.name : "???"}</span><br><span class="ct-level-blurb">${open ? L.blurb : "Finish the level before."}</span></span>
      ${done.has(L.id) ? `<span class="ct-level-done">done</span>` : ""}
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

function buildFloor() {
  floor.querySelectorAll(".ct-st, .ct-belt, .ct-desk, .ct-bot, .ct-float").forEach((el) => el.remove());
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
    el.style.left = `${st.x}%`; el.style.top = `${(st.y / 64) * 100}%`;
    const cap = key.startsWith("BIN_") ? RULES.binCap : key === "PACK" ? RULES.packCap : key === "PAINT" ? RULES.paintCap : key === "BELT_A" ? RULES.beltCap : null;
    const hint = key === "DOCK" ? (level.ship === "widgets" ? "ship widgets here" : "ship boxes here") : STATION_HINTS[key];
    el.innerHTML = `<div class="ct-st-label"><span>${st.label}</span><span class="ct-st-cap"></span></div><div class="ct-st-hint">${hint}</div><div class="ct-st-items"></div>`;
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
  floor.append(desk);
  for (const w of game.workers) {
    const bot = document.createElement("div");
    bot.className = "ct-bot";
    bot.style.setProperty("--c", w.hire.color);
    bot.innerHTML = `<div class="ct-bot-head"><div class="ct-bot-eyes"><i></i><i></i></div><div class="ct-bot-held"></div></div><div class="ct-bot-name">${w.hire.name}</div>`;
    bot.addEventListener("click", () => focusCard(w));
    floor.append(bot);
    ui.bots[w.id] = bot;
  }
}

const itemHTML = (it) => it.kind === "box"
  ? `<span class="ct-box">${it.colors.map((c) => `<i class="c-${c}"></i>`).join("")}</span>`
  : `<span class="ct-dot c-${it.color}"></span>`;

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
        <span class="ct-face"></span><span class="ct-card-name">${h.name}</span>${level.payroll ? `<span class="ct-wage">$${h.wage}/min</span>` : ""}
        <span class="ct-status"></span>
      </div>
      <p class="ct-blurb">${h.blurb}</p>
      <div class="ct-card-body">
        <span class="ct-label">${h.name}'s job</span>
        <textarea class="ct-textarea" rows="3" placeholder="Tell ${h.name} what to do, in your own words."></textarea>
        ${level.examples.length ? `<div class="ct-suggest ct-plan-only"><span class="ct-suggest-label">Try:</span>${level.examples.map((t) => `<button type="button">${t}</button>`).join("")}</div>` : ""}
        <div class="ct-row ct-run-only"><button class="ct-btn" data-orders>Change job</button></div>
        <span class="ct-label ct-run-only">What they'll do, on repeat</span>
        <div class="ct-script ct-run-only"></div>
        <form class="ct-row ct-run-only" data-talk>
          <input class="ct-input" placeholder="Say something to ${h.name}…" autocomplete="off">
          <button class="ct-btn" type="submit">Say</button>
        </form>
      </div>`;
    const ta = $("textarea", card);
    ta.value = w.orders ?? "";
    $("[data-orders]", card).addEventListener("click", () => {
      const text = ta.value.trim();
      if (!text) { ta.focus(); return; }
      talk(w, "orders", text);
    });
    card.querySelectorAll(".ct-suggest button").forEach((b) => b.addEventListener("click", () => { ta.value = b.textContent; ta.focus(); }));
    $("[data-talk]", card).addEventListener("submit", (e) => {
      e.preventDefault();
      const input = $("input", e.currentTarget);
      const text = input.value.trim();
      if (!text) return;
      input.value = "";
      talk(w, "chat", text);
    });
    crew.append(card);
    ui.cards[w.id] = card;
    renderScript(w);
  }
}

function focusCard(w) {
  const card = ui.cards[w.id];
  card.scrollIntoView({ block: "nearest", behavior: "smooth" });
  const target = atDesk(w) ? ui.desk[w.id]?.querySelector("input") : phase === "run" ? $("[data-talk] input", card) : $("textarea", card);
  target?.focus({ preventScroll: true });
}

function renderScript(w) {
  const box = $(".ct-script", ui.cards[w.id]);
  if (!w.script.length) { box.innerHTML = `<span class="ct-script-empty">Nothing. Standing around.</span>`; return; }
  box.innerHTML = w.script.map((a, i) => `<span class="ct-chip" data-i="${i}">${escapeHTML(actionLabel(a))}</span>`).join("");
  w._shownCur = null;
}

const worker = (id) => game.workers.find((w) => w.id === id);
const escapeHTML = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// ---------- talking to the model ----------

function setThinking(w, delta) {
  ui.thinking[w.id] = Math.max(0, (ui.thinking[w.id] || 0) + delta);
  const on = ui.thinking[w.id] > 0;
  ui.bots[w.id]?.classList.toggle("is-thinking", on);
  if (on) bubble(w, "…", { thinking: true, hold: true });
  else if (ui.bots[w.id]?.querySelector(".ct-bubble.is-thinking")) clearBubble(w);
}

/** Send something to a worker. Resolves true if they answered. */
async function talk(w, kind, text) {
  const g = game;
  if (kind === "orders") feed(`<b>You → ${w.hire.name}</b> (job): ${escapeHTML(text)}`, "is-boss");
  else if (kind === "chat") feed(`<b>You → ${w.hire.name}:</b> ${escapeHTML(text)}`, "is-boss");
  setThinking(w, +1);
  try {
    const r = await respond(g, w, kind, text);
    if (g !== game) return false;
    setThinking(w, -1);
    bubble(w, r.reply);
    feed(`<b>${w.hire.name}:</b> ${escapeHTML(r.reply)}`);
    if (r.script) { setScript(g, w, r.script); renderScript(w); }
    else resume(g, w);
    return true;
  } catch (e) {
    if (g !== game) return false;
    setThinking(w, -1);
    bubble(w, "(static)");
    feed(`Couldn't reach the model for ${w.hire.name}: ${escapeHTML(e.message)}`, "is-err");
    return false;
  }
}

$("#yellForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = $("#yellInput");
  const text = input.value.trim();
  if (!text || !game) return;
  input.value = "";
  feed(`<b>You (yelling):</b> ${escapeHTML(text)}`, "is-boss");
  for (const w of game.workers) talk(w, "yell", text);
});

// ---------- planning: write every job, then start ----------

async function startLevel() {
  if (phase !== "plan") return;
  const want = game.workers.map((w) => ({ w, text: $("textarea", ui.cards[w.id]).value.trim() }));
  if (!want.some((j) => j.text)) {
    $("#planNote").textContent = "Write at least one job first.";
    return;
  }
  setPhase("loading");
  document.querySelectorAll(".ct-card textarea").forEach((t) => (t.disabled = true));
  const saved = jobs[level.id] ?? {};
  const results = await Promise.all(want.map(({ w, text }) => {
    if (!text) return true;
    // Same job as last time: reuse the routine they already worked out.
    const prev = saved[w.id];
    if (prev && prev.text === text && prev.script?.length) {
      Object.assign(w, { orders: prev.text, memory: prev.memory });
      setScript(game, w, prev.script); renderScript(w);
      return true;
    }
    return talk(w, "orders", text);
  }));
  document.querySelectorAll(".ct-card textarea").forEach((t) => (t.disabled = false));
  if (!results.some(Boolean)) {
    setPhase("plan");
    $("#planNote").textContent = "Nobody could be reached. Is the server running? Try again.";
    return;
  }
  setPhase("run");
  feed(level.shift ? "Shift started." : "Go!", "is-sys");
}
$("#goBtn").addEventListener("click", startLevel);

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
      talk(w, "chat", text);
    });
    $("#deskPanel").append(el);
    ui.desk[w.id] = el;
  }
  $(".ct-deskmsg-text", el).innerHTML = `<b>${w.hire.name}:</b> ${html}`;
  bubble(w, "!", { problem: true, hold: true });
}
function clearDesk(w) {
  ui.desk[w.id]?.remove();
  delete ui.desk[w.id];
}

function oops(w, text) {
  const bot = ui.bots[w.id];
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
function floater(text, x, y, scrap) {
  const el = document.createElement("div");
  el.className = "ct-float" + (scrap ? " is-scrap" : "");
  el.textContent = text;
  el.style.left = `${x}%`; el.style.top = `${(y / 64) * 100}%`;
  floor.append(el);
  setTimeout(() => el.remove(), 1700);
}

const FUMBLES = ["Whoops!", "Oh no.", "*clang*", "That was on purpose.", "Butterfingers."];
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
      case "ask":
        deskMessage(w, escapeHTML(ev.text));
        feed(`<b>${w.hire.name} asks:</b> ${escapeHTML(ev.text)}`);
        break;
      case "fail": oops(w, `can't: ${ev.why}`); break;
      case "fumble":
        bubble(w, FUMBLES[Math.floor(Math.random() * FUMBLES.length)]);
        feed(`${w.hire.name} dropped a ${ev.item}.`, "is-sys");
        break;
      case "jam": feed(`The paint machine jammed.`, "is-sys"); break;
      case "fixed": feed(`${w.hire.name} fixed the paint machine.`, "is-sys"); break;
      case "ship": {
        let what;
        if (ev.item === "widget") what = `a ${ev.colors[0]} widget`;
        else if (level.ship === "boxes") what = "a box";
        else {
          const same = ev.colors.every((c) => c === ev.colors[0]);
          what = ev.matched ? `a ${ev.colors[0]} box` : same ? `a ${ev.colors[0]} box nobody ordered, for scrap` : `a mixed box (${ev.colors.join(", ")}) for scrap`;
        }
        feed(`${w.hire.name} shipped ${what}: +$${ev.pay}`, "is-sys");
        floater(`+$${ev.pay}`, STATIONS.DOCK.x, STATIONS.DOCK.y - 8, !ev.matched);
        break;
      }
      case "payroll": feed(`Payroll: −$${ev.amount}`, "is-sys"); break;
      case "gaveUp": clearBubble(w); clearDesk(w); feed(`${w.hire.name} gave up waiting and went back to work.`, "is-sys"); break;
      case "stuck": comeComplain(w, ev.failures); break;
      case "end": endLevel(); break;
    }
  }
}

async function comeComplain(w, failures) {
  const g = game;
  deskMessage(w, `<i>walking over…</i>`);
  try {
    const reply = await report(g, w, failures);
    if (g !== game) return;
    if (!atDesk(w)) return; // you already sorted it out
    deskMessage(w, escapeHTML(reply));
    feed(`<b>${w.hire.name}</b> (at your desk): ${escapeHTML(reply)}`);
  } catch (e) {
    if (g !== game || !atDesk(w)) return;
    deskMessage(w, "Uh, boss? We have a problem.");
  }
}

// ---------- the loop ----------

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const money = (n) => (n < 0 ? `−$${-n}` : `$${n}`);

function render() {
  const k = floor.clientWidth / 100;
  floor.style.setProperty("--u", `${k}px`);
  for (const w of game.workers) {
    const bot = ui.bots[w.id];
    // Spread the crew out side by side so robots at one station don't stack.
    // Drawn in front of (below) the station tile, so they don't cover what's in it.
    const spread = (w.index - (game.workers.length - 1) / 2) * 6.5;
    bot.style.transform = `translate(${(w.x + spread) * k}px, ${(w.y + 11) * k}px)`;
    const held = w.holding ? itemHTML(w.holding) : "";
    if (bot._held !== held) { bot.querySelector(".ct-bot-held").innerHTML = held; bot._held = held; }
    if (!atDesk(w) && ui.desk[w.id]) { clearDesk(w); clearBubble(w); }
    const card = ui.cards[w.id];
    const status = $(".ct-status", card);
    const waiting = atDesk(w);
    const st = ui.thinking[w.id] ? "thinking…" : waiting ? "at your desk" : phase !== "run" ? "" : w.script.length ? "working" : "idle";
    if (status.textContent !== st) {
      status.textContent = st;
      status.className = "ct-status" + (st === "thinking…" ? " is-thinking" : waiting ? " is-waiting" : "");
      card.classList.toggle("is-waiting", waiting);
    }
    if (w._shownCur !== w.cur) {
      card.querySelectorAll(".ct-chip.is-now").forEach((c) => c.classList.remove("is-now"));
      card.querySelector(`.ct-chip[data-i="${w.cur}"]`)?.classList.add("is-now");
      w._shownCur = w.cur;
    }
  }
  if (game.version !== lastVersion) {
    lastVersion = game.version;
    for (const [key, el] of Object.entries(ui.stations)) {
      const items = game.stations[key];
      el.querySelector(".ct-st-items").innerHTML = items.map(itemHTML).join("");
      el.querySelector(".ct-st-cap").textContent = el.dataset.cap ? `${items.length}/${el.dataset.cap}` : "";
      el.classList.toggle("is-jammed", key === "PAINT" && game.paintJammed);
    }
  }
  // Center stat: progress toward the goal, or cash on a timed shift.
  const stat = level.goal ? `${game.shipped}/${level.goal.ship}` : money(Math.round(game.cash));
  if (stat !== lastStat) {
    lastStat = stat;
    $("#stat").textContent = stat;
    $("#stat").classList.toggle("is-neg", !level.goal && game.cash < 0);
  }
  const clock = level.shift ? fmtTime(Math.max(0, Math.ceil(level.shift - game.t))) : fmtTime(game.t);
  if (clock !== lastClock) { lastClock = clock; $("#clock").textContent = clock; }
  const orders = level.orders ? game.orders.map((o) => o.id).join(",") : "none";
  if (orders !== lastOrders) {
    lastOrders = orders;
    $("#orders").innerHTML = level.orders
      ? game.orders.map((o) => `<span class="ct-ticket" title="A box of 3 ${o.color} widgets pays $${o.pay}"><span class="ct-ticket-dots">${`<span class="ct-dot c-${o.color}"></span>`.repeat(3)}</span><span class="ct-ticket-pay">$${o.pay}</span></span>`).join("")
      : `<span class="ct-goal">${level.howto}</span>`;
  }
  renderCoach();
}

// One line on the floor telling you what to do next.
function renderCoach() {
  let text = "";
  const atDeskNow = game.workers.find((w) => ui.desk[w.id]);
  if (phase === "plan") text = level.plan;
  else if (phase === "loading") text = "Your crew is reading their jobs…";
  else if (phase === "run") {
    if (atDeskNow) text = `${atDeskNow.hire.name} came to your desk. Answer below the floor.`;
    else if (game.shipped === 0 && game.t > 25) text = "Nothing's shipped yet. Watch what they do, and change a job if it's wrong.";
    else if (level.orders && game.shipped === 0) text = "Three widgets have to reach <b>Pack</b>, someone packs them into a box, and someone carries the box to the <b>Dock</b>.";
    else if (level.orders && game.filled === 0) text = "A box only pays well if all 3 widgets match an order up top. Mixed boxes pay $5.";
  }
  const el = $("#coach");
  if (el._text !== text) { el.innerHTML = text; el._text = text; }
}

function frame(now) {
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  if (game && phase === "run" && !paused && !game.over) { step(game, dt); handleEvents(); }
  if (game) render();
  requestAnimationFrame(frame);
}

// ---------- screens ----------

function openLevel(L) {
  // Remember this level's jobs before leaving it.
  if (game) saveJobs();
  level = L;
  game = newGame(L, L.hires.map((id) => HIRES.find((h) => h.id === id)));
  const saved = jobs[L.id] ?? {};
  for (const w of game.workers) if (saved[w.id]) w.orders = saved[w.id].text;
  lastVersion = -1; lastStat = null; lastClock = null; lastOrders = "";
  ui.thinking = {};
  Object.keys(ui.desk).forEach((id) => clearDesk({ id }));
  buildFloor();
  buildCrew();
  $("#levelName").textContent = `Level ${L.id}: ${L.name}`;
  $("#statLabel").textContent = L.goal ? "Shipped" : "Cash";
  $("#goalLabel").textContent = L.orders ? "Customers want" : "Goal";
  $("#planNote").textContent = L.shift
    ? "The clock starts when you press Start. You can still change jobs, talk and yell while they work."
    : "Nothing moves until you press Start. You can still change jobs and talk to them while they work.";
  $("#feed").innerHTML = "";
  $("#startScreen").classList.add("is-hidden");
  $("#endScreen").classList.add("is-hidden");
  $("#pauseScreen").classList.add("is-hidden");
  paused = false;
  setPhase("plan");
  $("textarea", ui.cards[game.workers[0].id]).focus({ preventScroll: true });
}

function saveJobs() {
  const saved = (jobs[level.id] ??= {});
  for (const w of game.workers) {
    const text = ui.cards[w.id] ? $("textarea", ui.cards[w.id]).value.trim() : w.orders;
    // Keep the worked-out routine only if the job text is the one it was made from.
    saved[w.id] = { text, script: text === w.orders ? w.script : null, memory: w.memory };
  }
}

function endLevel() {
  setPhase("end");
  saveJobs();
  const starSVG = `<svg viewBox="0 0 24 24"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"/></svg>`;
  const next = LEVELS.find((L) => L.id === level.id + 1);
  const btns = [];
  if (level.goal) {
    done.add(level.id);
    unlocked = Math.max(unlocked, level.id + 1);
    $("#endTitle").textContent = "Level complete";
    $("#stars").innerHTML = "";
    $("#endStats").innerHTML = [["Time", fmtTime(game.t)], ["Shipped", game.shipped], ["Earned", money(game.earned)]]
      .map(([l, v]) => `<div><div class="ct-label">${l}</div><div class="ct-stat-value">${v}</div></div>`).join("");
    if (next) btns.push(`<button class="ct-btn is-gold" data-go="next">Next: ${next.name}</button>`);
    btns.push(`<button class="ct-btn" data-go="again">Play again</button>`);
  } else {
    const profit = Math.round(game.cash - RULES.startCash);
    const stars = level.stars.filter((p) => profit >= p).length;
    if (stars > 0) { done.add(level.id); unlocked = Math.max(unlocked, level.id + 1); }
    $("#endTitle").textContent = "Shift over";
    $("#stars").innerHTML = level.stars.map((p, i) => `<div class="ct-star ${i < stars ? "is-on" : ""}">${starSVG}<span>+$${p}</span></div>`).join("");
    $("#endStats").innerHTML = [["Profit", money(profit)], ["Orders filled", game.filled], ["Scrap boxes", game.scrap]]
      .map(([l, v]) => `<div><div class="ct-label">${l}</div><div class="ct-stat-value">${v}</div></div>`).join("");
    btns.push(`<button class="ct-btn is-gold" data-go="again">Another shift</button>`);
  }
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
  $("#pauseScreen").classList.toggle("is-hidden", !p);
}

$("#pauseBtn").addEventListener("click", () => { if ((phase === "run" && !game.over) || phase === "plan") setPaused(!paused); });
$("#resumeBtn").addEventListener("click", () => setPaused(false));
$("#restartBtn").addEventListener("click", () => openLevel(level));
$("#menuBtn").addEventListener("click", () => { saveJobs(); showMenu(); });
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && phase === "run" && !game.over) setPaused(!paused);
});

renderLevels();
requestAnimationFrame(frame);

// Test hook: drive the game from Playwright or the console.
window.ct = {
  get game() { return game; }, get phase() { return phase; },
  openLevel: (n) => openLevel(LEVELS[n - 1]), startLevel, unlockAll: () => { unlocked = LEVELS.length; renderLevels(); },
  setScript: (id, actions) => { const w = worker(id); setScript(game, w, actions); renderScript(w); },
  step: (dt) => { step(game, dt); handleEvents(); render(); },
  talk: (id, kind, text) => talk(worker(id), kind, text), setPaused,
};
