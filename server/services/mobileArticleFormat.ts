/**
 * تنسيق المادة لواجهة التطبيقات `/api/v1` (iOS وأندرويد).
 * نُقل من `server/routes/mobileApiRoutes.ts` (الملف عند سقف max-lines).
 */

export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

export function makeExcerpt(text: string, maxLen = 200): string {
  const plain = stripHtml(text);
  return plain.length > maxLen ? plain.slice(0, maxLen) + "…" : plain;
}

export function estimateReadingMinutes(text: string): number {
  const words = stripHtml(text).split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
}

/**
 * الإنفوجرافيك: `imageUrl` هو الإنفوجرافيك الطولي الكامل، و`infographicBannerUrl`
 * صورة الواجهة العرضية 16:9. في القوائم نرسل صورة الواجهة في `image_url` حتى
 * تعرض التطبيقات المثبتة صورة نظيفة بدل جزء مقصوص من الطولي، بلا تحديث.
 * صفحة التفاصيل تبقي `image_url` كما هو (الإنفوجرافيك الكامل) للتطبيقات القديمة.
 */
export function mobileInfographicImages(
  article: { articleType?: string | null; imageUrl?: string | null; thumbnailUrl?: string | null; infographicBannerUrl?: string | null },
  detail: boolean,
): { imageUrl: string | null; fullUrl: string | null } {
  const defaultUrl = article.imageUrl || article.thumbnailUrl || null;
  if (article.articleType !== "infographic") return { imageUrl: defaultUrl, fullUrl: null };
  const banner = article.infographicBannerUrl?.trim() || null;
  return {
    imageUrl: detail ? defaultUrl : banner || defaultUrl,
    fullUrl: article.imageUrl || null,
  };
}

export function formatArticleForMobile(row: any, baseUrl: string, opts: { detail?: boolean } = {}) {
  const article = row.article;
  const infographic = mobileInfographicImages(article, opts.detail === true);
  // The byline shown to readers is the **reporter** chosen from the editor's
  // dropdown (`articles.reporterId`), NOT the staff member who entered the
  // article (`articles.authorId`, auto-set to req.user.id). Fall through to
  // author only when no reporter was selected, then to the generic newspaper
  // label as a last resort.
  const byline = row.reporter
    ? `${row.reporter.firstName || ""} ${row.reporter.lastName || ""}`.trim()
    : row.author
    ? `${row.author.firstName || ""} ${row.author.lastName || ""}`.trim()
    : "";
  return {
    id: article.id,
    title: article.title,
    subtitle: article.subtitle || null,
    slug: article.slug,
    body: stripHtml(article.content || ""),
    excerpt: article.excerpt || makeExcerpt(article.content || ""),
    // Dashboard-generated AI summary. iOS uses this for the "الموجز الذكي"
    // card; web reads `aiSummary` directly. Falls through to null when the
    // article hasn't been processed yet so the iOS card can fall back to
    // `excerpt` the same way the web does.
    ai_summary: article.aiSummary || null,
    section: row.category?.nameAr || "عام",
    section_id: row.category?.id || null,
    author: byline || "سبق",
    published_at: article.publishedAt?.toISOString() || null,
    updated_at: article.updatedAt?.toISOString() || null,
    image_url: infographic.imageUrl,
    // Editorial focal point ({x, y} as percentages 0–100 from top-left)
    // — drives the .fill-mode crop on iOS so the subject of the hero
    // stays in frame on featured cards, story rails, and detail. The
    // articleCardSelect was already including imageFocalPoint in the
    // SQL projection, but this serializer used to drop it; the iOS
    // FocalCachedAsyncImage fell back to centre on every card. Pass
    // it through verbatim — iOS's decodeFocalPoint accepts both
    // camelCase and snake_case keys.
    image_focal_point: article.imageFocalPoint || null,
    // True when the hero (or thumbnail, when no hero exists) was
    // produced by the dashboard's AI image generator. iOS uses this
    // to overlay a "مولّدة بالذكاء الاصطناعي" badge on the image —
    // same convention as ImageWithCaption.tsx on the web.
    is_ai_generated_image: article.isAiGeneratedImage
      || (article.imageUrl == null && article.isAiGeneratedThumbnail)
      || false,
    ai_image_model: article.aiImageModel || null,
    article_url: `${baseUrl}/article/${article.slug}`,
    is_breaking: article.newsType === "breaking",
    is_featured: article.isFeatured || false,
    // شارة «قراءة» التحريرية: كانت في الإسقاط (articleCardSelect) والصف الكامل
    // لكن المُسلسِل يُسقطها، فلا يعرف iOS/Android الشارة التي يعرضها الويب
    // (بلاغ المالك 2026-09-13). العميلان يفكّان is_reading/isReading معًا.
    is_reading: article.isReading === true,
    reading_minutes: estimateReadingMinutes(article.content || ""),
    // نوع المادة + الإنفوجرافيك الكامل: التطبيقات المحدَّثة تعرض صفحة
    // الإنفوجرافيك (الموجز ثم الصورة كاملة)، والقديمة تتجاهل الحقلين.
    article_type: article.articleType || "news",
    infographic_image_url: infographic.fullUrl,
    views_count: article.viewsCount || article.views || 0,
    shares_count: article.sharesCount || article.shares || 0,
  };
}
