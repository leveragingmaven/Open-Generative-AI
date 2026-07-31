export class CreativeProvider {
  constructor({ id, name, capabilities = [] }) {
    this.id = id;
    this.name = name;
    this.capabilities = new Set(capabilities);
  }

  hasCapability(capability) {
    return this.capabilities.has(capability);
  }

  notImplemented(methodName) {
    throw new Error(`${this.name || this.id} provider does not implement ${methodName}`);
  }

  execute() {
    this.notImplemented("execute");
  }
}
