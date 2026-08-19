import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveConcreteProviderRouting, selectConcreteProviderModel } from './agentExecutionModelResolution.js';

test('logical MuAPI image routing resolves to the cheapest verified eligible concrete model', () => {
  const routing = resolveConcreteProviderRouting({ routing: { providerId: 'muapi', deploymentId: 'muapi-image-generation', operation: 'image_generation', logicalModel: 'muapi-image-catalog' }, requiredCapabilities: [{ id: 'image_generation' }] });
  assert.equal(routing.model, 'flux-kontext-dev-t2i');
  assert.equal(routing.modelMetadata.pricing.unitPrice, 0.02);
});

test('ineligible or unavailable models cannot be selected', () => {
  const selected = selectConcreteProviderModel([
    { id: 'bad', modelId: 'bad', providerId: 'muapi', operation: 'image_generation', capabilities: ['video_generation'], availability: 'available' },
    { id: 'offline', modelId: 'offline', providerId: 'muapi', operation: 'image_generation', capabilities: ['image_generation'], availability: 'unavailable' },
  ], [{ id: 'image_generation' }]);
  assert.equal(selected, null);
});

test('non-image routing remains provider-neutral when no concrete model metadata exists', () => {
  const routing = resolveConcreteProviderRouting({ routing: { providerId: 'custom', deploymentId: 'custom-text', operation: 'text_generation' }, requiredCapabilities: [{ id: 'text_generation' }], modelRegistry: { listModels: () => [] } });
  assert.deepEqual(routing, { providerId: 'custom', deploymentId: 'custom-text', operation: 'text_generation' });
});
