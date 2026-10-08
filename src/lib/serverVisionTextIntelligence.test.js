import test from 'node:test';
import assert from 'node:assert/strict';
import { serverVisionTextIntelligenceInternals } from './serverVisionTextIntelligence.js';

const env = { MAVENSYNC_SERVICE_AUTH_SECRET: 'test-secret' };

test('vision broker token is issued for a normal customer email', () => {
  const token = serverVisionTextIntelligenceInternals.issueModelBrokerToken({ email: 'martha@gmail.com' }, env);
  assert.equal(token.split('.').length, 3);
});

test('vision broker rejects a malformed identity email', () => {
  assert.throws(
    () => serverVisionTextIntelligenceInternals.issueModelBrokerToken({ email: 'not-an-email' }, env),
    (error) => error.code === 'vision_intelligence_not_configured',
  );
});

test('vision broker validateMessages keeps only http(s) image parts', () => {
  const messages = serverVisionTextIntelligenceInternals.validateMessages([
    { role: 'user', content: [
      { type: 'text', text: 'look' },
      { type: 'image_url', image_url: { url: 'https://cdn.example.com/a.png' } },
    ] },
  ]);
  assert.deepEqual(messages[0].content[1], { type: 'image_url', image_url: { url: 'https://cdn.example.com/a.png' } });
  assert.throws(() => serverVisionTextIntelligenceInternals.validateMessages([
    { role: 'user', content: [{ type: 'image_url', image_url: { url: 'file:///etc/passwd' } }] },
  ]), /Vision image URL is invalid/);
});
