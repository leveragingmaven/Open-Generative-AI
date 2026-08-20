import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DesignAgentConversationIntelligenceService,
  DESIGN_AGENT_CONVERSATION_SYSTEM_PROMPT,
} from '../../../../src/lib/designAgentConversationIntelligence.js';

function makeService(reply) {
  return new DesignAgentConversationIntelligenceService({
    structuredTextIntelligence: {
      async complete({ messages }) {
        return reply;
      },
    },
  });
}

test('uses text-only structured intelligence and returns reply', async () => {
  const service = makeService('Have you considered a darker palette?');
  const result = await service.respond({
    sessionReadResult: { messages: [], attachments: [] },
    newMessage: 'I want a poster',
  });
  assert.equal(result.reply, 'Have you considered a darker palette?');
});

test('includes compact reference metadata but not URLs in the prompt', async () => {
  let capturedMessages;
  const service = new DesignAgentConversationIntelligenceService({
    structuredTextIntelligence: {
      async complete({ messages }) {
        capturedMessages = messages;
        return 'ok';
      },
    },
  });

  await service.respond({
    sessionReadResult: {
      messages: [],
      attachments: [
        {
          attachmentId: 'asset-1',
          kind: 'image',
          filename: 'ref.png',
          url: 'https://signed.example.com/secret.png',
        },
      ],
    },
    newMessage: 'use this',
  });

  const userMessage = capturedMessages.find((m) => m.role === 'user');
  assert.ok(userMessage);
  assert.ok(userMessage.content.includes('asset-1'));
  assert.ok(userMessage.content.includes('ref.png'));
  assert.ok(!userMessage.content.includes('signed.example.com'));
  assert.ok(!userMessage.content.includes('secret.png'));
});

test('bounds conversation history', async () => {
  let capturedMessages;
  const service = new DesignAgentConversationIntelligenceService({
    structuredTextIntelligence: {
      async complete({ messages }) {
        capturedMessages = messages;
        return 'ok';
      },
    },
  });

  const longHistory = [];
  for (let i = 0; i < 40; i++) {
    longHistory.push({ role: 'user', content: `msg ${i}` });
    longHistory.push({ role: 'assistant', content: `reply ${i}` });
  }

  await service.respond({
    sessionReadResult: { messages: longHistory, attachments: [] },
    newMessage: 'hello',
  });

  const nonSystem = capturedMessages.filter((m) => m.role !== 'system');
  assert.ok(nonSystem.length <= 25, 'recent history plus current user message is bounded');
});

test('sanitizes replies that falsely claim media creation', async () => {
  const forbiddenReplies = [
    'I have generated your image.',
    'I generated the video you asked for.',
    'I created the image.',
    'Image has been edited successfully.',
    'Executing tool edit_image now.',
  ];

  for (const reply of forbiddenReplies) {
    const service = makeService(reply);
    const result = await service.respond({
      sessionReadResult: { messages: [], attachments: [] },
      newMessage: 'do it',
    });
    assert.ok(!result.reply.includes(reply));
    assert.ok(result.reply.includes('Start Creative Work'));
  }
});

test('system prompt forbids tools, execution, and media claims', () => {
  const prompt = DESIGN_AGENT_CONVERSATION_SYSTEM_PROMPT.toLowerCase();
  assert.ok(prompt.includes('never'));
  assert.ok(prompt.includes('generate'));
  assert.ok(prompt.includes('tools'));
  assert.ok(prompt.includes('created'));
});
