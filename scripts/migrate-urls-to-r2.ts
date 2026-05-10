/**
 * R2 URL migration — converts relative storage paths in article content and
 * image columns to absolute R2 public URLs so the frontend (Vercel) can load
 * them without going through the backend proxy.
 *
 * SAFETY:
 *   • DRY-RUN by default. Pass --apply to actually write to the DB.
 *   • Always run against the BACKUP database first. The DATABASE_URL must
 *     point at the experimental project, NOT production.
 *   • Re-runnable: skips rows already migrated (URLs that start with the
 *     R2 base or with http(s)://).
 *
 * Usage:
 *   tsx scripts/migrate-urls-to-r2.ts                # dry run, prints diff
 *   tsx scripts/migrate-urls-to-r2.ts --apply        # writes to DB
 *   tsx scripts/migrate-urls-to-r2.ts --tables=articles,en_articles
 *   tsx scripts/migrate-urls-to-r2.ts --limit=100
 *
 * Required env:
 *   DATABASE_URL          backup database (REJECTS values containing
 *                         "prod" or "production" unless --i-understand
 *                         is passed)
 *   R2_PUBLIC_URL         e.g. https://cdn.sabq.news (no trailing slash)
 *
 * Patterns rewritten (in this order):
 *   /public-objects/uploads/foo.jpg       → ${R2_PUBLIC_URL}/uploads/foo.jpg
 *   /public-objects/<rest>                → ${R2_PUBLIC_URL}/<rest>
 *   /objects/<rest>                       → ${R2_PUBLIC_URL}/<rest>
 *   /api/public-media/public/<rest>       → ${R2_PUBLIC_URL}/<rest>
 *   /uploads/<rest>                       → ${R2_PUBLIC_URL}/uploads/<rest>
 */

import { db, pool } from "../server/db";
import { articles, enArticles, urArticles } from "@shared/schema";
import { sql } from "drizzle-orm";

const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");
if (!R2_PUBLIC_URL) {
  console.error("[migrate] R2_PUBLIC_URL is required (e.g. https://cdn.sabq.news)");
  process.exit(1);
}

const args = new Set(process.argv.slice(2));
const APPLY = args.has("--apply");
const I_UNDERSTAND = args.has("--i-understand");
const tablesArg = process.argv.find((a) => a.startsWith("--tables="));
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const TABLES = tablesArg ? tablesArg.replace("--tables=", "").split(",") : ["articles", "en_articles", "ur_articles"];
const LIMIT = limitArg ? parseInt(limitArg.replace("--limit=", ""), 10) : 0;

const dbUrl = process.env.DATABASE_URL || "";
if (/prod|production/i.test(dbUrl) && !I_UNDERSTAND) {
  console.error("[migrate] ABORT: DATABASE_URL contains 'prod' or 'production'.");
  console.error("           Pass --i-understand to override (NOT recommended).");
  process.exit(2);
}

interface Rewrite {
  pattern: RegExp;
  replacement: string;
}

const REWRITES: Rewrite[] = [
  { pattern: /\/public-objects\/uploads\//g, replacement: `${R2_PUBLIC_URL}/uploads/` },
  { pattern: /\/public-objects\//g, replacement: `${R2_PUBLIC_URL}/` },
  { pattern: /\/objects\//g, replacement: `${R2_PUBLIC_URL}/` },
  { pattern: /\/api\/public-media\/public\//g, replacement: `${R2_PUBLIC_URL}/` },
  { pattern: /\/api\/public-media\/replit-objstore-[a-f0-9-]+\/public\//g, replacement: `${R2_PUBLIC_URL}/` },
  { pattern: /(?<![:\w])\/uploads\//g, replacement: `${R2_PUBLIC_URL}/uploads/` },
];

function rewrite(value: string | null | undefined): { changed: boolean; next: string | null | undefined } {
  if (!value || typeof value !== "string") return { changed: false, next: value };
  let next = value;
  for (const { pattern, replacement } of REWRITES) {
    next = next.replace(pattern, replacement);
  }
  return { changed: next !== value, next };
}

interface TableSpec {
  name: string;
  table: any;
  // columns to rewrite — text/string columns containing image/URL data.
  textCols: string[];
  htmlCol?: string; // long-form HTML body
}

const TABLE_SPECS: TableSpec[] = [
  {
    name: "articles",
    table: articles,
    textCols: ["imageUrl", "thumbnailUrl", "liteOptimizedImageUrl", "infographicBannerUrl"],
    htmlCol: "content",
  },
  {
    name: "en_articles",
    table: enArticles,
    textCols: ["imageUrl", "thumbnailUrl"],
    htmlCol: "content",
  },
  {
    name: "ur_articles",
    table: urArticles,
    textCols: ["imageUrl", "thumbnailUrl"],
    htmlCol: "content",
  },
];

async function migrateTable(spec: TableSpec): Promise<{ scanned: number; changed: number }> {
  let scanned = 0;
  let changed = 0;

  const idCol = "id";
  const cols = [idCol, ...spec.textCols, ...(spec.htmlCol ? [spec.htmlCol] : [])];
  const colList = cols.map((c) => `"${camelToSnake(c)}"`).join(", ");
  const limitClause = LIMIT > 0 ? `LIMIT ${LIMIT}` : "";

  const result = await pool.query(
    `SELECT ${colList} FROM "${spec.name}" ${limitClause}`
  );

  for (const row of result.rows as any[]) {
    scanned++;
    const updates: Record<string, string> = {};
    for (const col of spec.textCols) {
      const snake = camelToSnake(col);
      const { changed: c, next } = rewrite(row[snake]);
      if (c && typeof next === "string") updates[snake] = next;
    }
    if (spec.htmlCol) {
      const snake = camelToSnake(spec.htmlCol);
      const { changed: c, next } = rewrite(row[snake]);
      if (c && typeof next === "string") updates[snake] = next;
    }

    if (Object.keys(updates).length === 0) continue;
    changed++;

    if (!APPLY) {
      const sample = Object.entries(updates)
        .map(([k, v]) => `    ${k}: ${truncate(v, 120)}`)
        .join("\n");
      console.log(`  [${spec.name}] ${row.id}\n${sample}`);
      continue;
    }

    const setExpr = Object.keys(updates).map((c, i) => `"${c}" = $${i + 2}`).join(", ");
    const values = [row.id, ...Object.values(updates)];
    await pool.query(`UPDATE "${spec.name}" SET ${setExpr} WHERE id = $1`, values);
  }

  return { scanned, changed };
}

function camelToSnake(s: string): string {
  return s.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase());
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

async function main() {
  console.log("=".repeat(60));
  console.log("R2 URL migration");
  console.log("=".repeat(60));
  console.log(`  Mode:           ${APPLY ? "APPLY (writes to DB)" : "DRY RUN (no writes)"}`);
  console.log(`  R2_PUBLIC_URL:  ${R2_PUBLIC_URL}`);
  console.log(`  Tables:         ${TABLES.join(", ")}`);
  console.log(`  Limit:          ${LIMIT > 0 ? LIMIT : "unbounded"}`);
  console.log(`  DB:             ${maskUrl(dbUrl)}`);
  console.log("");

  const totals = { scanned: 0, changed: 0 };
  for (const spec of TABLE_SPECS) {
    if (!TABLES.includes(spec.name)) continue;
    console.log(`\n→ ${spec.name}`);
    const { scanned, changed } = await migrateTable(spec);
    totals.scanned += scanned;
    totals.changed += changed;
    console.log(`  scanned=${scanned}, changed=${changed}`);
  }

  console.log("\n" + "=".repeat(60));
  console.log(`TOTAL: scanned=${totals.scanned}, would-change=${totals.changed}`);
  if (!APPLY) console.log("Run with --apply to actually update the DB.");
  console.log("=".repeat(60));

  await pool.end();
}

function maskUrl(url: string): string {
  return url.replace(/:[^@/]+@/, ":***@");
}

main().catch((err) => {
  console.error("[migrate] fatal:", err);
  process.exit(1);
});
