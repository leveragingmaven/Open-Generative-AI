import assert from "node:assert/strict";
import test from "node:test";

import {
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

function createFakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    _map: map,
  };
}

test("createTwinMessage normalizes role and defaults", () => {
  assert.equal(createTwinMessage({}).role, "user");
  assert.equal(createTwinMessage({ role: "assistant" }).role, "assistant");
  assert.equal(createTwinMessage({ role: "weird" }).role, "user");
  assert.equal(createTwinMessage({}).content, "");
  assert.ok(createTwinMessage({}).id.startsWith("msg-"));
});

test("conversations are isolated per twin", () => {
  const storage = createFakeStorage();
  createTwinConversation({ twinId: "twin-a", title: "A chat" }, storage);
  createTwinConversation({ twinId: "twin-b", title: "B chat" }, storage);
  assert.equal(listTwinConversations("twin-a", storage).length, 1);
  assert.equal(listTwinConversations("twin-a", storage)[0].title, "A chat");
  assert.equal(listTwinConversations("twin-b", storage).length, 1);
  assert.equal(listAllConversations(storage).length, 2);
});

test("conversations are campaign-aware", () => {
  const storage = createFakeStorage();
  const conv = createTwinConversation(
    { twinId: "twin-a", title: "Launch", campaignId: "camp-1", campaignName: "Spring Drop" },
    storage
  );
  assert.equal(conv.campaignId, "camp-1");
  assert.equal(conv.campaignName, "Spring Drop");
  assert.equal(getTwinConversation("twin-a", conv.id, storage).campaignId, "camp-1");
});

test("updateTwinConversation renames, pins, and favorites", () => {
  const storage = createFakeStorage();
  const conv = createTwinConversation({ twinId: "twin-a", title: "Old" }, storage);
  const updated = updateTwinConversation(
    "twin-a",
    conv.id,
    { title: "New", pinned: true, favorite: true },
    storage
  );
  assert.equal(updated.title, "New");
  assert.equal(updated.pinned, true);
  assert.equal(updated.favorite, true);
  assert.equal(listPinnedTwinConversations(storage).length, 1);
  assert.equal(listFavoriteTwinConversations(storage).length, 1);
  assert.equal(updateTwinConversation("twin-a", "nope", { title: "x" }, storage), null);
});

test("appendTwinMessage stores messages and bumps the conversation", () => {
  const storage = createFakeStorage();
  const conv = createTwinConversation({ twinId: "twin-a", title: "Chat" }, storage);
  appendTwinMessage("twin-a", conv.id, { role: "user", content: "hello" }, storage);
  appendTwinMessage("twin-a", conv.id, { role: "assistant", content: "hi" }, storage);
  const messages = getConversationMessages("twin-a", conv.id, storage);
  assert.equal(messages.length, 2);
  assert.equal(messages[0].content, "hello");
  assert.equal(messages[1].content, "hi");
  assert.ok(getTwinConversation("twin-a", conv.id, storage).updatedAt >= conv.updatedAt);
  assert.equal(
    appendTwinMessage("twin-a", "missing", { content: "x" }, storage),
    null
  );
});

test("deleteTwinConversation removes only the requested conversation", () => {
  const storage = createFakeStorage();
  const a = createTwinConversation({ twinId: "twin-a", title: "A" }, storage);
  const b = createTwinConversation({ twinId: "twin-a", title: "B" }, storage);
  assert.equal(deleteTwinConversation("twin-a", a.id, storage), true);
  assert.equal(getTwinConversation("twin-a", a.id, storage), null);
  assert.ok(getTwinConversation("twin-a", b.id, storage));
  assert.equal(deleteTwinConversation("twin-a", a.id, storage), false);
});

test("deleteTwinConversationsForTwin removes a twin's history only", () => {
  const storage = createFakeStorage();
  createTwinConversation({ twinId: "twin-a", title: "A" }, storage);
  createTwinConversation({ twinId: "twin-a", title: "A2" }, storage);
  createTwinConversation({ twinId: "twin-b", title: "B" }, storage);
  assert.equal(deleteTwinConversationsForTwin("twin-a", storage), true);
  assert.equal(listTwinConversations("twin-a", storage).length, 0);
  assert.equal(listTwinConversations("twin-b", storage).length, 1);
});

test("searchTwinConversations matches titles and message content", () => {
  const storage = createFakeStorage();
  const conv = createTwinConversation({ twinId: "twin-a", title: "Product launch" }, storage);
  appendTwinMessage("twin-a", conv.id, { content: "let's talk spring palette" }, storage);
  assert.equal(searchTwinConversations("product", storage).length, 1);
  assert.equal(searchTwinConversations("palette", storage).length, 1);
  assert.equal(searchTwinConversations("nope", storage).length, 0);
  assert.equal(searchTwinConversations("", storage).length, 0);
});

test("store tolerates corrupt localStorage", () => {
  const storage = createFakeStorage({ mavensync_twin_conversations: "not-json" });
  assert.deepEqual(listAllConversations(storage), []);
  assert.equal(TWIN_CONVERSATIONS_STORAGE_KEY, "mavensync_twin_conversations");
});
