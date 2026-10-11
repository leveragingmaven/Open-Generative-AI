/**
 * How many assets one library batch shows.
 *
 * The account's asset count is small enough that the metadata list arrives in one request, so paging
 * is applied to what the browser actually renders and fetches: the first page mounts twelve thumbnails
 * and the next batch is only requested when the creator asks for it.
 */
export const CREATIVE_LIBRARY_PAGE_SIZE = 12;

/**
 * The assets a library view shows for the current window.
 *
 * The input is the already sorted, already filtered view, so revealing the next batch can only ever
 * append the following assets: the same slice order means no duplicate, no skipped asset, and the
 * existing ordering is preserved.
 */
export function libraryPageWindow(assets = [], visibleCount = CREATIVE_LIBRARY_PAGE_SIZE) {
  const size = Number.isFinite(visibleCount) && visibleCount > 0 ? Math.floor(visibleCount) : CREATIVE_LIBRARY_PAGE_SIZE;
  return (Array.isArray(assets) ? assets : []).slice(0, size);
}

/** How many assets the next batch still reveals, never more than the view actually holds. */
export function libraryPageRemaining(assets = [], visibleCount = CREATIVE_LIBRARY_PAGE_SIZE) {
  const total = Array.isArray(assets) ? assets.length : 0;
  return Math.max(0, total - libraryPageWindow(assets, visibleCount).length);
}
