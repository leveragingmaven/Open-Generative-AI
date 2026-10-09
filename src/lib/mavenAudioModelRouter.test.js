import test from 'node:test';
import assert from 'node:assert/strict';
import { audioModels } from '../../packages/studio/src/models.js';
import { selectMavenAudioRoute } from './mavenAudioModelRouter.js';
import { newCloneIdError } from '../../packages/studio/src/lib/audio/customVoiceId.js';

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

test('routes a cloned voice ID through unchanged instead of the catalog default', () => {
  const cloneId = 'sf02174c-5f5d-46e6-8758-7544128c27b2';
  const route = selectMavenAudioRoute(`Narrate with voice id ${cloneId}: “Welcome to the studio.”`);
  assert.equal(route.model.id, 'minimax-speech-2.6-hd');
  assert.equal(route.inputs.voice_id, cloneId);
  assert.notEqual(route.inputs.voice_id, 'Friendly_Person');
  assert.equal(route.inputs.prompt, 'Welcome to the studio.');
});

test('an explicitly named system voice still comes from the shared catalog', () => {
  const route = selectMavenAudioRoute('Narrate with voice id Calm_Woman: “Hello there.”');
  assert.equal(route.inputs.voice_id, 'Calm_Woman');
});

test('a malformed cloned voice ID is reported instead of defaulted', () => {
  assert.throws(() => selectMavenAudioRoute('Narrate with voice id abc: “Hello there.”'), { code: 'audio_option_unsupported' });
  assert.throws(() => selectMavenAudioRoute('Narrate with voice id bad.id: “Hello there.”'), { code: 'audio_option_unsupported' });
});

test('a custom voice ID is refused where the voice field is a closed list', () => {
  const speech = audioModels.find((model) => model.id === 'minimax-speech-2.6-hd');
  const closed = { ...speech, inputs: { ...speech.inputs, voice_id: { ...speech.inputs.voice_id, typing: false } } };

  assert.throws(
    () => selectMavenAudioRoute('Narrate with voice id sf02174c-5f5d-46e6-8758-7544128c27b2: “Hello there.”', { catalog: [closed] }),
    { code: 'audio_option_unsupported' },
  );

  // The same catalog still accepts a listed system voice.
  const system = selectMavenAudioRoute('Narrate with voice id Calm_Woman: “Hello there.”', { catalog: [closed] });
  assert.equal(system.inputs.voice_id, 'Calm_Woman');
});

test('clone-then-speak: the ID created by the clone model speaks unchanged', () => {
  const clonedId = 'voice01abcdef';
  assert.equal(newCloneIdError(clonedId), null);
  const clone = audioModels.find((model) => model.id === 'minimax-voice-clone');
  assert.ok(clone.required.includes('custom_voice_id'));

  const route = selectMavenAudioRoute(`Use Minimax Speech Turbo with voice id ${clonedId} to narrate “Cloned voices work.”`);
  assert.equal(route.model.id, 'minimax-speech-2.6-turbo');
  assert.equal(route.inputs.voice_id, clonedId);
  assert.equal(route.inputs.prompt, 'Cloned voices work.');
});
