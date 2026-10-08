import { falProvider, FAL_MODEL_IDS } from '../../packages/studio/src/lib/providers/FalProvider.js';
import { extractImagePrompt } from '../../packages/studio/src/lib/mavenImageIntent.js';
import { resolveProviderCredential } from './providerCredentialResolver.js';

export const MAVEN_IMAGE_TIMEOUT_MS = 120000;

function imageError(code, message, status) {
  return Object.assign(new Error(message), { code, status });
}

function credentialRequiredError() {
  return imageError('image_provider_credential_required', 'Connect your fal.ai API key in Settings to generate images.', 400);
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Generates one image through the existing fal.ai provider using the signed-in
 * customer's stored BYOK credential. The key is passed only to the provider call
 * and is never returned, logged, or included in an error message.
 */
export async function generateMavenImage({
  identity,
  prompt,
  signal,
  credentialResolver = resolveProviderCredential,
  provider = falProvider,
  timeoutMs = MAVEN_IMAGE_TIMEOUT_MS,
} = {}) {
  if (!identity) throw imageError('creator_os_auth_required', 'Creator OS authentication required.', 401);
  const safePrompt = extractImagePrompt(prompt);
  if (!safePrompt) throw imageError('image_prompt_required', 'Describe the image you want to create.', 400);

  let apiKey = null;
  try {
    apiKey = await credentialResolver({
      accountId: identity.accountId,
      creatorIdentityKey: identity.identityKey || identity.creatorId || identity.userId,
      providerId: 'fal',
      operation: 'image_generation',
    });
  } catch (error) {
    if (String(error?.code || '').startsWith('provider_credential')) throw credentialRequiredError();
    throw error;
  }
  if (!apiKey) throw credentialRequiredError();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onCallerAbort = () => controller.abort();
  signal?.addEventListener?.('abort', onCallerAbort, { once: true });

  let result;
  try {
    result = await provider.execute({
      operation: 'image_generation',
      inputs: {
        model: FAL_MODEL_IDS.TEXT_TO_IMAGE,
        prompt: safePrompt,
        aspect_ratio: '1:1',
        num_images: 1,
        output_format: 'jpeg',
      },
      apiKey,
      signal: controller.signal,
    });
  } catch (error) {
    const code = String(error?.code || '');
    if (controller.signal.aborted && !signal?.aborted) {
      throw imageError('image_generation_timeout', 'Image generation timed out. Please try again.', 504);
    }
    if (code.startsWith('provider_credential')) throw credentialRequiredError();
    if (code === 'provider_model_unsupported' || code === 'provider_operation_unsupported') {
      throw imageError('image_generation_unsupported', 'This image model is not available for generation.', 422);
    }
    throw imageError('image_generation_failed', 'Image generation failed. Please try again.', 502);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.('abort', onCallerAbort);
  }

  const url = Array.isArray(result?.outputReferences) ? result.outputReferences[0] : null;
  if (typeof url !== 'string' || !isHttpsUrl(url)) {
    throw imageError('image_generation_failed', 'Image generation returned no usable image.', 502);
  }
  return { url, prompt: safePrompt, model: FAL_MODEL_IDS.TEXT_TO_IMAGE, aspectRatio: '1:1' };
}

/** Assistant reply that carries the generated image as markdown, so it streams and persists like any message. */
export function buildGeneratedImageReply({ url, prompt }) {
  const alt = String(prompt || 'Generated image').replace(/[[\]\n]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  return [
    "Here's your image.",
    '',
    `![${alt}](${url})`,
    '',
    "Ask for another variation, or tell me what to change and I'll refine it.",
  ].join('\n');
}
