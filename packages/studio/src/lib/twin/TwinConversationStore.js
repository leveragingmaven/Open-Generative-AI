// AI Twin Workspace — per-Twin conversation persistence (localStorage).
//
// Each Twin owns its own conversation history; conversation context is isolated
// per Twin and stamped with the campaign it belongs to (campaign-aware chats).
// The record is intentionally future-proofed for search, favorites, pinning,
// and branching (conversations carry a `parentId`; messages carry a
// `replyToMessageId`). No other subsystem stores twin conversations, so there
// is no duplicate storage.
//
// The store accepts an optional `storage` argument (defaults to
// globalThis.localStorage) so the CRUD helpers are unit-testable.

import { readJson, writeJson, removeItem } from "../assets/storageManager.js";

export const TWIN_CONVERSATIONS_STORAGE_KEY = "mavensync_twin_conversations";

const now = () => new Date().toISOString();
const uid = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const resolveStorage = (storage) => storage || globalThis?.localStorage;

function readConversations(storage) {
  const list = readJson(TWIN_CONVERSATIONS_STORAGE_KEY, [], resolveStorage(storage));
  return Array.isArray(list) ? list : [];
}

function writeConversations(list, storage) {
  writeJson(TWIN_CONVERSATIONS_STORAGE_KEY, list, resolveStorage(storage));
}

export function createTwinMessage(input = {}) {
  const timestamp = input.timestamp || now();
  return {
    id: input.id || uid("msg"),
    role: input.role === "assistant" ? "assistant" : "user",
    content: input.content || "",
    replyToMessageId: input.replyToMessageId || null,
    metadata: input.metadata && typeof input.metadata === "object" ? { ...input.metadata } : {},
    timestamp,
  };
}

function createConversationRecord(input = {}) {
  const timestamp = input.createdAt || now();
  return {
    id: input.id || uid("twin-conv"),
    twinId: input.twinId || null,
    title: (input.title || "").trim() || "New Chat",
    campaignId: input.campaignId || null,
    campaignName: input.campaignName || null,
    parentId: input.parentId || null,
    pinned: Boolean(input.pinned),
    favorite: Boolean(input.favorite),
    messages: Array.isArray(input.messages)
      ? input.messages.map((m) => createTwinMessage(m))
      : [],
    createdAt: timestamp,
    updatedAt: input.updatedAt || timestamp,
  };
}

// ── Conversations ────────────────────────────────────────────────────────────

export function listTwinConversations(twinId, storage) {
  return readConversations(storage)
    .filter((conv) => conv.twinId === twinId)
    .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
}

export function listAllConversations(storage) {
  return readConversations(storage).sort((a, b) =>
    (b.updatedAt || "").localeCompare(a.updatedAt || "")
  );
}

export function getTwinConversation(twinId, conversationId, storage) {
  return readConversations(storage).find(
    (conv) => conv.twinId === twinId && conv.id === conversationId
  ) || null;
}

export function createTwinConversation(input = {}, storage) {
  const conversation = createConversationRecord(input);
  const list = readConversations(storage);
  writeConversations([conversation, ...list], storage);
  return conversation;
}

export function updateTwinConversation(twinId, conversationId, patch = {}, storage) {
  const list = readConversations(storage);
  const index = list.findIndex(
    (conv) => conv.twinId === twinId && conv.id === conversationId
  );
  if (index === -1) return null;
  const updated = createConversationRecord({
    ...list[index],
    ...patch,
    id: list[index].id,
    twinId: list[index].twinId,
    createdAt: list[index].createdAt,
    updatedAt: now(),
  });
  list[index] = updated;
  writeConversations(list, storage);
  return updated;
}

export function deleteTwinConversation(twinId, conversationId, storage) {
  const list = readConversations(storage);
  const next = list.filter(
    (conv) => !(conv.twinId === twinId && conv.id === conversationId)
  );
  if (next.length === list.length) return false;
  writeConversations(next, storage);
  return true;
}

export function deleteTwinConversationsForTwin(twinId, storage) {
  const list = readConversations(storage);
  const next = list.filter((conv) => conv.twinId !== twinId);
  writeConversations(next, storage);
  return next.length !== list.length;
}

// ── Messages ─────────────────────────────────────────────────────────────────

export function appendTwinMessage(twinId, conversationId, messageInput, storage) {
  const list = readConversations(storage);
  const index = list.findIndex(
    (conv) => conv.twinId === twinId && conv.id === conversationId
  );
  if (index === -1) return null;
  const message = createTwinMessage(messageInput);
  const conversation = list[index];
  conversation.messages = [...(conversation.messages || []), message];
  conversation.updatedAt = now();
  writeConversations(list, storage);
  return { conversation, message };
}

export function getConversationMessages(twinId, conversationId, storage) {
  const conversation = getTwinConversation(twinId, conversationId, storage);
  return conversation ? [...(conversation.messages || [])] : [];
}

// ── Discovery helpers ────────────────────────────────────────────────────────

export function listPinnedTwinConversations(storage) {
  return listAllConversations(storage).filter((conv) => conv.pinned);
}

export function listFavoriteTwinConversations(storage) {
  return listAllConversations(storage).filter((conv) => conv.favorite);
}

// Searches conversation titles and message content across every twin.
export function searchTwinConversations(query, storage) {
  const q = (query || "").trim().toLowerCase();
  if (!q) return [];
  return listAllConversations(storage).filter((conv) => {
    if ((conv.title || "").toLowerCase().includes(q)) return true;
    return (conv.messages || []).some((msg) =>
      (msg.content || "").toLowerCase().includes(q)
    );
  });
}
