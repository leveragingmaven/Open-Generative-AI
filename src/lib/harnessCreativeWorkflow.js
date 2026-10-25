// Thin service adapter: the existing carousel endpoint/worker and Publishing draft format own execution.
import { createHash } from 'node:crypto';
import { requireCreatorIdentityOrService } from './creatorOsAuthOrService.js';
import { requireCreatorOsRateLimit } from './creatorOsRateLimit.js';
import { canUseMotionCarousel, motionCarouselAccessDeniedResponse } from './motionCarouselAccess.js';
import { handleMotionCarouselPost } from './motionCarouselEndpoint.js';
import { MySqlMotionCarouselJobStore, publicMotionCarouselJobView } from './motionCarouselJobStore.js';
import { getR2MediaStorage } from './r2MediaStorage.js';
import { ownedCarouselFile } from './motionCarouselStorage.js';
import { publishMotionCarouselSlides } from './motionCarouselPublishing.js';
import { presetStyleSheet } from '../../packages/studio/src/lib/motion/carousel/CarouselStyleSheet.js';
import { styleSheetFingerprint } from './motionCarouselStyleSheet.js';
import { normalizePublishingDraft } from '../../packages/studio/src/lib/publishing/publishingTypes.js';

export function workflowFingerprint(value) {
  const stable = item => item === null || typeof item !== 'object' ? JSON.stringify(item) : Array.isArray(item) ? `[${item.map(stable).join(',')}]` : `{${Object.keys(item).sort().filter(key => item[key] !== undefined).map(key => `${JSON.stringify(key)}:${stable(item[key])}`).join(',')}}`;
  return createHash('sha256').update(stable(value)).digest('hex');
}
function fail(code, status = 400) { return Response.json({ ok: false, code, error: code }, { status }); }
const SCOPES = { preview: 'creative.prepare', status: 'creative.read', render: 'creative.execute', retry: 'creative.execute', draft: 'publishing' };
const FIELDS = { preview: ['brief', 'slideCount'], status: ['jobId'], render: ['deck', 'presetId', 'brief'], retry: ['jobId'], draft: ['jobId', 'caption', 'title'] };
const draftKey = (identity, id) => `creator-os/production/accounts/${createHash('sha256').update(String(identity.accountId)).digest('hex')}/publishing-handoffs/${id}.json`;
async function bytes(object) {
  if (Buffer.isBuffer(object?.Body)) return object.Body;
  const chunks = []; let size = 0;
  for await (const chunk of object?.Body || []) { size += chunk.length; if (size > 1024 * 1024) throw new Error('handoff_too_large'); chunks.push(Buffer.from(chunk)); }
  return Buffer.concat(chunks);
}

export async function handleHarnessCreativeWorkflow(request, options = {}) {
  const { authenticate = requireCreatorIdentityOrService, rateLimit = requireCreatorOsRateLimit, env = process.env } = options;
  const isGet = request.method === 'GET';
  let body;
  try { body = isGet ? {} : await request.json(); } catch { return fail('invalid_json'); }
  const action = body?.action;
  if (!isGet && (!Object.hasOwn(SCOPES, action) || !body || Array.isArray(body))) return fail('unsupported_workflow_action');
  const auth = await authenticate(request, { requiredScope: isGet ? 'publishing' : SCOPES[action] });
  if (auth.response) return auth.response;
  const identity = auth.identity;
  if (!identity?.accountId || !identity?.identityKey) return fail('creator_os_auth_required', 401);
  // Browser access is read-only and imports a draft through the existing composer.
  if (!isGet && identity.authSource !== 'service') return fail('service_auth_required', 401);
  const limited = await rateLimit(request, identity); if (limited) return limited;
  try {
    if (isGet) {
      const id = new URL(request.url).searchParams.get('draft');
      if (!/^draft-harness-[a-f0-9]{64}$/.test(id || '')) return fail('draft_not_found', 404);
      const storage = options.storage || getR2MediaStorage();
      const key = draftKey(identity, id);
      if (!await storage.getMetadata(key)) return fail('draft_not_found', 404);
      const object = await storage.getObject(key);
      if (!object) return fail('draft_not_found', 404);
      const saved = JSON.parse((await bytes(object)).toString('utf8'));
      if (saved.accountId !== String(identity.accountId) || saved.identityKey !== identity.identityKey) return fail('draft_not_found', 404);
      return Response.json({ ok: true, draft: saved.draft });
    }
    if (!canUseMotionCarousel(identity, { env })) return motionCarouselAccessDeniedResponse();
    if (Object.keys(body).some(key => !['action', 'approval', ...FIELDS[action]].includes(key))) return fail('unsupported_workflow_fields');
    const payload = Object.fromEntries(FIELDS[action].filter(key => body[key] !== undefined).map(key => [key, body[key]]));
    const requiresApproval = ['render', 'retry', 'draft'].includes(action);
    if (requiresApproval) {
      // A service token is not consent. Harness emits this attestation only after
      // resolving an existing, exact-input, user-decided RuntimeApprovalStore record.
      const approval = body.approval;
      if (!approval || typeof approval.requestId !== 'string' || !approval.requestId.trim() || typeof approval.goalId !== 'string' || !approval.goalId.trim()
        || approval.inputSha256 !== workflowFingerprint({ action, ...payload })) return fail('workflow_approval_required', 403);
    }
    if (action === 'preview') {
      if (typeof body.brief !== 'string' || !body.brief.trim() || body.brief.length > 30000) return fail('brief_required');
      // Use the existing preset locally: preview cannot make a paid style-sheet call.
      const sheet = presetStyleSheet({ brandName: 'MavenSync' });
      return handleMotionCarouselPost({ json: async () => ({ action: 'plan', ...payload, styleSheet: sheet, styleSheetApproval: styleSheetFingerprint(sheet) }) }, { ...options, identity });
    }
    const store = options.store || new MySqlMotionCarouselJobStore();
    if (action === 'render' || action === 'retry') {
      if (action === 'retry') {
        const existing = await store.get(String(body.jobId || ''), { accountId: identity.accountId });
        if (!existing || existing.creatorIdentityKey !== identity.identityKey) return fail('carousel_not_found', 404);
        if (['queued', 'running', 'completed'].includes(existing.status)) return Response.json({ ok: true, action, deduped: true, job: publicMotionCarouselJobView(existing) });
      }
      return handleMotionCarouselPost({ json: async () => ({ action, ...payload, ...(action === 'render' ? { idempotencyKey: `harness:${workflowFingerprint({ accountId: identity.accountId, goalId: body.approval.goalId, ...payload })}` } : {}) }) }, { ...options, identity, store });
    }
    const job = await store.get(String(body.jobId || ''), { accountId: identity.accountId });
    if (!job || job.creatorIdentityKey !== identity.identityKey) return fail('carousel_not_found', 404);
    if (action === 'status') {
      if (job.status !== 'completed') return Response.json({ ok: true, jobId: job.id, status: job.status, verified: false, phase: job.phase });
      const files = job.result?.storage?.files || [];
      const storage = options.storage || getR2MediaStorage();
      const expectedSlides = job.deck?.slides?.length || 0;
      const names = new Set(files.map(file => file.name));
      const expected = Array.from({ length: expectedSlides }, (_, index) => String(index + 1).padStart(2, '0')).flatMap(n => [`slide-${n}.mp4`, `slide-${n}.png`]);
      if (!expectedSlides || job.result?.storage?.state !== 'stored' || [...expected, 'full-deck.mp4', 'slides-still.pdf'].some(name => !names.has(name))) return fail('carousel_exports_unverified', 409);
      for (const file of files) {
        if (!ownedCarouselFile(job, file.name)) return fail('carousel_exports_unverified', 409);
        const head = await storage.getMetadata(file.key);
        if (!head || Number(head.sizeBytes) !== file.bytes || !file.sha256 || head.metadata?.sha256 !== file.sha256) return fail('carousel_exports_unverified', 409);
      }
      const exports = files.map(file => ({ name: file.name, url: `/api/motion-carousel?jobId=${encodeURIComponent(job.id)}&file=${encodeURIComponent(file.name)}` }));
      return Response.json({ ok: true, jobId: job.id, status: job.status, verified: true, slideCount: expectedSlides, exports });
    }
    if (job.status !== 'completed') return fail('carousel_not_ready', 409);
    if (typeof body.caption !== 'string' || body.caption.length > 30000 || (body.title !== undefined && (typeof body.title !== 'string' || body.title.length > 300))) return fail('invalid_draft_content');
    const storage = options.storage || getR2MediaStorage();
    const id = `draft-harness-${workflowFingerprint({ accountId: identity.accountId, jobId: job.id, caption: body.caption, title: body.title || '' })}`;
    const key = draftKey(identity, id);
    let draft;
    const existing = await storage.getMetadata(key) ? await storage.getObject(key) : null;
    if (existing) draft = JSON.parse((await bytes(existing)).toString('utf8')).draft;
    else {
      const response = await publishMotionCarouselSlides({ jobId: job.id }, { ...options, identity, store, storage });
      if (!response.ok) return response;
      const registered = await response.json();
      draft = normalizePublishingDraft({ id, ownerId: identity.identityKey, tenantId: String(identity.accountId), title: body.title || 'Motion carousel', caption: body.caption, assets: registered.assets, assetIds: registered.assets.map(asset => asset.id), platforms: [], scheduledAt: null, status: 'draft' });
      const content = Buffer.from(JSON.stringify({ accountId: String(identity.accountId), identityKey: identity.identityKey, draft }));
      await storage.putObject({ key, body: content, contentType: 'application/json', sizeBytes: content.length, metadata: { sha256: createHash('sha256').update(content).digest('hex') } });
      const head = await storage.getMetadata(key);
      if (!head || Number(head.sizeBytes) !== content.length) return fail('draft_storage_unverified', 503);
    }
    return Response.json({ ok: true, draftId: id, status: 'draft', scheduledAt: null, published: false, assetCount: draft.assetIds.length, url: `/studio/publishing?handoff=${id}` });
  } catch {
    return fail('creative_workflow_unavailable', 503);
  }
}
