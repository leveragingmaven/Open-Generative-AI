import { listFeaturedAgentTemplates } from "./AgentProfile.js";

export function normalizeAgentTemplate(input = {}, source = "remote") {
  const stableId = input.agent_id || input.id || input.remoteId || null;
  const name = input.name || input.title || "Unnamed Agent";
  const iconUrl = input.icon_url || input.image_url || input.iconUrl || input.icon || null;
  const inputCategories = Array.isArray(input.categories) ? input.categories : [];
  const category = input.category || inputCategories[0] || "General";
  const skills = Array.isArray(input.skills) ? input.skills.map((skill) => ({ ...skill })) : [];
  return {
    ...input,
    source,
    sourceId: input.agent_id || input.id || input.remoteId || null,
    sources: Array.from(new Set([...(Array.isArray(input.sources) ? input.sources : []), source])),
    stableId,
    remoteId: input.remoteId || (source === "remote" ? stableId : null),
    remoteRecordId: input.remoteRecordId || (source === "remote" ? input.id || null : null),
    name,
    title: input.title || name,
    description: input.description || "",
    specialty: input.specialty || input.description || name,
    category,
    categories: Array.from(new Set([...inputCategories, category])),
    iconUrl,
    artwork: input.artwork || (iconUrl ? { url: iconUrl } : null),
    ownerUsername: input.owner_username || input.ownerUsername || "",
    ownerEmail: input.owner_email || input.ownerEmail || "",
    publication: input.publication || { isPublished: input.is_published, isTemplate: input.is_template },
    isPublished: input.is_published ?? input.isPublished,
    isTemplate: input.is_template ?? input.isTemplate,
    skills,
    metadata: { ...(input.metadata || {}), ...(iconUrl ? { iconUrl } : {}) },
  };
}

function mergeDuplicate(existing, incoming) {
  const remote = existing.source === "remote" ? existing : incoming.source === "remote" ? incoming : null;
  const local = existing.source === "local" ? existing : incoming.source === "local" ? incoming : null;

  if (!remote || !local) {
    return {
      ...existing,
      ...incoming,
      sources: Array.from(new Set([...(existing.sources || []), ...(incoming.sources || [])])),
      iconUrl: incoming.iconUrl || existing.iconUrl,
      artwork: incoming.artwork || existing.artwork,
      ownerUsername: incoming.ownerUsername || existing.ownerUsername,
      ownerEmail: incoming.ownerEmail || existing.ownerEmail,
      skills: incoming.skills?.length ? incoming.skills.map((skill) => ({ ...skill })) : existing.skills,
      publication: { ...(existing.publication || {}), ...(incoming.publication || {}) },
      metadata: { ...(existing.metadata || {}), ...(incoming.metadata || {}) },
      theme: incoming.theme ?? existing.theme,
    };
  }

  return {
    ...remote,
    ...local,
    source: "remote",
    sources: Array.from(new Set([...(remote.sources || []), ...(local.sources || [])])),
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
    skills: remote.skills?.length ? remote.skills.map((skill) => ({ ...skill })) : local.skills,
    metadata: { ...(local.metadata || {}), ...(remote.metadata || {}) },
    theme: remote.theme ?? local.theme,
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
