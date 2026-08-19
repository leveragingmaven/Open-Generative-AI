import { compileContext } from "./ContextCompiler.js";
import { projectConversation } from "./ConversationHistoryPolicy.js";

function isSensitiveKey(key) {
  const normalized = String(key).replaceAll("_", "").toLowerCase();
  return normalized.includes("apikey")
    || normalized.includes("authorization")
    || normalized.includes("credential")
    || normalized.includes("password")
    || normalized.includes("secret")
    || normalized.includes("token");
}

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, clone(entry)]));
  }
  return value;
}

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !isSensitiveKey(key))
      .map(([key, entry]) => [key, sanitize(entry)])
  );
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

function selectedAgent(input = {}) {
  return input.agent
    || input.selectedAgent
    || input.task?.agent
    || input.taskContext?.agent
    || null;
}

function specialistInstructions(input = {}) {
  const agent = selectedAgent(input);
  return agent?.systemPrompt
    || agent?.prompt
    || input.task?.specialistInstructions
    || input.specialistInstructions
    || null;
}

function selectedReference(value) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return null;
  if (typeof value.id === "string") return value.id;
  if (typeof value.assetId === "string") return value.assetId;
  if (typeof value.referenceId === "string") return value.referenceId;
  if (typeof value.url === "string") return value.url;
  return null;
}

function selectedReferences(input = {}) {
  const references = firstDefined(
    input.references,
    input.input?.references,
    input.request?.references,
    input.currentRequest?.references
  );
  if (!Array.isArray(references)) return [];
  return references.map(selectedReference).filter(Boolean);
}

function untrustedSourceMaterial(input = {}) {
  const source = firstDefined(
    input.sourceMaterial,
    input.untrustedSourceMaterial,
    input.request?.sourceMaterial,
    input.request?.untrustedSourceMaterial,
    input.request?.inputs?.sourceMaterial,
  );
  if (source == null) return null;
  return { trust: "untrusted", data: sanitize(source) };
}

function currentPrompt(input = {}) {
  const currentRequest = input.currentRequest;
  return String(firstDefined(
    input.prompt,
    input.input?.prompt,
    typeof currentRequest === "string" ? currentRequest : currentRequest?.content,
    input.request?.inputs?.prompt,
    input.task?.userRequest,
    input.request?.intent,
    ""
  ) || "");
}

function currentRequestForHistory(input, prompt, references) {
  if (input.currentRequest && typeof input.currentRequest === "object") {
    const currentRequest = sanitize(input.currentRequest);
    const safeRequest = { role: "user", content: prompt };
    for (const key of ["id", "timestamp", "attachments", "images"]) {
      if (currentRequest[key] !== undefined) safeRequest[key] = clone(currentRequest[key]);
    }
    if (references.length) safeRequest.references = references;
    return safeRequest;
  }
  return {
    role: "user",
    content: prompt,
    ...(references.length ? { references } : {}),
  };
}

function modelOutput(input = {}) {
  const output = firstDefined(input.output, input.request?.output, {});
  return sanitize(output && typeof output === "object" ? output : {});
}

function modelGeneration(input = {}) {
  const requestInputs = input.request?.inputs || {};
  const recipe = input.selectedRecipe || input.recipe || input.task?.selectedRecipe || input.task?.recipe;
  const model = firstDefined(input.model, input.generation?.model, input.input?.model, requestInputs.model, typeof recipe?.model === "string" ? recipe.model : null);
  const operation = firstDefined(input.operation, input.generation?.operation, input.request?.operation, input.request?.metadata?.operation, null);

  return {
    model: model == null ? null : String(model),
    operation: operation == null ? null : String(operation),
    output: modelOutput(input),
  };
}

function compileInput(input = {}, memoryProjection) {
  const agent = selectedAgent(input);
  const skill = input.selectedSkill || input.skill || input.task?.selectedSkill || input.task?.skill;
  const recipe = input.selectedRecipe || input.recipe || input.task?.selectedRecipe || input.task?.recipe;
  const workflow = input.selectedWorkflow || input.workflow || input.task?.selectedWorkflow || input.task?.workflow;

  return {
    ...input,
    request: input.request || {
      intent: input.intent || currentPrompt(input),
      inputs: input.input || {},
    },
    selectedAgent: agent,
    selectedSkill: skill,
    selectedRecipe: recipe,
    selectedWorkflow: workflow,
    memoryProjection,
  };
}

function withoutSpecialistInstructions(taskContext) {
  if (!taskContext || typeof taskContext !== "object") return {};
  const result = clone(taskContext);
  delete result.specialistInstructions;
  return result;
}

function isConversational(input = {}) {
  return input.conversational === true
    || input.request?.conversational === true
    || input.request?.metadata?.conversational === true;
}

/**
 * Assemble the provider-neutral model request without executing it.
 * Compiler metadata and diagnostics remain outside the model-facing object.
 */
export function assembleModelRequest(input = {}) {
  const memoryProjection = input.memoryProjection || input.request?.memoryProjection || null;
  const compiled = compileContext(compileInput(input, memoryProjection));
  const prompt = currentPrompt(input);
  const references = selectedReferences(input);
  const sourceMaterial = untrustedSourceMaterial(input);
  const current = currentRequestForHistory(input, prompt, references);
  const conversation = isConversational(input)
    ? projectConversation({
        messages: input.messages || input.conversation?.messages || [],
        currentRequest: current,
        maxInputCharacters: input.maxInputCharacters,
        reservedOutputCharacters: input.reservedOutputCharacters,
        requiredContextCharacters: input.requiredContextCharacters,
      })
    : null;

  const modelRequest = {
    instructions: specialistInstructions(input),
    identityContext: clone(compiled.identityContext),
    projectContext: clone(compiled.projectContext),
    taskContext: withoutSpecialistInstructions(compiled.taskContext),
    conversation: conversation ? conversation.messages : null,
    input: {
      prompt,
      references,
      ...(sourceMaterial ? { sourceMaterial } : {}),
    },
    generation: modelGeneration(input),
  };

  return {
    modelRequest,
    diagnostics: {
      contextMetadata: clone(compiled.metadata),
      conversationMetadata: conversation?.metadata || null,
    },
  };
}
