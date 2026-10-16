import test from "node:test";
import assert from "node:assert/strict";
import { transferredLayerAssets, carouselRenderDeck } from "./CarouselLayerAssets.js";

test("transferred owned assets fill the background and foreground layer references", () => {
  const { layerAssets, notice } = transferredLayerAssets({
    background: { storageReference: "storage://owned/bg" },
    foreground: { storageReference: "storage://owned/fg" },
    message: null,
  });
  assert.deepEqual(layerAssets, { background: "storage://owned/bg", foreground: "storage://owned/fg" });
  assert.equal(notice, null);
});

test("a layer the customer already chose manually is never replaced by a late transfer", () => {
  const { layerAssets } = transferredLayerAssets(
    { background: { storageReference: "storage://owned/bg" }, foreground: { storageReference: "storage://owned/fg" } },
    { current: { background: "storage://manual/bg", foreground: null } },
  );
  assert.equal(layerAssets.background, "storage://manual/bg");
  assert.equal(layerAssets.foreground, "storage://owned/fg");
});

test("no transferred assets keep the layers empty", () => {
  const { layerAssets, notice } = transferredLayerAssets(undefined);
  assert.deepEqual(layerAssets, { background: null, foreground: null });
  assert.equal(notice, null);
});

test("a transfer notice tells the customer to choose when Maven could not", () => {
  const { layerAssets, notice } = transferredLayerAssets({
    background: { storageReference: "storage://owned/bg" },
    foreground: null,
    message: "More than one image was attached, so choose the foreground below.",
  });
  assert.deepEqual(layerAssets, { background: "storage://owned/bg", foreground: null });
  assert.match(notice, /choose the foreground/);
});

test("a malformed reference is ignored rather than loaded as a layer", () => {
  const { layerAssets } = transferredLayerAssets({ background: { storageReference: 7 }, foreground: { storageReference: "" } });
  assert.deepEqual(layerAssets, { background: null, foreground: null });
});

test("the Continuous Layers render payload carries the transferred background and foreground references", () => {
  const deck = carouselRenderDeck(
    { slides: [{ headline: "H" }] },
    { sceneMode: "layers", layerAssets: { background: "storage://owned/bg", foreground: "storage://owned/fg" }, soundtrack: "storage://owned/track" },
  );
  assert.equal(deck.sceneMode, "layers");
  assert.deepEqual(deck.layers, { background: "storage://owned/bg", foreground: "storage://owned/fg" });
  assert.equal(deck.audio, "storage://owned/track");
  assert.deepEqual(deck.slides, [{ headline: "H" }]);
});

test("a scene mode other than layers never puts layer references on the render payload", () => {
  const deck = carouselRenderDeck(
    { slides: [] },
    { sceneMode: "continuous", layerAssets: { background: "storage://owned/bg", foreground: "storage://owned/fg" }, soundtrack: "storage://owned/track" },
  );
  assert.equal(deck.sceneMode, "continuous");
  assert.equal(deck.layers, undefined);
  assert.equal(deck.audio, undefined);
});

test("empty layer choices render as null layers rather than leaking an undefined payload", () => {
  const deck = carouselRenderDeck({ slides: [] }, { sceneMode: "layers", layerAssets: {}, soundtrack: null });
  assert.deepEqual(deck.layers, { background: null, foreground: null });
  assert.equal(deck.audio, null);
});
