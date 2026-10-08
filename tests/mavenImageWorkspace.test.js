import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('conversation endpoint routes image requests through generateMavenImage before the text provider', () => {
  const source = read('src/lib/designAgentConversationEndpoint.js');
  const branchIndex = source.indexOf('isImageGenerationRequest(message)');
  const textProviderIndex = source.indexOf("await getService('createTextProvider')");
  assert.ok(branchIndex > 0, 'image branch is present');
  assert.ok(branchIndex < textProviderIndex, 'image branch runs before text intelligence is requested');
  assert.match(source, /generateMavenImage\(identity, args = \{\}\)|generateMavenImage\(identity, \{ prompt/);
});

test('dashboard exposes Download, Another variation, and Refine for generated images', () => {
  const source = read('packages/studio/src/components/experience/MavenHomeDashboard.jsx');
  assert.match(source, /extractGeneratedImageUrls\(message\.content/);
  assert.match(source, /<span>Download<\/span>/);
  assert.match(source, /Create another variation of this image: /);
  assert.match(source, /<span>Refine<\/span>/);
  assert.match(source, /if \(!isOverride\) setMavenMessage\(""\)/);
});

test('generated images are rendered from the same markdown reply that persists in the transcript', () => {
  const source = read('packages/studio/src/components/experience/MavenHomeDashboard.jsx');
  assert.match(source, /<ReactMarkdown remarkPlugins=\{\[remarkGfm\]\}/);
  assert.match(read('packages/studio/src/components/experience/MavenHomeDashboard.module.css'), /\.assistantMessage \.markdown img/);
});
