// Every spec imports test and expect from here instead of @playwright/test. Each browser context
// gets the outside-file routes from tools/playtest-browser.mjs: the real files when the network
// allows, local stand-ins when it doesn't (a cloud session), so the suite runs in both places.
import { test as base, expect } from "@playwright/test";
import { offlineRoutes } from "../tools/playtest-browser.mjs";

export const test = base.extend({
  context: async ({ context }, use) => {
    await offlineRoutes(context);
    await use(context);
  },
});
export { expect };
