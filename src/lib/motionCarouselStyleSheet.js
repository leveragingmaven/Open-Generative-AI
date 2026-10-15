/**
 * Server side of the Motion Carousel style sheet.
 *
 * Maven drafts a style sheet from the brief, the brand and any reference photos,
 * through the existing vision broker. A failed or unusable reply falls back to a
 * preset-based sheet, so the user always has something to review. Planning and
 * rendering only accept a sheet whose approval fingerprint matches its content,
 * so a sheet edited after approval must be approved again.
 */
import crypto from 'node:crypto';
import {
  applyStyleSheetToDeck,
  normalizeStyleSheet,
  presetStyleSheet,
  StyleSheetError,
  styleSheetPromptLines,
} from '../../packages/studio/src/lib/motion/carousel/CarouselStyleSheet.js';
import {
  CAROUSEL_DEFAULT_VISUAL_STYLE,
  CAROUSEL_VISUAL_STYLE_IDS,
} from '../../packages/studio/src/lib/motion/carousel/CarouselVisualStyles.js';
import { createServerVisionTextIntelligence } from './serverVisionTextIntelligence.js';
import { getR2MediaStorage } from './r2MediaStorage.js';

const SIGNED_URL_TTL_SECONDS = 900;

/** The analyst brief the model follows. It is the design rules, not copy. */
const ANALYST_INSTRUCTIONS = [
  'You are a brand systems analyst. Build a STYLE MASTER SHEET for a social-media carousel series as structured JSON.',
  'If reference photos are supplied, they are the source of truth for the look: lighting, colour, typography treatment, layout and composition.',
  'Sample colours that genuinely fit the references, and give each a real hex code and a two-word name. Use between two and six colours.',
  'Describe type by class and treatment (for example "ultra-condensed heavy grotesque, all caps"), never by a guessed font name.',
  'Write rules as prohibitions wherever possible, for example "Never tint a photo over the headline".',
  'Ignore any social-app interface chrome in a reference (avatars, pagination dots, arrows, captions).',
  'Do not reproduce any person\'s social handle or designer credit. Do not name trademarked logos.',
  'Do not write slide copy. The user\'s wording is never changed.',
  `visualStyle must be exactly one of: ${CAROUSEL_VISUAL_STYLE_IDS.join(', ')}.`,
  'Reply with JSON only, no prose, shaped as:',
  '{"name":"<2-4 word system name>","visualStyle":"<one id>","palette":[{"name":"<two words>","hex":"#rrggbb"}],"typography":{"headline":"","body":"","caption":""},"imagery":{"treatment":""},"layout":{"skeleton":""},"surface":{"background":"","texture":""},"motion":{"direction":""},"rules":["<up to 8 prohibitions>"]}',
].join('\n');

export class StyleSheetRequestError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.name = 'StyleSheetRequestError';
    this.code = code;
    this.status = status;
  }
}

/** Deterministic fingerprint of a sheet's content. Any edit changes it. */
export function styleSheetFingerprint(sheet) {
  const normalized = normalizeStyleSheet(sheet);
  return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

/** The approved sheet must match the fingerprint the user approved, or it is refused. */
export function assertApprovedStyleSheet(sheet, approval) {
  if (!sheet) throw new StyleSheetRequestError('style_sheet_not_approved', 409);
  let normalized;
  try {
    normalized = normalizeStyleSheet(sheet);
  } catch (error) {
    if (error instanceof StyleSheetError) throw new StyleSheetRequestError(error.code, 400);
    throw error;
  }
  if (!approval || approval !== styleSheetFingerprint(normalized)) {
    throw new StyleSheetRequestError('style_sheet_not_approved', 409);
  }
  return normalized;
}

/** A planned or rendered deck must carry the approved sheet, unchanged since approval. */
export function assertDeckStyleSheetApproved(deck) {
  if (!deck?.styleSheet) throw new StyleSheetRequestError('style_sheet_not_approved', 409);
  return assertApprovedStyleSheet(deck.styleSheet, deck.styleSheetApproval);
}

/** Writes the approved sheet and its fingerprint onto a planned deck. */
export function attachApprovedStyleSheet(deck, sheet, approval) {
  const approved = assertApprovedStyleSheet(sheet, approval);
  return { ...applyStyleSheetToDeck(deck, approved), styleSheetApproval: styleSheetFingerprint(approved) };
}

/** Plain lines for the slide-layout prompt, taken from a deck's approved sheet. */
export function styleLinesForDeck(deck) {
  return deck?.styleSheet ? styleSheetPromptLines(deck.styleSheet) : [];
}

function parseSheetReply(reply) {
  const text = String(reply || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('style_sheet_reply_not_json');
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('style_sheet_reply_shape_invalid');
  return parsed;
}

function draftMessages({ brief, brandName, brandColors, currentSheet, feedback, images }) {
  const userLines = [
    `Brief: ${String(brief || '').slice(0, 1200)}`,
    `Brand: ${brandName}`,
    brandColors.length ? `Brand colours to respect: ${brandColors.join(', ')}` : 'No brand colours supplied.',
  ];
  if (currentSheet) userLines.push(`Revise this current sheet: ${JSON.stringify(currentSheet)}`);
  if (feedback) userLines.push(`Change request from the user: ${String(feedback).slice(0, 800)}`);
  const content = [{ type: 'text', text: userLines.join('\n') }];
  for (const image of images) {
    if (image.url) content.push({ type: 'image_url', image_url: { url: image.url } });
  }
  return [
    { role: 'system', content: ANALYST_INSTRUCTIONS },
    { role: 'user', content },
  ];
}

/**
 * Drafts a style sheet (new, or a revision with feedback). Returns the sheet and
 * where it came from. Any failure falls back to a preset sheet, never throws.
 */
export async function draftStyleSheet({
  brief = '',
  brandName = 'MavenSync',
  brandColors = [],
  visualStyle = null,
  currentSheet = null,
  feedback = '',
  images = [],
  identity,
  storage = null,
  ai = null,
  env = process.env,
  logger = console,
} = {}) {
  const fallbackStyle = CAROUSEL_VISUAL_STYLE_IDS.includes(visualStyle) ? visualStyle : CAROUSEL_DEFAULT_VISUAL_STYLE;
  const fallback = () => presetStyleSheet({ visualStyle: fallbackStyle, brandName, colors: brandColors });
  try {
    // Storage is only needed to sign reference photos, so text-only drafts never touch it.
    const target = images.length ? (storage || getR2MediaStorage()) : null;
    const signedImages = await Promise.all(images.map(async (image) => ({
      ...image,
      url: await target.createSignedDeliveryReference(image.key, { expiresIn: SIGNED_URL_TTL_SECONDS }),
    })));
    const client = ai || createServerVisionTextIntelligence(identity, { env });
    const reply = await client.complete({
      messages: draftMessages({ brief, brandName, brandColors, currentSheet, feedback, images: signedImages }),
      temperature: 0.3,
    });
    const parsed = parseSheetReply(reply);
    const sheet = normalizeStyleSheet({
      ...parsed,
      visualStyle: CAROUSEL_VISUAL_STYLE_IDS.includes(parsed.visualStyle) ? parsed.visualStyle : fallbackStyle,
    });
    return { sheet, source: 'ai', reason: null };
  } catch (error) {
    logger?.warn?.('[motion-carousel] style sheet drafting unavailable, using preset sheet', error?.code || error?.message || 'unknown_error');
    return { sheet: fallback(), source: 'preset', reason: 'ai_unavailable' };
  }
}
