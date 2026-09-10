/**
 * مختبر DeepSeek — خدمة تجريبية معزولة
 *
 * تنادي واجهة DeepSeek مباشرة (صيغة OpenAI) بمفتاح DEEPSEEK_API_KEY، بلا مرور
 * عبر بوابة الذكاء ولا تسجيل في ai_usage_logs: الهدف قياس جودة النموذج على
 * برومبت التحرير (الافتراضي أو برومبت يلصقه المحرر) قبل أي قرار ربط.
 *
 * للمقارنة، تستطيع الخدمة تشغيل المادة نفسها عبر «محرر سبق» الحالي
 * (runEditorialTask) بالنموذج المعتمد فيه.
 */

import OpenAI from "openai";
import {
  SABQ_EDITORIAL_CORE_AR,
  SABQ_PRIMARY_EDITOR_MODEL,
} from "../ai/sabqEditorialPrompt";
import { SABQ_CONSTITUTION_AR } from "../ai/prompts/constitution";
import {
  SABQ_TASK_PROMPTS_AR,
  SABQ_TASK_OUTPUT_FORMAT_AR,
  type EditorialTaskType,
} from "../ai/prompts/tasks";
import { runEditorialTask } from "./editorialAiService";

export const DEEPSEEK_BASE_URL = "https://api.deepseek.com";

export const DEEPSEEK_MODELS = ["deepseek-flash", "deepseek-v4-pro"] as const;
export type DeepSeekModel = (typeof DEEPSEEK_MODELS)[number];

/** أسعار الذروة بالدولار لكل مليون توكن (خارج الذروة النصف) — من صفحة التسعير 2026-09 */
const PRICING_USD_PER_M: Record<
  DeepSeekModel,
  { inputHit: number; inputMiss: number; output: number }
> = {
  "deepseek-flash": { inputHit: 0.006, inputMiss: 0.3, output: 1.2 },
  "deepseek-v4-pro": { inputHit: 0.044, inputMiss: 1.32, output: 3.96 },
};

export const EDITORIAL_TASK_TYPES = Object.keys(
  SABQ_TASK_PROMPTS_AR,
) as EditorialTaskType[];

export const EDITORIAL_TASK_LABELS_AR: Record<EditorialTaskType, string> = {
  edit: "حرر",
  develop: "طوّر",
  merge: "ادمج",
  review: "راجع",
  report: "تقرير",
  profile: "بروفايل",
  app_version: "نسخة التطبيق",
  precheck: "فحص ما قبل النشر",
};

export function isDeepSeekConfigured(): boolean {
  return Boolean(process.env.DEEPSEEK_API_KEY?.trim());
}

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) {
    // eslint-disable-next-line no-restricted-syntax -- مختبر معزول عمدًا عن البوابة: لا تسجيل ولا failover حتى يُتخذ قرار الربط
    client = new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: DEEPSEEK_BASE_URL,
    });
  }
  return client;
}

export interface DeepSeekBalance {
  available: boolean;
  totalUsd: number | null;
}

export async function getDeepSeekBalance(): Promise<DeepSeekBalance> {
  const res = await fetch(`${DEEPSEEK_BASE_URL}/user/balance`, {
    headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`DeepSeek balance HTTP ${res.status}`);
  const json = (await res.json()) as {
    is_available?: boolean;
    balance_infos?: { currency: string; total_balance: string }[];
  };
  const usd = json.balance_infos?.find((b) => b.currency === "USD");
  return {
    available: Boolean(json.is_available),
    totalUsd: usd ? Number(usd.total_balance) : null,
  };
}

/**
 * البرومبت الافتراضي = نفس الطبقات الثلاث التي يستخدمها «محرر سبق» + صيغة الإخراج.
 * يُعرض في الصفحة كنقطة انطلاق يعدّلها المحرر أو يستبدله ببرومبته.
 */
export function buildDefaultSystemPrompt(task: EditorialTaskType): string {
  return [
    SABQ_EDITORIAL_CORE_AR,
    SABQ_CONSTITUTION_AR,
    SABQ_TASK_PROMPTS_AR[task],
    SABQ_TASK_OUTPUT_FORMAT_AR,
  ].join("\n\n");
}

export interface DeepSeekLabInput {
  material: string;
  material2?: string;
  instructions?: string;
  /** برومبت النظام؛ إن غاب يُبنى الافتراضي من المهمة */
  systemPrompt?: string;
  task: EditorialTaskType;
  model: DeepSeekModel;
  thinking: boolean;
  /** يطلب JSON من النموذج (مناسب للبرومبت الافتراضي؛ عطّله لبرومبت حر) */
  jsonMode: boolean;
  maxTokens?: number;
  temperature?: number;
}

export interface DeepSeekLabResult {
  content: string;
  /** أول 1500 حرف من التفكير (إن فُعّل) للاطلاع لا للاعتماد */
  reasoningExcerpt: string | null;
  /** المخرج بعد محاولة تحليله كJSON (null إن لم يكن JSON) */
  parsed: Record<string, unknown> | null;
  model: string;
  latencyMs: number;
  usage: {
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
  };
  estimatedCostUsd: number;
  truncated: boolean;
}

function buildUserMessage(input: DeepSeekLabInput): string {
  const parts: string[] = [];
  if (input.instructions?.trim()) {
    parts.push(`## توجيه المحرر\n${input.instructions.trim()}`);
  }
  parts.push(`## المادة\n${input.material.trim()}`);
  if (input.task === "merge" && input.material2?.trim()) {
    parts.push(`=====\n## المادة الثانية\n${input.material2.trim()}`);
  }
  return parts.join("\n\n");
}

function stripCodeFences(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenced ? fenced[1] : trimmed;
}

function tryParseJson(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(stripCodeFences(raw));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function estimateCost(
  model: DeepSeekModel,
  usage: DeepSeekLabResult["usage"],
): number {
  const p = PRICING_USD_PER_M[model];
  const missTokens = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
  return (
    (usage.cachedInputTokens * p.inputHit +
      missTokens * p.inputMiss +
      usage.outputTokens * p.output) /
    1_000_000
  );
}

export async function runDeepSeekLab(
  input: DeepSeekLabInput,
): Promise<DeepSeekLabResult> {
  if (!isDeepSeekConfigured()) {
    throw new Error("DEEPSEEK_API_KEY غير مضبوط في متغيرات البيئة");
  }
  const systemPrompt =
    input.systemPrompt?.trim() || buildDefaultSystemPrompt(input.task);

  const body: Record<string, unknown> = {
    model: input.model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: buildUserMessage(input) },
    ],
    max_tokens: input.maxTokens ?? 12_000,
    thinking: { type: input.thinking ? "enabled" : "disabled" },
  };
  if (input.jsonMode) body.response_format = { type: "json_object" };
  // وضع التفكير يرفض temperature في DeepSeek كما في o-series
  if (!input.thinking && input.temperature !== undefined) {
    body.temperature = input.temperature;
  }

  const started = Date.now();
  const response = await getClient().chat.completions.create(body as any, {
    timeout: 180_000,
    maxRetries: 0,
  });
  const latencyMs = Date.now() - started;

  const choice = response.choices?.[0];
  const message = choice?.message as
    | (OpenAI.Chat.Completions.ChatCompletionMessage & {
        reasoning_content?: string;
      })
    | undefined;
  const content = message?.content ?? "";
  const rawUsage = response.usage as
    | (OpenAI.Completions.CompletionUsage & {
        prompt_cache_hit_tokens?: number;
        completion_tokens_details?: { reasoning_tokens?: number };
      })
    | undefined;

  const usage = {
    inputTokens: rawUsage?.prompt_tokens ?? 0,
    cachedInputTokens:
      rawUsage?.prompt_cache_hit_tokens ??
      rawUsage?.prompt_tokens_details?.cached_tokens ??
      0,
    outputTokens: rawUsage?.completion_tokens ?? 0,
    reasoningTokens: rawUsage?.completion_tokens_details?.reasoning_tokens ?? 0,
  };

  return {
    content,
    reasoningExcerpt: message?.reasoning_content
      ? message.reasoning_content.slice(0, 1500)
      : null,
    parsed: tryParseJson(content),
    model: response.model || input.model,
    latencyMs,
    usage,
    estimatedCostUsd: estimateCost(input.model, usage),
    truncated: choice?.finish_reason === "length",
  };
}

export interface SabqBaselineResult {
  ok: boolean;
  error?: string;
  result?: Awaited<ReturnType<typeof runEditorialTask>>;
}

/** يشغّل المادة نفسها عبر «محرر سبق» الحالي للمقارنة جنبًا إلى جنب */
export async function runSabqBaseline(params: {
  task: EditorialTaskType;
  material: string;
  material2?: string;
  instructions?: string;
  userId?: string;
}): Promise<SabqBaselineResult> {
  try {
    const result = await runEditorialTask({
      type: params.task,
      material: params.material,
      material2: params.material2,
      instructions: params.instructions,
      userId: params.userId,
    });
    return { ok: true, result };
  } catch (error: any) {
    return { ok: false, error: error?.message || "تعذر تشغيل محرر سبق" };
  }
}

export function getSabqPrimaryModel(): string {
  return SABQ_PRIMARY_EDITOR_MODEL;
}
