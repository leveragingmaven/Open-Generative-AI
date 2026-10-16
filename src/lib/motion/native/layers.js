import { clamp01, easeOutCubic, easeInOutCubic, easeInQuad, lerp, progress } from "./easing.js";
import { escapeXml, group, translate, scale as scaleTransform, text, line, circle } from "./svg.js";

/**
 * Free-form layered composition for the native renderer. A layer is an image (a
 * background photo or a transparent PNG), a text run or a simple shape. Each layer
 * has its own start time and duration, its own position, scale and opacity, and a
 * short entrance and exit. Layers are drawn in array order (first = back).
 *
 * This module is pure: it builds SVG strings and never touches the filesystem, so
 * the same frames feed the existing rasteriser and FFmpeg encoder unchanged.
 */

export const LAYER_TYPES = Object.freeze(["image", "text", "shape"]);
export const SHAPE_KINDS = Object.freeze(["line", "circle"]);

export class LayerSpecError extends Error {
  constructor(message, { code = "invalid_layer", layerId = null } = {}) {
    super(message);
    this.name = "LayerSpecError";
    this.code = code;
    this.layerId = layerId;
  }
}

const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);

function numberField(source, field, layerId, fallback, { min = -Infinity, max = Infinity } = {}) {
  const value = source[field] ?? fallback;
  if (!isFiniteNumber(value) || value < min || value > max) {
    throw new LayerSpecError(`Layer "${layerId}" has an invalid ${field}.`, { code: "invalid_field", layerId });
  }
  return value;
}

function motionSpec(source = {}, layerId) {
  return {
    seconds: numberField(source, "seconds", layerId, 0, { min: 0 }),
    dx: numberField(source, "dx", layerId, 0),
    dy: numberField(source, "dy", layerId, 0),
    scale: numberField(source, "scale", layerId, 1, { min: 0.0001 }),
  };
}

/**
 * Optional global-time keyframes `[{ t, dx, dy }]` that move a layer during the show.
 * Times are in seconds on the master timeline, not relative to the layer's start. The
 * offset holds the first value before the first keyframe and the last value after the
 * last one, and eases between keyframes.
 */
function keyframePath(raw, layerId) {
  if (raw === undefined || raw === null) return null;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new LayerSpecError(`Layer "${layerId}" has an invalid path.`, { code: "invalid_path", layerId });
  }
  let previous = -Infinity;
  return raw.map((key) => {
    const t = numberField(key ?? {}, "t", layerId, undefined, { min: 0 });
    if (t <= previous) {
      throw new LayerSpecError(`Layer "${layerId}" path keyframes must increase in t.`, { code: "invalid_path", layerId });
    }
    previous = t;
    return { t, dx: numberField(key, "dx", layerId, 0), dy: numberField(key, "dy", layerId, 0) };
  });
}

/** Validates and normalises a layer list. Throws LayerSpecError on the first problem. */
export function normaliseLayers(layers, { width, height } = {}) {
  if (!Array.isArray(layers) || layers.length === 0) {
    throw new LayerSpecError("A layered composition needs at least one layer.", { code: "no_layers" });
  }
  const ids = new Set();
  return layers.map((raw, index) => {
    const id = typeof raw?.id === "string" && raw.id ? raw.id : `layer-${index}`;
    if (ids.has(id)) throw new LayerSpecError(`Duplicate layer id "${id}".`, { code: "duplicate_id", layerId: id });
    ids.add(id);
    if (!LAYER_TYPES.includes(raw.type)) {
      throw new LayerSpecError(`Layer "${id}" has unsupported type "${raw.type}".`, { code: "unsupported_type", layerId: id });
    }
    const start = numberField(raw, "start", id, 0, { min: 0 });
    const duration = numberField(raw, "duration", id, undefined, { min: 0.01 });
    const enter = motionSpec(raw.enter, id);
    const exit = motionSpec(raw.exit, id);
    if (enter.seconds + exit.seconds > duration + 1e-9) {
      throw new LayerSpecError(`Layer "${id}" entrance and exit overlap.`, { code: "timing_overlap", layerId: id });
    }
    const normal = {
      id,
      type: raw.type,
      start,
      duration,
      enter,
      exit,
      drift: { dx: numberField(raw.drift || {}, "dx", id, 0), dy: numberField(raw.drift || {}, "dy", id, 0) },
      x: numberField(raw, "x", id, (width ?? 0) / 2),
      y: numberField(raw, "y", id, (height ?? 0) / 2),
      scale: numberField(raw, "scale", id, 1, { min: 0.0001 }),
      opacity: numberField(raw, "opacity", id, 1, { min: 0, max: 1 }),
    };
    normal.path = keyframePath(raw.path, id);
    if (raw.type === "image") {
      if (typeof raw.src !== "string" || !raw.src.startsWith("data:image/")) {
        throw new LayerSpecError(`Image layer "${id}" needs an embedded image data URI.`, { code: "missing_image", layerId: id });
      }
      normal.src = raw.src;
      normal.width = numberField(raw, "width", id, undefined, { min: 1 });
      normal.height = numberField(raw, "height", id, undefined, { min: 1 });
      normal.fit = raw.fit === "slice" ? "slice" : "meet";
    } else if (raw.type === "text") {
      if (typeof raw.content !== "string" || !raw.content.trim()) {
        throw new LayerSpecError(`Text layer "${id}" needs content.`, { code: "missing_text", layerId: id });
      }
      normal.content = raw.content;
      normal.size = numberField(raw, "size", id, 64, { min: 1 });
      normal.weight = numberField(raw, "weight", id, 700, { min: 100, max: 900 });
      normal.fill = typeof raw.fill === "string" ? raw.fill : "#ffffff";
    } else {
      if (!SHAPE_KINDS.includes(raw.shape)) {
        throw new LayerSpecError(`Shape layer "${id}" needs shape "line" or "circle".`, { code: "unsupported_shape", layerId: id });
      }
      normal.shape = raw.shape;
      normal.length = numberField(raw, "length", id, 200, { min: 0 });
      normal.radius = numberField(raw, "radius", id, 60, { min: 0 });
      normal.stroke = typeof raw.stroke === "string" ? raw.stroke : "#ffffff";
      normal.strokeWidth = numberField(raw, "strokeWidth", id, 6, { min: 0 });
      normal.fill = typeof raw.fill === "string" ? raw.fill : "none";
    }
    return normal;
  });
}

function pathOffset(path, t) {
  if (!path) return { dx: 0, dy: 0 };
  const first = path[0];
  const last = path[path.length - 1];
  if (t <= first.t) return { dx: first.dx, dy: first.dy };
  if (t >= last.t) return { dx: last.dx, dy: last.dy };
  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i];
    const b = path[i + 1];
    if (t <= b.t) {
      const p = easeInOutCubic(progress(t, a.t, b.t));
      return { dx: lerp(a.dx, b.dx, p), dy: lerp(a.dy, b.dy, p) };
    }
  }
  return { dx: last.dx, dy: last.dy };
}

/**
 * The state of one layer at time `t` (seconds), or null when it is not on screen.
 * Entrance eases in from the entrance offset, the exit eases out to the exit offset,
 * and the layer drifts linearly across its whole lifetime.
 */
export function layerStateAt(layer, t) {
  const local = t - layer.start;
  if (local < 0 || local >= layer.duration) return null;
  const enterP = layer.enter.seconds > 0 ? easeOutCubic(clamp01(local / layer.enter.seconds)) : 1;
  const exitStart = layer.duration - layer.exit.seconds;
  const exitQ = layer.exit.seconds > 0 ? easeInQuad(clamp01((local - exitStart) / layer.exit.seconds)) : 0;
  const life = local / layer.duration;
  const path = pathOffset(layer.path, t);
  return {
    dx: lerp(layer.enter.dx, 0, enterP) + lerp(0, layer.exit.dx, exitQ) + layer.drift.dx * life + path.dx,
    dy: lerp(layer.enter.dy, 0, enterP) + lerp(0, layer.exit.dy, exitQ) + layer.drift.dy * life + path.dy,
    scale: layer.scale * lerp(layer.enter.scale, 1, enterP) * lerp(1, layer.exit.scale, exitQ),
    opacity: layer.opacity * enterP * (1 - exitQ),
    reveal: enterP,
  };
}

function composeLayer(layer, state) {
  const transform = `${translate(layer.x + state.dx, layer.y + state.dy)} ${scaleTransform(state.scale)}`;
  let children;
  if (layer.type === "image") {
    const preserve = layer.fit === "slice" ? "xMidYMid slice" : "xMidYMid meet";
    children = `<image href="${escapeXml(layer.src)}" x="${-layer.width / 2}" y="${-layer.height / 2}" width="${layer.width}" height="${layer.height}" preserveAspectRatio="${preserve}"/>`;
  } else if (layer.type === "text") {
    children = text({ x: 0, y: 0, content: layer.content, size: layer.size, weight: layer.weight, fill: layer.fill, anchor: "middle", baseline: "middle" });
  } else if (layer.shape === "line") {
    const drawn = layer.length * state.reveal;
    children = line({ x1: -layer.length / 2, y1: 0, x2: -layer.length / 2 + drawn, y2: 0, stroke: layer.stroke, strokeWidth: layer.strokeWidth });
  } else {
    children = circle({ cx: 0, cy: 0, r: layer.radius * state.reveal, fill: layer.fill, stroke: layer.stroke, strokeWidth: layer.strokeWidth });
  }
  return group({ transform, opacity: state.opacity, children });
}

/** SVG document for one frame at time `t`. Transparent wherever no opaque layer covers it. */
export function composeLayerFrame({ width, height, layers, t = 0 } = {}) {
  const body = [];
  for (const layer of layers) {
    const state = layerStateAt(layer, t);
    if (state && state.opacity > 0) body.push(composeLayer(layer, state));
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body.join("")}</svg>`;
}
