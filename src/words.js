// The words the player sees for the game's ideas, in one place, so renaming one is one edit
// (Mike, 2026-11-17: "you should be using abstractions so that you don't have to make the same
// change in multiple places"). Static labels in index.html carry data-word="<key>" and are filled
// from here on load; code uses WORDS directly. e2e/wording.spec.mjs checks the banned ones never
// show.
export const WORDS = {
  // putting robots on a shift (never "hire" / "let go": they're paid by the shift, decision #58)
  schedule: "Schedule",
  offShift: "Take off shift",
  takeSomeoneOff: "Take someone off the shift",
  // your business between quarters
  recruit: "Recruit",
  recruited: "Recruited",
  training: "Training",
  machines: "Machines",
  bought: "Bought",
  ownedSoFar: "Owned so far", // the Machines note on the board (Mike, 2026-11-18: not "Bought so far")
  funds: "Funds", // your money (never "budget": Mike, 2026-11-18, "let's just say funds")
  startQuarter: "Start the quarter",
  lender: "The lender",
  toLender: "To the lender",
  crewPay: "Crew pay",
  thisShift: "This shift",
  replayShift: "Replay this shift",
  // the quarter's recap (decision 72)
  toBoard: "To the board",
  startedWith: "Started with",
  contractsPaid: "Contracts paid",
  lendersCut: "Lender's cut",
  stillOwed: "Still owed to the lender",
  crewPayAll: "Crew pay, all shifts",
  fundsNow: "Funds now",
  fundsLeft: "Funds left",
  thisQuarter: "This quarter",
  lastQuarter: "Last quarter",
  reputation: "Reputation",
  // the top bar's money line, per kind of level
  labor: "labor",
};

/** By Start when you can't pay even your cheapest robot: you work the shift yourself (decision 81). */
export const aloneLine = (name, wage, funds) =>
  `You can't pay anyone this shift: ${name} costs $${wage} and you have $${Math.max(0, Math.floor(funds))}. Start works it yourself.`;

/** Words that must never reach the player (checked in e2e/wording.spec.mjs). */
export const BANNED_WORDS = /\b(hire[sd]?|hiring|let (?:someone |people |them )?go|fire[sd]?|firing|budgets?|boss(?:es)?)\b/i;

/** Fill every [data-word] element under `root` from WORDS. */
export function applyWords(root = document) {
  for (const el of root.querySelectorAll("[data-word]")) el.textContent = WORDS[el.dataset.word] ?? el.textContent;
}
