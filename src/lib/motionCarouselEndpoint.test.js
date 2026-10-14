import assert from "node:assert/strict";
import test from "node:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { planCarousel } from "../../packages/studio/src/lib/motion/carousel/CarouselPlanner.js";
import {
  handleMotionCarouselPost,
  handleMotionCarouselGet,
  serveCarouselFile,
  carouselOutputDir,
} from "./motionCarouselEndpoint.js";

const ENV = { MAVEN_MOTION_OUTPUT_DIR: join(tmpdir(), "maven-motion-endpoint-test") };
const DECK = planCarousel({ brief: "make an animated carousel about MavenSync Spaces" }).deck;

function postRequest(body) {
  return new Request("https://example.test/api/motion-carousel", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function fakeRenderer({ configured = true } = {}) {
  return {
    isConfigured: () => configured,
    render: async () => ({
      ok: true,
      files: ["slide-01.mp4", "slide-02.mp4", "cover.png", "full-deck.mp4"],
      slideFiles: ["slide-01.mp4", "slide-02.mp4"],
      coverPath: "cover.png",
      pdfPath: null,
      fullDeckPath: "full-deck.mp4",
      tallPath: null,
      durationMs: 12,
    }),
    postprocess: async () => ({ outputs: ["/x/slide-01-2x3.mp4", "/x/slide-02-2x3.mp4"] }),
  };
}

test("plan action returns a deck, storyboard and preset", async () => {
  const response = await handleMotionCarouselPost(postRequest({ action: "plan", brief: "an animated carousel about cold brew", platform: "pinterest_pin" }), { identity: { identityKey: "creator-1" }, env: ENV });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.preset.id, "pinterest_pin");
  assert.ok(body.deck.slides.length >= 3);
  assert.ok(body.storyboard.slides.length === body.deck.slides.length);
});

test("unknown actions and missing decks are rejected", async () => {
  const unknown = await handleMotionCarouselPost(postRequest({ action: "explode" }), { identity: {}, env: ENV });
  assert.equal(unknown.status, 400);
  const noDeck = await handleMotionCarouselPost(postRequest({ action: "render" }), { identity: {}, env: ENV });
  assert.equal(noDeck.status, 400);
});

test("render refuses a deck that does not validate", async () => {
  const response = await handleMotionCarouselPost(postRequest({ action: "render", deck: { look: "solid", slides: [{ headline: "no visual", visual: { type: "hologram" } }] } }), { identity: {}, renderer: fakeRenderer(), env: ENV });
  assert.equal(response.status, 422);
  const body = await response.json();
  assert.equal(body.code, "deck_invalid");
});

test("render reports an unconfigured local renderer honestly", async () => {
  const response = await handleMotionCarouselPost(postRequest({ action: "render", deck: DECK }), { identity: {}, renderer: fakeRenderer({ configured: false }), env: ENV });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "renderer_not_configured");
});

test("render returns files, fingerprints and export urls", async () => {
  const response = await handleMotionCarouselPost(postRequest({ action: "render", deck: DECK, presetId: "pinterest_pin" }), { identity: { identityKey: "creator-1" }, renderer: fakeRenderer(), env: ENV });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.slideFiles.length, 2);
  assert.match(body.slideFiles[0], /^\/api\/motion-carousel\?file=/);
  assert.equal(body.exports.length, 2);
  assert.equal(body.fingerprints.length, DECK.slides.length);
});

test("download rejects traversal and unknown extensions", async () => {
  const traversal = await serveCarouselFile("../deck.json", { identityKey: "creator-1" }, ENV);
  assert.equal(traversal.status, 404);
  const badExt = await serveCarouselFile("secret.env", { identityKey: "creator-1" }, ENV);
  assert.equal(badExt.status, 404);
  const missing = await serveCarouselFile("slide-99.mp4", { identityKey: "creator-1" }, ENV);
  assert.equal(missing.status, 404);
});

test("GET without a file reports renderer status", async () => {
  const response = await handleMotionCarouselGet(new Request("https://example.test/api/motion-carousel"), { identity: {}, env: ENV });
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(typeof body.configured, "boolean");
});

test("the output directory is confined to a sanitized identity folder", () => {
  const dir = carouselOutputDir("../../evil/creator", ENV);
  assert.ok(dir.startsWith(ENV.MAVEN_MOTION_OUTPUT_DIR));
  assert.ok(!dir.includes(".."));
});
