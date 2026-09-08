// AI Twin Studio — Voice profile references.
//
// AI Twin Studio does NOT implement voice cloning. It reuses Audio Studio for
// any actual voice creation and only records a lightweight *reference* to a
// voice profile on the twin. This store keeps the list of voice profiles a
// twin can reference. When the user has none, the studio offers a link to
// create one in Audio Studio (/studio/audio).

import { readJson, writeJson, removeItem } from "../assets/storageManager.js";

export const VOICE_PROFILES_STORAGE_KEY = "mavensync_voice_profiles";

const now = () => new Date().toISOString();
const uid = () => `voice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export function createVoiceProfile(input = {}) {
  const createdAt = input.createdAt || now();
  return {
    id: input.id || uid(),
    name: input.name || "Voice Profile",
    tone: input.tone || "",
    description: input.description || "",
    // Optional reference to a voice produced elsewhere (e.g. Audio Studio
    // voice-clone model or a system voice id). Not used for cloning here.
    voiceId: input.voiceId || null,
    audioUrl: input.audioUrl || null,
    source: input.source || "creative-os",
    createdAt,
    updatedAt: input.updatedAt || createdAt,
  };
}

const resolveStorage = (storage) => storage || globalThis?.localStorage;

export function listVoiceProfiles(storage) {
  const list = readJson(VOICE_PROFILES_STORAGE_KEY, [], resolveStorage(storage));
  return Array.isArray(list) ? list.map((p) => createVoiceProfile(p)) : [];
}

export function getVoiceProfile(id, storage) {
  return listVoiceProfiles(storage).find((p) => p.id === id) || null;
}

// Upsert: create when no id, update when id exists.
export function saveVoiceProfile(input = {}, storage) {
  const list = listVoiceProfiles(storage);
  if (input.id) {
    const index = list.findIndex((p) => p.id === input.id);
    if (index !== -1) {
      list[index] = createVoiceProfile({ ...list[index], ...input, updatedAt: now() });
      writeJson(VOICE_PROFILES_STORAGE_KEY, list, resolveStorage(storage));
      return list[index];
    }
  }
  const profile = createVoiceProfile(input);
  writeJson(VOICE_PROFILES_STORAGE_KEY, [profile, ...list], resolveStorage(storage));
  return profile;
}

export function deleteVoiceProfile(id, storage) {
  const list = listVoiceProfiles(storage);
  const next = list.filter((p) => p.id !== id);
  if (next.length === list.length) return false;
  writeJson(VOICE_PROFILES_STORAGE_KEY, next, resolveStorage(storage));
  return true;
}
