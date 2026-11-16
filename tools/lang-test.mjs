// Tests for src/lang.js: the checker's verdicts and the interpreter's behavior.
//   node tools/lang-test.mjs
import { parseProgram, checkProgram, runProgram, ProgramError } from "../src/lang.js";

let failed = 0;
const ok = (cond, name) => { if (!cond) { failed++; console.log("FAIL", name); } else console.log("ok  ", name); };

const TOOLS = { actions: ["move", "pickUp", "pack", "say"], queries: ["count", "needs", "holding"], known: ["move", "pickUp", "pack", "paint", "say"] };
const check = (src) => checkProgram(parseProgram(src), TOOLS);
const kinds = (src) => check(src).map((p) => p.kind).sort().join(",");

// checker
ok(kinds(`while (true) { const c = needs("red") > 0 ? "red" : "blue"; if (count("PACK", c) >= 3) { move("PACK"); pack(c); } }`) === "", "a good program passes");
ok(kinds(`function f(c) { return count("PACK", c); } for (const c of ["red", "blue"]) { if (f(c) > 2) pack(c); }`) === "", "functions and for...of pass");
ok(kinds(`paint("blue");`) === "skill", "a known action without the skill is a skill problem");
ok(kinds(`teleport("DOCK");`) === "unknown", "an unknown function is the model's fault");
ok(kinds(`const xs = ["red"]; if (xs.includes("red")) move("PACK");`).includes("subset"), "method calls are outside the subset");
ok(kinds(`const f = () => 1;`).includes("subset"), "arrow functions are outside the subset");
ok(kinds(`var x = 1;`) === "subset", "var is outside the subset");
let threw = null;
try { parseProgram(`while (true) { move("PACK") `); } catch (e) { threw = e; }
ok(threw instanceof ProgramError && threw.kind === "parse", "a syntax error is a parse error");

// interpreter: drive a program with fake tools and record the actions it takes
function drive(src, { queries = {}, results = () => true, max = 20 } = {}) {
  const actions = Object.fromEntries(TOOLS.known.map((n) => [n, (...args) => ({ action: n, args })]));
  const gen = runProgram(parseProgram(src), { actions, queries });
  const log = [];
  let r = gen.next();
  while (!r.done && log.length < max) { log.push(r.value); r = gen.next(results(r.value)); }
  return { log, done: r.done };
}

let { log, done } = drive(`move("BELT"); pickUp("red"); move("PACK");`);
ok(done && log.map((a) => a.action).join(" ") === "move pickUp move", "actions come out in order, then the program ends");
ok(log[1].args[0] === "red", "action arguments come through");

({ log } = drive(`while (true) { move("BELT"); }`, { max: 5 }));
ok(log.length === 5, "an infinite loop that acts keeps going");

({ log } = drive(`let n = 0; while (n < 3) { if (pickUp("red")) n++; } say("done");`, { results: (a) => a.action === "pickUp" ? Math.random() < 0.5 : true, max: 200 }));
ok(log.filter((a) => a.action === "pickUp").length >= 3 && log.at(-1).action === "say", "action results come back into the program");

({ log } = drive(`const c = needs("red") > 0 ? "red" : "blue"; pack(c);`, { queries: { needs: () => 0 } }));
ok(log[0].args[0] === "blue", "questions answer instantly and steer the program");

({ log } = drive(`function best() { for (const c of ["red", "blue", "green"]) { if (needs(c) > 1) return c; } return "red"; } pack(best());`, { queries: { needs: (c) => (c === "green" ? 2 : 0) } }));
ok(log[0].args[0] === "green", "user functions, for...of and return work");

({ log } = drive(`for (let i = 0; i < 10; i++) { if (i === 2) continue; if (i === 4) break; say(i); }`));
ok(log.map((a) => a.args[0]).join(",") === "0,1,3", "break and continue work");

threw = null;
try { drive(`while (true) { const x = count("PACK"); }`, { queries: { count: () => 0 } }); } catch (e) { threw = e; }
ok(threw instanceof ProgramError && threw.kind === "loop", "a loop that never acts is stopped as a runaway loop");

threw = null;
try { drive(`say(nope);`); } catch (e) { threw = e; }
ok(threw instanceof ProgramError && threw.kind === "runtime", "an unknown name at runtime is a runtime error");

console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
