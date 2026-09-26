import assert from 'node:assert/strict';
import test from 'node:test';
import { StatelessCreativePreparationService } from './statelessCreativePreparation.js';

const service = new StatelessCreativePreparationService();
const identity = { accountId: 'account-1', identityKey: 'creator-1', creatorId: 'creator-1' };

const IMAGE_OBJECTIVE = "Create an Instagram graphic promoting MavenSync Spaces with the headline 'Your GPTs Need a New Home'. Generate the actual image for me.";

function request(operation, extra = {}) {
  return {
    version: 1,
    operation,
    userIntent: IMAGE_OBJECTIVE,
    inputs: { creativeBrief: IMAGE_OBJECTIVE },
    references: [],
    attachments: [],
    requestedSkillIds: [],
    authenticatedIdentity: { ...identity, source: 'server' },
    ...extra,
  };
}

function prepare(operation, extra) {
  return service.prepare({ request: request(operation, extra) });
}

test('an unresolved operation reports an honest unresolved state, not an arbitrary deployment', async () => {
  for (const unmappable of ['ai_clipping', 'creative_generation', 'social_media', 'creative', '   ']) {
    const result = prepare(unmappable);

    // The preparation is truthfully unresolved.
    assert.equal(result.planState, 'requires_input', unmappable);
    assert.equal(result.executable, undefined);
    assert.equal(result.review.recipe, null, unmappable);
    assert.deepEqual(result.requiredInputs, [], unmappable);

    // The regression: an empty capability requirement set used to be ranked,
    // and the top-scoring deployment (muapi-ai-clipping) was reported as though
    // it were the resolved creative operation.
    assert.equal(result.proposedRouting, null, unmappable);
    assert.deepEqual(result.capabilityRequirements, [], unmappable);

    // ...and the reason is now stated structurally rather than inferred.
    const codes = result.review.errors.map((item) => item.code);
    assert.ok(codes.includes('creative_operation_unresolved'), `${unmappable}: ${JSON.stringify(codes)}`);
  }
});

test('a resolved recipe keeps its real routing untouched', async () => {
  const result = prepare('image_generation');

  assert.equal(result.planState, 'executable');
  assert.equal(result.executable, undefined);
  assert.equal(result.review.recipe.id, 'image');
  assert.equal(result.proposedRouting.providerId, 'muapi');
  assert.equal(result.proposedRouting.operation, 'image_generation');
  // A genuinely resolved plan reports no unresolved-recipe code.
  const codes = (result.review.errors || []).map((item) => item.code);
  assert.equal(codes.includes('creative_operation_unresolved'), false);
});

test('image_editing still resolves to its own canonical recipe and routing', async () => {
  const result = service.prepare({
    request: {
      version: 1,
      operation: 'image_editing',
      userIntent: 'Remove the background from this photo.',
      inputs: { creativeBrief: 'Remove the background from this photo.' },
      references: [], attachments: [], requestedSkillIds: [],
      authenticatedIdentity: { ...identity, source: 'server' },
    },
  });

  assert.equal(result.planState, 'executable');
  assert.equal(result.review.recipe.id, 'image-edit');
  assert.equal(result.proposedRouting.operation, 'image_editing');
});

test('an explicit recipe still wins even for an otherwise unmappable operation', async () => {
  // Normal routing behaviour must not change: when the caller names a recipe the
  // plan resolves and routing is reported as before.
  const result = prepare('ai_clipping', { requestedRecipeId: 'image' });

  assert.equal(result.planState, 'executable');
  assert.equal(result.review.recipe.id, 'image');
  assert.equal(result.proposedRouting.operation, 'image_generation');
});
