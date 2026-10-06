import assert from 'node:assert/strict';
import test from 'node:test';
import { handlePublishingMediaUpload } from './publishingMediaUpload.js';

function uploadRequest(type = 'image/png') {
  const body = new FormData();
  body.append('file', new Blob(['media'], { type }), type.startsWith('image/') ? 'photo.png' : 'clip.mp4');
  return new Request('https://app.test/api/publishing/media', { method: 'POST', body });
}

test('upload saves a tenant-owned image or video via existing MuAPI storage', async () => {
  for (const type of ['image/png', 'video/mp4']) {
    let stored;
    const repository = { db: {}, async saveOnConnection(db, asset) { assert.equal(db, this.db); stored = asset; return asset; } };
    const response = await handlePublishingMediaUpload(uploadRequest(type), {
      identity: { accountId: 'account-1', identityKey: 'creator-1' }, repository,
      agencyMode: true, serverKey: 'secret', baseUrl: 'https://api.muapi.test',
      fetchImpl: async (url, options) => {
        assert.equal(url, 'https://api.muapi.test/api/v1/upload_file');
        assert.equal(options.headers['x-api-key'], 'secret');
        assert.equal(options.body.get('file').type, type);
        return Response.json({ url: `https://cdn.test/${type.startsWith('image/') ? 'photo.png' : 'clip.mp4'}` });
      },
    });
    assert.equal(response.status, 201);
    assert.equal(stored.accountId, 'account-1');
    assert.equal(stored.creatorIdentityKey, 'creator-1');
    assert.equal(stored.metadata.modality, type.startsWith('image/') ? 'image' : 'video');
    assert.equal(stored.url, (await response.json()).asset.url);
  }
});

test('upload rejects media outside supported publishing formats', async () => {
  const response = await handlePublishingMediaUpload(uploadRequest('audio/mpeg'), {
    identity: { accountId: 'account-1', identityKey: 'creator-1' }, agencyMode: true, serverKey: 'secret',
  });
  assert.equal(response.status, 415);
});
