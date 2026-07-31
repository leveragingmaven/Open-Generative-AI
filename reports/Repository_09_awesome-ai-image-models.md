# Repository 09: awesome-ai-image-models

## Repository Summary

This repository compares image models by use case, API availability, price, editing/control capability, open-source licensing, VRAM, and evaluation sources. Its main contribution is a capability-scoring vocabulary for image routing.

## Skill Inventory

- Photorealistic image generation.
- 4K/high-resolution generation.
- Instruction-following generation.
- In-image typography.
- Logo and vector design.
- Product photography and mockups.
- Image-to-image editing.
- Inpainting and outpainting.
- Relighting and restyling.
- Character/style consistency.
- Structural control through ControlNet.
- Subject/style transfer through IP-Adapter.
- Upscaling and restoration.
- LoRA/ControlNet ecosystem workflows.
- Self-hosted/open-source image generation.

## Workflow Intelligence

- Select capability: photorealism, text, design/vector, edit, consistency, upscale, or open-source.
- Select input mode: text-only, reference image, mask, control image, or multiple references.
- Apply licensing/commercial policy.
- Rank providers/models by quality, cost, speed, and control.
- Generate base asset.
- Apply edit/upscale/restoration variants as linked assets.
- Evaluate output using human or automated quality signals.

## Prompt Intelligence

No prompt library is harvested. The useful prompt strategy is capability-specific request planning:

- Typography recipes require explicit text hierarchy and layout intent.
- Product recipes require object identity, surface/material, lighting, camera, and commercial composition.
- Editing recipes separate desired change from preservation constraints.
- Consistency recipes pass identity/style references explicitly.
- Inpainting/outpainting recipes separate mask/region intent from global image intent.
- Design/vector recipes prioritize clean shapes, brand constraints, and export requirements.

## Recipe Catalog

- Premium photoreal hero.
- Instruction-following image edit.
- Typography/poster design.
- Logo/vector identity asset.
- Product photography set.
- Character consistency pack.
- Inpainting/outpainting edit.
- Relight/restyle variant.
- Anime/illustration conversion.
- Upscale/restoration finishing pass.
- ControlNet structural edit.
- IP-Adapter subject/style transfer.

## Model Intelligence

| Capability | Harvested evidence | MavenSync scoring implication |
|---|---|---|
| 4K/editing/realism | Nano Banana Pro positioned for true 4K and editing | High resolution, editability, realism scores |
| Instruction following | GPT Image 1.5 positioned strongly | High semantic adherence score |
| Premium value | FLUX.2 Pro positioned as price/quality leader | Cost-quality efficiency score |
| All-round value | Seedream 4.5 | Balanced score with edit/quality evidence |
| Photorealism | Imagen 4 | Photorealism score |
| Typography | Ideogram v3 and Qwen-Image | Text rendering score |
| Vector/design | Recraft V3 | Vector/export/brand design score |
| Open quality | FLUX.2 Dev, HunyuanImage 3.0 | Quality/licensing/VRAM score |
| Fast commercial OSS | FLUX.1 Schnell | Speed/licensing/quality score |
| Ecosystem/control | SD 3.5 | LoRA/ControlNet/control score |
| Editing/control | FLUX Kontext, ControlNet, IP-Adapter | Editability/structure/consistency dimensions |
| Restoration | Real-ESRGAN, GFPGAN, CodeFormer, Topaz | Restoration/upscale scores |

Licensing notes include Apache-2.0, non-commercial restrictions for FLUX.2 Dev, Community License for SD 3.5, custom/open terms for Hunyuan, and commercial closed APIs. These must be represented in deployment policy metadata.

## Studio Mapping

- **Image Studio:** Generation, editing, inpainting, outpainting, relighting, consistency, enhancement.
- **Marketing Studio:** Product photography, typography, logos, ad creative, social variants.
- **Campaign Builder:** Product packs, brand kits, launch sets, social packs.
- **Creative Intelligence Layer:** Capability scoring and recipe-specific model ranking.
- **Asset Library:** Parent/edit/version relationships and restoration variants.
- **Knowledge Center:** Brand, typography, product, and prohibited-claim constraints.
- **Provider Registry:** Deployment availability, pricing, license, and capability metadata.

## UX Recommendations

- Group model choice by goal, not vendor name: photoreal, text, design, edit, fast, open.
- Show text-rendering confidence for poster/logo recipes.
- Show editability and reference-consistency badges.
- Display commercial-use and licensing warnings.
- Offer “draft,” “premium,” and “print-ready” quality tiers.
- Provide before/after comparison for edit, relight, upscale, and restoration.
- Display reference roles: subject, style, composition, product, palette.
- Make mask/control inputs explicit but progressive.

## Automation Opportunities

- Generate product photo packs with multiple roles and angles.
- Run typography verification before approval.
- Automatically upscale approved hero assets.
- Create style/subject consistency variants.
- Select open-source deployments under tenant policy.
- Route failed edits to alternate edit-capable models rather than generic image models.

## Gap Analysis

- MavenSync needs separate image capability dimensions rather than one generic quality field.
- Recipe Engine should express preservation constraints for edits.
- Asset Library needs edit operation provenance and before/after comparison relationships.
- Provider Registry needs license and commercial-use filtering.
- Model ranking requires evidence sources and evaluation dates.

## Database Impact

| Feature | Existing tables affected | New tables | New columns | Migration | Relationships |
|---|---|---|---|---|---|
| Image capability scores | Model/deployment registry | None | `textRendering`, `photorealism`, `editability`, `consistency`, `vectorSupport` | Additive | Deployment to scores |
| Evaluation evidence | Registry | `model_evaluations` | `dimension`, `score`, `source`, `dataset`, `evaluatedAt` | Recommended | Model/version to evaluations |
| Edit lineage | Assets | None | `operation`, `maskAssetId`, `referenceAssetIds`, `preservedAttributes` | Additive | Parent asset to edit variant |
| License policy | Deployments | None | `licenseClass`, `commercialUse`, `attributionRequired`, `selfHostable` | Additive | Tenant policy to deployment |

## API Surface

- Provider calls: generation/edit/enhancement, model discovery, health, price metadata.
- Internal endpoints: capability search, model recommendation, comparison, edit validation, license eligibility.
- Background jobs: evaluation refresh, catalog refresh, upscale/restoration variants.
- Events: model metadata changed, license policy changed, evaluation updated, variant completed.
- Queue requirements: recommended for batch packs and finishing variants.
- Retry logic: alternate edit-capable deployment for transient failures; avoid retrying incompatible inputs.
- Polling: provider-specific generation status behind Provider Registry.
- Streaming/webhooks: optional for long-running image edits/upscales.

## MavenSync Integration Opportunities

- Add image capability scoring to Model/Deployment Registry.
- Add recipe weights for typography, photorealism, editing, consistency, vector, product, and restoration.
- Add commercial license eligibility filters.
- Add parent/edit operation provenance to Creative Assets.
- Add evaluation confidence and freshness to routing decisions.

## Codex Implementation Prompts

### Image Capability Schema

Add provider-neutral image capability metadata for typography, photorealism, illustration, anime, logo/vector, product photography, consistency, inpainting, outpainting, editing, style transfer, and restoration. Add validation fixtures only.

### Image Recipe Scoring

Implement weighted image deployment scoring by recipe requirements. Include missing evidence handling, license filters, and deterministic tie-breaking. Do not change provider calls or UI.

### Edit Preservation Contract

Add structured preservation constraints to image edit requests, including subject identity, composition, text, palette, and background preservation. Do not modify existing payload mapping; add normalization and tests.

## Ignore List

- Copying static model rankings.
- Treating API price snapshots as permanent.
- Copying proprietary prompt libraries.
- Ignoring commercial license restrictions.
- Replacing existing Image Studio model selection with vendor-specific branches.
