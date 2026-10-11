import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Lip Sync Studio is a React component with no renderer available to this
// suite, so — as in AudioStudioCustomVoice.test.js — the playback contract is
// asserted against the component source: the control surface a mouse, a
// keyboard, and a touchscreen all use, and the single-playback rule.
// Normalized to LF so the source-shape regexes below read the same on a checkout with CRLF line endings.
const studioSource = readFileSync(new URL("./LipSyncStudio.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("history results are played through deliberate native controls", () => {
  // Hover-to-play is gone: it was unreachable on a touchscreen and could start
  // several results at once as the pointer crossed the grid.
  assert.equal(studioSource.includes("controls={false}"), false);
  assert.equal(studioSource.includes("onMouseOver={(e) => e.target.play()}"), false);
  assert.equal(studioSource.includes("onMouseOut={(e) => {"), false);

  // The history video carries native controls, inline playback for iOS, and a
  // poster frame so a result is recognizable before it plays.
  const historyVideo = /<video\n\s+ref=\{registerHistoryVideo\(historyKey\)\}[\s\S]*?\/>/.exec(studioSource)?.[0] || "";
  assert.notEqual(historyVideo, "");
  assert.match(historyVideo, /\n\s+controls\n/);
  assert.match(historyVideo, /\n\s+playsInline\n/);
  assert.match(historyVideo, /\n\s+preload="metadata"\n/);
  assert.match(historyVideo, /aria-label=\{`\$\{isPlaying \? "Playing" : "Play"\} lip sync result/);
  assert.equal(historyVideo.includes("muted"), false);
  assert.match(historyVideo, /src=\{entry\.url\}/);
});

test("starting one result pauses every other result", () => {
  assert.match(studioSource, /const \[playingHistoryKey, setPlayingHistoryKey\] = useState\(null\)/);
  assert.match(studioSource, /const historyVideoRefs = useRef\(new Map\(\)\)/);
  assert.match(studioSource, /const registerHistoryVideo = useCallback\(\(key\) => \(element\) => \{/);
  // The playing result is tracked from the element's own play/pause events, so a
  // creator using the native controls cannot desync the state.
  const historyVideo = /<video\n\s+ref=\{registerHistoryVideo\(historyKey\)\}[\s\S]*?\/>/.exec(studioSource)?.[0] || "";
  assert.match(historyVideo, /onPlay=\{\(\) => setPlayingHistoryKey\(historyKey\)\}/);
  assert.match(historyVideo, /onPause=\{\(\) => setPlayingHistoryKey\(\(current\) => \(current === historyKey \? null : current\)\)\}/);
  // Clearing the key pauses everything, which is what the fullscreen dialog and
  // the card's own fullscreen action rely on.
  const effect = /useEffect\(\(\) => \{\n\s+for \(const \[key, element\] of historyVideoRefs\.current\.entries\(\)\) \{[\s\S]*?\n  \}, \[playingHistoryKey\]\);/.exec(studioSource)?.[0] || "";
  assert.notEqual(effect, "");
  assert.match(effect, /key !== playingHistoryKey && element && !element\.paused/);
  assert.match(effect, /element\.pause\(\)/);
  assert.match(studioSource, /const stopHistoryPlayback = useCallback\(\(\) => setPlayingHistoryKey\(null\), \[\]\)/);
});

test("the existing history actions still work and stay reachable on touch", () => {
  // Fullscreen, download, and delete keep their handlers; download still uses the
  // stored result URL, so no asset URL or ownership rule was rewritten.
  assert.match(studioSource, /downloadFile\(entry\.url, `lipsync-\$\{entry\.id \|\| idx\}\.mp4`\)/);
  assert.match(studioSource, /aria-label=\{`Open lip sync result \$\{idx \+ 1\} fullscreen`\}/);
  assert.match(studioSource, /aria-label=\{`Download lip sync result \$\{idx \+ 1\}`\}/);
  assert.match(studioSource, /aria-label=\{`Delete lip sync result \$\{idx \+ 1\} from history`\}/);
  // The fullscreen dialog plays the video itself, so the card stops first.
  const fullscreenAction = /aria-label=\{`Open lip sync result \$\{idx \+ 1\} fullscreen`\}[\s\S]{0,400}?\}\}/.exec(studioSource)?.[0] || "";
  assert.match(fullscreenAction, /stopHistoryPlayback\(\)/);
  assert.match(fullscreenAction, /setFullscreenUrl\(entry\.url\)/);

  // Visible without hover on touch, revealed by hover or keyboard focus on a
  // pointer device.
  assert.match(studioSource, /opacity-100 transition-opacity focus-within:opacity-100 sm:opacity-0 sm:group-hover:opacity-100/);
});

test("the fullscreen dialog is dismissible and no player dependency was added", () => {
  assert.match(studioSource, /aria-label="Close fullscreen video"/);
  assert.match(studioSource, /if \(event\.key === "Escape"\) setFullscreenUrl\(null\)/);
  assert.match(studioSource, /window\.addEventListener\("keydown", onKeyDown\)/);
  // Native controls only: the studio imports no player package.
  const imports = studioSource.split("\n").filter((line) => line.trim().startsWith("import "));
  assert.equal(imports.some((line) => /player|video\.js|hls|plyr|mux/i.test(line)), false);
});
