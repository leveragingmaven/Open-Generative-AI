# Model Capability Matrix

This matrix is intentionally capability-oriented. It is not a permanent ranking. Scores and cost metadata should be refreshed from Provider Registry evidence and evaluated outputs.

## Image Models

| Model/family | Best Use Cases | Strengths | Weaknesses | Speed | Relative Cost | Quality Tier | Editing Support | Consistency | Commercial Suitability | Recommended MavenSync Recipes |
|---|---|---|---|---|---|---|---|---|---|---|
| Nano Banana Pro | 4K hero, editing, product, references | High resolution, realism, editing | Premium cost | Medium | High | Premium | Strong | Strong | Commercial API | Premium product hero, edit, brand kit |
| GPT Image 1.5 | Instruction-heavy imagery, typography | Prompt adherence, text | Less design/vector specialization | Medium | Low/Medium | Premium | Strong | Medium | Commercial API | Typography, instruction edit |
| FLUX.2 Pro | Premium/value image generation | Price-quality, 4MP, broad use | License/deployment varies | Medium | Low/Medium | Premium | Strong | Strong | API commercial; verify deployment | Product hero, editorial, edit |
| Seedream 4.5 | General image and value | Balanced quality/cost | Capability evidence varies | Medium | Medium | High | Medium | Medium | API commercial | Social pack, general image |
| Imagen 4 | Photorealism | Realistic rendering | Less edit/control emphasis | Medium | Medium | High | Medium | Medium | Commercial API | Photoreal hero |
| Ideogram v3 | Posters, logos, in-image text | Typography | Less general editing breadth | Medium | Medium | High | Medium | Medium | Commercial API | Poster, thumbnail, logo |
| Recraft V3 | Logos, vector, brand design | SVG/vector and style control | Narrower photoreal use | Medium | Medium | High | Medium | Strong for design | Commercial API | Logo, brand identity |
| FLUX.1 Schnell | Fast open/commercial generation | Speed, permissive license | Lower quality than premium | Fast | Low | Standard | Medium | Medium | Strong, verify license | Draft image, batch variants |
| Qwen-Image | Typography, open editing | Text, open ecosystem | VRAM/quality variability | Medium | Low | High | Strong | Medium | Verify terms | Text-heavy, edit |
| Stable Diffusion 3.5 | Controlled/open workflows | LoRA, ControlNet ecosystem | More setup and tuning | Medium | Low self-host | Configurable | Strong | Configurable | Community license conditions | Controlled edit, style transfer |
| ControlNet/IP-Adapter | Structural/subject/style control | Pose, depth, edges, identity/style | Requires compatible base workflow | Medium | Low incremental | Control layer | Strong | Strong | Depends on base model | Pose edit, subject/style transfer |
| Real-ESRGAN/Topaz | Upscale/restoration | Finishing quality | Not generation | Fast/Medium | Low/High | Finishing | N/A | Preserves source | License varies | Print-ready upscale |

## Video Models

| Model/family | Best Use Cases | Strengths | Weaknesses | Speed | Relative Cost | Quality Tier | Editing Support | Consistency | Commercial Suitability | Recommended MavenSync Recipes |
|---|---|---|---|---|---|---|---|---|---|---|
| Veo 3.1 | Realism, native audio | Realism, audio, 4K options | Premium cost/short clips | Medium | High | Premium | Medium | Strong | Commercial API | Cinematic hero video |
| Sora 2 | Coherent longer shots | Coherence, shot length | API sunset risk documented | Slow/Medium | Medium/High | Premium | Medium | Strong | Commercial but lifecycle risk | Long coherent shot with fallback |
| Kling 3.0 | Motion, prompt adherence, I2V | Motion control, broad use | Audio/cost varies | Medium | Medium | High | Strong | Strong | Commercial API | Motion ad, I2V |
| Seedance 2.0 | Value, speed, I2V | Price-quality, references | New/beta variants change | Fast/Medium | Low | High | Medium/Strong | Strong | Commercial API | Batch video, reference I2V |
| Runway Gen-4.5 | Creative control/editing | Editing and control | Higher cost | Medium | High | Premium | Strong | Strong | Commercial API | Video edit, creative control |
| Hailuo 2.3 | Character motion | Character movement, lower price | Generation latency | Slow | Low/Medium | High | Medium | Medium/Strong | Commercial API | Character motion |
| Luma Ray 3 | Fast iteration, HDR | Speed, HDR | Cost per second | Fast | High | High | Medium | Medium | Commercial API | Draft iteration, HDR final |
| Wan 2.2 | Open T2V/I2V/edit | Open/self-host, broad modalities | VRAM/ops burden | Medium | Low self-host | High | Strong | Strong | License/hosting review | Controlled/self-host video |
| LTX-2.3 | Fast/open video and audio | Speed, native synced audio | Quality tradeoffs | Fast | Low | High | Medium | Medium | OpenRAIL review | Fast narrated/video draft |
| Avatar providers | Talking head/presenter | Realistic presenter workflows | Subscription/per-minute cost | Medium | High | Specialized | Medium | Strong identity | Commercial terms | Spokesperson, voice-agent video |
| Topaz/Video2X | Upscale/interpolation | Post-process quality | Not generation | Medium | Varies | Finishing | Strong post-process | Preserves source | License varies | Video finishing |

## Voice Models and Services

| Model/service family | Best Use Cases | Strengths | Weaknesses | Speed | Relative Cost | Quality Tier | Editing Support | Consistency | Commercial Suitability | Recommended MavenSync Recipes |
|---|---|---|---|---|---|---|---|---|---|---|
| Deepgram STT | Real-time transcription | Interim/final events, endpointing, VAD | Hosted dependency | Fast | Medium | Production | N/A | Stable | Commercial API | Live voice turn |
| Whisper | Private/batch transcription | Local, low marginal cost | Less live-friendly, compute | Medium/Slow | Low self-host | Configurable | N/A | Stable | License/hosting review | Batch captions |
| Deepgram Aura TTS | Real-time response playback | Low-latency speech synthesis | Voice/catalog constraints | Fast | Medium | Production | Segment-level | Stable | Commercial API | Voice agent turn |
| ElevenLabs | Premium narration/voice | High voice quality and variety | Cost/voice policy | Medium | High | Premium | Segment-level | Strong | Commercial terms | Narration, branded voice |
| OpenAI/Groq/Gemini LLM | Conversational reasoning/script | Multiple provider choices | Latency/context/cost varies | Fast/Medium | Varies | Configurable | Turn-level | Depends on prompt/memory | Commercial API | Voice persona, script |

## Routing Principle

MavenSync should score deployments by recipe weights, not hardcode model rankings:

```text
score = capability fit
      + quality tier
      + latency fit
      + cost efficiency
      + consistency/editability
      + license/policy eligibility
      + provider health
      + evidence freshness
```
