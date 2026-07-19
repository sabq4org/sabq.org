/**
 * تسجيل تفاعل المستخدم مع مركز المباراة. لا نسجّل مجهولين على الخادم؛ هذا الملف
 * يُستخدم فقط من مسارات /api/v1 بعد verifyMemberSession.
 */
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "../../db";
import { sportsMatchViews } from "@shared/schema";
import { SPORTS_SNAPS_WINDOWS } from "./config";

export interface RecordMatchViewInput {
  fixtureId: number;
  homeId?: number | null;
  awayId?: number | null;
  competitionSlug?: string | null;
}

function cleanTeamId(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function recordMatchView(userId: string, input: RecordMatchViewInput): Promise<void> {
  const fixtureId = Number(input.fixtureId);
  if (!Number.isInteger(fixtureId) || fixtureId <= 0) throw new Error("invalid_fixture_id");
  const now = new Date();

  await db
    .insert(sportsMatchViews)
    .values({
      userId,
      fixtureId,
      homeId: cleanTeamId(input.homeId),
      awayId: cleanTeamId(input.awayId),
      competitionSlug: input.competitionSlug || null,
      viewsCount: 1,
      lastViewedAt: now,
    })
    .onConflictDoUpdate({
      target: [sportsMatchViews.userId, sportsMatchViews.fixtureId],
      set: {
        homeId: cleanTeamId(input.homeId),
        awayId: cleanTeamId(input.awayId),
        competitionSlug: input.competitionSlug || null,
        viewsCount: sql`${sportsMatchViews.viewsCount} + 1`,
        lastViewedAt: now,
      },
    });
}

export async function getRecentViewedTeamIds(userId: string, limit = 12): Promise<number[]> {
  const since = new Date(Date.now() - SPORTS_SNAPS_WINDOWS.behavioralLookbackDays * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({ homeId: sportsMatchViews.homeId, awayId: sportsMatchViews.awayId })
    .from(sportsMatchViews)
    .where(and(eq(sportsMatchViews.userId, userId), gte(sportsMatchViews.lastViewedAt, since)))
    .orderBy(desc(sportsMatchViews.lastViewedAt))
    .limit(limit);

  const ids = new Set<number>();
  for (const row of rows) {
    for (const id of [row.homeId, row.awayId]) {
      if (typeof id === "number" && id > 0) ids.add(id);
    }
  }
  return [...ids];
}

export async function pruneOldViews(): Promise<number> {
  const cutoff = new Date(Date.now() - SPORTS_SNAPS_WINDOWS.matchViewRetentionDays * 24 * 60 * 60 * 1000);
  const result = await db.delete(sportsMatchViews).where(sql`${sportsMatchViews.lastViewedAt} < ${cutoff}`);
  return (result as any)?.rowCount ?? 0;
}
