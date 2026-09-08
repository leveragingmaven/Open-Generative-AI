// Creative OS — Agent persistence (localStorage). Agents are local records,
// fully independent of the MuAPI agent runtime. A chat belongs to an Agent and
// executes under a selected AI Twin (see AgentChatStore / buildAgentReply).

import { readJson, writeJson, removeItem } from "../assets/storageManager.js";
import { createAgentProfile, updateAgentProfile } from "./AgentProfile.js";

export const AGENTS_STORAGE_KEY = "mavensync_agents";
export const ACTIVE_AGENT_TWIN_KEY = "mavensync_active_agent_twin";

const resolveStorage = (storage) => storage || globalThis?.localStorage;

export function listAgents(storage) {
  const list = readJson(AGENTS_STORAGE_KEY, [], resolveStorage(storage));
  return Array.isArray(list) ? list.map((agent) => createAgentProfile(agent)) : [];
}

export function getAgent(id, storage) {
  return listAgents(storage).find((agent) => agent.id === id) || null;
}

export function createAgent(input = {}, storage) {
  const agent = createAgentProfile(input);
  const list = listAgents(storage);
  writeJson(AGENTS_STORAGE_KEY, [agent, ...list], resolveStorage(storage));
  return agent;
}

export function updateAgent(id, patch = {}, storage) {
  const list = listAgents(storage);
  const index = list.findIndex((agent) => agent.id === id);
  if (index === -1) return null;
  const updated = updateAgentProfile(list[index], patch);
  list[index] = updated;
  writeJson(AGENTS_STORAGE_KEY, list, resolveStorage(storage));
  return updated;
}

export function deleteAgent(id, storage) {
  const list = listAgents(storage);
  const next = list.filter((agent) => agent.id !== id);
  if (next.length === list.length) return false;
  writeJson(AGENTS_STORAGE_KEY, next, resolveStorage(storage));
  return true;
}

export function getActiveAgentTwinId(storage) {
  return readJson(ACTIVE_AGENT_TWIN_KEY, null, resolveStorage(storage));
}

export function setActiveAgentTwinId(twinId, storage) {
  writeJson(ACTIVE_AGENT_TWIN_KEY, twinId, resolveStorage(storage));
}

export function clearActiveAgentTwinId(storage) {
  removeItem(ACTIVE_AGENT_TWIN_KEY, resolveStorage(storage));
}
