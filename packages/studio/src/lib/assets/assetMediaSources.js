/**
 * How long one media source may stay unresolved before the tile gives up on it.
 *
 * An `<img>` reports exactly one of `load` or `error`. A request that never settles — a delivery
 * endpoint whose resize stalls, a CDN connection that is accepted and then never answers — reports
 * neither, and the tile has no way to notice: it stays on its skeleton with the image at
 * `opacity-0`, never reaches its failure state, and never asks for the later sources that do work.
 * Expiring the source turns that dead end into the fallback the tile already has.
 *
 * The bound only has to separate "stalled" from "slow": the Creative Assets delivery endpoint
 * answers with the resized rendering or the original in about a second, and a browser keeps a
 * genuinely dead request pending far longer than this before it gives up on its own.
 */
export const MEDIA_CANDIDATE_TIMEOUT_MS = 20_000;

/**
 * The first media source a tile should still try, or `null` once every source has failed.
 *
 * The order is the caller's: cheapest rendering first, the asset's own reference last. `null` is a
 * real answer — it is the state that tells the tile to report an unavailable preview instead of
 * leaving the card on a loading frame.
 */
export function nextMediaSource(sources = [], failedSources = []) {
  const failed = new Set(Array.isArray(failedSources) ? failedSources : []);
  return (Array.isArray(sources) ? sources : []).find((source) => !failed.has(source)) || null;
}
