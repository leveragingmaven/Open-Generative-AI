import { knowledgeContextRouter } from "./KnowledgeContextRouter.js";

// Provider-neutral contract for already-selected Creator OS context.
// Knowledge selection remains owned by KnowledgeContextRouter.

const IDENTITY_DOMAINS = [
  "brand",
  "voice",
  "audience",
  "ip",
  "approvedClaims",
  "resources",
  "visualDirection",
];

const PROJECT_FIELDS = [
  "id",
  "name",
  "description",
  "goal",
  "objective",
  "recipe",
  "status",
  "startDate",
  "endDate",
  "tags",
  "approval",
];

const HISTORY_FIELDS = new Set(["history", "conversationHistory", "messages"]);

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, clone(entry)]));
  }
  return value;
}

function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
}

function projection(value) {
  if (value == null) return {};
  return clone(value);
}

function hasContent(value) {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function selectedCampaign(input = {}) {
  return input.campaign
    || input.activeCampaign
    || input.campaignContext?.activeCampaign
    || null;
}

function selectedOffer(input = {}) {
  if (input.selectedOffer && typeof input.selectedOffer === "object") return input.selectedOffer;
  if (input.offer && typeof input.offer === "object") return input.offer;

  const offers = input.offers?.active;
  const requestedId = input.offerId || input.selectedOfferId || input.offers?.selectedOfferId;
  if (Array.isArray(offers) && requestedId) {
    return offers.find((offer) => String(offer.id || offer.offerId) === String(requestedId)) || null;
  }

  if (input.knowledgePack) {
    return knowledgeContextRouter.select(input.knowledgePack, {
      request: input.request,
      knowledgeDomains: ["approvedClaims"],
      offerId: input.offerId,
      selectedOfferId: input.selectedOfferId,
    })?.selectedOffer || null;
  }
  return null;
}

function assetReferences(campaign, input = {}) {
  const selectedIds = input.selectedAssetIds || input.assetIds || input.relevantAssetIds;
  if (!Array.isArray(selectedIds) || !Array.isArray(campaign?.assets)) return [];
  const wanted = new Set(selectedIds.map(String));
  return campaign.assets
    .filter((asset) => wanted.has(String(asset.assetId)))
    .map((asset) => projection({
      campaignId: asset.campaignId,
      assetId: asset.assetId,
      role: asset.role,
      hero: Boolean(asset.hero),
      thumbnail: Boolean(asset.thumbnail),
      email: Boolean(asset.email),
      facebook: Boolean(asset.facebook),
      instagram: Boolean(asset.instagram),
      pinterest: Boolean(asset.pinterest),
      story: Boolean(asset.story),
      video: Boolean(asset.video),
      status: asset.status,
    }));
}

function projectProjection(input = {}) {
  const campaign = selectedCampaign(input);
  if (!campaign) return { context: {}, metadata: {} };
  const offer = selectedOffer(input);
  const assets = assetReferences(campaign, input);
  const memoryValues = input.memoryProjection?.values;
  const context = {};

  if (campaign) {
    PROJECT_FIELDS.forEach((field) => {
      if (hasContent(campaign[field])) context[field] = projection(campaign[field]);
    });
    if (hasContent(campaign.brand)) context.brand = projection(campaign.brand);
    if (hasContent(campaign.audience)) context.audience = projection(campaign.audience);
  }
  if (offer && hasContent(offer)) context.selectedOffer = projection(offer);
  if (assets.length) context.assets = assets;
  if (memoryValues && typeof memoryValues === "object" && Object.keys(memoryValues).length) {
    context.memory = projection(memoryValues);
  }

  const campaignSource = campaign?.id || null;
  return {
    context,
    metadata: {
      includedDomains: [
        "campaign",
        ...(offer ? ["selectedOffer"] : []),
        ...(assets.length ? ["assets"] : []),
        ...(context.memory ? ["memory"] : []),
      ],
      omittedDomains: ["campaign", "selectedOffer", "assets", "memory"].filter((domain) => (
        domain === "campaign" ? !campaign : domain === "selectedOffer" ? !offer : domain === "assets" ? !assets.length : !context.memory
      )),
      sourceId: campaignSource,
      version: campaign?.version ?? null,
      selectedOfferId: offer?.id || offer?.offerId || null,
    },
  };
}

function taskInput(input = {}) {
  return input.task || input.taskInput || {};
}

function taskRequest(input = {}, task = {}) {
  return input.request || task.request || {};
}

function selectedAgent(input = {}, task = {}) {
  return input.selectedAgent || input.agent || task.selectedAgent || task.agent || null;
}

function agentProjection(agent) {
  if (!agent || typeof agent !== "object") return null;
  const profile = {
    id: agent.id || null,
    name: agent.name || null,
    category: agent.category || null,
    specialty: agent.specialty || null,
  };
  return Object.fromEntries(Object.entries(profile).filter(([, value]) => hasContent(value)));
}

function selectedSkill(input = {}, task = {}) {
  return input.selectedSkill || input.skill || task.selectedSkill || task.skill || null;
}

function skillProjection(skill) {
  if (!skill) return null;
  if (typeof skill === "string") return { skillId: skill };
  if (typeof skill !== "object") return null;
  const selected = {};
  ["skillId", "name", "version", "category", "subcategory", "description", "constraints"].forEach((field) => {
    if (hasContent(skill[field])) selected[field] = projection(skill[field]);
  });
  return Object.keys(selected).length ? selected : null;
}

function referenceProjection(value, idField) {
  if (!value) return null;
  if (typeof value === "string") return { [idField]: value };
  if (typeof value !== "object") return null;
  const result = {};
  ["id", "version", "name"].forEach((field) => {
    if (hasContent(value[field])) result[field] = projection(value[field]);
  });
  return Object.keys(result).length ? result : null;
}

function taskProjection(input = {}) {
  const task = taskInput(input);
  const request = taskRequest(input, task);
  const agent = selectedAgent(input, task);
  const skill = selectedSkill(input, task);
  const recipe = input.selectedRecipe || input.recipe || task.selectedRecipe || task.recipe || null;
  const workflow = input.selectedWorkflow || input.workflow || task.selectedWorkflow || task.workflow || null;
  const context = {};

  const userRequest = input.userRequest
    ?? task.userRequest
    ?? request.userRequest
    ?? request.intent
    ?? request.inputs?.prompt
    ?? input.prompt
    ?? null;
  const objective = input.objective ?? task.objective ?? null;
  const expectedOutput = input.expectedOutput ?? task.expectedOutput ?? request.output ?? null;
  const parameters = input.parameters ?? task.parameters ?? request.inputs?.parameters ?? null;
  const constraints = input.constraints ?? task.constraints ?? null;
  const references = input.references ?? task.references ?? request.references ?? null;

  if (hasContent(userRequest)) context.userRequest = projection(userRequest);
  if (hasContent(request.intent)) context.intent = projection(request.intent);
  if (hasContent(objective)) context.objective = projection(objective);
  if (hasContent(expectedOutput)) context.expectedOutput = projection(expectedOutput);
  if (hasContent(parameters)) context.parameters = projection(parameters);
  if (hasContent(constraints)) context.constraints = projection(constraints);
  if (Array.isArray(references) && references.length) context.references = projection(references);

  const profile = agentProjection(agent);
  if (profile) context.agentProfile = profile;
  const specialistInstructions = agent?.systemPrompt || agent?.prompt || task.specialistInstructions || null;
  if (hasContent(specialistInstructions)) context.specialistInstructions = projection(specialistInstructions);

  const selectedSkillContext = skillProjection(skill);
  if (selectedSkillContext) context.skill = selectedSkillContext;

  const recipeId = typeof recipe === "string" ? recipe : recipe?.id || input.recipeId || task.recipeId || request.recipeId;
  const recipeReference = referenceProjection(recipe || recipeId, "recipeId");
  if (recipeReference) context.recipe = recipeReference;

  const workflowId = typeof workflow === "string" ? workflow : workflow?.id || input.workflowId || task.workflowId;
  const workflowReference = referenceProjection(workflow || workflowId, "workflowId");
  if (workflowReference) context.workflow = workflowReference;

  const source = input.taskSource || task.source || null;
  const metadata = {
    includedDomains: Object.keys(context),
    omittedDomains: ["request", "agent", "specialistInstructions", "skill", "recipe", "workflow", "parameters", "constraints", "references"]
      .filter((domain) => !Object.hasOwn(context, domain === "request" ? "userRequest" : domain === "agent" ? "agentProfile" : domain)),
    source,
    agentId: profile?.id || null,
    agentVersion: agent?.version ?? null,
    skillId: selectedSkillContext?.skillId || null,
    skillVersion: selectedSkillContext?.version ?? null,
    recipeId: recipeReference?.id || recipeReference?.recipeId || null,
    workflowId: workflowReference?.id || workflowReference?.workflowId || null,
  };

  if (!Object.keys(context).length) return { context: {}, metadata: {} };
  return { context, metadata };
}

function identityProjection(input = {}) {
  if (!input.knowledgePack) {
    return { context: projection(input.identityContext), metadata: {} };
  }

  const selected = knowledgeContextRouter.select(input.knowledgePack, {
    request: input.request,
    knowledgeDomains: input.knowledgeDomains,
    offerId: input.offerId,
    selectedOfferId: input.selectedOfferId,
  });

  if (!selected) return { context: {}, metadata: {} };

  const context = {};
  IDENTITY_DOMAINS.forEach((domain) => {
    if (hasContent(selected[domain])) context[domain] = projection(selected[domain]);
  });

  const pack = input.knowledgePack;
  const sourceId = pack.id || pack.packId || null;
  const version = selected.packVersion ?? pack.version ?? null;
  return {
    context,
    metadata: {
      includedDomains: Object.keys(context),
      omittedDomains: IDENTITY_DOMAINS.filter((domain) => !Object.hasOwn(context, domain)),
      sourceId,
      version,
    },
  };
}

function list(value) {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === "string") : [];
}

function metadata(input = {}, identity = {}, project = {}, task = {}) {
  const source = input.metadata && typeof input.metadata === "object" ? input.metadata : {};
  const sources = source.sources && typeof source.sources === "object" ? source.sources : {};
  const versions = source.versions && typeof source.versions === "object" ? source.versions : {};
  const includedDomains = [...new Set([
    ...list(source.includedDomains),
    ...list(identity.includedDomains),
    ...list(project.includedDomains),
    ...list(task.includedDomains),
  ])];
  const omittedDomains = [...new Set([
    ...list(source.omittedDomains),
    ...list(identity.omittedDomains),
    ...list(project.omittedDomains),
    ...list(task.omittedDomains),
  ])]
    .filter((domain) => !includedDomains.includes(domain));
  const outputSources = clone(sources);
  const outputVersions = clone(versions);
  if (identity.sourceId) outputSources.identity = identity.sourceId;
  if (identity.version != null) outputVersions.identity = identity.version;
  if (project.sourceId) outputSources.project = project.sourceId;
  if (project.version != null) outputVersions.project = project.version;
  if (project.selectedOfferId) outputSources.selectedOffer = project.selectedOfferId;
  if (task.source) outputSources.task = task.source;
  if (task.agentId) outputSources.agent = task.agentId;
  if (task.skillId) outputSources.skill = task.skillId;
  if (task.recipeId) outputSources.recipe = task.recipeId;
  if (task.workflowId) outputSources.workflow = task.workflowId;
  if (task.agentVersion != null) outputVersions.agent = task.agentVersion;
  if (task.skillVersion != null) outputVersions.skill = task.skillVersion;
  return {
    includedDomains,
    omittedDomains,
    sources: outputSources,
    versions: outputVersions,
    estimatedSize: source.estimatedSize ?? null,
    ...(source.knowledgePack && typeof source.knowledgePack === "object"
      ? { knowledgePack: clone(source.knowledgePack) }
      : {}),
  };
}

/**
 * Normalize selected context into immutable Identity, Project, and Task
 * projections. Metadata is deliberately kept outside the model-facing layers.
 */
export function compileContext(input = {}) {
  const identity = identityProjection(input);
  const project = projectProjection(input);
  const task = taskProjection(input);
  return freeze({
    identityContext: identity.context,
    projectContext: Object.keys(project.context).length ? project.context : projection(input.projectContext),
    taskContext: Object.keys(task.context).length ? task.context : projectionWithoutHistory(input.taskContext),
    metadata: metadata(input, identity.metadata, project.metadata, task.metadata),
  });
}

export const createContextContract = compileContext;

export function compileIdentityContext(input = {}) {
  return freeze(identityProjection(input).context);
}

export function compileProjectContext(input = {}) {
  return freeze(projectProjection(input).context);
}

function projectionWithoutHistory(value) {
  if (!value || typeof value !== "object") return {};
  return projection(Object.fromEntries(Object.entries(value).filter(([key]) => !HISTORY_FIELDS.has(key))));
}

export function compileTaskContext(input = {}) {
  const task = taskProjection(input);
  return freeze(Object.keys(task.context).length ? task.context : projectionWithoutHistory(input.taskContext));
}
