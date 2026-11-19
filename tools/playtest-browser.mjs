// Open the game in a headless browser for an automated playtest, in places where the page's few
// outside files can't be fetched (a cloud Claude session's network blocks cdn.jsdelivr.net and
// quasarbright.github.io). acorn comes from node_modules; the shared footer (cohesion.js/.css) is
// left out, since nothing in the game needs it; Google Fonts fall back to the system fonts.
//
//   import { openGame } from "./tools/playtest-browser.mjs";
//   const { browser, page } = await openGame("http://localhost:8473/");
//
// Pair it with the file bridge (LLM_BRIDGE=logs/bridge node server.mjs) for real model replies.
// See docs/cloud-playtest.md.
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ACORN = fileURLToPath(new URL("../node_modules/acorn/dist/acorn.mjs", import.meta.url));

/** Point a Playwright page or context at local copies of the game's outside files. */
export async function offlineRoutes(target) {
  const acorn = await readFile(ACORN, "utf8");
  await target.route("https://cdn.jsdelivr.net/npm/acorn@*/dist/acorn.mjs", (r) => r.fulfill({ contentType: "text/javascript", body: acorn }));
  await target.route("https://quasarbright.github.io/sketches/shared/cohesion.js", (r) => r.fulfill({ contentType: "text/javascript", body: "export {};" }));
  await target.route("https://quasarbright.github.io/sketches/shared/cohesion.css", (r) => r.fulfill({ contentType: "text/css", body: "" }));
  await target.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ contentType: "text/css", body: "" }));
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
