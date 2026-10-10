/**
 * Script input for Audio Studio's text-driven models.
 *
 * A voiceover is written, not prompted, so the text field should read as a
 * script and say how much of it the chosen model will accept. The catalog
 * already states its own limits in prose — "Maximum 10000 characters." (MiniMax
 * speech), "Limited to 2000 characters." (the clone's preview line) and "sounds
 * task type supports up to 500 characters." (Suno sounds).
 *
 * Nothing is invented here: the limit is read out of the model's own
 * description, an explicit `maxLength` on the schema wins if one is ever added,
 * and a model that declares no limit is counted but never capped.
 *
 * Framework-free so the field and its tests share one contract.
 */
import { AUDIO_MODEL_KINDS, modelKind } from "./audioModes.js";

/** Only the phrasings the catalog actually uses are recognised. */
const DECLARED_LIMIT_PATTERNS = [
  /maximum\s+([\d,]+)\s+characters/i,
  /limited to\s+([\d,]+)\s+characters/i,
  /supports up to\s+([\d,]+)\s+characters/i,
];

/** The prose warning length used for the live counter's "running out" state. */
export const SCRIPT_NEAR_LIMIT_RATIO = 0.9;

function parsePositiveInteger(raw) {
  const value = Number(String(raw).replace(/,/g, ""));
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : null;
}

/** Characters counted as a creator reads them: one per code point, not per unit. */
export function scriptCharacterCount(text) {
  if (typeof text !== "string") return 0;
  return [...text].length;
}

/**
 * The limit the model declares for its text input, or null when it declares
 * none. An explicit schema `maxLength` takes precedence over the prose.
 */
export function declaredScriptLimit(model) {
  const schema = model?.inputs?.prompt;
  if (!schema) return null;
  const explicit = parsePositiveInteger(schema.maxLength) ?? parsePositiveInteger(schema.max_length);
  if (explicit) return explicit;
  const description = typeof schema.description === "string" ? schema.description : "";
  for (const pattern of DECLARED_LIMIT_PATTERNS) {
    const match = pattern.exec(description);
    if (match) {
      const declared = parsePositiveInteger(match[1]);
      if (declared) return declared;
    }
  }
  return null;
}

/** True for the models whose text input is written to be performed. */
export function isSpokenTextModel(model) {
  const kind = modelKind(model?.id);
  return kind === AUDIO_MODEL_KINDS.TTS || kind === AUDIO_MODEL_KINDS.DIALOGUE;
}

/**
 * What to call the field. Speech and dialogue models are written for, so they
 * get "Script"; everything else keeps the catalog's own wording.
 */
export function scriptFieldLabel(model, schema = model?.inputs?.prompt) {
  if (isSpokenTextModel(model)) return "Script";
  return schema?.title || "Prompt";
}

/** An example line for the field, aimed at the work the model does. */
export function scriptFieldPlaceholder(model, schema = model?.inputs?.prompt) {
  if (modelKind(model?.id) === AUDIO_MODEL_KINDS.TTS) {
    return "Type or paste the words you want spoken…";
  }
  if (modelKind(model?.id) === AUDIO_MODEL_KINDS.DIALOGUE) {
    return "Write the line each speaker says in the turns below.";
  }
  return schema?.description || "Describe what you want generated…";
}

/**
 * The live state of the field: how much has been written, how much room is left,
 * and what to say about it. `message` is null while there is nothing to say.
 */
export function scriptLengthState({ text, limit } = {}) {
  const count = scriptCharacterCount(text);
  if (!limit) return { count, limit: null, remaining: null, overLimit: false, nearLimit: false, message: null };

  const remaining = limit - count;
  const overLimit = remaining < 0;
  const nearLimit = !overLimit && count >= limit * SCRIPT_NEAR_LIMIT_RATIO;
  let message = null;
  if (overLimit) {
    const overflow = Math.abs(remaining);
    message = `Too long by ${overflow} character${overflow === 1 ? "" : "s"} — this model accepts up to ${limit}.`;
  } else if (nearLimit) {
    message = `${remaining} character${remaining === 1 ? "" : "s"} left.`;
  }
  return { count, limit, remaining, overLimit, nearLimit, message };
}

/**
 * The gate that runs before a provider call: a script past the model's own
 * declared limit is refused here, with the same `{ key, title, error }` shape the
 * cloned-voice gate uses. Returns null when there is nothing to refuse.
 */
export function invalidScriptField(model, values = {}) {
  const limit = declaredScriptLimit(model);
  if (!limit) return null;
  const value = values?.prompt;
  if (typeof value !== "string") return null;
  const count = scriptCharacterCount(value);
  if (count <= limit) return null;
  return {
    key: "prompt",
    title: scriptFieldLabel(model, model.inputs?.prompt),
    error: `This script is ${count} characters, but this model accepts up to ${limit}.`,
  };
}
