// The levels, for now a tutorial. Each one is a fixed order to fill as fast as you can, and each
// new machine shows up first in a level where you use it yourself, before anyone else does.
// Tutorials stay minimal: just enough to get one idea across. Hiring is free (the money system is
// parked in clanker-tycoon#9) but robots cost wages while the shift runs. You hire and write
// instructions before pressing Start; Start closes hiring.
//   ship: "widgets" (loose widgets ship) or "boxes" (only boxes of 3 ship)
//   colors: widget colors the belt brings (default: red, blue and green, green rarest)
//   order: what to ship. color "any" accepts anything of the right kind. A box counts only if all
//          3 widgets are that color. Anything else ships but doesn't count.
//   pool: who you can hire before the shift (empty = just you)
//   wear: how much each paint job wears the paint machine, in % (default RULES.wear)
//   shift: seconds until the shift ends; the order has to ship by then (none = take your time).
//          Set so one robot can't fill it alone: the point of a crew level is a crew.
// No robot in these pools can do everything: every early level needs two or more people working
// together (Doris and Bolt, who have every skill, are kept for later).
const SHIFT_CREW = 45, SHIFT_FLOOR = 120;
export const LEVELS = [
  {
    id: 1, name: "By hand",
    blurb: "Just you, a belt and a dock.",
    stations: ["BELT_A", "DOCK"],
    ship: "widgets", colors: ["red"], order: [{ color: "any", count: 3 }],
    pool: [],
    start: "This is you. Walk to the <b>Belt</b> (click it, or use WASD / arrow keys), pick up a widget, carry it to the <b>Dock</b> and put it down.",
  },
  {
    id: 2, name: "Boxes",
    blurb: "Pack three widgets into a box.",
    stations: ["BELT_A", "PACK", "DOCK"],
    ship: "boxes", colors: ["red"], order: [{ color: "red", count: 1 }],
    pool: [],
    start: "The dock only takes boxes now. Bring 3 widgets to <b>Pack</b>, pack them into a box, and ship it from the <b>Dock</b>.",
  },
  {
    id: 3, name: "Crew",
    blurb: "A bigger order. Hire robots to help.",
    stations: ["BELT_A", "PACK", "DOCK"],
    ship: "boxes", colors: ["red"], order: [{ color: "red", count: 4 }],
    pool: ["blip", "pip", "gary"],
    shift: SHIFT_CREW,
    start: "One robot can't fill this order before the shift ends. Hire a crew, give each one their part of the work, then press <b>Start</b>.",
  },
  {
    id: 4, name: "Paint",
    blurb: "Paint red widgets blue. Paint wears the machine out.",
    stations: ["BELT_A", "PAINT", "DOCK"],
    ship: "widgets", colors: ["red"], order: [{ color: "blue", count: 2 }],
    pool: [], wear: 100,
    start: "The order wants blue, and the belt only brings red. Carry a red widget to the <b>Paint</b> machine, paint it blue, and ship it from the <b>Dock</b>.",
    worn: "Every job wears the paint machine (the bar along its bottom), and this one is worn out. Stand at <b>Paint</b> and <b>Service</b> it, then paint the next one.",
  },
  {
    id: 5, name: "Full floor",
    blurb: "Everything, and anyone you want to hire.",
    stations: ["BELT_A", "PAINT", "PACK", "DOCK", "BIN_1", "BIN_2"],
    ship: "boxes", order: [{ color: "green", count: 3 }, { color: "red", count: 2 }],
    pool: ["blip", "gary", "rusty", "pip", "vex"],
    shift: SHIFT_FLOOR,
    start: "Three colors now, and green is rare. Hire your crew, write their instructions, then press <b>Start</b>. Bins are spare storage.",
  },
];
