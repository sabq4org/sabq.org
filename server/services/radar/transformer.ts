/**
 * محوّل الرادار التحريري — يحوّل مادة أجنبية مرصودة إلى مسودة عربية كاملة
 * بمعيار سبق الموحّد (sabqEditorialPrompt). القاعدة الذهبية: المصدر مُدخل خام
 * فقط — إعادة صياغة بلا أي حقيقة مضافة، مع نسبة الخبر لمصدره داخل المتن.
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
import type { RadarItem, RadarSource } from "@shared/schema";
import { approvedCategories, getSource, updateItem } from "./repo";
import { parseDraftPayload } from "./parsing";

const TRANSFORMER_MODEL_CHAIN: AIModelConfig[] = [
  { provider: "anthropic", model: SABQ_PRIMARY_EDITOR_MODEL, maxTokens: 8000, temperature: 0.4 },
  { provider: "openai", model: SABQ_FALLBACK_EDITOR_MODEL, maxTokens: 8000, jsonMode: true },
];

function buildTransformPrompt(
  item: RadarItem,
  source: RadarSource | undefined,
  categoryList: { slug: string; nameAr: string }[]
): string {
  const categoriesBrief = categoryList.map((c) => `- ${c.slug}: ${c.nameAr}`).join("\n");
  const sourceName = source?.name || "مصدر أجنبي";

  return `${SABQ_EDITORIAL_CORE_AR}

${SABQ_SEO_STANDARDS_AR}

${SABQ_QUALITY_CHECKLIST_AR}

## المهمة
رصد رادار سبق المادة الأجنبية أدناه. حوّلها إلى خبر عربي كامل جاهز للنشر في سبق:
- ترجمة تفسيرية لا حرفية: انقل المعنى والسياق بأسلوب صحفي عربي رصين، ووحّد أسماء الأشخاص والجهات بصيغتها العربية المتعارف عليها.
- انسب الخبر لمصدره داخل المتن نسبة طبيعية (مثل: «بحسب ${sourceName}» أو «نقلت ${sourceName}») مرة واحدة على الأقل في الفقرة الأولى أو الثانية.
- المتن HTML فقط بوسوم <p> و<h2> و<ul>/<li>، من 250 إلى 450 كلمة. لا تكرر العنوان داخل المتن.
- لا تذكر أنك ذكاء اصطناعي ولا تشر إلى "الرادار" أو "المادة المرصودة".
- يُمنع منعًا باتًا إضافة أي حقيقة أو رقم أو تصريح غير موجود في المادة الأصلية. إن كان المتاح قليلًا فاكتب خبرًا قصيرًا مكثفًا — لا تحشُ.

## المادة المرصودة (المصدر الوحيد المسموح)
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
  "categorySlug": "..."
}`;
}

/** يولّد المسودة التحريرية ويكتبها على المادة (status → ready). */
export async function transformItem(item: RadarItem): Promise<RadarItem> {
  const [source, categoryList] = await Promise.all([
    getSource(item.sourceId),
    approvedCategories(),
  ]);
  const validSlugs = new Set(categoryList.map((c) => c.slug));
  const prompt = buildTransformPrompt(item, source, categoryList);

  try {
    const response = await generateWithFallback(prompt, TRANSFORMER_MODEL_CHAIN);
    const draft = parseDraftPayload(response.content);
    if (draft.categorySlug && !validSlugs.has(draft.categorySlug)) {
      draft.categorySlug = item.suggestedCategorySlug ?? source?.categorySlug ?? undefined;
    }
    draft.provider = response.provider;
    draft.model = response.model;
    const updated = await updateItem(item.id, {
      draft,
      draftGeneratedAt: new Date(),
      status: "ready",
      error: null,
    });
    if (!updated) throw new Error("[Radar Transformer] item vanished while updating");
    return updated;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateItem(item.id, { error: `transform: ${message}`.substring(0, 500) });
    throw error;
  }
}
