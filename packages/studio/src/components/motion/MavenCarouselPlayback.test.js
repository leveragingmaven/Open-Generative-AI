import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const panelSource = readFileSync(new URL("./MavenCarouselPanel.jsx", import.meta.url), "utf8");

// The measured delivery defect: opening a finished carousel mounted SIX video elements that each
// streamed a full MP4 from `/api/motion-carousel?file=…` at the same moment — the five slide
// previews were `autoPlay`, so `preload="metadata"` was overridden and each one eagerly downloaded
// the whole file. The operator then pressed Play on the full-deck player, whose `bytes=0-` stream had
// to compete with those five in-flight downloads. The server's range delivery is correct (206 +
// `Content-Range` + `Content-Length` + `Accept-Ranges`), but a starved `bytes=0-` response never
// progresses far enough past the `moov` atom for Chromium to initialize the MP4 demuxer, so the deck
// buffered without ever reaching `loadedmetadata`.
//
// The repair is the same rule the Creative Library player already follows: a surface that is not the
// one being played must not start a transfer of its own. The slide previews stay mounted (metadata
// only, first frame visible) and the full-deck remains the single on-demand player.

test("opening a finished carousel does not start five simultaneous slide downloads", () => {
  // No element autoplays, so nothing but the deck the operator presses Play on streams video bytes.
  assert.equal(/autoPlay/.test(panelSource), false, "no carousel preview may auto-start a download");
});

test("each slide preview is mounted as a metadata-only, silent frame", () => {
  const slideVideo = /<video[^>]*aria-label=\{`Slide \$\{i \+ 1\} preview`\}[^>]*\/>/.exec(panelSource)?.[0] || "";
  assert.ok(slideVideo, "the slide preview element is present");
  assert.match(slideVideo, /preload="metadata"/);
  assert.match(slideVideo, /muted/);
  assert.match(slideVideo, /playsInline/);
});

test("the full deck is the one on-demand player with native controls", () => {
  const deckVideo = /<video[^>]*aria-label="Full carousel playback"[^>]*\/>/.exec(panelSource)?.[0] || "";
  assert.ok(deckVideo, "the full-deck player is present");
  assert.match(deckVideo, /controls/);
  assert.match(deckVideo, /playsInline/);
  assert.match(deckVideo, /preload="metadata"/);
  // Exactly the two preview surfaces mount a video element; nothing else streams.
  assert.equal((panelSource.match(/<video/g) || []).length, 2);
});
