// Sound (decision 97): the game plays the sim's sounds, and the speaker button turns them off and
// remembers it.
import { test, expect } from "./fixtures.mjs";

test("Start blows the whistle, sim events make their sounds, and the files are there", async ({ page }) => {
  await page.goto("/");
  await page.click('[data-level="1"]');
  await page.evaluate(() => ct.begin());
  expect(await page.evaluate(() => ct.heard.map((c) => c.sound))).toContain("whistle");
  await page.evaluate(() => { ct.game.events.push({ t: 0, type: "pickUp", worker: "you", station: "SUPPLY", item: "widget" }, { t: 0, type: "ship", worker: "you", matched: true, item: "widget", colors: ["red"] }); ct.step(0.01); });
  expect(await page.evaluate(() => ct.heard.map((c) => c.sound))).toEqual(expect.arrayContaining(["pickup", "ding"]));
  for (const name of ["ding", "nope", "step", "roll"]) {
    const res = await page.request.get(`/sounds/${name}.mp3`);
    expect(res.status(), name).toBe(200);
    expect(res.headers()["content-type"]).toBe("audio/mpeg");
  }
});

test("the speaker button turns sound off, and it stays off after a reload", async ({ page }) => {
  await page.goto("/");
  await page.click('[data-level="1"]');
  const btn = page.locator("#soundBtn");
  await expect(btn).toBeVisible();
  await expect(btn).toHaveAttribute("aria-label", "Sound on");
  expect(await page.evaluate(() => ct.soundOn)).toBe(true);
  await btn.click();
  await expect(btn).toHaveAttribute("aria-label", "Sound off");
  await expect(btn).toHaveClass(/is-off/);
  await page.reload();
  await page.click('[data-level="1"]');
  await expect(page.locator("#soundBtn")).toHaveAttribute("aria-label", "Sound off");
  expect(await page.evaluate(() => ct.soundOn)).toBe(false);
  await page.locator("#soundBtn").click();
  expect(await page.evaluate(() => ct.soundOn)).toBe(true);
});
