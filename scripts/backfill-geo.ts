import { db } from "../server/db";
import { articles } from "../shared/schema";
import { eq, and, isNull, desc, sql } from "drizzle-orm";
import { extractGeoLocations } from "../server/services/geoExtractionService";

async function backfill() {
  console.log("[GeoBackfill] Starting...");
  
  const missingArticles = await db
    .select({
      id: articles.id,
      title: articles.title,
      content: articles.content,
    })
    .from(articles)
    .where(
      and(
        eq(articles.status, 'published'),
        isNull(articles.geoLocations)
      )
    )
    .orderBy(desc(articles.publishedAt))
    .limit(30);

  console.log(`[GeoBackfill] Found ${missingArticles.length} articles to process`);
  
  let processed = 0;
  let failed = 0;

  for (const article of missingArticles) {
    try {
      const locations = await extractGeoLocations(article.title, article.content);
      await db.update(articles)
        .set({ geoLocations: locations.length > 0 ? locations : [] })
        .where(eq(articles.id, article.id));
      console.log(`  [${processed + 1}] ${article.title.substring(0, 50)} → ${locations.length} locations`);
      processed++;
      await new Promise(r => setTimeout(r, 300));
    } catch (err: any) {
      failed++;
      console.error(`  FAIL: ${article.title.substring(0, 50)} - ${err.message}`);
    }
  }

  console.log(`[GeoBackfill] Done: ${processed} processed, ${failed} failed`);
  process.exit(0);
}

backfill();
