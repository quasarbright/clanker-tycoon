// Every model call in the game goes through llm(), so the game doesn't care where the model runs.
//   local       POST /api/llm on server.mjs, which runs `claude -p` (bills to your Claude plan)
//   openrouter  straight from the browser with the shared OpenRouter key (for a web build)
// Calls are tagged with the current shift from the play log, so the two logs line up.
// Default: local on localhost, openrouter anywhere else. Override with ?llm=local|openrouter.

import { shiftId, isTest, logEvent } from "./playlog.js";

const params = new URLSearchParams(location.search);
const onLocalhost = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
export const BACKEND = params.get("llm") || (onLocalhost ? "local" : "openrouter");
// Who's making the call, for the usage log: "play" (Mike playing in a browser), "test" (an
// automated browser), or whatever a script says with ?source= (e.g. "check" for thinking-check).
export const SOURCE = params.get("source") || (isTest ? "test" : "play");

// Not tested yet: check the id at openrouter.ai/models before shipping a web build.
export const OPENROUTER_MODEL = "anthropic/claude-haiku-5.5";

export const backendLabel = BACKEND === "openrouter"
  ? "Claude Haiku 5.5 through OpenRouter"
  : "Claude Haiku 5.5 through your Claude plan (local server)";

const MAX_IN_FLIGHT = 4;
let inFlight = 0;
const queue = [];
async function slot() {
  if (inFlight >= MAX_IN_FLIGHT) await new Promise((r) => queue.push(r));
  inFlight++;
}
function release() { inFlight--; queue.shift()?.(); }

// Tests swap in a fake model (test/brains.test.mjs, and the e2e suite through window.ct).
let fake = null;
/** Use `fn({ system, prompt, schema })` instead of the model; null goes back to the real one. */
export function useFakeLlm(fn) { fake = fn; }

/** Ask the model. `schema` is a JSON schema for the reply; resolves to the parsed object. */
export async function llm({ system, prompt, schema }) {
  if (fake) return fake({ system, prompt, schema });
  await slot();
  const started = performance.now();
  try {
    const answer = BACKEND === "openrouter" ? await viaOpenRouter(system, prompt, schema) : await viaLocal(system, prompt, schema);
    // The local server writes every call to logs/llm.jsonl itself; the web build has no server, so
    // its calls go in the play log in full (prompt and answer, never the key).
    if (BACKEND === "openrouter") logEvent(null, "llm", { model: OPENROUTER_MODEL, ms: Math.round(performance.now() - started), system, prompt, answer });
    return answer;
  } catch (e) {
    logEvent(null, "llm_error", { backend: BACKEND, ms: Math.round(performance.now() - started), message: e.message, prompt });
    throw e;
  } finally { release(); }
}

async function viaLocal(system, prompt, schema) {
  const res = await fetch("/api/llm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system, prompt, schema, shift: shiftId, test: isTest || undefined, source: SOURCE }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `server ${res.status}`);
  return j.data;
}

async function viaOpenRouter(system, prompt, schema) {
  const { openrouterChat } = await import("https://quasarbright.github.io/sketches/shared/cohesion.js");
  const { content } = await openrouterChat({
    model: OPENROUTER_MODEL,
    messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
    response_format: { type: "json_schema", json_schema: { name: "reply", strict: true, schema } },
    reasoning: { enabled: false },
  });
  const t = content.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  return JSON.parse(t);
}
