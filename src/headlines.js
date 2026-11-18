// The front page when a business goes under ("the paper lands on your floor", decision 74).
// The humor rule (docs/humor.md): the punchline is one of the game's own mechanics (shipping,
// bins, instructions), never a generic business joke, and it reads like a real headline. These
// are Mike's picks.
// `when` says which endings a headline fits: "broke" (no money for a shift and no more loans),
// "reputation" (for later: reputation running out). `if` (optional) says what the run must have
// had, from `facts`: { paint: owns a paint machine, borrowed: took a loan at least once }.

export const HEADLINES = [
  { when: ["broke", "reputation"], text: (biz) => `${biz} Ships Its Last Box (It Was Empty)` },
  { when: ["reputation"], text: (biz) => `${biz} Reputation Found at Bottom of Bin 2` },
  { when: ["broke", "reputation"], text: (biz) => `Robots of ${biz} Finally Given Clear Instructions: “Leave”` },
  { when: ["broke", "reputation"], if: (f) => f.paint, text: (biz) => `${biz} Paint Machine Outlasts ${biz}` },
  { when: ["broke"], if: (f) => f.borrowed, text: (biz) => `Lender Collects His 10% of ${biz}: $0` },
];

/** The headlines that fit this ending and this run. */
export const headlinesFor = (reason, facts = {}) => HEADLINES.filter((h) => h.when.includes(reason) && (!h.if || h.if(facts)));

/** A headline for this ending and run, the same one for the same `seed`. */
export function headline(reason, biz, seed = 0, facts = {}) {
  const fits = headlinesFor(reason, facts);
  return fits[Math.abs(Math.floor(seed)) % fits.length].text(biz);
}
