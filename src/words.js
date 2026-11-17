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
  budget: "Budget",
  startQuarter: "Start the quarter",
  lender: "The lender",
  toLender: "To the lender",
  crewPay: "Crew pay",
  thisShift: "This shift",
  replayShift: "Replay this shift",
  // the top bar's money line, per kind of level
  labor: "labor",
};

/** Words that must never reach the player (checked in e2e/wording.spec.mjs). */
export const BANNED_WORDS = /\b(hire[sd]?|hiring|let (?:someone |people |them )?go|fire[sd]?|firing)\b/i;

/** Fill every [data-word] element under `root` from WORDS. */
export function applyWords(root = document) {
  for (const el of root.querySelectorAll("[data-word]")) el.textContent = WORDS[el.dataset.word] ?? el.textContent;
}
