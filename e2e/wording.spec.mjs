// Wording the player sees. Robots are put on a shift ("Schedule") and taken off it ("Off shift"),
// never hired or fired (Mike: "Didn't I tell you to change the wording of hire to something
// else?"). Checks the visible text, tooltips included, on every level's planning screen, a
// running shift, the end-of-shift card and the board.
import { test, expect } from "@playwright/test";

const BANNED = /\b(hire[sd]?|hiring|let (?:someone |people |them )?go|fire[sd]?|firing)\b/i;
async function visibleText(page) {
  return page.evaluate(() => {
    const tips = [...document.querySelectorAll("[data-tooltip]")].filter((e) => e.offsetParent).map((e) => e.dataset.tooltip);
    return `${document.body.innerText}\n${tips.join("\n")}`;
  });
}
const check = async (page, where) => {
  const text = await visibleText(page);
  const m = text.match(BANNED);
  expect(m, `"${m?.[0]}" on ${where}: …${m ? text.slice(Math.max(0, m.index - 60), m.index + 60) : ""}…`).toBeNull();
};

test("no hiring or firing words anywhere the player looks", async ({ page }) => {
  await page.goto("/");
  await check(page, "the menu");
  for (let n = 1; n <= 6; n++) {
    await page.evaluate((n) => ct.openLevel(n), n);
    await check(page, `level ${n} planning`);
    const pool = await page.evaluate(() => ct.game.level.pool);
    if (pool.length) {
      await page.evaluate((id) => ct.hire(id), pool[0]);
      await check(page, `level ${n} with someone scheduled`);
    }
  }
  // Level 6: a shift ends with shifts still to go.
  await page.evaluate(() => { ct.openLevel(6); ct.begin(); const g = ct.game; g.over = true; g.won = false; g.t = 120; g.events.push({ type: "end" }); ct.step(0); });
  await check(page, "level 6's end-of-shift card");
  await page.click('[data-go="next"]');
  await check(page, "level 6's second shift");
  // Level 7: the board and the floor.
  await page.evaluate(() => ct.openBoard());
  await check(page, "the board");
  await page.locator("[data-contract]").first().click();
  await page.click("#boardGo");
  await page.evaluate(() => ct.hire("pip"));
  await check(page, "level 7's floor");
});
