export const INCLUDED_ZERNIO_ENGAGEMENT_ACCOUNTS = 2;

export function zernioEngagementEntitlement(accounts = [], purchasedEngagementAccounts = 0) {
  const purchased = Number.isSafeInteger(Number(purchasedEngagementAccounts))
    ? Math.max(0, Number(purchasedEngagementAccounts))
    : 0;
  const connectedIds = new Set((Array.isArray(accounts) ? accounts : [])
    .filter((account) => (
      account?.provider === "zernio"
      && account?.connected !== false
      && account?.isActive !== false
      && account?.status !== "disconnected"
    ))
    .map((account) => String(account.id || account.zernioAccountId || ""))
    .filter(Boolean));
  const connectedEngagementAccounts = connectedIds.size;
  const included = INCLUDED_ZERNIO_ENGAGEMENT_ACCOUNTS;
  const allowed = included + purchased;
  return {
    includedEngagementAccounts: included,
    purchasedEngagementAccounts: purchased,
    allowedEngagementAccounts: allowed,
    connectedEngagementAccounts,
    canConnectEngagementAccount: connectedEngagementAccounts < allowed,
  };
}
