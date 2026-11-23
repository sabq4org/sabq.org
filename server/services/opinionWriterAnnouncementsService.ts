// خدمة إعلانات كتّاب الرأي ومتابعة التفاعل بالأسماء.
// - الكاتب: يرى الإعلانات السارية مع حالته (رآه/تفاعل/صوته)، ويسجّل الرؤية والتصويت والفتح.
// - الإدارة (opinion.review): تنشئ وتنهي، وترى لكل إعلان من رآه ومن تفاعل بالاسم، وتذكّر من لم يتفاعل
//   (بريد، مرة في اليوم على الأكثر). تحميل الملف يُسجَّل من مسار تنزيل ملفات الكتّاب نفسه.
// الاجتماع القادم ونموذج «اهتماماتي» يظهران للكاتب تلقائياً من أنظمتهما ولا يُخزَّنان هنا.

import { and, desc, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
import {
  opinionWriterAnnouncements,
  opinionWriterEngagement,
  opinionWriterFeedback,
  opinionWriterFiles,
  roles,
  userRoles,
  users,
} from "@shared/schema";
import {
  REMIND_COOLDOWN_MS,
  announcementKindMeta,
  tallyVotes,
  type CreateAnnouncementInput,
  type EngagementAction,
} from "@shared/opinionWriterAnnouncements";
import { db } from "../db";
import { sendEmailNotification } from "./email";

export const SUBJECT_ANNOUNCEMENT = "announcement";
export const SUBJECT_FILE = "file";
type SubjectType = typeof SUBJECT_ANNOUNCEMENT | typeof SUBJECT_FILE;

const SITE_URL = (process.env.MEETINGS_PUBLIC_URL || "https://sabq.org").replace(/\/+$/, "");
const WRITER_HOME_PATH = "/dashboard/opinion-author";
// حد MailerSend 120 رسالة/دقيقة؛ رسالة كل 600ms تبقينا تحته بهامش
const EMAIL_GAP_MS = 600;
const ENDED_VISIBLE_DAYS = 30;

export class AnnouncementError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function fullName(firstName: string | null, lastName: string | null, email: string | null): string {
  const name = [firstName, lastName].filter(Boolean).join(" ").trim();
  return name || email || "كاتب رأي";
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

// ───────────────────────── الكتّاب ─────────────────────────

export type ActiveWriter = { id: string; name: string; email: string | null };

/** كتّاب الرأي النشطون (الدور في users.role أو user_roles) */
export async function listActiveOpinionWriters(): Promise<ActiveWriter[]> {
  const rbacWriterIds = db
    .select({ userId: userRoles.userId })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(roles.name, "opinion_author"));
  const rows = await db
    .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email })
    .from(users)
    .where(
      and(
        eq(users.status, "active"),
        or(eq(users.role, "opinion_author"), inArray(users.id, rbacWriterIds)),
      ),
    );
  return rows
    .map((r) => ({ id: r.id, name: fullName(r.firstName, r.lastName, r.email), email: r.email ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name, "ar"));
}

// ───────────────────────── تسجيل التفاعل ─────────────────────────

export async function recordEngagement(input: {
  subjectType: SubjectType;
  subjectId: string;
  userId: string;
  action: EngagementAction;
  optionIndex?: number | null;
}): Promise<void> {
  const optionIndex = input.optionIndex ?? null;
  await db
    .insert(opinionWriterEngagement)
    .values({
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      userId: input.userId,
      action: input.action,
      optionIndex,
    })
    .onConflictDoUpdate({
      target: [
        opinionWriterEngagement.subjectType,
        opinionWriterEngagement.subjectId,
        opinionWriterEngagement.userId,
        opinionWriterEngagement.action,
      ],
      set: {
        count: sql`${opinionWriterEngagement.count} + 1`,
        lastAt: sql`now()`,
        // صوت الاستطلاع قابل للتغيير؛ بقية الأفعال لا تحمل خياراً
        optionIndex: optionIndex === null ? sql`${opinionWriterEngagement.optionIndex}` : optionIndex,
      },
    });
}

/** تحميل ملف من ملفات الكتّاب — لا يُفشل التنزيل أبداً */
export async function recordFileDownload(userId: string, fileId: string): Promise<void> {
  try {
    await recordEngagement({ subjectType: SUBJECT_FILE, subjectId: fileId, userId, action: "acted" });
  } catch (err) {
    console.error("[opinion-announcements] record download failed:", err instanceof Error ? err.message : err);
  }
}

// ───────────────────────── الإعلانات ─────────────────────────

type AnnouncementRow = typeof opinionWriterAnnouncements.$inferSelect;

async function getAnnouncement(id: string): Promise<AnnouncementRow | null> {
  const [row] = await db.select().from(opinionWriterAnnouncements).where(eq(opinionWriterAnnouncements.id, id)).limit(1);
  return row ?? null;
}

function activeWhere(now: Date) {
  return and(isNull(opinionWriterAnnouncements.archivedAt), gt(opinionWriterAnnouncements.expiresAt, now));
}

/** موضوع «التفاعل» للإعلان: الملف نفسه لإعلان الملف (فيحسب التحميل من أي مكان)، وإلا الإعلان */
function actedSubject(a: Pick<AnnouncementRow, "id" | "kind" | "fileId">): { type: SubjectType; id: string } {
  if (a.kind === "file" && a.fileId) return { type: SUBJECT_FILE, id: a.fileId };
  return { type: SUBJECT_ANNOUNCEMENT, id: a.id };
}

async function loadFiles(fileIds: string[]) {
  if (!fileIds.length) return new Map<string, { title: string; fileSizeBytes: number; deleted: boolean }>();
  const rows = await db
    .select({
      id: opinionWriterFiles.id,
      title: opinionWriterFiles.title,
      fileSizeBytes: opinionWriterFiles.fileSizeBytes,
      deletedAt: opinionWriterFiles.deletedAt,
    })
    .from(opinionWriterFiles)
    .where(inArray(opinionWriterFiles.id, fileIds));
  return new Map(rows.map((r) => [r.id, { title: r.title, fileSizeBytes: r.fileSizeBytes, deleted: Boolean(r.deletedAt) }]));
}

async function loadEngagement(subjects: Array<{ type: SubjectType; id: string }>, userIds?: string[]) {
  if (!subjects.length) return [];
  const bySubject = subjects.map((s) =>
    and(eq(opinionWriterEngagement.subjectType, s.type), eq(opinionWriterEngagement.subjectId, s.id)),
  );
  const where = userIds
    ? and(or(...bySubject), inArray(opinionWriterEngagement.userId, userIds.length ? userIds : ["__none__"]))
    : or(...bySubject);
  return db.select().from(opinionWriterEngagement).where(where);
}

export type WriterAnnouncementDto = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  linkUrl: string | null;
  file: { id: string; title: string; fileSizeBytes: number } | null;
  pollOptions: string[];
  /** أعداد الأصوات — تظهر للكاتب بعد تصويته فقط */
  pollCounts: number[] | null;
  voters: number | null;
  myVote: number | null;
  acted: boolean;
  seen: boolean;
  remindedAt: string | null;
  createdAt: string;
  expiresAt: string;
};

export async function listAnnouncementsForWriter(userId: string, now: Date = new Date()): Promise<WriterAnnouncementDto[]> {
  const rows = await db
    .select()
    .from(opinionWriterAnnouncements)
    .where(activeWhere(now))
    .orderBy(desc(opinionWriterAnnouncements.createdAt))
    .limit(12);
  if (!rows.length) return [];

  const files = await loadFiles(rows.map((r) => r.fileId).filter((x): x is string => Boolean(x)));
  // إعلان ملف حُذف ملفه لا يُعرض
  const visible = rows.filter((r) => r.kind !== "file" || (r.fileId && files.get(r.fileId) && !files.get(r.fileId)!.deleted));

  const subjects = visible.flatMap((r) => [{ type: SUBJECT_ANNOUNCEMENT as SubjectType, id: r.id }, actedSubject(r)]);
  const mine = await loadEngagement(subjects, [userId]);
  const key = (t: string, id: string, a: string) => `${t}:${id}:${a}`;
  const mineMap = new Map(mine.map((m) => [key(m.subjectType, m.subjectId, m.action), m]));

  const polls = visible.filter((r) => r.kind === "poll");
  const pollVotes = polls.length
    ? await db
        .select({ subjectId: opinionWriterEngagement.subjectId, optionIndex: opinionWriterEngagement.optionIndex })
        .from(opinionWriterEngagement)
        .where(
          and(
            eq(opinionWriterEngagement.subjectType, SUBJECT_ANNOUNCEMENT),
            inArray(opinionWriterEngagement.subjectId, polls.map((p) => p.id)),
            eq(opinionWriterEngagement.action, "acted"),
          ),
        )
    : [];

  return visible.map((r) => {
    const act = actedSubject(r);
    const actedRow = mineMap.get(key(act.type, act.id, "acted"));
    const seenRow = mineMap.get(key(SUBJECT_ANNOUNCEMENT, r.id, "seen"));
    const file = r.fileId ? files.get(r.fileId) : undefined;
    let pollCounts: number[] | null = null;
    let voters: number | null = null;
    const myVote = r.kind === "poll" ? actedRow?.optionIndex ?? null : null;
    if (r.kind === "poll" && myVote !== null) {
      const votes = pollVotes.filter((v) => v.subjectId === r.id).map((v) => v.optionIndex);
      pollCounts = tallyVotes(r.pollOptions.length, votes);
      voters = votes.length;
    }
    return {
      id: r.id,
      kind: r.kind,
      title: r.title,
      body: r.body,
      linkUrl: r.linkUrl,
      file: r.fileId && file ? { id: r.fileId, title: file.title, fileSizeBytes: file.fileSizeBytes } : null,
      pollOptions: r.pollOptions ?? [],
      pollCounts,
      voters,
      myVote,
      acted: Boolean(actedRow),
      seen: Boolean(seenRow),
      remindedAt: iso(r.lastRemindedAt),
      createdAt: r.createdAt.toISOString(),
      expiresAt: r.expiresAt.toISOString(),
    };
  });
}

async function requireActive(id: string, now = new Date()): Promise<AnnouncementRow> {
  const a = await getAnnouncement(id);
  if (!a || a.archivedAt || a.expiresAt.getTime() <= now.getTime()) {
    throw new AnnouncementError(404, "NOT_FOUND", "الإعلان غير موجود أو انتهى");
  }
  return a;
}

export async function markAnnouncementsSeen(userId: string, ids: string[]): Promise<number> {
  const unique = Array.from(new Set(ids)).slice(0, 20);
  if (!unique.length) return 0;
  const active = await db
    .select({ id: opinionWriterAnnouncements.id })
    .from(opinionWriterAnnouncements)
    .where(and(inArray(opinionWriterAnnouncements.id, unique), activeWhere(new Date())));
  // الرؤية تُسجَّل مرة واحدة: إدراج بلا تحديث حتى لا يتضخم العدّاد مع كل تحميل للصفحة
  for (const a of active) {
    await db
      .insert(opinionWriterEngagement)
      .values({ subjectType: SUBJECT_ANNOUNCEMENT, subjectId: a.id, userId, action: "seen" })
      .onConflictDoNothing();
  }
  return active.length;
}

export async function voteOnAnnouncement(userId: string, id: string, optionIndex: number): Promise<void> {
  const a = await requireActive(id);
  if (a.kind !== "poll") throw new AnnouncementError(400, "NOT_A_POLL", "هذا الإعلان ليس استطلاعاً");
  if (optionIndex < 0 || optionIndex >= a.pollOptions.length) {
    throw new AnnouncementError(400, "INVALID_OPTION", "اختر أحد الخيارات");
  }
  await recordEngagement({ subjectType: SUBJECT_ANNOUNCEMENT, subjectId: id, userId, action: "acted", optionIndex });
}

/** فتح رابط أو قراءة ملاحظة */
export async function markAnnouncementActed(userId: string, id: string): Promise<void> {
  const a = await requireActive(id);
  if (a.kind !== "link" && a.kind !== "note") {
    throw new AnnouncementError(400, "ACTION_NOT_FOR_KIND", "هذا الفعل لا يخص هذا الإعلان");
  }
  await recordEngagement({ subjectType: SUBJECT_ANNOUNCEMENT, subjectId: id, userId, action: "acted" });
}

// ───────────────────────── الإدارة ─────────────────────────

export type AdminAnnouncementDto = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  linkUrl: string | null;
  file: { id: string; title: string; deleted: boolean } | null;
  pollOptions: string[];
  pollCounts: number[] | null;
  active: boolean;
  writersTotal: number;
  seenCount: number;
  actedCount: number;
  emailRequested: boolean;
  emailedAt: string | null;
  lastRemindedAt: string | null;
  reminderCount: number;
  createdByName: string | null;
  createdAt: string;
  expiresAt: string;
  archivedAt: string | null;
};

function toAdminDto(
  r: AnnouncementRow,
  ctx: {
    files: Map<string, { title: string; deleted: boolean }>;
    writerIds: Set<string>;
    engagement: Array<typeof opinionWriterEngagement.$inferSelect>;
    creators: Map<string, string>;
    now: Date;
  },
): AdminAnnouncementDto {
  const act = actedSubject(r);
  const seen = new Set<string>();
  const acted = new Set<string>();
  const votes: Array<number | null> = [];
  for (const e of ctx.engagement) {
    if (!ctx.writerIds.has(e.userId)) continue;
    if (e.subjectType === SUBJECT_ANNOUNCEMENT && e.subjectId === r.id && e.action === "seen") seen.add(e.userId);
    if (e.subjectType === act.type && e.subjectId === act.id && e.action === "acted") {
      acted.add(e.userId);
      if (r.kind === "poll") votes.push(e.optionIndex);
    }
  }
  // من تفاعل فقد رأى (ولو من صفحة الملفات مباشرة)
  for (const u of Array.from(acted)) seen.add(u);
  const file = r.fileId ? ctx.files.get(r.fileId) : undefined;
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    body: r.body,
    linkUrl: r.linkUrl,
    file: r.fileId ? { id: r.fileId, title: file?.title ?? "ملف محذوف", deleted: !file || file.deleted } : null,
    pollOptions: r.pollOptions ?? [],
    pollCounts: r.kind === "poll" ? tallyVotes(r.pollOptions.length, votes) : null,
    active: !r.archivedAt && r.expiresAt.getTime() > ctx.now.getTime(),
    writersTotal: ctx.writerIds.size,
    seenCount: seen.size,
    actedCount: acted.size,
    emailRequested: r.emailRequested,
    emailedAt: iso(r.emailedAt),
    lastRemindedAt: iso(r.lastRemindedAt),
    reminderCount: r.reminderCount,
    createdByName: r.createdBy ? ctx.creators.get(r.createdBy) ?? null : null,
    createdAt: r.createdAt.toISOString(),
    expiresAt: r.expiresAt.toISOString(),
    archivedAt: iso(r.archivedAt),
  };
}

async function buildAdminContext(rows: AnnouncementRow[], now: Date) {
  const [writers, files] = await Promise.all([
    listActiveOpinionWriters(),
    loadFiles(rows.map((r) => r.fileId).filter((x): x is string => Boolean(x))),
  ]);
  const subjects = rows.flatMap((r) => [{ type: SUBJECT_ANNOUNCEMENT as SubjectType, id: r.id }, actedSubject(r)]);
  const engagement = await loadEngagement(subjects);
  const creatorIds = Array.from(new Set(rows.map((r) => r.createdBy).filter((x): x is string => Boolean(x))));
  const creators = new Map<string, string>();
  if (creatorIds.length) {
    const cs = await db
      .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email })
      .from(users)
      .where(inArray(users.id, creatorIds));
    for (const c of cs) creators.set(c.id, fullName(c.firstName, c.lastName, c.email));
  }
  return { writers, files, engagement, creators, writerIds: new Set(writers.map((w) => w.id)), now };
}

export async function listAnnouncementsForAdmin(now: Date = new Date()): Promise<{
  announcements: AdminAnnouncementDto[];
  writersTotal: number;
  feedbackResponses: number;
}> {
  const since = new Date(now.getTime() - ENDED_VISIBLE_DAYS * 24 * 60 * 60 * 1000);
  const rows = await db
    .select()
    .from(opinionWriterAnnouncements)
    .where(or(activeWhere(now), gt(opinionWriterAnnouncements.createdAt, since)))
    .orderBy(desc(opinionWriterAnnouncements.createdAt))
    .limit(60);
  const ctx = await buildAdminContext(rows, now);
  const [fb] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(opinionWriterFeedback)
    .where(inArray(opinionWriterFeedback.userId, ctx.writers.length ? ctx.writers.map((w) => w.id) : ["__none__"]));
  return {
    announcements: rows.map((r) => toAdminDto(r, ctx)),
    writersTotal: ctx.writers.length,
    feedbackResponses: fb?.n ?? 0,
  };
}

export async function createAnnouncement(input: CreateAnnouncementInput, actorId: string): Promise<AnnouncementRow> {
  if (input.kind === "file") {
    const files = await loadFiles([input.fileId!]);
    const f = files.get(input.fileId!);
    if (!f || f.deleted) throw new AnnouncementError(400, "FILE_NOT_FOUND", "الملف غير موجود في ملفات الكتّاب");
  }
  const [row] = await db
    .insert(opinionWriterAnnouncements)
    .values({
      kind: input.kind,
      title: input.title,
      body: input.body,
      fileId: input.fileId,
      linkUrl: input.linkUrl,
      pollOptions: input.pollOptions,
      expiresAt: input.expiresAt,
      emailRequested: input.sendEmail,
      createdBy: actorId,
    })
    .returning();
  return row;
}

export async function archiveAnnouncement(id: string): Promise<boolean> {
  const updated = await db
    .update(opinionWriterAnnouncements)
    .set({ archivedAt: sql`now()`, updatedAt: sql`now()` })
    .where(and(eq(opinionWriterAnnouncements.id, id), isNull(opinionWriterAnnouncements.archivedAt)))
    .returning({ id: opinionWriterAnnouncements.id });
  return updated.length > 0;
}

export type TrackingRow = {
  userId: string;
  name: string;
  email: string | null;
  interests: string[];
  status: "acted" | "seen" | "none";
  seenAt: string | null;
  actedAt: string | null;
  actedCount: number;
  vote: number | null;
};

export async function getAnnouncementTracking(id: string, now: Date = new Date()): Promise<{
  announcement: AdminAnnouncementDto;
  rows: TrackingRow[];
} | null> {
  const a = await getAnnouncement(id);
  if (!a) return null;
  const ctx = await buildAdminContext([a], now);
  const act = actedSubject(a);
  const interestsRows = ctx.writers.length
    ? await db
        .select({ userId: opinionWriterFeedback.userId, interests: opinionWriterFeedback.interests })
        .from(opinionWriterFeedback)
        .where(inArray(opinionWriterFeedback.userId, ctx.writers.map((w) => w.id)))
    : [];
  const interests = new Map(interestsRows.map((r) => [r.userId, r.interests ?? []]));
  const seenBy = new Map<string, Date>();
  const actedBy = new Map<string, { at: Date; count: number; option: number | null }>();
  for (const e of ctx.engagement) {
    if (e.subjectType === SUBJECT_ANNOUNCEMENT && e.subjectId === a.id && e.action === "seen") seenBy.set(e.userId, e.firstAt);
    if (e.subjectType === act.type && e.subjectId === act.id && e.action === "acted") {
      actedBy.set(e.userId, { at: e.lastAt, count: e.count, option: e.optionIndex });
    }
  }
  const rows: TrackingRow[] = ctx.writers.map((w) => {
    const s = seenBy.get(w.id) ?? null;
    const ac = actedBy.get(w.id) ?? null;
    return {
      userId: w.id,
      name: w.name,
      email: w.email,
      interests: interests.get(w.id) ?? [],
      status: ac ? "acted" : s ? "seen" : "none",
      seenAt: iso(s),
      actedAt: ac ? ac.at.toISOString() : null,
      actedCount: ac?.count ?? 0,
      vote: ac?.option ?? null,
    };
  });
  const order = { acted: 0, seen: 1, none: 2 } as const;
  rows.sort((x, y) => order[x.status] - order[y.status] || x.name.localeCompare(y.name, "ar"));
  return { announcement: toAdminDto(a, ctx), rows };
}

/** متابعة نموذج «اهتماماتي ومقترحاتي» (يظهر تلقائياً): من عبّأه ومن لم يعبّئه */
export async function getFeedbackFormTracking(): Promise<{ rows: TrackingRow[]; writersTotal: number; filled: number }> {
  const writers = await listActiveOpinionWriters();
  const fb = writers.length
    ? await db
        .select({
          userId: opinionWriterFeedback.userId,
          interests: opinionWriterFeedback.interests,
          updatedAt: opinionWriterFeedback.updatedAt,
        })
        .from(opinionWriterFeedback)
        .where(inArray(opinionWriterFeedback.userId, writers.map((w) => w.id)))
    : [];
  const byUser = new Map(fb.map((r) => [r.userId, r]));
  const rows: TrackingRow[] = writers.map((w) => {
    const r = byUser.get(w.id);
    return {
      userId: w.id,
      name: w.name,
      email: w.email,
      interests: r?.interests ?? [],
      status: r ? "acted" : "none",
      seenAt: null,
      actedAt: r ? r.updatedAt.toISOString() : null,
      actedCount: r ? 1 : 0,
      vote: null,
    };
  });
  rows.sort((x, y) => (x.status === y.status ? x.name.localeCompare(y.name, "ar") : x.status === "acted" ? -1 : 1));
  return { rows, writersTotal: writers.length, filled: fb.length };
}

// ───────────────────────── البريد ─────────────────────────

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function buildAnnouncementEmail(input: {
  name: string;
  kind: string;
  title: string;
  body: string | null;
  reminder: boolean;
  url: string;
}): { subject: string; html: string; text: string } {
  const meta = announcementKindMeta(input.kind);
  const cta =
    input.kind === "file" ? "تحميل الملف" : input.kind === "poll" ? "شارك في الاستطلاع" : input.kind === "link" ? "افتح الرابط" : "اقرأ الإعلان";
  const lead = input.reminder ? "تذكير من إدارة مقالات الرأي" : `إعلان جديد (${meta.label}) من إدارة مقالات الرأي`;
  const subject = input.reminder ? `تذكير: ${input.title}` : `إعلان لكتّاب الرأي: ${input.title}`;
  const bodyText = input.body ? `\n\n${input.body}` : "";
  const text = `مرحبًا ${input.name}\n\n${lead}: «${input.title}»${bodyText}\n\n${cta}: ${input.url}\n\nصحيفة سبق`;
  const bodyHtml = input.body
    ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.9;white-space:pre-line">${escapeHtml(input.body)}</p>`
    : "";
  const html = `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;background:#F4F7FB;padding:24px;color:#1B2B3A">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;padding:24px">
    <p style="margin:0 0 6px;color:#5B6B7A;font-size:13px">${escapeHtml(lead)}</p>
    <h1 style="margin:0 0 12px;font-size:20px">${escapeHtml(input.title)}</h1>
    <p style="margin:0 0 12px;font-size:15px">مرحبًا ${escapeHtml(input.name)}،</p>
    ${bodyHtml}
    <a href="${escapeHtml(input.url)}" style="display:inline-block;background:#1E9BE6;color:#fff;text-decoration:none;padding:12px 24px;border-radius:999px;font-weight:bold">${cta}</a>
    <p style="margin:20px 0 0;color:#8A99A8;font-size:12px">وصلك هذا لأنك من كتّاب الرأي في صحيفة سبق.</p>
  </div>
</div>`;
  return { subject, html, text };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sendToRecipients(a: AnnouncementRow, recipients: ActiveWriter[], reminder: boolean): Promise<void> {
  const url = `${SITE_URL}${WRITER_HOME_PATH}`;
  let sent = 0;
  let failed = 0;
  for (const r of recipients) {
    if (!r.email) continue;
    try {
      const mail = buildAnnouncementEmail({ name: r.name, kind: a.kind, title: a.title, body: a.body, reminder, url });
      const result = await sendEmailNotification({ to: r.email, ...mail });
      if (result.success) sent += 1;
      else failed += 1;
    } catch {
      failed += 1;
    }
    await sleep(EMAIL_GAP_MS);
  }
  console.log(`[OpinionAnnouncements] ${reminder ? "reminder" : "announce"} ${a.id}: ${sent} sent, ${failed} failed`);
}

/** بريد الإعلان الجديد لكل الكتّاب — يعمل في الخلفية، ويُحجز بـ emailed_at حتى لا يتكرر */
export async function sendAnnouncementEmailInBackground(id: string): Promise<void> {
  const [claimed] = await db
    .update(opinionWriterAnnouncements)
    .set({ emailedAt: sql`now()` })
    .where(
      and(
        eq(opinionWriterAnnouncements.id, id),
        eq(opinionWriterAnnouncements.emailRequested, true),
        isNull(opinionWriterAnnouncements.emailedAt),
      ),
    )
    .returning();
  if (!claimed) return;
  const writers = await listActiveOpinionWriters();
  void sendToRecipients(claimed, writers, false).catch((err) =>
    console.error("[OpinionAnnouncements] announce email failed:", err instanceof Error ? err.message : err),
  );
}

/**
 * «ذكّر من لم يتفاعل»: بريد لمن لم يحمّل/يصوّت/يفتح بعد. مرة في اليوم على الأكثر لكل إعلان؛
 * الحجز ذري على last_reminded_at فلا يتكرر ولو ضغط اثنان معاً أو على نسختين من الخادم.
 */
export async function remindPendingWriters(id: string, now: Date = new Date()): Promise<{ recipients: number }> {
  const a = await requireActive(id, now);
  const cutoff = new Date(now.getTime() - REMIND_COOLDOWN_MS);
  const [claimed] = await db
    .update(opinionWriterAnnouncements)
    .set({
      lastRemindedAt: sql`now()`,
      reminderCount: sql`${opinionWriterAnnouncements.reminderCount} + 1`,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(opinionWriterAnnouncements.id, a.id),
        or(isNull(opinionWriterAnnouncements.lastRemindedAt), lt(opinionWriterAnnouncements.lastRemindedAt, cutoff)),
      ),
    )
    .returning();
  if (!claimed) throw new AnnouncementError(429, "REMIND_COOLDOWN", "أُرسل تذكير لهذا الإعلان خلال آخر 24 ساعة");

  const tracking = await getAnnouncementTracking(a.id, now);
  const pendingIds = new Set((tracking?.rows ?? []).filter((r) => r.status !== "acted").map((r) => r.userId));
  const writers = (await listActiveOpinionWriters()).filter((w) => pendingIds.has(w.id) && w.email);
  void sendToRecipients(claimed, writers, true).catch((err) =>
    console.error("[OpinionAnnouncements] reminder email failed:", err instanceof Error ? err.message : err),
  );
  return { recipients: writers.length };
}
