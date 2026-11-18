/**
 * قدرات «نشر سبق» (هوية nashr-sabq غير الشخصية) على مسارات المحرر.
 *
 * مصدر واحد للأسماء: كل مسار في botNewsEditor/botDrafts يُحرس بقدرة بدل فحص اسم
 * البوت المتناثر. مفتاح الإيقاف السريع يُقرأ عند كل طلب من البيئة
 * (BOT_EDITOR_DISABLED_CAPS=image.generate_gpt,article.delete أو * للكل).
 * لا شيء هنا يمنح صلاحية لتوكن آخر: الهوية تُحسم في الخادم.
 */
export const NASHR_EDITOR_CAPABILITIES = [
  "article.read",
  "article.edit",
  "article.ready",
  "article.publish",
  "article.schedule",
  "article.archive",
  "article.delete",
  "article.unpublish",
  "article.visibility",
  "article.revision",
  "article.translate",
  "article.push",
  "image.generate",
  "image.generate_gpt",
  "image.edit",
  "image.cover",
  "media.search",
  "media.delete",
  "ai.extras",
  "ai.titles",
  "ai.proofread",
  "ai.compare_headlines",
  // مقالات الرأي والتحليل والعمود (عبر خدمة مكتب الرأي)
  "opinion.read",
  "opinion.edit",
  "opinion.lifecycle",
  "opinion.image",
] as const;

export type NashrEditorCapability = (typeof NASHR_EDITOR_CAPABILITIES)[number];

/** الأرقام الكاملة للمواد المحمية (حُسمت بـ SELECT على الإنتاج 2026-11-18). */
export const PROTECTED_ARTICLE_IDS: readonly string[] = [
  "d05bc8d5-dc9e-40d1-a07d-27dbe3ebd33a",
  "690f5287-43a6-4376-a052-8772e785a334",
  "8dab8d72-3c3a-4660-9c95-9a0ef4d5823d",
  "4cfda185-d2ce-4a9b-8d63-b5a7879603b2",
  "7696f378-fe29-40f4-b8dc-287d4f3f76fb",
];

/** «*» تعطّل كل القدرات. أسماء غير معروفة تُتجاهل (لا تعطّل شيئاً بالخطأ). */
export function disabledEditorCapabilities(raw: string | undefined = process.env.BOT_EDITOR_DISABLED_CAPS): Set<string> {
  const out = new Set<string>();
  for (const part of (raw ?? "").split(",")) {
    const name = part.trim();
    if (name === "*") return new Set<string>(NASHR_EDITOR_CAPABILITIES);
    if ((NASHR_EDITOR_CAPABILITIES as readonly string[]).includes(name)) out.add(name);
  }
  return out;
}

export function isEditorCapabilityEnabled(capability: NashrEditorCapability, raw?: string): boolean {
  return !disabledEditorCapabilities(raw ?? process.env.BOT_EDITOR_DISABLED_CAPS).has(capability);
}

/** إضافات اختيارية بلا إعادة نشر: BOT_EDITOR_PROTECTED_ARTICLE_IDS=id1,id2 */
export function protectedArticleIds(raw: string | undefined = process.env.BOT_EDITOR_PROTECTED_ARTICLE_IDS): Set<string> {
  const ids = new Set<string>(PROTECTED_ARTICLE_IDS);
  for (const part of (raw ?? "").split(",")) {
    const id = part.trim();
    if (/^[A-Za-z0-9_-]{8,128}$/.test(id)) ids.add(id);
  }
  return ids;
}

export function isProtectedArticleId(id: string): boolean {
  return protectedArticleIds().has(id);
}

export const BOT_GPT_DEFAULT_DAILY_CAP = 20;

/** السقف اليومي لصور GPT المدفوعة من البوت. BOT_EDITOR_GPT_DAILY_CAP=0 يوقفها كلياً. */
export function botGptDailyCap(raw: string | undefined = process.env.BOT_EDITOR_GPT_DAILY_CAP): number {
  if (raw === undefined || raw.trim() === "") return BOT_GPT_DEFAULT_DAILY_CAP;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : BOT_GPT_DEFAULT_DAILY_CAP;
}

/** أنواع المواد غير الخبرية التي يديرها نشر سبق في PR الرأي. نوع «opinion» يمرّ عبر مكتب الرأي. */
export const OPINION_ARTICLE_TYPES = ["opinion", "analysis", "column"] as const;
export function isOpinionArticleType(type: unknown): type is (typeof OPINION_ARTICLE_TYPES)[number] {
  return typeof type === "string" && (OPINION_ARTICLE_TYPES as readonly string[]).includes(type);
}
