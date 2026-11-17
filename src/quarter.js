// A quarter (docs/decisions.md #35): a quota to ship over a few shifts, with a budget. The level
// (levels.js) gives the quota as its order, plus `quarter: { shifts, budget }`.
//
// Money goes out two ways: wages, by the second while a shift runs (the sim counts them as
// laborCost), and a hiring fee of one minute's wage when someone joins. Letting someone go before
// they've worked a shift gives the fee back, so a misclick costs nothing. Start waits until the
// budget covers the whole shift's payroll, so you never run out of money in the middle of one.
// What's shipped and the money carry from shift to shift; the floor itself starts fresh.

/** A fresh quarter for level `L`. */
export function newQuarter(L) {
  const q = { shift: 1, money: L.quarter.budget, done: L.order.map(() => 0) };
  q.start = { money: q.money, done: [...q.done] };
  return q;
}

/** The fee for hiring someone: one minute of their wage. */
export const hireFee = (hire) => hire.wage;

/** What a whole shift of this crew costs in wages. */
export const shiftPayroll = (L, hires) => Math.ceil(hires.reduce((a, h) => a + h.wage, 0) * L.shift / 60);

/** Money left right now: the budget minus this shift's wages so far. */
export const moneyNow = (q, game) => q.money - (game.paid ? 0 : game.laborCost);

/** A shift ended: pay its wages and carry what shipped. */
export function closeShift(q, game) {
  q.money -= game.laborCost;
  game.paid = true;
  q.done = game.order.map((l) => l.done);
}

/** The next shift: remember where it starts, for Restart shift. */
export function nextShift(q) {
  q.shift++;
  q.start = { money: q.money, done: [...q.done] };
}

/** Restart shift: back to how this shift started. */
export function restartShift(q) {
  q.money = q.start.money;
  q.done = [...q.start.done];
}

export const money = (n) => `$${Math.max(0, Math.floor(n))}`;
