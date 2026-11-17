// Your business (docs/progression-design.md, docs/decisions.md #53): the first prototype of the
// contract loop, on level 6's floor. Between contracts you're at the board: pick one of three
// contracts and buy equipment. A contract plays as a quarter (quarter.js) whose quota is the
// contract's order, whose shifts are its deadline, and whose budget is all your money. When it
// ships, the client pays and the investor takes his cut; money carries to the next contract.
//
// The boards are written by hand, one per contract you've finished (tiers), so each one has an easy
// pick, one that wants equipment, and one that's a stretch. Numbers from tools/balance.mjs.

/** The dollar-eyed robot fronted your starting money and takes a cut of every contract. */
export const INVESTOR = { fronted: 100, cut: 0.1 };

/** Equipment in the shop. Paint machines replace each other (the floor has one paint station). */
export const SHOP = [
  { id: "paint", name: "Paint machine", price: 80, wear: 10, blurb: "Wears 10% a job. Cheap, but someone with Repair has to service it every 10 jobs." },
  { id: "sturdy", name: "Sturdy paint machine", price: 170, wear: 5, blurb: "Wears 5% a job. Costs more, and needs half the servicing." },
];

// One board per tier. order: what to ship (boxes of 3); shifts: the deadline; pay: what the client
// pays when the whole order has shipped. needs: a machine the floor must have.
const TIERS = [
  [
    { order: [{ color: "red", count: 15 }], shifts: 2, pay: 120 },
    { order: [{ color: "blue", count: 6 }], shifts: 2, pay: 190, needs: "paint" },
    { order: [{ color: "red", count: 45 }], shifts: 1, pay: 420 },
  ],
  [
    { order: [{ color: "red", count: 24 }], shifts: 2, pay: 170 },
    { order: [{ color: "red", count: 12 }, { color: "blue", count: 6 }], shifts: 2, pay: 260, needs: "paint" },
    { order: [{ color: "blue", count: 15 }], shifts: 2, pay: 420, needs: "paint" },
  ],
  [
    { order: [{ color: "red", count: 40 }], shifts: 2, pay: 300 },
    { order: [{ color: "blue", count: 12 }], shifts: 2, pay: 340, needs: "paint" },
    { order: [{ color: "red", count: 20 }, { color: "blue", count: 15 }], shifts: 3, pay: 560, needs: "paint" },
  ],
];

export function newBusiness() {
  return { money: INVESTOR.fronted, wins: 0, paidOut: 0, owned: null };
}

/** The board you see now: the next tier after the contracts you've finished; past the last, the
 *  last tier again at better pay (the clients have heard of you). */
export function board(biz) {
  const t = Math.min(biz.wins, TIERS.length - 1), extra = Math.max(0, biz.wins - (TIERS.length - 1));
  return TIERS[t].map((c, i) => ({ ...c, id: `${biz.wins}-${i}`, pay: Math.round((c.pay * 1.15 ** extra) / 10) * 10 }));
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

/** The level a contract plays as: level 6's floor, with a paint station only if you own one. */
export function contractLevel(base, biz, c) {
  const m = machine(biz);
  const what = c.order.map((l) => `${l.count} ${l.color}`).join(" and ");
  return {
    ...base, id: base.id, name: "Contract",
    stations: base.stations.filter((k) => k !== "PAINT" || m),
    wear: m?.wear,
    order: c.order.map((l) => ({ ...l })),
    quarter: { shifts: c.shifts, budget: biz.money },
    contract: c,
    start: `Ship ${what} boxes within ${c.shifts === 1 ? "one shift" : `${c.shifts} shifts`}. The client pays $${c.pay} when it's all shipped. Crew pay comes out of your money at <b>Start</b>.`,
  };
}

/** A contract's over and you're back at the board. `left` is your money after the shifts' pay. */
export function settle(biz, c, left, won) {
  biz.money = left;
  if (!won) return;
  const cut = cutOf(c.pay);
  biz.money += c.pay - cut;
  biz.paidOut += cut;
  biz.wins++;
}
