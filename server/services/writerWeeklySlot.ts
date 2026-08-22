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

export function attachWriterWeeklySlots<T extends SlotCandidate>(
  articles: T[],
  slotsByWriter: Record<string, WriterWeeklySlot>,
): Array<T & { writerWeeklySlot?: WriterWeeklySlot }> {
  return articles.map((article) => {
    if (!isOpinionWriterDraft(article) || !article.authorId) return article;
    const slot = slotsByWriter[article.authorId];
    if (!slot) return article;
    return { ...article, writerWeeklySlot: slot };
  });
}
