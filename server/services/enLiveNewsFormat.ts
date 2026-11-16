// منطق بحت لعقد «Moment by Moment» الإنجليزي (/api/en/live/*).
// الشكل يطابق ما تقرؤه client/src/pages/en/EnglishMomentByMoment.tsx:
// categoryName (لا categoryNameAr) و englishSlug للرابط /en/article/${englishSlug || slug}.

export const EN_LIVE_UNCATEGORIZED = "Uncategorized";
export const EN_LIVE_SUMMARY_CHARS = 150;
export const EN_LIVE_BREAKING_LIMIT = 5;

export interface EnLiveRow {
  id: string;
  title: string;
  slug: string;
  englishSlug: string | null;
  imageUrl: string | null;
  imageFocalPoint: { x: number; y: number } | null;
  publishedAt: Date | null;
  updatedAt: Date | null;
  newsType: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  viewsCount: number | null;
  excerpt: string | null;
  content: string | null;
}

export interface EnLiveItem {
  id: string;
  title: string;
  slug: string;
  englishSlug: string | null;
  imageUrl: string | null;
  imageFocalPoint: { x: number; y: number } | null;
  publishedAt: string;
  updatedAt: string;
  isBreaking: boolean;
  categoryId: string;
  categoryName: string;
  categoryColor: string | null;
  viewsCount: number;
  commentsCount: number;
  summary: string;
}

export interface EnLiveUpdatesPayload {
  items: EnLiveItem[];
  nextCursor: string | null;
}

/** ملخص نصي قصير: المقتطف إن وُجد، وإلا أول 150 حرفًا من المتن بلا وسوم. */
export function enLiveSummary(excerpt: string | null | undefined, content: string | null | undefined): string {
  const clean = (s: string) => s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  const ex = excerpt ? clean(excerpt) : "";
  if (ex) return ex.length > EN_LIVE_SUMMARY_CHARS ? `${ex.substring(0, EN_LIVE_SUMMARY_CHARS)}...` : ex;
  const body = content ? clean(content) : "";
  if (!body) return "";
  return body.length > EN_LIVE_SUMMARY_CHARS ? `${body.substring(0, EN_LIVE_SUMMARY_CHARS)}...` : body;
}

export function toEnLiveItem(row: EnLiveRow, commentsCount: number): EnLiveItem {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    englishSlug: row.englishSlug || null,
    imageUrl: row.imageUrl || null,
    imageFocalPoint: row.imageFocalPoint || null,
    publishedAt: row.publishedAt?.toISOString() || "",
    updatedAt: row.updatedAt?.toISOString() || "",
    isBreaking: row.newsType === "breaking",
    categoryId: row.categoryId || "",
    categoryName: row.categoryName || EN_LIVE_UNCATEGORIZED,
    categoryColor: row.categoryColor || null,
    viewsCount: row.viewsCount || 0,
    commentsCount,
    summary: enLiveSummary(row.excerpt, row.content),
  };
}

/** يقطع الصف الزائد (limit + 1) ويحسب المؤشر التالي من آخر عنصر معروض. */
export function buildEnLivePage(
  rows: EnLiveRow[],
  limit: number,
  commentsCountMap: Record<string, number>,
): EnLiveUpdatesPayload {
  const hasMore = rows.length > limit;
  const pageRows = rows.slice(0, limit);
  const last = pageRows[pageRows.length - 1];
  return {
    items: pageRows.map((r) => toEnLiveItem(r, commentsCountMap[r.id] || 0)),
    nextCursor: hasMore && last?.publishedAt ? last.publishedAt.toISOString() : null,
  };
}

/** المؤشر طابع زمني ISO؛ أي قيمة أخرى تُرفض (400) بدل خطأ SQL من ::timestamp. */
export function parseEnLiveCursor(raw: unknown): { ok: true; cursor?: string } | { ok: false } {
  if (raw === undefined || raw === null || raw === "") return { ok: true };
  if (typeof raw !== "string" || raw.length > 40 || Number.isNaN(Date.parse(raw))) return { ok: false };
  return { ok: true, cursor: new Date(raw).toISOString() };
}

/** معرّف تصنيف اختياري؛ القيم الغريبة تُرفض حتى لا تصل للاستعلام. */
export function parseEnLiveCategory(raw: unknown): { ok: true; categoryId?: string } | { ok: false } {
  if (raw === undefined || raw === null || raw === "" || raw === "all") return { ok: true };
  if (typeof raw !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(raw)) return { ok: false };
  return { ok: true, categoryId: raw };
}
