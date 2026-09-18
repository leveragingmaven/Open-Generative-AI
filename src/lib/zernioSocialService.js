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

function dataOf(response) {
  return response?.data || response || {};
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
    const profiles = listOf(await client.profiles.listProfiles(), 'profiles');
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
  const data = dataOf(response);
  const authUrl = data.authUrl || data.authorizationUrl || data.url;
  if (!authUrl) throw sanitizeZernioError({ code: 'zernio_invalid_connect_response' }, 'Zernio did not return a connection URL.');
  return { authUrl: String(authUrl), state: data.state || null };
}

export async function listTenantZernioAccounts({ identity, repository = new MySqlZernioRepository(), client = getZernioClient() } = {}) {
  const owner = requiredIdentity(identity);
  const profile = await ensureZernioProfile({ identity: owner, repository, client });
  const response = await client.accounts.listAccounts({ query: { profileId: profile.zernioProfileId } });
  const accounts = listOf(response, 'accounts')
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
  const safe = new Error(fallback);
  safe.code = ['zernio_api_key_missing', 'zernio_identity_required', 'zernio_platform_required', 'zernio_platform_not_supported', 'zernio_special_connection_not_available', 'zernio_account_id_required', 'zernio_account_not_owned', 'zernio_invalid_redirect'].includes(error?.code)
    ? error.code
    : 'zernio_upstream_error';
  safe.status = error?.status === 401 || error?.status === 403 || error?.status === 501 ? error.status : error?.status === 400 || error?.code === 'zernio_invalid_redirect' ? 400 : 502;
  return safe;
}
