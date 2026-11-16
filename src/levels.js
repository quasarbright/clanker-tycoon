// The levels. Each one is a fixed order to fill as fast as you can. Money and your crew carry over
// from shift to shift: you start broke and do the work by hand, and what you earn lets you hire
// robots before the next shift. Hiring is only between shifts, never once the clock is running.
// Each level adds one machine, and you use it yourself before anyone else does.
//   ship: "widgets" (loose widgets ship) or "boxes" (only boxes of 3 ship)
//   order: what to ship. color "any" accepts anything of the right kind. A box counts only if all
//          3 widgets are that color.
//   pay: dollars per item that counts toward the order (wrong items ship for nothing)
//   pool: who you can hire before this shift. Hiring costs 2 minutes of their wage up front, then
//         wages by the second while a shift runs.
//   colors: widget colors the belt brings (default: red, blue and green)
//   stars: finish times (seconds) for 3 and 2 stars; finishing at all is 1 star. First guesses.
export const LEVELS = [
  {
    id: 1, name: "By hand",
    blurb: "Just you, a belt and a dock.",
    stations: ["BELT_A", "DOCK"],
    ship: "widgets", colors: ["red"], order: [{ color: "any", count: 3 }], pay: 4,
    pool: [],
    stars: [30, 45],
    start: "This is you, by the desk. Walk to the <b>Belt</b> (click it, or use WASD / arrow keys), pick up a widget, carry it to the <b>Dock</b> and put it down.",
  },
  {
    id: 2, name: "Boxes",
    blurb: "Pack widgets into boxes of three.",
    stations: ["BELT_A", "PACK", "DOCK"],
    ship: "boxes", colors: ["red"], order: [{ color: "red", count: 3 }], pay: 12,
    pool: ["gary", "rusty", "pip", "blip"],
    stars: [60, 90],
    start: "The dock only takes boxes now. Bring 3 widgets to <b>Pack</b>, pack them into a box, and ship it from the <b>Dock</b>.",
  },
  {
    id: 3, name: "Paint",
    blurb: "New colors, and green is rare. Paint what you need.",
    stations: ["BELT_A", "PAINT", "PACK", "DOCK", "BIN_1", "BIN_2"],
    ship: "boxes", order: [{ color: "green", count: 3 }, { color: "red", count: 2 }], pay: 15,
    pool: ["blip", "gary", "rusty", "pip", "doris", "vex", "bolt"],
    stars: [110, 160],
    start: "Widgets come in three colors now, and green is rare. Carry one to the <b>Paint</b> machine, paint it, and it's whatever color you need. Bins are spare storage.",
  },
];

export const hireFee = (h) => 2 * h.wage;
