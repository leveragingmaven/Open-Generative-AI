import assert from "node:assert/strict";
import test from "node:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { planCarousel } from "../../packages/studio/src/lib/motion/carousel/CarouselPlanner.js";
import { InMemoryMotionCarouselJobStore } from "./motionCarouselJobStore.js";
import {
  handleMotionCarouselPost,
  handleMotionCarouselGet,
  serveCarouselFile,
  carouselOutputDir,
} from "./motionCarouselEndpoint.js";

const ENV = { MAVEN_MOTION_OUTPUT_DIR: join(tmpdir(), "maven-motion-endpoint-test") };
const DECK = planCarousel({ brief: "make an animated carousel about MavenSync Spaces" }).deck;
const IDENTITY = { accountId: "1", identityKey: "creator-1" };

// Never start a real (MySQL-backed) worker in tests.
const noWorker = () => null;

function post(body, { store = new InMemoryMotionCarouselJobStore(), identity = IDENTITY } = {}) {
  const request = new Request("https://example.test/api/motion-carousel", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return handleMotionCarouselPost(request, { identity, store, env: ENV, startWorker: noWorker });
}

test("plan action returns a deck, storyboard and preset", async () => {
  const response = await post({ action: "plan", brief: "an animated carousel about cold brew", platform: "pinterest_pin" });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.preset.id, "pinterest_pin");
  assert.ok(body.deck.slides.length >= 3);
});

test("render enqueues a background job instead of rendering inline", async () => {
  const store = new InMemoryMotionCarouselJobStore();
  const response = await post({ action: "render", deck: DECK, presetId: "pinterest_pin", idempotencyKey: "k1" }, { store });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.action, "render");
  assert.equal(body.job.status, "queued");
  assert.equal(body.job.presetId, "pinterest_pin");
  assert.equal(body.deduped, false);
  assert.equal((await store.list({ accountId: "1" })).length, 1);
});

test("render is deduped on the idempotency key", async () => {
  const store = new InMemoryMotionCarouselJobStore();
  const first = await (await post({ action: "render", deck: DECK, idempotencyKey: "same" }, { store })).json();
  const second = await (await post({ action: "render", deck: DECK, idempotencyKey: "same" }, { store })).json();
  assert.equal(first.job.jobId, second.job.jobId);
  assert.equal(second.deduped, true);
});

test("render rejects an invalid deck and an unauthenticated caller", async () => {
  const invalid = await post({ action: "render", deck: { look: "solid", slides: [{ headline: "no visual", visual: { type: "hologram" } }] } });
  assert.equal(invalid.status, 422);
  assert.equal((await invalid.json()).code, "deck_invalid");
  const anonymous = await post({ action: "render", deck: DECK }, { identity: {} });
  assert.equal(anonymous.status, 401);
});

test("unknown actions are rejected", async () => {
  assert.equal((await post({ action: "explode" })).status, 400);
});

test("job status is served by id and scoped to the owner", async () => {
  const store = new InMemoryMotionCarouselJobStore();
  const { job } = await (await post({ action: "render", deck: DECK }, { store })).json();
  const mine = await handleMotionCarouselGet(new Request(`https://example.test/api/motion-carousel?jobId=${job.jobId}`), { identity: IDENTITY, store, env: ENV });
  assert.equal((await mine.json()).job.jobId, job.jobId);
  const other = await handleMotionCarouselGet(new Request(`https://example.test/api/motion-carousel?jobId=${job.jobId}`), { identity: { accountId: "2", identityKey: "creator-2" }, store, env: ENV });
  assert.equal(other.status, 404);
});

test("cancel and retry actions drive the job lifecycle", async () => {
  const store = new InMemoryMotionCarouselJobStore();
  const { job } = await (await post({ action: "render", deck: DECK }, { store })).json();
  const canceled = await (await post({ action: "cancel", jobId: job.jobId }, { store })).json();
  assert.equal(canceled.job.status, "canceled");
  // A failed job can be retried.
  const store2 = new InMemoryMotionCarouselJobStore();
  const first = await (await post({ action: "render", deck: DECK }, { store: store2 })).json();
  const claimed = await store2.claimNext();
  await store2.fail(claimed.id, { error: { code: "render_failed", message: "boom" } });
  const retried = await (await post({ action: "retry", jobId: first.job.jobId }, { store: store2 })).json();
  assert.equal(retried.job.status, "queued");
});

test("GET without a file reports renderer status", async () => {
  const response = await handleMotionCarouselGet(new Request("https://example.test/api/motion-carousel"), { identity: IDENTITY, store: new InMemoryMotionCarouselJobStore(), env: ENV });
  const body = await response.json();
  assert.equal(body.ok, true);
  // The MavenSync native renderer is the default and needs no operator path, so a
  // deployment with nothing configured still reports itself as render-capable.
  assert.equal(body.configured, true);
  assert.equal(body.renderer.mode, "native");
  assert.equal(body.renderer.id, "mavensync-native");
  assert.equal(typeof body.runtime, "string");
});

test("the third-party engine is only selected when it is explicitly asked for", async () => {
  const native = await (await handleMotionCarouselGet(new Request("https://example.test/api/motion-carousel"), { identity: IDENTITY, store: new InMemoryMotionCarouselJobStore(), env: ENV })).json();
  assert.equal(native.renderer.mode, "native");

  // Asking for the engine without a path must NOT enable it: native stays.
  const askedWithoutPath = await (await handleMotionCarouselGet(new Request("https://example.test/api/motion-carousel"), {
    identity: IDENTITY, store: new InMemoryMotionCarouselJobStore(), env: { ...ENV, MAVEN_MOTION_RENDERER: "engine" },
  })).json();
  assert.equal(askedWithoutPath.renderer.mode, "native");

  // With a path it is selected, and reports itself as the isolated engine.
  const engine = await (await handleMotionCarouselGet(new Request("https://example.test/api/motion-carousel"), {
    identity: IDENTITY, store: new InMemoryMotionCarouselJobStore(),
    env: { ...ENV, MAVEN_MOTION_RENDERER: "engine", MAVEN_MOTION_ENGINE: "/opt/carousel.py" },
  })).json();
  assert.equal(engine.renderer.mode, "engine");
});

test("download rejects traversal and unknown extensions", async () => {
  assert.equal((await serveCarouselFile("../deck.json", IDENTITY, ENV)).status, 404);
  assert.equal((await serveCarouselFile("secret.env", IDENTITY, ENV)).status, 404);
  assert.equal((await serveCarouselFile("slide-99.mp4", IDENTITY, ENV)).status, 404);
});

test("the output directory is confined to a sanitized identity folder", () => {
  const dir = carouselOutputDir("../../evil/creator", ENV);
  assert.ok(dir.startsWith(ENV.MAVEN_MOTION_OUTPUT_DIR));
  assert.ok(!dir.includes(".."));
});
