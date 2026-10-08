import { muApiProvider } from '../../packages/studio/src/lib/providers/MuApiProvider.js';
import { extractVideoPrompt } from '../../packages/studio/src/lib/mavenVideoIntent.js';
import { resolveProviderCredential } from './providerCredentialResolver.js';
import { selectMavenVideoRoute, stripVideoRoutingFromPrompt } from './mavenVideoModelRouter.js';

export const MAVEN_VIDEO_TIMEOUT_MS = 180000;

function videoError(code, message, status) {
  return Object.assign(new Error(message), { code, status });
}

function httpsUrl(value) {
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
}

export async function generateMavenVideo({
  identity,
  prompt,
  signal,
  credentialResolver = resolveProviderCredential,
  provider = muApiProvider,
  timeoutMs = MAVEN_VIDEO_TIMEOUT_MS,
} = {}) {
  if (!identity) throw videoError('creator_os_auth_required', 'Creator OS authentication required.', 401);
  const safePrompt = extractVideoPrompt(prompt);
  if (!safePrompt) throw videoError('video_prompt_required', 'Describe the video you want to create.', 400);
  const route = selectMavenVideoRoute(safePrompt);

  let apiKey;
  try {
    apiKey = await credentialResolver({
      accountId: identity.accountId,
      creatorIdentityKey: identity.identityKey || identity.creatorId || identity.userId,
      providerId: 'muapi',
      operation: 'video_generation',
    });
  } catch (error) {
    if (String(error?.code || '').startsWith('provider_credential')) {
      throw videoError('video_provider_credential_required', 'Connect your MuAPI API key in Settings to generate videos.', 400);
    }
    throw error;
  }
  if (!apiKey) throw videoError('video_provider_credential_required', 'Connect your MuAPI API key in Settings to generate videos.', 400);

  const promptText = stripVideoRoutingFromPrompt(safePrompt, route.model) || safePrompt;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onCallerAbort = () => controller.abort();
  signal?.addEventListener?.('abort', onCallerAbort, { once: true });
  let url = null;
  try {
    const result = await provider.generateVideo(apiKey, {
      model: route.model.id,
      prompt: promptText,
      ...route.inputs,
      signal: controller.signal,
    });
    url = result?.url || result?.outputReferences?.[0] || result?.outputs?.[0] || null;
  } catch (error) {
    const code = String(error?.code || '');
    if (controller.signal.aborted && !signal?.aborted) {
      throw videoError('video_generation_timeout', 'Video generation timed out. Please try again.', 504);
    }
    if (code.startsWith('provider_credential')) {
      throw videoError('video_provider_credential_required', 'Connect your MuAPI API key in Settings to generate videos.', 400);
    }
    if (code === 'provider_model_unsupported' || code === 'provider_operation_unsupported') {
      throw videoError('video_generation_unsupported', 'This video model is not available for generation.', 422);
    }
    throw videoError('video_generation_failed', 'Video generation failed. Please try again.', 502);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.('abort', onCallerAbort);
  }
  if (typeof url !== 'string' || !httpsUrl(url)) {
    throw videoError('video_generation_failed', 'Video generation returned no usable video URL.', 502);
  }
  return {
    url,
    prompt: promptText,
    model: route.model.id,
    modelName: route.model.name,
    provider: 'muapi',
    duration: route.inputs.duration,
    aspectRatio: route.inputs.aspect_ratio,
    resolution: route.inputs.resolution || null,
  };
}

export function buildGeneratedVideoReply({ url, modelName, duration, aspectRatio }) {
  const credit = modelName ? ` with ${modelName}` : '';
  const settings = [duration ? `${duration}s` : null, aspectRatio || null].filter(Boolean).join(' · ');
  return [
    `Here's your video${credit}${settings ? ` (${settings})` : ''}.`,
    '',
    `[Play or download the generated video](${url})`,
  ].join('\n');
}
