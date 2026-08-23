import { SkillResolver } from '../../packages/studio/src/lib/skills/SkillResolver.js';
import { SkillAwarePlanCompiler } from '../../packages/studio/src/lib/intelligence/SkillAwarePlanCompiler.js';
import { CapabilityRouter } from '../../packages/studio/src/lib/intelligence/CapabilityRouter.js';
import { resolveConcreteProviderRouting } from './agentExecutionModelResolution.js';
import { validateCompiledPlan } from './structuredStateValidation.js';
import { resolveRequestedSkills, planningRequest } from './agentExecutionPlanning.js';

/**
 * Stateless creative preparation for service-authenticated callers.
 *
 * This is PREPARE/PLANNING ONLY. It NEVER:
 * - creates a durable creative_jobs row
 * - consumes or mints an execution authorizationProof
 * - approves a plan
 * - authorizes cost/funding
 * - executes provider generation
 * - publishes
 *
 * It reuses the existing planning components (SkillResolver, SkillAwarePlanCompiler,
 * CapabilityRouter, resolveConcreteProviderRouting) to produce a readiness/proposal
 * object without touching the authorization/job lifecycle. Service authentication
 * proves only that Maven Harness is an authorized internal caller acting for the
 * normalized user — never that the user consented to anything.
 */
export class StatelessCreativePreparationService {
  constructor({
    skillResolver = new SkillResolver(),
    compiler = null,
    capabilityRouter = new CapabilityRouter(),
  } = {}) {
    this.skillResolver = skillResolver;
    this.compiler = compiler || new SkillAwarePlanCompiler({ skillResolver });
    this.capabilityRouter = capabilityRouter;
  }

  prepare({ request } = {}) {
    const skills = resolveRequestedSkills(request, this.skillResolver);
    const compiledRequest = planningRequest(request, skills.canonicalSkillIds, skills.unresolved);
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
        agent: { id: request.agentId, agentId: request.agentId },
      });
    } catch (error) {
      return statelessFailure({ error });
    }
    try {
      validateCompiledPlan(plan);
    } catch {
      return statelessFailure({ error: { code: 'structured_state_invalid', message: 'Compiled planning state failed validation.' } });
    }
    if (plan.state === 'non_executable' || plan.valid === false) {
      return {
        ok: true,
        status: 'non_executable',
        planState: plan.state,
        review: { warnings: plan.warnings || [], assumptions: plan.assumptions || [], errors: plan.errors || [] },
        executionStarted: false,
        authorized: false,
        durableJobCreated: false,
      };
    }

    const routedPlan = {
      ...plan,
      routing: resolveConcreteProviderRouting({
        routing: plan.routing,
        requiredCapabilities: plan.capabilityRequirements || [],
        capabilityRouter: this.capabilityRouter,
      }),
    };

    return {
      ok: true,
      status: plan.state,
      planState: plan.state,
      planId: plan.planId || null,
      requiredInputs: plan.unresolvedRequiredInputs || [],
      approvalRequirements: plan.approvalRequirements || [],
      review: {
        recipe: plan.recipe ? { id: plan.recipe.id || null, version: plan.recipe.version || null } : null,
        requiredInputs: plan.requiredInputs || [],
        warnings: plan.warnings || [],
        assumptions: plan.assumptions || [],
      },
      capabilityRequirements: plan.capabilityRequirements || [],
      proposedRouting: routedPlan.routing ? {
        providerId: routedPlan.routing.providerId || null,
        model: routedPlan.routing.model || routedPlan.routing.modelId || null,
        operation: routedPlan.routing.operation || null,
      } : null,
      executionStarted: false,
      authorized: false,
      durableJobCreated: false,
    };
  }
}

function statelessFailure({ error }) {
  return {
    ok: true,
    status: 'non_executable',
    planState: 'non_executable',
    review: {
      errors: [{ code: error?.code || 'planning_failed', message: error?.message || 'Planning failed.' }],
    },
    executionStarted: false,
    authorized: false,
    durableJobCreated: false,
  };
}
