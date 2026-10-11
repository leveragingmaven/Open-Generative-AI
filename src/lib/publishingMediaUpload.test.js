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

// The composer's own upload control is one of the required publishing steps, so a creator without the
// credential media storage needs must be told which key to add and where, not handed a dead end.
test('a missing customer credential names the MuAPI key and Settings', async () => {
  for (const missing of ['throws', 'returns-nothing']) {
    const response = await handlePublishingMediaUpload(uploadRequest('image/png'), {
      identity: { accountId: 'account-1', identityKey: 'creator-1' },
      agencyMode: false,
      credentialResolver: async () => { if (missing === 'throws') throw new Error('provider_credential_required:muapi'); return null; },
    });
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.code, 'upload_credential_unavailable');
    assert.equal(body.error, 'Connect your MuAPI API key in Settings to upload media.');
  }
});

// Agency uploads use the server-owned key, so a creator there must not be sent to a key field they do not manage.
test('an agency deployment missing its server key does not send the creator to Settings', async () => {
  const response = await handlePublishingMediaUpload(uploadRequest('image/png'), {
    identity: { accountId: 'account-1', identityKey: 'creator-1' },
    agencyMode: true,
    serverKey: '',
  });
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.code, 'upload_credential_unavailable');
  assert.equal(body.error, 'Media upload is unavailable for this deployment.');
  assert.doesNotMatch(body.error, /Settings/);
});

test('upload rejects media outside supported publishing formats', async () => {
  const response = await handlePublishingMediaUpload(uploadRequest('audio/mpeg'), {
    identity: { accountId: 'account-1', identityKey: 'creator-1' }, agencyMode: true, serverKey: 'secret',
  });
  assert.equal(response.status, 415);
});
