// The web build's model access: an OpenRouter key from sign-in (OAuth PKCE), a pasted key, or
// ?api-key=, stored under the key all of Mike's sites share, and model calls going to OpenRouter.
// OpenRouter itself is faked with page.route; no real key or account is needed.
import { test, expect } from "./fixtures.mjs";

const KEY = "quasarbright:openrouter-key";
const WEB = "/?llm=openrouter";
const stored = (page) => page.evaluate((k) => localStorage.getItem(k), KEY);

test("with no key, the menu offers sign-in or a pasted key", async ({ page }) => {
  await page.goto(WEB);
  const access = page.locator("#access");
  await expect(access).toBeVisible();
  await expect(access.getByRole("button", { name: "Sign in with OpenRouter" })).toBeVisible();
  await expect(access.locator("openrouter-key input")).toBeVisible();
  await expect(page.locator("#backendNote")).toContainText("OpenRouter");
});

test("the local build doesn't show any of it", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#access")).toBeHidden();
});

test("sign in with OpenRouter: PKCE round trip, key saved, address bar cleaned", async ({ page }) => {
  let auth, exchange;
  await page.route("https://openrouter.ai/auth?**", async (route) => {
    auth = new URL(route.request().url());
    const back = new URL(auth.searchParams.get("callback_url"));
    back.searchParams.set("code", "test-code-123");
    await route.fulfill({ status: 302, headers: { location: back.toString() } });
  });
  await page.route("https://openrouter.ai/api/v1/auth/keys", async (route) => {
    exchange = route.request().postDataJSON();
    await route.fulfill({ json: { key: "sk-or-v1-signedin9876" } });
  });
  await page.goto(WEB);
  await page.getByRole("button", { name: "Sign in with OpenRouter" }).click();
  await expect(page.locator("#access")).toContainText("Connected to OpenRouter");
  await expect(page.locator("#access")).toContainText("key ending 9876");
  await expect(page.locator("#access")).toContainText("You're signed in");
  const icon = await page.locator("#access .ct-key-ok svg").boundingBox();
  expect(icon.width).toBeLessThan(30); // a check mark, not a giant one
  expect(await stored(page)).toBe("sk-or-v1-signedin9876");
  expect(auth.searchParams.get("code_challenge_method")).toBe("S256");
  expect(auth.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(exchange.code).toBe("test-code-123");
  expect(exchange.code_challenge_method).toBe("S256");
  expect(exchange.code_verifier).toMatch(/^[A-Za-z0-9_-]{43,}$/);
  expect(page.url()).not.toContain("code=");
  expect(page.url()).toContain("llm=openrouter");
});

test("a failed sign-in says why and leaves you able to try again", async ({ page }) => {
  await page.route("https://openrouter.ai/auth?**", async (route) => {
    const back = new URL(new URL(route.request().url()).searchParams.get("callback_url"));
    back.searchParams.set("code", "bad");
    await route.fulfill({ status: 302, headers: { location: back.toString() } });
  });
  await page.route("https://openrouter.ai/api/v1/auth/keys", (route) => route.fulfill({ status: 400, json: { error: { message: "Invalid code" } } }));
  await page.goto(WEB);
  await page.getByRole("button", { name: "Sign in with OpenRouter" }).click();
  await expect(page.locator("#access")).toContainText("Sign-in didn't work: Invalid code");
  await expect(page.getByRole("button", { name: "Sign in with OpenRouter" })).toBeVisible();
  expect(await stored(page)).toBeNull();
});

test("?api-key= is saved for every site and removed from the address bar", async ({ page }) => {
  await page.goto(`${WEB}&api-key=sk-or-v1-fromquery4321`);
  await expect(page.locator("#access")).toContainText("key ending 4321");
  expect(await stored(page)).toBe("sk-or-v1-fromquery4321");
  expect(page.url()).not.toContain("api-key");
});

test("a pasted key is saved, and Remove key forgets it", async ({ page }) => {
  await page.goto(WEB);
  const input = page.locator("#access openrouter-key input");
  await input.fill("sk-or-v1-pasted5555");
  await input.blur();
  await expect(page.locator("#access")).toContainText("key ending 5555");
  await page.getByRole("button", { name: "Remove key" }).click();
  await expect(page.getByRole("button", { name: "Sign in with OpenRouter" })).toBeVisible();
  expect(await stored(page)).toBeNull();
});

test("instructions go to Claude Haiku on OpenRouter with the stored key", async ({ page }) => {
  let sent;
  await page.route("https://openrouter.ai/api/v1/chat/completions", async (route) => {
    sent = { auth: route.request().headers().authorization, body: route.request().postDataJSON() };
    const program = `while (true) { move("SUPPLY"); pickUp("red"); move("PACK"); putDown(); }`;
    await route.fulfill({ json: { choices: [{ message: { content: JSON.stringify({ reply: "On it!", instructions: "carry reds", problem: "", program }) } }] } });
  });
  await page.goto(`${WEB}&api-key=sk-or-v1-runtest0000`);
  await page.evaluate(() => { ct.openLevel(3); ct.hire("blip"); });
  await page.evaluate(() => ct.give("blip", "Carry red widgets from the supply to Pack."));
  await expect.poll(() => page.evaluate(() => !!ct.game.workers[0].ast)).toBe(true);
  expect(sent.auth).toBe("Bearer sk-or-v1-runtest0000");
  expect(sent.body.model).toBe("anthropic/claude-haiku-5.5");
  expect(sent.body.response_format.type).toBe("json_schema");
});
