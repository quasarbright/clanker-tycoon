// The game screen: draws the sim, wires orders/chat/yelling to the model, and plays out events.
import { newGame, step, resume, setScript, atDesk, STATIONS, DESK, RULES, actionLabel } from "./sim.js";
import { HIRES, respond, report } from "./brains.js";
import { backendLabel } from "./llm.js";

// Profit (cash minus starting cash) needed for one, two and three stars. From tools/balance.mjs:
// doing nothing is −$64, one careless carrier about −$15, a crew painting to the orders $10–160.
const STAR_PROFIT = [20, 60, 120];

const $ = (sel, root = document) => root.querySelector(sel);
const floor = $("#floor");
let game = null;
let paused = true;
let selected = null;
let lastFrame = performance.now();
let lastVersion = -1, lastCash = null, lastClock = null, lastOrders = "";
const ui = { bots: {}, cards: {}, stations: {}, belt: null, thinking: {}, bubbleTimers: {}, oopsTimers: {} };

$("#backendNote").textContent = `Workers run on ${backendLabel}.`;

// ---------- building the floor ----------

function buildFloor() {
  floor.querySelectorAll(".ct-st, .ct-belt, .ct-desk, .ct-bot").forEach((el) => el.remove());
  const belt = document.createElement("div");
  belt.className = "ct-belt";
  belt.style.top = `${(STATIONS.BELT_A.y / 64) * 100}%`;
  belt.style.width = `${STATIONS.BELT_A.x}%`;
  belt.innerHTML = `<div class="ct-belt-tread"></div>`;
  floor.append(belt);
  ui.belt = belt;
  for (const [key, st] of Object.entries(STATIONS)) {
    const el = document.createElement("div");
    el.className = "ct-st";
    el.style.left = `${st.x}%`; el.style.top = `${(st.y / 64) * 100}%`;
    const cap = key.startsWith("BIN_") ? RULES.binCap : key === "PACK" ? RULES.packCap : key === "PAINT" ? RULES.paintCap : key === "BELT_A" ? RULES.beltCap : null;
    el.innerHTML = `<div class="ct-st-label"><span>${st.label}</span><span class="ct-st-cap"></span></div><div class="ct-st-items"></div>`;
    el.dataset.cap = cap ?? "";
    floor.append(el);
    ui.stations[key] = el;
  }
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
    bot.addEventListener("click", () => select(w.id, true));
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
  for (const w of game.workers) {
    const h = w.hire;
    const card = document.createElement("div");
    card.className = "ct-card";
    card.style.setProperty("--c", h.color);
    card.innerHTML = `
      <div class="ct-card-head">
        <span class="ct-face"></span><span class="ct-card-name">${h.name}</span><span class="ct-wage">$${h.wage}/min</span>
        <span class="ct-status"></span>
      </div>
      <p class="ct-blurb">${h.blurb}</p>
      <div class="ct-card-body">
        <span class="ct-label">Standing orders</span>
        <textarea class="ct-textarea" rows="3" placeholder="e.g. Bring red widgets from the belt to the pack station"></textarea>
        <div class="ct-row"><button class="ct-btn is-gold" data-orders>Give orders</button></div>
        <span class="ct-label">What they'll do, on repeat</span>
        <div class="ct-script"></div>
        <form class="ct-row" data-talk>
          <input class="ct-input" placeholder="Say something to ${h.name}…" autocomplete="off">
          <button class="ct-btn" type="submit">Say</button>
        </form>
      </div>`;
    const ta = $("textarea", card);
    ta.value = w.orders ?? "";
    $(".ct-card-head", card).addEventListener("click", () => select(w.id));
    $("[data-orders]", card).addEventListener("click", () => {
      const text = ta.value.trim();
      if (!text) { ta.focus(); return; }
      $("#nudge").classList.add("is-gone");
      talk(w, "orders", text);
    });
    ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) $("[data-orders]", card).click(); });
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

function select(id, focusOrders = false) {
  selected = id;
  for (const [wid, card] of Object.entries(ui.cards)) card.classList.toggle("is-selected", wid === id);
  for (const [wid, bot] of Object.entries(ui.bots)) bot.classList.toggle("is-selected", wid === id);
  if (focusOrders) {
    const card = ui.cards[id];
    card.scrollIntoView({ block: "nearest", behavior: "smooth" });
    const w = worker(id);
    (atDesk(w) ? $("[data-talk] input", card) : $("textarea", card)).focus({ preventScroll: true });
  }
}

function renderScript(w) {
  const box = $(".ct-script", ui.cards[w.id]);
  if (!w.script.length) { box.innerHTML = `<span class="ct-script-empty">Nothing yet. Standing around.</span>`; return; }
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

async function talk(w, kind, text) {
  const g = game;
  if (kind === "orders") feed(`<b>You → ${w.hire.name}</b> (orders): ${escapeHTML(text)}`, "is-boss");
  else if (kind === "chat") feed(`<b>You → ${w.hire.name}:</b> ${escapeHTML(text)}`, "is-boss");
  setThinking(w, +1);
  try {
    const r = await respond(g, w, kind, text);
    if (g !== game) return;
    setThinking(w, -1);
    bubble(w, r.reply);
    feed(`<b>${w.hire.name}:</b> ${escapeHTML(r.reply)}`);
    if (r.script) { setScript(g, w, r.script); renderScript(w); }
    else resume(g, w);
  } catch (e) {
    if (g !== game) return;
    setThinking(w, -1);
    bubble(w, "(static)");
    feed(`Couldn't reach the model for ${w.hire.name}: ${escapeHTML(e.message)}`, "is-err");
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

// ---------- speech bubbles, feed, floaters ----------

function bubble(w, text, { thinking = false, problem = false, hold = false } = {}) {
  const bot = ui.bots[w.id];
  if (!bot) return;
  clearBubble(w);
  const b = document.createElement("div");
  b.className = "ct-bubble" + (thinking ? " is-thinking" : "") + (problem ? " is-problem" : "");
  if (w.x > 72) b.classList.add("is-right"); else if (w.x < 26) b.classList.add("is-left");
  b.textContent = text;
  bot.append(b);
  if (!hold) ui.bubbleTimers[w.id] = setTimeout(() => b.remove(), Math.min(9000, 2500 + text.length * 55));
}
function clearBubble(w) {
  clearTimeout(ui.bubbleTimers[w.id]);
  ui.bots[w.id]?.querySelectorAll(".ct-bubble").forEach((b) => b.remove());
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
        bubble(w, ev.text, { problem: true, hold: true });
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
        const what = ev.matched ? `a ${ev.colors[0]} box` : `a scrap box (${ev.colors.join(", ")})`;
        feed(`${w.hire.name} shipped ${what}: +$${ev.pay}`, "is-sys");
        floater(`+$${ev.pay}`, STATIONS.DOCK.x, STATIONS.DOCK.y - 8, !ev.matched);
        break;
      }
      case "payroll": feed(`Payroll: −$${ev.amount}`, "is-sys"); break;
      case "gaveUp": clearBubble(w); feed(`${w.hire.name} gave up waiting and went back to work.`, "is-sys"); break;
      case "stuck": comeComplain(w, ev.failures); break;
      case "end": endShift(); break;
    }
  }
}

async function comeComplain(w, failures) {
  const g = game;
  setThinking(w, +1);
  try {
    const reply = await report(g, w, failures);
    if (g !== game) return;
    setThinking(w, -1);
    if (!atDesk(w)) return; // you already sorted it out
    bubble(w, reply, { problem: true, hold: true });
    feed(`<b>${w.hire.name}</b> (at your desk): ${escapeHTML(reply)}`);
  } catch (e) {
    if (g !== game) return;
    setThinking(w, -1);
    bubble(w, "Uh, boss? We have a problem.", { problem: true, hold: true });
  }
}

// ---------- the loop ----------

function render() {
  const k = floor.clientWidth / 100;
  floor.style.setProperty("--u", `${k}px`);
  for (const w of game.workers) {
    const bot = ui.bots[w.id];
    const x = (w.x + (w.index - 1) * 3.2) * k, y = w.y * k;
    bot.style.transform = `translate(${x}px, ${y}px)`;
    const held = w.holding ? itemHTML(w.holding) : "";
    if (bot._held !== held) { bot.querySelector(".ct-bot-held").innerHTML = held; bot._held = held; }
    // card status + current script step
    const card = ui.cards[w.id];
    const status = $(".ct-status", card);
    const waiting = atDesk(w) && !ui.thinking[w.id];
    const st = ui.thinking[w.id] ? "thinking…" : waiting ? "at your desk" : w.script.length ? "working" : "idle";
    if (status.textContent !== st) {
      status.textContent = st;
      status.className = "ct-status" + (st === "thinking…" ? " is-thinking" : waiting ? " is-waiting" : "");
      card.classList.toggle("is-waiting", waiting);
      if (!atDesk(w)) bot.querySelector(".ct-bubble.is-problem") && clearBubble(w);
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
  const cash = Math.round(game.cash);
  if (cash !== lastCash) {
    lastCash = cash;
    const el = $("#cash");
    el.textContent = cash < 0 ? `−$${-cash}` : `$${cash}`;
    el.classList.toggle("is-neg", cash < 0);
  }
  const left = Math.max(0, Math.ceil(RULES.shift - game.t));
  if (left !== lastClock) { lastClock = left; $("#clock").textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`; }
  const orders = game.orders.map((o) => `${o.id}`).join(",");
  if (orders !== lastOrders) {
    lastOrders = orders;
    $("#orders").innerHTML = game.orders.map((o) => `<span class="ct-ticket"><span class="ct-ticket-dots">${`<span class="ct-dot c-${o.color}"></span>`.repeat(3)}</span><span class="ct-ticket-pay">$${o.pay}</span></span>`).join("");
  }
}

function frame(now) {
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  if (game && !paused && !game.over) { step(game, dt); handleEvents(); }
  if (game) render();
  requestAnimationFrame(frame);
}

// ---------- screens ----------

function newShift() {
  const old = game;
  game = newGame(HIRES);
  // Your crew keeps their orders, scripts and memory from the last shift.
  if (old) old.workers.forEach((ow, i) => Object.assign(game.workers[i], { orders: ow.orders, script: ow.script, memory: ow.memory }));
  lastVersion = -1; lastCash = null; lastClock = null; lastOrders = "";
  ui.thinking = {};
  buildFloor();
  buildCrew();
  select(selected ?? game.workers[0].id);
  $("#feed").innerHTML = "";
  feed("Shift started.", "is-sys");
  if (game.workers.some((w) => w.script.length)) $("#nudge").classList.add("is-gone");
}

function endShift() {
  paused = true;
  const profit = Math.round(game.cash - RULES.startCash);
  const stars = STAR_PROFIT.filter((p) => profit >= p).length;
  const starSVG = `<svg viewBox="0 0 24 24"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"/></svg>`;
  $("#stars").innerHTML = STAR_PROFIT.map((p, i) => `<div class="ct-star ${i < stars ? "is-on" : ""}">${starSVG}<span>+$${p}</span></div>`).join("");
  const money = (n) => (n < 0 ? `−$${-n}` : `$${n}`);
  $("#endStats").innerHTML = [
    ["Profit", money(profit)], ["Orders filled", game.filled], ["Scrap boxes", game.scrap],
  ].map(([l, v]) => `<div><div class="ct-label">${l}</div><div class="ct-stat-value">${v}</div></div>`).join("");
  $("#endScreen").classList.remove("is-hidden");
}

function setPaused(p) {
  paused = p;
  $("#pauseScreen").classList.toggle("is-hidden", !p);
}

$("#startBtn").addEventListener("click", () => { $("#startScreen").classList.add("is-hidden"); newShift(); paused = false; });
$("#pauseBtn").addEventListener("click", () => { if (game && !game.over) setPaused(!paused); });
$("#resumeBtn").addEventListener("click", () => setPaused(false));
$("#restartBtn").addEventListener("click", () => { setPaused(false); newShift(); });
$("#againBtn").addEventListener("click", () => { $("#endScreen").classList.add("is-hidden"); newShift(); paused = false; });
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && game && !game.over && $("#startScreen").classList.contains("is-hidden")) setPaused(!paused);
});

requestAnimationFrame(frame);

// Test hook: drive the game from Playwright or the console.
window.ct = { get game() { return game; }, setScript: (id, actions) => { const w = worker(id); setScript(game, w, actions); renderScript(w); }, step: (dt) => { step(game, dt); handleEvents(); render(); }, talk: (id, kind, text) => talk(worker(id), kind, text), setPaused };
