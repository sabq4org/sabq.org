/**
 * English Desk overview data (GET /api/en/admin/desk-overview).
 * Read-only queries; pure shaping lives in shared/enDeskOverview.ts.
 */
import { and, asc, desc, eq, gte, inArray, or, sql } from "drizzle-orm";
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

const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : null);

export async function getEnDeskOverview(now = new Date()): Promise<EnDeskOverview> {
  const dayAgo = new Date(now.getTime() - DAY_MS);
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
  const midnight = riyadhNextMidnight(now);

  const [enCount, arCount, scheduledTonight, needRows, pulseRows, published, settings] = await Promise.all([
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
    db
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
      .where(
        or(
          eq(enArticles.status, "scheduled"),
          and(eq(enArticles.status, "draft"), gte(enArticles.updatedAt, weekAgo)),
          and(eq(enArticles.status, "published"), eq(enArticles.hideFromHomepage, true), gte(enArticles.publishedAt, dayAgo)),
        ),
      )
      .orderBy(desc(enArticles.updatedAt))
      .limit(60),
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
  const allNeeds = buildEnDeskNeeds(rows, Number.MAX_SAFE_INTEGER);

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
      waiting: allNeeds.length,
      scheduledTonight: scheduledTonight[0]?.n ?? 0,
    },
    needs: allNeeds.slice(0, 8),
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
