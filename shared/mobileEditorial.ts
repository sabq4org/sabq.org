// لوحة المراسل والمشرف في تطبيق «سبق» (iOS) — /api/v1/editorial/* (2026-10-31).
// منطق خالص بلا قاعدة بيانات: تصنيف حالة الخبر كما يعرضها الويب، والعدّ، والفلاتر.
// التوثيق: docs/systems/editorial/MOBILE_EDITORIAL_API.md

import { z } from "zod";

/** أخبار المراسل خلال هذه المدة (تحديث أو إنشاء). */
export const MY_NEWS_WINDOW_DAYS = 120;
export const MY_NEWS_LIST_LIMIT = 100;

export const MY_NEWS_STATUSES = ["draft", "pending", "needs_changes", "scheduled", "published", "archived"] as const;
export type MyNewsStatus = (typeof MY_NEWS_STATUSES)[number];

export const MY_NEWS_FILTERS = ["all", "pending", "needs_changes", "scheduled", "published", "draft"] as const;
export type MyNewsFilter = (typeof MY_NEWS_FILTERS)[number];

export const MY_NEWS_STATUS_LABELS: Record<MyNewsStatus, string> = {
  draft: "مسودة",
  pending: "قيد المراجعة",
  needs_changes: "أُعيد لك",
  scheduled: "مجدول",
  published: "منشور",
  archived: "مؤرشف",
};

/**
 * الحالة كما يراها المراسل. ترتيب الفحص مهم: النشر يترك reviewStatus على
 * pending_review أحيانًا (#2044)، فالحالة المنشورة أو المجدولة تسبق المراجعة.
 */
export function myNewsStatus(row: { status: string | null; reviewStatus: string | null }): MyNewsStatus {
  const status = row.status ?? "draft";
  if (status === "published") return "published";
  if (status === "scheduled") return "scheduled";
  if (status === "archived") return "archived";
  if (row.reviewStatus === "needs_changes") return "needs_changes";
  if (row.reviewStatus === "pending_review") return "pending";
  return "draft";
}

export type MyNewsCounts = Record<MyNewsFilter, number>;

export function countMyNews(items: Array<{ state: MyNewsStatus }>): MyNewsCounts {
  const counts: MyNewsCounts = { all: 0, pending: 0, needs_changes: 0, scheduled: 0, published: 0, draft: 0 };
  for (const item of items) {
    if (item.state === "archived") continue;
    counts.all += 1;
    counts[item.state] += 1;
  }
  return counts;
}

export function filterMyNews<T extends { state: MyNewsStatus }>(items: T[], filter: MyNewsFilter): T[] {
  if (filter === "all") return items.filter((item) => item.state !== "archived");
  return items.filter((item) => item.state === filter);
}

/** المُعاد للمراسل أولًا (يحتاج فعله)، ثم الأحدث تحديثًا. */
export function sortMyNews<T extends { state: MyNewsStatus; updatedAt: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aw = a.state === "needs_changes" ? 0 : 1;
    const bw = b.state === "needs_changes" ? 0 : 1;
    if (aw !== bw) return aw - bw;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

export interface MyNewsItem {
  id: string;
  title: string;
  state: MyNewsStatus;
  stateLabel: string;
  reviewNotes: string | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  categoryName: string | null;
  views: number;
  url: string | null;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  scheduledAt: string | null;
  publishedAt: string | null;
  /** طلب التعديل المفتوح من المراسل نفسه على هذا الخبر، إن وُجد. */
  pendingEditRequest: { id: string; label: string; createdAt: string } | null;
  canRequestEdit: boolean;
}

export interface MyNewsBoard {
  counts: MyNewsCounts;
  editRequestsReady: boolean;
  items: MyNewsItem[];
}

export const myNewsQuerySchema = z
  .object({ filter: z.enum(MY_NEWS_FILTERS).optional().default("all") })
  .strict();

export interface MobileEditorialMe {
  userId: string;
  name: string;
  /** يرسل أخبارًا ويطلب تعديلًا (مراسل أو صاحب أخبار). */
  canReport: boolean;
  /** لوحة المشرف: articles.publish. */
  canNews: boolean;
  twoFactorEnabled: boolean;
}
