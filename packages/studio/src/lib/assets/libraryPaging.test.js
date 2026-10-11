import assert from "node:assert/strict";
import test from "node:test";
import { CREATIVE_LIBRARY_PAGE_SIZE, libraryPageRemaining, libraryPageWindow } from "./libraryPaging.js";

const library = (count) => Array.from({ length: count }, (_, index) => ({
  id: `asset_${String(index).padStart(2, "0")}`,
  createdAt: `2026-10-${String(28 - index).padStart(2, "0")}`,
}));

test("the first page shows twelve assets and every later page only adds twelve more", () => {
  const assets = library(33);
  assert.equal(CREATIVE_LIBRARY_PAGE_SIZE, 12);
  assert.equal(libraryPageWindow(assets).length, 12);
  assert.equal(libraryPageWindow(assets, CREATIVE_LIBRARY_PAGE_SIZE * 2).length, 24);
  assert.equal(libraryPageWindow(assets, CREATIVE_LIBRARY_PAGE_SIZE * 3).length, 33);
  assert.equal(libraryPageWindow(assets, CREATIVE_LIBRARY_PAGE_SIZE * 9).length, 33);
});

test("a later batch only appends: order is kept, nothing is duplicated, nothing is skipped", () => {
  const assets = library(33);
  const first = libraryPageWindow(assets, CREATIVE_LIBRARY_PAGE_SIZE);
  const second = libraryPageWindow(assets, CREATIVE_LIBRARY_PAGE_SIZE * 2);
  assert.deepEqual(second.slice(0, first.length), first);
  assert.equal(new Set(second.map((asset) => asset.id)).size, second.length);
  assert.deepEqual(second.map((asset) => asset.id), assets.slice(0, 24).map((asset) => asset.id));
});

test("remaining reports what Load More still reveals", () => {
  const assets = library(33);
  assert.equal(libraryPageRemaining(assets), 21);
  assert.equal(libraryPageRemaining(assets, 24), 9);
  assert.equal(libraryPageRemaining(assets, 48), 0);
  assert.equal(libraryPageRemaining(library(4), 4), 0);
});

test("a filtered view pages identically to the unfiltered one", () => {
  const filtered = library(20);
  assert.equal(libraryPageWindow(filtered, CREATIVE_LIBRARY_PAGE_SIZE).length, 12);
  assert.equal(libraryPageRemaining(filtered, CREATIVE_LIBRARY_PAGE_SIZE), 8);
  assert.deepEqual(libraryPageWindow(filtered, CREATIVE_LIBRARY_PAGE_SIZE).map((asset) => asset.id), library(20).slice(0, 12).map((asset) => asset.id));
});

test("degenerate input still yields the first page", () => {
  assert.deepEqual(libraryPageWindow(null), []);
  assert.deepEqual(libraryPageWindow(undefined), []);
  assert.equal(libraryPageWindow(library(3), Number.NaN).length, 3);
  assert.equal(libraryPageWindow(library(3), 0).length, 3);
  assert.equal(libraryPageRemaining(library(3), -5), 0);
  assert.equal(libraryPageRemaining(null), 0);
});
