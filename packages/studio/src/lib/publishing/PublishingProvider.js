export class PublishingProvider {
  constructor({ id, name }) {
    this.id = id;
    this.name = name;
  }

  notImplemented(methodName) {
    throw new Error(`${this.name} publishing provider does not implement ${methodName}`);
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

  updateScheduledPost() {
    return this.notImplemented("updateScheduledPost");
  }

  deleteScheduledPost() {
    return this.notImplemented("deleteScheduledPost");
  }
}
