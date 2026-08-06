// Creative OS — Workflow Template Library (Motion Graphics).
//
// The Workflow Template Library is the entry point of the second Creative OS
// execution pattern:
//
//   Workflow Template → Creative Skill → Recipe → Creative Intelligence →
//   Creative Execution → Provider Registry → Provider → Creative Job →
//   Creative Asset → Campaign → Publishing.
//
// A Workflow Template describes a predefined motion scenario that a user (or an
// Agent / AI Twin / Command Bar) can render with a few inputs. Templates are
// configuration only: they never call providers and never execute anything.
// Execution always flows through the motionGraphics recipe and the Motion
// Graphics Runtime (lib/motion/MotionGraphicsRuntime.js).

import { MOTION_SKILL_ID, MOTION_RECIPE_ID } from "./MotionConstants.js";

const input = (label, { type = "string", required = false, default: def = undefined, description = "" } = {}) => ({
  label,
  type,
  required,
  ...(def !== undefined ? { default: def } : {}),
  description,
});

const BRAND_COLORS_DEFAULT = ["#E82070", "#D4A858", "#f43f5e", "#ffffff"];

export const WORKFLOW_TEMPLATE_LIBRARY = Object.freeze({
  "logo-reveal": Object.freeze({
    templateId: "logo-reveal",
    title: "Logo Reveal",
    description: "Animate a brand logo into view with a cinematic reveal and subtle glow.",
    category: "brand",
    inputs: Object.freeze({
      text: input("Brand name", { required: true, default: "ACME", description: "Brand name or tagline to animate" }),
      logo: input("Logo image", { type: "image", description: "Optional logo image to animate in" }),
      brandColors: input("Brand colors", { type: "colors", default: BRAND_COLORS_DEFAULT, description: "Palette applied to the reveal" }),
    }),
    defaultDurationSeconds: 6,
    defaultAspectRatio: "16:9",
    recommendedProvider: "muapi",
    requiredSkills: Object.freeze([MOTION_SKILL_ID]),
    supportedRecipes: Object.freeze([MOTION_RECIPE_ID]),
  }),
  "countdown-timer": Object.freeze({
    templateId: "countdown-timer",
    title: "Countdown Timer",
    description: "An animated countdown with bold numerals, perfect for launches and drops.",
    category: "promotion",
    inputs: Object.freeze({
      text: input("Countdown label", { required: true, default: "Launching in", description: "Label above the countdown" }),
      countdown: input("Countdown value", { type: "number", required: true, default: 10, description: "Starting count value in seconds" }),
      brandColors: input("Brand colors", { type: "colors", default: BRAND_COLORS_DEFAULT, description: "Palette applied to numerals and background" }),
    }),
    defaultDurationSeconds: 10,
    defaultAspectRatio: "9:16",
    recommendedProvider: "muapi",
    requiredSkills: Object.freeze([MOTION_SKILL_ID]),
    supportedRecipes: Object.freeze([MOTION_RECIPE_ID]),
  }),
  "sales-dashboard": Object.freeze({
    templateId: "sales-dashboard",
    title: "Sales Dashboard",
    description: "Animated dashboard with rising bars and glowing revenue numbers.",
    category: "data",
    inputs: Object.freeze({
      text: input("Headline", { required: true, default: "Revenue is up", description: "Headline over the dashboard" }),
      dataPoints: input("Data points", { type: "data", default: ["1.2M", "2.4M", "3.8M", "5.1M"], description: "Values visualized as animated bars" }),
      brandColors: input("Brand colors", { type: "colors", default: BRAND_COLORS_DEFAULT, description: "Palette applied to charts" }),
    }),
    defaultDurationSeconds: 8,
    defaultAspectRatio: "16:9",
    recommendedProvider: "muapi",
    requiredSkills: Object.freeze([MOTION_SKILL_ID]),
    supportedRecipes: Object.freeze([MOTION_RECIPE_ID]),
  }),
  "animated-quote": Object.freeze({
    templateId: "animated-quote",
    title: "Animated Quote",
    description: "Kinetic typography that brings a testimonial or quote to life.",
    category: "typography",
    inputs: Object.freeze({
      text: input("Quote", { required: true, default: "Great things are done by a series of small things.", description: "Quote to animate word by word" }),
      attribution: input("Attribution", { required: false, default: "— Vincent van Gogh", description: "Speaker or source line" }),
      brandColors: input("Brand colors", { type: "colors", default: BRAND_COLORS_DEFAULT, description: "Palette applied to the type" }),
    }),
    defaultDurationSeconds: 8,
    defaultAspectRatio: "9:16",
    recommendedProvider: "muapi",
    requiredSkills: Object.freeze([MOTION_SKILL_ID]),
    supportedRecipes: Object.freeze([MOTION_RECIPE_ID]),
  }),
  "product-spotlight": Object.freeze({
    templateId: "product-spotlight",
    title: "Product Spotlight",
    description: "Showcase a product with orbit motion, highlights, and a callout.",
    category: "product",
    inputs: Object.freeze({
      text: input("Headline", { required: true, default: "Meet the new flagship", description: "Headline beside the product" }),
      images: input("Product images", { type: "images", required: true, description: "Product shot(s) to spotlight" }),
      logo: input("Logo image", { type: "image", description: "Optional brand logo mark" }),
      brandColors: input("Brand colors", { type: "colors", default: BRAND_COLORS_DEFAULT, description: "Palette applied to callouts" }),
    }),
    defaultDurationSeconds: 10,
    defaultAspectRatio: "16:9",
    recommendedProvider: "muapi",
    requiredSkills: Object.freeze([MOTION_SKILL_ID]),
    supportedRecipes: Object.freeze([MOTION_RECIPE_ID]),
  }),
  "social-announcement": Object.freeze({
    templateId: "social-announcement",
    title: "Social Announcement",
    description: "Scroll-stopping animated announcement tuned for social feeds.",
    category: "social",
    inputs: Object.freeze({
      text: input("Announcement", { required: true, default: "Big news drops today", description: "Announcement headline" }),
      subtext: input("Subtext", { required: false, default: "Tune in at noon", description: "Supporting line" }),
      brandColors: input("Brand colors", { type: "colors", default: BRAND_COLORS_DEFAULT, description: "Palette applied to the card" }),
    }),
    defaultDurationSeconds: 6,
    defaultAspectRatio: "9:16",
    recommendedProvider: "muapi",
    requiredSkills: Object.freeze([MOTION_SKILL_ID]),
    supportedRecipes: Object.freeze([MOTION_RECIPE_ID]),
  }),
  "lower-third": Object.freeze({
    templateId: "lower-third",
    title: "Lower Third",
    description: "Animated lower-third title bar for interviews and explainers.",
    category: "broadcast",
    inputs: Object.freeze({
      text: input("Title", { required: true, default: "Product Manager", description: "Role or title line" }),
      attribution: input("Name", { required: true, default: "Priya Sharma", description: "Name line above the title" }),
      brandColors: input("Brand colors", { type: "colors", default: BRAND_COLORS_DEFAULT, description: "Palette applied to the bar" }),
    }),
    defaultDurationSeconds: 5,
    defaultAspectRatio: "16:9",
    recommendedProvider: "muapi",
    requiredSkills: Object.freeze([MOTION_SKILL_ID]),
    supportedRecipes: Object.freeze([MOTION_RECIPE_ID]),
  }),
  "statistics-animation": Object.freeze({
    templateId: "statistics-animation",
    title: "Statistics Animation",
    description: "Animated statistics that count up to a headline number.",
    category: "data",
    inputs: Object.freeze({
      text: input("Statistic label", { required: true, default: "New signups", description: "Label under the number" }),
      dataPoints: input("Statistics", { type: "data", required: true, default: ["98%", "24K", "4.9★"], description: "Numbers animated with count-up motion" }),
      brandColors: input("Brand colors", { type: "colors", default: BRAND_COLORS_DEFAULT, description: "Palette applied to numerals" }),
    }),
    defaultDurationSeconds: 8,
    defaultAspectRatio: "1:1",
    recommendedProvider: "muapi",
    requiredSkills: Object.freeze([MOTION_SKILL_ID]),
    supportedRecipes: Object.freeze([MOTION_RECIPE_ID]),
  }),
  "call-to-action": Object.freeze({
    templateId: "call-to-action",
    title: "Call To Action",
    description: "End-card CTA with pulsing button and urgent copy.",
    category: "promotion",
    inputs: Object.freeze({
      text: input("CTA copy", { required: true, default: "Get it now", description: "Button / headline copy" }),
      subtext: input("Supporting line", { required: false, default: "Limited offer", description: "Line above or below the CTA" }),
      brandColors: input("Brand colors", { type: "colors", default: BRAND_COLORS_DEFAULT, description: "Palette applied to the button" }),
    }),
    defaultDurationSeconds: 5,
    defaultAspectRatio: "16:9",
    recommendedProvider: "muapi",
    requiredSkills: Object.freeze([MOTION_SKILL_ID]),
    supportedRecipes: Object.freeze([MOTION_RECIPE_ID]),
  }),
  "promo-intro": Object.freeze({
    templateId: "promo-intro",
    title: "Promo Intro",
    description: "Open an ad or episode with a bold animated title sequence.",
    category: "intro",
    inputs: Object.freeze({
      text: input("Title", { required: true, default: "Season Two", description: "Main animated title" }),
      subtext: input("Subtitle", { required: false, default: "Every Friday", description: "Supporting line" }),
      logo: input("Logo image", { type: "image", description: "Optional logo lockup" }),
      images: input("B-roll images", { type: "images", description: "Optional background imagery" }),
      brandColors: input("Brand colors", { type: "colors", default: BRAND_COLORS_DEFAULT, description: "Palette applied to the sequence" }),
    }),
    defaultDurationSeconds: 8,
    defaultAspectRatio: "16:9",
    recommendedProvider: "muapi",
    requiredSkills: Object.freeze([MOTION_SKILL_ID]),
    supportedRecipes: Object.freeze([MOTION_RECIPE_ID]),
  }),
});

export const WORKFLOW_TEMPLATE_IDS = Object.freeze(Object.keys(WORKFLOW_TEMPLATE_LIBRARY));

export function getWorkflowTemplate(templateId) {
  const template = WORKFLOW_TEMPLATE_LIBRARY[templateId];
  if (!template) throw new Error(`Unknown workflow template: ${templateId}`);
  return template;
}

export function listWorkflowTemplates({ category = null } = {}) {
  const templates = Object.values(WORKFLOW_TEMPLATE_LIBRARY);
  if (!category) return [...templates];
  return templates.filter((template) => template.category === category);
}

export function resolveTemplateDefaults(templateId, overrides = {}) {
  const template = getWorkflowTemplate(templateId);
  const defaults = { ...overrides };
  for (const [key, def] of Object.entries(template.inputs)) {
    if (defaults[key] === undefined && def.default !== undefined) defaults[key] = def.default;
  }
  return {
    templateId: template.templateId,
    aspectRatio: defaults.aspectRatio || template.defaultAspectRatio,
    durationSeconds: defaults.durationSeconds ?? template.defaultDurationSeconds,
    ...defaults,
  };
}
