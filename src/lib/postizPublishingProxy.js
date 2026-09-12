const envValue = (name) => String(process.env[name] || "").trim();

export async function fetchPostizIntegrations({ fetchFn = globalThis.fetch, requestUrl = "", apiUrl = envValue("POSTIZ_API_URL"), apiKey = envValue("POSTIZ_API_KEY") } = {}) {
    if (!apiUrl) return { ok: false, status: 500, data: { error: "POSTIZ_API_URL is not configured.", code: "missing_postiz_api_url" } };
    if (!apiKey) return { ok: false, status: 500, data: { error: "POSTIZ_API_KEY is not configured.", code: "missing_postiz_api_key" } };
    const suffix = requestUrl.includes("?") ? requestUrl.slice(requestUrl.indexOf("?")) : "";
    const response = await fetchFn(`${apiUrl.replace(/\/+$/, "")}/public/v1/integrations${suffix}`, {
        method: "GET",
        headers: { authorization: apiKey, "content-type": "application/json" },
    });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text || "{}"); } catch { data = { error: "Postiz returned an invalid response.", code: "postiz_invalid_response" }; }
    return { ok: response.ok, status: response.status, data };
}
