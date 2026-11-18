import { test } from "node:test";
import assert from "node:assert/strict";
import { ownerHeadSVG, ownerHatSVG, OWNER_PHOTOS, ownerPhoto } from "../src/looks.js";

// Mike, 2026-11-18: on the floor only the hat comes from the newspaper photo; your face there stays a
// robot's face ("keep the eyes the same as the robots"). The hat is one set of shapes for both.
test("the floor's hat is the photo's hat, with no face of its own", () => {
  const hat = ownerHatSVG(), paper = ownerHeadSVG();
  const parts = (svg, cls) => svg.match(new RegExp(`<[^>]*class="${cls}"[^>]*>`, "g"));
  for (const cls of ["dome", "seam", "shine", "band"]) assert.deepEqual(parts(hat, cls), parts(paper, cls), cls);
  assert.doesNotMatch(hat, /class="(face|eye|pupil|mouth)"/);
  for (const cls of ["shadow", "face", "eye", "mouth", "shake"]) assert.match(paper, new RegExp(`class="${cls}"`));
});

test("four newspaper photos: same head, hat and shadow, a different face each, Mike's picks only", () => {
  assert.deepEqual(OWNER_PHOTOS.map((p) => p.face), ["shocked", "awkward", "bite", "blushing"]);
  const shared = (svg) => svg.match(/<(circle|path|rect|ellipse)[^>]*class="(face|chin|dome|seam|shine|band)"[^>]*>/g).join("");
  const svgs = OWNER_PHOTOS.map((p) => ownerHeadSVG(p.face));
  for (const s of svgs) { assert.equal(shared(s), shared(svgs[0])); assert.match(s, /class="shadow"/); assert.match(s, /class="eye"/); }
  assert.equal(new Set(svgs).size, 4);
  assert.equal(ownerPhoto(1), ownerPhoto(5));
  assert.equal(OWNER_PHOTOS[0].caption("X"), "The owner of X, moments after hearing the news.");
  for (const p of OWNER_PHOTOS.slice(1)) assert.equal(p.caption("X"), "The owner of X, reached for comment.");
});
