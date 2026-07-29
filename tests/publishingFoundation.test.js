const test = require('node:test');
const assert = require('node:assert/strict');

function memoryStorage() {
    const store = new Map();
    return {
        getItem: (key) => store.has(key) ? store.get(key) : null,
        setItem: (key, value) => store.set(key, value),
        removeItem: (key) => store.delete(key),
    };
}

function imageDraft(overrides = {}) {
    return {
        id: 'draft-1',
        assets: [{ assetId: 'asset-1', url: 'https://cdn.example.test/image.jpg', type: 'image' }],
        caption: 'Caption',
        platforms: ['instagram'],
        scheduledAt: '2026-08-01T15:00:00.000Z',
        timezone: 'America/Chicago',
        ...overrides,
    };
}

test('publishing draft normalization preserves timezone and platform overrides', async () => {
    const { normalizePublishingDraft } = await import('../packages/studio/src/lib/publishing/publishingTypes.js');
    const draft = normalizePublishingDraft(imageDraft({
        platformOverrides: { instagram: { caption: 'IG caption' } },
    }));

    assert.equal(draft.timezone, 'America/Chicago');
    assert.equal(draft.platformOverrides.instagram.caption, 'IG caption');
    assert.deepEqual(draft.assetIds, ['asset-1']);
    assert.equal(draft.status, 'draft');
});

test('platform capability validation rejects unsupported media types', async () => {
    const { platformCapabilityRegistry } = await import('../packages/studio/src/lib/publishing/platformCapabilities.js');
    const { validatePublishingDraft } = await import('../packages/studio/src/lib/publishing/publishingTypes.js');

    assert.throws(
        () => validatePublishingDraft(imageDraft({
            assets: [{ assetId: 'asset-1', url: 'https://cdn.example.test/image.jpg', type: 'image' }],
            platforms: ['tiktok'],
        }), platformCapabilityRegistry),
        /does not support image/
    );
});

test('unknown platform capabilities remain explicit unknowns', async () => {
    const { platformCapabilityRegistry } = await import('../packages/studio/src/lib/publishing/platformCapabilities.js');
    const capabilities = platformCapabilityRegistry.getPlatformCapabilities('threads');

    assert.equal(capabilities.platform, 'threads');
    assert.equal(capabilities.mediaTypes, 'unknown');
    assert.equal(capabilities.supportsScheduling, 'unknown');
});

test('unsupported publishing operations return explicit capability errors', async () => {
    const { PublishingProvider } = await import('../packages/studio/src/lib/publishing/PublishingProvider.js');
    const provider = new PublishingProvider({ id: 'test', name: 'Test' });

    assert.throws(
        () => provider.connectAccount(),
        (error) => error.code === 'unsupported_capability'
    );
});

test('publishing status mapping supports partial platform failure', async () => {
    const { normalizePublishingJob } = await import('../packages/studio/src/lib/publishing/publishingTypes.js');
    const job = normalizePublishingJob({
        id: 'job-1',
        status: 'partial_success',
        platformResults: {
            instagram: { status: 'published' },
            tiktok: { status: 'failed', error: 'account expired' },
        },
    });

    assert.equal(job.status, 'partially_published');
    assert.equal(job.platformResults.instagram.status, 'published');
    assert.equal(job.platformResults.tiktok.status, 'failed');
});

test('duplicate publishing submissions are rejected before a second request is sent', async () => {
    const { MuApiPublishingProvider } = await import('../packages/studio/src/lib/publishing/MuApiPublishingProvider.js');
    let requests = 0;
    let resolveResponse;
    const pending = new Promise((resolve) => {
        resolveResponse = resolve;
    });
    const provider = new MuApiPublishingProvider({
        fetchFn: async () => {
            requests += 1;
            await pending;
            return {
                ok: true,
                json: async () => ({ id: 'job-1', status: 'scheduled', providerJobId: 'muapi-job-1' }),
            };
        },
        mavenSyncClient: { isEnabled: () => false },
    });

    const first = provider.schedulePost(imageDraft(), { storage: memoryStorage(), idempotencyKey: 'same-key' });
    await assert.rejects(
        () => provider.schedulePost(imageDraft(), { storage: memoryStorage(), idempotencyKey: 'same-key' }),
        (error) => error.code === 'duplicate_submission'
    );
    resolveResponse();
    await first;
    assert.equal(requests, 1);
});

test('failed publishing preserves draft and asset references in local storage', async () => {
    const { MuApiPublishingProvider } = await import('../packages/studio/src/lib/publishing/MuApiPublishingProvider.js');
    const { readPublishingDrafts } = await import('../packages/studio/src/lib/publishing/publishingHistory.js');
    const storage = memoryStorage();
    const provider = new MuApiPublishingProvider({
        fetchFn: async () => ({
            ok: false,
            status: 502,
            json: async () => ({ error: 'Provider unavailable', code: 'provider_unavailable' }),
        }),
        mavenSyncClient: { isEnabled: () => false },
    });

    await assert.rejects(() => provider.schedulePost(imageDraft(), { storage }));
    const drafts = readPublishingDrafts(storage);

    assert.equal(drafts.length, 1);
    assert.equal(drafts[0].id, 'draft-1');
    assert.equal(drafts[0].assets[0].assetId, 'asset-1');
    assert.equal(drafts[0].status, 'failed');
});

test('Hub status report failure does not fail publishing result', async () => {
    const { reportPublishingStatusSafe } = await import('../packages/studio/src/lib/publishing/publishingStatusReporter.js');
    const result = await reportPublishingStatusSafe({
        isEnabled: () => true,
        reportPublishingStatus: async () => {
            throw new Error('Hub unavailable');
        },
    }, imageDraft(), { id: 'job-1', status: 'scheduled' });

    assert.equal(result.ok, false);
});

test('MuAPI publishing client payloads do not include credentials', async () => {
    const { MuApiPublishingProvider } = await import('../packages/studio/src/lib/publishing/MuApiPublishingProvider.js');
    let captured;
    const provider = new MuApiPublishingProvider({
        fetchFn: async (url, options) => {
            captured = { url, options };
            return {
                ok: true,
                json: async () => ({ id: 'job-1', status: 'scheduled' }),
            };
        },
        mavenSyncClient: { isEnabled: () => false },
    });

    await provider.schedulePost(imageDraft(), { storage: memoryStorage() });
    const body = JSON.parse(captured.options.body);

    assert.equal(captured.options.headers['x-api-key'], undefined);
    assert.equal(body.draft.assets[0].url, 'https://cdn.example.test/image.jpg');
    assert.equal(JSON.stringify(body).includes('MUAPI_API_KEY'), false);
});

test('expired temporary asset URLs fail validation', async () => {
    const { validatePublishingDraft } = await import('../packages/studio/src/lib/publishing/publishingTypes.js');
    const expiredUrl = 'https://cdn.example.test/image.jpg?X-Amz-Date=20200101T000000Z&X-Amz-Expires=60';

    assert.throws(
        () => validatePublishingDraft(imageDraft({
            assets: [{ assetId: 'asset-1', url: expiredUrl, type: 'image' }],
        })),
        /expired temporary asset URL/
    );
});
