// Anthropic adapter: text completion only.

import Anthropic from "@anthropic-ai/sdk";
import type { AdapterCompleteParams, AdapterCompleteResult, ProviderAdapter } from "../types";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({
      apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
    });
  }
  return client;
}

// Anthropic requires max_tokens; features that care seed their own value.
const DEFAULT_MAX_TOKENS = 4096;

export const anthropicAdapter: ProviderAdapter = {
  provider: "anthropic",

  isConfigured(): boolean {
    return Boolean(process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY);
  },

  async complete(modelId: string, params: AdapterCompleteParams): Promise<AdapterCompleteResult> {
    // Anthropic takes system prompts as a top-level param, not a message role.
    const systemParts = params.messages.filter((m) => m.role === "system").map((m) => m.content);
    const chat = params.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    const response = await getClient().messages.create(
      {
        model: modelId,
        max_tokens: params.maxTokens ?? DEFAULT_MAX_TOKENS,
        ...(params.temperature !== undefined ? { temperature: params.temperature } : {}),
        ...(systemParts.length ? { system: systemParts.join("\n\n") } : {}),
        messages: chat.length ? chat : [{ role: "user", content: "" }],
      },
      { timeout: params.timeoutMs, signal: params.signal, maxRetries: 0 },
    );

    const content = response.content[0];
    return {
      content: content?.type === "text" ? content.text : "",
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      truncated: response.stop_reason === "max_tokens",
    };
  },
};
