// The answering side of the file bridge (server/bridge.mjs). Whoever stands in for the model runs
// this: in a cloud Claude session, a Haiku subagent briefed with tools/llm-bridge-answerer.md.
//
//   node tools/llm-bridge.mjs next [--wait 90]    claim the oldest request and print it
//                                                  (prints NONE after the wait, STOP once stopped)
//   node tools/llm-bridge.mjs answer <id> <<'EOF'  answer it with JSON on stdin (or as an argument);
//   {"say": "..."}                                 prints OK, or what doesn't match the format
//   EOF
//   node tools/llm-bridge.mjs fail <id> "<why>"    give up on one (the game shows a model error)
//   node tools/llm-bridge.mjs status               how many are waiting, claimed, answered
//   node tools/llm-bridge.mjs stop | start         tell answerers to finish up, or clear that
//
// The folder is $LLM_BRIDGE, or logs/bridge (gitignored) when that's unset; the server must use the
// same one (LLM_BRIDGE=logs/bridge node server.mjs).
import { writeFile, unlink, access, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { claim, answer, pending, prepare, writeAtomic } from "../server/bridge.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DIR = path.resolve(ROOT, process.env.LLM_BRIDGE || "logs/bridge");
const STOP = path.join(DIR, "stop");
const [cmd, ...args] = process.argv.slice(2);
const flag = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const stopped = () => access(STOP).then(() => true, () => false);

await prepare(DIR);

if (cmd === "next") {
  const until = Date.now() + 1000 * +flag("wait", 90);
  for (;;) {
    if (await stopped()) { console.log("STOP: the playtest is over. You're done; say so and finish."); break; }
    const req = await claim(DIR);
    if (req) { print(req); break; }
    if (Date.now() > until) { console.log("NONE: no request yet. Run `next` again."); break; }
    await new Promise((r) => setTimeout(r, 300));
  }
} else if (cmd === "answer") {
  const [id, inline] = args;
  if (!id) usage();
  let text = inline ?? (await readStdin());
  text = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  let data;
  try { data = JSON.parse(text); } catch (e) {
    console.log(`NOT SENT: that isn't valid JSON (${e.message}). Fix it and run answer ${id} again.`);
    process.exit(1);
  }
  const problems = await answer(DIR, id, data);
  if (problems.length) {
    console.log(`NOT SENT: the answer doesn't match the format:\n- ${problems.join("\n- ")}\nFix it and run answer ${id} again.`);
    process.exit(1);
  }
  console.log("OK. Run `next` for the next request.");
} else if (cmd === "fail") {
  const [id, ...why] = args;
  if (!id) usage();
  await writeAtomic(path.join(DIR, "answers", `${id}.json`), { id, error: why.join(" ") || "the answerer gave up" });
  console.log("OK, marked as failed.");
} else if (cmd === "status") {
  const count = async (d) => (await readdir(path.join(DIR, d)).catch(() => [])).filter((n) => n.endsWith(".json")).length;
  console.log(`${DIR}\nwaiting ${(await pending(DIR)).length}, claimed ${await count("claimed")}, answered (not yet picked up) ${await count("answers")}${(await stopped()) ? ", STOPPED" : ""}`);
} else if (cmd === "stop") {
  await writeFile(STOP, new Date().toISOString());
  console.log("Stopped: answerers finish on their next `next`.");
} else if (cmd === "start") {
  await unlink(STOP).catch(() => {});
  console.log("Cleared the stop.");
} else usage();

function print(req) {
  console.log(`REQUEST ${req.id}

=== SYSTEM (your instructions for this request) ===
${req.system}

=== PROMPT ===
${req.prompt}

=== ANSWER FORMAT ===
${req.schema ? `Answer with one JSON value matching this JSON schema, and nothing else:\n${JSON.stringify(req.schema)}` : "Answer with one JSON value."}

Then: node tools/llm-bridge.mjs answer ${req.id} <<'EOF'
<your JSON>
EOF`);
}

async function readStdin() {
  let s = "";
  for await (const c of process.stdin) s += c;
  return s;
}

function usage() {
  console.log("usage: node tools/llm-bridge.mjs next [--wait 90] | answer <id> [json] | fail <id> <why> | status | stop | start");
  process.exit(2);
}
