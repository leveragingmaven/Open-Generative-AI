import { NextResponse } from 'next/server';
import { getMuApiBaseUrl, getServerMuApiKey, isAgencyModeEnabled } from '@/src/lib/agencyMode';
import { requireCreatorIdentity } from '@/src/lib/creatorOsAuth';
import { requireCreatorOsRateLimit } from '@/src/lib/creatorOsRateLimit';
import { enrichAgentPredictionResult } from '@/src/lib/agentExecutionProposal';
import { getAgentChatResponseContext } from '@/src/lib/agentChatResponseContext';
import { resolveProviderCredential } from '@/src/lib/providerCredentialResolver';

function cleanHeaders(request) {
    const headers = new Headers(request.headers);
    headers.delete('host');
    headers.delete('connection');
    headers.delete('cookie');
    headers.delete('content-length');
    headers.delete('x-api-key');
    headers.delete('authorization');
    return headers;
}

// Credential source seam for the central MuAPI proxy.
// Agency Mode always uses the server-owned MuAPI key and never touches a
// customer credential. Non-agency (authenticated customer) traffic resolves the
// customer's own encrypted, server-side MuAPI credential from trusted identity
// only. An incoming browser `x-api-key` header is never a credential source.
export async function resolveProxyMuApiCredential({
    identity,
    agencyMode = isAgencyModeEnabled(),
    getServerKey = getServerMuApiKey,
    resolveCredential = resolveProviderCredential,
} = {}) {
    if (agencyMode) {
        return getServerKey();
    }

    return resolveCredential({
        accountId: identity?.accountId,
        creatorIdentityKey: identity?.identityKey,
        providerId: 'muapi',
    });
}

export function credentialResolutionErrorResponse(error) {
    const code = error?.code;

    if (code === 'credential_identity_required' || code === 'creator_os_auth_required') {
        return NextResponse.json(
            { error: 'Creator OS authentication required.', code: 'creator_os_auth_required' },
            { status: 401 }
        );
    }

    if (code === 'provider_credential_required:muapi' || code === 'provider_credential_unavailable:muapi') {
        return NextResponse.json(
            { error: 'MuAPI BYOK credential is not configured for this account.', code },
            { status: 503 }
        );
    }

    // Do not expose resolver, storage, decryption, or provider details.
    return NextResponse.json(
        { error: 'MuAPI credential service is temporarily unavailable.', code: 'muapi_credential_unavailable' },
        { status: 500 }
    );
}

function missingApiKeyResponse() {
    return NextResponse.json(
        { error: 'MUAPI_API_KEY is not configured.' },
        { status: 500 }
    );
}

function buildTargetUrl(request, pathSegments) {
    const path = (pathSegments || []).join('/');
    const { search } = new URL(request.url);
    const baseUrl = getMuApiBaseUrl().replace(/\/+$/, '');
    return `${baseUrl}/api/v1/${path}${search}`;
}

async function toNextResponse(response, { predictionContext = null, isPredictionResult = false } = {}) {
    const contentType = response.headers.get('content-type') || 'application/json';
    const text = await response.text();

    if (contentType.includes('application/json')) {
        try {
            const body = JSON.parse(text || '{}');
            return NextResponse.json(isPredictionResult ? enrichAgentPredictionResult(body, predictionContext || {}) : body, { status: response.status });
        } catch {
            return NextResponse.json({ error: text || response.statusText }, { status: response.status });
        }
    }

    return new NextResponse(text, {
        status: response.status,
        headers: { 'content-type': contentType },
    });
}

async function proxyMuApiRequest(request, { params }, dependencies) {
    const {
        agencyMode = isAgencyModeEnabled(),
        identity: injectedIdentity,
        getServerKey = getServerMuApiKey,
        resolveCredential = resolveProviderCredential,
        fetchImpl = fetch,
    } = dependencies || {};

    const auth = await requireCreatorIdentity(request);
    if (auth.response) return auth.response;
    const rateLimit = requireCreatorOsRateLimit(request, auth.identity, { agencyFunded: agencyMode });
    if (rateLimit) return rateLimit;
    const slug = await params;
    const targetUrl = buildTargetUrl(request, slug.path);
    const headers = cleanHeaders(request);

    let apiKey;
    try {
        apiKey = await resolveProxyMuApiCredential({
            identity: injectedIdentity || auth.identity,
            agencyMode,
            getServerKey,
            resolveCredential,
        });
    } catch (error) {
        // Never surface resolver internals or credential material to the caller.
        return credentialResolutionErrorResponse(error);
    }

    if (agencyMode && !apiKey) {
        return missingApiKeyResponse();
    }

    if (!apiKey) {
        return credentialResolutionErrorResponse({ code: 'provider_credential_required:muapi' });
    }

    // The credential is always supplied server-side, never from browser headers.
    headers.set('x-api-key', apiKey);

    try {
        const body = request.method === 'GET' || request.method === 'HEAD'
            ? undefined
            : await request.arrayBuffer();

        const response = await fetchImpl(targetUrl, {
            method: request.method,
            headers,
            body,
        });

        const predictionId = slug.path?.[0] === 'predictions' && slug.path?.[2] === 'result' ? slug.path[1] : null;
        return toNextResponse(response, {
            predictionContext: predictionId ? getAgentChatResponseContext(predictionId) : null,
            isPredictionResult: Boolean(predictionId),
        });
    } catch (error) {
        return NextResponse.json(
            { error: error.message || 'MuAPI proxy request failed.' },
            { status: 502 }
        );
    }
}

// Proxies /api/api/v1/* -> MUAPI_BASE_URL/api/v1/*.
// The Studio package builds this double /api/api path through its local BASE_URL.
export async function GET(request, context) {
    return proxyMuApiRequest(request, context);
}

export async function POST(request, context) {
    return proxyMuApiRequest(request, context);
}
