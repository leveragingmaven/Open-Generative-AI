import test from 'node:test';
import assert from 'node:assert/strict';
import { copyAssistantResponseText } from './copyAssistantResponse.js';

test('copies assistant response text to the clipboard', async () => {
  const written = [];
  await copyAssistantResponseText('Hello **Maven**', { writeText: async (value) => { written.push(value); } });
  assert.deepEqual(written, ['Hello **Maven**']);
});

test('rejects empty responses without touching the clipboard', async () => {
  let called = false;
  await assert.rejects(copyAssistantResponseText('   ', { writeText: async () => { called = true; } }), /empty/);
  assert.equal(called, false);
});

test('rejects when clipboard access is unavailable', async () => {
  await assert.rejects(copyAssistantResponseText('text', undefined), /Clipboard access is unavailable/);
});
