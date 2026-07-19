// AI Manager — legacy façade over the AI Hub gateway (issue #589, Phase 3).
//
// Since Phase 3 wave 0, this module no longer talks to provider SDKs: every
// call is delegated to server/ai/gateway (usage logging, cost tracking,
// circuit breaker) while preserving the EXACT legacy surface and semantics —
// same model forcing, same per-provider defaults, same throw-on-failure.
//
// Callers migrate off this file wave-by-wave by calling aiGateway directly
// with their real feature key; until then their traffic is attributed to the
// "legacy-ai-manager" feature (or config.feature when provided).

import pLimit from 'p-limit';
import { aiGateway } from './ai/gateway';

// AI Provider Types
export type AIProvider = 'openai' | 'anthropic' | 'gemini';

export interface AIModelConfig {
  provider: AIProvider;
  model: string;
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean; // Only use JSON response format when explicitly enabled
  /** AI Hub tracking key — set it when the caller knows its feature. */
  feature?: string;
}

export interface AIResponse {
  provider: AIProvider;
  model: string;
  content: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  error?: string;
  // true إذا قطع النموذج إجابته لبلوغ حد التوكنات (finish_reason=length /
  // stop_reason=max_tokens / MAX_TOKENS). المستهلكون الذين لا يحتملون المخرجات
  // المبتورة (المحرر التحريري، محوّل الرادار) يعاملونها كفشل ويسقطون للبديل.
  truncated?: boolean;
}

class AIManager {
  private limiter = pLimit(3); // Max 3 concurrent requests (legacy behavior)

  // Returns true when the provider has an API key configured. Used by callers
  // (e.g. Prompt Studio) to fall back to an available provider instead of
  // letting the SDK throw a cryptic "Could not resolve authentication" error.
  isProviderConfigured(provider: AIProvider): boolean {
    switch (provider) {
      case 'openai':
        return Boolean(process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY);
      case 'anthropic':
        return Boolean(process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY);
      case 'gemini':
        return Boolean(
          process.env.AI_INTEGRATIONS_GEMINI_API_KEY ||
            process.env.GEMINI_API_KEY ||
            process.env.GOOGLE_API_KEY,
        );
      default:
        return false;
    }
  }

  // Generate text with a single model. Throws on failure (callers rely on
  // this — see the radar pipeline). Retries + 90s timeout live in the gateway.
  async generate(
    prompt: string,
    config: AIModelConfig
  ): Promise<AIResponse> {
    // Legacy OpenAI model forcing: keep gpt-5.1 as the default for unspecified /
    // migrated aliases, but honor explicit cheap models (gpt-4o-mini / gpt-4o /
    // o3-mini). Without this escape hatch every "mini" caller was billed as 5.1.
    const OPENAI_HONOR_AS_IS = new Set(['o3-mini', 'gpt-4o-mini', 'gpt-4o']);
    const modelId =
      config.provider === 'openai'
        ? (OPENAI_HONOR_AS_IS.has(config.model) ? config.model : 'gpt-5.1')
        : config.model;

    // Legacy per-provider defaults: Anthropic/Gemini used 500 tokens / 0.7
    // temperature when unspecified; OpenAI passed nothing through.
    const maxTokens =
      config.maxTokens ?? (config.provider === 'openai' ? undefined : 500);
    const temperature =
      config.temperature ?? (config.provider === 'openai' ? undefined : 0.7);

    try {
      const res = await aiGateway.complete({
        feature: config.feature ?? 'legacy-ai-manager',
        prompt,
        // Explicit model override: callers picked their model — honor it
        // verbatim (no DB rerouting) until they migrate to feature routing.
        model: { provider: config.provider, modelId },
        options: {
          ...(maxTokens !== undefined ? { maxTokens } : {}),
          ...(temperature !== undefined ? { temperature } : {}),
          ...(config.jsonMode === true ? { jsonMode: true } : {}),
        },
      });

      return {
        provider: config.provider,
        model: config.model,
        content: res.content,
        usage: res.usage,
        truncated: res.truncated,
      };
    } catch (error: any) {
      throw new Error(`${config.provider}/${config.model}: ${error.message}`);
    }
  }

  // Generate with multiple models in parallel
  async generateMultiple(
    prompt: string,
    configs: AIModelConfig[]
  ): Promise<AIResponse[]> {
    const tasks = configs.map((config) =>
      this.limiter(() => this.generate(prompt, config))
    );

    // Wait for all, but don't fail if one fails
    const results = await Promise.allSettled(tasks);

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          provider: configs[index].provider,
          model: configs[index].model,
          content: '',
          error: result.reason?.message || 'Unknown error',
        };
      }
    });
  }
}

// Export singleton instance
export const aiManager = new AIManager();

// Predefined model configurations
export const AI_MODELS = {
  // OpenAI - Unified GPT-5.1 model for all completions
  GPT_5_1: { provider: 'openai' as const, model: 'gpt-5.1' },
  GPT5: { provider: 'openai' as const, model: 'gpt-5.1' }, // Legacy alias
  GPT_4O_MINI: { provider: 'openai' as const, model: 'gpt-4o-mini' },
  O3_MINI: { provider: 'openai' as const, model: 'o3-mini' },
  GPT4: { provider: 'openai' as const, model: 'gpt-5.1' }, // Migrated to gpt-5.1

  // Anthropic
  CLAUDE_OPUS: { provider: 'anthropic' as const, model: 'claude-opus-4-1' },
  CLAUDE_SONNET: { provider: 'anthropic' as const, model: 'claude-sonnet-4-6' },
  CLAUDE_HAIKU: { provider: 'anthropic' as const, model: 'claude-haiku-4-5' },

  // Gemini 3 - Latest November 2025
  GEMINI_3_PRO: { provider: 'gemini' as const, model: 'gemini-3-pro-preview' },
  GEMINI_3: { provider: 'gemini' as const, model: 'gemini-3-pro-preview' }, // Alias
  // Legacy Gemini models
  GEMINI_PRO: { provider: 'gemini' as const, model: 'gemini-3-pro-preview' }, // Updated to Gemini 3
  GEMINI_FLASH: { provider: 'gemini' as const, model: 'gemini-2.5-flash' },
};
