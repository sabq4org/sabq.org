/**
 * Backfill englishSlug for articles that have none.
 *
 * WHY: `englishSlug` is the canonical URL segment (/article/<englishSlug>).
 * Regular article creation sets it (routes.ts ~6920), but opinion creation
 * historically did NOT (fixed going forward in commit c5c64b7), and very old
 * rows may also be NULL. An article with NULL englishSlug is served at its
 * ARABIC slug with an Arabic self-canonical — inconsistent with the rest of
 * the index.
 *
 * generateEnglishSlug() just returns nanoid(7) (random, not title-derived),
 * so backfilling is collision-safe — no uniqueness lookup needed.
 *
 * ⚠️  IMPORTANT SEO CAVEAT — read before --apply:
 *   If an article is ALREADY indexed by Google under its Arabic slug,
 *   backfilling englishSlug makes /article/<arabicSlug> START 301-redirecting
 *   to /article/<nanoid>. That TEMPORARILY GROWS the "Page with redirect"
 *   bucket in GSC until Google re-processes and switches to the nanoid URL.
 *   So a blanket backfill of old, already-indexed rows can be counter-
 *   productive short-term. Safe scopes:
 *     --type=opinion   → only opinion articles (the known recent gap; these
 *                        are mostly NOT yet indexed). DEFAULT.
 *     --type=all       → every NULL-englishSlug article (use deliberately).
 *
 * USAGE:
 *   tsx scripts/backfill-english-slugs.ts                 # DRY RUN, opinion only
 *   tsx scripts/backfill-english-slugs.ts --apply         # write, opinion only
 *   tsx scripts/backfill-english-slugs.ts --type=all      # DRY RUN, all tables/types
 *   tsx scripts/backfill-english-slugs.ts --type=all --apply --limit=500
 *   tsx scripts/backfill-english-slugs.ts --tables=articles --type=all --apply
 *
 * FLAGS:
 *   --apply           actually write (default: dry-run, just counts/samples)
 *   --type=opinion    (default) only articleType='opinion' in the `articles` table
 *   --type=all        all NULL-englishSlug rows in the selected tables
 *   --tables=a,b      tables to process (default: articles). Options:
 *                     articles, en_articles, ur_articles
 *   --limit=N         cap rows per table (default: 0 = no cap)
 *   --i-understand    required if DATABASE_URL contains "prod"/"production"
 *
 * Honors DB_DRIVER (neon|pg) via ../server/db, same as the other scripts.
 */

import { db, pool } from "../server/db";
import { articles, enArticles, urArticles } from "@shared/schema";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { generateEnglishSlug } from "../server/utils/slugTransliterator";

const argv = process.argv.slice(2);
const has = (f: string) => argv.includes(f);
const val = (k: string) => {
  const a = argv.find((x) => x.startsWith(`${k}=`));
  return a ? a.slice(k.length + 1) : undefined;
};

const APPLY = has("--apply");
const I_UNDERSTAND = has("--i-understand");
const TYPE = (val("--type") || "opinion").toLowerCase(); // "opinion" | "all"
const LIMIT = parseInt(val("--limit") || "0", 10) || 0;
const TABLES = (val("--tables") || "articles").split(",").map((s) => s.trim());

const dbUrl = process.env.DATABASE_URL || "";
if (/prod|production/i.test(dbUrl) && !I_UNDERSTAND) {
  console.error("[backfill] ABORT: DATABASE_URL contains 'prod'/'production'.");
  console.error("           Pass --i-understand to override (NOT recommended; run on a backup first).");
  process.exit(2);
}

if (TYPE !== "opinion" && TYPE !== "all") {
  console.error(`[backfill] ABORT: --type must be 'opinion' or 'all' (got '${TYPE}').`);
  process.exit(2);
}

const TABLE_MAP: Record<string, { table: any; supportsOpinion: boolean; label: string }> = {
  articles: { table: articles, supportsOpinion: true, label: "articles (ar)" },
  en_articles: { table: enArticles, supportsOpinion: false, label: "en_articles" },
  ur_articles: { table: urArticles, supportsOpinion: false, label: "ur_articles" },
};

function missingSlugCond(t: any) {
  // NULL or empty-string englishSlug.
  return or(isNull(t.englishSlug), eq(t.englishSlug, ""));
}

async function processTable(name: string) {
  const spec = TABLE_MAP[name];
  if (!spec) {
    console.warn(`[backfill] skip unknown table '${name}'`);
    return { scanned: 0, updated: 0 };
  }
  const t = spec.table;

  const conds = [missingSlugCond(t)];
  if (TYPE === "opinion") {
    if (!spec.supportsOpinion) {
      console.log(`[backfill] ${spec.label}: skipped (no opinion articleType in this table).`);
      return { scanned: 0, updated: 0 };
    }
    conds.push(eq(t.articleType, "opinion"));
  }
  const where = conds.length > 1 ? and(...conds) : conds[0];

  let q = db.select({ id: t.id, slug: t.slug, title: t.title }).from(t).where(where);
  if (LIMIT > 0) q = (q as any).limit(LIMIT);
  const rows = await q;

  console.log(`\n[backfill] ${spec.label}: ${rows.length} row(s) with missing englishSlug (type=${TYPE}${LIMIT ? `, limit=${LIMIT}` : ""}).`);
  rows.slice(0, 5).forEach((r: any) =>
    console.log(`           e.g. id=${r.id} slug=${JSON.stringify((r.slug || "").slice(0, 40))}`),
  );

  if (!APPLY) return { scanned: rows.length, updated: 0 };

  let updated = 0;
  for (const r of rows as any[]) {
    const newSlug = generateEnglishSlug(r.title || "");
    await db.update(t).set({ englishSlug: newSlug }).where(eq(t.id, r.id));
    updated++;
    if (updated % 200 === 0) console.log(`           ...updated ${updated}/${rows.length}`);
  }
  console.log(`[backfill] ${spec.label}: updated ${updated} row(s).`);
  return { scanned: rows.length, updated };
}

async function main() {
  console.log(
    `[backfill] mode=${APPLY ? "APPLY (writing)" : "DRY-RUN"} type=${TYPE} tables=${TABLES.join(",")}` +
      (LIMIT ? ` limit=${LIMIT}` : ""),
  );
  if (!APPLY) console.log("[backfill] DRY-RUN — no writes. Re-run with --apply to commit.");
  if (APPLY && TYPE === "all") {
    console.log("[backfill] ⚠️  type=all + apply: this can convert already-indexed Arabic-slug");
    console.log("           URLs into 301 redirects (temporary GSC 'Page with redirect' bump). Proceeding…");
  }

  let totalScanned = 0;
  let totalUpdated = 0;
  for (const name of TABLES) {
    const { scanned, updated } = await processTable(name);
    totalScanned += scanned;
    totalUpdated += updated;
  }

  console.log(`\n[backfill] DONE. scanned=${totalScanned} updated=${totalUpdated}${APPLY ? "" : " (dry-run)"}`);
  await pool.end().catch(() => {});
}

main().catch(async (err) => {
  console.error("[backfill] FATAL:", err);
  await pool.end().catch(() => {});
  process.exit(1);
});
