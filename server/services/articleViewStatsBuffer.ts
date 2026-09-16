export type PendingArticleView = {
  articleId: string;
  ipHash: string;
  userId: string | null;
  count: number;
};

/** In-memory aggregation keeps growth proportional to distinct article/IP pairs. */
export class ArticleViewStatsBuffer {
  private readonly entries = new Map<string, PendingArticleView>();

  add(articleId: string, ipHash: string, userId: string | null, count = 1): void {
    const key = `${articleId}|${ipHash}`;
    const current = this.entries.get(key);
    if (current) {
      current.count += count;
      if (!current.userId && userId) current.userId = userId;
      return;
    }
    this.entries.set(key, { articleId, ipHash, userId, count });
  }

  drain(): PendingArticleView[] {
    const drained = [...this.entries.values()];
    this.entries.clear();
    return drained;
  }

  get size(): number {
    return this.entries.size;
  }
}
