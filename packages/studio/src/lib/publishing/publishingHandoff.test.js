import assert from 'node:assert/strict';
import test from 'node:test';
import { importPublishingHandoff } from './publishingHandoff.js';
import { PublishingCenterMVP } from './PublishingCenterMVP.js';
import { MuApiPublishingProvider } from './MuApiPublishingProvider.js';

const id = `draft-harness-${'a'.repeat(64)}`;
function fixture() {
  const data = new Map(); let providerCalls = 0;
  const storage = { getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, String(value)) };
  const provider = new MuApiPublishingProvider({ fetchFn: async () => { providerCalls++; throw new Error('No provider calls permitted'); } });
  return { center: new PublishingCenterMVP({ storage, publishingProvider: provider }), calls: () => providerCalls };
}
const draft = { id, status: 'draft', scheduledAt: null, publishedAt: null, assets: [{ id: 'owned-slide-1', url: '/api/creative-assets/media?assetId=owned-slide-1', type: 'image' }], assetIds: ['owned-slide-1'], caption: 'Approved exact caption', title: 'Approved title' };
test('authenticated handoff imports into the existing composer as one unscheduled draft without provider calls', async () => {
  const { center, calls } = fixture();
  const fetcher = async (url, options) => { assert.equal(url, `/api/motion-carousel/harness?draft=${id}`); assert.equal(options.credentials, 'same-origin'); return Response.json({ draft }); };
  const imported = await importPublishingHandoff(id, center, { fetcher });
  assert.equal(imported.caption, draft.caption); assert.equal(imported.status, 'draft'); assert.equal(imported.scheduledAt, null); assert.deepEqual(imported.platforms, []);
  center.updateDraft(id, { caption: 'Customer edited caption' });
  const repeated = await importPublishingHandoff(id, center, { fetcher });
  assert.equal(repeated.caption, 'Customer edited caption'); assert.equal(center.getDrafts().length, 1); assert.equal(calls(), 0);
});
test('authentication failures and non-draft handoffs do not create a draft', async () => {
  const { center, calls } = fixture();
  for (const status of [401, 403, 404, 503]) await assert.rejects(importPublishingHandoff(id, center, { fetcher: async () => Response.json({}, { status }) }));
  for (const bad of [{ ...draft, status: 'scheduled' }, { ...draft, scheduledAt: '2030-01-01' }, { ...draft, providerJobId: 'already-sent' }, { ...draft, id: 'foreign' }]) await assert.rejects(importPublishingHandoff(id, center, { fetcher: async () => Response.json({ draft: bad }) }));
  assert.equal(center.getDrafts().length, 0); assert.equal(calls(), 0);
});
