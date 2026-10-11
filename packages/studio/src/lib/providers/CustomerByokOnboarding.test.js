import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// The shell is a React component with no renderer available to this suite, so —
// as in ProviderSettingsHonesty.test.js — the onboarding contract is asserted
// against the component source: which credential satisfies the studio gate,
// where the status is read from, and how a rejected key is recovered from.
const shell = readFileSync(new URL("../../../../../components/StandaloneShell.js", import.meta.url), "utf8");

test("a saved server-side credential satisfies the studio gate, not only a pasted browser key", () => {
  // The gate is what stands between a customer and the studios. A customer who
  // onboarded through Settings holds an encrypted credential on the server and
  // no key in this browser, so the credential must unlock the same gate.
  assert.match(shell, /const hasLaunchReadyCredential = BYOK_CREDENTIAL_PROVIDERS\r?\n?\s*\.filter\(providerIsLaunchAvailable\)/);
  assert.match(shell, /\.some\(\(provider\) => byokStatuses\[provider\]\?\.configured === true\)/);
  assert.match(shell, /if \(!agencyMode && !apiKey && !hasLaunchReadyCredential && !isStudioHome/);
  // The legacy pasted-key path is untouched: a browser key still clears the gate.
  assert.match(shell, /const \[apiKey, setApiKey\] = useState\(null\)/);
  assert.match(shell, /localStorage\.setItem\(STORAGE_KEY, key\)/);
});

test("only providers that can actually power generation unlock the studios", () => {
  // A stored Kie.ai or OpenRouter key cannot generate anything, so it must never
  // unlock the media studios.
  assert.equal((shell.match(/BYOK_CREDENTIAL_PROVIDERS\.filter\(providerIsLaunchAvailable\)/g) || []).length >= 1, true);
  assert.match(shell, /import \{ BYOK_CREDENTIAL_PROVIDERS, providerIsLaunchAvailable, providerLaunchStatus, readProviderCredentialStatus, revokeProviderCredential, saveProviderCredential \}/);
  assert.equal(/BYOK_CREDENTIAL_PROVIDERS\s*\.\s*some\(/.test(shell), false);
});

test("a signed-in customer's credential status is loaded from the same client Settings writes", () => {
  // Status is read on mount for non-agency accounts, from the client whose
  // response is a configured/status/updatedAt summary only.
  assert.match(shell, /if \(agencyMode\) return undefined;\r?\n\s*let cancelled = false;/);
  assert.match(shell, /await readProviderCredentialStatus\(provider\)/);
  assert.match(shell, /setByokStatuses\(\(current\) => \(\{ \.\.\.current, \.\.\.Object\.fromEntries\(statuses\) \}\)\)/);
  // A credential response can never become a browser key: nothing assigns the
  // stored credential into apiKey, and the browser key still comes from input.
  assert.equal(/setApiKey\((?!null|stored|key)[^)]*\)/.test(shell), false);
  assert.match(shell, /const handleKeySave = useCallback\(\(key\) => \{/);
});

test("a rejected key opens the place where it can be replaced", () => {
  // The provider layer emits `muapi:auth-required` on 401/403. Nothing listened
  // to it before, so an invalid stored key ended in a dead end.
  assert.match(shell, /window\.addEventListener\('muapi:auth-required', onAuthRequired\)/);
  assert.match(shell, /return \(\) => window\.removeEventListener\('muapi:auth-required', onAuthRequired\)/);
  const listener = /useEffect\(\(\) => \{\r?\n\s*if \(agencyMode \|\| !hasLaunchReadyCredential\) return undefined;[\s\S]*?\}, \[agencyMode, hasLaunchReadyCredential, openSettings\]\);/.exec(shell)?.[0] || "";
  assert.notEqual(listener, "");
  assert.match(listener, /void openSettings\(\)/);
  const providerLayer = readFileSync(new URL("../../muapi.js", import.meta.url), "utf8");
  assert.match(providerLayer, /window\.dispatchEvent\(new CustomEvent\('muapi:auth-required'/);
});

test("a customer with no credential at all is told about the secure Settings path", () => {
  assert.match(shell, /add the key under Settings on the Studio home and keep it encrypted on the server/);
  assert.match(shell, /<ApiKeyModal onSave=\{handleKeySave\} subtitle=\{/);
});

test("administrator BYOK is untouched by the customer credential path", () => {
  // Agency mode still blanks the browser key, still reads no credential status,
  // and still never opens the customer recovery prompt.
  assert.match(shell, /if \(agencyMode\) \{\r?\n\s*setApiKey\(null\);\r?\n\s*setBalance\(null\);\r?\n\s*return;/);
  assert.match(shell, /if \(agencyMode\) return undefined;\r?\n\s*let cancelled = false;/);
  assert.match(shell, /if \(agencyMode \|\| !hasLaunchReadyCredential\) return undefined;/);
});
