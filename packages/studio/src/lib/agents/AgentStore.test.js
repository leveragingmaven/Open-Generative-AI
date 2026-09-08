import assert from "node:assert/strict";
import test from "node:test";

import {
  AGENTS_STORAGE_KEY,
  ACTIVE_AGENT_TWIN_KEY,
  listAgents,
  getAgent,
  createAgent,
  updateAgent,
  deleteAgent,
  getActiveAgentTwinId,
  setActiveAgentTwinId,
  clearActiveAgentTwinId,
} from "./AgentStore.js";

import {
  listAgentChats,
  listChatsForAgent,
  getAgentChat,
  createAgentChat,
  updateAgentChat,
  deleteAgentChat,
  deleteChatsForAgent,
  appendAgentMessage,
  getAgentMessages,
  AGENT_CHATS_STORAGE_KEY,
  createAgentMessage,
} from "./AgentChatStore.js";

function createFakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}

test("agent CRUD isolates records", () => {
  const storage = createFakeStorage();
  const a = createAgent({ name: "Photographer", category: "Image" }, storage);
  const b = createAgent({ name: "Strategist", category: "Marketing" }, storage);
  assert.equal(listAgents(storage).length, 2);
  assert.equal(getAgent(a.id, storage).name, "Photographer");
  const updated = updateAgent(a.id, { name: "Hero Photographer" }, storage);
  assert.equal(updated.name, "Hero Photographer");
  assert.equal(updateAgent("nope", { name: "x" }, storage), null);
  assert.equal(deleteAgent(a.id, storage), true);
  assert.equal(getAgent(a.id, storage), null);
  assert.ok(getAgent(b.id, storage));
  assert.equal(deleteAgent(a.id, storage), false);
});

test("active agent twin id persists and clears", () => {
  const storage = createFakeStorage();
  assert.equal(getActiveAgentTwinId(storage), null);
  setActiveAgentTwinId("twin-1", storage);
  assert.equal(getActiveAgentTwinId(storage), "twin-1");
  clearActiveAgentTwinId(storage);
  assert.equal(getActiveAgentTwinId(storage), null);
});

test("chat CRUD snapshots the executing twin", () => {
  const storage = createFakeStorage();
  const chat = createAgentChat(
    { agentId: "agent-1", agentName: "Strategist", twinId: "twin-9", twinName: "Maya", campaignId: "camp-1", campaignName: "Drop" },
    storage
  );
  assert.equal(chat.twinId, "twin-9");
  assert.equal(chat.campaignName, "Drop");
  assert.equal(getAgentChat(chat.id, storage).agentId, "agent-1");
  assert.equal(listChatsForAgent("agent-1", storage).length, 1);
  const renamed = updateAgentChat(chat.id, { title: "Launch plan" }, storage);
  assert.equal(renamed.title, "Launch plan");
  assert.equal(updateAgentChat("nope", { title: "x" }, storage), null);
});

test("appendAgentMessage stores messages and bumps updatedAt", () => {
  const storage = createFakeStorage();
  const chat = createAgentChat({ agentId: "agent-1" }, storage);
  const userMsg = appendAgentMessage(chat.id, { role: "user", content: "hello" }, storage);
  assert.equal(userMsg.role, "user");
  appendAgentMessage(chat.id, { role: "assistant", content: "hi" }, storage);
  assert.equal(getAgentMessages(chat.id, storage).length, 2);
  assert.ok(getAgentChat(chat.id, storage).updatedAt >= chat.updatedAt);
  assert.equal(appendAgentMessage("nope", { content: "x" }, storage), null);
});

test("deleteChatsForAgent removes only that agent's chats", () => {
  const storage = createFakeStorage();
  createAgentChat({ agentId: "agent-1" }, storage);
  createAgentChat({ agentId: "agent-1" }, storage);
  createAgentChat({ agentId: "agent-2" }, storage);
  assert.equal(deleteChatsForAgent("agent-1", storage), true);
  assert.equal(listChatsForAgent("agent-1", storage).length, 0);
  assert.equal(listChatsForAgent("agent-2", storage).length, 1);
});

test("createAgentMessage normalizes roles", () => {
  assert.equal(createAgentMessage({}).role, "user");
  assert.equal(createAgentMessage({ role: "assistant" }).role, "assistant");
  assert.equal(createAgentMessage({ role: "robot" }).role, "user");
});

test("stores tolerate corrupt localStorage", () => {
  const storage = createFakeStorage({ mavensync_agents: "bad", mavensync_agent_chats: "bad" });
  assert.deepEqual(listAgents(storage), []);
  assert.deepEqual(listAgentChats(storage), []);
  assert.equal(AGENTS_STORAGE_KEY, "mavensync_agents");
  assert.equal(AGENT_CHATS_STORAGE_KEY, "mavensync_agent_chats");
  assert.equal(ACTIVE_AGENT_TWIN_KEY, "mavensync_active_agent_twin");
});
