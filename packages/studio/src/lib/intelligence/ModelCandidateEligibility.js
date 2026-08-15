import { createCapabilityRequirement } from "./CapabilityTypes.js";

const SUPPORTED_FEATURE_STATES = new Set(["enabled", "beta", "internal", "experimental"]);

function normalizeRequirements(requirements = []) {
  return requirements
    .map((requirement) => createCapabilityRequirement(
      typeof requirement === "string" ? { id: requirement } : requirement,
    ))
    .filter((requirement) => requirement.kind === "required");
}

function numericValue(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function resolutionMatches(candidateResolution, requestedResolution) {
  if (requestedResolution === undefined || requestedResolution === null) return true;
  if (!candidateResolution || typeof candidateResolution !== "object") return false;

  if (Array.isArray(candidateResolution.values)) {
    return candidateResolution.values.includes(requestedResolution);
  }

  if (typeof requestedResolution === "object") {
    const requestedWidth = numericValue(requestedResolution.width);
    const requestedHeight = numericValue(requestedResolution.height);
    const maxWidth = numericValue(candidateResolution.maxWidth);
    const maxHeight = numericValue(candidateResolution.maxHeight);
    if (requestedWidth !== null && requestedHeight !== null && maxWidth !== null && maxHeight !== null) {
      return requestedWidth <= maxWidth && requestedHeight <= maxHeight;
    }
  }

  return false;
}

function requiredSeconds(duration) {
  if (numericValue(duration) !== null) return duration;
  if (!duration || typeof duration !== "object") return null;
  return numericValue(duration.seconds)
    ?? numericValue(duration.requiredSeconds)
    ?? numericValue(duration.maxSeconds);
}

function durationMatches(candidateDuration, requestedDuration) {
  if (requestedDuration === undefined || requestedDuration === null) return true;
  const requestedSeconds = requiredSeconds(requestedDuration);
  if (requestedSeconds === null || !candidateDuration || typeof candidateDuration !== "object") return false;
  const candidateMax = numericValue(candidateDuration.maxSeconds)
    ?? numericValue(candidateDuration.max)
    ?? numericValue(candidateDuration.seconds);
  return candidateMax !== null && candidateMax >= requestedSeconds;
}

function requiredReferences(referenceCount) {
  if (numericValue(referenceCount) !== null) return referenceCount;
  if (!referenceCount || typeof referenceCount !== "object") return null;
  return numericValue(referenceCount.count)
    ?? numericValue(referenceCount.required)
    ?? numericValue(referenceCount.max);
}

function referenceCountMatches(candidateLimits, requestedCount) {
  if (requestedCount === undefined || requestedCount === null) return true;
  const requiredCount = requiredReferences(requestedCount);
  if (requiredCount === null || !candidateLimits || typeof candidateLimits !== "object") return false;
  const candidateMax = numericValue(candidateLimits.max)
    ?? numericValue(candidateLimits.maxImages)
    ?? numericValue(candidateLimits.maxReferences);
  return candidateMax !== null && candidateMax >= requiredCount;
}

function qualityFloorMatches(candidate, requirement) {
  if (requirement.qualityFloor === undefined || requirement.qualityFloor === null) return true;

  const quality = candidate.quality;
  const verified = quality?.verification?.status === "verified"
    || candidate.verification?.quality?.status === "verified";
  if (!verified) return true;

  const score = numericValue(quality?.score)
    ?? numericValue(quality?.[requirement.qualityIntent])
    ?? numericValue(candidate.verification?.quality?.score);
  return score === null || score >= requirement.qualityFloor;
}

function matchesRequirement(candidate, requirement) {
  if (!requirement.id || !Array.isArray(candidate.capabilities) || !candidate.capabilities.includes(requirement.id)) return false;
  if (requirement.operation !== undefined && candidate.operation !== requirement.operation) return false;
  if (requirement.modality !== undefined && candidate.modality !== requirement.modality) return false;
  if (!resolutionMatches(candidate.resolution, requirement.targetResolution)) return false;
  if (!durationMatches(candidate.duration, requirement.duration)) return false;
  if (!referenceCountMatches(candidate.referenceLimits, requirement.referenceCount)) return false;
  return qualityFloorMatches(candidate, requirement);
}

/**
 * Filters concrete catalog records before future ranking. The supplied
 * candidates are expected to already belong to the matched deployment/family;
 * this function does not select or rank deployments.
 */
export function getEligibleModelCandidates(candidates = [], requirements = []) {
  const required = normalizeRequirements(requirements);
  return candidates.filter((candidate) => {
    if (!candidate || candidate.availability === "unavailable" || candidate.health === "unhealthy") return false;
    if (candidate.featureState && !SUPPORTED_FEATURE_STATES.has(candidate.featureState)) return false;
    return required.every((requirement) => matchesRequirement(candidate, requirement));
  });
}

export { matchesRequirement };
