import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { planCarousel } from "../../packages/studio/src/lib/motion/carousel/CarouselPlanner.js";
import { presetStyleSheet } from "../../packages/studio/src/lib/motion/carousel/CarouselStyleSheet.js";
import { attachApprovedStyleSheet, styleSheetFingerprint } from "./motionCarouselStyleSheet.js";
import { InMemoryMotionCarouselJobStore } from "./motionCarouselJobStore.js";
import { handleMotionCarouselGet, handleMotionCarouselPost } from "./motionCarouselEndpoint.js";
import { buildCarouselRenderStatusReply } from "./designAgentConversationEndpoint.js";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const ENV = { MAVEN_MOTION_OUTPUT_DIR: "/tmp/maven-motion-chat-tracking-test" };
const SHEET = presetStyleSheet({ visualStyle: "minimal_luxe", brandName: "MavenSync", colors: ["#111111", "#f5f1ea"] });
const DECK = attachApprovedStyleSheet(
  planCarousel({ brief: "make an animated carousel about MavenSync Spaces" }).deck,
  SHEET,
  styleSheetFingerprint(SHEET),
);
const OWNER = { accountId: "1", identityKey: "creator-1" };
const OTHER = { accountId: "2", identityKey: "creator-2" };
const noWorker = () => null;

async function render(store) {
  const request = new Request("https://example.test/api/motion-carousel", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "render", deck: DECK }),
  });
  const body = await (await handleMotionCarouselPost(request, { identity: OWNER, store, env: ENV, startWorker: noWorker })).json();
  return body.job;
}

function post(store, identity, body) {
  const request = new Request("https://example.test/api/motion-carousel", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return handleMotionCarouselPost(request, { identity, store, env: ENV, startWorker: noWorker });
}

function getStatus(store, identity, jobId) {
  return handleMotionCarouselGet(new Request(`https://example.test/api/motion-carousel?jobId=${jobId}`), { identity, store, env: ENV });
}

test("the chat card reads the job id from the completed-render link", () => {
  const source = read("packages/studio/src/components/experience/MavenHomeDashboard.jsx");
  assert.match(source, /function extractCarouselJobId\(content\)/);
  const reply = buildCarouselRenderStatusReply({
    job: { jobId: "mcar-abc-123", status: "completed", progress: 100, result: { storage: { files: [{ name: "full-deck.mp4", kind: "deck" }] } } },
  });
  const match = reply.match(/jobId=(mcar-[A-Za-z0-9-]+)/);
  assert.equal(match?.[1], "mcar-abc-123");
});

test("status updates while rendering and reports completion through the owner's status route", async () => {
  const store = new InMemoryMotionCarouselJobStore();
  const job = await render(store);
  const running = await (await getStatus(store, OWNER, job.jobId)).json();
  assert.equal(running.job.status, "queued");
  await store.claimNext();
  const claimed = await (await getStatus(store, OWNER, job.jobId)).json();
  assert.equal(claimed.job.status, "running");
});

test("a failed render can be retried in chat, and the retry requeues the same job", async () => {
  const store = new InMemoryMotionCarouselJobStore();
  const job = await render(store);
  const claimed = await store.claimNext();
  await store.fail(claimed.id, { error: { code: "render_failed", message: "boom" } });
  const failed = await (await getStatus(store, OWNER, job.jobId)).json();
  assert.equal(failed.job.status, "failed");
  const retried = await (await post(store, OWNER, { action: "retry", jobId: job.jobId })).json();
  assert.equal(retried.job.jobId, job.jobId);
  assert.equal(retried.job.status, "queued");
});

test("a second retry of a requeued job is refused, so duplicate clicks cannot queue twice", async () => {
  const store = new InMemoryMotionCarouselJobStore();
  const job = await render(store);
  const claimed = await store.claimNext();
  await store.fail(claimed.id, { error: { code: "render_failed", message: "boom" } });
  assert.equal((await post(store, OWNER, { action: "retry", jobId: job.jobId })).status, 200);
  const again = await post(store, OWNER, { action: "retry", jobId: job.jobId });
  assert.equal(again.status, 409);
});

test("cancel moves a queued render to canceled, which the card treats as terminal", async () => {
  const store = new InMemoryMotionCarouselJobStore();
  const job = await render(store);
  const canceled = await (await post(store, OWNER, { action: "cancel", jobId: job.jobId })).json();
  assert.equal(canceled.job.status, "canceled");
});

test("another account cannot read, cancel or retry a render it does not own", async () => {
  const store = new InMemoryMotionCarouselJobStore();
  const job = await render(store);
  assert.equal((await getStatus(store, OTHER, job.jobId)).status, 404);
  assert.equal((await post(store, OTHER, { action: "cancel", jobId: job.jobId })).status, 404);
  const claimed = await store.claimNext();
  await store.fail(claimed.id, { error: { code: "render_failed", message: "boom" } });
  assert.equal((await post(store, OTHER, { action: "retry", jobId: job.jobId })).status, 404);
});

test("the card polls only until a terminal state, stops on unmount, and guards duplicate retries", () => {
  const source = read("packages/studio/src/components/experience/MavenHomeDashboard.jsx");
  assert.match(source, /CAROUSEL_TERMINAL = new Set\(\["completed", "failed", "canceled"\]\)/);
  assert.match(source, /if \(!CAROUSEL_TERMINAL\.has\(data\.job\.status\)\) timer = window\.setTimeout/);
  assert.match(source, /window\.clearTimeout\(timer\);\s*controller\?\.abort\(\);/);
  assert.match(source, /if \(retryingRef\.current\) return;/);
  assert.match(source, /setPollRound\(\(round\) => round \+ 1\)/);
});
