/**
 * English Desk overview data (GET /api/en/admin/desk-overview).
 * Read-only queries; pure shaping lives in shared/enDeskOverview.ts.
 */
import { and, asc, desc, eq, gte, inArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "../db";
import { articles, enArticles, enCategories } from "@shared/schema";
import {
  buildEnDeskNeeds,
  enPublishedSource,
  nextEnAutoTranslateRun,
  riyadhNextMidnight,
  type EnDeskNeedRow,
  type EnDeskOverview,
  type EnDeskPulseItem,
} from "@shared/enDeskOverview";
import { loadEnAutoTranslateSettings } from "./enAutoTranslateService";

const DAY_MS = 86_400_000;
const PULSE_WINDOW_MS = 3 * 60 * 60 * 1000;
const PULSE_LIMIT = 6;
const NEEDS_LIMIT = 8;

function needQuery(where: SQL | undefined, order: SQL) {
  return db
    .select({
      id: enArticles.id,
      title: enArticles.title,
      status: enArticles.status,
      reviewStatus: enArticles.reviewStatus,
      imageUrl: enArticles.imageUrl,
      seoTitle: sql<string | null>`${enArticles.seo}->>'metaTitle'`,
      hideFromHomepage: enArticles.hideFromHomepage,
      sourceArticleId: sql<string | null>`${enArticles.seoMetadata}->>'sourceArticleId'`,
      scheduledAt: enArticles.scheduledAt,
      publishedAt: enArticles.publishedAt,
      updatedAt: enArticles.updatedAt,
      categoryName: enCategories.name,
    })
    .from(enArticles)
    .leftJoin(enCategories, eq(enCategories.id, enArticles.categoryId))
    .where(where)
    .orderBy(order)
    .limit(NEEDS_LIMIT);
}

const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : null);

export async function getEnDeskOverview(now = new Date()): Promise<EnDeskOverview> {
  const dayAgo = new Date(now.getTime() - DAY_MS);
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
  const midnight = riyadhNextMidnight(now);

  const [enCount, arCount, scheduledTonight, needRows, waitingCount, pulseRows, published, settings] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(enArticles)
      .where(and(eq(enArticles.status, "published"), gte(enArticles.publishedAt, dayAgo))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(articles)
      .where(and(eq(articles.status, "published"), gte(articles.publishedAt, dayAgo))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(enArticles)
      .where(and(eq(enArticles.status, "scheduled"), sql`${enArticles.scheduledAt} < ${midnight}`)),
    // One query per bucket, each in its own priority order, so a pile of fresh
    // drafts can never push a scheduled story out of the list.
    Promise.all([
      needQuery(eq(enArticles.status, "scheduled"), asc(enArticles.scheduledAt)),
      needQuery(and(eq(enArticles.status, "draft"), eq(enArticles.reviewStatus, "pending_review")), desc(enArticles.updatedAt)),
      needQuery(and(eq(enArticles.status, "published"), eq(enArticles.hideFromHomepage, true), gte(enArticles.publishedAt, dayAgo)), desc(enArticles.updatedAt)),
      needQuery(and(eq(enArticles.status, "draft"), gte(enArticles.updatedAt, weekAgo)), desc(enArticles.updatedAt)),
    ]).then((groups) => groups.flat()),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(enArticles)
      .where(
        or(
          eq(enArticles.status, "scheduled"),
          and(eq(enArticles.status, "draft"), or(gte(enArticles.updatedAt, weekAgo), eq(enArticles.reviewStatus, "pending_review"))),
          and(eq(enArticles.status, "published"), eq(enArticles.hideFromHomepage, true), gte(enArticles.publishedAt, dayAgo)),
        ),
      ),
    db
      .select({ id: articles.id, title: articles.title, publishedAt: articles.publishedAt })
      .from(articles)
      .where(
        and(
          eq(articles.status, "published"),
          eq(articles.articleType, "news"),
          gte(articles.publishedAt, new Date(now.getTime() - PULSE_WINDOW_MS)),
        ),
      )
      .orderBy(desc(articles.views), desc(articles.publishedAt))
      .limit(PULSE_LIMIT),
    db
      .select({
        id: enArticles.id,
        title: enArticles.title,
        slug: enArticles.slug,
        publishedAt: enArticles.publishedAt,
        views: enArticles.views,
        seoMetadata: enArticles.seoMetadata,
        categoryName: enCategories.name,
      })
      .from(enArticles)
      .leftJoin(enCategories, eq(enCategories.id, enArticles.categoryId))
      .where(and(eq(enArticles.status, "published"), gte(enArticles.publishedAt, dayAgo)))
      .orderBy(desc(enArticles.publishedAt))
      .limit(30),
    loadEnAutoTranslateSettings().catch(() => null),
  ]);

  const rows: EnDeskNeedRow[] = needRows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    reviewStatus: r.reviewStatus,
    imageUrl: r.imageUrl,
    hasSeoTitle: !!r.seoTitle?.trim(),
    hideFromHomepage: r.hideFromHomepage,
    isAutoTranslated: !!r.sourceArticleId,
    scheduledAt: iso(r.scheduledAt),
    publishedAt: iso(r.publishedAt),
    updatedAt: iso(r.updatedAt),
    categoryName: r.categoryName ?? null,
  }));
  // Rows can repeat across buckets (a pending-review draft is also a recent draft).
  const seen = new Set<string>();
  const needs = buildEnDeskNeeds(rows.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true))), NEEDS_LIMIT);

  // Which of the pulse stories already have an English row (any status).
  const pulseIds = pulseRows.map((r) => r.id);
  const linked = pulseIds.length
    ? await db
        .select({
          id: enArticles.id,
          status: enArticles.status,
          sourceArticleId: sql<string>`${enArticles.seoMetadata}->>'sourceArticleId'`,
        })
        .from(enArticles)
        .where(inArray(sql`${enArticles.seoMetadata}->>'sourceArticleId'`, pulseIds))
        .orderBy(asc(enArticles.createdAt))
    : [];
  const bySource = new Map(linked.map((l) => [l.sourceArticleId, l]));
  const pulse: EnDeskPulseItem[] = pulseRows.map((r) => {
    const en = bySource.get(r.id);
    return {
      arArticleId: r.id,
      title: r.title,
      publishedAt: iso(r.publishedAt),
      state: !en ? "not_translated" : en.status === "published" ? "translated" : "draft",
      enArticleId: en?.id ?? null,
    };
  });

  return {
    now: now.toISOString(),
    counts: {
      enLast24h: enCount[0]?.n ?? 0,
      arLast24h: arCount[0]?.n ?? 0,
      waiting: waitingCount[0]?.n ?? 0,
      scheduledTonight: scheduledTonight[0]?.n ?? 0,
    },
    needs,
    pulse: {
      enabled: (settings?.enabled ?? false) && (process.env.EN_AUTO_TRANSLATE || "").trim().toLowerCase() !== "off",
      nextRunAt: nextEnAutoTranslateRun(now).toISOString(),
      items: pulse,
    },
    publishedRecent: published.map((p) => ({
      id: p.id,
      title: p.title,
      slug: p.slug,
      categoryName: p.categoryName ?? null,
      publishedAt: iso(p.publishedAt),
      views: p.views ?? 0,
      source: enPublishedSource(p.seoMetadata as { source?: string; trigger?: string; sourceArticleId?: string } | null),
    })),
  };
}
