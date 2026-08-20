import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  createSingleFlightGuard,
  designAgentPreparationError,
  designAgentPreparationPresentation,
  designAgentStartRequest,
  normalizeDesignAgentSessionId,
} from './designAgentExecutionState.js';

test('Start Creative Work is unavailable without a valid Design Agent session', () => {
  assert.equal(normalizeDesignAgentSessionId(null), null);
  assert.equal(normalizeDesignAgentSessionId('  '), null);
  assert.equal(designAgentStartRequest(null), null);
});

test('valid session produces the exact two-field preparation request with no browser execution data', () => {
  const request = designAgentStartRequest(' session-1 ');
  assert.deepEqual(request, { agentId: 'design-agent', conversationId: 'session-1' });
  for (const field of ['attachments', 'references', 'assetUrls', 'provider', 'model', 'operation', 'inputs', 'authorization']) {
    assert.equal(Object.hasOwn(request, field), false);
  }
});

test('single-flight guard suppresses duplicate Start submissions and permits a later retry', async () => {
  const run = createSingleFlightGuard();
  let release;
  let calls = 0;
  const first = run(async () => {
    calls += 1;
    await new Promise((resolve) => { release = resolve; });
    return 'prepared';
  });
  assert.deepEqual(await run(async () => { calls += 1; }), { skipped: true });
  assert.equal(calls, 1);
  release();
  assert.equal(await first, 'prepared');
  await run(async () => { calls += 1; });
  assert.equal(calls, 2);
});

test('canonical preparation states have safe conversational presentation', () => {
  assert.deepEqual(designAgentPreparationPresentation({ status: 'ambiguous', clarificationNeeded: 'Which format should I create?' }), {
    title: 'One detail is needed', detail: 'Which format should I create?',
  });
  assert.equal(designAgentPreparationPresentation({ status: 'unsupported' }).title, 'This creative request is not supported yet');
  assert.match(designAgentPreparationPresentation({ status: 'requires_input' }).detail, /Design Agent conversation/);
  assert.match(designAgentPreparationPresentation({ status: 'requires_approval' }).detail, /does not create media/);
  assert.match(designAgentPreparationPresentation({ status: 'ready' }).detail, /not enabled/);
});

test('historical unbound sessions receive safe new-session guidance', () => {
  assert.equal(
    designAgentPreparationError({ code: 'design_session_ownership_unverified' }),
    'This older Design Agent session is not connected to Creator OS creative execution. Start a new Design Agent session to use this feature.',
  );
  assert.doesNotMatch(designAgentPreparationError({ code: 'provider_secret_detail' }), /provider_secret_detail/);
});

test('safe preparation failures remain actionable without exposing internal messages', () => {
  for (const [code, expected] of [
    ['creative_intelligence_not_configured', /not configured/],
    ['provider_execution_failed', /No media was created/],
    ['creative_intent_result_invalid', /safe creative request/],
    ['authorization_not_active', /expired/],
    ['planning_failed', /executable creative plan/],
  ]) {
    const message = designAgentPreparationError({ code, message: 'raw provider payload secret-key account-123' });
    assert.match(message, expected);
    assert.doesNotMatch(message, /raw provider payload|secret-key|account-123/);
  }
});

test('Design Agent UI adapter cannot invoke the execution endpoint', async () => {
  const source = await readFile(new URL('./DesignAgentExecutionPanel.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /executeAgentCreativeJob|agent-execution\/execute/);
  assert.match(source, /beginAgentExecutionFromConversation/);
  assert.match(source, /approveAgentExecutionPlan/);
  assert.match(source, /onApprove=\{handleApproval\}/);
  assert.doesNotMatch(source, /onCreate=/);
});

test('Creative Work is a non-overlay host section and replaces its initial action with one preparation state', async () => {
  const panel = await readFile(new URL('./DesignAgentExecutionPanel.jsx', import.meta.url), 'utf8');
  const studio = await readFile(new URL('./DesignAgentStudio.jsx', import.meta.url), 'utf8');
  assert.match(panel, /Ready to turn this conversation into content\?/);
  assert.match(panel, /Preparation does not create media\./);
  assert.match(panel, /!state \? \(/);
  assert.doesNotMatch(panel, /absolute|shadow-xl|top-20|right-4/);
  assert.match(studio, /<aside/);
  assert.match(studio, /min-w-0 flex-1/);
  assert.doesNotMatch(studio, /absolute right-4 top-20/);
});
