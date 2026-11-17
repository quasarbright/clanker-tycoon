// Playtests of level 7, "Your business", with real robots: the instructions are plain English, the
// model (Claude Haiku through OpenRouter, key in .env) compiles them through the game's real path,
// and the sim plays every shift. A few scripted players with different appetites play several
// quarters each, so we can see whether the Large contract is a gamble or a trap.
//   node tools/business-playtest.mjs [quarters=4]
// Robots don't think mid-shift here (no unexpected-event thinking), so a jam stays jammed: a bit
// harsher than real play. Results: tools/business-playtest/results-<time>.json.
import "../test/setup.mjs";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const env = Object.fromEntries(readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")
  .map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]));
const KEY = env.OPENROUTER_API_KEY;
const MODEL = "anthropic/claude-haiku-5.5";

const { useFakeLlm } = await import("../src/llm.js");
const { compile, CANDIDATES } = await import("../src/brains.js");
const { newGame, addWorker, step, setProgram } = await import("../src/sim.js");
const { LEVELS } = await import("../src/levels.js");
const B = await import("../src/business.js");

let spent = 0, calls = 0;
useFakeLlm(async ({ system, prompt, schema }) => {
  const res = await realFetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}`, "X-Title": "clanker-tycoon playtest" },
    body: JSON.stringify({ model: MODEL, messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
      response_format: { type: "json_schema", json_schema: { name: "reply", strict: true, schema } }, reasoning: { enabled: false }, usage: { include: true } }),
  });
  const j = await res.json();
  calls++; spent += j.usage?.cost ?? 0;
  if (!res.ok) throw new Error(j.error?.message ?? `HTTP ${res.status}`);
  return JSON.parse(String(j.choices[0].message.content).replace(/^```(?:json)?\s*|\s*```$/g, "").trim());
});

const BASE = LEVELS.find((l) => l.business);
const cand = (id) => CANDIDATES.find((c) => c.id === id);

// What a player says to each role, given the quarter's contracts. Plain English, like a person.
function words(role, contracts) {
  const red = contracts.find((c) => c.color === "red");
  const painted = contracts.filter((c) => c.color !== "red").map((c) => c.color);
  switch (role) {
    case "haul": return "Carry red widgets from the supply to Pack, over and over.";
    case "pack": return "Whenever Pack has 3 widgets of a color the order still needs, pack them into a box and ship it from the dock.";
    case "paint": return `Take red widgets from the supply, paint them ${painted.join(" or ")} (whichever we still need), and bring them to Pack.`;
    case "repair": return "Service the paint machine whenever its wear gets to 80% or more.";
    default: throw new Error(role);
  }
}

/**
 * A player: which contracts they take and what they spend between quarters. The crew follows from
 * the picks (staff()): haulers only if red is wanted, a painter and someone who services the
 * machine if anything needs paint, and a packer.
 * `plan(biz, board)` returns { picks, buy: [machine ids], recruit: ["cheap" | "skilled" | "expert"], borrow: [loan index] }.
 */
const PLAYERS = {
  // The Small contract, plus the side job once there's a paint machine; buys one when it's cheap to.
  careful: (biz, [small, , side]) => {
    const p = { picks: [small], buy: [], recruit: [], borrow: [] };
    if (!biz.owned && biz.money >= 150) p.buy.push("paint");
    if (biz.owned || p.buy.length) p.picks.push(side);
    if (biz.crew.length < 4 && biz.money >= 60) p.recruit.push("cheap");
    return p;
  },
  // Always the Large and the side job; borrows to get the machine and staff up.
  greedy: (biz, [, large, side]) => {
    const p = { picks: [large, side], buy: [], recruit: [], borrow: [] };
    if (!biz.owned) { if (biz.money < 250) p.borrow.push(1); p.buy.push("paint"); }
    if (biz.crew.length < 4) p.recruit.push("cheap");
    if (biz.crew.length < 5) p.recruit.push("skilled");
    return p;
  },
  // The Large when it's red, otherwise the Small; the side job when it can; never borrows.
  middle: (biz, [small, large, side]) => {
    const p = { picks: [large.color === "red" ? large : small], buy: [], recruit: [], borrow: [] };
    if (biz.crew.length < 4 && biz.money >= 40) p.recruit.push("cheap");
    if (!biz.owned && biz.money >= 130) p.buy.push("paint");
    if (biz.owned || p.buy.length) p.picks.push(side);
    return p;
  },
};

/** Who does what this quarter, training where needed ($20 a skill), from the robots you have. */
function staff(biz, picks) {
  const r = (id) => B.robotOf(biz, cand(id));
  const has = (id, k) => r(id).skills.includes(k);
  const free = [...biz.crew];
  const take = (pred, skill) => {
    let id = free.find(pred) ?? free.find((x) => r(x).skills.length === 0) ?? free[0];
    if (!id) return null;
    if (skill && !has(id, skill) && !B.train(biz, cand(id), skill)) return null;
    free.splice(free.indexOf(id), 1);
    return id;
  };
  const crew = [];
  const red = picks.some((c) => c.color === "red"), paint = picks.some((c) => c.needs);
  const packer = take((x) => has(x, "packing"), "packing"); if (packer) crew.push([packer, "pack"]);
  if (paint) {
    const painter = take((x) => has(x, "painting"), "painting"); if (painter) crew.push([painter, "paint"]);
    const fixer = take((x) => has(x, "repair"), "repair"); if (fixer) crew.push([fixer, "repair"]);
  }
  if (red) for (const id of [...free]) { if (crew.length >= 5) break; crew.push([id, "haul"]); free.splice(free.indexOf(id), 1); }
  return crew;
}

async function playRun(name, quarters) {
  const biz = B.newBusiness();
  const log = [];
  for (let q = 0; q < quarters; q++) {
    const board = B.board(biz);
    const plan = PLAYERS[name](biz, board);
    for (const i of plan.borrow) B.borrow(biz, i);
    for (const id of plan.buy) B.buy(biz, id);
    const offers = B.recruitOffers(biz);
    for (const tier of plan.recruit) B.recruit(biz, tier === "cheap" ? offers[0] : tier === "skilled" ? offers[1] : offers[2]);
    const picks = plan.picks.filter((c) => B.hasMachine(biz, c.needs));
    if (!picks.length) picks.push(board[0]);
    const crew = staff(biz, picks);
    const L = B.quarterLevel(BASE, biz, picks, CANDIDATES);
    // Compile everyone's instructions on this quarter's floor.
    const g0 = newGame(L, [], 1);
    const ws = crew.map(([id]) => addWorker(g0, L.roster[id]));
    const asts = [];
    for (let i = 0; i < crew.length; i++) {
      const out = await compile(g0, ws[i], words(crew[i][1], picks)).catch((e) => ({ problem: e.message }));
      asts.push(out.ast ?? null);
      if (!out.ast) console.log(`   ${crew[i][0]} (${crew[i][1]}) couldn't: ${out.problem ?? out.reply}`);
    }
    const wage = crew.reduce((a, [id]) => a + L.roster[id].wage, 0);
    let budget = biz.money, done = L.order.map(() => 0), shifts = 0;
    for (let s = 1; s <= B.QUARTER_SHIFTS; s++) {
      if (budget < wage) break; // can't pay this crew
      budget -= wage; shifts++;
      const g = newGame(L, crew.map(([id]) => L.roster[id]), q * 10 + s, { done });
      g.workers.forEach((w, i) => asts[i] && setProgram(g, w, asts[i]));
      while (!g.over) { step(g, 1 / 20); g.events.length = 0; }
      done = g.order.map((l) => l.done);
      if (g.won) break;
    }
    const before = biz.money;
    const pays = B.payouts(picks, done, [...biz.loans]);
    B.settle(biz, picks, done, budget);
    const row = { quarter: q + 1, picks: picks.map((c) => `${c.size} ${c.count} ${c.color} $${c.pay}`), crew: crew.map(([id, r]) => `${id}:${r}${asts[crew.findIndex((x) => x[0] === id)] ? "" : "(no routine)"}`),
      shipped: done.map((d, i) => `${d}/${picks[i].count}`), paid: pays.filter((p) => p.won).length, wages: wage * shifts, money: Math.round(biz.money), debt: B.debtOf(biz) };
    log.push(row);
    console.log(`${name.padEnd(8)} Q${q + 1}  ${row.picks.join(" + ").padEnd(40)} shipped ${row.shipped.join(", ").padEnd(14)} wages $${String(row.wages).padEnd(4)} money $${row.money} debt $${row.debt}  ${row.crew.join(" ")}`);
  }
  return { name, log, money: biz.money, debt: B.debtOf(biz) };
}

const quarters = +process.argv[2] || 4;
const results = [];
for (const name of Object.keys(PLAYERS)) results.push(await playRun(name, quarters));
console.log(`\n${calls} model calls, $${spent.toFixed(4)}`);
mkdirSync(new URL("business-playtest/", import.meta.url), { recursive: true });
writeFileSync(new URL(`business-playtest/results-${Date.now()}.json`, import.meta.url), JSON.stringify({ quarters, results, calls, spent }, null, 1));
