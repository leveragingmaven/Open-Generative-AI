// Studio Translators — convert the single provider-neutral Creative Brief into
// each studio's generation instructions. Each translator consumes an UNCHANGED
// Creative Brief and produces a directive (generation instruction + suggested
// params) appropriate for its medium. The Brief itself is never mutated.
//
// Every directive leads with the user's goal (their own words) so the original
// intent is preserved, then augments with medium-appropriate creative guidance
// that improves first-pass quality. v1 scope: Image, Video, Marketing.

import { validateCreativeBrief } from "./CreativeBrief.js";

function palettePhrase(brand) {
  if (!brand) return "";
  if (Array.isArray(brand.palette) && brand.palette.length) {
    return `, palette ${brand.palette.join(", ")}`;
  }
  return "";
}

function negativesPhrase(brand) {
  if (!brand) return "";
  const list = brand.negatives;
  if (Array.isArray(list) && list.length) return `, without ${list.join(", ")}`;
  if (typeof list === "string" && list.trim()) return `, without ${list.trim()}`;
  return "";
}

function brandContext(brand) {
  return `${palettePhrase(brand)}${negativesPhrase(brand)}`;
}

// Joins a directive that always begins with the goal (user wording).
function compose(goal, parts) {
  const body = parts
    .filter((part) => typeof part === "string" && part.trim().length > 0)
    .join(", ")
    .replace(/,+$/, "")
    .trim();
  if (!goal && !body) return "";
  return goal && body ? `${goal}, ${body}` : goal || body;
}

function prepare(brief) {
  return validateCreativeBrief(brief);
}

function finalize(brief, text, params = {}) {
  return {
    text,
    directive: text,
    params: {
      aspect: brief?.format?.aspect || params.aspect || null,
      duration: brief?.format?.duration || params.duration || null,
      motion: brief?.format?.motion || params.motion || null,
    },
    brief,
  };
}

// ── Image Translator ─────────────────────────────────────────────────────────
// Consumes: goal, subject, style, tone, brand, format(medium/aspect).
// Ignores: format.motion. Adds composition / lighting / palette guidance.
export function translateImage(brief) {
  const validation = prepare(brief);
  const b = validation.valid ? brief : null;
  const parts = [];
  if (b?.subject) parts.push(`subject: ${b.subject}`);
  if (b?.style) parts.push(`style: ${b.style}`);
  if (b?.tone) parts.push(`mood: ${b.tone}`);
  parts.push("high detail, balanced composition, professional lighting");
  if (b?.brand) parts.push(`brand${palettePhrase(b.brand)}`);
  parts.push("no text or watermarks");
  return finalize(brief, compose(b?.goal, parts), { aspect: b?.format?.aspect });
}

// ── Video Translator ─────────────────────────────────────────────────────────
// Consumes: goal, subject, style, tone, brand, format (+ motion).
// Adds motion / pacing / continuity guidance specific to video.
export function translateVideo(brief) {
  const validation = prepare(brief);
  const b = validation.valid ? brief : null;
  const parts = [];
  if (b?.subject) parts.push(`subject: ${b.subject}`);
  if (b?.style) parts.push(`style: ${b.style}`);
  if (b?.tone) parts.push(`mood: ${b.tone}`);
  if (b?.format?.motion) parts.push(`camera: ${b.format.motion}`);
  parts.push("smooth continuous motion, stable framing, professional video");
  if (b?.brand) parts.push(`brand${palettePhrase(b.brand)}`);
  parts.push("no flicker, no morphing artifacts");
  return finalize(brief, compose(b?.goal, parts), {
    aspect: b?.format?.aspect,
    duration: b?.format?.duration,
    motion: b?.format?.motion,
  });
}

// ── Marketing Translator ─────────────────────────────────────────────────────
// Consumes: goal, subject, tone, brand (strong), format.
// Adds imperative messaging / negative space notes; copy stays user-led.
export function translateMarketing(brief) {
  const validation = prepare(brief);
  const b = validation.valid ? brief : null;
  const parts = [];
  if (b?.subject) parts.push(`feature: ${b.subject}`);
  if (b?.tone) parts.push(`tone: ${b.tone}`);
  parts.push("clear, eye-catching marketing visual");
  if (b?.brand) parts.push(`brand${palettePhrase(b.brand)}`);
  parts.push("leave negative space for text overlay, no clashing colors");
  return finalize(brief, compose(b?.goal, parts), { aspect: b?.format?.aspect });
}

export { brandContext };
