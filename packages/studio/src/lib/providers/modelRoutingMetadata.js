/**
 * M1 — Explicit routing metadata vocabulary (ADDITIVE ONLY).
 *
 * Objective
 * ---------
 * Introduce metadata that cleanly separates five concepts that are currently
 * conflated or implicit:
 *
 *   model owner / family  -> the EXISTING `provider` field  (NOT repurposed)
 *   transport provider    -> `transport`
 *   capability            -> `capability`
 *   logical model         -> `logicalModel`
 *   provider endpoint id  -> `endpointId`
 *
 * Design rules honored here
 * -------------------------
 * 1. `provider` keeps its existing owner/family meaning. Nothing in this module
 *    reads or writes it, and `withExplicitRouting()` copies entries verbatim.
 * 2. Vocabulary is REUSED from the existing Creative OS intelligence layer, not
 *    reinvented: capability ids come from `lib/intelligence/CapabilityTypes.js`
 *    and the `transport` / `logicalModel` / `endpointId` names mirror
 *    `lib/intelligence/ProductionCapabilityCatalog.js` (which already uses
 *    `providerId`, `logicalModel`, `endpointId` and capability ids).
 * 3. Explicit transport metadata is attached ONLY where it is actually needed —
 *    i.e. to models served by a DIRECT transport (fal). Models served by the
 *    MuAPI aggregator declare nothing and resolve to the aggregator default via
 *    `effectiveTransport()`, which keeps all existing MuAPI model entries and
 *    their behavior byte-for-byte unchanged.
 * 4. This milestone does NOT change runtime routing. Everything exported here is
 *    inert data plus pure functions; the routing path (CapabilityRouter,
 *    ProviderRegistry, ImageStudioRuntime) does not consult any of it yet.
 * 5. No credentials, Settings, or provider registration is touched.
 */

import { CAPABILITIES } from "../intelligence/CapabilityTypes.js";
import { PROVIDER_IDS } from "./providerTypes.js";
import { FAL_MODEL_IDS } from "./FalProvider.js";

/* ------------------------------------------------------------------ *
 * Transport vocabulary
 * ------------------------------------------------------------------ */

/**
 * The transport providers a model may be served by.
 *
 * `transport` is deliberately distinct from a model entry's `provider` field:
 *   - `provider`    = who made/owns the model   (e.g. "google", "bytedance")
 *   - `transport`   = who actually serves it    (e.g. "muapi", "fal")
 */
export const TRANSPORTS = Object.freeze({
  MUAPI: PROVIDER_IDS.MUAPI,
  FAL: PROVIDER_IDS.FAL,
});

/**
 * Capability ids each transport is able to serve.
 *
 * Mirrors the `capabilities` arrays used by
 * `ProductionCapabilityCatalog.js`, reusing the same capability ids.
 */
export const TRANSPORT_CAPABILITIES = Object.freeze({
  [PROVIDER_IDS.MUAPI]: Object.freeze([CAPABILITIES.IMAGE_GENERATION, CAPABILITIES.IMAGE_EDITING]),
  [PROVIDER_IDS.FAL]: Object.freeze([CAPABILITIES.IMAGE_GENERATION, CAPABILITIES.IMAGE_EDITING]),
});

/**
 * Capability ids a transport can serve.
 *
 * @param {string} transport transport provider id
 * @returns {string[]} the capability ids, or an empty array when unknown
 */
export function transportCapabilities(transport) {
  return [...(TRANSPORT_CAPABILITIES[transport] || [])];
}

/* ------------------------------------------------------------------ *
 * Explicit routing metadata
 * ------------------------------------------------------------------ */

/** The additive keys introduced by this milestone. */
export const ROUTING_METADATA_KEYS = Object.freeze([
  "transport",
  "capability",
  "logicalModel",
  "endpointId",
]);

/**
 * Explicit routing metadata for the FAL transport's direct models, keyed by
 * FAL endpoint/model id.
 *
 * This is the ONLY place a model gains explicit `transport` metadata: FAL is
 * the first direct (BYOK) transport, so it is the only case where the transport
 * is genuinely ambiguous today (a FAL entry otherwise carries `provider: "fal"`,
 * overloading the owner field).
 *
 * `logicalModel` follows the aggregator's `muapi-*-catalog` naming convention
 * from `ProductionCapabilityCatalog.js`, applied to the direct transport.
 * `endpointId` is the provider-side model/endpoint path, the same concept the
 * catalog records in its `endpointId` field.
 */
export const FAL_ROUTING_MODELS = Object.freeze({
  [FAL_MODEL_IDS.TEXT_TO_IMAGE]: Object.freeze({
    transport: TRANSPORTS.FAL,
    capability: CAPABILITIES.IMAGE_GENERATION,
    logicalModel: "fal-flux-schnell",
    endpointId: FAL_MODEL_IDS.TEXT_TO_IMAGE,
  }),
  [FAL_MODEL_IDS.IMAGE_TO_IMAGE]: Object.freeze({
    transport: TRANSPORTS.FAL,
    capability: CAPABILITIES.IMAGE_EDITING,
    logicalModel: "fal-flux-schnell-redux",
    endpointId: FAL_MODEL_IDS.IMAGE_TO_IMAGE,
  }),
});

/**
 * Explicit routing metadata for a FAL endpoint/model id.
 *
 * @param {string} endpointId a FAL model id (e.g. `FAL_MODEL_IDS.TEXT_TO_IMAGE`)
 * @returns {object|null} frozen metadata, or null when unknown
 */
export function falRoutingMetadata(endpointId) {
  return FAL_ROUTING_MODELS[endpointId] || null;
}

/**
 * Returns a copy of a model entry with explicit routing metadata attached.
 *
 * Additive only: existing fields (including `provider`) are preserved exactly,
 * and keys whose value is `null`/`undefined` are omitted so metadata is added
 * "only where it is actually needed".
 *
 * @param {object} model existing model entry
 * @param {object} [routing] explicit routing metadata
 * @returns {object} a new entry; the input is not mutated
 */
export function withExplicitRouting(model, routing = {}) {
  const explicit = {};
  const metadata = routing || {};
  for (const key of ROUTING_METADATA_KEYS) {
    const value = metadata[key];
    if (value !== undefined && value !== null) explicit[key] = value;
  }
  return { ...model, ...explicit };
}

/**
 * The transport explicitly declared by a model entry, or `null` when the entry
 * declares none (which is the case for every aggregator-routed model).
 *
 * @param {object} model
 * @returns {string|null}
 */
export function explicitTransport(model) {
  const transport = model?.transport;
  return typeof transport === "string" && transport.length > 0 ? transport : null;
}

/**
 * True when a model entry declares an explicit transport.
 *
 * @param {object} model
 * @returns {boolean}
 */
export function hasExplicitTransport(model) {
  return explicitTransport(model) !== null;
}

/**
 * The transport that will actually serve a model entry.
 *
 * A model that declares no `transport` is aggregator-routed, so it resolves to
 * MuAPI. This is how the owner/transport separation is expressed without
 * annotating (or perturbing) the ~22k existing MuAPI catalog entries.
 *
 * @param {object} model
 * @param {object} [options]
 * @param {string} [options.defaultTransport] aggregator transport
 * @returns {string}
 */
export function effectiveTransport(model, { defaultTransport = TRANSPORTS.MUAPI } = {}) {
  return explicitTransport(model) ?? defaultTransport;
}
