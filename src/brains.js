// The hires, their prompts, and the two kinds of model call: responding to the boss, and coming
// to the boss's desk with a problem. Dumbness is set per hire with knobs (persona, quirk,
// fumbling, mishearing, how much of the floor they see), not by using a weaker model.
import { llm } from "./llm.js";
import { ACTIONS, STATIONS, COLORS, viewFor, actionLabel } from "./sim.js";

export const HIRES = [
  {
    id: "gary", name: "Gary-7", color: "#f08a3c", wage: 5, fumble: 0.04, mishear: 0, sight: "full",
    blurb: "Eager. Proud of every job, right or wrong.",
    persona: "You are Gary-7, an eager, upbeat factory robot. You're proud of every job you do, including the ones you did wrong.",
    quirk: "You take the boss's words exactly as written, even when that's obviously not what they meant. When an order is vague, you guess boldly instead of asking.",
  },
  {
    id: "doris", name: "Doris", color: "#4fb7a8", wage: 8, fumble: 0.02, mishear: 0, sight: "full",
    blurb: "Veteran. Competent, grumbly, counting down to her pension.",
    persona: "You are Doris, a veteran factory robot who has seen it all. You're competent and dry, you grumble, and your pension is never far from your mind.",
    quirk: "You do the job properly and sensibly, though you'll say what you think of the orders.",
  },
  {
    id: "blip", name: "Blip", color: "#d97bd1", wage: 3, fumble: 0.15, mishear: 0.35, sight: "near",
    blurb: "Brand new. Cheap, nervous, sorry about everything. Mishears things.",
    persona: "You are Blip, a brand-new, nervous factory robot. You apologize constantly and second-guess yourself.",
    quirk: "You're new and easily flustered, and you can only see what's at your own station.",
  },
];

const RULEBOOK = `The factory:
- Stations: BELT_A (new widgets arrive here), PAINT (paint machine, it sometimes jams), PACK (packing station), DOCK (boxes ship from here), BIN_1 and BIN_2 (storage, 5 each).
- Widgets are red, blue or green. A box is 3 widgets packed together at PACK.
- A box pays well only if all 3 widgets are the same color and an open order wants that color. Any other box ships as scrap for $5.

Actions you can put in a script:
- moveTo {station}: walk to a station.
- pickUp {color?}: pick up a widget at your station (of that color, if given). At BELT_A you wait a few seconds for one to arrive. At PACK with no color you take a finished box. You hold one thing at a time.
- putDown: put down what you're holding at your station. Putting a box down at DOCK ships it.
- paint {color}: at PAINT while holding a widget, repaint it.
- pack: at PACK, pack 3 widgets that are sitting there into a box.
- fix: at PAINT, unjam the paint machine.
- wait {seconds}
- say {text}: say something out loud.
- askBoss {question}: walk to the boss's desk and ask; you wait there for an answer.
Your script repeats from the top, forever, until the boss gives you new orders. So write ONE round of the job: don't copy the same steps out several times to do something more than once, the repeating takes care of that.`;

const ACTION_ITEM = {
  type: "object",
  properties: {
    action: { type: "string", enum: ACTIONS },
    station: { type: "string", enum: Object.keys(STATIONS) },
    color: { type: "string", enum: COLORS },
    seconds: { type: "number" },
    text: { type: "string" },
    question: { type: "string" },
  },
  required: ["action"],
  additionalProperties: false,
};
const RESPOND_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string" },
    newScript: { type: "boolean" },
    actions: { type: "array", items: ACTION_ITEM },
  },
  required: ["reply", "newScript", "actions"],
  additionalProperties: false,
};
const REPORT_SCHEMA = {
  type: "object",
  properties: { reply: { type: "string" } },
  required: ["reply"],
  additionalProperties: false,
};

const system = (h) => `${h.persona} You work in a tiny factory in a comedy management game. ${h.quirk}
Stay in character. Anything you say out loud is one or two short sentences of plain speech (under 30 words): no stage directions, no asterisks, no markdown. Talk about the work itself, the widgets, boxes, belt and machines. Never mention scripts, loops, JSON or action names like pickUp and putDown out loud.

${RULEBOOK}`;

// Blip mishears: swap one color, bin or station word before the model sees it.
const SWAPS = [["red", "blue"], ["blue", "green"], ["green", "red"], ["bin 1", "bin 2"], ["bin 2", "bin 1"], ["paint", "pack"], ["pack", "paint"], ["belt", "bin 1"], ["dock", "pack"]];
export function mishear(text, rng = Math.random) {
  const hits = SWAPS.filter(([from]) => new RegExp(`\\b${from}\\b`, "i").test(text));
  if (!hits.length) return text;
  const [from, to] = hits[Math.floor(rng() * hits.length)];
  return text.replace(new RegExp(`\\b${from}\\b`, "i"), to);
}

const clean = (t) => String(t ?? "").replace(/\*[^*]*\*/g, "").replace(/\s+/g, " ").trim();

function sanitize(actions) {
  return (actions || [])
    .filter((a) => a && ACTIONS.includes(a.action))
    .filter((a) => a.action !== "moveTo" || a.station in STATIONS)
    .slice(0, 24)
    .map((a) => (a.action === "say" ? { ...a, text: clean(a.text) } : a));
}

const KIND_LINE = {
  orders: "The boss gives you new standing orders",
  chat: "The boss says to you",
  yell: "The boss yells to the whole floor",
};

function remember(w, line) {
  (w.memory ??= []).push(line);
  if (w.memory.length > 8) w.memory.shift();
}

/** The boss gave orders, said something, or yelled. Resolves to { heard, reply, script|null }. */
export async function respond(s, w, kind, text) {
  const h = w.hire;
  const heard = h.mishear && Math.random() < h.mishear ? mishear(text) : text;
  const script = w.script.length ? w.script.map(actionLabel).join(", ") : "nothing yet";
  const prompt = `What you can see: ${JSON.stringify(viewFor(s, w))}
Your standing orders: ${w.orders ? `"${w.orders}"` : "none yet"}
Your current script: ${script}
Recent conversation:
${(w.memory ?? []).join("\n") || "(none)"}

${KIND_LINE[kind]}: "${heard}"

Reply as JSON. "reply" is what you say back out loud. ${kind === "orders"
    ? 'These are your new standing orders: set "newScript" to true and put your full new action script (one round, at most 20 actions) in "actions".'
    : 'If this changes what you should be doing, set "newScript" to true and put your full new action script (one round, at most 20 actions) in "actions". Otherwise set "newScript" to false and "actions" to [].'}`;
  const out = await llm({ system: system(h), prompt, schema: RESPOND_SCHEMA });
  const reply = clean(out?.reply) || "…";
  const actions = sanitize(out?.actions);
  const changed = (kind === "orders" || out?.newScript) && actions.length > 0;
  if (kind === "orders") w.orders = heard;
  remember(w, `Boss (${kind === "yell" ? "yelling to everyone" : kind === "orders" ? "new orders" : "to you"}): ${heard}`);
  remember(w, `You: ${reply}`);
  return { heard, reply, script: changed ? actions : null };
}

/** The worker kept failing and came to the desk. Resolves to what they say. */
export async function report(s, w, failures) {
  // In plain words, so the complaint talks about the work rather than about action names.
  const VERB = { moveTo: "go somewhere", pickUp: "pick something up", putDown: "put something down", paint: "paint a widget", pack: "pack a box", fix: "fix the paint machine" };
  const what = failures.map((f) => `you tried to ${VERB[f.action] ?? "do something"}, but ${f.why}`).join("; ");
  const prompt = `What you can see: ${JSON.stringify(viewFor(s, w))}
Your standing orders: ${w.orders ? `"${w.orders}"` : "none"}
Recent conversation:
${(w.memory ?? []).join("\n") || "(none)"}

Things keep going wrong. Lately ${what}. You've stopped and walked up to the boss's desk. In one or two short sentences, tell the boss what's going on, in your own words and in character. Reply as JSON: {"reply": "..."}`;
  const out = await llm({ system: system(w.hire), prompt, schema: REPORT_SCHEMA });
  const reply = clean(out?.reply) || "Uh, boss? We have a problem.";
  remember(w, `You (at the boss's desk): ${reply}`);
  return reply;
}
