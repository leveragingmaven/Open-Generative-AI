export class ProviderExecutionPort {
  async execute() {
    throw new Error("ProviderExecutionPort.execute() must be implemented");
  }
}

export class ProviderRegistryExecutionAdapter extends ProviderExecutionPort {
  constructor({ registry }) {
    super();
    this.registry = registry;
  }

  async execute(request) {
    let provider;
    try {
      provider = this.registry?.get?.(request.routing?.providerId);
    } catch (error) {
      throw Object.assign(new Error(`Unknown provider: ${request.routing?.providerId || "unknown"}`), {
        code: "provider_not_registered",
        cause: error,
      });
    }
    if (!provider) throw Object.assign(new Error(`Unknown provider: ${request.routing?.providerId || "unknown"}`), { code: "provider_not_registered" });
    if (!provider.execute) throw Object.assign(new Error(`Provider ${provider.id} does not support generic execution`), { code: "unsupported_operation" });
    return provider.execute(request);
  }
}
