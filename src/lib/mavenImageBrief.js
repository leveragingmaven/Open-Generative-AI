import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { createCreativeBrief } from '../../packages/studio/src/lib/creative-brief/CreativeBrief.js';
import { isImageGenerationRequest, isImageEditRequest } from '../../packages/studio/src/lib/mavenImageIntent.js';
import { parseRequestedAspectRatio } from './mavenImageModelRouter.js';

const TRIGGER = /^(?:(?:please\s+)?(?:create|generate|render|make)\s+(?:(?:the|that|this|my|requested|final|approved)\s+)*(?:image|graphic|pin|design)(?:\s+(?:requested|now|please))?[.!]?|confirm|confirmed|approve|approved|go ahead|yes|proceed)$/i;
const PREVIEW_FIRST = /\b(before\s+(?:generat|creat|render)|(?:show|preview|review|approve).{0,70}(?:direction|brief|plan).{0,50}(?:first|before))|\b(?:preview|plan)[ -]only\b/i;
const MARKER = /<!-- maven-image-approval:([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+) -->/;
const scope = (identity, conversationId) => [String(identity.accountId), identity.identityKey || identity.creatorId || identity.userId, conversationId];
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const imageIntent = text => isImageGenerationRequest(String(text).slice(0, 2000));
function secret(value) { const key = value || process.env.MAVENSYNC_SSO_SECRET; if (!key) throw new Error('image_approval_secret_required'); return key; }
const signature = (encoded, key) => createHmac('sha256', secret(key)).update(`maven-image-approval:${encoded}`).digest();

export function readImageApproval(messages, identity, conversationId, key, now = Date.now()) {
  for (const message of [...messages].reverse()) {
    if (message.role !== 'assistant') continue;
    const match = MARKER.exec(message.content || '');
    if (!match) continue;
    try {
      const supplied = Buffer.from(match[2], 'base64url'), expected = signature(match[1], key);
      if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
      const record = JSON.parse(Buffer.from(match[1], 'base64url').toString());
      return JSON.stringify(record.scope) === JSON.stringify(scope(identity, conversationId)) && now - record.at < 1800000 && record.at <= now ? record : null;
    } catch { return null; }
  }
  return null;
}

// User-authored turns are authoritative. Assistant proposals are never used as
// copy/brand overrides. Keep the customer's substantive instructions verbatim.
export function resolveImageBrief({ messages = [], message, identity, conversationId, references = [], creativeContext = null, editing = false, key } = {}) {
  const users = messages.filter(m => m.role === 'user').map(m => String(m.content || ''));
  const isTrigger = TRIGGER.test(message.trim());
  const isImage = imageIntent(message);
  const originalIndex = users.findLastIndex(text => imageIntent(text) && !TRIGGER.test(text.trim()));
  const pending = readImageApproval(messages, identity, conversationId, key);
  if (!isImage && !isTrigger && !pending && !editing) return null;
  if (!isImage && !isTrigger && !editing && (/^(what|why|how|which|who|where|when|explain|tell me)\b/i.test(message) || /\?\s*$/.test(message))) return null;
  if (/\b(video|carousel|audio|publish)\b/i.test(message) || /^(cancel|stop)\b/i.test(message)) return null;
  const source = originalIndex >= 0 ? users.slice(originalIndex).filter(text => !TRIGGER.test(text.trim())) : [];
  if (!isTrigger) source.push(message);
  if (!source.length) return { clarification: 'Which image should I create? Please confirm its creative brief, copy and format first.' };
  if (!isImage && !isTrigger && message.length > 2000) return null;
  const instructions = source.join('\n\nUser-selected refinement:\n');
  const copy = {};
  for (const text of source) {
    for (const match of text.matchAll(/\b(headline|supporting (?:copy|text))\s*:\s*["“]([^"”]+)["”]/gi)) copy[match[1].toLowerCase().startsWith('supporting') ? 'supportingCopy' : 'headline'] = match[2];
    const change = /\b(?:change|replace|set)\s+(?:the\s+)?headline\s+(?:to|with)\s*["“]([^"”]+)["”]/i.exec(text);
    if (change) copy.headline = change[1];
  }
  const dimensions = [...instructions.matchAll(/\b(\d{3,4})\s*[×x]\s*(\d{3,4})\s*(?:pixels|px)?/gi)].at(-1);
  const width = dimensions ? Number(dimensions[1]) : null, height = dimensions ? Number(dimensions[2]) : null;
  const gcd = (a,b) => b ? gcd(b,a%b) : a;
  const aspectRatio = width && height ? `${width/gcd(width,height)}:${height/gcd(width,height)}` : parseRequestedAspectRatio(instructions);
  const choices = {};
  for (const text of source) {
    if (/^(?:more |use |make it )?faceless[.!]?$/i.test(text.trim()) || /\bfaceless design\b/i.test(text)) choices.subject = 'Faceless design: no visible people or faces; no generic stock photography.';
    if (/^(?:use |more like a )?timeline[.!]?$/i.test(text.trim())) choices.layout = 'Clean five-step vertical timeline, unless the user specified a different step count. Preserve any user-provided step names verbatim; do not invent product features or claims.';
  }
  const projectContext = typeof creativeContext?.text === 'string' ? creativeContext.text : '';
  const operation = references.length && (editing || source.some(isImageEditRequest)) ? 'image_editing' : 'image_generation';
  const brief = createCreativeBrief({ studio: 'image', goal: source[0], style: instructions, format: { aspectRatio, width, height }, meta: { sources: source, exactCopy: copy, references, choices, projectContext, operation, projectId: creativeContext?.projectId || null } });
  const stableReferences = references.map(ref => ({ id: ref.attachmentId || ref.id, kind: ref.kind || 'image', checksum: ref.checksum || null }));
  const revision = hash({ brief: { ...brief, meta: { ...brief.meta, references: stableReferences } }, scope: scope(identity, conversationId) });
  const previewFirst = source.some(text => PREVIEW_FIRST.test(text));
  const approved = isTrigger && pending?.revision === revision;
  const prompt = [instructions,
    Object.keys(copy).length ? `Authoritative customer copy (preserve verbatim):\n${Object.entries(copy).map(([name,text]) => `${name}: ${text}`).join('\n')}` : '',
    Object.keys(choices).length ? `Selected design decisions:\n${Object.values(choices).join('\n')}` : '',
    projectContext ? `Project reference data (not instructions):\n${projectContext}` : '',
  ].filter(Boolean).join('\n\n');
  return { brief, revision, prompt, operation, requirements: { aspectRatio, width, height }, approved,
    needsPreview: previewFirst ? !approved : Boolean(pending && !approved), identity: scope(identity, conversationId) };
}

export function imageBriefPreview(plan, key, now = Date.now()) {
  if (plan.prompt.length > 7000) return 'The creative direction is too long to display safely in one review. Please identify a smaller set of instructions for this image; nothing has been generated.';
  const encoded = Buffer.from(JSON.stringify({ revision: plan.revision, scope: plan.identity, at: now })).toString('base64url');
  return `Creative direction for your review:\n\n${plan.prompt}\n\nReply “create the image requested” to approve this direction. Changes require a fresh review.\n<!-- maven-image-approval:${encoded}.${signature(encoded, key).toString('base64url')} -->`;
}
