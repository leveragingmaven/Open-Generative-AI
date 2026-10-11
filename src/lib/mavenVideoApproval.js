/**
 * Maven Chat video cost tiers and the explicit approval gate.
 *
 * Chat selects a video model from the prompt (`selectMavenVideoRoute` /
 * `selectMavenImageToVideoRoute`). Two things were unsafe about doing that
 * silently: the prompt could pick a materially more expensive model than the
 * budget default, and the user only learned which model ran after the money was
 * spent. This module answers three questions with data that already exists:
 *
 *  1. Is the selected model above the budget tier? (`videoCostTier`)
 *  2. What can we honestly say about its price? (`videoPriceNote`)
 *  3. Can a premium selection be authorized before the provider is called?
 *     (`buildVideoApprovalReply` / `readPendingVideoApproval`)
 *
 * The tier decision is derived, never hardcoded per model: a route is premium
 * when the resolution it will actually request is 1080p or higher, when the
 * model's own declared default resolution is 1080p or higher, or when the
 * published provider catalog prices the model (or its published family) at or
 * above PREMIUM_VIDEO_UNIT_PRICE_USD.
 *
 * Approval is carried in the assistant's own reply as an invisible HTML comment
 * and confirmed by the customer's next utterance. The marker only records what
 * was shown; on confirmation the route is re-derived from the same prompt and
 * must match the approved model and settings exactly, so a marker can never
 * authorize a model the router would not have selected for that prompt, and a
 * catalog change re-asks instead of substituting. The token-based
 * `agentExecutionApproval` flow was evaluated and is not used here: it needs a
 * client token echo that the controlled conversation endpoint deliberately
 * refuses (`forbiddenFields`), a pre-provisioned authorization table, and the
 * SSO secret in the chat hot path, none of which this flow can supply.
 */
import { MUAPI_MODEL_FIXTURES } from '../../packages/studio/src/lib/intelligence/ProductionCapabilityCatalog.js';
import { t2vModels, i2vModels } from '../../packages/studio/src/models.js';
import { selectMavenVideoRoute, videoResolutionRank, findModel } from './mavenVideoModelRouter.js';
import { selectMavenImageToVideoRoute, findModel as findImageToVideoModel } from './mavenImageToVideoModelRouter.js';
import { extractVideoPrompt } from '../../packages/studio/src/lib/mavenVideoIntent.js';

export const VIDEO_APPROVAL_TTL_SECONDS = 600;
export const PREMIUM_VIDEO_UNIT_PRICE_USD = 1;
export const VIDEO_PRICE_VARIES_NOTE = 'Price varies; check provider pricing.';
export const VIDEO_COST_TIER = Object.freeze({ BUDGET: 'budget', PREMIUM: 'premium' });

const PREMIUM_RESOLUTION_RANK = videoResolutionRank('1080p');
// Invisible in rendered markdown, preserved verbatim in the stored transcript.
const MARKER_PATTERN = /<!--\s*maven-video-approval:([A-Za-z0-9_-]+)\s*-->/;
const MARKER_TEMPLATE = (encoded) => `<!-- maven-video-approval:${encoded} -->`;
// Written by the cancellation reply so an older, unexpired approval cannot be
// revived by a later "confirm": the customer already declined that plan.
const CANCELLED_MARKER = '<!-- maven-video-approval-cancelled -->';
const VIDEO_KINDS = new Set(['t2v', 'i2v']);
// Only a short, unambiguous reply counts as confirmation; anything else is
// treated as a new request and re-gated.
const CONFIRMATION_PATTERN = /^(confirm|confirmed|approve|approved|proceed|yes|yeah|yep|go ahead|do it|ok|okay)\b/i;
const CANCELLATION_PATTERN = /^(cancel|no|stop|abort|never ?mind|do ?not|don'?t)\b/i;

export function isVideoApprovalConfirmation(message) {
  const text = String(message || '').trim();
  return Boolean(text) && text.length <= 40 && CONFIRMATION_PATTERN.test(text);
}

export function isVideoApprovalCancellation(message) {
  const text = String(message || '').trim();
  return Boolean(text) && text.length <= 40 && CANCELLATION_PATTERN.test(text);
}

const CHOICE_PATTERN = /^(choose|pick|show|list|different|another|other|options|alternatives|which)\b/i;

/** "Choose another model" without naming one: answer with the shortlist. */
export function isVideoModelChoiceRequest(message) {
  const text = String(message || '').trim();
  return Boolean(text) && text.length <= 60 && CHOICE_PATTERN.test(text);
}

function videoFixtures() {
  return MUAPI_MODEL_FIXTURES.filter((entry) => String(entry?.modality || '').toLowerCase() === 'video'
    || String(entry?.operation || '').toLowerCase().includes('video'));
}

function fixturePrice(fixture) {
  const value = fixture?.pricing?.unitPrice;
  return Number.isFinite(value) ? value : null;
}

function matchesModel(fixture, modelId) {
  const id = String(modelId || '');
  if (!id) return false;
  return [fixture?.modelId, fixture?.endpointId].some((value) => String(value || '') === id);
}

/**
 * Published list price for exactly this catalog model, or null. Only an exact
 * `modelId`/`endpointId` match is returned: a family-level price is not this
 * model's price and is never displayed as one.
 */
export function videoModelUnitPrice(modelId) {
  for (const fixture of videoFixtures()) {
    if (!matchesModel(fixture, modelId)) continue;
    const amount = fixturePrice(fixture);
    if (amount != null) {
      return {
        amount,
        currency: String(fixture?.pricing?.currency || 'USD'),
        unit: String(fixture?.pricing?.unit || 'generation'),
      };
    }
  }
  return null;
}

/** Family tokens the published catalog itself prices at or above the premium floor. */
function premiumFamilyTokens() {
  const tokens = new Set();
  for (const fixture of videoFixtures()) {
    const amount = fixturePrice(fixture);
    if (amount == null || amount < PREMIUM_VIDEO_UNIT_PRICE_USD) continue;
    const token = String(fixture?.variant?.generation || String(fixture?.modelId || '').split('-')[0] || '').toLowerCase();
    if (token) tokens.add(token);
  }
  return tokens;
}

/**
 * True when the model's published family price puts it in the premium tier. The
 * price is used as a tier signal only (for example the Veo image-to-video family
 * is published at US$2.50, so a Veo text-to-video route is premium even though
 * the catalog publishes no separate text-to-video price).
 */
export function videoModelIsPremiumClass(modelId) {
  const exact = videoModelUnitPrice(modelId);
  if (exact && exact.amount >= PREMIUM_VIDEO_UNIT_PRICE_USD) return true;
  const id = String(modelId || '').toLowerCase();
  if (!id) return false;
  for (const token of premiumFamilyTokens()) {
    if (id === token || id.startsWith(`${token}-`) || id.startsWith(`${token}.`)) return true;
  }
  return false;
}

function declaredResolution(model) {
  const field = model?.inputs?.resolution;
  if (field?.default) return String(field.default);
  if (Array.isArray(field?.enum) && field.enum.length) return String(field.enum[0]);
  return null;
}

/**
 * Budget routes may generate directly; premium routes always need confirmation.
 */
export function videoCostTier({ model, inputs } = {}) {
  if (videoResolutionRank(inputs?.resolution) >= PREMIUM_RESOLUTION_RANK) return VIDEO_COST_TIER.PREMIUM;
  if (videoResolutionRank(declaredResolution(model)) >= PREMIUM_RESOLUTION_RANK) return VIDEO_COST_TIER.PREMIUM;
  if (videoModelIsPremiumClass(model?.id)) return VIDEO_COST_TIER.PREMIUM;
  return VIDEO_COST_TIER.BUDGET;
}

/** Honest price statement for a route: a published exact price, or nothing. */
export function videoPriceNote(model) {
  const price = videoModelUnitPrice(model?.id);
  if (!price) return VIDEO_PRICE_VARIES_NOTE;
  return `Published provider list price: $${price.amount.toFixed(2)} ${price.currency} per ${price.unit}.`;
}

export function videoSelectionReason(mode, tier) {
  if (mode === 'explicit' || mode === 'user_choice') return 'explicit_model_request';
  return tier === VIDEO_COST_TIER.PREMIUM ? 'quality_signal_auto_upgrade' : 'auto_default';
}

/** Catalog entries of one modality, in catalog order. */
export function videoCatalog(kind) {
  return kind === 'i2v' ? i2vModels : t2vModels;
}

/** Cost predicate handed to the routers so auto-selection can prefer budget models. */
export function videoModelIsBudgetClass(model) {
  return videoCostTier({ model, inputs: {} }) === VIDEO_COST_TIER.BUDGET;
}

/** Provider · model · settings · audio, plus the honest price statement. */
export function describeVideoChoice({ model, inputs = {} } = {}) {
  const duration = Number(inputs.duration);
  return [
    [model?.provider_name || model?.provider || 'Provider unknown', model?.name || model?.id || 'Model unknown'].join(' · '),
    inputs.aspect_ratio ? String(inputs.aspect_ratio) : null,
    Number.isFinite(duration) ? `${duration}s` : 'duration: provider default',
    inputs.resolution ? String(inputs.resolution) : 'resolution: provider default',
    'audio: provider default',
  ].filter(Boolean).join(' · ');
}

function creatorKey(identity) {
  return String(identity?.identityKey || identity?.creatorId || identity?.userId || '').trim();
}

function encodeMarker(payload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeMarker(encoded) {
  try {
    const parsed = JSON.parse(Buffer.from(String(encoded), 'base64url').toString('utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeSettings(inputs = {}) {
  const settings = {};
  if (inputs.aspect_ratio) settings.aspect_ratio = String(inputs.aspect_ratio);
  const duration = Number(inputs.duration);
  if (Number.isFinite(duration)) settings.duration = duration;
  if (inputs.resolution) settings.resolution = String(inputs.resolution).toLowerCase();
  return settings;
}

function sameSettings(a = {}, b = {}) {
  const left = normalizeSettings(a);
  const right = normalizeSettings(b);
  const keys = ['aspect_ratio', 'duration', 'resolution'];
  return keys.every((key) => String(left[key] ?? '') === String(right[key] ?? ''));
}

/**
 * The assistant reply that asks for authorization. It names the provider, model
 * and exact settings that will be used, states the price honestly, and carries
 * the signed-off plan in an invisible marker.
 */
/** The reply that declines a pending approval and retires it. */
export function buildVideoApprovalCancellationReply() {
  return [
    'Cancelled — no video was generated, so nothing was sent to the provider.',
    '',
    CANCELLED_MARKER,
  ].join('\n');
}

export function buildVideoApprovalReply({ identity, conversationId, kind, prompt, route, tier, now = Math.floor(Date.now() / 1000) } = {}) {
  const inputs = normalizeSettings(route?.inputs);
  const provider = route?.model?.provider_name || route?.model?.provider || 'the video provider';
  const model = route?.model?.name || route?.model?.id;
  const settings = [inputs.aspect_ratio, Number.isFinite(inputs.duration) ? `${inputs.duration}s` : null, inputs.resolution]
    .filter(Boolean).join(' · ');
  const why = route?.mode === 'user_choice'
    ? 'You chose this model.'
    : route?.mode === 'explicit'
      ? 'You asked for this model, and it is priced above the budget tier.'
      : 'This was selected automatically from your request, and it is priced above the budget tier.';
  const reply = [
    '**Confirm this video generation**',
    '',
    `${provider} · ${model}${settings ? ` · ${settings}` : ''}`,
    why,
    videoPriceNote(route?.model),
    '',
    'Reply "confirm" to generate exactly this, "use <model name>" to generate with a different model instead, or "cancel" to stop. Nothing is generated until you confirm.',
  ].join('\n');
  const marker = encodeMarker({
    v: 1,
    k: kind,
    a: String(identity?.accountId || ''),
    i: creatorKey(identity),
    c: String(conversationId || ''),
    m: String(route?.model?.id || ''),
    // The selection mode is recorded so a user-chosen model can be re-validated
    // against the catalog rather than the auto-selection default.
    u: route?.mode === 'user_choice' ? 'user_choice' : 'auto',
    s: inputs,
    p: String(prompt || ''),
    e: now + VIDEO_APPROVAL_TTL_SECONDS,
  });
  return {
    reply: `${reply}\n\n${MARKER_TEMPLATE(marker)}`,
    approval: {
      kind,
      tier: tier || videoCostTier({ model: route?.model, inputs: route?.inputs }),
      modelId: String(route?.model?.id || ''),
      settings: inputs,
      selectionMode: route?.mode || 'auto',
      priceNote: videoPriceNote(route?.model),
      expiresAt: (now + VIDEO_APPROVAL_TTL_SECONDS) * 1000,
    },
  };
}

/**
 * The newest unexpired approval addressed to this account, creator and
 * conversation. Anything that does not verify is ignored, which fails closed:
 * the customer is asked again instead of a paid call being made.
 */
export function readPendingVideoApproval(messages, { identity, conversationId, now = Math.floor(Date.now() / 1000) } = {}) {
  if (!Array.isArray(messages)) return null;
  const accountId = String(identity?.accountId || '');
  const creator = creatorKey(identity);
  const conversation = String(conversationId || '');
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (String(message?.role || '') !== 'assistant') continue;
    const content = String(message?.content || '');
    if (content.includes(CANCELLED_MARKER)) return null;
    const encoded = MARKER_PATTERN.exec(content)?.[1];
    if (!encoded) continue;
    const payload = decodeMarker(encoded);
    if (!payload || payload.v !== 1) return null;
    if (String(payload.a || '') !== accountId || String(payload.i || '') !== creator) return null;
    if (String(payload.c || '') !== conversation) return null;
    if (!VIDEO_KINDS.has(payload.k)) return null;
    if (!Number.isFinite(Number(payload.e)) || Number(payload.e) <= now) return null;
    if (!payload.m || typeof payload.p !== 'string' || !payload.p) return null;
    return {
      kind: payload.k,
      modelId: String(payload.m),
      settings: payload.s && typeof payload.s === 'object' ? payload.s : {},
      selectionMode: payload.u === 'user_choice' ? 'user_choice' : 'auto',
      prompt: payload.p,
      expiresAt: Number(payload.e) * 1000,
    };
  }
  return null;
}

/**
 * Resolves what a video request would actually run, without calling a provider.
 * The caller compares `requiresApproval` before anything is generated.
 *
 * Image-to-video auto-selection prefers a budget-tier catalog model: the previous
 * default was the published $2.50 model, so a generic "animate this image"
 * request was answered by a premium model every time. The premium model stays
 * available and stays gated whenever it is asked for by name.
 */
export function planMavenVideoRoute({ kind = 't2v', prompt, catalog = null } = {}) {
  const safePrompt = extractVideoPrompt(prompt);
  if (!safePrompt) throw videoApprovalError('video_prompt_required', 'Describe the video you want to create.', 400);
  const route = kind === 'i2v'
    ? selectMavenImageToVideoRoute(safePrompt, { ...(catalog ? { catalog } : {}), isBudget: videoModelIsBudgetClass })
    : selectMavenVideoRoute(safePrompt, catalog ? { catalog } : {});
  const tier = videoCostTier({ model: route.model, inputs: route.inputs });
  return {
    kind,
    prompt: safePrompt,
    route,
    tier,
    requiresApproval: tier === VIDEO_COST_TIER.PREMIUM,
    reason: videoSelectionReason(route.mode, tier),
  };
}

export function videoApprovalError(code, message, status) {
  return Object.assign(new Error(message), { code, status });
}

/**
 * Re-derives the route from the approved prompt and requires it to match what
 * the customer saw before anything is sent to the provider.
 *
 * A model the customer explicitly chose is re-derived against a catalog holding
 * only that model, and the model must still exist in the catalog of that
 * modality - so a marker can never authorize an invented model or a model the
 * router would not select for that prompt.
 */
export function resolveApprovedVideoRoute(pending) {
  const derive = (catalog) => (pending?.kind === 'i2v'
    ? selectMavenImageToVideoRoute(pending.prompt, { ...(catalog ? { catalog } : {}), isBudget: videoModelIsBudgetClass })
    : selectMavenVideoRoute(pending.prompt, catalog ? { catalog } : {}));
  const matches = (route) => String(route.model.id) === String(pending.modelId)
    && sameSettings(route.inputs, pending.settings);
  const automatic = derive(null);
  if (matches(automatic)) return automatic;
  if (pending.selectionMode === 'user_choice') {
    const chosen = videoCatalog(pending.kind).find((model) => String(model.id) === String(pending.modelId));
    if (chosen) {
      const route = derive([chosen]);
      if (matches(route)) return { ...route, mode: 'user_choice' };
    }
  }
  throw videoApprovalError(
    'video_approval_stale',
    'The video model or its settings changed since you confirmed, so nothing was generated. Please ask again.',
    409,
  );
}

/**
 * The alternate model a customer named while an approval is pending. Returns
 * null when the message does not name a different usable model of the same
 * modality, so an ordinary reply is never mistaken for a model choice.
 */
export function planAlternateVideoRoute({ pending, message } = {}) {
  if (!pending) return null;
  const catalog = videoCatalog(pending.kind);
  const named = pending.kind === 'i2v'
    ? findImageToVideoModel(message, catalog)
    : findModel(message, catalog);
  if (!named || String(named.id) === String(pending.modelId)) return null;
  if (pending.kind === 'i2v' && (named.family === 'effects' || /\b(effect|reference|start.?end|transition)\b/i.test(`${named.id} ${named.name}`))) return null;
  const plan = planMavenVideoRoute({ kind: pending.kind, prompt: pending.prompt, catalog: [named] });
  const route = { ...plan.route, mode: 'user_choice' };
  return {
    ...plan,
    route,
    // A customer-chosen model is always shown and confirmed before it runs,
    // whether or not it is above the budget tier.
    requiresApproval: true,
    tier: videoCostTier({ model: named, inputs: route.inputs }),
  };
}

/** Shortlist of usable models of the same modality, budget tier first. */
export function videoModelAlternatives({ kind = 't2v', excludeModelId = null, limit = 4 } = {}) {
  const usable = videoCatalog(kind).filter((model) => model.family !== 'effects'
    && !/\b(reference|start.?end|transition)\b/i.test(`${model.id} ${model.name}`));
  const ordered = [...usable.filter(videoModelIsBudgetClass), ...usable.filter((model) => !videoModelIsBudgetClass(model))];
  const picks = [];
  for (const model of ordered) {
    if (String(model.id) === String(excludeModelId) || picks.some((pick) => pick.model.id === model.id)) continue;
    picks.push({ model, priceNote: videoPriceNote(model) });
    if (picks.length >= limit) break;
  }
  return picks;
}

/** The reply that lists the other models a customer may choose instead. */
export function buildVideoAlternativesReply({ pending } = {}) {
  const current = videoCatalog(pending?.kind).find((model) => String(model.id) === String(pending?.modelId)) || null;
  const alternatives = videoModelAlternatives({ kind: pending?.kind, excludeModelId: pending?.modelId });
  return [
    `**Available ${pending?.kind === 'i2v' ? 'image-to-video' : 'text-to-video'} models**`,
    '',
    ...alternatives.map(({ model, priceNote }) => `- ${[model.provider_name || model.provider, model.name].filter(Boolean).join(' · ')} — ${priceNote}`),
    '',
    `Reply "use <model name>" to see one of these with its settings, or "confirm" to keep ${current?.name || 'the selected model'}, or "cancel" to stop.`,
    '',
    current ? `Currently selected: ${current.name}.` : '',
  ].filter((line) => line !== '').join('\n');
}

export const mavenVideoApprovalInternals = {
  normalizeSettings,
  sameSettings,
  premiumFamilyTokens,
  MARKER_PATTERN,
  CANCELLED_MARKER,
};
