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

const CAPTION_HASHTAG = /#([\p{L}\p{N}_-]+)/gu;

function captionHashtags(caption) {
  return new Set([...String(caption || "").matchAll(CAPTION_HASHTAG)].map((match) => match[1].toLowerCase()));
}

/**
 * Fold composer hashtags into the caption that is actually published.
 * Social providers (including Zernio) store hashtags for reference only and never append them to the
 * caption, so the caption the customer types is the caption the platforms receive. Hashtags already
 * present in the caption are kept as typed and never duplicated.
 */
export function captionWithHashtags(caption, hashtags) {
  const text = String(caption || "").trim();
  const declared = (Array.isArray(hashtags) ? hashtags : parseHashtags(hashtags))
    .map((tag) => String(tag || "").trim().replace(/^#+/, ""))
    .filter(Boolean);
  const present = captionHashtags(text);
  const missing = [];
  declared.forEach((tag) => {
    const key = tag.toLowerCase();
    if (present.has(key) || missing.some((item) => item.toLowerCase() === key)) return;
    missing.push(tag);
  });
  if (!missing.length) return text;
  const suffix = missing.map((tag) => `#${tag}`).join(" ");
  return text ? `${text}\n\n${suffix}` : suffix;
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
