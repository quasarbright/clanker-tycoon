// Level 7, "Your business" (src/business.js, src/wages.js): contracts, loans, recruiting,
// training, wages and the shop.   node --test test/
import { test } from "node:test";
import assert from "node:assert/strict";
import * as B from "../src/business.js";
import { wageOf } from "../src/wages.js";
import { LEVELS } from "../src/levels.js";

const BASE = LEVELS.find((l) => l.business);
const bot = (id, skills = [], attributes = []) => ({ id, name: id, skills, attributes });

test("you start with $100 of your own, no debt, Blip and Pip", () => {
  const b = B.newBusiness();
  assert.equal(b.money, 100);
  assert.deepEqual(b.loans, []);
  assert.deepEqual(b.crew, ["blip", "pip"]);
});

test("wages: $5 + $5 a skill or trait, and a third skill or third trait adds $20", () => {
  assert.equal(wageOf([], []), 5);
  assert.equal(wageOf(["packing"], []), 10);
  assert.equal(wageOf(["packing", "painting"], ["fast"]), 20);
  assert.equal(wageOf(["packing", "painting", "repair"], []), 40);
  assert.equal(wageOf([], ["fast", "smart", "steady"]), 40);
  assert.equal(wageOf(["packing", "painting", "repair"], ["fast", "smart", "steady"]), 5 + 30 + 40);
});

test("the board: a small and a large of one color, and a side contract of another", () => {
  for (let q = 0; q < 6; q++) {
    const [small, large, side] = B.board({ ...B.newBusiness(), quarters: q });
    assert.equal(small.size, "small"); assert.equal(large.size, "large"); assert.equal(side.size, "side");
    assert.equal(small.color, large.color);
    assert.notEqual(side.color, small.color);
    assert.ok(large.count > small.count && large.pay > small.pay);
    for (const c of [small, large, side]) assert.equal(!!c.needs, c.color !== "red");
  }
});

test("picking one size rules out the other: one contract per color", () => {
  const [small, large, side] = B.board(B.newBusiness());
  assert.ok(B.clashes([small], large));
  assert.ok(!B.clashes([small], side));
});

test("loans: no interest, 10% per loan, stacking, three at most", () => {
  const b = B.newBusiness();
  assert.ok(B.borrow(b, 0));
  assert.equal(b.money, 200);
  assert.equal(B.debtOf(b), 100);
  assert.equal(B.repayOf(b, 150), 15);
  assert.ok(B.borrow(b, 1));
  assert.equal(B.shareOf(b), 0.2);
  assert.equal(B.repayOf(b, 150), 30);
  assert.ok(B.borrow(b, 0));
  assert.equal(B.borrow(b, 1), false, "a fourth loan is refused");
  assert.equal(b.loans.length, 3);
  assert.equal(b.money, 550);
});

test("a loan never takes more than what's left on it, and paid-off loans go away", () => {
  const b = B.newBusiness();
  B.borrow(b, 0); // owe 100
  b.loans[0] = 5;
  assert.equal(B.repayOf(b, 1000), 5);
  const cs = B.board(b).slice(0, 1);
  B.settle(b, cs, [cs[0].count], b.money);
  assert.deepEqual(b.loans, []);
});

test("settle: only contracts that shipped in full pay, and the lender's share comes out", () => {
  const b = B.newBusiness();
  B.borrow(b, 0);
  const [small, , side] = B.board(b);
  const before = b.money;
  B.settle(b, [small, side], [small.count, side.count - 1], before - 30);
  assert.equal(b.money, before - 30 + small.pay - Math.round(small.pay * 0.1));
  assert.equal(b.wins, 1);
  assert.equal(b.quarters, 1);
  assert.equal(B.debtOf(b), 100 - Math.round(small.pay * 0.1));
});

test("forecast: pay if everything ships, minus the lender, no wages", () => {
  const b = B.newBusiness();
  B.borrow(b, 0); B.borrow(b, 1);
  const [small] = B.board(b);
  const f = B.forecast(b, [small]);
  assert.equal(f.pay, small.pay);
  assert.equal(f.repay, 2 * Math.round(small.pay * 0.1));
  assert.equal(f.gain, f.pay - f.repay);
  assert.equal(f.budget, b.money);
  assert.equal(b.loans.reduce((a, l) => a + l, 0), 350, "a forecast doesn't touch the real loans");
});

test("recruits: one per tier, stable through the visit, and the recruit is trainable right away", () => {
  const b = B.newBusiness();
  b.money = 1000;
  const offers = B.recruitOffers(b);
  assert.equal(offers.length, 3);
  assert.ok(["dot", "nib", "cog", "tock"].includes(offers[0]));
  assert.ok(["gary", "rusty", "vex"].includes(offers[1]));
  assert.ok(["doris", "bolt"].includes(offers[2]));
  assert.ok(B.recruit(b, offers[0]));
  assert.deepEqual(B.recruitOffers(b), offers, "recruiting one keeps the same three on show");
  assert.ok(B.train(b, bot(offers[0]), TRAIN_SKILL(b, offers[0])));
});
const TRAIN_SKILL = (b, id) => B.TRAINABLE.find((k) => !B.robotOf(b, bot(id)).skills.includes(k));

test("a cheap recruit comes with at most one skill and one trait, and pays $5 for each", () => {
  for (let q = 0; q < 40; q++) {
    const b = { ...B.newBusiness(), quarters: q };
    for (const id of ["dot", "nib", "cog", "tock"]) {
      const r = B.robotOf(b, bot(id));
      assert.ok(r.skills.length <= 1 && r.attributes.length <= 1, `${id} in quarter ${q}: ${r.skills} ${r.attributes}`);
      assert.equal(B.recruitPrice(b, id), 10 + 5 * (r.skills.length + r.attributes.length));
    }
  }
});

test("a recruit keeps the kit they came with in later quarters", () => {
  const b = B.newBusiness();
  b.money = 1000;
  const id = B.recruitOffers(b)[0];
  const kit = B.robotOf(b, bot(id));
  B.recruit(b, id);
  b.quarters = 9;
  assert.deepEqual(B.robotOf(b, bot(id)).skills, kit.skills);
  assert.deepEqual(B.robotOf(b, bot(id)).attributes, kit.attributes);
});

test("training: $20 a skill or trait, raises the wage, never twice, only your crew", () => {
  const b = B.newBusiness();
  b.money = 100;
  const pip = bot("pip", ["packing"]);
  assert.ok(B.train(b, pip, "painting"));
  assert.equal(b.money, 80);
  assert.equal(B.robotOf(b, pip).wage, 15);
  assert.equal(B.train(b, pip, "painting"), false);
  assert.equal(B.train(b, pip, "packing"), false, "already has it");
  assert.ok(B.train(b, pip, "fast"));
  assert.deepEqual(B.robotOf(b, pip).attributes, ["fast"]);
  assert.ok(B.train(b, pip, "repair"));
  assert.equal(B.robotOf(b, pip).wage, 5 + 20 + 20, "third skill jumps a tier");
  assert.equal(B.train(b, bot("bolt"), "fast"), false, "not on your crew");
  b.money = 5;
  assert.equal(B.train(b, bot("blip"), "packing"), false, "can't afford it");
});

test("machines: a paint machine is offered until you own one; paint machines replace each other", () => {
  const b = B.newBusiness();
  b.money = 1000;
  for (let q = 0; q < 10; q++) assert.ok(B.machineOffers({ ...b, quarters: q }).some((m) => m.id === "paint"));
  assert.ok(B.buy(b, "paint"));
  assert.equal(B.buy(b, "paint"), false, "already own it");
  assert.ok(B.machineOffers(b).some((m) => m.id === "paint"), "the one you just bought stays on show this visit");
  assert.ok(B.buy(b, "sturdy"));
  assert.equal(b.owned, "sturdy");
  assert.ok(B.machineOffers(b).length <= 3);
});

test("the quarter's level: a paint station only with a machine, caps from upgrades, your crew", () => {
  const b = B.newBusiness();
  b.money = 1000;
  const [small, , side] = B.board(b);
  let L = B.quarterLevel(BASE, b, [small]);
  assert.ok(!L.stations.includes("PAINT"));
  assert.deepEqual(L.pool, ["blip", "pip"]);
  B.buy(b, "sturdy"); B.buy(b, "bigpack");
  L = B.quarterLevel(BASE, b, [small, side], [bot("blip"), bot("pip", ["packing"])]);
  assert.ok(L.stations.includes("PAINT"));
  assert.equal(L.wear, 5);
  assert.equal(L.caps.PACK, 9);
  assert.equal(L.quarter.shifts, B.QUARTER_SHIFTS);
  assert.deepEqual(L.order, [{ color: small.color, count: small.count }, { color: side.color, count: side.count }]);
  assert.equal(L.roster.pip.wage, 10);
});

test("shift cost by Start: budget after, and whether shifts like this cover the rest of the quarter (decision 71)", async () => {
  const { shiftCost } = await import("../src/quarter.js");
  assert.deepEqual(shiftCost(80, 15, 1, 3), { pay: 15, after: 65, covers: true, shortAt: null });
  assert.deepEqual(shiftCost(80, 35, 1, 3), { pay: 35, after: 45, covers: false, shortAt: 3 });
  assert.deepEqual(shiftCost(80, 50, 1, 3), { pay: 50, after: 30, covers: false, shortAt: 2 });
  assert.deepEqual(shiftCost(40, 20, 2, 3), { pay: 20, after: 20, covers: true, shortAt: null });
  assert.equal(shiftCost(30, 15, 3, 3).covers, true); // the last shift has nothing after it
  assert.equal(shiftCost(80, 0, 1, 3).covers, true);
});

test("the board's whole-crew cost is the sum of every robot's wage (decision 71)", () => {
  const biz = B.newBusiness();
  const cands = [{ id: "blip", skills: [], attributes: [] }, { id: "pip", skills: ["packing"], attributes: [] }, { id: "cog", skills: ["painting"], attributes: ["smart"] }];
  biz.crew = ["blip", "pip"];
  assert.equal(B.crewCost(biz, cands), 5 + 10);
  biz.crew.push("cog"); biz.trained.pip = ["painting"];
  assert.equal(B.crewCost(biz, cands), 5 + 15 + 15);
});

test("reputation: a miss costs a whole pip, a ship wins back a third (two for a Large), capped at 3 (decisions 78, 79)", async () => {
  const R = await import("../src/reputation.js");
  const c = (size) => ({ size });
  assert.equal(R.afterQuarter(9, [{ c: c("small"), won: false }]), 6);
  assert.equal(R.afterQuarter(6, [{ c: c("small"), won: true }]), 7);
  assert.equal(R.afterQuarter(6, [{ c: c("large"), won: true }]), 8);
  assert.equal(R.afterQuarter(6, [{ c: c("side"), won: true }]), 7);
  assert.equal(R.afterQuarter(6, [{ c: c("large"), won: true }, { c: c("side"), won: true }]), 9, "a clean Large + side quarter wins back a whole pip");
  assert.equal(R.afterQuarter(8, [{ c: c("large"), won: true }]), 9, "capped at 3");
  assert.equal(R.afterQuarter(2, [{ c: c("large"), won: false }, { c: c("side"), won: false }]), 0, "never below 0");
  assert.equal(R.pipsText(7), "2⅓"); assert.equal(R.pipsText(9), "3"); assert.equal(R.pipsText(2), "⅔");
  assert.equal(R.deltaText(-3), "\u22121"); assert.equal(R.deltaText(2), "+⅔");
});

test("reputation shapes the board: 100%, 80%, 60% of size and pay by whole pips (decision 78)", () => {
  const biz = B.newBusiness();
  const full = B.board(biz);
  assert.deepEqual(full.map((c) => [c.count, c.pay]), full.map((c) => [c.fullCount, c.fullPay]), "full reputation: nothing lowered");
  biz.rep = 7; // 2⅓: rounds down to 2 whole pips
  for (const [c, f] of B.board(biz).map((c, i) => [c, full[i]])) {
    assert.equal(c.count, Math.round(f.count * 0.8)); assert.equal(c.pay, Math.round(f.pay * 0.8));
    assert.equal(c.fullCount, f.count); assert.equal(c.fullPay, f.pay);
  }
  biz.rep = 3;
  assert.deepEqual(B.board(biz).map((c) => c.pay), full.map((c) => Math.round(c.pay * 0.6)));
});

test("settling a quarter moves reputation, and at zero the business is out (decisions 78, 76)", () => {
  const biz = B.newBusiness();
  const [small, , side] = B.board(biz);
  B.settle(biz, [small, side], [small.count, 0], biz.money);
  assert.equal(biz.rep, 9 + 1 - 3, "shipped the Small (+⅓), missed the side (−1)");
  assert.deepEqual(biz.last.rep, [9, 7]);
  assert.equal(B.outOfBusiness(biz), null);
  biz.rep = 3;
  assert.equal(B.outOfBusiness(biz), null, "one whole pip: still in business");
  biz.rep = 2;
  assert.equal(B.outOfBusiness(biz), "reputation", "under one whole pip clients offer 0%: out");
  biz.rep = 0;
  assert.equal(B.outOfBusiness(biz), "reputation", "going broke alone isn't an ending any more");
});

test("headlines: Mike's picks, the paint machine's and the lender's always in the rotation (decisions 74, 77)", async () => {
  const { headline, headlinesFor } = await import("../src/headlines.js");
  const all = (reason) => new Set(headlinesFor(reason).map((h) => h.text("Clank & Sons")));
  const always = ["Clank & Sons Ships Its Last Box (It Was Empty)", "Robots of Clank & Sons Finally Given Clear Instructions: \u201cLeave\u201d",
    "Clank & Sons Paint Machine Outlasts Clank & Sons", "Lender Collects His 10% of Clank & Sons: $0"];
  assert.deepEqual([...all("broke")].sort(), [...always].sort());
  assert.deepEqual([...all("reputation")].sort(), [...always, "Clank & Sons Reputation Found at Bottom of Bin 2"].sort());
  assert.equal(headline("broke", "X", 3), headline("broke", "X", 3));
});
