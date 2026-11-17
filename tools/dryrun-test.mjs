// Checks the pre-shift dry run (src/dryrun.js) on hand-written programs: good ones pass, ones that
// never make progress are caught.   node tools/dryrun-test.mjs
import { dryRun } from "../src/dryrun.js";
import { parseProgram } from "../src/lang.js";
import { LEVELS } from "../src/levels.js";
const r = (id, skills, attributes = []) => ({ id, name: id, skills, attributes, wage: 3 });
const crew = LEVELS.find(l => l.name === "Crew"), full = LEVELS.find(l => l.name === "Full floor");
const cases = [
 ["hauler", crew, r("b", []), `while (true) { move("BELT"); pickUp("red"); move("PACK"); putDown(); }`, "bring red widgets from the belt to pack", true],
 ["packer", crew, r("c", ["packing"]), `while (needsAny() > 0) { move("PACK"); if (count("PACK", "red") >= 3) pack("red"); if (boxes("PACK") > 0) { pickUpBox(); move("DOCK"); putDown(); } else wait(1); }`, "pack red boxes and ship them", true],
 ["only-ships (broken)", crew, r("c", ["packing"]), `while (needsAny() > 0) { move("PACK"); if (boxes("PACK") > 0) { pickUpBox(); move("DOCK"); putDown(); } else wait(1); }`, "pack red boxes and ship them", false],
 ["shipper only", crew, r("c", ["packing"]), `while (true) { move("PACK"); pickUpBox(); move("DOCK"); putDown(); }`, "ship the boxes from pack", true],
 ["repair", full, r("fix", ["repair"]), `while (true) { if (wear("PAINT") >= 80) { move("PAINT"); service(); } else wait(1); }`, "service the paint machine when it's worn", true],
 ["painter", full, r("p", ["painting"]), `while (true) { move("BELT"); pickUp(); move("PAINT"); paint(needs("green") > 0 ? "green" : "red"); move("PACK"); putDown(); }`, "paint widgets for the order and bring them to pack", true],
 ["green packer", full, r("pk", ["packing"]), `while (true) { move("PACK"); const c = needs("green") > 0 ? "green" : "red"; if (count("PACK", c) >= 3) pack(c); if (boxes("PACK") > 0) { pickUpBox(); move("DOCK"); putDown(); } else wait(1); }`, "pack boxes the order needs and ship them", true],
 ["ends early", crew, r("c", ["packing"]), `move("PACK");`, "pack", false],
 // decision #63: a packer who fetches, then waits at a full Pack instead of packing first, jams it
 ["fetch-then-pack jams a full Pack", crew, r("g", ["packing"], ["fast"]), `while (needsAny() > 0) { move("SUPPLY"); pickUp("red"); move("PACK"); putDown(); if (count("PACK", "red") >= 3) { pack("red"); pickUpBox(); move("DOCK"); putDown(); } }`, "fetch red widgets, put them at pack, pack red boxes and ship them", false],
 ["pack-first does all of it", crew, r("g", ["packing"], ["fast"]), `while (needsAny() > 0) { move("PACK"); if (count("PACK", "red") >= 3) { pack("red"); pickUpBox(); move("DOCK"); putDown(); } else { move("SUPPLY"); pickUp("red"); move("PACK"); putDown(); } }`, "fetch red widgets, put them at pack, pack red boxes and ship them", true],
 ["tight loop", crew, r("c", ["packing"]), `while (true) { if (boxes("PACK") > 5) { pack("red"); } }`, "pack red boxes", false],
];
let bad = 0;
for (const [n, L, h, src, ins, want] of cases) {
  const t = performance.now(); const res = dryRun(L, h, [h], parseProgram(src), ins);
  if (res.ok !== want) bad++;
  console.log(res.ok === want ? "PASS" : "FAIL", n, (performance.now()-t).toFixed(1)+"ms", res.why ?? "");
}
process.exit(bad ? 1 : 0);
