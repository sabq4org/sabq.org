/**
 * منطق مشترك لدخول/تسجيل الجوال (موبايل: oauthMobile.ts، ويب: routes.ts).
 * يعزل التطبيع + إنشاء/ربط المستخدم + حل تعارض منسوب/قارئ.
 */

import { and, eq, isNotNull, ne, or, sql } from "drizzle-orm";
import {
  canUserLogin,
  correspondentApplications,
  getUserStatusMessage,
  opinionAuthorApplications,
  staffProfiles,
  users,
  userRoles,
  roles,
} from "@shared/schema";
import { db } from "../db";
// لا تستورد auth هنا بشكل ثابت — phoneAuth يُستورد من storage/المسارات، وauth يستورد storage.

/// يُطبّع أي إدخال سعودي إلى E.164 (+9665XXXXXXXX). يقبل: 564255999، 0564255999،
/// 966564255999، 00966…، +966 56 425 5999. يرجع null لغير الصالح.
export function normalizeSaudiPhone(input: string | undefined | null): string | null {
  if (!input) return null;
  let d = String(input).replace(/[^0-9]/g, "");
  if (d.startsWith("00966")) d = d.slice(5);
  else if (d.startsWith("966")) d = d.slice(3);
  if (d.startsWith("0")) d = d.slice(1);
  // رقم المشترك السعودي: 9 أرقام تبدأ بـ5.
  if (!/^5\d{8}$/.test(d)) return null;
  return "+966" + d;
}

/**
 * يُطبّع الجوال إلى E.164 الدولي.
 * - إن وُجد `+` أو بادئة `00` → يُقبل كرقم دولي (8–15 رقمًا).
 * - وإلا → مسار سعودي قديم (توافق تطبيقات سبق/الخليج التي ترسل 5XXXXXXXX).
 */
export function normalizePhone(input: string | undefined | null): string | null {
  if (!input) return null;
  const raw = String(input).trim();
  const compact = raw.replace(/[\s\-().]/g, "");

  if (compact.startsWith("+") || compact.startsWith("00")) {
    let digits = compact.replace(/[^0-9]/g, "");
    if (digits.startsWith("00")) digits = digits.slice(2);
    if (digits.length < 8 || digits.length > 15) return null;
    return `+${digits}`;
  }

  return normalizeSaudiPhone(input);
}

/// صيغ الجوال المحتملة في قاعدة البيانات (لربط حسابات موقع سبق القديمة).
export function phoneCandidates(e164: string): string[] {
  const digits = e164.replace(/\D/g, "");
  const out = new Set<string>([e164, digits]);
  if (e164.startsWith("+966")) {
    const local = e164.slice(4); // 5XXXXXXXX
    out.add(`966${local}`);
    out.add(`0${local}`);
    out.add(local);
  }
  return [...out];
}

/** أدوار المنسوبين — تُفضَّل على عضوية القارئ عند تعارض نفس الجوال. */
export const STAFF_PHONE_ROLES = new Set([
  "admin",
  "system_admin",
  "system.admin",
  "superadmin",
  "super_admin",
  "editor",
  "chief_editor",
  "content_manager",
  "moderator",
  "comments_moderator",
  "reporter",
  "opinion_author",
  "publisher",
  "writer",
  "content_creator",
]);

const READER_LIKE_ROLES = new Set(["reader", "user", "subscriber", ""]);

export function isStaffPhoneRole(role: string | null | undefined): boolean {
  if (!role) return false;
  return STAFF_PHONE_ROLES.has(role.toLowerCase());
}

export function isReaderLikeRole(role: string | null | undefined): boolean {
  if (!role) return true;
  return READER_LIKE_ROLES.has(role.toLowerCase());
}

export type PhoneUserResult =
  | { ok: true; user: typeof users.$inferSelect }
  | { ok: false; status: number; message: string };

type UserRow = typeof users.$inferSelect;

function phoneMatchSql(column: typeof users.phoneNumber, e164: string) {
  const digits = e164.replace(/\D/g, "");
  const last9 = digits.slice(-9);
  // يطابق الرقم بعد إزالة غير الأرقام، أو آخر 9 أرقام (مسار سعودي شائع).
  return sql`(
    regexp_replace(coalesce(${column}, ''), '[^0-9]', '', 'g') = ${digits}
    OR right(regexp_replace(coalesce(${column}, ''), '[^0-9]', '', 'g'), 9) = ${last9}
  )`;
}

/** كل الحسابات النشطة/غير المحذوفة التي تحمل هذا الجوال بأي صيغة. */
export async function findUsersByPhone(e164: string): Promise<UserRow[]> {
  const candidates = phoneCandidates(e164);
  const rows = await db
    .select()
    .from(users)
    .where(
      and(
        or(
          ...candidates.map((p) => eq(users.phoneNumber, p)),
          phoneMatchSql(users.phoneNumber, e164),
        ),
        ne(users.status, "deleted"),
      ),
    );
  // Deduplicate by id (OR can match the same row twice).
  const byId = new Map<string, UserRow>();
  for (const row of rows) byId.set(row.id, row);
  return [...byId.values()];
}

/**
 * هل الجوال مستخدم مسبقاً؟
 * `excludeUserId` يُستخدم عند تحديث الملف الشخصي لنفس العضو.
 */
export async function findConflictingPhoneUser(
  phoneInput: string,
  excludeUserId?: string | null,
): Promise<UserRow | null> {
  const e164 = normalizePhone(phoneInput);
  if (!e164) return null;
  const matches = await findUsersByPhone(e164);
  const conflict = matches.find((u) => u.id !== excludeUserId);
  return conflict ?? null;
}

async function userHasStaffRbac(userId: string): Promise<boolean> {
  const rows = await db
    .select({ name: roles.name })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(userRoles.userId, userId));
  return rows.some((r) => isStaffPhoneRole(r.name));
}

async function annotateStaff(usersList: UserRow[]): Promise<Array<UserRow & { isStaff: boolean }>> {
  return Promise.all(
    usersList.map(async (u) => ({
      ...u,
      isStaff: isStaffPhoneRole(u.role) || (await userHasStaffRbac(u.id)),
    })),
  );
}

/**
 * يختار حساب المنسوب عند وجود أكثر من صف لنفس الجوال.
 * المنسوب أولاً، ثم الموثَّق جوالاً، ثم الأقدم إنشاءً.
 */
export function pickPreferredPhoneUser<T extends { id: string; role: string | null; phoneVerified?: boolean | null; createdAt?: Date | null; isStaff?: boolean }>(
  candidates: T[],
): T | null {
  if (candidates.length === 0) return null;
  const ranked = [...candidates].sort((a, b) => {
    const aStaff = a.isStaff ?? isStaffPhoneRole(a.role);
    const bStaff = b.isStaff ?? isStaffPhoneRole(b.role);
    if (aStaff !== bStaff) return aStaff ? -1 : 1;
    if (Boolean(a.phoneVerified) !== Boolean(b.phoneVerified)) {
      return a.phoneVerified ? -1 : 1;
    }
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return aTime - bTime;
  });
  return ranked[0] ?? null;
}

/**
 * يلغي عضوية القارئ المكررة: يزيل الجوال، يعلّم الحساب محذوفاً، ويُبطل الجلسات.
 * لا يمس حسابات المنسوبين الأخرى.
 */
export async function retireDuplicateReaderPhoneAccounts(
  preferred: UserRow,
  duplicates: UserRow[],
): Promise<number> {
  const preferredIsStaff =
    isStaffPhoneRole(preferred.role) || (await userHasStaffRbac(preferred.id));
  if (!preferredIsStaff) return 0;

  let retired = 0;
  for (const dup of duplicates) {
    if (dup.id === preferred.id) continue;
    const dupIsStaff = isStaffPhoneRole(dup.role) || (await userHasStaffRbac(dup.id));
    if (dupIsStaff) {
      console.warn(
        `[PhoneAuth] Duplicate staff phones for ${preferred.id} and ${dup.id} — left untouched`,
      );
      continue;
    }
    if (!isReaderLikeRole(dup.role) && !dupIsStaff) {
      // دور غير معروف — لا نحذف تلقائياً.
      console.warn(`[PhoneAuth] Skipping non-reader duplicate ${dup.id} role=${dup.role}`);
      continue;
    }

    await db
      .update(users)
      .set({
        phoneNumber: null,
        phoneVerified: false,
        status: "deleted",
      })
      .where(eq(users.id, dup.id));
    try {
      const { invalidateAllUserSessions } = await import("../auth");
      await invalidateAllUserSessions(dup.id);
    } catch (err) {
      console.error(`[PhoneAuth] Failed to invalidate sessions for retired reader ${dup.id}:`, err);
    }
    retired += 1;
    console.log(
      `[PhoneAuth] Retired reader membership ${dup.id} in favor of staff ${preferred.id}`,
    );
  }
  return retired;
}

/**
 * يبحث عن منسوب بلا users.phoneNumber لكن جواله في طلب مراسل/كاتب معتمد
 * أو في staff_profiles.official_phone — ثم يُرجع الحساب ويربط الرقم.
 */
async function findAndBackfillStaffByAlternatePhone(e164: string): Promise<UserRow | null> {
  const digits = e164.replace(/\D/g, "");
  const last9 = digits.slice(-9);

  // 1) طلب مراسل معتمد
  const [corr] = await db
    .select({
      createdUserId: correspondentApplications.createdUserId,
      phone: correspondentApplications.phone,
    })
    .from(correspondentApplications)
    .where(
      and(
        eq(correspondentApplications.status, "approved"),
        isNotNull(correspondentApplications.createdUserId),
        sql`(
          regexp_replace(coalesce(${correspondentApplications.phone}, ''), '[^0-9]', '', 'g') = ${digits}
          OR right(regexp_replace(coalesce(${correspondentApplications.phone}, ''), '[^0-9]', '', 'g'), 9) = ${last9}
        )`,
      ),
    )
    .limit(1);

  // 2) طلب كاتب رأي معتمد
  const [opin] = corr
    ? [null]
    : await db
        .select({
          createdUserId: opinionAuthorApplications.createdUserId,
          phone: opinionAuthorApplications.phone,
        })
        .from(opinionAuthorApplications)
        .where(
          and(
            eq(opinionAuthorApplications.status, "approved"),
            isNotNull(opinionAuthorApplications.createdUserId),
            sql`(
              regexp_replace(coalesce(${opinionAuthorApplications.phone}, ''), '[^0-9]', '', 'g') = ${digits}
              OR right(regexp_replace(coalesce(${opinionAuthorApplications.phone}, ''), '[^0-9]', '', 'g'), 9) = ${last9}
            )`,
          ),
        )
        .limit(1);

  // 3) ملف منسوب — official_phone
  const [profile] = corr || opin
    ? [null]
    : await db
        .select({ userId: staffProfiles.userId, officialPhone: staffProfiles.officialPhone })
        .from(staffProfiles)
        .where(
          sql`(
            regexp_replace(coalesce(${staffProfiles.officialPhone}, ''), '[^0-9]', '', 'g') = ${digits}
            OR right(regexp_replace(coalesce(${staffProfiles.officialPhone}, ''), '[^0-9]', '', 'g'), 9) = ${last9}
          )`,
        )
        .limit(1);

  const userId =
    corr?.createdUserId || opin?.createdUserId || profile?.userId || null;
  if (!userId) return null;

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.status === "deleted") return null;

  // اربط الرقم بالحساب الرسمي إن كان فارغاً أو بصيغة قديمة.
  const updates: Partial<typeof users.$inferInsert> = {};
  if (!user.phoneNumber || normalizePhone(user.phoneNumber) !== e164) {
    updates.phoneNumber = e164;
  }
  if (!user.phoneVerified) updates.phoneVerified = true;

  if (Object.keys(updates).length > 0) {
    const [updated] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, user.id))
      .returning();
    console.log(`[PhoneAuth] Backfilled phone ${e164} onto staff user ${user.id}`);
    return updated;
  }
  return user;
}

export type PhoneLookupResult =
  | { ok: true; user: typeof users.$inferSelect | null }
  | { ok: false; status: number; message: string };

/**
 * يبحث عن حساب قائم بهذا الجوال (بأي صيغة) دون إنشاء أي شيء.
 * - عند تعارض منسوب + قارئ لنفس الرقم: يُعتمد المنسوب وتُلغى عضوية القارئ.
 * - `user: null` تعني: لا حساب لهذا الرقم — الويب يبدأ خطوة إكمال التسجيل.
 */
export async function findExistingPhoneUser(e164: string): Promise<PhoneLookupResult> {
  let matches = await findUsersByPhone(e164);

  if (matches.length === 0) {
    const backfilled = await findAndBackfillStaffByAlternatePhone(e164);
    if (backfilled) matches = [backfilled];
  }

  if (matches.length === 0) {
    return { ok: true, user: null };
  }

  const annotated = await annotateStaff(matches);
  const preferred = pickPreferredPhoneUser(annotated);
  if (!preferred) {
    return { ok: false, status: 500, message: "تعذّر تحديد الحساب" };
  }

  if (matches.length > 1) {
    await retireDuplicateReaderPhoneAccounts(preferred, matches);
  }

  if (!canUserLogin(preferred)) {
    return {
      ok: false,
      status: 403,
      message: getUserStatusMessage(preferred) || "لا يمكنك تسجيل الدخول بسبب حالة حسابك",
    };
  }

  const updates: Partial<typeof users.$inferInsert> = {};
  if (!preferred.phoneVerified) updates.phoneVerified = true;
  if (normalizePhone(preferred.phoneNumber) !== e164) updates.phoneNumber = e164;

  if (Object.keys(updates).length > 0) {
    const [updated] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, preferred.id))
      .returning();
    return { ok: true, user: updated };
  }
  return { ok: true, user: preferred };
}

/// يبحث عن مستخدم بهذا الجوال أو يُنشئه — مسار الموبايل v1 فقط: النسخ المنتشرة من
/// التطبيقات تتوقع token+user في نفس استجابة verify، فلا يمكن تأجيل الإنشاء.
/// السجل المبكر يُنشأ بحالة onboarding صريحة: email فارغ (لا بريد اصطناعي — أُلغي
/// نمط p<digits>@phone.sabq.org في 2026-07-31)، وبريد غير موثق، وملف غير مكتمل.
/// الويب لا يستدعي هذا — يستخدم findExistingPhoneUser + تدفق إكمال التسجيل.
export async function findOrCreatePhoneUser(e164: string): Promise<PhoneUserResult> {
  const existing = await findExistingPhoneUser(e164);
  if (!existing.ok) return existing;
  if (existing.user) return { ok: true, user: existing.user };

  // رقم جديد فعلاً → عضوية قارئ بالجوال في حالة onboarding.
  // قفل استشاري + إعادة فحص داخل المعاملة: تاريخيًا كانت فرادة البريد الاصطناعي
  // تمنع (عرضًا) طلبين متزامنين من إنشاء حسابين لنفس الرقم؛ مع email فارغ
  // يجب منع السباق صراحةً.
  const { nanoid } = await import("nanoid");
  const created = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"phone-reg:" + e164}))`);
    const [raced] = await tx
      .select()
      .from(users)
      .where(and(phoneMatchSql(users.phoneNumber, e164), ne(users.status, "deleted")))
      .limit(1);
    if (raced) return raced;

    const [inserted] = await tx
      .insert(users)
      .values({
        id: nanoid(),
        email: null,
        phoneNumber: e164,
        role: "reader",
        authProvider: "phone",
        phoneVerified: true,
        emailVerified: false,
        status: "active",
        isProfileComplete: false,
      })
      .returning();
    return inserted;
  });
  return { ok: true, user: created };
}

// البريد الاصطناعي التاريخي — القاعدة الآن في shared/authEmail (مشتركة مع الواجهات).
export { isSyntheticPhoneEmail } from "@shared/authEmail";

/**
 * يرفض تعيين جوال مستخدم مسبقاً (تسجيل / تحديث ملف / إنشاء مستخدم إداري).
 * يرجع رسالة عربية جاهزة للاستجابة 409.
 */
export async function assertPhoneAvailable(
  phoneInput: string | null | undefined,
  excludeUserId?: string | null,
): Promise<{ ok: true; e164: string | null } | { ok: false; message: string }> {
  if (!phoneInput || !String(phoneInput).trim()) {
    return { ok: true, e164: null };
  }
  const e164 = normalizePhone(phoneInput);
  if (!e164) {
    return { ok: false, message: "رقم الجوال غير صحيح" };
  }
  const conflict = await findConflictingPhoneUser(e164, excludeUserId);
  if (conflict) {
    return { ok: false, message: "رقم الجوال مسجل مسبقاً" };
  }
  return { ok: true, e164 };
}

/**
 * عند اعتماد منسوب: إن وُجد قارئ بنفس الجوال يُلغى حسابه ويُحرَّر الرقم.
 * إن وُجد منسوب آخر بالرقم → رفض.
 */
export async function claimPhoneForStaffAccount(
  phoneInput: string | null | undefined,
  staffUserId?: string | null,
): Promise<{ ok: true; e164: string | null } | { ok: false; message: string }> {
  if (!phoneInput || !String(phoneInput).trim()) {
    return { ok: true, e164: null };
  }
  const e164 = normalizePhone(phoneInput);
  if (!e164) {
    return { ok: false, message: "رقم الجوال غير صحيح" };
  }

  const matches = await findUsersByPhone(e164);
  const others = matches.filter((u) => u.id !== staffUserId);

  for (const other of others) {
    const otherIsStaff =
      isStaffPhoneRole(other.role) || (await userHasStaffRbac(other.id));
    if (otherIsStaff) {
      return {
        ok: false,
        message: "رقم الجوال مسجل مسبقاً على حساب منسوب آخر",
      };
    }

    if (!isReaderLikeRole(other.role)) {
      return {
        ok: false,
        message: "رقم الجوال مسجل مسبقاً",
      };
    }

    await db
      .update(users)
      .set({
        phoneNumber: null,
        phoneVerified: false,
        status: "deleted",
      })
      .where(eq(users.id, other.id));
    try {
      const { invalidateAllUserSessions } = await import("../auth");
      await invalidateAllUserSessions(other.id);
    } catch (err) {
      console.error(`[PhoneAuth] Failed to invalidate sessions for retired reader ${other.id}:`, err);
    }
    console.log(
      `[PhoneAuth] Claimed phone ${e164}: retired reader ${other.id} for staff ${staffUserId ?? "(new)"}`,
    );
  }

  return { ok: true, e164 };
}
