// Your business (docs/progression-design.md, docs/decisions.md #53, #54, #56, #58): the contract
// loop, on level 6's floor. Between quarters you're at the board: pick the contracts you'll take
// this quarter, recruit, train and buy machines. Every contract you take is due at the end of the
// quarter, and no two ask for the same color, so a shipped box only ever counts for one contract
// (Mike: "The fewer decisions that workers have to make ... the better right now"). The quarter
// plays as in quarter.js, with the contracts' orders together as the quota and all your money as
// the budget. At the end, each contract that shipped in full pays, and the investor takes his cut;
// money carries over.
//
// Like a roguelike, each visit offers a few choices rather than everything: three contracts (a
// small and a large one of the same color, and a side contract of another color), three robots to
// recruit and three machines. The boards are written by hand; numbers from tools/balance.mjs.

import { wageOf } from "./wages.js";

/** The dollar-eyed robot fronted your starting money and takes a cut of every contract. */
export const INVESTOR = { fronted: 100, cut: 0.1 };

/** Shifts in a quarter; every contract is due at its end. */
export const QUARTER_SHIFTS = 3;

/**
 * Machines. Paint machines replace each other (the floor has one paint station); the others are
 * upgrades you keep. `caps` raises how much a station holds.
 */
export const SHOP = [
  { id: "paint", kind: "paint", name: "Paint machine", price: 80, wear: 10, blurb: "Paints widgets. Wears 10% a job, so someone with Repair services it every 10 jobs." },
  { id: "sturdy", kind: "paint", name: "Sturdy paint machine", price: 170, wear: 5, blurb: "Paints widgets. Wears 5% a job: half the servicing." },
  { id: "bigpack", name: "Bigger pack table", price: 50, caps: { PACK: 9 }, blurb: "Pack holds 9 things instead of 6." },
  { id: "bigbins", name: "Bigger bins", price: 30, caps: { BIN: 10 }, blurb: "Each bin holds 10 instead of 5." },
];

// Your crew (decision #56): the robots you can put on a shift. You start with two; between
// quarters you can recruit more (a one-time fee) and train the ones you have in a new skill. A
// trained skill raises the wage like any skill, and a third skill jumps it a tier (wages.js).
export const START_CREW = ["blip", "pip"];
export const RECRUITS = { dot: 10, nib: 10, cog: 10, tock: 10, gary: 40, rusty: 40, vex: 60, doris: 80, bolt: 120 };
// Every visit offers one of each tier (Mike: "at least one low-skill worker and one high skill
// expensive worker and then maybe something in between"): a blank robot to train up yourself, one
// with a skill or two, and one who can do everything. A tier with nobody left is skipped.
const TIERS_OF_RECRUITS = [["dot", "nib", "cog", "tock"], ["gary", "rusty", "vex"], ["doris", "bolt"]];
export const TRAIN_PRICE = 20;
export const TRAINABLE = ["packing", "painting", "repair"];
// Attributes can be trained too, at the same price, and count the same way toward the wage.
export const TRAINABLE_ATTRS = ["fast", "nimble", "steady", "smart"];

/** A robot (`c`, from brains.js CANDIDATES) as your business has them: their own skills plus what
 *  you've trained. */
export function robotOf(biz, c) {
  const t = biz.trained[c.id] ?? [];
  const skills = [...c.skills, ...t.filter((k) => TRAINABLE.includes(k))];
  const attributes = [...c.attributes, ...t.filter((k) => TRAINABLE_ATTRS.includes(k))];
  return { ...c, skills, attributes, wage: wageOf(skills, attributes) };
}

// The same few choices for the whole visit: a small seeded shuffle per quarter.
function pickFew(list, n, seed) {
  let a = (seed * 2654435761) >>> 0;
  const rnd = () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296);
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out.slice(0, n);
}

// The pools are what you didn't have when this visit started, so buying or recruiting one keeps the
// same three on show (marked done) instead of dealing a new one.

/** The three robots you can recruit this visit (fewer once most of them work for you). */
export const recruitOffers = (biz) => TIERS_OF_RECRUITS
  .map((ids, t) => pickFew(ids.filter((id) => !biz.crew.includes(id) || biz.recruitedNow.includes(id)), 1, biz.quarters * 3 + t + 1)[0])
  .filter(Boolean);

/** The three machines this visit. A paint machine is always among them until you own one. */
export function machineOffers(biz) {
  const had = (id) => owns(biz, id) && !biz.boughtNow.includes(id);
  const hadPaint = SHOP.some((m) => m.kind === "paint" && had(m.id));
  const open = SHOP.filter((m) => !had(m.id) && !(m.id === "paint" && had("sturdy")));
  const paint = hadPaint ? [] : open.filter((m) => m.id === "paint");
  const rest = pickFew(open.filter((m) => !paint.includes(m)).map((m) => m.id), 3 - paint.length, biz.quarters + 7);
  return [...paint, ...open.filter((m) => rest.includes(m.id))].sort((x, y) => x.price - y.price);
}

/** Recruit a robot onto your crew for its fee. */
export function recruit(biz, id) {
  const price = RECRUITS[id];
  if (price == null || biz.crew.includes(id) || biz.money < price) return false;
  biz.money -= price;
  biz.crew.push(id);
  biz.recruitedNow.push(id);
  return true;
}

/** Teach one of your robots a skill or an attribute. */
export function train(biz, c, skill) {
  const id = c.id, r = robotOf(biz, c);
  if (!biz.crew.includes(id) || biz.money < TRAIN_PRICE || r.skills.includes(skill) || r.attributes.includes(skill)) return false;
  biz.money -= TRAIN_PRICE;
  (biz.trained[id] ??= []).push(skill);
  return true;
}

// One board per quarter: a contract in a small and a large size (same color, so you take one or
// neither) and a side contract of another color. Boxes of 3; pay when they've all shipped. The
// supply only gives out red, so blue and green need a paint machine.
const TIERS = [
  { main: { color: "red", small: [20, 150], large: [40, 320] }, side: { color: "blue", count: 9, pay: 240 } },
  { main: { color: "red", small: [30, 230], large: [55, 450] }, side: { color: "green", count: 9, pay: 250 } },
  { main: { color: "green", small: [12, 330], large: [20, 560] }, side: { color: "red", count: 40, pay: 310 } },
  { main: { color: "blue", small: [15, 420], large: [25, 700] }, side: { color: "red", count: 45, pay: 360 } },
];

export function newBusiness() {
  return { money: INVESTOR.fronted, quarters: 0, wins: 0, paidOut: 0, owned: null, upgrades: [], crew: [...START_CREW], trained: {},
    recruitedNow: [], boughtNow: [] };
}

/**
 * This quarter's three contracts, as a flat list: the small and large of the main color (`size`
 * "small" / "large"), then the side contract ("side"). Past the last board, the last one again at
 * 15% more pay per quarter.
 */
export function board(biz) {
  const T = TIERS[Math.min(biz.quarters, TIERS.length - 1)], extra = Math.max(0, biz.quarters - (TIERS.length - 1));
  const pay = (p) => Math.round((p * 1.15 ** extra) / 10) * 10;
  const needs = (color) => (color === "red" ? null : "paint");
  const q = biz.quarters;
  return [
    { id: `${q}-s`, size: "small", color: T.main.color, count: T.main.small[0], pay: pay(T.main.small[1]), needs: needs(T.main.color) },
    { id: `${q}-l`, size: "large", color: T.main.color, count: T.main.large[0], pay: pay(T.main.large[1]), needs: needs(T.main.color) },
    { id: `${q}-x`, size: "side", color: T.side.color, count: T.side.count, pay: pay(T.side.pay), needs: needs(T.side.color) },
  ];
}

export const owns = (biz, id) => biz.owned === id || biz.upgrades.includes(id);
export const machine = (biz) => SHOP.find((m) => m.id === biz.owned) ?? null;
export const hasMachine = (biz, needs) => !needs || !!biz.owned; // both paint machines paint
export const cutOf = (pay) => Math.round(pay * INVESTOR.cut);

/** Buy a machine. A paint machine replaces the one you have, no money back. */
export function buy(biz, id) {
  const m = SHOP.find((x) => x.id === id);
  if (!m || owns(biz, id) || biz.money < m.price) return false;
  biz.money -= m.price;
  if (m.kind === "paint") biz.owned = id; else biz.upgrades.push(id);
  biz.boughtNow.push(id);
  return true;
}

/** Can this contract join the ones already picked? One contract per color. */
export const clashes = (picked, c) => picked.some((p) => p.id !== c.id && p.color === c.color);

const list = (cs) => cs.map((c) => `${c.count} ${c.color}`).join(", ").replace(/, ([^,]*)$/, " and $1");

/** The level a quarter plays as: level 6's floor, with a paint station only if you own one. */
// `candidates` (brains.js CANDIDATES) gives the floor your crew with their trained skills.
export function quarterLevel(base, biz, contracts, candidates = []) {
  const m = machine(biz);
  const pay = contracts.reduce((a, c) => a + c.pay, 0);
  const caps = Object.assign({}, ...biz.upgrades.map((id) => SHOP.find((x) => x.id === id).caps ?? {}));
  return {
    ...base, name: "Quarter",
    stations: base.stations.filter((k) => k !== "PAINT" || m),
    pool: [...biz.crew],
    roster: Object.fromEntries(candidates.filter((c) => biz.crew.includes(c.id)).map((c) => [c.id, robotOf(biz, c)])),
    wear: m?.wear,
    caps,
    order: contracts.map((c) => ({ color: c.color, count: c.count })),
    quarter: { shifts: QUARTER_SHIFTS, budget: biz.money },
    contracts,
    start: `Ship ${list(contracts)} boxes by the end of the quarter, ${QUARTER_SHIFTS} shifts. Each contract pays when all its boxes have shipped (up to $${pay}). Crew pay comes out of your money at <b>Start</b>.`,
  };
}

/** What each contract earned: `done` is what shipped of each, in the level's order. */
export function payouts(contracts, done) {
  return contracts.map((c, i) => {
    const won = done[i] >= c.count;
    return { c, won, pay: won ? c.pay : 0, cut: won ? cutOf(c.pay) : 0 };
  });
}

/** The quarter's over and you're back at the board. `left` is your money after the shifts' pay. */
export function settle(biz, contracts, done, left) {
  biz.money = left;
  for (const p of payouts(contracts, done)) {
    biz.money += p.pay - p.cut;
    biz.paidOut += p.cut;
    if (p.won) biz.wins++;
  }
  biz.quarters++;
  biz.recruitedNow = [];
  biz.boughtNow = [];
}
