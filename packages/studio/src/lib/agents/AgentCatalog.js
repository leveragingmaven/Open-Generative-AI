import { listFeaturedAgentTemplates } from "./AgentProfile.js";

const REMOTE_FEED_ORDER = ["templates", "featured"];

function cloneSkill(skill) {
  return skill && typeof skill === "object" ? { ...skill } : skill;
}

function normalizedPublication(input = {}) {
  const existing = input.publication && typeof input.publication === "object" && !Array.isArray(input.publication)
    ? input.publication
    : {};
  const isPublished = input.is_published ?? input.isPublished ?? existing.is_published ?? existing.isPublished;
  const isTemplate = input.is_template ?? input.isTemplate ?? existing.is_template ?? existing.isTemplate;
  return {
    ...existing,
    ...(isPublished !== undefined ? { isPublished } : {}),
    ...(isTemplate !== undefined ? { isTemplate } : {}),
  };
}

function sourceCatalogsFor(input = {}) {
  const catalogs = Array.isArray(input.sourceCatalogs) ? [...input.sourceCatalogs] : [];
  if (input.sourceCatalog) catalogs.push(input.sourceCatalog);
  return Array.from(new Set(catalogs.filter(Boolean))).sort((left, right) => {
    const leftIndex = REMOTE_FEED_ORDER.indexOf(left);
    const rightIndex = REMOTE_FEED_ORDER.indexOf(right);
    if (leftIndex === -1 && rightIndex === -1) return left.localeCompare(right);
    if (leftIndex === -1) return 1;
    if (rightIndex === -1) return -1;
    return leftIndex - rightIndex;
  });
}

function remoteFeedRank(record = {}) {
  const catalogs = sourceCatalogsFor(record);
  return catalogs.includes("featured") ? 2 : catalogs.includes("templates") ? 1 : 0;
}

export function adaptRemoteAgentTemplate(template = {}, { sourceCatalog = "templates", isFeatured = false } = {}) {
  const name = template.name || template.title || "Remote Agent";
  const iconUrl = template.icon_url || template.image_url || template.iconUrl || template.icon || null;
  const remoteSkills = Array.isArray(template.skills) ? template.skills.map(cloneSkill) : [];
  const suppliedCategories = Array.isArray(template.categories) ? template.categories.filter(Boolean) : [];
  const category = template.category || suppliedCategories[0] || "General";
  const categories = suppliedCategories.length
    ? Array.from(new Set([...suppliedCategories, ...(template.category ? [template.category] : [])]))
    : Array.from(new Set([category, "General"]));
  const publication = normalizedPublication(template);
  return {
    ...template,
    id: template.agent_id || template.id || null,
    name,
    specialty: template.specialty || template.description || name,
    description: template.description || "",
    systemPrompt: template.system_prompt || template.prompt || "",
    prompt: template.prompt || template.system_prompt || `You are ${name}. Analyze the brief, apply your specialty together with the executing AI Twin's context, and produce the creative asset for the active campaign.`,
    category,
    categories,
    welcomeMessage: template.welcome_message || "",
    initialSuggestions: Array.isArray(template.initial_suggestions) ? template.initial_suggestions : [],
    suggestedSkillIds: remoteSkills.map((skill) => typeof skill === "string" ? skill : skill?.name || skill?.id).filter(Boolean),
    skills: remoteSkills,
    iconUrl,
    artwork: template.artwork || (iconUrl ? { url: iconUrl } : null),
    metadata: { ...(template.metadata || {}), ...(iconUrl ? { iconUrl } : {}) },
    remoteId: template.agent_id || template.id || null,
    remoteRecordId: template.id || null,
    remote: true,
    ownerUsername: template.owner_username || template.ownerUsername || "",
    ownerEmail: template.owner_email || template.ownerEmail || "",
    publication,
    isPublished: publication.isPublished,
    isTemplate: publication.isTemplate,
    isFeatured: Boolean(isFeatured || template.is_featured === true || template.isFeatured === true),
    sourceCatalog,
    sourceCatalogs: sourceCatalogsFor({ sourceCatalog }),
    avatarPlaceholder: name.charAt(0).toUpperCase(),
  };
}

export function normalizeAgentTemplate(input = {}, source = "remote") {
  const stableId = input.agent_id || input.id || input.remoteId || null;
  const name = input.name || input.title || "Unnamed Agent";
  const iconUrl = input.icon_url || input.image_url || input.iconUrl || input.icon || null;
  const inputCategories = Array.isArray(input.categories) ? input.categories.filter(Boolean) : [];
  const category = input.category || inputCategories[0] || "General";
  const categories = inputCategories.length
    ? Array.from(new Set([...inputCategories, ...(input.category ? [input.category] : [])]))
    : [category];
  const skills = Array.isArray(input.skills) ? input.skills.map(cloneSkill) : [];
  const publication = normalizedPublication(input);
  return {
    ...input,
    source,
    sourceId: input.agent_id || input.id || input.remoteId || null,
    sources: Array.from(new Set([...(Array.isArray(input.sources) ? input.sources : []), source])),
    sourceCatalogs: sourceCatalogsFor(input),
    stableId,
    remoteId: input.remoteId || (source === "remote" ? stableId : null),
    remoteRecordId: input.remoteRecordId || (source === "remote" ? input.id || null : null),
    name,
    title: input.title || name,
    description: input.description || "",
    specialty: input.specialty || input.description || name,
    category,
    categories,
    iconUrl,
    artwork: input.artwork || (iconUrl ? { url: iconUrl } : null),
    ownerUsername: input.owner_username || input.ownerUsername || "",
    ownerEmail: input.owner_email || input.ownerEmail || "",
    publication,
    isPublished: publication.isPublished,
    isTemplate: publication.isTemplate,
    skills,
    metadata: { ...(input.metadata || {}), ...(iconUrl ? { iconUrl } : {}) },
  };
}

function mergeSameSource(existing, incoming) {
  const incomingPreferred = remoteFeedRank(incoming) >= remoteFeedRank(existing);
  const preferred = incomingPreferred ? incoming : existing;
  const secondary = incomingPreferred ? existing : incoming;
  return {
    ...secondary,
    ...preferred,
    sources: Array.from(new Set([...(existing.sources || []), ...(incoming.sources || [])])),
    sourceCatalogs: sourceCatalogsFor({ sourceCatalogs: [...sourceCatalogsFor(existing), ...sourceCatalogsFor(incoming)] }),
    iconUrl: preferred.iconUrl || secondary.iconUrl,
    artwork: preferred.artwork || secondary.artwork,
    ownerUsername: preferred.ownerUsername || secondary.ownerUsername,
    ownerEmail: preferred.ownerEmail || secondary.ownerEmail,
    skills: preferred.skills?.length ? preferred.skills.map(cloneSkill) : secondary.skills,
    publication: { ...(secondary.publication || {}), ...(preferred.publication || {}) },
    isPublished: preferred.isPublished ?? secondary.isPublished,
    isTemplate: preferred.isTemplate ?? secondary.isTemplate,
    metadata: { ...(secondary.metadata || {}), ...(preferred.metadata || {}) },
    theme: preferred.theme ?? secondary.theme,
    isFeatured: Boolean(existing.isFeatured || incoming.isFeatured),
  };
}

function mergeDuplicate(existing, incoming) {
  const remote = existing.source === "remote" ? existing : incoming.source === "remote" ? incoming : null;
  const local = existing.source === "local" ? existing : incoming.source === "local" ? incoming : null;

  if (!remote || !local) return mergeSameSource(existing, incoming);

  return {
    ...remote,
    ...local,
    source: "remote",
    sources: Array.from(new Set([...(remote.sources || []), ...(local.sources || [])])),
    sourceCatalog: remote.sourceCatalog || local.sourceCatalog,
    sourceCatalogs: sourceCatalogsFor(remote),
    sourceId: remote.sourceId || local.sourceId,
    stableId: remote.stableId || local.stableId,
    agent_id: remote.agent_id ?? local.agent_id,
    remoteId: remote.remoteId || local.remoteId,
    remoteRecordId: remote.remoteRecordId || local.remoteRecordId,
    iconUrl: remote.iconUrl || local.iconUrl,
    artwork: remote.artwork || local.artwork,
    ownerUsername: remote.ownerUsername || local.ownerUsername,
    ownerEmail: remote.ownerEmail || local.ownerEmail,
    owner_username: remote.owner_username ?? local.owner_username,
    owner_email: remote.owner_email ?? local.owner_email,
    user_id: remote.user_id ?? local.user_id,
    is_owner: remote.is_owner ?? local.is_owner,
    publication: { ...(local.publication || {}), ...(remote.publication || {}) },
    isPublished: remote.isPublished ?? local.isPublished,
    isTemplate: remote.isTemplate ?? local.isTemplate,
    is_published: remote.is_published ?? local.is_published,
    is_template: remote.is_template ?? local.is_template,
    skills: remote.skills?.length ? remote.skills.map(cloneSkill) : local.skills,
    metadata: { ...(local.metadata || {}), ...(remote.metadata || {}) },
    theme: remote.theme ?? local.theme,
    isFeatured: Boolean(remote.isFeatured || local.isFeatured),
  };
}

export function mergeAgentTemplates(remoteTemplates = [], localTemplates = listFeaturedAgentTemplates(), aliases = {}) {
  const merged = [];
  const byIdentity = new Map();
  const add = (item, source) => {
    const normalized = normalizeAgentTemplate(item, source);
    const identity = normalized.stableId ? `id:${normalized.stableId}` : null;
    const alias = aliases[normalized.stableId] || aliases[normalized.name];
    const key = alias ? `alias:${alias}` : identity;
    const existing = key ? byIdentity.get(key) : null;
    if (!existing) {
      merged.push(normalized);
      if (key) byIdentity.set(key, normalized);
      return;
    }
    Object.assign(existing, mergeDuplicate(existing, normalized));
  };
  remoteTemplates.forEach((item) => add(item, "remote"));
  localTemplates.forEach((item) => add(item, "local"));
  return merged;
}

export function filterAgentCatalog(catalog, { category = "all", query = "" } = {}) {
  const q = query.trim().toLowerCase();
  return catalog.filter((agent) => {
    if (category !== "all" && !(agent.categories || []).includes(category) && agent.category !== category) return false;
    return !q || `${agent.name} ${agent.specialty} ${agent.description} ${agent.category}`.toLowerCase().includes(q);
  });
}

export function startAgentCatalogFeedRequest({ load, apiKey, timeoutMs, onFulfilled, onRejected, onSettled }) {
  const controller = new AbortController();
  let settled = false;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  let loaded;
  try {
    loaded = load(apiKey, { signal: controller.signal });
  } catch (error) {
    loaded = Promise.reject(error);
  }
  const promise = Promise.resolve(loaded)
    .then((value) => {
      onFulfilled?.(value);
      return { status: "fulfilled", value };
    })
    .catch((reason) => {
      onRejected?.(reason);
      return { status: "rejected", reason };
    })
    .finally(() => {
      settled = true;
      clearTimeout(timeoutId);
      onSettled?.();
    });

  return {
    promise,
    abort() {
      if (settled) return;
      clearTimeout(timeoutId);
      controller.abort();
    },
  };
}
