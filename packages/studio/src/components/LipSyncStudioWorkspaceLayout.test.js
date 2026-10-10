import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// As in LipSyncStudioUploadControls.test.js, this suite has no JSX transform and
// no DOM, so the layout contract is asserted against the component sources. The
// render-level proof of the same contract — that the real components mount and
// emit these areas — lives in scripts/verify-audio-studio-p0p1.mjs.
const studioSource = readFileSync(new URL("./LipSyncStudio.jsx", import.meta.url), "utf8");
const composerSource = readFileSync(
  new URL("./prompt/PromptComposer.jsx", import.meta.url),
  "utf8",
);

test("the input panel is docked in the flow, not floating over the results", () => {
  // The studio now asks for the composer's compact, in-flow variant, and takes
  // the free space below the results so a short workspace has no dead gap...
  assert.match(studioSource, /<PromptComposer compact className="mt-auto pt-3">/);
  // ...which is why the column is a flex container whose rows never squash.
  assert.match(studioSource, /className="flex flex-1 flex-col w-full max-w-7xl mx-auto overflow-y-auto/);
  assert.match(studioSource, /mb-3 shrink-0 flex flex-wrap items-baseline justify-between/);
  // ...so the container no longer reserves the 10rem of empty space the
  // floating bar needed to stay clear of the content underneath it.
  assert.doesNotMatch(studioSource, /pb-40 lg:pb-32/);
  assert.doesNotMatch(studioSource, /absolute bottom-4/);
});

test("the other studios keep the floating composer they already had", () => {
  // The opt-in is the point: `compact` is off by default, and the floating
  // position remains the default every other studio renders.
  assert.match(composerSource, /compact = false,/);
  assert.match(
    composerSource,
    /const DEFAULT_POSITION_CLASS =\s*"absolute bottom-4 w-full max-w-\[95%\] lg:max-w-4xl z-30 animate-fade-in-up"/,
  );
  assert.match(
    composerSource,
    /positionClassName \?\? \(compact \? COMPACT_POSITION_CLASS : DEFAULT_POSITION_CLASS\)/,
  );
  assert.match(
    composerSource,
    /const COMPACT_POSITION_CLASS = "relative w-full"/,
  );
});

test("source media and speech direction are separate, labelled areas", () => {
  assert.match(studioSource, /Source media/);
  assert.match(studioSource, /Speech direction/);
  // The workspace opens the two areas by a single breakpoint, so the panel
  // stacks on a narrow viewport instead of squeezing the sources into a column.
  assert.match(
    studioSource,
    /<div className="grid gap-3 lg:grid-cols-\[1\.3fr_1fr\]">/,
  );
  assert.match(studioSource, /<section className="flex flex-col gap-2\.5 lg:border-r/);
});

test("the oversized hero heading is gone", () => {
  assert.doesNotMatch(studioSource, /text-5xl/);
  assert.doesNotMatch(studioSource, /text-2xl sm:text-4xl/);
  assert.doesNotMatch(studioSource, /Create a lip sync video\./);
  assert.doesNotMatch(studioSource, /min-h-\[50vh\]/);
  // ...replaced by one compact header line.
  assert.match(
    studioSource,
    /<h1 className="text-base sm:text-lg font-bold tracking-tight text-white">Lip Sync<\/h1>/,
  );
});

test("every control from the crowded bar survived the move", () => {
  // Mode choice, speech direction, model, quality and the action are all still
  // rendered by the same primitives with the same handlers.
  assert.match(studioSource, /<PromptSegmentedControl>/);
  assert.match(studioSource, /Portrait Image/);
  assert.match(studioSource, /Speech direction/);
  assert.match(studioSource, /<PromptTextarea\s+ref=\{textareaRef\}/);
  assert.match(studioSource, /placeholder="Describe speech style\.\.\."/);
  assert.match(studioSource, /<PromptControls>/);
  assert.match(studioSource, /<PromptAction\s+onClick=\{handleGenerate\}/);
  // The library-audio affordance stays in the source column with the uploads.
  assert.match(studioSource, /Library audio/);
});

test("the shared generate action is a compact control, not an oversized pill", () => {
  // The defect: one pink pill (px-7 py-3, rounded-full, text-sm, big glow) was
  // the loudest element in every studio that shares this primitive.
  assert.doesNotMatch(composerSource, /px-7 py-3/);
  assert.doesNotMatch(composerSource, /rounded-full font-bold text-sm/);
  assert.match(
    composerSource,
    /"bg-\[#E82070\] text-white min-h-9 px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-\[0\.1em\]/,
  );
  // Full width only on a narrow viewport; it stays a row control on desktop.
  assert.match(composerSource, /flex items-center justify-center gap-2 w-full sm:w-auto/);
  // The compact panel drops the heavy drop shadow and the 2rem radius.
  assert.match(composerSource, /const COMPACT_PANEL_CLASS =/);
  assert.match(composerSource, /rounded-2xl border border-white\/\[0\.08\] p-3 sm:p-4/);
});
