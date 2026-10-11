import { muApiProvider } from '../../packages/studio/src/lib/providers/MuApiProvider.js';
import { extractVideoPrompt } from '../../packages/studio/src/lib/mavenVideoIntent.js';
import { resolveProviderCredential } from './providerCredentialResolver.js';
import { selectMavenVideoRoute, stripVideoRoutingFromPrompt } from './mavenVideoModelRouter.js';
import {
  resolveApprovedVideoRoute,
  videoCostTier,
  videoSelectionReason,
} from './mavenVideoApproval.js';

export const MAVEN_VIDEO_TIMEOUT_MS = 180000;

function videoError(code, message, status) {
  return Object.assign(new Error(message), { code, status });
}

function httpsUrl(value) {
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
}

/**
 * Generates one video with exactly one model.
 *
 * `approved` carries the authorization the customer gave for a model above the
 * budget tier (see mavenVideoApproval.js). When it is present the route is
 * re-derived from the same prompt and must match the approved model and
 * settings, so an approval can never execute a model the router would not have
 * selected for that prompt.
 *
 * A failed generation is never retried with a different (or more expensive)
 * model: the provider is called once and the sanitized error is returned.
 */
export async function generateMavenVideo({
  identity,
  prompt,
  signal,
  approved = null,
  credentialResolver = resolveProviderCredential,
  provider = muApiProvider,
  timeoutMs = MAVEN_VIDEO_TIMEOUT_MS,
} = {}) {
  if (!identity) throw videoError('creator_os_auth_required', 'Creator OS authentication required.', 401);
  const safePrompt = extractVideoPrompt(prompt);
  if (!safePrompt) throw videoError('video_prompt_required', 'Describe the video you want to create.', 400);
  const route = approved
    ? resolveApprovedVideoRoute({ ...approved, kind: approved.kind || 't2v', prompt: safePrompt })
    : selectMavenVideoRoute(safePrompt);
  const tier = videoCostTier({ model: route.model, inputs: route.inputs });

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
    providerName: route.model.provider_name || route.model.provider || null,
    duration: route.inputs.duration,
    aspectRatio: route.inputs.aspect_ratio,
    resolution: route.inputs.resolution || null,
    // Requested vs executed model, so a substitution is visible in the asset
    // metadata and in the reply instead of having to be inferred from the output.
    requestedModel: route.mode === 'explicit' ? route.model.id : null,
    executedModel: route.model.id,
    selectionMode: route.mode,
    costTier: tier,
    overrideReason: videoSelectionReason(route.mode, tier),
    approvalStatus: approved ? 'approved' : 'not_required',
    operation: 'text_to_video',
  };
}

/**
 * Human summary of the exact model and settings used, plus why it was chosen.
 */
export function describeVideoProvenance({ providerName, modelName, duration, aspectRatio, resolution, overrideReason, approvalStatus } = {}) {
  const credit = [providerName, modelName].filter(Boolean).join(' · ');
  const settings = [aspectRatio || null, duration ? `${duration}s` : null, resolution || null].filter(Boolean).join(' · ');
  const reason = {
    explicit_model_request: 'you requested this model',
    quality_signal_auto_upgrade: 'selected automatically for a higher-quality request',
    auto_default: 'the budget default',
  }[overrideReason] || null;
  const authorization = approvalStatus === 'approved' ? 'confirmed by you' : null;
  return [
    [credit, settings].filter(Boolean).join(' · '),
    reason,
    authorization,
  ].filter(Boolean).join(' — ');
}

export function buildGeneratedVideoReply({ url, modelName, duration, aspectRatio, provenance = null }) {
  const credit = modelName ? ` with ${modelName}` : '';
  const settings = [duration ? `${duration}s` : null, aspectRatio || null].filter(Boolean).join(' · ');
  return [
    `Here's your video${credit}${settings ? ` (${settings})` : ''}.`,
    '',
    `[Play or download the generated video](${url})`,
    ...(provenance ? ['', `_${provenance}_`] : []),
  ].join('\n');
}
