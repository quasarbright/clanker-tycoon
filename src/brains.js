// The hires, and the three kinds of model call a worker makes:
//   compile  the boss gave new instructions → a program (in the worker language, lang.js)
//   message  the boss said something to them, or yelled to everyone → a reply, and maybe one-time
//            steps or new instructions
//   think    something unexpected happened (or their program asked) → the same choices, plus
//            "I need the boss"
// Every answer is checked: the program has to parse, stay in the subset, use only tools the
// worker has, and not wander to stations the instructions never mention. A model mistake gets one
// repair attempt with the problem spelled out; a skill the worker lacks is the instructions' fault
// and comes back as a compile error for the player. A program that passes the checks also gets a
// dry run (dryrun.js): one that never gets any work done goes back for the same one repair, and
// then the worker tells you about it. Thinking never widens a worker's instructions: only the boss
// can change them, and a thought's one-off stays inside them (or the worker comes to your desk).
// Nothing here is specific to one model.
import { llm } from "./llm.js";
import { COLORS, viewFor, toolNamesFor, programStationName, capOf, kindOf } from "./sim.js";
import { parseProgram, checkProgram } from "./lang.js";
import { dryRun } from "./dryrun.js";
import { wageOf } from "./wages.js";

// ---------- who you can hire ----------

export const SKILLS = {
  packing: { label: "Packing", tip: "Can pack 3 widgets into a box at Pack." },
  painting: { label: "Painting", tip: "Can run the paint machine." },
  assembly: { label: "Assembly", tip: "Can put a red, a blue and a green box together into a crate at the Assembler." },
  repair: { label: "Repair", tip: "Can service a worn machine." },
};
export const ATTRIBUTES = {
  fast: { label: "Fast", tip: "Walks 1.5× faster." },
  nimble: { label: "Nimble", tip: "Works machines faster: packing, painting and servicing take 40% less time." },
  steady: { label: "Steady", tip: "Machines wear half as fast in their hands." },
};
// Wage: a flat rate for a shift, from their skills and attributes (wages.js).
const robot = (r) => ({ ...r, wage: wageOf(r.skills, r.attributes) });
export const CANDIDATES = [
  robot({
    id: "blip", name: "Blip", color: "#d97bd1", skills: [], attributes: [],
    blurb: "Brand new and nervous. Apologizes a lot.",
    persona: "You are Blip, a brand-new, nervous factory robot. You apologize a lot, but you're keen to do a good job.",
  }),
  robot({
    id: "pip", name: "Pip", color: "#8fd16a", skills: ["packing"], attributes: [],
    blurb: "Small, cheerful, will wait all day.",
    persona: "You are Pip, a small, relentlessly cheerful factory robot who loves waiting for things.",
  }),
  robot({
    id: "dot", name: "Dot", color: "#9aa7bb", skills: [], attributes: [],
    blurb: "Quiet. Does what it's told, start to finish.",
    persona: "You are Dot, a quiet, matter-of-fact factory robot of few words.",
  }),
  robot({
    id: "gary", name: "Gary-7", color: "#f08a3c", skills: ["packing"], attributes: ["fast"],
    blurb: "Eager and upbeat. Proud of every job.",
    persona: "You are Gary-7, an eager, upbeat factory robot, proud of everything you do.",
  }),
  robot({
    id: "rusty", name: "Rusty", color: "#c77a4a", skills: ["repair"], attributes: ["steady"],
    blurb: "Laid-back. Nothing rattles him.",
    persona: "You are Rusty, a laid-back old factory robot. Nothing rattles you and you talk slow and friendly.",
  }),
  robot({
    id: "vex", name: "Vex", color: "#7c8cf8", skills: ["painting"], attributes: ["fast"],
    blurb: "Ambitious. Talks like a startup founder.",
    persona: "You are Vex, an ambitious factory robot who talks like a startup founder and wants a promotion.",
  }),
  // Blank robots: no skills, no traits, cheap. Recruit one and train exactly what you want
  // (your business, decision #59).
  robot({
    id: "nib", name: "Nib", color: "#e8c547", skills: [], attributes: [],
    blurb: "Fresh off the line. Curious about everything.",
    persona: "You are Nib, a brand-new factory robot, fresh off the line and curious about everything.",
  }),
  robot({
    id: "cog", name: "Cog", color: "#5fb3d9", skills: [], attributes: [],
    blurb: "Plain and dependable. Likes a routine.",
    persona: "You are Cog, a plain, dependable factory robot who likes a good routine.",
  }),
  robot({
    id: "tock", name: "Tock", color: "#a3c4a8", skills: [], attributes: [],
    blurb: "Counts everything out loud.",
    persona: "You are Tock, a factory robot who counts everything out loud and likes exact numbers.",
  }),
  robot({
    id: "doris", name: "Doris", color: "#4fb7a8", skills: ["packing", "painting", "repair"], attributes: [],
    blurb: "Veteran. Dry, grumbly, counting down to her pension.",
    persona: "You are Doris, a veteran factory robot who has seen it all. You're dry, you grumble, and your pension is never far from your mind.",
  }),
  robot({
    id: "bolt", name: "Bolt", color: "#e5534b", skills: ["packing", "painting", "repair"], attributes: ["fast", "nimble"],
    blurb: "The best on the floor, and knows it.",
    persona: "You are Bolt, the best robot on any factory floor, and you know it. Confident, a little smug.",
  }),
];

// ---------- the prompt ----------

const STATION_TEXT = {
  SUPPLY: `"SUPPLY": the supply of raw widgets. It never runs out: there's always one to pick up.`,
  PAINT: `"PAINT": the paint machine. It repaints the widget you're holding. It wears with use and stops at 100% wear until someone with the Repair skill services it.`,
  PACK: `"PACK": packing station. 3 widgets sitting here can be packed into a box. Holds {cap} things.`,
  DOCK: `"DOCK": things put down here ship`,
  BIN_1: `"BIN_1": storage, holds {cap}`,
  BIN_2: `"BIN_2": storage, holds {cap}`,
  PAINT_2: `"PAINT_2": a second paint machine, the same as PAINT. It wears with use and stops at 100% wear until someone with the Repair skill services it.`,
  ASSEMBLE: `"ASSEMBLE": the assembler. A finished red box, blue box and green box sitting here can be assembled into one crate, which ships from DOCK. Holds {cap} things (boxes only). It wears with use and stops at 100% until someone with the Repair skill services it.`,
  ASSEMBLE_2: `"ASSEMBLE_2": a second assembler, the same as ASSEMBLE. Holds {cap} things (boxes only).`,
};
const SHIP_TEXT = {
  widgets: "Widgets put down at DOCK ship. Each counts toward today's order if it's a color the order still needs.",
  boxes: "Only boxes (and crates) ship from DOCK. A box counts toward today's order only if all 3 widgets are one color the order still needs; anything else ships for nothing. A crate counts toward an order for crates.",
};
const TOOL_TEXT = {
  move: `move(station)        walk to a station`,
  pickUp: `pickUp(color)        pick up a widget here of that color; pickUp() takes any widget`,
  pickUpBox: `pickUpBox(color)     pick up a finished box here (PACK, a bin, an assembler); pickUpBox("blue") takes a blue one; pickUpBox() any`,
  pickUpCrate: `pickUpCrate()        at an assembler, pick up a finished crate`,
  assemble: `assemble()           at an assembler, put a red, a blue and a green box sitting there together into one crate`,
  putDown: `putDown()            put down what you're holding here`,
  pack: `pack(color)          at PACK, pack 3 widgets of that color into a box (a box is always one color; they can be anywhere in PACK); pack() packs whichever color there are 3 of`,
  paint: `paint(color)         at PAINT, paint the widget you're holding ("red", "blue" or "green")`,
  service: `service()            at a paint machine or an assembler, service it (sets wear back to 0). Only does anything if you have the Repair skill; harmless otherwise`,
  wait: `wait(seconds)`,
  say: `say(text)            say something out loud`,
  think: `think(reason)        stop and use your own judgment; only when something is truly unexpected`,
  holding: `holding()            "nothing", "box", or the color of the widget you're holding`,
  count: `count(station, color) widgets there of that color; count(station) counts all widgets`,
  boxes: `boxes(station, color) finished boxes there of that color; boxes(station) counts all finished boxes`,
  crates: `crates(station)      finished crates there`,
  space: `space(station)       free spots there`,
  needs: `needs(color)         how many more of that color today's order still needs, counted in what ships (on a boxes order, boxes: needs("green") is 1 when one more green box is wanted, so pack while it's above 0; an order for crates needs a box of every color, so needs("red") counts the crates still wanted)`,
  needsAny: `needsAny()           how many more things today's order still needs in total, counted the same way`,
  wear: `wear(station)        a machine's wear, 0 to 100 (wear("PAINT"))`,
  where: `where(name)          the station a coworker (or "boss") is at, or "walking"`,
  holds: `holds(name)          what a coworker (or "boss") is holding, like holding()`,
};

const RULES = `How to write a good program:
1. Do your part only. Your instructions say what you do; your coworkers' instructions say what they do. Never do their part, even if it looks like nobody is doing it yet. Only go to the stations your own instructions need.
2. Put each choice in a variable, then do the work once. For example, \`const color = needs("red") > 0 ? "red" : "blue";\` followed by one sequence that uses \`color\`. Don't copy the same sequence once per case.
3. Read numbers from the questions (needs, count, space, boxes, wear) instead of writing them in.
4. Don't add steps the instructions don't ask for.
5. Before answering, walk through one pass of your loop and check: does every step serve your instructions, and does the thing your instructions are about actually get done? (If you ship boxes and no coworker packs them, you have to pack them.)
6. If you pack, pack before you put things down at PACK: when PACK has 3 of a color, pack them first, so there's room. Never stand at a full station holding something, waiting for room that only you can make. (space("PACK") says how much room there is.)`;

const LANGUAGE = `Programs are written in this small subset of JavaScript and nothing else:
- let and const, numbers, strings, true/false/null
- if / else, while, for (;;), for...of over an array literal, break, continue
- function declarations and return
- operators: + - * / % === !== < > <= >= && || !, and the ternary ?:
- array literals and indexing (arr[i], arr.length)
Not allowed: arrow functions, classes, objects, methods (no .includes, .push, …), template strings, async/await, try/catch, regular expressions, var, and any global other than the tools below.
Actions take a moment; the program waits for each one and gets back true if it worked, false if it couldn't be done. A worker waits a few seconds for something to show up (a box, room to put something down) before an action gives up. Questions answer instantly.
The work goes on all shift, so a program that's meant to keep working should loop forever (while (true) { … }); one that's meant to stop when the order is done can loop while (needsAny() > 0).`;

/**
 * Who the boss is. Robots call you by your name (the one on your business license), never "boss"
 * (Mike, decision 74). Before you've signed one (the tutorial levels), they just don't use a title.
 */
export const ownerName = (L) => L?.owner?.trim() || "";
export function ownerLine(L) {
  const n = ownerName(L);
  return n ? `The boss is ${n}${L.business ? `, who owns ${L.business}` : ""}. When you speak to them or about them, call them ${n}. Never call them "boss" out loud.`
    : `When you speak to the boss, don't call them "boss" or any other title; just talk to them.`;
}
/** How a robot gets your attention, in their own canned lines: your name, or nothing. */
export const hey = (L) => (ownerName(L) ? `${ownerName(L)}, ` : "");

function systemPrompt(h, L) {
  const tools = toolNamesFor(h, L);
  // Primary work this floor has that this worker can't do. Listing it (and asking the model to use
  // it anyway when the instructions want it) is what turns "Blip, pack these" into a compile error
  // the player sees, instead of a program that quietly skips the packing.
  const missing = [["pack", "packing", "PACK"], ["paint", "painting", "PAINT"], ["assemble", "assembly", "ASSEMBLE"]]
    .filter(([n, k, st]) => L.stations.some((x) => kindOf(x) === st) && !h.skills.includes(k)).map(([n, k]) => [n, k]);
  const skills = h.skills.length ? h.skills.map((k) => SKILLS[k].label).join(", ") : "none (you can carry things, but not pack, paint, assemble or repair)";
  const colors = (L.colors ?? COLORS).join(", ").replace(/, ([^,]*)$/, " or $1");
  return `${h.persona} You work in a small factory in a management game. You follow the boss's instructions faithfully.
${ownerLine(L)}
When you speak, it's one or two short sentences of plain speech in your own voice: no stage directions, asterisks or markdown, and never mention programs, code or functions out loud.

You drive your robot body with a program, written from your instructions.

The factory:
${L.stations.map((k) => `- ${STATION_TEXT[k].replace("{cap}", capOf(L, k))}`).join("\n")}
There are no other stations. The supply gives out ${colors} widgets. ${SHIP_TEXT[L.ship]}
You hold one thing at a time.

Your skills: ${skills}.

${LANGUAGE}

Actions:
${tools.actions.map((n) => "  " + TOOL_TEXT[n]).join("\n")}
${missing.length ? `Work you don't know how to do (you lack the skill):
${missing.map(([n, k]) => `  ${TOOL_TEXT[n]} (needs ${SKILLS[k].label})`).join("\n")}
If your instructions ask for this work, don't quietly leave it out: say so in "problem" (see below).
` : ""}Questions:
${tools.queries.map((n) => "  " + TOOL_TEXT[n]).join("\n")}

${RULES}

Example program:
while (true) {
  move("SUPPLY");
  pickUp("red");
  move("PACK");
  putDown();
}`;
}

function context(s, w) {
  return `What you can see: ${JSON.stringify(viewFor(s, w))}
Your instructions: ${w.orders ? `"${w.orders}"` : "none yet"}
Recent conversation:
${(w.memory ?? []).join("\n") || "(none)"}
Recent problems: ${w.failLog.length ? w.failLog.slice(-4).map((f) => f.why).join("; ") : "none"}`;
}

const COMPILE_SCHEMA = {
  type: "object",
  properties: { reply: { type: "string" }, problem: { type: "string" }, instructions: { type: "string" }, program: { type: "string" } },
  required: ["reply", "problem", "instructions", "program"],
  additionalProperties: false,
};
const THINK_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string" },
    kind: { type: "string", enum: ["talk", "once", "boss"] },
    summary: { type: "string" },
    now: { type: "string" },
  },
  required: ["reply", "kind", "summary", "now"],
  additionalProperties: false,
};
// The repair after a failed dry run can say the boss really did ask for work that gets nothing
// done ("walk in circles"): clear instructions get done, even silly ones.
const RETRY_SCHEMA = {
  ...COMPILE_SCHEMA,
  properties: { ...COMPILE_SCHEMA.properties, onPurpose: { type: "boolean" } },
  required: [...COMPILE_SCHEMA.required, "onPurpose"],
};
const ON_PURPOSE = `If the boss's instructions themselves really ask for something that gets no work done (like "walk in circles"), that's fine: keep the program and set "onPurpose" to true. Otherwise fix the program and set "onPurpose" to false.`;
const EXPLAIN_SCHEMA = { type: "object", properties: { problem: { type: "string" } }, required: ["problem"], additionalProperties: false };
const RESPOND_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string" },
    kind: { type: "string", enum: ["talk", "once", "change", "boss"] },
    summary: { type: "string" },
    now: { type: "string" },
    instructions: { type: "string" },
    program: { type: "string" },
  },
  required: ["reply", "kind", "summary", "now", "instructions", "program"],
  additionalProperties: false,
};

const CHOICES = `Reply as JSON with these fields (leave the ones you don't use as ""):
- "reply": what you say back out loud.
- "kind": one of
    "talk": nothing needs doing; keep doing what you were doing. Your reply must not promise any new work ("I'll help", "I'll keep things tidy"): nothing changes, so say plainly that you're sticking to your instructions.
    "once": something to do now, one time. Put a short program for just that in "now" (it runs once, then you go back to your regular program), and a few words describing it in "summary".
    "change": your ongoing work changes for good. Put your complete new instructions in "instructions": everything you're now meant to do, the old instructions merged with the change, as one short sentence in the boss's own words (no step-by-step), and the full new program for them in "program".
    "boss": you need the boss: information you don't have, instructions that conflict, or something only the boss can do. Say what you need in "reply".
Prefer "talk" or "once". Use "change" only when your regular work really has to change.`;

// When the worker is thinking on their own (nobody said anything), they can't rewrite their own
// instructions: the player's words are what they do. A one-off has to stay inside those
// instructions; anything beyond them is a question for the boss.
const THINK_CHOICES = `Reply as JSON with these fields (leave the ones you don't use as ""):
- "reply": what you say out loud.
- "kind": one of
    "talk": nothing needs doing, or you're waiting on something that's someone else's part; keep doing what you were doing. Don't promise any new work in "reply".
    "once": something to do now, one time, that's part of your own instructions. Put a short program for just that in "now" (it runs once, then you go back to your regular program), and a few words describing it in "summary".
    "boss": you need the boss: information you don't have, instructions that conflict, or work that's outside your instructions (even if it looks like nobody is doing it). Say what you need in "reply".
Only the boss can change your instructions, so never take on work they don't mention, not even once: if it seems needed, choose "boss" and say so. Prefer "talk" or "once".`;

// ---------- checking an answer ----------

// Which stations a piece of instructions mentions, by the words people use for them.
const STATION_WORDS = {
  SUPPLY: /\bbelt\b|\bsuppl/i, PACK: /\bpack/i, DOCK: /\bdock|\bship/i, PAINT: /\bpaint|\bservic|\bwear|\brepair/i,
  PAINT_2: /\bpaint|\bservic|\bwear|\brepair/i, ASSEMBLE: /\bassembl|\bcrate|\bservic|\bwear|\brepair/i, ASSEMBLE_2: /\bassembl|\bcrate|\bservic|\bwear|\brepair/i,
  BIN_1: /\bbins?\b(?!\s*2)/i, BIN_2: /\bbins?\b(?!\s*1)/i,
};
/** Stations a program walks to that the instructions never mention (none if they mention none). */
function strayStations(text, ast) {
  const named = Object.keys(STATION_WORDS).filter((k) => STATION_WORDS[k].test(text));
  if (!named.length) return [];
  // Widgets come from the supply, so "paint reds blue and ship them" implies a supply trip.
  if (/\b(paint|bring|carry|take|grab|fetch|get|move|haul|sort)\b/i.test(text)) named.push("SUPPLY");
  const visited = new Set();
  (function walk(n) {
    if (!n || typeof n !== "object") return;
    if (n.type === "CallExpression" && n.callee?.name === "move" && n.arguments[0]?.type === "Literal") visited.add(String(n.arguments[0].value));
    for (const k in n) if (k !== "type") { const v = n[k]; Array.isArray(v) ? v.forEach(walk) : walk(v); }
  })(ast);
  return [...visited].filter((k) => !named.includes(k));
}

/**
 * Check program text for this worker. Returns { ast } or { problem, kind } where kind is
 * "model" (worth a repair attempt) or "skill" (the instructions asked for something they can't do).
 */
function checkCode(src, h, L, instructionsText) {
  let ast;
  try { ast = parseProgram(src); } catch (e) { return { problem: e.message, kind: "model" }; }
  const problems = checkProgram(ast, toolNamesFor(h, L));
  const skill = problems.find((p) => p.kind === "skill");
  const other = problems.filter((p) => p.kind !== "skill");
  if (other.length) return { problem: other.map((p) => p.message).join("; "), kind: "model" };
  if (skill) {
    // It's only the instructions' fault if they actually ask for that work; otherwise the model
    // reached for a tool on its own, and that's worth a repair.
    const asked = { pack: /\bpack|\bbox/i, paint: /\bpaint/i }[skill.message.match(/^(\w+)\(/)?.[1]];
    const action = skill.message.match(/^(\w+)\(/)?.[1];
    const need = { pack: "packing", paint: "painting" }[action];
    if (instructionsText && asked?.test(instructionsText)) {
      return { problem: need ? `they ask for ${action}ing, and ${h.name} doesn't have the ${SKILLS[need].label} skill` : skill.message, kind: "skill" };
    }
    return { problem: `${skill.message}; leave that out`, kind: "model" };
  }
  if (instructionsText) {
    const extra = strayStations(instructionsText, ast);
    if (extra.length) return { problem: `your program goes to ${extra.join(" and ")}, but your instructions don't mention ${extra.length > 1 ? "them" : "it"}; that part is someone else's work`, kind: "model" };
  }
  return { ast };
}

/** checkCode, then a dry run on the floor in `s` (with the crew hired there). Same answer shape. */
function tryProgram(s, src, h, L, instructionsText) {
  const res = checkCode(src, h, L, instructionsText);
  if (!res.ast) return res;
  const run = dryRun(L, h, s.workers.map((x) => x.hire), res.ast, instructionsText);
  return run.ok ? res : { problem: run.why, kind: "model", dry: true, dryAst: res.ast };
}

const clean = (t) => String(t ?? "").replace(/\*[^*]*\*/g, "").replace(/\s+/g, " ").trim();
function remember(w, line) {
  (w.memory ??= []).push(line);
  if (w.memory.length > 8) w.memory.shift();
}

// ---------- the three calls ----------

/**
 * The boss gave new instructions. Resolves to { reply, ast }, or { reply, problem } when the worker
 * can't do them: a skill they lack, something unclear, or no working program after a repair. The
 * problem is always in the worker's own words.
 */
export async function compile(s, w, text) {
  const h = w.hire, L = s.level;
  const system = systemPrompt(h, L);
  const base = `${context(s, w)}

The boss says: "${text}"

You don't have working instructions yet, so this (together with anything earlier in the conversation that still applies) is what the boss wants you to do. Write your program for it. Reply as JSON with:
- "reply": what you say back out loud. If you'll do it, say in a few words what you'll do.
- "instructions": what you've been told to do, as one short sentence in the boss's own words (fold in any earlier answers, but don't spell out steps; for "pack red boxes and ship them", write just that). "" if there's a problem.
- "problem": "" if you can do it. Otherwise say out loud, in your own voice and plain words (never name actions like pack() or mention code), exactly what's wrong: which part asks for work you lack the skill for, or which part is unclear and the question that would clear it up. Then leave "program" as "". Only use this for real problems; clear instructions just get done.
- "program": the program.`;
  let out = await llm({ system, prompt: base, schema: COMPILE_SCHEMA });
  const said = () => clean(out?.reply) || "On it.";
  if (clean(out?.problem) && !String(out?.program ?? "").trim()) return done(w, text, clean(out.problem), { problem: clean(out.problem) });
  let res = tryProgram(s, out?.program, h, L, text);
  if (res.kind === "model") {
    const dry = res.dry;
    out = await llm({ system, schema: dry ? RETRY_SCHEMA : COMPILE_SCHEMA, prompt: `${base}\n\nYour last program had a problem: ${res.problem}\nYour last program:\n${out?.program ?? ""}\nWrite it again, fixed.${dry ? `\n${ON_PURPOSE}` : ""}` });
    if (clean(out?.problem) && !String(out?.program ?? "").trim()) return done(w, text, clean(out.problem), { problem: clean(out.problem) });
    res = tryProgram(s, out?.program, h, L, text);
    if (res.dry && out?.onPurpose === true) res = { ast: res.dryAst };
  }
  if (res.ast) return done(w, text, said(), { ast: res.ast, instructions: clean(out?.instructions) || text });
  // It didn't work out. The worker says why, in their own words, instead of a canned error.
  const problem = await explain(s, w, system, text, res);
  return done(w, text, problem, { problem });
}

/** The worker says, in their own words, why they couldn't turn `text` into work (`res.problem`). */
async function explain(s, w, system, text, res) {
  let problem = "";
  const what = res.dry
    ? `You worked out a routine, then pictured doing it with everything you'd need on hand, and it never got anything done. ${res.problem}`
    : `You couldn't turn them into work. What went wrong: ${res.problem}.`;
  try {
    const why = await llm({ system, schema: EXPLAIN_SCHEMA, prompt: `${context(s, w)}

The boss gave you these instructions: "${text}"
${what}
Tell the boss out loud, in your own voice, in one or two short sentences, what about these instructions you can't do or don't understand, and what would help. Use plain words: don't mention programs, code, practice runs, or actions like pack(). Reply as JSON: {"problem": what you say}.` });
    problem = clean(why?.problem);
  } catch { /* fall back below */ }
  if (!problem) problem = res.kind === "skill" ? `I can't do that: ${res.problem}.`
    : res.dry ? "I tried to picture doing that and I'd just stand around. Could you tell me the steps another way?"
    : "I'm not sure how to do that. Could you break it into steps for me?";
  return problem;
}
function done(w, text, reply, r) {
  remember(w, `Boss: ${text}`);
  remember(w, `You: ${reply}`);
  return { reply, ...r };
}

/**
 * Something got the worker thinking: the boss said something (`trigger.kind` "message" or
 * "yell"), something unexpected happened ("unexpected", with `detail`), or their program called
 * think() ("think"). Resolves to { reply, kind, summary?, nowAst?, instructions?, ast? }.
 * If a program in the answer won't check out after one repair, it falls back to just talking.
 */
export async function respond(s, w, trigger) {
  const h = w.hire, L = s.level;
  const system = systemPrompt(h, L);
  const fromBoss = trigger.kind === "message" || trigger.kind === "yell";
  // What the boss has actually asked of this worker, in the boss's own words: the instructions as
  // given (w.scope; the card's wording is the worker's restatement), plus what was just said.
  // Programs are checked against this, never against the worker's own rewording, so a thought
  // can't talk its way into new work.
  const asked = [w.scope ?? w.orders ?? "", fromBoss ? trigger.text : ""].join(" ").trim();
  const what = trigger.kind === "message" ? `The boss says to you: "${trigger.text}"`
    : trigger.kind === "yell" ? `The boss yells to the whole floor: "${trigger.text}"`
    : trigger.kind === "think" ? `Your program stopped to think: "${trigger.text}"`
    : `Something unexpected happened: ${trigger.text}`;
  const base = `${context(s, w)}

${what}

${fromBoss ? CHOICES : THINK_CHOICES}`;
  const schema = fromBoss ? RESPOND_SCHEMA : THINK_SCHEMA;
  let out = await llm({ system, prompt: base, schema });
  const checkAnswer = (o) => {
    if (o?.kind === "once") {
      const res = checkCode(o.now, h, L, asked || null);
      return res.problem && !fromBoss ? { ...res, problem: `${res.problem}. If you think it needs doing, choose "boss" and tell the boss instead` } : res;
    }
    if (o?.kind === "change") {
      if (!fromBoss) return { problem: `only the boss can change your instructions. Choose "talk", a "once" inside your instructions, or "boss"`, kind: "model" };
      return tryProgram(s, o.program, h, L, asked);
    }
    return { ast: null };
  };
  let res = checkAnswer(out);
  if (res.kind === "model") {
    const field = out.kind === "once" ? "now" : "program";
    out = await llm({ system, schema, prompt: `${base}\n\nYour last answer had a problem: ${res.problem}\nIts "${field}" program was:\n${out[field] ?? ""}\nAnswer again, fixed.` });
    res = checkAnswer(out);
  }
  let reply = clean(out?.reply) || "…";
  remember(w, trigger.kind === "message" ? `Boss (to you): ${trigger.text}` : trigger.kind === "yell" ? `Boss (yelling to everyone): ${trigger.text}` : `(You thought about: ${trigger.text})`);
  if (res.problem) {
    if (res.dry) reply = await explain(s, w, system, trigger.text, res);
    else if (!fromBoss) reply = `${hey(s.level)}I think something needs doing that isn't in my instructions. What do you want me to do?`.replace(/^./, (c) => c.toUpperCase());
    remember(w, `You: ${reply}`);
    // A change the worker can't make (a skill they lack, a routine that would get nothing done) or
    // a thought that wants to step outside its instructions: both are for the boss.
    return { reply, kind: res.kind === "skill" && out.kind === "change" || res.dry || !fromBoss ? "boss" : "talk" };
  }
  remember(w, `You: ${reply}`);
  if (out.kind === "once") return { reply, kind: "once", summary: clean(out.summary) || "a one-off", nowAst: res.ast };
  if (out.kind === "change" && fromBoss) {
    remember(w, `(Your instructions are now: ${clean(out.instructions)})`);
    return { reply, kind: "change", instructions: clean(out.instructions), ast: res.ast, scope: asked };
  }
  return { reply, kind: out.kind === "boss" ? "boss" : "talk" };
}

/** Station names as programs say them, for the coach and docs. */
export const stationNames = (L) => L.stations.map(programStationName);
