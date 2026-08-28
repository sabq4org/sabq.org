/**
 * طبقة الوصول لبيانات الاقتصاد (ADR-001: Drizzle هنا فقط، لا في المسارات).
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { economyObservations, economyReports, type EconomyObservation, type EconomyReport } from "@shared/schema";

export type ObservationSource = "sama_indicator" | "sama_fx" | "sama_news" | "sama_report";

export interface ObserveInput {
  source: ObservationSource;
  key: string;
  value: number | null;
  valueText?: string | null;
  asOf?: string | null;
  payload?: Record<string, unknown>;
}

export interface ObserveResult {
  changed: boolean;
  first: boolean;
  previous: EconomyObservation | null;
}

const latestCache = new Map<string, EconomyObservation>();

function cacheKey(source: string, key: string): string {
  return `${source}|${key}`;
}

export async function getLatestObservation(source: ObservationSource, key: string): Promise<EconomyObservation | null> {
  const ck = cacheKey(source, key);
  const cached = latestCache.get(ck);
  if (cached) return cached;
  const rows = await db
    .select()
    .from(economyObservations)
    .where(and(eq(economyObservations.source, source), eq(economyObservations.key, key)))
    .orderBy(desc(economyObservations.observedAt))
    .limit(1);
  if (rows[0]) latestCache.set(ck, rows[0]);
  return rows[0] ?? null;
}

/** آخر قيمة لكل مفتاح ضمن مصدر (DISTINCT ON). */
export async function getLatestObservationsBySource(source: ObservationSource): Promise<EconomyObservation[]> {
  const rows = await db.execute<EconomyObservation>(sql`
    SELECT DISTINCT ON (key) id, source, key, value, value_text AS "valueText", as_of AS "asOf",
           payload, previous_value AS "previousValue", observed_at AS "observedAt"
    FROM economy_observations
    WHERE source = ${source}
    ORDER BY key, observed_at DESC
  `);
  return (rows as unknown as { rows?: EconomyObservation[] }).rows ?? (rows as unknown as EconomyObservation[]);
}

function sameValue(prev: EconomyObservation | null, input: ObserveInput): boolean {
  if (!prev) return false;
  const prevVal = prev.value ?? null;
  if (prevVal !== input.value) return false;
  if ((prev.asOf ?? null) !== (input.asOf ?? null)) return false;
  if (input.value === null && (prev.valueText ?? null) !== (input.valueText ?? null)) return false;
  return true;
}

/** يسجّل المشاهدة فقط إن تغيّرت القيمة/التاريخ أو كانت الأولى. */
export async function observe(input: ObserveInput): Promise<ObserveResult> {
  const previous = await getLatestObservation(input.source, input.key);
  if (sameValue(previous, input)) return { changed: false, first: false, previous };
  const [row] = await db
    .insert(economyObservations)
    .values({
      source: input.source,
      key: input.key,
      value: input.value,
      valueText: input.valueText ?? null,
      asOf: input.asOf ?? null,
      payload: input.payload ?? {},
      previousValue: previous?.value ?? null,
    })
    .returning();
  latestCache.set(cacheKey(input.source, input.key), row);
  return { changed: previous !== null, first: previous === null, previous };
}

export async function getObservationHistory(source: ObservationSource, key: string, limit = 50): Promise<EconomyObservation[]> {
  return db
    .select()
    .from(economyObservations)
    .where(and(eq(economyObservations.source, source), eq(economyObservations.key, key)))
    .orderBy(desc(economyObservations.observedAt))
    .limit(limit);
}

// ---------------- التقارير ----------------

export interface UpsertReportInput {
  kind: string;
  fileName: string;
  fileUrl: string;
  publishedAt?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  parsed: Record<string, unknown>;
  status?: "parsed" | "failed";
  error?: string | null;
}

export async function reportExists(fileName: string): Promise<boolean> {
  const rows = await db.select({ id: economyReports.id }).from(economyReports).where(eq(economyReports.fileName, fileName)).limit(1);
  return rows.length > 0;
}

export async function insertReport(input: UpsertReportInput): Promise<EconomyReport> {
  const [row] = await db
    .insert(economyReports)
    .values({
      kind: input.kind,
      fileName: input.fileName,
      fileUrl: input.fileUrl,
      publishedAt: input.publishedAt ?? null,
      periodStart: input.periodStart ?? null,
      periodEnd: input.periodEnd ?? null,
      parsed: input.parsed,
      status: input.status ?? "parsed",
      error: input.error ?? null,
    })
    .onConflictDoNothing({ target: economyReports.fileName })
    .returning();
  if (row) return row;
  const [existing] = await db.select().from(economyReports).where(eq(economyReports.fileName, input.fileName)).limit(1);
  return existing;
}

export async function getLatestReport(kind: string): Promise<EconomyReport | null> {
  const rows = await db
    .select()
    .from(economyReports)
    .where(and(eq(economyReports.kind, kind), eq(economyReports.status, "parsed")))
    .orderBy(desc(economyReports.publishedAt), desc(economyReports.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function listReports(kind: string, limit = 12): Promise<EconomyReport[]> {
  return db
    .select()
    .from(economyReports)
    .where(and(eq(economyReports.kind, kind), eq(economyReports.status, "parsed")))
    .orderBy(desc(economyReports.publishedAt), desc(economyReports.createdAt))
    .limit(limit);
}

export async function attachReportArticle(reportId: string, articleId: string): Promise<void> {
  await db.update(economyReports).set({ articleId }).where(eq(economyReports.id, reportId));
}
