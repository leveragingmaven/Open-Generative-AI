import assert from "node:assert/strict";
import test from "node:test";

import {
  assetDeclaresKind,
  assetMatchesKind,
  isAudioUrl,
  isPlayableVideoUrl,
  listLibraryMedia,
  mediaGuardForKind,
  projectLibraryMedia,
} from "./CharacterMediaTypes.js";

const AUDIO_URL = "https://cdn.example.test/narration.mp3";
const VIDEO_URL = "https://cdn.example.test/face.mp4";

const library = [
  {
    id: "asset-audio",
    title: "Narration",
    generatedFiles: [AUDIO_URL],
    metadata: { assetType: "audio", subtype: "voice generation" },
  },
  { id: "asset-audio-dup", title: "Narration copy", metadata: { audioUrl: AUDIO_URL } },
  { id: "asset-video", title: "Talking head", generatedFiles: [VIDEO_URL], metadata: { assetType: "video" } },
  { id: "asset-still", title: "Portrait", generatedFiles: ["https://cdn.example.test/face.jpg"] },
  { id: "asset-record-only", title: "Asset record with no media", metadata: { assetType: "audio" } },
  { title: "No id", generatedFiles: [AUDIO_URL] },
];

test("the guards require real URL evidence, query strings included", () => {
  assert.equal(isAudioUrl(`${AUDIO_URL}?token=abc`), true);
  assert.equal(isAudioUrl("https://cdn.example.test/narration.wav#t=1"), true);
  assert.equal(isAudioUrl("https://cdn.example.test/face.jpg"), false);
  assert.equal(isAudioUrl(""), false);
  assert.equal(isAudioUrl(undefined), false);

  assert.equal(isPlayableVideoUrl(`${VIDEO_URL}?token=abc`), true);
  assert.equal(isPlayableVideoUrl("https://cdn.example.test/face.jpg"), false);
  assert.equal(isPlayableVideoUrl(null), false);
});

test("projection offers one entry per media URL, and only for the requested kind", () => {
  const audio = projectLibraryMedia(library, "audio");
  assert.deepEqual(audio.map((entry) => entry.id), ["asset-audio"]);
  assert.equal(audio[0].url, AUDIO_URL);
  // Contract: `id` is the asset's identity (used as a React key), while `url`
  // is the only value a consumer may hand to a provider. They must not be the
  // same field, so a selection can never send an asset id as a media URL.
  assert.notEqual(audio[0].id, audio[0].url);
  assert.equal(audio[0].name, "Narration");
  assert.equal(audio[0].subtype, "voice generation");

  const video = projectLibraryMedia(library, "video");
  assert.deepEqual(video.map((entry) => entry.id), ["asset-video"]);
  assert.equal(video[0].url, VIDEO_URL);
});

test("an asset record alone never qualifies a picker entry", () => {
  const recordOnly = [{ id: "asset-empty", title: "Audio that is not a file", metadata: { assetType: "audio" } }];
  assert.deepEqual(projectLibraryMedia(recordOnly, "audio"), []);
  assert.deepEqual(projectLibraryMedia([], "audio"), []);
  assert.deepEqual(projectLibraryMedia(null, "audio"), []);
  // An entry with no identity cannot be selected unambiguously.
  assert.deepEqual(projectLibraryMedia([{ generatedFiles: [AUDIO_URL] }], "audio"), []);
});

test("a signed, extensionless URL is still selectable when our own generator wrote it", () => {
  // MuAPI output URLs are signed; if one carries no media extension the URL
  // guard alone would hide a track the operator just generated in Audio Studio.
  const signed = "https://cdn.muapi.ai/outputs/generated/abc123?token=xyz";
  const generated = {
    id: "asset-signed",
    title: "Fresh narration",
    generatedFiles: [signed],
    createdFromStudio: "audio",
    metadata: { assetType: "audio", audioUrl: signed },
  };

  assert.equal(isAudioUrl(signed), false, "the URL alone proves nothing here");
  assert.equal(assetDeclaresKind(generated, "audio"), true);
  assert.equal(assetMatchesKind(generated, "audio"), true);

  const entries = projectLibraryMedia([generated], "audio");
  assert.equal(entries.length, 1);
  assert.equal(entries[0].url, signed);
});

test("provenance can fill a gap but never overrule a URL that states its type", () => {
  const extensionless = "https://cdn.muapi.ai/outputs/generated/abc123";

  // No provenance -> no claim about the type -> not offered.
  assert.equal(assetMatchesKind({ id: "a", generatedFiles: [extensionless] }, "audio"), false);

  // Provenance says audio, the URL says image -> the URL wins, entry rejected.
  const mislabelled = {
    id: "b",
    generatedFiles: ["https://cdn.example.test/face.jpg"],
    createdFromStudio: "audio",
    metadata: { assetType: "audio" },
  };
  assert.equal(assetMatchesKind(mislabelled, "audio"), false);
  assert.deepEqual(projectLibraryMedia([mislabelled], "audio"), []);

  // Provenance alone is never enough: a real URL is always required.
  assert.equal(assetMatchesKind({ id: "c", metadata: { assetType: "audio" } }, "audio"), false);
  assert.equal(assetMatchesKind({ id: "d", generatedFiles: [""] , metadata: { assetType: "audio" } }, "audio"), false);

  // A different kind is still a programming error with provenance in play.
  assert.throws(() => assetMatchesKind(mislabelled, "image"), /Unknown media kind/);
});

test("an unknown kind is a programming error, not a silently empty list", () => {
  assert.equal(mediaGuardForKind("audio"), isAudioUrl);
  assert.equal(mediaGuardForKind("video"), isPlayableVideoUrl);
  assert.equal(mediaGuardForKind("image"), null);
  assert.throws(() => projectLibraryMedia(library, "image"), /Unknown media kind/);
});

test("listLibraryMedia projects an injected library without touching browser storage", () => {
  assert.deepEqual(listLibraryMedia("audio", { library }).map((entry) => entry.url), [AUDIO_URL]);
  assert.deepEqual(listLibraryMedia("video", { library }).map((entry) => entry.url), [VIDEO_URL]);
});
