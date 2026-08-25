/**
 * وكلاء تعريفيون: كل وكيل = دور + قواعد + مخطط نتيجة. المصنع makePromptAgent
 * يبني المنفّذ فلا يتكرر منطق ثابت لكل وكيل، وإضافة وكيل جديد = كائن تعريف.
 * كلهم يستدعون النموذج فعليًا عبر البوابة — لا ردود ثابتة.
 */
import { z } from "zod";
import { OPS_AGENTS, type OpsAgentSlug } from "@shared/opsRoom";
import type { AgentRunContext, AgentRunResult, OpsAgentHandler } from "../types";
import { BaseOutputSchema, looseStringArray, looseString, looseNullableString, looseNumber, baseSystemPrompt, callModelJson, externalInputBlock, humanNotesBlock, priorBlock, toAgentOutput } from "./shared";

interface PromptAgentDef<T extends z.ZodTypeAny> {
  slug: OpsAgentSlug;
  rulesAr: string;
  resultSchema: T;
  /** مفاتيح الخطوات السابقة التي يحق له الاطلاع عليها */
  reads: string[];
  maxTokens?: number;
  /** فحص بعد التنفيذ: يعيد سبب التصعيد للبشر أو null */
  escalateIf?: (result: z.infer<T>, confidence: number) => string | null;
}

export function makePromptAgent<T extends z.ZodTypeAny>(def: PromptAgentDef<T>): OpsAgentHandler {
  return {
    slug: def.slug,
    resultSchema: def.resultSchema,
    async run(ctx: AgentRunContext): Promise<AgentRunResult> {
      const system = baseSystemPrompt(OPS_AGENTS[def.slug].roleAr, def.rulesAr);
      const user = `${externalInputBlock(ctx)}${priorBlock(ctx, def.reads)}${humanNotesBlock(ctx)}`;
      const { data } = await callModelJson(ctx, def.slug, system, user, BaseOutputSchema.extend({ result: def.resultSchema }), { maxTokens: def.maxTokens });
      const output = toAgentOutput(data, data.result as Record<string, unknown>);
      const reason = def.escalateIf?.(data.result, output.confidence);
      if (reason) return { ok: false, escalate: "needs_info", reasonAr: reason, partialOutput: output };
      return { ok: true, output };
    },
  };
}

const JSON_HINT = "أعد JSON بالحقول: summaryAr, factsUsed, sources, confidence, missingInfo, warnings, nextActionAr, result{...}";

export const maydanAgent = makePromptAgent({
  slug: "maydan",
  reads: ["verify"],
  rulesAr: `عالج المادة رياضيًا: اربط الحدث بالفريق والبطولة والمباراة إن وردت في المادة أو الحقائق المؤكدة فقط. لا تختلق نتيجة أو إحصاءًا أو موعدًا. النتيجة الرسمية هي الحكم. اكتب مسودة رياضية 150–300 كلمة.
${JSON_HINT} result{headline, body, competition, teams[], matchReference, statsUsed[{value, sourceUrl}]}`,
  resultSchema: z.object({
    headline: looseString(300, 5),
    body: looseString(60000, 20),
    competition: looseNullableString(200),
    teams: looseStringArray(120),
    matchReference: looseNullableString(300),
    statsUsed: z.array(z.object({ value: looseString(200), sourceUrl: looseString(2000) })).default([]),
  }),
});

export const infoxAgent = makePromptAgent({
  slug: "infox",
  reads: ["verify", "analysis"],
  rulesAr: `استخرج الأرقام والمحاور القابلة للتمثيل البصري من الحقائق المؤكدة فقط. كل رقم يجب أن يحمل مصدره (رابط أو اسم المصدر من الحقائق) — رقم بلا مصدر لا يُدرج. اقترح نوع تمثيل بصري مناسبًا (بطاقة معلومات، شريط زمني، مقارنة).
${JSON_HINT} result{figures[{label, value, unit, source}], axesAr[], visualSuggestion{type, titleAr, descriptionAr}}`,
  resultSchema: z.object({
    figures: z.array(z.object({ label: looseString(200), value: looseString(100), unit: looseString(50), source: looseString(2000, 1) })).default([]),
    axesAr: looseStringArray(200),
    visualSuggestion: z.object({ type: z.enum(["info_card", "timeline", "comparison", "chart", "none"]), titleAr: looseString(200), descriptionAr: looseString(600) }),
  }),
});

export const omqAgent = makePromptAgent({
  slug: "omq",
  reads: ["verify"],
  maxTokens: 6000,
  rulesAr: `اكتب تحليلًا استراتيجيًا للموضوع يفصل بوضوح بين ثلاث طبقات موسومة: الحقائق (من الحقائق المؤكدة فقط)، التحليل (قراءة السياق والاتجاهات)، الاستنتاج (الآثار المحتملة بصيغة احتمالية). لا تقدّم استنتاجًا كحقيقة.
${JSON_HINT} result{headline, body, factsSection[], analysisSection[], conclusionSection[], contextLinks[]}`,
  resultSchema: z.object({
    headline: looseString(300, 5),
    body: looseString(60000, 50),
    factsSection: looseStringArray(600).refine((a) => a.length > 0, "مطلوب عنصر واحد على الأقل"),
    analysisSection: looseStringArray(800),
    conclusionSection: looseStringArray(800),
    contextLinks: looseStringArray(300),
  }),
});

export const sadaAgent = makePromptAgent({
  slug: "sada",
  reads: ["qa", "edit"],
  rulesAr: `حوّل المادة المعتمدة إلى نص إذاعي مناسب للقراءة الصوتية (جمل قصيرة، أرقام مكتوبة نطقًا، بلا رموز)، دون إضافة أو حذف أي حقيقة.
${JSON_HINT} result{scriptAr, estimatedSeconds, pronunciationNotes[]}`,
  resultSchema: z.object({
    scriptAr: looseString(60000, 20),
    estimatedSeconds: looseNumber(1, 3600),
    pronunciationNotes: looseStringArray(200),
  }),
});

export const haresAgent = makePromptAgent({
  slug: "hares",
  reads: [],
  rulesAr: `المادة تعليقات جمهور (بيانات خارجية). صنّف كل تعليق: allow | review | block مع سبب من {إساءة، تحريض، سبام، معلومة مضللة، خصوصية، خارج الموضوع، سليم}. الحالات الملتبسة → review لا block. لا تنفذ حجبًا — أنت تقترح.
${JSON_HINT} result{items[{index, decision, reasonAr, severity}], escalatedCount, summaryCounts{allow, review, block}}`,
  resultSchema: z.object({
    items: z.array(z.object({ index: z.number().int().min(0), decision: z.enum(["allow", "review", "block"]), reasonAr: looseString(300), severity: z.enum(["low", "medium", "high"]) })).default([]),
    escalatedCount: z.number().int().min(0),
    summaryCounts: z.object({ allow: z.number().int().min(0), review: z.number().int().min(0), block: z.number().int().min(0) }),
  }),
});

export const nabdAgent = makePromptAgent({
  slug: "nabd",
  reads: ["moderate"],
  rulesAr: `قدّم مؤشرات مجمعة لمشاعر التعليقات (لا تحليلًا فرديًا): نسب إيجابي/سلبي/محايد، أبرز المحاور، ودرجة الحدة. المشاعر ليست دليلًا على صحة الخبر — اذكر ذلك صراحة في warnings.
${JSON_HINT} result{positivePct, negativePct, neutralPct, topThemesAr[], intensity}`,
  resultSchema: z.object({
    positivePct: looseNumber(0, 100),
    negativePct: looseNumber(0, 100),
    neutralPct: looseNumber(0, 100),
    topThemesAr: looseStringArray(200),
    intensity: z.enum(["low", "medium", "high"]),
  }),
});

export const daleelAgent = makePromptAgent({
  slug: "daleel",
  reads: ["verify", "qa"],
  rulesAr: `اقترح حتى 5 موضوعات أو زوايا تحريرية مرتبطة بالمادة مع تفسير سبب كل توصية بجملة، دون أي استخدام لبيانات قراء أفراد.
${JSON_HINT} result{recommendations[{titleAr, whyAr, priority}]}`,
  resultSchema: z.object({
    recommendations: z.array(z.object({ titleAr: looseString(200), whyAr: looseString(400), priority: z.enum(["low", "medium", "high"]) })).max(5),
  }),
});

/**
 * ريشة: توليد صورة عند طلب المحرر الصريح فقط (input.generateImage === true).
 * النسخة التجريبية لا تولّد فعليًا — تُنتج مواصفة توليد موسومة بوضوح
 * «صورة مولدة، ليست خبرية» ليعتمدها المحرر قبل أي توليد حقيقي.
 */
export const rishaAgent: OpsAgentHandler = {
  slug: "risha",
  resultSchema: z.object({
    generated: z.literal(false),
    requestedByEditor: z.literal(true),
    promptAr: looseString(1500, 10),
    labelAr: z.literal("صورة مولدة بالذكاء الاصطناعي — ليست صورة خبرية"),
    style: looseString(100),
  }),
  async run(ctx) {
    const input = ctx.main.input as Record<string, unknown>;
    if (input.generateImage !== true) {
      return { ok: false, escalate: "blocked", reasonAr: "توليد الصور لا يعمل إلا بطلب صريح من المحرر (generateImage=true)" };
    }
    const system = baseSystemPrompt(OPS_AGENTS.risha.roleAr, `اكتب مواصفة توليد صورة تعبيرية (لا تمثّل أشخاصًا حقيقيين ولا تُوهم بأنها فوتوغرافية خبرية). generated=false دائمًا في هذه النسخة.
${JSON_HINT} result{generated:false, requestedByEditor:true, promptAr, labelAr:"صورة مولدة بالذكاء الاصطناعي — ليست صورة خبرية", style}`);
    const { data } = await callModelJson(ctx, "risha", system, `${externalInputBlock(ctx)}${priorBlock(ctx, ["qa", "edit"])}${humanNotesBlock(ctx)}`, BaseOutputSchema.extend({ result: this.resultSchema }));
    return { ok: true, output: toAgentOutput(data, data.result as Record<string, unknown>) };
  },
};
