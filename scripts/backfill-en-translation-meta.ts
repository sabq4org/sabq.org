/**
 * Backfill EN translation metadata from Arabic sources:
 *   - categoryId (via slug / name match)
 *   - newsType (breaking sync)
 *
 * Only touches en_articles that have seoMetadata.sourceArticleId.
 *
 * USAGE:
 *   tsx scripts/backfill-en-translation-meta.ts              # dry-run
 *   tsx scripts/backfill-en-translation-meta.ts --apply
 *   tsx scripts/backfill-en-translation-meta.ts --apply --limit=100
 *   tsx scripts/backfill-en-translation-meta.ts --apply --i-understand  # if URL looks like prod
 *
 * Honors DB_DRIVER via server/db.
 */

import { db, pool } from "../server/db";
import { articles, enArticles } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { resolveEnCategoryId } from "../server/services/enArticleTranslationService";

const argv = process.argv.slice(2);
const has = (f: string) => argv.includes(f);
const val = (k: string) => {
  const a = argv.find((x) => x.startsWith(`${k}=`));
  return a ? a.slice(k.length + 1) : undefined;
};

const APPLY = has("--apply");
const I_UNDERSTAND = has("--i-understand");
const LIMIT = parseInt(val("--limit") || "0", 10) || 0;

const dbUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || "";
if (/prod|production|neon\.tech/i.test(dbUrl) && !I_UNDERSTAND) {
  console.error("[backfill-en-meta] ABORT: DB URL looks remote/prod. Pass --i-understand to override.");
  process.exit(2);
}

async function main() {
  console.log(`[backfill-en-meta] mode=${APPLY ? "APPLY" : "DRY-RUN"} limit=${LIMIT || "none"}`);

  let q = db
    .select({
      id: enArticles.id,
      title: enArticles.title,
      categoryId: enArticles.categoryId,
      newsType: enArticles.newsType,
      seoMetadata: enArticles.seoMetadata,
    })
    .from(enArticles)
    .where(sql`${enArticles.seoMetadata}->>'sourceArticleId' IS NOT NULL`)
    .$dynamic();

  if (LIMIT > 0) q = q.limit(LIMIT);

  const rows = await q;
  console.log(`[backfill-en-meta] candidates=${rows.length}`);

  let catFixed = 0;
  let newsFixed = 0;
  let skipped = 0;

  for (const row of rows) {
    const sourceId =
      row.seoMetadata && typeof row.seoMetadata === "object"
        ? (row.seoMetadata as { sourceArticleId?: string }).sourceArticleId
        : undefined;
    if (!sourceId) {
      skipped++;
      continue;
    }

    const [ar] = await db
      .select({
        categoryId: articles.categoryId,
        newsType: articles.newsType,
      })
      .from(articles)
      .where(eq(articles.id, sourceId))
      .limit(1);

    if (!ar) {
      skipped++;
      continue;
    }

    const updates: { categoryId?: string | null; newsType?: string; updatedAt?: Date } = {};

    if (!row.categoryId && ar.categoryId) {
      const { enCategoryId } = await resolveEnCategoryId(ar.categoryId);
      if (enCategoryId) {
        updates.categoryId = enCategoryId;
        catFixed++;
      }
    }

    if (ar.newsType && ar.newsType !== row.newsType) {
      updates.newsType = ar.newsType;
      newsFixed++;
    }

    if (Object.keys(updates).length === 0) continue;

    updates.updatedAt = new Date();
    console.log(
      `  ${APPLY ? "UPDATE" : "would"} ${row.id.slice(0, 8)}… "${(row.title || "").slice(0, 50)}"`,
      updates,
    );

    if (APPLY) {
      await db.update(enArticles).set(updates).where(eq(enArticles.id, row.id));
    }
  }

  console.log(`[backfill-en-meta] categoryFixes=${catFixed} newsTypeFixes=${newsFixed} skipped=${skipped}`);
  if (!APPLY) console.log("[backfill-en-meta] dry-run only — re-run with --apply to write");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    try {
      await pool?.end?.();
    } catch {
      /* ignore */
    }
  });
