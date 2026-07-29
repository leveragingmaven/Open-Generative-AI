import { muApiProvider } from "../providers/MuApiProvider.js";
import { PROVIDER_CONFIG } from "./config.js";

class IntelligenceProviderRegistry {
  constructor() {
    this.providers = new Map([[muApiProvider.id, muApiProvider]]);
  }

  register(provider) {
    if (!provider?.id || !PROVIDER_CONFIG[provider.id]?.enabled) {
      throw new Error("Cannot register an unknown or disabled creative provider");
    }
    this.providers.set(provider.id, provider);
    return provider;
  }

  get(id = "muapi") {
    const provider = this.providers.get(id);
    if (!provider) throw new Error(`Unknown creative provider: ${id}`);
    return provider;
  }

  list() {
    return [...this.providers.values()];
  }
}

export const intelligenceProviderRegistry = new IntelligenceProviderRegistry();
