// The Design Agent controlled-execution gate is the feature flag that decides
// whether controlled conversation (and therefore any creative work started from
// the Maven dashboard handoff) runs at all. It is server-owned: the browser is
// only ever told the current mode through /api/design-agent/config.
//
// These tests pin the gate itself and prove the browser cannot open it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { isDesignAgentControlledExecution } from './designAgentControlledMode.js';
import { handleDesignAgentConversationPost } from './designAgentConversationEndpoint.js';

const ENV_KEY = 'DESIGN_AGENT_CONTROLLED_EXECUTION';

async function withEnv(value, run) {
  const previous = process.env[ENV_KEY];
  if (value === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = value;
  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = previous;
  }
}

/** Deps whose construction/use proves the gate was honored before any work. */
function probeDeps(calls) {
  const record = (name) => async () => { calls.push(name); throw new Error(`${name} must not run while the gate is closed`); };
  return {
    identity: { accountId: 'account-1', identityKey: 'creator-1' },
    ownershipService: { verifyOwnedSession: record('ownership') },
    conversationReader: { read: record('reader') },
    createTextProvider: () => { calls.push('textProvider'); throw new Error('textProvide must not run'); },
    createConversationIntelligence: () => { calls.push('intelligence'); throw new Error('intelligence must not run'); },
  };
}

test('the gate is enabled only by the exact server value "true"', () => {
  for (const [value, expected] of [
    ['true', true],
    ['TRUE', false],
    ['True', false],
    ['1', false],
    ['yes', false],
    ['false', false],
    ['', false],
    [undefined, false],
  ]) {
    const previous = process.env[ENV_KEY];
    if (value === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = value;
    try {
      assert.equal(isDesignAgentControlledExecution(), expected, `env value ${JSON.stringify(value)}`);
    } finally {
      if (previous === undefined) delete process.env[ENV_KEY];
      else process.env[ENV_KEY] = previous;
    }
  }
});

test('the gate is read on every call and is never cached', async () => {
  assert.equal(await withEnv(undefined, () => isDesignAgentControlledExecution()), false);
  assert.equal(await withEnv('true', () => isDesignAgentControlledExecution()), true);
  assert.equal(await withEnv(undefined, () => isDesignAgentControlledExecution()), false);
});

test('a closed gate refuses the turn before any service is constructed', async () => {
  await withEnv(undefined, async () => {
    const calls = [];
    const result = await handleDesignAgentConversationPost(
      { async json() { return { conversationId: 'session-1', message: 'Create a hero image.' }; } },
      probeDeps(calls),
    );
    assert.deepEqual(result, { error: 'controlled_execution_disabled', status: 404 });
    assert.deepEqual(calls, [], 'no collaboration may run while the gate is closed');
  });
});

test('a browser payload cannot open the gate', async () => {
  await withEnv(undefined, async () => {
    const calls = [];
    const result = await handleDesignAgentConversationPost(
      {
        async json() {
          return {
            conversationId: 'session-1',
            message: 'Create a hero image.',
            controlledExecution: true,
            executionSettings: { enabled: true },
            provider: 'muapi',
          };
        },
      },
      probeDeps(calls),
    );
    assert.deepEqual(result, { error: 'controlled_execution_disabled', status: 404 });
    assert.deepEqual(calls, []);
  });
});

test('an enabled gate runs the controlled turn normally', async () => {
  await withEnv('true', async () => {
    const calls = [];
    const result = await handleDesignAgentConversationPost(
      { async json() { return { conversationId: 'session-1', message: 'What should I create first?' }; } },
      {
        identity: { accountId: 'account-1', identityKey: 'creator-1' },
        ownershipService: { async verifyOwnedSession() { calls.push('ownership'); return { ok: true }; } },
        conversationReader: { async read({ conversationId }) { calls.push('reader'); return { conversationId, messages: [], attachments: [] }; } },
        createTextProvider: () => ({
          execute: async () => { calls.push('textProvider'); return { outputs: ['Start with the hero image.'] }; },
          streamText: async function* () { calls.push('textProvider'); yield 'Start with the hero image.'; },
        }),
        createConversationIntelligence: (provider) => ({
          async respond() { return { reply: (await provider.execute({})).outputs[0] }; },
        }),
      },
    );
    assert.equal(result.status, 200);
    assert.equal(result.reply, 'Start with the hero image.');
    assert.deepEqual(calls, ['ownership', 'reader', 'textProvider']);
  });
});

test('the gate stays server-owned: only the mode module reads the variable and the config route delegates to it', async () => {
  const [mode, endpoint, config] = await Promise.all([
    readFile(new URL('./designAgentControlledMode.js', import.meta.url), 'utf8'),
    readFile(new URL('./designAgentConversationEndpoint.js', import.meta.url), 'utf8'),
    readFile(new URL('../../app/api/design-agent/config/route.js', import.meta.url), 'utf8'),
  ]);
  assert.match(mode, /process\.env\[CONTROLLED_EXECUTION_ENV\]/);
  assert.match(mode, /=== 'true'/);
  assert.equal(endpoint.includes('DESIGN_AGENT_CONTROLLED_EXECUTION'), false, 'the endpoint must not read the flag itself');
  assert.equal(/process\.env\s*[.\[]/.test(endpoint), false, 'the endpoint must not read the environment directly');
  assert.match(config, /isDesignAgentControlledExecution\(\)/);
});
