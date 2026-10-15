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
