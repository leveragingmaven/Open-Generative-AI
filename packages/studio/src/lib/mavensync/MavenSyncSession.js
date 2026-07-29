function readCookie(cookieString, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(cookieString || "").match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : "";
}

export function normalizeSession(input = {}) {
  const userId = input.userId || input.id || input.sub || null;
  const email = input.email || input.userEmail || null;
  const displayName = input.displayName || input.name || input.fullName || email || null;
  const role = input.role || input.userRole || null;
  const tenantId = input.tenantId || input.tenant || input.workspaceId || null;

  return {
    userId,
    email,
    displayName,
    role,
    tenantId,
    authenticated: Boolean(input.authenticated ?? (userId || email)),
    source: input.source || "unknown",
  };
}

export function getBrowserSession(globalObj = globalThis) {
  const win = globalObj?.window || globalObj;
  const agencySession = win?.AgencySession || win?.agencySession;
  if (agencySession) {
    return normalizeSession({ ...agencySession, source: "AgencySession" });
  }

  const agencyUser = win?.agencyUser;
  if (agencyUser) {
    return normalizeSession({ ...agencyUser, source: "agencyUser" });
  }

  const cookieEmail = readCookie(win?.document?.cookie, "agency_user_email");
  const cookieUserId = readCookie(win?.document?.cookie, "agency_user_id");
  if (cookieEmail || cookieUserId) {
    return normalizeSession({
      userId: cookieUserId || null,
      email: cookieEmail || null,
      authenticated: true,
      source: "agency_cookie",
    });
  }

  return normalizeSession({ authenticated: false, source: "standalone" });
}
