// The file bridge: a model backend for automated playtests in places where neither `claude -p` nor
// an OpenRouter key works (a cloud Claude session). Each model call becomes a request file; whoever
// is standing in for the model (in a cloud session, a Haiku subagent running tools/llm-bridge.mjs)
// reads it, answers with JSON in the same contract, and writes the answer file back. The server
// polls for it. Slow (seconds to minutes per call), so it's for playtests only, never for players.
//
//   <dir>/requests/<id>.json   written by the server: { id, at, system, prompt, schema }
//   <dir>/claimed/<id>.json    moved here (rename, so two answerers never take the same one)
//   <dir>/answers/<id>.json    written by the answerer: { id, data } or { id, error }
//
// Opt-in: start the server with LLM_BRIDGE=<dir> (see server.mjs). Nothing here is provider-specific.
import { mkdir, writeFile, readFile, rename, readdir, unlink } from "node:fs/promises";
import path from "node:path";

export const DIRS = ["requests", "claimed", "answers"];

export async function prepare(dir) {
  for (const d of DIRS) await mkdir(path.join(dir, d), { recursive: true });
}

let seq = 0;
/** A sortable, unique id: oldest requests get answered first. */
export function newId() {
  return `${Date.now().toString(36).padStart(9, "0")}-${(seq++).toString(36).padStart(3, "0")}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Write a file in one step (write a temp file, then rename), so a reader never sees half of it. */
export async function writeAtomic(file, value) {
  const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 1));
  await rename(tmp, file);
}

/**
 * Ask whoever answers the bridge. Resolves to the answer's data (already checked against the
 * schema by the answerer's tool, and again here), or throws on an error answer or a timeout.
 */
export async function bridgeAsk({ dir, system, prompt, schema, timeoutMs = 10 * 60_000, pollMs = 250, meta = {} }) {
  await prepare(dir);
  const id = newId();
  await writeAtomic(path.join(dir, "requests", `${id}.json`), { id, at: new Date().toISOString(), ...meta, system, prompt, schema: schema || null });
  const answerFile = path.join(dir, "answers", `${id}.json`);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const text = await readFile(answerFile, "utf8").catch(() => null);
    if (text) {
      await unlink(answerFile).catch(() => {});
      await unlink(path.join(dir, "claimed", `${id}.json`)).catch(() => {});
      const ans = JSON.parse(text);
      if (ans.error) throw new Error(`bridge answerer: ${ans.error}`);
      const problems = schema ? checkSchema(schema, ans.data) : [];
      if (problems.length) throw new Error(`bridge answer doesn't match the schema: ${problems.join("; ")}`);
      return ans.data;
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  // Nobody answered: take the request back so a later answerer doesn't work on a dead call.
  for (const d of ["requests", "claimed"]) await unlink(path.join(dir, d, `${id}.json`)).catch(() => {});
  throw new Error(`nobody answered the bridge in ${Math.round(timeoutMs / 1000)} s (is an answerer running on ${dir}?)`);
}

/** Requests nobody has claimed yet, oldest first. */
export async function pending(dir) {
  const names = await readdir(path.join(dir, "requests")).catch(() => []);
  return names.filter((n) => n.endsWith(".json")).sort();
}

/**
 * Claim the oldest unclaimed request: move it to claimed/ and return it, or null if there's none.
 * The rename is atomic, so with two answerers only one gets each request.
 */
export async function claim(dir) {
  await prepare(dir);
  for (const name of await pending(dir)) {
    const from = path.join(dir, "requests", name), to = path.join(dir, "claimed", name);
    try { await rename(from, to); } catch { continue; } // someone else took it
    return JSON.parse(await readFile(to, "utf8"));
  }
  return null;
}

/** Answer a claimed request. Returns the schema problems (and writes nothing) if there are any. */
export async function answer(dir, id, data) {
  const req = JSON.parse(await readFile(path.join(dir, "claimed", `${id}.json`), "utf8").catch(() => "null"));
  if (!req) return [`no claimed request ${id} (it may have timed out)`];
  const problems = req.schema ? checkSchema(req.schema, data) : [];
  if (problems.length) return problems;
  await writeAtomic(path.join(dir, "answers", `${id}.json`), { id, data });
  return [];
}

/**
 * A small JSON-schema check, enough for the schemas the game sends (objects, required keys, types,
 * enums, arrays, no extra keys when additionalProperties is false). Returns a list of problems.
 */
export function checkSchema(schema, value, where = "answer") {
  const out = [];
  if (!schema || typeof schema !== "object") return out;
  if (schema.enum && !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(value))) {
    out.push(`${where} must be one of ${schema.enum.map((e) => JSON.stringify(e)).join(", ")}`);
    return out;
  }
  if (schema.anyOf) {
    if (!schema.anyOf.some((s) => checkSchema(s, value, where).length === 0)) out.push(`${where} matches none of the allowed shapes`);
    return out;
  }
  const types = [].concat(schema.type || []);
  if (types.length && !types.some((t) => isType(t, value))) {
    out.push(`${where} should be ${types.join(" or ")}, got ${value === null ? "null" : Array.isArray(value) ? "array" : typeof value}`);
    return out;
  }
  if (isType("object", value)) {
    for (const k of schema.required || []) if (!(k in value)) out.push(`${where} is missing "${k}"`);
    const props = schema.properties || {};
    for (const [k, v] of Object.entries(value)) {
      if (props[k]) out.push(...checkSchema(props[k], v, `${where}.${k}`));
      else if (schema.additionalProperties === false) out.push(`${where} has an extra key "${k}"`);
    }
  }
  if (Array.isArray(value) && schema.items) value.forEach((v, i) => out.push(...checkSchema(schema.items, v, `${where}[${i}]`)));
  return out;
}

function isType(t, v) {
  if (t === "object") return v !== null && typeof v === "object" && !Array.isArray(v);
  if (t === "array") return Array.isArray(v);
  if (t === "integer") return Number.isInteger(v);
  if (t === "number") return typeof v === "number";
  if (t === "null") return v === null;
  return typeof v === t;
}
