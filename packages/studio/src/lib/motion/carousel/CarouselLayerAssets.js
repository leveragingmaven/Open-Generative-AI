// Continuous Layers asset handoff: maps the Motion Carousel GET response's
// account-owned background/foreground references onto the builder's layerAssets
// state. Pure and framework-free so it can be unit-tested without React.
//
// A layer the customer chose manually always wins: transferred references only
// fill an empty slot, so an upload is never silently replaced by a late transfer.

function referenceOf(entry) {
  return typeof entry?.storageReference === "string" && entry.storageReference ? entry.storageReference : null;
}

export function transferredLayerAssets(assets, { current = {} } = {}) {
  const currentBackground = typeof current.background === "string" ? current.background : null;
  const currentForeground = typeof current.foreground === "string" ? current.foreground : null;
  if (!assets || typeof assets !== "object") {
    return { layerAssets: { background: currentBackground, foreground: currentForeground }, notice: null };
  }
  return {
    layerAssets: {
      background: currentBackground ?? referenceOf(assets.background),
      foreground: currentForeground ?? referenceOf(assets.foreground),
    },
    notice: typeof assets.message === "string" && assets.message ? assets.message : null,
  };
}

// The deck that is actually POSTed to the render endpoint. In Continuous Layers it
// must carry the account-owned background/foreground references (transferred or
// chosen) and the optional owned soundtrack, so they reach the native renderer and
// not just the builder's state. Other scene modes never carry layer references.
export function carouselRenderDeck(deck, { sceneMode = "standard", layerAssets = {}, soundtrack = null } = {}) {
  if (sceneMode !== "layers") return { ...deck, sceneMode };
  return {
    ...deck,
    sceneMode,
    layers: {
      background: typeof layerAssets?.background === "string" ? layerAssets.background : null,
      foreground: typeof layerAssets?.foreground === "string" ? layerAssets.foreground : null,
    },
    audio: typeof soundtrack === "string" ? soundtrack : null,
  };
}
