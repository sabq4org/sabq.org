// أول مقطع لكل مسار تعرّفه قشرة SPA في client/src/App.tsx (Switch واحد
// ينتهي بمسار NotFound). مسار يبدأ بمقطع غير موجود هنا ينتهي حتمًا بصفحة
// «غير موجودة» في المتصفح، فيعلن /api/edge/seo-meta له 404 حقيقيًا بدل 200
// مع index,follow (Soft 404). القائمة متعمدة على مستوى المقطع الأول فقط:
// لا تعيد 404 لصفحة حقيقية مهما تعمّق مسارها.
// المزامنة مع App.tsx يفرضها tests/unit/spaTopLevelRoutes.test.ts.
export const SPA_TOP_LEVEL_SEGMENTS: ReadonlySet<string> = new Set([
  "2fa-verify", "about", "about-ai", "accessibility-statement", "accidents",
  "admin", "advertise", "ai", "ai-policy", "ai-publisher", "ar", "arab",
  "article", "articles", "asian-cup", "author", "breaking", "business", "cars",
  "categories", "category", "complete-name", "contact", "correspondent",
  "culture", "daily-brief", "dashboard", "dashboard2", "developers", "economy",
  "en", "entertainment", "entity", "focus", "forgot-password", "gulf",
  "gulf-cup", "gulf-live", "health", "ifox", "infographic-demo", "interests",
  "keyword", "kings-cup", "lite", "live", "local", "login", "loyalty",
  "loyalty-preview", "loyalty-terms", "media", "media-store", "meet",
  "moment-by-moment", "muqtarab", "my-follows", "my-keywords", "mylife",
  "nd96-preview", "news", "newsletter", "notification-settings",
  "notifications", "omq", "onboarding", "opinion", "opinion-author", "payment",
  "plus-preview", "politics", "predictions", "preferences", "privacy",
  "profile", "prompt-studio", "recommendation-settings", "register",
  "reporter", "reset-password", "roshn", "rsl", "rss", "sabq-ai", "saudi",
  "saudia", "set-password", "settings", "shorts", "society", "sponsored",
  "sport", "sports", "sports10", "sports2", "sports22", "sports3", "sports4",
  "sports5", "sports55", "stations", "super-cup", "survey", "tech",
  "technology", "term", "terms", "tourism", "ur", "verify", "verify-email",
  "world", "world-cup",
]);

/** true إذا كان للمسار مقطع أول تعرفه SPA (أو كان الرئيسية). */
export function isKnownSpaTopLevelPath(path: string): boolean {
  const first = path.split(/[?#]/)[0].split("/").filter(Boolean)[0];
  if (!first) return true;
  let segment = first;
  try {
    segment = decodeURIComponent(first);
  } catch {
    // مقطع بترميز معطوب ليس مسارًا في SPA.
    return false;
  }
  return SPA_TOP_LEVEL_SEGMENTS.has(segment.toLowerCase());
}
