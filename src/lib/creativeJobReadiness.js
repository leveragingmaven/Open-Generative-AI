const EXECUTION_READINESS_ERRORS = Object.freeze({
  MISSING_PLAN: 'compiled_plan_required',
  NON_EXECUTABLE: 'compiled_plan_not_executable',
  REQUIRES_INPUT: 'creative_plan_requires_input',
  REQUIRES_APPROVAL: 'creative_plan_requires_approval',
  UNKNOWN_STATE: 'creative_plan_not_execution_ready',
});

export function getExecutionReadinessErrorCode(plan) {
  if (!plan || typeof plan !== 'object' || !plan.planId) return EXECUTION_READINESS_ERRORS.MISSING_PLAN;
  if (plan.valid === false || plan.state === 'non_executable') return EXECUTION_READINESS_ERRORS.NON_EXECUTABLE;
  if (plan.state === 'requires_input') return EXECUTION_READINESS_ERRORS.REQUIRES_INPUT;
  if (plan.state === 'requires_approval') return EXECUTION_READINESS_ERRORS.REQUIRES_APPROVAL;
  if (plan.state !== 'executable') return EXECUTION_READINESS_ERRORS.UNKNOWN_STATE;
  return null;
}

export { EXECUTION_READINESS_ERRORS };
