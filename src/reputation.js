// Reputation (decisions 78, 79): three pips, kept in thirds. A missed contract of any size costs a
// whole pip; a shipped Small or side contract wins back a third, a shipped Large two thirds.
// Reputation sets the board: at 3, 2 and 1 whole pips clients offer 100%, 80% and 60% of the full
// size and pay, and under one pip (⅓ or ⅔) 40%. At exactly zero no client signs with you, and the
// run is over (decision 84).

export const REP = {
  max: 9, // in thirds: 3 pips
  miss: 3, // a whole pip, any size
  gain: { small: 1, side: 1, large: 2 }, // thirds won back by shipping
  offer: [0.4, 0.6, 0.8, 1], // share of size and pay, by whole pips (under one pip: 40%, decision 84)
};

export const wholePips = (rep) => Math.floor(rep / 3);
/** The share of size and pay clients offer at this reputation. */
export const offerShare = (rep) => REP.offer[Math.max(0, Math.min(3, wholePips(rep)))];
/** Reputation is gone: only at exactly zero (Mike, decision 84). A miss below one pip clamps to 0. */
export const ruined = (rep) => rep <= 0;
/** One more miss ends the run: one pip or less, but not yet zero. */
export const onTheEdge = (rep) => rep > 0 && rep <= REP.miss;

const THIRDS = ["", "⅓", "⅔"];
/** "2⅓", "3", "⅔": reputation (in thirds) as the player reads it. */
export function pipsText(rep) {
  const whole = Math.floor(rep / 3), part = THIRDS[rep % 3];
  return whole ? `${whole}${part}` : part || "0";
}
/** "+⅓", "+⅔", "−1": a change in thirds. */
export const deltaText = (d) => (d < 0 ? `−${pipsText(-d)}` : `+${pipsText(d)}`);

/** An offer as clients make it at this reputation, keeping the full numbers for the struck-through
 *  ones on the board. Boxes round to whole boxes, pay to whole dollars. */
export function scaleOffer(c, rep) {
  const f = offerShare(rep);
  return { ...c, fullCount: c.count, fullPay: c.pay, count: Math.max(1, Math.round(c.count * f)), pay: Math.round(c.pay * f) };
}

/** What a contract does to reputation: what shipping it wins back, and what missing it costs. */
export const gainOf = (c) => REP.gain[c.size] ?? 1;

/** Reputation after a quarter: `results` are { c, won } per contract. Capped at 3 pips, never below 0. */
export function afterQuarter(rep, results) {
  const change = results.reduce((a, r) => a + (r.won ? gainOf(r.c) : -REP.miss), 0);
  return Math.max(0, Math.min(REP.max, rep + change));
}
