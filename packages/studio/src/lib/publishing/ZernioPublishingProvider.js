import { PublishingProvider } from './PublishingProvider.js';
import { captionWithHashtags } from './publishingComposer.js';
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
    this.engagementEntitlement = response.entitlement || null;
    return Array.isArray(response.accounts) ? response.accounts : [];
  }

  async getEngagementEntitlement() {
    if (this.engagementEntitlement) return this.engagementEntitlement;
    const response = await this.request('/accounts/entitlement');
    this.engagementEntitlement = response.entitlement || null;
    return this.engagementEntitlement;
  }

  async disconnectAccount(accountId) {
    const result = await this.request(`/accounts/${encodeURIComponent(String(accountId))}`, { method: 'DELETE' });
    if (this.engagementEntitlement) this.engagementEntitlement = { ...this.engagementEntitlement, connectedEngagementAccounts: Math.max(0, this.engagementEntitlement.connectedEngagementAccounts - 1) };
    return result;
  }

  async listAutomations() {
    const response = await this.request('/automations');
    return Array.isArray(response.automations) ? response.automations : [];
  }

  async createAutomation(input) {
    return await this.request('/automations', { method: 'POST', body: input });
  }

  async updateAutomation(id, input) {
    return await this.request(`/automations/${encodeURIComponent(String(id))}`, { method: 'PATCH', body: input });
  }

  async deleteAutomation(id) {
    return await this.request(`/automations/${encodeURIComponent(String(id))}`, { method: 'DELETE' });
  }

  async listInboxConversations(query = {}) {
    return await this.request('/inbox/conversations', { query });
  }

  async getInboxMessages(conversationId, query = {}) {
    const id = String(conversationId || '').trim();
    if (!id) throw new PublishingError('A conversation is required.', { code: 'zernio_conversation_id_required', status: 400 });
    return await this.request(`/inbox/conversations/${encodeURIComponent(id)}/messages`, { query });
  }

  async sendInboxMessage(conversationId, message, query = {}) {
    const id = String(conversationId || '').trim();
    const text = String(message || '').trim();
    if (!id) throw new PublishingError('A conversation is required.', { code: 'zernio_conversation_id_required', status: 400 });
    if (!text) throw new PublishingError('Message text is required.', { code: 'zernio_message_required', status: 400 });
    return await this.request(`/inbox/conversations/${encodeURIComponent(id)}/messages`, {
      method: 'POST',
      body: { accountId: query.accountId, message: text },
    });
  }

  async getAnalytics(query = {}) {
    return await this.request('/analytics', { query });
  }

  connectAccount(platformOrPayload, options = {}) {
    const payload = typeof platformOrPayload === 'string'
      ? { platform: platformOrPayload, ...options }
      : platformOrPayload || {};
    return this.request('/accounts/connect', {
      method: 'POST',
      body: {
        platform: payload.platform,
        redirectTo: payload.redirectTo || payload.redirect_to,
        reconnectAccountId: payload.reconnectAccountId || payload.reconnect_account_id,
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

  async submitPost(draft = {}, scheduledAt = null) {
    const assetIds = Array.isArray(draft.assetIds)
      ? draft.assetIds
      : (Array.isArray(draft.assets) ? draft.assets.map((asset) => asset.assetId || asset.id).filter(Boolean) : []);
    const scheduledFor = scheduledAt;
    const response = await this.request('/posts', {
      method: 'POST',
      body: {
        draftId: draft.id,
        content: captionWithHashtags(draft.caption || draft.description || draft.title || '', draft.hashtags),
        assetIds,
        platforms: Array.isArray(draft.platforms) ? draft.platforms : [],
        accountIds: draft.accountIds || draft.platformAccountIds || {},
        firstComment: draft.firstComment || '',
        ...(scheduledFor ? { scheduledFor: new Date(scheduledFor).toISOString(), timezone: draft.timezone || 'UTC' } : { publishNow: true }),
      },
    });
    const status = response.status === 'scheduled'
      ? PUBLISHING_STATUS.SCHEDULED
      : response.status === 'published'
        ? PUBLISHING_STATUS.PUBLISHED
        : response.status === 'partially_published'
          ? PUBLISHING_STATUS.PARTIALLY_PUBLISHED
          : PUBLISHING_STATUS.FAILED;
    const platformResults = Object.fromEntries((response.platformResults || []).map((result) => [result.platform, {
      platform: result.platform,
      status: result.status === 'scheduled'
        ? PUBLISHING_STATUS.SCHEDULED
        : result.status === 'published'
          ? PUBLISHING_STATUS.PUBLISHED
          : PUBLISHING_STATUS.FAILED,
      publishedUrl: result.url || result.platformPostUrl || null,
      error: result.error || null,
    }]));
    const providerPostId = response.postId || response.providerPostId || null;
    // A scheduled result without a provider post id is not a real schedule: refusing here keeps a
    // local draft id from ever being reported (or persisted) as the provider job id.
    if (!providerPostId && (status === PUBLISHING_STATUS.SCHEDULED || status === PUBLISHING_STATUS.QUEUED)) {
      throw new PublishingError('Maven Social accepted this post but did not return a post id.', {
        code: 'zernio_post_id_missing',
        status: 502,
      });
    }
    return normalizePublishingJob({
      id: providerPostId || draft.id,
      draftId: draft.id,
      provider: this.id,
      platforms: draft.platforms || [],
      status,
      providerJobId: response.providerJobId || providerPostId,
      providerPostId,
      providerPostIds: providerPostId ? { zernio: providerPostId } : {},
      scheduledAt: response.scheduledFor || scheduledFor,
      timezone: response.timezone || draft.timezone || 'UTC',
      publishedUrls: response.publishedUrls || [],
      platformResults,
      error: status === PUBLISHING_STATUS.FAILED ? 'Maven Social publishing failed.' : null,
      raw: { status, postId: providerPostId, scheduledFor: response.scheduledFor || scheduledFor, platformResults },
    });
  }

  async publishNow(draft = {}) {
    return this.submitPost(draft);
  }

  async schedulePost(draft = {}) {
    if (!draft.scheduledAt || !Number.isFinite(new Date(draft.scheduledAt).getTime()) || new Date(draft.scheduledAt).getTime() <= Date.now()) {
      throw new PublishingError('Choose a future Maven Social publishing time.', { code: 'zernio_schedule_invalid', status: 400 });
    }
    return this.submitPost(draft, draft.scheduledAt);
  }

  async getScheduledPosts() {
    const response = await this.request('/posts', { query: { status: 'scheduled', limit: 100 } });
    const posts = Array.isArray(response.posts) ? response.posts : Array.isArray(response.data?.posts) ? response.data.posts : [];
    return posts.map((post) => normalizePublishingJob({
      id: post._id || post.id,
      draftId: post.draftId || post.metadata?.draftId,
      provider: this.id,
      providerJobId: post._id || post.id,
      providerPostId: post._id || post.id,
      platforms: (post.platforms || []).map((platform) => typeof platform === 'string' ? platform : platform.platform).filter(Boolean),
      status: normalizePublishingJob({ status: post.status || PUBLISHING_STATUS.SCHEDULED }).status === PUBLISHING_STATUS.QUEUED
        ? PUBLISHING_STATUS.QUEUED
        : PUBLISHING_STATUS.SCHEDULED,
      scheduledAt: post.scheduledFor,
      timezone: post.timezone,
      raw: post,
    }));
  }

  async reschedulePost(postId, schedule) {
    const scheduledFor = schedule.scheduledFor || schedule.scheduled_at || schedule.scheduledAt;
    if (!scheduledFor || !Number.isFinite(new Date(scheduledFor).getTime()) || new Date(scheduledFor).getTime() <= Date.now()) {
      throw new PublishingError('Choose a future Maven Social publishing time.', { code: 'zernio_schedule_invalid', status: 400 });
    }
    const response = await this.request(`/posts/${encodeURIComponent(String(postId))}`, {
      method: 'PUT',
      body: { isDraft: false, scheduledFor: new Date(scheduledFor).toISOString(), timezone: schedule.timezone || 'UTC' },
    });
    return normalizePublishingJob({
      ...(response.post || response),
      id: response.post?._id || response.post?.id || postId,
      providerJobId: response.post?._id || response.post?.id || postId,
      provider: this.id,
      status: response.post?.status || response.status || PUBLISHING_STATUS.SCHEDULED,
      scheduledAt: response.post?.scheduledFor || response.scheduledFor || new Date(scheduledFor).toISOString(),
      timezone: response.post?.timezone || response.timezone || schedule.timezone || 'UTC',
    });
  }

  async cancelScheduledPost(postId) {
    return this.request(`/posts/${encodeURIComponent(String(postId))}`, { method: 'DELETE' });
  }

  supportsCapability(methodName) {
    if (['schedulePost', 'getScheduledPosts', 'reschedulePost', 'cancelScheduledPost'].includes(methodName)) return true;
    return super.supportsCapability(methodName);
  }
}

export const zernioPublishingProvider = new ZernioPublishingProvider();
