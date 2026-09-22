import { PublishingProvider } from './PublishingProvider.js';
import { PublishingError } from './publishingErrors.js';
import { PUBLISHING_PROVIDER_IDS, PUBLISHING_STATUS, normalizePublishingDraft, normalizePublishingJob } from './publishingTypes.js';

export class ZernioPublishingProvider extends PublishingProvider {
  constructor(options = {}) {
    super({ id: PUBLISHING_PROVIDER_IDS.ZERNIO, name: 'Maven Social' });
    this.fetchFn = options.fetchFn || globalThis.fetch?.bind(globalThis);
    this.apiBase = options.apiBase || '/api/publishing/zernio';
  }

  async request(path, options = {}) {
    if (!this.fetchFn) throw new PublishingError('Maven Social is unavailable.', { code: 'zernio_fetch_unavailable' });
    const query = new URLSearchParams(
      Object.entries(options.query || {}).filter(([, value]) => value !== undefined && value !== null && value !== ''),
    ).toString();
    const response = await this.fetchFn(`${this.apiBase}${path}${query ? `?${query}` : ''}`, {
      method: options.method || 'GET',
      credentials: 'include',
      headers: { 'content-type': 'application/json', ...(options.headers || {}) },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new PublishingError(data.error || 'Maven Social request failed.', {
        code: data.code || 'zernio_api_error',
        status: response.status,
      });
    }
    return data;
  }

  async getConnectedAccounts() {
    const response = await this.request('/accounts');
    return Array.isArray(response.accounts) ? response.accounts : [];
  }

  async listInboxConversations(query = {}) {
    return await this.request('/inbox/conversations', { query });
  }

  async getInboxMessages(conversationId, query = {}) {
    const id = String(conversationId || '').trim();
    if (!id) throw new PublishingError('A conversation is required.', { code: 'zernio_conversation_id_required', status: 400 });
    return await this.request(`/inbox/conversations/${encodeURIComponent(id)}/messages`, { query });
  }

  connectAccount(platformOrPayload, options = {}) {
    const payload = typeof platformOrPayload === 'string'
      ? { platform: platformOrPayload, redirectTo: options.redirectTo }
      : platformOrPayload || {};
    return this.request('/accounts/connect', {
      method: 'POST',
      body: {
        platform: payload.platform,
        redirectTo: payload.redirectTo || payload.redirect_to,
      },
    });
  }

  createDraft(input = {}) {
    return normalizePublishingDraft({ ...input, provider: this.id });
  }

  updateDraft(input = {}) {
    return normalizePublishingDraft({ ...input, provider: this.id, updatedAt: new Date().toISOString() });
  }

  deleteDraft(draftId) {
    return { ok: true, draftId };
  }

  async publishNow(draft = {}) {
    const assetIds = Array.isArray(draft.assetIds)
      ? draft.assetIds
      : (Array.isArray(draft.assets) ? draft.assets.map((asset) => asset.assetId || asset.id).filter(Boolean) : []);
    const response = await this.request('/posts', {
      method: 'POST',
      body: {
        draftId: draft.id,
        content: draft.caption || draft.description || draft.title || '',
        assetIds,
        platforms: Array.isArray(draft.platforms) ? draft.platforms : [],
        accountIds: draft.accountIds || draft.platformAccountIds || {},
      },
    });
    const status = response.status === 'published'
      ? PUBLISHING_STATUS.PUBLISHED
      : response.status === 'partially_published'
        ? PUBLISHING_STATUS.PARTIALLY_PUBLISHED
        : PUBLISHING_STATUS.FAILED;
    const platformResults = Object.fromEntries((response.platformResults || []).map((result) => [result.platform, {
      platform: result.platform,
      status: result.status === 'published' ? PUBLISHING_STATUS.PUBLISHED : PUBLISHING_STATUS.FAILED,
      publishedUrl: result.url || result.platformPostUrl || null,
      error: result.error || null,
    }]));
    return normalizePublishingJob({
      id: response.postId || draft.id,
      draftId: draft.id,
      provider: this.id,
      platforms: draft.platforms || [],
      status,
      providerPostId: response.postId || null,
      providerPostIds: response.postId ? { zernio: response.postId } : {},
      publishedUrls: response.publishedUrls || [],
      platformResults,
      error: status === PUBLISHING_STATUS.FAILED ? 'Maven Social publishing failed.' : null,
      raw: { status, postId: response.postId || null, platformResults },
    });
  }

  getScheduledPosts() {
    // Phase 1 exposes account management only; an empty remote history is intentional.
    return [];
  }

  schedulePost() {
    throw new PublishingError('Maven Social scheduling will be enabled in a later phase.', {
      code: 'zernio_scheduling_not_available',
      status: 501,
    });
  }
}

export const zernioPublishingProvider = new ZernioPublishingProvider();
