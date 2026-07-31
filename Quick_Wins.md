# Quick Wins: Batch 2

| Rank | Opportunity | Priority | Difficulty | Hours | Dependencies | Expected user impact | Reason |
|---:|---|---|---|---:|---|---|---|
| 1 | Preserve request-ID/source-job lineage in Creative Jobs and Assets | P0 | Low | 4–8 | Existing CreativeJob/CreativeAsset | Better traceability for chains and retries | Directly improves debugging, history, and asset version provenance |
| 2 | Add four-reference/multimodal input metadata to Asset Requests | P0 | Low | 4–8 | Campaign Plan, Asset Library | Enables richer I2V and reference workflows | ComfyUI shows strong value with minimal domain change |
| 3 | Add schema-validated generic recipe parameters | P0 | Medium | 8–16 | Recipe Engine, Provider Registry | Supports long-tail models without UI changes | Preserves provider-agnostic architecture while increasing coverage |
| 4 | Add idempotency keys and batch-item lineage to Creative Jobs | P0 | Low | 6–12 | Creative Orchestrator | Safe automation retries and variant batches | n8n pattern prevents duplicate charges/jobs |
| 5 | Add request preview/dry-run to Creative Orchestrator | P1 | Low | 8–12 | Recipe and routing contracts | Users can inspect cost/inputs before execution | Strong safety pattern from CLI/generic runner workflows |
| 6 | Add publishing draft validation against platform capabilities | P1 | Medium | 12–20 | Existing publishing foundation | Fewer failed posts and clearer user feedback | Scheduler demonstrates conditional metadata requirements |
| 7 | Add parent-job and intermediate-asset relationships | P1 | Medium | 12–20 | Asset Manager, Creative Jobs | Makes campaign chains understandable and reusable | Needed for script/audio/B-roll/render and edit pipelines |
| 8 | Add approval/lock/fork/resume transitions to execution plans | P1 | Medium | 16–24 | Creative Orchestrator | Human control over expensive multi-step plans | Design Agent’s inspectable loop is a high-value differentiator |
| 9 | Add binary/URL ingestion metadata to Asset Manager | P1 | Medium | 12–20 | Asset Manager, Storage Adapter | Cleaner automation and reference uploads | n8n node pattern covers real integration inputs |
| 10 | Add dependent media job groups for narrated shorts | P1 | High | 24–40 | Jobs, assets, provider adapters | Enables topic-to-video campaign recipes | Text-To-Video-AI provides a complete staged production pattern |

## Batch 3 Additions

| Rank | Opportunity | Priority | Difficulty | Hours | Dependencies | Expected user impact | Reason |
|---:|---|---|---|---:|---|---|---|
| 11 | Add capability scoring dimensions for image/video routing | P0 | Medium | 16–24 | Provider Registry metadata | Better model selection per creative goal | Model catalogs provide a practical scoring vocabulary |
| 12 | Add commercial-use/license eligibility filters | P0 | Low | 8–16 | Deployment metadata | Prevents unsuitable model selection | Licensing varies materially across open and closed models |
| 13 | Add request-ID and output-slot lineage | P0 | Low | 4–8 | Creative Jobs/Assets | Makes chained workflows traceable | ComfyUI and n8n both expose request lineage |
| 14 | Add publishing Asset ID and attempt relationships | P0 | Medium | 16–24 | Publishing foundation | Safer publishing history and retries | Scheduler demonstrates durable post lifecycle needs |
| 15 | Add Voice Recipe and Voice Turn state model | P1 | Medium | 20–32 | Recipe Engine, Provider Registry | Enables Voice Studio evolution | Streaming voice needs explicit turn contracts |
| 16 | Add barge-in/interruption event contract | P1 | Medium | 12–20 | Voice Turn state | More natural conversations | Playback gating is essential for real-time voice |
| 17 | Add model evidence freshness and sunset alerts | P1 | Medium | 16–24 | Registry refresh | Avoids stale recommendations | Model availability, pricing, and APIs change quickly |
| 18 | Add n8n-style batch idempotency metadata | P1 | Low | 6–12 | Creative Jobs | Prevents duplicate automated generations | External workflows retry and replay |
| 19 | Add platform metadata compilation recipe | P1 | Medium | 16–24 | Knowledge Center, Publishing | Better platform-ready content | Scheduler separates media from platform metadata |
| 20 | Add voice-to-campaign brief extraction | P1 | Medium | 20–32 | Voice Recipe, Campaign Builder | Converts conversations into campaigns | Connects voice interaction to existing planning architecture |
