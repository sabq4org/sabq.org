// Google Gemini adapter: text completion (image generation lands with the
// nano-banana migration in Phase 3, using the SDK that route already uses).

import { GoogleGenerativeAI } from "@google/generative-ai";
import type { AdapterCompleteParams, AdapterCompleteResult, ProviderAdapter } from "../types";

let client: GoogleGenerativeAI | null = null;

function resolveApiKey(): string | undefined {
  return (
    process.env.AI_INTEGRATIONS_GEMINI_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY
  );
}

function getClient(): GoogleGenerativeAI {
  if (!client) {
    client = new GoogleGenerativeAI(resolveApiKey()!);
  }
  return client;
}

export const geminiAdapter: ProviderAdapter = {
  provider: "gemini",

  isConfigured(): boolean {
    return Boolean(resolveApiKey());
  },

  async complete(modelId: string, params: AdapterCompleteParams): Promise<AdapterCompleteResult> {
    const systemParts = params.messages.filter((m) => m.role === "system").map((m) => m.content);
    const contents = params.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? ("model" as const) : ("user" as const),
        parts: [{ text: m.content }],
      }));

    const model = getClient().getGenerativeModel({
      model: modelId,
      ...(systemParts.length ? { systemInstruction: systemParts.join("\n\n") } : {}),
      generationConfig: {
        ...(params.temperature !== undefined ? { temperature: params.temperature } : {}),
        ...(params.maxTokens ? { maxOutputTokens: params.maxTokens } : {}),
        ...(params.jsonMode ? { responseMimeType: "application/json" } : {}),
      },
    });

    const result = await model.generateContent({ contents }, { timeout: params.timeoutMs, signal: params.signal });
    const response = result.response;

    return {
      content: response.text() || "",
      inputTokens: response.usageMetadata?.promptTokenCount || 0,
      outputTokens: response.usageMetadata?.candidatesTokenCount || 0,
      truncated: response.candidates?.[0]?.finishReason === "MAX_TOKENS",
    };
  },
};
