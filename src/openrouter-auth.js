// Getting an OpenRouter key for the web build (decision #65). Three ways, all ending in the same
// browser storage key every quasarbright.github.io project uses (the shared cohesion.js reads and
// writes it too), so a key given to one of Mike's sites works on all of them:
//   ?api-key=sk-or-…   handled by cohesion.js on load: saved, then removed from the address bar
//   paste a key        the shared <openrouter-key> field
//   Sign in            OpenRouter's OAuth with PKCE (https://openrouter.ai/docs/use-cases/oauth-pkce):
//                      we send you to openrouter.ai/auth with a challenge; you come back with
//                      ?code=…; we trade the code and our secret verifier for a key.
// Nothing here touches a server of ours: the key stays in your browser.

export const KEY_STORAGE = "quasarbright:openrouter-key"; // same as sketches/shared/cohesion.js
const VERIFIER = "clanker-tycoon:oauth-verifier"; // sessionStorage, only for the round trip
const AUTH_URL = "https://openrouter.ai/auth";
const EXCHANGE_URL = "https://openrouter.ai/api/v1/auth/keys";

export const getKey = () => { try { return localStorage.getItem(KEY_STORAGE) || null; } catch { return null; } };
export function setKey(k) {
  try { if (k) localStorage.setItem(KEY_STORAGE, k.trim()); else localStorage.removeItem(KEY_STORAGE); } catch { /* storage blocked */ }
  // The shared <openrouter-key> field listens for this.
  document.dispatchEvent(new CustomEvent("openrouter-key-change", { detail: { key: getKey() } }));
}

/** base64url of bytes, no padding. */
export function base64url(bytes) {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
/** A random verifier (43+ characters, RFC 7636). */
export const newVerifier = () => base64url(crypto.getRandomValues(new Uint8Array(32)));
/** The S256 challenge for a verifier. */
export async function challengeFor(verifier) {
  return base64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
}

/** Where OpenRouter sends you back: this page, as it is, minus any old ?code. */
export function callbackUrl(href = location.href) {
  const u = new URL(href);
  u.searchParams.delete("code");
  u.hash = "";
  return u.toString();
}

/** Send the player to OpenRouter to sign in and approve a key for this site. */
export async function signIn() {
  const verifier = newVerifier();
  sessionStorage.setItem(VERIFIER, verifier);
  const u = new URL(AUTH_URL);
  u.searchParams.set("callback_url", callbackUrl());
  u.searchParams.set("code_challenge", await challengeFor(verifier));
  u.searchParams.set("code_challenge_method", "S256");
  location.assign(u.toString());
}

/**
 * Back from OpenRouter with ?code=…: trade it for a key, save the key, clean the address bar.
 * Resolves to "signed-in", "failed" (with `error`), or null when there's nothing to do.
 */
export async function finishSignIn() {
  const params = new URLSearchParams(location.search);
  const code = params.get("code");
  if (!code) return null;
  const verifier = sessionStorage.getItem(VERIFIER);
  params.delete("code");
  const qs = params.toString();
  history.replaceState(null, "", location.pathname + (qs ? `?${qs}` : "") + location.hash);
  if (!verifier) return { status: "failed", error: "The sign-in started in another tab or expired. Try again." };
  sessionStorage.removeItem(VERIFIER);
  try {
    const res = await fetch(EXCHANGE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: "S256" }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.key) return { status: "failed", error: j.error?.message || `OpenRouter said ${res.status}.` };
    setKey(j.key);
    return { status: "signed-in" };
  } catch (e) {
    return { status: "failed", error: `Couldn't reach OpenRouter (${e.message}).` };
  }
}
