export class StructuredStateValidationError extends Error {
  constructor(code, message = 'Structured application state is invalid.') {
    super(message);
    this.code = code;
  }
}

function invalid(message) {
  throw new StructuredStateValidationError('structured_state_invalid', message);
}

export function validateCompiledPlan(plan) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) invalid('Compiled plan must be an object.');
  if (typeof plan.planId !== 'string' || !plan.planId.trim()) invalid('Compiled plan identity is required.');
  if (!plan.request || typeof plan.request !== 'object' || Array.isArray(plan.request)) invalid('Compiled plan request is required.');
  const incompletePlan = plan.valid === false || plan.state === 'non_executable' || plan.state === 'requires_input';
  if (!incompletePlan && (!plan.recipe || typeof plan.recipe !== 'object' || typeof plan.recipe.id !== 'string' || !plan.recipe.id.trim())) invalid('Compiled plan recipe is invalid.');
  if (!Array.isArray(plan.capabilityRequirements)) invalid('Compiled plan capabilities are invalid.');
  if (!Array.isArray(plan.selectedSkills) || !Array.isArray(plan.warnings) || !Array.isArray(plan.errors)) invalid('Compiled plan collections are invalid.');
  if (typeof plan.valid !== 'boolean' || typeof plan.state !== 'string') invalid('Compiled plan validity state is invalid.');
  for (const requirement of plan.capabilityRequirements) {
    if (!requirement || typeof requirement !== 'object' || typeof requirement.id !== 'string' || !requirement.id.trim()) invalid('Compiled plan capability requirement is invalid.');
  }
  return plan;
}
