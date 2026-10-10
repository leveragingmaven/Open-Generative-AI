import assert from "node:assert/strict";
import test from "node:test";

import { getAudioModelById } from "../../models.js";
import { enumValues, isTypedEnumField } from "./customVoiceId.js";
import {
  CUSTOM_VOICE_GROUP,
  GENERAL_VOICE_GROUP,
  friendlyVoiceLabel,
  groupPresetVoices,
  isPresetVoiceValue,
  isTechnicalVoiceId,
  listPresetVoices,
  presetVoiceForValue,
  searchPresetVoices,
  voiceGroupOf,
  voiceIdFieldName,
  voiceLanguageKey,
} from "./presetVoices.js";

const speech = getAudioModelById("minimax-speech-2.6-hd");
const turbo = getAudioModelById("minimax-speech-2.6-turbo");
const voiceSchema = speech.inputs.voice_id;
const voices = listPresetVoices(voiceSchema);

test("the catalog still advertises the preset voice library", () => {
  // If either of these changes, the picker's premise has changed with it.
  assert.equal(isTypedEnumField(voiceSchema), true);
  assert.equal(voiceIdFieldName(speech), "voice_id");
  assert.equal(voiceIdFieldName(turbo), "voice_id");
  assert.equal(voiceIdFieldName(getAudioModelById("suno-create-music")), null);
  assert.ok(enumValues(voiceSchema).length > 400, "expected the preset library to remain large");
});

test("every preset voice survives the labelling with its exact id", () => {
  const values = enumValues(voiceSchema);
  assert.equal(voices.length, values.length);
  assert.deepEqual(voices.map((voice) => voice.id), values);
  // The picker offers only labelled metadata — no invented fields, and nothing
  // that could be mistaken for a preview URL.
  assert.deepEqual(Object.keys(voices[0]), ["id", "label", "groupKey", "groupLabel", "isCustomId"]);
  for (const voice of voices) {
    assert.ok(voice.label.length > 0, voice.id);
    assert.ok(voice.groupLabel.length > 0, voice.id);
  }
  assert.equal(isPresetVoiceValue(voiceSchema, values[0]), true);
  assert.equal(isPresetVoiceValue(voiceSchema, "not-a-listed-voice"), false);
});

test("labels are built only from the words in the id", () => {
  // This is the guard against inventing a name, gender, accent or language: a
  // label may not contain a word the catalog id does not already contain.
  for (const voice of voices) {
    if (voice.isCustomId) continue;
    for (const word of voice.label.split(" ")) {
      assert.ok(
        voice.id.toLowerCase().includes(word.toLowerCase()),
        `${voice.id} produced the label "${voice.label}" (word "${word}" is not in the id)`,
      );
    }
  }
});

test("labels read like voice names rather than provider identifiers", () => {
  const cases = new Map([
    ["English_radiant_girl", "Radiant Girl"],
    ["English_CalmWoman", "Calm Woman"],
    ["English_Whispering_girl_v3", "Whispering Girl"],
    ["Sweet_Girl_2", "Sweet Girl"],
    ["Friendly_Person", "Friendly Person"],
    ["Chinese (Mandarin)_News_Anchor", "News Anchor"],
    ["Deep_Voice_Man", "Deep Voice Man"],
    ["hunyin_6", "Hunyin"],
  ]);
  for (const [id, label] of cases) {
    assert.equal(friendlyVoiceLabel(id), label, id);
  }
  assert.equal(friendlyVoiceLabel(""), "");
  assert.equal(friendlyVoiceLabel(undefined), "");
});

test("groups come from the id's own language token, and nothing else", () => {
  assert.equal(voiceLanguageKey("English_Upbeat_Woman"), "english");
  assert.equal(voiceLanguageKey("Korean_male_1_v1"), "korean");
  assert.equal(voiceLanguageKey("Chinese (Mandarin)_News_Anchor"), "chinese");
  // No language token: never guessed.
  assert.equal(voiceLanguageKey("Wise_Woman"), null);
  assert.equal(voiceLanguageKey("Friendly_Person"), null);
  assert.equal(voiceGroupOf("English_Upbeat_Woman").label, "English");
  assert.equal(voiceGroupOf("Wise_Woman").key, GENERAL_VOICE_GROUP.key);
  assert.equal(voiceGroupOf("Friendly_Person").key, GENERAL_VOICE_GROUP.key);
  // A provider-generated id is shown as custom, not as a named voice.
  assert.equal(isTechnicalVoiceId("moss_audio_6dc281eb-713c-11f0-a447-9613c873494c"), true);
  assert.equal(isTechnicalVoiceId("English_Upbeat_Woman"), false);
  assert.equal(voiceGroupOf("moss_audio_6dc281eb-713c-11f0-a447-9613c873494c").key, CUSTOM_VOICE_GROUP.key);
  assert.equal(friendlyVoiceLabel("moss_audio_6dc281eb-713c-11f0-a447-9613c873494c"), "Custom Voice 6DC281EB");
});

test("search finds a voice by name, by exact id, and by group", () => {
  assert.deepEqual(searchPresetVoices(voices, "radiant").map((voice) => voice.id), ["English_radiant_girl"]);
  assert.deepEqual(searchPresetVoices(voices, "Upbeat_Woman").map((voice) => voice.id), ["English_Upbeat_Woman"]);
  assert.deepEqual(searchPresetVoices(voices, "English_CalmWoman").map((voice) => voice.id), ["English_CalmWoman"]);
  assert.ok(searchPresetVoices(voices, "radiant").length === 1);
  // Case-insensitive, and the group label is searchable too.
  assert.equal(searchPresetVoices(voices, "RADIANT").length, 1);
  assert.equal(searchPresetVoices(voices, "korean").length, 51);
  // An empty query is not a filter.
  assert.equal(searchPresetVoices(voices, "  ").length, voices.length);
  assert.equal(searchPresetVoices(voices, "definitely-not-a-voice").length, 0);
});

test("grouping is stable and puts English first, buckets last", () => {
  const groups = groupPresetVoices(voices);
  assert.equal(groups[0].key, "english");
  assert.equal(groups.at(-2).key, GENERAL_VOICE_GROUP.key);
  assert.equal(groups.at(-1).key, CUSTOM_VOICE_GROUP.key);

  const total = groups.reduce((sum, group) => sum + group.voices.length, 0);
  assert.equal(total, voices.length);

  // Every voice appears once, and the non-English language groups are ordered by
  // size so the bigger sets sit nearer the top.
  const languageSizes = groups
    .slice(1, -2)
    .map((group) => group.voices.length);
  assert.deepEqual(languageSizes, [...languageSizes].sort((left, right) => right - left));

  const custom = groups.find((group) => group.key === CUSTOM_VOICE_GROUP.key);
  assert.ok(custom.voices.every((voice) => voice.isCustomId));

  // Grouping a search result narrows to the matching groups only.
  const narrowed = groupPresetVoices(searchPresetVoices(voices, "korean"));
  assert.equal(narrowed.length, 1);
  assert.equal(narrowed[0].key, "korean");

  assert.deepEqual(groupPresetVoices(undefined), []);
});

test("a selected value resolves to its labelled entry", () => {
  const entry = presetVoiceForValue(voiceSchema, "English_Upbeat_Woman");
  assert.equal(entry.label, "Upbeat Woman");
  assert.equal(entry.groupKey, "english");
  // A cloned ID is not in the library, so it has no entry — the picker keeps it
  // as the current value without pretending it is a preset.
  assert.equal(presetVoiceForValue(voiceSchema, "sf02174c-5f5d-46e6-8758-7544128c27b2"), null);
  assert.equal(presetVoiceForValue(voiceSchema, ""), null);
});
