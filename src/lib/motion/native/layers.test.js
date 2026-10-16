import { test } from "node:test";
import assert from "node:assert/strict";
import { normaliseLayers, layerStateAt, composeLayerFrame, LayerSpecError } from "./layers.js";

import { createRasterizer, imageDataUri, sharp } from "./raster.js";

const W = 200;
const H = 200;

test("normaliseLayers rejects empty lists, unknown types and bad timing", () => {
  assert.throws(() => normaliseLayers([]), { code: "no_layers" });
  assert.throws(() => normaliseLayers([{ id: "a", type: "video", duration: 1 }]), { code: "unsupported_type" });
  assert.throws(() => normaliseLayers([{ id: "a", type: "text", content: "Hi", duration: 0 }]), { code: "invalid_field" });
  assert.throws(
    () => normaliseLayers([{ id: "a", type: "text", content: "Hi", duration: 1, enter: { seconds: 0.8 }, exit: { seconds: 0.8 } }]),
    { code: "timing_overlap" },
  );
  assert.throws(() => normaliseLayers([{ id: "a", type: "text", content: "Hi", duration: 1 }, { id: "a", type: "text", content: "Ho", duration: 1 }]), { code: "duplicate_id" });
});

test("image layers must embed an image data URI, not a path", () => {
  assert.throws(
    () => normaliseLayers([{ id: "bg", type: "image", src: "../secret.png", width: 10, height: 10, duration: 1 }]),
    (error) => error instanceof LayerSpecError && error.code === "missing_image",
  );
});

test("each layer has an independent start and duration", () => {
  const [a, b] = normaliseLayers(
    [
      { id: "a", type: "text", content: "A", start: 0, duration: 2, x: 100, y: 100 },
      { id: "b", type: "text", content: "B", start: 1, duration: 3, x: 100, y: 100 },
    ],
    { width: W, height: H },
  );
  assert.equal(layerStateAt(a, -0.1), null);
  assert.ok(layerStateAt(a, 1.5));
  assert.equal(layerStateAt(a, 2), null, "a ends at its own duration, not the canvas length");
  assert.equal(layerStateAt(b, 0.5), null, "b has not started yet");
  assert.ok(layerStateAt(b, 3.5));
});

test("entrance slides in from its offset and settles at the layer position", () => {
  const [layer] = normaliseLayers(
    [{ id: "t", type: "text", content: "Hi", start: 0, duration: 4, x: 100, y: 100, enter: { seconds: 1, dx: -80 } }],
    { width: W, height: H },
  );
  assert.equal(layerStateAt(layer, 0).dx, -80);
  assert.equal(layerStateAt(layer, 0).opacity, 0);
  assert.equal(layerStateAt(layer, 1).dx, 0);
  assert.equal(layerStateAt(layer, 1).opacity, 1);
});

test("exit fades out before the layer ends", () => {
  const [layer] = normaliseLayers(
    [{ id: "t", type: "text", content: "Hi", start: 0, duration: 4, x: 100, y: 100, exit: { seconds: 1, dy: 40 } }],
    { width: W, height: H },
  );
  assert.equal(layerStateAt(layer, 3).opacity, 1);
  assert.ok(layerStateAt(layer, 3.99).opacity < 0.05);
  assert.equal(layerStateAt(layer, 3.5).dy > 0, true);
});

test("composeLayerFrame emits only layers on screen at that time", () => {
  const layers = normaliseLayers(
    [
      { id: "early", type: "text", content: "Early", start: 0, duration: 1, x: 50, y: 50 },
      { id: "late", type: "text", content: "Late", start: 2, duration: 1, x: 50, y: 150 },
    ],
    { width: W, height: H },
  );
  const frame = composeLayerFrame({ width: W, height: H, layers, t: 0.5 });
  assert.match(frame, /Early/);
  assert.doesNotMatch(frame, /Late/);
});

test("text content is XML-escaped in the frame", () => {
  const layers = normaliseLayers([{ id: "t", type: "text", content: "A & <B>", start: 0, duration: 1, x: 10, y: 10 }], { width: W, height: H });
  const frame = composeLayerFrame({ width: W, height: H, layers, t: 0.2 });
  assert.match(frame, /A &amp; &lt;B&gt;/);
  assert.doesNotMatch(frame, /<B>/);
});

test("a transparent PNG overlay keeps its alpha over an opaque background", async () => {
  // Opaque red background, plus a 40x40 green square whose surround is fully transparent.
  const background = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 200, g: 0, b: 0, alpha: 1 } } }).png().toBuffer();
  const overlayPng = await sharp({
    create: { width: 40, height: 40, channels: 4, background: { r: 0, g: 255, b: 0, alpha: 1 } },
  }).png().toBuffer();
  const layers = normaliseLayers(
    [
      { id: "bg", type: "image", src: await imageDataUri(background), width: W, height: H, start: 0, duration: 1, x: W / 2, y: H / 2, fit: "slice" },
      { id: "badge", type: "image", src: await imageDataUri(overlayPng), width: 40, height: 40, start: 0, duration: 1, x: 100, y: 100 },
    ],
    { width: W, height: H },
  );
  const svg = composeLayerFrame({ width: W, height: H, layers, t: 0.5 });
  const raster = createRasterizer({ width: W, height: H });
  const rgba = await raster.frameRaw(svg);
  const at = (x, y) => {
    const i = (y * W + x) * 4;
    return [rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]];
  };
  assert.deepEqual(at(100, 100).slice(0, 3).map((v) => v > 200), [false, true, false], "overlay centre is green");
  assert.ok(at(10, 10)[0] > 150 && at(10, 10)[3] === 255, "background shows through where the overlay is transparent");
});

test("path keyframes move a layer on the master timeline and hold at both ends", () => {
  const [layer] = normaliseLayers([
    { id: "badge", type: "shape", shape: "circle", radius: 10, x: 100, y: 100, start: 0, duration: 30,
      path: [{ t: 18, dx: 0, dy: 0 }, { t: 21, dx: -170, dy: 70 }, { t: 24, dx: -60, dy: -40 }] },
  ], { width: W, height: H });
  assert.equal(layerStateAt(layer, 17).dx, 0, "before the first keyframe the layer holds the first offset");
  assert.equal(layerStateAt(layer, 21).dx, -170, "at a keyframe the offset is exact");
  assert.equal(layerStateAt(layer, 21).dy, 70);
  assert.equal(layerStateAt(layer, 25).dx, -60, "after the last keyframe the layer holds the last offset");
  const mid = layerStateAt(layer, 19.5).dx;
  assert.ok(mid < 0 && mid > -170, "between keyframes the offset eases between the two values");
});

test("layers without a path have no keyframe offset, and bad paths are rejected", () => {
  const [plain] = normaliseLayers([{ id: "a", type: "shape", shape: "line", x: 1, y: 1, start: 0, duration: 2 }], { width: W, height: H });
  assert.equal(layerStateAt(plain, 1).dx, 0);
  assert.throws(() => normaliseLayers([{ id: "a", type: "shape", shape: "line", duration: 2, path: [] }]), { code: "invalid_path" });
  assert.throws(() => normaliseLayers([{ id: "a", type: "shape", shape: "line", duration: 2, path: [{ t: 3 }, { t: 2 }] }]), { code: "invalid_path" });
});
