#!/usr/bin/env node
// Read the play log and say what happened, so a report like "Blip just stood there" or "my funds
// went weird in quarter 3" can be checked against the record (decision 83).
//
//   node tools/playlog.mjs                      the sessions in today's (newest) log, with their shifts
//   node tools/playlog.mjs --session <id>       a whole page session (a run): board, quarters, shifts
//   node tools/playlog.mjs --shift <id>         one shift's timeline (prefix of the id is enough)
//   node tools/playlog.mjs <file.jsonl> ...     read these files instead (e.g. a web build's Download log)
//   --snapshots   include the 5-second snapshots     --all   every type, raw-ish
//
// Model calls in logs/llm.jsonl with the same shift id are listed under each shift.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Parse JSON lines, skipping blank or broken ones. */
export function parseLines(text) {
  return text.split("\n").filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
}

const money = (n) => (n == null ? "?" : `$${Math.round(n)}`);
const time = (l) => (l.t == null ? "     " : `${String(Math.floor(l.t / 60)).padStart(1)}:${String(Math.floor(l.t % 60)).padStart(2, "0")}`);

/** One line of the log as a short readable sentence. */
export function describe(l) {
  switch (l.type) {
    case "run_start": return "a new business";
    case "license": return `licensed "${l.business}", owner ${l.owner}`;
    case "board": return `board, quarter ${l.quarter}: funds ${money(l.funds)}, reputation ${l.rep}/9 thirds, loans [${(l.loans ?? []).join(", ")}], offers ${(l.offers ?? []).map((c) => `${c.id} ${c.count}${c.fullCount !== c.count ? `/${c.fullCount}` : ""}×${c.color} ${money(c.pay)}`).join("; ")}`;
    case "pick": return `${l.on ? "picked" : "unpicked"} ${l.contract} (now: ${(l.picked ?? []).join(", ") || "none"})`;
    case "recruit": return `recruited ${l.robot}, funds ${money(l.funds)}`;
    case "train": return `trained ${l.robot} in ${l.learned}, funds ${money(l.funds)}`;
    case "buy": return `bought ${l.machine}, funds ${money(l.funds)}`;
    case "borrow": return `borrowed ${money(l.amount)}, funds ${money(l.funds)}, loans [${(l.loans ?? []).join(", ")}]`;
    case "quarter_start": return `quarter ${l.quarter} starts: ${(l.contracts ?? []).map((c) => `${c.count} ${c.color} for ${money(c.pay)}`).join(", ")}, funds ${money(l.funds)}`;
    case "quarter_settle": return `quarter ${l.quarter} settled: ${(l.contracts ?? []).map((c) => `${c.id} ${c.shipped}/${c.count} ${c.won ? "PAID " + money(c.pay) : "missed"}`).join(", ")}; crew pay ${money(l.crewPay)}; funds ${money(l.before?.funds)} → ${money(l.after?.funds)}; reputation ${l.before?.rep} → ${l.after?.rep} (thirds)`;
    case "gameover": return `OUT OF BUSINESS (${l.reason}): "${l.headline}"; ${l.wins}/${l.taken} contracts, revenue ${money(l.revenue)}, costs ${money(l.costs)}, funds ${money(l.funds)}, owed ${money(l.owed)}`;
    case "new_run": return "new run";
    case "shift": return `opened level ${l.level} (${l.name})${l.quarter ? `, shift ${l.quarter.shift}, funds ${money(l.quarter.money)}` : ""}${l.crew?.length ? `, crew ${l.crew.map((c) => c.worker ?? c.id ?? c).join(", ")}` : ""}`;
    case "hire": return `scheduled ${l.worker}`;
    case "fire": return `took ${l.worker} off the shift`;
    case "start": return `START with ${(l.crew ?? []).map((c) => c.worker ?? c.id ?? c).join(", ") || "nobody"}`;
    case "start_blocked": return `pressed Start but it's blocked: ${l.why}`;
    case "chat": return `${l.who === "you" ? `you → ${l.worker}` : l.who === "sys" ? `[${l.worker}]` : `${l.worker}`}${l.kind ? ` (${l.kind})` : ""}: ${l.text}${l.effect ? `  [${l.effect}]` : ""}`;
    case "chat_open": return `opened ${l.worker}'s chat`;
    case "instructions": return `${l.worker} ${l.changed ? "changed" : "wrote"} instructions: ${l.text}`;
    case "you": return `you ${l.go ? `walk to ${l.go}` : JSON.stringify(l.action)}`;
    case "sim": { const { at, shift, t, type, event, test, ...rest } = l; return `${event} ${JSON.stringify(rest)}`; }
    case "pause": return "PAUSE"; case "resume": return "resume";
    case "restart_shift": return "restarted the shift";
    case "end_card": return `end card: ${l.go}`;
    case "menu": return "back to the levels";
    case "end": return `shift over: ${l.won ? "won" : "not done"}, shipped ${l.shipped}, labor ${money(l.labor)}${l.money != null ? `, funds ${money(l.money)}` : ""}`;
    case "llm": return `model call (web), ${l.ms} ms: ${String(l.system ?? "").slice(0, 60)}… → ${JSON.stringify(l.answer).slice(0, 120)}`;
    case "llm_error": return `MODEL CALL FAILED (${l.backend}, ${l.ms} ms): ${l.message}`;
    case "error": return `ERROR: ${l.message}${l.where ? ` at ${l.where}` : ""}`;
    case "download_log": return "downloaded the log";
    case "snapshot": return `snapshot: ${(l.workers ?? []).map((w) => `${w.id}@${w.at ?? `${w.x},${w.y}`}${w.holding ? `+${w.holding}` : ""}${w.doing ? `(${w.doing})` : ""}`).join(" ")}`;
    default: return `${l.type} ${JSON.stringify(l)}`;
  }
}

/** The sessions (runs) in a log, each with its shifts in order. */
export function sessions(lines) {
  const out = new Map();
  for (const l of lines) {
    const [s, n] = String(l.shift ?? "").split("/");
    if (!out.has(s)) out.set(s, { id: s, from: l.at, to: l.at, shifts: new Map(), count: 0 });
    const o = out.get(s);
    o.to = l.at; o.count++;
    if (!o.shifts.has(n)) o.shifts.set(n, { id: l.shift, level: null, lines: 0 });
    const sh = o.shifts.get(n);
    sh.lines++;
    if (l.type === "shift") sh.level = `${l.level} ${l.name}`;
  }
  return [...out.values()];
}

/** A timeline: one sentence per line, in time order. */
export function timeline(lines, { snapshots = false } = {}) {
  return lines.filter((l) => snapshots || l.type !== "snapshot")
    .map((l) => `${(l.at ?? "").slice(11, 19)} ${time(l)} ${describe(l)}`);
}

function newestLog() {
  const dir = path.join(ROOT, "logs", "play");
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter((f) => f.endsWith(".jsonl")).sort();
  return files.length ? [path.join(dir, files.at(-1))] : [];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const flag = (name) => { const i = args.indexOf(name); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
  const bool = (name) => { const i = args.indexOf(name); if (i < 0) return false; args.splice(i, 1); return true; };
  const shift = flag("--shift"), session = flag("--session"), snapshots = bool("--snapshots") || bool("--all");
  const files = args.length ? args : newestLog();
  if (!files.length) { console.log("No play log yet (logs/play/ is empty)."); process.exit(0); }
  const lines = files.flatMap((f) => parseLines(readFileSync(f, "utf8")));
  const llmFile = path.join(ROOT, "logs", "llm.jsonl");
  const llm = existsSync(llmFile) ? parseLines(readFileSync(llmFile, "utf8")) : [];
  if (shift || session) {
    const pick = lines.filter((l) => (shift ? String(l.shift).startsWith(shift) : String(l.shift).startsWith(session + "/")));
    for (const row of timeline(pick, { snapshots })) console.log(row);
    const calls = llm.filter((c) => (shift ? String(c.shift).startsWith(shift) : String(c.shift).startsWith(session + "/")));
    if (calls.length) {
      console.log(`\n${calls.length} model calls (logs/llm.jsonl):`);
      for (const c of calls) console.log(`  ${(c.at ?? "").slice(11, 19)} ${c.ms ?? "?"} ms  ${String(c.system ?? "").split(".")[0].slice(0, 50)}  →  ${JSON.stringify(c.data ?? c.answer ?? c.reply ?? "").slice(0, 100)}`);
    }
  } else {
    for (const s of sessions(lines)) {
      console.log(`${s.id}  ${s.from?.slice(0, 19)} → ${s.to?.slice(11, 19)}  (${s.count} lines)`);
      for (const sh of s.shifts.values()) console.log(`    ${sh.id}  ${sh.level ?? "(board)"}  ${sh.lines} lines`);
    }
    console.log("\nnode tools/playlog.mjs --session <id>   or   --shift <id>");
  }
}
