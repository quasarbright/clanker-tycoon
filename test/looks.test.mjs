import { test } from "node:test";
import assert from "node:assert/strict";
import { ownerHeadSVG } from "../src/looks.js";

// You are drawn once (Mike, 2026-11-18): the floor and the newspaper photo share the same hard hat
// and face; the photo only adds the shocked look, the flash shadow and the shake lines.
test("the owner on the floor and in the paper is the same hard-hat head", () => {
  const floor = ownerHeadSVG(), paper = ownerHeadSVG({ shocked: true });
  const parts = (svg, cls) => svg.match(new RegExp(`<[^>]*class="${cls}"[^>]*>`, "g"));
  for (const cls of ["face", "chin", "dome", "seam", "shine", "band"]) assert.deepEqual(parts(floor, cls), parts(paper, cls), cls);
  assert.match(paper, /class="shadow"/); assert.match(paper, /class="shake"/); assert.match(paper, /class="mouth"/);
  assert.doesNotMatch(floor, /class="shadow"|class="shake"|class="mouth"/);
  assert.match(floor, /class="smile"/);
});
