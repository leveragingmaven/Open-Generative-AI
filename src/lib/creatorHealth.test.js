import assert from 'node:assert/strict';
import test from 'node:test';
import { creatorLiveness, creatorReadiness } from './creatorHealth.js';

test('liveness does not depend on the database', () => {
  assert.deepEqual(creatorLiveness(), { ok: true, service: 'creator-os' });
});

test('readiness confirms database connectivity', async () => {
  const calls = [];
  const result = await creatorReadiness({ db: { query: async (sql) => calls.push(sql) } });
  assert.equal(result.status, 200);
  assert.equal(result.body.database, 'ready');
  assert.deepEqual(calls, ['SELECT 1 AS ready']);
});

test('readiness fails closed without exposing database errors', async () => {
  const result = await creatorReadiness({ db: { query: async () => { throw new Error('sensitive connection detail'); } } });
  assert.equal(result.status, 503);
  assert.equal(result.body.code, 'creator_database_unavailable');
  assert.equal(JSON.stringify(result).includes('sensitive connection detail'), false);
});
