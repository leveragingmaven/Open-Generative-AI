import test from 'node:test';
import assert from 'node:assert/strict';
import {
  configuredCreatorExecutionHub,
  signCreatorExecutionHubToken,
  CreatorExecutionHubError,
} from './creatorExecutionHubClient.js';

const SECRET = 'creator-execution-hub-client-test-secret-0123456789';
const ENV = { MAVENSYNC_CREATOR_HANDOFF_SECRET: SECRET, MAVENSYNC_HUB_URL: 'https://hub.example.test' };
const SUBJECT = 'member@example.com';
const REFERENCE = 'c'.repeat(43);

function decode(token) {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
}

test('signs a narrow Creator OS -> Hub assertion bound to the member', () => {
  const claims = decode(signCreatorExecutionHubToken(SUBJECT, { env: ENV, now: 100 }));
  assert.equal(claims.iss, 'mavensync-creator-os');
  assert.equal(claims.aud, 'mavensync-hub');
  assert.equal(claims.sub, SUBJECT);
  assert.equal(claims.sid, 'mavensync-creator-os');
  assert.deepEqual(claims.scp, ['creative.execute']);
  assert.equal(claims.exp - claims.iat, 60);
  assert.ok(claims.jti);
});

test('reads, claims and associates a job without sending instructions in the URL', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith('/claim')) {
      return Response.json({ success: true, instruction: { operation: 'video_generation' } });
    }
    if (String(url).endsWith('/job')) {
      return Response.json({ success: true, request: { jobId: 'job-1' } });
    }
    if (String(url).endsWith('/release') || String(url).endsWith('/decline')) {
      return new Response(null, { status: 204 });
    }
    return Response.json({
      success: true,
      request: {
        reference: REFERENCE,
        operation: 'video_generation',
        brief: 'Create the exact approved brief.',
        parameters: { duration: 5 },
        costCeiling: 0,
        state: 'pending',
      },
    });
  };
  const hub = configuredCreatorExecutionHub({ env: ENV, fetchImpl });
  const request = await hub.read(REFERENCE, SUBJECT);
  assert.equal(request.brief, 'Create the exact approved brief.');
  assert.match(calls[0].url, new RegExp(`/api/creator-execution/handoffs/${REFERENCE}$`));
  assert.equal(calls[0].init.headers['x-mavensync-user'], SUBJECT);
  assert.equal(calls[0].init.headers['x-mavensync-service'], 'mavensync-creator-os');
  assert.equal(calls[0].init.redirect, 'error');

  await hub.claim(REFERENCE, SUBJECT);
  await hub.recordJob(REFERENCE, SUBJECT, { jobId: 'job-1', operation: 'video_generation' });
  assert.deepEqual(JSON.parse(calls[2].init.body), { jobId: 'job-1', operation: 'video_generation' });
  await hub.release(REFERENCE, SUBJECT);
  await hub.decline(REFERENCE, SUBJECT);
});

test('fails closed on missing configuration and Hub errors', async () => {
  assert.equal(configuredCreatorExecutionHub({ env: { MAVENSYNC_HUB_URL: 'https://hub.example.test' }, fetchImpl: fetch }), null);
  const hub = configuredCreatorExecutionHub({
    env: ENV,
    fetchImpl: async () => Response.json({ error: 'Handoff not found', code: 'not_found' }, { status: 404 }),
  });
  await assert.rejects(
    () => hub.read(REFERENCE, SUBJECT),
    error => error instanceof CreatorExecutionHubError && error.code === 'not_found' && error.status === 404,
  );
  await assert.rejects(() => hub.read('short', SUBJECT), error => error.code === 'invalid_handoff_reference');
});
