import { assetPreviewKind } from '../assets/assetPreview.js';
import { mergeCreativeLibraryAssets } from '../intelligence/AssetLibraryService.js';

export function isPublishableCreativeMedia(asset) {
  return ['image', 'video'].includes(assetPreviewKind(asset))
    && Boolean(asset?.storageReference || asset?.generatedFiles?.[0] || asset?.url);
}

export function publishingLibraryAssets(localAssets = [], durableAssets = []) {
  return mergeCreativeLibraryAssets(localAssets, durableAssets).filter(isPublishableCreativeMedia);
}
