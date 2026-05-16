/**
 * Backfill `articles.englishSlug` for every published article that has a
 * NULL/empty value. Eliminates the duplicate-canonical class that GSC
 * reports as "Alternate page with proper canonical tag" (~38K rows on the
 * 2026-05-16 snapshot).
 *
 * The script generates a short alphanumeric hash from the article id
 * (deterministic, no collisions in practice — 7 chars of base62 over
 * UUIDv4 input space). When the hash collides with an existing
 * englishSlug (vanishingly rare), the loop extends the hash by one
 * character and retries.
 *
 * Idempotent: re-running only touches rows that are still NULL/empty.
 * Dry-run by default — pass `--apply` to commit. Refuses to run against
 * a DATABASE_URL containing "prod" / "production" without an explicit
 * `--i-understand` flag (same guard pattern as migrate-urls-to-r2.ts).
 *
 * Usage:
 *   tsx scripts/seo-backfill-english-slugs.ts                 # dry-run
 *   tsx scripts/seo-backfill-english-slugs.ts --apply         # write
 *   tsx scripts/seo-backfill-english-slugs.ts --apply --i-understand
 */

import { db } from "../server/db";
import { articles } from "@shared/schema";
import { and, eq, isNull, or, sql } from "drizzle-orm";

const APPLY = process.argv.includes("--apply");
const ACK = process.argv.includes("--i-understand");

const dbUrl = process.env.DATABASE_URL || "";
const looksProd = /prod|production/i.test(dbUrl);
if (looksProd && APPLY && !ACK) {
  console.error(
    "Refusing to run against a production-looking DATABASE_URL without --i-understand.\n" +
      "If you really mean to backfill production, re-run with --apply --i-understand.",
  );
  process.exit(1);
}

// 62-char alphabet (matches the existing englishSlug generator pattern in
// the dashboard editor, so backfilled slugs visually match newly-created
// ones).
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function hashSlug(seed: string, length: number): string {
  // FNV-1a-style fold, then map bytes into the alphabet. Deterministic for
  // the same seed — running the script twice produces the same slug, so a
  // partial run can resume safely.
  let h = 2166136261n;
  for (let i = 0; i < seed.length; i++) {
    h ^= BigInt(seed.charCodeAt(i));
    h = (h * 16777619n) & 0xffffffffffffffffn;
  }
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[Number(h % BigInt(ALPHABET.length))];
    h = h / BigInt(ALPHABET.length) + BigInt(i * 31);
  }
  return out;
}

async function isSlugTaken(slug: string): Promise<boolean> {
  const [row] = await db
    .select({ id: articles.id })
    .from(articles)
    .where(eq(articles.englishSlug, slug))
    .limit(1);
  return !!row;
}

async function ensureUniqueSlug(seed: string): Promise<string> {
  for (let len = 7; len <= 12; len++) {
    const candidate = hashSlug(seed, len);
    if (!(await isSlugTaken(candidate))) return candidate;
    // Collision — extend length and re-roll. In practice this never
    // triggers; the search space at 7 chars (62^7 ≈ 3.5T) is far larger
    // than the article count.
    seed = seed + "_";
  }
  throw new Error(`Could not find a free englishSlug for seed ${seed}`);
}

async function main() {
  const rows = await db
    .select({ id: articles.id, slug: articles.slug })
    .from(articles)
    .where(
      and(
        eq(articles.status, "published"),
        or(isNull(articles.englishSlug), eq(articles.englishSlug, "")),
      ),
    );

  console.log(`[backfill] Found ${rows.length} published article(s) missing englishSlug`);

  if (rows.length === 0) {
    console.log("[backfill] Nothing to do.");
    return;
  }

  console.log(`[backfill] Mode: ${APPLY ? "APPLY (writing)" : "DRY-RUN (no writes)"}`);

  let touched = 0;
  for (const row of rows) {
    const newSlug = await ensureUniqueSlug(row.id);
    if (APPLY) {
      await db
        .update(articles)
        .set({ englishSlug: newSlug })
        .where(eq(articles.id, row.id));
    }
    touched++;
    if (touched % 500 === 0) {
      console.log(`[backfill] ${touched}/${rows.length} processed…`);
    }
    if (touched <= 5) {
      console.log(`[backfill] ${row.id} (slug=${row.slug?.slice(0, 30) ?? "—"}) → ${newSlug}`);
    }
  }

  console.log(`[backfill] Done. ${APPLY ? "Wrote" : "Would write"} ${touched} rows.`);
  if (!APPLY) {
    console.log("[backfill] Re-run with --apply to commit.");
  }
}

main().catch((err) => {
  console.error("[backfill] FATAL:", err);
  process.exit(1);
});
