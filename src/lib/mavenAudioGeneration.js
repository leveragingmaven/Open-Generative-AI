import { muApiProvider } from '../../packages/studio/src/lib/providers/MuApiProvider.js';
import { resolveProviderCredential } from './providerCredentialResolver.js';
import { selectMavenAudioRoute } from './mavenAudioModelRouter.js';

function audioError(code, message, status) { return Object.assign(new Error(message), { code, status }); }
function httpsUrl(value) { try { return new URL(value).protocol === 'https:'; } catch { return false; } }

export async function generateMavenAudio({ identity, prompt, signal, credentialResolver = resolveProviderCredential, provider = muApiProvider } = {}) {
  if (!identity) throw audioError('creator_os_auth_required', 'Creator OS authentication required.', 401);
  const route = selectMavenAudioRoute(prompt);
  let apiKey;
  try {
    apiKey = await credentialResolver({ accountId: identity.accountId, creatorIdentityKey: identity.identityKey || identity.creatorId || identity.userId, providerId: 'muapi', operation: 'audio_generation' });
  } catch (error) {
    if (String(error?.code || '').startsWith('provider_credential')) throw audioError('audio_provider_credential_required', 'Connect your MuAPI API key in Settings to generate speech.', 400);
    throw error;
  }
  if (!apiKey) throw audioError('audio_provider_credential_required', 'Connect your MuAPI API key in Settings to generate speech.', 400);
  let result;
  try {
    result = await provider.generateAudio(apiKey, { ...route.inputs, _modelId: route.model.id, signal });
  } catch (error) {
    if (String(error?.code || '').startsWith('provider_credential')) throw audioError('audio_provider_credential_required', 'Connect your MuAPI API key in Settings to generate speech.', 400);
    if (error?.code === 'provider_model_unsupported' || error?.code === 'provider_operation_unsupported') throw audioError('audio_generation_unsupported', 'This speech model is not available for generation.', 422);
    throw audioError('audio_generation_failed', 'Speech generation failed. Please try again.', 502);
  }
  const url = result?.url || result?.outputReferences?.[0] || result?.outputs?.[0] || result?.output?.url;
  if (!httpsUrl(url)) throw audioError('audio_generation_failed', 'Speech generation returned no usable audio URL.', 502);
  return { url, prompt: route.script, model: route.model.id, modelName: route.model.name, provider: 'muapi', voiceId: route.inputs.voice_id };
}

export function buildGeneratedAudioReply({ url, modelName, voiceId, referenceUnavailable = false } = {}) {
  const details = [modelName, voiceId].filter(Boolean).join(' · ');
  return [
    `Here's your generated speech${details ? ` (${details})` : ''}.`,
    '',
    `[Play or download the generated audio](${url})`,
    ...(referenceUnavailable ? ['', 'This audio could not be registered as a conversation asset, so it cannot be reused for lip sync in a later turn.'] : []),
  ].join('\n');
}
