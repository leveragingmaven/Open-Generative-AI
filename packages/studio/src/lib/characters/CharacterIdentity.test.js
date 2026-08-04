import assert from "node:assert/strict";
import test from "node:test";
import {
  CHARACTER_IDENTITY_TYPES,
  PRESET_INFLUENCERS,
  twinIdentityImageUrl,
  characterIdentityFromTwin,
  characterIdentityFromUpload,
  listCharacterIdentities,
  resolveCharacterIdentity,
} from "./CharacterIdentity.js";

test("PRESET_INFLUENCERS provides eight consent-driven personas with cloudfront images", () => {
  assert.equal(PRESET_INFLUENCERS.length, 8);
  for (const identity of PRESET_INFLUENCERS) {
    assert.ok(identity.id.startsWith("influencer-"));
    assert.equal(identity.type, CHARACTER_IDENTITY_TYPES.INFLUENCER);
    assert.ok(identity.name);
    assert.match(identity.imageUrl, /^https:\/\/d3adwkbyhxyrtq\.cloudfront\.net\/web-app\//);
  }
});

test("twinIdentityImageUrl prefers the approved candidate", () => {
  const twin = {
    approvedCandidate: { url: "https://cdn.test/approved.webp" },
    assets: [{ assetType: "profile-image", url: "https://cdn.test/profile.webp" }],
  };
  assert.equal(twinIdentityImageUrl(twin), "https://cdn.test/approved.webp");
});

test("twinIdentityImageUrl falls back to the profile-image asset then other assets then reference images", () => {
  assert.equal(twinIdentityImageUrl({ assets: [{ assetType: "profile-image", url: "https://cdn.test/p.webp" }] }), "https://cdn.test/p.webp");
  assert.equal(twinIdentityImageUrl({ assets: [{ assetType: "generated", url: "https://cdn.test/a.webp" }] }), "https://cdn.test/a.webp");
  assert.equal(twinIdentityImageUrl({ referenceImages: [{ url: "https://cdn.test/r.webp" }] }), "https://cdn.test/r.webp");
});

test("twinIdentityImageUrl returns null when the twin has no likeness", () => {
  assert.equal(twinIdentityImageUrl({}), null);
  assert.equal(twinIdentityImageUrl({ assets: [] }), null);
  assert.equal(twinIdentityImageUrl(null), null);
});

test("characterIdentityFromTwin normalizes a twin with a likeness", () => {
  const identity = characterIdentityFromTwin({
    id: "twin-7",
    name: "Aria",
    approvedCandidate: { url: "https://cdn.test/aria.webp" },
  });
  assert.deepEqual(identity, {
    id: "twin-twin-7",
    type: CHARACTER_IDENTITY_TYPES.TWIN,
    name: "Aria",
    imageUrl: "https://cdn.test/aria.webp",
    sourceId: "twin-7",
  });
});

test("characterIdentityFromTwin returns null for a twin with no likeness", () => {
  assert.equal(characterIdentityFromTwin({ id: "twin-8", name: "No Face" }), null);
});

test("characterIdentityFromUpload normalizes a temporary upload", () => {
  const identity = characterIdentityFromUpload({ imageUrl: "https://cdn.test/temp.webp", name: "headshot.png" });
  assert.equal(identity.type, CHARACTER_IDENTITY_TYPES.UPLOAD);
  assert.equal(identity.imageUrl, "https://cdn.test/temp.webp");
  assert.equal(identity.name, "headshot.png");
  assert.equal(characterIdentityFromUpload({}), null);
});

test("listCharacterIdentities lists presets first then twin likenesses, skipping twins without likenesses", () => {
  const twins = [
    { id: "twin-a", name: "Aria", approvedCandidate: { url: "https://cdn.test/a.webp" } },
    { id: "twin-b", name: "No Face" },
  ];
  const identities = listCharacterIdentities({ twins, includePresets: true });
  assert.equal(identities.length, PRESET_INFLUENCERS.length + 1);
  assert.equal(identities[0].type, CHARACTER_IDENTITY_TYPES.INFLUENCER);
  assert.equal(identities.at(-1).id, "twin-twin-a");
});

test("listCharacterIdentities can hide presets", () => {
  const twins = [{ id: "twin-a", name: "Aria", approvedCandidate: { url: "https://cdn.test/a.webp" } }];
  const identities = listCharacterIdentities({ twins, includePresets: false });
  assert.equal(identities.length, 1);
  assert.equal(identities[0].type, CHARACTER_IDENTITY_TYPES.TWIN);
});

test("resolveCharacterIdentity accepts a canonical identity", () => {
  const identity = resolveCharacterIdentity({ id: "influencer-kai", type: "influencer", name: "Kai", imageUrl: "https://cdn.test/kai.webp" });
  assert.equal(identity.id, "influencer-kai");
  assert.equal(identity.imageUrl, "https://cdn.test/kai.webp");
});

test("resolveCharacterIdentity accepts a bare image record as a temporary upload", () => {
  const identity = resolveCharacterIdentity({ url: "https://cdn.test/raw.webp" });
  assert.equal(identity.type, CHARACTER_IDENTITY_TYPES.UPLOAD);
  assert.equal(identity.imageUrl, "https://cdn.test/raw.webp");
});

test("resolveCharacterIdentity returns null for unknown shapes", () => {
  assert.equal(resolveCharacterIdentity(null), null);
  assert.equal(resolveCharacterIdentity({}), null);
  assert.equal(resolveCharacterIdentity("nope"), null);
});
