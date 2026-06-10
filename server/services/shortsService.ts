// Shorts data access that previously lived inline in the routes (the three
// direct-db queries from the old routes.ts shorts block). Created during the
// 2026-06-10 Milestone-2 extraction so the route module stays ADR-001-clean
// (routes are HTTP-only; Drizzle lives in services). Queries are verbatim.

import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { shorts, categories, users, type Short, type Category, type User } from "@shared/schema";

/** Decrement a short's like counter, floored at zero. Returns the updated row. */
export async function decrementShortLikes(shortId: string): Promise<Short | undefined> {
  const [updated] = await db
    .update(shorts)
    .set({
      likes: sql`GREATEST(0, ${shorts.likes} - 1)`,
    })
    .where(eq(shorts.id, shortId))
    .returning();
  return updated;
}

export interface AdminShortsFilters {
  status?: string;
  categoryId?: string;
  reporterId?: string;
  page: number;
  limit: number;
}

export interface AdminShortsPage {
  shorts: Array<Short & { category?: Category; reporter?: User }>;
  total: number;
}

/** Admin panel listing: all statuses, newest first, with category + reporter. */
export async function listShortsForAdmin(filters: AdminShortsFilters): Promise<AdminShortsPage> {
  const { status, categoryId, reporterId, page, limit } = filters;
  const offset = (page - 1) * limit;

  const conditions = [];
  if (status) conditions.push(eq(shorts.status, status));
  if (categoryId) conditions.push(eq(shorts.categoryId, categoryId));
  if (reporterId) conditions.push(eq(shorts.reporterId, reporterId));
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(shorts)
    .where(whereClause);

  const results = await db
    .select({
      short: shorts,
      category: categories,
      reporter: users,
    })
    .from(shorts)
    .leftJoin(categories, eq(shorts.categoryId, categories.id))
    .leftJoin(users, eq(shorts.reporterId, users.id))
    .where(whereClause)
    .orderBy(desc(shorts.createdAt))
    .limit(limit)
    .offset(offset);

  return {
    shorts: results.map((r) => ({
      ...r.short,
      category: r.category || undefined,
      reporter: r.reporter || undefined,
    })),
    total: count,
  };
}
