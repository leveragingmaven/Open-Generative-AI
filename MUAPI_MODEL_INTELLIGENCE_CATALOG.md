# MuAPI Model Intelligence Catalog
**Prepared for:** MavenSync (AI-powered Creator OS — intelligent model routing)
**Source:** https://muapi.ai/pricing and its category sub-pages (playground group pages)
**Date compiled:** August 13, 2026
**Purpose:** Factual reference for designing MavenSync's routing logic. This document does **not** design the router — it only catalogs what MuAPI verifiably offers, at what price, with what stated capabilities.

---

## 0. How this catalog was built (methodology)

- `muapi.ai/pricing` itself renders its model grid client-side via JavaScript and returned no data to a static fetch. MuAPI's `/playground` and `/playground/group/{category}` pages, however, render full server-side model lists **with live pricing**, so this catalog was built from those category pages instead:
  - `playground/group/text-to-image` (68 models)
  - `playground/group/image-edit` (69 models)
  - `playground/group/text-to-video` (99 models)
  - `playground/group/image-to-video` (157 models)
  - `playground/group/video-edit` (45 models)
  - `playground/group/audio` (17 models)
  - `playground` (category overview, 3D models, and the total catalog count: **591 models across 24 filterable categories**)
- MuAPI's own category breakdown (from the playground index) is:
  - Image to Video: 157 · Text to Video: 99 · Image to Image: 69 · Video to Video: 69 · Text to Image: 68 · **Text to Text / LLM: 44/38** · Other: 22 · Text to Audio: 17 · LoRA Support: 13 · Audio to Video: 13 · Training: 12 · Image to 3D: 5 · Text to 3D: 3
  - This catalog directly verifies **455 models** (the six categories fetched above with full pricing). The **LLM/text-to-text (38-44 models), 3D (8 models), LoRA/Training (13/12 models)** categories are confirmed to exist and named in MuAPI's own UI, but MuAPI does not expose a public per-model pricing page for them the way it does for image/video/audio — see Section 7 for what is and isn't verified there.
- All prices below are quoted **as displayed on MuAPI's pricing pages**, in USD, per generation/call unless MuAPI states a per-second or per-image-count basis (noted inline). MuAPI displays a "credits" cost and a discounted/current cost side-by-side on some pages (e.g., "$0.0333 → $0.030" or shown with a "10% off" badge); this catalog reports the **effective/current price** MuAPI shows, since that's what a router would actually pay.
- **Verified from MuAPI** = pulled directly from MuAPI's own pages (name, category, price, MuAPI's own description).
- **Needs MavenSync testing** = anything about real-world output quality, reliability, consistency, brand adherence, or comparative "best" claims — MuAPI's own FAQ text sometimes makes soft claims ("X leads on Y"); these are marked as MuAPI's own marketing claims, not independently verified, and are flagged for MavenSync to test before trusting.

---

## 1. High-level shape of the catalog (verified)

MuAPI is fundamentally a **pass-through aggregator**: one `POST /api/v1/{model}` + poll `GET /api/v1/predictions/{id}/result` pattern in front of dozens of underlying providers (Black Forest Labs/FLUX, ByteDance/Seedance & Seedream, Google/Veo & Imagen & Gemini, Kling/Kuaishou, Alibaba/Wan & Qwen, MiniMax/Hailuo, OpenAI/GPT-Image & Sora, xAI/Grok Imagine, Vidu, PixVerse, Runway, Midjourney, Suno, ElevenLabs, Topaz, Leonardo.Ai, Ideogram, Lightricks/LTX, Meshy, Tripo3D, and several MuAPI-built utility wrappers).

Three structural facts matter enormously for a router design:

1. **Massive intra-family duplication.** A large fraction of the 591 "models" are not distinct models — they are the same underlying model exposed at different **resolutions (480p/720p/1080p/4K), regions (`-intl` vs mainland), and moderation levels (`-spicy` = relaxed content filtering)**. Seedance 2.5 alone contributes roughly **60 separate endpoints** in the image-to-video and text-to-video categories that are all one model with parameterized price scaling.
2. **Price scales predictably with resolution/duration, not just "quality."** E.g., Seedance 2.5 Image-to-Video: 480p $0.85 → 720p $1.70 → 1080p $4.25 → 4K $8.50 — a strict multiplier ladder, not different models. A router does not need 4 separate "model choices" here; it needs one model with a resolution parameter.
3. **"Spicy"/"-intl" variants are a moderation/region toggle, not a quality toggle.** MuAPI's own descriptions confirm this explicitly ("relaxed-moderation sibling of the standard tier... bolder, higher-contrast output" / "served via Seegen's Dreamina-hosted deployment... for traffic outside mainland China"). These are policy/routing-region flags, not creative-quality flags.

---

## 2. Text-to-Image (Verified: 68 models)

**Category page claim (MuAPI FAQ, marketing, unverified):** "Flux Schnell and Seedream lead on photoreal speed; HiDream and Reve produce the most accurate in-image text; Midjourney and Qwen Image lead on stylized artistic output; GPT-Image is the strongest generalist with editing support." — *Needs MavenSync testing.*

### Lowest-cost viable
| Model | Price | Notes (MuAPI's own description) |
|---|---|---|
| `flux-schnell` | **$0.003** | "Lightning-fast... perfect for real-time concept testing, brainstorming" |
| `z-image-p` | $0.004 | PiAPI's Qubico/z-image model |
| `sdxl-image` | $0.004 | Classic SDXL, photorealistic + stylized |
| `flux-2-klein-4b-turbo` | $0.005 | Distilled, near-instant rendering |
| `hidream-i1-fast` | $0.008 | Few-step variant, "previews... fast results over fine detail" |
| `z-image-turbo` | $0.007 | High-speed, "strong stylization control" |
| `flux-2-klein-9b-turbo` | $0.006 | Mid-size distilled, "richer textures... reduced generation times" |

### Mid-range / value
| Model | Price | Notes |
|---|---|---|
| `flux-dev` | $0.015 | General-purpose, design/storytelling/concept art |
| `flux-krea-dev` | $0.015 | Tuned to avoid "AI look" (plastic skin, overexposure) |
| `nano-banana` (Gemini 2.5 Flash Image) | $0.030 | "Hyper-realistic, physics-aware... seamless style transformations" |
| `qwen-image` | $0.030 | Realistic-to-artistic, "product shots, concept art" |
| `google-imagen4-fast` | $0.020 | Speed-optimized Imagen 4 |
| `ideogram-v3-t2i` | $0.020 | Strongest **in-image text rendering** claim among mid-tier |
| `bytedance-seedream-v3` | $0.030 | Fantasy/anime/surreal specialization |

### Premium
| Model | Price | Notes |
|---|---|---|
| `nano-banana-pro` (Gemini 3.1 Flash Image, high-res) | $0.120 | 4K, "revolutionary character consistency" |
| `nano-banana-2` | $0.060 | Same family, non-"pro" tier |
| `midjourney-v8` / `midjourney-v7` / `midjourney-niji` | $0.100 each | Returns **4 images per call** — effectively ~$0.025/image |
| `gpt-image-2-text-to-image` | $0.090 | Up to 20,000-char prompts |
| `google-imagen4-ultra` | $0.060 | Google's flagship photoreal tier |
| `qwen-image-2.0-pro` | $0.090 | "Maximum realism and fidelity" |
| `flux-2-flex` | $0.090 | Surreal/sci-fi/high-res artistic compositions |
| `hunyuan-image-3.0` | $0.065 | MoE + autoregressive architecture, narrative-prompt reading |

### Apparent redundancy (router should collapse these)
- **Flux Kontext T2I tiers** (`flux-kontext-dev-t2i` $0.020 / `flux-kontext-pro-t2i` $0.030 / `flux-kontext-max-t2i` $0.060) — one family, three quality/price rungs.
- **Qwen 3.0 vs Qwen Image vs Qwen Image 2.0 vs Qwen Image 2.0 Pro** — four separate endpoints ($0.030–$0.090) for what is functionally one model line at different generations/tiers.
- **HiDream i1 fast/dev/full** — same base model, speed-vs-detail knob, not 3 distinct capabilities.
- **Flux-2-Klein 4B vs 4B-Turbo vs 9B vs 9B-Turbo** — a 2×2 size/speed matrix, not 4 independent models.

### Specialist tool worth flagging
- `tiktok-carousel` ($0.028) — purpose-built for TikTok carousel posts (1080×1920, 3–10 slides, "Problem-Solution/Listicle/Tutorial/Before-After" formats). For social carousel content this is likely cheaper and more format-correct than orchestrating a general T2I model + manual layout.

---

## 3. Image Editing (Verified: 69 models)

MuAPI's own framing: "Flux Kontext Pro/Max are the new standard for instruction-following edits; GPT-Image handles compositional rewrites; Seededit and Qwen Edit are cost-efficient alternatives." — *Needs MavenSync testing.*

### Lowest-cost viable
| Model | Price | Use case |
|---|---|---|
| `ai-skin-enhancer` | $0.010 | Portrait retouching |
| `ai-background-remover` | $0.010 | Background removal (see §6) |
| `flux-redux` | $0.010 | Style transfer / reinterpretation, preserves structure |
| `minimax-image-01-subject-reference` | $0.010 | Preserve subject identity across edits |
| `portrait-stylist` | $0.010 | Hair/makeup/fashion transformation presets |
| `ai-color-photo` | $0.010 | B&W photo colorization |
| `flux-2-klein-4b-turbo-edit` | $0.008 | Fastest instruction-edit |

### Mid-range / value
| Model | Price | Use case |
|---|---|---|
| `flux-kontext-pro-i2i` | $0.030 | Structure-preserving refinement/re-theming |
| `bytedance-seededit-v3` | $0.030 | Mask + prompt semantic edits |
| `qwen-image-edit` / `qwen-image-edit-plus` | $0.030–$0.033 | Multi-reference edits, bilingual text edit |
| `nano-banana-edit` | $0.030 | Precise language-driven edits, character preservation |
| `ai-product-shot` | $0.060 | E-commerce-ready product images |
| `ai-product-photography` | $0.050 | Studio/lifestyle backgrounds from a product photo |

### Premium
| Model | Price | Use case |
|---|---|---|
| `gpt-image-2-image-to-image` | $0.090 | Up to 16 input images, precise style transfer |
| `nano-banana-pro-edit` | $0.120 | Highest-res Google edit tier |
| `ideogram-character` | $0.150 | Consistent character across unlimited scenes from **one** reference image |
| `photo-pack` | $0.300 | Multi-style professional portrait pack (LinkedIn/CEO/Tinder styles) generated as a batch |
| `seedance-2-character` | $0.180 | (Beta) Turns a character reference into a reusable `character_id` for video |
| `ideogram-v3-reframe` | $0.150 | AI outpainting to new aspect ratios |
| `topaz-image-upscale` | $0.075 | Dedicated super-resolution (see §6) |

### Apparent redundancy
- **Nano Banana Edit / Nano Banana 2 Edit / Nano Banana 2 Lite Edit / Nano Banana Pro Edit** — one Google Gemini-Flash-Image lineage at 4 price points ($0.030/$0.060/$0.030/$0.120). MavenSync likely only needs 1–2 of these as routed defaults (cheap default + premium override), not all four exposed.
- **Seedream v4 / v4.5 / v5.0 Edit and their "Pro" siblings** — six near-identical endpoints ($0.033–$0.050) differentiated mainly by generation number and resolution ceiling.
- **Flux-2-Klein 4B/9B × Edit × Turbo** — another 2×2×edit matrix (4 endpoints, $0.010–$0.023).

### Specialist tools cheaper/more appropriate than a general edit model
- **Background removal:** `ai-background-remover` ($0.010) is purpose-built and far cheaper than asking a general edit model (e.g., `gpt4o-edit` $0.040, `flux-kontext-pro-i2i` $0.030) to "remove the background."
- **Product photography:** `ai-product-shot` ($0.060) / `ai-product-photography` ($0.050) are purpose-tuned for e-commerce; MuAPI's own image-edit FAQ explicitly recommends the dedicated `product-shot` endpoint over Flux Kontext for "standardized e-commerce flows."
- **Upscaling:** `ai-image-upscaler` ($0.020) or `seedvr2-image-upscale` ($0.020, restoration/deblur/artifact-removal focus) are cheaper and purpose-built vs. `topaz-image-upscale` ($0.075, premium super-resolution) — see §6 for the full upscaling comparison.
- **Watermarking:** `add-image-watermark` — **free**, local PIL processing, no model call needed at all.
- **Dress/outfit change:** `ai-dress-change` ($0.100) is a dedicated virtual try-on tool rather than a general edit prompt.

---

## 4. Product Photography & Background Removal (cross-cut, verified)

These aren't separate MuAPI top-level categories but are explicit **named tools** in MuAPI's nav (`AI Background Remover`, `Product Shot`) and repeatedly called out in image-edit descriptions — grouping them here for MavenSync's use-case-first structure.

| Model | Price | Notes |
|---|---|---|
| `ai-background-remover` | $0.010 | "Pixel-perfect precision... product photos, profile pictures" |
| `video-background-remover` | $0.010 | Same, for video; frame-accurate matting, up to 60s, transparent WebM/MOV/MP4/GIF out |
| `ai-product-shot` | $0.060 | Studio-quality e-commerce/ad/catalog shots |
| `ai-product-photography` | $0.050 | Studio/lifestyle/creative backgrounds from item photo + prompt |
| `ai-dress-change` | $0.100 | Virtual try-on / outfit change |
| `flux-pulid` | $0.040 | Identity-consistent face rendering across styles (useful for consistent brand talent/model shots) |

**Routing takeaway:** for e-commerce/product-photo workflows, a router should prefer these dedicated tools over routing to `flux-kontext-pro-i2i` or `gpt-image-2-image-to-image` — same/lower cost, purpose-tuned, and MuAPI itself recommends this in its FAQ.

---

## 5. Upscaling (cross-cut, verified)

| Model | Price | Modality | Notes |
|---|---|---|---|
| `ai-image-upscaler` | $0.020 | Image | General-purpose super-resolution |
| `seedvr2-image-upscale` | $0.020 | Image | One-step diffusion-transformer; restoration/deblur/artifact-removal focus |
| `topaz-image-upscale` | $0.075 | Image | Premium — Topaz's dedicated super-resolution engine, "restores texture, reduces noise" |
| `ai-video-upscaler` | $0.030 | Video | General-purpose |
| `ai-video-upscaler-pro` | $0.240 | Video | Higher-fidelity tier of the above |
| `topaz-video-upscale` | $0.080 | Video | Premium — Topaz engine for video |

**Redundancy note:** `ai-image-upscaler` and `seedvr2-image-upscale` are priced identically ($0.020) and both general-purpose — likely functionally interchangeable for a router's default "cheap upscale" path. `topaz-image-upscale`/`topaz-video-upscale` are the clear premium/quality-first picks when fidelity matters more than cost (3–8x the base price).

---

## 6. Text-to-Video (Verified: 99 models)

MuAPI's own claim (marketing, unverified): "Veo 3 and Kling Master produce the highest-quality cinematic output... Seedance Lite and Hunyuan are the fastest and cheapest... Runway delivers the strongest motion fidelity." — *Needs MavenSync testing.*

### Lowest-cost viable
| Model | Price | Notes |
|---|---|---|
| `wan2.2-5b-fast-t2v` | **$0.016** | Lightweight/fast Wan 2.2, trades detail for speed |
| `hunyuan-fast-text-to-video` | $0.050 | "Excellent speed," reduced detail |
| `seedance-pro-t2v-fast` | $0.060 | ByteDance fast-tier |
| `pixverse-v5.5-t2v` | $0.100 | Stylized fantasy/anime, fluid motion |
| `seedance-lite-t2v` | $0.100 | "Fast previews, prototyping" |
| `wan2.7-text-to-video` | $0.100 | Alibaba's latest-gen fast tier |
| `grok-imagine-text-to-video` | $0.150 | 6–30s clips w/ ambient audio |
| `ltx-2.3-text-to-video` | $0.104 | Lightricks, sharper temporal consistency |

### Mid-range / value
| Model | Price | Notes |
|---|---|---|
| `veo3.1-lite-text-to-video` | $0.300 | Lighter/faster Veo 3.1 |
| `wan2.1-text-to-video` / `wan2.2-text-to-video` | $0.300 | Cinematic/anime-leaning, thematic consistency |
| `minimax-hailuo-02-standard-t2v` | $0.300 | "Quick drafts... speed over cinematic quality" |
| `kling-v2.5-turbo-pro-t2v` | $0.450 | "Top-tier motion fluidity" at turbo pricing |
| `openai-sora-2-text-to-video` | $0.800 | 10s clips, synchronized audio |
| `veo3-fast-text-to-video` | $0.600 | Balance of speed/quality |

### Premium
| Model | Price | Notes |
|---|---|---|
| `veo-4-text-to-video` | $3.000 | "Photorealistic, high-fidelity 1080p... exceptional prompt adherence" |
| `veo3-text-to-video` / `veo3.1-text-to-video` | $2.500 | Full-quality Veo 3 tier |
| `openai-sora-2-pro-text-to-video` | $2.400 | High-fidelity Sora tier |
| `kling-v3.0-4k-text-to-video` | $2.000 | 3840×2160 output |
| `kling-v3.0-omni-4k-text-to-video` | $2.679 | 4K + multi-image reference |
| `seedance-2.5-*-4k` variants | $8.50–$10.39 | Highest-priced tier in the whole category — **note: MuAPI explicitly states these are "upscaled from the model's native 720p render (not a native 4K output)"** — i.e., paying premium price for an upscale, not native 4K generation. Important for router cost/quality logic.

### Apparent redundancy (very high in this category)
- **Seedance 2.5 alone accounts for ~50 of the 99 text-to-video endpoints** — the same model exposed across: resolution (480p/720p/1080p/4K) × region (`-intl`/mainland) × moderation (`spicy`/standard) × function (text-to-video / video-extend / video-edit / omni-reference / first-last-frame). A router should model this as **one logical model with 4 parameters** (resolution, region, moderation, mode), not 50 separate catalog entries.
- **Kling v3 Turbo (Standard/Pro) vs Kling v3.0 (Standard/Pro/4K) vs Kling v3 Omni (Standard/Pro/4K)** — three parallel Kling v3 product lines, largely differentiated by resolution and reference-image support, not creative capability.
- **Veo 3 / Veo 3 Fast / Veo 3.1 / Veo 3.1 Fast / Veo 3.1 Lite / Veo 4** — six tiers of one Google lineage; the fast/lite variants are ~4-8x cheaper than full Veo 3/4 for (per MuAPI's description) similar realism at lower fidelity/detail.

### Specialist tools in this category
- `motion-graphics` ($0.630) — not a diffusion video model at all; MuAPI states it generates "animated motion graphics videos... using AI-generated React/Remotion code rendered on Modal." This is a code-generation-to-video pipeline, useful specifically for kinetic-typography/infographic-style content where a diffusion model would be the wrong tool.
- `*-extend` models (`veo3.1-extend-video`, `grok-imagine-extend`, `seedance-2-extend`, etc.) — purpose-built for continuing an existing generated clip rather than regenerating from scratch; meaningfully cheaper than a full re-generation for "make it longer" requests.

---

## 7. Image-to-Video (Verified: 157 models — the largest single category)

MuAPI's own claim: "Kling Pro and Veo 3 lead on quality; Wan 2.1/2.2 and Seedance lead on cost; Runway and Pixverse are tuned for social-vertical content." — *Needs MavenSync testing.*

### Lowest-cost viable
| Model | Price | Notes |
|---|---|---|
| `vidu-q2-turbo-start-end-video` | **$0.060** | Interpolates between start/end frames |
| `seedance-pro-i2v-fast` | $0.060 | Fast-tier ByteDance I2V |
| `runway-act-two-i2v` | $0.070 | Drives facial expressions/head movement from a source video onto a still image — **avatar-relevant**, see §9 |
| `seedance-lite-i2v` / `seedance-lite-reference-video` | $0.100 | Fast demos, mobile-friendly |
| `wan2.7-image-to-video` / `wan2.7-reference-to-video` | $0.100 | Alibaba latest-gen |
| `pixverse-v5.5-i2v` | $0.100 | Smooth camera motion, preserves art style |
| `grok-imagine-image-to-video` | $0.150 | 6–30s, synchronized ambient audio |
| `ltx-2.3-image-to-video` | $0.104 | Sharper temporal consistency |

### Mid-range / value
| Model | Price | Notes |
|---|---|---|
| `kling-v2.1-standard-i2v` | $0.225 | Smooth, realistic single-frame animation |
| `kling-v2.5-turbo-std-i2v` | $0.280 | Turbo-tier Kling |
| `minimax-hailuo-2.3-standard-i2v` | $0.360 | Balanced quality/speed/coherence, 768p |
| `wan2.5-image-to-video` | $0.650 | Realistic physics/camera panning |
| `kling-v3.0-standard-image-to-video` | $0.720 | Stable motion, natural physics — MuAPI's own "Top 5" pick for this category |

### Premium
| Model | Price | Notes |
|---|---|---|
| `veo3-image-to-video` / `veo3.1-image-to-video` | $2.500 | "Adding lifelike movement while preserving composition" |
| `openai-sora-2-pro-image-to-video` | $2.400 | Highest Sora I2V tier |
| `veo-4-image-to-video` | $3.000 | Fine-grained camera control + realistic physics, up to 1080p |
| `kling-v3.0-4k-image-to-video` | $2.000 | 4K animation from single image |
| `kling-v3.0-omni-4k-image-to-video` | $2.679 | 4K + up to 4-image reference blending |
| `seedance-2-vip-*-4k` tiers | $6.75–$7.50 | ByteDance's highest priority-routing 4K tier (again, upscaled-from-720p per family-wide pattern noted in §6) |

### Apparent redundancy — this category is dominated by it
- **Seedance 2 / 2.5 family = well over 100 of the 157 endpoints in this single category.** Same axes as text-to-video: resolution × region × moderation × mode (standard I2V / omni-reference / first-last-frame / VIP priority-routing / fast / extend). A router should treat "Seedance image-to-video" as **one model card with parameters**, not 100+ catalog rows.
- **"Omni Reference" appears as a MuAPI-wide pattern**, not unique to Seedance: `seedance-2-omni-reference`, `minimax-h3-reference-to-video`, `kling-o1-reference-to-video`, `vidu-q1-reference`, `happy-horse-*-reference-to-video`, `wan2.7-reference-to-video`, `gemini-omni-image-to-video`. These all solve the same job — "animate consistent with N reference images/videos/audio" — with materially different pricing ($0.065 Vidu Q2 Reference → $1.50+ Seedance/MiniMax H3). This is a strong routing signal: default to the cheapest reference-consistency tool unless quality testing shows otherwise.

### Specialist tools worth flagging
- `pixverse-v6-transition` ($0.300) — dedicated start/end-image transition tool (distinct from full I2V generation).
- `runway-act-two-i2v` ($0.070) — performance-transfer (drives a still photo/illustration to speak/blink/move from a driving video) — directly useful for **avatar** pipelines at a much lower price point than full video generation models.
- `video-effects` / `ai-video-effects` / `vfx` / `motion-controls` ($0.300 each) — templated cinematic-filter/VFX-overlay tools, cheaper and more predictable than prompting a general I2V model for "add an explosion effect."

---

## 8. Video Editing / Video-to-Video (Verified: 45 models)

### Lowest-cost viable
| Model | Price | Notes |
|---|---|---|
| `add-video-watermark` | **Free** | Local FFmpeg processing, no model call |
| `seedance-2-watermark-remover` | Free (promo) | LaMa AI inpainting; "requires a positive balance to access" but no credits deducted |
| `video-background-remover` | $0.010 | Up to 60s, frame-accurate matting |
| `mmaudio-v2-video-to-video` | $0.010 | Generates synchronized audio for existing video |
| `remix-video` / `seedance-2-video-watermark-remover-pro` | $0.025 / $0.065 | Resize/remix; premium watermark removal ($0.013/sec, 5s min) |
| `autocrop` | $0.050 | AI subject-tracking reframe to target aspect ratio |
| `video-combiner` | $0.050 | Stitches multiple clips into one — **no generative model needed** |
| `volcengine-video-to-video-lip-sync` | $0.100 | Lip-sync existing video to new audio — see §9 |
| `ai-video-face-swap` | $0.100 | Expression transfer + lighting-consistent face swap |
| `kling-v3.0-std-motion-control` | $0.100 | Explicit camera-move (pan/tilt/orbit/dolly/zoom) control |

### Mid-range / value
| Model | Price | Notes |
|---|---|---|
| `wan2.2-edit-video` / `wan2.2-animate` | $0.300–$0.350 | Text-command edits / character replacement in existing footage |
| `runway-aleph-v2v` | $0.200 | Restyle footage while preserving motion/structure |
| `heygen-video-translate` | $0.250 | 175+ languages, voice clone + lip sync, "$0.05/sec" basis |
| `ai-clipping` | $0.500 | Long-form → short clips (repurposing tool) |
| `kling-v2.6-pro-motion-control` | $0.145 | Precise camera + subject motion control |

### Premium
| Model | Price | Notes |
|---|---|---|
| `kling-o1-standard-video-edit` / `kling-o1-video-edit` | $1.09–$1.21 | Color grade, background replace, object removal, style transfer, speed ramps |
| `seedance-2-video-edit` | $1.500 | Full ByteDance video-edit tier |
| `gemini-omni-video-edit` | $2.400 | "Unified reasoning across modalities... restyle, relight, swap subjects, rewrite scenes" |
| `happy-horse-1-video-edit-1080p` | $2.100 | Premium instruction-based edit at 1080p |

**Routing takeaway:** This category contains several **free or near-free utility operations** (watermarking, clip combining, background removal, basic audio-sync) that a naive router might otherwise send to an expensive generative video-edit model. These should be hard-coded as their own tool tier, not folded into "video editing = call a $1+ model."

---

## 9. Avatars / Lip Sync (cross-cut, verified — no single MuAPI category page, assembled from image-to-video and video-edit listings)

| Model | Price | Modality | Notes |
|---|---|---|---|
| `volcengine-video-to-video-lip-sync` | $0.100 | Video-to-video | "Drive a video's lip movements to match a target audio track" |
| `infinitetalk-video-to-video` | $0.200 | Video-to-video | Reanimates speaker's mouth/expressions to match new dialogue on an existing video |
| `runway-act-two-i2v` | $0.070 | Image-to-video | Single photo/illustration + driving video → talking, blinking, moving portrait |
| `runway-act-two-v2v` | $0.300 | Video-to-video | Same performance-transfer, applied to an existing character video (dubbing/reshoot use case) |
| `ovi-image-to-video` / `ovi-text-to-video` | $0.200 | I2V / T2V | Built-in lip sync + dialogue + ambient SFX baked into a unified audio-video generation (540p) |
| `heygen-video-translate` | $0.250 | Video-to-video | Full localization: voice clone + lip sync + translation, 175+ languages |
| `gemini-omni-character` | Not priced on group page (free-tier utility) | Image-to-image | "Generate a reusable character from a single reference image + text description," optionally attach a Gemini Omni Audio voice profile for consistent voice across future videos |
| `seedance-2-character` | $0.180 | Image-to-image | (Beta) Turns character references into a `character_id` reusable across Seedance Omni Reference video generations |

**Routing takeaway:** For a "make this photo talk" avatar use case, `runway-act-two-i2v` ($0.070) is dramatically cheaper than routing to a full I2V generation model, and purpose-built for exactly that job. For "translate/localize an existing talking-head video," `heygen-video-translate` bundles voice-clone + lip-sync + translation in one call rather than chaining three separate tools.

---

## 10. Audio / Voice / Music (Verified: 17 models)

MuAPI's own claim: category groups into Music (Suno), TTS/voice (MiniMax, ElevenLabs, Gemini TTS), and sound-matching-to-video (MMAudio). — reasonably well supported by the listing itself.

### Lowest-cost viable
| Model | Price | Notes |
|---|---|---|
| `mmaudio-v2-text-to-audio` | **$0.010** | Text→speech/ambient audio, "voiceovers, virtual assistants" |
| `suno-convert-to-wav` | $0.010 | Format conversion utility, not generative |
| `suno-generate-sounds` | $0.020 | Sound-effects generation (Suno "chirp-crow" model) |
| `gemini-3-1-flash-tts` | $0.035 | Multi-speaker expressive TTS, "fast, affordable voiceovers" |
| `gemini-2-5-pro-tts` | $0.035 | Google's premium-branded TTS at budget price |
| `elevenlabs-tts-turbo-2-5` | $0.050 | Adjustable stability/similarity/speed |

### Mid-range / value
| Model | Price | Notes |
|---|---|---|
| `suno-create-music` | $0.090 | Full song incl. vocals/lyrics/instrumentation |
| `suno-remix-music` / `suno-extend-music` / `suno-add-vocals` / `suno-add-instrumental` / `suno-generate-mashup` | $0.090 each | Suno's manipulation suite — one price point across operations |
| `elevenlabs-text-to-dialogue-v3` | $0.100 | Expressive multilingual dialogue generation |

### Premium
| Model | Price | Notes |
|---|---|---|
| `minimax-speech-2.6-hd` / `minimax-speech-2.6-turbo` | $0.650 each | "Studio-quality speech... realistic emotion, no background noise" |
| `minimax-voice-clone` | $0.650 | Voice cloning from short reference sample |

### Apparent redundancy
- `minimax-speech-2.6-hd` and `minimax-speech-2.6-turbo` are **identically priced** ($0.650) despite one being positioned as "HD/studio quality" and the other as "fast/lightweight" — worth a MavenSync quality test to confirm there's an actual output-quality difference justifying keeping both in a router's tool list, since price offers no signal here.
- Gemini's two TTS tiers (`gemini-3-1-flash-tts`, `gemini-2-5-pro-tts`) are also identically priced ($0.035) — same note applies.

### Specialist tool
- `suno-voice-clone` — **free during preview**, includes an anti-deepfake liveness check (10s sample + spoken back-phrase) to generate a reusable `voice_id` for Suno music generation specifically (singing-voice cloning, distinct from MiniMax's speaking-voice clone).

---

## 11. Text/Reasoning, Copywriting, Research (LLM category — 38–44 models, NOT independently priced on public pages)

**Verified from MuAPI:** MuAPI's own playground UI explicitly lists an **"LLM Models" filter (44 in the "Text to Text" bucket / 38 in "LLM")** and names, in its top-level marketing copy, access to **"GPT, Claude, Gemini, Grok via a single API."** Individual named LLM endpoint families visible in MuAPI's own nav include **Gemini Omni**, **OpenAI**, **Grok**, plus general references to Claude and GPT.

**Needs MavenSync verification:** Unlike every other category above, MuAPI does not expose a public `/playground/group/{text-to-text}` pricing page (or it is not reachable via a stable static URL the way image/video/audio group pages are). This catalog could **not** verify:
- Individual LLM model names/endpoint identifiers within this bucket
- Per-token or per-call pricing for text/reasoning models
- Context window, tool-use/function-calling support, or streaming support claims

**Recommendation for MavenSync:** Before routing any copywriting/research/reasoning workload through MuAPI, pull live pricing/model-list data from an authenticated MuAPI dashboard or API `models` endpoint (MuAPI's docs reference `GET /api/v1/{model}` schemas via OpenAPI) rather than relying on this catalog, since this section is the one gap in otherwise-verified coverage. Given MuAPI's aggregator model elsewhere (charging a **markup over provider list price** — visible from the fact MuAPI's Gemini/GPT-Image/Grok image and video prices track noticeably above direct API list pricing in other categories), it is reasonable to expect LLM text calls through MuAPI to carry a similar markup over calling OpenAI/Anthropic/Google directly — this should be verified, not assumed, before MavenSync routes high-volume text workloads here.

---

## 12. 3D Generation (named models visible, not independently priced)

**Verified from MuAPI (names/use case only, via playground index):**
| Model | Modality |
|---|---|
| `meshy-6-image-to-3d` / `meshy-6-multi-image-to-3d` | Image(s) → 3D model |
| `meshy-6-text-to-3d` | Text → 3D model |
| `tripo3d-h31-image-to-3d` / `tripo3d-h31-text-to-3d` / `tripo3d-h31-multiview-to-3d` | Image/text/multiview → 3D |
| `tripo3d-p1-image-to-3d` / `tripo3d-p1-text-to-3d` | Image/text → 3D (P1 tier) |

**Needs MavenSync verification:** pricing was not shown on the fetched pages for this category (8 endpoints total, per MuAPI's own category counts: Image to 3D = 5, Text to 3D = 3). Not relevant to most Creator-OS content pipelines unless MavenSync plans to support product/AR/3D-asset workflows — flagged for future research only if that becomes in-scope.

---

## 13. LoRA Support & Training (13 + 12 models, not independently priced)

**Verified from MuAPI:** MuAPI's playground filters confirm dedicated **"Lora Support" (13 models)** and **"Training" (12 models)** categories exist — i.e., MuAPI supports custom LoRA fine-tuning / style-training workflows on top of some base models (this is consistent with `wan2.1-image-to-video`'s stated "supports custom LoRA fine-tunes for identity consistency," per third-party documentation of MuAPI's Wan 2.1 LoRA I2V node).

**Needs MavenSync verification:** No pricing table was reachable for these categories. If MavenSync ever wants brand-specific fine-tuned models (e.g., a creator's consistent character/product style baked into a LoRA rather than prompted via reference images each time), this is worth a dedicated follow-up investigation — it's a fundamentally different cost model (training cost + inference cost) than everything else in this catalog.

---

## 14. Specialist / Utility Tools (cross-cut summary, verified)

These are tools that solve a narrow job better/cheaper than routing to a general generative model — the clearest "don't use a sledgehammer" candidates for MavenSync's router:

| Job | Dedicated tool | Price | Why not a general model |
|---|---|---|---|
| Remove image background | `ai-background-remover` | $0.010 | 3–9x cheaper than routing to an edit model with a "remove background" prompt |
| Remove video background | `video-background-remover` | $0.010 | Same logic, video |
| Add watermark (image) | `add-image-watermark` | Free | Local PIL, zero model cost |
| Add watermark (video) | `add-video-watermark` | Free | Local FFmpeg, zero model cost |
| Remove watermark (video) | `seedance-2-watermark-remover` | Free (promo) / `video-watermark-remover` $0.065 | Purpose-built inpainting, not a general edit call |
| Combine clips | `video-combiner` | $0.050 | Deterministic stitching, no generation needed |
| Crop/reframe to aspect ratio | `autocrop` | $0.050 | AI subject-tracking crop, not a regenerate-the-scene job |
| Product photography | `ai-product-shot` / `ai-product-photography` | $0.050–$0.060 | Purpose-tuned backgrounds/lighting for catalog use, explicitly recommended by MuAPI over general edit models |
| Upscale (budget) | `ai-image-upscaler` / `seedvr2-image-upscale` | $0.020 | Dedicated super-res, avoids re-generating the image |
| Upscale (quality-first) | `topaz-image-upscale` / `topaz-video-upscale` | $0.075 / $0.080 | Premium fidelity when it matters |
| Long-form → shorts | `ai-clipping` | $0.500 | Purpose-built repurposing, not a video-edit prompt |
| Talking photo / simple avatar | `runway-act-two-i2v` | $0.070 | Cheapest path to "make this photo talk," vs. full video generation |
| Dub/localize existing video | `heygen-video-translate` | $0.250 | Bundles translate + voice-clone + lip-sync in one call |
| Match audio to existing video | `mmaudio-v2-video-to-video` | $0.010 | Purpose-built video-to-audio, not a T2V regenerate |
| TikTok carousel | `tiktok-carousel` | $0.028 | Format-correct output (1080×1920, slide count, proven templates) vs. manual T2I + layout |

---

## 15. Routing Opportunities

The following are the most actionable patterns MavenSync's router design should account for, derived strictly from what's verified above:

1. **Treat "resolution/region/moderation" as parameters, not separate models.** Seedance 2.5 alone is ~110 catalog rows across image-to-video + text-to-video that are one model with 4 knobs (resolution, region, moderation, mode). Collapsing families like this (Seedance 2/2.5, Kling v3/v3 Turbo/v3 Omni, Veo 3/3.1/3.1 Fast/3.1 Lite/4, Flux-2-Klein 4B/9B, Nano Banana tiers) from ~591 raw endpoints down to a much smaller set of **parameterized logical models** is the single highest-leverage step in building the router — it turns an unmanageable model zoo into a tractable decision tree.

2. **Cost scales roughly geometrically with resolution across nearly every video family.** 480p → 720p → 1080p → 4K typically follows a ~1x → 2x → 5x → 10x price ladder (verified directly in Seedance 2.5's own pricing: $0.85 / $1.70 / $4.25 / $8.50). A router can compute expected cost for any requested output resolution algorithmically rather than needing a lookup table per model.

3. **"4K" outputs are frequently upscaled, not natively rendered.** MuAPI states this explicitly for the entire Seedance 2.5 4K/1080p line ("upscaled from the model's native 720p render... not a native 4K output... costs more than the standard 720p tier"). A cost-aware router should default to native-resolution generation + a cheap dedicated upscaler (`ai-image-upscaler` $0.020 / `topaz-video-upscale` $0.080) rather than paying the model's own inflated "native 4K" price tag, when the two are functionally the same pixels.

4. **Utility operations are frequently free or near-free and should never be routed to a generative model.** Watermarking (free), clip-combining ($0.050), background removal ($0.010), and audio-matching ($0.010) are deterministic or narrow-purpose tools. A naive router that treats "edit this video" as one generic capability risks sending a $0.050 job to a $1.50+ model (`seedance-2-video-edit`).

5. **Reference-consistency ("Omni Reference" / character-reference) is a cross-provider commodity feature with a >20x price spread.** The same job — "keep this character/subject consistent across generations using reference images" — is offered by `vidu-q2-reference` ($0.065), `seedance-2-mini-omni-reference` ($0.150), `runway-act-two-i2v` ($0.070, avatar-specific), all the way up to `seedance-2-omni-reference`/`minimax-h3-reference-to-video` (~$1.50). This is the strongest single argument for MavenSync doing a cost-first default with a manual/quality-triggered premium escalation path, since MuAPI itself provides no quality differentiation data — only MavenSync's own testing can justify paying 20x more.

6. **"Fast"/"Lite"/"Turbo" variants exist in nearly every family at 2–8x lower price than the flagship**, generally described by MuAPI as trading fine detail/cinematic polish for speed (never described as a different capability set). This is the natural **default tier for drafts, previews, and iteration**, with the flagship reserved for final/published output — a two-tier "draft then commit" routing pattern would cut costs substantially across image, video, and audio generation alike.

7. **Purpose-built tools beat prompting a general model, and MuAPI's own documentation says so.** The image-edit FAQ explicitly states the dedicated product-shot endpoint is preferred "for standardized e-commerce flows" over Flux Kontext. This pattern (special-purpose tool > general model + clever prompt) repeats for background removal, upscaling, watermarking, avatar/talking-photo, dubbing, and carousel generation — MavenSync's router should maintain an explicit "specialist tool overrides general model" precedence list for these known use cases rather than always defaulting to a general text-to-image/video/edit model.

8. **Price is not a verified quality signal anywhere in this catalog.** Several same-price pairs (MiniMax Speech 2.6 HD vs Turbo; Gemini 3.1 Flash TTS vs Gemini 2.5 Pro TTS) and several cases where MuAPI's own marketing claims ("best," "leads on") are unsupported by any independent benchmark in the pricing pages themselves. MavenSync should build its own lightweight quality-eval harness (a "Needs MavenSync testing" backlog) rather than inferring quality from MuAPI's price or descriptive copy — this catalog deliberately does not invent a quality ranking MuAPI doesn't itself support.

9. **The LLM/text-reasoning layer is the one blind spot in this catalog** and is likely the highest-value next research step, since MavenSync's copywriting/research capability will depend entirely on it and MuAPI does not expose transparent pricing for it the way it does for every visual/audio category.

---

## Appendix: Verified vs. Needs-Testing Summary

| Claim type | Status |
|---|---|
| Model names, endpoints, category, MuAPI's own description text | **Verified** — pulled directly from live MuAPI pages, Aug 13 2026 |
| Prices (per-call, resolution-scaled) | **Verified** — as displayed by MuAPI at time of research; subject to change without notice per typical SaaS pricing pages |
| "Best," "leads on," "top-tier" quality claims in MuAPI's own marketing copy | **MuAPI's claim, not independently verified** — flagged inline throughout |
| Actual output quality, brand adherence, reasoning quality, instruction-following, reliability/uptime, latency in practice | **Needs MavenSync testing** — not assessed in this document |
| LLM/text-to-text model list and pricing | **Needs MavenSync verification** — not publicly exposed on a stable pricing page at time of research |
| 3D and LoRA/Training category pricing | **Needs MavenSync verification** — category existence confirmed, pricing not reachable |
