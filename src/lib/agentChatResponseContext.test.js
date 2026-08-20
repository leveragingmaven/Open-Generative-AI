import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getAgentChatResponseContext,
  getAgentConversationContext,
  rememberAgentChatResponse,
} from './agentChatResponseContext.js';

test('reuses server-observed request context for the matching authenticated conversation only', () => {
  rememberAgentChatResponse('request-conversation-context-test', {
    agentId: 'agent-1', conversationId: 'conversation-1', accountId: 'account-1', identityKey: 'creator-1',
    attachments: ['https://cdn.test/portrait.png'],
  });
  assert.deepEqual(getAgentChatResponseContext('request-conversation-context-test').attachments, ['https://cdn.test/portrait.png']);
  assert.deepEqual(getAgentConversationContext({
    agentId: 'AGENT-1', conversationId: 'conversation-1', identity: { accountId: 'account-1', identityKey: 'creator-1' },
  }).attachments, ['https://cdn.test/portrait.png']);
  assert.equal(getAgentConversationContext({
    agentId: 'agent-1', conversationId: 'conversation-1', identity: { accountId: 'account-2', identityKey: 'creator-2' },
  }), null);
});
