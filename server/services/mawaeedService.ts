/**
 * مواعيدك — استعلامات Drizzle. المسارات لا تستورد db.
 * كل كتابة تُسجل في mawaeed_changes. content_updated_at يتحرك فقط إذا تغيّر حقل عام.
 */
import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import { mawaeedChanges, mawaeedOccurrences, mawaeedSeries, users } from "@shared/schema";
import {
  planOccurrenceWrite,
  type Certainty,
  type OccurrenceRecord,
  type OccurrenceStatus,
  type RegionGroup,
  type SeriesKind,
  type SeriesRecord,
} from "@shared/mawaeed/model";
import { presentMawaeed, type MawaeedView } from "@shared/mawaeed/present";
import { STALE_WRITE_MESSAGE, confirmBlockedReason, isStaleWrite } from "@shared/mawaeed/dashboard";
import { mawaeedSitemapEntries } from "@shared/servicePages/catalog";
import { confirmOccurrenceSchema, emptyToNull, type OccurrenceWrite } from "@shared/mawaeed/validate";
import { db } from "../db";

export class MawaeedError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export type AdminChange = {
  id: string;
  seriesId: string;
  occurrenceId: string | null;
  action: string;
  actorName: string | null;
  createdAt: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};

export type AdminBundle = {
  series: SeriesRecord[];
  occurrences: OccurrenceRecord[];
  changes: AdminChange[];
};

function asKind(value: string): SeriesKind {
  if (value === "school_holiday" || value === "salary" || value === "citizen_account" || value === "social_security" || value === "pension") {
    return value;
  }
  return "salary";
}

function asCertainty(value: string): Certainty {
  if (value === "expected" || value === "unverified") return value;
  return "confirmed";
}

function asStatus(value: string): OccurrenceStatus {
  if (value === "cancelled" || value === "superseded") return value;
  return "scheduled";
}

function asRegion(value: string): RegionGroup {
  if (value === "riyadh_most" || value === "western") return value;
  return "all";
}

function stamp(value: Date | string | null | undefined): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value) return new Date(value).toISOString();
  return new Date(0).toISOString();
}

function day(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

type SeriesRow = typeof mawaeedSeries.$inferSelect;
type OccurrenceRow = typeof mawaeedOccurrences.$inferSelect;

function mapSeries(row: SeriesRow): SeriesRecord {
  return {
    id: row.id,
    slug: row.slug,
    kind: asKind(row.kind),
    titleAr: row.titleAr,
    summaryAr: row.summaryAr,
    sortOrder: row.sortOrder,
    published: row.published,
    contentUpdatedAt: stamp(row.contentUpdatedAt),
  };
}

function mapOccurrence(row: OccurrenceRow): OccurrenceRecord {
  return {
    id: row.id,
    seriesId: row.seriesId,
    titleAr: row.titleAr,
    startsOn: day(row.startsOn) || "",
    endsOn: day(row.endsOn),
    sourceUrl: row.sourceUrl,
    sourceTitle: row.sourceTitle,
    certainty: asCertainty(row.certainty),
    status: asStatus(row.status),
    published: row.published,
    regionGroup: asRegion(row.regionGroup),
    hijriLabel: row.hijriLabel,
    publicNote: row.publicNote,
    ruleNote: row.ruleNote,
    updatedAt: stamp(row.updatedAt),
  };
}

async function loadSeries(): Promise<SeriesRecord[]> {
  const rows = await db.select().from(mawaeedSeries).orderBy(asc(mawaeedSeries.sortOrder));
  return rows.map(mapSeries);
}

async function loadOccurrences(): Promise<OccurrenceRecord[]> {
  const rows = await db.select().from(mawaeedOccurrences).orderBy(asc(mawaeedOccurrences.startsOn), asc(mawaeedOccurrences.sortOrder));
  return rows.map(mapOccurrence);
}

export async function getPublicPage(slug: string | null, region: string | null, now = new Date()): Promise<MawaeedView | null> {
  const [series, occurrences] = await Promise.all([loadSeries(), loadOccurrences()]);
  const presented = presentMawaeed({ pageSlug: slug, region, now, series, occurrences });
  return presented.notFound ? null : presented.view;
}

export async function getAdminBundle(): Promise<AdminBundle> {
  const [series, occurrences] = await Promise.all([loadSeries(), loadOccurrences()]);
  const changes = await db
    .select({
      id: mawaeedChanges.id,
      seriesId: mawaeedChanges.seriesId,
      occurrenceId: mawaeedChanges.occurrenceId,
      action: mawaeedChanges.action,
      beforeJson: mawaeedChanges.beforeJson,
      afterJson: mawaeedChanges.afterJson,
      createdAt: mawaeedChanges.createdAt,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(mawaeedChanges)
    .leftJoin(users, eq(mawaeedChanges.actorUserId, users.id))
    .orderBy(desc(mawaeedChanges.createdAt))
    .limit(40);
  return {
    series,
    occurrences,
    changes: changes.map((row) => ({
      id: row.id,
      seriesId: row.seriesId,
      occurrenceId: row.occurrenceId,
      action: row.action,
      actorName: [row.firstName, row.lastName].filter(Boolean).join(" ") || null,
      createdAt: stamp(row.createdAt),
      before: row.beforeJson ?? null,
      after: row.afterJson ?? null,
    })),
  };
}

export async function listSitemapEntries(): Promise<{ loc: string; lastmod: string }[]> {
  return mawaeedSitemapEntries(await loadSeries());
}

function applyWrite(seriesId: string, id: string, write: OccurrenceWrite, previous: OccurrenceRecord | null): OccurrenceRecord {
  const published = write.certainty === "unverified" ? false : write.published;
  return {
    id,
    seriesId,
    titleAr: write.titleAr,
    startsOn: write.startsOn,
    endsOn: emptyToNull(write.endsOn),
    sourceUrl: write.sourceUrl,
    sourceTitle: write.sourceTitle,
    certainty: published ? write.certainty : write.certainty === "confirmed" ? "confirmed" : write.certainty,
    status: write.status ?? previous?.status ?? "scheduled",
    published,
    regionGroup: write.regionGroup,
    hijriLabel: emptyToNull(write.hijriLabel),
    publicNote: emptyToNull(write.publicNote),
    ruleNote: write.ruleNote === undefined ? previous?.ruleNote ?? null : emptyToNull(write.ruleNote),
  };
}

async function persist(
  actorUserId: string,
  before: OccurrenceRecord | null,
  after: OccurrenceRecord,
  action: "create" | "update" | "confirm",
  expectedUpdatedAt?: string | null,
): Promise<void> {
  const plan = planOccurrenceWrite(before, after);
  const now = new Date();
  await db.transaction(async (tx) => {
    if (before && expectedUpdatedAt) {
      // فحص النسخة داخل المعاملة مع قفل الصف: طلبان بالختم نفسه لا يمرّان معاً.
      const [current] = await tx
        .select({ updatedAt: mawaeedOccurrences.updatedAt })
        .from(mawaeedOccurrences)
        .where(eq(mawaeedOccurrences.id, after.id))
        .for("update");
      if (!current) throw new MawaeedError(404, "الموعد غير موجود");
      if (isStaleWrite(expectedUpdatedAt, stamp(current.updatedAt))) throw new MawaeedError(409, STALE_WRITE_MESSAGE);
    }
    if (!before) {
      await tx.insert(mawaeedOccurrences).values({
        id: after.id,
        seriesId: after.seriesId,
        titleAr: after.titleAr,
        startsOn: after.startsOn,
        endsOn: after.endsOn,
        sourceUrl: after.sourceUrl,
        sourceTitle: after.sourceTitle,
        certainty: after.certainty,
        status: after.status,
        published: after.published,
        regionGroup: after.regionGroup,
        hijriLabel: after.hijriLabel,
        publicNote: after.publicNote,
        ruleNote: after.ruleNote,
      });
    } else {
      await tx.update(mawaeedOccurrences).set({
        seriesId: after.seriesId,
        titleAr: after.titleAr,
        startsOn: after.startsOn,
        endsOn: after.endsOn,
        sourceUrl: after.sourceUrl,
        sourceTitle: after.sourceTitle,
        certainty: after.certainty,
        status: after.status,
        published: after.published,
        regionGroup: after.regionGroup,
        hijriLabel: after.hijriLabel,
        publicNote: after.publicNote,
        ruleNote: after.ruleNote,
        updatedAt: now,
      }).where(eq(mawaeedOccurrences.id, after.id));
    }
    await tx.insert(mawaeedChanges).values({
      seriesId: after.seriesId,
      occurrenceId: after.id,
      actorUserId,
      action,
      beforeJson: plan.before,
      afterJson: plan.after,
    });
    for (const seriesId of new Set([after.seriesId, ...plan.stampSeriesIds])) {
      await tx.update(mawaeedSeries).set({
        updatedAt: now,
        ...(plan.stampSeriesIds.includes(seriesId) ? { contentUpdatedAt: now } : {}),
      }).where(eq(mawaeedSeries.id, seriesId));
    }
  });
}

export async function createOccurrence(actorUserId: string, write: OccurrenceWrite): Promise<OccurrenceRecord> {
  const [series] = await db.select({ id: mawaeedSeries.id }).from(mawaeedSeries).where(eq(mawaeedSeries.id, write.seriesId)).limit(1);
  if (!series) throw new MawaeedError(404, "القسم غير موجود");
  const after = applyWrite(write.seriesId, crypto.randomUUID(), write, null);
  await persist(actorUserId, null, after, "create");
  return after;
}

export async function updateOccurrence(actorUserId: string, id: string, write: OccurrenceWrite): Promise<OccurrenceRecord> {
  const [existingRow] = await db.select().from(mawaeedOccurrences).where(eq(mawaeedOccurrences.id, id)).limit(1);
  if (!existingRow) throw new MawaeedError(404, "الموعد غير موجود");
  const [series] = await db.select({ id: mawaeedSeries.id }).from(mawaeedSeries).where(eq(mawaeedSeries.id, write.seriesId)).limit(1);
  if (!series) throw new MawaeedError(404, "القسم غير موجود");
  const before = mapOccurrence(existingRow);
  // فحص مبكر رخيص؛ الفحص الملزم يتكرر داخل معاملة persist مع قفل الصف.
  if (isStaleWrite(write.expectedUpdatedAt, before.updatedAt)) throw new MawaeedError(409, STALE_WRITE_MESSAGE);
  const after = applyWrite(write.seriesId, id, write, before);
  await persist(actorUserId, before, after, "update", write.expectedUpdatedAt);
  return after;
}

export async function confirmOccurrence(actorUserId: string, id: string, body: unknown): Promise<OccurrenceRecord> {
  const parsed = confirmOccurrenceSchema.parse(body);
  const [existingRow] = await db.select().from(mawaeedOccurrences).where(eq(mawaeedOccurrences.id, id)).limit(1);
  if (!existingRow) throw new MawaeedError(404, "الموعد غير موجود");
  const before = mapOccurrence(existingRow);
  // «تأكيد» يرفع درجة التأكد وينشر؛ لا يُعيد موعداً ملغى أو مستبدلاً إلى الجدول بضغطة واحدة.
  const blocked = confirmBlockedReason(before);
  if (blocked) throw new MawaeedError(409, blocked);
  const after: OccurrenceRecord = {
    ...before,
    certainty: "confirmed",
    published: true,
    status: "scheduled",
    sourceUrl: parsed.sourceUrl,
    sourceTitle: parsed.sourceTitle,
  };
  await persist(actorUserId, before, after, "confirm");
  return after;
}

export async function occurrenceHasHumanEdit(occurrenceId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: mawaeedChanges.id })
    .from(mawaeedChanges)
    .where(and(eq(mawaeedChanges.occurrenceId, occurrenceId), isNotNull(mawaeedChanges.actorUserId)))
    .limit(1);
  return Boolean(row);
}
