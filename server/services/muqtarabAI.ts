/**
 * مُقترب — مساعد الكاتب الذكي (اقتراح عناوين، تدقيق لغوي، وصف مختصر).
 */
import { aiManager } from "../ai-manager";
import { generateNewsImage } from "./visualAiService";
import {
  getAutoGenerationSettings,
  updateAutoGenerationSettings,
} from "./autoImageGenerationService";

const MODEL = {
  provider: "openai" as const,
  model: "gpt-4o-mini",
  jsonMode: true,
  feature: "muqtarab-ai",
};

function extractJson(raw: string): unknown | null {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function truncate(text: string, max = 6000): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "…";
}

/** يقترح 3 عناوين جذابة بناءً على المحتوى. */
export async function suggestTitles(opts: {
  content: string;
  currentTitle?: string;
}): Promise<{ titles: string[] }> {
  const plain = truncate(stripHtml(opts.content));
  if (plain.length < 30) {
    throw new Error("المحتوى قصير جداً — اكتب فقرة على الأقل لاقتراح عناوين");
  }

  const prompt = `أنت محرر عناوين عربي في منصة تحليلية اسمها «مُقترب».
اقترح 3 عناوين جذابة لموضوع رأي/تحليل (ليست عناوين خبر عاجل).
العناوين قصيرة (8–14 كلمة)، واضحة، بلا علامات اقتباس.

${opts.currentTitle ? `العنوان الحالي: ${opts.currentTitle}\n` : ""}
المحتوى:
${plain}

أعد JSON فقط بهذا الشكل:
{"titles":["عنوان 1","عنوان 2","عنوان 3"]}`;

  const res = await aiManager.generate(prompt, MODEL);
  if (res.error) throw new Error(res.error);

  const parsed = extractJson(res.content || "") as { titles?: string[] } | null;
  const titles = (parsed?.titles || [])
    .map((t) => String(t).trim())
    .filter(Boolean)
    .slice(0, 3);

  if (titles.length === 0) throw new Error("لم يُرجع الذكاء الاصطناعي عناوين صالحة");
  return { titles };
}

/** يصحّح الأخطاء الإملائية والنحوية ويعيد النص المُصحَّح. */
export async function proofreadContent(opts: {
  content: string;
  title?: string;
}): Promise<{ correctedText: string; notes: string }> {
  const plain = truncate(stripHtml(opts.content));
  if (plain.length < 20) {
    throw new Error("المحتوى قصير جداً للتدقيق");
  }

  const prompt = `أنت مدقق لغوي عربي محترف. صحّح الأخطاء الإملائية والنحوية والترقيم في النص التالي.
لا تغيّر المعنى ولا تضف معلومات جديدة. حافظ على أسلوب الكاتب.

${opts.title ? `العنوان: ${opts.title}\n` : ""}
النص:
${plain}

أعد JSON فقط:
{"correctedText":"النص المصحح كاملاً","notes":"ملخص قصير لأهم التصحيحات (جملة أو جملتان)"}`;

  const res = await aiManager.generate(prompt, MODEL);
  if (res.error) throw new Error(res.error);

  const parsed = extractJson(res.content || "") as { correctedText?: string; notes?: string } | null;
  const correctedText = String(parsed?.correctedText || "").trim();
  if (!correctedText) throw new Error("لم يُرجع الذكاء الاصطناعي نصاً مصححاً");

  return {
    correctedText,
    notes: String(parsed?.notes || "تم التدقيق اللغوي").trim(),
  };
}

/** يولّد وصفاً مختصراً للموضوع. */
export async function suggestExcerpt(opts: {
  content: string;
  title: string;
}): Promise<{ excerpt: string }> {
  const plain = truncate(stripHtml(opts.content));
  if (plain.length < 30) {
    throw new Error("المحتوى قصير جداً لتوليد وصف");
  }

  const prompt = `اكتب وصفاً مختصراً (جملتان كحد أقصى، 120–180 حرفاً) لموضوع تحليلي عربي.
الوصف يجذب القارئ ولا يكرر العنوان حرفياً.

العنوان: ${opts.title}
المحتوى:
${plain}

أعد JSON فقط: {"excerpt":"الوصف المختصر"}`;

  const res = await aiManager.generate(prompt, MODEL);
  if (res.error) throw new Error(res.error);

  const parsed = extractJson(res.content || "") as { excerpt?: string } | null;
  const excerpt = String(parsed?.excerpt || "").trim();
  if (!excerpt) throw new Error("لم يُرجع الذكاء الاصطناعي وصفاً");

  return { excerpt };
}

/** يقترح كلمات مفتاحية ووصف ميتا لتحسين ظهور الموضوع في محركات البحث (SEO). */
export async function suggestSeo(opts: {
  title: string;
  content: string;
}): Promise<{ keywords: string[]; metaDescription: string; metaTitle: string }> {
  const plain = truncate(stripHtml(opts.content));
  if (plain.length < 30) {
    throw new Error("المحتوى قصير جداً لاقتراح بيانات SEO");
  }

  const prompt = `أنت خبير SEO عربي. حلّل الموضوع التالي واقترح بيانات تحسين محركات البحث.

المتطلبات:
- "keywords": من 5 إلى 8 كلمات/عبارات مفتاحية عربية دقيقة يبحث بها الناس فعلاً (بلا تكرار، بلا وسوم #).
- "metaTitle": عنوان ميتا جذّاب (50–60 حرفاً) يتضمن أهم كلمة مفتاحية.
- "metaDescription": وصف ميتا (140–160 حرفاً) يلخّص الموضوع ويحفّز النقر.

العنوان: ${opts.title}
المحتوى:
${plain}

أعد JSON فقط:
{"keywords":["..."],"metaTitle":"...","metaDescription":"..."}`;

  const res = await aiManager.generate(prompt, MODEL);
  if (res.error) throw new Error(res.error);

  const parsed = extractJson(res.content || "") as
    | { keywords?: string[]; metaTitle?: string; metaDescription?: string }
    | null;

  const keywords = Array.isArray(parsed?.keywords)
    ? parsed!.keywords.map((k) => String(k).trim().replace(/^#/, "")).filter(Boolean).slice(0, 8)
    : [];
  const metaDescription = String(parsed?.metaDescription || "").trim();
  const metaTitle = String(parsed?.metaTitle || "").trim();

  if (keywords.length === 0 && !metaDescription) {
    throw new Error("لم يُرجع الذكاء الاصطناعي بيانات SEO صالحة");
  }

  return { keywords, metaDescription, metaTitle };
}

// ============================================================
// توليد صورة الغلاف (Hero) — مسؤول النظام فقط، مرتبط بإعدادات التوليد التلقائي
// ============================================================

const HERO_STYLES = ["photorealistic", "illustration", "abstract", "infographic"] as const;

/**
 * يولّد صورة غلاف لموضوع مُقترب بالاعتماد على نفس بنية التوليد المستخدمة في المقالات
 * (Nano Banana / Gemini عبر generateNewsImage)، ويحترم «إعدادات التوليد التلقائي للصور»
 * (التفعيل، النمط الافتراضي، الحد الشهري) المحفوظة في system_settings.
 */
export async function generateTopicHero(opts: {
  title: string;
  excerpt?: string;
  content?: string;
}): Promise<{ imageUrl: string; thumbnailUrl?: string }> {
  const title = String(opts.title || "").trim();
  if (!title) throw new Error("العنوان مطلوب لتوليد صورة الغلاف");

  const settings = await getAutoGenerationSettings();

  if (!settings.enabled) {
    throw new Error(
      "توليد الصور بالذكاء الاصطناعي معطّل — فعّله من «إعدادات التوليد التلقائي للصور» في لوحة التحكم",
    );
  }

  const max = settings.maxMonthlyGenerations ?? 0;
  const used = settings.currentMonthGenerations ?? 0;
  if (max > 0 && used >= max) {
    throw new Error(
      `تم بلوغ الحد الشهري لتوليد الصور (${max}). عدّل الحد من إعدادات التوليد.`,
    );
  }

  const summary =
    opts.excerpt?.trim() || stripHtml(opts.content || "").slice(0, 400) || undefined;
  const style = (HERO_STYLES.includes(settings.defaultStyle as any)
    ? settings.defaultStyle
    : "photorealistic") as (typeof HERO_STYLES)[number];

  const result = await generateNewsImage({
    articleTitle: title,
    articleSummary: summary,
    category: "مُقترب",
    language: "ar",
    style,
  });

  if (!result.success || !result.imageUrl) {
    throw new Error(result.error || "فشل توليد صورة الغلاف");
  }

  // تحديث عدّاد الاستخدام الشهري ضمن إعدادات التوليد
  try {
    await updateAutoGenerationSettings({
      currentMonthGenerations: used + 1,
      lastResetMonth: new Date().getMonth(),
    });
  } catch {
    // عدم منع نجاح التوليد بسبب فشل تحديث العدّاد
  }

  return { imageUrl: result.imageUrl, thumbnailUrl: result.thumbnailUrl };
}

// ============================================================
// مساعد الإدارة (AI Gatekeeper) — ملخص + فحص سياسات + تصنيف
// ============================================================

export interface ReviewAssist {
  summary: string;
  policy: {
    risk: "low" | "medium" | "high";
    flags: string[];
    note: string;
  };
}

/** يزوّد المراجع بملخص قصير + فحص مبدئي للسياسات (خطاب كراهية/تشهير/إساءة). */
export async function assistReview(opts: {
  title: string;
  content: string;
}): Promise<ReviewAssist> {
  const plain = truncate(stripHtml(opts.content));
  if (plain.length < 30) {
    throw new Error("المحتوى قصير جداً للمساعدة في المراجعة");
  }

  const prompt = `أنت مساعد تحرير في منصة إخبارية سعودية. راجع الموضوع التالي وأعد:
1) ملخصاً من 3 أسطر يساعد المحرر على قرار أولي.
2) فحص سياسات النشر: ابحث عن خطاب كراهية، تشهير، قذف، تحريض، أو إساءة صريحة.

العنوان: ${opts.title}
المحتوى:
${plain}

أعد JSON فقط بهذا الشكل:
{
  "summary": "ملخص من 3 أسطر",
  "risk": "low | medium | high",
  "flags": ["وسم قصير لكل مخالفة محتملة (فارغة إن لا يوجد)"],
  "note": "جملة توضح سبب التقييم"
}`;

  const res = await aiManager.generate(prompt, MODEL);
  if (res.error) throw new Error(res.error);

  const parsed = extractJson(res.content || "") as
    | { summary?: string; risk?: string; flags?: string[]; note?: string }
    | null;

  const summary = String(parsed?.summary || "").trim();
  if (!summary) throw new Error("لم يُرجع الذكاء الاصطناعي ملخصاً");

  const risk = (["low", "medium", "high"].includes(String(parsed?.risk))
    ? parsed!.risk
    : "low") as "low" | "medium" | "high";

  const flags = Array.isArray(parsed?.flags)
    ? parsed!.flags.map((f) => String(f).trim()).filter(Boolean).slice(0, 8)
    : [];

  return {
    summary,
    policy: {
      risk,
      flags,
      note: String(parsed?.note || "").trim() || "لا ملاحظات",
    },
  };
}

/** يقترح تصنيفاً للموضوع/الطلب الوارد من قائمة تصنيفات معروفة. */
export async function classifySubmission(opts: {
  text: string;
  categories: { value: string; label: string }[];
}): Promise<{ category: string; confidence: number }> {
  const plain = truncate(stripHtml(opts.text), 3000);
  if (plain.length < 20) {
    throw new Error("النص قصير جداً للتصنيف");
  }

  const list = opts.categories.map((c) => `${c.value} = ${c.label}`).join("\n");
  const prompt = `صنّف النص العربي التالي ضمن أحد التصنيفات المتاحة فقط.

التصنيفات المتاحة (value = label):
${list}

النص:
${plain}

أعد JSON فقط: {"category":"value المناسب","confidence":0.0}`;

  const res = await aiManager.generate(prompt, MODEL);
  if (res.error) throw new Error(res.error);

  const parsed = extractJson(res.content || "") as
    | { category?: string; confidence?: number }
    | null;

  const valid = new Set(opts.categories.map((c) => c.value));
  const category = parsed?.category && valid.has(String(parsed.category))
    ? String(parsed.category)
    : "other";
  const confidence = Math.min(1, Math.max(0, Number(parsed?.confidence) || 0));

  return { category, confidence };
}
