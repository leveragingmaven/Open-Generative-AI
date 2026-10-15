import assert from "node:assert/strict";
import test from "node:test";
import { Readable } from "node:stream";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { S3AssetStorage } from "../../packages/studio/src/lib/intelligence/S3AssetStorage.js";
import { planCarousel } from "../../packages/studio/src/lib/motion/carousel/CarouselPlanner.js";
import { presetStyleSheet } from "../../packages/studio/src/lib/motion/carousel/CarouselStyleSheet.js";
import { attachApprovedStyleSheet, styleSheetFingerprint } from "./motionCarouselStyleSheet.js";
import { InMemoryMotionCarouselJobStore } from "./motionCarouselJobStore.js";
import { carouselObjectKey } from "./motionCarouselStorage.js";
import { creativeObjectKey } from "./creativeMediaStorage.js";
import {
  handleMotionCarouselPost,
  handleMotionCarouselGet,
  serveCarouselFile,
  carouselOutputDir,
} from "./motionCarouselEndpoint.js";

const ENV = { MAVEN_MOTION_OUTPUT_DIR: join(tmpdir(), "maven-motion-endpoint-test") };
// The style sheet is approved before any planning or rendering. These fixtures use
// an approved sheet exactly as the panel would send it.
const SHEET = presetStyleSheet({ visualStyle: "minimal_luxe", brandName: "MavenSync", colors: ["#111111", "#f5f1ea"] });
const APPROVAL = styleSheetFingerprint(SHEET);
const DECK = attachApprovedStyleSheet(planCarousel({ brief: "make an animated carousel about MavenSync Spaces" }).deck, SHEET, APPROVAL);
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
  const response = await post({ action: "plan", brief: "an animated carousel about cold brew", platform: "pinterest_pin", styleSheet: SHEET, styleSheetApproval: APPROVAL });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.preset.id, "pinterest_pin");
  assert.ok(body.deck.slides.length >= 3);
});

test("plan is refused without an approved style sheet, or with one edited after approval", async () => {
  const none = await post({ action: "plan", brief: "cold brew" });
  assert.equal(none.status, 409);
  assert.equal((await none.json()).code, "style_sheet_not_approved");
  const edited = { ...SHEET, palette: [{ name: "Red", hex: "#ff0000" }, { name: "Blue", hex: "#0000ff" }] };
  const tampered = await post({ action: "plan", brief: "cold brew", styleSheet: edited, styleSheetApproval: APPROVAL });
  assert.equal(tampered.status, 409);
});

test("an approved sheet sets the deck's visual style and palette before slides are planned", async () => {
  const response = await post({ action: "plan", brief: "an animated carousel about cold brew", styleSheet: SHEET, styleSheetApproval: APPROVAL });
  const { deck } = await response.json();
  assert.equal(deck.preset, "minimal_luxe");
  assert.deepEqual(deck.colors, ["#111111", "#f5f1ea"]);
  assert.equal(deck.styleSheetApproval, APPROVAL);
});

test("render is refused for a deck without an approved sheet, or one changed since approval", async () => {
  const plain = planCarousel({ brief: "make an animated carousel about MavenSync Spaces" }).deck;
  const unapproved = await post({ action: "render", deck: plain });
  assert.equal(unapproved.status, 409);
  assert.equal((await unapproved.json()).code, "style_sheet_not_approved");
  const changed = { ...DECK, styleSheet: { ...DECK.styleSheet, rules: ["Anything goes"] } };
  const tampered = await post({ action: "render", deck: changed });
  assert.equal(tampered.status, 409);
});

test("a style sheet draft falls back to a preset sheet when the AI is unavailable", async () => {
  const response = await handleMotionCarouselPost(
    new Request("https://example.test/api/motion-carousel", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "style_sheet", op: "draft", brief: "cold brew", visualStyle: "modern_agency" }) }),
    { identity: IDENTITY, store: new InMemoryMotionCarouselJobStore(), env: ENV, startWorker: noWorker, ai: { complete: async () => { throw new Error("offline"); } }, storage: null },
  );
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.source, "preset");
  assert.equal(body.styleSheet.visualStyle, "modern_agency");
  assert.ok(body.styleSheet.palette.length >= 2);
});

test("a style sheet draft uses the AI reply when it is valid, and falls back when it is not", async () => {
  const reply = JSON.stringify({ name: "Cool Studio", visualStyle: "bold_editorial", palette: [{ name: "Ink Black", hex: "#101010" }, { name: "Paper White", hex: "#fafafa" }], rules: ["Never tint a photo over the headline"] });
  const draft = (complete) => handleMotionCarouselPost(
    new Request("https://example.test/api/motion-carousel", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "style_sheet", op: "draft", brief: "cold brew" }) }),
    { identity: IDENTITY, store: new InMemoryMotionCarouselJobStore(), env: ENV, startWorker: noWorker, ai: { complete }, storage: null },
  );
  const good = await (await draft(async () => reply)).json();
  assert.equal(good.source, "ai");
  assert.equal(good.styleSheet.name, "Cool Studio");
  const bad = await (await draft(async () => "not json at all")).json();
  assert.equal(bad.source, "preset");
});

test("a style sheet draft sends the uploaded photos to the model as signed references", async () => {
  const ASSET = `asset_${"c".repeat(64)}`;
  const repository = {
    async get(id, { accountId }) {
      if (id === ASSET && accountId === IDENTITY.accountId) {
        return { id, accountId: IDENTITY.accountId, title: "Desk", storageReference: `storage://${creativeObjectKey(IDENTITY.accountId, ASSET)}`, metadata: { modality: "image" } };
      }
      return null;
    },
  };
  const storage = { createSignedDeliveryReference: async (key) => `https://signed.test/${encodeURIComponent(key)}` };
  let sent = null;
  const ai = { complete: async ({ messages }) => { sent = messages; return JSON.stringify({ name: "Desk Studio", visualStyle: "modern_agency", palette: [{ name: "Ink Black", hex: "#101010" }, { name: "Paper White", hex: "#fafafa" }], rules: [] }); } };
  const response = await handleMotionCarouselPost(
    new Request("https://example.test/api/motion-carousel", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "style_sheet", op: "draft", brief: "desk setup", imageAssetIds: [ASSET] }) }),
    { identity: IDENTITY, store: new InMemoryMotionCarouselJobStore(), env: ENV, startWorker: noWorker, ai, storage, repository },
  );
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.source, "ai");
  const imageParts = sent[1].content.filter((part) => part.type === "image_url");
  assert.equal(imageParts.length, 1);
  assert.equal(imageParts[0].image_url.url, `https://signed.test/${encodeURIComponent(creativeObjectKey(IDENTITY.accountId, ASSET))}`);
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
  const invalid = await post({ action: "render", deck: { ...DECK, look: "solid", slides: [{ headline: "no visual", visual: { type: "hologram" } }] } });
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
// ── Serving finished carousels from object storage ───────────────────────────
//
// The same `S3AssetStorage` adapter the rest of Creator OS uses, wired to an
// in-process bucket: the endpoint is exercised against the real storage class.

const R2_ENV = {
  R2_ENDPOINT: 'https://9d6a8fc39bc8bf418dabe42f23ba2d45.r2.cloudflarestorage.com',
  R2_BUCKET: 'mavensync-assets',
  R2_ACCESS_KEY_ID: 'test-id',
  R2_SECRET_ACCESS_KEY: 'test-secret',
};

function objectStorage({ objects = new Map() } = {}) {
  const reads = [];
  const client = {
    async headObject({ Key }) {
      const object = objects.get(Key);
      if (!object) throw new Error('NotFound');
      return { ContentType: object.contentType, ContentLength: object.body.length, Metadata: {}, ETag: 'etag' };
    },
    async getObject({ Key, Range }) {
      reads.push({ key: Key, range: Range || null });
      const object = objects.get(Key);
      if (!object) return {};
      if (!Range) return { Body: Readable.from([object.body]), ContentType: object.contentType, ContentLength: object.body.length };
      const match = /^bytes=(\d+)-(\d*)$/.exec(Range);
      const start = Number(match[1]);
      const end = match[2] ? Number(match[2]) : object.body.length - 1;
      const slice = object.body.subarray(start, end + 1);
      return {
        Body: Readable.from([slice]),
        ContentType: object.contentType,
        ContentLength: slice.length,
        ContentRange: `bytes ${start}-${end}/${object.body.length}`,
      };
    },
    async putObject({ Key, Body, ContentType }) {
      objects.set(Key, { body: Buffer.from(Body), contentType: ContentType });
    },
    async deleteObject() {},
  };
  return { objects, reads, storage: new S3AssetStorage({ client, bucket: 'mavensync-assets' }) };
}

/** A completed job record as the store holds it, with one durable slide. */
function storedJob({ accountId = '1', name = 'slide-01.mp4', fingerprint = 'aaaa1111', key = null } = {}) {
  const expected = key || carouselObjectKey({ accountId, fingerprint, file: name });
  return {
    id: 'mcar-1',
    accountId,
    result: {
      storage: {
        state: 'stored', mode: 'r2', objects: 1, reused: 0,
        files: [{ slot: name.replace(/\.[^.]+$/, ''), name, kind: 'slide', contentType: 'video/mp4', bytes: 12, fingerprint, key: expected, storageReference: `storage://${expected}`, reused: false }],
      },
    },
  };
}

/** A store that scopes by account exactly like the MySQL one does. */
function jobStore(job) {
  return { async get(jobId, { accountId } = {}) { return jobId === job.id && String(accountId) === String(job.accountId) ? job : null; } };
}

async function bytes(response) {
  return Buffer.from(await response.arrayBuffer());
}

test('a finished carousel is served to its owner from object storage', async () => {
  const job = storedJob();
  const file = job.result.storage.files[0];
  const fixture = objectStorage({ objects: new Map([[file.key, { body: Buffer.from('stored-video'), contentType: 'video/mp4' }]]) });
  const store = jobStore(job);

  const response = await handleMotionCarouselGet(
    new Request(`https://example.test/api/motion-carousel?file=slide-01.mp4&jobId=mcar-1`),
    { identity: IDENTITY, store, env: ENV, storage: fixture.storage },
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'video/mp4');
  assert.equal(response.headers.get('content-length'), String('stored-video'.length));
  assert.equal(response.headers.get('accept-ranges'), 'bytes');
  assert.match(response.headers.get('cache-control'), /private/);
  assert.equal((await bytes(response)).toString(), 'stored-video');

  // A range request is honoured so the full-deck video can be scrubbed/played.
  const ranged = await handleMotionCarouselGet(
    new Request(`https://example.test/api/motion-carousel?file=slide-01.mp4&jobId=mcar-1`, { headers: { range: 'bytes=0-3' } }),
    { identity: IDENTITY, store, env: ENV, storage: fixture.storage },
  );
  assert.equal(ranged.status, 206);
  assert.equal(ranged.headers.get('content-range'), 'bytes 0-3/12');
  assert.equal((await bytes(ranged)).toString(), 'stor');

  const head = await handleMotionCarouselGet(
    new Request(`https://example.test/api/motion-carousel?file=slide-01.mp4&jobId=mcar-1`, { method: 'HEAD' }),
    { identity: IDENTITY, store, env: ENV, storage: fixture.storage },
  );
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('content-length'), '12');

  // A malformed range is refused rather than passed through to storage.
  const bad = await handleMotionCarouselGet(
    new Request(`https://example.test/api/motion-carousel?file=slide-01.mp4&jobId=mcar-1`, { headers: { range: 'bytes=0-3,5-6' } }),
    { identity: IDENTITY, store, env: ENV, storage: fixture.storage },
  );
  assert.equal(bad.status, 416);
});

test('another account cannot reach a stored carousel, and storage is never consulted', async () => {
  const job = storedJob();
  const file = job.result.storage.files[0];
  const fixture = objectStorage({ objects: new Map([[file.key, { body: Buffer.from('stored-video'), contentType: 'video/mp4' }]]) });

  const other = await handleMotionCarouselGet(
    new Request('https://example.test/api/motion-carousel?file=slide-01.mp4&jobId=mcar-1'),
    { identity: { accountId: '2', identityKey: 'creator-2' }, store: jobStore(job), env: ENV, storage: fixture.storage },
  );
  assert.equal(other.status, 404);
  assert.equal((await other.json()).code, 'file_not_found');
  assert.deepEqual(fixture.reads, [], 'nothing was fetched for an account that does not own the job');

  // The same job, addressed by another account's key: the stored record cannot be
  // made to point at someone else's object.
  const foreignKey = carouselObjectKey({ accountId: '2', fingerprint: 'aaaa1111', file: 'slide-01.mp4' });
  const tampered = objectStorage({ objects: new Map([[foreignKey, { body: Buffer.from('someone-elses-video'), contentType: 'video/mp4' }]]) });
  const manipulated = await handleMotionCarouselGet(
    new Request('https://example.test/api/motion-carousel?file=slide-01.mp4&jobId=mcar-1'),
    { identity: IDENTITY, store: jobStore({ ...job, result: { storage: { files: [{ ...file, key: foreignKey, storageReference: `storage://${foreignKey}` }] } } }), env: ENV, storage: tampered.storage },
  );
  assert.equal(manipulated.status, 404);
  assert.deepEqual(tampered.reads, []);
});

test('an unknown job, file or extension is a 404 and never touches storage', async () => {
  const job = storedJob();
  const file = job.result.storage.files[0];
  const fixture = objectStorage({ objects: new Map([[file.key, { body: Buffer.from('stored-video'), contentType: 'video/mp4' }]]) });
  const store = jobStore(job);

  for (const url of [
    'https://example.test/api/motion-carousel?file=slide-01.mp4&jobId=mcar-other',
    'https://example.test/api/motion-carousel?file=slide-09.mp4&jobId=mcar-1',
    'https://example.test/api/motion-carousel?file=deck.env&jobId=mcar-1',
    'https://example.test/api/motion-carousel?file=..%2F..%2F.native-cache%2Fmanifest.json&jobId=mcar-1',
  ]) {
    // eslint-disable-next-line no-await-in-loop
    const response = await handleMotionCarouselGet(new Request(url), { identity: IDENTITY, store, env: ENV, storage: fixture.storage });
    assert.equal(response.status, 404, url);
  }
  assert.deepEqual(fixture.reads, []);
});

test('status reports where a finished carousel will be kept', async () => {
  const local = await (await handleMotionCarouselGet(new Request('https://example.test/api/motion-carousel'), { identity: IDENTITY, store: new InMemoryMotionCarouselJobStore(), env: ENV })).json();
  assert.equal(local.storage.mode, 'local');
  assert.equal(local.storage.durable, false);

  const durable = await (await handleMotionCarouselGet(new Request('https://example.test/api/motion-carousel'), { identity: IDENTITY, store: new InMemoryMotionCarouselJobStore(), env: { ...ENV, ...R2_ENV } })).json();
  assert.equal(durable.storage.mode, 'r2');
  assert.equal(durable.storage.durable, true);
  assert.equal(durable.storage.provider, 'cloudflare-r2');
});

/** A completed job with one stored still per slide; slide 2 is listed first to prove ordering. */
function publishableJob(slideCount = 2) {
  const files = [];
  for (let n = 1; n <= slideCount; n += 1) {
    const name = `slide-${String(n).padStart(2, '0')}.png`;
    const fingerprint = `ff${String(n).padStart(6, '0')}`;
    const key = carouselObjectKey({ accountId: '1', fingerprint, file: name });
    files.push({ slot: `thumb-${n}`, name, kind: 'thumbnail', contentType: 'image/png', bytes: 4, fingerprint, key, storageReference: `storage://${key}`, reused: false });
  }
  files.reverse();
  return { id: 'mcar-pub', accountId: '1', status: 'completed', result: { storage: { state: 'stored', mode: 'r2', objects: files.length, reused: 0, files } } };
}

function publishStubs(job) {
  const objects = new Map(job.result.storage.files.map((file) => [file.key, { body: Buffer.from('png!'), contentType: 'image/png' }]));
  const fixture = objectStorage({ objects });
  const saved = [];
  const repository = { db: {}, async saveOnConnection(_connection, asset) { saved.push(asset); return { ...asset }; } };
  return { storage: fixture.storage, repository, saved };
}

function publish(body, { job, storage, repository }) {
  const request = new Request('https://example.test/api/motion-carousel', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return handleMotionCarouselPost(request, { identity: IDENTITY, store: jobStore(job), env: ENV, startWorker: noWorker, storage, repository });
}

test('publish registers finished slides as account-owned library assets in slide order', async () => {
  const job = publishableJob(2);
  const stubs = publishStubs(job);
  const response = await publish({ action: 'publish', jobId: job.id }, { job, ...stubs });
  const body = await response.json();
  assert.equal(response.status, 201);
  assert.equal(body.count, 2);
  assert.deepEqual(body.assets.map((asset) => asset.title), ['Carousel slide 1', 'Carousel slide 2']);
  assert.ok(body.assets.every((asset) => /^\/api\/creative-assets\/media\?assetId=asset_[a-f0-9]{64}$/.test(asset.url)));
  assert.ok(stubs.saved.every((asset) => asset.storageReference.startsWith('storage://creator-os/production/accounts/')));
});

test('publish refuses a carousel longer than Instagram allows, and an unfinished one', async () => {
  const long = publishableJob(11);
  const longStubs = publishStubs(long);
  const tooLong = await publish({ action: 'publish', jobId: long.id }, { job: long, ...longStubs });
  assert.equal(tooLong.status, 422);
  assert.equal(longStubs.saved.length, 0);

  const running = { ...publishableJob(2), status: 'running' };
  const notReady = await publish({ action: 'publish', jobId: running.id }, { job: running, ...publishStubs(running) });
  assert.equal(notReady.status, 409);
});
