/**
 * مطوِّر الرادار — «طوّر ببحث» من نظام التحرير الموحد.
 *
 * الفرق عن المحوّل (transformer): قبل التوليد يُجرى بحث ويب يبني «سياق تحقق»
 * موثقاً بروابطه، فيُسمح للمسودة بالإثراء من هذا السياق حصراً مع العزو الصريح —
 * بينما المحوّل ممنوع من أي حقيقة خارج المادة. المخرج بنفس عقد مسودة الرادار
 * فيمر عبر التصدير القائم بلا تغيير، مع ملاحظات مراجع ومصادر تظهر في البطاقة.
 *
 * غياب مفاتيح البحث لا يُفشل المهمة: تُنفذ بوضع متحفظ وتُدوَّن ملاحظة بذلك.
 *
 * المرجع: docs/editorial-ai-unified-system-plan-2026-08-03.md (المرحلة 2)
 */
import type { AIModelConfig } from "../../ai-manager";
import { generateWithFallback } from "./aiChain";
import {
  SABQ_EDITORIAL_CORE_AR,
  SABQ_FALLBACK_EDITOR_MODEL,
  SABQ_PRIMARY_EDITOR_MODEL,
  SABQ_QUALITY_CHECKLIST_AR,
  SABQ_SEO_STANDARDS_AR,
} from "../../ai/sabqEditorialPrompt";
import { SABQ_CONSTITUTION_AR } from "../../ai/prompts/constitution";
import type { RadarItem, RadarSource } from "@shared/schema";
import { approvedCategories, getSource, updateItem } from "./repo";
import { parseDraftPayload } from "./parsing";
import {
  buildVerificationContext,
  isWebSearchConfigured,
  type WebSearchResult,
} from "../webSearchService";

const DEVELOPER_MODEL_CHAIN: AIModelConfig[] = [
  { provider: "anthropic", model: SABQ_PRIMARY_EDITOR_MODEL, maxTokens: 10_000, temperature: 0.35, feature: "radar-develop" },
  { provider: "openai", model: SABQ_FALLBACK_EDITOR_MODEL, maxTokens: 10_000, jsonMode: true, feature: "radar-develop" },
];

/** استعلامات التحقق تُشتق من المادة نفسها — بلا نداء نموذج إضافي */
function buildSearchQueries(item: RadarItem): string[] {
  const queries: string[] = [];
  if (item.originalTitle?.trim()) queries.push(item.originalTitle.trim().slice(0, 120));
  const arabic = (item.translatedTitle || item.translatedSummary || "").trim();
  if (arabic) queries.push(arabic.slice(0, 120));
  return queries;
}

function buildDevelopPrompt(
  item: RadarItem,
  source: RadarSource | undefined,
  categoryList: { slug: string; nameAr: string }[],
  verificationContext: string | null,
): string {
  const categoriesBrief = categoryList.map((c) => `- ${c.slug}: ${c.nameAr}`).join("\n");
  const sourceName = source?.name || "مصدر أجنبي";

  const enrichmentRules = verificationContext
    ? `## قواعد الإثراء (مهمة «طوّر»)
- يجوز الإثراء **حصراً** من «سياق التحقق» أدناه، مع عزو كل إضافة لمصدرها داخل المتن
  («بحسب...»/«وفق...») — وممنوع منعاً باتاً أي معلومة من خارج المادة والسياق معاً.
- إن تعارض السياق مع المادة الأصلية فرجّح الأحدث/الأدق واذكر الترجيح في editorNotes.
- صحّح صيغ الجزم غير المسنودة في المادة الأصلية («أعلن» بلا إعلان رسمي → «تقارير»).
- ابحث عن الزاوية السعودية/الخليجية في السياق وقدّمها إن وُجدت.
- المتن من 300 إلى 650 كلمة بحسب غنى السياق — لا تحشُ.

${verificationContext}`
    : `## وضع متحفظ (البحث غير متاح)
- لم يُجرَ بحث تحقق خارجي. أثرِ بالصياغة والبنية فقط دون أي حقيقة غير واردة في المادة،
  واذكر في editorNotes قائمة ما يجب التحقق منه قبل النشر (وسمِّ الجهات التي تُسأل).
- المتن من 250 إلى 450 كلمة.`;

  return `${SABQ_EDITORIAL_CORE_AR}

${SABQ_CONSTITUTION_AR}

${SABQ_SEO_STANDARDS_AR}

${SABQ_QUALITY_CHECKLIST_AR}

## المهمة: طوّر مادة الرادار إلى تقرير متكامل
رصد رادار سبق المادة الأجنبية أدناه. طوّرها إلى خبر/تقرير عربي كامل جاهز للنشر:
- ترجمة تفسيرية لا حرفية، وتوحيد أسماء الأشخاص والجهات بصيغتها العربية المتعارف عليها.
- انسب الخبر لمصدره الأصلي («بحسب ${sourceName}») مرة واحدة على الأقل في أول فقرتين.
- المتن HTML فقط بوسوم <p> و<h2> و<ul>/<li>. لا تكرر العنوان داخل المتن.
- لا تذكر أنك ذكاء اصطناعي ولا تشر إلى "الرادار" أو "المادة المرصودة".

${enrichmentRules}

## المادة المرصودة
- المصدر: ${sourceName} (اللغة: ${item.originalLanguage || "غير معروفة"})
- الرابط: ${item.link}
- العنوان الأصلي: ${item.originalTitle}
- الملخص/المتن الأصلي: ${item.originalExcerpt || "(العنوان فقط)"}
${item.translatedSummary ? `- ملخص محلل الرادار: ${item.translatedSummary}` : ""}

## التصنيفات المعتمدة (اختر slug واحدًا منها فقط)
${categoriesBrief}

أعد JSON صالحًا فقط دون أي نص خارجه:
{
  "title": "العنوان الرئيسي (5–12 كلمة)",
  "subheadline": "العنوان الفرعي",
  "content": "<p>...</p>",
  "excerpt": "مقتطف حتى 200 حرف",
  "summary": "الموجز الذكي (2–3 جمل)",
  "tags": ["وسم1", "وسم2"],
  "seoTitle": "عنوان SEO ≤ 60 حرفًا",
  "seoDescription": "وصف ميتا 140–160 حرفًا",
  "seoKeywords": ["..."],
  "categorySlug": "...",
  "editorNotes": ["ما أُضيف من السياق وعزوه", "ما يحتاج تحققاً قبل النشر", "أي ترجيح بين روايات"],
  "sources": [{"title": "اسم المصدر", "url": "https://..."}]
}
- editorNotes إلزامية دائماً ولو بملاحظة واحدة.
- sources تقتصر على روابط وردت فعلاً في سياق التحقق (أو رابط المادة الأصلية) — لا تُخترع روابط.`;
}

function extractDevelopExtras(raw: string): {
  editorNotes: string[];
  sources: { title: string; url: string }[];
} {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  }
  try {
    const parsed: any = JSON.parse(cleaned);
    return {
      editorNotes: Array.isArray(parsed?.editorNotes)
        ? parsed.editorNotes.filter((n: unknown) => typeof n === "string").slice(0, 10)
        : [],
      sources: Array.isArray(parsed?.sources)
        ? parsed.sources
            .filter((s: any) => s && typeof s.title === "string" && typeof s.url === "string")
            .slice(0, 10)
        : [],
    };
  } catch {
    return { editorNotes: [], sources: [] };
  }
}

/** يطوّر المادة (بحث + توليد) ويكتب المسودة عليها (status → ready). */
export async function developItem(item: RadarItem): Promise<RadarItem> {
  const [source, categoryList] = await Promise.all([
    getSource(item.sourceId),
    approvedCategories(),
  ]);
  const validSlugs = new Set(categoryList.map((c) => c.slug));

  // البحث أولاً — فشله لا يوقف التطوير، يحوّله لوضع متحفظ
  let verification: { context: string; results: WebSearchResult[] } | null = null;
  if (isWebSearchConfigured()) {
    verification = await buildVerificationContext(buildSearchQueries(item));
  }

  const prompt = buildDevelopPrompt(item, source, categoryList, verification?.context ?? null);

  try {
    const response = await generateWithFallback(prompt, DEVELOPER_MODEL_CHAIN);
    const draft = parseDraftPayload(response.content);
    const extras = extractDevelopExtras(response.content);
    if (draft.categorySlug && !validSlugs.has(draft.categorySlug)) {
      draft.categorySlug = item.suggestedCategorySlug ?? source?.categorySlug ?? undefined;
    }
    const developedWithSearch = Boolean(verification);
    const updated = await updateItem(item.id, {
      draft: {
        ...draft,
        provider: response.provider,
        model: response.model,
        developNotes: developedWithSearch
          ? extras.editorNotes
          : [
              "طُوّرت بلا بحث تحقق خارجي (مفاتيح البحث غير مهيأة أو البحث فشل) — راجع الوقائع قبل النشر.",
              ...extras.editorNotes,
            ],
        developSources: extras.sources,
        developedWithSearch,
      },
      draftGeneratedAt: new Date(),
      status: "ready",
      error: null,
    });
    if (!updated) throw new Error("[Radar Developer] item vanished while updating");
    return updated;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateItem(item.id, { error: `develop: ${message}`.substring(0, 500) });
    throw error;
  }
}
