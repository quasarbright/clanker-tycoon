// The front page when a business goes under ("the paper lands on your floor", decision 74).
// The humor rule (docs/humor.md): the punchline is one of the game's own mechanics (shipping,
// bins, instructions), never a generic business joke, and it reads like a real headline. These
// are Mike's picks.
// `when` says which endings a headline fits: "broke" (no money for a shift and no more loans),
// "reputation" (for later: reputation running out). The paint machine's and the lender's are
// always in the rotation, whatever the run had (Mike: "paint machine can just blindly be in the
// rotation" ... "same with lender", decision 77).

const ANY = ["broke", "reputation"];
export const HEADLINES = [
  { when: ANY, text: (biz) => `${biz} Ships Its Last Box (It Was Empty)` },
  { when: ["reputation"], text: (biz) => `${biz} Reputation Found at Bottom of Bin 2` },
  { when: ANY, text: (biz) => `Robots of ${biz} Finally Given Clear Instructions: “Leave”` },
  { when: ANY, text: (biz) => `${biz} Paint Machine Outlasts ${biz}` },
  { when: ANY, text: (biz) => `Lender Collects His 10% of ${biz}: $0` },
];

/** The headlines that fit this ending. */
export const headlinesFor = (reason) => HEADLINES.filter((h) => h.when.includes(reason));

/** A headline for this ending, the same one for the same `seed`. */
export function headline(reason, biz, seed = 0) {
  const fits = headlinesFor(reason);
  return fits[Math.abs(Math.floor(seed)) % fits.length].text(biz);
}
