/**
 * M5 — PROVIDER SETTINGS HONESTY / LAUNCH UX: focused tests.
 *
 * The provider-key Settings surfaces must accurately reflect which saved keys
 * currently power working Creator OS media generation:
 *   - MuAPI stays visible and accurately described.
 *   - fal.ai stays visible and states what a saved key unlocks.
 *   - Kie.ai and OpenRouter must NOT read as currently working media providers.
 *
 * These are ADDITIVE UX-honesty changes: credential storage support for every
 * provider (and the server-side allowlist) is intentionally unchanged.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  BYOK_CREDENTIAL_PROVIDERS,
  PROVIDER_LAUNCH_STATUS,
  providerIsLaunchAvailable,
  providerLaunchStatus,
} from "./providerCredentialClient.js";

const shell = readFileSync(new URL("../../../../../components/StandaloneShell.js", import.meta.url), "utf8");
const legacySettings = readFileSync(new URL("../../../../../src/components/SettingsModal.js", import.meta.url), "utf8");

/* ------------------------------------------------------------------
 * Launch-status vocabulary
 * ------------------------------------------------------------------ */

test("M5 MuAPI remains visible and described as powering media generation", () => {
  const muapi = providerLaunchStatus("muapi");
  assert.equal(muapi.state, "available");
  assert.equal(muapi.label, "MuAPI");
  assert.equal(providerIsLaunchAvailable("muapi"), true);
  assert.match(muapi.detail, /media generation/i);
  // MuAPI must still be offered in the credential UI.
  assert.ok(BYOK_CREDENTIAL_PROVIDERS.includes("muapi"));
});

test("M5 fal.ai remains visible and states what a saved key unlocks", () => {
  const fal = providerLaunchStatus("fal");
  assert.equal(fal.state, "available");
  assert.equal(fal.label, "fal.ai");
  assert.equal(providerIsLaunchAvailable("fal"), true);
  assert.match(fal.detail, /Image Studio/);
  assert.match(fal.detail, /FLUX Schnell/);
  assert.ok(BYOK_CREDENTIAL_PROVIDERS.includes("fal"));
});

test("M5 Kie is not presented as a working media provider", () => {
  const kie = providerLaunchStatus("kie");
  assert.equal(kie.state, "not_available");
  assert.equal(providerIsLaunchAvailable("kie"), false);
  assert.match(kie.detail, /does not unlock Creator OS media generation/i);
});

test("M5 OpenRouter is not presented as a working media provider", () => {
  const openrouter = providerLaunchStatus("openrouter");
  assert.equal(openrouter.state, "not_available");
  assert.equal(providerIsLaunchAvailable("openrouter"), false);
  assert.match(openrouter.detail, /not a Creator OS media generation provider/i);
});

test("M5 only MuAPI and fal.ai are launch-available; every launched provider has honest copy", () => {
  const available = BYOK_CREDENTIAL_PROVIDERS.filter(providerIsLaunchAvailable).sort();
  assert.deepEqual(available, ["fal", "muapi"]);

  for (const provider of BYOK_CREDENTIAL_PROVIDERS) {
    const status = providerLaunchStatus(provider);
    assert.ok(typeof status.label === "string" && status.label.length > 0, `${provider} needs a label`);
    assert.ok(typeof status.detail === "string" && status.detail.length > 0, `${provider} needs honest detail copy`);
    assert.ok(["available", "not_available"].includes(status.state), `${provider} needs a known state`);
  }
});

test("M5 unknown providers default to not available rather than implying availability", () => {
  const unknown = providerLaunchStatus("kie-video");
  assert.equal(unknown.state, "not_available");
  assert.equal(providerIsLaunchAvailable("kie-video"), false);
});

/* ------------------------------------------------------------------
 * Live Settings surface (components/StandaloneShell.js)
 * ------------------------------------------------------------------ */

test("M5 live Settings renders provider rows from honest launch metadata", () => {
  assert.match(shell, /providerLaunchStatus\(provider\)/);
  assert.match(shell, /providerIsLaunchAvailable\(provider\)/);
  assert.match(shell, /\{launch\.detail\}/);
  // The old hardcoded label ternary (which implied all four providers were equal) is gone.
  assert.doesNotMatch(shell, /provider === 'kie' \? 'Kie\.ai'/);
});

test("M5 live Settings marks non-functional providers as not active", () => {
  assert.match(shell, /Not active/);
});

test("M5 live Settings no longer offers a blanket 'one or more generation providers' promise", () => {
  assert.doesNotMatch(shell, /Configure one or more generation providers/i);
});

/* ------------------------------------------------------------------
 * Legacy Electron settings surface stays honest too
 * ------------------------------------------------------------------ */

test("M5 legacy Settings surface also uses honest launch metadata", () => {
  assert.match(legacySettings, /providerLaunchStatus\(provider\)/);
  assert.match(legacySettings, /providerIsLaunchAvailable\(provider\)/);
  assert.match(legacySettings, /not active/);
  assert.doesNotMatch(legacySettings, /Configure one or more generation providers/i);
});

/* ------------------------------------------------------------------
 * Credential backend must be untouched
 * ------------------------------------------------------------------ */

test("M5 leaves credential storage support and the provider list unchanged", () => {
  // The provider list is the storage contract — unchanged by M5.
  assert.deepEqual(BYOK_CREDENTIAL_PROVIDERS, ["muapi", "kie", "fal", "openrouter"]);

  // Kie/OpenRouter keys can still be stored and revoked even though the UI is honest.
  assert.match(shell, /saveProviderCredential\(provider/);
  assert.match(shell, /revokeProviderCredential\(provider/);
  assert.match(shell, /readProviderCredentialStatus\(provider/);

  // No provider row was removed from the live UI.
  assert.match(shell, /BYOK_CREDENTIAL_PROVIDERS\.map/);
});

test("M5 does not modify the server credential allowlist or storage routes", async () => {
  // The server-side allowlist still accepts storage for every provider, including
  // the two that M5 only labels as not-yet-active.
  const { BYOK_PROVIDER_IDS } = await import("../../../../../src/lib/providerCredentialApi.js");
  assert.deepEqual([...BYOK_PROVIDER_IDS], ["muapi", "kie", "fal", "openrouter"]);

  // The storage route still exposes GET/POST/DELETE for any allowed provider.
  const route = readFileSync(new URL("../../../../../app/api/provider-credentials/[provider]/route.js", import.meta.url), "utf8");
  assert.match(route, /saveByokCredential/);
  assert.match(route, /readByokCredential/);
  assert.match(route, /revokeByokCredential/);
});
