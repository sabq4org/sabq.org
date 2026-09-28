/**
 * رادار سبق الذكي — طبقة الاستعلامات (وفق ADR-001: كل Drizzle هنا، لا في المسارات).
 */
import { and, count, desc, eq, gte, inArray, isNull, lt, sql as dsql } from "drizzle-orm";
import { db } from "../../db";
import { RADAR_RATE_LIMIT_BACKOFF_MINUTES } from "./fetchPolicy";
import { topicFingerprintFor } from "./textNormalize";
import { triageIntake } from "./triage";
import {
  categories,
  radarAlertRules,
  radarItems,
  radarSources,
  radarStories,
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
        dsql`(
          ${radarSources.lastFetchedAt} IS NULL
          OR ${radarSources.lastFetchedAt} < now() - make_interval(
            mins => CASE
              WHEN ${radarSources.lastError} ILIKE '%429%'
                THEN GREATEST(${radarSources.fetchIntervalMinutes}, ${RADAR_RATE_LIMIT_BACKOFF_MINUTES})
              ELSE ${radarSources.fetchIntervalMinutes}
            END
          )
        )`
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
  /** الناشر الحقيقي لمواد ممرات الاصطياد (Google News/GDELT) */
  publisher?: string;
  /** لغة المادة الفعلية إن عرفها الممر (GDELT) — وإلا لغة المصدر */
  language?: string;
  imageUrl?: string;
  publishedAt?: Date;
  metrics?: { likes?: number; retweets?: number; replies?: number; views?: number };
}

/** نافذة منع تكرار القصة عبر المصادر — الخبر يصل من عدة ممرات بعناوين متطابقة تقريبًا */
const DEDUP_WINDOW_HOURS = Number(process.env.RADAR_DEDUP_WINDOW_HOURS || 48);

/**
 * إدراج دفعة مواد مع فرز حتمي ومنع تكرار يحفظ الأثر:
 * 1) (sourceId, guid) — نفس المادة من نفس المصدر: لا تُدرج.
 * 2) بصمة العنوان عبر كل المصادر خلال النافذة — نفس القصة من ممر/ناشر آخر:
 *    تُدرج بحالة merged مربوطة بالأصل (duplicateOfId) بلا تحليل مدفوع،
 *    فيبقى إسهام الناشر في عدّ المصادر المستقلة بدل إسقاطه.
 *    (لمصادر الخلاصات فقط؛ منشورات X تبقى لأن تفاعلها يغذي الزخم).
 * 3) الفرز قبل التحليل (بيان صحفي/تاريخ مستحيل) → filtered مع السبب.
 * يعيد المُدرَج بحالة new فقط (ما يدخل طابور التحليل).
 */
export async function insertItems(
  source: RadarSource,
  items: NormalizedRadarItem[]
): Promise<RadarItem[]> {
  if (!items.length) return [];

  const now = new Date();
  const withHashes = items.map((item) => ({
    item,
    titleHash: topicFingerprintFor(item.title) || null,
    triage: triageIntake(
      {
        title: item.title,
        excerpt: item.excerpt,
        link: item.link,
        publisher: item.publisher,
        publishedAt: item.publishedAt,
        sourceType: source.type,
        sourceId: source.id,
        xHandle: source.type === "x" ? item.publisher ?? source.xValue : null,
      },
      now
    ),
    duplicateOfId: null as string | null,
  }));

  if (source.type !== "x") {
    const hashes = Array.from(
      new Set(withHashes.map((e) => e.titleHash).filter((h): h is string => Boolean(h)))
    );
    const firstByHash = new Map<string, string>();
    if (hashes.length) {
      const cutoff = new Date(Date.now() - DEDUP_WINDOW_HOURS * 60 * 60 * 1000);
      const existing = await db
        .select({ id: radarItems.id, titleHash: radarItems.titleHash, dupOf: radarItems.duplicateOfId })
        .from(radarItems)
        .where(and(inArray(radarItems.titleHash, hashes), gte(radarItems.fetchedAt, cutoff)))
        .orderBy(radarItems.fetchedAt);
      for (const row of existing) {
        if (row.titleHash && !firstByHash.has(row.titleHash)) firstByHash.set(row.titleHash, row.dupOf ?? row.id);
      }
    }
    for (const entry of withHashes) {
      if (entry.titleHash && firstByHash.has(entry.titleHash)) {
        entry.duplicateOfId = firstByHash.get(entry.titleHash)!;
      }
    }
  }

  // تكرار داخل الدفعة نفسها: الأول أصل، والبقية تُربط به بعد إدراجه
  const primaries: typeof withHashes = [];
  const intraDupes: typeof withHashes = [];
  const seenInBatch = new Set<string>();
  for (const entry of withHashes) {
    if (!entry.duplicateOfId && entry.titleHash && source.type !== "x") {
      if (seenInBatch.has(entry.titleHash)) {
        intraDupes.push(entry);
        continue;
      }
      seenInBatch.add(entry.titleHash);
    }
    primaries.push(entry);
  }

  const toRow = (entry: (typeof withHashes)[number], duplicateOfId: string | null) => ({
    sourceId: source.id,
    guid: entry.item.guid,
    link: entry.item.link,
    originalTitle: entry.item.title,
    originalExcerpt: entry.item.excerpt,
    originalLanguage: entry.item.language ?? source.language,
    publisher: entry.item.publisher ?? null,
    titleHash: entry.titleHash,
    imageUrl: entry.item.imageUrl,
    publishedAt: entry.item.publishedAt,
    metrics: entry.item.metrics ?? null,
    publisherKey: entry.triage.publisherKey,
    publisherType: entry.triage.publisherType,
    wireOrigin: entry.triage.wireOrigin,
    textBasis: entry.triage.textBasis,
    qualityFlags: entry.triage.qualityFlags,
    screenReason: entry.triage.screenReason,
    duplicateOfId,
    status: duplicateOfId ? "merged" : entry.triage.screenReason ? "filtered" : "new",
  });

  const rows = primaries.length
    ? await db
        .insert(radarItems)
        .values(primaries.map((e) => toRow(e, e.duplicateOfId)))
        .onConflictDoNothing({ target: [radarItems.sourceId, radarItems.guid] })
        .returning()
    : [];

  if (intraDupes.length) {
    const idByHash = new Map(rows.map((r) => [r.titleHash, r.duplicateOfId ?? r.id]));
    const linked = intraDupes.filter((e) => e.titleHash && idByHash.has(e.titleHash));
    if (linked.length) {
      await db
        .insert(radarItems)
        .values(linked.map((e) => toRow(e, idByHash.get(e.titleHash)!)))
        .onConflictDoNothing({ target: [radarItems.sourceId, radarItems.guid] });
    }
  }

  return rows.filter((r) => r.status === "new");
}

export interface RadarItemFilters {
  statuses?: string[];
  minScore?: number;
  sourceId?: string;
  /** x = رصدات إكس فقط · feed = صحف/RSS/JSON فقط */
  channel?: "x" | "feed";
  breakingOnly?: boolean;
  /** مسار العرض: فرص / رصد يحتاج تحققًا / خلفية */
  lane?: "opportunity" | "watch" | "background";
  /** priority = الأولوية المركبة (الافتراضي في الواجهة) · recent = وقت الرصد */
  sort?: "priority" | "recent";
  /** بطاقة واحدة لكل قصة: تُعرض أعلى مادة أولوية فقط وتُعدّ البقية «تغطيات» */
  collapseStories?: boolean;
  /** آخر N ساعة — على تاريخ النشر، ويسقط لوقت الرصد إن غاب */
  sinceHours?: number;
  limit?: number;
  offset?: number;
}

export type RadarItemListRow = RadarItem & {
  sourceName: string | null;
  sourceType: string | null;
  xValue: string | null;
  /** مصادر مستقلة في قصة المادة (ناشر/وكالة أصل، لا ممرات) */
  storySourceCount: number | null;
  /** نسخ ضُمّت لهذه المادة شاهدًا بلا تحليل */
  mergedCopies: number;
  /** مواد أخرى من القصة نفسها أُخفيت خلف هذه البطاقة (عند collapseStories) */
  storySiblings: number;
};

/**
 * عاجل «نشط» = وسم لم تنتهِ صلاحيته. المواد السابقة للترقية (بلا breaking_until)
 * تُعد نشطة 3 ساعات من رصدها فقط — لا عاجل أبدي.
 */
export const activeBreakingSql = dsql`(${radarItems.isBreaking} = true AND (
  ${radarItems.breakingUntil} > now()
  OR (${radarItems.breakingUntil} IS NULL AND ${radarItems.fetchedAt} > now() - interval '3 hours')
))`;

function itemConditions(filters: RadarItemFilters) {
  const conditions = [];
  if (filters.statuses?.length) conditions.push(inArray(radarItems.status, filters.statuses));
  if (filters.minScore != null) conditions.push(gte(radarItems.newsValue, filters.minScore));
  if (filters.sourceId) conditions.push(eq(radarItems.sourceId, filters.sourceId));
  if (filters.breakingOnly) conditions.push(activeBreakingSql);
  if (filters.lane === "opportunity") {
    // مواد قبل الترقية (lane فارغ) تُعرض في الفرص حتى لا تختفي
    conditions.push(dsql`(${radarItems.lane} = 'opportunity' OR ${radarItems.lane} IS NULL)`);
  } else if (filters.lane) {
    conditions.push(eq(radarItems.lane, filters.lane));
  }
  if (filters.sinceHours) {
    conditions.push(
      dsql`coalesce(${radarItems.publishedAt}, ${radarItems.fetchedAt}) >= now() - make_interval(hours => ${filters.sinceHours})`
    );
  }
  if (filters.collapseStories) {
    // لا تُعرض مادة إن كان في قصتها مادة أعلى ترتيبًا بالحالات نفسها
    const statuses = filters.statuses?.length ? filters.statuses : ["new", "analyzed", "ready"];
    conditions.push(dsql`(${radarItems.storyId} IS NULL OR NOT EXISTS (
      SELECT 1 FROM radar_items sib
      WHERE sib.story_id = ${radarItems.storyId}
        AND sib.id <> ${radarItems.id}
        AND sib.status IN (${dsql.join(statuses.map((st) => dsql`${st}`), dsql`, `)})
        AND (coalesce(sib.priority_score, -1), coalesce(sib.news_value, -1), sib.fetched_at, sib.id)
          > (coalesce(${radarItems.priorityScore}, -1), coalesce(${radarItems.newsValue}, -1), ${radarItems.fetchedAt}, ${radarItems.id})
    ))`);
  }
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
        storySourceCount: radarStories.sourceCount,
      })
      .from(radarItems)
      .leftJoin(radarSources, eq(radarItems.sourceId, radarSources.id))
      .leftJoin(radarStories, eq(radarItems.storyId, radarStories.id))
      .where(where)
      .orderBy(
        ...(filters.sort === "priority"
          ? [dsql`${radarItems.priorityScore} DESC NULLS LAST`, desc(radarItems.fetchedAt)]
          : [desc(radarItems.fetchedAt)])
      )
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
  const ids = rows.map((r) => r.item.id);
  const copies = ids.length
    ? await db
        .select({ id: radarItems.duplicateOfId, n: count() })
        .from(radarItems)
        .where(inArray(radarItems.duplicateOfId, ids))
        .groupBy(radarItems.duplicateOfId)
    : [];
  const copyCount = new Map(copies.map((c) => [c.id, Number(c.n)]));
  const storyIds = Array.from(
    new Set(rows.map((r) => r.item.storyId).filter((id): id is string => Boolean(id)))
  );
  const siblings =
    filters.collapseStories && storyIds.length
      ? await db
          .select({ storyId: radarItems.storyId, n: count() })
          .from(radarItems)
          .where(
            and(
              inArray(radarItems.storyId, storyIds),
              inArray(radarItems.status, filters.statuses?.length ? filters.statuses : ["new", "analyzed", "ready"])
            )
          )
          .groupBy(radarItems.storyId)
      : [];
  const siblingCount = new Map(siblings.map((r) => [r.storyId, Number(r.n) - 1]));
  return {
    items: rows.map((r) => ({
      ...r.item,
      sourceName: r.sourceName,
      sourceType: r.sourceType,
      xValue: r.xValue,
      storySourceCount: r.storySourceCount ?? null,
      mergedCopies: copyCount.get(r.item.id) ?? 0,
      storySiblings: (r.item.storyId && siblingCount.get(r.item.storyId)) || 0,
    })),
    total: totals[0]?.value ?? 0,
  };
}

export async function getItem(id: string): Promise<RadarItem | undefined> {
  const rows = await db.select().from(radarItems).where(eq(radarItems.id, id)).limit(1);
  return rows[0];
}

export async function itemsByIds(ids: string[]): Promise<RadarItem[]> {
  if (!ids.length) return [];
  return db.select().from(radarItems).where(inArray(radarItems.id, ids));
}

export async function updateItem(
  id: string,
  patch: Partial<typeof radarItems.$inferInsert>
): Promise<RadarItem | undefined> {
  const rows = await db.update(radarItems).set(patch).where(eq(radarItems.id, id)).returning();
  return rows[0];
}

/**
 * مواد جديدة لم تُحلَّل بعد — الأحدث رصدًا أولًا، ضمن آخر 24 ساعة فقط:
 * طابور متراكم أقدم من ذلك لا يستحق كلفة ترجمة (يبقى new حتى التنظيف).
 */
export async function itemsNeedingAnalysis(limit: number): Promise<RadarItem[]> {
  return db
    .select()
    .from(radarItems)
    .where(
      and(
        eq(radarItems.status, "new"),
        isNull(radarItems.error),
        gte(radarItems.fetchedAt, new Date(Date.now() - 24 * 60 * 60 * 1000))
      )
    )
    .orderBy(desc(radarItems.fetchedAt))
    .limit(limit);
}

/** بداية اليوم بتوقيت الرياض (UTC+3 بلا توقيت صيفي) */
export function startOfRiyadhDay(now: Date = new Date()): Date {
  const shifted = new Date(now.getTime() + 3 * 3_600_000);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - 3 * 3_600_000);
}

/** عدد المواد المحلَّلة اليوم — أساس سقف الكلفة اليومي */
export async function countAnalyzedToday(): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(radarItems)
    .where(gte(radarItems.analyzedAt, startOfRiyadhDay()));
  return Number(rows[0]?.value ?? 0);
}

/** آخر تحليل ناجح — لحالة التشغيل المعروضة */
export async function lastAnalyzedAt(): Promise<Date | null> {
  const rows = await db
    .select({ value: radarItems.analyzedAt })
    .from(radarItems)
    .where(dsql`${radarItems.analyzedAt} IS NOT NULL`)
    .orderBy(desc(radarItems.analyzedAt))
    .limit(1);
  return rows[0]?.value ?? null;
}

/** المواد المحلَّلة لقصص بعينها — لإعادة حساب البوابات بعد تغيّر التأييد */
export async function analyzedItemsForStories(storyIds: string[]): Promise<RadarItem[]> {
  if (!storyIds.length) return [];
  return db
    .select()
    .from(radarItems)
    .where(and(inArray(radarItems.storyId, storyIds), inArray(radarItems.status, ["analyzed", "ready"])));
}

/** مواد عاجلة عالية القيمة بلا مسودة — مرشحة للتحويل التلقائي */
export async function breakingItemsNeedingDraft(minScore: number, limit: number): Promise<RadarItem[]> {
  return db
    .select()
    .from(radarItems)
    .where(
      and(
        eq(radarItems.status, "analyzed"),
        activeBreakingSql,
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
        inArray(radarItems.status, ["new", "analyzed", "ready", "dismissed", "filtered", "merged"])
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
  /** استبعاد آلي قبل التحليل اليوم (بيانات صحفية/تواريخ مستحيلة) */
  filteredToday: number;
  /** نسخ شبه مطابقة ضُمّت اليوم بلا تحليل */
  mergedToday: number;
  readyDrafts: number;
  exportedTotal: number;
  activeSources: number;
  lastFetchedAt: string | null;
  /** آخر جلب لممر NewsAPI.ai (Event Registry) — يُجلب كل ساعة ترشيدًا للتوكنز */
  newsapiLastFetchedAt: string | null;
}

export async function radarStats(): Promise<RadarStats> {
  const startOfDay = startOfRiyadhDay();

  const [newToday, breakingActive, readyDrafts, exportedTotal, activeSources, lastFetch, newsapiFetch, byStatusToday] =
    await Promise.all([
      db.select({ value: count() }).from(radarItems).where(gte(radarItems.fetchedAt, startOfDay)),
      db
        .select({ value: count() })
        .from(radarItems)
        .where(and(activeBreakingSql, inArray(radarItems.status, ["new", "analyzed", "ready"]))),
      db.select({ value: count() }).from(radarItems).where(eq(radarItems.status, "ready")),
      db.select({ value: count() }).from(radarItems).where(eq(radarItems.status, "exported")),
      db.select({ value: count() }).from(radarSources).where(eq(radarSources.isActive, true)),
      db
        .select({ value: radarSources.lastFetchedAt })
        .from(radarSources)
        .orderBy(desc(radarSources.lastFetchedAt))
        .limit(1),
      db
        .select({ value: radarSources.lastFetchedAt })
        .from(radarSources)
        .where(dsql`${radarSources.url} like '%eventregistry.org%'`)
        .orderBy(desc(radarSources.lastFetchedAt))
        .limit(1),
      db
        .select({ status: radarItems.status, value: count() })
        .from(radarItems)
        .where(and(gte(radarItems.fetchedAt, startOfDay), inArray(radarItems.status, ["filtered", "merged"])))
        .groupBy(radarItems.status),
    ]);
  const statusCount = (status: string) =>
    Number(byStatusToday.find((r) => r.status === status)?.value ?? 0);

  return {
    newToday: newToday[0]?.value ?? 0,
    breakingActive: breakingActive[0]?.value ?? 0,
    filteredToday: statusCount("filtered"),
    mergedToday: statusCount("merged"),
    readyDrafts: readyDrafts[0]?.value ?? 0,
    exportedTotal: exportedTotal[0]?.value ?? 0,
    activeSources: activeSources[0]?.value ?? 0,
    lastFetchedAt: lastFetch[0]?.value ? new Date(lastFetch[0].value).toISOString() : null,
    newsapiLastFetchedAt: newsapiFetch[0]?.value
      ? new Date(newsapiFetch[0].value).toISOString()
      : null,
  };
}
