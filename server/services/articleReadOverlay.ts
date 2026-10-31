export interface ArticleReadOverlay {
  views: number | null;
  mediaAssets: { url: string; altText: string; displayOrder: number }[];
}

/**
 * Share only concurrent, user-neutral DB reads. No TTL: the next read after
 * completion sees edits, removed attachments and newly merged view counts.
 * Personal reactions/bookmarks and recordArticleRead must stay outside this.
 */
export function createArticleReadOverlayCoalescer(maxKeys = 256, deadlineMs = 20_000) {
  const flights = new Map<string, Promise<ArticleReadOverlay>>();
  return async (articleId: string, load: () => Promise<ArticleReadOverlay>): Promise<ArticleReadOverlay> => {
    let flight = flights.get(articleId);
    if (!flight) {
      const tracked = flights.size < maxKeys;
      // A stalled database/transport must not pin this article forever. The
      // deadline releases callers and the map; it does not cancel DB work.
      flight = new Promise<ArticleReadOverlay>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Article read overlay timed out")), deadlineMs);
        Promise.resolve().then(load).then(
          (value) => { clearTimeout(timer); resolve(value); },
          (error) => { clearTimeout(timer); reject(error); },
        );
      });
      if (tracked) {
        flights.set(articleId, flight);
        const current = flight;
        const release = () => {
          if (flights.get(articleId) === current) flights.delete(articleId);
        };
        void flight.then(release, release);
      }
    }
    const result = await flight;
    // A caller adding its own response fields cannot mutate another reader.
    return { views: result.views, mediaAssets: result.mediaAssets.map((asset) => ({ ...asset })) };
  };
}

export const coalesceArticleReadOverlay = createArticleReadOverlayCoalescer();

type OverlayAsset = ArticleReadOverlay["mediaAssets"][number];

/**
 * صور الألبوم المحفوظة في `articles.albumImages` (المحرر، طلبات التعديل،
 * تطبيق المراسل) لا تصل لتطبيقَي iOS وأندرويد لأنهما يعرضان `mediaAssets`
 * فقط، بينما الويب يعرض الحقلين. نضيفها لـ mediaAssets بعد صور الجدول، بلا
 * تكرار ولا الصورة البارزة، فتظهر في التطبيقات المثبتة دون تحديث (2026-10-31).
 */
export function withAlbumMediaAssets<T extends object>(article: T): T {
  const row = article as { albumImages?: unknown; mediaAssets?: unknown; imageUrl?: unknown };
  const album = Array.isArray(row.albumImages)
    ? row.albumImages.filter((url): url is string => typeof url === "string" && url.trim().length > 0)
    : [];
  if (!album.length) return article;
  const existing: OverlayAsset[] = Array.isArray(row.mediaAssets) ? (row.mediaAssets as OverlayAsset[]) : [];
  const seen = new Set<string>(existing.map((asset) => asset.url));
  if (typeof row.imageUrl === "string") seen.add(row.imageUrl);
  let order = existing.reduce((max, asset) => Math.max(max, Number(asset.displayOrder) || 0), 0);
  const extra: OverlayAsset[] = [];
  for (const url of album) {
    if (seen.has(url)) continue;
    seen.add(url);
    order += 1;
    extra.push({ url, altText: "", displayOrder: order });
  }
  return extra.length ? ({ ...article, mediaAssets: [...existing, ...extra] } as T) : article;
}
