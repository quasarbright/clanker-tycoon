// Compiling instructions and thinking (src/brains.js) with a fake model: what the game does with
// each kind of answer, without calling a real one.
import "./setup.mjs";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

const { useFakeLlm } = await import("../src/llm.js");
const { compile, respond, CANDIDATES } = await import("../src/brains.js");
const { newGame, addWorker } = await import("../src/sim.js");
const { LEVELS } = await import("../src/levels.js");

const level = (name) => LEVELS.find((l) => l.name === name);
const cand = (id) => CANDIDATES.find((c) => c.id === id);
const HAUL = `while (true) { move("SUPPLY"); pickUp("red"); move("PACK"); putDown(); }`;
const PACK = `while (needsAny() > 0) { move("PACK"); if (count("PACK", "red") >= 3) pack("red"); if (boxes("PACK") > 0) { pickUpBox(); move("DOCK"); putDown(); } else wait(1); }`;

/** A fake model that answers each call in turn from `answers`, and records the prompts. */
function fake(...answers) {
  const calls = [];
  useFakeLlm(async (req) => { calls.push(req); return answers[Math.min(calls.length - 1, answers.length - 1)]; });
  return calls;
}
function floor(name, ...ids) {
  const s = newGame(level(name), [], 1);
  const ws = ids.map((id) => addWorker(s, cand(id)));
  return { s, ws };
}
beforeEach(() => useFakeLlm(null));

test("clear instructions compile into a routine", async () => {
  const calls = fake({ reply: "On it!", instructions: "carry reds to pack", problem: "", program: HAUL });
  const { s, ws: [blip] } = floor("Crew", "blip");
  const r = await compile(s, blip, "Carry red widgets from the supply to Pack.");
  assert.ok(r.ast, JSON.stringify(r));
  assert.equal(r.reply, "On it!");
  assert.equal(r.instructions, "carry reds to pack");
  assert.equal(calls.length, 1);
  assert.match(calls[0].prompt, /Carry red widgets from the supply to Pack/);
});

test("a worker without the skill says so in their own words", async () => {
  fake({ reply: "", instructions: "", problem: "I can't pack, I don't know how.", program: "" });
  const { s, ws: [blip] } = floor("Crew", "blip");
  const r = await compile(s, blip, "Pack red boxes.");
  assert.equal(r.ast, undefined);
  assert.equal(r.problem, "I can't pack, I don't know how.");
});

test("a program that won't parse gets one repair, then works", async () => {
  const calls = fake(
    { reply: "Sure", instructions: "haul", problem: "", program: "while (true { oops" },
    { reply: "Sure", instructions: "haul", problem: "", program: HAUL },
  );
  const { s, ws: [blip] } = floor("Crew", "blip");
  const r = await compile(s, blip, "Carry red widgets from the supply to Pack.");
  assert.ok(r.ast);
  assert.equal(calls.length, 2);
  assert.match(calls[1].prompt, /Your last program had a problem/);
});

test("a program that goes somewhere the instructions don't mention is sent back", async () => {
  const calls = fake(
    { reply: "Sure", instructions: "pack and ship", problem: "", program: `while (true) { move("SUPPLY"); pickUp("red"); move("PACK"); putDown(); pack("red"); }` },
    { reply: "Sure", instructions: "pack and ship", problem: "", program: PACK },
  );
  const { s, ws: [, pip] } = floor("Crew", "blip", "pip");
  const r = await compile(s, pip, "Pack red boxes at Pack and ship them from the dock.");
  assert.ok(r.ast);
  assert.match(calls[1].prompt, /SUPPLY/);
});

test("a packer whose routine jams a full Pack fails the dry run and is repaired (decision 63)", async () => {
  const jam = `while (needsAny() > 0) { move("SUPPLY"); pickUp("red"); move("PACK"); putDown(); if (count("PACK", "red") >= 3) { pack("red"); pickUpBox(); move("DOCK"); putDown(); } }`;
  const good = `while (needsAny() > 0) { move("PACK"); if (count("PACK", "red") >= 3) { pack("red"); pickUpBox(); move("DOCK"); putDown(); } else { move("SUPPLY"); pickUp("red"); move("PACK"); putDown(); } }`;
  const calls = fake(
    { reply: "On it", instructions: "fetch, pack, ship", problem: "", program: jam },
    { reply: "On it", instructions: "fetch, pack, ship", problem: "", program: good, onPurpose: false },
  );
  const { s, ws: [gary] } = floor("Crew", "gary");
  const r = await compile(s, gary, "Fetch red widgets from the supply, put them at Pack, pack red boxes and ship them.");
  assert.ok(r.ast, JSON.stringify(r));
  assert.equal(calls.length, 2);
  assert.match(calls[1].prompt, /PACK full/);
});

test("if the repair fails too, the worker explains in their own words", async () => {
  fake(
    { reply: "Ok", instructions: "x", problem: "", program: "nope(" },
    { reply: "Ok", instructions: "x", problem: "", program: "still nope(" },
    { problem: "I'm not sure what you want me to carry." },
  );
  const { s, ws: [blip] } = floor("Crew", "blip");
  const r = await compile(s, blip, "Do the thing.");
  assert.equal(r.ast, undefined);
  assert.equal(r.problem, "I'm not sure what you want me to carry.");
});

test("a thought can't change a worker's instructions; it goes to the boss instead", async () => {
  fake({ reply: "I'll fetch too", kind: "change", instructions: "fetch and pack", program: HAUL },
    { reply: "I'll fetch too", kind: "change", instructions: "fetch and pack", program: HAUL });
  const { s, ws: [, pip] } = floor("Crew", "blip", "pip");
  pip.scope = "Pack red boxes and ship them.";
  const r = await respond(s, pip, { kind: "unexpected", text: "nothing has moved for 15 seconds" });
  assert.equal(r.kind, "boss");
});

test("the boss can change instructions by message", async () => {
  fake({ reply: "Got it", kind: "change", instructions: "carry reds", program: HAUL, summary: "" });
  const { s, ws: [blip] } = floor("Crew", "blip");
  blip.scope = "Stand by.";
  const r = await respond(s, blip, { kind: "message", text: "Carry red widgets from the supply to Pack." });
  assert.equal(r.kind, "change");
  assert.ok(r.ast);
  assert.equal(r.instructions, "carry reds");
});

test("talk is just talk", async () => {
  fake({ reply: "Thanks, boss!", kind: "talk" });
  const { s, ws: [blip] } = floor("Crew", "blip");
  const r = await respond(s, blip, { kind: "message", text: "Great work today." });
  assert.equal(r.kind, "talk");
  assert.equal(r.reply, "Thanks, boss!");
});

test("the model is told a 'talk' reply mustn't promise new work, for messages and for thoughts (Pam's playtest)", async () => {
  const { s, ws: [blip] } = floor("Crew", "blip");
  for (const trigger of [{ kind: "message", text: "Do whatever Pip needs." }, { kind: "unexpected", text: "nothing has moved" }]) {
    const calls = fake({ reply: "I'm sticking to my instructions.", kind: "talk" });
    await respond(s, blip, trigger);
    const prompt = JSON.stringify(calls[0]);
    assert.match(prompt, /promise any new work/, trigger.kind);
  }
});

test("robots call you by your name, never boss: the prompt says so, and their canned line uses it (decision 74)", async () => {
  const { ownerLine } = await import("../src/brains.js");
  assert.match(ownerLine({ owner: "Mike", business: "Clank & Sons" }), /The boss is Mike, who owns Clank & Sons\. .*call them Mike\. Never call them "boss" out loud/);
  assert.match(ownerLine({}), /don't call them "boss"/);
  // A thought that steps outside the instructions goes to your desk, addressed to you by name.
  const { s, ws: [pip] } = floor("Crew", "pip");
  s.level = { ...s.level, owner: "Mike" };
  fake({ reply: "x", kind: "change", summary: "", now: "", instructions: "fetch widgets", program: HAUL });
  const r = await respond(s, pip, { kind: "unexpected", text: "nothing has moved" });
  assert.equal(r.kind, "boss");
  assert.match(r.reply, /^Mike, /);
  assert.doesNotMatch(r.reply, /\bboss\b/i);
});

test("no Smart anywhere for now (decision 93): not trainable, no robot has it, no look, no bigger thinking budget", async () => {
  const { ATTRIBUTES } = await import("../src/brains.js");
  const B = await import("../src/business.js");
  const { headLooks } = await import("../src/looks.js");
  assert.ok(!("smart" in ATTRIBUTES));
  assert.ok(!B.TRAINABLE_ATTRS.includes("smart"));
  for (const c of CANDIDATES) assert.ok(!c.attributes.includes("smart"), c.id);
  assert.equal(headLooks({ skills: [], attributes: ["smart"] }), "");
  const fs = await import("node:fs");
  assert.doesNotMatch(fs.readFileSync(new URL("../src/main.js", import.meta.url), "utf8"), /hasAttr\(w, "smart"\)|smartMax/);
});
