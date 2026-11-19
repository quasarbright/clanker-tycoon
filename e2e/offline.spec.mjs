// The stand-ins for the page's outside files (tools/playtest-browser.mjs): with the network cut
// off, as in a cloud session, the game still loads, parses programs with acorn and has the shared
// footer and OpenRouter key field from cohesion.js.
import { test, expect } from "@playwright/test";
import { offlineRoutes } from "../tools/playtest-browser.mjs";

test("with every outside file blocked, the stand-ins load the whole game", async ({ browser, baseURL }) => {
  const context = await browser.newContext();
  const outside = [];
  await context.route(/^https:\/\//, (r) => { outside.push(r.request().url()); return r.abort(); }); // the network, cut off
  await offlineRoutes(context, { offline: true }); // added later, so it's tried first
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${baseURL}/?llm=openrouter`);
  await expect(page.locator('[data-level="3"]')).toBeVisible();
  expect(await page.evaluate(async () => typeof (await import("acorn")).parse)).toBe("function");
  expect(await page.evaluate(() => !!customElements.get("openrouter-key"))).toBe(true);
  expect(outside).toEqual([]);
  expect(errors).toEqual([]);
  await context.close();
});
