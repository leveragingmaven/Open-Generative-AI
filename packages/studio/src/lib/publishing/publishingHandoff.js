/** Import an account-authenticated server handoff into the existing local draft composer. */
export async function importPublishingHandoff(id, center, { fetcher = fetch } = {}) {
  if (!/^draft-harness-[a-f0-9]{64}$/.test(id || '')) throw new Error('Publishing handoff is invalid.');
  const response = await fetcher(`/api/motion-carousel/harness?draft=${encodeURIComponent(id)}`, { credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) throw new Error('Publishing handoff is unavailable for this account.');
  const { draft } = await response.json();
  if (draft?.id !== id || draft.status !== 'draft' || draft.scheduledAt || draft.publishedAt || draft.providerJobId || !draft.assetIds?.length) throw new Error('Publishing handoff is not an unscheduled draft.');
  const existing = center.getDrafts().find(item => item.id === id);
  // A repeated link never overwrites a customer's edits or schedules a second draft.
  return existing || center.createDraft({ id, title: draft.title, caption: draft.caption, assets: draft.assets, assetIds: draft.assetIds, platforms: [], scheduledAt: null, status: 'draft' });
}
