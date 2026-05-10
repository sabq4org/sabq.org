import Parser from "rss-parser";
import { storage } from "./storage";
import { summarizeArticle } from "./openai";

const parser = new Parser();

interface RssItem {
  title?: string;
  link?: string;
  content?: string;
  contentSnippet?: string;
  pubDate?: string;
  creator?: string;
  isoDate?: string;
}

export async function importFromRssFeed(feedId: string, categoryId?: string, authorId?: string): Promise<number> {
  const feeds = await storage.getAllRssFeeds();
  const feed = feeds.find((f) => f.id === feedId);

  if (!feed || !feed.isActive) {
    throw new Error("RSS feed not found or inactive");
  }

  try {
    const parsed = await parser.parseURL(feed.url);
    let importCount = 0;

    for (const item of (parsed.items as RssItem[])) {
      if (!item.title || !item.content) continue;

      const slug = generateSlug(item.title);
      const existingArticle = await storage.getArticleBySlug(slug);

      if (existingArticle) continue;

      try {
        const aiSummary = await summarizeArticle(
          item.contentSnippet || item.content.substring(0, 1000)
        );

        if (!authorId) {
          console.warn(`Skipping article "${item.title}" - no authorId provided`);
          continue;
        }

        await storage.createArticle({
          title: item.title,
          slug,
          content: item.content,
          excerpt: item.contentSnippet?.substring(0, 200),
          categoryId: categoryId || feed.categoryId || undefined,
          authorId,
          status: "draft",
          aiSummary,
          aiGenerated: true,
          publishedAt: item.isoDate ? new Date(item.isoDate) : undefined,
        } as any);

        importCount++;
      } catch (error) {
        console.error(`Error importing article "${item.title}":`, error);
      }
    }

    await storage.updateRssFeedLastFetch(feedId);
    return importCount;
  } catch (error) {
    console.error("Error fetching RSS feed:", error);
    throw new Error("Failed to fetch RSS feed");
  }
}

function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\u0600-\u06FFa-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim()
    .substring(0, 100);
}
