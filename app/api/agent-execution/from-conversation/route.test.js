import assert from 'node:assert/strict';
import test from 'node:test';
import { CreativeIntentExtractionService } from '../../../../packages/studio/src/lib/intelligence/CreativeIntentExtractionService.js';
import { ProviderStructuredTextIntelligence } from '../../../../packages/studio/src/lib/intelligence/StructuredTextIntelligence.js';
import {
  agentExecutionFromConversationInternals,
  handleAgentExecutionFromConversationPost,
  handleAgentExecutionFromConversationRoute,
} from './route.js';

const identity = { accountId: 'account-1', identityKey: 'creator-1' };

function request(body) {
  return new Request('http://localhost/api/agent-execution/from-conversation', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

async function response(responseValue) {
  return { status: responseValue.status, body: await responseValue.json() };
}

test('accepts only trusted conversation identifiers and returns preparation state', async () => {
  let received;
  const result = await response(await handleAgentExecutionFromConversationPost(request({ agentId: 'agent-1', conversationId: 'conversation-1' }), {
    identity,
    service: { async prepare(input) { received = input; return { ok: true, status: 'requires_approval', jobId: 'job-1', planId: 'plan-1', executionStarted: false }; } },
  }));
  assert.equal(result.status, 200);
  assert.equal(result.body.status, 'requires_approval');
  assert.equal(received.agentId, 'agent-1');
  assert.equal(received.conversationId, 'conversation-1');
  assert.strictEqual(received.identity, identity);
});

test('rejects client semantic, provider, and execution fields', async () => {
  let calls = 0;
  const service = { async prepare() { calls += 1; } };
  for (const extra of [
    { operation: 'image_generation' }, { provider: 'muapi' }, { model: 'attacker-model' },
    { userIntent: 'rewritten' }, { authorizationProof: 'proof' }, { accountId: 'attacker' },
  ]) {
    const result = await response(await handleAgentExecutionFromConversationPost(request({ agentId: 'agent-1', conversationId: 'conversation-1', ...extra }), { identity, service }));
    assert.equal(result.status, 400);
    assert.equal(result.body.code, 'unsupported_conversation_execution_fields');
  }
  assert.equal(calls, 0);
});

test('fails closed without Creator OS identity', async () => {
  const result = await response(await handleAgentExecutionFromConversationPost(request({ agentId: 'agent-1', conversationId: 'conversation-1' }), {
    service: { prepare: assert.fail },
  }));
  assert.equal(result.status, 401);
  assert.equal(result.body.code, 'creator_os_auth_required');
});

test('uses existing authentication and rate limiting before native preparation', async () => {
  let serviceCalls = 0;
  const limited = await response(await handleAgentExecutionFromConversationRoute(request({ agentId: 'agent-1', conversationId: 'conversation-1' }), {
    authenticate: async () => ({ identity, response: null }),
    rateLimit: async () => Response.json({ code: 'rate_limited' }, { status: 429 }),
    service: { async prepare() { serviceCalls += 1; } },
  }));
  assert.equal(limited.status, 429);
  assert.equal(serviceCalls, 0);
});

test('returns ambiguous and unsupported results without exposing authorization details', async () => {
  for (const serviceResult of [
    { ok: true, status: 'ambiguous', clarificationNeeded: 'Which deliverable should I create?', executionStarted: false },
    { ok: true, status: 'unsupported', message: 'Not supported yet.', executionStarted: false },
  ]) {
    const result = await response(await handleAgentExecutionFromConversationPost(request({ agentId: 'agent-1', conversationId: 'conversation-1' }), {
      identity, service: { async prepare() { return serviceResult; } },
    }));
    assert.equal(result.status, 200);
    assert.equal(result.body.status, serviceResult.status);
    assert.equal(JSON.stringify(result.body).includes('authorizationProof'), false);
  }
});

test('requires endpoint, model, and server credential before structured intelligence can call a provider', async (t) => {
  for (const [name, env] of [
    ['missing endpoint', { MAVENSYNC_OPENAI_MODEL: 'small-structured-model', MAVENSYNC_OPENAI_API_KEY: 'server-secret' }],
    ['invalid endpoint', { OPENAI_COMPATIBLE_BASE_URL: '/api/openai/v1', MAVENSYNC_OPENAI_MODEL: 'small-structured-model', MAVENSYNC_OPENAI_API_KEY: 'server-secret' }],
    ['missing model', { OPENAI_COMPATIBLE_BASE_URL: 'https://text.test/v1', MAVENSYNC_OPENAI_API_KEY: 'server-secret' }],
    ['missing credential', { OPENAI_COMPATIBLE_BASE_URL: 'https://text.test/v1', MAVENSYNC_OPENAI_MODEL: 'small-structured-model' }],
  ]) {
    await t.test(name, async () => {
      let providerCalls = 0;
      const intelligence = agentExecutionFromConversationInternals.createServerTextIntelligence({
        env,
        fetchImpl: async () => { providerCalls += 1; return Response.json({}); },
      });
      await assert.rejects(intelligence.extract({}), {
        code: 'creative_intelligence_not_configured',
        status: 503,
      });
      assert.equal(providerCalls, 0);
    });
  }
});

const semanticInputs = {
  deliverable: 'image', subject: 'the person in the trusted portrait', audience: null,
  offer: null, platform: null, format: null, requestedOutcome: null,
  requestedChanges: ['professional studio lighting'], constraints: [],
  websiteMentioned: null, durationSeconds: null, aspectRatio: '1:1',
};

function intentResult(overrides = {}) {
  return {
    status: 'resolved', operation: 'image_editing',
    userIntent: 'Create a professional square portrait from the trusted reference.',
    inputs: semanticInputs,
    referenceRoles: [{ attachmentId: 'asset_1', role: 'source_image' }],
    requestedSkillHints: [], confidence: 0.98, clarificationNeeded: null,
    ...overrides,
  };
}

function configuredTextIntelligence(output, calls) {
  return agentExecutionFromConversationInternals.createServerTextIntelligence({
    env: {
      OPENAI_COMPATIBLE_BASE_URL: 'https://text.test/v1',
      MAVENSYNC_OPENAI_MODEL: 'small-structured-model',
      MAVENSYNC_OPENAI_API_KEY: 'server-secret',
    },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return Response.json({ choices: [{ message: { content: output } }] });
    },
  });
}

test('valid server configuration constructs the provider adapter and emits strict JSON-schema extraction', async () => {
  const calls = [];
  const textIntelligence = configuredTextIntelligence(JSON.stringify(intentResult()), calls);
  assert.equal(textIntelligence instanceof ProviderStructuredTextIntelligence, true);
  const result = await new CreativeIntentExtractionService({ textIntelligence }).extract({
    messages: [{ role: 'user', content: 'Use asset_1 to create a professional 1:1 portrait.' }],
    attachments: [{ attachmentId: 'asset_1', kind: 'image', url: 'https://cdn.test/portrait.png' }],
  });
  assert.equal(result.result.status, 'resolved');
  assert.equal(result.result.operation, 'image_editing');
  assert.deepEqual(result.result.referenceRoles, [{ attachmentId: 'asset_1', role: 'source_image' }]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://text.test/v1/chat/completions');
  const providerBody = JSON.parse(calls[0].options.body);
  assert.equal(providerBody.model, 'small-structured-model');
  assert.equal(providerBody.response_format.type, 'json_schema');
  assert.equal(providerBody.response_format.json_schema.strict, true);
  assert.equal(providerBody.response_format.json_schema.name, 'creative_intent_result');
  assert.equal(providerBody.response_format.json_schema.schema.additionalProperties, false);
  assert.equal(JSON.stringify(providerBody).includes('server-secret'), false);
});

test('configured structured intelligence preserves ambiguous and unsupported semantic states', async () => {
  for (const output of [
    intentResult({
      status: 'ambiguous', operation: null, userIntent: 'Create something using the reference.',
      referenceRoles: [], confidence: 0.4, clarificationNeeded: 'What should the final image depict?',
    }),
    intentResult({
      status: 'unsupported', operation: null, userIntent: 'Create a multi-slide carousel.',
      referenceRoles: [], confidence: 0.99, clarificationNeeded: null,
    }),
  ]) {
    const textIntelligence = configuredTextIntelligence(JSON.stringify(output), []);
    const extracted = await new CreativeIntentExtractionService({ textIntelligence }).extract({
      messages: [{ role: 'user', content: output.userIntent }],
      attachments: [{ attachmentId: 'asset_1', kind: 'image' }],
    });
    assert.equal(extracted.result.status, output.status);
    assert.equal(extracted.result.operation, null);
  }
});

test('configured structured intelligence rejects fenced JSON and prose output', async () => {
  for (const output of [
    `\`\`\`json\n${JSON.stringify(intentResult())}\n\`\`\``,
    `Here is the result: ${JSON.stringify(intentResult())}`,
  ]) {
    const textIntelligence = configuredTextIntelligence(output, []);
    await assert.rejects(
      new CreativeIntentExtractionService({ textIntelligence }).extract({
        messages: [{ role: 'user', content: 'Create a portrait.' }],
        attachments: [{ attachmentId: 'asset_1', kind: 'image' }],
      }),
      /structured_text_output_invalid_json/,
    );
  }
});

test('preserves actionable safe preparation states without exposing raw internal details', async () => {
  for (const [code, status, expected] of [
    ['creative_intelligence_not_configured', 503, 'not configured'],
    ['provider_execution_failed', 502, 'No media was created'],
    ['creative_intent_result_invalid', 422, 'safe creative request'],
    ['authorization_not_active', 409, 'no longer active'],
    ['planning_failed', 422, 'executable creative plan'],
  ]) {
    const result = await response(await handleAgentExecutionFromConversationPost(request({
      agentId: 'design-agent', conversationId: 'session-1',
    }), {
      identity,
      service: {
        async prepare() {
          throw Object.assign(new Error('secret-key raw-provider-payload account-123'), { code, status });
        },
      },
    }));
    assert.equal(result.status, status);
    assert.equal(result.body.code, code);
    assert.match(result.body.error, new RegExp(expected, 'i'));
    assert.doesNotMatch(JSON.stringify(result.body), /secret-key|raw-provider-payload|account-123/);
  }
});
