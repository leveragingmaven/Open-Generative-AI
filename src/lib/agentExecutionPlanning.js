import { SkillResolver } from '../../packages/studio/src/lib/skills/SkillResolver.js';
import { SkillAwarePlanCompiler } from '../../packages/studio/src/lib/intelligence/SkillAwarePlanCompiler.js';
import { validateCompiledPlan } from './structuredStateValidation.js';

function asArray(value) {
  return Array.isArray(value) ? value : value == null ? [] : [value];
}

function identity(request) {
  return request?.authenticatedIdentity || {};
}

function unresolvedSkill(reference) {
  return { kind: 'skill', status: 'unresolved', advisory: true, reference, message: 'canonical_skill_not_found' };
}

function resolveRequestedSkills(request, skillResolver) {
  const requested = asArray(request.requestedSkillIds || request.skillIds).map((value) => String(value).trim()).filter(Boolean);
  const canonicalSkillIds = [];
  const unresolved = [];
  for (const reference of requested) {
    try {
      const skill = skillResolver.getSkill(reference);
      if (!skill?.skillId) unresolved.push(unresolvedSkill(reference));
      else canonicalSkillIds.push(skill.skillId);
    } catch {
      unresolved.push(unresolvedSkill(reference));
    }
  }
  return { requested, canonicalSkillIds: [...new Set(canonicalSkillIds)], unresolved };
}

function planningRequest(request, canonicalSkillIds, unresolved) {
  const authenticatedIdentity = identity(request);
  return {
    ...request,
    accountId: authenticatedIdentity.accountId,
    userId: authenticatedIdentity.creatorId || authenticatedIdentity.userId || authenticatedIdentity.identityKey,
    intent: request.userIntent,
    recipeId: request.requestedRecipeId || request.recipeId || null,
    workflowId: request.requestedWorkflowId || request.workflowId || null,
    skillIds: canonicalSkillIds,
    metadata: {
      ...(request.metadata || {}),
      agentExecution: {
        accountId: authenticatedIdentity.accountId || null,
        creatorIdentityKey: authenticatedIdentity.identityKey || authenticatedIdentity.creatorId || authenticatedIdentity.userId || null,
        agentId: request.agentId,
        conversationId: request.conversationId,
        requestedSkillIds: asArray(request.requestedSkillIds),
        unresolvedSkillReferences: unresolved,
        requestedRecipeId: request.requestedRecipeId || null,
        requestedWorkflowId: request.requestedWorkflowId || null,
        campaignId: request.campaignId || null,
        twinContext: request.twinContext || null,
      },
    },
  };
}

export class AgentExecutionPlanningService {
  constructor({ jobRepository, skillResolver = new SkillResolver(), compiler = null } = {}) {
    if (!jobRepository) throw new Error('creative_job_repository_required');
    this.jobRepository = jobRepository;
    this.skillResolver = skillResolver;
    this.compiler = compiler || new SkillAwarePlanCompiler({ skillResolver });
  }

  async planAcceptedJob({ jobId, accountId, request, agent = null, workflow = null } = {}) {
    const job = await this.jobRepository.getJob(jobId, { accountId });
    if (!job) throw new Error('creative_job_not_found');
    const sourceRequest = request || job.executionContext?.executionMetadata?.agentExecutionRequest;
    if (!sourceRequest) throw new Error('agent_execution_request_not_available');
    const skills = resolveRequestedSkills(sourceRequest, this.skillResolver);
    const compiledRequest = planningRequest(sourceRequest, skills.canonicalSkillIds, skills.unresolved);
    const noCanonicalRequestedSkills = skills.requested.length > 0 && skills.canonicalSkillIds.length === 0;
    const compiler = noCanonicalRequestedSkills && this.compiler instanceof SkillAwarePlanCompiler
      ? new SkillAwarePlanCompiler({
        skillResolver: { getSkill: this.skillResolver.getSkill.bind(this.skillResolver), resolve: () => ({ matches: [] }) },
        skillReferenceResolver: this.compiler.skillReferenceResolver,
        intelligenceEngine: this.compiler.intelligenceEngine,
        recipeResolver: this.compiler.recipeResolver,
        workflows: this.compiler.workflows,
        now: this.compiler.now,
      })
      : this.compiler;
    let plan;
    try {
      plan = compiler.compile({
        request: compiledRequest,
        explicitSkillIds: skills.canonicalSkillIds,
        requireSkills: !noCanonicalRequestedSkills,
        agent: agent || { id: sourceRequest.agentId, agentId: sourceRequest.agentId },
        workflow,
        workflowId: sourceRequest.requestedWorkflowId || sourceRequest.workflowId,
        campaignContext: sourceRequest.campaignId || sourceRequest.twinContext ? {
          campaignId: sourceRequest.campaignId || null,
          twinContext: sourceRequest.twinContext || null,
        } : null,
      });
    } catch (error) {
      const updated = await this.jobRepository.updatePlanningResult({ jobId, accountId, unresolvedAdvisories: skills.unresolved, planningError: { code: error.code || 'planning_failed', message: error.message } });
      return { planned: false, plan: null, job: updated, unresolvedSkillReferences: skills.unresolved };
    }
    try {
      validateCompiledPlan(plan);
    } catch {
      const updated = await this.jobRepository.updatePlanningResult({
        jobId,
        accountId,
        unresolvedAdvisories: skills.unresolved,
        planningError: { code: 'structured_state_invalid', message: 'Compiled planning state failed validation.' },
      });
      return { planned: false, plan: null, job: updated, unresolvedSkillReferences: skills.unresolved };
    }
    const planningError = plan.state === 'non_executable' || plan.valid === false
      ? { code: 'planning_failed', message: plan.errors?.[0]?.message || 'Compiled plan is not executable.' }
      : null;
    const updated = await this.jobRepository.updatePlanningResult({ jobId, accountId, plan, unresolvedAdvisories: skills.unresolved, planningError });
    return { planned: !planningError, plan, job: updated, unresolvedSkillReferences: skills.unresolved };
  }
}

export { planningRequest, resolveRequestedSkills };
