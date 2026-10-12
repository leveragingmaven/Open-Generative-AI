import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { PosterExtractionFailedError, PosterExtractionUnavailableError, extractPosterFrame, posterExtractionSupported } from "./videoPoster.js";

const MISSING_BINARY = "creator-os-no-such-decoder-binary";
const frame = () => sharp({ create: { width: 608, height: 1472, channels: 3, background: { r: 18, g: 42, b: 66 } } }).jpeg().toBuffer();

test("a decoded frame becomes a bounded WebP poster", async () => {
  const poster = await extractPosterFrame("/any/video.mp4", { decode: async () => frame() });
  const meta = await sharp(poster).metadata();
  assert.equal(meta.format, "webp");
  assert.equal(meta.width, 480);
  // A portrait clip keeps its shape: 608x1472 scaled to the poster width stays ~1162 tall.
  assert.ok(Math.abs(meta.height - 1162) <= 1, `unexpected poster height ${meta.height}`);
  assert.ok(poster.length < 1024 * 1024);
});

test("a decoder that is not installed is unavailable, not a failure", async () => {
  await assert.rejects(
    extractPosterFrame("/any/video.mp4", { extractor: MISSING_BINARY }),
    (error) => error instanceof PosterExtractionUnavailableError,
  );
  assert.equal(await posterExtractionSupported({ extractor: MISSING_BINARY }), false);
});

test("a seek past the end of a very short clip retries the first frame", async () => {
  const seeks = [];
  const poster = await extractPosterFrame("/short.mp4", {
    decode: async (_path, { atSeconds }) => {
      seeks.push(atSeconds);
      if (atSeconds > 0) throw new PosterExtractionFailedError("video_poster_frame_empty");
      return frame();
    },
  });
  assert.deepEqual(seeks, [1, 0]);
  assert.ok(poster.length > 0);
});

test("an unavailable decoder is never retried as a failed decode", async () => {
  let calls = 0;
  await assert.rejects(
    extractPosterFrame("/any/video.mp4", { decode: async () => { calls += 1; throw new PosterExtractionUnavailableError(); } }),
    (error) => error instanceof PosterExtractionUnavailableError,
  );
  assert.equal(calls, 1);
});
