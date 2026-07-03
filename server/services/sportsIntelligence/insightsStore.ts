/**
 * مخزن «التقاطات» الذكاء الرياضي — كل استعلامات Drizzle على sports_insights هنا
 * (ADR-001: المسارات لا تستورد db). القراءة تُصفّي المنتهي صلاحيته (ttlAt)، والكتابة
 * تعتمد dedupeKey لتحديث اللقطة في مكانها بدل تكرارها.
 */
import { and, desc, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  sportsInsights,
  type InsertSportsInsight,
  type SportsInsight,
} from "@shared/schema";
import type { InsightKind, InsightScope } from "./config";

export interface UpsertInsight {
  scope: InsightScope;
  refId: string;
  competitionSlug?: string | null;
  kind: InsightKind;
  importance?: number;
  headline: string;
  body: string;
  entities?: unknown;
  sourceStats?: unknown;
  dedupeKey?: string | null;
  ttlMs?: number | null;
}

function toRow(i: UpsertInsight): InsertSportsInsight {
  return {
    scope: i.scope,
    refId: i.refId,
    competitionSlug: i.competitionSlug ?? null,
    kind: i.kind,
    importance: i.importance ?? 50,
    headline: i.headline,
    body: i.body,
    entities: (i.entities ?? null) as any,
    sourceStats: (i.sourceStats ?? null) as any,
    lang: "ar",
    dedupeKey: i.dedupeKey ?? null,
    ttlAt: i.ttlMs != null ? new Date(Date.now() + i.ttlMs) : null,
  };
}

/**
 * حفظ لقطات — من له dedupeKey يُحدَّث في مكانه (upsert)، ومن لا مفتاح له يُدرَج
 * كصفّ جديد. آمن للاستدعاء المتكرّر من الـcron دون تضخيم الجدول.
 */
export async function saveInsights(items: UpsertInsight[]): Promise<void> {
  if (items.length === 0) return;
  const withKey = items.filter((i) => i.dedupeKey);
  const noKey = items.filter((i) => !i.dedupeKey);

  if (withKey.length > 0) {
    await db
      .insert(sportsInsights)
      .values(withKey.map(toRow))
      .onConflictDoUpdate({
        target: sportsInsights.dedupeKey,
        set: {
          headline: sql`excluded.headline`,
          body: sql`excluded.body`,
          importance: sql`excluded.importance`,
          entities: sql`excluded.entities`,
          sourceStats: sql`excluded.source_stats`,
          competitionSlug: sql`excluded.competition_slug`,
          kind: sql`excluded.kind`,
          ttlAt: sql`excluded.ttl_at`,
          createdAt: sql`now()`,
        },
      });
  }
  if (noKey.length > 0) {
    await db.insert(sportsInsights).values(noKey.map(toRow));
  }
}

export interface QueryInsights {
  scope: InsightScope;
  refId?: string;
  competitionSlug?: string;
  kinds?: InsightKind[];
  limit?: number;
}

/** قراءة لقطات نطاقٍ ما — الأهم أولاً، مع استبعاد المنتهي صلاحيته. */
export async function queryInsights(q: QueryInsights): Promise<SportsInsight[]> {
  const conds = [eq(sportsInsights.scope, q.scope)];
  if (q.refId) conds.push(eq(sportsInsights.refId, q.refId));
  if (q.competitionSlug) conds.push(eq(sportsInsights.competitionSlug, q.competitionSlug));
  if (q.kinds && q.kinds.length > 0) conds.push(inArray(sportsInsights.kind, q.kinds));
  // غير المنتهي: ttlAt فارغ أو في المستقبل.
  conds.push(or(isNull(sportsInsights.ttlAt), gt(sportsInsights.ttlAt, new Date()))!);

  return db
    .select()
    .from(sportsInsights)
    .where(and(...conds))
    .orderBy(desc(sportsInsights.importance), desc(sportsInsights.createdAt))
    .limit(q.limit ?? 20);
}

/**
 * استبدال لقطات نطاق/نوع بعينه (لتحديث «المشهد» بحيث لا تتراكم بطاقات قديمة
 * لمباريات لم تعد بارزة). يحذف القديم ثم يحفظ الجديد في معاملة واحدة منطقياً.
 */
export async function replaceInsights(
  scope: InsightScope,
  refId: string,
  kinds: InsightKind[],
  items: UpsertInsight[],
): Promise<void> {
  await db
    .delete(sportsInsights)
    .where(
      and(
        eq(sportsInsights.scope, scope),
        eq(sportsInsights.refId, refId),
        inArray(sportsInsights.kind, kinds),
      ),
    );
  await saveInsights(items);
}

/** تنظيف اللقطات المنتهية صلاحيتها. يُرجع عدد المحذوف. */
export async function pruneExpiredInsights(): Promise<number> {
  const res = await db
    .delete(sportsInsights)
    .where(and(lt(sportsInsights.ttlAt, new Date())));
  // drizzle pg delete لا يعيد count افتراضياً — نتجاهل الرقم الدقيق.
  return (res as any)?.rowCount ?? 0;
}
