import { t2vModels, v2vModels, audioModels } from '../../models.js';
import { effectiveTransport } from '../providers/modelRoutingMetadata.js';

// Project existing executable model schemas into the capability catalog. Model
// identifiers live in the studio registry, never in task/skill selection rules.
export function studioModelDeployments({ video = t2vModels, editing = v2vModels, audio = audioModels } = {}) {
  const voice = audio.filter(model => model.inputs?.voice_id && model.inputs?.prompt);
  return [
    ...video.map(model => ({ model, operation: 'video_generation', capability: 'video_generation', modality: 'video' })),
    ...voice.map(model => ({ model, operation: 'audio_generation', capability: 'voice_generation', modality: 'audio' })),
    ...editing.filter(model => model.hasPrompt).map(model => ({ model, operation: 'video_transform', capability: 'video_editing', modality: 'video' })),
  ].map(({ model, operation, capability, modality }) => ({
    id: `studio:${effectiveTransport(model)}:${model.id}`,
    providerId: effectiveTransport(model), logicalModel: model.logicalModel || model.id,
    operation, capabilities: [capability, ...(operation === 'video_transform' ? ['video_transformation'] : []), ...(model.capabilities || [])],
    inputs: ['text'], outputs: [modality],
    featureState: model.featureState || 'enabled', availability: model.availability || 'available',
    health: model.health || 'healthy', priority: 10, confidence: 0.8,
    cost: model.cost || {}, speed: model.speed || {}, quality: model.quality || {},
    metadata: {
      modelId: model.id, endpointId: model.endpoint || model.id,
      requiredInputs: [...new Set([...(operation === 'video_transform' ? ['videoUrl', ...(model.imageField ? ['image_url'] : [])] : []), ...(model.required || []), ...Object.entries(model.inputs || {}).filter(([,v]) => v.required).map(([k]) => k)])],
      inputSchema: model.inputs || {},
    },
  }));
}
