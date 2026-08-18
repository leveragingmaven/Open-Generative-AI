const VALID_STATUSES = new Set(["draft", "testing", "approved", "active", "deprecated", "archived"]);
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const ARRAY_FIELDS = [
  "tags",
  "supportedStudios",
  "capabilities",
  "compatibleContentTypes",
  "compatibleCampaignTemplates",
  "compatibleRecipes",
];
const REQUIRED_FIELDS = ["skillId", "name", "version", "category", "supportedStudios", "vocabulary", "status"];

function issue(skillId, field, message) {
  return { skillId: skillId || null, field, message };
}

export function validateSkillManifest(skill, { registryKey = null } = {}) {
  const issues = [];
  if (!skill || typeof skill !== "object" || Array.isArray(skill)) {
    return [issue(registryKey, "manifest", "skill manifest must be an object")];
  }

  for (const field of REQUIRED_FIELDS) {
    if (skill[field] === undefined || skill[field] === null || skill[field] === "") {
      issues.push(issue(skill.skillId || registryKey, field, "required field is missing"));
    }
  }
  if (registryKey && skill.skillId !== registryKey) {
    issues.push(issue(skill.skillId || registryKey, "skillId", `must match registry key ${registryKey}`));
  }
  if (skill.skillId !== undefined && (typeof skill.skillId !== "string" || !skill.skillId.trim())) {
    issues.push(issue(skill.skillId, "skillId", "must be a non-empty string"));
  }
  for (const field of ["name", "version", "category", "status"]) {
    if (skill[field] !== undefined && typeof skill[field] !== "string") {
      issues.push(issue(skill.skillId, field, "must be a string"));
    }
  }
  if (skill.version !== undefined && (typeof skill.version !== "string" || !SEMVER.test(skill.version))) {
    issues.push(issue(skill.skillId, "version", "must use semantic version format"));
  }
  if (skill.status !== undefined && !VALID_STATUSES.has(skill.status)) {
    issues.push(issue(skill.skillId, "status", `must be one of ${[...VALID_STATUSES].join(", ")}`));
  }
  if (skill.discoverable !== undefined && typeof skill.discoverable !== "boolean") {
    issues.push(issue(skill.skillId, "discoverable", "must be a boolean when provided"));
  }
  for (const field of ARRAY_FIELDS) {
    if (skill[field] !== undefined && !Array.isArray(skill[field])) {
      issues.push(issue(skill.skillId, field, "must be an array when provided"));
    } else if (Array.isArray(skill[field]) && skill[field].some((value) => typeof value !== "string" || !value.trim())) {
      issues.push(issue(skill.skillId, field, "must contain non-empty strings only"));
    }
  }
  return issues;
}

export function validateSkillLibrary(skills = {}) {
  const issues = [];
  const seenIds = new Map();
  for (const [registryKey, skill] of Object.entries(skills || {})) {
    issues.push(...validateSkillManifest(skill, { registryKey }));
    if (skill?.skillId) {
      const previousKey = seenIds.get(skill.skillId);
      if (previousKey) issues.push(issue(skill.skillId, "skillId", `duplicates registry entry ${previousKey}`));
      seenIds.set(skill.skillId, registryKey);
    }
  }
  return issues;
}

export function assertValidSkillLibrary(skills = {}) {
  const issues = validateSkillLibrary(skills);
  if (issues.length) {
    throw new Error(`Invalid Creative Skill metadata: ${issues.map(({ skillId, field, message }) => `${skillId || "unknown"}.${field}: ${message}`).join("; ")}`);
  }
  return true;
}

export function createSkillLibrary(manifests = []) {
  const library = {};
  for (const skill of manifests) {
    if (skill?.skillId && Object.prototype.hasOwnProperty.call(library, skill.skillId)) {
      throw new Error(`Duplicate Creative Skill ID: ${skill.skillId}`);
    }
    if (skill?.skillId) library[skill.skillId] = skill;
  }
  assertValidSkillLibrary(library);
  return Object.freeze(library);
}

export { VALID_STATUSES };
