// tools/playlog.mjs: reading the play log back as a timeline (decision 83).
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLines, describe, sessions, timeline } from "../tools/playlog.mjs";

const L = (shift, type, extra = {}) => ({ at: "2026-11-18T06:00:00.000Z", shift, t: null, type, ...extra });

test("business lines read as sentences: license, board, picks, quarter start and settle, game over", () => {
  assert.equal(describe(L("s/0", "license", { business: "Clank & Sons", owner: "Mike" })), 'licensed "Clank & Sons", owner Mike');
  assert.match(describe(L("s/0", "board", { quarter: 2, funds: 80, rep: 7, loans: [100], offers: [{ id: "1-s", count: 16, fullCount: 20, color: "red", pay: 120 }] })),
    /quarter 2: funds \$80, reputation 7\/9 thirds, loans \[100\], offers 1-s 16\/20×red \$120/);
  assert.equal(describe(L("s/0", "pick", { contract: "1-l", on: true, picked: ["1-l"] })), "picked 1-l (now: 1-l)");
  assert.match(describe(L("s/0", "quarter_settle", { quarter: 1, contracts: [{ id: "0-s", shipped: 20, count: 20, won: true, pay: 150 }], crewPay: 45, before: { funds: 100, rep: 9 }, after: { funds: 205, rep: 9 } })),
    /0-s 20\/20 PAID \$150; crew pay \$45; funds \$100 → \$205; reputation 9 → 9/);
  assert.match(describe(L("s/0", "gameover", { reason: "reputation", headline: "X", wins: 1, taken: 3, revenue: 150, costs: 90, funds: 60, owed: 0 })), /OUT OF BUSINESS \(reputation\)/);
  assert.match(describe(L("s/1", "error", { message: "boom", where: "main.js:1:2" })), /ERROR: boom at main.js:1:2/);
  assert.match(describe(L("s/1", "llm_error", { backend: "openrouter", ms: 900, message: "429" })), /MODEL CALL FAILED/);
});

test("sessions group lines by page session and shift; the board before a shift is /0", () => {
  const lines = parseLines([L("a/0", "board"), L("a/1", "shift", { level: 7, name: "Quarter" }), L("a/1", "start"), L("b/1", "shift", { level: 3, name: "Crew" })].map((l) => JSON.stringify(l)).join("\n") + "\nnot json\n");
  const ss = sessions(lines);
  assert.deepEqual(ss.map((s) => s.id), ["a", "b"]);
  assert.deepEqual([...ss[0].shifts.values()].map((s) => [s.id, s.level, s.lines]), [["a/0", null, 1], ["a/1", "7 Quarter", 2]]);
  assert.equal(timeline([L("a/1", "snapshot"), L("a/1", "pause", { t: 12 })]).length, 1, "snapshots only on request");
});
