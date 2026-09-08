// AI Twin Studio — public library surface.
// All twin data-model, generation-prompt, voice-profile, hub-import, and
// workflow helpers are exported here for reuse across Creative OS.

export {
  TWIN_STATUSES,
  TWIN_SOURCES,
  TWIN_ASSET_TYPES,
  TWIN_ASSET_CATALOG,
  TWIN_APPROVAL_MODES,
  TWIN_DEFAULT_SETTINGS,
  TWIN_DEFAULT_PROVIDERS,
  getTwinAssetType,
  createTwinProfile,
  updateTwinProfile,
  createTwinCandidate,
  createTwinAsset,
} from "./TwinProfile.js";

export {
  TWIN_BLUEPRINTS,
  TWIN_PERMISSIONS,
  TWIN_KNOWLEDGE_COLLECTIONS,
  listBlueprints,
  getBlueprint,
  getBlueprintSkillIds,
  createTwinFromBlueprint,
} from "./TwinBlueprints.js";

export {
  TWIN_CONVERSATIONS_STORAGE_KEY,
  createTwinMessage,
  listTwinConversations,
  listAllConversations,
  getTwinConversation,
  createTwinConversation,
  updateTwinConversation,
  deleteTwinConversation,
  deleteTwinConversationsForTwin,
  appendTwinMessage,
  getConversationMessages,
  listPinnedTwinConversations,
  listFavoriteTwinConversations,
  searchTwinConversations,
} from "./TwinConversationStore.js";

export {
  TWINS_STORAGE_KEY,
  TWIN_DRAFT_STORAGE_KEY,
  listTwins,
  getTwin,
  createTwin,
  updateTwin,
  deleteTwin,
  loadTwinDraft,
  saveTwinDraft,
  clearTwinDraft,
} from "./TwinStore.js";

export {
  VOICE_PROFILES_STORAGE_KEY,
  createVoiceProfile,
  listVoiceProfiles,
  getVoiceProfile,
  saveVoiceProfile,
  deleteVoiceProfile,
} from "./twinVoiceProfiles.js";

export {
  composeCreativeDefaults,
  buildTwinCandidatePrompt,
  buildTwinAssetPrompt,
  buildTwinAssetPromptMatrix,
} from "./twinAssets.js";

export {
  TWIN_ONBOARDING_MODEL,
  buildTwinOnboardingWorkflow,
  createTwinOnboardingWorkflow,
} from "./twinWorkflow.js";

export {
  HUB_PREFILL_KEYS,
  buildTwinPrefillFromHub,
  readBrandDnaMemory,
} from "./twinHubImport.js";
