import { useEffect, useRef, useState } from "react";

/**
 * Arm one `IntersectionObserver` for a media tile and disarm it on the first intersection.
 *
 * Kept outside the hook so the gate's behaviour (observe once, report once, disconnect, and the
 * no-observer fallback) is testable without a DOM renderer. A tile with no node or no observer
 * reports `onNear` straight away, so media is never hidden by the gate itself.
 */
export function watchForNearViewport(node, { rootMargin = "320px", onNear, Observer = globalThis.IntersectionObserver } = {}) {
  if (typeof onNear !== "function") return () => {};
  if (!node || typeof Observer !== "function") {
    onNear();
    return () => {};
  }
  let settled = false;
  const observer = new Observer((entries) => {
    if (settled || !entries.some((entry) => entry.isIntersecting)) return;
    settled = true;
    onNear();
    observer.disconnect();
  }, { rootMargin });
  observer.observe(node);
  return () => observer.disconnect();
}

/**
 * Whether a media tile is close enough to the viewport to start loading.
 *
 * Creative Library pages hold many assets, and a grid that mounts every `<img>`/`<video>` at once
 * makes the browser open a request per tile for media nobody is looking at. The gate ties the
 * simultaneous request count to what is on (or just outside) the screen, and it only ever turns on:
 * a tile that has loaded is not unloaded again when it scrolls away.
 *
 * `enabled: false` reports `true` immediately, which is how an already-opened preview (the details
 * panel and the full-size dialog) keeps loading before the observer runs.
 */
export function useNearViewport({ enabled = true, rootMargin = "320px" } = {}) {
  const ref = useRef(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    if (!enabled || near) return undefined;
    return watchForNearViewport(ref.current, { rootMargin, onNear: () => setNear(true) });
  }, [enabled, near, rootMargin]);

  return [ref, enabled ? near : true];
}

export default useNearViewport;
