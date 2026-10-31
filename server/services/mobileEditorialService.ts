// «أخباري» للمراسل في تطبيق «سبق» (iOS) — /api/v1/editorial/my-news (2026-10-31).
// كل استعلامات Drizzle هنا (ADR-001). الحالات كما يعرضها الويب في
// /dashboard/reporter/articles (shared/mobileEditorial.ts).
//
// ثلاثة استعلامات صغيرة (المؤلف، المراسل، المُرسِل) بدل OR واحد: OR على
// الأعمدة الثلاثة يمسح الجدول ويتجاوز مهلة الاستعلام (57014، #2044).

import { and, desc, eq, gte, inArray, ne } from "drizzle-orm";
import { db } from "../db";
import { articleEditRequests, articles, categories } from "@shared/schema";
import { articleAcceptsEditRequests, editRequestShortLabel, type EditRequestProposal } from "@shared/articleEditRequests";
import {
  MY_NEWS_LIST_LIMIT,
  MY_NEWS_STATUS_LABELS,
  MY_NEWS_WINDOW_DAYS,
  countMyNews,
  filterMyNews,
  myNewsStatus,
  sortMyNews,
  type MyNewsBoard,
  type MyNewsFilter,
  type MyNewsItem,
} from "@shared/mobileEditorial";

const DAY_MS = 24 * 60 * 60 * 1000;
const SITE_ORIGIN = "https://sabq.org";

const iso = (value: Date | null | undefined) => (value ? value.toISOString() : null);

function isNotReady(error: any): boolean {
  const code = error?.code ?? error?.cause?.code;
  return code === "42P01" || code === "42501";
}

const columns = {
  id: articles.id,
  title: articles.title,
  slug: articles.slug,
  englishSlug: articles.englishSlug,
  status: articles.status,
  reviewStatus: articles.reviewStatus,
  reviewNotes: articles.reviewNotes,
  imageUrl: articles.imageUrl,
  thumbnailUrl: articles.thumbnailUrl,
  views: articles.views,
  categoryName: categories.nameAr,
  createdAt: articles.createdAt,
  updatedAt: articles.updatedAt,
  reviewedAt: articles.reviewedAt,
  scheduledAt: articles.scheduledAt,
  publishedAt: articles.publishedAt,
};

type Row = {
  id: string;
  title: string;
  slug: string;
  englishSlug: string | null;
  status: string | null;
  reviewStatus: string | null;
  reviewNotes: string | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  views: number | null;
  categoryName: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  reviewedAt: Date | null;
  scheduledAt: Date | null;
  publishedAt: Date | null;
};

async function ownedRows(userId: string, since: Date): Promise<Row[]> {
  const owner = [articles.authorId, articles.reporterId, articles.submitterId] as const;
  const batches = await Promise.all(
    owner.map((column) =>
      db
        .select(columns)
        .from(articles)
        .leftJoin(categories, eq(categories.id, articles.categoryId))
        .where(and(
          eq(column, userId),
          ne(articles.articleType, "opinion"),
          gte(articles.updatedAt, since),
        ))
        .orderBy(desc(articles.updatedAt))
        .limit(MY_NEWS_LIST_LIMIT),
    ),
  );
  const byId = new Map<string, Row>();
  for (const row of batches.flat() as Row[]) byId.set(row.id, row);
  return Array.from(byId.values());
}

async function pendingRequests(userId: string, articleIds: string[]) {
  const map = new Map<string, { id: string; label: string; createdAt: string }>();
  if (!articleIds.length) return { ready: true, map };
  try {
    const rows = await db
      .select({
        id: articleEditRequests.id,
        articleId: articleEditRequests.articleId,
        proposed: articleEditRequests.proposed,
        createdAt: articleEditRequests.createdAt,
      })
      .from(articleEditRequests)
      .where(and(
        eq(articleEditRequests.requesterId, userId),
        eq(articleEditRequests.status, "pending"),
        inArray(articleEditRequests.articleId, articleIds),
      ));
    for (const row of rows) {
      map.set(row.articleId, {
        id: row.id,
        label: editRequestShortLabel(row.proposed as EditRequestProposal),
        createdAt: iso(row.createdAt) ?? new Date(0).toISOString(),
      });
    }
    return { ready: true, map };
  } catch (error) {
    if (isNotReady(error)) return { ready: false, map };
    throw error;
  }
}

export async function getMyNewsBoard(input: { userId: string; filter: MyNewsFilter; now?: Date }): Promise<MyNewsBoard> {
  const now = input.now ?? new Date();
  const rows = await ownedRows(input.userId, new Date(now.getTime() - MY_NEWS_WINDOW_DAYS * DAY_MS));
  const requests = await pendingRequests(input.userId, rows.map((row) => row.id));

  const items: MyNewsItem[] = rows.map((row) => {
    const state = myNewsStatus(row);
    const slug = row.englishSlug || row.slug;
    const pending = requests.map.get(row.id) ?? null;
    return {
      id: row.id,
      title: row.title,
      state,
      stateLabel: MY_NEWS_STATUS_LABELS[state],
      reviewNotes: state === "needs_changes" ? row.reviewNotes || null : null,
      imageUrl: row.imageUrl,
      thumbnailUrl: row.thumbnailUrl,
      categoryName: row.categoryName,
      views: row.views ?? 0,
      url: state === "published" && slug ? `${SITE_ORIGIN}/article/${encodeURIComponent(slug)}` : null,
      createdAt: iso(row.createdAt) ?? iso(now)!,
      updatedAt: iso(row.updatedAt) ?? iso(row.createdAt) ?? iso(now)!,
      submittedAt: state === "draft" ? null : iso(row.createdAt),
      reviewedAt: iso(row.reviewedAt),
      scheduledAt: iso(row.scheduledAt),
      publishedAt: iso(row.publishedAt),
      pendingEditRequest: pending,
      canRequestEdit: requests.ready && !pending && articleAcceptsEditRequests(row.status),
    };
  });

  const sorted = sortMyNews(items);
  return {
    counts: countMyNews(sorted),
    editRequestsReady: requests.ready,
    items: filterMyNews(sorted, input.filter).slice(0, MY_NEWS_LIST_LIMIT),
  };
}
