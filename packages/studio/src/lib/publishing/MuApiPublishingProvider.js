import { PublishingProvider } from "./PublishingProvider.js";

export class MuApiPublishingProvider extends PublishingProvider {
  constructor(options = {}) {
    super({ id: "muapi", name: "MuAPI" });
    this.client = options.client || null;
  }
}

export const muApiPublishingProvider = new MuApiPublishingProvider();
