// ----------------------------------------------------------------------------
// الخطابات الرسمية — خدمة البيانات (ADR-001: كل استعلامات Drizzle هنا)
//
// المبدأ: الخطاب وثيقة ثابتة. عند الإصدار نلتقط بيانات المنسوب، نولّد PDF،
// نرفعه إلى التخزين الخاص، ونحفظ المفتاح. أي تعديل لاحق على ملف المنسوب
// لا يغيّر خطاباً صادراً.
//
// الحقول الناقصة تُحذف من الخطاب ولا تُطبع فارغة (قرار المالك) — خطاب رسمي
// فيه سطر «غير متوفر» يُرفض لدى الجهات.
// ----------------------------------------------------------------------------

import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import {
  officialLetterRequests,
  officialLetters,
  roles,
  staffDepartments,
  staffJobTitles,
  staffProfiles,
  userRoles,
  users,
} from "@shared/schema";
import {
  LETTER_FIELD_IMPACT_AR,
  LETTER_FIELD_LABELS_AR,
  OFFICIAL_LETTER_ROLE_FALLBACK_AR,
  OFFICIAL_LETTER_TYPE_META,
  fieldSeverityFor,
  formatLetterReference,
  type LetterFieldKey,
  type LetterFieldSeverity,
  type OfficialLetterRequestStatus,
  type OfficialLetterSource,
  type OfficialLetterType,
} from "@shared/officialLetters";
import { decryptNationalId, getStaffProfileReviewStatus } from "./staffProfileService";
import { ObjectStorageService, isPrivateObjectStorageConfigured } from "../objectStorage";

// ────────────────────────────────────────────────────────────────────
// بيانات المنسوب المطبوعة على الخطاب
// ────────────────────────────────────────────────────────────────────

export type LetterSubject = {
  userId: string;
  /** الاسم الكامل بالعربية — إلزامي، بدونه لا يصدر خطاب */
  fullNameAr: string;
  fullNameEn: string | null;
  /** الصفة: المسمّى الوظيفي أو المشتق من الدور */
  roleTitleAr: string;
  departmentAr: string | null;
  nationalId: string | null;
  pressIdNumber: string | null;
  pressCardValidUntil: Date | null;
  mediaLicenseNumber: string | null;
  joinedAt: Date | null;
  email: string | null;
  phone: string | null;
};

/** الحقول الاختيارية الناقصة — تُعرض كتنبيه للمُصدِر قبل الإصدار. */
export type LetterSubjectGaps = {
  key: LetterFieldKey;
  labelAr: string;
}[];

function joinName(first?: string | null, last?: string | null): string {
  return [first, last].map((p) => (p ?? "").trim()).filter(Boolean).join(" ").trim();
}

async function resolveRoleTitle(userId: string, legacyRole: string | null): Promise<string> {
  const rbacRoles = await db
    .select({ name: roles.name })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(userRoles.userId, userId));

  const candidates = [
    ...rbacRoles.map((r) => r.name),
    legacyRole ?? "",
  ].filter(Boolean);

  for (const candidate of candidates) {
    const label = OFFICIAL_LETTER_ROLE_FALLBACK_AR[candidate];
    if (label) return label;
  }
  return "منسوب";
}

/**
 * يجمع بيانات المنسوب من ملف المنسوب أولاً ثم أعمدة users كاحتياط.
 * يُرجع null إن لم يوجد المستخدم أو تعذّر تكوين اسم عربي.
 */
export async function resolveLetterSubject(
  userId: string,
  opts: { includeNationalId: boolean },
): Promise<{ subject: LetterSubject; gaps: LetterSubjectGaps } | null> {
  const [row] = await db
    .select({
      user: users,
      profile: staffProfiles,
      jobTitleAr: staffJobTitles.nameAr,
      departmentAr: staffDepartments.nameAr,
    })
    .from(users)
    .leftJoin(staffProfiles, eq(staffProfiles.userId, users.id))
    .leftJoin(staffJobTitles, eq(staffJobTitles.id, staffProfiles.jobTitleId))
    .leftJoin(staffDepartments, eq(staffDepartments.id, staffProfiles.departmentId))
    .where(eq(users.id, userId))
    .limit(1);

  if (!row?.user) return null;

  const { user, profile } = row;
  const fullNameAr = joinName(user.firstName, user.lastName);
  if (!fullNameAr) return null;

  const roleTitleAr =
    row.jobTitleAr?.trim() ||
    user.jobTitle?.trim() ||
    (await resolveRoleTitle(userId, user.role));

  let nationalId: string | null = null;
  if (opts.includeNationalId && profile?.nationalIdEncrypted) {
    nationalId = decryptNationalId(profile.nationalIdEncrypted);
  }

  const subject: LetterSubject = {
    userId,
    fullNameAr,
    fullNameEn: joinName(user.firstNameEn, user.lastNameEn) || null,
    roleTitleAr,
    departmentAr: row.departmentAr?.trim() || user.department?.trim() || null,
    nationalId,
    pressIdNumber: profile?.pressIdNumber?.trim() || user.pressIdNumber?.trim() || null,
    pressCardValidUntil: profile?.pressCardValidUntil ?? user.cardValidUntil ?? null,
    mediaLicenseNumber:
      profile?.mediaLicenseNumber?.trim() || user.mediaLicenseNumber?.trim() || null,
    joinedAt: profile?.joinedAt ?? null,
    email: profile?.officialEmail?.trim() || user.email || null,
    phone: profile?.officialPhone?.trim() || user.phoneNumber?.trim() || null,
  };

  const missing: LetterFieldKey[] = [];
  if (!profile?.nationalIdEncrypted) missing.push("nationalId");
  if (!subject.departmentAr) missing.push("department");
  if (!subject.joinedAt) missing.push("joinedAt");
  if (!subject.pressIdNumber) missing.push("pressId");

  const gaps: LetterSubjectGaps = missing.map((key) => ({
    key,
    labelAr: LETTER_FIELD_LABELS_AR[key],
  }));

  return { subject, gaps };
}

// ────────────────────────────────────────────────────────────────────
// جاهزية المنسوب — يستخدمها المنسوب نفسه قبل إرسال الطلب
// ────────────────────────────────────────────────────────────────────

export type LetterReadinessGap = {
  key: LetterFieldKey;
  labelAr: string;
  impactAr: string;
  severity: LetterFieldSeverity;
};

export type LetterReadiness = {
  /** هل تكفي البيانات لإصدار خطاب أصلاً (الاسم العربي موجود + اعتماد الإدارة). */
  canIssue: boolean;
  blockingReasonAr: string | null;
  fullNameAr: string | null;
  roleTitleAr: string | null;
  gaps: LetterReadinessGap[];
  /** عدد الحقول المهمة الناقصة لهذا النوع تحديداً. */
  importantMissing: number;
  /** حالة مراجعة ملف المنسوب لدى الإدارة. */
  profileReviewStatus: "draft" | "pending_review" | "approved" | "needs_correction";
  profileReviewNote: string | null;
};

export async function getLetterReadiness(
  userId: string,
  letterType: OfficialLetterType,
): Promise<LetterReadiness> {
  const review = await getStaffProfileReviewStatus(userId);
  const resolved = await resolveLetterSubject(userId, { includeNationalId: false });

  if (!resolved) {
    return {
      canIssue: false,
      blockingReasonAr:
        "لا يمكن إصدار شهادة باسمك — الاسم الكامل بالعربية غير مسجّل. أكمل ملفك الشخصي أو تواصل مع الإدارة.",
      fullNameAr: null,
      roleTitleAr: null,
      gaps: [],
      importantMissing: 0,
      profileReviewStatus: review.status,
      profileReviewNote: review.note,
    };
  }

  const gaps: LetterReadinessGap[] = resolved.gaps.map((gap) => ({
    key: gap.key,
    labelAr: gap.labelAr,
    impactAr: LETTER_FIELD_IMPACT_AR[gap.key],
    severity: fieldSeverityFor(gap.key, letterType),
  }));

  gaps.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "important" ? -1 : 1));

  const importantMissing = gaps.filter((g) => g.severity === "important").length;

  let canIssue = true;
  let blockingReasonAr: string | null = null;

  if (!review.allowsCertificateIssue) {
    canIssue = false;
    if (review.status === "pending_review") {
      blockingReasonAr =
        "بياناتك مكتملة وهي قيد مراجعة الإدارة. بعد الاعتماد ستتمكن من إصدار شهادة التعريف وتنزيلها.";
    } else if (review.status === "needs_correction") {
      blockingReasonAr = review.note
        ? `مطلوب تصحيح بياناتك قبل الإصدار: ${review.note}`
        : "مطلوب تصحيح بياناتك من الإدارة قبل إصدار الشهادة.";
    } else {
      blockingReasonAr =
        "أكمل ملفك الشخصي وانتظر اعتماد الإدارة قبل إصدار شهادة التعريف.";
    }
  }

  return {
    canIssue,
    blockingReasonAr,
    fullNameAr: resolved.subject.fullNameAr,
    roleTitleAr: resolved.subject.roleTitleAr,
    gaps,
    importantMissing,
    profileReviewStatus: review.status,
    profileReviewNote: review.note,
  };
}

// ────────────────────────────────────────────────────────────────────
// الترقيم المرجعي — تسلسل سنوي
// ────────────────────────────────────────────────────────────────────

async function nextReferenceCode(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `SBQ-${year}-`;
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(officialLetters)
    .where(sql`${officialLetters.referenceCode} LIKE ${prefix + "%"}`);
  const sequence = (row?.count ?? 0) + 1;
  return formatLetterReference(year, sequence);
}

// ────────────────────────────────────────────────────────────────────
// الإصدار
// ────────────────────────────────────────────────────────────────────

export type IssueLetterInput = {
  subjectUserId: string;
  letterType: OfficialLetterType;
  recipientEntity?: string | null;
  purposeNote?: string | null;
  source: OfficialLetterSource;
  issuedByUserId: string;
  ticketId?: string | null;
};

export type IssuedLetter = {
  id: string;
  referenceCode: string;
  issuedAt: Date;
  gaps: LetterSubjectGaps;
};

export async function issueLetter(input: IssueLetterInput): Promise<IssuedLetter> {
  const resolved = await resolveLetterSubject(input.subjectUserId, {
    includeNationalId: true,
  });
  if (!resolved) {
    throw new Error("تعذر تكوين بيانات المنسوب — تأكد من وجود الاسم الكامل بالعربية");
  }

  const { subject, gaps } = resolved;
  const referenceCode = await nextReferenceCode();
  const issuedAt = new Date();
  const recipientEntity = input.recipientEntity?.trim() || null;

  const { buildOfficialLetterPdf } = await import("./officialLetterPdfService");
  const pdf = await buildOfficialLetterPdf({
    referenceCode,
    letterType: input.letterType,
    recipientEntity,
    purposeNote: input.purposeNote?.trim() || null,
    subject,
    issuedAt,
  });

  let fileKey: string | null = null;
  if (isPrivateObjectStorageConfigured()) {
    const key = `.private/official-letters/${referenceCode}.pdf`;
    try {
      const stored = await new ObjectStorageService().uploadPrivateDocument(
        key,
        pdf,
        "application/pdf",
      );
      fileKey = stored.path || key;
    } catch (error) {
      // التخزين ليس شرطاً للإصدار — يُعاد التوليد عند التنزيل من اللقطة.
      console.error("[officialLetters] private upload failed:", error);
    }
  }

  const [saved] = await db
    .insert(officialLetters)
    .values({
      referenceCode,
      letterType: input.letterType,
      subjectUserId: input.subjectUserId,
      recipientEntity,
      purposeNote: input.purposeNote?.trim() || null,
      // بلا رقم هوية — يبقى داخل ملف PDF في التخزين الخاص فقط
      snapshot: {
        fullNameAr: subject.fullNameAr,
        fullNameEn: subject.fullNameEn,
        roleTitleAr: subject.roleTitleAr,
        departmentAr: subject.departmentAr,
        pressIdNumber: subject.pressIdNumber,
        joinedAt: subject.joinedAt?.toISOString() ?? null,
        hadNationalId: Boolean(subject.nationalId),
        gaps: gaps.map((g) => g.key),
      },
      fileKey,
      status: "issued",
      source: input.source,
      ticketId: input.ticketId ?? null,
      issuedByUserId: input.issuedByUserId,
      issuedAt,
    })
    .returning({ id: officialLetters.id });

  return { id: saved.id, referenceCode, issuedAt, gaps };
}

/**
 * يعيد ملف الخطاب. يفضّل النسخة المخزّنة؛ وإن غابت (تخزين غير مهيّأ)
 * يُعاد توليدها من اللقطة مع البيانات الحالية.
 */
export async function getLetterPdf(
  letterId: string,
): Promise<{ referenceCode: string; buffer: Buffer } | { referenceCode: string; redirectUrl: string } | null> {
  const [letter] = await db
    .select()
    .from(officialLetters)
    .where(eq(officialLetters.id, letterId))
    .limit(1);
  if (!letter) return null;

  if (letter.fileKey) {
    try {
      const url = await new ObjectStorageService().getPrivateFileDownloadURL(letter.fileKey, 300);
      return { referenceCode: letter.referenceCode, redirectUrl: url };
    } catch (error) {
      console.error("[officialLetters] signed url failed, regenerating:", error);
    }
  }

  const resolved = await resolveLetterSubject(letter.subjectUserId, {
    includeNationalId: true,
  });
  if (!resolved) return null;

  const { buildOfficialLetterPdf } = await import("./officialLetterPdfService");
  const buffer = await buildOfficialLetterPdf({
    referenceCode: letter.referenceCode,
    letterType: letter.letterType as OfficialLetterType,
    recipientEntity: letter.recipientEntity,
    purposeNote: letter.purposeNote,
    subject: resolved.subject,
    issuedAt: letter.issuedAt,
  });
  return { referenceCode: letter.referenceCode, buffer };
}

// ────────────────────────────────────────────────────────────────────
// القوائم والتحقق
// ────────────────────────────────────────────────────────────────────

export async function listLetters(opts: { subjectUserId?: string; limit?: number } = {}) {
  const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
  const where = opts.subjectUserId
    ? eq(officialLetters.subjectUserId, opts.subjectUserId)
    : undefined;

  const rows = await db
    .select({
      id: officialLetters.id,
      referenceCode: officialLetters.referenceCode,
      letterType: officialLetters.letterType,
      recipientEntity: officialLetters.recipientEntity,
      status: officialLetters.status,
      source: officialLetters.source,
      issuedAt: officialLetters.issuedAt,
      subjectUserId: officialLetters.subjectUserId,
      subjectFirstName: users.firstName,
      subjectLastName: users.lastName,
      snapshot: officialLetters.snapshot,
    })
    .from(officialLetters)
    .leftJoin(users, eq(users.id, officialLetters.subjectUserId))
    .where(where)
    .orderBy(desc(officialLetters.issuedAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    referenceCode: r.referenceCode,
    letterType: r.letterType,
    letterTypeLabelAr:
      OFFICIAL_LETTER_TYPE_META[r.letterType as OfficialLetterType]?.labelAr ?? r.letterType,
    recipientEntity: r.recipientEntity,
    status: r.status,
    source: r.source,
    issuedAt: r.issuedAt,
    subjectUserId: r.subjectUserId,
    subjectName:
      joinName(r.subjectFirstName, r.subjectLastName) ||
      ((r.snapshot as { fullNameAr?: string } | null)?.fullNameAr ?? "—"),
  }));
}

/** بيانات صفحة التحقق العامة — بلا رقم هوية ولا بيانات تواصل. */
export async function verifyLetterByReference(referenceCode: string) {
  const [letter] = await db
    .select({
      referenceCode: officialLetters.referenceCode,
      letterType: officialLetters.letterType,
      recipientEntity: officialLetters.recipientEntity,
      status: officialLetters.status,
      issuedAt: officialLetters.issuedAt,
      revokedAt: officialLetters.revokedAt,
      snapshot: officialLetters.snapshot,
    })
    .from(officialLetters)
    .where(eq(officialLetters.referenceCode, referenceCode.trim().toUpperCase()))
    .limit(1);

  if (!letter) return null;

  const snapshot = (letter.snapshot ?? {}) as {
    fullNameAr?: string;
    roleTitleAr?: string;
  };

  return {
    referenceCode: letter.referenceCode,
    letterType: letter.letterType,
    letterTypeLabelAr:
      OFFICIAL_LETTER_TYPE_META[letter.letterType as OfficialLetterType]?.labelAr ??
      letter.letterType,
    subjectName: snapshot.fullNameAr ?? null,
    roleTitleAr: snapshot.roleTitleAr ?? null,
    recipientEntity: letter.recipientEntity,
    status: letter.status,
    issuedAt: letter.issuedAt,
    revokedAt: letter.revokedAt,
  };
}

export async function revokeLetter(
  letterId: string,
  actorId: string,
  reason: string,
): Promise<boolean> {
  const trimmed = reason.trim();
  if (!trimmed) throw new Error("سبب الإلغاء مطلوب");
  const updated = await db
    .update(officialLetters)
    .set({
      status: "revoked",
      revokedAt: new Date(),
      revokedByUserId: actorId,
      revokeReason: trimmed,
      updatedAt: new Date(),
    })
    .where(and(eq(officialLetters.id, letterId), eq(officialLetters.status, "issued")))
    .returning({ id: officialLetters.id });
  return updated.length > 0;
}

// ────────────────────────────────────────────────────────────────────
// طلبات المنسوبين
// ────────────────────────────────────────────────────────────────────

export async function findActiveLetter(
  subjectUserId: string,
  letterType: OfficialLetterType,
): Promise<{ id: string; referenceCode: string } | null> {
  const [row] = await db
    .select({ id: officialLetters.id, referenceCode: officialLetters.referenceCode })
    .from(officialLetters)
    .where(
      and(
        eq(officialLetters.subjectUserId, subjectUserId),
        eq(officialLetters.letterType, letterType),
        eq(officialLetters.status, "issued"),
      ),
    )
    .orderBy(desc(officialLetters.issuedAt))
    .limit(1);
  return row ?? null;
}

/**
 * طلب ذاتي من المنسوب: يُصدر الخطاب فوراً فقط إذا كان ملف المنسوب معتمداً
 * من الإدارة والبيانات المهمة مكتملة. يمنع شهادة ثانية من نفس النوع الساري.
 */
export async function requestSelfLetter(input: {
  requesterUserId: string;
  letterType: OfficialLetterType;
  recipientEntity?: string | null;
  note?: string | null;
}): Promise<{
  letter: IssuedLetter;
  alreadyHad: boolean;
}> {
  const existing = await findActiveLetter(input.requesterUserId, input.letterType);
  if (existing) {
    throw new Error("لديك شهادة سارية من هذا النوع بالفعل — يمكنك تنزيلها من قائمتك");
  }

  const readiness = await getLetterReadiness(input.requesterUserId, input.letterType);
  if (!readiness.canIssue) {
    throw new Error(readiness.blockingReasonAr || "بياناتك غير كافية لإصدار الشهادة");
  }
  if (readiness.importantMissing > 0) {
    const labels = readiness.gaps
      .filter((g) => g.severity === "important")
      .map((g) => g.labelAr)
      .join("، ");
    throw new Error(
      labels
        ? `أكمل بياناتك أولاً قبل إصدار الشهادة: ${labels}`
        : "أكمل بياناتك المهمة أولاً قبل إصدار الشهادة",
    );
  }

  const letter = await issueLetter({
    subjectUserId: input.requesterUserId,
    letterType: input.letterType,
    recipientEntity: input.recipientEntity,
    purposeNote: input.note,
    source: "self",
    issuedByUserId: input.requesterUserId,
  });

  // سجل طلب معتمد فوراً للتدقيق (بلا طابور مراجعة)
  await db.insert(officialLetterRequests).values({
    requesterUserId: input.requesterUserId,
    letterType: input.letterType,
    recipientEntity: input.recipientEntity?.trim() || null,
    note: input.note?.trim() || null,
    status: "approved",
    reviewedByUserId: input.requesterUserId,
    reviewedAt: new Date(),
    letterId: letter.id,
  });

  return { letter, alreadyHad: false };
}

export async function createLetterRequest(input: {
  requesterUserId: string;
  letterType: OfficialLetterType;
  recipientEntity?: string | null;
  note?: string | null;
}) {
  // مسار قديم — يُفضَّل requestSelfLetter. يُبقى للتوافق إن استُدعي من مكان آخر.
  const existingActive = await findActiveLetter(input.requesterUserId, input.letterType);
  if (existingActive) {
    throw new Error("لديك شهادة سارية من هذا النوع بالفعل — يمكنك تنزيلها من قائمتك");
  }

  const [existing] = await db
    .select({ id: officialLetterRequests.id })
    .from(officialLetterRequests)
    .where(
      and(
        eq(officialLetterRequests.requesterUserId, input.requesterUserId),
        eq(officialLetterRequests.status, "pending"),
      ),
    )
    .limit(1);
  if (existing) {
    throw new Error("لديك طلب خطاب قيد المراجعة بالفعل");
  }

  const [row] = await db
    .insert(officialLetterRequests)
    .values({
      requesterUserId: input.requesterUserId,
      letterType: input.letterType,
      recipientEntity: input.recipientEntity?.trim() || null,
      note: input.note?.trim() || null,
      status: "pending",
    })
    .returning({ id: officialLetterRequests.id });
  return row;
}

export async function listLetterRequests(opts: {
  requesterUserId?: string;
  status?: OfficialLetterRequestStatus;
} = {}) {
  const conditions = [
    opts.requesterUserId
      ? eq(officialLetterRequests.requesterUserId, opts.requesterUserId)
      : undefined,
    opts.status ? eq(officialLetterRequests.status, opts.status) : undefined,
  ].filter(Boolean);

  const rows = await db
    .select({
      id: officialLetterRequests.id,
      requesterUserId: officialLetterRequests.requesterUserId,
      letterType: officialLetterRequests.letterType,
      recipientEntity: officialLetterRequests.recipientEntity,
      note: officialLetterRequests.note,
      status: officialLetterRequests.status,
      reviewNote: officialLetterRequests.reviewNote,
      letterId: officialLetterRequests.letterId,
      createdAt: officialLetterRequests.createdAt,
      requesterFirstName: users.firstName,
      requesterLastName: users.lastName,
    })
    .from(officialLetterRequests)
    .leftJoin(users, eq(users.id, officialLetterRequests.requesterUserId))
    .where(conditions.length > 0 ? and(...(conditions as any[])) : undefined)
    .orderBy(desc(officialLetterRequests.createdAt))
    .limit(100);

  // للطلبات المعلّقة نحسب النواقص حياً حتى يراها المعتمِد قبل الإصدار.
  const PENDING_READINESS_CAP = 25;
  let readinessChecked = 0;

  return Promise.all(
    rows.map(async (r) => {
      let gaps: LetterReadinessGap[] = [];
      if (r.status === "pending" && readinessChecked < PENDING_READINESS_CAP) {
        readinessChecked += 1;
        const readiness = await getLetterReadiness(
          r.requesterUserId,
          r.letterType as OfficialLetterType,
        );
        gaps = readiness.gaps;
      }
      return {
        ...r,
        letterTypeLabelAr:
          OFFICIAL_LETTER_TYPE_META[r.letterType as OfficialLetterType]?.labelAr ?? r.letterType,
        requesterName: joinName(r.requesterFirstName, r.requesterLastName) || "—",
        gaps,
      };
    }),
  );
}

/** يعتمد الطلب ويُصدر الخطاب في خطوة واحدة. */
export async function approveLetterRequest(requestId: string, actorId: string) {
  const [request] = await db
    .select()
    .from(officialLetterRequests)
    .where(eq(officialLetterRequests.id, requestId))
    .limit(1);
  if (!request) throw new Error("الطلب غير موجود");
  if (request.status !== "pending") throw new Error("الطلب مُعالج مسبقاً");

  const letterType = request.letterType as OfficialLetterType;
  const existing = await findActiveLetter(request.requesterUserId, letterType);
  if (existing) {
    throw new Error("لدى المنسوب شهادة سارية من هذا النوع بالفعل");
  }

  const letter = await issueLetter({
    subjectUserId: request.requesterUserId,
    letterType,
    recipientEntity: request.recipientEntity,
    source: "self",
    issuedByUserId: actorId,
  });

  await db
    .update(officialLetterRequests)
    .set({
      status: "approved",
      reviewedByUserId: actorId,
      reviewedAt: new Date(),
      letterId: letter.id,
      updatedAt: new Date(),
    })
    .where(eq(officialLetterRequests.id, requestId));

  return letter;
}

export async function rejectLetterRequest(
  requestId: string,
  actorId: string,
  reviewNote: string,
) {
  const trimmed = reviewNote.trim();
  if (!trimmed) throw new Error("سبب الرفض مطلوب");
  const updated = await db
    .update(officialLetterRequests)
    .set({
      status: "rejected",
      reviewedByUserId: actorId,
      reviewedAt: new Date(),
      reviewNote: trimmed,
      updatedAt: new Date(),
    })
    .where(
      and(eq(officialLetterRequests.id, requestId), eq(officialLetterRequests.status, "pending")),
    )
    .returning({ id: officialLetterRequests.id });
  if (updated.length === 0) throw new Error("الطلب مُعالج مسبقاً");
}
