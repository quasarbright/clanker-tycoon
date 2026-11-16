// The levels. Each one adds a single idea: carrying, then packing, then orders, colors and payroll.
//   ship: what the dock accepts and pays for
//     "widgets"  any widget ships for widgetPay
//     "boxes"    any box ships for boxPay (loose widgets don't ship)
//     "orders"   a box of 3 matching an open order pays the order; anything else is $5 scrap
//   goal: { ship: n } ends the level as soon as n things have shipped (no clock)
//   shift: seconds, for a timed level scored by profit (stars)
export const LEVELS = [
  {
    id: 1, name: "First day",
    blurb: "One robot, a belt and a dock.",
    hires: ["gary"], stations: ["BELT_A", "DOCK"],
    ship: "widgets", widgetPay: 5, goal: { ship: 5 }, shift: null, payroll: false, orders: false,
    howto: "Widgets come in on the belt. Anything that reaches the dock ships for $5. Ship 5 widgets.",
    plan: "Write Gary-7's instructions: carry widgets from the belt to the dock. Then press <b>Start</b>.",
    examples: [],
  },
  {
    id: 2, name: "Boxes",
    blurb: "Widgets ship in boxes of three now.",
    hires: ["gary", "doris"], stations: ["BELT_A", "PACK", "DOCK"],
    ship: "boxes", boxPay: 15, goal: { ship: 3 }, shift: null, payroll: false, orders: false,
    howto: "The dock only takes boxes now. A box is 3 widgets packed together at Pack. Ship 3 boxes.",
    plan: "Split the work: one worker brings widgets to <b>Pack</b>, the other packs boxes and ships them from the <b>Dock</b>. Write instructions for both, then press <b>Start</b>.",
    examples: ["Bring widgets from the belt to Pack.", "Pack boxes at Pack and ship them from the Dock."],
  },
  {
    id: 3, name: "Full shift",
    blurb: "Orders, colors, a paint machine and payroll.",
    hires: ["gary", "doris", "blip"], stations: ["BELT_A", "PAINT", "PACK", "DOCK", "BIN_1", "BIN_2"],
    ship: "orders", goal: null, shift: 240, payroll: true, orders: true, stars: [20, 60, 120],
    howto: "Customers want boxes of 3 widgets of one color ($30–40). Mixed or unwanted boxes pay $5. Payroll comes out every minute. Make as much as you can in four minutes.",
    plan: "Three workers, four minutes. Write everyone's instructions, then press <b>Start</b>. Blip is cheap but mishears things.",
    examples: ["Bring widgets from the belt to Pack.", "Pack boxes at Pack and ship them from the Dock.", "Paint blue widgets red and bring them to Pack."],
  },
];
