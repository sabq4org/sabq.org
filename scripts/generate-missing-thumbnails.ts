import { generateArticleThumbnail } from "../server/services/thumbnailService";
import { db } from "../server/db";
import { articles } from "../shared/schema";
import { eq, and, isNotNull, or, sql } from "drizzle-orm";

async function generateMissingThumbnails() {
  console.log("🔍 Finding articles with imageUrl but no thumbnailUrl...");
  
  const articlesToFix = await db
    .select({ id: articles.id, imageUrl: articles.imageUrl, title: articles.title })
    .from(articles)
    .where(
      and(
        isNotNull(articles.imageUrl),
        or(
          eq(articles.thumbnailUrl, ""),
          sql`${articles.thumbnailUrl} IS NULL`
        )
      )
    )
    .limit(10);
  
  console.log(`📋 Found ${articlesToFix.length} articles needing thumbnails`);
  
  for (const article of articlesToFix) {
    if (!article.imageUrl) continue;
    console.log(`🖼️ Generating thumbnail for: ${article.id} - ${article.title?.substring(0, 30)}...`);
    try {
      const thumbnailUrl = await generateArticleThumbnail(article.id, article.imageUrl);
      console.log(`✅ Generated: ${thumbnailUrl}`);
    } catch (err) {
      console.error(`❌ Failed for ${article.id}:`, err);
    }
  }
  
  console.log("🎉 Done!");
  process.exit(0);
}

generateMissingThumbnails();
