// Built-in defaults: the model catalog (with launch pricing, editable from
// the dashboard) and the feature catalog seeded into ai_feature_configs.
// Single source of truth shared by scripts/seed-ai-hub.ts and configStore's
// safe fallback — if the DB is unreachable the gateway still works from here,
// so a broken hub can never take content generation down with it.
//
// Feature→model assignments mirror what each consumer file uses TODAY (zero
// behavior change at rollout). They get trued-up file-by-file during the
// Phase-3 migration; the seed is idempotent (insert-if-missing) so re-running
// it after corrections never overwrites dashboard edits.

import type { ModelRef, ResolvedFeatureConfig, ResolvedModel } from "./types";

export interface DefaultModel extends Omit<ResolvedModel, "isActive"> {
  priority: number;
}

export const DEFAULT_MODELS: DefaultModel[] = [
  // ── OpenAI ──
  { provider: "openai", modelId: "gpt-5.1", displayName: "GPT-5.1", capabilities: ["complete"], pricingUnit: "tokens", costPer1MInput: 1.25, costPer1MOutput: 10, costPerUnit: 0, priority: 10 },
  { provider: "openai", modelId: "o3-mini", displayName: "o3-mini", capabilities: ["complete"], pricingUnit: "tokens", costPer1MInput: 1.1, costPer1MOutput: 4.4, costPerUnit: 0, priority: 30 },
  { provider: "openai", modelId: "gpt-4o", displayName: "GPT-4o", capabilities: ["complete"], pricingUnit: "tokens", costPer1MInput: 2.5, costPer1MOutput: 10, costPerUnit: 0, priority: 40 },
  { provider: "openai", modelId: "gpt-4o-mini", displayName: "GPT-4o mini", capabilities: ["complete"], pricingUnit: "tokens", costPer1MInput: 0.15, costPer1MOutput: 0.6, costPerUnit: 0, priority: 20 },
  { provider: "openai", modelId: "text-embedding-3-large", displayName: "Embedding 3 Large", capabilities: ["embed"], pricingUnit: "tokens", costPer1MInput: 0.13, costPer1MOutput: 0, costPerUnit: 0, priority: 10 },
  { provider: "openai", modelId: "text-embedding-3-small", displayName: "Embedding 3 Small", capabilities: ["embed"], pricingUnit: "tokens", costPer1MInput: 0.02, costPer1MOutput: 0, costPerUnit: 0, priority: 20 },
  { provider: "openai", modelId: "gpt-image-1", displayName: "GPT Image 1", capabilities: ["image"], pricingUnit: "image", costPer1MInput: 0, costPer1MOutput: 0, costPerUnit: 0.04, priority: 10 },
  { provider: "openai", modelId: "dall-e-3", displayName: "DALL·E 3", capabilities: ["image"], pricingUnit: "image", costPer1MInput: 0, costPer1MOutput: 0, costPerUnit: 0.04, priority: 20 },
  { provider: "openai", modelId: "tts-1", displayName: "OpenAI TTS-1", capabilities: ["tts"], pricingUnit: "chars", costPer1MInput: 15, costPer1MOutput: 0, costPerUnit: 0, priority: 10 },
  { provider: "openai", modelId: "gpt-4o-mini-tts", displayName: "GPT-4o mini TTS", capabilities: ["tts"], pricingUnit: "chars", costPer1MInput: 12, costPer1MOutput: 0, costPerUnit: 0, priority: 20 },

  // ── Anthropic ──
  { provider: "anthropic", modelId: "claude-opus-4-1", displayName: "Claude Opus 4.1", capabilities: ["complete"], pricingUnit: "tokens", costPer1MInput: 15, costPer1MOutput: 75, costPerUnit: 0, priority: 30 },
  { provider: "anthropic", modelId: "claude-sonnet-4-6", displayName: "Claude Sonnet 4.6", capabilities: ["complete"], pricingUnit: "tokens", costPer1MInput: 3, costPer1MOutput: 15, costPerUnit: 0, priority: 10 },
  { provider: "anthropic", modelId: "claude-haiku-4-5", displayName: "Claude Haiku 4.5", capabilities: ["complete"], pricingUnit: "tokens", costPer1MInput: 1, costPer1MOutput: 5, costPerUnit: 0, priority: 20 },

  // ── Google Gemini ──
  { provider: "gemini", modelId: "gemini-3-pro-preview", displayName: "Gemini 3 Pro", capabilities: ["complete"], pricingUnit: "tokens", costPer1MInput: 2, costPer1MOutput: 12, costPerUnit: 0, priority: 10 },
  { provider: "gemini", modelId: "gemini-2.5-flash-preview-05-20", displayName: "Gemini 2.5 Flash", capabilities: ["complete"], pricingUnit: "tokens", costPer1MInput: 0.3, costPer1MOutput: 2.5, costPerUnit: 0, priority: 20 },
  { provider: "gemini", modelId: "gemini-2.5-flash-image", displayName: "Gemini Flash Image (نانو بنانا)", capabilities: ["image"], pricingUnit: "image", costPer1MInput: 0, costPer1MOutput: 0, costPerUnit: 0.039, priority: 30 },

  // ── ElevenLabs ──
  { provider: "elevenlabs", modelId: "eleven_multilingual_v2", displayName: "ElevenLabs Multilingual v2", capabilities: ["tts"], pricingUnit: "chars", costPer1MInput: 30, costPer1MOutput: 0, costPerUnit: 0, priority: 30 },
];

// Model shorthands for chains below.
const GPT_5_1: ModelRef = { provider: "openai", modelId: "gpt-5.1" };
const GPT_4O: ModelRef = { provider: "openai", modelId: "gpt-4o" };
const GPT_4O_MINI: ModelRef = { provider: "openai", modelId: "gpt-4o-mini" };
const SONNET: ModelRef = { provider: "anthropic", modelId: "claude-sonnet-4-6" };
const HAIKU: ModelRef = { provider: "anthropic", modelId: "claude-haiku-4-5" };
const GEMINI_PRO: ModelRef = { provider: "gemini", modelId: "gemini-3-pro-preview" };
const GEMINI_FLASH: ModelRef = { provider: "gemini", modelId: "gemini-2.5-flash-preview-05-20" };
const EMBED_LARGE: ModelRef = { provider: "openai", modelId: "text-embedding-3-large" };
const GPT_IMAGE: ModelRef = { provider: "openai", modelId: "gpt-image-1" };
const NANO_BANANA: ModelRef = { provider: "gemini", modelId: "gemini-2.5-flash-image" };
const OPENAI_TTS: ModelRef = { provider: "openai", modelId: "tts-1" };

// Standard failover chains for text features, keyed by the primary's tier.
const CHAIN_AFTER_GPT: ModelRef[] = [SONNET, GEMINI_PRO];
const CHAIN_AFTER_SONNET: ModelRef[] = [GPT_5_1, GEMINI_PRO];
const CHAIN_AFTER_MINI: ModelRef[] = [HAIKU, GEMINI_FLASH];

export interface DefaultFeature {
  featureKey: string;
  displayName: string;
  category: string;
  primary: ModelRef;
  fallbackChain: ModelRef[];
  maxTokens?: number;
  temperature?: number;
  allowFailover?: boolean;
}

export const DEFAULT_FEATURES: DefaultFeature[] = [
  // ── Editorial generation ──
  { featureKey: "content-tools", displayName: "أدوات المحتوى الذكية", category: "editorial", primary: GPT_5_1, fallbackChain: CHAIN_AFTER_GPT },
  { featureKey: "journalist-agent", displayName: "الوكيل الصحفي", category: "editorial", primary: GPT_5_1, fallbackChain: CHAIN_AFTER_GPT },
  { featureKey: "data-story", displayName: "قصص البيانات", category: "editorial", primary: GPT_5_1, fallbackChain: CHAIN_AFTER_GPT },
  { featureKey: "deep-analysis", displayName: "التحليل العميق (عمق)", category: "editorial", primary: GPT_5_1, fallbackChain: CHAIN_AFTER_GPT },
  { featureKey: "muqtarab-ai", displayName: "ذكاء مقترب", category: "editorial", primary: GPT_5_1, fallbackChain: CHAIN_AFTER_GPT },
  { featureKey: "ai-article-generator", displayName: "مولّد المقالات", category: "editorial", primary: GPT_5_1, fallbackChain: CHAIN_AFTER_GPT },
  { featureKey: "world-cup-news", displayName: "أخبار المونديال", category: "editorial", primary: GPT_5_1, fallbackChain: CHAIN_AFTER_GPT },
  { featureKey: "sportmonks-news", displayName: "أخبار SportMonks", category: "editorial", primary: GPT_5_1, fallbackChain: CHAIN_AFTER_GPT },
  { featureKey: "radar", displayName: "رادار سبق الذكي", category: "editorial", primary: GPT_5_1, fallbackChain: CHAIN_AFTER_GPT },
  { featureKey: "ifox-content", displayName: "iFox — توليد المحتوى", category: "editorial", primary: GPT_5_1, fallbackChain: CHAIN_AFTER_GPT },
  { featureKey: "ifox-quality", displayName: "iFox — فحص الجودة", category: "editorial", primary: GPT_5_1, fallbackChain: CHAIN_AFTER_GPT },
  { featureKey: "ifox-strategy", displayName: "iFox — الاستراتيجية", category: "editorial", primary: GPT_5_1, fallbackChain: CHAIN_AFTER_GPT },

  // ── Analysis & classification ──
  { featureKey: "article-classification", displayName: "تصنيف المقالات", category: "analysis", primary: SONNET, fallbackChain: CHAIN_AFTER_SONNET },
  { featureKey: "sentiment-analysis", displayName: "تحليل المشاعر", category: "analysis", primary: GPT_5_1, fallbackChain: CHAIN_AFTER_GPT },
  { featureKey: "content-analyzer", displayName: "محلل الجودة التحريرية", category: "analysis", primary: GPT_5_1, fallbackChain: CHAIN_AFTER_GPT },
  { featureKey: "smart-categories", displayName: "التصنيفات الذكية", category: "analysis", primary: GPT_5_1, fallbackChain: CHAIN_AFTER_GPT },
  { featureKey: "smart-category-classifier", displayName: "مصنّف التصنيفات", category: "analysis", primary: GPT_4O_MINI, fallbackChain: CHAIN_AFTER_MINI },
  { featureKey: "story-matcher", displayName: "مطابقة القصص", category: "analysis", primary: GPT_4O_MINI, fallbackChain: CHAIN_AFTER_MINI },
  { featureKey: "smart-insights", displayName: "الرؤى الذكية", category: "analysis", primary: GPT_5_1, fallbackChain: CHAIN_AFTER_GPT },
  { featureKey: "geo-extraction", displayName: "استخراج المواقع الجغرافية", category: "analysis", primary: GPT_4O_MINI, fallbackChain: CHAIN_AFTER_MINI },
  { featureKey: "smart-links", displayName: "الروابط الذكية", category: "analysis", primary: GPT_4O_MINI, fallbackChain: CHAIN_AFTER_MINI },
  { featureKey: "story-cards", displayName: "بطاقات القصص", category: "analysis", primary: GPT_5_1, fallbackChain: CHAIN_AFTER_GPT },
  { featureKey: "calendar-ai", displayName: "ذكاء التقويم", category: "analysis", primary: GPT_5_1, fallbackChain: CHAIN_AFTER_GPT },
  { featureKey: "media-caption", displayName: "أوصاف الوسائط", category: "analysis", primary: GPT_4O_MINI, fallbackChain: CHAIN_AFTER_MINI },
  { featureKey: "mobile-article-enrichment", displayName: "إثراء مقالات الجوال", category: "analysis", primary: GPT_4O_MINI, fallbackChain: CHAIN_AFTER_MINI },
  { featureKey: "seo-generator", displayName: "مولّد SEO", category: "seo", primary: GPT_5_1, fallbackChain: CHAIN_AFTER_GPT },

  // ── Moderation ──
  { featureKey: "comment-moderation", displayName: "إشراف التعليقات", category: "moderation", primary: GPT_4O_MINI, fallbackChain: CHAIN_AFTER_MINI },

  // ── Agents ──
  { featureKey: "whatsapp-agent", displayName: "وكيل واتساب", category: "agents", primary: GPT_5_1, fallbackChain: CHAIN_AFTER_GPT },
  { featureKey: "email-agent", displayName: "وكيل البريد", category: "agents", primary: GPT_5_1, fallbackChain: CHAIN_AFTER_GPT },
  { featureKey: "prompt-studio", displayName: "استوديو البرومبت", category: "agents", primary: GPT_5_1, fallbackChain: CHAIN_AFTER_GPT },
  { featureKey: "ai-task-executor", displayName: "منفّذ مهام الذكاء", category: "agents", primary: GPT_5_1, fallbackChain: CHAIN_AFTER_GPT },

  // ── Search / embeddings — PINNED: vectors are incompatible across models ──
  { featureKey: "embeddings", displayName: "المتجهات (بحث وتشابه)", category: "search", primary: EMBED_LARGE, fallbackChain: [], allowFailover: false },
  { featureKey: "entity-extraction", displayName: "استخراج الكيانات", category: "search", primary: GPT_4O_MINI, fallbackChain: CHAIN_AFTER_MINI },

  // ── Media generation (same-provider output differs; chains start empty) ──
  { featureKey: "image-generation", displayName: "توليد الصور", category: "media", primary: GPT_IMAGE, fallbackChain: [] },
  { featureKey: "nano-banana-images", displayName: "صور نانو بنانا", category: "media", primary: NANO_BANANA, fallbackChain: [] },
  { featureKey: "smart-thumbnail", displayName: "الصور المصغرة الذكية", category: "media", primary: GPT_4O, fallbackChain: [] },
  { featureKey: "visual-ai", displayName: "الذكاء البصري", category: "media", primary: GPT_4O, fallbackChain: [] },
  { featureKey: "infographic-ai", displayName: "الإنفوجرافيك الذكي", category: "media", primary: GPT_5_1, fallbackChain: CHAIN_AFTER_GPT },

  // ── Audio (voice/provider selection stays in ttsProviderRegistry) ──
  { featureKey: "audio-newsletter", displayName: "النشرات الصوتية", category: "audio", primary: OPENAI_TTS, fallbackChain: [] },

  // ── Phase-3 wave 0: traffic still flowing through the ai-manager façade.
  //    Callers pick their model explicitly, so the chain here is unused —
  //    the row exists for usage attribution in the dashboard. ──
  { featureKey: "legacy-ai-manager", displayName: "استدعاءات ai-manager (قيد الهجرة)", category: "general", primary: GPT_5_1, fallbackChain: [] },
];

const modelIndex = new Map<string, DefaultModel>(
  DEFAULT_MODELS.map((m) => [`${m.provider}:${m.modelId}`, m]),
);

export function getDefaultModel(provider: string, modelId: string): ResolvedModel | undefined {
  const m = modelIndex.get(`${provider}:${modelId}`);
  return m ? { ...m, isActive: true } : undefined;
}

const featureIndex = new Map<string, DefaultFeature>(
  DEFAULT_FEATURES.map((f) => [f.featureKey, f]),
);

/**
 * Fallback feature config for when the DB has no row (or is unreachable).
 * Unknown feature keys get the standard text chain so a forgotten seed row
 * can never brick a feature — it just logs with source="defaults".
 */
export function getDefaultFeatureConfig(featureKey: string): ResolvedFeatureConfig {
  const f = featureIndex.get(featureKey);
  if (f) {
    return {
      featureKey: f.featureKey,
      displayName: f.displayName,
      category: f.category,
      primary: f.primary,
      fallbackChain: f.fallbackChain,
      maxTokens: f.maxTokens ?? null,
      temperature: f.temperature ?? null,
      isEnabled: true,
      allowFailover: f.allowFailover ?? true,
      source: "defaults",
    };
  }
  return {
    featureKey,
    displayName: featureKey,
    category: "general",
    primary: GPT_5_1,
    fallbackChain: CHAIN_AFTER_GPT,
    maxTokens: null,
    temperature: null,
    isEnabled: true,
    allowFailover: true,
    source: "defaults",
  };
}
