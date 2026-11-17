// Totting up model usage and cost from logs/llm.jsonl (server/usage.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { totals, costOf, PRICES, parseWhen, within, sourceOf } from "../server/usage.mjs";

test("cost of one call at Haiku 5.5 prices", () => {
  assert.equal(costOf({ input: 1e6 }), PRICES.input);
  assert.equal(costOf({ output: 1e6 }), PRICES.output);
  assert.ok(Math.abs(costOf({ input: 2000, output: 400, cacheRead: 10000 }) - (2000 * 0.10 + 400 * 0.50 + 10000 * 0.01) / 1e6) < 1e-12);
});

test("totals add measured calls and estimate the old ones separately", () => {
  const t = totals([
    { usage: { input: 1000, output: 200, thinking: 50, cacheRead: 3000, cacheWrite: 0, costUsd: 0.0002 } },
    { usage: { input: 500, output: 100, thinking: 0, cacheRead: 0, cacheWrite: 400, costUsd: 0.0001 } },
    { system: "x".repeat(4000), prompt: "y".repeat(4000), data: { reply: "ok" } }, // no usage logged
  ]);
  assert.equal(t.calls, 3);
  assert.equal(t.measured, 2);
  assert.equal(t.unmeasured, 1);
  assert.equal(t.input, 1500);
  assert.equal(t.output, 300);
  assert.equal(t.thinking, 50);
  assert.equal(t.cacheRead, 3000);
  assert.equal(t.cacheWrite, 400);
  assert.ok(Math.abs(t.cliCost - 0.0003) < 1e-12);
  assert.ok(t.cost > 0 && t.estimatedCost > 0);
});

test("time windows: 2d, 12h, 30m, 1w back from now, or a date", () => {
  const now = Date.parse("2026-11-17T12:00:00Z");
  assert.equal(parseWhen("2d", now).toISOString(), "2026-11-15T12:00:00.000Z");
  assert.equal(parseWhen("12h", now).toISOString(), "2026-11-17T00:00:00.000Z");
  assert.equal(parseWhen("30m", now).toISOString(), "2026-11-17T11:30:00.000Z");
  assert.equal(parseWhen("1w", now).toISOString(), "2026-11-10T12:00:00.000Z");
  assert.equal(parseWhen("2026-11-16T00:00:00Z").toISOString(), "2026-11-16T00:00:00.000Z");
  assert.equal(parseWhen(null), null);
  assert.throws(() => parseWhen("yesterday-ish"));
});

test("within keeps calls inside the window", () => {
  const lines = [{ at: "2026-11-15T10:00:00Z" }, { at: "2026-11-16T10:00:00Z" }, { at: "2026-11-17T10:00:00Z" }];
  assert.equal(within(lines, new Date("2026-11-16T00:00:00Z"), null).length, 2);
  assert.equal(within(lines, new Date("2026-11-16T00:00:00Z"), new Date("2026-11-17T00:00:00Z")).length, 1);
  assert.equal(within(lines, null, null).length, 3);
});

test("each call's source: logged, or play/test for older lines", () => {
  assert.equal(sourceOf({ source: "check" }), "check");
  assert.equal(sourceOf({ test: true }), "test");
  assert.equal(sourceOf({}), "play");
});
