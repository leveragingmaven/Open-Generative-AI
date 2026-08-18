import { SKILL_LIBRARY, getSkill } from "./index.js";
import { assertValidSkillLibrary } from "./SkillMetadata.js";

const ACTIVE_STATUS = "active";
const INTENT_STOP_WORDS = new Set([
  "a", "an", "and", "for", "from", "in", "make", "plan", "request", "skill", "the", "to", "with",
  "creative", "content", "asset", "assets", "work", "working",
]);

function asArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (value == null || value === "") return [];
  return [String(value)];
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(value, { removeStopWords = false } = {}) {
  return new Set(normalize(value).split(/\s+/).filter((token) => token && (!removeStopWords || !INTENT_STOP_WORDS.has(token))));
}

function uniqueNormalized(values) {
  return [...new Set(asArray(values).map(normalize).filter(Boolean))];
}

function overlap(left, right) {
  let count = 0;
  for (const token of left) if (right.has(token)) count += 1;
  return count;
}

function metadataValues(skill, field) {
  const value = skill[field];
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return Object.values(value).flatMap((entry) => Array.isArray(entry) ? entry : [entry]);
  return value == null ? [] : [value];
}

function metadataText(skill) {
  const vocabulary = (skill.vocabulary || []).flatMap((entry) => {
    if (typeof entry === "string") return [entry];
    return [entry?.concept, entry?.meaning, entry?.informs];
  });
  const intelligence = skill.creativeIntelligence || {};
  return [
    skill.skillId,
    skill.name,
    skill.shortName,
    skill.description,
    skill.intent,
    ...metadataValues(skill, "intents"),
    skill.category,
    ...(skill.tags || []),
    ...vocabulary,
    ...asArray(intelligence.recommendWhen),
    ...metadataValues(skill, "recommendations"),
  ].filter(Boolean).join(" ");
}

function explicitId(request) {
  return request.explicitSkillId || request.skillId || asArray(request.skillIds || request.explicitSkillIds)[0] || null;
}

function requestedStudios(request) {
  return uniqueNormalized(request.studios || request.studio || request.studioId || request.supportedStudio);
}

function isDiscoverable(skill) {
  return skill?.status === ACTIVE_STATUS && skill?.discoverable !== false;
}

function supportsRequestedStudios(skill, studios) {
  if (!studios.length) return true;
  const supported = uniqueNormalized(skill.supportedStudios);
  return supported.length > 0 && studios.every((studio) => supported.includes(studio));
}

function scoreSkill(skill, request, studios) {
  const reasons = [];
  let score = 0;
  const intent = normalize(request.intent);
  const searchable = normalize(metadataText(skill));

  if (intent) {
    const intentTokens = tokens(intent, { removeStopWords: true });
    const matchedTokens = overlap(intentTokens, tokens(metadataText(skill), { removeStopWords: true }));
    if (matchedTokens) {
      score += Math.min(matchedTokens * 20, 60);
      reasons.push(`intent matches ${matchedTokens} metadata term${matchedTokens === 1 ? "" : "s"}`);
    }
    if (intentTokens.size > 1 && searchable.includes(intent)) {
      score += 20;
      reasons.push("intent matches a metadata phrase");
    }
  }

  const category = normalize(request.category);
  if (category && normalize(skill.category) === category) {
    score += 30;
    reasons.push(`category matches ${request.category}`);
  }

  if (studios.length) {
    score += 25;
    reasons.push(`supports the ${studios.join(" and ")} studio${studios.length === 1 ? "" : "s"}`);
  }

  const requestedTags = uniqueNormalized(request.tags);
  const skillTags = new Set(uniqueNormalized(skill.tags));
  const matchedTags = requestedTags.filter((tag) => skillTags.has(tag));
  if (matchedTags.length) {
    score += Math.min(matchedTags.length * 15, 45);
    reasons.push(`matches tag${matchedTags.length === 1 ? "" : "s"}: ${matchedTags.join(", ")}`);
  }

  const requestedCapabilities = uniqueNormalized(request.capabilities);
  const skillCapabilities = new Set(uniqueNormalized(skill.capabilities));
  const matchedCapabilities = requestedCapabilities.filter((capability) => skillCapabilities.has(capability));
  if (matchedCapabilities.length) {
    const complete = matchedCapabilities.length === requestedCapabilities.length;
    score += matchedCapabilities.length * 20 + (complete ? 40 : 0);
    reasons.push(`${complete ? "fully provides" : "partially provides"} capabilit${matchedCapabilities.length === 1 ? "y" : "ies"}: ${matchedCapabilities.join(", ")}`);
  }

  return { score, reasons };
}

export class SkillResolver {
  constructor({ skills = SKILL_LIBRARY } = {}) {
    assertValidSkillLibrary(skills);
    this.skills = skills;
  }

  getSkill(skillId) {
    return this.skills[skillId] || getSkill(skillId);
  }

  resolve(request = {}, { limit = 5 } = {}) {
    const requested = typeof request === "string" ? { intent: request } : request || {};
    const explicit = explicitId(requested);

    if (explicit) {
      const skill = this.getSkill(explicit);
      return {
        selected: skill,
        matches: [{ skill, score: Number.MAX_SAFE_INTEGER, reasons: ["explicit skill ID requested"] }],
        explicit: true,
      };
    }

    const studios = requestedStudios(requested);
    const matches = Object.values(this.skills)
      .filter(isDiscoverable)
      .filter((skill) => supportsRequestedStudios(skill, studios))
      .map((skill) => {
        const result = scoreSkill(skill, requested, studios);
        return { skill, ...result };
      })
      .filter((match) => match.score > 0)
      .sort((left, right) => right.score - left.score || left.skill.skillId.localeCompare(right.skill.skillId))
      .slice(0, Math.max(0, limit));

    return {
      selected: matches[0]?.skill || null,
      matches,
      explicit: false,
    };
  }

  rank(request = {}, options = {}) {
    return this.resolve(request, options).matches;
  }
}

export const skillResolver = new SkillResolver();

export function resolveSkills(request = {}, options = {}) {
  return skillResolver.resolve(request, options);
}

export function rankSkills(request = {}, options = {}) {
  return skillResolver.rank(request, options);
}
