// Your business (docs/progression-design.md, docs/decisions.md #53, #54): the contract loop, on
// level 6's floor. Between quarters you're at the board: pick the contracts you'll take this quarter
// and buy equipment. Every contract you take is due at the end of the quarter, and no two ask for
// the same color, so a shipped box only ever counts for one contract (Mike: "The fewer decisions
// that workers have to make ... the better right now"). The quarter plays as in quarter.js, with the
// contracts' orders together as the quota and all your money as the budget. At the end, each
// contract that shipped in full pays, and the investor takes his cut; money carries over.
//
// The boards are written by hand, one per quarter. Numbers from tools/balance.mjs.

/** The dollar-eyed robot fronted your starting money and takes a cut of every contract. */
export const INVESTOR = { fronted: 100, cut: 0.1 };

/** Shifts in a quarter; every contract is due at its end. */
export const QUARTER_SHIFTS = 3;

/** Equipment in the shop. Paint machines replace each other (the floor has one paint station). */
export const SHOP = [
  { id: "paint", name: "Paint machine", price: 80, wear: 10, blurb: "Wears 10% a job. Cheap, but someone with Repair has to service it every 10 jobs." },
  { id: "sturdy", name: "Sturdy paint machine", price: 170, wear: 5, blurb: "Wears 5% a job. Costs more, and needs half the servicing." },
];

// One board per quarter. Each contract is boxes of one color (boxes of 3) and what the client pays
// when they've all shipped. The belt only brings red, so blue and green need a paint machine.
const TIERS = [
  [
    { color: "red", count: 20, pay: 150 },
    { color: "red", count: 40, pay: 320 },
    { color: "blue", count: 9, pay: 240 },
    { color: "green", count: 6, pay: 170 },
  ],
  [
    { color: "red", count: 30, pay: 230 },
    { color: "red", count: 55, pay: 450 },
    { color: "blue", count: 12, pay: 320 },
    { color: "green", count: 9, pay: 250 },
  ],
  [
    { color: "red", count: 40, pay: 310 },
    { color: "blue", count: 18, pay: 480 },
    { color: "green", count: 12, pay: 330 },
    { color: "green", count: 20, pay: 560 },
  ],
];

export function newBusiness() {
  return { money: INVESTOR.fronted, quarters: 0, wins: 0, paidOut: 0, owned: null };
}

/** This quarter's board; past the last one, the last again at 15% more pay per quarter. */
export function board(biz) {
  const t = Math.min(biz.quarters, TIERS.length - 1), extra = Math.max(0, biz.quarters - (TIERS.length - 1));
  return TIERS[t].map((c, i) => ({ ...c, id: `${biz.quarters}-${i}`, needs: c.color === "red" ? null : "paint",
    pay: Math.round((c.pay * 1.15 ** extra) / 10) * 10 }));
}

export const machine = (biz) => SHOP.find((m) => m.id === biz.owned) ?? null;
export const hasMachine = (biz, needs) => !needs || !!biz.owned; // both machines paint
export const cutOf = (pay) => Math.round(pay * INVESTOR.cut);

/** Buy a machine: it replaces the one you have, no money back. */
export function buy(biz, id) {
  const m = SHOP.find((x) => x.id === id);
  if (!m || biz.owned === id || biz.money < m.price) return false;
  biz.money -= m.price;
  biz.owned = id;
  return true;
}

/** Most boxes the belt brings in one shift of level `base`. */
export const beltBoxes = (base) => Math.floor(base.shift / base.beltEvery / 3);

/** Can this contract join the ones already picked? One contract per color. */
export const clashes = (picked, c) => picked.some((p) => p.id !== c.id && p.color === c.color);

const list = (cs) => cs.map((c) => `${c.count} ${c.color}`).join(", ").replace(/, ([^,]*)$/, " and $1");

/** The level a quarter plays as: level 6's floor, with a paint station only if you own one. */
export function quarterLevel(base, biz, contracts) {
  const m = machine(biz);
  const pay = contracts.reduce((a, c) => a + c.pay, 0);
  return {
    ...base, name: "Quarter",
    stations: base.stations.filter((k) => k !== "PAINT" || m),
    wear: m?.wear,
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
}
