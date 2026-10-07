import { PUBLISHING_STATUS } from "./publishingTypes.js";

function selectedAccountName(draft, platform, accounts, accountsProviderId) {
  const override = draft.platformOverrides?.[platform] || {};
  const selectedAccountId = override.accountId || override.account_id || draft.accountIds?.[platform] || draft.platformAccountIds?.[platform];
  const canResolveAccount = !accountsProviderId || accountsProviderId === draft.provider;
  const account = selectedAccountId === undefined || selectedAccountId === null || !canResolveAccount
    ? null
    : accounts.find((item) => String(item.id ?? item.accountId) === String(selectedAccountId)
      && (!item.provider || item.provider === draft.provider));
  return override.accountName
    || override.account_name
    || account?.displayName
    || account?.name
    || account?.username
    || null;
}

export function publishingCalendarDetails(draft, { accounts = [], accountsProviderId = null, platforms = [], providerName = null, status = draft.status } = {}) {
  const destinations = (draft.platforms || []).map((platform) => {
    const option = platforms.find((item) => item.id === platform || item.key === platform || item.zernioPlatform === platform);
    const platformName = option?.label || platform;
    const accountName = selectedAccountName(draft, platform, accounts, accountsProviderId);
    return {
      platform,
      platformName,
      accountName,
      label: accountName ? `${platformName} · ${accountName}` : platformName,
    };
  });
  return {
    draftId: draft.id,
    title: draft.title || "Untitled Draft",
    providerName,
    destinations,
    scheduledAt: draft.scheduledAt || null,
    timezone: draft.timezone || null,
    status,
    media: draft.assets?.[0] || null,
  };
}

export function publishingCalendarDateTime(value, timezone) {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Date unavailable";
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: timezone || undefined,
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }
}

export function publishingCalendarActions(draft, provider) {
  const isScheduled = [PUBLISHING_STATUS.SCHEDULED, PUBLISHING_STATUS.QUEUED].includes(draft.status)
    || Boolean(draft.scheduledAt);
  const hasProviderJob = Boolean(draft.providerJobId);
  return {
    draftId: draft.id,
    canEdit: provider.supportsCapability("updateDraft"),
    canReschedule: isScheduled && hasProviderJob && provider.supportsCapability("reschedulePost"),
    canCancel: isScheduled && hasProviderJob && provider.supportsCapability("cancelScheduledPost"),
  };
}
