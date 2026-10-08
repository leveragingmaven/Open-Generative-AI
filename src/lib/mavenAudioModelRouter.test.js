import test from 'node:test';
import assert from 'node:assert/strict';
import { audioModels } from '../../packages/studio/src/models.js';
import { selectMavenAudioRoute } from './mavenAudioModelRouter.js';

test('selects an explicitly requested speech model and validates voice settings from the shared catalog', () => {
  const route = selectMavenAudioRoute('Use Minimax Speech Turbo with English_Upbeat_Woman to narrate “Welcome.”');
  assert.equal(route.model.id, 'minimax-speech-2.6-turbo');
  assert.equal(route.inputs.voice_id, 'English_Upbeat_Woman');
  assert.equal(route.inputs.prompt, 'Welcome.');
});

test('rejects non-TTS audio models and unsupported speeds/languages instead of substituting', () => {
  assert.throws(() => selectMavenAudioRoute('Use Gemini 3.1 Flash TTS to read “Hello.”'), { code: 'audio_model_unavailable' });
  assert.throws(() => selectMavenAudioRoute('Narrate at speed 2.5: “Hello.”'), { code: 'audio_option_unsupported' });
  assert.throws(() => selectMavenAudioRoute('Narrate this in Klingon: “Hello.”'), { code: 'audio_option_unsupported' });
});

test('requires the selected speech models and voices to exist in the current shared catalog', () => {
  const speech = audioModels.find((model) => model.id === 'minimax-speech-2.6-hd');
  assert.ok(speech.inputs.voice_id.enum.includes('Calm_Woman'));
  assert.ok(speech.inputs.speed.minValue <= 1 && speech.inputs.speed.maxValue >= 1);
});
