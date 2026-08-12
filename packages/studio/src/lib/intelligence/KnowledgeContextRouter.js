import { createKnowledgePack } from "./KnowledgePack.js";

const OFFER_TERMS = /offer|sales|landing|conversion|launch|pricing|copy|marketing|campaign/i;
const BRAND_TERMS = /brand|visual|image|video|design|creative/i;
const WRITING_TERMS = /write|writing|llm|text|script|email|headline|marketing|copy/i;

function explicitDomains(input = {}) {
  return Array.isArray(input.knowledgeDomains) ? new Set(input.knowledgeDomains) : null;
}

function selectedOffer(pack, input = {}, relevant) {
  const requestedId = input.offerId || input.selectedOfferId || null;
  if (!relevant && !requestedId) return null;
  const offerId = requestedId || (relevant ? pack.offers.selectedOfferId : null);
  if (!offerId) return null;
  return pack.offers.active.find((offer) => String(offer.id || offer.offerId) === String(offerId)) || null;
}

export class KnowledgeContextRouter {
  select(packInput, input = {}) {
    if (!packInput) return null;
    const pack = createKnowledgePack(packInput);
    const request = input.request || {};
    const text = `${request.intent || ""} ${request.recipeId || ""} ${request.studioId || ""}`;
    const domains = explicitDomains(input);
    const include = (name, fallback) => domains ? domains.has(name) : fallback;
    const offerRelevant = Boolean(input.offerId || input.selectedOfferId || OFFER_TERMS.test(text));
    const context = {
      packId: pack.id,
      packVersion: pack.version,
      updatedAt: pack.updatedAt,
      brand: include("brand", BRAND_TERMS.test(text)) ? pack.domains.brand : null,
      voice: include("voice", WRITING_TERMS.test(text)) ? pack.domains.voice : null,
      audience: include("audience", WRITING_TERMS.test(text)) ? pack.domains.audience : null,
      ip: include("ip", WRITING_TERMS.test(text)) ? pack.domains.ip : null,
      approvedClaims: include("approvedClaims", WRITING_TERMS.test(text) || offerRelevant) ? pack.domains.approvedClaims : null,
      resources: include("resources", false) ? [...pack.domains.resources] : [],
      visualDirection: include("visualDirection", BRAND_TERMS.test(text)) ? pack.domains.visualDirection : null,
      selectedOffer: selectedOffer(pack, input, offerRelevant),
    };
    return context;
  }
}

export const knowledgeContextRouter = new KnowledgeContextRouter();

