import { NextResponse } from 'next/server.js';
import { requireCreatorIdentity } from '../../../../../src/lib/creatorOsAuth.js';
import { requireCreatorOsRateLimit } from '../../../../../src/lib/creatorOsRateLimit.js';
import { getZernioClient } from '../../../../../src/lib/zernioClient.js';
import { MySqlZernioRepository } from '../../../../../src/lib/zernioRepository.js';
import { MySqlCreativeAssetRepository } from '../../../../../src/lib/creativeAssetRepository.js';
import {
  ensureZernioProfile,
  getZernioConnectUrl,
  listTenantZernioAccounts,
  listTenantZernioConversations,
  getTenantZernioMessages,
  sendTenantZernioMessage,
  publishZernioNow,
  sanitizeZernioError,
} from '../../../../../src/lib/zernioSocialService.js';

function jsonError(error, fallback = 'Maven Social is temporarily unavailable.') {
  const safe = sanitizeZernioError(error, fallback);
  return NextResponse.json({ error: safe.message, code: safe.code }, { status: safe.status });
}

function routeKey(path = []) {
  if (path.length === 0) return '';
  if (path.join('/') === 'accounts') return 'accounts';
  if (path.join('/') === 'accounts/connect') return 'accounts/connect';
  if (path.join('/') === 'posts') return 'posts';
  if (path.join('/') === 'profile') return 'profile';
  if (path.join('/') === 'inbox/conversations') return 'inbox/conversations';
  if (path[0] === 'inbox' && path[1] === 'conversations' && path.length === 4 && path[3] === 'messages') return 'inbox/conversations/:conversationId/messages';
  if (path[0] === 'accounts' && path.length === 2) return 'accounts/:accountId';
  return path.join('/');
}

function firstHeaderValue(request, name) {
  return request.headers.get(name)?.split(',')[0]?.trim() || '';
}

function forwardedOrigin(request) {
  const requestOrigin = new URL(request.url);
  const forwarded = firstHeaderValue(request, 'forwarded');
  const forwardedParameters = forwarded
    ? Object.fromEntries(forwarded.split(';').map((part) => {
      const separator = part.indexOf('=');
      if (separator < 0) return [part.trim().toLowerCase(), ''];
      return [part.slice(0, separator).trim().toLowerCase(), part.slice(separator + 1).trim().replace(/^"|"$/g, '')];
    }))
    : {};
  const protocol = forwardedParameters.proto || firstHeaderValue(request, 'x-forwarded-proto') || requestOrigin.protocol.slice(0, -1);
  const host = forwardedParameters.host || firstHeaderValue(request, 'x-forwarded-host') || requestOrigin.host;
  if (!['http', 'https'].includes(protocol) || !host || /[\\/?#@]/.test(host)) return requestOrigin.origin;
  try {
    return new URL(`${protocol}://${host}`).origin;
  } catch {
    return requestOrigin.origin;
  }
}

function sameOriginRedirect(request, value) {
  const origin = forwardedOrigin(request);
  if (!value) return `${origin}/studio/publishing`;
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin) {
      const error = new Error('OAuth return URL must remain inside Creator OS.');
      error.code = 'zernio_invalid_redirect';
      error.status = 400;
      throw error;
    }
    return url.toString();
  } catch (error) {
    if (error.code === 'zernio_invalid_redirect') throw error;
    const invalid = new Error('OAuth return URL is invalid.');
    invalid.code = 'zernio_invalid_redirect';
    invalid.status = 400;
    throw invalid;
  }
}

async function body(request) {
  try { return await request.json(); } catch { return {}; }
}

export async function handleZernioPublishingRequest(request, {
  params,
  authenticate = requireCreatorIdentity,
  rateLimit = requireCreatorOsRateLimit,
  repository = new MySqlZernioRepository(),
  assetRepository = null,
  client = getZernioClient(),
} = {}) {
  const auth = await authenticate(request);
  if (auth.response) return auth.response;
  const limited = rateLimit(request, auth.identity, { agencyFunded: false });
  if (limited) return limited;

  const resolvedParams = await params;
  const key = routeKey(resolvedParams?.path || []);
  if (request.method === 'GET' && key === 'profile') {
    try {
      const profile = await ensureZernioProfile({ identity: auth.identity, repository, client });
      return NextResponse.json({ profile: { name: profile.profileName } });
    } catch (error) {
      return jsonError(error, 'Unable to load the Maven Social profile.');
    }
  }

  if (request.method === 'GET' && key === 'accounts') {
    try {
      return NextResponse.json(await listTenantZernioAccounts({ identity: auth.identity, repository, client }));
    } catch (error) {
      return jsonError(error, 'Unable to load Maven Social accounts.');
    }
  }

  if (request.method === 'GET' && key === 'accounts/:accountId') {
    try {
      const result = await listTenantZernioAccounts({ identity: auth.identity, repository, client });
      const requestedId = String(resolvedParams.path[1]);
      const account = result.accounts.find((candidate) => String(candidate.id) === requestedId);
      if (!account) {
        const error = new Error('The requested social account is not available to this tenant.');
        error.code = 'zernio_account_not_owned';
        error.status = 403;
        throw error;
      }
      return NextResponse.json({ account });
    } catch (error) {
      return jsonError(error, 'Unable to load the requested Maven Social account.');
    }
  }

  if (request.method === 'GET' && key === 'inbox/conversations') {
    try {
      return NextResponse.json(await listTenantZernioConversations({ identity: auth.identity, repository, client }));
    } catch (error) {
      return jsonError(error, 'Unable to load Maven Social inbox conversations.');
    }
  }

  if (request.method === 'GET' && key === 'inbox/conversations/:conversationId/messages') {
    try {
      const accountId = new URL(request.url).searchParams.get('accountId');
      return NextResponse.json(await getTenantZernioMessages({
        identity: auth.identity,
        conversationId: resolvedParams.path[2],
        accountId,
        repository,
        client,
      }));
    } catch (error) {
      return jsonError(error, 'Unable to load Maven Social conversation messages.');
    }
  }

  if (request.method === 'POST' && key === 'inbox/conversations/:conversationId/messages') {
    try {
      const input = await body(request);
      const result = await sendTenantZernioMessage({
        identity: auth.identity,
        conversationId: resolvedParams.path[2],
        accountId: input.accountId,
        message: input.message,
        repository,
        client,
      });
      return NextResponse.json(result);
    } catch (error) {
      return jsonError(error, 'Unable to send the Maven Social message.');
    }
  }

  if (request.method === 'POST' && key === 'posts') {
    try {
      const input = await body(request);
      const result = await publishZernioNow({
        identity: auth.identity,
        draftId: input.draftId,
        content: input.content,
        assetIds: Array.isArray(input.assetIds) ? input.assetIds : [],
        platforms: Array.isArray(input.platforms) ? input.platforms : [],
        accountIds: input.accountIds && typeof input.accountIds === 'object' ? input.accountIds : {},
        repository,
        assetRepository: assetRepository || (Array.isArray(input.assetIds) && input.assetIds.length ? new MySqlCreativeAssetRepository() : undefined),
        client,
      });
      return NextResponse.json({
        status: result.status,
        postId: result.postId,
        platformResults: result.platformResults,
        publishedUrls: result.publishedUrls,
      }, { status: result.httpStatus });
    } catch (error) {
      return jsonError(error, 'Unable to publish with Maven Social.');
    }
  }

  if (request.method === 'POST' && key === 'accounts/connect') {
    try {
      const input = await body(request);
      const result = await getZernioConnectUrl({
        identity: auth.identity,
        platform: input.platform,
        redirectUrl: sameOriginRedirect(request, input.redirectTo || input.redirect_to),
        repository,
        client,
      });
      return NextResponse.json(result);
    } catch (error) {
      return jsonError(error, 'Unable to start the Maven Social account connection.');
    }
  }

  return NextResponse.json({ error: 'Maven Social route not found.', code: 'not_found' }, { status: 404 });
}

export async function GET(request, context) {
  return handleZernioPublishingRequest(request, context);
}

export async function POST(request, context) {
  return handleZernioPublishingRequest(request, context);
}
