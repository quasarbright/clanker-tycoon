// The floor editor's rules (decision 85): slots, swapping, storage, and what Start places for you.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as F from "../src/floor.js";

test("a new floor (decision 88): Supply by the dock, Pack across the floor, the bins on the left", () => {
  const f = F.newFloor();
  assert.deepEqual(f.at, { SUPPLY: 5, PACK: 3, BIN_1: 0, BIN_2: 6 });
  assert.deepEqual(f.storage, []);
  assert.equal(F.inSlot(f, 3), "PACK");
  assert.equal(F.inSlot(f, 1), null);
});

test("moving to an open slot; dropping on a taken slot swaps the two", () => {
  const f = F.newFloor();
  assert.deepEqual(F.place(f, "PACK", 1), { key: "PACK", to: 1, swapped: null, otherTo: null });
  assert.equal(f.at.PACK, 1);
  const r = F.place(f, "PACK", 6); // Bin 2 is there
  assert.deepEqual(r, { key: "PACK", to: 6, swapped: "BIN_2", otherTo: 1 });
  assert.equal(f.at.BIN_2, 1, "Bin 2 goes where Pack came from");
  assert.equal(F.place(f, "PACK", 6), null, "dropping where it already is does nothing");
  assert.equal(F.place(f, "PACK", 99), null);
});

test("Supply moves and swaps like a machine, but never goes in storage (decision 88)", () => {
  const f = F.newFloor();
  assert.deepEqual(F.place(f, "SUPPLY", 3), { key: "SUPPLY", to: 3, swapped: "PACK", otherTo: 5 }, "the swap that fixes the starting floor");
  assert.equal(F.store(f, "SUPPLY"), false);
  F.addToStorage(f, "ASSEMBLE");
  assert.equal(F.place(f, "ASSEMBLE", 3), null, "from storage onto Supply would put Supply in storage");
  assert.equal(f.at.SUPPLY, 3);
  assert.deepEqual(f.storage, ["ASSEMBLE"]);
});

test("from storage onto a taken slot: the other machine goes to storage", () => {
  const f = F.newFloor();
  F.addToStorage(f, "ASSEMBLE");
  F.place(f, "ASSEMBLE", 0);
  assert.equal(f.at.ASSEMBLE, 0);
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
  assert.deepEqual(F.positionsOf(f).SUPPLY, F.SLOTS[5]);
  assert.deepEqual(F.positionsOf(f).DOCK, F.ANCHORS.DOCK);
});

test("slots don't overlap: tiles plus the ring robots stand in", () => {
  const all = [...F.SLOTS, F.ANCHORS.DOCK];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const a = all[i], b = all[j];
    // A tile is 16 × 11; two tiles side by side need a gap a robot fits through.
    assert.ok(Math.abs(a.x - b.x) >= 18 || Math.abs(a.y - b.y) >= 19, `${JSON.stringify(a)} and ${JSON.stringify(b)} overlap`);
  }
});
