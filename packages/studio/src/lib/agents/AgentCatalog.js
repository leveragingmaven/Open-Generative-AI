import { listFeaturedAgentTemplates } from "./AgentProfile.js";

export function normalizeAgentTemplate(input = {}, source = "remote") {
  const stableId = input.agent_id || input.id || input.remoteId || null;
  const name = input.name || input.title || "Unnamed Agent";
  const iconUrl = input.icon_url || input.image_url || input.iconUrl || input.icon || null;
  const category = input.category || (input.categories || [])[0] || "General";
  return {
    ...input,
    source,
    sourceId: input.agent_id || input.id || input.remoteId || null,
    stableId,
    name,
    title: input.title || name,
    description: input.description || "",
    specialty: input.specialty || input.description || name,
    category,
    categories: Array.from(new Set([...(input.categories || []), category])),
    iconUrl,
    artwork: input.artwork || (iconUrl ? { url: iconUrl } : null),
    ownerUsername: input.owner_username || input.ownerUsername || "",
    publication: input.publication || { isPublished: input.is_published, isTemplate: input.is_template },
    isPublished: input.is_published ?? input.isPublished,
    isTemplate: input.is_template ?? input.isTemplate,
    skills: Array.isArray(input.skills) ? [...input.skills] : [],
    metadata: { ...(input.metadata || {}), ...(iconUrl ? { iconUrl } : {}) },
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
    Object.assign(existing, normalized.source === "remote" ? { ...existing, ...normalized } : normalized);
    if (normalized.iconUrl || normalized.artwork) {
      existing.iconUrl = normalized.iconUrl || existing.iconUrl;
      existing.artwork = normalized.artwork || existing.artwork;
      existing.metadata = { ...existing.metadata, ...normalized.metadata };
    }
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
