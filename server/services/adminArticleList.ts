import { and, eq, or, sql, type SQL } from "drizzle-orm";
import { articles } from "@shared/schema";
import { db } from "../db";

/**
 * Top-K by max(manual order, publication second) is contained in the union of
 * the top-K of each input order. Read narrow candidates through both existing
 * indexes instead of sorting the entire published archive by an expression.
 * All permission/search filters must be applied inside BOTH candidate scans.
 */
export function adminPublishedPageSql(filter: SQL | undefined, limit: number, offset: number, scoped = false) {
  const where = and(eq(articles.status, "published"), filter);
  const end = offset + limit;
  if (scoped) {
    // قائمة صاحب المحتوى (المراسل/الكاتب): صفوفه قليلة، فتُقرأ بفهارس author_id/reporter_id
    // ثم تُرتب. مسح المرشحين بفهرس الترتيب العام يمرّ على أرشيف المنشور كله بحثًا عن
    // صفوفه، فيتجاوز statement_timeout ويعلق «جاري التحميل» (2026-10-31).
    return sql`
      SELECT id FROM ${articles}
      WHERE ${where}
      ORDER BY GREATEST(display_order, FLOOR(EXTRACT(EPOCH FROM published_at))) DESC,
               published_at DESC NULLS LAST, created_at DESC, id DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
  }
  return sql`
    WITH candidates AS (
      (SELECT id, display_order, published_at, created_at FROM ${articles}
       WHERE ${where}
       ORDER BY display_order DESC, published_at DESC NULLS LAST, created_at DESC, id DESC
       LIMIT ${end})
      UNION
      (SELECT id, display_order, published_at, created_at FROM ${articles}
       WHERE ${where}
       ORDER BY published_at DESC NULLS LAST, created_at DESC, id DESC
       LIMIT ${end})
    )
    SELECT id FROM candidates
    ORDER BY GREATEST(display_order, FLOOR(EXTRACT(EPOCH FROM published_at))) DESC,
             published_at DESC NULLS LAST, created_at DESC, id DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
}

export async function getAdminPublishedPageIds(filter: SQL | undefined, limit: number, offset: number, scoped = false): Promise<string[]> {
  const result = await db.execute<{ id: string }>(adminPublishedPageSql(filter, limit, offset, scoped));
  return result.rows.map(row => row.id);
}

export const adminScheduledOrder = sql`${articles.scheduledAt} ASC NULLS LAST, ${articles.createdAt} DESC, ${articles.id} DESC`;

export type AdminArticleMetrics = {
  published: number;
  scheduled: number;
  draft: number;
  archived: number;
  /** مسودات البوت التي علّمها المحرر جاهزة. ليست ضمن `draft`. */
  readyToPublish: number;
};

/** Count the same status set as the list, including overdue/undated schedules. */
export async function getAdminArticleMetrics(): Promise<AdminArticleMetrics> {
  const result = await db.execute<{
    published: string | number;
    scheduled: string | number;
    draft: string | number;
    archived: string | number;
    ready_to_publish: string | number;
  }>(sql`
    SELECT
      (SELECT count(*) FROM ${articles} WHERE ${articles.status} = 'published') AS published,
      (SELECT count(*) FROM ${articles} WHERE ${articles.status} = 'draft') AS draft,
      (SELECT count(*) FROM ${articles} WHERE ${articles.status} = 'archived') AS archived,
      (SELECT count(*) FROM ${articles} WHERE ${articles.status} = 'scheduled') AS scheduled,
      (SELECT count(*) FROM ${articles} WHERE ${articles.status} = 'ready_to_publish') AS ready_to_publish
  `);
  const row = result.rows[0];
  return {
    published: Number(row?.published ?? 0),
    scheduled: Number(row?.scheduled ?? 0),
    draft: Number(row?.draft ?? 0),
    archived: Number(row?.archived ?? 0),
    readyToPublish: Number(row?.ready_to_publish ?? 0),
  };
}

/**
 * أرقام البطاقات لمن لا يرى كل الأخبار (المراسل/الناشر): أخباره هو فقط، بنفس
 * شرط قائمته (author_id أو reporter_id، ومع الناشر المرتبط publisher_id).
 * عدّ واحد مجمّع يكفي لأن صفوفه قليلة وتُقرأ بفهارس صاحب المحتوى.
 */
export async function getOwnerArticleMetrics(userId: string, linkedPublisherId?: string | null): Promise<AdminArticleMetrics> {
  const owner = or(
    eq(articles.authorId, userId),
    eq(articles.reporterId, userId),
    ...(linkedPublisherId ? [eq(articles.publisherId, linkedPublisherId)] : []),
  );
  const result = await db.execute<{
    published: string | number;
    scheduled: string | number;
    draft: string | number;
    archived: string | number;
    ready_to_publish: string | number;
  }>(sql`
    SELECT
      count(*) FILTER (WHERE ${articles.status} = 'published') AS published,
      count(*) FILTER (WHERE ${articles.status} = 'draft') AS draft,
      count(*) FILTER (WHERE ${articles.status} = 'archived') AS archived,
      count(*) FILTER (WHERE ${articles.status} = 'scheduled') AS scheduled,
      count(*) FILTER (WHERE ${articles.status} = 'ready_to_publish') AS ready_to_publish
    FROM ${articles}
    WHERE ${owner}
  `);
  const row = result.rows[0];
  return {
    published: Number(row?.published ?? 0),
    scheduled: Number(row?.scheduled ?? 0),
    draft: Number(row?.draft ?? 0),
    archived: Number(row?.archived ?? 0),
    readyToPublish: Number(row?.ready_to_publish ?? 0),
  };
}

const VIEW_ALL_ROLES = ["admin", "system_admin", "editor", "chief_editor", "content_manager"];

/** من يرى كل الأخبار يرى أرقام الموقع؛ غيره (المراسل) يرى أرقام أخباره فقط، بنفس شرط القائمة. */
export function seesAllArticles(role: string | null | undefined, perms: readonly string[]): boolean {
  return perms.includes("*") || perms.includes("articles.view_all") || perms.includes("articles.manage") || VIEW_ALL_ROLES.includes(role ?? "");
}

export async function getArticleMetricsForUser(
  user: { id: string; role?: string | null; linkedPublisherId?: string | null },
  perms: readonly string[],
  siteMetrics: () => Promise<AdminArticleMetrics>,
): Promise<AdminArticleMetrics> {
  return seesAllArticles(user.role, perms) ? siteMetrics() : getOwnerArticleMetrics(user.id, user.linkedPublisherId);
}
