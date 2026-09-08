# Repository 07: AI-Voice-Agent

## Repository Summary

This repository is a minimal self-hosted real-time voice-agent loop: Deepgram live transcription receives microphone audio, an LLM produces a response from a role prompt and conversation memory, Deepgram TTS synthesizes sentence segments, and local playback gates the microphone.

Its value for MavenSync is the latency and turn-taking pattern, not the restaurant persona or desktop audio implementation.

## Skill Inventory

- Real-time microphone transcription.
- Interim and final transcript handling.
- Voice activity and endpoint detection.
- Conversational LLM response generation.
- Persona/system instruction management.
- Short-response segmentation by sentence.
- Incremental TTS synthesis.
- Audio playback and microphone gating.
- Conversation memory accumulation.
- Restaurant reservation/order tool-shaped conversation pattern.
- Proactive clarification when transcript quality is uncertain.

## Workflow Intelligence

### Real-time voice turn

```text
Microphone
  -> streaming STT interim transcript
  -> final/speech-final event
  -> append user turn to memory
  -> assemble persona + transcript context
  -> LLM response
  -> split response into sentence segments
  -> synthesize segments
  -> mute microphone during playback
  -> playback
  -> unmute and resume listening
```

### STT configuration

- Nova-2 model.
- Explicit language and linear PCM format.
- Interim results enabled.
- Smart formatting enabled.
- Voice activity events enabled.
- One-second utterance endpoint.
- 500ms endpointing.
- Open/close/error/metadata event handlers.

### Conversation flow

- The agent asks targeted questions.
- It handles ASR uncertainty conversationally rather than exposing transcription errors.
- It performs one action/question at a time.
- It confirms order details before completion.
- It ends with a question or next step to maintain turn flow.

## Prompt Intelligence

The embedded prompt demonstrates useful structure, paraphrased here:

- Objective: behave like a human conversational voice agent.
- Role: define identity, domain, responsibilities, and boundaries.
- Task procedures: explicit ordered steps for reservations/orders.
- Domain data: menu/catalog information and pricing constraints.
- Conversation style: proactive, concise, friendly, targeted.
- ASR recovery: infer likely intent, ask colloquial clarification, never expose internal transcription terminology.
- Role adherence: steer unsupported requests back to the agent’s purpose.
- Anti-repetition: rephrase rather than repeat.
- Emotional range: allow empathy/humor while maintaining task discipline.

MavenSync should convert this into versioned Voice Recipes with separate fields for persona, domain policy, procedure, turn-taking, ASR recovery, response length, and prohibited disclosures.

## Recipe Catalog

### Voice Persona

- **Studio:** Voice Studio / Knowledge Center
- **Inputs:** Persona identity, role, domain, tone, language.
- **Outputs:** Versioned conversational instruction set.

### Voice Support Agent

- **Studio:** Voice Studio
- **Inputs:** Business purpose, FAQ/knowledge references, escalation rules.
- **Optional:** Tool schemas and approval rules.
- **Outputs:** Conversation turns, tool calls, transcript, summary.

### Voice Sales Agent

- **Studio:** Voice Studio / Campaign Builder
- **Inputs:** Offer, audience, qualification questions, objection policy.
- **Outputs:** Conversational qualification and structured lead result.

### Voice Content Narrator

- **Studio:** Audio/Video Studio
- **Inputs:** Script, voice, pacing, pronunciation guidance.
- **Outputs:** Audio segments and timed transcript.

### Voice-to-Creative Brief

- **Studio:** Voice Studio -> Campaign Builder
- **Inputs:** Spoken brief.
- **Outputs:** Normalized campaign brief, extracted objectives, asset requests.

## Model Intelligence

- Streaming STT should be selected by latency, interim quality, language, and endpointing support.
- TTS should support streaming/chunked playback and voice persona configuration.
- LLM selection should balance response latency, instruction following, conversation context, and cost.
- Audio playback should support interruption and barge-in rather than waiting for a full response.

## Studio Mapping

- **Voice Studio:** Persona, transcript, turn-taking, tool calls, playback state, transcript history.
- **Creative Intelligence Layer:** Voice recipe compilation, response policy, memory window, tool-routing decisions.
- **Knowledge Center:** Approved facts, brand voice, FAQs, product/catalog context, prohibited disclosures.
- **Campaign Builder:** Voice-created briefs and structured campaign requests.
- **Creative Asset Library:** Calls, transcripts, generated audio, summaries, extracted briefs.
- **Provider Registry:** STT, TTS, LLM, telephony, and audio providers.

## UX Recommendations

- Live interim transcript panel with final transcript distinction.
- Clear listening/thinking/speaking states.
- Barge-in indicator when user interrupts playback.
- Conversation timeline with expandable turns.
- Persona and voice controls separated from business instructions.
- Knowledge/context attachment panel.
- Tool approval card before consequential actions.
- Compact transcript corrections without exposing raw ASR internals.
- Call/session summary and extracted actions.
- Audio asset history linked to transcript and recipe version.

## Automation Opportunities

- Voice turn -> structured Campaign brief.
- Voice tool call -> approval -> Campaign/Asset mutation.
- Transcript -> Knowledge Center candidate FAQ or content insight.
- Call summary -> CRM/n8n/GHL handoff.
- Failed TTS/STT segment -> retry only the affected segment.
- Conversation memory compaction after a configurable turn window.

## Gap Analysis

- MavenSync does not yet have a Voice Studio domain with streaming turn state.
- Prompt Builder supports text/media recipes but not voice persona/turn policy sections.
- Knowledge Center context needs a low-latency voice context projection.
- Creative Orchestrator has no conversational tool-call job type.
- Asset Library needs transcript/audio/session relationships.

## Database Impact

| Feature | Existing tables affected | New tables | New columns | Migration | Relationships |
|---|---|---|---|---|---|
| Voice sessions | Users/campaigns | `voice_sessions` | `personaRecipeId`, `status`, `startedAt`, `endedAt`, `summary` | Required when persistent sessions ship | User/campaign to session |
| Conversation turns | Voice sessions | `voice_turns` | `role`, `transcript`, `audioAssetId`, `latencyMs`, `toolCallId` | Required | Session to ordered turns |
| Voice recipes | Recipe registry | Optional `voice_recipe_versions` | `persona`, `turnPolicy`, `asrPolicy`, `ttsProfile` | Config-only initially | Recipe to sessions/jobs |
| Tool approvals | Voice sessions/jobs | `voice_approvals` | `tool`, `payload`, `status`, `approvedBy`, timestamps | Required for consequential tools | Turn to approval |
| Voice assets | Assets | None or asset relations | `sessionId`, `turnId`, `transcriptId` | Additive | Turn/session to asset |

## API Surface

- Provider calls: streaming STT WebSocket, LLM response, streaming/chunked TTS, optional telephony.
- Internal endpoints: create session, send audio, receive transcript events, submit turn, approve tool, retrieve summary.
- Background jobs: transcript compaction, summary, audio post-processing, failed segment retry.
- Event system: interim transcript, final transcript, response started, audio chunk, speaking started/stopped, tool approval, session completed.
- Queue requirements: not required for live turns; recommended for post-call processing.
- Retry logic: retry TTS segment/STT reconnect, not entire conversation turn blindly.
- Polling: avoid for live audio; use streaming events.
- Streaming: essential for STT and TTS latency.
- Webhooks: needed for telephony call lifecycle where applicable.

## MavenSync Integration Opportunities

### Immediate

- Add Voice Recipe schema to Prompt/Recipe Engine. High value, medium difficulty.
- Add transcript/audio/recipe provenance fields to Creative Asset relationships. High value, low difficulty.
- Add a voice-to-campaign brief extractor using existing CampaignBuilder. High value, medium difficulty.

### Phase 2

- Add streaming STT/TTS provider ports. Very high value, high difficulty.
- Add memory compaction and turn summaries. High value, medium difficulty.
- Add tool approval records and state transitions. Very high value, medium difficulty.

### Future

- Add telephony provider adapters.
- Add real-time voice agents for sales/support.
- Add multi-agent handoff and escalation.

## Codex Implementation Prompts

### Voice Recipe Contract

Add a provider-neutral Voice Recipe contract with persona, role, turn policy, ASR recovery, response length, language, and TTS profile fields. Do not implement audio streaming or UI. Add schema and normalization tests.

### Voice Turn State

Add an in-memory Voice Turn state machine for listening, transcribing, thinking, speaking, interrupted, completed, and failed states. Do not call providers. Add transition tests and preserve existing CreativeJob APIs.

### Voice-to-Campaign Brief

Add a pure transcript-to-CampaignBuilder input normalizer that extracts objective, audience, offer, constraints, and requested asset roles. Do not call an LLM or modify UI; add fixture tests.

### Barge-In Contract

Define provider-neutral interruption events for voice playback and microphone capture. Implement only event/state contracts, not real audio providers. Add tests for interruption during TTS and resume listening.

## Ignore List

- Copying the restaurant persona or menu data.
- Using global mutable conversation memory in production.
- Blocking until full TTS output before playback.
- Exposing raw API keys in Voice Studio.
- Treating desktop pygame playback as the product architecture.
- Adding telephony before streaming voice contracts exist.
