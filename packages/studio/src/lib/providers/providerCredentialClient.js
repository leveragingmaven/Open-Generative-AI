const MUAPI_CREDENTIAL_PATH = "/api/provider-credentials/muapi";

async function requestCredential(fetcher, options) {
  const response = await fetcher(MUAPI_CREDENTIAL_PATH, options);
  let body = {};
  try { body = await response.json(); } catch {}
  if (!response.ok) {
    const error = new Error(body?.error || "Unable to manage the MuAPI credential.");
    error.code = body?.code || "provider_credential_request_failed";
    throw error;
  }
  return {
    provider: "muapi",
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
