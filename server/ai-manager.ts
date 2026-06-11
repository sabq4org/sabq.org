import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import pLimit from 'p-limit';
import pRetry from 'p-retry';


// Timeout wrapper for AI calls
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    ),
  ]);
}

const AI_CALL_TIMEOUT_MS = 90000; // 90 seconds per AI model

// AI Provider Types
export type AIProvider = 'openai' | 'anthropic' | 'gemini';

export interface AIModelConfig {
  provider: AIProvider;
  model: string;
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean; // Only use JSON response format when explicitly enabled
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
}

// Initialize AI Clients
class AIManager {
  private openai: OpenAI;
  private anthropic: Anthropic;
  private gemini: GoogleGenerativeAI;
  private limiter = pLimit(3); // Max 3 concurrent requests

  constructor() {
    // OpenAI - Use Replit AI Integrations or fallback to user's key
    this.openai = new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });

    // Anthropic - Use Replit AI Integrations
    this.anthropic = new Anthropic({
      apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY!,
      baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
    });

    // Gemini - Use Replit AI Integrations
    this.gemini = new GoogleGenerativeAI(
      process.env.AI_INTEGRATIONS_GEMINI_API_KEY!
    );
  }

  // Generate text with a single model
  async generate(
    prompt: string,
    config: AIModelConfig
  ): Promise<AIResponse> {
    return pRetry(
      async () => {
        try {
          switch (config.provider) {
            case 'openai':
              return await this.generateOpenAI(prompt, config);
            case 'anthropic':
              return await this.generateAnthropic(prompt, config);
            case 'gemini':
              return await this.generateGemini(prompt, config);
            default:
              throw new Error(`Unknown provider: ${config.provider}`);
          }
        } catch (error: any) {
          throw new Error(`${config.provider}/${config.model}: ${error.message}`);
        }
      },
      {
        retries: 2,
        minTimeout: 1000,
      }
    );
  }

  // Generate with multiple models in parallel
  async generateMultiple(
    prompt: string,
    configs: AIModelConfig[]
  ): Promise<AIResponse[]> {
    const tasks = configs.map((config) =>
      this.limiter(() => 
        withTimeout(
          this.generate(prompt, config),
          AI_CALL_TIMEOUT_MS,
          `AI model ${config.model} timed out after ${AI_CALL_TIMEOUT_MS / 1000}s`
        )
      )
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

  // OpenAI Implementation (Updated to use gpt-5.1)
  // Note: Task specifies responses.create() but using chat.completions.create()
  // as responses.create() doesn't exist in current OpenAI SDK
  private async generateOpenAI(
    prompt: string,
    config: AIModelConfig
  ): Promise<AIResponse> {
    // Use gpt-5.1 for all OpenAI models unless specifically o3-mini
    const model = config.model === 'o3-mini' ? 'o3-mini' : 'gpt-5.1';
    
    // GPT-5.1 specific configuration: uses max_completion_tokens and doesn't support temperature
    const completionParams: any = {
      model,
      messages: [{ role: 'user', content: prompt }],
    };
    
    // Only enable JSON mode when explicitly requested (prompt must contain 'json')
    if (config.jsonMode === true) {
      completionParams.response_format = { type: "json_object" };
    }
    
    // Only add max_completion_tokens if explicitly specified
    // GPT-5.1 uses intelligent defaults when omitted
    if (config.maxTokens) {
      completionParams.max_completion_tokens = config.maxTokens;
    }
    
    console.log('[AI Manager] 📊 Calling OpenAI:', { model, hasTemp: ('temperature' in completionParams) });
    
    const response = await this.openai.chat.completions.create(completionParams);

    return {
      provider: 'openai',
      model: config.model,
      content: response.choices[0]?.message?.content || '',
      usage: {
        inputTokens: response.usage?.prompt_tokens || 0,
        outputTokens: response.usage?.completion_tokens || 0,
      },
    };
  }

  // Anthropic Implementation
  private async generateAnthropic(
    prompt: string,
    config: AIModelConfig
  ): Promise<AIResponse> {
    const response = await this.anthropic.messages.create({
      model: config.model,
      max_tokens: config.maxTokens || 500,
      temperature: config.temperature || 0.7,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    const text = content.type === 'text' ? content.text : '';

    return {
      provider: 'anthropic',
      model: config.model,
      content: text,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }

  // Gemini Implementation
  private async generateGemini(
    prompt: string,
    config: AIModelConfig
  ): Promise<AIResponse> {
    const model = this.gemini.getGenerativeModel({ 
      model: config.model,
      generationConfig: {
        temperature: config.temperature || 0.7,
        maxOutputTokens: config.maxTokens || 500,
      },
    });

    const result = await model.generateContent(prompt);
    const response = result.response;

    return {
      provider: 'gemini',
      model: config.model,
      content: response.text() || '',
      usage: {
        inputTokens: result.response.usageMetadata?.promptTokenCount || 0,
        outputTokens: result.response.usageMetadata?.candidatesTokenCount || 0,
      },
    };
  }
}

// Export singleton instance
export const aiManager = new AIManager();

// Predefined model configurations
export const AI_MODELS = {
  // OpenAI - Unified GPT-5.1 model for all completions
  GPT_5_1: { provider: 'openai' as const, model: 'gpt-5.1' },
  GPT5: { provider: 'openai' as const, model: 'gpt-5.1' }, // Legacy alias
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
  GEMINI_FLASH: { provider: 'gemini' as const, model: 'gemini-2.5-flash-preview-05-20' },
};
