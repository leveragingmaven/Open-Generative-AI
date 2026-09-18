const CATALOG = [
  { key: "instagram", label: "Instagram", zernioPlatform: "instagram", connectionMode: "oauth", connectable: true, availability: "available" },
  { key: "tiktok", label: "TikTok", zernioPlatform: "tiktok", connectionMode: "oauth", connectable: true, availability: "available" },
  { key: "youtube", label: "YouTube", zernioPlatform: "youtube", connectionMode: "oauth", connectable: true, availability: "available" },
  { key: "linkedin", label: "LinkedIn", zernioPlatform: "linkedin", connectionMode: "oauth", connectable: true, availability: "available" },
  { key: "x", label: "X", zernioPlatform: "twitter", connectionMode: "oauth", connectable: true, availability: "billing_may_be_required", availabilityMessage: "A provider payment method may be required to connect X." },
  { key: "facebook", label: "Facebook", zernioPlatform: "facebook", connectionMode: "oauth", connectable: true, availability: "available" },
  { key: "pinterest", label: "Pinterest", zernioPlatform: "pinterest", connectionMode: "oauth", connectable: true, availability: "available" },
  { key: "threads", label: "Threads", zernioPlatform: "threads", connectionMode: "oauth", connectable: true, availability: "available" },
  { key: "bluesky", label: "Bluesky", zernioPlatform: "bluesky", connectionMode: "special", connectable: false, availability: "special_flow" },
  { key: "reddit", label: "Reddit", zernioPlatform: "reddit", connectionMode: "oauth", connectable: true, availability: "available" },
  { key: "snapchat", label: "Snapchat", zernioPlatform: "snapchat", connectionMode: "oauth", connectable: true, availability: "beta", availabilityMessage: "Availability depends on provider beta access." },
  { key: "telegram", label: "Telegram", zernioPlatform: "telegram", connectionMode: "special", connectable: false, availability: "special_flow" },
  { key: "google-business-profile", label: "Google Business Profile", zernioPlatform: "googlebusiness", connectionMode: "oauth", connectable: true, availability: "available" },
  { key: "whatsapp", label: "WhatsApp", zernioPlatform: "whatsapp", connectionMode: "special", connectable: false, availability: "special_flow" },
  { key: "discord", label: "Discord", zernioPlatform: "discord", connectionMode: "special", connectable: false, availability: "special_flow" },
  { key: "slack", label: "Slack", zernioPlatform: "slack", connectionMode: "special", connectable: false, availability: "special_flow" },
].map((entry) => Object.freeze({ ...entry, id: entry.key, enabled: entry.connectable }));

export const ZERNIO_CONNECTION_CATALOG = Object.freeze(CATALOG);
export const ZERNIO_CONNECTION_CATALOG_BY_KEY = Object.freeze(
  Object.fromEntries(CATALOG.map((entry) => [entry.key, entry])),
);
export const ZERNIO_CONNECTION_CATALOG_BY_PLATFORM = Object.freeze(
  Object.fromEntries(CATALOG.map((entry) => [entry.zernioPlatform, entry])),
);

export function getZernioConnectionOption(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;
  return ZERNIO_CONNECTION_CATALOG_BY_KEY[normalized]
    || ZERNIO_CONNECTION_CATALOG_BY_PLATFORM[normalized]
    || null;
}

export function isZernioSpecialConnection(option) {
  return option?.connectionMode === "special";
}

export function isZernioSocialPlatform(value) {
  return Boolean(getZernioConnectionOption(value));
}
