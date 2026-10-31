// «أخباري» للمراسل في تطبيق «سبق» (iOS) — /api/v1/editorial/my-news (2026-10-31).
// كل استعلامات Drizzle هنا (ADR-001). الحالات كما يعرضها الويب في
// /dashboard/reporter/articles (shared/mobileEditorial.ts).
//
// ثلاثة استعلامات صغيرة (المؤلف، المراسل، المُرسِل) بدل OR واحد: OR على
// الأعمدة الثلاثة يمسح الجدول ويتجاوز مهلة الاستعلام (57014، #2044).
// العدادات والفلتر والترتيب على كل أخبار النافذة، ثم تُجلب الأعمدة الكاملة
// للمئة المعروضة فقط.

import { and, eq, gte, inArray, ne } from "drizzle-orm";
import { db } from "../db";
import { articleEditRequests, articles, categories } from "@shared/schema";
import { articleAcceptsEditRequests, editRequestShortLabel, type EditRequestProposal } from "@shared/articleEditRequests";
import {
  MY_NEWS_LIST_LIMIT,
  MY_NEWS_STATUS_LABELS,
  MY_NEWS_WINDOW_DAYS,
  countMyNews,
  filterMyNews,
  latestEditRequestByArticle,
  myNewsStatus,
  sortMyNews,
  type MyNewsBoard,
  type MyNewsEditRequestBrief,
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

type Brief = { id: string; status: string | null; reviewStatus: string | null; updatedAt: Date | null };

/**
 * كل أخبار المستخدم في النافذة بأعمدة خفيفة (بلا حد)، فتُحسب العدادات
 * ويُطبَّق الفلتر والترتيب على الكل قبل اقتطاع ما يُعرض.
 */
async function ownedBriefs(userId: string, since: Date): Promise<Brief[]> {
  const owner = [articles.authorId, articles.reporterId, articles.submitterId] as const;
  const batches = await Promise.all(
    owner.map((column) =>
      db
        .select({ id: articles.id, status: articles.status, reviewStatus: articles.reviewStatus, updatedAt: articles.updatedAt })
        .from(articles)
        .where(and(
          eq(column, userId),
          ne(articles.articleType, "opinion"),
          gte(articles.updatedAt, since),
        )),
    ),
  );
  const byId = new Map<string, Brief>();
  for (const row of batches.flat() as Brief[]) byId.set(row.id, row);
  return Array.from(byId.values());
}

async function fullRows(ids: string[]): Promise<Row[]> {
  if (!ids.length) return [];
  return (await db
    .select(columns)
    .from(articles)
    .leftJoin(categories, eq(categories.id, articles.categoryId))
    .where(inArray(articles.id, ids))) as Row[];
}

type RequestRow = {
  id: string;
  articleId: string;
  status: string;
  urgent: boolean;
  proposed: unknown;
  decisionNote: string | null;
  createdAt: string;
  decidedAt: string | null;
};

/** آخر طلب تعديل من المراسل لكل خبر معروض (المفتوح يسبق القديم دائمًا لأنه الأحدث). */
async function latestRequests(userId: string, articleIds: string[]) {
  const map = new Map<string, MyNewsEditRequestBrief>();
  if (!articleIds.length) return { ready: true, map };
  try {
    const rows = await db
      .select({
        id: articleEditRequests.id,
        articleId: articleEditRequests.articleId,
        status: articleEditRequests.status,
        urgent: articleEditRequests.urgent,
        proposed: articleEditRequests.proposed,
        decisionNote: articleEditRequests.decisionNote,
        createdAt: articleEditRequests.createdAt,
        decidedAt: articleEditRequests.decidedAt,
      })
      .from(articleEditRequests)
      .where(and(
        eq(articleEditRequests.requesterId, userId),
        inArray(articleEditRequests.articleId, articleIds),
      ));
    const normalized: RequestRow[] = rows.map((row) => ({
      ...row,
      createdAt: iso(row.createdAt) ?? new Date(0).toISOString(),
      decidedAt: iso(row.decidedAt),
    }));
    for (const [articleId, row] of latestEditRequestByArticle(normalized)) {
      const outcome = row.status === "approved" || row.status === "rejected" ? row.status : "pending";
      map.set(articleId, {
        id: row.id,
        outcome,
        label: editRequestShortLabel(row.proposed as EditRequestProposal),
        urgent: row.urgent,
        decisionNote: outcome === "rejected" ? row.decisionNote || null : null,
        createdAt: row.createdAt,
        decidedAt: row.decidedAt,
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
  const briefs = await ownedBriefs(input.userId, new Date(now.getTime() - MY_NEWS_WINDOW_DAYS * DAY_MS));
  const classified = briefs.map((row) => ({
    id: row.id,
    state: myNewsStatus(row),
    updatedAt: iso(row.updatedAt) ?? new Date(0).toISOString(),
  }));
  const sortedAll = sortMyNews(classified);
  const shownIds = filterMyNews(sortedAll, input.filter).slice(0, MY_NEWS_LIST_LIMIT).map((row) => row.id);

  const rows = await fullRows(shownIds);
  const requests = await latestRequests(input.userId, shownIds);
  const rowsById = new Map(rows.map((row) => [row.id, row]));

  const items: MyNewsItem[] = [];
  for (const id of shownIds) {
    const row = rowsById.get(id);
    if (!row) continue;
    const state = myNewsStatus(row);
    const slug = row.englishSlug || row.slug;
    const last = requests.map.get(row.id) ?? null;
    const pending = last?.outcome === "pending" ? { id: last.id, label: last.label, createdAt: last.createdAt } : null;
    items.push({
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
      lastEditRequest: last,
      canRequestEdit: requests.ready && !pending && articleAcceptsEditRequests(row.status),
    });
  }

  return {
    counts: countMyNews(classified),
    editRequestsReady: requests.ready,
    items,
  };
}
