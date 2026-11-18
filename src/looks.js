// What a robot's skills and attributes look like on them (decisions #48, #51): you can tell who does
// what at a glance on the floor. Skills are tools they carry (a box for packing, a paintbrush for
// painting, a wrench for repair); Smart wears glasses and Fast rolls on wheels.
// Nimble and Steady don't have a look yet.

const svg = (body, cls, box = "0 0 24 24") => `<svg class="${cls}" viewBox="${box}" aria-hidden="true">${body}</svg>`;

const TOOLS = {
  // a cardboard box with a strip of tape
  packing: `<rect x="3" y="7" width="18" height="14" rx="1.5" fill="#c8955a" stroke="#17140a" stroke-width="1.6"/>
    <path d="M3 7l2.5-3.5h13L21 7" fill="#dcae74" stroke="#17140a" stroke-width="1.6" stroke-linejoin="round"/>
    <rect x="10" y="7" width="4" height="6" fill="#efe1c4"/>`,
  // a paintbrush, bristles dipped in blue
  painting: `<g transform="rotate(40 12 12)"><rect x="10.5" y="10" width="3" height="13" rx="1.5" fill="#a86b3c" stroke="#17140a" stroke-width="1.4"/>
    <rect x="9.5" y="7" width="5" height="4" fill="#b8bec7" stroke="#17140a" stroke-width="1.4"/>
    <path d="M9.5 7V4.5C9.5 2.5 12 1 12 1s2.5 1.5 2.5 3.5V7z" fill="#4f8ff0" stroke="#17140a" stroke-width="1.4" stroke-linejoin="round"/></g>`,
  // a wrench (Lucide's shape, filled)
  repair: `<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" fill="#c9ced6" stroke="#17140a" stroke-width="1.6" stroke-linejoin="round"/>`,
};
// Two wheels under the head, with spokes so you can see them turn while the robot moves.
const wheel = (cx) => `<g class="ct-wheel"><circle cx="${cx}" cy="8" r="6.5" fill="#3a3f47" stroke="#17140a" stroke-width="2.2"/>
  <path d="M${cx} 2.5v11M${cx - 5.5} 8h11" stroke="#8b929c" stroke-width="1.6"/>
  <circle cx="${cx}" cy="8" r="2.2" fill="#c9ced6" stroke="#17140a" stroke-width="1.4"/></g>`;
const WHEELS = wheel(10) + wheel(30);
// Round glasses, lenses centered on the eyes (see .ct-glasses in index.html for the placement).
const GLASSES = `<circle cx="15" cy="12" r="9.5" fill="#ffffff30" stroke="#17140a" stroke-width="3"/>
  <circle cx="45" cy="12" r="9.5" fill="#ffffff30" stroke="#17140a" stroke-width="3"/>
  <path d="M24.5 11q5.5-4 11 0" fill="none" stroke="#17140a" stroke-width="3"/>`;

const has = (h, k) => h.skills?.includes(k) || h.attributes?.includes(k);

/** Glasses on the face; wheels under the head for Fast (they turn while walking, index.html). */
export const headLooks = (h) =>
  (has(h, "smart") ? svg(GLASSES, "ct-glasses", "0 0 60 24") : "") + (has(h, "fast") ? svg(WHEELS, "ct-wheels", "0 0 40 16") : "");

/** The tools they carry, one per skill. */
export const toolLooks = (h) => {
  const tools = ["packing", "painting", "repair"].filter((k) => has(h, k));
  return tools.length ? `<span class="ct-tools">${tools.map((k) => svg(TOOLS[k], `ct-tool is-${k}`)).join("")}</span>` : "";
};

/** A small face for lists and chat headers, with the same looks. */
export const faceHTML = (h) => `<span class="ct-face" style="--c:${h.color}">${headLooks(h)}${toolLooks(h)}</span>`;

// You, the owner: a round head under a hard hat with a center seam and a brim. The hat is shared
// with the floor (ownerHatSVG), where your face stays a robot's face (Mike, 2026-11-18). `shocked` is the newspaper's
// moment: pinned pupils, an open mouth, the flash's hard shadow on the wall and two shake lines.
// Colors come from CSS (.ct-owner in index.html), so the paper prints it in gray.
const OWNER_HAT = `<path class="dome" d="M86 92 a64 64 0 0 1 128 4 Z"/>
  <path class="seam" d="M152 30 L148 94"/>
  <ellipse class="shine" cx="118" cy="56" rx="17" ry="7" transform="rotate(-18 118 56)"/>
  <rect class="band" x="72" y="84" width="160" height="22" rx="11" transform="rotate(4 152 95)"/>`;
/** Just the hard hat, for you on the floor: your face there stays a robot's face (Mike, 2026-11-18:
 *  "Just change the hat in game ... keep the eyes the same as the robots"). Same shapes as the photo. */
export const ownerHatSVG = () => `<svg class="ct-owner ct-owner-hat" viewBox="66 22 172 90" aria-hidden="true">${OWNER_HAT}</svg>`;
// The newspaper photo of you, caught by the flash, in Pam's four poses (Mike, 2026-11-18: the shocked
// head, then "i like all of them except 3. 4 is pretty funny"). Same head, hat, flash shadow on the
// wall; only the face changes. Faces are drawn in Pam's mock coordinates (head r60 at 500,300) and
// placed on this head (r72 at 150,128).
// This hat sits lower on the head than in Pam's mocks, so her faces move down 16 to clear the brim.
const PAM = (body) => `<g transform="translate(150 128) scale(1.05) translate(-500 -284)">${body}</g>`;
const WORRIED_EYES = (dx = 0, dy = 0) => `<circle class="eye" cx="477" cy="297" r="16"/><circle class="pupil" cx="${477 + dx}" cy="${297 + dy}" r="5"/>
  <circle class="eye" cx="523" cy="297" r="16"/><circle class="pupil" cx="${523 + dx}" cy="${297 + dy}" r="5"/>
  <path class="brow" d="M467 273 L486 267 M533 273 L514 267"/>`;
const BLUSH = `<path class="blush" d="M462 325l5-9 M470 325l5-9 M478 325l5-9 M520 325l5-9 M528 325l5-9 M536 325l5-9"/>`;
const FACES = {
  // wide eyes, pinned pupils, an open mouth and two shake lines
  shocked: `<circle class="eye" cx="123" cy="126" r="21"/><circle class="pupil" cx="123" cy="126" r="10"/><circle class="eye" cx="178" cy="128" r="21"/><circle class="pupil" cx="181" cy="129" r="10"/>
    <ellipse class="mouth" cx="148" cy="170" rx="13" ry="18"/><path class="shake" d="M232 112 l14 -7 M234 140 h16"/>`,
  // worried brows, a wobbly line of a smile, blushing (Mike's favorite)
  awkward: PAM(`${WORRIED_EYES()}<path class="wobble" d="M488 331 q4 -5 8 0 t8 0 t8 0"/>${BLUSH}<path class="shake" d="M568 270 l10 -6"/>`),
  // caught with the mouth full
  bite: PAM(`${WORRIED_EYES()}<ellipse class="mouth" cx="500" cy="330" rx="6" ry="7"/><path class="shake" d="M568 270 l10 -6"/>`),
  // eyes sliding off to the side, blushing
  blushing: PAM(`${WORRIED_EYES(6, 2)}<ellipse class="mouth" cx="502" cy="331" rx="5.5" ry="6.5"/>${BLUSH}`),
};
/** The photos the paper picks from, and what each caption says. */
export const OWNER_PHOTOS = [
  { face: "shocked", caption: (name) => `The owner of ${name}, moments after hearing the news.` },
  { face: "awkward", caption: (name) => `The owner of ${name}, reached for comment.` },
  { face: "bite", caption: (name) => `The owner of ${name}, reached for comment.` },
  { face: "blushing", caption: (name) => `The owner of ${name}, reached for comment.` },
];
/** One photo for this ending, the same one for the same `seed`. */
export const ownerPhoto = (seed = 0) => OWNER_PHOTOS[Math.abs(Math.floor(seed)) % OWNER_PHOTOS.length];

/** You in the newspaper photo with this face. Colors come from CSS (.ct-paper-photo .ct-owner). */
export const ownerHeadSVG = (face = "shocked") => `<svg class="ct-owner is-${face}" viewBox="0 0 300 220" aria-hidden="true">
  <g class="shadow" transform="translate(34 -12)"><circle cx="150" cy="128" r="72"/><path d="M84 92 a66 62 0 0 1 132 0 Z"/><rect x="72" y="84" width="160" height="22" rx="11" transform="rotate(4 152 95)"/></g>
  <circle class="face" cx="150" cy="128" r="72"/>
  <path class="chin" d="M88 158 a72 72 0 0 0 124 0 a90 60 0 0 1 -124 0 Z"/>
  ${OWNER_HAT}
  ${FACES[face]}</svg>`;
