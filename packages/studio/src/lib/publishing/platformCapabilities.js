import { PublishingValidationError } from "./publishingErrors.js";

const UNKNOWN_PLATFORM_CAPABILITY = {
  mediaTypes: "unknown",
  supportsScheduling: "unknown",
  supportsFirstComment: "unknown",
  supportsTitle: "unknown",
  supportsThumbnail: "unknown",
  maxAssets: "unknown",
  captionLimit: "unknown",
  enabledByDefault: false,
  capabilityFlag: null,
};

const CAPABILITIES = {
  instagram: {
    platform: "instagram",
    mediaTypes: ["image", "video", "carousel"],
    supportsScheduling: true,
    supportsFirstComment: "unknown",
    supportsTitle: false,
    supportsThumbnail: "unknown",
    maxAssets: 10,
    captionLimit: "unknown",
    enabledByDefault: true,
    capabilityFlag: null,
  },
  tiktok: {
    platform: "tiktok",
    mediaTypes: ["video"],
    supportsScheduling: true,
    supportsFirstComment: false,
    supportsTitle: "unknown",
    supportsThumbnail: "unknown",
    maxAssets: 1,
    captionLimit: "unknown",
    enabledByDefault: true,
    capabilityFlag: null,
  },
  youtube: {
    platform: "youtube",
    mediaTypes: ["video"],
    supportsScheduling: true,
    supportsFirstComment: false,
    supportsTitle: true,
    supportsThumbnail: "unknown",
    maxAssets: 1,
    captionLimit: "unknown",
    enabledByDefault: true,
    capabilityFlag: null,
  },
  linkedin: {
    platform: "linkedin",
    mediaTypes: ["image", "video"],
    supportsScheduling: true,
    supportsFirstComment: false,
    supportsTitle: "unknown",
    supportsThumbnail: "unknown",
    maxAssets: "unknown",
    captionLimit: "unknown",
    enabledByDefault: false,
    capabilityFlag: "publishing.linkedin",
  },
  facebook: {
    platform: "facebook",
    mediaTypes: ["image", "video"],
    supportsScheduling: true,
    supportsFirstComment: "unknown",
    supportsTitle: "unknown",
    supportsThumbnail: "unknown",
    maxAssets: "unknown",
    captionLimit: "unknown",
    enabledByDefault: false,
    capabilityFlag: "publishing.facebook",
  },
  x: {
    platform: "x",
    mediaTypes: ["image", "video"],
    supportsScheduling: true,
    supportsFirstComment: false,
    supportsTitle: false,
    supportsThumbnail: false,
    maxAssets: "unknown",
    captionLimit: "unknown",
    enabledByDefault: false,
    capabilityFlag: "publishing.x",
  },
  pinterest: {
    platform: "pinterest",
    mediaTypes: ["image", "video"],
    supportsScheduling: true,
    supportsFirstComment: false,
    supportsTitle: true,
    supportsThumbnail: "unknown",
    maxAssets: "unknown",
    captionLimit: "unknown",
    enabledByDefault: false,
    capabilityFlag: "publishing.pinterest",
  },
  threads: {
    platform: "threads",
    mediaTypes: ["image", "video"],
    supportsScheduling: true,
    supportsFirstComment: false,
    supportsTitle: false,
    supportsThumbnail: "unknown",
    maxAssets: "unknown",
    captionLimit: "unknown",
    enabledByDefault: false,
    capabilityFlag: "publishing.threads",
  },
};

export class PlatformCapabilityRegistry {
  constructor(capabilities = CAPABILITIES) {
    this.capabilities = capabilities;
  }

  getPlatformCapabilities(platform) {
    const key = String(platform || "").toLowerCase();
    return this.capabilities[key] || { platform: key || "unknown", ...UNKNOWN_PLATFORM_CAPABILITY };
  }

  listPlatformCapabilities() {
    return Object.values(this.capabilities);
  }

  listEnabledPlatforms() {
    return this.listPlatformCapabilities().filter((capability) => capability.enabledByDefault);
  }

  validateDraftForPlatform(draft, platform) {
    const capabilities = this.getPlatformCapabilities(platform);
    const mediaTypes = capabilities.mediaTypes;
    if (Array.isArray(mediaTypes)) {
      const unsupportedAsset = draft.assets.find((asset) => {
        const mediaType = asset.type === "image" && draft.assets.length > 1 ? "carousel" : asset.type;
        return !mediaTypes.includes(mediaType) && !mediaTypes.includes(asset.type);
      });
      if (unsupportedAsset) {
        throw new PublishingValidationError(`Platform ${platform} does not support ${unsupportedAsset.type} assets`, {
          platform,
          assetId: unsupportedAsset.assetId,
          assetType: unsupportedAsset.type,
        });
      }
    }
    if (typeof capabilities.maxAssets === "number" && draft.assets.length > capabilities.maxAssets) {
      throw new PublishingValidationError(`Platform ${platform} supports at most ${capabilities.maxAssets} asset(s)`, {
        platform,
        maxAssets: capabilities.maxAssets,
      });
    }
    return true;
  }
}

export const platformCapabilityRegistry = new PlatformCapabilityRegistry();
