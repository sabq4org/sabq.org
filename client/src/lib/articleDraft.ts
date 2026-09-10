/** Compare the draft with the SAME defaults/normalizations used to load the form. */
export function draftDiffersFromArticle(draft: Record<string, unknown>, article: Record<string, any>): boolean {
  const image = (value: unknown) => typeof value === "string" && (/^https?:\/\/.+/.test(value) || value.startsWith("/")) ? value : "";
  let scheduledAt = "";
  if (article.scheduledAt && article.status !== "published") {
    const date = new Date(article.scheduledAt);
    const pad = (n: number) => String(n).padStart(2, "0");
    scheduledAt = `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  const stored: Record<string, unknown> = {
    ...article,
    articleType: article.articleType || "news",
    opinionAuthorId: article.articleType === "opinion" ? article.authorId : null,
    imageUrl: image(article.imageUrl), thumbnailUrl: image(article.thumbnailUrl),
    albumImages: Array.isArray(article.albumImages) ? article.albumImages : [],
    keywords: article.seo?.keywords || [],
    newsType: !article.newsType || article.newsType === "featured" ? "regular" : article.newsType,
    publishType: article.status === "published" ? "instant" : article.publishType || "instant",
    scheduledAt,
    metaTitle: article.seo?.metaTitle?.substring(0, 70) || "",
    metaDescription: article.seo?.metaDescription?.substring(0, 160) || "",
  };
  for (const key of ["isFeatured", "isReading", "hideFromHomepage", "isVideoTemplate"]) stored[key] = Boolean(article[key]);
  return Object.keys(draft).some(key => key !== "savedAt" &&
    JSON.stringify(draft[key] ?? "") !== JSON.stringify(stored[key] ?? ""));
}
