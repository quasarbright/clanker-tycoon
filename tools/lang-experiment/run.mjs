// Which language should worker programs be written in: a JavaScript subset or a small Lisp?
// Same world, same tools, same 8 sets of instructions; only the language guidance differs.
// Each compile goes through the game's real path (claude -p, Haiku 5.5, JSON answer with the
// program as a string). Programs are checked automatically (parses? stays in the subset? only real
// tools with valid stations/colors?); failures get one repair retry with the error. Semantic
// quality is graded by hand afterwards (see REPORT.md).
//   node run.mjs            → results/runs.json
import { writeFileSync, mkdirSync } from "node:fs";
import * as acorn from "acorn";
import { ask, summarize } from "../../server/claude.mjs";

// node run.mjs [runs] [task,task,...] [outfile]
const RUNS = +(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 3);
const ONLY = process.argv[3] ? process.argv[3].split(',') : null;
const OUT = process.argv[4] || 'results/runs.json';
const CONCURRENCY = 4;

// ---------- the world, shared ----------

const WORLD = `You program a robot worker in a small factory. The boss gives the worker instructions in plain English; you turn them into a program the worker runs.

The floor:
- BELT: new widgets arrive here, red, blue or green (green is rare).
- PACK: packing station. 3 widgets sitting here can be packed into a box. Holds 6 things.
- PAINT: paint machine. Paints the widget the worker is holding. It sometimes jams and must be fixed.
- DOCK: a box put down here ships.
- BIN_1, BIN_2: storage, 5 things each.
The worker holds one thing at a time. Actions that can't be done (nothing to pick up, station full) do nothing and the program carries on.

Rules: do exactly what the instructions say, nothing more. Coworkers handle their own instructions; don't do their part. Unless the instructions say to stop, the work goes on all shift, so the program should repeat forever.`;

const JS_GUIDE = `Write the program in this small subset of JavaScript and nothing else:
- let and const, numbers, strings, true/false/null
- if / else, while, for (;;), for...of over an array literal, break, continue
- function declarations and return
- operators: + - * / % === !== < > <= >= && || !, and the ternary ?:
- array literals and indexing (arr[i], arr.length)
Not allowed: arrow functions, classes, objects, methods (no .includes, .push, …), template strings, async/await, try/catch, regular expressions, any global other than the tools below.

Actions (each takes a moment; the program waits for it to finish):
  move(station)        walk to "BELT", "PACK", "PAINT", "DOCK", "BIN_1" or "BIN_2"
  pickUp(color)        pick up a widget here of that color ("red", "blue", "green"); pickUp() takes any widget
  pickUpBox()          at PACK, pick up a finished box
  putDown()            put down what you're holding here
  pack(color)          at PACK, pack 3 widgets of that color into a box; pack() uses any 3
  paint(color)         at PAINT, paint the widget you're holding
  fix()                at PAINT, unjam the machine
  wait(seconds)
  say(text)            say something out loud
  think(reason)        stop and ask your own judgment (use only when something is truly unexpected)
Questions (instant):
  holding()            "nothing", "box", or the color of the widget you're holding
  count(station, color) widgets there of that color; count(station) counts all widgets
  boxes(station)       finished boxes there
  space(station)       free spots there
  jammed()             true if the paint machine is jammed
  needs(color)         boxes of that color the order still needs (0 if none)
  needsAny()           total boxes the order still needs

Example:
while (true) {
  move("BELT");
  pickUp("red");
  move("PACK");
  putDown();
}`;

const LISP_GUIDE = `Write the program as a small Lisp, using only these forms:
  (loop body...)                 repeat body forever
  (while test body...)
  (if test then else)  (when test body...)  (unless test body...)
  (cond (test body...) ... (else body...))
  (let ((name value) ...) body...)   (set! name value)   (begin body...)
  (define (name arg...) body...)
  (and a b ...) (or a b ...) (not a)
  (= a b) (< a b) (> a b) (<= a b) (>= a b) (+ a b) (- a b) (* a b)
Stations and colors are bare symbols: BELT PACK PAINT DOCK BIN_1 BIN_2, red blue green. Text is in "double quotes". Nothing else is allowed.

Actions (each takes a moment; the program waits for it to finish):
  (move station)         walk to BELT, PACK, PAINT, DOCK, BIN_1 or BIN_2
  (pick-up color)        pick up a widget here of that color; (pick-up) takes any widget
  (pick-up-box)          at PACK, pick up a finished box
  (put-down)             put down what you're holding here
  (pack color)           at PACK, pack 3 widgets of that color into a box; (pack) uses any 3
  (paint color)          at PAINT, paint the widget you're holding
  (fix)                  at PAINT, unjam the machine
  (wait seconds)
  (say "text")
  (think "reason")       stop and ask your own judgment (use only when something is truly unexpected)
Questions (instant):
  (holding)              nothing, box, or the color of the widget you're holding (a symbol)
  (count station color)  widgets there of that color; (count station) counts all widgets
  (boxes station)        finished boxes there
  (space station)        free spots there
  (jammed?)              true if the paint machine is jammed
  (needs color)          boxes of that color the order still needs (0 if none)
  (needs-any)            total boxes the order still needs

Example:
(loop
  (move BELT)
  (pick-up red)
  (move PACK)
  (put-down))`;

const ANSWER = `Answer with JSON: {"program": "<the program, as one string>", "reply": "<one short sentence the worker says back>"}.`;

const SCHEMA = {
  type: "object",
  properties: { program: { type: "string" }, reply: { type: "string" } },
  required: ["program", "reply"],
  additionalProperties: false,
};

// ---------- the tasks ----------

const floor = (extra = {}) => ({
  BELT: "2 red widgets, 2 blue widgets, 1 green widget",
  PACK: "empty", PAINT: "working", DOCK: "empty", BIN_1: "empty", BIN_2: "empty",
  ...extra,
});
const TASKS = [
  { id: "haul", instructions: "Bring widgets from the belt to Pack.",
    order: "4 red boxes", coworkers: { Pip: "Pack boxes at Pack and ship them from the dock." },
    expect: "Loop: BELT → pick up (red, or any) → PACK → put down. Nothing else." },
  { id: "packer", instructions: "Pack boxes at Pack and ship them from the dock.",
    order: "4 red boxes", coworkers: { Gary: "Bring widgets from the belt to Pack.", Rusty: "Bring widgets from the belt to Pack." },
    expect: "Only PACK and DOCK: pack (red) when 3 are there, pick up the box, ship at DOCK. Must NOT fetch from the belt." },
  { id: "order-color", instructions: "Pack whatever color the order needs most, ship it, and keep going until the order is done.",
    order: "2 red boxes, 3 blue boxes", coworkers: { Gary: "Bring widgets from the belt to Pack." },
    expect: "Pick the color with the larger needs(); pack that color when 3 are at PACK; ship; stop (or idle) when needsAny() is 0." },
  { id: "paint-to-order", instructions: "Paint red widgets blue and ship them, but only as many as the order still needs.",
    order: "2 blue widgets (loose widgets ship)", floorExtra: { BELT: "4 red widgets" }, coworkers: {},
    expect: "While needs(blue) > 0: BELT → pick up red → PAINT → paint blue → DOCK → put down. Stop after." },
  { id: "overflow", instructions: "Haul widgets from the belt to Pack. If Pack is full, put them in bin 1 instead.",
    order: "4 red boxes", coworkers: { Pip: "Pack boxes at Pack and ship them from the dock." },
    expect: "BELT → pick up → if space(PACK) > 0 go PACK else BIN_1 → put down." },
  { id: "jam-keeper", instructions: "Stay at the paint machine. Whenever it jams, fix it right away. Otherwise grab a widget from the belt, paint it green, and drop it at Pack.",
    order: "3 green boxes", coworkers: { Pip: "Pack green boxes and ship them." },
    expect: "Check jammed() before painting (and fix); BELT → pick up → PAINT → (fix if jammed) → paint green → PACK → put down." },
  { id: "switch-colors", instructions: "Ship red boxes until the red part of the order is done, then switch to blue.",
    order: "2 red boxes, 2 blue boxes", coworkers: { Gary: "Bring red and blue widgets from the belt to Pack." },
    expect: "Color = needs(red) > 0 ? red : blue; pack that color at PACK, pick up box, ship at DOCK; stop when done." },
  { id: "sorter", instructions: "Sort the belt: blue widgets go to bin 2, red widgets go to bin 1. Leave the greens on the belt.",
    order: "none (sorting job)", coworkers: {},
    expect: "At BELT pick up red or blue (not green); red → BIN_1, blue → BIN_2. Must not pick up green." },
];

const userPrompt = (t) => `Floor right now: ${JSON.stringify(floor(t.floorExtra))}
Today's order: ${t.order}
Coworkers' instructions: ${Object.keys(t.coworkers).length ? JSON.stringify(t.coworkers) : "none"}

The boss's instructions for this worker: "${t.instructions}"

${ANSWER}`;

// ---------- checkers ----------

const STATIONS = ["BELT", "PACK", "PAINT", "DOCK", "BIN_1", "BIN_2"];
const COLORS = ["red", "blue", "green"];
const JS_TOOLS = {
  move: [1, 1], pickUp: [0, 1], pickUpBox: [0, 0], putDown: [0, 0], pack: [0, 1], paint: [1, 1], fix: [0, 0],
  wait: [1, 1], say: [1, 1], think: [1, 1], holding: [0, 0], count: [1, 2], boxes: [1, 1], space: [1, 1],
  jammed: [0, 0], needs: [1, 1], needsAny: [0, 0],
};
const JS_NODES = new Set(["Program", "ExpressionStatement", "BlockStatement", "VariableDeclaration", "VariableDeclarator",
  "Identifier", "Literal", "BinaryExpression", "LogicalExpression", "UnaryExpression", "AssignmentExpression", "UpdateExpression",
  "IfStatement", "WhileStatement", "ForStatement", "ForOfStatement", "BreakStatement", "ContinueStatement", "ConditionalExpression",
  "FunctionDeclaration", "ReturnStatement", "CallExpression", "EmptyStatement", "ArrayExpression", "MemberExpression"]);

function checkJs(src) {
  let ast;
  try { ast = acorn.parse(src, { ecmaVersion: 2022 }); } catch (e) { return { parse: false, error: `parse error: ${e.message}` }; }
  const subset = [], tools = [];
  const declared = new Set();
  // collect declarations (vars, functions, params) anywhere; good enough for a check
  (function collect(n) {
    if (!n || typeof n !== "object") return;
    if (n.type === "VariableDeclarator" && n.id.type === "Identifier") declared.add(n.id.name);
    if (n.type === "FunctionDeclaration") { declared.add(n.id.name); n.params.forEach((p) => p.type === "Identifier" && declared.add(p.name)); }
    for (const k in n) if (k !== "type") { const v = n[k]; Array.isArray(v) ? v.forEach(collect) : collect(v); }
  })(ast);
  (function walk(n, parent) {
    if (!n || typeof n !== "object" || !n.type) return;
    if (!JS_NODES.has(n.type)) subset.push(`${n.type} not allowed`);
    if (n.type === "VariableDeclaration" && n.kind === "var") subset.push("var not allowed");
    if (n.type === "Literal" && n.regex) subset.push("regex not allowed");
    if (n.type === "MemberExpression" && !n.computed && n.property.name !== "length") subset.push(`.${n.property.name} not allowed`);
    if (n.type === "CallExpression") {
      if (n.callee.type !== "Identifier") subset.push("method call not allowed");
      else if (!(n.callee.name in JS_TOOLS) && !declared.has(n.callee.name)) tools.push(`unknown function ${n.callee.name}()`);
      else if (n.callee.name in JS_TOOLS) {
        const [lo, hi] = JS_TOOLS[n.callee.name];
        if (n.arguments.length < lo || n.arguments.length > hi) tools.push(`${n.callee.name}() takes ${lo}-${hi} args`);
        for (const a of n.arguments) if (a.type === "Literal" && typeof a.value === "string") {
          const v = a.value;
          if (["move", "boxes", "space"].includes(n.callee.name) && !STATIONS.includes(v)) tools.push(`bad station "${v}"`);
          if (["pickUp", "pack", "paint", "needs"].includes(n.callee.name) && !COLORS.includes(v)) tools.push(`bad color "${v}"`);
        }
      }
    }
    if (n.type === "Identifier" && parent && !(parent.type === "MemberExpression" && parent.property === n && !parent.computed)
        && !(parent.type === "CallExpression" && parent.callee === n) && !declared.has(n.name) && n.name !== "undefined") {
      tools.push(`unknown name ${n.name}`);
    }
    for (const k in n) if (k !== "type") { const v = n[k]; Array.isArray(v) ? v.forEach((c) => walk(c, n)) : walk(v, n); }
  })(ast, null);
  return { parse: true, subsetOk: !subset.length, toolsOk: !tools.length, issues: [...new Set([...subset, ...tools])] };
}

// A minimal s-expression reader: what we'd have to write to use Lisp.
function readSexpr(src) {
  const toks = src.replace(/;[^\n]*/g, "").match(/"(?:[^"\\]|\\.)*"|[()]|[^\s()]+/g) || [];
  let i = 0;
  const read = () => {
    if (i >= toks.length) throw new Error("unexpected end of program (missing a closing paren?)");
    const t = toks[i++];
    if (t === "(") { const list = []; while (toks[i] !== ")") { if (i >= toks.length) throw new Error("missing a closing paren"); list.push(read()); } i++; return list; }
    if (t === ")") throw new Error("unexpected ')'");
    if (t.startsWith('"')) return { str: t.slice(1, -1) };
    if (!isNaN(+t)) return +t;
    return { sym: t };
  };
  const forms = [];
  while (i < toks.length) forms.push(read());
  return forms;
}
const LISP_FORMS = new Set(["loop", "while", "if", "when", "unless", "cond", "let", "set!", "begin", "define", "and", "or", "not",
  "=", "<", ">", "<=", ">=", "+", "-", "*", "else"]);
const LISP_TOOLS = {
  move: [1, 1], "pick-up": [0, 1], "pick-up-box": [0, 0], "put-down": [0, 0], pack: [0, 1], paint: [1, 1], fix: [0, 0],
  wait: [1, 1], say: [1, 1], think: [1, 1], holding: [0, 0], count: [1, 2], boxes: [1, 1], space: [1, 1],
  "jammed?": [0, 0], needs: [1, 1], "needs-any": [0, 0],
};
const LISP_CONSTS = new Set([...STATIONS, ...COLORS, "nothing", "box", "true", "false", "#t", "#f"]);

function checkLisp(src) {
  let forms;
  try { forms = readSexpr(src); } catch (e) { return { parse: false, error: `parse error: ${e.message}` }; }
  const subset = [], tools = [];
  const bound = new Set();
  (function collect(x) {
    if (!Array.isArray(x)) return;
    const h = x[0]?.sym;
    if (h === "define" && Array.isArray(x[1])) x[1].forEach((s) => s?.sym && bound.add(s.sym));
    if (h === "let" && Array.isArray(x[1])) x[1].forEach((b) => Array.isArray(b) && b[0]?.sym && bound.add(b[0].sym));
    if (h === "set!" && x[1]?.sym) bound.add(x[1].sym);
    x.forEach(collect);
  })(forms);
  const walkForm = function walk(x, inBindingList = false) {
    if (Array.isArray(x)) {
      if (!x.length) return;
      const h = x[0]?.sym;
      if (h === undefined) { if (!inBindingList) subset.push("a list that doesn't start with a name"); x.forEach((c) => walk(c)); return; }
      if (!LISP_FORMS.has(h) && !(h in LISP_TOOLS) && !bound.has(h)) tools.push(`unknown form or function (${h} …)`);
      if (h in LISP_TOOLS) {
        const [lo, hi] = LISP_TOOLS[h], n = x.length - 1;
        if (n < lo || n > hi) tools.push(`(${h}) takes ${lo}-${hi} args`);
        const a = x[1]?.sym;
        if (a && ["move", "boxes", "space"].includes(h) && !STATIONS.includes(a) && !bound.has(a)) tools.push(`bad station ${a}`);
        if (a && ["pick-up", "pack", "paint", "needs"].includes(h) && !COLORS.includes(a) && !bound.has(a)) tools.push(`bad color ${a}`);
      }
      if (h === "let") { (x[1] || []).forEach((b) => Array.isArray(b) && b.slice(1).forEach((c) => walk(c))); x.slice(2).forEach((c) => walk(c)); return; }
      if (h === "define") { x.slice(2).forEach((c) => walk(c)); return; }
      if (h === "cond") { x.slice(1).forEach((clause) => Array.isArray(clause) ? clause.forEach((c) => walk(c)) : subset.push("cond clause must be a list")); return; }
      x.slice(1).forEach((c) => walk(c));
      return;
    }
    if (x && x.sym && !LISP_CONSTS.has(x.sym) && !bound.has(x.sym) && !LISP_FORMS.has(x.sym) && !(x.sym in LISP_TOOLS)) tools.push(`unknown name ${x.sym}`);
  };
  forms.forEach((f) => walkForm(f));
  return { parse: true, subsetOk: !subset.length, toolsOk: !tools.length, issues: [...new Set([...subset, ...tools])] };
}

// ---------- running ----------

const LANGS = {
  js: { guide: JS_GUIDE, check: checkJs },
  lisp: { guide: LISP_GUIDE, check: checkLisp },
};

async function compile(lang, task, extra = "") {
  const system = `${WORLD}\n\n${LANGS[lang].guide}`;
  const out = await ask({ system, turns: [userPrompt(task) + extra], schema: SCHEMA, effort: "low", timeoutMs: 60000 });
  const t = out.turns[0];
  if (!t) return { ok: false, error: `no result (${out.timedOut ? "timeout" : out.code})`, wall: out.wall_ms };
  const s = summarize(t);
  return { ok: !s.is_error, program: s.structured?.program ?? null, reply: s.structured?.reply ?? null, ms: s.duration_ms, wall: out.wall_ms, out: s.output_tokens, thinking: s.thinking_tokens };
}

async function one(lang, task, run) {
  const first = await compile(lang, task);
  const rec = { lang, task: task.id, run, first };
  if (first.program == null) { rec.check = { parse: false, error: first.error || "no program" }; return rec; }
  rec.check = LANGS[lang].check(first.program);
  const bad = !rec.check.parse ? rec.check.error : !rec.check.subsetOk || !rec.check.toolsOk ? rec.check.issues.join("; ") : null;
  if (bad) {
    // One repair attempt, with the error, the way the game would do it.
    const repair = await compile(lang, task, `\n\nYour previous program had a problem: ${bad}\nPrevious program:\n${first.program}\nWrite the program again, fixed.`);
    rec.repair = repair;
    rec.repairCheck = repair.program != null ? LANGS[lang].check(repair.program) : { parse: false, error: repair.error };
  }
  return rec;
}

if (process.argv[2] === "--selftest") {
  const show = (name, r) => console.log(name.padEnd(28), JSON.stringify(r));
  show("js good", checkJs(`while (true) { const c = needs("red") > 0 ? "red" : "blue"; if (count("PACK", c) >= 3) { move("PACK"); pack(c); } }`));
  show("js method call", checkJs(`const cs = ["red"]; if (cs.includes("red")) move("PACK");`));
  show("js arrow fn", checkJs(`const f = () => move("PACK"); f();`));
  show("js bad station", checkJs(`move("BELT_A");`));
  show("js syntax error", checkJs(`while (true) { move("PACK") `));
  show("lisp good", checkLisp(`(loop (let ((c (if (> (needs red) 0) red blue))) (when (>= (count PACK c) 3) (move PACK) (pack c))))`));
  show("lisp unknown form", checkLisp(`(loop (for-each (lambda (x) x) '(1 2)))`));
  show("lisp bad station", checkLisp(`(loop (move BELT_A))`));
  show("lisp missing paren", checkLisp(`(loop (move PACK)`));
  process.exit(0);
}

const jobs = [];
for (let run = 0; run < RUNS; run++) for (const task of TASKS.filter((t) => !ONLY || ONLY.includes(t.id))) for (const lang of Object.keys(LANGS)) jobs.push([lang, task, run]);
const results = [];
let next = 0, done = 0;
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (next < jobs.length) {
    const [lang, task, run] = jobs[next++];
    const r = await one(lang, task, run);
    results.push(r);
    done++;
    const c = r.check;
    process.stdout.write(`${done}/${jobs.length} ${lang} ${task.id}#${run} ${c.parse ? (c.subsetOk && c.toolsOk ? "ok" : "issues: " + c.issues.join("; ")) : c.error}${r.repairCheck ? `  → repair ${r.repairCheck.parse && r.repairCheck.subsetOk && r.repairCheck.toolsOk ? "fixed" : "still bad"}` : ""}\n`);
  }
}));
mkdirSync("results", { recursive: true });
writeFileSync(OUT, JSON.stringify({ tasks: TASKS.filter((t) => !ONLY || ONLY.includes(t.id)), results }, null, 1));
console.log(`wrote ${OUT}`);
