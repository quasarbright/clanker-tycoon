// Player-facing terms live in src/words.js only, so renaming one is one edit. This fails if a term
// is written out again somewhere else in the code, or a banned word ("hire") shows up in a string.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { WORDS, BANNED_WORDS } from "../src/words.js";

const SRC = new URL("../src/", import.meta.url);
const files = readdirSync(SRC).filter((f) => f.endsWith(".js") && f !== "words.js")
  .map((f) => [f, readFileSync(new URL(f, SRC), "utf8")]);
// String literals (quotes and template text), comments left out.
const strings = (code) => (code.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").match(/"[^"\n]*"|`[^`]*`/g) ?? [])
  // the text only: no ${…} code inside templates, no attribute names like data-hire
  .filter((t) => !/^["`][\w-]*["`]$/.test(t)) // one-word keys and event types ("hire" in the play log) aren't text
  .map((t) => t.replace(/\$\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, " ").replace(/\bdata-[\w-]+/g, " "));

test("each term in WORDS is written out only in words.js", () => {
  const terms = ["schedule", "offShift", "takeSomeoneOff", "recruited", "startQuarter", "toLender", "crewPay"].map((k) => WORDS[k]);
  for (const [f, code] of files) for (const s of strings(code)) for (const t of terms) {
    assert.ok(!s.includes(t), `${f} spells out "${t}" in ${s.slice(0, 80)}; use WORDS instead`);
  }
});

test("no hiring or firing words in the game's strings", () => {
  for (const [f, code] of [...files, ["levels.js", readFileSync(new URL("levels.js", SRC), "utf8")], ["index.html", readFileSync(new URL("../index.html", import.meta.url), "utf8").replace(/<!--[\s\S]*?-->|\/\*[\s\S]*?\*\//g, "")]]) {
    if (f === "brains.js") continue; // the robots' own prompts, never shown to the player
    for (const s of f === "index.html" ? [code.replace(/<[^>]+>/g, " ")] : strings(code)) {
      const m = s.match(BANNED_WORDS);
      assert.equal(m, null, `${f}: "${m?.[0]}" in ${s.slice(Math.max(0, (m?.index ?? 0) - 40), (m?.index ?? 0) + 40)}`);
    }
  }
});
