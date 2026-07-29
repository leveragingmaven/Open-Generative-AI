import { LAUNCH_CONTEXT_PARAMS } from "./integrationTypes.js";

const SAFE_ID = /^[A-Za-z0-9._:-]{1,160}$/;
const SAFE_SLUG = /^[A-Za-z0-9._:-]{1,80}$/;

function firstParam(params, names) {
  for (const name of names) {
    const value = params.get(name);
    if (value) return value.trim();
  }
  return "";
}

function safeId(value) {
  if (!value) return null;
  return SAFE_ID.test(value) ? value : null;
}

function safeSlug(value) {
  if (!value) return null;
  return SAFE_SLUG.test(value) ? value : null;
}

export function parseAllowedReturnOrigins(value = "") {
  return String(value)
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function isAllowedReturnTarget(returnTarget, allowedOrigins = []) {
  if (!returnTarget) return true;
  try {
    const target = new URL(returnTarget);
    return allowedOrigins.includes(target.origin);
  } catch {
    return false;
  }
}

export function normalizeLaunchContext(input = {}) {
  const launchId = safeId(input.launchId);
  const context = {
    launchId,
    projectId: safeId(input.projectId),
    campaignId: safeId(input.campaignId),
    contentPlanId: safeId(input.contentPlanId),
    knowledgeSelectionId: safeId(input.knowledgeSelectionId),
    returnTarget: input.returnTarget || null,
    requestedStudio: safeSlug(input.requestedStudio),
    requestedAction: safeSlug(input.requestedAction),
    source: input.source || (launchId ? "url" : "none"),
  };

  const hasContext = Object.entries(context).some(([key, value]) => key !== "source" && Boolean(value));
  return hasContext ? context : null;
}

export function parseLaunchContextFromUrl(url, options = {}) {
  const parsedUrl = typeof url === "string" ? new URL(url, "http://localhost") : url;
  const params = parsedUrl.searchParams;
  const context = normalizeLaunchContext({
    launchId: firstParam(params, ["launchId", "launch_id", "creativeLaunchId"]),
    projectId: firstParam(params, ["projectId"]),
    campaignId: firstParam(params, ["campaignId"]),
    contentPlanId: firstParam(params, ["contentPlanId"]),
    knowledgeSelectionId: firstParam(params, ["knowledgeSelectionId"]),
    returnTarget: firstParam(params, ["returnTarget"]),
    requestedStudio: firstParam(params, ["requestedStudio"]),
    requestedAction: firstParam(params, ["requestedAction"]),
    source: "url",
  });

  if (!context) return null;
  if (!isAllowedReturnTarget(context.returnTarget, options.allowedReturnOrigins || [])) {
    return null;
  }
  return context;
}

export function removeLaunchParamsFromUrl(locationObj, historyObj) {
  if (!locationObj || !historyObj?.replaceState) return;
  const url = new URL(locationObj.href);
  let changed = false;
  LAUNCH_CONTEXT_PARAMS.forEach((param) => {
    if (url.searchParams.has(param)) {
      url.searchParams.delete(param);
      changed = true;
    }
  });
  if (changed) {
    historyObj.replaceState(historyObj.state, "", `${url.pathname}${url.search}${url.hash}`);
  }
}
