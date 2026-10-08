import test from 'node:test';
import assert from 'node:assert/strict';
import { extractGeneratedAudioUrls, extractSpeechText, isAudioGenerationRequest } from './mavenAudioIntent.js';

test('detects speech and voice-over intents without hijacking music prompts', () => {
  for (const text of ['Maven, narrate this script in a warm female voice.', 'Create a professional voiceover for my product demo.', 'Turn this text into an audio recording.']) {
    assert.equal(isAudioGenerationRequest(text), true, text);
  }
  assert.equal(isAudioGenerationRequest('Create a song with a warm female voice.'), false);
});

test('extracts only explicitly supplied quoted or delimited speech text', () => {
  assert.equal(extractSpeechText('Narrate this in a warm voice: Hello from Maven.'), 'Hello from Maven.');
  assert.equal(extractSpeechText('Read aloud “Welcome to the studio.”'), 'Welcome to the studio.');
  assert.equal(extractSpeechText('Create a professional voiceover for my demo.'), '');
});

test('extracts only the generated audio result link', () => {
  assert.deepEqual(extractGeneratedAudioUrls('[Play or download the generated audio](https://cdn.example.test/voice.mp3)'), ['https://cdn.example.test/voice.mp3']);
  assert.deepEqual(extractGeneratedAudioUrls('[other](https://cdn.example.test/voice.mp3)'), []);
});
