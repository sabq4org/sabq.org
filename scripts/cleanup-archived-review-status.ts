/**
 * One-shot cleanup: null `review_status` on every article that's already
 * archived but still carries a stale review_status value. Run once after
 * deploying the archive-flow fix that nulls review_status going forward.
 *
 * Symptom this fixes: contributor dashboards (reporter + opinion author)
 * render archived articles as "needs revision" rows because the legacy
 * archive code path never cleared review_status. The dashboard guard is
 * `reviewStatus === "needs_changes"`, so clearing the column to null
 * makes the stale notes banner go away.
 *
 * Usage (local Neon URL by default; pass the production DATABASE_URL
 * via env to run against prod):
 *
 *   npx tsx scripts/cleanup-archived-review-status.ts
 *
 * Idempotent — safe to run multiple times.
 */

import "dotenv/config";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "../server/db";
import { articles, enArticles, urArticles } from "../shared/schema";

async function main() {
  const dbUrl = process.env.DATABASE_URL ?? "";
  const tag = dbUrl.includes("prod") || dbUrl.includes("production")
    ? "🟥 PROD"
    : "🟢 dev/staging";
  console.log(`[cleanup] target: ${tag}`);

  const results: { table: string; cleared: number }[] = [];

  // Main Arabic articles
  const beforeAr = await db
    .select({ count: articles.id })
    .from(articles)
    .where(and(eq(articles.status, "archived"), isNotNull(articles.reviewStatus)));
  const arCount = beforeAr.length;
  if (arCount > 0) {
    await db
      .update(articles)
      .set({ reviewStatus: null })
      .where(and(eq(articles.status, "archived"), isNotNull(articles.reviewStatus)));
  }
  results.push({ table: "articles (ar)", cleared: arCount });

  // English articles
  const beforeEn = await db
    .select({ count: enArticles.id })
    .from(enArticles)
    .where(and(eq(enArticles.status, "archived"), isNotNull(enArticles.reviewStatus)));
  const enCount = beforeEn.length;
  if (enCount > 0) {
    await db
      .update(enArticles)
      .set({ reviewStatus: null })
      .where(and(eq(enArticles.status, "archived"), isNotNull(enArticles.reviewStatus)));
  }
  results.push({ table: "en_articles", cleared: enCount });

  // Urdu articles
  const beforeUr = await db
    .select({ count: urArticles.id })
    .from(urArticles)
    .where(and(eq(urArticles.status, "archived"), isNotNull(urArticles.reviewStatus)));
  const urCount = beforeUr.length;
  if (urCount > 0) {
    await db
      .update(urArticles)
      .set({ reviewStatus: null })
      .where(and(eq(urArticles.status, "archived"), isNotNull(urArticles.reviewStatus)));
  }
  results.push({ table: "ur_articles", cleared: urCount });

  console.table(results);
  console.log("[cleanup] done");
  process.exit(0);
}

main().catch((err) => {
  console.error("[cleanup] failed:", err);
  process.exit(1);
});
