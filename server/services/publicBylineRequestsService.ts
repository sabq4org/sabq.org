// «صفتك تحت اسمك»: الكاتب أو المراسل يقترح صفته ونبذته، والمحرر يعتمد.
// القارئ يرى staff.titleAr/bioAr الحالية حتى الاعتماد؛ الاعتماد ينشرها فورًا
// على الويب وiOS وأندرويد (كلها تقرأ /api/reporters/:slug).
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "../db";
import {
  notificationsInbox,
  publicBylineRequests,
  staff,
  users,
  type PublicBylineRequest,
} from "@shared/schema";
import { getUserRoleNames } from "../rbac";
import { notificationBus } from "../notificationBus";
import {
  pickPublicStaffType,
  validatePublicBylineInput,
  type PublicBylineStatus,
} from "@shared/publicByline";
import { ensurePublicStaffRecord, refreshPublicStaffProfile } from "./publicBylineService";

const WRITER_DEEPLINK = "/dashboard/my-services";

export class PublicBylineError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function publicStaffTypeFor(userId: string) {
  return pickPublicStaffType(await getUserRoleNames(userId));
}

async function notifyWriter(userId: string, title: string, body: string, type: string) {
  try {
    await db.insert(notificationsInbox).values({
      userId,
      type,
      title,
      body,
      deeplink: WRITER_DEEPLINK,
      read: false,
    });
    notificationBus.emit(userId, { type, title, body, deeplink: WRITER_DEEPLINK });
  } catch (error: unknown) {
    console.error("[PublicByline] writer notification failed:", error instanceof Error ? error.message : error);
  }
}

function serializeRequest(row: PublicBylineRequest | undefined | null) {
  if (!row) return null;
  return {
    titleAr: row.titleAr,
    bioAr: row.bioAr,
    status: row.status as PublicBylineStatus,
    reviewNote: row.reviewNote,
    submittedAt: row.submittedAt,
    reviewedAt: row.reviewedAt,
  };
}

/** ما يراه القارئ الآن + آخر طلب للكاتب. */
export async function getMyPublicByline(userId: string) {
  const [current] = await db
    .select({ slug: staff.slug, titleAr: staff.titleAr, bioAr: staff.bioAr })
    .from(staff)
    .where(eq(staff.userId, userId))
    .limit(1);
  const [user] = await db
    .select({ bio: users.bio })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const [request] = await db
    .select()
    .from(publicBylineRequests)
    .where(eq(publicBylineRequests.userId, userId))
    .limit(1);
  const staffType = await publicStaffTypeFor(userId);
  return {
    eligible: staffType !== null,
    staffType,
    current: {
      slug: current?.slug ?? null,
      titleAr: current?.titleAr ?? null,
      // قبل وجود صفحة: ما يظهر الآن تحت اسم كاتب الرأي هو نبذته الشخصية.
      bioAr: current ? current.bioAr ?? null : user?.bio ?? null,
    },
    request: serializeRequest(request),
  };
}

export async function submitPublicByline(userId: string, input: { titleAr?: unknown; bioAr?: unknown }) {
  if (!(await publicStaffTypeFor(userId))) {
    throw new PublicBylineError("الصفة العامة متاحة لكتّاب الرأي والمراسلين فقط", 403);
  }
  const parsed = validatePublicBylineInput(input);
  if (!parsed.ok) throw new PublicBylineError(parsed.message, 400);
  const now = new Date();
  const values = {
    titleAr: parsed.titleAr,
    bioAr: parsed.bioAr,
    status: "pending" as const,
    reviewNote: null,
    submittedAt: now,
    reviewedAt: null,
    reviewedBy: null,
    updatedAt: now,
  };
  const [row] = await db
    .insert(publicBylineRequests)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: publicBylineRequests.userId, set: values })
    .returning();
  return serializeRequest(row);
}

export async function withdrawPublicByline(userId: string) {
  const [row] = await db
    .update(publicBylineRequests)
    .set({ status: "withdrawn", updatedAt: new Date() })
    .where(and(eq(publicBylineRequests.userId, userId), eq(publicBylineRequests.status, "pending")))
    .returning();
  if (!row) throw new PublicBylineError("لا يوجد طلب بانتظار المراجعة", 404);
  return serializeRequest(row);
}

/** قائمة المراجعة: المعلّق أولًا مع ما يراه القارئ الآن. */
export async function listPublicBylineRequests(status: PublicBylineStatus = "pending") {
  const rows = await db
    .select({
      userId: publicBylineRequests.userId,
      titleAr: publicBylineRequests.titleAr,
      bioAr: publicBylineRequests.bioAr,
      status: publicBylineRequests.status,
      reviewNote: publicBylineRequests.reviewNote,
      submittedAt: publicBylineRequests.submittedAt,
      reviewedAt: publicBylineRequests.reviewedAt,
      firstName: users.firstName,
      lastName: users.lastName,
      profileImageUrl: users.profileImageUrl,
      userBio: users.bio,
      staffSlug: staff.slug,
      currentTitleAr: staff.titleAr,
      currentBioAr: staff.bioAr,
    })
    .from(publicBylineRequests)
    .innerJoin(users, eq(users.id, publicBylineRequests.userId))
    .leftJoin(staff, eq(staff.userId, publicBylineRequests.userId))
    .where(eq(publicBylineRequests.status, status))
    .orderBy(desc(publicBylineRequests.submittedAt))
    .limit(100);

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [counts] = await db
    .select({
      pending: sql<number>`count(*) filter (where ${publicBylineRequests.status} = 'pending')`.mapWith(Number),
      approved30d: sql<number>`count(*) filter (where ${publicBylineRequests.status} = 'approved' and ${publicBylineRequests.reviewedAt} >= ${since})`.mapWith(Number),
    })
    .from(publicBylineRequests)
    .where(gte(publicBylineRequests.updatedAt, new Date(0)));

  return {
    counts: { pending: counts?.pending ?? 0, approvedLast30Days: counts?.approved30d ?? 0 },
    items: rows.map((r) => ({
      userId: r.userId,
      name: [r.firstName, r.lastName].filter(Boolean).join(" ").trim(),
      profileImageUrl: r.profileImageUrl,
      publicSlug: r.staffSlug,
      current: { titleAr: r.currentTitleAr, bioAr: r.staffSlug ? r.currentBioAr : r.userBio },
      proposed: { titleAr: r.titleAr, bioAr: r.bioAr },
      status: r.status,
      reviewNote: r.reviewNote,
      submittedAt: r.submittedAt,
      reviewedAt: r.reviewedAt,
    })),
  };
}

async function loadPending(userId: string) {
  const [row] = await db
    .select()
    .from(publicBylineRequests)
    .where(and(eq(publicBylineRequests.userId, userId), eq(publicBylineRequests.status, "pending")))
    .limit(1);
  if (!row) throw new PublicBylineError("الطلب غير موجود أو رُوجع من قبل", 404);
  return row;
}

/** اعتماد ونشر: الصفة والنبذة المقترحتان تصبحان ما يراه القارئ. */
export async function approvePublicByline(userId: string, actorId: string) {
  const request = await loadPending(userId);
  const staffType = (await publicStaffTypeFor(userId)) ?? "opinion_author";
  const { staff: record } = await ensurePublicStaffRecord(userId, staffType);
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(staff)
      .set({ titleAr: request.titleAr, bioAr: request.bioAr, updatedAt: now })
      .where(eq(staff.id, record.id));
    // صفحة الكاتب بالاسم في التطبيقين تقرأ users.bio: النبذة المعتمدة تصلها أيضًا.
    if (request.bioAr) {
      await tx.update(users).set({ bio: request.bioAr }).where(eq(users.id, userId));
    }
    await tx
      .update(publicBylineRequests)
      .set({ status: "approved", reviewNote: null, reviewedAt: now, reviewedBy: actorId, updatedAt: now })
      .where(eq(publicBylineRequests.userId, userId));
  });

  await refreshPublicStaffProfile(userId);
  await notifyWriter(
    userId,
    "اعتُمدت صفتك الجديدة",
    request.titleAr
      ? `تظهر الآن تحت اسمك: «${request.titleAr}»`
      : "نُشرت نبذتك الجديدة في صفحتك",
    "PublicBylineApproved",
  );
  return { ok: true as const, slug: record.slug };
}

export async function requestPublicBylineChanges(userId: string, actorId: string, note: string) {
  const trimmed = note.trim();
  if (!trimmed) throw new PublicBylineError("اكتب ما يحتاج تعديلًا", 400);
  if (trimmed.length > 500) throw new PublicBylineError("الملاحظة لا تتجاوز 500 حرف", 400);
  await loadPending(userId);
  const now = new Date();
  await db
    .update(publicBylineRequests)
    .set({ status: "needs_changes", reviewNote: trimmed, reviewedAt: now, reviewedBy: actorId, updatedAt: now })
    .where(eq(publicBylineRequests.userId, userId));
  await notifyWriter(userId, "صفتك تحتاج تعديلًا", trimmed, "PublicBylineNeedsChanges");
  return { ok: true as const };
}
