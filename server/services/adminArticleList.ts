import { and, eq, sql, type SQL } from "drizzle-orm";
import { articles } from "@shared/schema";
import { db } from "../db";

/**
 * Top-K by max(manual order, publication second) is contained in the union of
 * the top-K of each input order. Read narrow candidates through both existing
 * indexes instead of sorting the entire published archive by an expression.
 * All permission/search filters must be applied inside BOTH candidate scans.
 */
export function adminPublishedPageSql(filter: SQL | undefined, limit: number, offset: number) {
  const where = and(eq(articles.status, "published"), filter);
  const end = offset + limit;
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

export async function getAdminPublishedPageIds(filter: SQL | undefined, limit: number, offset: number): Promise<string[]> {
  const result = await db.execute<{ id: string }>(adminPublishedPageSql(filter, limit, offset));
  return result.rows.map(row => row.id);
}

export const adminScheduledOrder = sql`${articles.scheduledAt} ASC NULLS LAST, ${articles.createdAt} DESC, ${articles.id} DESC`;

/** Count the same status set as the list, including overdue/undated schedules. */
export async function getAdminArticleMetrics() {
  const result = await db.execute<{ published: string | number; scheduled: string | number; draft: string | number; archived: string | number }>(sql`
    SELECT
      (SELECT count(*) FROM ${articles} WHERE ${articles.status} = 'published') AS published,
      (SELECT count(*) FROM ${articles} WHERE ${articles.status} = 'draft') AS draft,
      (SELECT count(*) FROM ${articles} WHERE ${articles.status} = 'archived') AS archived,
      (SELECT count(*) FROM ${articles} WHERE ${articles.status} = 'scheduled') AS scheduled
  `);
  const row = result.rows[0];
  return { published: Number(row?.published ?? 0), scheduled: Number(row?.scheduled ?? 0), draft: Number(row?.draft ?? 0), archived: Number(row?.archived ?? 0) };
}
