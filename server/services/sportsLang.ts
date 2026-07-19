import { AsyncLocalStorage } from "node:async_hooks";

/**
 * لغة استجابة بوابة الرياضة على مستوى الطلب.
 *
 * المصدر من المزوّد (API-Football) إنجليزي؛ الطبقة الافتراضية تُعرّبه. عند طلب
 * الإنجليزية نتخطّى التعريب ونُعيد الاسم الإنجليزي الأصلي. نمرّر اللغة عبر
 * AsyncLocalStorage بدل تمريرها كوسيط في عشرات الدوال — تقرؤها دوال التعريب
 * المنخفضة (localizeSplTeamName / localizeSplRound / resolveSportsNames …).
 *
 * الافتراضي "ar" فاستجابة العربية (الجمهور الحالي) تبقى مطابقة تمامًا ما لم
 * يطلب العميل الإنجليزية صراحةً.
 */
export type SportsLang = "ar" | "en";

const store = new AsyncLocalStorage<SportsLang>();

export function runWithSportsLang<T>(lang: SportsLang, fn: () => T): T {
  return store.run(lang, fn);
}

export function currentSportsLang(): SportsLang {
  return store.getStore() ?? "ar";
}

export function isEnglishSports(): boolean {
  return store.getStore() === "en";
}

/** يستنتج اللغة من ?lang= أو رأس Accept-Language (التطبيق يرسل en). */
export function sportsLangFromReq(req: {
  headers?: Record<string, unknown>;
  query?: Record<string, unknown>;
}): SportsLang {
  const q = String(req.query?.lang ?? "").trim().toLowerCase();
  if (q === "en") return "en";
  if (q === "ar") return "ar";
  const accept = String(req.headers?.["accept-language"] ?? "").trim().toLowerCase();
  return accept.startsWith("en") ? "en" : "ar";
}
