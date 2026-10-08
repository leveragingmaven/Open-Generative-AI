import { muApiProvider } from '../../packages/studio/src/lib/providers/MuApiProvider.js';
import { extractVideoPrompt } from '../../packages/studio/src/lib/mavenVideoIntent.js';
import { resolveProviderCredential } from './providerCredentialResolver.js';
import { selectMavenImageToVideoRoute } from './mavenImageToVideoModelRouter.js';

function errorWith(code, message, status) { return Object.assign(new Error(message), { code, status }); }
function httpsUrl(value) { try { return new URL(value).protocol === 'https:'; } catch { return false; } }

export async function generateMavenImageToVideo({ identity, prompt, imageUrl, signal, credentialResolver = resolveProviderCredential, provider = muApiProvider, timeoutMs = 180000 } = {}) {
  if (!identity) throw errorWith('creator_os_auth_required', 'Creator OS authentication required.', 401);
  const safePrompt = extractVideoPrompt(prompt);
  if (!safePrompt) throw errorWith('video_prompt_required', 'Describe how you want to animate the image.', 400);
  if (!httpsUrl(imageUrl)) throw errorWith('image_source_unavailable', 'The trusted image reference is not available for animation.', 422);
  const route = selectMavenImageToVideoRoute(safePrompt);
  let apiKey;
  try {
    apiKey = await credentialResolver({ accountId: identity.accountId, creatorIdentityKey: identity.identityKey || identity.creatorId || identity.userId, providerId: 'muapi', operation: 'video_generation' });
  } catch (error) {
    if (String(error?.code || '').startsWith('provider_credential')) throw errorWith('video_provider_credential_required', 'Connect your MuAPI API key in Settings to generate videos.', 400);
    throw error;
  }
  if (!apiKey) throw errorWith('video_provider_credential_required', 'Connect your MuAPI API key in Settings to generate videos.', 400);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const abort = () => controller.abort();
  signal?.addEventListener?.('abort', abort, { once: true });
  let url;
  try {
    const result = await provider.generateI2V(apiKey, {
      model: route.model.id,
      prompt: safePrompt,
      image_url: imageUrl,
      ...route.inputs,
      signal: controller.signal,
    });
    url = result?.url || result?.outputReferences?.[0] || result?.outputs?.[0] || null;
  } catch (error) {
    if (controller.signal.aborted && !signal?.aborted) throw errorWith('video_generation_timeout', 'Image-to-video generation timed out. Please try again.', 504);
    if (String(error?.code || '').startsWith('provider_credential')) throw errorWith('video_provider_credential_required', 'Connect your MuAPI API key in Settings to generate videos.', 400);
    if (error?.code === 'provider_model_unsupported' || error?.code === 'provider_operation_unsupported') throw errorWith('video_generation_unsupported', 'This image-to-video model is not available.', 422);
    throw errorWith('video_generation_failed', 'Image-to-video generation failed. Please try again.', 502);
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener?.('abort', abort);
  }
  if (!httpsUrl(url)) throw errorWith('video_generation_failed', 'Image-to-video returned no usable video URL.', 502);
  return { url, prompt: safePrompt, model: route.model.id, modelName: route.model.name, provider: 'muapi', operation: 'image_to_video', duration: route.inputs.duration || null, aspectRatio: route.inputs.aspect_ratio || null };
}
