// What a robot costs for a shift (shifts are a fixed length, so a per-minute wage was just a
// multiplier): $5, plus $5 for every skill and every attribute. A third skill jumps a tier, $20
// more on top (docs/decisions.md #56): a robot who can do everything costs a lot more than a crew.
// Its own module so the headless tools can use it without the browser-only parts of brains.js.
export const SKILL_TIER = { at: 3, extra: 20 };
export const wageOf = (skills, attributes) => 5 + 5 * (skills.length + attributes.length) + (skills.length >= SKILL_TIER.at ? SKILL_TIER.extra : 0);
