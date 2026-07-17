/**
 * رادار سبق الذكي — طبقة الاستعلامات (وفق ADR-001: كل Drizzle هنا، لا في المسارات).
 */
import { and, count, desc, eq, gte, inArray, isNull, lt, sql as dsql } from "drizzle-orm";
import { db } from "../../db";
import {
  categories,
  radarAlertRules,
  radarItems,
  radarSources,
  type InsertRadarAlertRule,
  type InsertRadarSource,
  type RadarAlertRule,
  type RadarItem,
  type RadarSource,
} from "@shared/schema";

// ---------- المصادر ----------

export async function listSources(): Promise<RadarSource[]> {
  return db.select().from(radarSources).orderBy(desc(radarSources.createdAt));
}

/** عدد رصدات إكس النشطة — سقف الحماية RADAR_X_MAX_ACTIVE_WATCHES */
export async function countActiveXWatches(): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(radarSources)
    .where(and(eq(radarSources.isActive, true), eq(radarSources.type, "x")));
  return Number(rows[0]?.value ?? 0);
}

/** ملخص صحة الشبكة للوحة والـ API */
export async function sourceHealthSummary(): Promise<{
  active: number;
  rss: number;
  xWatches: number;
  withError: number;
  neverFetched: number;
  errors: Array<{ id: string; name: string; type: string; lastError: string | null; tier: string | null }>;
}> {
  const sources = await listSources();
  const active = sources.filter((s) => s.isActive);
  const withError = active.filter((s) => s.lastError);
  return {
    active: active.length,
    rss: active.filter((s) => s.type !== "x").length,
    xWatches: active.filter((s) => s.type === "x").length,
    withError: withError.length,
    neverFetched: active.filter((s) => !s.lastFetchedAt).length,
    errors: withError.slice(0, 50).map((s) => ({
      id: s.id,
      name: s.name,
      type: s.type,
      lastError: s.lastError,
      tier: s.tier ?? null,
    })),
  };
}

export async function getSource(id: string): Promise<RadarSource | undefined> {
  const rows = await db.select().from(radarSources).where(eq(radarSources.id, id)).limit(1);
  return rows[0];
}

export async function createSource(data: InsertRadarSource): Promise<RadarSource> {
  const rows = await db.insert(radarSources).values(data).returning();
  return rows[0];
}

export async function updateSource(
  id: string,
  patch: Partial<InsertRadarSource>
): Promise<RadarSource | undefined> {
  const rows = await db
    .update(radarSources)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(radarSources.id, id))
    .returning();
  return rows[0];
}

export async function deleteSource(id: string): Promise<void> {
  await db.delete(radarSources).where(eq(radarSources.id, id));
}

/** المصادر النشطة التي حان موعد جلبها وفق فترة كل مصدر */
export async function sourcesDueForFetch(): Promise<RadarSource[]> {
  return db
    .select()
    .from(radarSources)
    .where(
      and(
        eq(radarSources.isActive, true),
        dsql`(${radarSources.lastFetchedAt} IS NULL OR ${radarSources.lastFetchedAt} < now() - make_interval(mins => ${radarSources.fetchIntervalMinutes}))`
      )
    );
}

/** حفظ مؤشر آخر تغريدة لرصدة إكس — الجلبة التالية تطلب الأحدث منه فقط */
export async function updateSourceCursor(id: string, sinceId: string): Promise<void> {
  await db
    .update(radarSources)
    .set({ xSinceId: sinceId, updatedAt: new Date() })
    .where(eq(radarSources.id, id));
}

export async function markSourceFetched(id: string, error: string | null): Promise<void> {
  await db
    .update(radarSources)
    .set({ lastFetchedAt: new Date(), lastError: error, updatedAt: new Date() })
    .where(eq(radarSources.id, id));
}

// ---------- المواد ----------

export interface NormalizedRadarItem {
  guid: string;
  link: string;
  title: string;
  excerpt?: string;
  imageUrl?: string;
  publishedAt?: Date;
}

/** إدراج دفعة مواد مع منع التكرار على (sourceId, guid) — يعيد المُدرَج فعليًا فقط */
export async function insertItems(
  source: RadarSource,
  items: NormalizedRadarItem[]
): Promise<RadarItem[]> {
  if (!items.length) return [];
  const rows = await db
    .insert(radarItems)
    .values(
      items.map((item) => ({
        sourceId: source.id,
        guid: item.guid,
        link: item.link,
        originalTitle: item.title,
        originalExcerpt: item.excerpt,
        originalLanguage: source.language,
        imageUrl: item.imageUrl,
        publishedAt: item.publishedAt,
      }))
    )
    .onConflictDoNothing({ target: [radarItems.sourceId, radarItems.guid] })
    .returning();
  return rows;
}

export interface RadarItemFilters {
  statuses?: string[];
  minScore?: number;
  sourceId?: string;
  /** x = رصدات إكس فقط · feed = صحف/RSS/JSON فقط */
  channel?: "x" | "feed";
  breakingOnly?: boolean;
  limit?: number;
  offset?: number;
}

export type RadarItemListRow = RadarItem & {
  sourceName: string | null;
  sourceType: string | null;
  xValue: string | null;
};

function itemConditions(filters: RadarItemFilters) {
  const conditions = [];
  if (filters.statuses?.length) conditions.push(inArray(radarItems.status, filters.statuses));
  if (filters.minScore != null) conditions.push(gte(radarItems.newsValue, filters.minScore));
  if (filters.sourceId) conditions.push(eq(radarItems.sourceId, filters.sourceId));
  if (filters.breakingOnly) conditions.push(eq(radarItems.isBreaking, true));
  if (filters.channel === "x") conditions.push(eq(radarSources.type, "x"));
  if (filters.channel === "feed") conditions.push(inArray(radarSources.type, ["rss", "json"]));
  return conditions.length ? and(...conditions) : undefined;
}

export async function listItems(
  filters: RadarItemFilters
): Promise<{ items: RadarItemListRow[]; total: number }> {
  const where = itemConditions(filters);
  const needsSourceJoin = Boolean(filters.channel);
  const [rows, totals] = await Promise.all([
    db
      .select({
        item: radarItems,
        sourceName: radarSources.name,
        sourceType: radarSources.type,
        xValue: radarSources.xValue,
      })
      .from(radarItems)
      .leftJoin(radarSources, eq(radarItems.sourceId, radarSources.id))
      .where(where)
      .orderBy(desc(radarItems.fetchedAt))
      .limit(Math.min(filters.limit ?? 30, 100))
      .offset(filters.offset ?? 0),
    needsSourceJoin
      ? db
          .select({ value: count() })
          .from(radarItems)
          .innerJoin(radarSources, eq(radarItems.sourceId, radarSources.id))
          .where(where)
      : db.select({ value: count() }).from(radarItems).where(where),
  ]);
  return {
    items: rows.map((r) => ({
      ...r.item,
      sourceName: r.sourceName,
      sourceType: r.sourceType,
      xValue: r.xValue,
    })),
    total: totals[0]?.value ?? 0,
  };
}

export async function getItem(id: string): Promise<RadarItem | undefined> {
  const rows = await db.select().from(radarItems).where(eq(radarItems.id, id)).limit(1);
  return rows[0];
}

export async function updateItem(
  id: string,
  patch: Partial<typeof radarItems.$inferInsert>
): Promise<RadarItem | undefined> {
  const rows = await db.update(radarItems).set(patch).where(eq(radarItems.id, id)).returning();
  return rows[0];
}

/** مواد جديدة لم تُحلَّل بعد — الأحدث نشرًا أولًا */
export async function itemsNeedingAnalysis(limit: number): Promise<RadarItem[]> {
  return db
    .select()
    .from(radarItems)
    .where(and(eq(radarItems.status, "new"), isNull(radarItems.error)))
    .orderBy(desc(radarItems.fetchedAt))
    .limit(limit);
}

/** مواد عاجلة عالية القيمة بلا مسودة — مرشحة للتحويل التلقائي */
export async function breakingItemsNeedingDraft(minScore: number, limit: number): Promise<RadarItem[]> {
  return db
    .select()
    .from(radarItems)
    .where(
      and(
        eq(radarItems.status, "analyzed"),
        eq(radarItems.isBreaking, true),
        gte(radarItems.newsValue, minScore),
        isNull(radarItems.draftGeneratedAt)
      )
    )
    .orderBy(desc(radarItems.newsValue))
    .limit(limit);
}

/** تنظيف المواد القديمة غير المُصدَّرة (المُصدَّرة توثيق يبقى) */
export async function cleanupOldItems(retentionDays: number): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const rows = await db
    .delete(radarItems)
    .where(
      and(
        lt(radarItems.fetchedAt, cutoff),
        inArray(radarItems.status, ["new", "analyzed", "ready", "dismissed"])
      )
    )
    .returning({ id: radarItems.id });
  return rows.length;
}

// ---------- قواعد التنبيه ----------

export async function listRules(activeOnly = false): Promise<RadarAlertRule[]> {
  return db
    .select()
    .from(radarAlertRules)
    .where(activeOnly ? eq(radarAlertRules.isActive, true) : undefined)
    .orderBy(desc(radarAlertRules.createdAt));
}

export async function createRule(data: InsertRadarAlertRule): Promise<RadarAlertRule> {
  const rows = await db.insert(radarAlertRules).values(data).returning();
  return rows[0];
}

export async function updateRule(
  id: string,
  patch: Partial<InsertRadarAlertRule>
): Promise<RadarAlertRule | undefined> {
  const rows = await db
    .update(radarAlertRules)
    .set(patch)
    .where(eq(radarAlertRules.id, id))
    .returning();
  return rows[0];
}

export async function deleteRule(id: string): Promise<void> {
  await db.delete(radarAlertRules).where(eq(radarAlertRules.id, id));
}

// ---------- التصنيفات المعتمدة (لاختيار التصنيف في البرومبتات) ----------

export interface ApprovedCategory {
  id: string;
  slug: string;
  nameAr: string;
}

export async function approvedCategories(): Promise<ApprovedCategory[]> {
  return db
    .select({ id: categories.id, slug: categories.slug, nameAr: categories.nameAr })
    .from(categories)
    .where(eq(categories.status, "active"));
}

export async function categoryIdBySlug(slug: string): Promise<string | null> {
  const rows = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.slug, slug))
    .limit(1);
  return rows[0]?.id ?? null;
}

// ---------- إحصاءات الواجهة ----------

export interface RadarStats {
  newToday: number;
  breakingActive: number;
  readyDrafts: number;
  exportedTotal: number;
  activeSources: number;
  lastFetchedAt: string | null;
}

export async function radarStats(): Promise<RadarStats> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [newToday, breakingActive, readyDrafts, exportedTotal, activeSources, lastFetch] =
    await Promise.all([
      db.select({ value: count() }).from(radarItems).where(gte(radarItems.fetchedAt, startOfDay)),
      db
        .select({ value: count() })
        .from(radarItems)
        .where(
          and(
            eq(radarItems.isBreaking, true),
            inArray(radarItems.status, ["new", "analyzed", "ready"])
          )
        ),
      db.select({ value: count() }).from(radarItems).where(eq(radarItems.status, "ready")),
      db.select({ value: count() }).from(radarItems).where(eq(radarItems.status, "exported")),
      db.select({ value: count() }).from(radarSources).where(eq(radarSources.isActive, true)),
      db
        .select({ value: radarSources.lastFetchedAt })
        .from(radarSources)
        .orderBy(desc(radarSources.lastFetchedAt))
        .limit(1),
    ]);

  return {
    newToday: newToday[0]?.value ?? 0,
    breakingActive: breakingActive[0]?.value ?? 0,
    readyDrafts: readyDrafts[0]?.value ?? 0,
    exportedTotal: exportedTotal[0]?.value ?? 0,
    activeSources: activeSources[0]?.value ?? 0,
    lastFetchedAt: lastFetch[0]?.value ? new Date(lastFetch[0].value).toISOString() : null,
  };
}
