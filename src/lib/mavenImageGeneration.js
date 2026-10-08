import { falProvider, FAL_MODEL_IDS } from '../../packages/studio/src/lib/providers/FalProvider.js';
import { muApiProvider } from '../../packages/studio/src/lib/providers/MuApiProvider.js';
import { extractImagePrompt } from '../../packages/studio/src/lib/mavenImageIntent.js';
import { resolveProviderCredential } from './providerCredentialResolver.js';
import { selectMavenImageRoute, stripRoutingFromPrompt } from './mavenImageModelRouter.js';

export const MAVEN_IMAGE_TIMEOUT_MS = 120000;

function imageError(code, message, status) {
  return Object.assign(new Error(message), { code, status });
}

function credentialRequiredError(transport, modelName) {
  if (transport === 'fal') {
    return imageError('image_provider_credential_required', 'Connect your fal.ai API key in Settings to generate images.', 400);
  }
  if (transport === 'muapi') {
    const subject = modelName ? `${modelName}` : 'this image model';
    return imageError('image_provider_credential_required', `Connect your MuAPI API key in Settings to use ${subject}.`, 400);
  }
  return imageError('image_provider_credential_required', 'Connect a MuAPI or fal.ai API key in Settings to generate images.', 400);
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Generates one image through the existing provider layer. Model selection comes
 * from the shared catalog (see mavenImageModelRouter). Keys are passed only to the
 * provider call and never returned, logged, or included in an error message.
 */
export async function generateMavenImage({
  identity,
  prompt,
  signal,
  credentialResolver = resolveProviderCredential,
  provider = falProvider,
  muapiProvider = muApiProvider,
  timeoutMs = MAVEN_IMAGE_TIMEOUT_MS,
} = {}) {
  if (!identity) throw imageError('creator_os_auth_required', 'Creator OS authentication required.', 401);
  const safePrompt = extractImagePrompt(prompt);
  if (!safePrompt) throw imageError('image_prompt_required', 'Describe the image you want to create.', 400);

  // Throws typed errors for unavailable or unsupported explicit requests; never substitutes a named model.
  const route = selectMavenImageRoute(safePrompt);

  const resolveKey = async (providerId) => {
    try {
      const key = await credentialResolver({
        accountId: identity.accountId,
        creatorIdentityKey: identity.identityKey || identity.creatorId || identity.userId,
        providerId,
        operation: 'image_generation',
      });
      return key || null;
    } catch (error) {
      if (String(error?.code || '').startsWith('provider_credential')) return null;
      throw error;
    }
  };

  let target = null;
  if (route.mode === 'explicit') {
    const apiKey = await resolveKey(route.transport);
    if (!apiKey) throw credentialRequiredError(route.transport, route.model.name);
    target = { transport: route.transport, apiKey, model: route.model, aspectRatio: route.aspectRatio, resolution: route.resolution };
  } else {
    const muapiKey = route.candidates.length ? await resolveKey('muapi') : null;
    if (muapiKey) {
      const model = route.candidates[0];
      target = { transport: 'muapi', apiKey: muapiKey, model, aspectRatio: route.aspectRatio, resolution: model.inputs?.resolution?.default || null };
    } else if (route.fallbackFal) {
      const falKey = await resolveKey('fal');
      if (falKey) target = { transport: 'fal', apiKey: falKey, model: { id: FAL_MODEL_IDS.TEXT_TO_IMAGE, name: 'FLUX Schnell' }, aspectRatio: '1:1', resolution: null };
    }
    if (!target) throw credentialRequiredError(null);
  }

  const brief = stripRoutingFromPrompt(safePrompt, route) || safePrompt;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onCallerAbort = () => controller.abort();
  signal?.addEventListener?.('abort', onCallerAbort, { once: true });

  let url = null;
  try {
    if (target.transport === 'muapi') {
      const result = await muapiProvider.generateImage(target.apiKey, {
        model: target.model.id,
        prompt: brief,
        aspect_ratio: target.aspectRatio,
        ...(target.resolution ? { resolution: target.resolution } : {}),
        signal: controller.signal,
      });
      url = result?.url;
    } else {
      const result = await provider.execute({
        operation: 'image_generation',
        inputs: {
          model: FAL_MODEL_IDS.TEXT_TO_IMAGE,
          prompt: brief,
          aspect_ratio: '1:1',
          num_images: 1,
          output_format: 'jpeg',
        },
        apiKey: target.apiKey,
        signal: controller.signal,
      });
      url = Array.isArray(result?.outputReferences) ? result.outputReferences[0] : null;
    }
  } catch (error) {
    const code = String(error?.code || '');
    if (controller.signal.aborted && !signal?.aborted) {
      throw imageError('image_generation_timeout', 'Image generation timed out. Please try again.', 504);
    }
    if (code.startsWith('provider_credential')) throw credentialRequiredError(target.transport, target.model.name);
    if (code === 'provider_model_unsupported' || code === 'provider_operation_unsupported') {
      throw imageError('image_generation_unsupported', 'This image model is not available for generation.', 422);
    }
    throw imageError('image_generation_failed', 'Image generation failed. Please try again.', 502);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.('abort', onCallerAbort);
  }

  if (typeof url !== 'string' || !isHttpsUrl(url)) {
    throw imageError('image_generation_failed', 'Image generation returned no usable image.', 502);
  }
  return {
    url,
    prompt: brief,
    model: target.model.id,
    modelName: target.model.name,
    transport: target.transport,
    aspectRatio: target.aspectRatio,
  };
}

/** Assistant reply that carries the generated image as markdown, so it streams and persists like any message. */
export function buildGeneratedImageReply({ url, prompt, modelName }) {
  const alt = String(prompt || 'Generated image').replace(/[[\]\n]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  const credit = modelName ? ` made with ${modelName}` : '';
  return [
    `Here's your image${credit}.`,
    '',
    `![${alt}](${url})`,
    '',
    "Ask for another variation, or tell me what to change and I'll refine it.",
  ].join('\n');
}
