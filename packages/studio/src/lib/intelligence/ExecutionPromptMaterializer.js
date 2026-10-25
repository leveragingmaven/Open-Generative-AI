import { buildCreativePromptInstructions } from "../creative-brief/index.js";
import { assembleModelRequest } from "./ModelRequestAssembler.js";

const SEMANTIC_FIELDS = Object.freeze([
  ["deliverable", "Deliverable"],
  ["subject", "Subject"],
  ["audience", "Audience"],
  ["offer", "Offer"],
  ["requestedOutcome", "Requested outcome"],
  ["requestedChanges", "Requested changes"],
  ["constraints", "Constraints"],
  ["aspectRatio", "Aspect ratio"],
  ["durationSeconds", "Duration"],
  ["format", "Format"],
  ["platform", "Platform"],
]);

const UNSAFE_INPUT_KEYS = new Set([
  "account", "accountid", "apikey", "attachment", "attachments", "attachmenturl",
  "authorization", "authorizationproof", "credential", "credentials", "creator", "creatorid",
  "deployment", "deploymentid", "funding", "identity", "identitykey", "imageurl", "imageslist",
  "job", "jobid", "jobstate", "jobstatus", "model", "provider", "providerid", "providermodel",
  "reference", "references", "referenceurl", "route", "routing", "secret", "token", "url",
  "attempt", "attemptid", "attemptstate", "attemptstatus",
]);

const UNSAFE_KEY_FRAGMENTS = Object.freeze([
  "account", "apikey", "attachment", "authorization", "credential", "creator", "deployment",
  "funding", "identity", "imageurl", "imageslist", "jobstate", "jobstatus", "model", "password",
  "provider", "referenceurl", "routing", "secret", "token",
]);

function normalizedKey(value) {
  return String(value || "").replaceAll("_", "").replaceAll("-", "").toLowerCase();
}

function unsafeInputKey(key) {
  const normalized = normalizedKey(key);
  return UNSAFE_INPUT_KEYS.has(normalized)
    || UNSAFE_KEY_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

function safeClone(value) {
  if (Array.isArray(value)) return value.map(safeClone);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !unsafeInputKey(key))
      .map(([key, entry]) => [key, safeClone(entry)]),
  );
}

function meaningfulText(value) {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized || null;
}

function trustedKnowledgePackSummary(request) {
  const pack = request?.metadata?.knowledgePack;
  if (pack?.trustedBy !== "maven-harness-service") return null;
  return meaningfulText(pack.summary)?.slice(0, 6000) || null;
}

// Deterministic section order for generation context. Brand DNA and Voice are
// always selected first; the rest follow the order below. A section that does
// not fit the remaining budget is omitted whole and reported, never cut mid-text.
const STRUCTURED_SECTION_ORDER = Object.freeze([
  "brandDna", "voiceFoundation", "audience", "authority", "offer", "currentOffer", "frameworks", "ipLibrary",
]);

function trustedStructuredKnowledgePack(request) {
  const pack = request?.metadata?.knowledgePack;
  if (pack?.trustedBy !== "maven-harness-service") return null;
  const structured = pack.structured;
  return structured && typeof structured === "object" && structured.schema === "creator-knowledge-pack-context.v1" ? structured : null;
}

function structuredSections(structured) {
  const blueprint = structured.authorityBlueprint?.content || "";
  const section = (heading) => {
    const lines = blueprint.split("\n");
    const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
    if (start < 0) return null;
    const rest = lines.slice(start + 1);
    const next = rest.findIndex((line) => line.startsWith("## "));
    return (next < 0 ? rest : rest.slice(0, next)).join("\n").trim() || null;
  };
  const entries = (items) => items.map((item) => [item.title, item.summary].filter(Boolean).join(": ")).join("; ");
  const sections = {
    brandDna: section("Brand DNA") ? `Brand DNA: ${section("Brand DNA")}` : null,
    voiceFoundation: section("Voice Foundation") ? `Voice: ${section("Voice Foundation")}` : null,
    audience: structured.audience ? `Audience: ${structured.audience}` : null,
    authority: structured.authority ? `Authority: ${structured.authority}` : null,
    offer: structured.offerClarity ? `Offer clarity: ${structured.offerClarity}` : null,
    currentOffer: structured.currentOffer?.content ? `Current offer${structured.currentOffer.title ? ` (${structured.currentOffer.title})` : ""}: ${structured.currentOffer.content}` : null,
    frameworks: structured.frameworks?.length ? `Frameworks: ${entries(structured.frameworks)}` : null,
    ipLibrary: structured.ipLibrary?.length ? `IP: ${entries(structured.ipLibrary)}` : null,
  };
  return sections;
}

/**
 * Build provider-bound business context from the structured pack under a
 * character budget. Returns the selected text, the sections selected, and the
 * sections omitted for budget. Approved source is never mutated.
 */
export function selectStructuredKnowledgeContext(structured, budget) {
  const sections = structuredSections(structured);
  const selected = [];
  const omitted = [];
  let used = 0;
  for (const key of STRUCTURED_SECTION_ORDER) {
    const text = sections[key];
    if (!text) continue;
    const cost = text.length + (selected.length ? 1 : 0);
    if (used + cost > budget) {
      omitted.push(key);
      continue;
    }
    selected.push(key);
    used += cost;
  }
  const text = selected.map((key) => sections[key]).join("\n");
  return { text, selected, omitted };
}

function sentence(value) {
  const text = meaningfulText(value);
  if (!text) return null;
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function values(value) {
  return (Array.isArray(value) ? value : [value])
    .map((entry) => typeof entry === "number" && Number.isFinite(entry) ? String(entry) : meaningfulText(entry))
    .filter(Boolean);
}

function alreadyRepresented(parts, value) {
  const needle = meaningfulText(value)?.toLowerCase();
  if (!needle) return true;
  return parts.join(" ").toLowerCase().includes(needle);
}

function referenceRoles({ references, originalRequest }) {
  return [...new Set([
    ...(Array.isArray(originalRequest?.referenceRoles) ? originalRequest.referenceRoles : []),
    ...(Array.isArray(references) ? references : []),
  ].map((reference) => meaningfulText(reference?.role)).filter(Boolean))];
}

function referenceInstructions({ parts, roles, references, intent }) {
  if (!Array.isArray(references) || references.length === 0) return [];
  const instructions = [];
  const intentEstablishesReference = /\b(reference|avatar|uploaded|supplied|source (?:image|photo)|my (?:image|photo|portrait))\b/i.test(intent || "");
  if (roles.includes("character_reference")) {
    if (!alreadyRepresented(parts, "supplied reference")) instructions.push("Use the supplied character reference.");
    if (!/\b(preserve|recognizable identity|consistent identity)\b/i.test(parts.join(" "))) {
      instructions.push("Preserve the subject's recognizable identity.");
    }
  } else if (roles.length > 0 || intentEstablishesReference) {
    if (!alreadyRepresented(parts, "supplied reference")) instructions.push("Use the supplied reference.");
  }
  return instructions;
}

function materializedPrompt({ plan, request, inputs, references }) {
  const intent = meaningfulText(request?.userIntent)
    || meaningfulText(plan?.request?.userIntent)
    || meaningfulText(plan?.request?.intent);
  const parts = [];
  const semanticFields = [];
  if (intent) parts.push(sentence(intent));

  for (const [key, label] of SEMANTIC_FIELDS) {
    const entries = values(inputs?.[key]);
    if (!entries.length || entries.every((entry) => alreadyRepresented(parts, entry))) continue;
    const rendered = key === "durationSeconds"
      ? `${label}: ${entries.join("; ")} seconds.`
      : `${label}: ${entries.join("; ")}.`;
    parts.push(rendered);
    semanticFields.push(key);
  }

  const roles = referenceRoles({ references, originalRequest: request });
  parts.push(...referenceInstructions({ parts, roles, references, intent }));

  const creativeGuidance = buildCreativePromptInstructions(plan?.creativeSkills);
  if (creativeGuidance && !alreadyRepresented(parts, creativeGuidance)) parts.push(sentence(creativeGuidance));

  return {
    prompt: meaningfulText(parts.join(" ")),
    semanticFields,
    referenceRoles: roles,
    usedCreativeGuidance: Boolean(creativeGuidance),
  };
}

export class ExecutionPromptMaterializationError extends Error {
  constructor(code = "execution_prompt_required") {
    super("A meaningful creative execution instruction is required.");
    this.code = code;
  }
}

/**
 * Materialize provider-neutral execution inputs from an already-authorized plan.
 * The approved request and its reference records are read-only inputs.
 */
export function materializeExecutionInputs({ plan = {}, request = {}, inputs = {}, references = [], maxPromptCharacters = Infinity } = {}) {
  const safeInputs = safeClone(inputs && typeof inputs === "object" ? inputs : {});
  const existingPrompt = typeof safeInputs.prompt === "string" && safeInputs.prompt.trim()
    ? safeInputs.prompt
    : null;
  const composed = existingPrompt
    ? { prompt: existingPrompt, semanticFields: [], referenceRoles: referenceRoles({ references, originalRequest: request }), usedCreativeGuidance: false }
    : materializedPrompt({ plan, request, inputs: safeInputs, references });

  // Preserve the creative instruction; optional background gets only the
  // remaining provider budget. Never silently cut the user's instruction.
  const limit = Number.isFinite(maxPromptCharacters) && maxPromptCharacters > 0 ? Math.floor(maxPromptCharacters) : Infinity;
  if (composed.prompt?.length > limit) throw new ExecutionPromptMaterializationError("execution_prompt_too_long");
  const contextPrefix = " Business context (trusted): ";
  const contextBudget = Math.max(0, limit - (composed.prompt?.length || 0) - contextPrefix.length);
  const structured = trustedStructuredKnowledgePack(request);
  const structuredContext = structured ? selectStructuredKnowledgeContext(structured, contextBudget) : null;
  // Brand DNA and Voice are essential approved foundations. Never generate
  // without them: if budget cannot hold them, fail with an actionable code.
  if (structuredContext?.omitted.some((key) => key === "brandDna" || key === "voiceFoundation")) {
    throw new ExecutionPromptMaterializationError("essential_foundation_omitted");
  }
  const knowledgePackSummary = structuredContext
    ? (structuredContext.text || null)
    : trustedKnowledgePackSummary(request)?.slice(0, contextBudget) || null;
  const knowledgeContextDiagnostic = structuredContext
    ? { selectedSections: structuredContext.selected, omittedSections: structuredContext.omitted, missingSections: structured.missing || [] }
    : null;
  const providerPrompt = composed.prompt && knowledgePackSummary
    ? `${composed.prompt}${contextPrefix}${knowledgePackSummary}`
    : composed.prompt;

  if (!providerPrompt) throw new ExecutionPromptMaterializationError();

  const { modelRequest } = assembleModelRequest({
    request: { ...plan.request, inputs: { ...safeInputs, prompt: providerPrompt } },
    prompt: providerPrompt,
    references,
    selectedRecipe: plan.recipe || null,
    operation: plan.request?.operation || request.operation || null,
  });

  return {
    inputs: { ...safeInputs, prompt: modelRequest.input.prompt },
    metadata: {
      source: existingPrompt ? "existing-input-prompt" : "authorized-plan-materialization",
      semanticFields: composed.semanticFields,
      referenceRoles: composed.referenceRoles,
      usedCreativeGuidance: composed.usedCreativeGuidance,
      usedTrustedKnowledgePack: Boolean(knowledgePackSummary),
      ...(knowledgeContextDiagnostic ? { knowledgeContext: knowledgeContextDiagnostic } : {}),
    },
  };
}
