// جدول المناوبات في قاعدة البيانات: الورديات المتكررة والاستثناءات وحدود التنبيه.
// الورديات والاستثناءات تُعطَّل ولا تُحذف. قبل تنفيذ migrations/20261122_content_duty_room.sql
// تُرمى ContentDutyNotReadyError فيرد المسار 503 وتختفي البطاقة.
import { readFile } from "node:fs/promises";
import { and, asc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  contentDutyExceptions,
  contentDutyShifts,
  roles,
  systemSettings,
  userRoles,
  users,
} from "@shared/schema";
import {
  normalizeThresholds,
  validateShiftInput,
  type DutyExceptionRule,
  type DutyShiftRule,
  type DutyThresholds,
} from "@shared/contentDuty";

export const DUTY_THRESHOLDS_KEY = "content_duty_thresholds";
const SEED_LOCK_KEY = "content_duty_env_seeded";

export class ContentDutyNotReadyError extends Error {
  readonly code = "CONTENT_DUTY_NOT_READY";
  constructor() {
    super("Content duty tables are not installed");
    this.name = "ContentDutyNotReadyError";
  }
}

export class ContentDutyInputError extends Error {
  readonly code = "CONTENT_DUTY_INVALID";
}

function rethrow(error: unknown): never {
  const code = (error as { code?: string; cause?: { code?: string } })?.code ?? (error as { cause?: { code?: string } })?.cause?.code;
  if (code === "42P01" || code === "42501") throw new ContentDutyNotReadyError();
  throw error;
}

export function displayName(u: { firstName: string | null; lastName: string | null; email?: string | null }): string {
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return name || "بلا اسم";
}

export async function listActiveShifts(): Promise<DutyShiftRule[]> {
  try {
    await seedFromEnvOnce();
    const rows = await db
      .select({
        id: contentDutyShifts.id,
        userId: contentDutyShifts.userId,
        days: contentDutyShifts.days,
        startMinute: contentDutyShifts.startMinute,
        endMinute: contentDutyShifts.endMinute,
      })
      .from(contentDutyShifts)
      .where(eq(contentDutyShifts.active, true))
      .orderBy(asc(contentDutyShifts.startMinute));
    return rows.map((r) => ({ ...r, days: Array.isArray(r.days) ? r.days : [] }));
  } catch (error) {
    rethrow(error);
  }
}

export async function listExceptions(fromKey: string, toKey: string): Promise<Array<DutyExceptionRule & { note: string | null }>> {
  try {
    const rows = await db
      .select({
        id: contentDutyExceptions.id,
        dutyDate: contentDutyExceptions.dutyDate,
        userId: contentDutyExceptions.userId,
        coverUserId: contentDutyExceptions.coverUserId,
        note: contentDutyExceptions.note,
      })
      .from(contentDutyExceptions)
      .where(and(
        isNull(contentDutyExceptions.cancelledAt),
        gte(contentDutyExceptions.dutyDate, fromKey),
        lte(contentDutyExceptions.dutyDate, toKey),
      ))
      .orderBy(asc(contentDutyExceptions.dutyDate));
    return rows.map((r) => ({ ...r, dutyDate: String(r.dutyDate).slice(0, 10) }));
  } catch (error) {
    rethrow(error);
  }
}

export async function listRosteredUserIds(): Promise<string[]> {
  const shifts = await listActiveShifts();
  const today = new Date().toISOString().slice(0, 10);
  const exceptions = await listExceptions(today.slice(0, 8) + "01", "9999-12-31");
  const ids = new Set(shifts.map((s) => s.userId));
  for (const e of exceptions) if (e.coverUserId) ids.add(e.coverUserId);
  return Array.from(ids);
}

export async function loadNames(userIds: readonly string[]): Promise<Map<string, string>> {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
    .from(users)
    .where(inArray(users.id, ids));
  return new Map(rows.map((r) => [r.id, displayName(r)]));
}

/** من يمكن إسناد وردية له: مديرو المحتوى والمحررون والمسؤولون النشطون. */
export async function listDutyCandidates(): Promise<Array<{ userId: string; name: string }>> {
  const staffRoles = ["content_manager", "editor", "chief_editor", "admin", "system_admin", "superadmin"];
  const rows = await db
    .selectDistinct({ id: users.id, firstName: users.firstName, lastName: users.lastName })
    .from(users)
    .leftJoin(userRoles, eq(userRoles.userId, users.id))
    .leftJoin(roles, eq(roles.id, userRoles.roleId))
    .where(and(
      eq(users.status, "active"),
      isNull(users.deletedAt),
      sql`(${users.role} in ${staffRoles} or ${roles.name} in ${staffRoles})`,
    ))
    .limit(300);
  return rows
    .map((r) => ({ userId: r.id, name: displayName(r) }))
    .sort((a, b) => a.name.localeCompare(b.name, "ar"));
}

export interface ShiftInput {
  userId: string;
  days: number[];
  startMinute: number;
  endMinute: number;
}

async function assertUserExists(userId: string): Promise<void> {
  const [row] = await db.select({ id: users.id }).from(users)
    .where(and(eq(users.id, userId), eq(users.status, "active"), isNull(users.deletedAt))).limit(1);
  if (!row) throw new ContentDutyInputError("الموظف غير موجود أو غير نشط");
}

export async function createShift(input: ShiftInput, actorId: string): Promise<{ id: string }> {
  const problem = validateShiftInput(input);
  if (problem) throw new ContentDutyInputError(problem);
  try {
    await assertUserExists(input.userId);
    const [row] = await db.insert(contentDutyShifts).values({
      userId: input.userId,
      days: [...input.days].sort((a, b) => a - b),
      startMinute: input.startMinute,
      endMinute: input.endMinute,
      createdBy: actorId,
    }).returning({ id: contentDutyShifts.id });
    return row;
  } catch (error) {
    if (error instanceof ContentDutyInputError) throw error;
    rethrow(error);
  }
}

export async function updateShift(id: string, patch: Partial<ShiftInput> & { active?: boolean }): Promise<boolean> {
  try {
    const [current] = await db.select().from(contentDutyShifts).where(eq(contentDutyShifts.id, id)).limit(1);
    if (!current) return false;
    if (patch.active === false) {
      await db.update(contentDutyShifts).set({ active: false, updatedAt: new Date() }).where(eq(contentDutyShifts.id, id));
      return true;
    }
    const next = {
      userId: patch.userId ?? current.userId,
      days: patch.days ?? current.days,
      startMinute: patch.startMinute ?? current.startMinute,
      endMinute: patch.endMinute ?? current.endMinute,
    };
    const problem = validateShiftInput(next);
    if (problem) throw new ContentDutyInputError(problem);
    if (patch.userId && patch.userId !== current.userId) await assertUserExists(patch.userId);
    await db.update(contentDutyShifts).set({
      ...next,
      days: [...next.days].sort((a, b) => a - b),
      updatedAt: new Date(),
    }).where(eq(contentDutyShifts.id, id));
    return true;
  } catch (error) {
    if (error instanceof ContentDutyInputError) throw error;
    rethrow(error);
  }
}

export async function createException(input: { dutyDate: string; userId: string; coverUserId: string | null; note: string | null }, actorId: string): Promise<{ id: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dutyDate) || Number.isNaN(Date.parse(input.dutyDate))) {
    throw new ContentDutyInputError("التاريخ غير صالح");
  }
  if (input.coverUserId && input.coverUserId === input.userId) throw new ContentDutyInputError("البديل هو نفس الموظف");
  try {
    if (input.coverUserId) await assertUserExists(input.coverUserId);
    return await db.transaction(async (tx) => {
      // استثناء واحد لكل موظف في اليوم: الجديد يلغي القديم.
      await tx.update(contentDutyExceptions)
        .set({ cancelledAt: new Date() })
        .where(and(
          eq(contentDutyExceptions.dutyDate, input.dutyDate),
          eq(contentDutyExceptions.userId, input.userId),
          isNull(contentDutyExceptions.cancelledAt),
        ));
      const [row] = await tx.insert(contentDutyExceptions).values({
        dutyDate: input.dutyDate,
        userId: input.userId,
        coverUserId: input.coverUserId,
        note: input.note?.slice(0, 300) || null,
        createdBy: actorId,
      }).returning({ id: contentDutyExceptions.id });
      return row;
    });
  } catch (error) {
    if (error instanceof ContentDutyInputError) throw error;
    rethrow(error);
  }
}

export async function cancelException(id: string): Promise<boolean> {
  try {
    const rows = await db.update(contentDutyExceptions)
      .set({ cancelledAt: new Date() })
      .where(and(eq(contentDutyExceptions.id, id), isNull(contentDutyExceptions.cancelledAt)))
      .returning({ id: contentDutyExceptions.id });
    return rows.length > 0;
  } catch (error) {
    rethrow(error);
  }
}

export async function getThresholds(): Promise<DutyThresholds> {
  try {
    const [row] = await db.select({ value: systemSettings.value }).from(systemSettings)
      .where(eq(systemSettings.key, DUTY_THRESHOLDS_KEY)).limit(1);
    return normalizeThresholds(row?.value);
  } catch {
    return normalizeThresholds(null);
  }
}

export async function saveThresholds(value: unknown): Promise<DutyThresholds> {
  const next = normalizeThresholds(value);
  await db.insert(systemSettings)
    .values({ key: DUTY_THRESHOLDS_KEY, value: next, category: "editorial" })
    .onConflictDoUpdate({ target: systemSettings.key, set: { value: next, updatedAt: new Date() } });
  return next;
}

// ---------- النقل من الإعداد القديم ----------

interface LegacyManager {
  userId?: string | null;
  shifts?: Array<{ days?: number[]; startHour?: number; endHour?: number }>;
}

/** يحوّل CONTENT_DUTY_ROSTER_JSON القديم إلى ورديات (المديرون بلا userId يُتجاوزون). */
export function legacyRosterToShifts(raw: string): ShiftInput[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  const managers = (parsed as { managers?: LegacyManager[] })?.managers;
  if (!Array.isArray(managers)) return [];
  const out: ShiftInput[] = [];
  for (const m of managers) {
    if (!m?.userId || typeof m.userId !== "string" || !Array.isArray(m.shifts)) continue;
    for (const s of m.shifts) {
      const shift = {
        userId: m.userId,
        days: Array.isArray(s.days) ? s.days : [],
        startMinute: Number(s.startHour) * 60,
        endMinute: Number(s.endHour) * 60,
      };
      if (!validateShiftInput(shift)) out.push(shift);
    }
  }
  return out;
}

let seedChecked = false;

/**
 * مرة واحدة: إن كان جدول الورديات فارغًا وCONTENT_DUTY_ROSTER_JSON مضبوطًا، تُنقل ورديات
 * الإعداد القديم إلى الجدول. علامة في system_settings تمنع التكرار على أي نسخة.
 */
async function seedFromEnvOnce(): Promise<void> {
  if (seedChecked) return;
  const configured = process.env.CONTENT_DUTY_ROSTER_JSON?.trim();
  if (!configured) {
    seedChecked = true;
    return;
  }
  let raw = configured;
  if (!configured.startsWith("{")) {
    try {
      raw = await readFile(configured, "utf8");
    } catch {
      seedChecked = true;
      return;
    }
  }
  const shifts = legacyRosterToShifts(raw);
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${SEED_LOCK_KEY}))`);
    const [marker] = await tx.select({ id: systemSettings.id }).from(systemSettings)
      .where(eq(systemSettings.key, SEED_LOCK_KEY)).limit(1);
    const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(contentDutyShifts);
    if (!marker && Number(count) === 0 && shifts.length > 0) {
      const existing = await tx.select({ id: users.id }).from(users)
        .where(inArray(users.id, Array.from(new Set(shifts.map((s) => s.userId)))));
      const known = new Set(existing.map((u) => u.id));
      const rows = shifts.filter((s) => known.has(s.userId));
      if (rows.length > 0) await tx.insert(contentDutyShifts).values(rows);
      console.log(`[ContentDuty] imported ${rows.length} shift(s) from the legacy roster setting`);
    }
    if (!marker) {
      await tx.insert(systemSettings)
        .values({ key: SEED_LOCK_KEY, value: { at: new Date().toISOString(), imported: shifts.length }, category: "editorial" })
        .onConflictDoNothing();
    }
  });
  seedChecked = true;
}
