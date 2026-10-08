import { lipsyncModels } from '../../packages/studio/src/models.js';
import { muApiProvider } from '../../packages/studio/src/lib/providers/MuApiProvider.js';
import { resolveProviderCredential } from './providerCredentialResolver.js';

function lipsyncError(code, message, status = 422) { return Object.assign(new Error(message), { code, status }); }
function httpsUrl(value) { try { return new URL(value).protocol === 'https:'; } catch { return false; } }
function normalize(value) { return ` ${String(value || '').toLowerCase().replace(/[^a-z0-9.]+/g, ' ').trim()} `; }

export function selectMavenLipSyncRoute(message, { inputKind, catalog = lipsyncModels } = {}) {
  const category = inputKind === 'video' ? 'video' : inputKind === 'image' ? 'image' : null;
  if (!category) throw lipsyncError('lipsync_input_required', 'Attach a character image or source video, plus an audio track or script.');
  const candidates = catalog.filter((model) => model.category === category);
  const normalized = normalize(message);
  const model = candidates.filter((candidate) => [candidate.id, candidate.name].some((name) => normalized.includes(normalize(name))))
    .sort((a, b) => Math.max(b.id.length, b.name.length) - Math.max(a.id.length, a.name.length))[0] || candidates[0];
  const requestedAny = catalog.find((candidate) => [candidate.id, candidate.name].some((name) => normalized.includes(normalize(name))));
  if (requestedAny && requestedAny.category !== category) throw lipsyncError('lipsync_model_unavailable', `${requestedAny.name} does not support ${category}-based lip sync.`);
  if (!model) throw lipsyncError('lipsync_model_unavailable', 'No compatible lip-sync model is available.');
  const inputs = {};
  const resolutionMatch = /\b(360p|480p|720p|1080p|720|1080)\b/i.exec(message || '');
  const resolutionField = model.inputs?.resolution || model.inputs?.output_resolution;
  if (resolutionMatch && !resolutionField) throw lipsyncError('lipsync_option_unsupported', `${model.name} does not support a resolution setting.`);
  if (resolutionField) {
    const resolution = resolutionMatch?.[1] || resolutionField.default || resolutionField.enum?.[0];
    if (resolutionField.enum && !resolutionField.enum.map(String).includes(String(resolution))) throw lipsyncError('lipsync_option_unsupported', `${model.name} does not support ${resolution}.`);
    inputs[model.inputs?.output_resolution ? 'output_resolution' : 'resolution'] = resolution;
  }
  if (model.inputs?.mode) {
    const requestedMode = model.inputs.mode.enum?.find((value) => new RegExp(`\b${value}\b`, 'i').test(message || ''));
    const mode = requestedMode || model.inputs.mode.default;
    if (model.inputs.mode.enum && !model.inputs.mode.enum.includes(mode)) throw lipsyncError('lipsync_option_unsupported', `${model.name} does not support mode ${mode}.`);
    inputs.mode = mode;
  }
  return { model, providerId: 'muapi', category, inputs };
}

export async function generateMavenLipSync({ identity, prompt = '', imageUrl, videoUrl, audioUrl, signal, credentialResolver = resolveProviderCredential, provider = muApiProvider } = {}) {
  if (!identity) throw lipsyncError('creator_os_auth_required', 'Creator OS authentication required.', 401);
  const inputKind = httpsUrl(imageUrl) ? 'image' : httpsUrl(videoUrl) ? 'video' : null;
  if (!inputKind) throw lipsyncError('lipsync_input_required', 'Attach a trusted character image or source video.');
  if (!httpsUrl(audioUrl)) throw lipsyncError('lipsync_audio_required', 'Attach a trusted audio track or provide a script for speech generation.');
  const route = selectMavenLipSyncRoute(prompt, { inputKind });
  let apiKey;
  try {
    apiKey = await credentialResolver({ accountId: identity.accountId, creatorIdentityKey: identity.identityKey || identity.creatorId || identity.userId, providerId: 'muapi', operation: 'lip_sync' });
  } catch (error) {
    if (String(error?.code || '').startsWith('provider_credential')) throw lipsyncError('lipsync_provider_credential_required', 'Connect your MuAPI API key in Settings to create a lip-synced video.', 400);
    throw error;
  }
  if (!apiKey) throw lipsyncError('lipsync_provider_credential_required', 'Connect your MuAPI API key in Settings to create a lip-synced video.', 400);
  let result;
  try {
    result = await provider.processLipSync(apiKey, { model: route.model.id, ...(inputKind === 'image' ? { image_url: imageUrl } : { video_url: videoUrl }), audio_url: audioUrl, ...(route.model.hasPrompt && prompt ? { prompt } : {}), ...route.inputs, signal });
  } catch (error) {
    if (String(error?.code || '').startsWith('provider_credential')) throw lipsyncError('lipsync_provider_credential_required', 'Connect your MuAPI API key in Settings to create a lip-synced video.', 400);
    if (error?.code === 'provider_model_unsupported' || error?.code === 'provider_operation_unsupported') throw lipsyncError('lipsync_generation_unsupported', 'This lip-sync model is not available for generation.');
    throw lipsyncError('lipsync_generation_failed', 'Lip-sync video generation failed. Please try again.', 502);
  }
  const url = result?.url || result?.outputReferences?.[0] || result?.outputs?.[0] || result?.output?.url;
  if (!httpsUrl(url)) throw lipsyncError('lipsync_generation_failed', 'Lip sync returned no usable video URL.', 502);
  return { url, model: route.model.id, modelName: route.model.name, provider: 'muapi', inputKind };
}

export function buildGeneratedLipSyncReply({ url, modelName, referenceUnavailable = false } = {}) {
  return [`Here's your lip-synced video${modelName ? ` (${modelName})` : ''}.`, '', `[Play or download the generated video](${url})`, ...(referenceUnavailable ? ['', 'This video could not be registered as a conversation asset, so it cannot be reused in a later turn.'] : [])].join('\n');
}
