import { StructuredTextIntelligencePort } from "./CreativeIntentExtractionService.js";

export class ProviderStructuredTextIntelligence extends StructuredTextIntelligencePort {
  constructor({ provider } = {}) {
    super();
    if (!provider || typeof provider.execute !== "function") throw new Error("structured_text_provider_required");
    this.provider = provider;
  }

  async extract({ modelRequest, signal } = {}) {
    const response = await this.provider.execute({
      operation: "text_generation",
      context: { modelRequest },
      signal,
    });
    const output = response?.outputs?.[0];
    if (output && typeof output === "object" && !Array.isArray(output)) return output;
    if (typeof output !== "string") throw new Error("structured_text_output_required");
    try {
      const parsed = JSON.parse(output);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("structured_text_object_required");
      return parsed;
    } catch (error) {
      const wrapped = new Error("structured_text_output_invalid_json");
      wrapped.cause = error;
      throw wrapped;
    }
  }
}
