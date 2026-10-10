import test from 'node:test';
import assert from 'node:assert/strict';
import { persistMavenChatAsset, ownedMavenChatReferences, mavenLibraryReferenceId } from './mavenChatCreativeAsset.js';
import { DesignAgentConversationReader } from './designAgentConversationReader.js';
import { resolveLastTrustedImageReference } from './designAgentConversationEndpoint.js';

const owner = { accountId: '42', identityKey: 'creator:one' };
const copyMedia = async ({ accountId, assetId, kind }) => ({ storageReference: `storage://creator-os/production/accounts/${accountId}/assets/${assetId}/primary`, contentType: { image: 'image/png', video: 'video/mp4', audio: 'audio/mpeg' }[kind], sizeBytes: 12, checksum: 'checksum' });
const signAsset = async (asset) => ({ ...asset, storageReference: `https://r2.test/${asset.id}`, url: `https://r2.test/${asset.id}` });
const saveOptions = (store) => ({ repository: store, copyMedia });
const loadOptions = (store) => ({ repository: store, signAsset });

function repository() {
  const rows = new Map();
  return {
    db: {},
    rows,
    async saveOnConnection(_db, asset) {
      if (!rows.has(asset.id)) rows.set(asset.id, asset);
      return rows.get(asset.id);
    },
    async list({ accountId }) { return [...rows.values()].filter((asset) => asset.accountId === accountId); },
  };
}

test('completed image, edited image, video, and audio use one owned durable library with useful metadata and retry deduplication', async () => {
  const store = repository();
  const outputs = [
    ['image', { url: 'https://cdn.test/image.jpg', prompt: 'Create an image', provider: 'fal', model: 'flux' }],
    ['image', { url: 'https://cdn.test/edit.jpg', prompt: 'Refine the image', provider: 'muapi', model: 'edit-model', operation: 'image_editing' }],
    ['video', { url: 'https://cdn.test/video.mp4', prompt: 'Animate the image', provider: 'muapi', model: 'seedance', duration: 5 }],
    ['audio', { url: 'https://cdn.test/audio.mp3', prompt: 'Hello', provider: 'muapi', model: 'minimax', voiceId: 'voice-1' }],
  ];
  for (const [kind, media] of outputs) {
    const first = await persistMavenChatAsset(owner, { conversationId: 'session-1', kind, media, sessionAssetId: `asset_session_${kind}`, campaignId: 'project-1' }, saveOptions(store));
    const retry = await persistMavenChatAsset(owner, { conversationId: 'session-1', kind, media }, saveOptions(store));
    assert.equal(retry.id, first.id);
    assert.equal(first.accountId, owner.accountId);
    assert.equal(first.creatorIdentityKey, owner.identityKey);
    assert.equal(first.kind, kind);
    assert.equal(first.model, media.model);
    assert.equal(first.provider, media.provider);
    assert.ok(first.storageReference.startsWith('storage://creator-os/production/'));
    assert.equal(first.campaignId, 'project-1');
    assert.equal(first.metadata.sessionAssetId, `asset_session_${kind}`);
    assert.ok(first.createdAt);
  }
  assert.equal(store.rows.size, 4);
  assert.equal((await ownedMavenChatReferences(owner, 'session-2', loadOptions(store))).length, 4);
});

test('invalid or failed output cannot create a completed library asset', async () => {
  const store = repository();
  await assert.rejects(() => persistMavenChatAsset(owner, { conversationId: 's', kind: 'image', media: { url: 'http://untrusted.test/image.jpg' } }, { repository: store }));
  await assert.rejects(() => persistMavenChatAsset(owner, { conversationId: 's', kind: 'image', media: {} }, { repository: store }));
  assert.equal(store.rows.size, 0);
  await assert.rejects(() => persistMavenChatAsset(owner, { conversationId: 's', kind: 'image', media: { url: 'https://cdn.test/output.png' } }, {
    repository: store, copyMedia: async () => { throw new Error('provider expired'); },
  }), /provider expired/);
  assert.equal(store.rows.size, 0);
});

test('owned library assets restore missing session references and work across new sessions without another upload', async () => {
  const store = repository();
  const saved = await persistMavenChatAsset(owner, { conversationId: 'old-session', kind: 'image', media: { url: 'https://cdn.test/image.jpg' }, sessionAssetId: 'asset_old_label' }, saveOptions(store));
  const studioAsset = { id: 'asset-studio-video', accountId: owner.accountId, creatorIdentityKey: owner.identityKey, agentId: 'studio', conversationId: 'studio-session', type: 'generated', metadata: { modality: 'video' }, storageReference: 'https://cdn.test/studio.mp4' };
  store.rows.set(studioAsset.id, studioAsset);
  const provider = {
    async getSession() { return { messages: [{ role: 'assistant', content: '![image](https://cdn.test/image.jpg)', attachments: ['asset_old_label'] }] }; },
    async getSessionAssets() { return []; },
  };
  const reader = new DesignAgentConversationReader({
    designAgentProvider: provider,
    ownershipService: { async verifyOwnedSession() {} },
    loadOwnedCreativeAssets: (identity, sessionId) => ownedMavenChatReferences(identity, sessionId, loadOptions(store)),
  });
  const old = await reader.read({ agentId: 'design-agent', conversationId: 'old-session', identity: owner });
  assert.ok(old.attachments.some((item) => item.attachmentId === 'asset_old_label'));
  assert.ok(old.attachments.some((item) => item.attachmentId === saved.id));
  const next = await reader.read({ agentId: 'design-agent', conversationId: 'new-session', identity: owner });
  assert.ok(next.attachments.some((item) => item.attachmentId === mavenLibraryReferenceId(saved)));
  assert.ok(next.attachments.some((item) => item.attachmentId === mavenLibraryReferenceId(studioAsset) && item.kind === 'video'));
  assert.ok(!next.attachments.some((item) => item.attachmentId === 'asset_old_label'));
  assert.deepEqual(await ownedMavenChatReferences({ accountId: 'other', identityKey: 'creator:other' }, 'new-session', loadOptions(store)), []);
  assert.deepEqual(await ownedMavenChatReferences({ accountId: '42', identityKey: 'creator:other' }, 'new-session', loadOptions(store)), []);
});

test('an image-only transcript is recovered by exact owner-library URL, never a foreign URL', async () => {
  const store = repository();
  const saved = await persistMavenChatAsset(owner, { conversationId: 'session-1', kind: 'image', media: { url: 'https://cdn.test/owned.png' } }, saveOptions(store));
  const messages = [{ role: 'assistant', content: '![owned](https://cdn.test/owned.png)' }];
  const reader = new DesignAgentConversationReader({
    designAgentProvider: { async getSession() { return { messages }; }, async getSessionAssets() { return []; } },
    ownershipService: { async verifyOwnedSession() {} },
    loadOwnedCreativeAssets: (identity, sessionId) => ownedMavenChatReferences(identity, sessionId, loadOptions(store)),
  });
  const owned = await reader.read({ agentId: 'design-agent', conversationId: 'session-1', identity: owner });
  assert.ok([saved.id, mavenLibraryReferenceId(saved)].includes(owned.imageReferences[0].attachments[0].attachmentId));
  messages[0] = { role: 'assistant', content: '![foreign](https://cdn.test/foreign.png)' };
  const foreign = await reader.read({ agentId: 'design-agent', conversationId: 'session-1', identity: owner });
  assert.deepEqual(foreign.imageReferences[0].attachments, []);
  assert.equal(resolveLastTrustedImageReference(foreign, 'session-1'), null);
  messages.unshift({ role: 'assistant', content: '![owned](https://cdn.test/owned.png)' });
  const latestUnavailable = await reader.read({ agentId: 'design-agent', conversationId: 'session-1', identity: owner });
  assert.equal(resolveLastTrustedImageReference(latestUnavailable, 'session-1'), null);
});
