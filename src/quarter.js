// A quarter (docs/decisions.md #35, #47): a quota to ship over a few shifts, with a budget. The
// level (levels.js) gives the quota as its order, plus `quarter: { shifts, budget }`.
//
// Each robot has a flat rate for a shift (their wage, brains.js). The crew's rates come out of the
// budget when you press Start, so Start waits until the budget covers them: you can never run out
// of money in the middle of a shift. What's shipped and the money carry from shift to shift; the
// floor itself starts fresh.

/** A fresh quarter for level `L`. */
export function newQuarter(L) {
  const q = { shift: 1, money: L.quarter.budget, done: L.order.map(() => 0) };
  q.start = { money: q.money, done: [...q.done] };
  return q;
}

/** What this crew costs for one shift. */
export const shiftPayroll = (hires) => hires.reduce((a, h) => a + h.wage, 0);

/** Start: pay the crew for the shift. Replay this shift goes back to just before this. */
export function payShift(q, game) {
  q.start = { money: q.money, done: [...q.done] };
  game.laborCost = shiftPayroll(game.workers.map((w) => w.hire));
  q.money -= game.laborCost;
}

/** A shift ended: carry what shipped. */
export function closeShift(q, game) {
  q.done = game.order.map((l) => l.done);
}

/** The next shift. */
export function nextShift(q) {
  q.shift++;
}

/** Replay this shift: back to how it started, before the crew was paid. */
export function restartShift(q) {
  q.money = q.start.money;
  q.done = [...q.start.done];
}

export const money = (n) => `$${Math.max(0, Math.floor(n))}`;

/** How much of the quarter has shipped: `counts` and `done` per order line. { total, now }; extra
 *  boxes of a finished line don't count. */
export function shippedOf(counts, done) {
  const total = counts.reduce((a, b) => a + b, 0);
  const now = done.reduce((a, d, i) => a + Math.min(d, counts[i]), 0);
  return { total, now };
}

/**
 * What this shift's crew costs against the budget, said by Start while you schedule (Pam's plan,
 * decision 71): the budget after paying them, and whether shifts like this one cover the rest of
 * the quarter or which shift they'd fall short on. `shift` is this shift's number (1-based).
 */
export function shiftCost(budget, pay, shift, shifts) {
  const after = budget - pay;
  if (pay <= 0) return { pay, after, covers: true, shortAt: null };
  const more = Math.floor(after / pay); // later shifts like this one the budget still covers
  const later = shifts - shift;
  return more >= later ? { pay, after, covers: true, shortAt: null } : { pay, after, covers: false, shortAt: shift + more + 1 };
}
