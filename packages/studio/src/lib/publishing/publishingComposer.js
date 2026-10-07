export function queueEditSelection(draft) {
  if (!draft?.id || !draft?.provider) throw new Error("A saved publishing draft is required to edit from the queue.");
  return { focusedDraftId: draft.id, providerId: draft.provider, activeView: "create" };
}

function parseHashtags(value) {
  return (Array.isArray(value) ? value.join(", ") : String(value || ""))
    .split(/[\s,]+/)
    .map((item) => item.trim().replace(/^#/, ""))
    .filter(Boolean);
}

export function publishingComposerValues(draft, edits = {}) {
  return {
    ...draft,
    ...edits,
    caption: edits.caption ?? draft.caption ?? draft.description ?? "",
    assets: Array.isArray(edits.assets) ? edits.assets : draft.assets || [],
    assetIds: Array.isArray(edits.assetIds) ? edits.assetIds : draft.assetIds || [],
    platforms: draft.platforms || [],
    accountIds: draft.accountIds || {},
    platformOverrides: draft.platformOverrides || {},
    scheduledAt: draft.scheduledAt || null,
    timezone: draft.timezone || "UTC",
  };
}

export function publishingDraftUpdateFromComposer(draft, edits = {}) {
  const updates = {
    title: edits.title ?? draft.title ?? "",
    caption: edits.caption ?? draft.caption ?? draft.description ?? "",
    hashtags: parseHashtags(edits.hashtags ?? draft.hashtags),
    firstComment: edits.firstComment ?? draft.firstComment ?? "",
  };
  if (Array.isArray(edits.assets)) {
    updates.assets = edits.assets;
    updates.assetIds = Array.isArray(edits.assetIds)
      ? edits.assetIds
      : edits.assets.map((asset) => asset.assetId || asset.id).filter(Boolean);
  }
  return updates;
}
