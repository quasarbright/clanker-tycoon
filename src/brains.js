// The hires, and the three kinds of model call a worker makes:
//   compile  the boss gave new instructions → a program (in the worker language, lang.js)
//   message  the boss said something to them, or yelled to everyone → a reply, and maybe one-time
//            steps or new instructions
//   think    something unexpected happened (or their program asked) → the same choices, plus
//            "I need the boss"
// Every answer is checked: the program has to parse, stay in the subset, use only tools the
// worker has, and not wander to stations the instructions never mention. A model mistake gets one
// repair attempt with the problem spelled out; a skill the worker lacks is the instructions' fault
// and comes back as a compile error for the player. Nothing here is specific to one model.
import { llm } from "./llm.js";
import { COLORS, viewFor, toolNamesFor, programStationName } from "./sim.js";
import { parseProgram, checkProgram, ProgramError } from "./lang.js";

// ---------- who you can hire ----------

export const SKILLS = {
  packing: { label: "Packing", tip: "Can pack 3 widgets into a box at Pack." },
  painting: { label: "Painting", tip: "Can run the paint machine." },
  repair: { label: "Repair", tip: "Can service a worn machine." },
};
export const ATTRIBUTES = {
  fast: { label: "Fast", tip: "Walks 1.5× faster." },
  nimble: { label: "Nimble", tip: "Works machines faster: packing, painting and servicing take 40% less time." },
  steady: { label: "Steady", tip: "Machines wear half as fast in their hands." },
  smart: { label: "Smart", tip: "Can think things through more often (a bigger thinking budget that refills faster)." },
};
// Wage: $3/min, plus $2 for every skill and every attribute.
const robot = (r) => ({ ...r, wage: 3 + 2 * (r.skills.length + r.attributes.length) });
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
    id: "vex", name: "Vex", color: "#7c8cf8", skills: ["painting"], attributes: ["fast", "smart"],
    blurb: "Ambitious. Talks like a startup founder.",
    persona: "You are Vex, an ambitious factory robot who talks like a startup founder and wants a promotion.",
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
  BELT_A: `"BELT": new widgets arrive here`,
  PAINT: `"PAINT": the paint machine. It repaints the widget you're holding. It wears with use and stops at 100% wear until someone with the Repair skill services it.`,
  PACK: `"PACK": packing station. 3 widgets sitting here can be packed into a box. Holds 6 things.`,
  DOCK: `"DOCK": things put down here ship`,
  BIN_1: `"BIN_1": storage, holds 5`,
  BIN_2: `"BIN_2": storage, holds 5`,
};
const SHIP_TEXT = {
  widgets: "Widgets put down at DOCK ship. Each counts toward today's order if it's a color the order still needs.",
  boxes: "Only boxes ship from DOCK. A box counts toward today's order only if all 3 widgets are one color the order still needs; anything else ships for nothing.",
};
const TOOL_TEXT = {
  move: `move(station)        walk to a station`,
  pickUp: `pickUp(color)        pick up a widget here of that color; pickUp() takes any widget`,
  pickUpBox: `pickUpBox()          at PACK, pick up a finished box`,
  putDown: `putDown()            put down what you're holding here`,
  pack: `pack(color)          at PACK, pack 3 widgets of that color into a box; pack() uses any 3`,
  paint: `paint(color)         at PAINT, paint the widget you're holding ("red", "blue" or "green")`,
  service: `service()            at PAINT, service the machine (sets wear back to 0). Only does anything if you have the Repair skill; harmless otherwise`,
  wait: `wait(seconds)`,
  say: `say(text)            say something out loud`,
  think: `think(reason)        stop and use your own judgment; only when something is truly unexpected`,
  holding: `holding()            "nothing", "box", or the color of the widget you're holding`,
  count: `count(station, color) widgets there of that color; count(station) counts all widgets`,
  boxes: `boxes(station)       finished boxes there`,
  space: `space(station)       free spots there`,
  needs: `needs(color)         how many more of that color today's order still needs, counted in what ships (on a boxes order, boxes: needs("green") is 1 when one more green box is wanted, so pack while it's above 0)`,
  needsAny: `needsAny()           how many more things today's order still needs in total, counted the same way`,
  wear: `wear("PAINT")        the paint machine's wear, 0 to 100`,
  where: `where(name)          the station a coworker (or "boss") is at, or "walking"`,
  holds: `holds(name)          what a coworker (or "boss") is holding, like holding()`,
};

const RULES = `How to write a good program:
1. Do your part only. Your instructions say what you do; your coworkers' instructions say what they do. Never do their part, even if it looks like nobody is doing it yet. Only go to the stations your own instructions need.
2. Put each choice in a variable, then do the work once. For example, \`const color = needs("red") > 0 ? "red" : "blue";\` followed by one sequence that uses \`color\`. Don't copy the same sequence once per case.
3. Read numbers from the questions (needs, count, space, boxes, wear) instead of writing them in.
4. Don't add steps the instructions don't ask for.
5. Before answering, walk through one pass of your loop and check: does every step serve your instructions, and does the thing your instructions are about actually get done? (If you ship boxes and no coworker packs them, you have to pack them.)`;

const LANGUAGE = `Programs are written in this small subset of JavaScript and nothing else:
- let and const, numbers, strings, true/false/null
- if / else, while, for (;;), for...of over an array literal, break, continue
- function declarations and return
- operators: + - * / % === !== < > <= >= && || !, and the ternary ?:
- array literals and indexing (arr[i], arr.length)
Not allowed: arrow functions, classes, objects, methods (no .includes, .push, …), template strings, async/await, try/catch, regular expressions, var, and any global other than the tools below.
Actions take a moment; the program waits for each one and gets back true if it worked, false if it couldn't be done. A worker waits a few seconds for something to show up (a widget on the belt, a box, room to put something down) before an action gives up. Questions answer instantly.
The work goes on all shift, so a program that's meant to keep working should loop forever (while (true) { … }); one that's meant to stop when the order is done can loop while (needsAny() > 0).`;

function systemPrompt(h, L) {
  const tools = toolNamesFor(h, L);
  // Primary work this floor has that this worker can't do. Listing it (and asking the model to use
  // it anyway when the instructions want it) is what turns "Blip, pack these" into a compile error
  // the player sees, instead of a program that quietly skips the packing.
  const missing = [["pack", "packing", "PACK"], ["paint", "painting", "PAINT"]]
    .filter(([n, k, st]) => L.stations.includes(st) && !h.skills.includes(k)).map(([n, k]) => [n, k]);
  const skills = h.skills.length ? h.skills.map((k) => SKILLS[k].label).join(", ") : "none (you can carry things, but not pack, paint or repair)";
  const colors = (L.colors ?? COLORS).join(", ").replace(/, ([^,]*)$/, " or $1");
  return `${h.persona} You work in a small factory in a management game. You follow the boss's instructions faithfully.
When you speak, it's one or two short sentences of plain speech in your own voice: no stage directions, asterisks or markdown, and never mention programs, code or functions out loud.

You drive your robot body with a program, written from your instructions.

The factory:
${L.stations.map((k) => `- ${STATION_TEXT[k]}`).join("\n")}
There are no other stations. Widgets come off the belt ${colors}. ${SHIP_TEXT[L.ship]}
You hold one thing at a time.

Your skills: ${skills}.

${LANGUAGE}

Actions:
${tools.actions.map((n) => "  " + TOOL_TEXT[n]).join("\n")}
${missing.length ? `Work you don't know how to do (you lack the skill):
${missing.map(([n, k]) => `  ${TOOL_TEXT[n]} (needs ${SKILLS[k].label})`).join("\n")}
If your instructions ask for this work, still write it into your program, exactly where they ask for it. The boss will be told you can't do it. Never quietly leave it out.
` : ""}Questions:
${tools.queries.map((n) => "  " + TOOL_TEXT[n]).join("\n")}

${RULES}

Example program:
while (true) {
  move("BELT");
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
  properties: { reply: { type: "string" }, program: { type: "string" } },
  required: ["reply", "program"],
  additionalProperties: false,
};
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
    "talk": nothing needs doing; keep doing what you were doing.
    "once": something to do now, one time. Put a short program for just that in "now" (it runs once, then you go back to your regular program), and a few words describing it in "summary".
    "change": your ongoing work changes for good. Put your complete new instructions, in plain English, in "instructions", and the full new program for them in "program".
    "boss": you need the boss: information you don't have, instructions that conflict, or something only the boss can do. Say what you need in "reply".
Prefer "talk" or "once". Use "change" only when your regular work really has to change.`;

// ---------- checking an answer ----------

// Which stations a piece of instructions mentions, by the words people use for them.
const STATION_WORDS = {
  BELT: /\bbelt\b/i, PACK: /\bpack/i, DOCK: /\bdock|\bship/i, PAINT: /\bpaint|\bservic|\bwear|\brepair/i,
  BIN_1: /\bbins?\b(?!\s*2)/i, BIN_2: /\bbins?\b(?!\s*1)/i,
};
/** Stations a program walks to that the instructions never mention (none if they mention none). */
function strayStations(text, ast) {
  const named = Object.keys(STATION_WORDS).filter((k) => STATION_WORDS[k].test(text));
  if (!named.length) return [];
  // Widgets come from the belt, so "paint reds blue and ship them" implies a belt trip.
  if (/\b(paint|bring|carry|take|grab|fetch|get|move|haul|sort)\b/i.test(text)) named.push("BELT");
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

const clean = (t) => String(t ?? "").replace(/\*[^*]*\*/g, "").replace(/\s+/g, " ").trim();
function remember(w, line) {
  (w.memory ??= []).push(line);
  if (w.memory.length > 8) w.memory.shift();
}

// ---------- the three calls ----------

/**
 * The boss gave new instructions. Resolves to { reply, ast } or { reply, skillError } (the
 * instructions need a skill this worker doesn't have) or throws if no working program came back.
 */
export async function compile(s, w, text) {
  const h = w.hire, L = s.level;
  const system = systemPrompt(h, L);
  const base = `${context(s, w)}

The boss gives you new instructions: "${text}"

Write your program for these instructions. Reply as JSON: {"reply": what you say back out loud, "program": the program}.`;
  let out = await llm({ system, prompt: base, schema: COMPILE_SCHEMA });
  let res = checkCode(out?.program, h, L, text);
  if (res.kind === "model") {
    out = await llm({ system, schema: COMPILE_SCHEMA, prompt: `${base}\n\nYour last program had a problem: ${res.problem}\nYour last program:\n${out?.program ?? ""}\nWrite it again, fixed.` });
    res = checkCode(out?.program, h, L, text);
  }
  const reply = clean(out?.reply) || "On it.";
  remember(w, `Boss (new instructions): ${text}`);
  remember(w, `You: ${reply}`);
  if (res.kind === "skill") return { reply, skillError: res.problem };
  if (!res.ast) throw new ProgramError(`couldn't write a working program (${res.problem})`, "model");
  return { reply, ast: res.ast };
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
  const what = trigger.kind === "message" ? `The boss says to you: "${trigger.text}"`
    : trigger.kind === "yell" ? `The boss yells to the whole floor: "${trigger.text}"`
    : trigger.kind === "think" ? `Your program stopped to think: "${trigger.text}"`
    : `Something unexpected happened: ${trigger.text}`;
  const base = `${context(s, w)}

${what}

${CHOICES}`;
  let out = await llm({ system, prompt: base, schema: RESPOND_SCHEMA });
  const checkAnswer = (o) => {
    if (o?.kind === "once") return checkCode(o.now, h, L, null);
    if (o?.kind === "change") return checkCode(o.program, h, L, o.instructions || "");
    return { ast: null };
  };
  let res = checkAnswer(out);
  if (res.kind === "model") {
    const field = out.kind === "once" ? "now" : "program";
    out = await llm({ system, schema: RESPOND_SCHEMA, prompt: `${base}\n\nYour last answer's "${field}" program had a problem: ${res.problem}\nIt was:\n${out[field]}\nAnswer again, fixed.` });
    res = checkAnswer(out);
  }
  const reply = clean(out?.reply) || "…";
  remember(w, trigger.kind === "message" ? `Boss (to you): ${trigger.text}` : trigger.kind === "yell" ? `Boss (yelling to everyone): ${trigger.text}` : `(You thought about: ${trigger.text})`);
  remember(w, `You: ${reply}`);
  if (res.problem) return { reply, kind: res.kind === "skill" && out.kind === "change" ? "boss" : "talk" };
  if (out.kind === "once") return { reply, kind: "once", summary: clean(out.summary) || "a one-off", nowAst: res.ast };
  if (out.kind === "change") {
    remember(w, `(Your instructions are now: ${clean(out.instructions)})`);
    return { reply, kind: "change", instructions: clean(out.instructions), ast: res.ast };
  }
  return { reply, kind: out.kind === "boss" ? "boss" : "talk" };
}

/** Station names as programs say them, for the coach and docs. */
export const stationNames = (L) => L.stations.map(programStationName);
