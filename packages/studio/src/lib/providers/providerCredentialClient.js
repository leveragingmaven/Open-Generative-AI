const MUAPI_CREDENTIAL_PATH = "/api/provider-credentials/muapi";
export const BYOK_CREDENTIAL_PROVIDERS = ["muapi", "kie", "fal", "openrouter"];

// M5: customer-facing launch status for each storable BYOK provider.
//
// Credential STORAGE support remains for every provider in
// BYOK_CREDENTIAL_PROVIDERS (see saveProviderCredential/readProviderCredentialStatus
// below) and the server-side allowlist is unchanged. This metadata exists only so
// Settings can state honestly which saved keys currently power working Creator OS
// media generation.
export const PROVIDER_LAUNCH_STATUS = Object.freeze({
  muapi: Object.freeze({
    label: "MuAPI",
    state: "available",
    detail: "Powers Creator OS media generation across the studio — images, video, and audio.",
  }),
  fal: Object.freeze({
    label: "fal.ai",
    state: "available",
    detail: "Saving a fal.ai key unlocks the supported fal.ai models (FLUX Schnell and FLUX Schnell Redux) in Image Studio.",
  }),
  kie: Object.freeze({
    label: "Kie.ai",
    state: "not_available",
    detail: "Not active yet — a Kie.ai key can be stored, but it does not unlock Creator OS media generation.",
  }),
  openrouter: Object.freeze({
    label: "OpenRouter",
    state: "not_available",
    detail: "Not active — OpenRouter is not a Creator OS media generation provider.",
  }),
});

export function providerLaunchStatus(provider) {
  return (
    PROVIDER_LAUNCH_STATUS[provider] ||
    Object.freeze({
      label: provider,
      state: "not_available",
      detail: "Not active — this provider does not unlock Creator OS media generation.",
    })
  );
}

export function providerIsLaunchAvailable(provider) {
  return providerLaunchStatus(provider).state === "available";
}

async function requestCredential(fetcher, options) {
  const response = await fetcher(options.path || MUAPI_CREDENTIAL_PATH, options);
  let body = {};
  try { body = await response.json(); } catch {}
  if (!response.ok) {
    const error = new Error(body?.error || "Unable to manage the MuAPI credential.");
    error.code = body?.code || "provider_credential_request_failed";
    throw error;
  }
  return {
    provider: body?.provider || options.provider || "muapi",
    configured: body?.configured === true,
    status: body?.status || (body?.configured ? "active" : "not_configured"),
    updatedAt: body?.updatedAt || null,
  };
}

export function readMuApiCredentialStatus(fetcher = fetch) {
  return requestCredential(fetcher, { method: "GET", credentials: "same-origin" });
}

export function saveMuApiCredential(apiKey, fetcher = fetch) {
  const value = typeof apiKey === "string" ? apiKey.trim() : "";
  if (!value) {
    const error = new Error("Enter a MuAPI key before saving.");
    error.code = "provider_credential_required:muapi";
    return Promise.reject(error);
  }
  return requestCredential(fetcher, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ apiKey: value }),
  });
}

export function revokeMuApiCredential(fetcher = fetch) {
  return requestCredential(fetcher, { method: "DELETE", credentials: "same-origin" });
}

export function readProviderCredentialStatus(provider, fetcher = fetch) {
  return requestCredential(fetcher, { provider, method: "GET", credentials: "same-origin", path: `/api/provider-credentials/${encodeURIComponent(provider)}` });
}

export function saveProviderCredential(provider, apiKey, fetcher = fetch) {
  const value = typeof apiKey === "string" ? apiKey.trim() : "";
  if (!value) return Promise.reject(Object.assign(new Error(`Enter a ${provider} key before saving.`), { code: `provider_credential_required:${provider}` }));
  return requestCredential(fetcher, { provider, method: "POST", credentials: "same-origin", path: `/api/provider-credentials/${encodeURIComponent(provider)}`, headers: { "content-type": "application/json" }, body: JSON.stringify({ apiKey: value }) });
}

export function revokeProviderCredential(provider, fetcher = fetch) {
  return requestCredential(fetcher, { provider, method: "DELETE", credentials: "same-origin", path: `/api/provider-credentials/${encodeURIComponent(provider)}` });
}
