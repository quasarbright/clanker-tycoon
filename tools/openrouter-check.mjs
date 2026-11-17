// A live check of the web build's model path: real calls to Claude Haiku through OpenRouter, from a
// real browser, the way a player on GitHub Pages would make them. Costs about a cent.
//   node tools/openrouter-check.mjs        (needs `node server.mjs` running on 8473)
// The key comes from .env (OPENROUTER_API_KEY=…, gitignored) and goes straight into the test
// browser's storage. It is never printed or logged.
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const env = Object.fromEntries(readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")
  .map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]));
const KEY = env.OPENROUTER_API_KEY;
if (!KEY) { console.error("No OPENROUTER_API_KEY in .env"); process.exit(1); }
const BASE = process.argv[2] || "http://localhost:8473";
const redact = (s) => String(s).split(KEY).join("sk-or-…(redacted)");

const browser = await chromium.launch({ args: ["--mute-audio"] });
const page = await browser.newPage();
await page.addInitScript((k) => localStorage.setItem("quasarbright:openrouter-key", k), KEY);
const calls = [];
page.on("response", async (r) => {
  if (!r.url().startsWith("https://openrouter.ai/api/v1/chat/completions")) return;
  const j = await r.json().catch(() => null);
  calls.push({ status: r.status(), usage: j?.usage, model: j?.model, error: j?.error?.message });
});
const errors = [];
page.on("pageerror", (e) => errors.push(redact(e.message)));
await page.goto(`${BASE}/?llm=openrouter&source=check`);
const t0 = Date.now();
await page.evaluate(() => { ct.openLevel(3); ct.hire("blip"); ct.hire("pip"); });
await page.evaluate(() => Promise.all([
  ct.give("blip", "Carry red widgets from the supply to Pack, over and over."),
  ct.give("pip", "Pack red boxes at Pack and ship them from the dock."),
]));
const workers = await page.evaluate(() => ct.game.workers.map((w) => ({ id: w.id, ok: !!w.ast, problem: w.compileError ?? null, said: (w.log ?? []).filter((l) => l.who === "them").map((l) => l.text).slice(-1)[0] })));
console.log(`compiled in ${((Date.now() - t0) / 1000).toFixed(1)}s:`, JSON.stringify(workers, null, 1));
if (workers.every((w) => w.ok)) {
  await page.evaluate(() => { ct.begin(); for (let i = 0; i < 90; i++) ct.step(0.5); });
  console.log("level 3 after 45 s:", await page.evaluate(() => ct.game.order.map((l) => `${l.done}/${l.count}`).join(", ")), await page.evaluate(() => ct.phase));
}
const cost = calls.reduce((a, c) => a + (c.usage?.cost ?? 0), 0);
console.log(`${calls.length} OpenRouter calls, statuses ${[...new Set(calls.map((c) => c.status))]}, models ${[...new Set(calls.map((c) => c.model))]}, cost $${cost.toFixed(5)}`);
for (const c of calls.filter((c) => c.error)) console.log("error:", redact(c.error));
if (errors.length) console.log("page errors:", errors);
await browser.close();
process.exit(workers.every((w) => w.ok) && !errors.length ? 0 : 1);
