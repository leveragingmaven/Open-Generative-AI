// Creative OS — AI Clipping provider normalization.
//
// Wraps the MuAPI ai-clipping endpoint behind the Provider Registry. The
// Repurpose Runtime and studios depend only on this normalized contract, never
// on MuAPI response variations:
//
//   { requestId, sourceVideoUrl, clips: [{ url, title, startTime, endTime,
//     duration, score, hook, viralityReason, aspectRatio }], coordinates: [],
//     providerMetadata }
//
// Honesty rules (enforced):
//   - No fabricated fallback highlights. No mock coordinates or scores.
//   - Empty provider results surface as an honest empty state.
//   - Malformed responses are detected and surfaced as errors, never guessed.
//   - Useful public provider fields are preserved in providerMetadata.

const numberOrNull = (value) => {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const stringOrNull = (value) => (value == null || value === "" ? null : String(value));

// Builds the MuAPI ai-clipping payload from normalized recipe inputs.
export function buildClippingPayload(input = {}) {
  const videoUrl = stringOrNull(input.videoUrl || input.sourceVideoUrl || input.video_url);
  if (!videoUrl) throw new Error("Repurpose requires a source video (upload, Creative Library asset, or URL).");
  return {
    video_url: videoUrl,
    num_highlights: numberOrNull(input.numHighlights ?? input.maxHighlights ?? input.num_highlights) ?? 3,
    aspect_ratio: input.aspectRatio || input.aspect_ratio || "9:16",
    return_coordinates_only: Boolean(input.coordinatesOnly ?? input.return_coordinates_only),
    ...(stringOrNull(input.guidance) ? { guidance: stringOrNull(input.guidance) } : {}),
  };
}

function coerceClipIndex(value) {
  const index = numberOrNull(value);
  return index == null ? null : Math.max(0, Math.floor(index));
}

// Normalizes a single clip entry (string URL or object) — returns null when the
// entry carries no usable URL. Optional fields are preserved when present and
// valid; nothing is invented.
export function normalizeClipEntry(entry, index = 0, aspectRatio = "9:16") {
  if (entry == null) return null;
  if (typeof entry === "string") {
    if (!entry) return null;
    return {
      url: entry,
      title: null,
      startTime: null,
      endTime: null,
      duration: null,
      score: null,
      hook: null,
      viralityReason: null,
      aspectRatio,
      clipIndex: index,
    };
  }
  if (typeof entry !== "object") return null;
  const url = stringOrNull(entry.url || entry.video_url || entry.clip_url || entry.src);
  if (!url) return null;
  const startTime = numberOrNull(entry.start_time ?? entry.startTime ?? entry.start);
  const endTime = numberOrNull(entry.end_time ?? entry.endTime ?? entry.end);
  const duration = numberOrNull(entry.duration ?? entry.duration_seconds);
  const score = numberOrNull(entry.score ?? entry.confidence);
  const clipIndex = coerceClipIndex(entry.clip_index ?? entry.clipIndex ?? entry.index) ?? index;
  return {
    url,
    title: stringOrNull(entry.title),
    startTime,
    endTime,
    duration,
    score,
    hook: stringOrNull(entry.hook),
    viralityReason: stringOrNull(entry.virality_reason ?? entry.viralityReason ?? entry.reason),
    aspectRatio: stringOrNull(entry.aspect_ratio ?? entry.aspectRatio) || aspectRatio,
    clipIndex,
  };
}

function extractClips(raw, aspectRatio) {
  if (raw == null || typeof raw !== "object") return [];
  const candidates = [
    raw.clips,
    raw.result?.clips,
    raw.data?.clips,
    raw.output?.clips,
    raw.outputs,
    raw.result?.outputs,
    raw.data?.outputs,
    raw.output?.outputs,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      const clips = candidate.map((entry, index) => normalizeClipEntry(entry, index, aspectRatio)).filter(Boolean);
      if (clips.length) return clips;
    }
  }
  return [];
}

function extractCoordinates(raw) {
  if (raw == null || typeof raw !== "object") return [];
  for (const candidate of [raw.coordinates, raw.output?.coordinates, raw.output?.timings, raw.timings, raw.result?.coordinates, raw.highlights]) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

// Detects present-but-wrong-type payload fields so malformed responses surface
// as errors instead of a silent (and dishonest) empty state.
function detectMalformed(raw) {
  if (raw == null || typeof raw !== "object") return ["non-object response"];
  const issues = [];
  for (const key of ["clips", "outputs", "coordinates"]) {
    if (key in raw && raw[key] != null && !Array.isArray(raw[key])) {
      issues.push(`${key} must be an array`);
    }
  }
  return issues;
}

// Normalizes any supported provider response shape into the public contract.
export function normalizeRepurposeResponse(raw, { sourceVideoUrl = null, aspectRatio = "9:16", coordinatesOnly = false } = {}) {
  const providerMetadata =
    raw && typeof raw === "object" ? { ...raw } : {};
  const malformed = detectMalformed(raw);
  const clips = extractClips(raw, aspectRatio).map((clip) => {
    if (clip.duration == null && clip.startTime != null && clip.endTime != null) {
      return { ...clip, duration: Math.max(0, clip.endTime - clip.startTime) };
    }
    return clip;
  });
  const coordinates = extractCoordinates(raw);
  const requestId = stringOrNull(raw?.request_id ?? raw?.id ?? providerMetadata.requestId);
  const responseSource = stringOrNull(raw?.video_url ?? raw?.source_video_url ?? raw?.sourceVideoUrl ?? raw?.input?.video_url);
  return {
    requestId,
    sourceVideoUrl: sourceVideoUrl || responseSource || null,
    clips,
    coordinates,
    coordinatesOnly,
    malformed,
    providerMetadata,
  };
}

// Validates a normalized response. Empty results are valid but honest; malformed
// structures (no request id and no clips/coordinates) are surfaced as errors.
export function validateRepurposeResult(normalized = {}) {
  if (!normalized || typeof normalized !== "object") {
    return { valid: false, error: "malformed provider response: not an object" };
  }
  if (Array.isArray(normalized.malformed) && normalized.malformed.length) {
    return { valid: false, error: `malformed provider response: ${normalized.malformed.join("; ")}` };
  }
  if (!Array.isArray(normalized.clips) || !Array.isArray(normalized.coordinates)) {
    return { valid: false, error: "malformed provider response: missing clips/coordinates" };
  }
  if (normalized.clips.some((clip) => !clip || !clip.url)) {
    return { valid: false, error: "malformed provider response: clip without a usable url" };
  }
  return { valid: true, error: null };
}

// Executes the ai-clipping operation through the Provider Registry (never MuAPI
// directly). `registry` must expose get(providerId).execute(request).
export async function executeClippingThroughRegistry(registry, { apiKey, payload, providerId = "muapi" } = {}) {
  const provider = registry.get(providerId);
  if (!provider?.execute) throw new Error(`Provider ${providerId} does not support generic execution`);
  return provider.execute({
    operation: "ai_clipping",
    apiKey,
    params: payload,
  });
}
