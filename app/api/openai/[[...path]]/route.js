import { NextResponse } from "next/server";
import { requireCreatorIdentity } from "@/src/lib/creatorOsAuth";
import { requireCreatorOsRateLimit } from "@/src/lib/creatorOsRateLimit";
import { isAgencyModeEnabled } from "@/src/lib/agencyMode";

function upstreamBase() {
  return (process.env.OPENAI_COMPATIBLE_BASE_URL || process.env.OPENAI_BASE_URL || "").replace(/\/+$/, "");
}

function cleanHeaders(request) {
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("content-length");
  return headers;
}

export async function GET(request, { params }) {
  return proxy(request, params, "GET");
}

export async function POST(request, { params }) {
  return proxy(request, params, "POST");
}

export async function PUT(request, { params }) {
  return proxy(request, params, "PUT");
}

async function proxy(request, params, method) {
  const auth = await requireCreatorIdentity(request);
  if (auth.response) return auth.response;
  const rateLimit = requireCreatorOsRateLimit(request, auth.identity, { agencyFunded: isAgencyModeEnabled() });
  if (rateLimit) return rateLimit;
  const base = upstreamBase();
  if (!base) return NextResponse.json({ error: "OpenAI-compatible endpoint is not configured.", code: "missing_openai_endpoint" }, { status: 503 });
  const resolved = await params;
  const path = Array.isArray(resolved?.path) ? resolved.path.join("/") : "";
  const incomingUrl = new URL(request.url);
  const target = `${base}/${path}${incomingUrl.search}`;
  try {
    const response = await fetch(target, {
      method,
      headers: cleanHeaders(request),
      body: method === "GET" ? undefined : await request.arrayBuffer(),
    });
    return new NextResponse(await response.arrayBuffer(), {
      status: response.status,
      headers: { "content-type": response.headers.get("content-type") || "application/json" },
    });
  } catch (error) {
    return NextResponse.json({ error: error.message || "OpenAI-compatible request failed.", code: "openai_proxy_error" }, { status: 502 });
  }
}
