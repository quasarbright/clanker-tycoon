// The floor editor (decision 85): before a shift you arrange your business's floor. Bought
// machines wait in storage and Edit floor pulses until you place them or keep them there (Mike).
import { test, expect } from "@playwright/test";

async function toPlan(page, { buy = [] } = {}) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto("/");
  await page.evaluate(() => ct.license("Clank & Sons", "Mike"));
  await page.click('[data-level="7"]');
  await page.evaluate((buy) => { ct.biz.money = 900; for (const id of buy) ct.buy(id); ct.renderBoard(); }, buy);
  const [small] = await page.locator("[data-contract]").evaluateAll((els) => els.map((e) => e.dataset.contract));
  await page.click(`[data-contract="${small}"]`);
  await page.click("#boardGo");
  await expect(page.locator("#goBtn")).toBeVisible();
  return errors;
}
const center = async (loc) => { const r = await loc.boundingBox(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
async function dragTo(page, from, to) {
  const a = await center(from), b = await center(to);
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();
}

test("a bought machine waits in storage: Edit floor pulses with a count, and Keep in storage stops it", async ({ page }) => {
  const errors = await toPlan(page, { buy: ["paint"] });
  await expect(page.locator("#editFloorBtn")).toHaveClass(/is-new/);
  await expect(page.locator("#storageBadge")).toHaveText("1");
  await expect(page.locator("#newNote")).toContainText("New in storage: Paint");
  await page.click("#keepStored");
  await expect(page.locator("#editFloorBtn")).not.toHaveClass(/is-new/);
  await expect(page.locator("#storageBadge")).toHaveText("1", { timeout: 1000 }); // still in storage
  await expect(page.locator("#newNote")).toBeHidden();
  // Start leaves what you kept in storage where it is.
  await page.evaluate(() => ct.begin());
  expect(await page.evaluate(() => ct.level.stations.includes("PAINT"))).toBe(false);
  expect(errors).toEqual([]);
});

test("Start places a new machine you didn't place in the nearest free slot", async ({ page }) => {
  await toPlan(page, { buy: ["paint"] });
  await page.evaluate(() => ct.begin());
  expect(await page.evaluate(() => ct.level.stations.includes("PAINT"))).toBe(true);
  expect(await page.evaluate(() => ct.biz.floor.storage)).toEqual([]);
  await expect(page.locator('.ct-st[data-key="PAINT"]')).toBeVisible();
});

test("drag from storage to a slot, drag onto a taken slot to swap, Done keeps the crew and their instructions", async ({ page }) => {
  const errors = await toPlan(page, { buy: ["paint"] });
  await page.evaluate(() => {
    ct.useFakeLlm(async () => ({ reply: "On it.", instructions: "carry reds", problem: "", program: 'while (needsAny() > 0) { move("SUPPLY"); pickUp("red"); move("PACK"); putDown(); }' }));
    ct.hire("blip");
  });
  await page.evaluate(() => ct.give("blip", "Carry red widgets to Pack."));
  await expect.poll(() => page.evaluate(() => ct.game.workers.every((w) => w.ast && !w.compiling))).toBe(true);
  await page.click("#editFloorBtn");
  await expect(page.locator("body")).toHaveClass(/is-editing/);
  await expect(page.locator("#goBtn")).toBeHidden();
  await expect(page.locator(".ct-slot")).toHaveCount(8);
  await expect(page.locator(".ct-stored")).toContainText("Paint");
  await expect(page.locator(".ct-stored")).toContainText("New");
  // Storage → slot 1.
  await dragTo(page, page.locator('.ct-stored[data-move="PAINT"]'), page.locator('[data-slot="1"]'));
  expect(await page.evaluate(() => ct.biz.floor.at.PAINT)).toBe(1);
  await expect(page.locator(".ct-storage-empty")).toBeVisible();
  // Pack (slot 2) onto Bin 2 (slot 4): the two swap, with the swap shown while dragging.
  const pack = page.locator('.ct-st[data-move="PACK"]');
  const a = await center(pack), b = await center(page.locator('[data-slot="4"]'));
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await expect(page.locator('[data-slot="4"]')).toHaveClass(/is-swap/);
  await expect(page.locator('[data-slot="4"] .ct-slot-tag')).toHaveText("Swap with Bin 2");
  await expect(page.locator('[data-slot="2"]')).toHaveText("Bin 2 goes here");
  await page.mouse.up();
  expect(await page.evaluate(() => ({ ...ct.biz.floor.at }))).toEqual({ PACK: 4, BIN_1: 3, BIN_2: 2, PAINT: 1 });
  // A machine dropped in storage leaves the floor.
  await dragTo(page, page.locator('.ct-st[data-move="BIN_1"]'), page.locator("#storage"));
  expect(await page.evaluate(() => ct.biz.floor.storage)).toEqual(["BIN_1"]);
  // Bolted down: Supply and the dock can't be picked up.
  await expect(page.locator('.ct-st.is-anchor[data-key="SUPPLY"]')).not.toHaveAttribute("data-move", /./);
  await page.click("#doneEditBtn");
  await expect(page.locator("body")).not.toHaveClass(/is-editing/);
  const L = await page.evaluate(() => ({ stations: ct.level.stations, pack: ct.level.positions.PACK }));
  expect(L.stations).toEqual(["SUPPLY", "BIN_2", "PACK", "PAINT", "DOCK"]);
  expect(L.pack).toEqual({ x: 52, y: 37 });
  // Same crew, same instructions, on the new floor.
  expect(await page.evaluate(() => ct.game.workers.map((w) => [w.id, !!w.ast, w.orders]))).toEqual([["blip", true, "carry reds"]]);
  const [px, py] = await page.evaluate(() => { const el = document.querySelector('.ct-st[data-key="PACK"]'); return [el.style.left, el.style.top]; });
  expect([px, py]).toEqual(["52%", `${(37 / 64) * 100}%`]);
  expect(errors).toEqual([]);
});

test("the editor is only before a shift: no Edit floor once it runs, nor on the tutorial levels", async ({ page }) => {
  await toPlan(page);
  await expect(page.locator("#editFloorBtn")).toBeVisible();
  await page.evaluate(() => ct.begin());
  await expect(page.locator("#editFloorBtn")).toBeHidden();
  await page.goto("/");
  await page.click('[data-level="5"]');
  await expect(page.locator("#goBtn")).toBeVisible();
  await expect(page.locator("#floorEdit")).toBeHidden();
});

test("the assembler: bought, placed, a crates contract on the board, and Assembly to train", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => ct.license("Clank & Sons", "Mike"));
  await page.click('[data-level="7"]');
  await page.evaluate(() => { ct.biz.money = 900; ct.buy("assembler"); ct.buy("paint"); ct.renderBoard(); });
  await expect(page.locator("#offers")).toContainText("Crates");
  await expect(page.locator("#offers")).toContainText("Each crate is a red, a blue and a green box.");
  await page.locator('[data-train-open="pip"]').click();
  await expect(page.locator(".ct-train-menu")).toContainText("Assembly");
});
