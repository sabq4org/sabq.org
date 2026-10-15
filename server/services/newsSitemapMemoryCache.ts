// كاش الذاكرة لـ sitemap-news.xml (3 دقائق). منفصل عن كائن Express حتى
// تستطيع أرشفة البوت إسقاطه فور تغيّر status دون انتظار المهلة.

export interface NewsSitemapMemoryEntry {
  xml: string;
  ts: number;
}

let entry: NewsSitemapMemoryEntry | null = null;

export function readNewsSitemapMemoryCache(): NewsSitemapMemoryEntry | null {
  return entry;
}

export function writeNewsSitemapMemoryCache(value: NewsSitemapMemoryEntry): void {
  entry = value;
}

export function clearNewsSitemapMemoryCache(): void {
  entry = null;
}
