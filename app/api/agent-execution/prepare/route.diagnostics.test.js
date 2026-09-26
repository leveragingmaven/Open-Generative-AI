// TEMPORARY DIAGNOSTIC COVERAGE.
//
// The CREATIVE_PREPARE_RESULT marker is the only thing standing between us and
// a blind spot: the live customer failure produces no server-side evidence
// after service auth succeeds. These tests pin the marker's contract so it can
// be deleted with confidence once the failure is identified:
//
//   1. it is emitted exactly once per service-auth preparation,
//   2. it changes nothing about the response the route returns,
//   3. it never carries customer content (prompt, userIntent, inputs, email).
//
// The marker is structural by construction: every value is a code or a scalar
// passed through safeToken()/safeCodes(), which admit only [A-Za-z0-9_.:-]{1,64}.

import assert from 'node:assert/strict';
import test from 'node:test';
import { handleAgentExecutionPreparationPost } from './route.js';

const MARKER = 'CREATIVE_PREPARE_RESULT';
const identity = { accountId: 'account-1', identityKey: 'creator-1', creatorId: 'creator-1' };

const CUSTOMER_INTENT = 'A portrait of my dog wearing a sombrero, birthday card';
const CREATIVE_BRIEF = 'Dog in a sombrero';
const CUSTOMER_EMAIL = 'martha.newell@example.test';

function request(body, headers = {}) {
  return {
    headers: { get: (name) => headers[String(name).toLowerCase()] ?? null },
    async json() { return body; },
  };
}

function serviceAuthPayload(overrides = {}) {
  return {
    agentId: 'remote-template-1',
    conversationId: 'conversation-42',
    userIntent: CUSTOMER_INTENT,
    operation: 'image_generation',
    inputs: { creativeBrief: CREATIVE_BRIEF, prompt: CREATIVE_BRIEF },
    references: [],
    attachments: [],
    requestedSkillIds: [],
    requestedRecipeId: 'image',
    metadata: { email: CUSTOMER_EMAIL },
    ...overrides,
  };
}

function executableResult() {
  return {
    ok: true,
    status: 'prepared',
    planState: 'executable',
    planId: 'plan-1',
    requiredInputs: [],
    approvalRequirements: [],
    review: { recipe: { id: 'image' }, requiredInputs: [], warnings: [], assumptions: [], errors: [] },
    capabilityRequirements: ['image_generation'],
    proposedRouting: { providerId: 'muapi', model: 'image-model', operation: 'image_generation' },
    durableJobCreated: false,
  };
}

async function capturePrepare(handlerOptions, { headers = {} } = {}) {
  const lines = [];
  const original = console.info;
  console.info = (...args) => { lines.push(args.map(String).join(' ')); };
  try {
    const response = await handleAgentExecutionPreparationPost(request(serviceAuthPayload(), headers), {
      identity,
      serviceAuth: true,
      ...handlerOptions,
    });
    return { response, lines, body: await response.json() };
  } finally {
    console.info = original;
  }
}

function markerLine(lines) {
  const matched = lines.filter((line) => line.startsWith(`${MARKER} `));
  assert.equal(matched.length, 1, `expected exactly one ${MARKER} line, saw ${matched.length}`);
  const { event, ...marker } = JSON.parse(matched[0].slice(MARKER.length + 1));
  assert.equal(event, 'creative_prepare_result');
  return marker;
}

function assertNoCustomerContent(text) {
  for (const secret of [CUSTOMER_INTENT, CREATIVE_BRIEF, CUSTOMER_EMAIL, 'prompt', 'userIntent', 'creativeBrief', 'inputs', 'email', 'Authorization', 'apiKey']) {
    assert.equal(text.includes(secret), false, `diagnostic line leaked ${secret}`);
  }
}

test('CREATIVE_PREPARE_RESULT reports the executable decision without changing the response', async () => {
  const result = executableResult();
  const { response, lines, body } = await capturePrepare({
    statelessPreparationService: { prepare: () => result },
  }, { headers: { 'x-mavensync-request-id': 'req-abc-123' } });

  // Behavior is unchanged: the route returns exactly what preparation returned.
  assert.equal(response.status, 200);
  assert.deepEqual(body, result);

  const marker = markerLine(lines);
  // The four questions the live incident needs answered.
  assert.equal(marker.requestId, 'req-abc-123');
  assert.equal(marker.operation, 'image_generation');
  assert.equal(marker.recipeId, 'image');
  assert.equal(marker.planState, 'executable');
  assert.equal(marker.executable, true);
  // ...plus the routing that follows from it.
  assert.equal(marker.providerId, 'muapi');
  assert.equal(marker.outcome, 'ok');
  assert.equal(marker.status, 'prepared');
  assert.deepEqual(marker.capabilities, ['image_generation']);
  assert.deepEqual(marker.errorCodes, []);
  assert.equal(marker.durableJobCreated, false);

  assertNoCustomerContent(lines.join('\n'));
});

test('CREATIVE_PREPARE_RESULT surfaces the exact reason a plan is not executable', async () => {
  const result = {
    ...executableResult(),
    status: 'requires_input',
    planState: 'non_executable',
    requiredInputs: ['image.aspect_ratio', 'image.style'],
    review: {
      recipe: { id: 'image' },
      requiredInputs: [{ id: 'image.aspect_ratio' }, { id: 'image.style' }],
      warnings: ['recipe.fallback_applied'],
      assumptions: [],
      errors: [{ id: 'capability.missing', code: 'capability_missing' }, { id: 'capability.missing' }],
    },
    proposedRouting: { providerId: 'muapi', model: 'image-model', operation: 'image_generation' },
  };
  const { response, lines, body } = await capturePrepare({
    statelessPreparationService: { prepare: () => result },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(body, result);

  const marker = markerLine(lines);
  assert.equal(marker.outcome, 'ok');
  assert.equal(marker.planState, 'non_executable');
  assert.equal(marker.executable, false);
  assert.equal(marker.status, 'requires_input');
  assert.deepEqual(marker.requiredInputs, ['image.aspect_ratio', 'image.style']);
  assert.deepEqual(marker.errorCodes, ['capability_missing'], 'error codes are deduped by code');
  assert.deepEqual(marker.warningCodes, ['recipe.fallback_applied']);
  assert.equal(marker.recipeId, 'image');
  assert.equal(marker.requestId, null, 'a missing request id header degrades to null rather than throwing');

  assertNoCustomerContent(lines.join('\n'));
});

test('CREATIVE_PREPARE_RESULT reports a thrown preparation failure without changing the error response', async () => {
  const failure = Object.assign(new Error('recipe catalog unavailable'), { code: 'recipe_catalog_unavailable' });
  const { response, lines, body } = await capturePrepare({
    statelessPreparationService: { prepare: () => { throw failure; } },
  });

  // Behavior is unchanged: the existing 409 error mapping still applies.
  assert.equal(response.status, 409);
  assert.deepEqual(body, { error: 'recipe_catalog_unavailable', code: 'recipe_catalog_unavailable' });

  const marker = markerLine(lines);
  assert.equal(marker.outcome, 'error');
  assert.deepEqual(marker.errorCodes, ['recipe_catalog_unavailable']);
  assert.equal(marker.status, null);
  assert.equal(marker.planState, null);
  assert.equal(marker.executable, null);

  assertNoCustomerContent(lines.join('\n'));
});

test('CREATIVE_PREPARE_RESULT only emits allow-listed structural keys', async () => {
  const { lines } = await capturePrepare({
    statelessPreparationService: { prepare: () => executableResult() },
  });
  assert.deepEqual(
    Object.keys(markerLine(lines)).sort(),
    [
      'approvalRequirements',
      'capabilities',
      'durableJobCreated',
      'errorCodes',
      'executable',
      'operation',
      'outcome',
      'planState',
      'providerId',
      'recipeId',
      'requestId',
      'requiredInputs',
      'status',
      'warningCodes',
    ],
  );
});

test('a malformed marker value is dropped rather than emitted', async () => {
  // safeToken() admits only [A-Za-z0-9_.:-]{1,64}; a free-text field that
  // somehow lands in a code slot must not reach the log line verbatim.
  const { lines } = await capturePrepare({
    statelessPreparationService: {
      prepare: () => ({ ...executableResult(), proposedRouting: { providerId: 'muapi "leak"', operation: 'image_generation' } }),
    },
  });
  const marker = markerLine(lines);
  assert.equal(marker.providerId, null);
  assertNoCustomerContent(lines.join('\n'));
});
