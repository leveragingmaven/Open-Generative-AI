// Offline acceptance: existing chat/approval/queue/renderer/export path.
// Only providers, account persistence and object storage are mocked.
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { handleDesignAgentConversationPost } from '../src/lib/designAgentConversationEndpoint.js';
import { generateMavenImage, generateMavenImageEdit } from '../src/lib/mavenImageGeneration.js';
import { persistMavenChatAsset } from '../src/lib/mavenChatCreativeAsset.js';
import { presetStyleSheet } from '../packages/studio/src/lib/motion/carousel/CarouselStyleSheet.js';
import { handleApprovedCarouselGet, handleMotionCarouselPost } from '../src/lib/motionCarouselEndpoint.js';
import { InMemoryMotionCarouselJobStore } from '../src/lib/motionCarouselJobStore.js';
import { createMotionCarouselWorker } from '../src/lib/motionCarouselWorker.js';
import { createNativeMotionRenderer } from '../src/lib/motion/native/NativeMotionRenderer.js';
import { probeVideo } from '../src/lib/motion/native/ffmpeg.js';
import { publishMotionCarouselSlides } from '../src/lib/motionCarouselPublishing.js';

const output = resolve(process.argv[2] || '../../outputs/acceptance');
await mkdir(output, { recursive: true });
const identity = { accountId: 'offline-acceptance', identityKey: 'offline-creator', creatorId: 'offline-creator' };
const conversationId = 'offline-acceptance-conversation';
const messages = [], attachments = [], assets = [], objects = new Map(), transcript = [];
let generationCalls = 0, editCalls = 0;
const provider = {
  async generateImage() { generationCalls++; return { url: 'https://fixture.invalid/generated.png' }; },
  async generateI2I(_key, args) { editCalls++; assert.equal(args.image_url, 'https://fixture.invalid/generated.png'); return { url: 'https://fixture.invalid/revised.png' }; },
};
const repository = { db: {}, async saveOnConnection(_db, asset) { assets.push(asset); return asset; } };
for (const [name, color] of [['generated', '#132d47'], ['revised', '#7352a2']]) {
  await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640"><rect width="640" height="640" fill="${color}"/><text x="40" y="260" fill="white" font-size="40">MavenSync acceptance</text><text x="40" y="320" fill="white" font-size="28">Mock provider: ${name}</text></svg>`)).png().toFile(join(output, `${name}.png`));
}
const services = {
  ownershipService: { async verifyOwnedSession({ identity: who }) { assert.equal(who.accountId, identity.accountId); return { ok: true }; } },
  conversationReader: { async read() { return { conversationId, messages, attachments, imageReferences: messages.filter(item => item.role === 'assistant') }; } },
};
const deps = { ...services, identity, controlledExecution: true,
  generateMavenImage: (who, args) => generateMavenImage({ ...args, identity: who, muapiProvider: provider, credentialResolver: async () => 'mock-key' }),
  generateMavenImageEdit: (who, args) => generateMavenImageEdit({ ...args, identity: who, muapiProvider: provider, credentialResolver: async () => 'mock-key' }),
  async registerMavenImageReference(_who, { url }) { const ref = { attachmentId: `asset_fixture_${attachments.length}`, kind: 'image', url }; attachments.push(ref); return ref; },
  persistMavenCreativeAsset: (who, args) => persistMavenChatAsset(who, args, { repository, copyMedia: async ({ url }) => { const bytes = await readFile(join(output, url.includes('revised') ? 'revised.png' : 'generated.png')); return { storageReference: 'r2://offline/fixture', contentType: 'image/png', sizeBytes: bytes.length, checksum: createHash('sha256').update(bytes).digest('hex') }; } }),
  draftCarouselStyleSheet: async () => ({ sheet: presetStyleSheet({ brandName: 'MavenSync', colors: ['#132d47', '#f5f1ea'] }), source: 'offline-preset' }),
};
async function chat(message) {
  const reply = await handleDesignAgentConversationPost({ json: async () => ({ conversationId, message }) }, deps);
  assert.equal(reply.status, 200, JSON.stringify(reply));
  messages.push(...reply.persistedMessages);
  transcript.push({ message, reply: reply.reply });
  return reply;
}
await chat('Create a square image promoting MavenSync for independent business owners.');
await chat('Change the background of this image to purple.');
assert.equal(generationCalls, 1); assert.equal(editCalls, 1);
assert.equal(assets.length, 2); assert.equal(assets[1].metadata.sourceAssetId, 'asset_fixture_0');
console.log('PASS dashboard chat: image → owned asset → conversational revision → new owned asset (mock provider bytes)');
await chat(`Create a five-slide Motion Carousel for MavenSync. Use this exact approved copy. No music.
Slide 1: Your next idea starts here.
Slide 2: Plan your creative work.
Slide 3: Review before you render.
Slide 4: Refine what matters.
Slide 5: Approve, then share.
Visual direction: clean navy and cream, readable type.`);
await chat('confirm');
const previewResponse = await handleApprovedCarouselGet({ identity, conversationId, deps: { services } });
assert.equal(previewResponse.status, 200);
const preview = await previewResponse.json();
assert.equal(preview.deck.slides.length, 5);
await writeFile(join(output, 'approved-preview.json'), JSON.stringify(preview, null, 2));
const store = new InMemoryMotionCarouselJobStore();
const request = { json: async () => ({ action: 'render', deck: preview.deck, presetId: 'instagram_carousel', idempotencyKey: 'acceptance-five-slides' }) };
const queuedResponse = await handleMotionCarouselPost(request, { identity, store, startWorker: () => {}, env: {} });
assert.equal(queuedResponse.status, 200);
const queued = await queuedResponse.json();
const native = createNativeMotionRenderer({ logger: { log() {}, warn() {} } });
const storage = {
  async putObject({ key, body, contentType, sizeBytes, metadata }) { const chunks = []; if (Buffer.isBuffer(body)) chunks.push(body); else for await (const chunk of body) chunks.push(Buffer.from(chunk)); const bytes = Buffer.concat(chunks); assert.equal(bytes.length, sizeBytes); objects.set(key, { bytes, contentType, metadata }); },
  async getMetadata(key) { const item = objects.get(key); return item ? { sizeBytes: item.bytes.length, contentType: item.contentType, metadata: item.metadata } : null; },
  async headObject(key) { const item = objects.get(key); return item ? { ContentLength: item.bytes.length, ContentType: item.contentType, Metadata: item.metadata } : null; },
  async getObject(key) { const item = objects.get(key); return item ? { Body: item.bytes, ContentType: item.contentType } : null; },
  async createDeliveryReference(key) { return `https://fixture.invalid/${encodeURIComponent(key)}`; },
};
const worker = createMotionCarouselWorker({ store, storage, env: {}, outputDirFor: () => join(output, 'scratch'), cancelPollMs: 100,
  renderer: { ...native, render: args => native.render({ ...args, options: { ...args.options, fps: 6, durationSeconds: 1 } }) },
  logger: { log() {}, warn() {} },
});
console.log('Rendering five real slides with existing native sharp/FFmpeg renderer…');
const outcomes = await worker.drain();
assert.equal(outcomes[0].status, 'completed', JSON.stringify(outcomes));
const job = await store.get(queued.job.jobId, { accountId: identity.accountId });
assert.equal(job.result.storage.state, 'stored');
for (const file of job.result.storage.files) await writeFile(join(output, file.name), objects.get(file.key).bytes);
for (let slide = 1; slide <= 5; slide++) {
  const media = await probeVideo('ffmpeg', join(output, `slide-${String(slide).padStart(2, '0')}.mp4`));
  assert.equal(media.width, 1080); assert.equal(media.height, 1350);
}
const full = await probeVideo('ffmpeg', join(output, 'full-deck.mp4'));
assert.ok(Math.abs(full.duration - 5) < 0.4);
console.log('PASS storyboard → confirmation → approved preview → queue → native render → verified 5 MP4/PNG slides + PDF + full deck');
const publishing = await publishMotionCarouselSlides({ jobId: queued.job.jobId }, { identity, store, storage, repository });
assert.equal(publishing.status, 201, await publishing.clone().text());
assert.equal(assets.filter(asset => asset.metadata?.carouselJobId === queued.job.jobId).length, 5);
assert.equal((await publishMotionCarouselSlides({ jobId: queued.job.jobId }, { identity: { ...identity, accountId: 'wrong-tenant' }, store, storage, repository })).status, 404);
await writeFile(join(output, 'transcript.json'), JSON.stringify(transcript, null, 2));
await writeFile(join(output, 'result.json'), JSON.stringify({ imageProvider: 'mock', generationCalls, editCalls, carouselRenderer: native.id, slideCount: 5, geometry: '1080x1350', fullDeckSeconds: full.duration, publishing: 'asset handoff only; no publish endpoint called', job }, null, 2));
console.log('PASS ordered Publishing asset handoff; wrong tenant rejected; no social publishing call');
