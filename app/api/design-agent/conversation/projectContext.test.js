import test from 'node:test';
import assert from 'node:assert/strict';

import {
  handleDesignAgentConversationPost,
  createControlledConversationIntelligence,
} from '../../../../src/lib/designAgentConversationEndpoint.js';
import { DESIGN_AGENT_CONVERSATION_SYSTEM_PROMPT } from '../../../../src/lib/designAgentConversationIntelligence.js';

// A neutral turn: it must not match any media intent, so the request always reaches
// the conversational path where project context is applied.
const NEUTRAL_MESSAGE = 'Which direction should the opening beat take?';

function makeRequest(payload) {
  return { json: async () => payload };
}

function makeProvider(onRequest) {
  return {
    async execute(request) {
      onRequest?.(request);
      return { outputs: ['Start with the customer hesitation, then resolve it.'] };
    },
    async *streamText(request) {
      onRequest?.(request);
      yield 'Start with the hesitation, ';
      yield 'then resolve it.';
    },
  };
}

function makeDeps({ onModelRequest, resolveProjectContext, ...overrides } = {}) {
  return {
    controlledExecution: true,
    identity: { creatorId: 'creator-123', accountId: 'acc-123' },
    ownershipService: {
      async verifyOwnedSession({ designSessionId }) {
        return designSessionId === 'owned-session' ? { ok: true } : { ok: false, error: 'wrong_owner' };
      },
    },
    conversationReader: {
      async read({ conversationId }) {
        return { conversationId, messages: [], attachments: [] };
      },
    },
    createTextProvider: () => makeProvider(onModelRequest),
    createConversationIntelligence: (textProvider, visionTextIntelligence) => (
      createControlledConversationIntelligence(textProvider, visionTextIntelligence)
    ),
    ...(resolveProjectContext ? { resolveProjectContext } : {}),
    ...overrides,
  };
}

function instructionsOf(request) {
  return request?.context?.modelRequest?.instructions || '';
}

test('the server-derived project context reaches the model as part of the single system instruction', async () => {
  const seen = [];
  const resolveCalls = [];
  const projectText = 'MavenSync project context for this conversation.\nActive project: Autumn Launch\nBrand: Quiet luxury';

  const result = await handleDesignAgentConversationPost(
    makeRequest({ conversationId: 'owned-session', message: NEUTRAL_MESSAGE }),
    makeDeps({
      onModelRequest: (request) => seen.push(request),
      resolveProjectContext: async (args) => {
        resolveCalls.push(args);
        return { projectId: 'campaign-1', projectName: 'Autumn Launch', text: projectText };
      },
    }),
  );

  assert.equal(result.status, 200);
  assert.equal(result.reply, 'Start with the customer hesitation, then resolve it.');
  assert.equal(seen.length, 1);
  const instructions = instructionsOf(seen[0]);
  assert.match(instructions, /Quiet luxury/);
  assert.ok(instructions.startsWith(DESIGN_AGENT_CONVERSATION_SYSTEM_PROMPT), 'the base rules stay intact and come first');
  assert.doesNotMatch(JSON.stringify(seen[0].context.modelRequest.conversation), /Quiet luxury/, 'project context belongs in the instructions, not in the transcript');
  // The resolver is handed the authenticated identity and the conversation only.
  assert.deepEqual(resolveCalls, [{ identity: { creatorId: 'creator-123', accountId: 'acc-123' }, designSessionId: 'owned-session' }]);
});

test('a chat with no associated project sends exactly the unchanged instructions', async () => {
  const seen = [];
  const result = await handleDesignAgentConversationPost(
    makeRequest({ conversationId: 'owned-session', message: NEUTRAL_MESSAGE }),
    makeDeps({
      onModelRequest: (request) => seen.push(request),
      resolveProjectContext: async () => ({ projectId: null, text: '', missing: false, unavailable: false }),
    }),
  );

  assert.equal(result.status, 200);
  assert.equal(instructionsOf(seen[0]), DESIGN_AGENT_CONVERSATION_SYSTEM_PROMPT);
});

test('a project store failure degrades to a normal chat instead of failing the turn', async () => {
  const seen = [];
  const result = await handleDesignAgentConversationPost(
    makeRequest({ conversationId: 'owned-session', message: NEUTRAL_MESSAGE }),
    makeDeps({
      onModelRequest: (request) => seen.push(request),
      resolveProjectContext: async () => {
        throw Object.assign(new Error('creator_projects_schema_missing'), { code: 'creator_projects_schema_missing' });
      },
    }),
  );

  assert.equal(result.status, 200);
  assert.equal(instructionsOf(seen[0]), DESIGN_AGENT_CONVERSATION_SYSTEM_PROMPT);
});

test('an unavailable project resolver leaves the conversation working', async () => {
  const seen = [];
  const result = await handleDesignAgentConversationPost(
    makeRequest({ conversationId: 'owned-session', message: NEUTRAL_MESSAGE }),
    makeDeps({
      onModelRequest: (request) => seen.push(request),
      resolveProjectContext: null,
    }),
  );

  assert.equal(result.status, 200);
  assert.equal(instructionsOf(seen[0]), DESIGN_AGENT_CONVERSATION_SYSTEM_PROMPT);
});

test('the streaming path carries the same project context', async () => {
  const seen = [];
  const response = await handleDesignAgentConversationPost(
    makeRequest({ conversationId: 'owned-session', message: NEUTRAL_MESSAGE }),
    makeDeps({
      onModelRequest: (request) => seen.push(request),
      wantsStream: true,
      resolveProjectContext: async () => ({ projectId: 'campaign-1', text: 'Active project: Autumn Launch\nVoice: Warm', missing: false }),
    }),
  );

  assert.equal(response.status, 200);
  const body = await response.text();
  assert.match(body, /event: |data: /);
  assert.match(body, /"type":"done"/);
  assert.match(instructionsOf(seen[0]), /Voice: Warm/);
});

test('a browser cannot smuggle project content into the conversation payload', async () => {
  for (const field of ['project', 'projectId', 'projectContext', 'projectInstructions', 'instructions', 'campaign']) {
    const result = await handleDesignAgentConversationPost(
      makeRequest({ conversationId: 'owned-session', message: NEUTRAL_MESSAGE, [field]: { brand: 'Injected brand' } }),
      makeDeps({ resolveProjectContext: async () => ({ text: 'Active project: Autumn Launch' }) }),
    );
    assert.equal(result.status, 400, `field ${field} must be refused`);
    assert.equal(result.error, 'untrusted_field_not_allowed');
    assert.equal(result.field, field);
  }
});

test('the resolver is only consulted after the session is verified as owned', async () => {
  let calls = 0;
  const result = await handleDesignAgentConversationPost(
    makeRequest({ conversationId: 'someone-elses-session', message: NEUTRAL_MESSAGE }),
    makeDeps({
      resolveProjectContext: async () => {
        calls += 1;
        return { text: 'Active project: Autumn Launch' };
      },
    }),
  );

  assert.equal(result.status, 403);
  assert.equal(calls, 0, 'a session that is not the caller\'s must never be read for its project');
});
