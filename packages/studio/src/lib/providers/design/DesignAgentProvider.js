import { DesignAgentCapabilityError } from "./designAgentErrors.js";

export class DesignAgentProvider {
  constructor({ id, name, capabilities = [] } = {}) {
    this.id = id;
    this.name = name;
    this.capabilities = new Set(capabilities);
  }

  hasCapability(capability) {
    return this.capabilities.has(capability);
  }

  unsupported(methodName) {
    throw new DesignAgentCapabilityError(methodName);
  }

  createSession() {
    this.unsupported("createSession");
  }

  getSession() {
    this.unsupported("getSession");
  }

  sendMessage() {
    this.unsupported("sendMessage");
  }

  uploadReferenceAsset() {
    this.unsupported("uploadReferenceAsset");
  }

  getSessionAssets() {
    this.unsupported("getSessionAssets");
  }

  getAsset() {
    this.unsupported("getAsset");
  }

  submitDesignJob() {
    this.unsupported("submitDesignJob");
  }

  getDesignJob() {
    this.unsupported("getDesignJob");
  }

  cancelDesignJob() {
    this.unsupported("cancelDesignJob");
  }
}
