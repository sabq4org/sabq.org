/**
 * الوكلاء الأساسيون للمسار: راصد ← موثّق ← سبّاق/مراسل ← قلم ← ميزان،
 * والمتوازيان بعد الاعتماد: عدسة وساعي.
 *
 * كل وكيل: مدخلات محددة، أدوات مسموحة (تُفرض من المحرك)، مخطط نتيجة
 * zod صارم، وشروط تصعيد صريحة للبشر. لا نشر ولا إرسال في أي وكيل.
 */
import { z } from "zod";
import { runEditorialTask } from "../../editorialAiService";
import { buildVerificationContext, isWebSearchConfigured } from "../../webSearchService";
import { analyzeImage } from "../../visualAiService";
import { getItem as getRadarItem } from "../../radar/repo";
import { OPS_AGENTS } from "@shared/opsRoom";
import type { AgentRunContext, AgentRunResult, OpsAgentHandler } from "../types";
import { fenceExternal, isHttpUrl, sanitizeExternalText } from "../sanitize";
import {
  BaseOutputSchema,
  looseStringArray,
  looseEnum,
  looseNumber,
  looseNullableString,
  looseString,
  SourceSchema,
  baseSystemPrompt,
  callModelJson,
  externalInputBlock,
  humanNotesBlock,
  priorBlock,
  toAgentOutput,
} from "./shared";

// ── راصد: إشارة رصد موثقة ──

const SignalResult = z.object({
  eventSummaryAr: looseString(1500, 10),
  claims: looseStringArray(500).refine((a) => a.length > 0, "مطلوب عنصر واحد على الأقل"),
  entities: looseStringArray(120),
  location: looseNullableString(200),
  timeframe: looseNullableString(200),
  sourceHints: looseStringArray(500),
  urgency: looseNumber(0, 100),
  isBreakingCandidate: z.boolean(),
  uncertainties: looseStringArray(500),
});

export const rasedAgent: OpsAgentHandler = {
  slug: "rased",
  resultSchema: SignalResult,
  async run(ctx) {
    let radarBlock = "";
    const radarItemId = ctx.main.radarItemId;
    if (radarItemId) {
      await ctx.logTool("radar_read", { radarItemId });
      const item = await getRadarItem(radarItemId);
      if (item) {
        radarBlock =
          "\n\n" +
          fenceExternal(
            "مادة الرادار",
            [
              `العنوان: ${item.translatedTitle ?? item.originalTitle}`,
              `الملخص: ${item.translatedSummary ?? item.originalExcerpt ?? ""}`,
              `الناشر: ${item.publisher ?? "غير معروف"}`,
              `الرابط: ${item.link ?? ""}`,
              `القيمة الإخبارية (تقدير الرادار): ${item.newsValue ?? "—"}`,
            ].join("\n"),
          );
      } else {
        ctx.humanNotes.push("تعذر العثور على مادة الرادار المشار إليها — اعتمد على المادة المرفقة فقط");
      }
    }
    const system = baseSystemPrompt(
      OPS_AGENTS.rased.roleAr,
      `حوّل المادة إلى إشارة رصد: ما الحدث، وما الادعاءات المطروحة (بصيغتها كادعاءات لا حقائق)، ومن الجهات، وأين ومتى، وأين يمكن التحقق. لا تكتب خبرًا ولا تُحسّن الصياغة. urgency من 0 إلى 100.
أعد JSON بالحقول: summaryAr, factsUsed, sources, confidence, missingInfo, warnings, nextActionAr, result{eventSummaryAr, claims[], entities[], location, timeframe, sourceHints[], urgency, isBreakingCandidate, uncertainties[]}`,
    );
    const user = `${externalInputBlock(ctx)}${radarBlock}${humanNotesBlock(ctx)}`;
    const { data } = await callModelJson(ctx, "rased", system, user, BaseOutputSchema.extend({ result: SignalResult }));
    return { ok: true, output: toAgentOutput(data, data.result), riskLevel: data.result.isBreakingCandidate ? "high" : undefined };
  },
};

// ── موثّق: التحقق وجمع المصادر ──

const VerifyResult = z.object({
  confirmedFacts: z.array(z.object({ fact: looseString(600), sourceUrls: looseStringArray(2000) })).default([]),
  unverifiedClaims: looseStringArray(600),
  contradictions: looseStringArray(600),
  sourceAssessments: z
    .array(z.object({ title: looseString(300), url: looseString(2000), freshness: looseString(120), reliability: looseEnum(["high", "medium", "low", "unknown"] as const, "unknown") }))
    .default([]),
  sufficient: z.boolean(),
  verdictAr: looseString(800),
});

const MIN_VERIFY_CONFIDENCE = 50;

export const muwathiqAgent: OpsAgentHandler = {
  slug: "muwathiq",
  resultSchema: VerifyResult,
  async run(ctx): Promise<AgentRunResult> {
    const signal = ctx.priorOutputs.signal?.result as z.infer<typeof SignalResult> | undefined;
    const input = ctx.main.input as Record<string, unknown>;
    const queries: string[] = [];
    if (signal) queries.push(signal.eventSummaryAr.slice(0, 120), ...signal.claims.slice(0, 3).map((c) => c.slice(0, 120)));
    else queries.push(ctx.main.title.slice(0, 120));

    let verificationBlock = "";
    let webUsed = false;
    if (isWebSearchConfigured()) {
      await ctx.logTool("web_search", { queries: queries.length });
      const verification = await buildVerificationContext(queries, 5);
      if (verification && verification.results.length > 0) {
        webUsed = true;
        verificationBlock = "\n\n" + fenceExternal("نتائج بحث الويب", verification.context);
      }
    } else {
      ctx.humanNotes.push("بحث الويب غير مهيأ في هذه البيئة — التحقق يعتمد على المادة والروابط المزودة فقط");
    }
    const editorSources = Array.isArray(input.sourceUrls) ? (input.sourceUrls as unknown[]).filter(isHttpUrl) : [];

    const system = baseSystemPrompt(
      OPS_AGENTS.muwathiq.roleAr,
      `افصل بصرامة: حقيقة مؤكدة = ورد في مصدرين مستقلين موثوقين أو مصدر رسمي مباشر مع رابط. غير ذلك ادعاء غير مؤكد. سجّل التعارضات بين المصادر. قيّم حداثة كل مصدر وموثوقيته.
sufficient = true فقط إذا كانت الحقائق المؤكدة كافية لكتابة خبر بلا ادعاءات معلقة، وإلا false مع ذكر ما ينقص في missingInfo.
${webUsed ? "" : "لا نتائج بحث ويب متاحة: إن لم تكفِ المادة والروابط المزودة فاجعل sufficient=false وخفّض confidence."}
أعد JSON بالحقول: summaryAr, factsUsed, sources, confidence, missingInfo, warnings, nextActionAr, result{confirmedFacts[{fact,sourceUrls[]}], unverifiedClaims[], contradictions[], sourceAssessments[{title,url,freshness,reliability}], sufficient, verdictAr}`,
    );
    const user = `${externalInputBlock(ctx)}${priorBlock(ctx, ["signal"])}${verificationBlock}${editorSources.length ? "\n\nروابط زوّدها المحرر للتحقق:\n" + editorSources.join("\n") : ""}${humanNotesBlock(ctx)}`;
    const { data } = await callModelJson(ctx, "muwathiq", system, user, BaseOutputSchema.extend({ result: VerifyResult }), { maxTokens: 5000 });
    const output = toAgentOutput(data, data.result);

    // شرط التصعيد: أدلة ناقصة أو متعارضة → يتوقف المسار ويظهر للمحرر
    if (!data.result.sufficient || data.result.contradictions.length > 0 || output.confidence < MIN_VERIFY_CONFIDENCE) {
      const reasons = [
        !data.result.sufficient ? "الأدلة غير كافية" : null,
        data.result.contradictions.length > 0 ? `تعارض بين المصادر (${data.result.contradictions.length})` : null,
        output.confidence < MIN_VERIFY_CONFIDENCE ? `الثقة ${output.confidence}% دون العتبة` : null,
      ].filter(Boolean);
      return { ok: false, escalate: "needs_info", reasonAr: `${reasons.join("، ")} — ${data.result.verdictAr}`.slice(0, 600), partialOutput: output };
    }
    return { ok: true, output };
  },
};

// ── سبّاق / مراسل / قلم: عبر المحرر الموحد (runEditorialTask) ──

const DraftResult = z.object({
  headline: looseString(300, 5),
  altHeadlines: looseStringArray(300),
  body: looseString(60000, 20),
  pushText: looseNullableString(400),
  editorNotes: looseStringArray(600),
  riskFlags: looseStringArray(400),
});

function verificationContextFrom(ctx: AgentRunContext): string {
  const verify = ctx.priorOutputs.verify?.result as z.infer<typeof VerifyResult> | undefined;
  if (!verify) return "";
  const facts = verify.confirmedFacts.map((f, i) => `${i + 1}. ${f.fact}${f.sourceUrls.length ? ` — المصادر: ${f.sourceUrls.join(" ، ")}` : ""}`).join("\n");
  const claims = verify.unverifiedClaims.length ? `\nادعاءات غير مؤكدة (لا تُذكر كحقائق): ${verify.unverifiedClaims.join(" | ")}` : "";
  return `حقائق مؤكدة من موثّق:\n${facts}${claims}`;
}

function materialFrom(ctx: AgentRunContext): string {
  const input = ctx.main.input as Record<string, unknown>;
  const signal = ctx.priorOutputs.signal?.result as z.infer<typeof SignalResult> | undefined;
  const parts = [ctx.main.title, ctx.main.description, typeof input.material === "string" ? input.material : ""];
  if (signal) parts.push(`ملخص الحدث: ${signal.eventSummaryAr}`);
  return sanitizeExternalText(parts.filter(Boolean).join("\n\n"));
}

async function editorialDraft(ctx: AgentRunContext, agent: "sabbaq" | "murasil", instructions: string): Promise<AgentRunResult> {
  // العاجل قصير بطبيعته: «نسخة التطبيق» تُخرج 150–200 كلمة بلا حارس نسبة الطول
  // الذي يرفض مخرج «حرّر» إن قصر عن نصف المادة (editorialOutputGuards).
  const type = agent === "sabbaq" ? ("app_version" as const) : ("edit" as const);
  await ctx.logTool("editorial_task", { agent, type });
  const verificationContext = verificationContextFrom(ctx);
  const res = await runEditorialTask({
    type,
    material: `${materialFrom(ctx)}\n\n${verificationContext}`.slice(0, 60_000),
    instructions: `${instructions}${ctx.humanNotes.length ? `\nملاحظات المحرر البشري: ${ctx.humanNotes.join(" | ")}` : ""}`.slice(0, 2_000),
    verificationContext: verificationContext.slice(0, 30_000) || undefined,
    userId: ctx.main.createdById ?? undefined,
  });
  const result = DraftResult.parse({
    headline: res.headline,
    altHeadlines: res.altHeadlines,
    body: res.body,
    pushText: res.pushText,
    editorNotes: res.editorNotes,
    riskFlags: res.riskFlags,
  });
  const verify = ctx.priorOutputs.verify?.result as z.infer<typeof VerifyResult> | undefined;
  return {
    ok: true,
    output: {
      summaryAr: `مسودة «${result.headline}» (${result.body.split(/\s+/).length} كلمة) من الحقائق المؤكدة فقط`,
      factsUsed: verify?.confirmedFacts.map((f) => f.fact) ?? [],
      sources: res.sources,
      confidence: verify ? Math.min(95, Math.max(30, Math.round((verify.confirmedFacts.length / Math.max(1, verify.confirmedFacts.length + verify.unverifiedClaims.length)) * 100))) : 60,
      missingInfo: res.editorNotes.filter((n) => /ناقص|غير واضح|يحتاج|لم يتضح/.test(n)),
      warnings: res.riskFlags,
      nextActionAr: "التحرير اللغوي ثم فحص الجودة",
      result,
    },
  };
}

export const sabbaqAgent: OpsAgentHandler = {
  slug: "sabbaq",
  resultSchema: DraftResult,
  run: (ctx) =>
    editorialDraft(
      ctx,
      "sabbaq",
      "خبر عاجل قصير جدًا: 60–120 كلمة، عنوان حاسم، الحقيقة المؤكدة أولًا، بلا أي معلومة من خارج الحقائق المؤكدة، ولا اقتباسات غير موثقة. ضع أي ادعاء غير مؤكد في editorNotes لا في النص.",
    ),
};

export const murasilAgent: OpsAgentHandler = {
  slug: "murasil",
  resultSchema: DraftResult,
  run: (ctx) =>
    editorialDraft(
      ctx,
      "murasil",
      "مسودة خبر اعتيادي 200–400 كلمة بأسلوب سبق من الحقائق المؤكدة فقط. أبرز الأسئلة المفتوحة والمعلومات الناقصة في editorNotes. لا اقتباسات ولا مشاهدات ميدانية مختلقة.",
    ),
};

const EditResult = DraftResult.extend({ changesSummaryAr: looseStringArray(400) });

export const qalamAgent: OpsAgentHandler = {
  slug: "qalam",
  resultSchema: EditResult,
  async run(ctx) {
    const draft = (ctx.priorOutputs.draft ?? ctx.priorOutputs.sports ?? ctx.priorOutputs.analysis)?.result as Record<string, unknown> | undefined;
    if (!draft) return { ok: false, escalate: "needs_info", reasonAr: "لا مسودة سابقة لتحريرها" };
    const body = String(draft.body ?? draft.analysisAr ?? draft.text ?? "");
    const headline = String(draft.headline ?? ctx.main.title);
    await ctx.logTool("editorial_task", { agent: "qalam", type: "edit" });
    const res = await runEditorialTask({
      type: "edit",
      material: `العنوان: ${headline}\n\n${body}`.slice(0, 60_000),
      instructions: `تحرير لغوي وأسلوبي فقط بأسلوب سبق: حسّن العنوان والمقدمة والبنية، ولا تغيّر أي حقيقة أو رقم أو اسم ولا تضف معلومة. اذكر ما غيّرته في editorNotes.${ctx.humanNotes.length ? ` ملاحظات المحرر البشري: ${ctx.humanNotes.join(" | ")}` : ""}`.slice(0, 2_000),
      userId: ctx.main.createdById ?? undefined,
    });
    const result = EditResult.parse({
      headline: res.headline,
      altHeadlines: res.altHeadlines,
      body: res.body,
      pushText: res.pushText,
      editorNotes: res.editorNotes,
      riskFlags: res.riskFlags,
      changesSummaryAr: res.editorNotes,
    });
    const prior = ctx.priorOutputs.draft ?? ctx.priorOutputs.sports ?? ctx.priorOutputs.analysis;
    return {
      ok: true,
      output: {
        summaryAr: `حرّر قلم النص لغويًا وأسلوبيًا (${result.changesSummaryAr.length} ملاحظة تحرير)`,
        factsUsed: (prior?.factsUsed as string[]) ?? [],
        sources: (prior?.sources as { title: string; url: string }[]) ?? res.sources,
        confidence: typeof prior?.confidence === "number" ? (prior.confidence as number) : 70,
        missingInfo: [],
        warnings: result.riskFlags,
        nextActionAr: "فحص الجودة والمخاطر",
        result,
      },
    };
  },
};

// ── ميزان: فحص الجودة والمصادر والمخاطر ──

const QaResult = z.object({
  verdict: looseEnum(["pass", "needs_fix", "blocked"] as const, "blocked"),
  checks: z.object({
    sources: looseEnum(["ok", "weak", "missing"] as const, "weak"),
    headline: looseEnum(["ok", "needs_fix"] as const, "needs_fix"),
    content: looseEnum(["ok", "needs_fix"] as const, "needs_fix"),
    risk: looseEnum(["low", "medium", "high"] as const, "low"),
  }),
  issues: looseStringArray(500),
  corrections: looseStringArray(500),
  finalHeadline: looseString(300),
  finalBody: z.string(),
});

const HIGH_RISK_PATTERN = /(عسكري|أمني|استخبار|قضائي|اتهام|وفاة|قتل|إرهاب|انتحار|فضيحة|طائفي)/;

export const mizanAgent: OpsAgentHandler = {
  slug: "mizan",
  resultSchema: QaResult,
  async run(ctx) {
    const edited = (ctx.priorOutputs.edit ?? ctx.priorOutputs.verify)?.result as Record<string, unknown> | undefined;
    if (!edited) return { ok: false, escalate: "needs_info", reasonAr: "لا مادة سابقة لفحصها" };
    const verify = ctx.priorOutputs.verify?.result as z.infer<typeof VerifyResult> | undefined;
    const headline = String(edited.headline ?? ctx.main.title);
    const body = String(edited.body ?? edited.verdictAr ?? "");

    await ctx.logTool("editorial_task", { agent: "mizan", type: "precheck+review" });
    const material = `العنوان: ${headline}\n\n${body}`.slice(0, 60_000);
    const [precheck, review] = await Promise.all([
      runEditorialTask({ type: "precheck", material, userId: ctx.main.createdById ?? undefined }),
      runEditorialTask({
        type: "review",
        material,
        verificationContext: verificationContextFrom(ctx).slice(0, 30_000) || undefined,
        userId: ctx.main.createdById ?? undefined,
      }),
    ]);
    const riskFlags = [...new Set([...precheck.riskFlags, ...review.riskFlags])];
    const corrections = [...new Set([...review.editorNotes, ...precheck.editorNotes])].filter(Boolean);
    const highRisk = riskFlags.some((f) => HIGH_RISK_PATTERN.test(f)) || (ctx.main.riskLevel === "high" && riskFlags.length > 0);
    const sourcesCheck = !verify ? "missing" : verify.confirmedFacts.length === 0 ? "missing" : verify.sourceAssessments.some((s) => s.reliability === "high") ? "ok" : "weak";
    const contentNeedsFix = corrections.length > 0;
    const verdict: z.infer<typeof QaResult>["verdict"] = highRisk || (verify?.contradictions.length ?? 0) > 0 || sourcesCheck === "missing" ? "blocked" : contentNeedsFix ? "needs_fix" : "pass";

    const result = QaResult.parse({
      verdict,
      checks: {
        sources: sourcesCheck,
        headline: precheck.riskFlags.some((f) => /عنوان/.test(f)) ? "needs_fix" : "ok",
        content: contentNeedsFix ? "needs_fix" : "ok",
        risk: highRisk ? "high" : riskFlags.length > 0 ? "medium" : "low",
      },
      issues: riskFlags,
      corrections,
      finalHeadline: headline,
      finalBody: body,
    });
    const output = {
      summaryAr:
        verdict === "pass"
          ? "اجتازت المادة فحص الجودة والمصادر والمخاطر"
          : verdict === "needs_fix"
            ? `تحتاج المادة تعديلًا (${corrections.length} تصويب)`
            : `أوقف ميزان المادة: ${highRisk ? "مخاطر عالية" : sourcesCheck === "missing" ? "مصادر غير كافية" : "تعارض مصادر"}`,
      factsUsed: verify?.confirmedFacts.map((f) => f.fact) ?? [],
      sources: verify?.sourceAssessments.map((s) => ({ title: s.title, url: s.url })) ?? [],
      confidence: verdict === "pass" ? 85 : verdict === "needs_fix" ? 60 : 30,
      missingInfo: verify?.unverifiedClaims ?? [],
      warnings: riskFlags,
      nextActionAr: verdict === "pass" ? "بانتظار الاعتماد البشري" : verdict === "needs_fix" ? "إعادة للتحرير" : "قرار بشري إلزامي — يحتاج مراجعًا ثانيًا",
      result,
    };
    // needs_fix → عودة تلقائية واحدة لقلم؛ blocked/pass → للبشر (بوابة الاعتماد)
    if (verdict === "needs_fix" && ctx.priorOutputs.edit) {
      return { ok: true, output, riskLevel: result.checks.risk, returnToStepKey: "edit", returnReasonAr: corrections.slice(0, 5).join(" | ") };
    }
    return { ok: true, output, riskLevel: result.checks.risk };
  },
};

// ── عدسة: تحليل الصورة (بعد الاعتماد، بالتوازي) ──

const ImageResult = z.object({
  analyzed: z.boolean(),
  imageUrl: looseNullableString(2000),
  suitability: looseEnum(["suitable", "questionable", "unsuitable", "no_image"] as const, "questionable"),
  captionAr: looseString(400),
  altTextAr: looseString(300),
  qualityScore: looseNumber(0, 100).nullable().default(null),
  contentWarnings: looseStringArray(300),
  identityCaveatAr: looseString(300),
});

export const adasaAgent: OpsAgentHandler = {
  slug: "adasa",
  resultSchema: ImageResult,
  async run(ctx) {
    const input = ctx.main.input as Record<string, unknown>;
    const imageUrl = isHttpUrl(input.imageUrl) ? input.imageUrl : null;
    const qa = ctx.priorOutputs.qa?.result as z.infer<typeof QaResult> | undefined;
    const headline = qa?.finalHeadline ?? ctx.main.title;
    const bodyText = qa?.finalBody ?? ctx.main.description;
    const caveat = "لم يُجزم بهوية الأشخاص أو المواقع في الصورة — يلزم تأكيد بشري";

    if (imageUrl) {
      await ctx.logTool("image_analysis", { imageUrl });
      try {
        const analysis = await analyzeImage({ imageUrl, articleTitle: headline, articleContent: bodyText.slice(0, 3000), checkQuality: true, generateAltText: true, detectContent: true, checkRelevance: true });
        if (analysis.success) {
          const result = ImageResult.parse({
            analyzed: true,
            imageUrl,
            suitability: (analysis.relevanceScore ?? 0) >= 60 && !analysis.hasSensitiveContent ? "suitable" : (analysis.relevanceScore ?? 0) >= 35 ? "questionable" : "unsuitable",
            captionAr: (analysis.contentDescription?.ar ?? "").slice(0, 400) || "وصف غير متاح",
            altTextAr: (analysis.altTextAr ?? "").slice(0, 300) || headline.slice(0, 300),
            qualityScore: analysis.qualityScore ?? null,
            contentWarnings: analysis.contentWarnings ?? [],
            identityCaveatAr: caveat,
          });
          return {
            ok: true,
            output: {
              summaryAr: `حلّلت عدسة الصورة: ملاءمة ${result.suitability}، جودة ${result.qualityScore ?? "—"}`,
              factsUsed: [],
              sources: [{ title: "الصورة المرفقة", url: imageUrl }],
              confidence: Math.round(analysis.relevanceScore ?? 50),
              missingInfo: [],
              warnings: result.contentWarnings,
              nextActionAr: "اعتماد بشري للصورة والتعليق",
              result,
            },
          };
        }
        return { ok: false, escalate: "needs_info", reasonAr: `تعذر تحليل الصورة: ${analysis.error ?? "خطأ غير معروف"}` };
      } catch (err) {
        return { ok: false, escalate: "needs_info", reasonAr: `رابط الصورة مرفوض أو غير قابل للتحليل: ${err instanceof Error ? err.message : String(err)}` };
      }
    }

    // لا صورة: اقتراح وصف/تعليق من النص فقط — بوضوح أنه لم يُحلَّل أي صورة
    const system = baseSystemPrompt(OPS_AGENTS.adasa.roleAr, `لا توجد صورة مرفقة. اقترح تعليقًا ونصًا بديلًا يناسبان الخبر لو توفرت صورة مطابقة، بلا وصف لمشهد لم تره. suitability = "no_image".
أعد JSON: summaryAr, factsUsed, sources, confidence, missingInfo, warnings, nextActionAr, result{analyzed:false, imageUrl:null, suitability:"no_image", captionAr, altTextAr, qualityScore:null, contentWarnings[], identityCaveatAr}`);
    const { data } = await callModelJson(ctx, "adasa", system, `العنوان: ${headline}\n\n${fenceExternal("نص الخبر المعتمد", bodyText)}${humanNotesBlock(ctx)}`, BaseOutputSchema.extend({ result: ImageResult }));
    data.result.analyzed = false;
    data.result.suitability = "no_image";
    data.result.identityCaveatAr = caveat;
    return { ok: true, output: toAgentOutput(data, data.result) };
  },
};

// ── ساعي: تجهيز الإشعار (لا إرسال) ──

const PushResult = z.object({
  title: looseString(80, 3),
  body: looseString(160, 3),
  audience: looseEnum(["all", "breaking_subscribers", "category_followers", "sports_followers"] as const, "all"),
  timing: looseEnum(["now", "within_15_min", "next_slot", "hold"] as const, "hold"),
  rationaleAr: looseString(400),
  sent: z.literal(false),
});

export const saaiAgent: OpsAgentHandler = {
  slug: "saai",
  resultSchema: PushResult,
  async run(ctx) {
    const qa = ctx.priorOutputs.qa?.result as z.infer<typeof QaResult> | undefined;
    const headline = qa?.finalHeadline ?? ctx.main.title;
    const bodyText = qa?.finalBody ?? ctx.main.description;
    const system = baseSystemPrompt(OPS_AGENTS.saai.roleAr, `جهّز مقترح إشعار فوري من المادة المعتمدة فقط: عنوان ≤ 60 حرفًا، نص ≤ 120 حرفًا، جمهور من {all, breaking_subscribers, category_followers, sports_followers}، توقيت من {now, within_15_min, next_slot, hold}، وسبب الاختيار. الحقل sent يجب أن يكون false دائمًا — أنت لا ترسل.
أعد JSON: summaryAr, factsUsed, sources, confidence, missingInfo, warnings, nextActionAr, result{title, body, audience, timing, rationaleAr, sent:false}`);
    const { data } = await callModelJson(ctx, "saai", system, `العنوان: ${headline}\n\n${fenceExternal("نص الخبر المعتمد", bodyText)}\nنوع المهمة: ${ctx.main.taskType}${humanNotesBlock(ctx)}`, BaseOutputSchema.extend({ result: PushResult }));
    data.result.sent = false;
    return { ok: true, output: toAgentOutput(data, data.result) };
  },
};

export { SourceSchema };
