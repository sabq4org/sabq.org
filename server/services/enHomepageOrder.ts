import { desc, sql } from "drizzle-orm";
import { enArticles } from "@shared/schema";

/** Publication time ranks ordinary stories; editorial placement can raise a story above it. */
export function enHomepageOrder() {
  return desc(sql`greatest(${enArticles.displayOrder}, extract(epoch from ${enArticles.publishedAt}))`);
}
