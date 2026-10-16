/**
 * Maven Chat — carousel storyboard approval gate.
 *
 * Follows the same shape as `mavenVideoApproval.js`: Maven shows exactly what it
 * plans to make, carries the plan in its own reply as an invisible HTML comment,
 * and requires the customer's next utterance to confirm. Because the carousel is
 * rendered locally (not by a paid provider) there is no cost approval here — the
 * gate exists so a long slide render only ever follows an approved storyboard.
 *
 * On confirmation Maven does NOT render inside the chat request. A local render
 * takes minutes; it runs in Motion Design where the slides are previewed and
 * exported. The confirmed reply says so plainly.
 */
import { CAROUSEL_DEFAULT_SCENE_MODE, CAROUSEL_SCENE_MODES, planCarousel } from '../../packages/studio/src/lib/motion/carousel/CarouselPlanner.js';
import { normalizeStyleSheet } from '../../packages/studio/src/lib/motion/carousel/CarouselStyleSheet.js';
import { assertApprovedStyleSheet, styleSheetFingerprint } from './motionCarouselStyleSheet.js';

export const CAROUSEL_APPROVAL_TTL_SECONDS = 1800;

const MARKER_PATTERN = /<!--\s*maven-carousel-approval:([A-Za-z0-9_-]+)\s*-->/;
const MARKER_TEMPLATE = (encoded) => `<!-- maven-carousel-approval:${encoded} -->`;
const APPROVED_MARKER_PATTERN = /<!--\s*maven-carousel-approved:([A-Za-z0-9_-]+)\s*-->/;
const APPROVED_MARKER_TEMPLATE = (encoded) => `<!-- maven-carousel-approved:${encoded} -->`;
const CANCELLED_MARKER = '<!-- maven-carousel-approval-cancelled -->';

const CONFIRMATION_PATTERN = /^(confirm|confirmed|approve|approved|proceed|yes|yeah|yep|go ahead|do it|ok|okay)\b/i;
const CANCELLATION_PATTERN = /^(cancel|no|stop|abort|never ?mind|do not|don'?t)\b/i;

export function isCarouselApprovalConfirmation(message) {
  const text = String(message || '').trim();
  return Boolean(text) && text.length <= 40 && CONFIRMATION_PATTERN.test(text);
}

export function isCarouselApprovalCancellation(message) {
  const text = String(message || '').trim();
  return Boolean(text) && text.length <= 40 && CANCELLATION_PATTERN.test(text);
}

function creatorKey(identity) {
  return String(identity?.identityKey || identity?.creatorId || identity?.userId || '').trim();
}

function encodeMarker(payload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

/**
 * The sheet carried in a marker, only if its fingerprint still matches its content.
 * A sheet edited in the transcript fails here, so the approval fails closed.
 */
function verifiedSheetFromPayload(payload) {
  try {
    const sheet = assertApprovedStyleSheet(payload.s, payload.f);
    return { sheet, sheetFingerprint: String(payload.f) };
  } catch {
    return null;
  }
}

function decodeMarker(encoded) {
  try {
    const parsed = JSON.parse(Buffer.from(String(encoded), 'base64url').toString('utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/** The scene mode recorded in a marker. Anything unrecognised falls back to Standard. */
function sceneModeFromPayload(payload) {
  return CAROUSEL_SCENE_MODES.includes(payload?.m) ? payload.m : CAROUSEL_DEFAULT_SCENE_MODE;
}

function sceneModeLabel(mode) {
  return mode === 'continuous'
    ? 'Continuous — one camera-panned scene across the deck'
    : 'Standard — one scene per slide';
}

/** The approved sheet as plain lines, so the customer sees exactly what they approve. */
function styleSheetSummaryLines(sheet, sheetSource) {
  const lines = [
    '**Style sheet — approved with this storyboard**',
    `Name: ${sheet.name} · ${sheet.visualStyle}`,
    `Colours: ${sheet.palette.map((swatch) => `${swatch.name} ${swatch.hex}`).join(', ')}`,
    `Headline type: ${sheet.typography.headline}`,
    `Imagery: ${sheet.imagery.treatment}`,
  ];
  if (sheetSource === 'preset') lines.push('Drafting was unavailable, so this is the preset sheet for the chosen style.');
  return lines;
}

/**
 * The storyboard reply. It lists every slide the customer will get, states the
 * export preset and duration honestly, carries the plan in an invisible marker,
 * and makes clear that nothing has rendered yet.
 */
export function buildCarouselStoryboardReply({
  identity,
  conversationId,
  brief,
  plan,
  sheet,
  sheetSource = 'ai',
  now = Math.floor(Date.now() / 1000),
} = {}) {
  if (!sheet) throw new Error('A carousel storyboard needs its resolved style sheet.');
  const { deck, storyboard, clarifications, preset, brand } = plan;
  const styleSheet = normalizeStyleSheet(sheet);
  const sheetFingerprint = styleSheetFingerprint(styleSheet);
  const lines = [
    '**Carousel storyboard — approve to continue**',
    '',
    `Topic: ${storyboard.topic}`,
    `Export: ${preset.label} (${preset.ratio}) · ${deck.slides.length} slides · ${storyboard.slides.reduce((sum, s) => sum + (s.durationSeconds || 0), 0) || deck.slides.length * 8}s total`,
    `Scene mode: ${sceneModeLabel(deck.sceneMode)}`,
    '',
    ...storyboard.slides.map((slide) => `${slide.index + 1}. **${slide.headline}** — ${slide.visualType} · ${slide.motion}`),
  ];
  if (clarifications.length) {
    lines.push('', 'Before you render:');
    for (const note of clarifications) lines.push(`- ${note}`);
  }
  lines.push('', ...styleSheetSummaryLines(styleSheet, sheetSource));
  const direction = plan.creativeDirection;
  if (direction && (direction.applied.length || direction.partial.length || direction.unsupported.length)) {
    lines.push('', 'Creative direction from your brief:');
    for (const label of direction.applied) lines.push(`- Applied: ${label}`);
    for (const item of direction.partial) lines.push(`- Partly applied: ${item.label} (${item.note})`);
    for (const label of direction.unsupported) lines.push(`- Not supported by the renderer, so it will not be applied: ${label}`);
  }
  lines.push(
    '',
    'Nothing has rendered yet. Reply "confirm" to approve this storyboard and its style sheet, or "cancel" to stop.',
    'An approved carousel renders and exports from Motion Design → Carousel.',
  );
  const marker = encodeMarker({
    v: 1,
    a: String(identity?.accountId || ''),
    i: creatorKey(identity),
    c: String(conversationId || ''),
    b: String(brief || ''),
    p: preset.id,
    n: brand?.id || 'mavensync',
    e: now + CAROUSEL_APPROVAL_TTL_SECONDS,
    s: styleSheet,
    f: sheetFingerprint,
    m: CAROUSEL_SCENE_MODES.includes(deck.sceneMode) ? deck.sceneMode : CAROUSEL_DEFAULT_SCENE_MODE,
  });
  return {
    reply: `${lines.join('\n')}\n\n${MARKER_TEMPLATE(marker)}`,
    approval: {
      topic: storyboard.topic,
      presetId: preset.id,
      brandId: brand?.id || 'mavensync',
      slideCount: deck.slides.length,
      expiresAt: (now + CAROUSEL_APPROVAL_TTL_SECONDS) * 1000,
    },
  };
}

/**
 * The confirmed reply. It records the approval in an invisible marker, bound to the
 * same account, creator and conversation, so Motion Design can load it later without
 * a new approval. The link opens Motion Design with the conversation attached.
 */
export function buildCarouselApprovedReply({ pending, identity, conversationId } = {}) {
  const lines = [
    '**Storyboard approved.**',
    '',
    'Open Motion Design → Carousel. The approved storyboard loads there with its headlines, slide order and direction unchanged. Chat does not render carousels.',
    'Rendering runs locally (Python + FFmpeg) — no paid API is used — and unchanged slides are reused on future edits.',
  ];
  const canRecord = Boolean(pending?.brief && pending?.sheet && pending?.sheetFingerprint && identity && conversationId && Number.isFinite(pending?.expiresAt));
  if (!canRecord) return lines.join('\n');
  const marker = APPROVED_MARKER_TEMPLATE(encodeMarker({
    v: 1,
    a: String(identity.accountId || ''),
    i: creatorKey(identity),
    c: String(conversationId),
    b: String(pending.brief),
    p: pending.presetId || 'instagram_carousel',
    n: pending.brandId || 'mavensync',
    e: Math.floor(pending.expiresAt / 1000),
    s: pending.sheet,
    f: pending.sheetFingerprint,
    m: pending.sceneMode || CAROUSEL_DEFAULT_SCENE_MODE,
  }));
  return `${lines.join('\n')}\n\n${marker}`;
}

const RENDER_VERBS = new Set(['create', 'make', 'build', 'render', 'generate', 'export', 'produce']);
const RENDER_FILLER = new Set(['do', 'start', 'finish', 'go', 'now', 'please', 'can', 'you', 'me', 'i', 'want', 'need', 'the', 'my', 'these', 'those', 'them', 'it', 'this', 'that', 'a', 'an', 'slides', 'slide', 'carousel', 'deck', 'post', 'posts', 'out', 'ahead', 'ready']);
const PLATFORM_WORDS = new Set(['ig', 'instagram', 'tiktok', 'reel', 'reels', 'facebook', 'fb', 'pinterest', '4:5', '9:16', '1:1', 'square', 'portrait', 'vertical']);
const FORMAT_WORDS = new Set([...PLATFORM_WORDS, 'carousel', 'post', 'posts', 'feed', 'format']);
const FORMAT_FILLER = new Set(['make', 'change', 'switch', 'use', 'set', 'update', 'to', 'as', 'for', 'the', 'a', 'an', 'this', 'that', 'it', 'my', 'please', 'on', 'in', 'instead']);
const FOLLOW_UP_MAX_LENGTH = 60;

function followUpWords(message) {
  const text = String(message || '').trim();
  if (!text || text.length > FOLLOW_UP_MAX_LENGTH) return null;
  return text.toLowerCase().match(/[a-z0-9:]+/g) || null;
}

/** "IG carousel", "make it Instagram 4:5": a format change only, with no new topic. */
export function isCarouselFormatFollowUp(message) {
  const words = followUpWords(message);
  if (!words || !words.some((w) => PLATFORM_WORDS.has(w))) return false;
  return words.every((w) => FORMAT_WORDS.has(w) || FORMAT_FILLER.has(w));
}

/** "create the slides", "render it": asks for the render of the approved storyboard. */
export function isCarouselRenderRequest(message) {
  const words = followUpWords(message);
  if (!words || !words.some((w) => RENDER_VERBS.has(w))) return false;
  return words.every((w) => RENDER_VERBS.has(w) || RENDER_FILLER.has(w));
}

function presetForFormat(message, fallback) {
  const words = followUpWords(message) || [];
  if (words.includes('pinterest')) return 'pinterest_pin';
  if (words.includes('facebook') || words.includes('fb')) return 'facebook_feed';
  if (words.some((w) => w === 'reel' || w === 'reels' || w === 'tiktok')) return 'instagram_reel';
  if (words.some((w) => w === 'ig' || w === 'instagram')) return 'instagram_carousel';
  return fallback;
}

/** The reply to a render request: the approved storyboard is kept, nothing regenerates. */
export function buildCarouselRenderHandoffReply() {
  return [
    'Your storyboard is approved and saved, so nothing needs regenerating.',
    '',
    'Chat does not render carousels directly. Open Motion Design → Carousel and select this approved project to render, preview and export it.',
  ].join('\n');
}

/**
 * A message sent while a storyboard awaits approval. A format-only change re-plans
 * the approved brief, so topic, copy and creative direction are kept. A render
 * request gets the handoff. Anything else returns null and routes as before.
 */
export function buildCarouselFollowUpReply({ message, pending, identity, conversationId, now } = {}) {
  if (!pending?.brief) return null;
  if (isCarouselFormatFollowUp(message)) {
    const plan = planCarousel({ brief: pending.brief, brand: pending.brandId, platform: presetForFormat(message, pending.presetId), sceneMode: pending.sceneMode });
    // The approved sheet is kept as is: a format change does not restyle the series.
    return buildCarouselStoryboardReply({ identity, conversationId, brief: pending.brief, plan, sheet: pending.sheet, now }).reply;
  }
  if (isCarouselRenderRequest(message)) return buildCarouselRenderHandoffReply();
  return null;
}

export function buildCarouselCancellationReply() {
  return ['Cancelled — no slides were rendered.', '', CANCELLED_MARKER].join('\n');
}

/**
 * The newest unexpired storyboard approval addressed to this account, creator and
 * conversation. Anything that does not verify is ignored (fails closed).
 */
export function readPendingCarouselApproval(messages, { identity, conversationId, now = Math.floor(Date.now() / 1000) } = {}) {
  if (!Array.isArray(messages)) return null;
  const accountId = String(identity?.accountId || '');
  const creator = creatorKey(identity);
  const conversation = String(conversationId || '');
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (String(message?.role || '') !== 'assistant') continue;
    const content = String(message?.content || '');
    if (content.includes(CANCELLED_MARKER)) return null;
    if (APPROVED_MARKER_PATTERN.test(content)) return null;
    const encoded = MARKER_PATTERN.exec(content)?.[1];
    if (!encoded) continue;
    const payload = decodeMarker(encoded);
    if (!payload || payload.v !== 1) return null;
    if (String(payload.a || '') !== accountId || String(payload.i || '') !== creator) return null;
    if (String(payload.c || '') !== conversation) return null;
    if (!Number.isFinite(Number(payload.e)) || Number(payload.e) <= now) return null;
    if (!payload.b) return null;
    const verified = verifiedSheetFromPayload(payload);
    if (!verified) return null;
    return {
      brief: String(payload.b),
      presetId: String(payload.p || 'instagram_carousel'),
      brandId: String(payload.n || 'mavensync'),
      expiresAt: Number(payload.e) * 1000,
      sheet: verified.sheet,
      sheetFingerprint: verified.sheetFingerprint,
      sceneMode: sceneModeFromPayload(payload),
    };
  }
  return null;
}

/**
 * Re-derives the plan from the approved brief. The planner is deterministic, so
 * the deck the customer approved is the deck that renders.
 */
export function resolveCarouselApprovedPlan(pending, { brand = null, handle = null } = {}) {
  if (!pending?.brief) throw Object.assign(new Error('No approved carousel brief.'), { code: 'carousel_approval_missing' });
  return planCarousel({ brief: pending.brief, brand: brand || pending.brandId || 'mavensync', handle, platform: pending.presetId, sceneMode: pending.sceneMode });
}

/**
 * The confirmed storyboard for this account, creator and conversation. Only a
 * confirmation newer than any storyboard draft counts: a draft written after approval
 * (for example a format change) must be confirmed again. Anything that does not
 * verify, is cancelled or has expired returns null (fails closed).
 */
export function readApprovedCarouselApproval(messages, { identity, conversationId, now = Math.floor(Date.now() / 1000) } = {}) {
  if (!Array.isArray(messages) || !conversationId) return null;
  const accountId = String(identity?.accountId || '');
  const creator = creatorKey(identity);
  const conversation = String(conversationId);
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (String(message?.role || '') !== 'assistant') continue;
    const content = String(message?.content || '');
    if (content.includes(CANCELLED_MARKER)) return null;
    if (MARKER_PATTERN.test(content)) return null;
    const encoded = APPROVED_MARKER_PATTERN.exec(content)?.[1];
    if (!encoded) continue;
    const payload = decodeMarker(encoded);
    if (!payload || payload.v !== 1) return null;
    if (String(payload.a || '') !== accountId || String(payload.i || '') !== creator) return null;
    if (String(payload.c || '') !== conversation) return null;
    if (!Number.isFinite(Number(payload.e)) || Number(payload.e) <= now) return null;
    if (!payload.b) return null;
    const verified = verifiedSheetFromPayload(payload);
    if (!verified) return null;
    return {
      brief: String(payload.b),
      presetId: String(payload.p || 'instagram_carousel'),
      brandId: String(payload.n || 'mavensync'),
      expiresAt: Number(payload.e) * 1000,
      sheet: verified.sheet,
      sheetFingerprint: verified.sheetFingerprint,
      sceneMode: sceneModeFromPayload(payload),
    };
  }
  return null;
}

export const mavenCarouselApprovalInternals = { MARKER_PATTERN, CANCELLED_MARKER, encodeMarker, decodeMarker };
