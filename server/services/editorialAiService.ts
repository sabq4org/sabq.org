/**
 * خدمة التحرير الموحد — «محرر سبق»
 *
 * الواجهة الوحيدة لكل مهام التحرير بالذكاء الاصطناعي (حرر/طور/ادمج/راجع/تقرير/
 * بروفايل/نسخة التطبيق/فحص ما قبل النشر). تركّب البرومبت من ثلاث طبقات:
 * نواة معايير اللغة (sabqEditorialPrompt) + الدستور التحريري (constitution) +
 * برومبت المهمة (tasks)، وتنادي بوابة الذكاء مباشرة بمفتاح ميزة لكل مهمة
 * (يظهر في ai_usage_logs باسم editorial-unified-<task>).
 *
 * الوثيقة الأصل: docs/editorial-ai-unified-system-plan-2026-08-03.md (القسم 3.2)
 */

import { aiGateway } from "../ai/gateway";
import {
  SABQ_EDITORIAL_CORE_AR,
  SABQ_PRIMARY_EDITOR_MODEL,
  SABQ_FALLBACK_EDITOR_MODEL,
} from "../ai/sabqEditorialPrompt";
import { SABQ_CONSTITUTION_AR } from "../ai/prompts/constitution";
import {
  SABQ_TASK_PROMPTS_AR,
  SABQ_TASK_OUTPUT_FORMAT_AR,
  TASKS_WANTING_VERIFICATION,
  type EditorialTaskType,
} from "../ai/prompts/tasks";
import { assertEditedContentComplete } from "../ai/editorialOutputGuards";
import { sanitizeArticleHtml } from "../utils/sanitizeHtml";
import { isHttpSourceUrl } from "@shared/editorialAiSources";

export interface EditorialTaskInput {
  type: EditorialTaskType;
  /** المادة الخام (وفي «ادمج»: المادة الأولى) */
  material: string;
  /** المادة الثانية — مهمة «ادمج» فقط */
  material2?: string;
  /** توجيه حر من المحرر (زاوية مطلوبة، تركيز عنوان، جمهور...) */
  instructions?: string;
  /**
   * سياق تحقق خارجي (نتائج بحث ويب منسوبة بروابطها) تجهزه طبقة أعلى.
   * بدونه تعمل مهام «طور/تقرير/بروفايل» بوضع متحفظ: إثراء صياغة فقط
   * مع قائمة ما يحتاج تحققاً في editorNotes.
   */
  verificationContext?: string;
  userId?: string;
}

export interface EditorialTaskResult {
  headline: string;
  altHeadlines: string[];
  body: string;
  editorNotes: string[];
  sources: { title: string; url: string }[];
  pushText: string | null;
  enVersion: { headline: string; body: string; pushText: string } | null;
  riskFlags: string[];
  /** بيانات التشغيل — للقياس في اللوحة */
  meta: {
    task: EditorialTaskType;
    provider: string;
    modelId: string;
    fallbackUsed: boolean;
    latencyMs: number;
    verificationProvided: boolean;
    /** المهمة كانت تستفيد من سياق تحقق ولم يُمرر — واجهة الاستدعاء تُظهر تنبيهاً */
    verificationRecommended: boolean;
  };
}

/** حد إخراج سخي: التقارير المعمقة تتجاوز 3-4 آلاف توكن بسهولة */
const MAX_OUTPUT_TOKENS = 12_000;
const TEMPERATURE = 0.3;

/** المهام التي يُطبق على متنها حارس الاكتمال (مخرجها إعادة صياغة للمدخل) */
const BODY_COMPLETENESS_TASKS: ReadonlySet<EditorialTaskType> = new Set([
  "edit",
  "merge",
]);

function buildSystemPrompt(type: EditorialTaskType): string {
  return [
    SABQ_EDITORIAL_CORE_AR,
    SABQ_CONSTITUTION_AR,
    SABQ_TASK_PROMPTS_AR[type],
    SABQ_TASK_OUTPUT_FORMAT_AR,
  ].join("\n\n");
}

function buildUserMessage(input: EditorialTaskInput): string {
  const parts: string[] = [];
  if (input.instructions?.trim()) {
    parts.push(`## توجيه المحرر\n${input.instructions.trim()}`);
  }
  if (input.verificationContext?.trim()) {
    parts.push(`## سياق التحقق (نتائج بحث موثقة — اعتمدها واذكر مصادرها)\n${input.verificationContext.trim()}`);
  }
  parts.push(`## المادة\n${input.material.trim()}`);
  if (input.type === "merge" && input.material2?.trim()) {
    parts.push(`=====\n## المادة الثانية\n${input.material2.trim()}`);
  }
  return parts.join("\n\n");
}

/** يجرد أسوار ```json إن غلّف النموذج مخرجه بها رغم jsonMode */
function stripCodeFences(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenced ? fenced[1] : trimmed;
}

function parseAndValidate(
  raw: string,
  input: EditorialTaskInput,
): Omit<EditorialTaskResult, "meta"> {
  let parsed: any;
  try {
    parsed = JSON.parse(stripCodeFences(raw));
  } catch {
    throw new Error("Editorial output is not valid JSON");
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Editorial output is not a JSON object");
  }
  if (!Array.isArray(parsed.editorNotes) || parsed.editorNotes.length === 0) {
    throw new Error("Editorial output missing mandatory editorNotes");
  }

  const rawBody = typeof parsed.body === "string" ? parsed.body : "";
  const body = sanitizeArticleHtml(rawBody);
  // مهام إعادة الصياغة لا تحتمل متناً مبتوراً (علة علامة التنصيص غير المهربة —
  // حادثة 2026-08-03): الحارس يرمي فنسقط للنموذج البديل.
  if (BODY_COMPLETENESS_TASKS.has(input.type)) {
    const inputText =
      input.type === "merge"
        ? `${input.material}\n${input.material2 ?? ""}`
        : input.material;
    // Check the original too: HTML parsing can close a truncated paragraph.
    assertEditedContentComplete(rawBody, inputText);
    assertEditedContentComplete(body, inputText);
  }

  return {
    headline: typeof parsed.headline === "string" ? parsed.headline : "",
    altHeadlines: Array.isArray(parsed.altHeadlines)
      ? parsed.altHeadlines.filter((h: unknown) => typeof h === "string")
      : [],
    body,
    editorNotes: parsed.editorNotes.filter((n: unknown) => typeof n === "string"),
    sources: Array.isArray(parsed.sources)
      ? parsed.sources.filter(
          (s: any) => s && typeof s.title === "string" && isHttpSourceUrl(s.url),
        )
      : [],
    pushText: typeof parsed.pushText === "string" && parsed.pushText ? parsed.pushText : null,
    enVersion:
      parsed.enVersion &&
      typeof parsed.enVersion.headline === "string" &&
      typeof parsed.enVersion.body === "string"
        ? {
            headline: parsed.enVersion.headline,
            body: sanitizeArticleHtml(parsed.enVersion.body),
            pushText:
              typeof parsed.enVersion.pushText === "string"
                ? parsed.enVersion.pushText
                : "",
          }
        : null,
    riskFlags: Array.isArray(parsed.riskFlags)
      ? parsed.riskFlags.filter((f: unknown) => typeof f === "string")
      : [],
  };
}

async function completeOnce(
  input: EditorialTaskInput,
  modelId: string,
): Promise<{ result: Omit<EditorialTaskResult, "meta">; provider: string; modelId: string; latencyMs: number }> {
  const provider = modelId.startsWith("claude") ? "anthropic" : "openai";
  const res = await aiGateway.complete({
    feature: `editorial-unified-${input.type}`,
    userId: input.userId,
    model: { provider, modelId },
    messages: [
      { role: "system", content: buildSystemPrompt(input.type) },
      { role: "user", content: buildUserMessage(input) },
    ],
    options: { maxTokens: MAX_OUTPUT_TOKENS, temperature: TEMPERATURE, jsonMode: true },
  });
  if (res.truncated) {
    throw new Error(`Editorial output truncated (max_tokens) on ${modelId}`);
  }
  return {
    result: parseAndValidate(res.content, input),
    provider: res.provider,
    modelId: res.modelId,
    latencyMs: res.latencyMs,
  };
}

/**
 * ينفّذ مهمة تحرير موحدة. يحاول النموذج الأساسي ثم يسقط للبديل عند البتر أو
 * فساد JSON — نفس عقيدة مسار التحرير التوليدي (لا مخرجات مبتورة تصل للمحرر).
 */
export async function runEditorialTask(
  input: EditorialTaskInput,
): Promise<EditorialTaskResult> {
  const verificationProvided = Boolean(input.verificationContext?.trim());
  const verificationRecommended =
    TASKS_WANTING_VERIFICATION.has(input.type) && !verificationProvided;

  let outcome: Awaited<ReturnType<typeof completeOnce>>;
  let fallbackUsed = false;
  try {
    outcome = await completeOnce(input, SABQ_PRIMARY_EDITOR_MODEL);
  } catch (primaryError: any) {
    console.warn(
      `[editorial-unified] primary model failed (${primaryError?.message}); falling back to ${SABQ_FALLBACK_EDITOR_MODEL}`,
    );
    outcome = await completeOnce(input, SABQ_FALLBACK_EDITOR_MODEL);
    fallbackUsed = true;
  }

  return {
    ...outcome.result,
    meta: {
      task: input.type,
      provider: outcome.provider,
      modelId: outcome.modelId,
      fallbackUsed,
      latencyMs: outcome.latencyMs,
      verificationProvided,
      verificationRecommended,
    },
  };
}
