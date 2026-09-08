// Creative OS — Agent chat persistence.
//
// A chat belongs to an Agent and executes under a selected AI Twin: the chat
// record snapshots twinId/twinName so replies always carry the twin identity
// that produced them. Agents never own memory or knowledge — the twin does.

import { readJson, writeJson, removeItem } from "../assets/storageManager.js";

export const AGENT_CHATS_STORAGE_KEY = "mavensync_agent_chats";

const resolveStorage = (storage) => storage || globalThis?.localStorage;

export function createAgentMessage({ role = "user", content = "", replyToMessageId = null, metadata = null } = {}) {
  const normalizedRole = role === "assistant" ? "assistant" : "user";
  return {
    id: `amsg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    role: normalizedRole,
    content: String(content || ""),
    replyToMessageId: replyToMessageId || null,
    metadata: metadata || null,
    timestamp: new Date().toISOString(),
  };
}

function normalizeChat(chat) {
  return {
    id: chat.id,
    agentId: chat.agentId,
    agentName: chat.agentName || "Agent",
    twinId: chat.twinId || null,
    twinName: chat.twinName || null,
    campaignId: chat.campaignId || null,
    campaignName: chat.campaignName || null,
    title: chat.title || "New chat",
    pinned: Boolean(chat.pinned),
    favorite: Boolean(chat.favorite),
    messages: Array.isArray(chat.messages) ? chat.messages : [],
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
  };
}

export function listAgentChats(storage) {
  const list = readJson(AGENT_CHATS_STORAGE_KEY, [], resolveStorage(storage));
  return Array.isArray(list) ? list.map(normalizeChat) : [];
}

export function listChatsForAgent(agentId, storage) {
  return listAgentChats(storage).filter((chat) => chat.agentId === agentId);
}

export function getAgentChat(id, storage) {
  return listAgentChats(storage).find((chat) => chat.id === id) || null;
}

export function createAgentChat(input = {}, storage) {
  const now = new Date().toISOString();
  const chat = normalizeChat({
    id: input.id || `achat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    title: input.title || "New chat",
    agentId: input.agentId || null,
    agentName: input.agentName || "Agent",
    twinId: input.twinId || null,
    twinName: input.twinName || null,
    campaignId: input.campaignId || null,
    campaignName: input.campaignName || null,
    pinned: input.pinned,
    favorite: input.favorite,
    messages: Array.isArray(input.messages) ? input.messages : [],
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
  });
  const list = listAgentChats(storage);
  writeJson(AGENT_CHATS_STORAGE_KEY, [chat, ...list], resolveStorage(storage));
  return chat;
}

export function updateAgentChat(id, patch = {}, storage) {
  const list = listAgentChats(storage);
  const index = list.findIndex((chat) => chat.id === id);
  if (index === -1) return null;
  const updated = normalizeChat({ ...list[index], ...patch, updatedAt: new Date().toISOString() });
  list[index] = updated;
  writeJson(AGENT_CHATS_STORAGE_KEY, list, resolveStorage(storage));
  return updated;
}

export function deleteAgentChat(id, storage) {
  const list = listAgentChats(storage);
  const next = list.filter((chat) => chat.id !== id);
  if (next.length === list.length) return false;
  writeJson(AGENT_CHATS_STORAGE_KEY, next, resolveStorage(storage));
  return true;
}

export function deleteChatsForAgent(agentId, storage) {
  const list = listAgentChats(storage);
  const next = list.filter((chat) => chat.agentId !== agentId);
  if (next.length === list.length) return false;
  writeJson(AGENT_CHATS_STORAGE_KEY, next, resolveStorage(storage));
  return true;
}

export function appendAgentMessage(chatId, message, storage) {
  const chat = getAgentChat(chatId, storage);
  if (!chat) return null;
  const msg = createAgentMessage(message);
  chat.messages = [...(chat.messages || []), msg];
  updateAgentChat(chatId, { messages: chat.messages }, storage);
  return msg;
}

export function getAgentMessages(chatId, storage) {
  const chat = getAgentChat(chatId, storage);
  return chat ? chat.messages : [];
}
