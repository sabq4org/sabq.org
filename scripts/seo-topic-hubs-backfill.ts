/**
 * Build targeted articleTags links for a small, curated set of SEO topic hubs.
 *
 * Default mode is DRY-RUN: it reads published Arabic articles and prints the
 * proposed links without writing. Use --apply only after reviewing the report.
 *
 * Usage:
 *   tsx scripts/seo-topic-hubs-backfill.ts
 *   tsx scripts/seo-topic-hubs-backfill.ts --limit=1000 --days=90
 *   tsx scripts/seo-topic-hubs-backfill.ts --hub=weather,hajj
 *   tsx scripts/seo-topic-hubs-backfill.ts --apply --i-understand
 */

import { articleTags, articles, tags } from "@shared/schema";
import { TOPIC_HUBS, type TopicHubSpec } from "@shared/seo/topicHubs";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";

let db: Awaited<typeof import("../server/db")>["db"];
let pool: Awaited<typeof import("../server/db")>["pool"] | undefined;

const argv = process.argv.slice(2);
const has = (flag: string) => argv.includes(flag);
const val = (key: string) => {
  const item = argv.find((arg) => arg.startsWith(`${key}=`));
  return item ? item.slice(key.length + 1) : undefined;
};

const APPLY = has("--apply");
const ACK = has("--i-understand");
const LIMIT = parseInt(val("--limit") || "1000", 10) || 1000;
const DAYS = parseInt(val("--days") || "90", 10) || 90;
const MIN_SCORE = parseInt(val("--min-score") || "0", 10) || 0;
const MAX_HUBS_PER_ARTICLE = parseInt(val("--max-hubs-per-article") || "3", 10) || 3;
const HUB_FILTER = new Set(
  (val("--hub") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

const dbUrl = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || "";
if (APPLY && /prod|production/i.test(dbUrl) && !ACK) {
  console.error("[topic-hubs] ABORT: production-looking DATABASE_URL with --apply.");
  console.error("             Re-run with --apply --i-understand only after backup/review.");
  process.exit(2);
}

const HUBS = TOPIC_HUBS.filter(
  (hub) => HUB_FILTER.size === 0 || HUB_FILTER.has(hub.key) || HUB_FILTER.has(hub.slug),
);

if (HUBS.length === 0) {
  console.error("[topic-hubs] ABORT: no hubs selected.");
  process.exit(2);
}

type ArticleRow = {
  id: string;
  title: string | null;
  slug: string | null;
  englishSlug: string | null;
  excerpt: string | null;
  aiSummary: string | null;
  content: string | null;
  seo: unknown;
  publishedAt: Date | string | null;
};

type Match = {
  hub: TopicHubSpec;
  score: number;
  terms: string[];
};

function normalize(input: unknown): string {
  return String(input || "")
    .toLowerCase()
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{Letter}\p{Number}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasTerm(normalizedText: string, term: string): boolean {
  const normalizedTerm = normalize(term);
  if (!normalizedTerm) return false;
  return new RegExp(`(^|\\s)${escapeRegExp(normalizedTerm)}(?=\\s|$)`).test(
    normalizedText,
  );
}

function seoKeywords(seo: unknown): string[] {
  const keywords = (seo as { keywords?: unknown } | null)?.keywords;
  return Array.isArray(keywords)
    ? keywords.filter((item): item is string => typeof item === "string")
    : [];
}

function articleText(article: ArticleRow): string {
  return normalize([
    article.title,
    article.excerpt,
    article.aiSummary,
    seoKeywords(article.seo).join(" "),
    article.content,
  ].join(" "));
}

function matchHub(article: ArticleRow, hub: TopicHubSpec): Match | null {
  const text = articleText(article);
  const exclude = (hub.excludeAny || []).some((term) => hasTerm(text, term));
  if (exclude) return null;

  const required = hub.includeAll || [];
  if (required.some((term) => !hasTerm(text, term))) return null;

  const terms = hub.includeAny.filter((term) => hasTerm(text, term));
  const minScore = Math.max(MIN_SCORE, hub.minScore || 1);
  if (terms.length < minScore) return null;

  return { hub, score: terms.length, terms };
}

async function loadArticles(): Promise<ArticleRow[]> {
  const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);
  return db
    .select({
      id: articles.id,
      title: articles.title,
      slug: articles.slug,
      englishSlug: articles.englishSlug,
      excerpt: articles.excerpt,
      aiSummary: articles.aiSummary,
      content: articles.content,
      seo: articles.seo,
      publishedAt: articles.publishedAt,
    })
    .from(articles)
    .where(and(eq(articles.status, "published"), gte(articles.publishedAt, since)))
    .orderBy(desc(articles.publishedAt))
    .limit(LIMIT);
}

async function loadExistingTags() {
  const rows = await db
    .select({
      id: tags.id,
      slug: tags.slug,
      nameAr: tags.nameAr,
      usageCount: tags.usageCount,
      status: tags.status,
    })
    .from(tags)
    .where(inArray(tags.slug, HUBS.map((hub) => hub.slug)));
  return new Map(rows.map((row) => [row.slug, row]));
}

async function ensureHubTags(existing: Map<string, { id: string; slug: string }>) {
  const tagIds = new Map<string, string>();
  for (const hub of HUBS) {
    const current = existing.get(hub.slug);
    if (current) {
      tagIds.set(hub.key, current.id);
      continue;
    }
    if (!APPLY) continue;
    const [created] = await db
      .insert(tags)
      .values({
        nameAr: hub.nameAr,
        nameEn: hub.nameEn,
        slug: hub.slug,
        description: hub.description,
        usageCount: 0,
        status: "active",
      })
      .returning({ id: tags.id });
    tagIds.set(hub.key, created.id);
  }
  return tagIds;
}

async function loadExistingArticleLinks(articleIds: string[]) {
  if (articleIds.length === 0) return new Set<string>();
  const rows = await db
    .select({
      articleId: articleTags.articleId,
      tagId: articleTags.tagId,
    })
    .from(articleTags)
    .where(inArray(articleTags.articleId, articleIds));
  return new Set(rows.map((row) => `${row.articleId}:${row.tagId}`));
}

async function main() {
  process.env.SKIP_DB_MAINTENANCE ||= "true";
  const dbModule = await import("../server/db");
  db = dbModule.db;
  pool = dbModule.pool;

  console.log(
    `[topic-hubs] mode=${APPLY ? "APPLY" : "DRY-RUN"} hubs=${HUBS.length} days=${DAYS} limit=${LIMIT} minScore=${MIN_SCORE}`,
  );
  if (!APPLY) console.log("[topic-hubs] DRY-RUN: no database writes.");

  const [articlesRows, existingTags] = await Promise.all([
    loadArticles(),
    loadExistingTags(),
  ]);
  const tagIds = await ensureHubTags(existingTags);

  const articleIds = articlesRows.map((article) => article.id);
  const existingArticleLinks = await loadExistingArticleLinks(articleIds);

  const hubStats = new Map<
    string,
    {
      hub: TopicHubSpec;
      matched: number;
      existingLinks: number;
      proposedLinks: Array<{ article: ArticleRow; score: number; terms: string[] }>;
    }
  >();
  for (const hub of HUBS) {
    hubStats.set(hub.key, { hub, matched: 0, existingLinks: 0, proposedLinks: [] });
  }

  const linksToInsert: Array<{ articleId: string; tagId: string; hubKey: string }> = [];

  for (const article of articlesRows) {
    const matches = HUBS
      .map((hub) => matchHub(article, hub))
      .filter((match): match is Match => !!match)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_HUBS_PER_ARTICLE);

    for (const match of matches) {
      const stat = hubStats.get(match.hub.key)!;
      stat.matched++;
      const tagId = tagIds.get(match.hub.key) || existingTags.get(match.hub.slug)?.id;
      if (!tagId) {
        stat.proposedLinks.push({ article, score: match.score, terms: match.terms });
        continue;
      }
      const key = `${article.id}:${tagId}`;
      if (existingArticleLinks.has(key)) {
        stat.existingLinks++;
        continue;
      }
      stat.proposedLinks.push({ article, score: match.score, terms: match.terms });
      linksToInsert.push({ articleId: article.id, tagId, hubKey: match.hub.key });
    }
  }

  if (APPLY && linksToInsert.length > 0) {
    await db
      .insert(articleTags)
      .values(linksToInsert.map(({ articleId, tagId }) => ({ articleId, tagId })))
      .onConflictDoNothing();

    const updates = new Map<string, number>();
    for (const link of linksToInsert) updates.set(link.tagId, (updates.get(link.tagId) || 0) + 1);
    for (const [tagId, count] of updates) {
      await db
        .update(tags)
        .set({
          usageCount: sql`${tags.usageCount} + ${count}`,
          updatedAt: new Date(),
        })
        .where(eq(tags.id, tagId));
    }
  }

  console.log(`\n[topic-hubs] scanned published articles=${articlesRows.length}`);
  console.log(`[topic-hubs] proposed new links=${linksToInsert.length}${APPLY ? " (written)" : ""}`);

  for (const stat of hubStats.values()) {
    const indexable = stat.matched >= stat.hub.minPublishedArticles;
    const tagState = existingTags.has(stat.hub.slug) ? "exists" : APPLY ? "created" : "missing";
    console.log(
      `\n[hub:${stat.hub.key}] ${stat.hub.nameAr} slug=${stat.hub.slug} tag=${tagState}`,
    );
    console.log(
      `  matched=${stat.matched} existingLinks=${stat.existingLinks} proposed=${stat.proposedLinks.length} minIndexable=${stat.hub.minPublishedArticles} indexableAfterApply=${indexable ? "yes" : "no"}`,
    );
    for (const item of stat.proposedLinks.slice(0, 5)) {
      const slug = item.article.englishSlug || item.article.slug || item.article.id;
      console.log(
        `  - score=${item.score} slug=${slug} terms=${item.terms.slice(0, 4).join("|")} title=${(item.article.title || "").slice(0, 90)}`,
      );
    }
  }

  await pool?.end().catch(() => {});
}

main().catch(async (error) => {
  console.error("[topic-hubs] FATAL:", error);
  await pool?.end().catch(() => {});
  process.exit(1);
});
