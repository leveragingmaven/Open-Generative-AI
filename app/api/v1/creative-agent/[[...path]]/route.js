import { getMuApiBaseUrl, getServerMuApiKey, isAgencyModeEnabled } from '../../../../../src/lib/agencyMode.js';
import { requireCreatorIdentity } from '../../../../../src/lib/creatorOsAuth.js';
import { requireCreatorOsRateLimit } from '../../../../../src/lib/creatorOsRateLimit.js';
import {
    DesignAgentSessionOwnershipError,
    DesignAgentSessionOwnershipService,
} from '../../../../../src/lib/designAgentSessionOwnership.js';

function getApiKey(request) {
    const serverKey = getServerMuApiKey();
    if (serverKey) return serverKey;
    if (isAgencyModeEnabled()) return null;
    return request.headers.get('x-api-key') || null;
}

function cleanHeaders(request) {
    const headers = new Headers(request.headers);
    headers.delete('host');
    headers.delete('connection');
    headers.delete('cookie');
    headers.delete('Authorization');
    headers.delete('authorization');
    headers.delete('x-api-key');
    headers.delete('content-length');
    return headers;
}

function jsonError(message, status, code) {
    return Response.json({ error: message, ...(code ? { code } : {}) }, { status });
}

function parseResponseText(text) {
    try {
        return JSON.parse(text || '{}');
    } catch {
        return { error: text || 'Design Agent request failed.' };
    }
}

function jsonResponse(data, status) {
    return Response.json(data, { status });
}

function ownershipError(error) {
    if (error instanceof DesignAgentSessionOwnershipError || error?.name === 'DesignAgentSessionOwnershipError') {
        return jsonError(
            error.code === 'design_session_scope_mismatch' || error.code === 'design_session_owner_conflict'
                ? 'The Design Agent session does not belong to the authenticated creator.'
                : 'Design Agent session ownership could not be verified.',
            error.status || 403,
            error.code,
        );
    }
    return null;
}

function scopedSessionId(pathSegments) {
    return pathSegments[0] === 'sessions' && pathSegments.length >= 2
        ? String(pathSegments[1] || '').trim()
        : '';
}

function createdSessionId(data) {
    return String(data?.id || data?.session_id || '').trim();
}

const CLIENT_OWNERSHIP_FIELDS = new Set([
    'account', 'accountid', 'creator', 'creatoridentitykey', 'creatorid', 'identity', 'identitykey',
    'user', 'userid', 'owner', 'ownerid', 'tenant', 'tenantid', 'authenticatedidentity',
]);

function sanitizeSessionCreationValue(value) {
    if (Array.isArray(value)) return value.map(sanitizeSessionCreationValue);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value)
        .filter(([key]) => !CLIENT_OWNERSHIP_FIELDS.has(key.replaceAll('_', '').replaceAll('-', '').toLowerCase()))
        .map(([key, entry]) => [key, sanitizeSessionCreationValue(entry)]));
}

function sanitizeSessionCreationBody(body) {
    try {
        const decoded = new TextDecoder().decode(body);
        return new TextEncoder().encode(JSON.stringify(sanitizeSessionCreationValue(JSON.parse(decoded || '{}'))));
    } catch {
        return body;
    }
}

async function filterOwnedSessions(data, identity, ownershipService) {
    const sessions = Array.isArray(data) ? data : Array.isArray(data?.sessions) ? data.sessions : null;
    if (!sessions) throw new DesignAgentSessionOwnershipError('design_session_list_invalid', 502);
    const ownedIds = await ownershipService.ownedSessionIds(identity);
    const filtered = sessions.filter((session) => ownedIds.has(createdSessionId(session)));
    return Array.isArray(data) ? filtered : { ...data, sessions: filtered };
}

export async function handleCreativeAgentProxyRequest(
    request,
    { params },
    {
        authenticate = requireCreatorIdentity,
        rateLimit = requireCreatorOsRateLimit,
        fetchImpl = globalThis.fetch,
        ownershipService = new DesignAgentSessionOwnershipService(),
        baseUrl = getMuApiBaseUrl(),
        apiKey = getApiKey(request),
        agencyMode = isAgencyModeEnabled(),
    } = {},
) {
    const auth = await authenticate(request);
    if (auth.response) return auth.response;
    const limited = await rateLimit(request, auth.identity, { agencyFunded: agencyMode });
    if (limited) return limited;

    const slug = await params;
    const pathSegments = slug?.path || [];
    const path = pathSegments.join('/');
    const method = request.method.toUpperCase();
    const designSessionId = scopedSessionId(pathSegments);
    const createsSession = method === 'POST' && pathSegments.length === 1 && pathSegments[0] === 'sessions';
    const listsSessions = method === 'GET' && pathSegments.length === 1 && pathSegments[0] === 'sessions';

    try {
        if (designSessionId) {
            await ownershipService.verifyOwnedSession({ designSessionId, identity: auth.identity });
        }
    } catch (error) {
        return ownershipError(error) || jsonError('Design Agent session ownership is unavailable.', 503, 'design_session_ownership_unavailable');
    }

    if (agencyMode && !apiKey) return jsonError('MUAPI_API_KEY is not configured.', 500);
    const { search } = new URL(request.url);
    const targetUrl = `${String(baseUrl).replace(/\/+$/, '')}/api/v1/creative-agent/${path}${search}`;
    const headers = cleanHeaders(request);
    if (apiKey) headers.set('x-api-key', apiKey);

    try {
        const requestBody = method === 'POST' || method === 'PATCH' ? await request.arrayBuffer() : undefined;
        const body = createsSession && requestBody ? sanitizeSessionCreationBody(requestBody) : requestBody;
        const response = await fetchImpl(targetUrl, { method, headers, ...(body ? { body } : {}) });
        const data = parseResponseText(await response.text());
        if (!response.ok) return jsonResponse(data, response.status);

        if (createsSession) {
            const returnedSessionId = createdSessionId(data);
            if (!returnedSessionId) {
                return jsonError('Design Agent did not return a session ID.', 502, 'design_session_id_missing');
            }
            try {
                await ownershipService.bindCreatedSession({ designSessionId: returnedSessionId, identity: auth.identity });
            } catch (error) {
                return ownershipError(error) || jsonError('Design Agent session ownership is unavailable.', 503, 'design_session_ownership_unavailable');
            }
        }

        if (listsSessions) {
            try {
                return jsonResponse(await filterOwnedSessions(data, auth.identity, ownershipService), response.status);
            } catch (error) {
                return ownershipError(error) || jsonError('Design Agent session ownership is unavailable.', 503, 'design_session_ownership_unavailable');
            }
        }
        return jsonResponse(data, response.status);
    } catch (error) {
        console.error(`[creative-agent proxy ${method} ERROR] ${targetUrl}:`, error.message);
        return jsonError(error.message || 'Design Agent proxy request failed.', 502);
    }
}

export const GET = (request, context) => handleCreativeAgentProxyRequest(request, context);
export const POST = (request, context) => handleCreativeAgentProxyRequest(request, context);
export const PATCH = (request, context) => handleCreativeAgentProxyRequest(request, context);
export const DELETE = (request, context) => handleCreativeAgentProxyRequest(request, context);

export const creativeAgentProxyInternals = {
    createdSessionId,
    filterOwnedSessions,
    sanitizeSessionCreationBody,
    scopedSessionId,
};
