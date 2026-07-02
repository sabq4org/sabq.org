// OpenAI adapter: complete + embed + image + tts.
// Env resolution mirrors server/ai-manager.ts (Replit AI Integrations first).

import OpenAI from "openai";
import type {
  AdapterCompleteParams,
  AdapterCompleteResult,
  AdapterEmbedParams,
  AdapterEmbedResult,
  AdapterImageParams,
  AdapterImageResult,
  AdapterTTSParams,
  AdapterTTSResult,
  ProviderAdapter,
} from "../types";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });
  }
  return client;
}

// gpt-5.x / o-series use max_completion_tokens and reject temperature.
function isReasoningStyleModel(modelId: string): boolean {
  return /^(gpt-5|o[13])/.test(modelId);
}

export const openaiAdapter: ProviderAdapter = {
  provider: "openai",

  isConfigured(): boolean {
    return Boolean(process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY);
  },

  async complete(modelId: string, params: AdapterCompleteParams): Promise<AdapterCompleteResult> {
    const body: Record<string, unknown> = {
      model: modelId,
      messages: params.messages,
    };
    if (params.jsonMode) {
      body.response_format = { type: "json_object" };
    }
    if (isReasoningStyleModel(modelId)) {
      if (params.maxTokens) body.max_completion_tokens = params.maxTokens;
    } else {
      if (params.maxTokens) body.max_tokens = params.maxTokens;
      if (params.temperature !== undefined) body.temperature = params.temperature;
    }

    const response = await getClient().chat.completions.create(body as any, {
      timeout: params.timeoutMs,
    });

    return {
      content: response.choices[0]?.message?.content || "",
      inputTokens: response.usage?.prompt_tokens || 0,
      outputTokens: response.usage?.completion_tokens || 0,
      truncated: response.choices[0]?.finish_reason === "length",
    };
  },

  async embed(modelId: string, params: AdapterEmbedParams): Promise<AdapterEmbedResult> {
    const response = await getClient().embeddings.create(
      {
        model: modelId,
        input: params.input,
        ...(params.dimensions ? { dimensions: params.dimensions } : {}),
      },
      { timeout: params.timeoutMs },
    );
    return {
      embeddings: response.data.map((d) => d.embedding),
      inputTokens: response.usage?.prompt_tokens || 0,
    };
  },

  async image(modelId: string, params: AdapterImageParams): Promise<AdapterImageResult> {
    const body: Record<string, unknown> = {
      model: modelId,
      prompt: params.prompt,
      n: params.n ?? 1,
    };
    if (params.size) body.size = params.size;
    if (params.quality) body.quality = params.quality;
    // gpt-image-1 always returns b64 and rejects response_format; dall-e needs it.
    if (!modelId.startsWith("gpt-image")) body.response_format = "b64_json";

    const response = await getClient().images.generate(body as any, {
      timeout: params.timeoutMs,
    });
    return {
      images: (response.data ?? []).map((img) => ({
        b64: img.b64_json ?? undefined,
        url: img.url ?? undefined,
      })),
    };
  },

  async tts(modelId: string, params: AdapterTTSParams): Promise<AdapterTTSResult> {
    const response = await getClient().audio.speech.create(
      {
        model: modelId,
        voice: (params.voice as any) || "alloy",
        input: params.text,
        response_format: (params.format as any) || "mp3",
      },
      { timeout: params.timeoutMs },
    );
    const audio = Buffer.from(await response.arrayBuffer());
    return {
      audio,
      contentType: params.format === "wav" ? "audio/wav" : "audio/mpeg",
      charCount: params.text.length,
    };
  },
};
