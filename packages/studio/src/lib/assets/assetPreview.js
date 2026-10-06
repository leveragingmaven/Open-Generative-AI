export function assetPreviewKind(asset = {}) {
  const candidates = [asset.metadata?.modality, asset.type, asset.kind, asset.createdFromStudio, asset.metadata?.studio, asset.recipe, asset.metadata?.assetType];
  for (const candidate of candidates) {
    const value = String(candidate || '').toLowerCase();
    if (value.includes('image')) return 'image';
    if (value.includes('video')) return 'video';
    if (value.includes('audio')) return 'audio';
  }
  return null;
}
