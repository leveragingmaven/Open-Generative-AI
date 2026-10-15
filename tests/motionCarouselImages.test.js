import test from 'node:test';
import assert from 'node:assert/strict';
import { planCarousel } from '../packages/studio/src/lib/motion/carousel/CarouselPlanner.js';
import {
  applyLayoutChoices,
  buildLayoutMessages,
  deterministicLayoutChoices,
  parseLayoutReply,
} from '../packages/studio/src/lib/motion/carousel/CarouselAiLayout.js';
import { isSafeImageReference } from '../packages/studio/src/lib/motion/carousel/CarouselDeck.js';
import {
  CarouselImageError,
  loadCarouselImages,
  materializeCarouselImages,
  matchesImageSignature,
  ownedCarouselImageKey,
  planCarouselWithImages,
} from '../src/lib/motionCarouselImages.js';
import { creativeObjectKey } from '../src/lib/creativeMediaStorage.js';

const ACCOUNT = 'acct_1';
const ASSET = `asset_${'a'.repeat(64)}`;
const OTHER_ASSET = `asset_${'b'.repeat(64)}`;
const IDENTITY = { accountId: ACCOUNT, identityKey: 'creator@example.com', email: 'creator@example.com' };
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);

function samplePlan() {
  return planCarousel({
    brief: 'Five tips for a better morning routine. Tip one: drink water. Tip two: stretch. Tip three: plan the day. Tip four: read. Tip five: rest.',
    brand: 'mavensync',
    platform: 'instagram_carousel',
    brandColors: [],
    facts: {},
  });
}

// The first body slide (not the cover, not the CTA) still showing a planner placeholder.
function placeholderIndex(plan) {
  const index = plan.deck.slides.findIndex((slide, i) => i >= 1 && i < plan.deck.slides.length - 1 && ['icon', 'steps', 'checklist'].includes(slide.visual?.type));
  assert.ok(index >= 0, 'sample plan has a placeholder slide before the CTA');
  return index;
}

function copyOf(deck) {
  return deck.slides.map((slide) => [slide.headline, slide.sub, slide.kicker]);
}

test('planner decks expose slides with a visual the layout step can read', () => {
  const plan = samplePlan();
  assert.ok(plan.deck.slides.length >= 3);
  assert.equal(plan.storyboard.slides.at(-1).role, 'cta');
  assert.ok(plan.storyboard.slides.length === plan.deck.slides.length);
});

test('AI choices place photos on body slides and never change copy', () => {
  const plan = samplePlan();
  const index = placeholderIndex(plan);
  const before = copyOf(plan.deck);
  const choices = parseLayoutReply(JSON.stringify({ slides: [{ index, visual: 'product', imageIndex: 0 }] }));
  const result = applyLayoutChoices({ deck: plan.deck, storyboard: plan.storyboard }, choices, [{ storageReference: 'storage://k/photo.jpg' }]);

  assert.equal(result.applied, 1);
  assert.equal(result.rejected, 0);
  assert.deepEqual(result.deck.slides[index].visual, { type: 'product', image: 'storage://k/photo.jpg' });
  assert.equal(result.storyboard.slides[index].visualType, 'product');
  assert.deepEqual(copyOf(result.deck), before);
  // The input plan is not mutated.
  assert.equal(plan.deck.slides[index].visual.type !== 'product', true);
});

test('choices are rejected for the CTA slide, unknown images, bad visuals and duplicate slides', () => {
  const plan = samplePlan();
  const last = plan.deck.slides.length - 1;
  const index = placeholderIndex(plan);
  const images = [{ storageReference: 'storage://k/one.jpg' }];
  const result = applyLayoutChoices(
    { deck: plan.deck, storyboard: plan.storyboard },
    [
      { index: last, visual: 'image', imageIndex: 0 },
      { index, visual: 'image', imageIndex: 5 },
      { index, visual: 'video', imageIndex: 0 },
      { index, visual: 'image', imageIndex: 0 },
      { index, visual: 'image', imageIndex: 0 },
    ],
    images,
  );
  assert.equal(result.applied, 1);
  assert.equal(result.rejected, 4);
});

test('the cover slide never receives a photo, in AI choices or the deterministic fallback', () => {
  const plan = samplePlan();
  // Slide 0 is a placeholder here, so only the cover rule can stop it.
  assert.ok(['icon', 'steps', 'checklist'].includes(plan.deck.slides[0].visual.type));
  const images = [{ storageReference: 'storage://k/one.jpg' }];
  const result = applyLayoutChoices(
    { deck: plan.deck, storyboard: plan.storyboard },
    [{ index: 0, visual: 'image', imageIndex: 0 }],
    images,
  );
  assert.equal(result.applied, 0);
  assert.equal(result.rejected, 1);
  assert.ok(deterministicLayoutChoices(plan.deck, 3).every((choice) => choice.index >= 1));
});

test("a list, stat or quote written by the user is never replaced by a photo", () => {
  const deck = {
    slides: [
      { role: 'hook', headline: 'H', visual: { type: 'stat', value: '40%' } },
      { role: 'value', headline: 'V', visual: { type: 'list', items: ['a', 'b'] } },
      { role: 'cta', headline: 'C', visual: { type: 'icon' } },
    ],
  };
  const storyboard = { slides: deck.slides.map((slide) => ({ ...slide })) };
  const result = applyLayoutChoices({ deck, storyboard }, [
    { index: 0, visual: 'image', imageIndex: 0 },
    { index: 1, visual: 'image', imageIndex: 0 },
  ], [{ storageReference: 'storage://k/one.jpg' }]);
  assert.equal(result.applied, 0);
  assert.equal(result.deck.slides[0].visual.type, 'stat');
  assert.equal(result.deck.slides[1].visual.type, 'list');
});

test('the deterministic fallback places photos on placeholder body slides in upload order', () => {
  const plan = samplePlan();
  const choices = deterministicLayoutChoices(plan.deck, 2);
  assert.ok(choices.length <= 2);
  assert.ok(choices.every((choice, i) => choice.imageIndex === i && choice.index < plan.deck.slides.length - 1));
});

test('model reply parsing accepts a fenced block and refuses non-JSON or wrong shapes', () => {
  assert.deepEqual(parseLayoutReply('```json\n{"slides":[{"index":1,"visual":"image","imageIndex":0}]}\n```'), [{ index: 1, visual: 'image', imageIndex: 0 }]);
  assert.throws(() => parseLayoutReply('not json'), /layout_reply_not_json/);
  assert.throws(() => parseLayoutReply('{"slides":"nope"}'), /layout_reply_shape_invalid/);
});

test('layout messages send signed image URLs to the vision broker and never ask the model to write copy', () => {
  const plan = samplePlan();
  const messages = buildLayoutMessages({
    brief: 'brief',
    slides: plan.deck.slides,
    images: [{ name: 'Desk.jpg', url: 'https://r2.example.com/signed/desk.jpg' }],
  });
  const user = messages.find((m) => m.role === 'user');
  assert.ok(user.content.some((part) => part.type === 'image_url' && part.image_url.url.startsWith('https://')));
  assert.match(messages[0].content, /Do not write or change any slide text/);
});

test('uploaded photos must match their declared image signature', () => {
  assert.equal(matchesImageSignature(JPEG, 'image/jpeg'), true);
  assert.equal(matchesImageSignature(JPEG, 'image/png'), false);
  assert.equal(matchesImageSignature(Buffer.from('not an image at all'), 'image/jpeg'), false);
});

test("an image reference is only accepted when it is this account's own stored object", () => {
  const key = creativeObjectKey(ACCOUNT, ASSET);
  assert.equal(ownedCarouselImageKey(`storage://${key}`, ACCOUNT), key);
  assert.equal(ownedCarouselImageKey(`storage://${creativeObjectKey('acct_2', ASSET)}`, ACCOUNT), null);
  assert.equal(ownedCarouselImageKey('storage://../../etc/passwd', ACCOUNT), null);
  assert.equal(ownedCarouselImageKey('/etc/passwd', ACCOUNT), null);
});

test('the deck validator accepts storage references and still rejects traversal', () => {
  assert.equal(isSafeImageReference(`storage://${creativeObjectKey(ACCOUNT, ASSET)}`), true);
  assert.equal(isSafeImageReference('storage://../secret'), false);
  assert.equal(isSafeImageReference('/abs/photo.jpg'), false);
});

test("loadCarouselImages only resolves assets this account owns and refuses others as not found", async () => {
  const repository = {
    async get(id, { accountId }) {
      if (id === ASSET && accountId === ACCOUNT) {
        return { id, accountId: ACCOUNT, title: 'Desk', storageReference: `storage://${creativeObjectKey(ACCOUNT, id)}`, metadata: { modality: 'image' } };
      }
      return null;
    },
  };
  const images = await loadCarouselImages(IDENTITY, [ASSET], { repository });
  assert.equal(images[0].name, 'Desk');
  await assert.rejects(loadCarouselImages(IDENTITY, [OTHER_ASSET], { repository }), (error) => error instanceof CarouselImageError && error.code === 'carousel_image_not_found');
  await assert.rejects(loadCarouselImages(IDENTITY, ['not-an-asset'], { repository }), (error) => error.code === 'carousel_image_not_found');
});

test('planning falls back to the deterministic plan when the vision broker fails', async () => {
  const plan = samplePlan();
  const key = creativeObjectKey(ACCOUNT, ASSET);
  const images = [{ assetId: ASSET, name: 'Desk', key, storageReference: `storage://${key}` }];
  const storage = { async createSignedDeliveryReference(k) { return `https://signed.example.com/${k}`; } };
  const ai = { async complete() { throw new Error('provider down'); } };
  const logs = [];
  const result = await planCarouselWithImages({ plan, brief: 'brief', images, identity: IDENTITY, storage, ai, logger: { warn: (...a) => logs.push(a) } });
  assert.equal(result.layout.mode, 'deterministic');
  assert.equal(result.layout.reason, 'ai_unavailable');
  assert.deepEqual(copyOf(result.deck), copyOf(plan.deck));
  assert.equal(logs.length, 1);
});

test('planning uses the AI layout when the model returns valid choices, and keeps copy exact', async () => {
  const plan = samplePlan();
  const key = creativeObjectKey(ACCOUNT, ASSET);
  const images = [{ assetId: ASSET, name: 'Desk', key, storageReference: `storage://${key}` }];
  const storage = { async createSignedDeliveryReference(k) { return `https://signed.example.com/${k}`; } };
  let seen = null;
  const index = placeholderIndex(plan);
  const ai = {
    async complete({ messages }) {
      seen = messages;
      return JSON.stringify({ slides: [{ index, visual: 'image', imageIndex: 0 }] });
    },
  };
  const result = await planCarouselWithImages({ plan, brief: 'brief', images, identity: IDENTITY, storage, ai });
  assert.equal(result.layout.mode, 'ai');
  assert.equal(result.layout.applied, 1);
  assert.equal(result.deck.slides[index].visual.image, `storage://${key}`);
  assert.deepEqual(copyOf(result.deck), copyOf(plan.deck));
  assert.ok(seen.some((m) => Array.isArray(m.content) && m.content.some((p) => p.type === 'image_url')));
  // The prompt names each slide's real role from the storyboard, not "undefined".
  const text = seen.find((m) => m.role === 'user').content[0].text;
  assert.match(text, /\[cta, current visual: cta\]/);
  assert.doesNotMatch(text, /undefined/);
});

test('without uploaded photos the plan is the unchanged deterministic deck', async () => {
  const plan = samplePlan();
  const result = await planCarouselWithImages({ plan, images: [], identity: IDENTITY });
  assert.equal(result.layout.mode, 'deterministic');
  assert.equal(result.layout.reason, 'no_images');
  assert.deepEqual(result.deck, plan.deck);
});

test('the worker copies an owned uploaded photo beside the deck under a plain name the renderer reads', async () => {
  const key = creativeObjectKey(ACCOUNT, ASSET);
  const deck = { slides: [{ role: 'hook', headline: 'H', visual: { type: 'image', image: `storage://${key}` } }, { role: 'cta', headline: 'C', visual: { type: 'icon' } }] };
  const written = {};
  const fs = {
    async mkdir() {},
    async writeFile(path, bytes) { written[path] = bytes; },
  };
  const storage = {
    async getObject(k) {
      assert.equal(k, key);
      return { ContentType: 'image/jpeg', Body: JPEG };
    },
  };
  const out = await materializeCarouselImages({ deck, outDir: '/tmp/out', accountId: ACCOUNT, storage, fs });
  const name = out.slides[0].visual.image;
  assert.match(name, /^carousel-asset_[a-f0-9]{64}\.jpg$/);
  assert.deepEqual(written[`/tmp/out/${name}`], JPEG);
  assert.equal(out.slides[1].visual.type, 'icon');
});

test("the worker refuses a deck that references another account's photo", async () => {
  const otherKey = creativeObjectKey('acct_2', ASSET);
  const deck = { slides: [{ role: 'hook', headline: 'H', visual: { type: 'image', image: `storage://${otherKey}` } }] };
  const fs = { async mkdir() {}, async writeFile() {} };
  const storage = { async getObject() { throw new Error('should not be reached'); } };
  await assert.rejects(
    materializeCarouselImages({ deck, outDir: '/tmp/out', accountId: ACCOUNT, storage, fs }),
    (error) => error.code === 'carousel_image_not_found',
  );
});

test('a deck without uploaded photos is passed to the renderer unchanged', async () => {
  const deck = { slides: [{ role: 'hook', headline: 'H', visual: { type: 'icon' } }] };
  assert.equal(await materializeCarouselImages({ deck, outDir: '/tmp/out', accountId: ACCOUNT }), deck);
});
