/**
 * Native renderer — the MavenSync motion component library.
 *
 * Every component is an original implementation written for this renderer: a pure
 * function of the frame's timeline position that returns SVG. Nothing is ported
 * from the third-party engine. Components share one contract:
 *
 *   draw(ctx) -> { body: string[] , ... }
 *
 * `ctx` carries:
 *   id            unique prefix so `<defs>` ids never collide
 *   theme         the resolved brand palette
 *   fonts         exact face aliases: headline, body, bodyStrong, serif, mono
 *   type          the preset's typographic scale
 *   motion        the preset's motion tokens
 *   measure       measurers bound to a face: measure/measureBody/measureSerif/measureMono
 *   slide, visual the deck slide and its `visual` object
 *   box           the graphic safe-area box
 *   t             0→1 through the slide
 *   defs          array to push gradients/clip paths onto
 *   image(src)    resolvers for a deck image, or null
 *
 * Faces are selected by family alias rather than by font-weight, so a face is
 * never synthetically emboldened by the rasterizer.
 *
 * Pure module: no Node APIs, no browser APIs, no randomness, no clock.
 */

import {
  clamp01, easeOutBack, easeOutCubic, easeOutExpo, easeOutQuart, easeOutQuint,
  formatStat, progress, stagger,
} from "./easing.js";
import { fitRuns, fitText, lineRuns, lineText, parseRuns, wrapRuns, wrapText } from "./text.js";
import {
  circle, group, line, linearGradient, lines as linesEl, n, path, rect, text, translate,
} from "./svg.js";

// ── shared drawing helpers ────────────────────────────────────────────────────

/** A rise-and-fade entrance: the signature move every component builds on. */
function rise(t, { start = 0.06, end = 0.42, distance = 34, easing = easeOutQuint } = {}) {
  const p = easing(progress(t, start, end));
  return { p, dy: (1 - p) * distance, opacity: clamp01(p * 1.6) };
}

/**
 * A left-to-right clip reveal, returned as a mask id.
 *
 * `grow` widens the revealed region on both sides without moving it, which is how a
 * highlight pill's rounded caps survive the wipe: the mask has to be as wide as the
 * pill (line + padding), not just as wide as the glyphs, or the pill is cut off with
 * two flat ends.
 */
function wipe(ctx, { x, y, w, h, p, pad = 10, grow = 0 }) {
  const id = `${ctx.id}-wipe-${ctx.defs.length}`;
  const width = Math.max(0, (w + grow) * clamp01(p));
  ctx.defs.push(`<clipPath id="${id}">${rect({ x: x - pad, y: y - pad, w: width, h: h + pad * 2 })}</clipPath>`);
  return id;
}

/**
 * A five-pointed star, drawn as an outline.
 *
 * The rating marks used to be the character `★`, which no bundled face can draw: it
 * rendered as nothing at all, so a five-star quote showed an empty space. A path is
 * identical in every face, every machine and every environment.
 */
function starPath({ cx, cy, r, fill, opacity = 1 }) {
  const points = [];
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 ? r * 0.42 : r;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    points.push(`${n(cx + Math.cos(angle) * radius)} ${n(cy + Math.sin(angle) * radius)}`);
  }
  return path({ d: `M ${points.join(" L ")} Z`, fill, opacity });
}

/** A row of rating stars, right-aligned to `right`, each `size` wide. */
function starRow({ right, cy, size, count, fill }) {
  const gap = size * 0.34;
  return Array.from({ length: count }, (_, index) => starPath({
    cx: right - size / 2 - index * (size + gap), cy, r: size / 2, fill,
  }));
}

/** A rounded pill with centred text — used for badges and keywords. */
function chip(ctx, { x, y, label, size = 30, padX = 26, padY = 15, fill, ink, transform, opacity = 1, role = "bodyStrong" }) {
  const w = ctx.measureBody(label, size) + padX * 2;
  const h = size + padY * 2;
  return {
    w,
    h,
    body: group({
      transform,
      opacity,
      children: [
        rect({ x, y, w, h, rx: h / 2, fill }),
        text({
          x: x + w / 2, y: y + h / 2 + size * 0.35, content: label,
          family: ctx.fonts[role], size, fill: ink, anchor: "middle",
        }),
      ],
    }),
  };
}

/**
 * A headline line whose `[[keyword]]` runs become an accent pill.
 *
 * Every pill is emitted before the words on the line, so a highlight is always
 * *behind* its text; runs are laid out with their own advance plus the space
 * between runs, so a highlighted phrase does not collide with the words before it.
 */
function headlineLine(ctx, { x, y, line, size, fill, pillFill, pillInk, p, tracking = 0 }) {
  const runs = lineRuns(line);
  const spaceWidth = ctx.measure(" ", size, 0);
  const pills = [];
  const words = [];
  let cursor = x;
  runs.forEach((run, index) => {
    const width = ctx.measure(run.text, size, tracking);
    if (run.highlight) {
      const padX = Math.max(size * 0.28, 8);
      const pillH = size * 1.3;
      const pillP = clamp01((p - 0.3) / 0.68);
      pills.push(rect({
        x: cursor - padX, y: y - size * 0.96, w: (width + padX * 2) * pillP, h: pillH, rx: pillH / 2, fill: pillFill,
      }));
      words.push(text({
        x: cursor, y, content: run.text, family: ctx.fonts.headline, size, fill: pillInk,
        letterSpacing: tracking, block: "headline-highlight",
      }));
    } else {
      words.push(text({
        x: cursor, y, content: run.text, family: ctx.fonts.headline, size, fill,
        letterSpacing: tracking, block: "headline",
      }));
    }
    cursor += width + (index < runs.length - 1 ? spaceWidth : 0);
  });
  return [...pills, ...words];
}

/** A stable pick from `count` options, so each headline varies without randomness. */
function variantFor(text, count) {
  let hash = 0;
  for (const ch of String(text)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash % count;
}

/**
 * Fits a display headline into its box: `maxLines` at the preset size when possible,
 * otherwise more lines at a smaller size with the leading tightened so the block
 * stays inside the box. `overflow` is set only when even that cannot fit, so the
 * renderer can report it rather than drawing text off the canvas.
 */
function layoutDisplay(ctx, headline, box, { maxLines = 2, tracking = 0, lineHeight }) {
  const runs = parseRuns(headline);
  const base = {
    maxWidth: box.w, maxSize: ctx.type.displaySize,
    minSize: Math.round(ctx.type.displaySize * 0.5), letterSpacing: tracking,
  };
  let fitted = fitRuns(runs, ctx.measure, { ...base, maxLines });
  if (fitted.lines.length > maxLines) {
    fitted = fitRuns(runs, ctx.measure, {
      ...base, maxLines: 4, minSize: Math.round(ctx.type.displaySize * 0.4), hardFloor: 20,
    });
  }
  const leading = Math.min(lineHeight, Math.floor(box.h / Math.max(1, fitted.lines.length)));
  return { fitted, lineHeight: leading, overflow: fitted.lines.length > 4 };
}

/**
 * Reveals a stack of display lines. Each headline picks one of two entrance styles
 * from its own text, so neighbouring slides do not share the same motion. Lines hold
 * on screen after their reveal: a fade-out would leave the final frame with no ink.
 */
function displayBlock(ctx, { headline, box, layout, top, fill, pillInk, tracking, staggerWindow }) {
  const { fitted, lineHeight } = layout;
  const variant = variantFor(headline, 4);
  const dropIn = variant >= 2;
  
  
  const body = [];
  fitted.lines.forEach((line, index) => {
    const start = 0.08 + stagger(index, fitted.lines.length, staggerWindow);
    const p = easeOutQuint(progress(t0(ctx), start, start + ctx.motion.cut + 0.1));
    const baseline = top + index * lineHeight;
    const lineWidth = ctx.measure(lineText(line), fitted.size, tracking);
    // The wipe covers the pill padding as well as the glyphs.
    const pillPad = Math.max(fitted.size * 0.28, 8);
    const enterDy = dropIn ? -(1 - p) * fitted.size * 0.6 : (1 - p) * fitted.size * 0.18;
    
    const content = headlineLine(ctx, {
      x: box.x, y: baseline, line, size: fitted.size, tracking, fill,
      pillFill: theme0(ctx).accent, pillInk, p,
    });
    const maskId = dropIn ? null : wipe(ctx, {
      x: box.x, y: baseline - fitted.size * 1.1,
      w: Math.max(lineWidth, ctx.measure("M", fitted.size)), h: lineHeight * 1.2, p,
      pad: pillPad, grow: pillPad * 2,
    });
    body.push(group({
      transform: translate(0, enterDy),
      opacity: clamp01(p * 1.5),
      children: maskId ? group({ "clip-path": `url(#${maskId})`, children: content }) : content,
    }));
  });
  return { body, fitted };
}

// `ctx.t` is read through helpers so the reveal helpers stay small.
const t0 = (ctx) => ctx.t;
const theme0 = (ctx) => ctx.theme;

// ── 1. kinetic headline reveal ────────────────────────────────────────────────

/** The cover/hook treatment: an oversized headline revealed line by line. */
export const headlineReveal = {
  id: "headlineReveal",
  draw(ctx) {
    const { slide, box, theme, fonts, t } = ctx;
    const sub = slide.sub ? String(slide.sub) : "";
    // Two lines: a cover headline that wraps into three or four lines stops reading
    // as display type, so the size is chosen to fit two balanced lines instead.
    const headline = String(slide.headline || "");
    const layout = layoutDisplay(ctx, headline, box, {
      maxLines: 2, tracking: ctx.type.displayTracking,
      lineHeight: Math.round(ctx.type.displaySize * ctx.type.displayLeading),
    });
    const { lineHeight } = layout;
    const blockH = layout.fitted.lines.length * lineHeight;
    const top = box.y + (box.h - blockH) / 2 + lineHeight * 0.42;

    const { body, fitted } = displayBlock(ctx, {
      headline, box, layout, top,
      fill: theme.ink, pillInk: theme.dark ? theme.surface : "#FFFFFF",
      tracking: ctx.type.displayTracking, staggerWindow: ctx.motion.stagger,
    });

    if (sub) {
      const p = rise(t, { start: 0.5 + ctx.motion.stagger * fitted.lines.length, end: 0.82 });
      const subRows = wrapText(sub, ctx.measureBody, { maxWidth: box.w * 0.92, size: ctx.type.subSize });
      body.push(group({
        transform: translate(0, p.dy), opacity: p.opacity,
        children: linesEl({
          x: box.x, y: top + blockH + ctx.type.subSize * 0.6, lines: subRows,
          lineHeight: Math.round(ctx.type.subSize * 1.45), family: fonts.body,
          size: ctx.type.subSize, fill: theme.muted,
        }),
      }));
    }
    return { body, shrunk: fitted.shrunk, warnAt: layout.overflow || fitted.atFloor ? headline : null };
  },
};

// ── 2. animated statistics ────────────────────────────────────────────────────

/** Counts a value up on an easing curve, then rests exactly on the final figure. */
export const statCounter = {
  id: "statCounter",
  draw(ctx) {
    const { visual = {}, box, theme, fonts, t } = ctx;
    const raw = visual.value ?? visual.price ?? null;
    const numeric = Number(String(raw ?? "").replace(/[^0-9.]/g, ""));
    const hasNumber = Number.isFinite(numeric) && String(raw ?? "").trim() !== "" && /[0-9]/.test(String(raw));
    const prefix = typeof visual.prefix === "string" ? visual.prefix : "";
    const suffix = typeof visual.suffix === "string" ? visual.suffix : /%$/.test(String(raw ?? "")) ? "%" : "";
    const label = String(visual.caption || visual.label || ctx.slide.sub || "");

    const size = Math.round(ctx.type.displaySize * (hasNumber ? 1.2 : 0.62));
    const decimals = String(raw ?? "").includes(".") ? 1 : 0;
    const shown = hasNumber
      ? formatStat(numeric * easeOutQuart(progress(t, 0.12, 0.66)), { prefix, suffix, decimals })
      : String(raw ?? "");
    const valueWidth = ctx.measure(shown, size, ctx.type.displayTracking);

    const valueP = rise(t, { start: 0.08, end: 0.4, distance: 46 });
    const labelP = rise(t, { start: 0.42, end: 0.72 });
    const barP = easeOutExpo(progress(t, 0.3, 0.9));
    const barY = box.y + box.h * 0.66;
    const barW = box.w * 0.72;

    const body = [
      group({
        transform: translate(0, valueP.dy), opacity: valueP.opacity,
        children: [
          text({
            x: box.x, y: box.y + size, content: shown, family: fonts.headline, size,
            fill: theme.accent, letterSpacing: ctx.type.displayTracking,
          }),
          rect({ x: box.x, y: box.y + size + 24, w: Math.max(valueWidth, 64), h: 8, rx: 4, fill: theme.accentAlt, opacity: 0.85 }),
        ],
      }),
      rect({ x: box.x, y: barY, w: barW, h: 10, rx: 5, fill: theme.faint }),
      rect({ x: box.x, y: barY, w: barW * barP, h: 10, rx: 5, fill: theme.accent }),
    ];

    if (Array.isArray(visual.bars) && visual.bars.length) {
      const per = box.w / visual.bars.length;
      const chartTop = barY + 56;
      const chartH = Math.min(240, box.y + box.h - chartTop - 40);
      const maxValue = Math.max(...visual.bars.map((v) => Number(v) || 0), 1);
      visual.bars.forEach((value, index) => {
        const p = easeOutQuint(progress(t, 0.34 + stagger(index, visual.bars.length, 0.34), 0.98));
        const height = Math.max(8, (Number(value) / maxValue) * chartH) * p;
        body.push(rect({
          x: box.x + index * per + per * 0.18, y: chartTop + (chartH - height), w: per * 0.64, h: height, rx: 10,
          fill: index % 2 ? theme.accentAlt : theme.accent, opacity: 0.94,
        }));
      });
    }

    if (label) {
      const rows = wrapText(label, ctx.measureBody, { maxWidth: box.w * 0.88, size: ctx.type.bodySize });
      body.push(group({
        transform: translate(0, labelP.dy), opacity: labelP.opacity,
        children: linesEl({
          x: box.x, y: Math.min(box.y + box.h, barY + 96), lines: rows,
          lineHeight: Math.round(ctx.type.bodySize * 1.4), family: fonts.body, size: ctx.type.bodySize, fill: theme.muted,
        }),
      }));
    }
    return { body, added: { value: shown } };
  },
};

// ── 3. product / image showcase ───────────────────────────────────────────────

/**
 * A card that floats in on a parallax curve with a shine sweep. When the deck
 * references an image the renderer supplies it as a data URI; otherwise an
 * original abstract product is drawn so the slide is never empty.
 */
export const productShowcase = {
  id: "productShowcase",
  draw(ctx) {
    const { visual = {}, box, theme, fonts, t } = ctx;
    const href = ctx.image ? ctx.image(visual.image) : null;
    const caption = String(visual.caption || "");
    const badge = visual.badge ? String(visual.badge) : "";
    const price = visual.price ? String(visual.price) : "";

    const cardW = Math.min(box.w, 760);
    const cardX = box.x + (box.w - cardW) / 2;
    const enter = easeOutQuint(progress(t, 0.06, 0.5));
    const float = Math.sin(clamp01((t - 0.32) / 0.36) * Math.PI) * 12;
    const cardY = box.y + 20 + (1 - enter) * 70 + float;

    // The card gets whatever height is left after the caption and the price have their
    // room. Sizing the card first pushed the price down into the footer chrome, where
    // it was drawn across the progress dots — the one place text must never reach.
    const captionRows = caption ? wrapText(caption, ctx.measureBody, { maxWidth: box.w * 0.9, size: ctx.type.bodySize }) : [];
    const captionLead = Math.round(ctx.type.bodySize * 1.4);
    const captionSpace = captionRows.length ? 66 + captionRows.length * captionLead : 0;
    const priceSpace = price ? 60 + 60 : 0;
    const cardH = Math.max(300, Math.min(540, box.y + box.h - cardY - captionSpace - priceSpace));

    const gradId = `${ctx.id}-card`;
    ctx.defs.push(linearGradient({
      id: gradId,
      stops: [{ offset: "0%", color: theme.raised, opacity: 0.97 }, { offset: "100%", color: theme.surface, opacity: 0.94 }],
    }));
    const shineId = `${ctx.id}-shine`;
    ctx.defs.push(`<clipPath id="${shineId}">${rect({ x: cardX, y: cardY, w: cardW, h: cardH, rx: 34 })}</clipPath>`);
    const shineX = cardX - cardW * 0.9 + cardW * 2 * easeOutCubic(progress(t, 0.3, 0.86));

    const inner = href
      ? `<image href="${href}" x="${n(cardX + cardW * 0.2)}" y="${n(cardY + 54)}" width="${n(cardW * 0.6)}" height="${n(cardH - 168)}" preserveAspectRatio="xMidYMid meet"/>`
      : [
        rect({ x: cardX + cardW * 0.29, y: cardY + cardH * 0.3, w: cardW * 0.42, h: cardH * 0.42, rx: 48, fill: theme.accent, opacity: 0.92 }),
        rect({ x: cardX + cardW * 0.38, y: cardY + cardH * 0.21, w: cardW * 0.24, h: cardH * 0.11, rx: 28, fill: theme.accentAlt }),
        circle({ cx: cardX + cardW * 0.5, cy: cardY + cardH * 0.72, r: cardW * 0.2, fill: "none", stroke: theme.hairline, strokeWidth: 2 }),
      ].join("");

    const body = [
      group({
        opacity: clamp01(enter * 1.4), transform: translate(0, (1 - enter) * 40),
        children: [
          rect({ x: cardX, y: cardY, w: cardW, h: cardH, rx: 34, fill: `url(#${gradId})`, stroke: theme.hairline, strokeWidth: 2 }),
          inner,
          group({
            "clip-path": `url(#${shineId})`,
            opacity: 0.5 * progress(t, 0.3, 0.5),
            children: rect({
              x: shineX, y: cardY - 80, w: 180, h: cardH + 160, fill: theme.ink, opacity: 0.1,
              transform: `rotate(14 ${n(shineX + 90)} ${n(cardY + cardH / 2)})`,
            }),
          }),
        ],
      }),
    ];

    if (badge) {
      const p = easeOutBack(progress(t, 0.5, 0.82));
      // Popped by size and offset, not by a group scale: the pill keeps its own rounded
      // ends and the label's ink stays where the layout says it is.
      const badgeScale = 0.6 + p * 0.4;
      body.push(chip(ctx, {
        x: cardX - 16 - (1 - p) * 22, y: cardY - 24 - (1 - p) * 14, label: badge,
        size: Math.max(18, Math.round(30 * badgeScale)), fill: theme.accent,
        ink: theme.dark ? theme.surface : "#FFFFFF", opacity: clamp01(p * 1.4),
      }).body);
    }

    const captionY = cardY + cardH + 66;
    if (captionRows.length) {
      const p = rise(t, { start: 0.56, end: 0.86 });
      body.push(group({
        transform: translate(0, p.dy), opacity: p.opacity,
        children: linesEl({
          x: box.x, y: captionY, lines: captionRows, lineHeight: Math.round(ctx.type.bodySize * 1.4),
          family: fonts.body, size: ctx.type.bodySize, fill: theme.muted,
        }),
      }));
    }
    if (price) {
      const p = easeOutQuint(progress(t, 0.62, 0.92));
      body.push(group({
        opacity: p, transform: translate((1 - p) * 30, 0),
        children: text({
          x: box.x + box.w, y: captionRows.length ? captionY + ctx.type.bodySize * 1.4 + 54 : captionY,
          content: price, family: fonts.headline, size: 60, fill: theme.ink, anchor: "end",
        }),
      }));
    }
    return { body, added: { hasImage: Boolean(href) } };
  },
};

// ── 4. comparison layout ──────────────────────────────────────────────────────

/** Two panels entering from opposite sides with a divider that grows between them. */
export const comparison = {
  id: "comparison",
  draw(ctx) {
    const { visual = {}, box, theme, fonts, t } = ctx;
    const gap = 44;
    const panelW = (box.w - gap) / 2;
    const panelH = Math.min(560, box.h - 40);
    const panelY = box.y + 20;

    const panel = (data, index) => {
      const p = easeOutQuint(progress(t, 0.08 + index * 0.08, 0.54));
      const x = box.x + index * (panelW + gap);
      const dx = (1 - p) * (index === 0 ? -70 : 70);
      const titleSize = 40;
      const titleRows = wrapText(String(data.title || data.label || ""), ctx.measureBody, { maxWidth: panelW - 64, size: titleSize });
      // Items wrap to the panel instead of being cut off, and are capped to the rows
      // that actually fit above the panel's bottom edge.
      const itemWidth = panelW - 32 - 76;
      const lineHeight = 40;
      const available = panelY + panelH - 40 - (panelY + 224);
      const maxRows = Math.max(1, Math.floor(available / lineHeight));
      const wrapped = (Array.isArray(data.items) ? data.items : [])
        .map((item) => wrapText(String(item), ctx.measureBody, { maxWidth: itemWidth, size: 31 }))
        .filter((rows) => rows.length);
      const items = [];
      let used = 0;
      for (const rows of wrapped) {
        if (used + rows.length > maxRows) break;
        items.push(rows);
        used += rows.length;
      }
      const rows = items.map((rows, itemIndex) => {
        const ip = easeOutQuint(progress(t, 0.44 + stagger(itemIndex, items.length, 0.28), 0.88));
        const rowY = panelY + 224 + items.slice(0, itemIndex).reduce((sum, previous) => sum + previous.length, 0) * lineHeight;
        return group({
          opacity: ip, transform: translate((1 - ip) * 22, 0),
          children: [
            circle({ cx: x + 46, cy: rowY - 10, r: 14, fill: index === 0 ? theme.accentAlt : theme.accent, opacity: 0.94 }),
            linesEl({
              x: x + 76, y: rowY, lines: rows, lineHeight,
              family: fonts.body, size: 31, fill: theme.muted, block: "compare-item",
            }),
          ],
        });
      });
      return group({
        transform: translate(dx, 0), opacity: clamp01(p * 1.5),
        children: [
          rect({ x, y: panelY, w: panelW, h: panelH, rx: 28, fill: theme.raised, stroke: theme.hairline, strokeWidth: 2 }),
          rect({ x: x + 1, y: panelY + 1, w: panelW - 2, h: 10, rx: 5, fill: index === 0 ? theme.accentAlt : theme.accent, opacity: 0.92 }),
          linesEl({
            x: x + 32, y: panelY + 96, lines: titleRows, lineHeight: 50,
            family: fonts.bodyStrong, size: titleSize, fill: theme.ink,
          }),
          ...rows,
        ],
      });
    };

    const dividerP = easeOutExpo(progress(t, 0.32, 0.84));
    const dividerX = box.x + panelW + gap / 2;
    return {
      body: [
        panel(visual.left || {}, 0),
        panel(visual.right || {}, 1),
        line({
          x1: dividerX, y1: panelY + (1 - dividerP) * (panelH / 2),
          x2: dividerX, y2: panelY + panelH - (1 - dividerP) * (panelH / 2),
          stroke: theme.hairline, strokeWidth: 2,
        }),
      ],
    };
  },
};

// ── 5. quote and testimonial ──────────────────────────────────────────────────

/** An oversized quotation mark, staggered quote lines and an attribution line. */
export const quote = {
  id: "quote",
  draw(ctx) {
    const { visual = {}, slide, box, theme, fonts, t } = ctx;
    const textValue = String(visual.text || slide.sub || slide.headline || "");
    const attribution = String(visual.author || visual.name || "");
    const stars = Number(visual.stars) || 0;

    const markP = easeOutBack(progress(t, 0.06, 0.46));
    const fitted = fitText(textValue, ctx.measureSerif, {
      maxWidth: box.w - 30, maxLines: 5,
      maxSize: Math.round(ctx.type.displaySize * 0.68), minSize: Math.round(ctx.type.displaySize * 0.36),
    });
    const lineHeight = Math.round(fitted.size * 1.28);
    const top = box.y + 190;

    // The mark is grown by drawing it at a larger size rather than by scaling a group:
    // a group scale moves the run away from the box the layout recorded, which is how a
    // frame ends up reporting ink where none is drawn.
    const body = [
      text({
        x: box.x - 4, y: box.y + 168, content: "\u201C", family: fonts.serif,
        size: Math.round(300 * (0.55 + markP * 0.45)), fill: theme.accent,
        opacity: clamp01(markP) * 0.9,
      }),
    ];

    fitted.lines.forEach((line, index) => {
      const start = 0.2 + stagger(index, fitted.lines.length, ctx.motion.stagger * 0.7);
      const p = rise(t, { start, end: start + 0.3, distance: 26 });
      body.push(group({
        transform: translate(0, p.dy), opacity: p.opacity,
        children: text({
          x: box.x + 20, y: top + index * lineHeight, content: line,
          family: fonts.serif, size: fitted.size, fill: theme.ink,
        }),
      }));
    });

    const footY = top + fitted.lines.length * lineHeight + 76;
    const footP = rise(t, { start: 0.62, end: 0.9 });
    body.push(group({
      transform: translate(0, footP.dy), opacity: footP.opacity,
      children: [
        rect({ x: box.x + 20, y: footY - 48, w: 92, h: 5, rx: 3, fill: theme.accent }),
        ...(attribution
          ? [text({ x: box.x + 20, y: footY, content: attribution, family: fonts.mono, size: 30, fill: theme.muted, letterSpacing: 2 })]
          : []),
        ...starRow({
          right: box.x + box.w, cy: footY - 11, size: 32, count: Math.max(0, Math.min(5, stars)), fill: theme.accent,
        }),
      ],
    }));
    return { body, shrunk: fitted.shrunk };
  },
};

// ── 6. call-to-action end card ────────────────────────────────────────────────

/** The closing card: a pulsing button, a sweeping arrow and the handle. */
export const ctaCard = {
  id: "ctaCard",
  draw(ctx) {
    const { visual = {}, slide, box, theme, fonts, t } = ctx;
    // Only copy the user wrote appears on the card. The action keyword is planning
    // metadata, so no default button text is invented for it.
    const label = String(visual.ctaLabel || "").trim();
    const headline = String(slide.headline || "");

    const layout = layoutDisplay(ctx, headline, box, {
      maxLines: 2, tracking: ctx.type.displayTracking,
      lineHeight: Math.round(ctx.type.displaySize * ctx.type.displayLeading),
    });
    const { lineHeight } = layout;
    // When the scene already drew the headline (continuous look), the card leaves the
    // headline out and places the button straight below the box top.
    const top = box.y + 96;
    const { body, fitted } = ctx.headlineDrawn
      ? { body: [], fitted: layout.fitted }
      : displayBlock(ctx, {
        headline, box, layout, top, fill: theme.ink,
        pillInk: theme.dark ? theme.surface : "#FFFFFF",
        tracking: ctx.type.displayTracking, staggerWindow: ctx.motion.stagger,
      });

    const buttonY = ctx.headlineDrawn
      ? box.y + 88
      : top + layout.fitted.lines.length * lineHeight + 88;
    const buttonW = Math.min(box.w, ctx.measureBody(label, 40) + 132);
    const buttonP = easeOutBack(progress(t, 0.44, 0.8));
    const pulse = 1 + Math.sin(clamp01((t - 0.62) / 0.38) * Math.PI * 2) * 0.02;
    const arrowP = easeOutExpo(progress(t, 0.62, 0.96));
    const arrowX = box.x + buttonW + 24 + arrowP * 34;

    // The button pulses about its own centre: a group scale would scale about the
    // canvas origin, which drifts the button and moves its label away from the box the
    // layout recorded (so the two could overlap on a mid-animation frame).
    const buttonH = 104;
    const buttonScale = (0.92 + buttonP * 0.08) * pulse;
    const buttonCentreY = buttonY + buttonH / 2 + (1 - buttonP) * 30;
    const scaledW = buttonW * buttonScale;
    const scaledH = buttonH * buttonScale;
    const labelSize = Math.max(24, 40 * buttonScale);
    if (label) body.push(group({
      opacity: clamp01(buttonP * 1.5),
      children: [
        rect({
          x: box.x + (buttonW - scaledW) / 2, y: buttonCentreY - scaledH / 2,
          w: scaledW, h: scaledH, rx: scaledH / 2, fill: theme.accent,
        }),
        text({
          x: box.x + buttonW / 2, y: buttonCentreY + labelSize * 0.33, content: label,
          family: fonts.bodyStrong, size: Math.round(labelSize),
          fill: theme.dark ? theme.surface : "#FFFFFF", anchor: "middle",
        }),
      ],
    }));
    if (label) body.push(group({
      opacity: arrowP * 0.9,
      children: [
        line({ x1: arrowX - 30, y1: buttonY + 52, x2: arrowX, y2: buttonY + 52, stroke: theme.accent, strokeWidth: 5 }),
        path({
          d: `M ${n(arrowX - 14)} ${n(buttonY + 40)} L ${n(arrowX)} ${n(buttonY + 52)} L ${n(arrowX - 14)} ${n(buttonY + 64)}`,
          stroke: theme.accent, strokeWidth: 5,
        }),
      ],
    }));

    const handle = theme.handle ? `@${String(theme.handle).replace(/^@/, "")}` : "";
    const footnote = [slide.kicker ? String(slide.kicker).toUpperCase() : "", handle].filter(Boolean).join("   ·   ");
    if (footnote) {
      const p = rise(t, { start: 0.7, end: 0.96 });
      body.push(group({
        opacity: p.opacity, transform: translate(0, p.dy),
        // 30px is the readable floor for supporting text on a 1080px canvas; anything
        // smaller stops being legible in a feed and was the "tiny text" on the CTA.
        children: text({ x: box.x, y: buttonY + 194, content: footnote, family: fonts.mono, size: 30, fill: theme.muted, letterSpacing: 3 }),
      }));
    }
    return { body, shrunk: fitted.shrunk };
  },
};

// ── 7. list / steps / checklist reveal ────────────────────────────────────────

/**
 * Rows that tick in one per beat along a progressing rail. Covers the deck's
 * `list`, `checklist`, `steps`, `icon`, `chat` and `phone` visuals, which are all
 * "a short ordered set of short strings" at render time.
 */
export const listReveal = {
  id: "listReveal",
  draw(ctx) {
    const { visual = {}, slide, box, theme, fonts, t } = ctx;
    const items = (visual.items || visual.steps || visual.chips || visual.messages || visual.notifications || [])
      .map((item) => (typeof item === "string" ? item : (item?.title || item?.text || "")))
      .filter(Boolean)
      .slice(0, 5);
    const rows = items.length ? items : [String(slide.sub || "").trim()].filter(Boolean);
    // A slide with no rows and no copy still gets its icon: a sparkle glyph in the box.
    if (!rows.length && visual.icon) {
      const p = easeOutBack(progress(t, 0.1, 0.7));
      const cx = box.x + box.w / 2;
      const cy = box.y + box.h / 2;
      const r = Math.min(box.w, box.h) * 0.3 * p;
      const k = r * 0.22;
      const d = `M ${n(cx)} ${n(cy - r)} Q ${n(cx + k)} ${n(cy - k)} ${n(cx + r)} ${n(cy)} Q ${n(cx + k)} ${n(cy + k)} ${n(cx)} ${n(cy + r)} Q ${n(cx - k)} ${n(cy + k)} ${n(cx - r)} ${n(cy)} Q ${n(cx - k)} ${n(cy - k)} ${n(cx)} ${n(cy - r)} Z`;
      return { body: [group({ opacity: clamp01(p * 1.5), children: path({ d, fill: theme.accent, stroke: "none" }) })] };
    }
    const rowHeight = Math.min(136, Math.floor(box.h / Math.max(1, rows.length)));
    const railP = easeOutExpo(progress(t, 0.14, 0.92));
    const body = [
      line({
        x1: box.x + 15, y1: box.y + 34, x2: box.x + 15,
        y2: box.y + 34 + rowHeight * Math.max(0, rows.length - 0.35) * railP,
        stroke: theme.hairline, strokeWidth: 2,
      }),
    ];

    rows.forEach((row, index) => {
      const start = 0.12 + stagger(index, rows.length, ctx.motion.stagger * 1.15);
      const p = easeOutQuint(progress(t, start, start + ctx.motion.cut + 0.08));
      const y = box.y + 34 + index * rowHeight;
      const tickP = clamp01((p - 0.35) / 0.65);
      const textRows = wrapText(String(row), ctx.measureBody, { maxWidth: box.w - 128, size: ctx.type.bodySize });
      body.push(group({
        opacity: clamp01(p * 1.5), transform: translate((1 - p) * 26, 0),
        children: [
          rect({ x: box.x + 50, y: y + 10, w: box.w - 50, h: rowHeight - 24, rx: 22, fill: theme.raised, opacity: 0.6 * p }),
          circle({ cx: box.x + 15, cy: y + rowHeight / 2 - 2, r: 15 + tickP * 3, fill: index % 2 ? theme.accentAlt : theme.accent }),
          group({
            opacity: tickP,
            children: path({
              d: `M ${n(box.x + 8)} ${n(y + rowHeight / 2 - 2)} l 5 6 l 10 -12`,
              stroke: theme.dark ? theme.surface : "#FFFFFF", strokeWidth: 3.5,
            }),
          }),
          linesEl({
            x: box.x + 78, y: y + rowHeight / 2 + 8, lines: textRows,
            lineHeight: Math.round(ctx.type.bodySize * 1.34), family: fonts.bodyStrong,
            size: ctx.type.bodySize, fill: theme.ink,
          }),
        ],
      }));
    });
    return { body };
  },
};

/** Deck `visual.type` → component. Every type the deck schema allows is covered. */
export const COMPONENTS = Object.freeze({
  headlineReveal, statCounter, productShowcase, comparison, quote, ctaCard, listReveal,
});

const BY_VISUAL_TYPE = Object.freeze({
  icon: "listReveal",
  list: "listReveal",
  checklist: "listReveal",
  steps: "listReveal",
  chat: "listReveal",
  phone: "listReveal",
  stat: "statCounter",
  bars: "statCounter",
  price: "statCounter",
  product: "productShowcase",
  image: "productShowcase",
  compare: "comparison",
  quote: "quote",
  cta: "ctaCard",
});

/** Chooses the component for a slide; the cover always uses the kinetic headline. */
export function componentForSlide(slide, { isCover = false } = {}) {
  if (isCover) return headlineReveal;
  const type = String(slide?.visual?.type || "");
  return COMPONENTS[BY_VISUAL_TYPE[type]] || headlineReveal;
}
