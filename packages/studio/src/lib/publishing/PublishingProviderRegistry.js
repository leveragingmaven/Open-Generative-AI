import { muApiPublishingProvider } from "./MuApiPublishingProvider.js";
import { ghlHubPublishingProvider } from "./GhlHubPublishingProvider.js";
import { PUBLISHING_PROVIDER_IDS } from "./publishingTypes.js";

export class PublishingProviderRegistry {
  constructor() {
    this.providers = new Map();
    this.activeProviderId = PUBLISHING_PROVIDER_IDS.MUAPI;
    this.register(muApiPublishingProvider);
    this.register(ghlHubPublishingProvider);
  }

  register(provider) {
    if (!provider?.id) throw new Error("Publishing provider must have an id");
    this.providers.set(provider.id, provider);
    return provider;
  }

  get(providerId = this.activeProviderId) {
    const provider = this.providers.get(providerId);
    if (!provider) throw new Error(`Unknown publishing provider: ${providerId}`);
    return provider;
  }

  getActiveProvider() {
    return this.get(this.activeProviderId);
  }

  resolveForDraft(draft = {}, options = {}) {
    return this.get(options.providerId || draft.provider || this.activeProviderId);
  }

  list() {
    return Array.from(this.providers.values());
  }
}

export const publishingProviderRegistry = new PublishingProviderRegistry();
