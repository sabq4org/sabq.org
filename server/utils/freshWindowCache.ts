import { memoryCache, withCache } from "../memoryCache";

/**
 * عمر أقصى للنسخة التي تُسلَّم لطلب «طازج» (سحب التحديث أو الفحص الصامت).
 *
 * حادثة عاجل 2026-09-26 (04:03 بتوقيت الرياض): بعد بث 37 ألف إشعار، كل تطبيق
 * iOS يعود للواجهة يطلب `/homepage` و`/news/paginated` مع `Cache-Control:
 * no-cache` (checkForNewArticles). كان الخادم يتجاوز كاشه كليًا لهذه الطلبات،
 * فتُبنى الرئيسية من قاعدة البيانات لكل جهاز على حدة → pool=50/0idle/23wait
 * وتباطؤ كل المسارات 1–3 ثوانٍ. الآن الطلب الطازج يأخذ نسخة لا يتجاوز عمرها
 * هذه النافذة، ويُجمَّع المتزامنون على جلب واحد.
 */
export const FRESH_WINDOW_MS = 10_000;

/**
 * قراءة مكيّشة مع احترام طلب «الطازج» دون فتح الباب لموجة استعلامات.
 *
 * - الطلب العادي: `withCache(key, ttl)` كما كان.
 * - الطلب الطازج: مفتاح ظل `${key}:fresh` بعمر FRESH_WINDOW_MS وجلب واحد
 *   للمتزامنين؛ نتيجته تحدّث المفتاح الأساسي أيضًا.
 *
 * مفتاح الظل يبدأ بالمفتاح الأساسي، فأنماط الإبطال عند النشر (`^mobile`,
 * `^news-`, `article:.*<id>`) تمسحه معه — أول طلب طازج بعد النشر يبني من
 * جديد فورًا.
 */
export function readWithFreshWindow<T>(
  key: string,
  ttlMs: number,
  wantsFresh: boolean,
  fetcher: () => Promise<T>,
): Promise<T> {
  if (!wantsFresh) return withCache(key, ttlMs, fetcher);

  return withCache(`${key}:fresh`, FRESH_WINDOW_MS, async () => {
    const value = await fetcher();
    if (value != null) memoryCache.set(key, value, ttlMs);
    return value;
  });
}
