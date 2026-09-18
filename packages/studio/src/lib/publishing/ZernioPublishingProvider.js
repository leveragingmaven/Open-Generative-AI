import { PublishingProvider } from './PublishingProvider.js';
import { PublishingError } from './publishingErrors.js';
import { PUBLISHING_PROVIDER_IDS } from './publishingTypes.js';

export class ZernioPublishingProvider extends PublishingProvider {
  constructor(options = {}) {
    super({ id: PUBLISHING_PROVIDER_IDS.ZERNIO, name: 'Maven Social' });
    this.fetchFn = options.fetchFn || globalThis.fetch?.bind(globalThis);
    this.apiBase = options.apiBase || '/api/publishing/zernio';
  }

  async request(path, options = {}) {
    if (!this.fetchFn) throw new PublishingError('Maven Social is unavailable.', { code: 'zernio_fetch_unavailable' });
    const response = await this.fetchFn(`${this.apiBase}${path}`, {
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

  publishNow() {
    throw new PublishingError('Maven Social publishing will be enabled in a later phase.', {
      code: 'zernio_publishing_not_available',
      status: 501,
    });
  }

  schedulePost() {
    throw new PublishingError('Maven Social scheduling will be enabled in a later phase.', {
      code: 'zernio_scheduling_not_available',
      status: 501,
    });
  }
}

export const zernioPublishingProvider = new ZernioPublishingProvider();
