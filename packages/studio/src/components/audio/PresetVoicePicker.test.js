import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// The picker has no renderer in this suite, so its contract is asserted against
// the component source, in the same style as the other component tests.
const pickerSource = readFileSync(new URL("./PresetVoicePicker.jsx", import.meta.url), "utf8");

test("the picker is searchable, grouped and labelled from the catalog", () => {
  assert.match(pickerSource, /from "\.\.\/\.\.\/lib\/audio\/presetVoices\.js"/);
  assert.match(pickerSource, /listPresetVoices\(schema\)/);
  assert.match(pickerSource, /searchPresetVoices\(voices, query\)/);
  assert.match(pickerSource, /groupPresetVoices\(matches\)/);
  // Search by name or by the exact provider ID.
  assert.match(pickerSource, /Search \$\{voices\.length\} voices by name or ID…/);
  assert.match(pickerSource, /autoFocus/);
  // Collapsible groups, so 40-odd sections never have to be scrolled at once.
  assert.match(pickerSource, /onClick=\{\(\) => toggleGroup\(group\.key\)\}/);
  assert.match(pickerSource, /const isExpanded = \(groupKey\) =>/);
});

test("the picker writes back the exact catalog ID and shows it", () => {
  assert.match(pickerSource, /const select = \(voice\) => \{\s+onChange\(voice\.id\);/);
  // Exactly one write path, and it writes the selected voice's own ID — never a
  // normalised, renamed or resolved value.
  assert.equal((pickerSource.match(/onChange\(/g) || []).length, 1);
  assert.match(pickerSource, /\{voice\.id\}/);
});

test("built-in voices are visibly distinct from custom voice IDs", () => {
  assert.match(pickerSource, /Built-in voice · \$\{selected\.id\}/);
  assert.match(pickerSource, /Custom voice ID · \$\{selected\.id\}/);
  assert.match(pickerSource, /\{voice\.isCustomId \? "Custom voice ID · " : ""\}/);
  assert.match(pickerSource, /CUSTOM_VOICE_GROUP/);
});

test("no voice preview is fabricated and no call is made automatically", () => {
  // The catalog carries no sample URLs, so auditioning would require a paid
  // generation call. The picker ships without either.
  assert.doesNotMatch(pickerSource, /<audio/);
  assert.doesNotMatch(pickerSource, /new Audio\(/);
  assert.doesNotMatch(pickerSource, /fetch\(/);
  assert.doesNotMatch(pickerSource, /previewUrl|sampleUrl|audioUrl/);
});

test("the picker closes on an outside click and on Escape, and resets its query", () => {
  assert.match(pickerSource, /window\.addEventListener\("mousedown", handlePointer\)/);
  assert.match(pickerSource, /event\.key === "Escape"/);
  assert.match(pickerSource, /if \(!open\) setQuery\(""\);/);
  // The selected voice's group is brought into view rather than left off-screen.
  assert.match(pickerSource, /selectedGroupRef\.current\?\.scrollIntoView\?\.\(\{ block: "nearest" \}\)/);
});
