import assert from "node:assert/strict";
import test from "node:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { planCarousel } from "../../packages/studio/src/lib/motion/carousel/CarouselPlanner.js";
import { presetStyleSheet } from "../../packages/studio/src/lib/motion/carousel/CarouselStyleSheet.js";
import { styleSheetFingerprint } from "./motionCarouselStyleSheet.js";
import { InMemoryMotionCarouselJobStore } from "./motionCarouselJobStore.js";
import {
  buildCarouselStoryboardReply,
  buildCarouselApprovedReply,
  buildCarouselCancellationReply,
  readPendingCarouselApproval,
  mavenCarouselApprovalInternals,
} from "./mavenCarouselApproval.js";
import { handleApprovedCarouselGet, handleMotionCarouselPost } from "./motionCarouselEndpoint.js";

const ENV = { MAVEN_MOTION_OUTPUT_DIR: join(tmpdir(), "maven-motion-sheet-approval-test") };
const IDENTITY = { accountId: "1", identityKey: "creator-1" };
const CONVERSATION = "conv-sheet-1";
const BRIEF = "make an animated carousel about MavenSync Spaces";
const SHEET = presetStyleSheet({ visualStyle: "minimal_luxe", brandName: "MavenSync", colors: ["#111111", "#f5f1ea"] });
const REVISED_SHEET = presetStyleSheet({ visualStyle: "minimal_luxe", brandName: "MavenSync", colors: ["#ff0000", "#0000ff"] });
const noWorker = () => null;

function storyboard(sheet, brief = BRIEF) {
  return buildCarouselStoryboardReply({
    identity: IDENTITY,
    conversationId: CONVERSATION,
    brief,
    plan: planCarousel({ brief }),
    sheet,
  }).reply;
}

function confirm(messages) {
  const pending = readPendingCarouselApproval(messages, { identity: IDENTITY, conversationId: CONVERSATION });
  assert.ok(pending, "a pending storyboard must exist before confirming");
  return buildCarouselApprovedReply({ pending, identity: IDENTITY, conversationId: CONVERSATION });
}

async function loadApproved(messages) {
  return handleApprovedCarouselGet({
    identity: IDENTITY,
    conversationId: CONVERSATION,
    deps: {
      services: {
        ownershipService: { verifyOwnedSession: async () => ({ ok: true }) },
        conversationReader: { read: async () => ({ messages }) },
      },
    },
  });
}

function render(deck) {
  const store = new InMemoryMotionCarouselJobStore();
  const request = new Request("https://example.test/api/motion-carousel", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "render", deck, presetId: "instagram_carousel", idempotencyKey: `k-${Math.random()}` }),
  });
  return handleMotionCarouselPost(request, { identity: IDENTITY, store, env: ENV, startWorker: noWorker });
}

/** Rewrites the approved marker's payload in the transcript, as an edit would. */
function tamperApprovedMarker(content, change) {
  const encoded = /maven-carousel-approved:([A-Za-z0-9_-]+)/.exec(content)[1];
  const payload = mavenCarouselApprovalInternals.decodeMarker(encoded);
  const next = mavenCarouselApprovalInternals.encodeMarker({ ...payload, ...change(payload) });
  return content.replace(encoded, next);
}

test("the storyboard shows the resolved style sheet before approval", () => {
  const reply = storyboard(SHEET);
  assert.match(reply, /Style sheet — approved with this storyboard/);
  assert.match(reply, /Colours: .*#111111/);
  assert.match(reply, /Headline type: /);
  assert.match(reply, /Nothing has rendered yet/);
});

test("a storyboard cannot be built without its style sheet", () => {
  assert.throws(() => buildCarouselStoryboardReply({ identity: IDENTITY, conversationId: CONVERSATION, brief: BRIEF, plan: planCarousel({ brief: BRIEF }) }), /style sheet/);
});

test("chat -> approval -> Motion Carousel -> render uses the approved sheet with no second approval", async () => {
  const messages = [{ role: "assistant", content: storyboard(SHEET) }];
  messages.push({ role: "user", content: "confirm" }, { role: "assistant", content: confirm(messages) });

  const response = await loadApproved(messages);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(styleSheetFingerprint(body.deck.styleSheet), styleSheetFingerprint(SHEET));
  assert.equal(body.deck.styleSheetApproval, styleSheetFingerprint(SHEET));

  const expectedHeadlines = planCarousel({ brief: BRIEF }).deck.slides.map((slide) => slide.headline);
  assert.deepEqual(body.deck.slides.map((slide) => slide.headline), expectedHeadlines);

  const rendered = await render(body.deck);
  assert.equal(rendered.status, 200);
  assert.equal((await rendered.json()).job.status, "queued");
});

test("no approval means nothing loads for Motion Carousel", async () => {
  const response = await loadApproved([{ role: "assistant", content: storyboard(SHEET) }]);
  assert.equal(response.status, 404);
});

test("a cancelled storyboard does not load", async () => {
  const messages = [
    { role: "assistant", content: storyboard(SHEET) },
    { role: "assistant", content: buildCarouselCancellationReply() },
  ];
  assert.equal((await loadApproved(messages)).status, 404);
});

test("an expired approval does not load", async () => {
  const messages = [{ role: "assistant", content: storyboard(SHEET) }];
  const pending = readPendingCarouselApproval(messages, { identity: IDENTITY, conversationId: CONVERSATION });
  const expired = buildCarouselApprovedReply({ pending: { ...pending, expiresAt: Date.now() - 1000 }, identity: IDENTITY, conversationId: CONVERSATION });
  assert.equal((await loadApproved([...messages, { role: "assistant", content: expired }])).status, 404);
});

test("an approval whose sheet was edited in the transcript does not load", async () => {
  const messages = [{ role: "assistant", content: storyboard(SHEET) }];
  const approved = confirm(messages);
  const tampered = tamperApprovedMarker(approved, (payload) => ({
    s: { ...payload.s, palette: [{ name: "Red", hex: "#ff0000" }, { name: "Blue", hex: "#0000ff" }] },
  }));
  assert.equal((await loadApproved([...messages, { role: "assistant", content: tampered }])).status, 404);
});

test("a pending storyboard whose sheet was edited is not confirmable", () => {
  const reply = storyboard(SHEET);
  const encoded = /maven-carousel-approval:([A-Za-z0-9_-]+)/.exec(reply)[1];
  const payload = mavenCarouselApprovalInternals.decodeMarker(encoded);
  const tampered = reply.replace(encoded, mavenCarouselApprovalInternals.encodeMarker({
    ...payload,
    s: { ...payload.s, palette: [{ name: "Red", hex: "#ff0000" }, { name: "Blue", hex: "#0000ff" }] },
  }));
  assert.equal(readPendingCarouselApproval([{ role: "assistant", content: tampered }], { identity: IDENTITY, conversationId: CONVERSATION }), null);
});

test("a sheet changed after approval needs approval again, and the old approval stops loading", async () => {
  const first = [{ role: "assistant", content: storyboard(SHEET) }];
  const approvedFirst = [...first, { role: "assistant", content: confirm(first) }];
  assert.equal((await loadApproved(approvedFirst)).status, 200);

  // A revised sheet is a new storyboard draft. It supersedes the earlier approval.
  const revised = [...approvedFirst, { role: "assistant", content: storyboard(REVISED_SHEET) }];
  assert.equal((await loadApproved(revised)).status, 404);

  // Only the changed version can be approved, and then it loads with its own fingerprint.
  const reapproved = [...revised, { role: "assistant", content: confirm(revised) }];
  const response = await loadApproved(reapproved);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.deck.styleSheetApproval, styleSheetFingerprint(REVISED_SHEET));
});

test("render refuses a deck whose sheet was edited after it was loaded", async () => {
  const messages = [{ role: "assistant", content: storyboard(SHEET) }];
  const body = await (await loadApproved([...messages, { role: "assistant", content: confirm(messages) }])).json();
  const edited = { ...body.deck, styleSheet: { ...body.deck.styleSheet, rules: ["Anything goes"] } };
  const response = await render(edited);
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "style_sheet_not_approved");
});

test("render refuses a deck carrying a different sheet's approval", async () => {
  const messages = [{ role: "assistant", content: storyboard(SHEET) }];
  const body = await (await loadApproved([...messages, { role: "assistant", content: confirm(messages) }])).json();
  const response = await render({ ...body.deck, styleSheetApproval: styleSheetFingerprint(REVISED_SHEET) });
  assert.equal(response.status, 409);
});

test("render refuses a deck with no sheet at all", async () => {
  const response = await render(planCarousel({ brief: BRIEF }).deck);
  assert.equal(response.status, 409);
});
