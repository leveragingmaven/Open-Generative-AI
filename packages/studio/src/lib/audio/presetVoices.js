/**
 * Preset voice library for Audio Studio.
 *
 * The MiniMax speech models declare `voice_id` as a 472-value enum with
 * `typing: true`. Audio Studio rendered that as one unsearchable scroll box of
 * raw provider identifiers, so finding "a warm American narrator" meant reading
 * 472 strings.
 *
 * These helpers turn the catalog's own values into something a creator can use:
 * a friendly label, a group, and a search index — while the value written back
 * to the model stays byte-for-byte the catalog ID.
 *
 * What is and is not derived here:
 *   - The *label* is read from the ID itself (words, separated and title-cased).
 *   - The *group* is the ID's own leading token, but only when that token is a
 *     known language name. A language is never guessed from anything else.
 *   - Gender, accent, timbre, age and quality are **not** inferred, and no audio
 *     preview is fabricated or fetched.
 *
 * Framework-free so the picker and its tests share one contract.
 */

/**
 * Language tokens that may lead a voice ID, mapped to the group label shown to
 * the operator. Keys are matched lower-cased against the ID's leading token with
 * any parenthetical detail removed (so "Chinese (Mandarin)" matches "chinese").
 */
export const VOICE_LANGUAGES = Object.freeze({
  afrikaans: "Afrikaans",
  arabic: "Arabic",
  bulgarian: "Bulgarian",
  cantonese: "Cantonese",
  catalan: "Catalan",
  chinese: "Chinese",
  croatian: "Croatian",
  czech: "Czech",
  danish: "Danish",
  dutch: "Dutch",
  english: "English",
  filipino: "Filipino",
  finnish: "Finnish",
  french: "French",
  german: "German",
  greek: "Greek",
  hebrew: "Hebrew",
  hindi: "Hindi",
  hungarian: "Hungarian",
  indonesian: "Indonesian",
  italian: "Italian",
  japanese: "Japanese",
  korean: "Korean",
  malay: "Malay",
  norwegian: "Norwegian",
  nynorsk: "Norwegian (Nynorsk)",
  persian: "Persian",
  polish: "Polish",
  portuguese: "Portuguese",
  romanian: "Romanian",
  russian: "Russian",
  slovak: "Slovak",
  slovenian: "Slovenian",
  spanish: "Spanish",
  swedish: "Swedish",
  tamil: "Tamil",
  thai: "Thai",
  turkish: "Turkish",
  ukrainian: "Ukrainian",
  vietnamese: "Vietnamese",
});

/** Group key/label for voices whose ID names no language. */
export const GENERAL_VOICE_GROUP = Object.freeze({ key: "general", label: "General voices" });

/** Group key/label for provider-generated IDs (uploaded or previously cloned). */
export const CUSTOM_VOICE_GROUP = Object.freeze({ key: "custom", label: "Custom voice IDs" });

/**
 * Groups pinned to the top, in this order. The studio's own copy, prompts and
 * default voice (`Friendly_Person`) are English, so the English set is offered
 * first. This is presentation order only — no language is ranked by preference,
 * and every other group is ordered by how many voices it holds.
 */
const LEADING_GROUP_KEYS = Object.freeze(["english"]);

/** Groups pinned to the bottom of the list, in this order. */
const TRAILING_GROUP_KEYS = Object.freeze([GENERAL_VOICE_GROUP.key, CUSTOM_VOICE_GROUP.key]);

const CUSTOM_VOICE_ID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i;

function splitWords(segment) {
  return String(segment || "")
    // Split camelCase/pascalCase runs and hyphens used as word separators.
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[\s_-]+/)
    .filter(Boolean);
}

function titleCase(word) {
  if (!word) return "";
  // Preserve an internal capital only when the word was not already split.
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function dropTrailingSuffixes(words) {
  const next = [...words];
  while (next.length > 1 && /^(v\d+|\d+)$/i.test(next[next.length - 1])) next.pop();
  return next;
}

/**
 * A provider-generated identifier rather than a named system voice. The only
 * signal used is a UUID-shaped segment inside the ID, which appears on voices
 * uploaded to or minted by the provider.
 */
export function isTechnicalVoiceId(value) {
  if (typeof value !== "string") return false;
  return CUSTOM_VOICE_ID_PATTERN.test(value.trim());
}

/** The leading language token of an ID, or null when the ID names no language. */
export function voiceLanguageKey(value) {
  if (typeof value !== "string") return null;
  const [head, ...rest] = value.trim().split("_");
  if (!head || rest.length === 0) return null;
  const token = head.replace(/\s*\(.*?\)\s*/g, "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(VOICE_LANGUAGES, token) ? token : null;
}

/** The group a voice is listed under. */
export function voiceGroupOf(value) {
  if (isTechnicalVoiceId(value)) return { ...CUSTOM_VOICE_GROUP };
  const language = voiceLanguageKey(value);
  if (language) return { key: language, label: VOICE_LANGUAGES[language] };
  return { ...GENERAL_VOICE_GROUP };
}

/**
 * A readable label for a voice ID, derived only from the ID's own words.
 *   "English_radiant_girl"   -> "Radiant Girl"
 *   "English_CalmWoman"      -> "Calm Woman"
 *   "Sweet_Girl_2"           -> "Sweet Girl"
 *   "Chinese (Mandarin)_News_Anchor" -> "News Anchor"
 *   "moss_audio_6dc281eb-…"  -> "Custom Voice 6DC281EB"
 */
export function friendlyVoiceLabel(value) {
  const id = typeof value === "string" ? value.trim() : "";
  if (!id) return "";

  if (isTechnicalVoiceId(id)) {
    const [stamp] = id.match(/[0-9a-f]{8}/i) || [];
    return stamp ? `Custom Voice ${stamp.toUpperCase()}` : "Custom Voice";
  }

  const segments = id.split("_");
  const head = segments[0];
  const token = head.replace(/\s*\(.*?\)\s*/g, "").trim().toLowerCase();
  const body = Object.prototype.hasOwnProperty.call(VOICE_LANGUAGES, token)
    ? segments.slice(1)
    : segments;

  const words = dropTrailingSuffixes(body.flatMap((segment) => splitWords(segment)));
  const label = words.map(titleCase).join(" ").trim();
  return label || id;
}

/** Every system voice declared by a typed enum field, labelled and grouped. */
export function listPresetVoices(schema) {
  const values = Array.isArray(schema?.enum) ? schema.enum : [];
  return values
    .map((item) => (item && typeof item === "object" ? item.value : item))
    .filter((value) => typeof value === "string" && value.trim() !== "")
    .map((id) => {
      const group = voiceGroupOf(id);
      return {
        id,
        label: friendlyVoiceLabel(id),
        groupKey: group.key,
        groupLabel: group.label,
        isCustomId: group.key === CUSTOM_VOICE_GROUP.key,
      };
    });
}

/** True when the query matches a voice's label, its exact ID, or its group. */
export function voiceMatchesQuery(voice, query) {
  const needle = String(query || "").trim().toLowerCase();
  if (!needle) return true;
  return (
    voice.label.toLowerCase().includes(needle) ||
    voice.id.toLowerCase().includes(needle) ||
    voice.groupLabel.toLowerCase().includes(needle)
  );
}

/** Filter a labelled voice list by a free-text query. */
export function searchPresetVoices(voices, query) {
  const list = Array.isArray(voices) ? voices : [];
  return list.filter((voice) => voiceMatchesQuery(voice, query));
}

/**
 * Group a labelled voice list for display. English leads, the remaining language
 * groups follow ordered by how many voices they hold (ties alphabetically), and
 * "General voices" and "Custom voice IDs" are pinned to the bottom.
 */
export function groupPresetVoices(voices) {
  const list = Array.isArray(voices) ? voices : [];
  const groups = new Map();
  for (const voice of list) {
    if (!groups.has(voice.groupKey)) {
      groups.set(voice.groupKey, { key: voice.groupKey, label: voice.groupLabel, voices: [] });
    }
    groups.get(voice.groupKey).voices.push(voice);
  }

  const ordered = [...groups.values()];
  ordered.sort((left, right) => {
    const leftLeading = LEADING_GROUP_KEYS.indexOf(left.key);
    const rightLeading = LEADING_GROUP_KEYS.indexOf(right.key);
    if (leftLeading !== -1 || rightLeading !== -1) {
      if (leftLeading === -1) return 1;
      if (rightLeading === -1) return -1;
      return leftLeading - rightLeading;
    }
    const leftTrailing = TRAILING_GROUP_KEYS.indexOf(left.key);
    const rightTrailing = TRAILING_GROUP_KEYS.indexOf(right.key);
    if (leftTrailing !== -1 || rightTrailing !== -1) {
      if (leftTrailing === -1) return -1;
      if (rightTrailing === -1) return 1;
      return leftTrailing - rightTrailing;
    }
    if (right.voices.length !== left.voices.length) return right.voices.length - left.voices.length;
    return left.label.localeCompare(right.label);
  });
  return ordered;
}

/** The typed enum field that holds a voice ID, or null. */
export function voiceIdFieldName(model) {
  const inputs = model?.inputs;
  if (!inputs || typeof inputs !== "object") return null;
  for (const [key, schema] of Object.entries(inputs)) {
    if (/^voice_id$/i.test(key) && Array.isArray(schema?.enum)) return key;
  }
  return null;
}

/** True when a value is one of the field's declared system voices. */
export function isPresetVoiceValue(schema, value) {
  const id = typeof value === "string" ? value.trim() : "";
  if (!id) return false;
  return listPresetVoices(schema).some((voice) => voice.id === id);
}

/** The labelled entry for a value, or null when it is not a declared voice. */
export function presetVoiceForValue(schema, value) {
  const id = typeof value === "string" ? value.trim() : "";
  if (!id) return null;
  return listPresetVoices(schema).find((voice) => voice.id === id) || null;
}
