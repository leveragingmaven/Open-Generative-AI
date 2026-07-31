export const MEMORY_TYPES = Object.freeze({
  BRAND: "brand",
  VOICE: "voice",
  AUDIENCE: "audience",
  OFFER: "offer",
  PRODUCT: "product",
  VISUAL: "visual",
  CHARACTER: "character",
  CAMPAIGN: "campaign",
  PLATFORM: "platform",
  WRITING: "writing",
  APPROVED_CLAIMS: "approved_claims",
});

export const MEMORY_SCOPES = Object.freeze({
  ORGANIZATION: "organization",
  WORKSPACE: "workspace",
  PROJECT: "project",
  CAMPAIGN: "campaign",
  USER: "user",
});

export const MEMORY_STATUSES = Object.freeze({
  ACTIVE: "active",
  SUPERSEDED: "superseded",
  ARCHIVED: "archived",
});

export function isMemoryType(value) {
  return Object.values(MEMORY_TYPES).includes(value);
}

export function isMemoryScope(value) {
  return Object.values(MEMORY_SCOPES).includes(value);
}
