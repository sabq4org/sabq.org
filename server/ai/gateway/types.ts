// Sabq AI Hub — shared types for the central AI gateway.
// Pure module: no SDK or DB imports (unit tests import from here freely).

export type AIHubProvider = "openai" | "anthropic" | "gemini" | "elevenlabs";

export type AIOperation = "complete" | "embed" | "image" | "tts";

export type AIErrorCode =
  | "QUOTA_EXCEEDED"
  | "AUTH_ERROR"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "CONTENT_FILTER"
  | "MODEL_ERROR"
  | "FEATURE_DISABLED"
  | "NO_MODEL_AVAILABLE"
  | "NOT_SUPPORTED";

export interface ModelRef {
  provider: AIHubProvider;
  modelId: string;
}

export class AIGatewayError extends Error {
  readonly code: AIErrorCode;
  readonly provider?: AIHubProvider;
  readonly modelId?: string;
  readonly retryable: boolean;
  readonly attempts?: AttemptRecord[];

  constructor(
    message: string,
    opts: {
      code: AIErrorCode;
      provider?: AIHubProvider;
      modelId?: string;
      retryable?: boolean;
      attempts?: AttemptRecord[];
      cause?: unknown;
    },
  ) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = "AIGatewayError";
    this.code = opts.code;
    this.provider = opts.provider;
    this.modelId = opts.modelId;
    this.retryable = opts.retryable ?? false;
    this.attempts = opts.attempts;
  }
}

export interface AttemptRecord {
  provider: AIHubProvider;
  modelId: string;
  ok: boolean;
  errorCode?: AIErrorCode | "CIRCUIT_OPEN" | "NOT_CONFIGURED";
  latencyMs?: number;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// ── Gateway request/result shapes ──

interface BaseRequest {
  /** Tracking key — every AI call MUST identify its feature (e.g. "seo-generator"). */
  feature: string;
  userId?: string;
  /** Explicit model override (dashboard "test" button, migration escape hatch). */
  model?: ModelRef;
  timeoutMs?: number;
}

export interface CompleteRequest extends BaseRequest {
  prompt?: string;
  messages?: ChatMessage[];
  options?: {
    maxTokens?: number;
    temperature?: number;
    jsonMode?: boolean;
  };
}

export interface CompleteResult {
  content: string;
  provider: AIHubProvider;
  modelId: string;
  usage: { inputTokens: number; outputTokens: number };
  latencyMs: number;
  estimatedCostUsd: number;
  truncated: boolean;
  fallbackUsed: boolean;
  attempts: AttemptRecord[];
}

export interface EmbedRequest extends BaseRequest {
  input: string | string[];
  dimensions?: number;
}

export interface EmbedResult {
  embeddings: number[][];
  provider: AIHubProvider;
  modelId: string;
  usage: { inputTokens: number; outputTokens: number };
  latencyMs: number;
  estimatedCostUsd: number;
}

export interface ImageRequest extends BaseRequest {
  prompt: string;
  options?: {
    size?: string;
    quality?: string;
    n?: number;
  };
}

export interface ImageResult {
  images: Array<{ b64?: string; url?: string }>;
  provider: AIHubProvider;
  modelId: string;
  latencyMs: number;
  estimatedCostUsd: number;
}

export interface TTSRequest extends BaseRequest {
  text: string;
  voice?: string;
  format?: string;
}

export interface TTSResult {
  audio: Buffer;
  contentType: string;
  charCount: number;
  provider: AIHubProvider;
  modelId: string;
  latencyMs: number;
  estimatedCostUsd: number;
}

// ── Provider adapter contract ──
// One adapter per provider; adding a provider = one new adapter file.
// Methods are optional — an adapter implements only what its provider supports.

export interface AdapterCompleteParams {
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
  timeoutMs: number;
}

export interface AdapterCompleteResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
  truncated: boolean;
}

export interface AdapterEmbedParams {
  input: string[];
  dimensions?: number;
  timeoutMs: number;
}

export interface AdapterEmbedResult {
  embeddings: number[][];
  inputTokens: number;
}

export interface AdapterImageParams {
  prompt: string;
  size?: string;
  quality?: string;
  n?: number;
  timeoutMs: number;
}

export interface AdapterImageResult {
  images: Array<{ b64?: string; url?: string }>;
}

export interface AdapterTTSParams {
  text: string;
  voice?: string;
  format?: string;
  timeoutMs: number;
}

export interface AdapterTTSResult {
  audio: Buffer;
  contentType: string;
  charCount: number;
}

export interface ProviderAdapter {
  readonly provider: AIHubProvider;
  isConfigured(): boolean;
  complete?(modelId: string, params: AdapterCompleteParams): Promise<AdapterCompleteResult>;
  embed?(modelId: string, params: AdapterEmbedParams): Promise<AdapterEmbedResult>;
  image?(modelId: string, params: AdapterImageParams): Promise<AdapterImageResult>;
  tts?(modelId: string, params: AdapterTTSParams): Promise<AdapterTTSResult>;
}

// ── Resolved config shapes (what configStore hands the gateway) ──

export type AiPricingUnit = "tokens" | "chars" | "image";

export interface ResolvedModel extends ModelRef {
  displayName: string;
  capabilities: AIOperation[];
  pricingUnit: AiPricingUnit;
  costPer1MInput: number;
  costPer1MOutput: number;
  costPerUnit: number;
  isActive: boolean;
}

export interface ResolvedFeatureConfig {
  featureKey: string;
  displayName: string;
  category: string;
  primary: ModelRef | null;
  fallbackChain: ModelRef[];
  maxTokens?: number | null;
  temperature?: number | null;
  isEnabled: boolean;
  allowFailover: boolean;
  /** "db" when loaded from ai_feature_configs, "defaults" when the DB row is missing/unreachable. */
  source: "db" | "defaults";
}
