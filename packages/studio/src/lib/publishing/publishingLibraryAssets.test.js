import test from 'node:test';
import assert from 'node:assert/strict';
import { publishingLibraryAssets } from './publishingLibraryAssets.js';

test('Publishing composer includes account-loaded Chat images and videos, excluding audio', () => {
  const assets = publishingLibraryAssets(
    [{ id: 'local-image', type: 'image', url: 'https://cdn.test/local.png' }],
    [
      { id: 'chat-image', type: 'image', metadata: { modality: 'image' }, storageReference: 'https://cdn.test/chat.png' },
      { id: 'chat-video', type: 'video', metadata: { modality: 'video' }, storageReference: 'https://cdn.test/chat.mp4' },
      { id: 'chat-audio', type: 'audio', metadata: { modality: 'audio' }, storageReference: 'https://cdn.test/chat.mp3' },
    ],
  );
  assert.deepEqual(assets.map((asset) => asset.id).sort(), ['chat-image', 'chat-video', 'local-image']);
});
