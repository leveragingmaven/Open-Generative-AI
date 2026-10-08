import { falProvider, FAL_MODEL_IDS } from '../../packages/studio/src/lib/providers/FalProvider.js';
import { muApiProvider } from '../../packages/studio/src/lib/providers/MuApiProvider.js';
import { extractImagePrompt } from '../../packages/studio/src/lib/mavenImageIntent.js';
import { resolveProviderCredential } from './providerCredentialResolver.js';
import { selectMavenImageRoute, selectMavenImageEditRoute, stripRoutingFromPrompt } from './mavenImageModelRouter.js';

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

function isHttpUrl(value) {
  try {
    const protocol = new URL(value).protocol;
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
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

const LOCALIZED_CHANGE = /\b(background|backdrop|lighting|light|color|colour|sky|setting|scene|environment|wall|weather|shadows?|tone|mood)\b/i;
const PRESERVATION_ATTRIBUTES = Object.freeze([
  { name: 'identity and facial features', changed: /\b(change|replace|swap|alter|rework)\b[^.?!]{0,80}\b(person|subject|face|identity|facial features)\b|\b(new|different)\s+(person|face)\b/i },
  { name: 'hairstyle and hair color', changed: /\b(change|replace|swap|alter|rework)\b[^.?!]{0,80}\b(hair|hairstyle|hair color)\b|\b(new|different)\s+(hairstyle|hair|hair color)\b/i },
  { name: 'clothing or outfit', changed: /\b(change|replace|swap|alter|rework)\b[^.?!]{0,80}\b(clothes|clothing|outfit)\b|\b(new|different)\s+(outfit|clothes|clothing)\b/i },
  { name: 'glasses and accessories', changed: /\b(change|replace|swap|alter|rework)\b[^.?!]{0,80}\b(glasses|accessor(?:y|ies))\b|\b(new|different)\s+(glasses|accessor(?:y|ies))\b/i },
  { name: 'body proportions', changed: /\b(change|replace|swap|alter|rework)\b[^.?!]{0,80}\b(body|proportions|figure)\b|\b(new|different)\s+(body|proportions|figure)\b/i },
  { name: 'pose', changed: /\b(change|replace|swap|alter|rework)\b[^.?!]{0,80}\bpose\b|\b(new|different)\s+pose\b/i },
  { name: 'original photographic or illustration style', changed: /\b(change|replace|swap|alter|rework|convert)\b[^.?!]{0,80}\b(style|medium|photographic|illustration)\b|\b(new|different)\s+(style|medium)\b/i },
]);

/** Deterministic preservation language; explicitly requested subject changes are omitted, not contradicted. */
export function enhanceMavenImageEditPrompt(prompt) {
  const text = String(prompt || '').replace(/\s+/g, ' ').trim();
  if (!text || !LOCALIZED_CHANGE.test(text)) return text;
  const preserve = PRESERVATION_ATTRIBUTES.filter((attribute) => !attribute.changed.test(text)).map((attribute) => attribute.name);
  if (!preserve.length) return text;
  return `${text} Preserve the original subject's ${preserve.join(', ')}. Do not change anything else.`;
}

/**
 * Edits one trusted reference image through the existing MuAPI image-to-image catalog
 * with the customer's BYOK key. `imageUrl` must come from a session-verified attachment.
 */
export async function generateMavenImageEdit({
  identity,
  prompt,
  imageUrl,
  signal,
  credentialResolver = resolveProviderCredential,
  muapiProvider = muApiProvider,
  timeoutMs = MAVEN_IMAGE_TIMEOUT_MS,
} = {}) {
  if (!identity) throw imageError('creator_os_auth_required', 'Creator OS authentication required.', 401);
  const safePrompt = extractImagePrompt(prompt);
  if (!safePrompt) throw imageError('image_prompt_required', 'Describe how you want the image changed.', 400);
  if (!isHttpUrl(imageUrl)) {
    throw imageError('image_source_unavailable', 'The attached image is not available for editing.', 422);
  }

  const route = selectMavenImageEditRoute(safePrompt);

  let apiKey = null;
  try {
    apiKey = await credentialResolver({
      accountId: identity.accountId,
      creatorIdentityKey: identity.identityKey || identity.creatorId || identity.userId,
      providerId: 'muapi',
      operation: 'image_editing',
    });
  } catch (error) {
    if (String(error?.code || '').startsWith('provider_credential')) apiKey = null;
    else throw error;
  }
  if (!apiKey) throw credentialRequiredError('muapi', route.model.name);

  const brief = enhanceMavenImageEditPrompt(stripRoutingFromPrompt(safePrompt, route) || safePrompt);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onCallerAbort = () => controller.abort();
  signal?.addEventListener?.('abort', onCallerAbort, { once: true });

  let url = null;
  try {
    const result = await muapiProvider.generateI2I(apiKey, {
      model: route.model.id,
      prompt: brief,
      image_url: imageUrl,
      ...(route.aspectRatio ? { aspect_ratio: route.aspectRatio } : {}),
      ...(route.resolution ? { resolution: route.resolution } : {}),
      signal: controller.signal,
    });
    url = result?.url;
  } catch (error) {
    const code = String(error?.code || '');
    if (controller.signal.aborted && !signal?.aborted) {
      throw imageError('image_generation_timeout', 'Image editing timed out. Please try again.', 504);
    }
    if (code.startsWith('provider_credential')) throw credentialRequiredError('muapi', route.model.name);
    if (code === 'provider_model_unsupported' || code === 'provider_operation_unsupported') {
      throw imageError('image_generation_unsupported', 'This editing model is not available.', 422);
    }
    throw imageError('image_generation_failed', 'Image editing failed. Please try again.', 502);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.('abort', onCallerAbort);
  }

  if (typeof url !== 'string' || !isHttpsUrl(url)) {
    throw imageError('image_generation_failed', 'Image editing returned no usable image.', 502);
  }
  return { url, prompt: brief, model: route.model.id, modelName: route.model.name, transport: 'muapi', aspectRatio: route.aspectRatio, operation: 'image_editing' };
}

/** Assistant reply that carries the generated image as markdown, so it streams and persists like any message. */
export function buildGeneratedImageReply({ url, prompt, modelName, edited = false, referenceUnavailable = false }) {
  const alt = String(prompt || 'Generated image').replace(/[[\]\n]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  const credit = modelName ? ` made with ${modelName}` : '';
  return [
    `Here's your ${edited ? 'edited ' : ''}image${credit}.`,
    '',
    `![${alt}](${url})`,
    '',
    referenceUnavailable
      ? "This image could not be linked to the conversation's trusted assets, so I can't safely refine it later. Download it now or upload it again to continue."
      : "Ask for another variation, or tell me what to change and I'll refine it.",
  ].join('\n');
}
