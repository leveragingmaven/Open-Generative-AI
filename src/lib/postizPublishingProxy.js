const envValue = (name) => String(process.env[name] || "").trim();

export async function fetchPostizRequest({ fetchFn = globalThis.fetch, path, method = "GET", body, requestUrl = "", apiUrl = envValue("POSTIZ_API_URL"), apiKey = envValue("POSTIZ_API_KEY") } = {}) {
    if (!apiUrl) return { ok: false, status: 500, data: { error: "POSTIZ_API_URL is not configured.", code: "missing_postiz_api_url" } };
    if (!apiKey) return { ok: false, status: 500, data: { error: "POSTIZ_API_KEY is not configured.", code: "missing_postiz_api_key" } };
    const suffix = requestUrl.includes("?") ? requestUrl.slice(requestUrl.indexOf("?")) : "";
    const response = await fetchFn(`${apiUrl.replace(/\/+$/, "")}/public/v1/${path}${suffix}`, {
        method,
        headers: { authorization: apiKey, "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text || "{}"); } catch { data = { error: "Postiz returned an invalid response.", code: "postiz_invalid_response" }; }
    if (!response.ok) {
        return {
            ok: false,
            status: response.status,
            data: {
                error: response.status === 401 || response.status === 403 ? "Postiz publishing authentication failed." : "Postiz publishing request failed.",
                code: response.status === 401 || response.status === 403 ? "postiz_auth_error" : "postiz_api_error",
            },
        };
    }
    return { ok: true, status: response.status, data };
}

export function fetchPostizIntegrations(options = {}) {
    return fetchPostizRequest({ ...options, path: "integrations", method: "GET" });
}
