// Phase 7.1c safety guard.
//
// The legacy-import hazard is a wiring hazard, not only a store hazard: the store can
// be perfectly safe and the app can still claim a shared browser's data by calling the
// import path unattended. These assertions pin the wiring, so a future edit that
// re-introduces an automatic adoption fails here instead of in production.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const contextSource = readFileSync(new URL('./CampaignContext.js', import.meta.url), 'utf8');
const workspaceSource = readFileSync(new URL('../../components/CampaignWorkspace.jsx', import.meta.url), 'utf8');
const storeSource = readFileSync(new URL('./CampaignStore.js', import.meta.url), 'utf8');

function effectBody(source) {
  const start = source.indexOf('const sync = async () => {');
  assert.notEqual(start, -1, 'the hydration effect must still exist');
  const end = source.indexOf('void sync();', start);
  assert.notEqual(end, -1, 'the hydration effect must still be invoked');
  return source.slice(start, end);
}

test('hydration detects quarantined legacy data and never imports it by itself', () => {
  const sync = effectBody(contextSource);
  assert.match(sync, /detectLegacyProjects\(\)/, 'hydration must detect');
  assert.doesNotMatch(sync, /importLegacyProjects|importQuarantinedProjects/, 'hydration must never adopt browser-local campaigns');
});

test('the provider only reaches the import path through the confirmed user action', () => {
  const actionStart = contextSource.indexOf('importLegacyProjects: async () => {');
  assert.notEqual(actionStart, -1, 'the explicit import action must exist');
  const action = contextSource.slice(actionStart, contextSource.indexOf('discardLegacyProjects', actionStart));
  // The only adoption path is the user-driven one, and it is always confirmed.
  assert.match(action, /confirm: true/);
  const adoptions = contextSource.match(/importQuarantinedProjects\(/g) || [];
  assert.equal(adoptions.length, 1, 'there must be exactly one adoption call site, inside the user action');
  assert.ok(actionStart > contextSource.indexOf('useMemo'), 'the adoption call must live in the exposed action, not in an effect');
});

test('the campaign screen offers recovery only when a quarantine exists, and hides the names', () => {
  assert.match(workspaceSource, /legacyQuarantineCount > 0/, 'the notice must be conditional on a quarantine');
  assert.match(workspaceSource, /Import into this account/);
  assert.match(workspaceSource, /They are not mine — discard/);
  assert.match(workspaceSource, /may belong to a different creator/);
  // Only the count is rendered; the quarantined campaign names stay hidden until the
  // person at the device makes the decision.
  const notice = workspaceSource.slice(
    workspaceSource.indexOf('legacyQuarantineCount > 0'),
    workspaceSource.indexOf('{loading ? ('),
  );
  assert.doesNotMatch(notice, /legacyQuarantine\?\.items|items\.map/, 'campaign names must not be listed before confirmation');
});

test('the store never writes a scoped cache or a claim marker from detection', () => {
  const detectionStart = storeSource.indexOf('detectLegacyProjects() {');
  assert.notEqual(detectionStart, -1);
  const detection = storeSource.slice(detectionStart, storeSource.indexOf('getQuarantinedProjects() {', detectionStart));
  assert.match(detection, /QUARANTINE_KEY/, 'detection quarantines');
  assert.doesNotMatch(detection, /writeCache|IMPORT_CLAIM_KEY|client\./, 'detection must not claim, cache or call the network');
  assert.match(detection, /removeKey\(LEGACY_STORAGE_KEY\)/);
});
