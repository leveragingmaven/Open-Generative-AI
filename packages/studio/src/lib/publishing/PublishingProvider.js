import { UnsupportedPublishingCapabilityError } from "./publishingErrors.js";

export class PublishingProvider {
  constructor({ id, name }) {
    this.id = id;
    this.name = name;
  }

  notImplemented(methodName) {
    throw new UnsupportedPublishingCapabilityError(methodName, this.id);
  }

  connectAccount() {
    return this.notImplemented("connectAccount");
  }

  getConnectedAccounts() {
    return this.notImplemented("getConnectedAccounts");
  }

  disconnectAccount() {
    return this.notImplemented("disconnectAccount");
  }

  createDraft() {
    return this.notImplemented("createDraft");
  }

  updateDraft() {
    return this.notImplemented("updateDraft");
  }

  deleteDraft() {
    return this.notImplemented("deleteDraft");
  }

  schedulePost() {
    return this.notImplemented("schedulePost");
  }

  publishNow() {
    return this.notImplemented("publishNow");
  }

  getScheduledPosts() {
    return this.notImplemented("getScheduledPosts");
  }

  getPublishingJob() {
    return this.notImplemented("getPublishingJob");
  }

  cancelScheduledPost() {
    return this.notImplemented("cancelScheduledPost");
  }

  reschedulePost() {
    return this.notImplemented("reschedulePost");
  }

  getPlatformCapabilities() {
    return this.notImplemented("getPlatformCapabilities");
  }

  normalizePublishingStatus() {
    return this.notImplemented("normalizePublishingStatus");
  }

  updateScheduledPost() {
    return this.reschedulePost(...arguments);
  }

  deleteScheduledPost() {
    return this.cancelScheduledPost(...arguments);
  }
}
