import { SKILL_LIBRARY, getSkill } from "./index.js";
import { RECIPE_LIBRARY } from "../intelligence/config.js";
import { RecipeResolver } from "../intelligence/RecipeResolver.js";

const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const AVAILABLE_STATUSES = new Set(["active", "approved", "published"]);

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === "") return [];
  return [value];
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function versionIsValid(version) {
  return version == null || (typeof version === "number" && Number.isInteger(version) && version > 0)
    || (typeof version === "string" && VERSION_PATTERN.test(version));
}

function referenceError(kind, field, message, reference = null) {
  return { kind, field, message, reference };
}

function normalizeReference(raw, kind, field, index) {
  if (typeof raw === "string") {
    return { id: raw, version: null, source: field, index, raw };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { error: referenceError(kind, field, "reference must be a string or object", raw) };
  }
  const id = raw.id || raw[`${kind}Id`];
  if (typeof id !== "string" || !id.trim()) {
    return { error: referenceError(kind, field, "reference requires a non-empty id", raw) };
  }
  if (!versionIsValid(raw.version)) {
    return { error: referenceError(kind, field, "reference version must be semver or a positive integer", raw) };
  }
  return { id, version: raw.version ?? null, source: field, index, raw };
}

function collectReferences(skill, kind) {
  const fields = kind === "recipe"
    ? ["recipeId", "recipeIds", "recipes", "recipeReferences", "compatibleRecipeIds"]
    : ["workflowId", "workflowIds", "workflows", "workflowReferences", "workflowReference"];
  const references = [];
  const issues = [];
  const seen = new Set();

  for (const field of fields) {
    const values = asArray(skill[field]);
    values.forEach((value, index) => {
      const normalized = normalizeReference(value, kind, field, index);
      if (normalized.error) {
        issues.push(normalized.error);
        return;
      }
      const key = `${normalized.id}@${normalized.version ?? "latest"}`;
      if (seen.has(key)) {
        issues.push(referenceError(kind, field, `duplicate ${kind} reference: ${key}`, value));
        return;
      }
      seen.add(key);
      references.push(normalized);
    });
  }
  if (kind === "recipe" && skill.compatibleRecipes !== undefined) {
    for (const value of asArray(skill.compatibleRecipes)) {
      issues.push(referenceError("recipe", "compatibleRecipes", "legacy compatibleRecipes is descriptive metadata; use compatibleContentTypes", value));
    }
  }
  if (kind === "workflow" && (typeof skill.workflow === "string" || skill.workflow?.id)) {
    const normalized = normalizeReference(skill.workflow, kind, "workflow", 0);
    if (normalized.error) issues.push(normalized.error);
    else references.push(normalized);
  }
  return { references, issues };
}

function recipeInputRequirements(recipe) {
  const required = [];
  const optional = [];
  for (const [name, definition] of Object.entries(recipe?.inputs || {})) {
    if (definition?.required) required.push(name);
    else optional.push(name);
  }
  return { required, optional, inferred: [] };
}

function workflowInputRequirements(workflow) {
  return {
    required: Array.isArray(workflow?.requiredInputs) ? [...workflow.requiredInputs] : [],
    optional: Array.isArray(workflow?.optionalInputs) ? [...workflow.optionalInputs] : [],
    inferred: Array.isArray(workflow?.inferredInputs) ? [...workflow.inferredInputs] : [],
  };
}

function lifecycleAvailable(value) {
  return value?.status == null || AVAILABLE_STATUSES.has(value.status);
}

function recipeLookup(recipeResolver, id) {
  try {
    return recipeResolver.resolve(id);
  } catch {
    return Object.values(recipeResolver.recipes || {}).find((recipe) => recipe?.id === id) || null;
  }
}

function workflowLookup(source, id) {
  if (!source) return null;
  if (typeof source === "function") return source(id) || null;
  if (typeof source.resolve === "function") return source.resolve(id) || null;
  if (typeof source.get === "function") return source.get(id) || null;
  if (Array.isArray(source)) return source.find((workflow) => workflow?.id === id) || null;
  return source[id] || Object.values(source).find((workflow) => workflow?.id === id) || null;
}

function normalizedSkill(skill) {
  return {
    skillId: skill.skillId,
    skillVersion: skill.version ?? null,
    requiredCapabilities: unique(Array.isArray(skill.capabilities) ? skill.capabilities : []),
    compatibleContentTypes: unique(Array.isArray(skill.compatibleContentTypes) ? skill.compatibleContentTypes : []),
    compatibleCampaignTemplates: unique(Array.isArray(skill.compatibleCampaignTemplates) ? skill.compatibleCampaignTemplates : []),
  };
}

function resolveReference(reference, kind, skill, lookup, inputRequirements, requiredCapabilities) {
  const value = lookup(reference.id);
  const provenance = {
    source: "skill",
    field: reference.source,
    referenceIndex: reference.index,
    skillId: skill.skillId,
    skillVersion: skill.version ?? null,
  };
  if (!value) {
    return {
      status: "unresolved",
      ...(kind === "recipe" ? { recipeId: reference.id, recipeVersion: reference.version } : { workflowId: reference.id, workflowVersion: reference.version }),
      requiredCapabilities,
      inputRequirements,
      selectionReason: `Declared by ${skill.skillId}.${reference.source}; no canonical ${kind} with this ID exists.`,
      provenance,
      error: `${kind}_not_found`,
    };
  }
  if (!lifecycleAvailable(value)) {
    return {
      status: "unresolved",
      ...(kind === "recipe" ? { recipeId: reference.id, recipeVersion: reference.version } : { workflowId: reference.id, workflowVersion: reference.version }),
      requiredCapabilities,
      inputRequirements,
      selectionReason: `Declared by ${skill.skillId}.${reference.source}; the ${kind} lifecycle status is not available for new selection.`,
      provenance,
      error: `${kind}_unavailable`,
    };
  }
  if (reference.version != null && value.version != null && String(reference.version) !== String(value.version)) {
    return {
      status: "unresolved",
      ...(kind === "recipe" ? { recipeId: reference.id, recipeVersion: reference.version } : { workflowId: reference.id, workflowVersion: reference.version }),
      requiredCapabilities,
      inputRequirements,
      selectionReason: `Declared by ${skill.skillId}.${reference.source}; the requested ${kind} version is not available.`,
      provenance,
      error: `${kind}_version_mismatch`,
    };
  }
  const version = reference.version ?? value.version ?? null;
  return {
    status: "resolved",
    ...(kind === "recipe" ? { recipeId: value.id || reference.id, recipeVersion: version } : { workflowId: value.id || reference.id, workflowVersion: version }),
    requiredCapabilities,
    inputRequirements,
    selectionReason: `Declared by ${skill.skillId}.${reference.source}.`,
    provenance,
  };
}

function resolveKind(skill, kind, lookup, agentReferences = []) {
  const collected = collectReferences(skill, kind);
  const references = [...collected.references, ...agentReferences];
  const candidates = [];
  const unresolved = [...collected.issues];
  const seen = new Set();

  for (const reference of references) {
    const key = `${reference.id}@${reference.version ?? "latest"}`;
    if (seen.has(key)) {
      unresolved.push(referenceError(kind, reference.source, `duplicate ${kind} reference: ${key}`, reference.raw));
      continue;
    }
    seen.add(key);
    const value = lookup(reference.id);
    const inputRequirements = kind === "recipe" ? recipeInputRequirements(value) : workflowInputRequirements(value);
    const requiredCapabilities = kind === "recipe" ? unique(value?.capabilityRequirements || []) : [];
    const result = resolveReference(reference, kind, skill, lookup, inputRequirements, requiredCapabilities);
    if (result.status === "resolved") candidates.push(result);
    else unresolved.push(referenceError(kind, reference.source, result.error, reference.raw));
  }

  return {
    selected: candidates[0] || null,
    candidates,
    unresolved,
  };
}

function agentReferences(agent, kind) {
  const field = kind === "recipe" ? "suggestedRecipeIds" : "suggestedWorkflowIds";
  return asArray(agent?.[field]).map((id, index) => ({
    id,
    version: null,
    source: `agent.${field}`,
    index,
    raw: id,
  }));
}

export class SkillReferenceResolver {
  constructor({ skills = SKILL_LIBRARY, recipeResolver = new RecipeResolver({ recipes: RECIPE_LIBRARY }), workflows = {} } = {}) {
    this.skills = skills;
    this.recipeResolver = recipeResolver;
    this.workflows = workflows;
  }

  resolveSkill(skillOrId) {
    if (typeof skillOrId === "string") return this.skills[skillOrId] || getSkill(skillOrId);
    if (!skillOrId || typeof skillOrId !== "object") throw new Error("Skill is required");
    return skillOrId;
  }

  resolve(skillOrId, { agent = null, includeAgentSuggestions = true } = {}) {
    const skill = this.resolveSkill(skillOrId);
    const recipeResult = resolveKind(
      skill,
      "recipe",
      (id) => recipeLookup(this.recipeResolver, id),
      includeAgentSuggestions ? agentReferences(agent, "recipe") : [],
    );
    const workflowResult = resolveKind(
      skill,
      "workflow",
      (id) => workflowLookup(this.workflows, id),
      includeAgentSuggestions ? agentReferences(agent, "workflow") : [],
    );
    return {
      skill: normalizedSkill(skill),
      recipes: recipeResult,
      workflows: workflowResult,
    };
  }
}

export const skillReferenceResolver = new SkillReferenceResolver();

export function resolveSkillReferences(skillOrId, options = {}) {
  return skillReferenceResolver.resolve(skillOrId, options);
}

export function validateSkillReferences(skills = SKILL_LIBRARY, { recipeResolver = new RecipeResolver({ recipes: RECIPE_LIBRARY }), workflows = {} } = {}) {
  const resolver = new SkillReferenceResolver({ skills, recipeResolver, workflows });
  const issues = [];
  for (const skill of Object.values(skills)) {
    const result = resolver.resolve(skill, { includeAgentSuggestions: false });
    issues.push(...result.recipes.unresolved.map((item) => ({ skillId: skill.skillId, ...item })));
    issues.push(...result.workflows.unresolved.map((item) => ({ skillId: skill.skillId, ...item })));
  }
  return issues;
}
