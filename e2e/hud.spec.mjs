// The shift header and the quick actions you get by hand (Mike, 2026-11-19: "not enough margin",
// and on the green level blue was the first paint suggestion).
import { test, expect } from "./fixtures.mjs";

test("the shift header has room: funds clear of the contracts row, nothing scrolls", async ({ page }) => {
  for (const size of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }]) {
    await page.setViewportSize(size);
    await page.goto("/");
    await page.evaluate(() => ct.license("Clank & Sons", "Mike"));
    await page.click('[data-level="7"]');
    const [small] = await page.locator("[data-contract]").evaluateAll((els) => els.map((e) => e.dataset.contract));
    await page.click(`[data-contract="${small}"]`);
    await page.click("#boardGo");
    await page.evaluate(() => document.fonts.ready);
    const gap = await page.evaluate(() => {
      const top = document.querySelector(".ct-top").getBoundingClientRect(), cash = document.querySelector(".ct-cash").getBoundingClientRect();
      const orders = document.querySelector(".ct-orders").getBoundingClientRect();
      return { above: cash.top - top.top, below: orders.top - cash.bottom, scrolls: document.documentElement.scrollHeight > innerHeight };
    });
    expect(gap.above, `${size.width}: space above the shift line`).toBeGreaterThanOrEqual(10);
    expect(gap.below, `${size.width}: space between funds and the contracts row`).toBeGreaterThanOrEqual(10);
    expect(gap.scrolls).toBe(false);
  }
});

test("painting by hand offers only the colors the order still needs", async ({ page }) => {
  await page.goto("/");
  // Level 5 wants green and red: no blue, the red widget's own color never.
  await page.click('[data-level="5"]');
  expect(await page.evaluate(() => ct.paintChoices("red"))).toEqual(["green"]);
  // Level 4 wants blue.
  await page.goto("/");
  await page.click('[data-level="4"]');
  expect(await page.evaluate(() => ct.paintChoices("red"))).toEqual(["blue"]);
  // Nothing painted left to ship: every other color, so you can still paint.
  await page.evaluate(() => { for (const l of ct.game.order) l.done = l.count; });
  expect(await page.evaluate(() => ct.paintChoices("red"))).toEqual(["blue", "green"]);
});

test("a crate is drawn as a crate: the X-braced case, no colored dots like a box", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => ct.license("Clank & Sons", "Mike"));
  await page.click('[data-level="7"]');
  await page.evaluate(() => { ct.biz.money = 900; ct.buy("assembler"); ct.renderBoard(); });
  const [small] = await page.locator("[data-contract]").evaluateAll((els) => els.map((e) => e.dataset.contract));
  await page.click(`[data-contract="${small}"]`);
  await page.click("#boardGo");
  await page.evaluate(() => { ct.begin(); const g = ct.game; g.stations.ASSEMBLE.push({ id: ++g.ids, kind: "crate" }); g.version++; ct.step(0.02); });
  const crate = page.locator('.ct-st[data-key="ASSEMBLE"] .ct-crate');
  await expect(crate).toHaveCount(1);
  await expect(crate.locator("svg")).toHaveCount(1);
  await expect(crate.locator("i")).toHaveCount(0);
  // Being assembled, it's the same drawing appearing, not a different crate (Mike: "we just agreed on the crate art").
  await page.evaluate(() => { const g = ct.game; g.stations.ASSEMBLE.push({ id: ++g.ids, kind: "crate", building: { start: g.t, until: g.t + 3 } }); g.version++; ct.step(0.02); });
  const svgs = await page.locator('.ct-st[data-key="ASSEMBLE"] .ct-crate').evaluateAll((els) => els.map((e) => [...e.querySelectorAll("svg")].map((s) => s.outerHTML)));
  expect(svgs).toHaveLength(2);
  expect(new Set(svgs.flat()).size).toBe(1);
  // Two boxes and two crates sit on one row in the Assembler (review desk).
  await page.evaluate(() => { const g = ct.game; for (const c of ["red", "blue"]) g.stations.ASSEMBLE.unshift({ id: ++g.ids, kind: "box", colors: [c, c, c] }); g.version++; ct.step(0.02); });
  const tops = await page.locator('.ct-st[data-key="ASSEMBLE"] .ct-st-items > *').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(tops).toHaveLength(4);
  expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(10);
});

test("a full Assembler keeps everything on one row inside its tile: six boxes, or three boxes and three crates", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => ct.license("Clank & Sons", "Mike"));
  await page.click('[data-level="7"]');
  await page.evaluate(() => { ct.biz.money = 900; ct.buy("assembler"); ct.renderBoard(); });
  const [small] = await page.locator("[data-contract]").evaluateAll((els) => els.map((e) => e.dataset.contract));
  await page.click(`[data-contract="${small}"]`);
  await page.click("#boardGo");
  await page.evaluate(() => ct.begin());
  const fill = (kinds) => page.evaluate((kinds) => {
    const g = ct.game;
    g.stations.ASSEMBLE = kinds.map((k, i) => k === "crate" ? { id: ++g.ids, kind: "crate" } : { id: ++g.ids, kind: "box", colors: Array(3).fill(["red", "blue", "green"][i % 3]) });
    g.version++; ct.step(0.02);
  }, kinds);
  for (const kinds of [["box", "box", "box", "box", "box", "box"], ["box", "box", "box", "crate", "crate", "crate"], ["box", "crate"]]) {
    await fill(kinds);
    const r = await page.locator('.ct-st[data-key="ASSEMBLE"]').evaluate((st) => {
      const box = st.getBoundingClientRect(), items = [...st.querySelectorAll(".ct-st-items > *")].map((e) => e.getBoundingClientRect());
      return { n: items.length, rows: new Set(items.map((i) => Math.round(i.top))).size, left: Math.min(...items.map((i) => i.left)) - box.left, right: box.right - Math.max(...items.map((i) => i.right)), zoom: st.querySelector(".ct-st-items").style.zoom };
    });
    expect(r.n).toBe(kinds.length);
    expect(r.rows).toBe(1);
    expect(r.left).toBeGreaterThanOrEqual(0);
    expect(r.right).toBeGreaterThanOrEqual(0);
    // Only a crowded Assembler shrinks; one box and one crate stay full size.
    expect(r.zoom === "").toBe(kinds.length === 2);
  }
});
