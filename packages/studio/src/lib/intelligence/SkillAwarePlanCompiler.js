import { createCreativePlan } from "./CreativePlan.js";
import { createCreativeRequest } from "./CreativeRequest.js";
import { CreativeIntelligenceEngine, creativeIntelligenceEngine } from "./CreativeIntelligenceEngine.js";
import { RecipeResolver } from "./RecipeResolver.js";
import { SkillResolver } from "../skills/SkillResolver.js";
import { SkillReferenceResolver } from "../skills/SkillReferenceResolver.js";

const unique = (values) => [...new Set(values.filter(Boolean))];
const asArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];

function valuePresent(value) {
  return value !== undefined && value !== null && value !== "";
}

function referenceSourceIsAgent(reference) {
  return String(reference?.provenance?.field || "").startsWith("agent.");
}

function lookupWorkflow(source, id) {
  if (!source) return null;
  if (typeof source === "function") return source(id) || null;
  if (typeof source.resolve === "function") return source.resolve(id) || null;
  if (typeof source.get === "function") return source.get(id) || null;
  if (Array.isArray(source)) return source.find((item) => item?.id === id) || null;
  return source[id] || Object.values(source).find((item) => item?.id === id) || null;
}

function normalizeExplicitSkillIds(input, request) {
  return unique([
    ...asArray(input.explicitSkillIds),
    ...asArray(input.skillIds),
    ...asArray(request.explicitSkillIds),
    ...asArray(request.skillIds),
  ].map((id) => typeof id === "string" ? id.trim() : "").filter(Boolean));
}

function selectedSkillRecord(skill, reason, score = null) {
  return {
    skillId: skill.skillId,
    name: skill.name || null,
    version: skill.version ?? null,
    category: skill.category || null,
    status: skill.status || null,
    discoverable: skill.discoverable !== false,
    reason,
    ...(score == null ? {} : { score }),
  };
}

function collectSkillMetadata(skillResults) {
  const selectedSkills = [];
  const skillSelectionReasons = [];
  const contentTypes = [];
  const campaignTemplates = [];
  const skillCapabilities = [];
  const requiredInputs = [];
  const approvalRequirements = [];
  const qaRequirements = [];
  const retryRecovery = [];
  const costQualityStrategy = [];

  for (const result of skillResults) {
    const skill = result.skill;
    selectedSkills.push(selectedSkillRecord(skill, result.reason, result.score));
    skillSelectionReasons.push({ skillId: skill.skillId, reason: result.reason });
    contentTypes.push(...(Array.isArray(skill.compatibleContentTypes) ? skill.compatibleContentTypes : []));
    campaignTemplates.push(...(Array.isArray(skill.compatibleCampaignTemplates) ? skill.compatibleCampaignTemplates : []));
    skillCapabilities.push(...(Array.isArray(skill.capabilities) ? skill.capabilities : []));
    requiredInputs.push(...(Array.isArray(skill.requiredInputs) ? skill.requiredInputs : []));
    approvalRequirements.push(...asArray(skill.approvalRequirements || skill.approvalGates || skill.approval));
    qaRequirements.push(...asArray(skill.qaRequirements || skill.qualityGates || skill.validation?.qualityGates));
    retryRecovery.push(...asArray(skill.retryRecovery || skill.retry || skill.recovery));
    costQualityStrategy.push(...asArray(skill.costQualityStrategy || skill.cost || skill.qualityStrategy));
  }

  return {
    selectedSkills,
    skillSelectionReasons,
    compatibleContentTypes: unique(contentTypes),
    compatibleCampaignTemplates: unique(campaignTemplates),
    skillCapabilities: unique(skillCapabilities),
    requiredInputs: unique(requiredInputs),
    approvalRequirements,
    qaRequirements,
    retryRecovery,
    costQualityStrategy,
  };
}

function collectReferences(skillResults, agent) {
  const recipes = [];
  const workflows = [];
  const unresolved = [];
  for (const result of skillResults) {
    const resolved = result.references;
    recipes.push(...resolved.recipes.candidates);
    workflows.push(...resolved.workflows.candidates);
    unresolved.push(
      ...resolved.recipes.unresolved.map((item) => ({ skillId: result.skill.skillId, ...item })),
      ...resolved.workflows.unresolved.map((item) => ({ skillId: result.skill.skillId, ...item })),
    );
  }
  // Agent suggestions are advisory. Preserve resolved candidates for traceability,
  // but do not turn an unavailable suggestion into a configuration failure.
  return {
    recipes: recipes.filter((item) => !referenceSourceIsAgent(item)),
    workflows: workflows.filter((item) => !referenceSourceIsAgent(item)),
    advisoryRecipes: recipes.filter(referenceSourceIsAgent),
    advisoryWorkflows: workflows.filter(referenceSourceIsAgent),
    unresolved: unresolved.filter((item) => !String(item.field || "").startsWith("agent.")),
    agent,
  };
}

function referenceVersionError(reference, resource, canonical) {
  if (reference?.recipeVersion == null && reference?.workflowVersion == null) return null;
  const requested = reference.recipeVersion ?? reference.workflowVersion;
  if (canonical?.version != null && String(requested) !== String(canonical.version)) {
    return {
      code: `${resource}_version_mismatch`,
      message: `Requested ${resource} ${reference.recipeId || reference.workflowId}@${requested}, but canonical version is ${canonical.version}.`,
    };
  }
  return null;
}

function deriveProvenance(request, agent, selectedSkills, recipe, workflow) {
  const root = {
    source: "creative-request",
    requestId: request.requestId,
    agentId: agent?.id || agent?.agentId || null,
  };
  return [
    root,
    ...selectedSkills.map((skill) => ({
      source: "skill",
      skillId: skill.skillId,
      skillVersion: skill.version,
      reason: skill.reason,
    })),
    ...(recipe ? [{ source: "recipe", recipeId: recipe.id, recipeVersion: recipe.version, via: "skill-reference-or-request" }] : []),
    ...(workflow ? [{ source: "workflow", workflowId: workflow.workflowId, workflowVersion: workflow.workflowVersion }] : []),
  ];
}

export class SkillAwarePlanCompiler {
  constructor({
    skillResolver = new SkillResolver(),
    skillReferenceResolver = new SkillReferenceResolver(),
    intelligenceEngine = creativeIntelligenceEngine,
    recipeResolver = new RecipeResolver(),
    workflows = skillReferenceResolver.workflows,
    now = () => new Date().toISOString(),
  } = {}) {
    this.skillResolver = skillResolver;
    this.skillReferenceResolver = skillReferenceResolver;
    this.intelligenceEngine = intelligenceEngine;
    this.recipeResolver = recipeResolver;
    this.workflows = workflows;
    this.now = now;
  }

  compile(input = {}) {
    const rawRequest = input.request || input.creativeRequest || input;
    const explicitRecipeId = typeof rawRequest.recipeId === "string" && rawRequest.recipeId.trim()
      ? rawRequest.recipeId.trim()
      : null;
    const defaultRecipeId = explicitRecipeId
      ? null
      : this.recipeResolver.defaultRecipeIdForOperation?.(rawRequest.operation) || null;
    const request = createCreativeRequest({
      ...rawRequest,
      recipeId: explicitRecipeId || defaultRecipeId,
      inputs: {
        ...(rawRequest.inputs || {}),
        ...(input.inputs || {}),
        ...(valuePresent(input.creativeBrief) ? { creativeBrief: input.creativeBrief } : {}),
        ...(valuePresent(input.campaignContext) ? { campaignContext: input.campaignContext } : {}),
      },
    });
    const agent = input.agent || input.agentProfile || null;
    const explicitIds = normalizeExplicitSkillIds(input, request);
    const skillResults = [];
    const errors = [];
    let dynamic = false;

    if (explicitIds.length) {
      for (const skillId of explicitIds) {
        const skill = this.skillResolver.getSkill(skillId);
        if (!skill) {
          errors.push({ code: "skill_not_found", skillId, message: `Unknown creative skill: ${skillId}` });
          continue;
        }
        if (skill.status !== "active" || skill.discoverable === false) {
          errors.push({ code: "skill_ineligible", skillId, message: `Creative skill ${skillId} is not eligible for a plan.` });
          continue;
        }
        skillResults.push({ skill, reason: "explicit skill ID requested", score: Number.MAX_SAFE_INTEGER });
      }
    } else {
      dynamic = true;
      const resolved = this.skillResolver.resolve(request, { limit: input.maxSkills || 5 });
      for (const match of resolved.matches) {
        skillResults.push({ skill: match.skill, reason: match.reasons.join("; "), score: match.score });
      }
      if (!skillResults.length && input.requireSkills !== false) {
        errors.push({ code: "no_eligible_skill", message: "No eligible Creative Skill matched the request." });
      }
    }

    const metadata = collectSkillMetadata(skillResults);
    const references = collectReferences(
      skillResults.map((result) => ({
        ...result,
        references: this.skillReferenceResolver.resolve(result.skill, { agent }),
      })),
      agent,
    );
    errors.push(...references.unresolved.map((item) => ({
      code: item.message?.includes("version") ? "reference_version_error" : `${item.kind}_reference_error`,
      skillId: item.skillId,
      field: item.field,
      message: item.message,
    })));

    let recipeReference = null;
    let recipeDefinition = null;
    if (request.recipeId) {
      try {
        const canonical = this.recipeResolver.resolve(request.recipeId);
        recipeDefinition = canonical;
        recipeReference = {
          recipeId: canonical.id || request.recipeId,
          recipeVersion: input.recipeVersion ?? canonical.version ?? null,
          status: "resolved",
          inputRequirements: {
            required: Object.entries(canonical.inputs || {}).filter(([, definition]) => definition?.required).map(([name]) => name),
            optional: Object.entries(canonical.inputs || {}).filter(([, definition]) => !definition?.required).map(([name]) => name),
            inferred: [],
          },
          provenance: { source: "creative-request", requestId: request.requestId },
        };
        if (input.recipeVersion != null && canonical.version != null && String(input.recipeVersion) !== String(canonical.version)) {
          errors.push({ code: "recipe_version_mismatch", message: `Requested recipe ${request.recipeId}@${input.recipeVersion}, but canonical version is ${canonical.version}.` });
        }
      } catch (error) {
        errors.push({ code: "recipe_not_found", message: error.message });
      }
    } else {
      recipeReference = references.recipes[0] || references.advisoryRecipes[0] || null;
      if (recipeReference) {
        try {
          recipeDefinition = this.recipeResolver.resolve(recipeReference.recipeId);
        } catch {
          recipeDefinition = null;
        }
      }
    }

    const workflowReference = input.workflowId
      ? references.workflows.find((item) => item.workflowId === input.workflowId) || (() => {
        const workflow = lookupWorkflow(this.workflows, input.workflowId);
        if (!workflow) return null;
        if (input.workflowVersion != null && workflow.version != null && String(input.workflowVersion) !== String(workflow.version)) return null;
        return { status: "resolved", workflowId: workflow.id || input.workflowId, workflowVersion: input.workflowVersion ?? workflow.version ?? null, inputRequirements: { required: workflow.requiredInputs || [], optional: workflow.optionalInputs || [], inferred: workflow.inferredInputs || [] }, provenance: { source: "creative-request", requestId: request.requestId } };
      })()
      : references.workflows[0] || references.advisoryWorkflows[0] || null;
    if (input.workflowId && !workflowReference) errors.push({ code: "workflow_not_found", message: `Unknown workflow: ${input.workflowId}` });

    metadata.approvalRequirements.push(...asArray(recipeDefinition?.approvalRequirements || recipeDefinition?.approvalGates || recipeDefinition?.approval));
    metadata.qaRequirements.push(...asArray(recipeDefinition?.qaRequirements || recipeDefinition?.qualityGates || recipeDefinition?.validation?.qualityGates));
    metadata.retryRecovery.push(...asArray(recipeDefinition?.retryRecovery || recipeDefinition?.retry || recipeDefinition?.recovery));
    metadata.costQualityStrategy.push(...asArray(recipeDefinition?.costQualityStrategy || recipeDefinition?.cost || recipeDefinition?.qualityStrategy));

    const unresolvedRequiredInputs = [];
    const availableInputs = { ...request.inputs };
    for (const name of metadata.requiredInputs) if (!valuePresent(availableInputs[name])) unresolvedRequiredInputs.push({ name, source: "skill" });
    for (const name of recipeReference?.inputRequirements?.required || []) if (!valuePresent(availableInputs[name])) unresolvedRequiredInputs.push({ name, source: "recipe" });
    for (const name of workflowReference?.inputRequirements?.required || []) if (!valuePresent(availableInputs[name])) unresolvedRequiredInputs.push({ name, source: "workflow" });
    const dedupedMissing = unresolvedRequiredInputs.filter((item, index, all) => all.findIndex((other) => other.name === item.name) === index);

    let intelligencePlan = null;
    if (!errors.length && recipeReference) {
      try {
        intelligencePlan = this.intelligenceEngine.plan({
          ...request,
          recipeId: recipeReference.recipeId,
          inputs: availableInputs,
          knowledgePack: input.knowledgePack || request.knowledgePack,
          knowledgeContext: input.knowledgeContext || request.knowledgeContext,
          projectId: input.projectId,
          memoryTypes: input.memoryTypes,
          memoryScopeId: input.memoryScopeId,
          minMemoryConfidence: input.minMemoryConfidence,
          memoryTtlMs: input.memoryTtlMs,
          skills: skillResults.map((item) => item.skill),
          executionPlan: null,
        });
      } catch (error) {
        errors.push({ code: error.message?.includes("capability") ? "capability_unsatisfied" : "intelligence_plan_error", message: error.message });
      }
    }

    const state = errors.length
      ? "non_executable"
      : dedupedMissing.length || (!recipeReference && input.requireRecipe !== false)
        ? "requires_input"
        : input.requiresApproval ? "requires_approval" : "executable";
    const recipe = intelligencePlan?.recipe || (recipeReference ? { id: recipeReference.recipeId, version: recipeReference.recipeVersion } : null);
    const knowledgeContext = intelligencePlan?.knowledgeContext || input.knowledgeContext || request.knowledgeContext || null;
    const memoryProjection = intelligencePlan?.memoryProjection || input.memoryProjection || null;
    const memoryReferences = input.memoryReferences || memoryProjection?.provenance || [];
    const provenance = deriveProvenance(request, agent, metadata.selectedSkills, recipe, workflowReference);
    return createCreativePlan({
      planId: input.planId || `plan-${request.requestId}`,
      request,
      agent,
      recipe,
      workflow: workflowReference,
      selectedSkills: metadata.selectedSkills,
      skillSelectionReasons: metadata.skillSelectionReasons,
      compatibleContentTypes: metadata.compatibleContentTypes,
      compatibleCampaignTemplates: metadata.compatibleCampaignTemplates,
      contextReferences: input.contextReferences || (knowledgeContext ? [{ type: "knowledge-pack", id: knowledgeContext.packId, version: knowledgeContext.packVersion }] : []),
      campaignContext: input.campaignContext || request.inputs.campaignContext || null,
      memoryReferences,
      memoryProjection,
      knowledgeContext,
      capabilityRequirements: intelligencePlan?.capabilityRequirements || [],
      routing: intelligencePlan?.routing || null,
      creativeSkills: intelligencePlan?.creativeSkills || null,
      requiredInputs: unique([...metadata.requiredInputs, ...(recipeReference?.inputRequirements?.required || []), ...(workflowReference?.inputRequirements?.required || [])]),
      unresolvedRequiredInputs: dedupedMissing,
      approvalRequirements: metadata.approvalRequirements,
      qaRequirements: metadata.qaRequirements,
      retryRecovery: metadata.retryRecovery.length ? metadata.retryRecovery : null,
      costQualityStrategy: metadata.costQualityStrategy.length ? metadata.costQualityStrategy : null,
      provenance,
      state,
      valid: state !== "non_executable",
      errors,
      warnings: intelligencePlan?.warnings || [],
      assumptions: dynamic ? ["Skills were selected deterministically from eligible metadata."] : [],
      metadata: {
        planner: "skill-aware-plan-compiler",
        intelligencePlanner: intelligencePlan?.metadata?.planner || null,
        advisoryRecipeReferences: references.advisoryRecipes,
        advisoryWorkflowReferences: references.advisoryWorkflows,
        skillCapabilities: metadata.skillCapabilities,
        compiledAt: this.now(),
      },
    });
  }
}

export const skillAwarePlanCompiler = new SkillAwarePlanCompiler();

export function compileSkillAwarePlan(input = {}, options = {}) {
  return new SkillAwarePlanCompiler(options).compile(input);
}
