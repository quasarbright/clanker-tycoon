// The front page when a business goes under ("the paper lands on your floor", decision 74).
// The humor rule (docs/humor.md): the punchline is one of the game's own mechanics (shipping,
// bins, instructions), never a generic business joke. These three are Mike's picks.
// `when` says which endings a headline fits: "broke" (no money for a shift and no more loans),
// "reputation" (for later: reputation running out).

export const HEADLINES = [
  { when: ["broke", "reputation"], text: (biz) => `${biz} Ships Its Last Box (It Was Empty)` },
  { when: ["reputation"], text: (biz) => `${biz} Reputation Found at Bottom of Bin 2` },
  { when: ["broke", "reputation"], text: (biz) => `Robots of ${biz} Finally Given Clear Instructions: "Leave"` },
];

/** A headline for this ending, the same one for the same `seed`. */
export function headline(reason, biz, seed = 0) {
  const fits = HEADLINES.filter((h) => h.when.includes(reason));
  return fits[Math.abs(Math.floor(seed)) % fits.length].text(biz);
}
