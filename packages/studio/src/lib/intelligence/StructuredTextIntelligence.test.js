import assert from "node:assert/strict";
import test from "node:test";
import { ProviderStructuredTextIntelligence } from "./StructuredTextIntelligence.js";

test("provider structured text adapter parses exact JSON output", async () => {
  let request;
  const adapter = new ProviderStructuredTextIntelligence({
    provider: {
      async execute(input) {
        request = input;
        return { outputs: ['{"status":"resolved"}'] };
      },
    },
  });
  const modelRequest = { generation: { output: { structuredOutput: { name: "test", schema: {} } } } };
  const result = await adapter.extract({ modelRequest });
  assert.deepEqual(result, { status: "resolved" });
  assert.equal(request.operation, "text_generation");
  assert.equal(request.context.modelRequest, modelRequest);
});
test("provider structured text adapter rejects prose and fenced JSON", async () => {
  for (const value of ["Here is the result", '```json\n{"status":"resolved"}\n```']) {
    const adapter = new ProviderStructuredTextIntelligence({
      provider: { execute: async () => ({ outputs: [value] }) },
    });
    await assert.rejects(() => adapter.extract({ modelRequest: {} }), /structured_text_output_invalid_json/);
  }
});
