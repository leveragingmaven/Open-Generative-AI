import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { S3AssetStorage } from '../../packages/studio/src/lib/intelligence/S3AssetStorage.js';
import { accountPath } from './creativeMediaStorage.js';
import {
  CarouselStorageError,
  carouselArtifactsFromRender,
  carouselCacheManifestKey,
  carouselObjectKey,
  ownedCarouselFile,
  publicCarouselStorageView,
  readCarouselCacheManifest,
  resolveCarouselStorageMode,
  restoreCarouselArtifact,
  safeCarouselFileName,
  storeCarouselArtifacts,
  writeCarouselCacheManifest,
} from './motionCarouselStorage.js';

const FINGERPRINT = 'a1b2c3d4';
const OWNER = 'account-one';

/**
 * The existing Creator OS storage adapter over an in-process bucket: the same
 * `S3AssetStorage` class production uses, so what these tests exercise is the real
 * integration rather than a stand-in with the same shape.
 */
function storageFixture() {
  const objects = new Map();
  let writes = 0;
  let fail = null;
  const client = {
    async putObject({ Key, Body, ContentType, ContentLength, Metadata }) {
      if (fail) throw fail;
      const chunks = [];
      if (Buffer.isBuffer(Body)) chunks.push(Body);
      else for await (const chunk of Body) chunks.push(Buffer.from(chunk));
      const body = Buffer.concat(chunks);
      assert.equal(body.length, ContentLength);
      objects.set(Key, { body, ContentType, Metadata });
      writes += 1;
    },
    async headObject({ Key }) {
      const object = objects.get(Key);
      if (!object) throw new Error('NotFound');
      return { ContentType: object.ContentType, ContentLength: object.body.length, Metadata: object.Metadata, ETag: 'etag' };
    },
    async getObject({ Key, Range }) {
      const object = objects.get(Key);
      return {
        ...(object ? { Body: Readable.from([object.body]), ContentType: object.ContentType, ContentLength: object.body.length } : {}),
        ...(Range ? { ContentRange: `bytes 0-0/${object?.body.length || 0}` } : {}),
      };
    },
    async deleteObject({ Key }) { objects.delete(Key); },
  };
  return {
    objects,
    storage: new S3AssetStorage({ client, bucket: 'mavensync-assets' }),
    get writes() { return writes; },
    failWith(error) { fail = error; },
  };
}

async function withTempDir(run) {
  const dir = await mkdtemp(join(tmpdir(), 'carousel-storage-'));
  try {
    return await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Writes a local artifact of a given size and returns its descriptor. */
async function localArtifact(dir, name, bytes = 'rendered-bytes', extra = {}) {
  const path = join(dir, name);
  await writeFile(path, bytes);
  return { name, path, ...extra };
}

test('carousel keys are account-scoped and derived from content, never from a request', () => {
  const key = carouselObjectKey({ accountId: OWNER, fingerprint: FINGERPRINT, file: 'slide-01.mp4' });
  assert.equal(key, `creator-os/production/accounts/${accountPath(OWNER)}/carousels/${FINGERPRINT}/slide-01.mp4`);
  assert.notEqual(key, carouselObjectKey({ accountId: 'account-two', fingerprint: FINGERPRINT, file: 'slide-01.mp4' }));
  // Identical content lands on an identical key, which is what makes re-uploads and
  // restored reuse possible at all.
  assert.equal(key, carouselObjectKey({ accountId: OWNER, fingerprint: FINGERPRINT, file: 'slide-01.mp4' }));

  const code = (expected) => (error) => error instanceof CarouselStorageError && error.code === expected;
  for (const bad of ['../escape.mp4', 'nested/slide-01.mp4', '..\\escape.mp4', 'notes.txt', '']) {
    assert.equal(safeCarouselFileName(bad), null, `${bad} must not be addressable`);
    assert.throws(() => carouselObjectKey({ accountId: OWNER, fingerprint: FINGERPRINT, file: bad }), code('carousel_file_name_invalid'));
  }
  assert.throws(() => carouselObjectKey({ accountId: OWNER, fingerprint: 'not-a-hash', file: 'slide-01.mp4' }), code('carousel_fingerprint_invalid'));
  assert.throws(() => carouselObjectKey({ accountId: '  ', fingerprint: FINGERPRINT, file: 'slide-01.mp4' }), code('carousel_account_required'));
  assert.equal(safeCarouselFileName('cover.png'), 'cover.png');
  assert.equal(safeCarouselFileName('slides-still.pdf'), 'slides-still.pdf');
});

test('the storage mode follows the R2 variables and the explicit operator switch', () => {
  const r2 = { R2_ENDPOINT: 'https://x.r2.cloudflarestorage.com', R2_BUCKET: 'bucket', R2_ACCESS_KEY_ID: 'id', R2_SECRET_ACCESS_KEY: 'secret' };
  assert.equal(resolveCarouselStorageMode(r2), 'r2');
  assert.equal(resolveCarouselStorageMode({ ...r2, R2_BUCKET: '' }), 'local');
  assert.equal(resolveCarouselStorageMode({}), 'local');
  assert.equal(resolveCarouselStorageMode({ ...r2, MOTION_CAROUSEL_STORAGE: 'off' }), 'local-off');
  // An explicit requirement is honoured even with nothing configured: the job then
  // fails loudly instead of quietly keeping files nobody can serve.
  assert.equal(resolveCarouselStorageMode({ MOTION_CAROUSEL_STORAGE: 'required' }), 'r2');
});

test('a finished render uploads once, is confirmed, and a retry reuses what is stored', async () => {
  await withTempDir(async (dir) => {
    const fixture = storageFixture();
    const artifacts = [
      await localArtifact(dir, 'slide-01.mp4', 'slide-bytes', { slot: 'slide-1', kind: 'slide', fingerprint: FINGERPRINT }),
      await localArtifact(dir, 'cover.png', 'png-bytes', { slot: 'cover', kind: 'cover' }),
    ];
    const stored = await storeCarouselArtifacts({ accountId: OWNER, jobId: 'mcar-1', artifacts, storage: fixture.storage });
    assert.equal(stored.length, 2);
    assert.equal(fixture.writes, 2);
    assert.equal(fixture.objects.size, 2);

    const slide = stored.find((file) => file.name === 'slide-01.mp4');
    assert.equal(slide.key, carouselObjectKey({ accountId: OWNER, fingerprint: FINGERPRINT, file: 'slide-01.mp4' }));
    assert.equal(slide.storageReference, `storage://${slide.key}`);
    assert.equal(slide.contentType, 'video/mp4');
    assert.equal(slide.bytes, 'slide-bytes'.length);
    assert.equal(slide.sha256.length, 64, 'the bytes are recorded by content hash');
    assert.equal(fixture.objects.get(slide.key).Metadata.sha256, slide.sha256);

    // A retry (or a re-render of the same content) must not duplicate the object.
    const retry = await storeCarouselArtifacts({ accountId: OWNER, jobId: 'mcar-1', artifacts, storage: fixture.storage });
    assert.equal(fixture.writes, 2, 'nothing was uploaded a second time');
    assert.equal(fixture.objects.size, 2);
    assert.ok(retry.every((file) => file.reused === true), 'every artifact was reused from storage');
    assert.deepEqual(retry.map((file) => file.key), stored.map((file) => file.key));
  });
});

test('artifacts are validated before anything is uploaded, and a failed upload never reports success', async () => {
  await withTempDir(async (dir) => {
    const fixture = storageFixture();
    await assert.rejects(
      storeCarouselArtifacts({ accountId: OWNER, artifacts: [{ name: 'slide-01.mp4', path: join(dir, 'missing.mp4') }], storage: fixture.storage }),
      (error) => error instanceof CarouselStorageError && error.code === 'carousel_asset_missing',
    );
    const empty = await localArtifact(dir, 'slide-02.mp4', '');
    await assert.rejects(
      storeCarouselArtifacts({ accountId: OWNER, artifacts: [empty], storage: fixture.storage }),
      (error) => error.code === 'carousel_asset_empty',
    );
    assert.equal(fixture.writes, 0, 'nothing is written for an artifact that failed validation');

    // Over the configured image limit (which is environment-tunable, exactly like
    // every other Creator OS upload).
    const previous = process.env.CREATOR_OS_UPLOAD_MAX_IMAGE_MB;
    process.env.CREATOR_OS_UPLOAD_MAX_IMAGE_MB = '1';
    try {
      const big = await localArtifact(dir, 'cover.png', Buffer.alloc(1024 * 1024 + 1, 7));
      await assert.rejects(
        storeCarouselArtifacts({ accountId: OWNER, artifacts: [big], storage: fixture.storage }),
        (error) => error.code === 'carousel_asset_too_large',
      );
    } finally {
      if (previous === undefined) delete process.env.CREATOR_OS_UPLOAD_MAX_IMAGE_MB;
      else process.env.CREATOR_OS_UPLOAD_MAX_IMAGE_MB = previous;
    }
    assert.equal(fixture.writes, 0);

    // A storage outage surfaces as a storage failure, not as a completed job.
    const good = await localArtifact(dir, 'slide-03.mp4', 'bytes');
    fixture.failWith(new Error('R2 unavailable'));
    await assert.rejects(storeCarouselArtifacts({ accountId: OWNER, artifacts: [good], storage: fixture.storage }), /R2 unavailable/);

    // An upload that cannot be read back at the recorded size is not accepted.
    fixture.failWith(null);
    const lyingStorage = {
      ...fixture.storage,
      getMetadata: async () => ({ sizeBytes: 999, contentType: 'video/mp4' }),
      putObject: async () => {},
    };
    await assert.rejects(
      storeCarouselArtifacts({ accountId: OWNER, artifacts: [good], storage: lyingStorage }),
      (error) => error.code === 'carousel_upload_unverified',
    );
  });
});

test('ownership is recomputed from the job, so a tampered record resolves to nothing', () => {
  const key = carouselObjectKey({ accountId: OWNER, fingerprint: FINGERPRINT, file: 'slide-01.mp4' });
  const file = { slot: 'slide-1', name: 'slide-01.mp4', kind: 'slide', contentType: 'video/mp4', bytes: 12, fingerprint: FINGERPRINT, key, storageReference: `storage://${key}` };
  const job = { id: 'mcar-1', accountId: OWNER, result: { storage: { state: 'stored', files: [file] } } };

  const owned = ownedCarouselFile(job, 'slide-01.mp4');
  assert.equal(owned.key, key);
  assert.equal(owned.contentType, 'video/mp4');

  const other = { ...job, accountId: 'account-two' };
  assert.equal(ownedCarouselFile(other, 'slide-01.mp4'), null, 'another account recomputes a different key');
  assert.equal(ownedCarouselFile({ ...job, result: { storage: { files: [{ ...file, key: 'creator-os/production/accounts/other/carousels/x/slide-01.mp4' }] } } }, 'slide-01.mp4'), null);
  assert.equal(ownedCarouselFile({ ...job, result: { storage: { files: [{ ...file, storageReference: 'storage://elsewhere' }] } } }, 'slide-01.mp4'), null);
  assert.equal(ownedCarouselFile({ ...job, result: { storage: { files: [{ ...file, fingerprint: 'deadbeef' }] } } }, 'slide-01.mp4'), null);
  assert.equal(ownedCarouselFile(job, '../deck.json'), null);
  assert.equal(ownedCarouselFile(job, 'slide-02.mp4'), null, 'a name the job never stored is not served');
  assert.equal(ownedCarouselFile({ id: 'x', accountId: OWNER, result: null }, 'slide-01.mp4'), null);
});

test('a stored artifact is restored into the render directory, and an unsafe or absent one is refused', async () => {
  await withTempDir(async (dir) => {
    const fixture = storageFixture();
    const artifacts = [await localArtifact(dir, 'slide-01.mp4', 'slide-bytes', { fingerprint: FINGERPRINT })];
    await storeCarouselArtifacts({ accountId: OWNER, artifacts, storage: fixture.storage });
    await rm(join(dir, 'slide-01.mp4'), { force: true });

    const restored = await restoreCarouselArtifact({ accountId: OWNER, fingerprint: FINGERPRINT, file: 'slide-01.mp4', outDir: dir, storage: fixture.storage });
    assert.equal(restored, join(dir, 'slide-01.mp4'));
    assert.equal(await readFile(restored, 'utf8'), 'slide-bytes');

    assert.equal(await restoreCarouselArtifact({ accountId: OWNER, fingerprint: 'ffffffff', file: 'slide-01.mp4', outDir: dir, storage: fixture.storage }), null);
    assert.equal(await restoreCarouselArtifact({ accountId: OWNER, fingerprint: FINGERPRINT, file: '../escape.mp4', outDir: dir, storage: fixture.storage }), null);
    assert.equal(await restoreCarouselArtifact({ accountId: 'account-two', fingerprint: FINGERPRINT, file: 'slide-01.mp4', outDir: dir, storage: fixture.storage }), null);
  });
});

test('a missing object is a miss, not an error, even when storage throws for it', async () => {
  await withTempDir(async (dir) => {
    // R2 answers a missing key with NoSuchKey rather than an empty response, which
    // the in-process bucket above cannot show — an ordinary "nothing stored yet"
    // must not become a thrown error in the worker or the renderer.
    const throwing = {
      getMetadata: async () => null,
      getObject: async () => { throw Object.assign(new Error('The specified key does not exist.'), { name: 'NoSuchKey' }); },
      putObject: async () => {},
    };
    assert.equal(await readCarouselCacheManifest({ accountId: OWNER, storage: throwing }), null);
    assert.equal(await restoreCarouselArtifact({ accountId: OWNER, fingerprint: FINGERPRINT, file: 'slide-01.mp4', outDir: dir, storage: throwing }), null);
  });
});

test('the render result maps onto artifacts with the renderer cache keys', () => {
  const artifacts = carouselArtifactsFromRender({
    outDir: '/tmp/carousel',
    renderResult: {
      files: ['slide-01.mp4', 'slide-02.mp4', 'slide-01.png', 'slide-02.png', 'cover.png', 'slides-still.pdf', 'full-deck.mp4', 'full-deck-9x16.mp4'],
      cacheKeys: { slides: ['aaaa1111', 'bbbb2222'], fullDeck: 'cccc3333' },
    },
    exportOutputs: ['/tmp/carousel/slide-01-2x3.mp4', '/tmp/carousel/slide-02-2x3.mp4'],
    exportKeys: ['dddd4444', 'eeee5555'],
  });
  const byName = new Map(artifacts.map((artifact) => [artifact.name, artifact]));
  assert.equal(artifacts.length, 10);
  assert.deepEqual([byName.get('slide-01.mp4').slot, byName.get('slide-01.mp4').kind, byName.get('slide-01.mp4').fingerprint], ['slide-1', 'slide', 'aaaa1111']);
  assert.deepEqual([byName.get('slide-02.mp4').slot, byName.get('slide-02.mp4').fingerprint], ['slide-2', 'bbbb2222']);
  // A still is addressed by its slide's cache key, so a reused slide can fetch it back.
  assert.deepEqual([byName.get('slide-01.png').kind, byName.get('slide-01.png').fingerprint], ['thumbnail', 'aaaa1111']);
  assert.deepEqual([byName.get('slide-02.png').kind, byName.get('slide-02.png').fingerprint], ['thumbnail', 'bbbb2222']);
  assert.equal(byName.get('cover.png').kind, 'cover');
  assert.equal(byName.get('slides-still.pdf').kind, 'pdf');
  assert.equal(byName.get('full-deck.mp4').fingerprint, 'cccc3333', 'the full deck keeps its own cache key so it can be restored too');
  assert.equal(byName.get('full-deck-9x16.mp4').fingerprint, null, 'an artifact the renderer does not cache is content-addressed instead');
  assert.equal(byName.get('slide-01-2x3.mp4').fingerprint, 'dddd4444');
  assert.equal(byName.get('slide-01-2x3.mp4').path, join('/tmp/carousel', 'slide-01-2x3.mp4'));
});

test('the render-cache index is stored per account and read back only by its owner', async () => {
  const fixture = storageFixture();
  const manifest = { version: 3, accountId: OWNER, slides: { 0: { fingerprint: FINGERPRINT, file: 'slide-01.mp4' } }, exports: {}, fullDeck: {}, decks: {} };
  const written = await writeCarouselCacheManifest({ accountId: OWNER, manifest, storage: fixture.storage });
  assert.equal(written.key, carouselCacheManifestKey(OWNER));
  assert.equal(fixture.objects.get(written.key).ContentType, 'application/json');

  assert.deepEqual(await readCarouselCacheManifest({ accountId: OWNER, storage: fixture.storage }), manifest);
  assert.equal(await readCarouselCacheManifest({ accountId: 'account-two', storage: fixture.storage }), null, 'a different account has its own index');
  // An index that claims another account is refused even if it were reachable.
  assert.equal(await writeCarouselCacheManifest({ accountId: OWNER, manifest: { ...manifest, accountId: 'account-two' }, storage: fixture.storage }), null);
  assert.equal(await readCarouselCacheManifest({ accountId: OWNER, storage: storageFixture().storage }), null);

  const huge = { ...manifest, decks: { filler: 'x'.repeat(300 * 1024) } };
  assert.equal(await writeCarouselCacheManifest({ accountId: OWNER, manifest: huge, storage: fixture.storage }), null, 'an implausible index is not stored');
});

test('the public view of stored files keeps what a client needs and drops the addressing', () => {
  const key = carouselObjectKey({ accountId: OWNER, fingerprint: FINGERPRINT, file: 'slide-01.mp4' });
  const view = publicCarouselStorageView({
    state: 'stored', mode: 'r2', objects: 1, reused: 0,
    files: [{ slot: 'slide-1', name: 'slide-01.mp4', kind: 'slide', contentType: 'video/mp4', bytes: 12, fingerprint: FINGERPRINT, key, storageReference: `storage://${key}`, reused: false }],
  });
  assert.equal(view.state, 'stored');
  assert.equal(view.objects, 1);
  assert.deepEqual(view.files[0], { slot: 'slide-1', name: 'slide-01.mp4', kind: 'slide', contentType: 'video/mp4', bytes: 12, fingerprint: FINGERPRINT, reused: false });
  assert.equal(view.files[0].key, undefined);
  assert.equal(view.files[0].storageReference, undefined);
  assert.equal(publicCarouselStorageView(null), null);
});
