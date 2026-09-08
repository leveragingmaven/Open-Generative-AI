// Lightweight, localStorage-backed Campaign store for the Campaign Workspace.
// Temporary persistence (no database yet). Statuses align with the Creative
// Intelligence Layer's campaign lifecycle, but this store is intentionally
// independent so it can grow without touching the intelligence layer.

const STORAGE_KEY = "mavensync_campaigns";
const ACTIVE_KEY = "mavensync_active_campaign";

export const CAMPAIGN_STATUSES = [
  "draft",
  "planning",
  "generating",
  "review",
  "approved",
  "queued",
  "completed",
  "archived",
];

const now = () => new Date().toISOString();

function generateId() {
  return `campaign-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function read() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function write(campaigns) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(campaigns));
  } catch (e) {
    // ignore quota / privacy-mode write failures
  }
}

export const CampaignStore = {
  list() {
    return read();
  },
  get(id) {
    return read().find((campaign) => campaign.id === id) || null;
  },
  create(input = {}) {
    const timestamp = now();
    const campaign = {
      id: input.id || generateId(),
      name: (input.name || "").trim() || "Untitled Campaign",
      description: (input.description || "").trim(),
      status: CAMPAIGN_STATUSES.includes(input.status) ? input.status : "draft",
      createdAt: input.createdAt || timestamp,
      updatedAt: timestamp,
    };
    const campaigns = read();
    campaigns.unshift(campaign);
    write(campaigns);
    return campaign;
  },
  update(id, patch = {}) {
    const campaigns = read();
    const index = campaigns.findIndex((campaign) => campaign.id === id);
    if (index === -1) return null;
    const updated = {
      ...campaigns[index],
      ...patch,
      id,
      createdAt: campaigns[index].createdAt,
      updatedAt: now(),
    };
    campaigns[index] = updated;
    write(campaigns);
    return updated;
  },
  remove(id) {
    const campaigns = read().filter((campaign) => campaign.id !== id);
    write(campaigns);
    if (CampaignStore.getActiveId() === id) CampaignStore.clearActive();
    return campaigns;
  },
  getActiveId() {
    if (typeof window === "undefined") return null;
    try {
      return window.localStorage.getItem(ACTIVE_KEY);
    } catch (e) {
      return null;
    }
  },
  getActive() {
    const id = CampaignStore.getActiveId();
    if (!id) return null;
    return read().find((campaign) => campaign.id === id) || null;
  },
  setActive(id) {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(ACTIVE_KEY, id);
    } catch (e) {
      // ignore quota / privacy-mode write failures
    }
  },
  clearActive() {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(ACTIVE_KEY);
    } catch (e) {
      // ignore
    }
  },
};
