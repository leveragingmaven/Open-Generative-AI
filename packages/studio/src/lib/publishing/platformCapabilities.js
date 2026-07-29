import { PublishingValidationError } from "./publishingErrors.js";

const UNKNOWN_PLATFORM_CAPABILITY = {
  mediaTypes: "unknown",
  supportsScheduling: "unknown",
  supportsFirstComment: "unknown",
  supportsTitle: "unknown",
  supportsThumbnail: "unknown",
  maxAssets: "unknown",
  captionLimit: "unknown",
};

const CAPABILITIES = {
  instagram: {
    platform: "instagram",
    mediaTypes: ["image", "video", "carousel"],
    supportsScheduling: "unknown",
    supportsFirstComment: "unknown",
    supportsTitle: false,
    supportsThumbnail: "unknown",
    maxAssets: 10,
    captionLimit: "unknown",
  },
  tiktok: {
    platform: "tiktok",
    mediaTypes: ["video"],
    supportsScheduling: "unknown",
    supportsFirstComment: false,
    supportsTitle: "unknown",
    supportsThumbnail: "unknown",
    maxAssets: 1,
    captionLimit: "unknown",
  },
  youtube: {
    platform: "youtube",
    mediaTypes: ["video"],
    supportsScheduling: "unknown",
    supportsFirstComment: false,
    supportsTitle: true,
    supportsThumbnail: "unknown",
    maxAssets: 1,
    captionLimit: "unknown",
  },
  linkedin: {
    platform: "linkedin",
    mediaTypes: ["image", "video"],
    supportsScheduling: "unknown",
    supportsFirstComment: false,
    supportsTitle: "unknown",
    supportsThumbnail: "unknown",
    maxAssets: "unknown",
    captionLimit: "unknown",
  },
  facebook: {
    platform: "facebook",
    mediaTypes: ["image", "video"],
    supportsScheduling: "unknown",
    supportsFirstComment: "unknown",
    supportsTitle: "unknown",
    supportsThumbnail: "unknown",
    maxAssets: "unknown",
    captionLimit: "unknown",
  },
  x: {
    platform: "x",
    mediaTypes: ["image", "video"],
    supportsScheduling: "unknown",
    supportsFirstComment: false,
    supportsTitle: false,
    supportsThumbnail: false,
    maxAssets: "unknown",
    captionLimit: "unknown",
  },
  pinterest: {
    platform: "pinterest",
    mediaTypes: ["image", "video"],
    supportsScheduling: "unknown",
    supportsFirstComment: false,
    supportsTitle: true,
    supportsThumbnail: "unknown",
    maxAssets: "unknown",
    captionLimit: "unknown",
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
