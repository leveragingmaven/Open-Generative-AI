import { getZernioClient } from './zernioClient.js';
import { MySqlZernioRepository, newZernioProfileName } from './zernioRepository.js';
import { getZernioConnectionOption, isZernioSpecialConnection } from '../../packages/studio/src/lib/publishing/zernioConnectionCatalog.js';

function requiredIdentity(identity) {
  const accountId = String(identity?.accountId || '').trim();
  const creatorIdentityKey = String(identity?.identityKey || identity?.creatorIdentityKey || '').trim();
  if (!accountId || !creatorIdentityKey) {
    const error = new Error('Authenticated Creator OS identity is required.');
    error.code = 'zernio_identity_required';
    error.status = 401;
    throw error;
  }
  return { accountId, identityKey: creatorIdentityKey, creatorIdentityKey };
}

const SAFE_PROVIDER_ERRORS = {
  PAYMENT_REQUIRED: {
    code: 'zernio_payment_required',
    status: 402,
    message: 'Maven Social requires provider billing setup before this connection can start.',
  },
  PLATFORM_BETA_RESTRICTED: {
    code: 'zernio_platform_beta_restricted',
    status: 403,
    message: 'This Maven Social platform is currently restricted by the provider.',
  },
  insufficient_permissions: {
    code: 'zernio_insufficient_permissions',
    status: 403,
    message: 'The Maven Social API key does not have permission for this connection.',
  },
};

function providerErrorCode(response) {
  const candidate = response?.error?.code || response?.error?.error?.code || response?.error?.reason;
  return typeof candidate === 'string' ? candidate.trim() : '';
}

function unwrapResponse(response, fallback = 'Maven Social is temporarily unavailable.') {
  if (response?.error) {
    const providerCode = providerErrorCode(response);
    const mapped = SAFE_PROVIDER_ERRORS[providerCode];
    const error = new Error(mapped?.message || fallback);
    error.code = mapped?.code || 'zernio_upstream_error';
    error.status = mapped?.status || response?.response?.status || 502;
    error.providerStatus = response?.response?.status;
    throw error;
  }
  return response?.data || response || {};
}

function dataOf(response) {
  return unwrapResponse(response);
}

function listOf(response, key) {
  const data = dataOf(response);
  if (Array.isArray(data?.[key])) return data[key];
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data)) return data;
  return [];
}

function profileIdOf(profile) {
  return profile?._id || profile?.id || profile?.profileId || null;
}

function profileNameOf(profile) {
  return profile?.name || profile?.profileName || null;
}

function profileRecord(profile, identity) {
  const zernioProfileId = profileIdOf(profile);
  if (!zernioProfileId) {
    const error = new Error('Zernio returned an invalid profile.');
    error.code = 'zernio_invalid_profile_response';
    error.status = 502;
    throw error;
  }
  return {
    zernioProfileId: String(zernioProfileId),
    accountId: String(identity.accountId),
    creatorIdentityKey: identity.creatorIdentityKey,
    profileName: profileNameOf(profile) || newZernioProfileName(identity.accountId),
    status: profile?.status || 'active',
  };
}

function statusOf(account) {
  const value = String(account?.status || account?.connectionStatus || '').toLowerCase();
  if (['connected', 'active', 'healthy', 'published'].includes(value)) return 'connected';
  if (['disconnected', 'revoked', 'cancelled', 'canceled', 'failed', 'error'].includes(value)) return 'disconnected';
  if (['needs_reconnect', 'reconnect_required', 'expired', 'invalid'].includes(value)) return 'needs_reconnect';
  return account?.isActive === false || account?.is_active === false ? 'disconnected' : 'unknown';
}

export function normalizeZernioAccount(account = {}, profile, identity) {
  const zernioAccountId = account?._id || account?.id || account?.accountId || account?.account_id;
  if (zernioAccountId === undefined || zernioAccountId === null || zernioAccountId === '') return null;
  const status = statusOf(account);
  return {
    zernioAccountId: String(zernioAccountId),
    zernioProfileId: String(profile.zernioProfileId),
    accountId: String(identity.accountId),
    creatorIdentityKey: identity.creatorIdentityKey,
    platform: String(account.platform || account.network || account.type || '').toLowerCase(),
    username: account.username || account.handle || null,
    displayName: account.displayName || account.display_name || account.name || null,
    profileImageUrl: account.profileImageUrl || account.profile_image_url || account.avatar || account.avatarUrl || null,
    status,
    isActive: account.isActive !== false && account.is_active !== false && status !== 'disconnected',
    needsReconnect: status === 'needs_reconnect' || account.needsReconnect === true || account.needs_reconnect === true,
  };
}

export function sanitizeZernioAccount(account = {}) {
  return {
    id: account.zernioAccountId,
    platform: account.platform,
    username: account.username,
    displayName: account.displayName,
    profileImageUrl: account.profileImageUrl,
    status: account.status,
    connected: account.isActive,
    needsReconnect: account.needsReconnect,
    provider: 'zernio',
  };
}

export function sanitizeZernioProfile(profile = {}) {
  return {
    name: profile.profileName,
    status: profile.status,
  };
}

function isProfileConflict(error) {
  return error?.status === 409 || error?.statusCode === 409 || error?.code === 'profile_name_conflict' || error?.body?.code === 'profile_name_conflict';
}

export async function ensureZernioProfile({ identity, repository = new MySqlZernioRepository(), client = getZernioClient() } = {}) {
  const owner = requiredIdentity(identity);
  const existing = await repository.getProfile(owner);
  if (existing) return existing;

  const profileName = newZernioProfileName(owner.accountId);
  try {
    const response = await client.profiles.createProfile({ body: { name: profileName, description: 'Maven Social' } });
    const profile = profileRecord(dataOf(response).profile || dataOf(response), owner);
    return repository.saveProfile({ ...profile, ...owner });
  } catch (error) {
    if (!isProfileConflict(error) || !client.profiles?.listProfiles) throw sanitizeZernioError(error, 'Unable to create the Maven Social profile.');
    const profiles = listOf(unwrapResponse(await client.profiles.listProfiles(), 'Unable to load Maven Social profiles.'), 'profiles');
    const matching = profiles.find((candidate) => profileNameOf(candidate) === profileName);
    if (!matching) throw sanitizeZernioError(error, 'Unable to create the Maven Social profile.');
    const profile = profileRecord(matching, owner);
    return repository.saveProfile({ ...profile, ...owner });
  }
}

export async function getZernioConnectUrl({ identity, platform, redirectUrl, repository = new MySqlZernioRepository(), client = getZernioClient() } = {}) {
  const owner = requiredIdentity(identity);
  const option = getZernioConnectionOption(platform);
  if (!option) {
    const error = new Error('The requested Maven Social platform is not supported.');
    error.code = 'zernio_platform_not_supported';
    error.status = 400;
    throw error;
  }
  if (isZernioSpecialConnection(option)) {
    const error = new Error('This Maven Social connection flow is not available yet.');
    error.code = 'zernio_special_connection_not_available';
    error.status = 501;
    throw error;
  }
  const profile = await ensureZernioProfile({ identity: owner, repository, client });
  const query = { profileId: profile.zernioProfileId };
  if (redirectUrl) query.redirect_url = redirectUrl;
  const response = await client.connect.getConnectUrl({ path: { platform: option.zernioPlatform }, query });
  const data = unwrapResponse(response, 'Unable to start the Maven Social account connection.');
  const authUrl = data.authUrl || data.authorizationUrl || data.url;
  if (!authUrl) throw sanitizeZernioError({ code: 'zernio_invalid_connect_response' }, 'Zernio did not return a connection URL.');
  return { authUrl: String(authUrl), state: data.state || null };
}

export async function listTenantZernioAccounts({ identity, repository = new MySqlZernioRepository(), client = getZernioClient() } = {}) {
  const owner = requiredIdentity(identity);
  const profile = await ensureZernioProfile({ identity: owner, repository, client });
  const response = await client.accounts.listAccounts({ query: { profileId: profile.zernioProfileId } });
  const accounts = listOf(unwrapResponse(response, 'Unable to load Maven Social accounts.'), 'accounts')
    .map((account) => normalizeZernioAccount(account, profile, owner))
    .filter(Boolean);
  const stored = await repository.saveAccounts({ ...owner, zernioProfileId: profile.zernioProfileId, accounts });
  return {
    profile: sanitizeZernioProfile(profile),
    accounts: stored.map(sanitizeZernioAccount),
  };
}

export async function getTenantZernioAccount({ identity, zernioAccountId, repository = new MySqlZernioRepository(), client = getZernioClient() } = {}) {
  const owner = requiredIdentity(identity);
  const id = String(zernioAccountId || '').trim();
  if (!id) {
    const error = new Error('Zernio account id is required.');
    error.code = 'zernio_account_id_required';
    error.status = 400;
    throw error;
  }
  const profile = await ensureZernioProfile({ identity: owner, repository, client });
  const account = await repository.getAccount({ ...owner, zernioProfileId: profile.zernioProfileId, zernioAccountId: id });
  if (!account) {
    const error = new Error('The requested social account is not available to this tenant.');
    error.code = 'zernio_account_not_owned';
    error.status = 403;
    throw error;
  }
  return sanitizeZernioAccount(account);
}

export function sanitizeZernioError(error, fallback = 'Maven Social is temporarily unavailable.') {
  const safeProviderCode = ['zernio_payment_required', 'zernio_platform_beta_restricted', 'zernio_insufficient_permissions'].includes(error?.code);
  const safe = new Error(safeProviderCode ? error.message : fallback);
  safe.code = ['zernio_api_key_missing', 'zernio_identity_required', 'zernio_platform_required', 'zernio_platform_not_supported', 'zernio_special_connection_not_available', 'zernio_account_id_required', 'zernio_account_not_owned', 'zernio_invalid_redirect', 'zernio_payment_required', 'zernio_platform_beta_restricted', 'zernio_insufficient_permissions'].includes(error?.code)
    ? error.code
    : 'zernio_upstream_error';
  safe.status = [400, 401, 402, 403, 501].includes(error?.status) ? error.status : 502;
  return safe;
}
