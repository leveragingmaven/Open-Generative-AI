import assert from "node:assert/strict";
import test from "node:test";
import { planCarousel } from "../../packages/studio/src/lib/motion/carousel/CarouselPlanner.js";
import { presetStyleSheet } from "../../packages/studio/src/lib/motion/carousel/CarouselStyleSheet.js";
import { styleSheetFingerprint } from "./motionCarouselStyleSheet.js";
import { InMemoryMotionCarouselJobStore } from "./motionCarouselJobStore.js";
import { enqueueMotionCarouselRender } from "./motionCarouselJobService.js";
import { startApprovedCarouselRender, buildCarouselRenderStatusReply } from "./designAgentConversationEndpoint.js";

const BRIEF = "make an animated carousel about MavenSync Spaces";
const SHEET = presetStyleSheet({ visualStyle: "minimal_luxe", brandName: "MavenSync", colors: ["#111111", "#f5f1ea"] });
const APPROVAL = {
  brief: BRIEF,
  presetId: "instagram_carousel",
  brandId: "mavensync",
  expiresAt: Date.now() + 60_000,
  sheet: SHEET,
  sheetFingerprint: styleSheetFingerprint(SHEET),
  sceneMode: "standard",
};
const CONVERSATION = "conv-chat-render-1";

function withAllowlist(email, fn) {
  const previous = process.env.MAVEN_MOTION_OWNER_ALLOWLIST;
  process.env.MAVEN_MOTION_OWNER_ALLOWLIST = email;
  return Promise.resolve().then(fn).finally(() => {
    if (previous === undefined) delete process.env.MAVEN_MOTION_OWNER_ALLOWLIST;
    else process.env.MAVEN_MOTION_OWNER_ALLOWLIST = previous;
  });
}

test("an approved storyboard starts one render, and a repeated message returns that same job", async () => {
  await withAllowlist("owner@example.test", async () => {
    const store = new InMemoryMotionCarouselJobStore();
    const identity = { accountId: "1", identityKey: "creator-1", email: "owner@example.test" };
    const deps = {
      enqueueCarouselRender: (args) => enqueueMotionCarouselRender({ store, env: {}, ...args }),
    };
    const first = await startApprovedCarouselRender({ approval: APPROVAL, identity, conversationId: CONVERSATION, deps });
    const second = await startApprovedCarouselRender({ approval: APPROVAL, identity, conversationId: CONVERSATION, deps });
    assert.match(first, /Carousel render started/);
    assert.match(second, /already started/);
    assert.equal((await store.list({ accountId: "1", limit: 10 })).length, 1, "a repeat must not queue a second render");
  });
});

test("an account outside the owner allowlist gets the Motion Design handoff and no job", async () => {
  await withAllowlist("owner@example.test", async () => {
    const store = new InMemoryMotionCarouselJobStore();
    const identity = { accountId: "2", identityKey: "creator-2", email: "other@example.test" };
    const deps = { enqueueCarouselRender: () => { throw new Error("must not enqueue"); } };
    const reply = await startApprovedCarouselRender({ approval: APPROVAL, identity, conversationId: CONVERSATION, deps });
    assert.match(reply, /Motion Design → Carousel/);
    assert.equal((await store.list({ accountId: "2", limit: 10 })).length, 0);
  });
});

test("the deck the chat render starts from is the planned deck with its approved style sheet attached", async () => {
  await withAllowlist("owner@example.test", async () => {
    const identity = { accountId: "1", identityKey: "creator-1", email: "owner@example.test" };
    let captured = null;
    const deps = { enqueueCarouselRender: async (args) => { captured = args; return { job: { jobId: "j", status: "queued", progress: 0 }, deduped: false }; } };
    await startApprovedCarouselRender({ approval: APPROVAL, identity, conversationId: CONVERSATION, deps });
    assert.ok(captured.deck.styleSheet, "the approved sheet must travel on the deck");
    assert.equal(captured.deck.slides.length, planCarousel({ brief: BRIEF }).deck.slides.length);
    assert.equal(captured.presetId, "instagram_carousel");
  });
});

const DECK_FILE = { name: "full-deck.mp4", kind: "deck", contentType: "video/mp4" };

test("a running render reports its status and no download link", () => {
  const reply = buildCarouselRenderStatusReply({ job: { jobId: "mcar-9", status: "running", progress: 40 } });
  assert.match(reply, /Status: running \(40%\)/);
  assert.doesNotMatch(reply, /Download/);
});

test("a completed render links the full-deck MP4 through the owner-scoped file route", () => {
  const reply = buildCarouselRenderStatusReply({
    job: { jobId: "mcar-9", status: "completed", progress: 100, result: { storage: { files: [DECK_FILE] } } },
  });
  assert.match(reply, /\[Download the full-deck MP4\]\(\/api\/motion-carousel\?file=full-deck\.mp4&jobId=mcar-9\)/);
});

test("a failed render says so and offers no download", () => {
  const reply = buildCarouselRenderStatusReply({ job: { jobId: "mcar-9", status: "failed", progress: 30 } });
  assert.match(reply, /render failed/);
  assert.doesNotMatch(reply, /Download/);
});

test("a completed render without a stored deck file does not invent a link", () => {
  const reply = buildCarouselRenderStatusReply({ job: { jobId: "mcar-9", status: "completed", progress: 100, result: null } });
  assert.doesNotMatch(reply, /\]\(/);
  assert.match(reply, /Motion Design/);
});
