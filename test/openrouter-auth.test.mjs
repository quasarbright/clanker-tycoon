// OpenRouter sign-in helpers (src/openrouter-auth.js): PKCE and the callback address.
import "./setup.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";

globalThis.document ??= { dispatchEvent() {} };
globalThis.CustomEvent ??= class { constructor(t, o) { this.type = t; this.detail = o?.detail; } };
const A = await import("../src/openrouter-auth.js");

test("the storage key is the one every quasarbright.github.io site shares", () => {
  assert.equal(A.KEY_STORAGE, "quasarbright:openrouter-key");
});

test("S256 challenge matches RFC 7636's worked example", async () => {
  assert.equal(await A.challengeFor("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
});

test("verifiers are long, url-safe and fresh each time", () => {
  const a = A.newVerifier(), b = A.newVerifier();
  assert.match(a, /^[A-Za-z0-9_-]{43,128}$/);
  assert.notEqual(a, b);
});

test("the callback is this page without an old code or hash", () => {
  assert.equal(A.callbackUrl("https://quasarbright.github.io/clanker-tycoon/?llm=openrouter&code=old#x"), "https://quasarbright.github.io/clanker-tycoon/?llm=openrouter");
  assert.equal(A.callbackUrl("https://quasarbright.github.io/clanker-tycoon/"), "https://quasarbright.github.io/clanker-tycoon/");
});
