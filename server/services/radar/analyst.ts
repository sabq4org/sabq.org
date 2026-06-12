/**
 * محلل الرادار — فلترة الذكاء: يقيّم القيمة الإخبارية لجمهور سبق (0–100)،
 * يترجم العنوان والملخص ترجمة تفسيرية (لا حرفية)، ويرشّح تصنيفًا من القائمة
 * المعتمدة. دفعة واحدة لكل نداء نموذج لخفض الكلفة والزمن.
 */
import type { AIModelConfig } from "../../ai-manager";
import type { RadarItem } from "@shared/schema";
import { generateWithFallback } from "./aiChain";
import { approvedCategories, updateItem } from "./repo";
import { parseAnalysisPayload } from "./parsing";

const ANALYST_MODEL_CHAIN: AIModelConfig[] = [
  { provider: "anthropic", model: "claude-haiku-4-5", maxTokens: 6000, temperature: 0.2 },
  { provider: "openai", model: "gpt-5.1", maxTokens: 6000, jsonMode: true },
];

const fmtRiyadh = (date: Date): string =>
  date.toLocaleString("ar-SA", {
    timeZone: "Asia/Riyadh",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

function buildAnalysisPrompt(
  items: RadarItem[],
  categoryList: { slug: string; nameAr: string }[]
): string {
  const itemsBrief = items
    .map(
      (item, i) =>
        `${i + 1}. id: ${item.id}\n   اللغة: ${item.originalLanguage || "غير معروفة"}\n   تاريخ النشر: ${item.publishedAt ? fmtRiyadh(new Date(item.publishedAt)) : "غير معروف"}\n   العنوان: ${item.originalTitle}\n   الملخص: ${item.originalExcerpt || "(لا يوجد)"}`
    )
    .join("\n");
  const categoriesBrief = categoryList.map((c) => `- ${c.slug}: ${c.nameAr}`).join("\n");

  return `أنت محلل أخبار في غرفة رصد صحيفة "سبق" الإلكترونية السعودية. الآن: ${fmtRiyadh(new Date())} بتوقيت الرياض. أمامك مواد التقطها الرادار من مصادر عالمية بلغات مختلفة. قيّم كل مادة لجمهور سبق (القارئ السعودي والخليجي والعربي).

لكل مادة أعد:
- newsValue: قيمة إخبارية من 0 إلى 100. عوامل الرفع: خبر عاجل/طارئ، شأن سعودي أو خليجي مباشر، حدث عالمي كبير يهم القارئ العربي، انفراد أو تطور جديد. عوامل الخفض: شأن محلي أجنبي ضيق، مادة ترويجية، خبر قديم متداول. قارن تاريخ النشر بالوقت الحالي أعلاه: مادة مضى على نشرها أكثر من يومين أو يتحدث متنها عن حدث انقضى فعلًا = قديمة، اخصم قيمتها بحدة (لا تتجاوز 30) ولا تعلّمها عاجلة أبدًا.
- isBreaking: هل هو خبر عاجل بطبيعته (حدث للتو ويستدعي نشرًا فوريًا)؟ يُشترط أن يكون تاريخ نشره خلال الساعات الأخيرة.
- translatedTitle: عنوان عربي بترجمة تفسيرية صحفية (انقل المعنى والسياق، لا الكلمات) — من 5 إلى 12 كلمة.
- translatedSummary: ملخص عربي من جملتين إلى ثلاث ينقل جوهر الخبر بدقة دون أي إضافة من عندك.
- categorySlug: الأنسب من قائمة التصنيفات المعتمدة أدناه فقط، أو null إن لم يصلح أي منها.
- breakdown: { breaking, saudiRelevance, regionalRelevance, novelty (كلها 0–100), reason (جملة تعليل واحدة بالعربية) }

قواعد صارمة:
- لا تضف أي معلومة غير واردة في العنوان/الملخص الأصلي.
- ترجمة تفسيرية لا حرفية: أسماء الجهات والأشخاص بصيغتها العربية المتعارف عليها.
- المواد:
${itemsBrief}

التصنيفات المعتمدة:
${categoriesBrief}

أعد JSON صالحًا فقط دون أي نص خارجه بهذه الصيغة:
{"items": [{"id": "...", "newsValue": 0, "isBreaking": false, "translatedTitle": "...", "translatedSummary": "...", "categorySlug": "..." أو null, "breakdown": {"breaking": 0, "saudiRelevance": 0, "regionalRelevance": 0, "novelty": 0, "reason": "..."}}]}`;
}

/** يحلل دفعة مواد بنداء نموذج واحد ويكتب النتائج على الصفوف. يعيد المواد المحدّثة. */
export async function analyzeItems(items: RadarItem[]): Promise<RadarItem[]> {
  if (!items.length) return [];
  const categoryList = await approvedCategories();
  const validSlugs = new Set(categoryList.map((c) => c.slug));
  const prompt = buildAnalysisPrompt(items, categoryList);

  const response = await generateWithFallback(prompt, ANALYST_MODEL_CHAIN);
  const analyses = parseAnalysisPayload(response.content);
  const byId = new Map(analyses.map((a) => [a.id, a]));
  const updated: RadarItem[] = [];
  for (const item of items) {
    const analysis = byId.get(item.id);
    if (!analysis || !analysis.translatedTitle) {
      // النموذج أسقط المادة — تبقى new وتُعاد المحاولة بالدورة التالية
      continue;
    }
    const row = await updateItem(item.id, {
      status: "analyzed",
      newsValue: analysis.newsValue,
      isBreaking: analysis.isBreaking,
      translatedTitle: analysis.translatedTitle,
      translatedSummary: analysis.translatedSummary,
      suggestedCategorySlug:
        analysis.categorySlug && validSlugs.has(analysis.categorySlug)
          ? analysis.categorySlug
          : null,
      scoreBreakdown: analysis.breakdown,
      analyzedAt: new Date(),
      error: null,
    });
    if (row) updated.push(row);
  }
  return updated;
}
