/**
 * Regression test for the MavenSync Spaces five-slide promotional carousel.
 *
 * The brief below is the production prompt verbatim (as pasted, run together on
 * one line). Planning must use the supplied copy exactly, in order, and the
 * rendered frames must still show every headline in the same order.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';

import sharp from 'sharp';

import { planCarousel } from '../../../../packages/studio/src/lib/motion/carousel/CarouselPlanner.js';
import { buildNativeSpec } from './spec.js';
import { composeSlideFrame } from './timeline.js';
import { buildFontContext, loadFontRegistry, presetFacesFor } from './fontRegistry.js';

const hasSharp = spawnSync('node', ['-e', "require('sharp')"], { stdio: 'ignore' }).status === 0;
const skip = hasSharp ? false : 'sharp is not installed';

const BRIEF = 'Create a premium five-slide animated Instagram carousel promoting MavenSync Spaces, an AI-powered platform that lets entrepreneurs create and share their own branded AI specialists.'
  + 'Slide 1 \u2014 The Hook"Your AI. Your Brand. Your Rules."'
  + 'Slide 2 \u2014 The Problem"Your expertise deserves more than another chatbot."'
  + 'Slide 3 \u2014 The Solution"Meet MavenSync Spaces."'
  + 'Slide 4 \u2014 The Benefits"Create it. Brand it. Share it."Highlight custom instructions, branded experiences, and shareable AI specialists.'
  + 'Slide 5 \u2014 The Call to Action"Turn Your Knowledge Into an AI Experience."CTA: "Explore MavenSync Spaces"'
  + 'Visual direction: Deep charcoal backgrounds, champagne gold typography, neon pink accents, oversized editorial headlines, layered depth, and elegant kinetic typography.'
  + 'Motion direction: Smooth cinematic transitions, staggered text reveals, subtle zooms, and purposeful movement. Avoid repetitive animations.'
  + 'Preserve all five headlines and their order. Do not replace them with generic marketing copy or placeholder text.';

const HEADLINES = [
  'Your AI. Your Brand. Your Rules.',
  'Your expertise deserves more than another chatbot.',
  'Meet MavenSync Spaces.',
  'Create it. Brand it. Share it.',
  'Turn Your Knowledge Into an AI Experience.',
];

const CTA_LABEL = 'Explore MavenSync Spaces';
const BENEFITS_BODY = 'Highlight custom instructions, branded experiences, and shareable AI specialists.';

const registry = await loadFontRegistry();
const normal = (value) => String(value || '').replace(/\[\[|\]\]/g, '').replace(/\s+/g, ' ').trim();

test('planning keeps the five supplied headlines, verbatim and in order', () => {
  const plan = planCarousel({ brief: BRIEF });
  assert.equal(plan.deck.slides.length, 5, 'five slides from the brief');
  assert.deepEqual(plan.deck.slides.map((slide) => slide.headline), HEADLINES);
  assert.deepEqual(plan.storyboard.slides.map((slide) => slide.headline), HEADLINES);
  assert.deepEqual(plan.deck.slides.map((slide) => slide.kicker), ['THE HOOK', 'THE PROBLEM', 'THE SOLUTION', 'THE BENEFITS', 'THE CALL TO ACTION']);
});

test('planning keeps the benefits description and the CTA label', () => {
  const plan = planCarousel({ brief: BRIEF });
  assert.equal(plan.deck.slides[3].sub, BENEFITS_BODY, 'the description is kept verbatim');
  assert.equal(plan.deck.slides[4].visual.type, 'cta');
  assert.equal(plan.deck.slides[4].visual.ctaLabel, CTA_LABEL);
});

test('planning does not add music or template headlines to the brief copy', () => {
  const plan = planCarousel({ brief: BRIEF });
  assert.equal(plan.deck.music, 'none', 'no music is added by default');
  const text = plan.deck.slides.map((slide) => slide.headline).join(' ');
  assert.ok(!/Meet \[\[|matters now|Three steps/.test(text), 'no generated template headline appears');
});

test('a simple topic still gets generated suggestions', () => {
  const plan = planCarousel({ brief: 'Make an animated carousel about coffee brewing for home cooks' });
  assert.ok(plan.deck.slides.length >= 3, 'a generated deck is planned');
  assert.ok(plan.clarifications.some((line) => /drafts generated/.test(line)), 'generated headlines are flagged as drafts');
});

test('the rendered frame of every slide shows its headline, in the same order', { skip }, async () => {
  const plan = planCarousel({ brief: BRIEF });
  const fontContext = buildFontContext(registry, presetFacesFor('bold_editorial'));
  const spec = buildNativeSpec({
    deck: plan.deck, presetId: 'bold_editorial', fontContext,
    brandId: plan.deck.brand, colors: plan.deck.colors, handle: plan.deck.handle,
  });
  assert.equal(spec.slides.length, 5, 'the spec has five slides');

  for (let index = 0; index < spec.slides.length; index += 1) {
    const { svg, layout } = composeSlideFrame({ spec, slideIndex: index, frameIndex: spec.frames - 1 });
    assert.ok(!/<text/.test(svg), 'no frame may contain a <text> element');
    await sharp(Buffer.from(svg)).raw().toBuffer();

    const drawn = normal(layout.map((run) => run.text).join(' '));
    assert.ok(drawn.includes(HEADLINES[index]), `slide ${index + 1} shows "${HEADLINES[index]}" (drew: "${drawn}")`);
  }

  // Order: each headline must appear after the one before it.
  const rendered = [];
  for (let index = 0; index < spec.slides.length; index += 1) {
    const { layout } = composeSlideFrame({ spec, slideIndex: index, frameIndex: spec.frames - 1 });
    rendered.push(normal(layout.map((run) => run.text).join(' ')));
  }
  rendered.forEach((text, index) => {
    assert.ok(text.includes(HEADLINES[index]), `slide ${index + 1} is in order`);
  });
});

test('the benefits and CTA copy survive rendering', { skip }, async () => {
  const plan = planCarousel({ brief: BRIEF });
  const fontContext = buildFontContext(registry, presetFacesFor('bold_editorial'));
  const spec = buildNativeSpec({
    deck: plan.deck, presetId: 'bold_editorial', fontContext,
    brandId: plan.deck.brand, colors: plan.deck.colors, handle: plan.deck.handle,
  });
  const benefits = composeSlideFrame({ spec, slideIndex: 3, frameIndex: spec.frames - 1 });
  const benefitsText = normal(benefits.layout.map((run) => run.text).join(' '));
  assert.ok(benefitsText.includes('custom instructions'), 'the benefits description is drawn');
  const cta = composeSlideFrame({ spec, slideIndex: 4, frameIndex: spec.frames - 1 });
  const ctaText = normal(cta.layout.map((run) => run.text).join(' '));
  assert.ok(ctaText.includes(CTA_LABEL), `the CTA label is drawn (drew: "${ctaText}")`);
});
