import { test } from "node:test";
import assert from "node:assert/strict";
import { ownerHeadSVG, ownerHatSVG } from "../src/looks.js";

// Mike, 2026-11-18: on the floor only the hat comes from the newspaper photo; your face there stays a
// robot's face ("keep the eyes the same as the robots"). The hat is one set of shapes for both.
test("the floor's hat is the photo's hat, with no face of its own", () => {
  const hat = ownerHatSVG(), paper = ownerHeadSVG();
  const parts = (svg, cls) => svg.match(new RegExp(`<[^>]*class="${cls}"[^>]*>`, "g"));
  for (const cls of ["dome", "seam", "shine", "band"]) assert.deepEqual(parts(hat, cls), parts(paper, cls), cls);
  assert.doesNotMatch(hat, /class="(face|eye|pupil|mouth)"/);
  for (const cls of ["shadow", "face", "eye", "mouth", "shake"]) assert.match(paper, new RegExp(`class="${cls}"`));
});
