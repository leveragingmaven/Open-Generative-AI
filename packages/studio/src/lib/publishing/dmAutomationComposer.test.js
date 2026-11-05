import test from 'node:test';
import assert from 'node:assert/strict';
import { automationEditor, automationChanges } from './dmAutomationComposer.js';
test('unchanged editor sends no patch and preserves hidden remote rule configuration', () => {
  const original = { id: 'a', accountId: 'ig', name: 'Rule', keywords: ['ONE', 'TWO'], matchMode: 'word', dmMessage: 'Hi', isActive: true, alsoMatchInDms: true, audience: { followerStatus: 'follower', whenUnknown: 'verify', minFollowerCount: 12 }, excludeKeywords: ['NO'], buttons: [{ type: 'url' }] };
  const editor = automationEditor(original);
  assert.deepEqual(automationChanges(editor, original, 'instagram'), {});
  editor.name = 'Renamed';
  assert.deepEqual(automationChanges(editor, original, 'instagram'), { name: 'Renamed' });
  assert.deepEqual(original.keywords, ['ONE', 'TWO']);
});
test('new Instagram rule defaults paused with explicit unknown-status skip policy', () => {
  const editor = automationEditor({ accountId: 'ig', name: 'Rule', keywords: ['ONE'], dmMessage: 'Hi' });
  const body = automationChanges(editor, null, 'instagram');
  assert.equal(body.isActive, false);
  assert.deepEqual(body.audience, { followerStatus: 'any', whenUnknown: 'skip' });
  editor.keywordText = 'ONE\nTWO\n';
  assert.deepEqual(automationChanges(editor, null, 'instagram').keywords, ['ONE', 'TWO']);
});
test('Facebook payload never includes Instagram gate fields', () => {
  const editor = automationEditor({ accountId: 'fb', audience: { followerStatus: 'follower', whenUnknown: 'verify' }, followGate: { message: 'Follow' } });
  const body = automationChanges(editor, null, 'facebook');
  assert.equal('audience' in body, false);
  assert.equal('followGate' in body, false);
});
