// The play log is comprehensive (Mike, 2026-11-18): business actions, UI events and errors all
// reach it, and the web build keeps it in the browser with a Download log link (decision 83).
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

/** Capture what the page posts to /api/play. */
async function capture(page) {
  const lines = [];
  await page.route("**/api/play", async (route) => { lines.push(...JSON.parse(route.request().postData()).lines); await route.fulfill({ status: 200, body: "{}" }); });
  return lines;
}
const flush = (page) => page.evaluate(() => dispatchEvent(new Event("pagehide")));
const endShift = (page, fill = []) => page.evaluate((fill) => {
  ct.begin(); ct.step(1);
  const g = ct.game;
  g.order.forEach((l, i) => (l.done = Math.min(l.count, fill[i] ?? l.count)));
  g.over = true; g.won = g.order.every((l) => l.done >= l.count); g.t = 120;
  g.events.push({ type: "end" }); ct.step(0);
}, fill);

test("a run's business, UI and errors all reach the play log", async ({ page }) => {
  const lines = await capture(page);
  await page.goto("/?playlog");
  await page.click('[data-level="7"]');
  await page.fill("#licenseName", "Clank & Sons");
  await page.fill("#licenseOwner", "Mike");
  await page.click("#licenseGo");
  await expect(page.locator("#boardScreen")).toBeVisible();
  await page.click('[data-loan="0"]');
  await page.locator("[data-recruit]").first().click();
  await page.locator("[data-contract]").first().click();
  await page.click("#boardGo");
  await page.evaluate(() => { ct.hire("blip"); ct.setPaused(true); ct.setPaused(false); });
  for (let s = 1; s <= 3; s++) { await endShift(page, s < 3 ? [2 * s] : []); if (s < 3) await page.click('[data-go="next"]'); }
  await page.click('[data-go="board"]');
  await page.evaluate(() => setTimeout(() => { throw new Error("boom for the log"); }));
  await page.waitForTimeout(100);
  await page.evaluate(() => { ct.biz.rep = 0; ct.openBoard(); });
  await flush(page);
  await expect.poll(() => lines.some((l) => l.type === "gameover")).toBe(true); // the post lands a moment later
  const types = new Set(lines.map((l) => l.type));
  for (const t of ["run_start", "license", "board", "borrow", "recruit", "pick", "quarter_start", "shift", "hire", "pause", "resume", "start", "end", "end_card", "quarter_settle", "error", "gameover"]) {
    expect(types, t).toContain(t);
  }
  const settle = lines.find((l) => l.type === "quarter_settle");
  expect(settle.before.rep).toBe(9);
  expect(settle.contracts[0].won).toBe(true);
  expect(lines.find((l) => l.type === "error").message).toContain("boom for the log");
  expect(lines.every((l) => l.shift)).toBe(true); // the board has a shift id too ("…/0")
});

test("the web build keeps the log in the browser; a small Download log link saves it", async ({ page }) => {
  await capture(page);
  await page.goto("/?llm=openrouter&playlog");
  const link = page.locator("#downloadLog");
  await expect(link).toBeVisible();
  const box = await link.boundingBox();
  expect(box.height).toBeLessThan(30); // small and out of the way, bottom left
  expect(box.x).toBeLessThan(40);
  await page.click('[data-level="3"]');
  const [download] = await Promise.all([page.waitForEvent("download"), link.click()]);
  const text = readFileSync(await download.path(), "utf8");
  const types = text.trim().split("\n").map((l) => JSON.parse(l).type);
  expect(types).toContain("shift");
  expect(types).toContain("download_log");
  // On localhost the link is hidden unless asked for.
  await page.goto("/?playlog");
  await expect(page.locator("#downloadLog")).toBeHidden();
});
