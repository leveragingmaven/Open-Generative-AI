// Test-only loopback fixture. Real service authentication, handlers, jobs and native rendering;
// fake account lookup, MySQL/object storage and no outbound provider access.
import http from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { handleHarnessCreativeWorkflow } from '../src/lib/harnessCreativeWorkflow.js';
import { requireCreatorIdentityOrService } from '../src/lib/creatorOsAuthOrService.js';
import { InMemoryMotionCarouselJobStore } from '../src/lib/motionCarouselJobStore.js';
import { createMotionCarouselWorker } from '../src/lib/motionCarouselWorker.js';
import { createNativeMotionRenderer } from '../src/lib/motion/native/NativeMotionRenderer.js';
import { S3AssetStorage } from '../packages/studio/src/lib/intelligence/S3AssetStorage.js';

const root = process.env.WORKFLOW_FIXTURE_OUTPUT;
if (!root || !process.env.MAVENSYNC_SERVICE_AUTH_SECRET) throw new Error('Explicit fixture configuration required');
await mkdir(root, { recursive: true });
const store = new InMemoryMotionCarouselJobStore();
const objects = new Map(), assets = new Map();
let failNext = false, renderCalls = 0, draftWrites = 0;
const storage = new S3AssetStorage({ bucket: 'fixture', client: {
  async putObject({ Key, Body, ContentType, ContentLength, Metadata }) {
    const chunks = []; if (Buffer.isBuffer(Body)) chunks.push(Body); else for await (const chunk of Body) chunks.push(Buffer.from(chunk));
    const body = Buffer.concat(chunks); objects.set(Key, { body, ContentType, ContentLength, Metadata });
    if (/\/publishing-handoffs\//.test(Key)) draftWrites++;
    if (/^(slide-\d+\.(png|mp4)|full-deck.mp4|slides-still.pdf|cover.png)$/.test(basename(Key))) await writeFile(join(root, basename(Key)), body);
  },
  async headObject({ Key }) { const object = objects.get(Key); if (!object) throw new Error('NotFound'); return object; },
  async getObject({ Key }) { const object = objects.get(Key); return object ? { Body: object.body, ...object } : null; },
  async deleteObject({ Key }) { objects.delete(Key); },
} });
const native = createNativeMotionRenderer({ logger: { log() {}, warn() {} } });
const renderer = { ...native, async render(args) { renderCalls++; if (failNext) { failNext = false; throw new Error('fixture_one_time_render_failure'); } return native.render({ ...args, options: { ...args.options, fps: 6, durationSeconds: 1 } }); } };
const worker = createMotionCarouselWorker({ store, storage, renderer, outputDirFor: job => join(root, 'scratch', job.id), env: {}, logger: { log() {}, warn() {} }, cancelPollMs: 25, pollMs: 25 });
const authenticate = (request, options) => requireCreatorIdentityOrService(request, { ...options, resolveAccountId: async key => key, authenticate: async () => ({ response: Response.json({ code: 'fixture_session_required' }, { status: 401 }) }) });
const options = { authenticate, rateLimit: async () => null, store, storage, renderer, startWorker: () => { void worker.start(); }, env: { MAVEN_MOTION_OWNER_ALLOWLIST: 'owner@example.com,other@example.com' }, repository: { db: {}, async saveOnConnection(_db, asset) { assets.set(asset.id, asset); return asset; } } };
globalThis.fetch = async () => { throw new Error('Outbound access disabled in workflow fixture'); };
const server = http.createServer(async (req, res) => {
  try {
    if (req.url === '/__fixture/fail-next' && req.method === 'POST') { failNext = true; res.end('{}'); return; }
    if (req.url === '/__fixture/corrupt-metadata' && req.method === 'POST') { for (const object of objects.values()) if (object.ContentType === 'video/mp4') object.Metadata = { ...object.Metadata, sha256: 'invalid' }; res.end('{}'); return; }
    if (req.url === '/__fixture/state') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ jobs: [...store.jobs.values()].map(job => ({ id: job.id, status: job.status, attemptCount: job.attemptCount })), renderCalls, draftWrites, assets: assets.size })); return; }
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const request = new Request(`http://127.0.0.1${req.url}`, { method: req.method, headers: req.headers, ...(req.method === 'POST' ? { body: Buffer.concat(chunks) } : {}) });
    const response = await handleHarnessCreativeWorkflow(request, options);
    res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()));
  } catch { res.writeHead(500); res.end('{"code":"fixture_failed"}'); }
});
server.listen(0, '127.0.0.1', () => process.stdout.write(`WORKFLOW_FIXTURE_PORT=${server.address().port}\n`));
process.on('SIGTERM', () => { worker.stop(); server.close(); process.exit(0); });
