const test = require('node:test');
const assert = require('node:assert/strict');

test('MavenSync launch context is absent in standalone URLs', async () => {
    const { parseLaunchContextFromUrl } = await import('../packages/studio/src/lib/mavensync/LaunchContext.js');
    const context = parseLaunchContextFromUrl('https://studio.example.test/studio/image');
    assert.equal(context, null);
});

test('MavenSync launch context accepts opaque launch IDs only', async () => {
    const { parseLaunchContextFromUrl } = await import('../packages/studio/src/lib/mavensync/LaunchContext.js');
    const context = parseLaunchContextFromUrl(
        'https://studio.example.test/studio/image?launchId=launch_123&projectId=proj-1&requestedStudio=image'
    );

    assert.equal(context.launchId, 'launch_123');
    assert.equal(context.projectId, 'proj-1');
    assert.equal(context.requestedStudio, 'image');
});

test('MavenSync launch context rejects invalid identifiers', async () => {
    const { parseLaunchContextFromUrl } = await import('../packages/studio/src/lib/mavensync/LaunchContext.js');
    const context = parseLaunchContextFromUrl(
        'https://studio.example.test/studio/image?launchId=<script>'
    );

    assert.equal(context, null);
});

test('MavenSync return target must match allowed origins', async () => {
    const { parseLaunchContextFromUrl } = await import('../packages/studio/src/lib/mavensync/LaunchContext.js');
    const allowed = parseLaunchContextFromUrl(
        'https://studio.example.test/studio/image?launchId=launch_123&returnTarget=https%3A%2F%2Fhub.mavensync.space%2Fcampaigns%2F1',
        { allowedReturnOrigins: ['https://hub.mavensync.space'] }
    );
    const blocked = parseLaunchContextFromUrl(
        'https://studio.example.test/studio/image?launchId=launch_123&returnTarget=https%3A%2F%2Fevil.example%2Fsteal',
        { allowedReturnOrigins: ['https://hub.mavensync.space'] }
    );

    assert.equal(allowed.returnTarget, 'https://hub.mavensync.space/campaigns/1');
    assert.equal(blocked, null);
});

test('MavenSync session normalization supports Agency globals', async () => {
    const { getBrowserSession } = await import('../packages/studio/src/lib/mavensync/MavenSyncSession.js');
    const session = getBrowserSession({
        AgencySession: {
            userId: 'user-1',
            email: 'person@example.test',
            displayName: 'Person',
            tenantId: 'tenant-1',
        },
    });

    assert.deepEqual(session, {
        userId: 'user-1',
        email: 'person@example.test',
        displayName: 'Person',
        role: null,
        tenantId: 'tenant-1',
        authenticated: true,
        source: 'AgencySession',
    });
});

test('MavenSync asset handoff normalizes image references with project context', async () => {
    const { normalizeAssetReference } = await import('../packages/studio/src/lib/mavensync/AssetHandoff.js');
    const asset = normalizeAssetReference(
        {
            id: 'asset-1',
            url: 'https://cdn.example.test/image.jpg',
            prompt: 'A product image',
            metadata: { studio: 'image' },
        },
        {
            session: { userId: 'user-1', tenantId: 'tenant-1' },
            launchContext: {
                projectId: 'project-1',
                campaignId: 'campaign-1',
                contentPlanId: 'plan-1',
            },
        }
    );

    assert.equal(asset.assetId, 'asset-1');
    assert.equal(asset.ownerId, 'user-1');
    assert.equal(asset.tenantId, 'tenant-1');
    assert.equal(asset.projectId, 'project-1');
    assert.equal(asset.campaignId, 'campaign-1');
    assert.equal(asset.type, 'image');
    assert.equal(asset.mimeType, 'image/jpeg');
    assert.equal(asset.metadata.contentPlanId, 'plan-1');
});

test('MavenSync asset registration failure preserves local asset reference', async () => {
    const { registerAssetSafe } = await import('../packages/studio/src/lib/mavensync/AssetHandoff.js');
    const assetReference = { assetId: 'asset-1', url: 'https://cdn.example.test/image.jpg' };
    const result = await registerAssetSafe({
        registerAsset: async () => {
            throw new Error('Hub unavailable');
        },
    }, assetReference);

    assert.equal(result.ok, false);
    assert.equal(result.assetReference, assetReference);
});
