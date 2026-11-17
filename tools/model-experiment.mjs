// Which OpenRouter models could run the robots instead of Claude Haiku? Runs the game's real
// compile path (brains.js: prompt, checks, dry run, one repair) on a handful of instructions, for
// each model, and records speed, whether it worked, and cost.
//   node tools/model-experiment.mjs [runs=2] [model ...]
// Key from .env (OPENROUTER_API_KEY), never printed. Results: tools/model-experiment/results.json.
import "../test/setup.mjs";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const env = Object.fromEntries(readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")
  .map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]));
const KEY = env.OPENROUTER_API_KEY;

const { useFakeLlm } = await import("../src/llm.js");
const { compile, CANDIDATES } = await import("../src/brains.js");
const { newGame, addWorker, step, setProgram } = await import("../src/sim.js");
const { LEVELS } = await import("../src/levels.js");

const DEFAULT_MODELS = [
  "anthropic/claude-haiku-5.5",
  "openai/gpt-6-luna",
  "google/gemini-3.5-flash-lite",
  "deepseek/deepseek-v4.1-flash-1017",
  "minimax/minimax-m3.1-flash",
  "xiaomi/mimo-v2.6-flash",
  "meta/muse-ember",
  "nvidia/nemotron-3.5-super-vl:free",
  "inclusionai/ling-3.2-flash:free",
  "baidu/ernie-5.5-flash-preview:free",
];
// Some models can't turn reasoning off; they get the least there is.
const REASON_ON = new Set(["google/gemini-3.5-flash-lite", "minimax/minimax-m3.1-flash", "meta/muse-ember", "baidu/ernie-5.5-flash-preview:free"]);
const runs = +process.argv[2] || 2;
const models = process.argv.slice(3).length ? process.argv.slice(3) : DEFAULT_MODELS;

// Each task: a worker on a level, their instructions, whether they should be able to do it, and
// (for haul/pack) a crew partner whose program is fixed, to check the routine actually ships.
const TASKS = [
  { id: "haul", level: "Crew", who: "blip", text: "Carry red widgets from the supply to Pack.", can: true },
  { id: "pack", level: "Crew", who: "pip", text: "Pack red boxes and ship them from the dock.", can: true },
  { id: "noskill", level: "Crew", who: "blip", text: "Pack red boxes and ship them.", can: false },
  { id: "paint", level: "Full floor", who: "vex", text: "Paint red widgets green and bring them to Pack.", can: true },
  { id: "repair", level: "Full floor", who: "rusty", text: "Service the paint machine whenever it's worn.", can: true },
  { id: "all-in-one", level: "Crew", who: "gary", text: "Fetch red widgets from the supply, put them at Pack, pack red boxes and ship them.", can: true },
];
const PARTNER = {
  haul: ["pip", `while (needsAny() > 0) { move("PACK"); if (count("PACK", "red") >= 3) pack("red"); if (boxes("PACK") > 0) { pickUpBox(); move("DOCK"); putDown(); } else wait(1); }`],
  pack: ["blip", `while (true) { move("SUPPLY"); pickUp("red"); move("PACK"); putDown(); }`],
};

let calls = [];
function useModel(model) {
  useFakeLlm(async ({ system, prompt, schema }) => {
    const t = performance.now();
    const res = await realFetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}`, "HTTP-Referer": "https://quasarbright.github.io/", "X-Title": "clanker-tycoon model experiment" },
      body: JSON.stringify({
        model, messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
        response_format: { type: "json_schema", json_schema: { name: "reply", strict: true, schema } },
        reasoning: REASON_ON.has(model) ? { effort: "minimal" } : { enabled: false }, usage: { include: true },
      }),
    });
    const j = await res.json().catch(() => ({}));
    const ms = performance.now() - t;
    calls.push({ ms, ok: res.ok, cost: j.usage?.cost ?? 0, error: res.ok ? null : (j.error?.message ?? `HTTP ${res.status}`) });
    if (!res.ok) throw new Error(j.error?.message ?? `HTTP ${res.status}`);
    const text = String(j.choices?.[0]?.message?.content ?? "").replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
    return JSON.parse(text);
  });
}

/** Play the compiled routine (with its partner) for one 45 s shift: boxes shipped. */
function shipped(task, ast) {
  const L = LEVELS.find((l) => l.name === task.level);
  if (!["haul", "pack", "all-in-one"].includes(task.id)) return null;
  const partner = PARTNER[task.id];
  const ids = [task.who, ...(partner ? [partner[0]] : [])];
  const g = newGame(L, ids.map((id) => CANDIDATES.find((c) => c.id === id)), 1);
  setProgram(g, g.workers[0], ast);
  if (partner) { const { parseProgram } = LANG; setProgram(g, g.workers[1], parseProgram(partner[1])); }
  while (!g.over && g.t < 45) { step(g, 1 / 20); g.events.length = 0; }
  return g.order.reduce((a, l) => a + l.done, 0);
}
const LANG = await import("../src/lang.js");

const results = [];
for (const model of models) {
  useModel(model);
  for (const task of TASKS) {
    for (let r = 0; r < runs; r++) {
      calls = [];
      const L = LEVELS.find((l) => l.name === task.level);
      const s = newGame(L, [], 1);
      const w = addWorker(s, CANDIDATES.find((c) => c.id === task.who));
      if (PARTNER[task.id]) addWorker(s, CANDIDATES.find((c) => c.id === PARTNER[task.id][0]));
      const t = performance.now();
      let out, err = null;
      try { out = await compile(s, w, task.text); } catch (e) { err = e.message; }
      const ms = performance.now() - t;
      const worked = !err && (task.can ? !!out?.ast : !out?.ast && !!out?.problem);
      const ships = out?.ast ? shipped(task, out.ast) : null;
      const row = { model, task: task.id, run: r, worked, ms: Math.round(ms), calls: calls.length, cost: calls.reduce((a, c) => a + c.cost, 0), ships, err: err ?? calls.find((c) => c.error)?.error ?? null, said: out?.reply ?? out?.problem ?? null };
      results.push(row);
      console.log(`${model.padEnd(38)} ${task.id.padEnd(11)} ${worked ? "ok  " : "FAIL"} ${String(row.ms).padStart(6)}ms ${row.calls} calls${ships != null ? ` ships ${ships}` : ""}${row.err ? `  ${String(row.err).slice(0, 80)}` : ""}`);
    }
  }
}
mkdirSync(new URL("model-experiment/", import.meta.url), { recursive: true });
writeFileSync(new URL(`model-experiment/results-${Date.now()}.json`, import.meta.url), JSON.stringify(results, null, 1));

console.log("\nmodel                                  worked  median s  calls/task  cost/task");
for (const model of models) {
  const rs = results.filter((r) => r.model === model);
  const ms = rs.map((r) => r.ms).sort((a, b) => a - b);
  const med = ms[Math.floor(ms.length / 2)] / 1000;
  const cost = rs.reduce((a, r) => a + r.cost, 0) / rs.length;
  console.log(`${model.padEnd(38)} ${`${rs.filter((r) => r.worked).length}/${rs.length}`.padStart(6)}  ${med.toFixed(1).padStart(8)}  ${(rs.reduce((a, r) => a + r.calls, 0) / rs.length).toFixed(1).padStart(10)}  $${cost.toFixed(5)}`);
}
