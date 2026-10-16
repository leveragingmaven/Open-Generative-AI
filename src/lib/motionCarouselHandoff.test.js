import assert from "node:assert/strict";
import test from "node:test";
import { planCarousel } from "../../packages/studio/src/lib/motion/carousel/CarouselPlanner.js";
import { presetStyleSheet } from "../../packages/studio/src/lib/motion/carousel/CarouselStyleSheet.js";
import { styleSheetFingerprint } from "./motionCarouselStyleSheet.js";
import {
  buildCarouselApprovedReply,
  buildCarouselCancellationReply,
} from "./mavenCarouselApproval.js";
import { handleApprovedCarouselGet } from "./motionCarouselEndpoint.js";

const BRIEF = "make an animated carousel about MavenSync Spaces";
const CONVERSATION = "conv-123";
const IDENTITY = { accountId: "1", identityKey: "creator-1" };
const FUTURE = Date.now() + 60 * 60 * 1000;
const SHEET = presetStyleSheet({ visualStyle: "minimal_luxe", brandName: "MavenSync", colors: ["#111111", "#f5f1ea"] });

function approvedMessages({ identity = IDENTITY, conversationId = CONVERSATION, expiresAt = FUTURE } = {}) {
  const reply = buildCarouselApprovedReply({
    pending: { brief: BRIEF, presetId: "instagram_carousel", brandId: "mavensync", expiresAt, sheet: SHEET, sheetFingerprint: styleSheetFingerprint(SHEET) },
    identity,
    conversationId,
  });
  return [
    { role: "user", content: "make an animated carousel about MavenSync Spaces" },
    { role: "assistant", content: reply },
  ];
}

function services({ messages, owned = true, attachments = [] } = {}) {
  return {
    ownershipService: {
      verifyOwnedSession: async () => {
        if (!owned) throw Object.assign(new Error("not owned"), { code: "session_not_owned" });
        return { ok: true };
      },
    },
    conversationReader: { read: async () => ({ messages, attachments }) },
  };
}

async function get(options) {
  return handleApprovedCarouselGet({
    identity: IDENTITY,
    conversationId: CONVERSATION,
    deps: { services: services(options) },
  });
}

test("the approved storyboard loads with the same headlines and order, without regeneration", async () => {
  const response = await get({ messages: approvedMessages() });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.action, "approved");
  assert.equal(body.conversationId, CONVERSATION);
  const expected = planCarousel({ brief: BRIEF, brand: "mavensync", platform: "instagram_carousel" }).deck.slides;
  assert.deepEqual(body.deck.slides.map((slide) => slide.headline), expected.map((slide) => slide.headline));
  assert.equal(body.deck.slides.length, expected.length);
});

test("a missing approval returns 404 and nothing to load", async () => {
  const response = await get({ messages: [{ role: "user", content: "hello" }] });
  assert.equal(response.status, 404);
  assert.equal((await response.json()).code, "approval_not_found");
});

test("an expired approval returns 404", async () => {
  const response = await get({ messages: approvedMessages({ expiresAt: Date.now() - 1000 }) });
  assert.equal(response.status, 404);
});

test("an approval for another account returns 404", async () => {
  const response = await get({ messages: approvedMessages({ identity: { accountId: "2", identityKey: "creator-1" } }) });
  assert.equal(response.status, 404);
});

test("an approval for another creator returns 404", async () => {
  const response = await get({ messages: approvedMessages({ identity: { accountId: "1", identityKey: "creator-2" } }) });
  assert.equal(response.status, 404);
});

test("an approval for another conversation returns 404", async () => {
  const response = await get({ messages: approvedMessages({ conversationId: "conv-other" }) });
  assert.equal(response.status, 404);
});

test("a cancellation after approval returns 404", async () => {
  const messages = [...approvedMessages(), { role: "assistant", content: buildCarouselCancellationReply() }];
  const response = await get({ messages });
  assert.equal(response.status, 404);
});

test("a conversation that is not owned by this caller returns 404", async () => {
  const response = await get({ messages: approvedMessages(), owned: false });
  assert.equal(response.status, 404);
});

test("the approved storyboard carries typed layer assets resolved from the conversation", async () => {
  const seen = [];
  const response = await handleApprovedCarouselGet({
    identity: IDENTITY,
    conversationId: CONVERSATION,
    deps: {
      services: services({ messages: approvedMessages(), attachments: [{ attachmentId: "asset_x", kind: "image", url: "https://cdn.muapi.ai/x.jpg" }] }),
      resolveConversationImageAssets: async (identity, attachments) => {
        seen.push({ identity, attachments });
        return { background: { storageReference: "storage://owned/bg" }, foreground: { storageReference: "storage://owned/fg" }, message: null };
      },
    },
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.assets.background.storageReference, "storage://owned/bg");
  assert.equal(body.assets.foreground.storageReference, "storage://owned/fg");
  assert.equal(seen.length, 1);
  assert.equal(seen[0].identity.accountId, "1");
  assert.equal(seen[0].attachments[0].attachmentId, "asset_x");
});

test("an asset-resolution failure never blanks the approved storyboard", async () => {
  const response = await handleApprovedCarouselGet({
    identity: IDENTITY,
    conversationId: CONVERSATION,
    deps: {
      services: services({ messages: approvedMessages() }),
      resolveConversationImageAssets: async () => { throw new Error("boom"); },
    },
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.assets, null);
});
