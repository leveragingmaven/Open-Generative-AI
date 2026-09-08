const now = () => new Date().toISOString();

export function createCampaignAsset(input = {}) {
  return {
    campaignId: input.campaignId || null,
    assetId: input.assetId || null,
    role: input.role || null,
    hero: Boolean(input.hero),
    thumbnail: Boolean(input.thumbnail),
    email: Boolean(input.email),
    facebook: Boolean(input.facebook),
    instagram: Boolean(input.instagram),
    pinterest: Boolean(input.pinterest),
    story: Boolean(input.story),
    video: Boolean(input.video),
    status: input.status || "draft",
    createdAt: input.createdAt || now(),
  };
}
