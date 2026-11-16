// Plays level 1 headless as a player who never stops (belt → dock forever). (The hiring branch
// is from when you could hire mid-shift; hiring now happens between shifts.) Prints the finish time.
import { newGame, step, playerGo, addWorker, setScript } from "../src/sim.js";
import { LEVELS, hireFee } from "../src/levels.js";
const gary = { id: "gary", name: "Gary-7", wage: 5, skills: ["fast"] };
function play(withHire, seed) {
  const g = newGame(LEVELS[0], [], seed);
  let hired = false;
  while (!g.over && g.t < 400) {
    const p = g.player;
    if (!p.act) playerGo(g, p.holding ? "DOCK" : "BELT_A", p.holding ? { action: "putDown" } : { action: "pickUp" });
    if (withHire && !hired && g.cash >= hireFee(gary)) {
      g.cash -= hireFee(gary); hired = true;
      const w = addWorker(g, gary);
      // about 4 s for the model to answer
      setTimeout0(g, 4, () => setScript(g, w, [{ action: "moveTo", station: "BELT_A" }, { action: "pickUp" }, { action: "moveTo", station: "DOCK" }, { action: "putDown" }]));
    }
    for (const t of timers) if (!t.done && g.t >= t.at) { t.done = true; t.fn(); }
    step(g, 1 / 30);
    g.events.length = 0;
  }
  return { t: +g.t.toFixed(1), cash: +g.cash.toFixed(1) };
}
const timers = [];
const setTimeout0 = (g, secs, fn) => timers.push({ at: g.t + secs, fn });
for (const hire of [false]) console.log(hire ? "you + Gary:" : "you alone: ", [1, 2, 3, 4].map((s) => { timers.length = 0; return JSON.stringify(play(hire, s)); }).join(" "));
