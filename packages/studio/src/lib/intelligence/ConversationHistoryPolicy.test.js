import assert from "node:assert/strict";
import test from "node:test";
import { projectConversation } from "./ConversationHistoryPolicy.js";

const user = (content, extra = {}) => ({ role: "user", content, ...extra });
const assistant = (content, extra = {}) => ({ role: "assistant", content, ...extra });

test("empty history returns the current request", () => {
  const result = projectConversation({ currentRequest: user("now") });

  assert.deepEqual(result.messages, [user("now")]);
  assert.equal(result.metadata.messagesIncluded, 0);
  assert.equal(result.metadata.truncated, false);
});

test("current request is always preserved", () => {
  const result = projectConversation({
    messages: [user("old"), assistant("old reply")],
    currentRequest: user("current"),
    maxInputCharacters: 10,
  });

  assert.equal(result.messages.at(-1).content, "current");
  assert.equal(result.metadata.messagesDropped, 2);
});

test("newest complete turns are retained first and oldest turns are removed first", () => {
  const messages = [user("one"), assistant("reply one"), user("two"), assistant("reply two")];
  const result = projectConversation({
    messages,
    currentRequest: user("current"),
    maxInputCharacters: 120,
  });

  assert.deepEqual(result.messages, [user("two"), assistant("reply two"), user("current")]);
  assert.equal(result.metadata.messagesDropped, 2);
});

test("long messages consume more budget than short messages", () => {
  const short = projectConversation({
    messages: [user("a"), assistant("b")],
    currentRequest: user("now"),
    maxInputCharacters: 110,
  });
  const long = projectConversation({
    messages: [user("a".repeat(30)), assistant("b".repeat(30))],
    currentRequest: user("now"),
    maxInputCharacters: 110,
  });

  assert.equal(short.metadata.messagesIncluded, 2);
  assert.equal(long.metadata.messagesIncluded, 0);
});

test("complete user and assistant turns are preserved together", () => {
  const result = projectConversation({
    messages: [user("question"), assistant("answer")],
    currentRequest: user("next"),
    maxInputCharacters: 120,
  });

  assert.deepEqual(result.messages, [user("question"), assistant("answer"), user("next")]);
});

test("historical attachments, images, and references are excluded", () => {
  const result = projectConversation({
    messages: [user("old", { attachments: ["file"], images: ["image"], references: ["ref"] }), assistant("reply")],
    currentRequest: user("current"),
    maxInputCharacters: 1000,
  });

  assert.deepEqual(result.messages[0], user("old"));
  assert.equal("attachments" in result.messages[0], false);
  assert.equal("images" in result.messages[0], false);
  assert.equal("references" in result.messages[0], false);
});

test("current-request attachments and references are preserved", () => {
  const current = user("current", {
    attachments: [{ id: "file-1" }],
    images: [{ url: "image-1" }],
    references: [{ id: "ref-1" }],
  });
  const result = projectConversation({ currentRequest: current });

  assert.deepEqual(result.messages.at(-1), current);
});

test("system messages are excluded from raw conversation history", () => {
  const result = projectConversation({
    messages: [
      { role: "system", content: "specialist instructions" },
      user("question"),
      assistant("answer"),
    ],
    currentRequest: user("current"),
    maxInputCharacters: 1000,
  });

  assert.deepEqual(result.messages, [user("question"), assistant("answer"), user("current")]);
});

test("input messages and current request are not mutated", () => {
  const messages = [user("old", { images: [{ id: "image-1" }] }), assistant("reply")];
  const current = user("current", { references: [{ id: "ref-1" }] });
  const originalMessages = structuredClone(messages);
  const originalCurrent = structuredClone(current);

  projectConversation({ messages, currentRequest: current, maxInputCharacters: 100 });

  assert.deepEqual(messages, originalMessages);
  assert.deepEqual(current, originalCurrent);
});

test("metadata reports character and estimated token counts", () => {
  const result = projectConversation({
    messages: [user("old"), assistant("reply")],
    currentRequest: user("now"),
    requiredContextCharacters: 5,
    maxInputCharacters: 120,
  });

  assert.equal(result.metadata.estimatedCharacters, 5 + JSON.stringify(user("old")).length + JSON.stringify(assistant("reply")).length + JSON.stringify(user("now")).length);
  assert.equal(result.metadata.estimatedTokens, Math.ceil(result.metadata.estimatedCharacters / 4));
});

test("reserved output capacity reduces available history", () => {
  const result = projectConversation({
    messages: [user("old"), assistant("reply")],
    currentRequest: user("now"),
    maxInputCharacters: 100,
    reservedOutputCharacters: 90,
  });

  assert.equal(result.metadata.reservedOutputCharacters, 90);
  assert.equal(result.metadata.messagesIncluded, 0);
});

test("required context reduces available history capacity", () => {
  const result = projectConversation({
    messages: [user("old"), assistant("reply")],
    currentRequest: user("now"),
    maxInputCharacters: 100,
    requiredContextCharacters: 90,
  });

  assert.equal(result.metadata.requiredContextCharacters, 90);
  assert.equal(result.metadata.messagesIncluded, 0);
});

test("required material over budget is deterministic and preserved", () => {
  const current = user("current");
  const result = projectConversation({
    messages: [user("old"), assistant("reply")],
    currentRequest: current,
    maxInputCharacters: 5,
    reservedOutputCharacters: 2,
    requiredContextCharacters: 10,
  });

  assert.deepEqual(result.messages, [current]);
  assert.equal(result.metadata.overBudget, true);
  assert.equal(result.metadata.availableHistoryCharacters, 0);
  assert.equal(result.metadata.truncated, true);
});
