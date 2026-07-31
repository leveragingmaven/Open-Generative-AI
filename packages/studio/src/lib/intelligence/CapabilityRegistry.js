import { CAPABILITIES, createCapabilityDefinition } from "./CapabilityTypes.js";

const DEFAULT_CAPABILITIES = Object.freeze(Object.values(CAPABILITIES).map((id) => ({ id, name: id })));

class CapabilityRegistry {
  constructor(definitions = DEFAULT_CAPABILITIES) {
    this.capabilities = new Map();
    definitions.forEach((definition) => this.register(definition));
  }

  register(definition) {
    if (!definition?.id) throw new Error("Capability id is required");
    const normalized = createCapabilityDefinition(definition);
    this.capabilities.set(normalized.id, normalized);
    return normalized;
  }

  get(id) {
    return this.capabilities.get(id) || null;
  }

  list() {
    return [...this.capabilities.values()];
  }
}

export const capabilityRegistry = new CapabilityRegistry();
export { CapabilityRegistry };
