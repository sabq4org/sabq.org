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
  { provider: "anthropic", model: "claude-haiku-4-5", maxTokens: 6000, temperature: 0.2, feature: "radar" },
  { provider: "openai", model: "gpt-5.1", maxTokens: 6000, jsonMode: true, feature: "radar" },
];

const PUBLISHER_TYPE_AR: Record<string, string> = {
  official: "جهة رسمية",
  wire: "وكالة أنباء",
  major: "مؤسسة إعلامية كبرى",
  press_release: "بيان صحفي مدفوع",
  aggregator: "مجمّع/ناقل",
  social: "منشور تواصل",
  unknown: "غير مصنف",
};

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
    .map((item, i) => {
      const flags = (item.qualityFlags ?? []).filter((f) => f !== "title_only");
      const lines = [
        `${i + 1}. id: ${item.id}`,
        `   اللغة: ${item.originalLanguage || "غير معروفة"}`,
        `   الناشر: ${item.publisher || item.publisherKey || "غير معروف"} (${PUBLISHER_TYPE_AR[item.publisherType ?? "unknown"] ?? "غير مصنف"})`,
        `   تاريخ النشر: ${item.publishedAt && !flags.includes("future_date") ? fmtRiyadh(new Date(item.publishedAt)) : "غير موثوق/غير معروف"}`,
        `   العنوان: ${item.originalTitle}`,
        item.textBasis === "title_only"
          ? `   المتن: (لم يُقرأ — عنوان فقط)`
          : `   المقتطف: ${item.originalExcerpt || "(لا يوجد)"}`,
      ];
      if (flags.length) lines.push(`   تنبيهات آلية: ${flags.join("، ")}`);
      return lines.join("\n");
    })
    .join("\n");
  const categoriesBrief = categoryList.map((c) => `- ${c.slug}: ${c.nameAr}`).join("\n");

  return `أنت محلل أخبار في غرفة رصد صحيفة "سبق" الإلكترونية السعودية. الآن: ${fmtRiyadh(new Date())} بتوقيت الرياض. أمامك مواد التقطها الرادار من مصادر عالمية بلغات مختلفة. قيّم كل مادة لجمهور سبق (القارئ السعودي والخليجي والعربي).

أولويات سبق فقط (ارفع القيمة بقوة إن انطبقت، واخفض بشدة إن غابت):
1) شأن سعودي/خليجي مباشر.
2) تصعيد أو تطور أمريكا–إيران أو ما يمس أمن المنطقة والطاقة.
3) كأس العالم / فيفا.
4) لاعبون عالميون مشهورون أو أندية الدوري السعودي.
5) حدث عالمي استثنائي كبير (كارثة كبرى، اغتيال، حرب/وقف إطلاق نار مفصلي).
خارج هذه الدوائر (سياسة داخلية أمريكية ضيقة، جريمة محلية، رياضة أمريكية محلية، ترند ترفيهي) → newsValue ≤ 25 عادةً.

لكل مادة أعد:
- newsValue: قيمة إخبارية من 0 إلى 100 وفق الأولويات أعلاه. عوامل الخفض: شأن محلي أجنبي ضيق، مادة ترويجية، خبر قديم متداول. قارن تاريخ النشر بالوقت الحالي أعلاه: مادة مضى على نشرها أكثر من يومين أو يتحدث متنها عن حدث انقضى فعلًا = قديمة، اخصم قيمتها بحدة (لا تتجاوز 30) ولا تعلّمها عاجلة أبدًا.
- isBreaking: هل هو خبر عاجل بطبيعته (حدث للتو ويستدعي نشرًا فوريًا)؟ يُشترط أن يكون تاريخ نشره خلال الساعات الأخيرة. هذا طلب يُراجع آليًا (الزمن والناشر والتأييد)، فلا ترفعه إلا بدليل.
- eventTiming: توقيت الحدث نفسه لا تاريخ الصفحة: "new" (وقع/أُعلن الآن أو اليوم) · "ongoing" (قصة مستمرة فيها تطور جديد) · "old" (الحدث انقضى سابقًا والمادة إعادة تدوير/ذكرى/أرشيف — مثل مباراة أو كارثة من عام سابق بتاريخ صفحة حديث) · "unknown" (لا يكفي النص للحكم). لا تخمّن تاريخًا لم يذكره النص.
- timingEvidence: العبارة من النص (أو سببك في جملة قصيرة) التي بنيت عليها eventTiming.
- contentType: "news" خبر · "claim" ادعاء/تصريح طرف غير مؤكد · "analysis" تحليل · "opinion" رأي · "press_release" بيان ترويجي/تجاري · "other".
- translatedTitle: عنوان عربي بترجمة تفسيرية صحفية (انقل المعنى والسياق، لا الكلمات) — من 5 إلى 12 كلمة. للادعاء انسبه لصاحبه في العنوان.
- translatedSummary: ملخص عربي من جملتين إلى ثلاث ينقل جوهر الخبر بدقة دون أي إضافة من عندك. إن كان المتن «لم يُقرأ — عنوان فقط» فأعد "" (سلسلة فارغة) ولا تكتب ملخصًا.
- categorySlug: الأنسب من قائمة التصنيفات المعتمدة أدناه فقط، أو null إن لم يصلح أي منها.
- breakdown: { breaking, saudiRelevance, regionalRelevance, novelty (كلها 0–100), reason (جملة تعليل واحدة بالعربية) }

قواعد صارمة:
- لا تضف أي معلومة غير واردة في العنوان/الملخص الأصلي.
- «تنبيهات آلية» مثل past_year:2022 تعني ذكر سنة ماضية؛ تحقق هل الحدث قديم فعلًا. missing_date/future_date تعني أن تاريخ الصفحة غير موثوق.
- ترجمة تفسيرية لا حرفية: أسماء الجهات والأشخاص بصيغتها العربية المتعارف عليها.
- المواد:
${itemsBrief}

التصنيفات المعتمدة:
${categoriesBrief}

أعد JSON صالحًا فقط دون أي نص خارجه بهذه الصيغة:
{"items": [{"id": "...", "newsValue": 0, "isBreaking": false, "eventTiming": "new", "timingEvidence": "...", "contentType": "news", "translatedTitle": "...", "translatedSummary": "...", "categorySlug": "..." أو null, "breakdown": {"breaking": 0, "saudiRelevance": 0, "regionalRelevance": 0, "novelty": 0, "reason": "..."}}]}`;
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
    const titleOnly = item.textBasis === "title_only";
    const row = await updateItem(item.id, {
      status: "analyzed",
      newsValue: analysis.newsValue,
      // العاجل يقرره triage.decideBreaking بعد التجميع (gates.ts) — هنا طلب فقط
      isBreaking: false,
      eventTiming: analysis.eventTiming,
      timingEvidence: analysis.timingEvidence,
      contentType: analysis.contentType,
      translatedTitle: analysis.translatedTitle,
      // العنوان وحده لا يُلخَّص — تمنع ملخصات إنشائية لا سند لها
      translatedSummary: titleOnly ? null : analysis.translatedSummary || null,
      suggestedCategorySlug:
        analysis.categorySlug && validSlugs.has(analysis.categorySlug)
          ? analysis.categorySlug
          : null,
      scoreBreakdown: { ...analysis.breakdown, breakingRequested: analysis.isBreaking },
      analyzedAt: new Date(),
      error: null,
    });
    if (row) updated.push(row);
  }
  return updated;
}
