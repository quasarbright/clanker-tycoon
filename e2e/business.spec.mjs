// Level 7, "Your business", in a real browser: the board between quarters (contracts, the lender,
// recruit, training, machines), the floor, and the end-of-quarter card. The model is faked.
import { test, expect } from "@playwright/test";

/** Open the page, watch the console, and open level 7's board. */
async function openBoard(page) {
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.click('[data-level="7"]');
  await expect(page.locator("#boardScreen")).toBeVisible();
  return errors;
}
const contracts = (page) => page.locator("[data-contract]");
/** Finish the running quarter's shift as if `fill` boxes of each contract shipped (all, by default). */
const endShift = (page, fill = []) => page.evaluate((fill) => {
  ct.begin(); ct.step(1);
  const g = ct.game;
  g.order.forEach((l, i) => (l.done = Math.min(l.count, fill[i] ?? l.count)));
  g.over = true; g.won = g.order.every((l) => l.done >= l.count); g.t = 120;
  g.events.push({ type: "end" }); ct.step(0);
}, fill);

test("the board fits the window, offers three contracts, and Start waits for a pick", async ({ page }) => {
  const errors = await openBoard(page);
  await expect(contracts(page)).toHaveCount(3);
  await expect(page.locator("#boardGo")).toBeDisabled();
  await expect(page.locator("#forecast")).toBeEmpty();
  const scroll = await page.evaluate(() => {
    const o = document.querySelector("#boardScreen");
    return { overlay: o.scrollHeight > o.clientHeight + 1, page: document.documentElement.scrollHeight > innerHeight };
  });
  expect(scroll).toEqual({ overlay: false, page: false });
  expect(errors).toEqual([]);
});

test("Small and Large are one choice; the side contract needs a paint machine", async ({ page }) => {
  await openBoard(page);
  const [small, large, side] = await contracts(page).evaluateAll((els) => els.map((e) => e.dataset.contract));
  await expect(page.locator(`[data-contract="${side}"]`)).toBeDisabled();
  await page.click(`[data-contract="${small}"]`);
  await page.click(`[data-contract="${large}"]`);
  await expect(page.locator(".ct-size.is-on")).toHaveCount(1);
  await expect(page.locator(`[data-contract="${large}"]`)).toHaveClass(/is-on/);
  await expect(page.locator("#boardGo")).toBeEnabled();
  await expect(page.locator("#forecast")).toContainText("Contracts pay");
  await page.click('[data-buy="paint"]');
  await expect(page.locator(`[data-contract="${side}"]`)).toBeEnabled();
});

test("disabled buttons are flat: no gold, no lip", async ({ page }) => {
  await openBoard(page);
  const style = await page.locator("#boardGo").evaluate((b) => { const s = getComputedStyle(b); return { bg: s.backgroundColor, shadow: s.boxShadow }; });
  expect(style.bg).not.toMatch(/242, 194, 48/); // the gold accent
  expect(style.shadow).not.toMatch(/0px 4px 0px/); // the lip
});

test("loans: 10% each, three at most, then he won't lend", async ({ page }) => {
  await openBoard(page);
  await expect(page.locator("#investorLine")).toContainText("no interest");
  await page.click('[data-loan="0"]');
  await expect(page.locator("#bizMoney")).toHaveText("$200");
  await expect(page.locator("#investorLine")).toContainText("You owe me $100, and I take 10% of every contract you finish until you're paid up.");
  await page.click('[data-loan="1"]');
  await expect(page.locator("#investorLine")).toContainText("20%");
  await page.click('[data-loan="0"]');
  await expect(page.locator("#investorLine")).toContainText("until you pay up, deadbeat!");
  await expect(page.locator("[data-loan]")).toHaveCount(2);
  for (const b of await page.locator("[data-loan]").all()) await expect(b).toBeDisabled();
  const [small] = await contracts(page).evaluateAll((els) => els.map((e) => e.dataset.contract));
  await page.click(`[data-contract="${small}"]`);
  await expect(page.locator("#forecast")).toContainText("To the lender (30%)");
});

test("recruit a cheap robot and train them in the same visit", async ({ page }) => {
  await openBoard(page);
  const id = await page.locator("[data-recruit]").first().getAttribute("data-recruit");
  await page.click(`[data-recruit="${id}"]`);
  await expect(page.locator("#recruits")).toContainText("Recruited");
  const train = page.locator(`[data-train^="${id}:"]`).first();
  await expect(train).toBeEnabled();
  const before = await page.evaluate(() => ct.biz.money);
  await train.click();
  expect(await page.evaluate(() => ct.biz.money)).toBe(before - 20);
});

test("a quarter: schedule the crew, a faked model gives instructions, robots ship, contracts pay", async ({ page }) => {
  const errors = await openBoard(page);
  const [small] = await contracts(page).evaluateAll((els) => els.map((e) => e.dataset.contract));
  await page.click(`[data-contract="${small}"]`);
  await page.click("#boardGo");
  await expect(page.locator("#goalLabel")).toHaveText("Contracts");
  await expect(page.locator("#levelName")).toContainText("Shift 1 of 3");
  await expect(page.locator("#crew")).toContainText("Schedule");
  await page.evaluate(() => {
    const programs = {
      blip: `while (needs("red") > 0) { move("SUPPLY"); pickUp("red"); move("PACK"); putDown(); }`,
      pip: `while (needsAny() > 0) { move("PACK"); if (count("PACK", "red") >= 3) pack("red"); if (boxes("PACK") > 0) { pickUpBox(); move("DOCK"); putDown(); } else wait(1); }`,
    };
    ct.useFakeLlm(async ({ system }) => {
      const id = /You are Blip/.test(system) ? "blip" : "pip";
      return { reply: "On it.", instructions: id === "blip" ? "carry reds to pack" : "pack and ship", problem: "", program: programs[id] };
    });
    ct.hire("blip"); ct.hire("pip");
  });
  await page.evaluate(() => Promise.all([ct.give("blip", "Carry red widgets from the supply to Pack."), ct.give("pip", "Pack red boxes and ship them from the dock.")]));
  await expect.poll(() => page.evaluate(() => ct.game.workers.every((w) => w.ast && !w.compiling))).toBe(true);
  const budget = await page.evaluate(() => ct.biz.money);
  await page.evaluate(() => { ct.begin(); for (let i = 0; i < 240; i++) ct.step(0.5); });
  await expect(page.locator("#endScreen")).toBeVisible();
  const shipped = await page.evaluate(() => ct.quarter.done[0]);
  expect(shipped).toBeGreaterThan(5);
  // Play out the rest of the quarter the same way, then back to the board.
  while (await page.locator('[data-go="next"]').count()) {
    await page.click('[data-go="next"]');
    await page.evaluate(() => { ct.begin(); for (let i = 0; i < 240; i++) ct.step(0.5); });
    await expect(page.locator("#endScreen")).toBeVisible();
  }
  const paid = await page.evaluate(() => ct.quarter.done[0] >= ct.game.order[0].count);
  await page.click('[data-go="board"]');
  await expect(page.locator("#boardTitle")).toHaveText("Quarter 2");
  const after = await page.evaluate(() => ct.biz);
  expect(after.quarters).toBe(1);
  expect(after.wins).toBe(paid ? 1 : 0);
  expect(after.money).toBeLessThan(budget + 1000);
  expect(errors).toEqual([]);
});

test("the end-of-quarter card: a missed contract pays nothing, the shipped one pays", async ({ page }) => {
  await openBoard(page);
  await page.click('[data-buy="paint"]');
  const [small, , side] = await contracts(page).evaluateAll((els) => els.map((e) => e.dataset.contract));
  await page.click(`[data-contract="${small}"]`);
  await page.click(`[data-contract="${side}"]`);
  await page.click("#boardGo");
  for (let shift = 1; shift <= 3; shift++) {
    await endShift(page, [999, 1]);
    if (shift < 3) await page.click('[data-go="next"]');
  }
  await expect(page.locator("#endTitle")).toHaveText("Quarter over");
  await expect(page.locator(".ct-end-contract.is-done")).toHaveCount(1);
  await expect(page.locator(".ct-end-contract.is-missed")).toHaveCount(1);
  const money = await page.evaluate(() => ct.biz.money);
  await page.click('[data-go="board"]');
  const small$ = await page.evaluate(() => ct.biz);
  expect(small$.wins).toBe(1);
  expect(small$.money).toBeGreaterThan(money);
});
