import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../components/experience/MavenHomeDashboard.jsx', import.meta.url), 'utf8');

test('Another Variation and Refine pass server-issued asset IDs instead of trusting image markdown URLs', () => {
  assert.match(source, /referenceIds = !isUser && Array\.isArray\(message\.attachments\)/);
  assert.match(source, /onVariation\(previousPrompt, referenceIds\[0\], imageUrls\[0\]\)/);
  assert.match(source, /if \(!attachmentId\).*trusted session asset/s);
  assert.match(source, /onRefine\(referenceIds\[0\], imageUrls\[0\]\)/);
  assert.match(source, /submitMavenMessage\(null, "Make another variation of this image while preserving its subject and style\.", \{ attachmentId, previewUrl \}\)/);
  assert.match(source, /priorReferenceIds = reference\?\.attachmentId \? \[reference\.attachmentId\] : \[\]/);
  assert.match(source, /attachments: attachmentIds/);
});

test('Refine lets the customer enter a change prompt with the selected image visible in the composer', () => {
  assert.match(source, /setSelectedImageReference\(\{ attachmentId, previewUrl \}\)/);
  assert.match(source, /Selected Maven image reference/);
  assert.match(source, /Remove selected image reference/);
});

test('Download reports unavailable/error responses instead of treating them as successful', () => {
  assert.match(source, /if \(!result\?\.ok\) setDownloadError/);
  assert.match(source, /image could not be downloaded/);
});
