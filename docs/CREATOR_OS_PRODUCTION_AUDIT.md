# Creator OS Production Completion Audit

Audit date: 2026-08-30  
Repository: `open-generative-ai`  
Audited branch/HEAD: `creator-ui-redesign` at `1068c4391636cbbc025f8d808a56d533fac91934`  
Harness comparison point: `maven-harness` at `4a376ac`

## Executive conclusion

Creator OS is not a placeholder application. Its main Studio media paths call real MuAPI operations, poll real provider jobs, display returned media, and retain browser-side history. Its newer Agent Execution lane also has substantial production-oriented implementation: authenticated ownership, planning, approvals, concrete provider routing, durable jobs and attempts, scoped credentials, explicit retries, status reads, and asset lineage.

The repository is nevertheless **not ecosystem-launch-ready yet**. The shortest core journey from Maven Harness to Creator OS currently stops before provider execution:

1. Harness `CreatorExecuteReader` posts `creative.execute` without an `idempotencyKey`.
2. Creator OS correctly fails closed because `handleServiceExecutePost` requires that key.
3. Harness maps Creator OS's HTTP 400 to `creator_malformed_response` and the upstream goal ultimately fails.

That is the first demonstrated Harness/Creator failure, not the later failed goal status. Once fixed, two more launch seams need resolution or explicit certification:

- Harness uses a 10-second default request timeout while Creator's execute endpoint waits synchronously for media generation and permits provider work up to 30 minutes. A normal image or video can therefore outlive the caller even when the provider is healthy.
- Harness-driven MuAPI execution requires an encrypted, account-scoped BYOK credential, but no active product UI populates that credential store. The existing standalone Studio key UI stores the key in browser storage/cookie and the agency Studio uses the managed server key; neither supplies the durable Harness execution credential.

The code also records an accepted remote provider job as `recovery_required`, but there is no durable reconciliation worker/endpoint that resumes that remote job. Retrying is intentionally blocked in this state to prevent duplicate spend, which is correct, but recovery is therefore incomplete.

Direct authenticated Studio image and video paths appear code-complete and are ready for deployed certification. They must not be called production-certified based on repository evidence alone.

## Audit constraints and evidence standard

This was an audit-only pass. No P0/P1 implementation, redesign, feature addition, migration, or configuration change was made. Existing modified and untracked work was preserved. Conclusions come from current source, contracts, tests, build output, git history, and the current Harness source; old status documents were not treated as certification evidence.

Classification meanings used here:

- **COMPLETE**: implemented and supported by current code/tests.
- **PRODUCTION CERTIFICATION REQUIRED**: implementation appears complete but needs a real deployed run.
- **PARTIAL**: required pieces are unfinished.
- **DISCONNECTED**: implementation exists but is not on the active path.
- **BROKEN**: current evidence demonstrates a defect.
- **PLACEHOLDER / UI ONLY**: interface exists without a corresponding operational capability.
- **BACKLOG / NOT LAUNCH REQUIRED**: useful but not a launch gate.

## 1. Repository state

### Branch and history

- Current branch: `creator-ui-redesign`.
- HEAD before these documentation commits: `1068c4391636cbbc025f8d808a56d533fac91934` (`style: open Creator OS shared workspaces`), matching the inspected branch tip.
- Recent relevant history:
  - `a52c1d5` service execution idempotency
  - `c8f8276` service-auth header compatibility
  - `b4a0222` Harness creative execution integration
  - `161bf76` and `5484b75` Maven dashboard work
  - `d942051`, `72e3172`, and `4ac7b5f` controlled Design Agent conversation work

### Pre-existing dirty worktree

The audit began with substantial user work already present. Modified files include dashboard, Agent Chat, proxy/upload routes, Design Agent conversation, Publishing, provider tests, and retry tests. Both `packages/Open-AI-Design-Agent` and `packages/Open-Poe-AI` submodules are dirty. Untracked work includes Agent Execution `start` and `clarify`, proposal/clarification services and tests, a service-prepare endpoint variant, publishing identity work, and dashboard conversation tests.

This audit did not alter or normalize any of that work. Because some active behavior comes from uncommitted/untracked files, a launch checkpoint must first decide which of those changes belong together and commit them intentionally. The audit document is the only new file.

### Topology

Creator OS is a Next.js 15 / React 19 application with npm workspaces:

- root Next application and server routes in `app/`, `components/`, and `src/lib/`
- `packages/studio`: main Creator OS UI, media providers, intelligence, skills, workflows, publishing, and asset abstractions
- `packages/Open-Poe-AI/packages/agents`: Agent Club-style agent UI/runtime package
- `packages/Open-AI-Design-Agent/packages/design-agent`: Design Agent client package
- `packages/Vibe-Workflow/packages/workflow-builder`: workflow builder package

The Studio route mounts one workspace at a time through `components/StandaloneShell.js`. `/studio` is the Maven dashboard; explicit `/studio/:workspace` routes mount the corresponding workspace. Dynamic imports and recoverable boundaries prevent one Studio module from blocking the whole shell.

### Backend and persistence

Backend behavior is implemented with Next route handlers and domain services. MySQL persistence is defined by seven migrations:

1. creator accounts
2. Agent Execution authorizations
3. creative jobs
4. creative execution attempts
5. creative assets
6. provider credentials
7. Design Agent session ownership

The durable execution model has owner-scoped records, one-shot authorization, account/idempotency uniqueness, attempt numbering, execution state, provider references, failure metadata, and asset lineage. The domain applications remain authoritative for their own records.

There is no checked-in migration runner or deployment command. The Docker image also does not copy `migrations/`. Production schema application is therefore an external, undocumented deployment responsibility and must be made explicit before launch.

### Authentication and ownership

- Browser SSO uses a signed short-lived handoff and an HttpOnly, Secure, SameSite=Lax session cookie.
- Creator identity is normalized server-side to a stable identity key and mapped to a Creator account.
- Harness service authentication uses signed, short-lived tokens with issuer, audience, service ID, normalized email subject, and scopes. Current and previous secrets support rotation.
- If service headers are present and invalid, authentication fails closed; it does not fall back to browser session auth.
- Job, attempt, credential, Design Agent session, and asset reads are account/creator scoped.
- Browser payloads cannot select trusted identity, provider credentials, routing, status, or authorization fields at controlled execution boundaries.

Service tokens require a `jti`, but no replay store checks it. This is hardening, not the first launch blocker, because execution also has delegated authority, one-shot authorization, owner-scoped idempotency, and job state guards.

Rate limiting is process-local. It protects one instance but does not provide a shared limit across multiple production replicas.

### Deployment configuration

- The Next production build succeeds.
- The Dockerfile builds workspace packages and the Next application, then runs `next start` with `.next`, `public`, `node_modules`, and the root package manifest.
- `/api/health` reports process liveness only; it does not verify database, provider, credential, or Hub readiness.
- `docker-compose.yml` supplies only `NODE_ENV`; all required secrets/database/SSO settings must be supplied externally.
- `.env.example` documents MuAPI, text intelligence, agency mode, Studio flags, Hub browser integration, SSO, and rate limits, but does not document the Creator database variables, service-auth variables used by the Harness integration, credential-encryption key, migration step, or the Harness timeout contract comprehensively.
- Security headers exist, although CSP still permits `unsafe-inline` and `unsafe-eval` for current application compatibility.

## 2. Architecture summary

Creator OS currently has three related but distinct production paths:

1. **Legacy-compatible browser Studio path (active by default).** UI components call MuAPI through same-origin proxy routes, poll provider status, and place results in browser/local repositories. In agency mode, proxies use `MUAPI_API_KEY`; standalone mode accepts a browser key.
2. **Feature-flagged Creative Intelligence runtime.** Image, Marketing, and media runtime adapters add Knowledge Pack planning and provider-neutral execution, but all flags default off. These runtimes use in-memory job/asset stores and fall back to the legacy path on error. They are not the durable server execution lane.
3. **Durable Agent Execution / Harness path.** Authenticated preparation produces a plan and persistent job; explicit execution claims an attempt, resolves a credential, calls the provider registry, persists completion/failure and canonical asset lineage, supports read-only status and safe retry. This is the correct lane for Harness-controlled creative execution.

These lanes should not be collapsed during launch work. The immediate requirement is to connect the existing contracts and credential/recovery seams, not replace the working browser Studios or recreate Harness orchestration inside Creator OS.

## 3. Capability completion matrix

| Capability | State | Evidence and launch meaning |
|---|---|---|
| Studio shell, navigation, dashboard | COMPLETE | Real routed workspaces, active-workspace loading, error boundaries, and successful production build. Some dashboard operational counts still read browser-local stores. |
| Dashboard Maven conversation | PRODUCTION CERTIFICATION REQUIRED | Controlled Design Agent conversation client, session ownership, streaming, sanitized persistence, and tests exist in dirty work. It is conversational only and does not itself invoke media execution. |
| Image Studio | PRODUCTION CERTIFICATION REQUIRED | Real MuAPI text-to-image and image-edit/reference flows, upload, polling, result display, local history, and optional Hub asset handoff exist. No fresh deployed proof was observed. |
| Video Studio | PRODUCTION CERTIFICATION REQUIRED | Real text/image/video inputs, MuAPI submission/polling, pending-job resume, result display, and local history exist. No fresh deployed proof was observed. |
| Reference images | COMPLETE in supported Studio/provider paths; certification required | Upload/reference normalization and model-specific fields are tested; durable Agent Execution preserves references/attachments through provider dispatch. |
| Marketing, Audio, Lip Sync | PRODUCTION CERTIFICATION REQUIRED | Operational MuAPI-backed handlers exist; feature-flagged intelligence wrappers fall back to established paths. Each needs one deployed happy-path and failure-path run. |
| Cinema, Clipping, Vibe Motion, Recast/body swap, Character, AI Influencer | PRODUCTION CERTIFICATION REQUIRED | These are substantive provider/runtimes rather than placeholder pages. They are secondary launch capabilities and should not block the core image/video gate unless marketed at launch. |
| Design Agent | PRODUCTION CERTIFICATION REQUIRED | Real MuAPI provider adapter, controlled text conversation, uploads, session ownership, SSE parsing, and safe failure behavior are tested. Media execution is intentionally separated from controlled conversation. |
| Workflow | PRODUCTION CERTIFICATION REQUIRED | Workflow builder/provider integration, graph validation, polling registry, result normalization, and safe Hub-report failure behavior exist. |
| Publishing | PRODUCTION CERTIFICATION REQUIRED | MuAPI publishing, connected-account normalization, draft state, duplicate prevention, platform validation, partial failures, and status reporting exist. Manual Publisher completion is committed at `5af34730af3195c29c73346caff3642a8d55a206`; deployed certification remains required. |
| Apps gallery | PLACEHOLDER / UI ONLY | A catalog/gallery of MuAPI app concepts; it is not a Creator OS execution surface for every listed app. Do not market all cards as delivered capabilities. |
| MCP & CLI workspace | PLACEHOLDER / UI ONLY / informational | System/feature presentation exists, but native MCP/CLI execution belongs to Harness. Do not duplicate it in Creator OS. |
| Automation destination | BACKLOG / NOT LAUNCH REQUIRED | Explicitly routes to Coming Soon. Harness/workflows already own relevant orchestration capabilities. |
| Knowledge Center | COMPLETE as read-only view; certification required | Direct credentialed Hub Knowledge Pack fetch and normalized display exist. Retrieval degrades to no-knowledge without blocking Studio. |
| Creative Memory | PARTIAL | Browser/in-memory creative memory mechanisms exist; they are not one durable, ecosystem-authoritative memory path. |
| Campaign workspace | PARTIAL | Functional browser-side campaign state and metadata exist, but the dashboard and several creative paths still rely on local storage rather than one durable server record. |
| Asset Library | PARTIAL | Can merge local histories with owner-scoped durable Agent Execution assets. Ordinary Studio generation does not consistently enter Creator's durable `creative_assets` table. |
| `creative.prepare` for Harness | COMPLETE | Service-scoped, stateless, planning-only path exists and deliberately creates no job or cost. |
| Browser Agent Execution prepare/approve/start | COMPLETE in committed implementation | One-shot proof, durable planning, explicit approval, ready attempt, and UI actions exist. |
| Agent Execution clarification | DISCONNECTED / PARTIAL | Clarification service/route exists in the current implementation, but the current execution card has no input action wired to it. Ambiguous conversation can be clarified by further chat and re-prepared; a durable `requires_input` plan cannot be completed from the card. |
| Durable creative execution | COMPLETE in isolation; ecosystem integration BROKEN | Provider dispatch, credential resolution, job/attempt state, failure sanitization, and asset persistence are well tested. Harness currently violates its execute contract. |
| Job status | COMPLETE | Browser/service authentication, account scoping, latest attempt, terminal failure, recovery, and result reference are exposed. |
| Retry | COMPLETE for terminal failed steps | Creates attempt N+1 without recreating the job/workflow; blocks completed, running, cancelled, and recovery-required jobs; duplicate retry is guarded. |
| Accepted-provider recovery | PARTIAL | Durable recovery state and provider job ID exist, and unsafe retry is blocked, but no reconciler finishes the accepted provider job. |
| Idempotency | COMPLETE in Creator; BROKEN at Harness caller | Creator enforces account-scoped stable keys and returns existing jobs; Harness does not send the key. |
| Asset lineage persistence | COMPLETE | Successful durable execution validates output modality and atomically persists a canonical asset with job/attempt/provider/plan lineage. |
| Asset binary durability | PARTIAL | `storageReference` currently equals the provider output URL. The application persists metadata/reference, not a copied object under MavenSync-controlled storage. |
| Asset retrieval | PARTIAL | Authenticated UI can list durable assets. Harness receives a result reference through status, but no service-auth asset-read contract or byte/reachability verification exists. |
| BYOK | PARTIAL | Secure encrypted account-scoped API and resolver exist, but the active UI key path is different and the secure credential UI is absent. |
| Managed MuAPI browser execution | COMPLETE; certification required | Agency proxies ignore browser authority and inject the server MuAPI key. |
| OpenAI-compatible text intelligence | COMPLETE when configured; certification required | Server-only strict structured output is used for intent/planning/conversation; it fails closed when endpoint/model/key are missing. |

## 4. Real user-flow traces

### 4.1 Direct authenticated image creation

User → `/studio/image` → `ImageStudio` → same-origin MuAPI proxy/helper → server-managed MuAPI key in agency mode → provider submission → provider polling → result URL → visible image/local history → optional MavenSync Hub registration when launched with connected Hub context.

The path is real and supports reference images/model-specific edit fields. The first durability seam is after the provider result: normal Studio generation primarily persists in local/browser asset state, and Hub registration is best-effort and only active for a configured Hub launch. It does not consistently create a row in Creator's durable `creative_assets` table.

**Classification:** code-complete, production certification required. A real authenticated deployment still needs a generated image, reload/retrieval check, reference-image check, and provider-failure check.

### 4.2 Direct authenticated video creation

User → `/studio/video` → `VideoStudio` → upload/reference preparation as needed → same-origin MuAPI route/helper → provider submission → polling/pending-job registry → completion URL → visible video/local history.

The UI monitors the provider job internally and contains pending-job resume behavior. As with images, the ordinary Studio result is not guaranteed to be a Creator database asset and may remain a provider URL/local record.

**Classification:** code-complete, production certification required. A real authenticated deployment still needs a short video, status/reload, result retrieval, reference-image/video, and failure/resume run.

### 4.3 Agent Club native creative execution

User conversation → `AgentChatClient` “Start Creative Work” → `/api/agent-execution/from-conversation` → authenticated conversation read and attachment ownership → structured intent extraction → server-issued one-shot approval → durable job/plan → UI `requires_input`, `requires_approval`, or `ready` → explicit approval if required → `/api/agent-execution/execute` → provider credential resolution → provider registry → job/attempt/asset persistence → result references in `AgentExecutionCard`.

This is active in the current implementation and is not merely scaffolding. The unresolved seams are:

- `requires_input` has no connected card control despite a clarification service/route existing;
- execution is synchronous from the browser request's point of view;
- MuAPI execution uses the encrypted account credential, not the agency proxy's managed key;
- accepted-provider recovery has no reconciler;
- there is no background/UI status polling after an uncertain client disconnect.

### 4.4 Dashboard Maven conversation

User → `/studio` Maven composer → controlled Design Agent conversation API → authenticated session ownership → server-side structured text provider → sanitized streaming response → browser transcript persistence.

This is a real conversation path in the current implementation, but it is not the Harness WorkerRuntime and it does not itself create media. It must not be presented as autonomous end-to-end creation until an explicit execution handoff is connected.

## 5. Harness ↔ Creator OS integration trace

### Intended flow

Agent Club/Hub → Harness WorkerRuntime goal → `creative.prepare` → delegated authority/approval → `creative.execute` → Creator durable job and attempt → Creator provider registry/MuAPI → Creator asset metadata → `creative.status` verification → Harness result/artifact reference → upstream response.

### What currently aligns

- Harness checkpoint is the supplied `4a376ac`; its Creator adapter paths match Creator routes.
- `creative.prepare` uses service scope `creative.prepare`; Creator recognizes service auth and performs stateless readiness/planning without spending or creating a job.
- Service authentication audience, service ID, normalized email subject, current/previous secret handling, and scopes align.
- Creator maps the normalized email to its own account, preserving domain ownership.
- Harness supplies delegated authority; Creator requires and correlates operation/category/cost ceiling/goal ID before execution.
- Creator owns provider routing, credential resolution, job/attempt records, retry eligibility, and creative asset lineage. Harness remains the business orchestrator; no duplicate Harness architecture is needed in Creator.
- Job status uses `creative.read` and returns scoped terminal/running/failure state.
- Retry uses `creative.execute` and retries only a failed attempt, not a completed workflow.

### First actual failure

Harness's `CreativeExecuteRequest`, tool schema, and `CreatorExecuteReader` contain no `idempotencyKey`. Its JSON body therefore omits the field. Creator's `handleServiceExecutePost` requires a non-empty stable key before it mints authorization, creates a job, or calls a provider. The endpoint returns HTTP 400 `idempotency_key_required`; Harness maps any 400/422 execute response to `creator_malformed_response`.

Therefore the first failing seam is the execute request contract. Provider routing, MuAPI, asset persistence, status verification, and final upstream result are never reached on this request.

### Subsequent seams after idempotency is fixed

1. **Synchronous timeout mismatch.** Harness defaults all Creator requests to 10 seconds. Creator execution may synchronously poll for up to 30 minutes. A timeout can occur after provider work has started but before Harness receives `jobId`, leaving Harness unable to observe that job. Merely increasing the timeout may be acceptable for a tightly controlled certification run, but production HTTP/proxy limits must be proven; the durable design should return the accepted job promptly and let Harness observe status.
2. **Credential path.** Harness-driven MuAPI execution always requires the encrypted account credential. `MUAPI_API_KEY` is intentionally not a fallback. Until users/admins can populate that store for the launch cohort, execution fails with `provider_credential_required:muapi`.
3. **Async reconciliation.** If the provider accepts work and the wait fails/times out, Creator records `provider_recovery_required` plus provider job ID. There is no job that polls/reconciles that accepted remote work. Retry correctly refuses to create a duplicate generation.
4. **Artifact verification depth.** Creator validates output reference shape/modality and stores an owner-scoped asset row. Harness's verifier checks terminal status plus `resultRef`; it does not read the asset record, fetch/HEAD the URL, or verify stored bytes. A syntactically valid but expired/inaccessible provider URL can be marked verified.
5. **Artifact retrieval contract.** The status endpoint returns one result reference and browser asset listing is session-authenticated. There is no service-authenticated asset read/download endpoint for Harness. Harness can return the URL, but not independently retrieve a canonical asset object.

### Contract verdict by requirement

| Requirement | Verdict |
|---|---|
| prepare request | Yes |
| authenticate | Yes |
| execute job | **No: idempotency contract mismatch** |
| account/user ownership | Yes |
| idempotency | Creator yes, Harness caller no |
| monitor/status | Status reader yes; no safe observation after execute times out before returning job ID |
| recognize failure | Yes |
| retry failed attempt | Yes |
| recover accepted async provider work | No reconciler |
| retrieve artifact | Reference only; no Harness asset-read contract |
| verify real artifact | Metadata/reference verification only, not reachability/bytes |
| persist/reference artifact | Creator asset metadata yes; Maven-controlled binary storage no |
| return upstream | Harness architecture supports it, but current execute fails before this point |

## 6. Foundations and brand-context trace

There are multiple context paths, only one of which is active in each lane:

1. **Hub direct browser Knowledge Pack.** `creatorOsKnowledgePackService` requests the authenticated current-user pack from `https://hub.mavensync.space/api/creator-os/knowledge-pack/current`, normalizes authority blueprint, offer, audience, authority, frameworks, IP library, and Knowledge Center resources into Creator's existing Knowledge Pack contract, and fails softly to `null`.
2. **Feature-flagged Studio intelligence.** Image/Marketing/media runtime adapters call `prepareKnowledgePackRequest`, then compile brand/context into planning. Those runtime flags default off, so normal Image/Video Studio generation does not currently receive the full Knowledge Pack through that path.
3. **Knowledge Center.** The workspace directly reads and displays the normalized Hub pack. It does not make every Studio request brand-aware.
4. **Hub launch context.** `useMavenSyncIntegration` can exchange a launch ID and fetch project, campaign, and selected knowledge context from a configured MavenSync API base. It is a separate older/smaller contract (`brandVoice`, audience, offer, campaign brief, goals, references, restrictions) and only activates in Hub-launch mode.
5. **Harness service requests.** Harness prepare/execute contracts currently carry intent, inputs, references, skills, recipe/workflow, and campaign ID, but no canonical Knowledge Pack field. Creator's stateless prepare does not fetch the Hub pack server-side. Thus the desired Hub → Harness → specialist → Creator flow does not yet transport Foundations comprehensively.

Some domains are also dropped by current normalization: `brand`, `voice`, `approvedClaims`, and `visualDirection` are explicitly `null` unless their information is indirectly embedded in the authority blueprint/IP. Brand assets are not a first-class field in the current direct pack normalization.

**Verdict: PARTIAL.** Creator can retrieve and use Hub intelligence in specific direct/feature-flagged paths, but the active browser legacy path and Harness path do not share one coherent Foundations contract.

## 7. Provider state

### Wired providers

- **MuAPI:** active production media provider for browser Studios, Design Agent backing services, workflows, publishing, and durable creative execution. Supports image generation/editing, video and image-to-video operations, audio, lip sync, and specialized operations through existing provider helpers/catalogs.
- **OpenAI-compatible:** server-managed structured/text intelligence for conversation intent extraction, planning, and marketing/text workloads where routed. It requires endpoint, model, and server key and fails closed when absent.

### Credential/funding behavior

- Browser agency proxies use managed `MUAPI_API_KEY` and ignore client authority.
- Browser standalone mode uses a user key stored in `localStorage` and a JavaScript-readable cookie; it is sent only to same-origin proxy paths by the current Axios interceptor.
- Durable Agent Execution uses encrypted owner-scoped MuAPI credentials only. It deliberately does not fall back to the platform environment key.
- OpenAI-compatible credentials come from server environment configuration.
- MuAPI routing is marked BYOK in durable execution, so it does not require MavenSync-funded cost authorization. Other agency-funded providers must have explicit cost authorization; the default execution service does not fabricate it.

Creator's provider selection is not an improper duplicate of Harness model routing. Harness chooses orchestration/worker models; Creator selects a creative production provider/deployment for a domain operation and owns the resulting job. The duplication problem is instead the two Creator credential lanes and the inactive feature-flagged runtime, not the existence of a creative capability router.

### Failure and success semantics

- Failure after a claimed attempt is persisted and sanitized; there is no automatic provider retry.
- Safe retry creates only attempt N+1.
- Success requires output references valid for expected modality, then persists a canonical asset in the same completion transaction.
- If asset persistence fails after provider success, the attempt preserves provider completion but the job fails and cannot blindly call the provider again.
- Accepted remote work becomes recovery-required rather than a fresh failure, but remains unresolved without a reconciler.

## 8. Agent Execution state

Agent Execution remains valuable under Harness because it is Creator's domain execution boundary for browser-native creation and the underlying durable job/provider machinery reused by service execution. It should not become a second general-purpose orchestrator.

Current lifecycle:

- `approve`: validates safe proposal and issues a short-lived one-shot proof.
- `start`/`prepare` (browser): consumes proof, creates owner-scoped job, compiles plan, resolves concrete creative routing, and creates the first attempt only when executable.
- `from-conversation`: reads an owned conversation, extracts structured creative intent, issues/consumes approval server-side, and prepares durable work.
- `clarify`: service exists in the current implementation to update allowed missing inputs safely.
- `approve-plan`: approves the exact current plan and rejects stale/cross-owner/repeated approval.
- `execute`: claims only a ready attempt, resolves credential/funding, calls provider, and persists result/failure.
- `execute-service`: adds scoped service auth, delegated authority, and idempotency for Harness.
- `jobs/:jobId`: read-only owner-scoped status.
- `retry`: explicit failed-attempt retry with duplicate/active/recovery guards.

The architecture is active, not obsolete. Its browser UI is partial around clarification/status recovery, while its Harness boundary is broken by the caller contract. The previously untracked `src/lib/creativePrepareServiceEndpoint.js` was reviewed and discarded because it was unused, superseded by the active stateless preparation route, and conflicted with the intended service-authenticated `creative.prepare` semantics. The active preparation path remains `app/api/agent-execution/prepare/route.js` → `requireCreatorIdentityOrService` → `StatelessCreativePreparationService` → `creative.prepare`. Do not introduce a second preparation lane without proving it replaces a gap.

## 9. UI launch findings

### Prevents task completion

- No connected UI for saving the encrypted account-scoped MuAPI credential required by Agent Execution/Harness.
- A durable plan in `requires_input` has no clarification control wired to the existing clarification endpoint.
- Recovery-required jobs have no reconciliation action or automatic monitor, so the UI can only report that recovery is needed.

### Confusing but usable

- Direct Studio generation, durable Agent Execution, and dashboard Maven chat look related but have different persistence, credential, and execution semantics.
- Asset Library merges local and durable assets, so reload/device behavior differs between otherwise similar-looking results.
- Dashboard operational counts are partly browser-local and should not be treated as global production truth.
- A successful Studio result may be visible even if best-effort Hub registration failed.

### Polish only

- Nested/card-heavy presentation and broader conversational visual direction.
- More detailed progress language, richer asset previews, and workspace presentation consistency.

### Future enhancement

- Apps gallery expansion, Automation destination, general MCP/CLI controls, and broad consolidation of every specialized Studio.

## 10. Test and build state

### Checks run during this audit

- `npm run build`: **passed**. Next compiled, type-checked, generated 28 static pages, and collected build traces.
- A raw `node --test`: not a valid result in this managed Windows environment. Node attempted one worker process per file and all 234 files failed with `spawn EPERM` before test code ran.
- Core suites rerun with `--test-isolation=none`: 170 tests executed; 163 passed. Seven execution-service assertions failed only because unrelated suites shared process state under this nonstandard mode.
- `creativeJobExecutionService.test.js` rerun alone in the same no-worker mode: **22/22 passed**, confirming those seven were test isolation contamination, not product failures.
- Ten selected files were then run one file/process at a time without worker spawning: **10/10 files passed**, covering **99 tests** across startup, MavenSync integration, design/workflow integration, publishing, backend certification fixture, Design Agent conversation/adapter, and provider credentials.

The tests are extensive but the repository has no canonical root `test` script and raw discovery also double-counts generated `packages/studio/dist` tests. Before launch CI should define one deterministic source-only test command with supported isolation. This is a reliability requirement, not evidence that the application code is broadly failing.

### What tests do not prove

Mock/fixture “certification” tests prove contracts and behavior, not deployed provider access, real database migrations, cross-service secrets, proxy timeouts, URL durability, or a browser-visible real artifact. Those remain production certification work.

## 11. Explicit answers

### 1. Can a real authenticated user currently create a real image and receive the asset?

**CODE-COMPLETE BUT NEEDS PRODUCTION CERTIFICATION.** The active Image Studio calls real MuAPI endpoints, handles uploads/reference images and polling, and displays/stores the returned URL. Repository evidence does not establish a fresh deployed authenticated run. Normal Studio results are also mainly local/provider-reference assets rather than guaranteed Creator-database assets.

### 2. Can a real authenticated user currently create a real video and receive the asset?

**CODE-COMPLETE BUT NEEDS PRODUCTION CERTIFICATION.** The Video Studio submits real jobs, monitors provider status, resumes locally known pending jobs, and displays the returned video. It still needs a deployed authenticated video run, reload/retrieval check, and timeout/failure certification.

### 3. Can Maven Harness currently invoke Creator OS and receive a verified real artifact?

**NO.** The first failure is that Harness omits the mandatory stable `idempotencyKey`; Creator returns HTTP 400 before creating a job or invoking MuAPI. After that contract is fixed, the 10-second synchronous timeout, account-credential provisioning, async reconciliation, and reference-only verification still need closure/certification. Current Harness verification proves terminal durable job state plus a result reference, not reachable bytes.

### 4. Does Creator OS correctly consume MavenSync Foundations/brand intelligence?

**PARTIAL.** It directly retrieves and normalizes a Hub Knowledge Pack for Knowledge Center and feature-flagged intelligence runtimes, and it has an older Hub-launch context adapter. The active default Studio paths do not consistently use that pack, several brand domains/assets are not normalized, and the Harness execute contract does not carry the canonical pack.

### 5. Is BYOK correctly implemented for the launch path?

**PARTIAL.** Encryption, owner scoping, save/status/revoke API, and execution-time resolution are correct and tested. The launch UI still writes a separate browser key/cookie, agency mode uses a managed key, and no active UI provisions the secure credential required by Harness/Agent Execution.

### 6. Features that appear unfinished but are actually implemented

- Real image and image-edit/reference generation.
- Real video generation and provider polling/resume.
- Marketing, Audio, Lip Sync, Cinema, Clipping, Vibe Motion, Recast, Character, and AI Influencer provider paths.
- Workflow graph validation/execution/polling and result normalization.
- Design Agent controlled conversation, ownership, streaming, and real provider adapter.
- MuAPI social publishing, connected accounts, draft validation, duplicate prevention, and partial-failure state.
- Durable creative jobs, attempts, approvals, status, retries, idempotency, credential encryption, and asset lineage.
- Hub Knowledge Pack retrieval/normalization and Knowledge Center display.
- Agent conversation-to-plan execution preparation and exact-plan approval.

These are not all production-certified, but they are materially implemented rather than broad scaffolding.

### 7. Features thought complete that have missing/disconnected pieces

- Harness creative execution: missing caller idempotency key.
- Harness monitoring: synchronous call can time out before returning the job ID needed for status observation.
- Recovery: recovery state exists but no reconciler exists.
- BYOK: secure backend exists but active UI/launch provisioning is disconnected.
- Foundations: multiple context paths; default Studio and Harness do not share one canonical flow.
- Asset persistence: durable lineage exists for Agent Execution, but ordinary Studio results are mostly local/provider URLs.
- Artifact verification: verifies metadata/reference, not reachability or stored bytes.
- Agent Execution clarification: route/service exists but `requires_input` UI is disconnected.
- Dashboard Maven chat: real conversation, but no media execution handoff.
- Deployment: migrations and complete required environment contract are not automated/documented.

### 8. Minimum work required to make Creator OS launch-ready

1. Add one stable idempotency key to the existing Harness creative-execute contract, schema, reader body, and tests; use the same logical key on retry/replay.
2. Make the execute/status interaction safe for real media durations. At minimum, certify an explicit timeout/proxy configuration with job ID recovery; preferably use the existing durable job as the immediate acknowledgement and let Harness observe status without keeping one long HTTP request open.
3. Pick and connect the launch credential policy without changing execution architecture: expose the existing encrypted per-account MuAPI credential API to the intended launch users/admins, or explicitly authorize a managed-funded lane with its existing cost controls. Do not silently fall back from BYOK to the platform key.
4. Add reconciliation for `provider_recovery_required` using the existing provider job ID; do not route it through fresh retry.
5. Decide the launch artifact guarantee. For the minimum honest gate, status verification must prove the owner-scoped asset row and a reachable output. If MavenSync promises durable storage independent of provider URL lifetime, copy bytes to controlled object storage before marking the job complete.
6. Apply the seven migrations in staging, configure all required secrets, and run one authenticated cross-service image plus one video through Agent Club → Harness → Creator → status → visible result.
7. Keep Agent Execution, dashboard, Design Agent, and Publishing work in coherent checkpoints after the above tests pass. Do not ship untracked implementation files.

## 12. Prioritized remaining work

## P0: LAUNCH BLOCKERS

1. **Repair Harness execute idempotency contract.** Add stable `idempotencyKey` end to end and contract-test Harness `4a376ac` against Creator `a52c1d5` behavior.
2. **Prevent long-generation caller loss.** Ensure Harness receives/retains a durable job ID before its request timeout and can observe completion. A configuration-only timeout increase is acceptable only if staging proves application and reverse-proxy limits for the launch workloads.
3. **Provision the actual launch credential lane.** Harness/Agent Execution MuAPI calls cannot work for a user until the encrypted account credential exists (or a deliberately authorized managed funding lane is wired). Connect existing secure credential storage; do not add another store.
4. **Reconcile accepted provider jobs.** Complete existing recovery-required jobs by provider job ID without re-running generation.
5. **Production ecosystem certification.** Apply migrations and execute one real authenticated image and video across Agent Club → Harness → Creator, observing job state and the visible returned asset. This is the proof that the P0 contract fixes work together.

## P1: REQUIRED FOR RELIABLE FIRST USERS

1. Strengthen verification from “terminal job plus result string” to owner-scoped asset record plus reachable output; decide/document whether provider URLs meet the launch durability promise.
2. Connect `requires_input` UI to the existing clarification boundary, or constrain launch recipes so this state cannot strand a user.
3. Add UI/background status observation for long-running/recovery states and refresh-safe result display.
4. Document and automate migration execution, database/SSO/service-auth/encryption configuration, secret rotation, and rollback. Expand readiness beyond process liveness.
5. Define a deterministic source-only CI test command; exclude generated `dist` duplicates and use supported process isolation.
6. Maintain clean git checkpoints for remaining launch work, then rerun build and targeted suites from a clean tree.
7. Run direct Studio certification for image, reference image, video, reload/retrieval, provider failure, and pending-job resume.

## P2: POST-LAUNCH HARDENING

1. Add service-token replay/JTI enforcement and shared/distributed rate limiting for multi-instance deployment.
2. Move standalone browser BYOK away from JavaScript-readable cookie/local storage if standalone mode remains a supported production product.
3. Consolidate local and durable asset/library behavior and operational dashboard counts.
4. Improve CSP by removing `unsafe-eval`/`unsafe-inline` as application constraints permit.
5. Add durable retention/expiry monitoring for provider-hosted assets and richer multi-output status contracts.
6. Consolidate Foundations field coverage (brand, voice, approved claims, visual direction, brand assets) after the launch contract is stable.

## BACKLOG

- Automation destination and broader no-code automation UI.
- Apps-gallery concepts that are not already backed by a product flow.
- Creator-side MCP, CLI, web search, subagent, or general orchestration features already owned by Harness.
- Broad visual redesign or component-system cleanup.
- Enabling every feature-flagged in-memory Creative Intelligence runtime before parity and durability are proven.
- New providers, generalized agent infrastructure, or replacement of working Studio architecture.

## 13. Exact shortest launch sequence

1. Freeze and checkpoint the intended current Creator work; record the exact Creator/Harness SHAs used for certification.
2. Patch only the Harness creative-execute contract to provide a stable idempotency key and add cross-repository contract tests.
3. Change only the execution acknowledgement/observation behavior necessary to retain a job ID across long provider work; reuse Creator's existing job/status architecture.
4. Connect the existing encrypted MuAPI credential endpoint to the launch cohort/admin flow and verify owner scoping.
5. Add provider-job reconciliation using the already persisted provider job ID.
6. Require an owner-scoped asset row and reachable reference for Harness verification; add controlled storage only if the product promise requires it.
7. Apply migrations and secrets in staging; run image and video through the full ecosystem, including failure, retry, timeout/recovery, reference input, reload, and cross-account denial.
8. Run the production build and deterministic source-only tests from a clean tree, create stable git checkpoints, and promote the exact certified artifacts.

This sequence repairs existing seams. It does not redesign Creator OS, duplicate Harness, or require broad feature work before launch.
