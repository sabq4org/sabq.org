/** موعد الجدول الأسبوعي لكاتب الرأي — يُعرض في قائمة المسودات دون فتح المقال. */
export type WriterWeeklySlot = {
  weekday: number;
  publishTime: string;
  nextSlot: string;
};

type SlotCandidate = {
  status: string;
  articleType?: string | null;
  authorId?: string | null;
};

export function isOpinionWriterDraft(article: SlotCandidate): boolean {
  return article.status === "draft" && article.articleType === "opinion" && Boolean(article.authorId);
}

export function collectOpinionDraftWriterIds(articles: SlotCandidate[]): string[] {
  return [
    ...new Set(
      articles
        .filter(isOpinionWriterDraft)
        .map((article) => article.authorId as string),
    ),
  ];
}

/** المسودات التي يوزّعها attachWriterWeeklySlots في هذا الرد — تُستثنى من أرضية الموعد. */
export function collectOpinionDraftIds(articles: Array<SlotCandidate & { id?: string | null }>): string[] {
  return articles.filter(isOpinionWriterDraft).map((article) => article.id).filter((id): id is string => Boolean(id));
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

type DistributableDraft = SlotCandidate & {
  id?: string;
  reviewStatus?: string | null;
  createdAt?: string | Date | null;
};

function createdAtMs(value: string | Date | null | undefined): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
}

function isInFlightReview(article: DistributableDraft): boolean {
  return article.reviewStatus === "pending_review" || article.reviewStatus === "approved";
}

/**
 * مسودات الكاتب لا تأخذ الموعد نفسه: قيد المراجعة/الاعتماد أولاً، ثم الأقدم إنشاءً.
 * كل مسودة تالية تُزاح أسبوعاً عن موعد القاعدة.
 */
export function attachWriterWeeklySlots<T extends DistributableDraft>(
  articles: T[],
  slotsByWriter: Record<string, WriterWeeklySlot>,
): Array<T & { writerWeeklySlot?: WriterWeeklySlot }> {
  const indexesByWriter = new Map<string, number[]>();
  articles.forEach((article, index) => {
    if (!isOpinionWriterDraft(article) || !article.authorId) return;
    if (!slotsByWriter[article.authorId]) return;
    const list = indexesByWriter.get(article.authorId) ?? [];
    list.push(index);
    indexesByWriter.set(article.authorId, list);
  });

  const slotByIndex = new Map<number, WriterWeeklySlot>();
  for (const [writerId, indexes] of indexesByWriter) {
    const base = slotsByWriter[writerId];
    const baseMs = new Date(base.nextSlot).getTime();
    if (!Number.isFinite(baseMs)) continue;
    const ordered = [...indexes].sort((leftIndex, rightIndex) => {
      const left = articles[leftIndex];
      const right = articles[rightIndex];
      const rank = Number(isInFlightReview(left)) - Number(isInFlightReview(right));
      if (rank !== 0) return -rank;
      const created = createdAtMs(left.createdAt) - createdAtMs(right.createdAt);
      if (created !== 0) return created;
      return String(left.id ?? leftIndex).localeCompare(String(right.id ?? rightIndex));
    });
    ordered.forEach((index, offset) => {
      slotByIndex.set(index, {
        ...base,
        nextSlot: new Date(baseMs + offset * WEEK_MS).toISOString(),
      });
    });
  }

  return articles.map((article, index) => {
    const slot = slotByIndex.get(index);
    return slot ? { ...article, writerWeeklySlot: slot } : article;
  });
}
