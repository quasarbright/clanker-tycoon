// The floor editor's rules (decision 85): slots, swapping, storage, and what Start places for you.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as F from "../src/floor.js";

test("a new floor has Pack and both bins placed, nothing in storage", () => {
  const f = F.newFloor();
  assert.deepEqual(f.at, { PACK: 2, BIN_1: 3, BIN_2: 4 });
  assert.deepEqual(f.storage, []);
  assert.equal(F.inSlot(f, 2), "PACK");
  assert.equal(F.inSlot(f, 0), null);
});

test("moving to an open slot; dropping on a taken slot swaps the two", () => {
  const f = F.newFloor();
  assert.deepEqual(F.place(f, "PACK", 0), { key: "PACK", to: 0, swapped: null, otherTo: null });
  assert.equal(f.at.PACK, 0);
  const r = F.place(f, "PACK", 4); // Bin 2 is there
  assert.deepEqual(r, { key: "PACK", to: 4, swapped: "BIN_2", otherTo: 0 });
  assert.equal(f.at.BIN_2, 0, "Bin 2 goes where Pack came from");
  assert.equal(F.place(f, "PACK", 4), null, "dropping where it already is does nothing");
  assert.equal(F.place(f, "PACK", 99), null);
});

test("from storage onto a taken slot: the other machine goes to storage", () => {
  const f = F.newFloor();
  F.addToStorage(f, "ASSEMBLE");
  F.place(f, "ASSEMBLE", 3);
  assert.equal(f.at.ASSEMBLE, 3);
  assert.deepEqual(f.storage, ["BIN_1"]);
  assert.equal(f.at.BIN_1, undefined);
});

test("bought machines are new until placed or kept in storage; Start places only the new ones", () => {
  const f = F.newFloor();
  F.addToStorage(f, "PAINT");
  F.addToStorage(f, "ASSEMBLE");
  assert.deepEqual(f.fresh, ["PAINT", "ASSEMBLE"]);
  F.place(f, "PAINT", 1);
  assert.deepEqual(f.fresh, ["ASSEMBLE"], "placing it is noticing it");
  F.keepInStorage(f);
  assert.deepEqual(f.fresh, []);
  assert.deepEqual(F.placeLeftovers(f), [], "kept in storage stays there");
  assert.deepEqual(f.storage, ["ASSEMBLE"]);
  F.addToStorage(f, "PAINT_2");
  const moved = F.placeLeftovers(f);
  assert.deepEqual(moved, ["PAINT_2"]);
  assert.equal(f.at.PAINT_2, F.nearestFree({ at: { ...f.at, PAINT_2: undefined }, storage: [] }) ?? f.at.PAINT_2);
  assert.ok(F.SLOTS[f.at.PAINT_2], "in a real slot");
});

test("storing a placed machine takes it off the floor", () => {
  const f = F.newFloor();
  assert.ok(F.store(f, "BIN_2"));
  assert.deepEqual(f.storage, ["BIN_2"]);
  assert.equal(F.store(f, "BIN_2"), false);
  assert.ok(!("BIN_2" in F.positionsOf(f)));
  assert.deepEqual(F.positionsOf(f).SUPPLY, F.ANCHORS.SUPPLY);
});

test("slots don't overlap: tiles plus the ring robots stand in", () => {
  const all = [...F.SLOTS, F.ANCHORS.SUPPLY, F.ANCHORS.DOCK];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const a = all[i], b = all[j];
    // A tile is 16 × 11; two tiles side by side need a gap a robot fits through.
    assert.ok(Math.abs(a.x - b.x) >= 18 || Math.abs(a.y - b.y) >= 19, `${JSON.stringify(a)} and ${JSON.stringify(b)} overlap`);
  }
});
