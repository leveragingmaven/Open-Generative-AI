import test from 'node:test';
import assert from 'node:assert/strict';
import { isLipSyncRequest } from './mavenLipSyncIntent.js';

test('prioritizes talking-character and lip-sync requests over generic video intents', () => {
  for (const text of ['Make this character say “Hello”.', 'Lip sync this avatar to my audio.', 'Use this image and voiceover to create a talking character.', 'Sync the lips to this audio']) assert.equal(isLipSyncRequest(text), true, text);
  assert.equal(isLipSyncRequest('Create a video of a talking dog.'), false);
});
