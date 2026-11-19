// Open the game in a headless browser for an automated playtest or the e2e suite, including in
// places where the page's outside files can't be fetched (a cloud Claude session's network blocks
// cdn.jsdelivr.net, quasarbright.github.io and Google Fonts). Each outside file is fetched for real
// first; only if that fails does a local copy stand in: acorn from node_modules, the shared
// cohesion.js/.css from tools/vendor (a snapshot of sketches/shared, see tools/vendor/README.md),
// and an empty stylesheet for fonts (system fonts take over). What the live page loads is unchanged.
//
//   import { openGame } from "./tools/playtest-browser.mjs";
//   const { browser, page } = await openGame("http://localhost:8473/");
//
// The e2e suite applies the same routes through e2e/fixtures.mjs. Pair a playtest with the file
// bridge (LLM_BRIDGE=logs/bridge node server.mjs) for real model replies; see docs/cloud-playtest.md.
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const here = (p) => fileURLToPath(new URL(p, import.meta.url));

/** The page's outside files, and what stands in for each when it can't be fetched. */
export const STAND_INS = [
  { url: "https://cdn.jsdelivr.net/npm/acorn@*/dist/acorn.mjs", file: here("../node_modules/acorn/dist/acorn.mjs"), type: "text/javascript" },
  { url: "https://quasarbright.github.io/sketches/shared/cohesion.js", file: here("vendor/cohesion.js"), type: "text/javascript" },
  { url: "https://quasarbright.github.io/sketches/shared/cohesion.css", file: here("vendor/cohesion.css"), type: "text/css" },
  // The stylesheet can be reachable while the font files aren't (as in a cloud session), so it
  // only counts as fetched when its first font file is too; otherwise system fonts take over.
  { url: /fonts\.googleapis\.com/, body: "", type: "text/css", needs: (css) => css.match(/url\((https:[^)]+)\)/)?.[1] },
];

/**
 * Route a Playwright page or context's outside files: the real one when it can be fetched, the
 * stand-in when it can't. `offline: true` skips the network (tests of the stand-ins use it).
 * Once one fetch fails, the rest skip the network too, so a blocked network costs one failure.
 */
export async function offlineRoutes(target, { offline = false } = {}) {
  let blocked = offline;
  for (const s of STAND_INS) {
    await target.route(s.url, async (route) => {
      if (!blocked) {
        try {
          const response = await route.fetch({ timeout: 8000 });
          if (!response.ok()) throw new Error(`${response.status()}`);
          const needed = s.needs?.(await response.text());
          if (needed && !(await target.request.get(needed, { timeout: 8000 })).ok()) throw new Error("font files blocked");
          return await route.fulfill({ response });
        } catch { blocked = true; }
      }
      const body = s.file ? await readFile(s.file, "utf8") : s.body;
      await route.fulfill({ contentType: s.type, body, headers: { "access-control-allow-origin": "*" } });
    });
  }
}

/** Launch Chromium and open the game, ready to play. */
export async function openGame(url = "http://localhost:8473/", { viewport = { width: 1440, height: 900 }, headless = true } = {}) {
  const { chromium } = require("playwright");
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  await offlineRoutes(context);
  const page = await context.newPage();
  await page.goto(url);
  return { browser, context, page };
}
