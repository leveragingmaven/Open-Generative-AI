// Shared communication utilities for the Creative Skills library.
// Extracted from Skill 001 (Message Clarity) and reused by every Communication
// Skill Pack skill. These helpers are pure, deterministic, and carry no runtime
// behavior of their own: this module is informational plumbing only — it is not
// an engine, registry, or orchestration layer. Skills import these functions to
// stay DRY; the Creative Skills Registry and Creative Intelligence Engine are
// unchanged.

// Splits text into trimmed sentences on . ! ? and newline boundaries.
export function splitIntoSentences(text) {
  const matches = String(text || "").match(/[^.!?\n]+[.!?]*\s*/g) || [];
  return matches.map((sentence) => sentence.trim()).filter(Boolean);
}

// Extracts the words of a text as lowercase-safe alphanumeric tokens.
export function tokenizeWords(text) {
  return String(text || "").match(/[A-Za-z0-9']+/g) || [];
}

// Counts every occurrence of every needle (case-insensitive substring match).
export function countMatches(text, needles) {
  const haystack = String(text || "").toLowerCase();
  let count = 0;
  for (const needle of needles) {
    let index = 0;
    while ((index = haystack.indexOf(needle.toLowerCase(), index)) !== -1) {
      count += 1;
      index += needle.length;
    }
  }
  return count;
}

// Clamps a value into the inclusive [min, max] range.
export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// Counts repeated phrase families in a token stream. A bigram is excessive when
// it repeats bigramThreshold+ times; a trigram when it repeats trigramThreshold+
// times. Returns the number of such families (at most one per n-gram length).
export function countRepeatedPhrases(
  words,
  { bigramThreshold = 5, trigramThreshold = 3 } = {},
) {
  const normalized = words.map((word) => word.toLowerCase());
  if (normalized.length < 2) return 0;
  let repeats = 0;

  const bigrams = new Map();
  for (let i = 0; i < normalized.length - 1; i += 1) {
    const key = `${normalized[i]} ${normalized[i + 1]}`;
    bigrams.set(key, (bigrams.get(key) || 0) + 1);
  }
  for (const count of bigrams.values()) {
    if (count >= bigramThreshold) {
      repeats += 1;
      break;
    }
  }

  if (normalized.length >= 3) {
    const trigrams = new Map();
    for (let i = 0; i < normalized.length - 2; i += 1) {
      const key = `${normalized[i]} ${normalized[i + 1]} ${normalized[i + 2]}`;
      trigrams.set(key, (trigrams.get(key) || 0) + 1);
    }
    for (const count of trigrams.values()) {
      if (count >= trigramThreshold) {
        repeats += 1;
        break;
      }
    }
  }

  return repeats;
}
