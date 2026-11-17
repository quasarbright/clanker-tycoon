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
