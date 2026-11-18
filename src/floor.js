// Your floor's layout (decision 85): where each machine you own stands. Supply, the Dock and your
// desk are bolted down; everything else (Paint, Pack, the bins, the Assembler) sits in one of a
// few slots, or waits "in storage" until you place it. Editing happens before a shift, never
// during one. Programs name stations, not places, so moving a machine never breaks anyone's
// instructions: it only changes how far the crew walks.
//
// The floor is 100 × 64 units (sim.js). A slot is a machine's tile plus the ring robots stand in to
// use it, so slots never overlap and a robot can always reach a machine from some side.

/** The bolted-down anchors on a business floor. */
export const ANCHORS = { SUPPLY: { x: 14, y: 12 }, DOCK: { x: 89, y: 37 } };

/** The slots, left to right and top to bottom. The bottom right is your desk. */
export const SLOTS = [
  { x: 34, y: 12 }, { x: 52, y: 12 }, { x: 70, y: 12 },
  { x: 34, y: 37 }, { x: 52, y: 37 }, { x: 70, y: 37 },
  { x: 34, y: 56 }, { x: 52, y: 56 },
];

/** A new business's floor: Pack and the two bins, where level 6 had them. */
// `fresh` is what you bought and haven't placed or set aside yet: the Edit floor button pulses for
// it, and Start places it for you. "Keep in storage" empties it (Mike, 2026-11-18).
export const newFloor = () => ({ at: { PACK: 2, BIN_1: 3, BIN_2: 4 }, storage: [], fresh: [] });

/** Which machine stands in slot `i`, if any. */
export const inSlot = (floor, i) => Object.keys(floor.at).find((k) => floor.at[k] === i) ?? null;

/**
 * Put `key` (on the floor or in storage) into slot `i`. A machine already there swaps places with
 * it: it goes where `key` came from, or into storage if `key` came from storage (Mike, 2026-11-18:
 * swap, over refusing the drop). Returns what moved, or null if nothing did.
 */
export function place(floor, key, i) {
  if (i < 0 || i >= SLOTS.length) return null;
  const from = floor.at[key] ?? null, other = inSlot(floor, i);
  if (other === key) return null;
  floor.storage = floor.storage.filter((k) => k !== key);
  floor.fresh = (floor.fresh ?? []).filter((k) => k !== key);
  floor.at[key] = i;
  if (other) {
    if (from != null) floor.at[other] = from;
    else { delete floor.at[other]; floor.storage.push(other); }
  }
  return { key, to: i, swapped: other, otherTo: other ? (from ?? "storage") : null };
}

/** Take a machine off the floor and into storage. */
export function store(floor, key) {
  if (floor.at[key] == null) return false;
  delete floor.at[key];
  if (!floor.storage.includes(key)) floor.storage.push(key);
  return true;
}

/** A newly bought machine waits in storage until you place it. */
export function addToStorage(floor, key) {
  if (floor.at[key] != null || floor.storage.includes(key)) return;
  floor.storage.push(key);
  (floor.fresh ??= []).push(key);
}

/** Leave what's new in storage: the button stops pulsing and Start won't place it. */
export const keepInStorage = (floor) => { floor.fresh = []; };

/** The free slot nearest the middle of the floor's working area (what Start uses for leftovers). */
const MIDDLE = { x: 52, y: 30 };
export function nearestFree(floor) {
  const free = SLOTS.map((s, i) => ({ i, d: Math.hypot(s.x - MIDDLE.x, s.y - MIDDLE.y) })).filter(({ i }) => !inSlot(floor, i));
  return free.sort((a, b) => a.d - b.d)[0]?.i ?? null;
}

/** Before a shift: anything new you haven't placed or set aside goes into the nearest free slot.
 *  What you chose to keep in storage stays there. Returns what moved. */
export function placeLeftovers(floor) {
  const moved = [];
  for (const key of [...(floor.fresh ?? [])]) {
    const i = nearestFree(floor);
    if (i == null) break;
    place(floor, key, i);
    moved.push(key);
  }
  return moved;
}

/** Where every station stands on this floor, for the sim: the anchors plus each placed machine. */
export const positionsOf = (floor) => ({ ...ANCHORS, ...Object.fromEntries(Object.entries(floor.at).map(([k, i]) => [k, { ...SLOTS[i] }])) });
