// The hires, their prompts, and the two kinds of model call: responding to the boss, and coming
// to the boss's desk with a problem. Every worker follows clear instructions; what sets them apart
// is their skills (mechanical, in sim.js) and their personality (flavor, in the prompt).
// The rules, actions and stations a worker is told about come from the level, so a level-1
// worker has never heard of the paint machine.
import { llm } from "./llm.js";
import { COLORS, viewFor, actionLabel } from "./sim.js";

// Everyone you can hire. Skills are mechanical (see sim.js); personality is flavor only, and every
// one of them follows clear instructions. Wage = $3/min + $2 per skill.
export const SKILLS = {
  fast: { label: "Fast", tip: "Walks 1.5× faster." },
  careful: { label: "Careful", tip: "Never drops anything. Everyone else fumbles now and then." },
  patient: { label: "Patient", tip: "Waits at a station for what they need (a box, room in a bin, 3 widgets to pack) instead of giving up right away." },
};
const robot = (r) => ({ ...r, wage: 3 + 2 * r.skills.length });
export const CANDIDATES = [
  robot({
    id: "gary", name: "Gary-7", color: "#f08a3c", skills: ["fast"],
    blurb: "Eager and upbeat. Proud of every job.",
    persona: "You are Gary-7, an eager, upbeat factory robot, proud of everything you do.",
    quirk: "When an order is vague, you guess boldly instead of asking.",
  }),
  robot({
    id: "doris", name: "Doris", color: "#4fb7a8", skills: ["careful", "patient"],
    blurb: "Veteran. Dry, grumbly, counting down to her pension.",
    persona: "You are Doris, a veteran factory robot who has seen it all. You're dry, you grumble, and your pension is never far from your mind.",
    quirk: "You'll say what you think of the orders.",
  }),
  robot({
    id: "blip", name: "Blip", color: "#d97bd1", skills: [],
    blurb: "Brand new and nervous. Apologizes a lot.",
    persona: "You are Blip, a brand-new, nervous factory robot. You apologize a lot, but you're keen to do a good job.",
    quirk: "",
  }),
  robot({
    id: "rusty", name: "Rusty", color: "#c77a4a", skills: ["careful"],
    blurb: "Laid-back. Takes it easy, never drops a thing.",
    persona: "You are Rusty, a laid-back old factory robot. Nothing rattles you and you talk slow and friendly.",
    quirk: "",
  }),
  robot({
    id: "pip", name: "Pip", color: "#8fd16a", skills: ["patient"],
    blurb: "Small, cheerful, will wait all day.",
    persona: "You are Pip, a small, relentlessly cheerful factory robot who loves waiting for things.",
    quirk: "",
  }),
  robot({
    id: "vex", name: "Vex", color: "#7c8cf8", skills: ["fast", "patient"],
    blurb: "Ambitious. Talks like a startup founder.",
    persona: "You are Vex, an ambitious factory robot who talks like a startup founder and wants a promotion.",
    quirk: "",
  }),
  robot({
    id: "bolt", name: "Bolt", color: "#e5534b", skills: ["fast", "careful", "patient"],
    blurb: "The best on the floor, and knows it.",
    persona: "You are Bolt, the best robot on any factory floor, and you know it. Confident, a little smug.",
    quirk: "",
  }),
];
export const HIRES = CANDIDATES;

const STATION_TEXT = {
  BELT_A: "BELT_A (new widgets arrive here)",
  PAINT: "PAINT (paint machine, it sometimes jams)",
  PACK: "PACK (packing station)",
  DOCK: "DOCK (things ship from here)",
  BIN_1: "BIN_1 (storage, holds 5)",
  BIN_2: "BIN_2 (storage, holds 5)",
};
// Today's order is in the worker's view ("order"); these explain what counts toward it.
const SHIP_TEXT = {
  widgets: () => "Widgets put down at DOCK ship. Each one counts toward today's order if it's a color the order still needs.",
  boxes: () => "A box is 3 widgets packed together at PACK. Only boxes ship from DOCK. A box counts toward today's order only if all 3 widgets are one color the order still needs; anything else ships for nothing.",
};
const ACTION_TEXT = {
  moveTo: "- moveTo {station}: walk to a station.",
  pickUp: "- pickUp {color?}: pick up a widget at your station (of that color, if given). At BELT_A you wait a few seconds for one to arrive. At PACK with no color you take a finished box. You hold one thing at a time.",
  putDown: "- putDown: put down what you're holding at your station.",
  paint: "- paint {color}: at PAINT while holding a widget, repaint it.",
  pack: "- pack {color?}: at PACK, pack 3 widgets that are sitting there into a box (3 of that color, if given).",
  fix: "- fix: at PAINT, unjam the paint machine.",
  wait: "- wait {seconds}",
  say: "- say {text}: say something out loud.",
};

/** The actions that make sense in this level. (No askBoss: workers come to the desk only when
 * they're stuck, never as a step in their routine.) */
function actionsFor(L) {
  return Object.keys(ACTION_TEXT).filter((a) =>
    (a !== "paint" && a !== "fix") || L.stations.includes("PAINT")).filter((a) => a !== "pack" || L.stations.includes("PACK"));
}

const rulebook = (L) => `The factory:
- Stations: ${L.stations.map((k) => STATION_TEXT[k]).join(", ")}. There are no other stations.
- Widgets come off the belt ${(L.colors ?? COLORS).join(", ").replace(/, ([^,]*)$/, " or $1")}.${L.stations.includes("PAINT") ? " The paint machine can make any of red, blue or green." : ""} ${SHIP_TEXT[L.ship](L)}

Actions you can put in a script:
${actionsFor(L).map((a) => ACTION_TEXT[a]).join("\n")}
Your script repeats from the top, forever, until the boss gives you new orders. So write ONE round of the work: don't copy the same steps out several times to do something more than once, the repeating takes care of that.
Your script does exactly what your instructions say and nothing else. Don't add steps the instructions don't ask for: no extra trips, no say or wait steps unless the instructions ask for them. For example, told "pack boxes at Pack and ship them", your script only goes to PACK and DOCK; bringing widgets is someone else's work, even if nobody seems to be doing it yet.`;

function schemas(L) {
  const item = {
    type: "object",
    properties: {
      action: { type: "string", enum: actionsFor(L) },
      station: { type: "string", enum: L.stations },
      // Any color once there's paint; otherwise just the colors on the belt.
      color: { type: "string", enum: L.stations.includes("PAINT") ? COLORS : L.colors ?? COLORS },
      seconds: { type: "number" },
      text: { type: "string" },
      question: { type: "string" },
    },
    required: ["action"],
    additionalProperties: false,
  };
  return {
    respond: {
      type: "object",
      properties: { reply: { type: "string" }, newScript: { type: "boolean" }, actions: { type: "array", items: item } },
      required: ["reply", "newScript", "actions"],
      additionalProperties: false,
    },
    report: {
      type: "object",
      properties: { reply: { type: "string" } },
      required: ["reply"],
      additionalProperties: false,
    },
  };
}

const system = (h, L) => `${h.persona} You work in a tiny factory in a comedy management game. You follow the boss's instructions faithfully: do what they say, and only that. Don't add other work the instructions don't ask for (like fetching widgets when you were told to pack); your coworkers have their own instructions and are handling the rest.${h.quirk ? " " + h.quirk : ""}
Stay in character. Anything you say out loud is one or two short sentences of plain speech (under 30 words): no stage directions, no asterisks, no markdown. Talk about the work itself, the widgets, boxes, belt and machines. Never mention scripts, loops, JSON or action names like pickUp and putDown out loud.

${rulebook(L)}`;


// Spoken text. Sometimes the model's whole JSON answer ends up inside "reply" ({"reply": "..."}
// as a string); pull the real line out of it rather than showing the JSON.
function clean(t) {
  let s = String(t ?? "").trim();
  if (s.startsWith("{")) {
    try { const j = JSON.parse(s); if (typeof j.reply === "string") s = j.reply; } catch {
      const m = s.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)/);
      if (m) s = m[1].replace(/\\"/g, '"').replace(/\\n/g, " ");
    }
  }
  return s.replace(/\*[^*]*\*/g, "").replace(/\s+/g, " ").trim();
}

function sanitize(actions, L) {
  const allowed = actionsFor(L);
  return (actions || [])
    .filter((a) => a && allowed.includes(a.action))
    .filter((a) => a.action !== "moveTo" || L.stations.includes(a.station))
    .slice(0, 24)
    .map((a) => (a.action === "say" ? { ...a, text: clean(a.text) } : a));
}

// Which stations a piece of instructions mentions, by the words people use for them.
const STATION_WORDS = {
  BELT_A: /\bbelt\b/i,
  PACK: /\bpack/i,
  DOCK: /\bdock|\bship/i,
  PAINT: /\bpaint/i,
  BIN_1: /\bbins?\b(?!\s*2)/i,
  BIN_2: /\bbins?\b(?!\s*1)/i,
};
/** Stations a script visits that the instructions never mention (none if they mention none). */
function strayStations(text, actions) {
  const named = Object.keys(STATION_WORDS).filter((k) => STATION_WORDS[k].test(text));
  if (!named.length) return [];
  // Widgets come from the belt, so "paint reds blue and ship them" implies a belt trip even though
  // it never says "belt". Packing and shipping alone don't.
  if (/\b(paint|bring|carry|take|grab|fetch|get|move|haul)\b/i.test(text)) named.push("BELT_A");
  const visited = [...new Set(actions.filter((a) => a.action === "moveTo").map((a) => a.station))];
  return visited.filter((k) => !named.includes(k));
}

const KIND_LINE = {
  orders: "The boss gives you new instructions",
  chat: "The boss says to you",
  yell: "The boss yells to the whole floor",
};

function remember(w, line) {
  (w.memory ??= []).push(line);
  if (w.memory.length > 8) w.memory.shift();
}

/** The boss gave orders, said something, or yelled. Resolves to { heard, reply, script|null }. */
export async function respond(s, w, kind, text) {
  const h = w.hire, L = s.level;
  const heard = text;
  const script = w.script.length ? w.script.map(actionLabel).join(", ") : "nothing yet";
  const prompt = `What you can see: ${JSON.stringify(viewFor(s, w))}
Your instructions: ${w.orders ? `"${w.orders}"` : "none yet"}
Your current script: ${script}
Recent conversation:
${(w.memory ?? []).join("\n") || "(none)"}

${KIND_LINE[kind]}: "${heard}"

Reply as JSON. "reply" is what you say back out loud. ${kind === "orders"
    ? 'These are your instructions now: set "newScript" to true and put your full new action script (one round, at most 20 actions) in "actions".'
    : 'Only if the boss is clearly giving you new or changed instructions for your work, set "newScript" to true and put your full new action script (one round, at most 20 actions) in "actions". Praise, questions, small talk, encouragement and general yelling are not new instructions: then set "newScript" to false and "actions" to [], and keep doing what you were doing.'}`;
  let out = await llm({ system: system(h, L), prompt, schema: schemas(L).respond });
  let actions = sanitize(out?.actions, L);
  // Workers do what they're told and nothing more. If the instructions name stations and the
  // routine goes somewhere they don't mention, send it back once with that correction.
  const extra = kind === "orders" || out?.newScript ? strayStations(heard, actions) : [];
  if (extra.length) {
    const retry = await llm({
      system: system(h, L), schema: schemas(L).respond,
      prompt: `${prompt}\n\nYou answered with a script that goes to ${extra.join(" and ")}, but your instructions don't mention ${extra.length > 1 ? "them" : "it"}. That part is someone else's work. Write the script again using only what your instructions ask for.`,
    });
    const fixed = sanitize(retry?.actions, L);
    if (fixed.length && !strayStations(heard, fixed).length) { out = retry; actions = fixed; }
  }
  const reply = clean(out?.reply) || "…";
  const changed = (kind === "orders" || out?.newScript) && actions.length > 0;
  if (kind === "orders") w.orders = heard;
  remember(w, `Boss (${kind === "yell" ? "yelling to everyone" : kind === "orders" ? "new instructions" : "to you"}): ${heard}`);
  remember(w, `You: ${reply}`);
  return { heard, reply, script: changed ? actions : null };
}

/** The worker kept failing and came to the desk. Resolves to what they say. */
export async function report(s, w, failures) {
  // In plain words, so the complaint talks about the work rather than about action names.
  const VERB = { moveTo: "go somewhere", pickUp: "pick something up", putDown: "put something down", paint: "paint a widget", pack: "pack a box", fix: "fix the paint machine" };
  const what = failures.map((f) => `you tried to ${VERB[f.action] ?? "do something"}, but ${f.why}`).join("; ");
  const prompt = `What you can see: ${JSON.stringify(viewFor(s, w))}
Your instructions: ${w.orders ? `"${w.orders}"` : "none"}
Recent conversation:
${(w.memory ?? []).join("\n") || "(none)"}

Things keep going wrong. Lately ${what}. You've stopped and walked up to the boss's desk. In one or two short sentences, tell the boss what's going on, in your own words and in character. Reply as JSON: {"reply": "..."}`;
  const out = await llm({ system: system(w.hire, s.level), prompt, schema: schemas(s.level).report });
  const reply = clean(out?.reply) || "Uh, boss? We have a problem.";
  remember(w, `You (at the boss's desk): ${reply}`);
  return reply;
}
