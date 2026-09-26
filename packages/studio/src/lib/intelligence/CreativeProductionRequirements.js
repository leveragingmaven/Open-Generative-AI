import { capabilityRegistry } from './CapabilityRegistry.js';

export function productionInputs(request = {}) {
  const inputs = { ...(request.inputs || {}) };
  for (const item of [...(request.references || []), ...(request.attachments || [])]) {
    if (!item || typeof item !== 'object' || !item.url) continue;
    const kind = item.kind || item.type || '';
    const role = item.role || '';
    if (kind === 'video' || role === 'source_video') inputs.videoUrl ??= item.url;
    if (kind === 'image' || /image|character|product|style/.test(role)) inputs.image_url ??= item.url;
  }
  inputs.videoUrl ??= inputs.video_url;
  return inputs;
}

export function productionRequirements(recipe, request, skills = []) {
  const base = [...(recipe.capabilityRequirements || []), ...(request.capabilityRequirements || [])];
  const supplied = request.inputs?.productionRequirements;
  if (supplied != null) {
    if (!Array.isArray(supplied) || supplied.length > 32) throw new Error('Invalid production capability requirements');
    for (const requirement of supplied) {
      if (!requirement || typeof requirement !== 'object' || !capabilityRegistry.get(requirement.id)
        || !['required', 'preferred'].includes(requirement.kind || 'required')
        || (requirement.weight != null && (!Number.isFinite(requirement.weight) || requirement.weight < 0 || requirement.weight > 100))) {
        throw new Error('Invalid production capability requirement');
      }
      base.push(requirement);
    }
  }
  if (request.operation === 'video_generation' && productionInputs(request).image_url) base.push('reference_images');
  for (const skill of skills) {
    // Explicit production constraints are mandatory; methodology capabilities
    // are preferences, and only registered machine capabilities reach routing.
    base.push(...(skill.capabilityRequirements || []));
    base.push(...(skill.capabilities || []).map(id => id.replaceAll('-', '_').replaceAll(' ', '_')).filter(id => capabilityRegistry.get(id)).map(id => ({ id, kind: 'preferred', weight: 1 })));
  }
  if (request.operation === 'video_editing') {
    const clipping = base.some(r => (typeof r === 'string' ? r === 'highlight_extraction' : r.id === 'highlight_extraction' && r.kind !== 'preferred'))
      || /\b(clips?|highlights?|repurpose|repurposing)\b/i.test(request.intent || '');
    base.push(clipping ? 'highlight_extraction' : 'video_transformation');
  }
  return base;
}
