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
import { fitText, wrapText } from "./text.js";
import {
  circle, group, line, linearGradient, lines as linesEl, n, path, rect, text, translate,
} from "./svg.js";

// ── shared drawing helpers ────────────────────────────────────────────────────

/** A rise-and-fade entrance: the signature move every component builds on. */
function rise(t, { start = 0.06, end = 0.42, distance = 34, easing = easeOutQuint } = {}) {
  const p = easing(progress(t, start, end));
  return { p, dy: (1 - p) * distance, opacity: clamp01(p * 1.6) };
}

/** A left-to-right clip reveal, returned as a mask id. */
function wipe(ctx, { x, y, w, h, p, pad = 10 }) {
  const id = `${ctx.id}-wipe-${ctx.defs.length}`;
  const width = Math.max(0, w * clamp01(p));
  ctx.defs.push(`<clipPath id="${id}">${rect({ x: x - pad, y: y - pad, w: width, h: h + pad * 2 })}</clipPath>`);
  return id;
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
 * A headline line whose `[[keyword]]` runs become an accent pill. The pill wipes
 * in behind the words rather than fading, so the keyword lands as a highlight.
 */
function headlineLine(ctx, { x, y, line, size, fill, pillFill, pillInk, p, tracking = 0 }) {
  const segments = String(line).split(/(\[\[[^\]]+\]\])/g).filter(Boolean);
  let cursor = x;
  const body = [];
  for (const segment of segments) {
    const isPill = segment.startsWith("[[") && segment.endsWith("]]");
    const label = isPill ? segment.slice(2, -2) : segment;
    const width = ctx.measure(label, size, tracking);
    if (isPill) {
      const padX = size * 0.34;
      const pillH = size * 1.4;
      const pillP = clamp01((p - 0.3) / 0.7);
      body.push(rect({
        x: cursor - padX, y: y - size * 1.02, w: (width + padX * 2) * pillP, h: pillH, rx: pillH / 2, fill: pillFill,
      }));
      body.push(text({ x: cursor, y, content: label, family: ctx.fonts.headline, size, fill: pillInk, letterSpacing: tracking }));
    } else {
      body.push(text({ x: cursor, y, content: label, family: ctx.fonts.headline, size, fill, letterSpacing: tracking }));
    }
    cursor += width;
  }
  return body;
}

/** Fits and reveals a stack of display lines with a per-line wipe. */
function displayBlock(ctx, { headline, box, maxLines, top, lineHeight, fill, pillInk, tracking, staggerWindow }) {
  const fitted = fitText(headline, ctx.measure, {
    maxWidth: box.w, maxLines,
    maxSize: ctx.type.displaySize, minSize: Math.round(ctx.type.displaySize * 0.5), letterSpacing: tracking,
  });
  const body = [];
  fitted.lines.forEach((line, index) => {
    const start = 0.08 + stagger(index, fitted.lines.length, staggerWindow);
    const p = easeOutQuint(progress(t0(ctx), start, start + ctx.motion.cut + 0.1));
    const baseline = top + index * lineHeight;
    const lineWidth = ctx.measure(line.replace(/\[\[|\]\]/g, ""), fitted.size, tracking);
    const maskId = wipe(ctx, {
      x: box.x, y: baseline - fitted.size * 1.1, w: Math.max(lineWidth, ctx.measure("M", fitted.size)), h: lineHeight * 1.2, p,
    });
    body.push(group({
      transform: translate(0, (1 - p) * fitted.size * 0.18),
      opacity: clamp01(p * 1.5),
      children: group({
        "clip-path": `url(#${maskId})`,
        children: headlineLine(ctx, {
          x: box.x, y: baseline, line, size: fitted.size, tracking, fill,
          pillFill: theme0(ctx).accent, pillInk, p,
        }),
      }),
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
    const lineHeight = Math.round(ctx.type.displaySize * ctx.type.displayLeading);
    const previewFit = fitText(String(slide.headline || ""), ctx.measure, {
      maxWidth: box.w, maxLines: 4, maxSize: ctx.type.displaySize,
      minSize: Math.round(ctx.type.displaySize * 0.5), letterSpacing: ctx.type.displayTracking,
    });
    const blockH = previewFit.lines.length * lineHeight;
    const top = box.y + (box.h - blockH) / 2 + lineHeight * 0.42;

    const { body, fitted } = displayBlock(ctx, {
      headline: String(slide.headline || ""), box, maxLines: 4, top, lineHeight,
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
    return { body, shrunk: fitted.shrunk, warnAt: fitted.atFloor ? String(slide.headline) : null };
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
    const cardH = 540;
    const cardX = box.x + (box.w - cardW) / 2;
    const enter = easeOutQuint(progress(t, 0.06, 0.5));
    const float = Math.sin(clamp01((t - 0.32) / 0.36) * Math.PI) * 12;
    const cardY = box.y + 20 + (1 - enter) * 70 + float;

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
      body.push(chip(ctx, {
        x: cardX - 16, y: cardY - 24, label: badge, size: 30, fill: theme.accent,
        ink: theme.dark ? theme.surface : "#FFFFFF", transform: `translate(0 0) scale(${n(0.6 + p * 0.4)})`,
      }).body);
    }

    const captionRows = caption ? wrapText(caption, ctx.measureBody, { maxWidth: box.w * 0.9, size: ctx.type.bodySize }) : [];
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
      const items = Array.isArray(data.items) ? data.items.slice(0, 4) : [];
      const titleSize = 40;
      const titleRows = wrapText(String(data.title || data.label || ""), ctx.measureBody, { maxWidth: panelW - 64, size: titleSize });
      const rows = items.map((item, itemIndex) => {
        const ip = easeOutQuint(progress(t, 0.44 + stagger(itemIndex, items.length, 0.28), 0.88));
        const rowY = panelY + 224 + itemIndex * 74;
        return group({
          opacity: ip, transform: translate((1 - ip) * 22, 0),
          children: [
            circle({ cx: x + 46, cy: rowY - 10, r: 14, fill: index === 0 ? theme.accentAlt : theme.accent, opacity: 0.94 }),
            text({ x: x + 76, y: rowY, content: String(item).slice(0, 32), family: fonts.body, size: 31, fill: theme.muted }),
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

    const body = [
      group({
        opacity: clamp01(markP),
        transform: `translate(${n(box.x - 4)} ${n(box.y + 168)}) scale(${n(0.55 + markP * 0.45)})`,
        children: text({
          x: 0, y: 0, content: "\u201C", family: fonts.serif, size: 300, fill: theme.accent, opacity: 0.9,
        }),
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
          ? [text({ x: box.x + 20, y: footY, content: attribution, family: fonts.mono, size: 29, fill: theme.muted, letterSpacing: 2 })]
          : []),
        ...(stars
          ? [text({ x: box.x + box.w, y: footY, content: "\u2605".repeat(Math.min(5, stars)), family: fonts.bodyStrong, size: 32, fill: theme.accent, anchor: "end" })]
          : []),
      ],
    }));
    return { body, shrunk: fitted.shrunk };
  },
};

// ── 6. call-to-action end card ────────────────────────────────────────────────

/** Friendly button copy for the deck's own cta vocabulary. */
const CTA_LABELS = Object.freeze({
  link: "Get the link",
  save: "Save this post",
  follow: "Follow for more",
  dm: "Send a DM",
  comment: "Comment below",
});

/** The closing card: a pulsing button, a sweeping arrow and the handle. */
export const ctaCard = {
  id: "ctaCard",
  draw(ctx) {
    const { visual = {}, slide, box, theme, fonts, t } = ctx;
    const action = String(visual.action || "get started").replace(/_/g, " ").toLowerCase();
    // A deck may name its own button copy; otherwise the deck's action vocabulary
    // maps to something a person would actually tap.
    const label = String(visual.ctaLabel || CTA_LABELS[action] || action.charAt(0).toUpperCase() + action.slice(1));
    const headline = String(slide.headline || "");

    const lineHeight = Math.round(ctx.type.displaySize * ctx.type.displayLeading);
    const previewFit = fitText(headline, ctx.measure, {
      maxWidth: box.w, maxLines: 3, maxSize: ctx.type.displaySize,
      minSize: Math.round(ctx.type.displaySize * 0.5), letterSpacing: ctx.type.displayTracking,
    });
    const top = box.y + 96;
    const { body, fitted } = displayBlock(ctx, {
      headline, box, maxLines: 3, top, lineHeight, fill: theme.ink,
      pillInk: theme.dark ? theme.surface : "#FFFFFF",
      tracking: ctx.type.displayTracking, staggerWindow: ctx.motion.stagger,
    });

    const buttonY = top + previewFit.lines.length * lineHeight + 88;
    const buttonW = Math.min(box.w, ctx.measureBody(label, 40) + 132);
    const buttonP = easeOutBack(progress(t, 0.44, 0.8));
    const pulse = 1 + Math.sin(clamp01((t - 0.62) / 0.38) * Math.PI * 2) * 0.02;
    const arrowP = easeOutExpo(progress(t, 0.62, 0.96));
    const arrowX = box.x + buttonW + 24 + arrowP * 34;

    body.push(group({
      opacity: clamp01(buttonP * 1.5),
      transform: `translate(0 ${n((1 - buttonP) * 30)}) scale(${n((0.92 + buttonP * 0.08) * pulse)})`,
      children: [
        rect({ x: box.x, y: buttonY, w: buttonW, h: 104, rx: 52, fill: theme.accent }),
        text({
          x: box.x + buttonW / 2, y: buttonY + 65, content: label, family: fonts.bodyStrong,
          size: 40, fill: theme.dark ? theme.surface : "#FFFFFF", anchor: "middle",
        }),
      ],
    }));
    body.push(group({
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
        children: text({ x: box.x, y: buttonY + 194, content: footnote, family: fonts.mono, size: 28, fill: theme.muted, letterSpacing: 3 }),
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
