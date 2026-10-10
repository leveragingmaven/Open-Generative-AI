import assert from "node:assert/strict";
import test from "node:test";

import { getAudioModelById } from "../../models.js";
import { groupPresetVoices, listPresetVoices, searchPresetVoices } from "./presetVoices.js";
import {
  VOICE_KEY_ACTION_TYPES,
  clampVoiceIndex,
  initialActiveIndex,
  moveVoiceIndex,
  optionDomId,
  resolveVoiceKeyAction,
} from "./voiceNavigation.js";

const key = (name, activeIndex, count) => resolveVoiceKeyAction({ key: name, activeIndex, count });

test("Arrow Down moves through the visible results", () => {
  assert.deepEqual(key("ArrowDown", 0, 3), { type: VOICE_KEY_ACTION_TYPES.MOVE, index: 1 });
  assert.deepEqual(key("ArrowDown", 1, 3), { type: VOICE_KEY_ACTION_TYPES.MOVE, index: 2 });
});

test("arrowing stops at both ends instead of wrapping under the operator", () => {
  assert.deepEqual(key("ArrowDown", 2, 3), { type: VOICE_KEY_ACTION_TYPES.MOVE, index: 2 });
  assert.deepEqual(key("ArrowUp", 0, 3), { type: VOICE_KEY_ACTION_TYPES.MOVE, index: 0 });
  assert.deepEqual(key("ArrowUp", 2, 3), { type: VOICE_KEY_ACTION_TYPES.MOVE, index: 1 });
});

test("with nothing active yet, Down lands on the first voice and Up on the last", () => {
  assert.deepEqual(key("ArrowDown", -1, 472), { type: VOICE_KEY_ACTION_TYPES.MOVE, index: 0 });
  assert.deepEqual(key("ArrowUp", -1, 472), { type: VOICE_KEY_ACTION_TYPES.MOVE, index: 471 });
});

test("Enter selects the highlighted voice, and does nothing when nothing is highlighted", () => {
  assert.deepEqual(key("Enter", 3, 472), { type: VOICE_KEY_ACTION_TYPES.SELECT, index: 3 });
  assert.equal(key("Enter", -1, 472).type, VOICE_KEY_ACTION_TYPES.NONE);
  assert.equal(key("Enter", 472, 472).type, VOICE_KEY_ACTION_TYPES.NONE);
});

test("Escape closes the picker", () => {
  assert.deepEqual(key("Escape", 0, 472), { type: VOICE_KEY_ACTION_TYPES.CLOSE });
  // ...even with no results, so an empty search is still dismissable.
  assert.deepEqual(key("Escape", -1, 0), { type: VOICE_KEY_ACTION_TYPES.CLOSE });
});

test("an empty result set leaves the arrows and Enter inert", () => {
  for (const name of ["ArrowDown", "ArrowUp", "Enter"]) {
    assert.equal(key(name, 0, 0).type, VOICE_KEY_ACTION_TYPES.NONE, name);
  }
});

test("editing keys are never swallowed", () => {
  for (const name of ["a", "Backspace", "Home", "End", "Tab", " ", "PageDown"]) {
    assert.equal(key(name, 0, 472).type, VOICE_KEY_ACTION_TYPES.NONE, name);
  }
});

test("indexes are always inside the list that is on screen", () => {
  assert.equal(clampVoiceIndex(-5, 3), 0);
  assert.equal(clampVoiceIndex(9, 3), 2);
  assert.equal(clampVoiceIndex(1, 3), 1);
  assert.equal(clampVoiceIndex(0, 0), -1);
  assert.equal(clampVoiceIndex(0, -1), -1);
  assert.equal(clampVoiceIndex(undefined, 3), 0);
  assert.equal(moveVoiceIndex(0, 1, 0), -1);
  assert.equal(moveVoiceIndex(undefined, 1, 3), 0);
});

test("the active option starts on the current voice when it is still listed", () => {
  const voices = [{ id: "A" }, { id: "B" }, { id: "C" }];
  assert.equal(initialActiveIndex(voices, "B"), 1);
  // A filtered list that no longer contains the current voice starts at the top.
  assert.equal(initialActiveIndex(voices, "Z"), 0);
  assert.equal(initialActiveIndex([], "B"), -1);
  assert.equal(initialActiveIndex(undefined, "B"), -1);
});

test("option ids are stable and derived from the listbox", () => {
  assert.equal(optionDomId("voice-listbox", 0), "voice-listbox-option-0");
  assert.equal(optionDomId("voice-listbox", 471), "voice-listbox-option-471");
});

test("navigation covers exactly the options the picker renders, in order", () => {
  // The picker navigates the flattened group order, so that is what must line up
  // with the rendered options: no duplicates, nothing lost, 472 of them.
  const schema = getAudioModelById("minimax-speech-2.6-hd").inputs.voice_id;
  const visible = groupPresetVoices(listPresetVoices(schema)).flatMap((group) => group.voices);
  assert.equal(visible.length, 472);
  assert.equal(new Set(visible.map((voice) => voice.id)).size, 472);

  // Arrowing from the current voice to the last option lands on the last voice.
  const start = initialActiveIndex(visible, "Friendly_Person");
  let index = start;
  for (let step = 0; step < visible.length; step += 1) {
    const action = resolveVoiceKeyAction({ key: "ArrowDown", activeIndex: index, count: visible.length });
    index = action.index;
  }
  assert.equal(index, 471);
  assert.equal(visible[index].id, visible[471].id);

  // A search narrows the count, so the same keys stay inside the results.
  const narrowed = groupPresetVoices(searchPresetVoices(listPresetVoices(schema), "korean")).flatMap(
    (group) => group.voices,
  );
  assert.equal(narrowed.length, 51);
  assert.equal(resolveVoiceKeyAction({ key: "ArrowUp", activeIndex: 0, count: narrowed.length }).index, 0);
  assert.equal(
    resolveVoiceKeyAction({ key: "ArrowDown", activeIndex: 50, count: narrowed.length }).index,
    50,
  );
});
