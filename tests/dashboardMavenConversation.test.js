import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  clearStoredDashboardSessionId,
  createDesignAgentConversationClient,
  MAVEN_DASHBOARD_SESSION_STORAGE_KEY,
  readStoredDashboardSessionId,
  storeDashboardSessionId,
} from "../packages/Open-AI-Design-Agent/packages/design-agent/src/conversationClient.js";

const dashboardSource = readFileSync(
  new URL("../packages/studio/src/components/experience/MavenHomeDashboard.jsx", import.meta.url),
  "utf8",
);
const canvasSource = readFileSync(
  new URL("../packages/Open-AI-Design-Agent/packages/design-agent/src/CreativeCanvas.jsx", import.meta.url),
  "utf8",
);

function streamBody(chunks) {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]));
        index += 1;
      } else {
        controller.close();
      }
    },
  });
}

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function streamResponse(chunks) {
  return new Response(streamBody(chunks), {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

function mockFetch(routes) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    const route = routes[url] || routes.default;
    if (typeof route === "function") return route(url, options, calls);
    throw new Error(`Unexpected fetch: ${url}`);
  };
  return { calls, fetchImpl };
}

function deltaFrame(text) {
  return `data: ${JSON.stringify({ type: "delta", text })}\n\n`;
}

function doneFrame(reply, persistedMessages) {
  return `data: ${JSON.stringify({ type: "done", reply, persistedMessages })}\n\n`;
}

test("send posts to the existing conversation endpoint with the correct body shape", async () => {
  const { fetchImpl, calls } = mockFetch({
    "/api/design-agent/conversation": () => streamResponse([doneFrame("Hello", [])]),
  });
  const client = createDesignAgentConversationClient({ fetchImpl });
  const result = await client.send({ conversationId: "session-1", message: "hi maven" });

  const call = calls[0];
  assert.equal(call.url, "/api/design-agent/conversation");
  assert.equal(call.options.method, "POST");
  assert.equal(call.options.headers.Accept, "text/event-stream");
  assert.deepEqual(JSON.parse(call.options.body), { conversationId: "session-1", message: "hi maven" });
  assert.equal(result.reply, "Hello");
});

test("streaming deltas are delivered incrementally before the done event finalizes", async () => {
  const { fetchImpl } = mockFetch({
    "/api/design-agent/conversation": () => streamResponse([
      deltaFrame("Hel"),
      deltaFrame("lo"),
      doneFrame("Hello Maven", [
        { role: "user", content: "hi" },
        { role: "assistant", content: "Hello Maven" },
      ]),
    ]),
  });
  const client = createDesignAgentConversationClient({ fetchImpl });
  const deltas = [];
  const result = await client.send({
    conversationId: "s1",
    message: "hi",
    onDelta: (text) => deltas.push(text),
  });
  assert.deepEqual(deltas, ["Hel", "lo"]);
  assert.equal(result.reply, "Hello Maven");
  assert.deepEqual(result.persistedMessages, [
    { role: "user", content: "hi" },
    { role: "assistant", content: "Hello Maven" },
  ]);
});

test("split frames and an unterminated final frame are handled via parser flush", async () => {
  const { fetchImpl } = mockFetch({
    "/api/design-agent/conversation": () => streamResponse([
      'data: {"type":"delta","text":"par',
      't one"}\n\ndata: {"type":"delta","text":" part two"}\n\ndata: {"type":"done","reply":"part one part two","persistedMessages":[]}',
    ]),
  });
  const client = createDesignAgentConversationClient({ fetchImpl });
  const deltas = [];
  const result = await client.send({ conversationId: "s2", message: "hi", onDelta: (t) => deltas.push(t) });
  assert.deepEqual(deltas, ["part one", " part two"]);
  assert.equal(result.reply, "part one part two");
});

test("server sanitized messages are the ONLY payload persisted (send itself never PATCHes)", async () => {
  const { fetchImpl, calls } = mockFetch({
    "/api/design-agent/conversation": () => streamResponse([
      doneFrame("reply", [
        { role: "user", content: "hi", timestamp: "2026-01-01T00:00:00.000Z" },
        { role: "assistant", content: "reply", timestamp: "2026-01-01T00:00:00.000Z" },
      ]),
    ]),
    "/api/v1/creative-agent/sessions/s1/messages": () => jsonResponse({ ok: true }),
  });
  const client = createDesignAgentConversationClient({ fetchImpl });
  const result = await client.send({ conversationId: "s1", message: "hi" });

  assert.equal(calls.filter((c) => c.options.method === "PATCH").length, 0, "send must not PATCH");

  await client.persist("s1", result.persistedMessages);
  const patch = calls.find((c) => c.options.method === "PATCH" && c.url.includes("s1/messages"));
  assert.ok(patch, "persist must PATCH the session messages");
  assert.equal(patch.options.method, "PATCH");
  assert.deepEqual(JSON.parse(patch.options.body).messages, result.persistedMessages);
  const persistedText = JSON.stringify(JSON.parse(patch.options.body).messages);
  assert.ok(persistedText.includes('"content":"reply"'), "server message content persisted");
});

test("typed SSE error and non-ok JSON error surface as sanitized thrown errors", async () => {
  const { fetchImpl } = mockFetch({
    "/api/design-agent/conversation": () => streamResponse(['data: {"type":"error","code":"provider_timeout","error":"intelligence temporarily unavailable"}\n\n']),
  });
  const client = createDesignAgentConversationClient({ fetchImpl });
  await assert.rejects(
    () => client.send({ conversationId: "s1", message: "hi" }),
    (error) => error.message === "intelligence temporarily unavailable" && error.code === "provider_timeout",
  );

  const client2 = createDesignAgentConversationClient({
    fetchImpl: async () => jsonResponse({ error: "Controlled conversation is not configured.", code: "creative_intelligence_not_configured" }, 503),
  });
  await assert.rejects(
    () => client2.send({ conversationId: "s1", message: "hi" }),
    (error) => error.message === "Controlled conversation is not configured." && error.code === "creative_intelligence_not_configured" && error.status === 503,
  );
});

test("session lifecycle: create, load history, controlled flag", async () => {
  const { fetchImpl, calls } = mockFetch({
    "/api/v1/creative-agent/sessions": () => jsonResponse({ id: "new-session-9" }, 200),
    "/api/v1/creative-agent/sessions/old-1/messages": () => jsonResponse([{ role: "user", content: "hi" }]),
    "/api/design-agent/config": () => jsonResponse({ controlledExecution: true }),
    default: () => jsonResponse({}, 404),
  });
  const client = createDesignAgentConversationClient({ fetchImpl });

  const id = await client.createSession();
  assert.equal(id, "new-session-9");
  assert.equal(calls[0].url, "/api/v1/creative-agent/sessions");
  assert.equal(calls[0].options.method, "POST");

  const history = await client.loadMessages("old-1");
  assert.deepEqual(history, [{ role: "user", content: "hi" }]);

  assert.equal(await client.fetchControlledExecutionFlag(), true);
});

test("invalid or unowned stored sessions throw a typed session_unavailable error", async () => {
  const client = createDesignAgentConversationClient({
    fetchImpl: async (url) => {
      assert.match(url, /\/sessions\/bad\/messages$/);
      return jsonResponse({ error: "design_session_ownership_unverified" }, 403);
    },
  });
  await assert.rejects(
    () => client.loadMessages("bad"),
    (error) => error.code === "session_unavailable",
  );
});

test("controlled-mode flag is false when the config endpoint is unavailable", async () => {
  const client = createDesignAgentConversationClient({
    fetchImpl: async () => {
      throw new Error("network down");
    },
  });
  assert.equal(await client.fetchControlledExecutionFlag(), false);
  const client2 = createDesignAgentConversationClient({ fetchImpl: async () => jsonResponse({}, 500) });
  assert.equal(await client2.fetchControlledExecutionFlag(), false);
});

test("dashboard session storage helpers roundtrip and clear", () => {
  const storage = new Map();
  const mem = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  };
  assert.equal(readStoredDashboardSessionId(mem), null);
  storeDashboardSessionId(mem, "session-abc");
  assert.equal(storage.get(MAVEN_DASHBOARD_SESSION_STORAGE_KEY), "session-abc");
  assert.equal(readStoredDashboardSessionId(mem), "session-abc");
  storeDashboardSessionId(mem, "  session-abc  ");
  assert.equal(readStoredDashboardSessionId(mem), "session-abc");
  storeDashboardSessionId(mem, "");
  assert.equal(storage.has(MAVEN_DASHBOARD_SESSION_STORAGE_KEY), true, "blank value is a no-op, not a clear");
  assert.equal(storage.get(MAVEN_DASHBOARD_SESSION_STORAGE_KEY), "session-abc");
  clearStoredDashboardSessionId(mem);
  assert.equal(readStoredDashboardSessionId(mem), null);
});

test("Dashboard reuses the existing conversation endpoint and client", () => {
  assert.match(dashboardSource, /import \{[\s\S]*createDesignAgentConversationClient[\s\S]*\} from "design-agent"/);
  assert.match(dashboardSource, /client\.send\(\{/);
  assert.match(dashboardSource, /conversationId: sessionId,\s*\n\s*message: text,/);
});

test("Dashboard streams deltas and finalizes with the done reply", () => {
  assert.match(dashboardSource, /onDelta: \(delta\) => \{/);
  assert.match(dashboardSource, /arr\[assistantIndex\]\.content \|\| ""\) \+ delta/);
  assert.match(dashboardSource, /content: result\.reply \|\| arr\[assistantIndex\]\.content/);
});

test("Dashboard persists ONLY the server-provided persistedMessages", () => {
  assert.match(dashboardSource, /client\.persist\(sessionId, result\.persistedMessages\)/);
  assert.doesNotMatch(dashboardSource, /persist\([^)]*mavenMessages[^)]*\)/);
});

test("Dashboard restores its stored session after refresh/return", () => {
  assert.match(dashboardSource, /readStoredDashboardSessionId\(window\.localStorage\)/);
  assert.match(dashboardSource, /const history = await client\.loadMessages\(stored\);/);
  assert.match(dashboardSource, /setMavenMessages\(history\);/);
});

test("Dashboard recovers safely when the stored session is invalid/unowned", () => {
  assert.match(dashboardSource, /clearStoredDashboardSessionId\(window\.localStorage\)/);
  assert.match(dashboardSource, /const controlled = await client\.fetchControlledExecutionFlag\(\);/);
  assert.match(dashboardSource, /setMavenReady\(controlled\);/);
});

test("Dashboard degrades gracefully when controlled conversation is unavailable", () => {
  assert.match(dashboardSource, /Maven chat is unavailable/);
  assert.match(dashboardSource, /disabled=\{!mavenReady \|\| mavenBusy\}/);
  assert.match(dashboardSource, /disabled=\{!mavenReady \|\| mavenBusy \|\| !mavenMessage\.trim\(\)\}/);
});

test("CreativeCanvas delegates wire behavior to the shared conversation client", () => {
  assert.match(canvasSource, /import \{ createDesignAgentConversationClient \} from "\.\/conversationClient\.js"/);
  assert.match(canvasSource, /const conversationClient = createDesignAgentConversationClient/);
  assert.match(canvasSource, /conversationClient\.send\(\{/);
  assert.match(canvasSource, /conversationClient\.loadMessages\(sessionId, getHeaders\(\)\)/);
  assert.match(canvasSource, /conversationClient\.createSession\(getHeaders\(\)\)/);
  assert.match(canvasSource, /conversationClient\.persist\(activeSessionId, safeMessages, getHeaders\(\)\)/);
  assert.doesNotMatch(canvasSource, /createSseFrameParser\(\)/);
  assert.doesNotMatch(canvasSource, /fetch\('\/api\/design-agent\/conversation'/);
  // The native (non-controlled) MuAPI path legitimately keeps its own
  // persistence; only the controlled path must route through the client.
  assert.match(canvasSource, /conversationClient\.persist\(activeSessionId, safeMessages, getHeaders\(\)\)/);
});
