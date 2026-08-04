// Creative OS — Character Identity source.
//
// The single identity source for Character Studio and every future Character
// Skill. A character identity is one of:
//
//   - a preset influencer persona (PRESET_INFLUENCERS),
//   - an AI Twin likeness (approved candidate / profile-image asset / reference
//     image),
//   - a temporary uploaded image (owned by the studio that uploaded it).
//
// Future Character Skills (talking avatar, character animation, lip sync) reuse
// this same identity source — a studio never invents a likeness.

export const CHARACTER_IDENTITY_TYPES = Object.freeze({
  INFLUENCER: "influencer",
  TWIN: "twin",
  UPLOAD: "upload",
});

// Preset influencer identities (reused from the Marketing Studio avatar
// personas). These are recognisable, consent-driven personas the user can drive
// without uploading a new image every time.
export const PRESET_INFLUENCERS = Object.freeze([
  { id: "influencer-priya", type: "influencer", name: "Priya", imageUrl: "https://d3adwkbyhxyrtq.cloudfront.net/web-app/Priya.webp" },
  { id: "influencer-elena", type: "influencer", name: "Elena", imageUrl: "https://d3adwkbyhxyrtq.cloudfront.net/web-app/Elena.webp" },
  { id: "influencer-kai", type: "influencer", name: "Kai", imageUrl: "https://d3adwkbyhxyrtq.cloudfront.net/web-app/Kai.webp" },
  { id: "influencer-sora", type: "influencer", name: "Sora", imageUrl: "https://d3adwkbyhxyrtq.cloudfront.net/web-app/Sora.webp" },
  { id: "influencer-minji", type: "influencer", name: "Minji", imageUrl: "https://d3adwkbyhxyrtq.cloudfront.net/web-app/Minji.webp" },
  { id: "influencer-margot", type: "influencer", name: "Margot", imageUrl: "https://d3adwkbyhxyrtq.cloudfront.net/web-app/Margot.webp" },
  { id: "influencer-niko", type: "influencer", name: "Niko", imageUrl: "https://d3adwkbyhxyrtq.cloudfront.net/web-app/Niko.webp" },
  { id: "influencer-jin", type: "influencer", name: "Jin", imageUrl: "https://d3adwkbyhxyrtq.cloudfront.net/web-app/Jin.webp" },
]);

// Derives a twin's likeness image from its profile (approved candidate →
// profile-image asset → first asset → first reference image). Returns null when
// the twin has no reusable likeness.
export function twinIdentityImageUrl(twin = {}) {
  if (!twin) return null;
  if (twin.approvedCandidate?.url) return twin.approvedCandidate.url;
  const profileAsset = (twin.assets || []).find((asset) => asset.assetType === "profile-image");
  if (profileAsset?.url) return profileAsset.url;
  if (twin.assets?.[0]?.url) return twin.assets[0].url;
  if (twin.referenceImages?.[0]?.url) return twin.referenceImages[0].url;
  return null;
}

// Normalizes a twin into a character identity (skipping twins with no likeness).
export function characterIdentityFromTwin(twin = {}) {
  const imageUrl = twinIdentityImageUrl(twin);
  if (!imageUrl) return null;
  return {
    id: `twin-${twin.id}`,
    type: CHARACTER_IDENTITY_TYPES.TWIN,
    name: twin.name || "AI Twin",
    imageUrl,
    sourceId: twin.id,
  };
}

// Normalizes a temporary upload into a character identity.
export function characterIdentityFromUpload({ imageUrl, name = "Temporary Image" } = {}) {
  if (!imageUrl) return null;
  return {
    id: `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: CHARACTER_IDENTITY_TYPES.UPLOAD,
    name,
    imageUrl,
    sourceId: null,
  };
}

// Lists every available character identity: preset influencers (optionally)
// followed by AI Twin likenesses. The studio filters by its own active twin
// selection as needed. Returns normalized identity records.
export function listCharacterIdentities({ twins = [], includePresets = true } = {}) {
  const presets = includePresets ? PRESET_INFLUENCERS.map((identity) => ({ ...identity })) : [];
  const twinIdentities = (Array.isArray(twins) ? twins : [])
    .map(characterIdentityFromTwin)
    .filter(Boolean);
  return [...presets, ...twinIdentities];
}

// Normalizes a selected identity (any supported shape) into a canonical record.
// Returns null for unknown shapes.
export function resolveCharacterIdentity(identity = {}) {
  if (!identity || typeof identity !== "object") return null;
  if (identity.type && identity.imageUrl && identity.name) {
    return {
      id: identity.id || `identity-${Date.now()}`,
      type: identity.type,
      name: identity.name,
      imageUrl: identity.imageUrl,
      sourceId: identity.sourceId ?? identity.id ?? null,
    };
  }
  // Accept a bare image record ({ url }) as a temporary identity.
  if (identity.url) {
    return {
      id: identity.id || `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: CHARACTER_IDENTITY_TYPES.UPLOAD,
      name: identity.name || "Temporary Image",
      imageUrl: identity.url,
      sourceId: identity.sourceId ?? identity.id ?? null,
    };
  }
  return null;
}
