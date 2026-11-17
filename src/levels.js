// The levels, for now a tutorial. Each one is a fixed order to fill as fast as you can, and each
// new machine shows up first in a level where you use it yourself, before anyone else does.
// Tutorials stay minimal: just enough to get one idea across. Hiring is free (the money system is
// parked in clanker-tycoon#9) but each robot is paid a flat rate for the shift. You hire and write
// instructions before pressing Start; Start closes hiring.
//   ship: "widgets" (loose widgets ship) or "boxes" (only boxes of 3 ship)
//   colors: widget colors the supply gives out (default: red only). It never runs out.
//   order: what to ship. color "any" accepts anything of the right kind. A box counts only if all
//          3 widgets are that color. Anything else ships but doesn't count.
//   pool: who you can hire before the shift (empty = just you)
//   wear: how much each paint job wears the paint machine, in % (default RULES.wear)
//   shift: seconds until the shift ends; the order has to ship by then (none = take your time).
//          Set so one robot can't fill it alone: the point of a crew level is a crew.
// No robot in these pools can do everything: every early level needs two or more people working
// together (Doris and Bolt, who have every skill, are kept for later).
//   quarter: { shifts, budget } makes the level a quarter (docs/decisions.md #35): the order is a
//          quota to ship over that many shifts, and budget pays each shift's crew (#47). Your
//          crew, their instructions and the conversations carry over; the floor resets.
const SHIFT_CREW = 45, SHIFT_FLOOR = 120;
export const LEVELS = [
  {
    id: 1, name: "By hand",
    blurb: "Just you, a supply and a dock.",
    stations: ["SUPPLY", "DOCK"],
    ship: "widgets", colors: ["red"], order: [{ color: "any", count: 3 }],
    pool: [],
    start: "This is you. Walk to the <b>Supply</b> (click it, or use WASD / arrow keys), pick up a widget, carry it to the <b>Dock</b> and put it down.",
  },
  {
    id: 2, name: "Boxes",
    blurb: "Pack three widgets into a box.",
    stations: ["SUPPLY", "PACK", "DOCK"],
    ship: "boxes", colors: ["red"], order: [{ color: "red", count: 1 }],
    pool: [],
    start: "The dock only takes boxes now. Bring 3 widgets to <b>Pack</b>, pack them into a box, and ship it from the <b>Dock</b>.",
  },
  {
    id: 3, name: "Crew",
    blurb: "A bigger order. Hire robots to help.",
    stations: ["SUPPLY", "PACK", "DOCK"],
    ship: "boxes", colors: ["red"], order: [{ color: "red", count: 4 }],
    pool: ["blip", "pip", "gary"],
    shift: SHIFT_CREW,
    start: "One robot can't fill this order before the shift ends. Hire a crew, give each one their part of the work, then press <b>Start</b>.",
  },
  {
    id: 4, name: "Paint",
    blurb: "Paint red widgets blue. Paint wears the machine out.",
    stations: ["SUPPLY", "PAINT", "DOCK"],
    ship: "widgets", colors: ["red"], order: [{ color: "blue", count: 2 }],
    pool: [], wear: 100,
    start: "The order wants blue, and the supply only gives out red. Carry a red widget to the <b>Paint</b> machine, paint it blue, and ship it from the <b>Dock</b>.",
    worn: "Every job wears the paint machine (the bar along its bottom), and this one is worn out. Stand at <b>Paint</b> and <b>Service</b> it, then paint the next one.",
  },
  {
    id: 5, name: "Full floor",
    blurb: "Everything, and anyone you want to hire.",
    stations: ["SUPPLY", "PAINT", "PACK", "DOCK", "BIN_1", "BIN_2"],
    ship: "boxes", order: [{ color: "green", count: 3 }, { color: "red", count: 2 }],
    pool: ["blip", "gary", "rusty", "pip", "vex"],
    shift: SHIFT_FLOOR,
    start: "The order wants green and red, and the supply only gives out red, so someone has to paint. Hire your crew, write their instructions, then press <b>Start</b>. Bins are spare storage.",
  },
  {
    // The first quarter: a sandbox for money against crew. The supply never runs out, so a
    // bigger crew really ships more. It only gives out red, so every blue box is three paint jobs,
    // and the paint machine wears. Numbers from tools/balance.mjs: see docs/decisions.md #35, #57.
    id: 6, name: "First quarter",
    blurb: "A quota, three shifts and a budget.",
    stations: ["SUPPLY", "PAINT", "PACK", "DOCK", "BIN_1", "BIN_2"],
    ship: "boxes", colors: ["red"],
    order: [{ color: "red", count: 24 }, { color: "blue", count: 9 }],
    pool: ["blip", "dot", "pip", "gary", "rusty", "vex"],
    shift: SHIFT_FLOOR,
    quarter: { shifts: 3, budget: 110 },
    start: "Ship the quota within three shifts. Each robot's pay for the shift comes out of your budget when you press <b>Start</b>. Your crew stays from shift to shift.",
  },
  {
    // Your business (src/business.js): the contract loop on level 6's floor. Opens on the
    // contract board; the contracts you pick for a quarter play as one quarter, all due at its end.
    id: 7, name: "Your business",
    blurb: "Take contracts, buy equipment, pay the investor.",
    stations: ["SUPPLY", "PAINT", "PACK", "DOCK", "BIN_1", "BIN_2"],
    ship: "boxes", colors: ["red"],
    order: [{ color: "red", count: 1 }],
    pool: ["blip", "dot", "pip", "gary", "rusty", "vex"],
    shift: SHIFT_FLOOR,
    business: true,
  },
];
