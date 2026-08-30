import assert from 'node:assert/strict';
import test from 'node:test';
import { createAgentChatResponseContext, enrichAgentPredictionResult, normalizeExecutionProposal } from './agentExecutionProposal.js';

const context = createAgentChatResponseContext({
  agentId: 'agent-1',
  conversationId: 'conversation-1',
  attachments: [{ url: 'https://cdn.example.test/avatar.png', id: 'upload-1' }],
});

test('ordinary conversational results do not gain an execution action', () => {
  const result = enrichAgentPredictionResult({
    messages: [{ role: 'assistant', content: 'Tell me more about the style.' }],
    suggestions: ['Describe the audience'],
  }, context);

  assert.equal(result.actions, undefined);
  assert.deepEqual(result.suggestions, ['Describe the audience']);
  assert.equal(result.execution_proposal, undefined);
});

test('valid proposal becomes exactly one safe Start Creative Work action', () => {
  const result = enrichAgentPredictionResult({
    messages: [{ role: 'assistant', content: 'I can prepare that.' }],
    suggestions: ['Use a warmer style'],
    execution_proposal: {
      version: 1,
      operation: 'image_editing',
      userIntent: 'Create a branded profile image using my avatar reference.',
      inputs: { prompt: 'Create a branded profile image.' },
      references: [{ url: 'https://cdn.example.test/avatar.png', role: 'character_reference' }],
      requestedRecipeId: 'imageEdit',
    },
  }, context);

  assert.equal(result.actions.length, 1);
  assert.deepEqual(result.actions[0], {
    type: 'agent_execution_action',
    action: 'start',
    label: 'Start Creative Work',
    payload: {
      agentId: 'agent-1',
      conversationId: 'conversation-1',
      operation: 'image_editing',
      userIntent: 'Create a branded profile image using my avatar reference.',
      inputs: { prompt: 'Create a branded profile image.' },
      references: [{ url: 'https://cdn.example.test/avatar.png', role: 'character_reference' }],
      attachments: [],
      requestedSkillIds: [],
      requestedRecipeId: 'imageEdit',
      requestedWorkflowId: null,
      campaignId: null,
    },
  });
  assert.deepEqual(result.suggestions, ['Use a warmer style']);
  assert.equal(result.messages[0].content, 'I can prepare that.');
});

test('unsafe fields are removed and model identity fields cannot override trusted context', () => {
  const proposal = normalizeExecutionProposal({
    version: 1,
    operation: 'image_generation',
    userIntent: 'Make a product image.',
    provider: 'muapi',
    model: 'nano-banana-pro',
    credentials: 'secret',
    accountId: 'attacker-account',
    inputs: { prompt: 'Product image', model: 'bad-model', api_key: 'secret', account_id: 'bad-account' },
  }, { agentId: 'trusted-agent', conversationId: 'trusted-conversation' });

  assert.deepEqual(proposal, {
    agentId: 'trusted-agent',
    conversationId: 'trusted-conversation',
    operation: 'image_generation',
    userIntent: 'Make a product image.',
    inputs: { prompt: 'Product image' },
    references: [],
    attachments: [],
    requestedSkillIds: [],
    requestedRecipeId: null,
    requestedWorkflowId: null,
    campaignId: null,
  });
});

test('unknown reference URLs fail closed while known structured uploads survive', () => {
  const valid = normalizeExecutionProposal({
    version: 1,
    operation: 'image_editing',
    userIntent: 'Edit the uploaded avatar.',
    references: [{ url: 'https://cdn.example.test/avatar.png' }],
  }, context);
  assert.deepEqual(valid.references, [{ url: 'https://cdn.example.test/avatar.png' }]);

  const unknown = normalizeExecutionProposal({
    version: 1,
    operation: 'image_editing',
    userIntent: 'Edit this image.',
    references: [{ url: 'https://not-trusted.example.test/other.png' }],
  }, context);
  assert.equal(unknown, null);
});

test('proposal enrichment does not start authorization or execution', () => {
  const result = enrichAgentPredictionResult({
    execution_proposal: { version: 1, operation: 'image_generation', userIntent: 'Make one image.' },
  }, context);
  assert.equal(result.actions[0].action, 'start');
  assert.equal(result.actions[0].payload.executionStarted, undefined);
});
