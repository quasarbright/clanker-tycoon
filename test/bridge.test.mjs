// The file bridge (server/bridge.mjs, tools/llm-bridge.mjs): model calls as files, for cloud
// playtests. A request goes out, an answerer claims and answers it, the caller gets the data back.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { bridgeAsk, claim, answer, checkSchema } from "../server/bridge.mjs";

const run = promisify(execFile);
const SCHEMA = { type: "object", properties: { say: { type: "string" }, mood: { enum: ["ok", "sad"] } }, required: ["say", "mood"], additionalProperties: false };
const tmp = () => mkdtemp(path.join(tmpdir(), "ct-bridge-"));

test("a call goes out as a file and comes back with the answer", async () => {
  const dir = await tmp();
  const asked = bridgeAsk({ dir, system: "You are Pip.", prompt: "How's it going?", schema: SCHEMA, pollMs: 10 });
  let req = null;
  while (!(req = await claim(dir))) await new Promise((r) => setTimeout(r, 10));
  assert.equal(req.system, "You are Pip.");
  assert.equal(req.prompt, "How's it going?");
  assert.deepEqual(req.schema, SCHEMA);
  assert.deepEqual(await answer(dir, req.id, { say: "Boxes!", mood: "ok" }), []);
  assert.deepEqual(await asked, { say: "Boxes!", mood: "ok" });
  // Nothing left behind once the answer is picked up.
  for (const d of ["requests", "claimed", "answers"]) assert.deepEqual(await readdir(path.join(dir, d)), []);
  await rm(dir, { recursive: true });
});

test("an answer that doesn't fit the schema isn't sent, and says why", async () => {
  const dir = await tmp();
  const asked = bridgeAsk({ dir, system: "s", prompt: "p", schema: SCHEMA, pollMs: 10 });
  let req = null;
  while (!(req = await claim(dir))) await new Promise((r) => setTimeout(r, 10));
  const problems = await answer(dir, req.id, { say: 3, extra: true });
  assert.ok(problems.some((p) => p.includes("say should be string")), problems.join("|"));
  assert.ok(problems.some((p) => p.includes('missing "mood"')));
  assert.ok(problems.some((p) => p.includes('extra key "extra"')));
  assert.deepEqual(await readdir(path.join(dir, "answers")), []);
  await answer(dir, req.id, { say: "fine", mood: "sad" });
  assert.equal((await asked).mood, "sad");
  await rm(dir, { recursive: true });
});

test("two answerers never claim the same request", async () => {
  const dir = await tmp();
  const calls = [1, 2, 3].map((n) => bridgeAsk({ dir, system: "s", prompt: `p${n}`, schema: null, pollMs: 10 }));
  await new Promise((r) => setTimeout(r, 50));
  const claimed = (await Promise.all([1, 2, 3, 4, 5, 6].map(() => claim(dir)))).filter(Boolean);
  assert.deepEqual(claimed.map((r) => r.prompt).sort(), ["p1", "p2", "p3"]);
  for (const r of claimed) await answer(dir, r.id, { reply: r.prompt });
  assert.deepEqual((await Promise.all(calls)).map((d) => d.reply), ["p1", "p2", "p3"]);
  await rm(dir, { recursive: true });
});

test("nobody answering times out with a plain error and takes the request back", async () => {
  const dir = await tmp();
  await assert.rejects(bridgeAsk({ dir, system: "s", prompt: "p", timeoutMs: 60, pollMs: 10 }), /nobody answered/);
  assert.deepEqual(await readdir(path.join(dir, "requests")), []);
  await rm(dir, { recursive: true });
});

test("the command line tool: next, answer (refused, then OK), status, stop", async () => {
  const dir = await tmp();
  const env = { ...process.env, LLM_BRIDGE: dir };
  const cli = (...a) => run("node", ["tools/llm-bridge.mjs", ...a], { env }).then((r) => r.stdout, (e) => e.stdout);
  assert.match(await cli("next", "--wait", "0"), /^NONE/);
  const asked = bridgeAsk({ dir, system: "Be Blip.", prompt: "Say hi.", schema: SCHEMA, pollMs: 10 });
  await new Promise((r) => setTimeout(r, 30));
  const out = await cli("next", "--wait", "2");
  const id = out.match(/^REQUEST (\S+)/)[1];
  assert.match(out, /Be Blip\./);
  assert.match(out, /Say hi\./);
  assert.match(await cli("answer", id, '{"say": "hi"}'), /NOT SENT[\s\S]*missing "mood"/);
  assert.match(await cli("answer", id, '```json\n{"say": "hi", "mood": "ok"}\n```'), /^OK/);
  assert.deepEqual(await asked, { say: "hi", mood: "ok" });
  await cli("stop");
  assert.match(await cli("status"), /STOPPED/);
  assert.match(await cli("next", "--wait", "5"), /^STOP/);
  await rm(dir, { recursive: true });
});

test("the schema check: arrays, integers, type unions", () => {
  assert.deepEqual(checkSchema({ type: "object", properties: { problem: { type: "string" } }, required: ["problem"], additionalProperties: false }, { problem: "no paint" }), []);
  assert.ok(checkSchema({ type: "array", items: { type: "integer" } }, [1, 2.5]).length === 1);
  assert.deepEqual(checkSchema({ type: ["string", "null"] }, null), []);
});
