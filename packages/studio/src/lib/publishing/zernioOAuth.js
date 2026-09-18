const ZERNIO_OAUTH_QUERY_KEYS = [
  'connected',
  'profileId',
  'accountId',
  'username',
  'error',
  'platform',
  'error_message',
  'is_user_fixable',
  'reason',
  'dashboard_url',
  'state',
  'connect_token',
  'tempToken',
  'userProfile',
  'step',
];

export function connectionUrl(response = {}) {
  return response.authUrl
    || response.url
    || response.connect_url
    || response.connectUrl
    || response.authorization_url
    || response.authorizationUrl
    || response.data?.authUrl
    || response.data?.url
    || response.data?.connect_url
    || null;
}

function failureMessage(code = '') {
  switch (String(code).toLowerCase()) {
    case 'oauth_denied':
    case 'connection_cancelled':
      return 'Maven Social connection was cancelled or denied.';
    case 'payment_required':
      return 'Maven Social requires billing setup before this connection can start.';
    case 'platform_beta_restricted':
      return 'This Maven Social platform is currently unavailable.';
    case 'invalid_redirect':
    case 'invalid_redirect_url':
      return 'Maven Social could not validate the connection return URL.';
    case 'token_exchange_failed':
    case 'connection_failed':
      return 'Maven Social could not complete the connection. Please try again.';
    default:
      return 'Maven Social could not connect this account. Please try again.';
  }
}

export function parseOAuthReturn(search = '') {
  const params = search instanceof URLSearchParams ? search : new URLSearchParams(search);
  const connected = params.get('connected');
  if (connected) {
    return {
      kind: 'success',
      platform: connected,
      profileId: params.get('profileId'),
      accountId: params.get('accountId'),
      username: params.get('username'),
    };
  }

  const error = params.get('error');
  if (error) {
    return {
      kind: 'error',
      platform: params.get('platform'),
      message: failureMessage(error),
    };
  }

  return null;
}

export function cleanOAuthReturnUrl(href) {
  const url = new URL(href, 'http://creator-os.local');
  ZERNIO_OAUTH_QUERY_KEYS.forEach((key) => url.searchParams.delete(key));
  const path = `${url.pathname}${url.search}${url.hash}`;
  return url.origin === 'http://creator-os.local' ? path : url.toString();
}

export { ZERNIO_OAUTH_QUERY_KEYS };
