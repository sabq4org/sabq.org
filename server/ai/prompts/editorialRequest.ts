/**
 * طلب «محرر سبق» الخالص: مدخل المهمة، وتركيب البرومبت بطبقاته الثلاث، ومخطط الإخراج.
 * بلا بوابة ولا قاعدة بيانات، ليستعمله editorialAiService وسكربت المقارنة
 * (scripts/prompt-audit/compare-structured-outputs.ts) بالنص نفسه حرفياً.
 */

import { SABQ_EDITORIAL_CORE_AR } from "../sabqEditorialPrompt";
import { SABQ_CONSTITUTION_AR } from "./constitution";
import {
  SABQ_TASK_PROMPTS_AR,
  SABQ_TASK_OUTPUT_FORMAT_AR,
  type EditorialTaskType,
} from "./tasks";

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

/**
 * مخطط الإخراج الموحّد — يطابق SABQ_TASK_OUTPUT_FORMAT_AR. يُمرَّر للبوابة فيُلزم Claude به
 * عبر Structured Outputs حين CLAUDE_STRUCTURED_OUTPUTS=on؛ ويبقى parseAndValidate وحارس
 * الاكتمال خط الدفاع في كل الأحوال (ومع النموذج البديل).
 */
export const EDITORIAL_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "altHeadlines", "body", "editorNotes", "sources", "pushText", "enVersion", "riskFlags"],
  properties: {
    headline: { type: "string", description: "العنوان الرئيسي" },
    altHeadlines: { type: "array", items: { type: "string" }, description: "عناوين بديلة بزوايا مختلفة" },
    body: {
      type: "string",
      description: "المتن بفقرات HTML (<p> و<h3>)، أو فارغ لمهام المراجعة. للاقتباس داخل النص استخدم «...»",
    },
    editorNotes: { type: "array", items: { type: "string" }, description: "إلزامية: ملاحظة واحدة على الأقل" },
    sources: {
      type: "array",
      description: "مصادر وردت في المادة أو سياق التحقق فقط",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "url"],
        properties: { title: { type: "string" }, url: { type: "string" } },
      },
    },
    pushText: { type: "string" },
    enVersion: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: ["headline", "body", "pushText"],
          properties: { headline: { type: "string" }, body: { type: "string" }, pushText: { type: "string" } },
        },
      ],
    },
    riskFlags: { type: "array", items: { type: "string" } },
  },
} as const;

export function buildSystemPrompt(type: EditorialTaskType): string {
  return [
    SABQ_EDITORIAL_CORE_AR,
    SABQ_CONSTITUTION_AR,
    SABQ_TASK_PROMPTS_AR[type],
    SABQ_TASK_OUTPUT_FORMAT_AR,
  ].join("\n\n");
}

export function buildUserMessage(input: EditorialTaskInput): string {
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
