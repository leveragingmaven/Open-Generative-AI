/**
 * Structured (array-of-object) inputs for Audio Studio.
 *
 * Some audio models declare an input whose schema type is "array" of OBJECTS,
 * for example Gemini TTS `speakers` and `dialogue_turns`. MuAPI rejects string
 * values for those fields (HTTP 422 "Input should be a valid list"), but Audio
 * Studio's generic schema renderer only ever produced strings.
 *
 * These helpers are framework-free so they can be unit tested directly:
 *   - normalise/validate a structured value against its model schema
 *   - build the payload sent to the provider
 *   - seed and edit individual array entries from the existing schema/examples
 */

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneValue(value) {
  if (value === undefined) return value;
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function fieldTitle(schema, fieldName) {
  return schema?.title || schema?.name || fieldName || "Field";
}

export function itemPropertyTitle(schema, property) {
  return schema?.items?.properties?.[property]?.title || property;
}

/**
 * True only for arrays of OBJECTS. Arrays of plain strings (file URL lists
 * such as `audios_list`) keep their existing rendering untouched.
 */
export function isStructuredInputSchema(schema) {
  return Boolean(schema) && schema.type === "array" && schema.items?.type === "object";
}

/** All structured [fieldName, schema] pairs declared by a model. */
export function getStructuredFields(model) {
  const inputs = model?.inputs;
  if (!isPlainObject(inputs)) return [];
  return Object.entries(inputs).filter(([, schema]) => isStructuredInputSchema(schema));
}

/** Ordered list of usable array values from a schema's `examples`. */
export function listArrayExamples(schema) {
  const examples = schema?.examples;
  if (!Array.isArray(examples)) return [];
  return examples
    .map((example) => {
      if (Array.isArray(example)) return example.filter(isPlainObject);
      if (isPlainObject(example)) return [example];
      return [];
    })
    .filter((example) => example.length > 0)
    .map((example) => example.map(cloneValue));
}

/** Default entries for a structured field, taken from the schema's first example. */
export function buildDefaultItems(schema) {
  const [first] = listArrayExamples(schema);
  if (first) return first;
  return [];
}

/**
 * A single blank-but-valid entry used when adding a row by hand.
 * Seeded from the item schema so required keys always exist.
 */
export function defaultItemFor(schema, index = 0, seed = {}) {
  const properties = schema?.items?.properties || {};
  const item = {};
  for (const [name, property] of Object.entries(properties)) {
    if (seed?.[name] !== undefined && seed[name] !== "") {
      item[name] = cloneValue(seed[name]);
    } else if (name === "speaker_id" && schema?.name === "speakers") {
      item[name] = `Speaker ${index + 1}`;
    } else if (property?.default !== undefined) {
      item[name] = cloneValue(property.default);
    } else {
      item[name] = "";
    }
  }
  return item;
}

/**
 * Coerce a stored value into an array of objects.
 * Values produced by the previous string-based renderer (a bare string) or by
 * stale persistence are replaced with a fresh default entry so the operator can
 * always retry, rather than submitting an invalid payload.
 */
export function normalizeStructuredValue(value, schema) {
  if (Array.isArray(value)) {
    const objects = value.filter(isPlainObject);
    if (objects.length > 0) return objects.map(cloneValue);
  }
  return buildDefaultItems(schema);
}

/** Replace each structured field with a guaranteed array, seeded when empty. */
export function normalizePayloadForModel(model, params) {
  const fields = getStructuredFields(model);
  // Flat-scalar models are returned untouched (same reference).
  if (fields.length === 0) return params;

  const next = { ...params };
  for (const [key, schema] of fields) {
    next[key] = normalizeStructuredValue(next[key], schema);
  }
  return next;
}

/**
 * Validate one structured field.
 * `context.fieldName` identifies the field; `context.speakers` (when the model
 * defines a speaker list) is used to cross-reference `speaker_id`.
 */
export function validateStructuredField(schema, value, context = {}) {
  const title = fieldTitle(schema, context.fieldName);
  const items = Array.isArray(value) ? value : [];
  const properties = schema?.items?.properties || {};
  const required = Array.isArray(schema?.items?.required) && schema.items.required.length > 0
    ? schema.items.required
    : Object.keys(properties);

  if (items.length === 0) {
    return { error: `${title} needs at least one entry.` };
  }

  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    if (!isPlainObject(item)) {
      return { error: `${title} entry ${index + 1} is not a valid entry.` };
    }
    for (const property of required) {
      const raw = item[property];
      if (raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "")) {
        return {
          error: `${title} entry ${index + 1} is missing "${itemPropertyTitle(schema, property)}".`,
        };
      }
    }
    for (const [property, propertySchema] of Object.entries(properties)) {
      const raw = item[property];
      if (raw === undefined || raw === null || raw === "") continue;
      if (Array.isArray(propertySchema?.enum) && !propertySchema.enum.includes(raw)) {
        return {
          error: `${title} entry ${index + 1} has an invalid "${itemPropertyTitle(schema, property)}".`,
        };
      }
    }
  }

  // Speaker IDs must be unique and in the documented "Speaker N" form.
  if (context.fieldName === "speakers" && "speaker_id" in properties) {
    const ids = items.map((item) => item?.speaker_id).filter(Boolean);
    const seen = new Set();
    for (const id of ids) {
      if (seen.has(id)) {
        return { error: `Duplicate speaker IDs (${id}). Each speaker needs a unique ID.` };
      }
      seen.add(id);
    }
    for (const id of ids) {
      if (!/^Speaker\s+\d+$/i.test(String(id))) {
        return {
          error: `${title} ID "${id}" must use the "Speaker N" format (for example "Speaker 1").`,
        };
      }
    }
  }

  // Every dialogue turn must reference a configured speaker.
  const knownSpeakerIds = Array.isArray(context.speakers)
    ? new Set(context.speakers.map((speaker) => speaker?.speaker_id).filter(Boolean))
    : null;
  if (knownSpeakerIds && context.fieldName !== "speakers" && "speaker_id" in properties) {
    for (let index = 0; index < items.length; index++) {
      const speakerId = items[index]?.speaker_id;
      if (speakerId && !knownSpeakerIds.has(speakerId)) {
        return {
          error: `${title} entry ${index + 1} uses unknown speaker "${speakerId}". Configure it under Speakers first.`,
        };
      }
    }
  }

  return { error: null };
}

/** Validate every structured field on a model. Returns `{ error }` (null when valid). */
export function validateModelStructuredInputs(model, params) {
  const fields = getStructuredFields(model);
  if (fields.length === 0) return { error: null };

  const speakers = Array.isArray(params?.speakers) ? params.speakers : null;
  for (const [fieldName, schema] of fields) {
    const { error } = validateStructuredField(schema, params?.[fieldName], { fieldName, speakers });
    if (error) return { error };
  }
  return { error: null };
}

/** Label for one row of a structured field, e.g. "Speaker 1" / "Dialogue Turns 2". */
export function structuredItemLabel(schema, index) {
  const title = fieldTitle(schema, schema?.name);
  if (/s$/i.test(title)) return `${title.slice(0, -1)} ${index + 1}`;
  return `${title} ${index + 1}`;
}
