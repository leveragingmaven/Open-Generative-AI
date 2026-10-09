/**
 * Custom (cloned) voice IDs for the audio catalog.
 *
 * Several catalog entries declare `typing: true` next to an `enum`. That flag is
 * the catalog's own affordance for a value the operator supplies — a voice the
 * creator cloned with MiniMax Voice Clone — while the `enum` still lists the
 * provider's system voices. Audio Studio used to render every `enum` as a closed
 * dropdown and the Maven audio router rejected any ID outside the enum, so a
 * cloned voice could be created but never reused.
 *
 * This module is framework-free so the UI, the router, and their tests share one
 * contract for what counts as a usable cloned voice ID.
 */

export const CUSTOM_VOICE_ID_MIN_LENGTH = 8;
export const CUSTOM_VOICE_ID_MAX_LENGTH = 64;

// Letters, numbers, hyphens and underscores, starting with a letter. This is the
// shape the provider accepts for a voice ID; it is deliberately looser than the
// rule for creating a new clone (see `newCloneIdError`) because an ID created
// earlier may not carry a number.
const CUSTOM_VOICE_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{7,63}$/;

/** The provider's documented rule for a NEW clone ID, used by the clone form. */
export const NEW_CLONE_ID_RULE =
  'Minimum 8 characters, start with a letter, and include both letters and numbers.';

/** An `enum` field that also invites an operator-supplied value. */
export function isTypedEnumField(schema) {
  return Boolean(schema) && schema.typing === true && Array.isArray(schema.enum);
}

/** The string values listed by an enum, whether written plainly or as objects. */
export function enumValues(schema) {
  if (!Array.isArray(schema?.enum)) return [];
  return schema.enum
    .map((item) => (item && typeof item === 'object' ? item.value : item))
    .filter((value) => typeof value === 'string' && value.trim() !== '');
}

/** True when the value is shaped like a voice ID the provider will accept. */
export function isValidCustomVoiceId(value) {
  if (typeof value !== 'string') return false;
  return CUSTOM_VOICE_ID_PATTERN.test(value.trim());
}

/** Why a reused (already cloned) voice ID is unusable, or null when it is fine. */
export function customVoiceIdError(value) {
  const id = typeof value === 'string' ? value.trim() : '';
  if (!id) return 'Enter the voice ID of a voice you have cloned.';
  if (id.length < CUSTOM_VOICE_ID_MIN_LENGTH) {
    return `A voice ID needs at least ${CUSTOM_VOICE_ID_MIN_LENGTH} characters.`;
  }
  if (id.length > CUSTOM_VOICE_ID_MAX_LENGTH) {
    return `A voice ID can be at most ${CUSTOM_VOICE_ID_MAX_LENGTH} characters.`;
  }
  if (!/^[A-Za-z]/.test(id)) return 'A voice ID must start with a letter.';
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    return 'A voice ID may only contain letters, numbers, hyphens, and underscores.';
  }
  return null;
}

/** Why a NEW clone ID is unusable, or null when it satisfies the provider rule. */
export function newCloneIdError(value) {
  const id = typeof value === 'string' ? value.trim() : '';
  const basic = customVoiceIdError(id);
  if (basic) return basic;
  if (!/[0-9]/.test(id)) {
    return `A new voice ID must include at least one number. ${NEW_CLONE_ID_RULE}`;
  }
  return null;
}

/**
 * True when the current value of a typed enum field is not one of its listed
 * system voices — i.e. the operator is pointing at a voice they cloned. The
 * value is not yet known to be well formed; `customVoiceIdError` decides that.
 */
export function isCustomVoiceSelection(schema, value) {
  if (!isTypedEnumField(schema)) return false;
  const id = typeof value === 'string' ? value.trim() : '';
  if (!id) return false;
  return !enumValues(schema).includes(id);
}

function cloneIdFieldNames(model) {
  return Object.keys(model?.inputs || {}).filter((key) => /^custom_voice_id$/.test(key));
}

/**
 * The first unusable voice value on a model, or null.
 *
 * Covers both directions the studio supports:
 *   - a typed `voice_id` set to something outside the system list (reuse), and
 *   - a `custom_voice_id` on a clone model (creation), which the provider
 *     rejects unless it follows its documented rule.
 *
 * Checking here keeps a malformed ID from spending a paid provider call.
 */
export function invalidCustomVoiceField(model, values = {}) {
  for (const [key, schema] of Object.entries(model?.inputs || {})) {
    if (isTypedEnumField(schema)) {
      const value = values[key];
      if (typeof value !== 'string' || !value.trim()) continue;
      if (enumValues(schema).includes(value.trim())) continue;
      const error = customVoiceIdError(value);
      if (error) return { key, title: schema.title || key, error };
      continue;
    }
    if (cloneIdFieldNames(model).includes(key)) {
      const value = values[key];
      if (typeof value !== 'string' || !value.trim()) continue;
      const error = newCloneIdError(value);
      if (error) return { key, title: schema.title || key, error };
    }
  }
  return null;
}
