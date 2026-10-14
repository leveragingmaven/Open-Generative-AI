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
import { planCarousel } from '../../packages/studio/src/lib/motion/carousel/CarouselPlanner.js';

export const CAROUSEL_APPROVAL_TTL_SECONDS = 1800;

const MARKER_PATTERN = /<!--\s*maven-carousel-approval:([A-Za-z0-9_-]+)\s*-->/;
const MARKER_TEMPLATE = (encoded) => `<!-- maven-carousel-approval:${encoded} -->`;
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

function decodeMarker(encoded) {
  try {
    const parsed = JSON.parse(Buffer.from(String(encoded), 'base64url').toString('utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
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
  now = Math.floor(Date.now() / 1000),
} = {}) {
  const { deck, storyboard, clarifications, preset, brand } = plan;
  const lines = [
    '**Carousel storyboard — approve to continue**',
    '',
    `Topic: ${storyboard.topic}`,
    `Export: ${preset.label} (${preset.ratio}) · ${deck.slides.length} slides · ${storyboard.slides.reduce((sum, s) => sum + (s.durationSeconds || 0), 0) || deck.slides.length * 8}s total`,
    '',
    ...storyboard.slides.map((slide) => `${slide.index + 1}. **${slide.headline}** — ${slide.visualType} · ${slide.motion}`),
  ];
  if (clarifications.length) {
    lines.push('', 'Before you render:');
    for (const note of clarifications) lines.push(`- ${note}`);
  }
  lines.push(
    '',
    'Nothing has rendered yet. Reply "confirm" to approve this storyboard, or "cancel" to stop.',
    'An approved carousel renders and exports from Motion Design (Marketing Studio → Motion → Carousel).',
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

/** The reply shown when the storyboard is approved; it hands off to Motion Design. */
export function buildCarouselApprovedReply({ pending } = {}) {
  return [
    '**Storyboard approved.**',
    '',
    `${pending?.slideCount || 'Your'} slides are ready to render. Open Motion Design → Carousel to render, preview and export them.`,
    'Rendering runs locally (Python + FFmpeg) — no paid API is used — and unchanged slides are reused on future edits.',
  ].join('\n');
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
    const encoded = MARKER_PATTERN.exec(content)?.[1];
    if (!encoded) continue;
    const payload = decodeMarker(encoded);
    if (!payload || payload.v !== 1) return null;
    if (String(payload.a || '') !== accountId || String(payload.i || '') !== creator) return null;
    if (String(payload.c || '') !== conversation) return null;
    if (!Number.isFinite(Number(payload.e)) || Number(payload.e) <= now) return null;
    if (!payload.b) return null;
    return {
      brief: String(payload.b),
      presetId: String(payload.p || 'instagram_carousel'),
      brandId: String(payload.n || 'mavensync'),
      expiresAt: Number(payload.e) * 1000,
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
  return planCarousel({ brief: pending.brief, brand: brand || pending.brandId || 'mavensync', handle, platform: pending.presetId });
}

export const mavenCarouselApprovalInternals = { MARKER_PATTERN, CANCELLED_MARKER, encodeMarker, decodeMarker };
