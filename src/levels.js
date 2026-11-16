// The levels, for now a tutorial. Each one is a fixed order to fill as fast as you can, and each
// new machine shows up first in a level where you use it yourself, before anyone else does.
// Hiring is free here (money is a long-term idea, clanker-tycoon#9), but only before the shift
// starts: your first move starts the clock and closes hiring.
//   ship: "widgets" (loose widgets ship) or "boxes" (only boxes of 3 ship)
//   colors: widget colors the belt brings (default: red, blue and green, green rarest)
//   order: what to ship. color "any" accepts anything of the right kind. A box counts only if all
//          3 widgets are that color. Anything else ships but doesn't count.
//   pool: who you can hire before the shift (empty = just you)
//   stars: finish times (seconds) for 3 and 2 stars; finishing at all is 1 star
export const LEVELS = [
  {
    id: 1, name: "By hand",
    blurb: "Just you, a belt and a dock.",
    stations: ["BELT_A", "DOCK"],
    ship: "widgets", colors: ["red"], order: [{ color: "any", count: 3 }],
    pool: [],
    stars: [22, 32],
    start: "This is you. Walk to the <b>Belt</b> (click it, or use WASD / arrow keys), pick up a widget, carry it to the <b>Dock</b> and put it down.",
  },
  {
    id: 2, name: "Boxes",
    blurb: "Pack widgets into boxes of three.",
    stations: ["BELT_A", "PACK", "DOCK"],
    ship: "boxes", colors: ["red"], order: [{ color: "red", count: 2 }],
    pool: [],
    stars: [38, 55],
    start: "The dock only takes boxes now. Bring 3 widgets to <b>Pack</b>, pack them into a box, and ship it from the <b>Dock</b>.",
  },
  {
    id: 3, name: "Crew",
    blurb: "A bigger order. Hire robots to help.",
    stations: ["BELT_A", "PACK", "DOCK"],
    ship: "boxes", colors: ["red"], order: [{ color: "red", count: 6 }],
    pool: ["gary", "rusty", "pip", "blip"],
    stars: [70, 100],
    start: "Hire as many robots as you like and write each one's instructions. Your first move starts the clock, and hiring closes once it's running.",
  },
  {
    id: 4, name: "Paint",
    blurb: "Three colors now, and green is rare.",
    stations: ["BELT_A", "PAINT", "PACK", "DOCK"],
    ship: "boxes", order: [{ color: "green", count: 1 }],
    pool: [],
    stars: [45, 70],
    start: "Widgets come in three colors now, and green is rare. Carry one to the <b>Paint</b> machine and paint it green. Pack 3 greens into a box and ship it.",
  },
  {
    id: 5, name: "Full floor",
    blurb: "Everything, and anyone you want to hire.",
    stations: ["BELT_A", "PAINT", "PACK", "DOCK", "BIN_1", "BIN_2"],
    ship: "boxes", order: [{ color: "green", count: 3 }, { color: "red", count: 2 }],
    pool: ["blip", "gary", "rusty", "pip", "doris", "vex", "bolt"],
    stars: [110, 160],
    start: "Hire your crew and write their instructions. Bins are spare storage. Your first move starts the clock.",
  },
];
