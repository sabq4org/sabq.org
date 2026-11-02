/**
 * «قفل المسودات»: محرر يقفل مسودة فلا يعدّلها أو ينشرها أو يحذفها غيره
 * حتى يفكّها. القواعد الصافية في shared/draftLock.ts، وحارس الطلبات في
 * server/routes/articleDraftLock.ts (الويب) وserver/routes/mobileDraftLockGuard.ts
 * (الجوال)، والكتابات المحروسة تمر عبر articleLockAllowsWriter.
 */
import { and, eq, inArray, isNotNull, ne, or, sql } from "drizzle-orm";
import { db } from "../db";
import { articles, notificationsInbox, users } from "@shared/schema";
import {
  canOverrideDraftLock,
  draftLockBlocksUser,
  draftLockState,
  draftLockedMessage,
  DRAFT_LOCKED_CODE,
  normalizeDraftLockNote,
  normalizeOverrideReason,
  type DraftLockState,
} from "@shared/draftLock";
import { authorizeArticleWrite } from "./articleAccessService";
import { logArticleEvent } from "./articleEventsService";
import { notificationBus } from "../notificationBus";
import { memoryCache } from "../memoryCache";

const lockColumns = {
  id: articles.id,
  title: articles.title,
  status: articles.status,
  draftLockedBy: articles.draftLockedBy,
  draftLockedByName: articles.draftLockedByName,
  draftLockedAt: articles.draftLockedAt,
  draftLockNote: articles.draftLockNote,
};

interface LockRow {
  id: string;
  title: string;
  status: string;
  draftLockedBy: string | null;
  draftLockedByName: string | null;
  draftLockedAt: Date | null;
  draftLockNote: string | null;
}

export type DraftLockResult =
  | { ok: true; state: DraftLockState }
  | { ok: false; status: number; code: string; message: string; state?: DraftLockState };

export interface DraftLockBlock {
  status: 409;
  body: {
    success: false;
    code: typeof DRAFT_LOCKED_CODE;
    message: string;
    error: string;
    draftLock: DraftLockState;
    articleIds: string[];
  };
}

async function loadLockRow(articleId: string): Promise<LockRow | null> {
  const [row] = await db.select(lockColumns).from(articles).where(eq(articles.id, articleId)).limit(1);
  return (row as LockRow | undefined) ?? null;
}

export async function getDraftLock(articleId: string, userId: string): Promise<DraftLockResult> {
  const row = await loadLockRow(articleId);
  if (!row) return { ok: false, status: 404, code: "not_found", message: "المادة غير موجودة" };
  return { ok: true, state: draftLockState(row, userId) };
}

/**
 * هل يمنع قفلُ مسودة هذا المستخدم من طلب يكتب على هذه المواد؟
 * يرجع أول قفل مانع مع كل المعرّفات المقفلة عند غيره، أو null.
 */
export async function findDraftLockBlock(articleIds: string[], userId: string | null | undefined): Promise<DraftLockBlock | null> {
  const ids = Array.from(new Set(articleIds));
  if (!ids.length) return null;
  // كل المعرّفات تُفحص على دفعات، فلا تفلت مسودة مقفلة في آخر دفعة جماعية كبيرة
  const rows: LockRow[] = [];
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = await db
      .select(lockColumns)
      .from(articles)
      .where(and(inArray(articles.id, ids.slice(i, i + 500)), eq(articles.status, "draft"), isNotNull(articles.draftLockedBy)));
    rows.push(...(chunk as LockRow[]));
  }
  const blocking = rows.filter((row) => draftLockBlocksUser(row, userId));
  if (!blocking.length) return null;
  const first = blocking[0];
  const message = blocking.length > 1
    ? `${blocking.length} من المواد المحددة مسودات مقفلة لدى زملاء. ألغِ تحديدها أو اطلب فك القفل.`
    : draftLockedMessage(first.draftLockedByName);
  return {
    status: 409,
    body: {
      success: false,
      code: DRAFT_LOCKED_CODE,
      message,
      error: message,
      draftLock: draftLockState(first, userId),
      articleIds: blocking.map((row) => row.id),
    },
  };
}

function invalidateArticleListCaches(articleId: string) {
  memoryCache.invalidatePattern("^articles:");
  memoryCache.delete(`article:id:${articleId}`);
}

async function displayName(userId: string, sessionUser?: { firstName?: string | null; lastName?: string | null; email?: string | null }): Promise<string> {
  const fromSession = [sessionUser?.firstName, sessionUser?.lastName].filter(Boolean).join(" ").trim();
  if (fromSession) return fromSession;
  const [row] = await db
    .select({ firstName: users.firstName, lastName: users.lastName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return [row?.firstName, row?.lastName].filter(Boolean).join(" ").trim() || "محرر";
}

/** «اقفل»: لمن يملك تعديل المادة، على مسودة غير مقفلة عند غيره. */
export async function lockDraft(input: {
  articleId: string;
  userId: string;
  permissions: string[];
  note?: unknown;
  sessionUser?: { firstName?: string | null; lastName?: string | null; email?: string | null };
}): Promise<DraftLockResult> {
  const access = await authorizeArticleWrite(input.userId, input.articleId, input.permissions);
  if (!access.ok) return { ok: false, status: access.httpStatus, code: "forbidden", message: access.message };

  const note = normalizeDraftLockNote(input.note);
  const name = await displayName(input.userId, input.sessionUser);
  const now = new Date();
  const [row] = await db
    .update(articles)
    .set({ draftLockedBy: input.userId, draftLockedByName: name, draftLockedAt: now, draftLockNote: note })
    .where(and(
      eq(articles.id, input.articleId),
      eq(articles.status, "draft"),
      or(sql`${articles.draftLockedBy} is null`, eq(articles.draftLockedBy, input.userId)),
    ))
    .returning(lockColumns);

  if (!row) {
    const current = await loadLockRow(input.articleId);
    if (!current) return { ok: false, status: 404, code: "not_found", message: "المادة غير موجودة" };
    if (current.status !== "draft") {
      return { ok: false, status: 409, code: "not_a_draft", message: "القفل للمسودات فقط" };
    }
    return {
      ok: false,
      status: 409,
      code: DRAFT_LOCKED_CODE,
      message: draftLockedMessage(current.draftLockedByName),
      state: draftLockState(current, input.userId),
    };
  }

  invalidateArticleListCaches(input.articleId);
  logArticleEvent({
    articleId: input.articleId,
    eventType: "draft_locked",
    actorId: input.userId,
    summary: note ? `قفل المسودة: ${note}` : "قفل المسودة",
    metadata: { note },
  }).catch((error) => console.error("[draft-lock] event log failed", error));
  return { ok: true, state: draftLockState(row as LockRow, input.userId) };
}

/**
 * «فك القفل»: صاحب القفل دائمًا، أو مسؤول النظام لقفل زميل بسبب مكتوب
 * (يصل صاحب القفل إشعار ويُسجَّل في سجل المقال).
 */
export async function unlockDraft(input: {
  articleId: string;
  userId: string;
  permissions: string[];
  reason?: unknown;
}): Promise<DraftLockResult> {
  const current = await loadLockRow(input.articleId);
  if (!current) return { ok: false, status: 404, code: "not_found", message: "المادة غير موجودة" };
  if (!current.draftLockedBy) return { ok: true, state: draftLockState(null, input.userId) };

  const isOwner = current.draftLockedBy === input.userId;
  let reason: string | null = null;
  if (!isOwner) {
    if (!canOverrideDraftLock(input.permissions)) {
      return {
        ok: false,
        status: 403,
        code: "forbidden",
        message: "فك قفل زميل متاح لمسؤول النظام فقط",
        state: draftLockState(current, input.userId),
      };
    }
    reason = normalizeOverrideReason(input.reason);
    if (!reason) {
      return { ok: false, status: 400, code: "reason_required", message: "اكتب سبب فك القفل (3 أحرف على الأقل)" };
    }
  }

  const [row] = await db
    .update(articles)
    .set({ draftLockedBy: null, draftLockedByName: null, draftLockedAt: null, draftLockNote: null })
    .where(and(eq(articles.id, input.articleId), eq(articles.draftLockedBy, current.draftLockedBy)))
    .returning({ id: articles.id });
  if (!row) {
    // تغيّر القفل بين القراءة والكتابة (فكّه صاحبه أو أعاد قفله): أعد الحالة الحالية
    const latest = await loadLockRow(input.articleId);
    return { ok: true, state: draftLockState(latest, input.userId) };
  }

  invalidateArticleListCaches(input.articleId);
  if (isOwner) {
    logArticleEvent({
      articleId: input.articleId,
      eventType: "draft_unlocked",
      actorId: input.userId,
      summary: "فك قفل المسودة",
    }).catch((error) => console.error("[draft-lock] event log failed", error));
  } else {
    const actorName = await displayName(input.userId);
    logArticleEvent({
      articleId: input.articleId,
      eventType: "draft_unlocked",
      actorId: input.userId,
      summary: `فك مسؤول النظام قفل ${current.draftLockedByName || "زميل"}: ${reason}`,
      metadata: { override: true, reason, previousLockedBy: current.draftLockedBy },
    }).catch((error) => console.error("[draft-lock] event log failed", error));
    notifyLockOwner({
      ownerId: current.draftLockedBy,
      articleId: input.articleId,
      title: current.title,
      actorName,
      reason: reason!,
    }).catch((error) => console.error("[draft-lock] notify failed", error));
  }
  return { ok: true, state: draftLockState(null, input.userId) };
}

async function notifyLockOwner(input: { ownerId: string; articleId: string; title: string | null; actorName: string; reason: string }) {
  const title = "فُك قفل مسودتك";
  const body = `فك ${input.actorName} قفل «${(input.title || "مسودة").slice(0, 120)}». السبب: ${input.reason}`;
  const deeplink = `/dashboard/articles/${input.articleId}/edit`;
  const metadata = { articleId: input.articleId, draftLockOverride: true };
  const [inbox] = await db.insert(notificationsInbox).values({
    userId: input.ownerId,
    type: "DraftLockOverridden",
    title,
    body,
    deeplink,
    read: false,
    metadata,
  }).returning();
  notificationBus.emit(input.ownerId, {
    id: inbox?.id,
    type: "DraftLockOverridden",
    title,
    body,
    deeplink,
    read: false,
    metadata,
    createdAt: inbox?.createdAt,
  });
}

/** عدد المسودات المقفلة لشريحة «مقفلة» (ومنها مقفلاتي). */
export async function draftLockSummary(userId: string, ownOnly: boolean): Promise<{ total: number; mine: number }> {
  const scope = ownOnly
    ? or(eq(articles.authorId, userId), eq(articles.reporterId, userId))
    : undefined;
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      mine: sql<number>`count(*) filter (where ${articles.draftLockedBy} = ${userId})::int`,
    })
    .from(articles)
    .where(and(isNotNull(articles.draftLockedBy), eq(articles.status, "draft"), scope));
  return { total: Number(row?.total ?? 0), mine: Number(row?.mine ?? 0) };
}

/** لمكتب الرأي في «مكتب سبق»: رسالة الرفض حين يمنع قفل زميل الكتابة. */
export async function draftLockMessageFor(articleId: string, userId: string): Promise<string | null> {
  const [row] = await db
    .select({ name: articles.draftLockedByName })
    .from(articles)
    .where(and(
      eq(articles.id, articleId),
      eq(articles.status, "draft"),
      isNotNull(articles.draftLockedBy),
      ne(articles.draftLockedBy, userId),
    ))
    .limit(1);
  return row ? draftLockedMessage(row.name) : null;
}
