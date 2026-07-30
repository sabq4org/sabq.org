/**
 * تسجيل عضوية جديدة برقم الجوال — على مرحلتين:
 *   1) نجاح OTP لرقم غير مسجل → تذكرة إثبات قصيرة العمر (15 دقيقة) أحادية الاستخدام.
 *   2) إكمال البيانات (اسم/بريد/كلمة مرور) → إنشاء الحساب ذريًا بلا بريد اصطناعي.
 *
 * التذكرة تُخزن sha256 فقط (لا التوكن الخام)، وتُقفل ذريًا داخل نفس معاملة
 * إنشاء الحساب، مع قفل استشاري على الرقم يمنع طلبين متزامنين من إنشاء حسابين.
 *
 * تُستخدم أيضًا لاستكمال الحسابات القديمة ذات البريد الاصطناعي
 * (completePhoneUserProfile): بريد حقيقي غير موثق + كلمة مرور + الاسم الناقص.
 */

import crypto from "crypto";
import bcrypt from "bcrypt";
import { and, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { phoneRegistrationTickets, users, userNotificationPrefs } from "@shared/schema";
import { isSyntheticPhoneEmail } from "@shared/authEmail";
import { db } from "../db";
import { findUsersByPhone } from "./phoneAuth";

const TICKET_TTL_MS = 15 * 60 * 1000;

/** صيغة بريد بسيطة — الفحص النهائي للملكية هو رسالة التحقق نفسها. */
export const EMAIL_FORMAT_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function hashTicketToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export type TicketRow = typeof phoneRegistrationTickets.$inferSelect;

/**
 * يصدر تذكرة إثبات لرقم وثّق جواله للتو وليس له حساب.
 * يعيد التوكن الخام (يُسلّم للعميل ولا يُخزن ولا يُسجل في اللوغ).
 */
export async function issuePhoneRegistrationTicket(e164: string): Promise<string> {
  // تنظيف انتهازي: التذاكر منتهية الصلاحية منذ أكثر من ساعة لا قيمة لها.
  await db
    .delete(phoneRegistrationTickets)
    .where(lt(phoneRegistrationTickets.expiresAt, new Date(Date.now() - 60 * 60 * 1000)))
    .catch(() => {});

  const rawToken = crypto.randomBytes(32).toString("hex");
  await db.insert(phoneRegistrationTickets).values({
    phoneNumber: e164,
    tokenHash: hashTicketToken(rawToken),
    expiresAt: new Date(Date.now() + TICKET_TTL_MS),
  });
  return rawToken;
}

/** فحص صلاحية التذكرة دون استهلاكها (لأخطاء النموذج القابلة للتصحيح). */
export async function peekPhoneRegistrationTicket(rawToken: string): Promise<TicketRow | null> {
  if (!rawToken || typeof rawToken !== "string" || rawToken.length > 200) return null;
  const [row] = await db
    .select()
    .from(phoneRegistrationTickets)
    .where(
      and(
        eq(phoneRegistrationTickets.tokenHash, hashTicketToken(rawToken)),
        isNull(phoneRegistrationTickets.usedAt),
        gt(phoneRegistrationTickets.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return row ?? null;
}

export type PhoneRegistrationInput = {
  rawToken: string;
  firstName: string;
  lastName?: string | null;
  email: string;
  password: string;
};

export type PhoneRegistrationResult =
  | { ok: true; user: typeof users.$inferSelect }
  | {
      ok: false;
      code: "ticket_invalid" | "email_taken" | "phone_taken";
      message: string;
    };

/** خطأ مصنّف يُرمى داخل المعاملة لفرض rollback (فلا تُحرق التذكرة على خطأ قابل للتصحيح). */
class RegistrationConflict extends Error {
  constructor(
    public code: "ticket_invalid" | "email_taken" | "phone_taken",
    message: string,
  ) {
    super(message);
  }
}

/**
 * إنشاء الحساب النهائي ذريًا: قفل التذكرة + قفل استشاري على الرقم +
 * إعادة فحص فرادة البريد والجوال داخل المعاملة نفسها.
 * كلمة المرور تُدقق سياستها لدى المسار قبل الوصول هنا.
 */
export async function registerPhoneUser(
  input: PhoneRegistrationInput,
): Promise<PhoneRegistrationResult> {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_FORMAT_REGEX.test(email) || isSyntheticPhoneEmail(email)) {
    return { ok: false, code: "email_taken", message: "أدخل بريدًا إلكترونيًا حقيقيًا صالحًا" };
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  const { nanoid } = await import("nanoid");
  const newUserId = nanoid();

  try {
    const created = await db.transaction(async (tx) => {
      // قفل التذكرة ذريًا — أول طالب يفوز، وأي إعادة إرسال/سباق يفشل هنا.
      // أي تعارض لاحق يرمي RegistrationConflict فيتراجع rollback عن قفل التذكرة —
      // الأخطاء القابلة للتصحيح (بريد مستخدم) لا تحرق إثبات التحقق.
      const [ticket] = await tx
        .update(phoneRegistrationTickets)
        .set({ usedAt: new Date(), usedByUserId: newUserId })
        .where(
          and(
            eq(phoneRegistrationTickets.tokenHash, hashTicketToken(input.rawToken)),
            isNull(phoneRegistrationTickets.usedAt),
            gt(phoneRegistrationTickets.expiresAt, new Date()),
          ),
        )
        .returning();
      if (!ticket) {
        throw new RegistrationConflict(
          "ticket_invalid",
          "انتهت صلاحية جلسة التحقق. أعد التحقق من رقم جوالك.",
        );
      }
      const e164 = ticket.phoneNumber;

      // قفل استشاري على الرقم: تذكرتان مختلفتان لنفس الرقم لا تنشئان حسابين.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"phone-reg:" + e164}))`);

      const phoneTaken = await tx
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            sql`right(regexp_replace(coalesce(${users.phoneNumber}, ''), '[^0-9]', '', 'g'), 9) = ${e164.replace(/\D/g, "").slice(-9)}`,
            sql`${users.status} <> 'deleted'`,
          ),
        )
        .limit(1);
      if (phoneTaken.length > 0) {
        throw new RegistrationConflict("phone_taken", "رقم الجوال مسجل مسبقًا. جرّب تسجيل الدخول.");
      }

      const emailTaken = await tx
        .select({ id: users.id })
        .from(users)
        .where(sql`lower(${users.email}) = ${email}`)
        .limit(1);
      if (emailTaken.length > 0) {
        throw new RegistrationConflict("email_taken", "هذا البريد الإلكتروني مستخدم بالفعل");
      }

      const [inserted] = await tx
        .insert(users)
        .values({
          id: newUserId,
          email,
          passwordHash,
          firstName: input.firstName.trim(),
          lastName: input.lastName?.trim() || null,
          phoneNumber: e164,
          role: "reader",
          authProvider: "phone",
          phoneVerified: true,
          emailVerified: false, // يثبت فقط عبر رابط/رمز التحقق الفعلي
          status: "active",
          isProfileComplete: true,
        })
        .returning();

      return inserted;
    });

    // تفضيلات الإشعارات خارج المعاملة — فشلها لا يُفشل التسجيل (نمط /api/register)،
    // وأي فشل داخل معاملة PG كان سيُجهض المعاملة كلها حتى لو التُقط.
    await db
      .insert(userNotificationPrefs)
      .values({
        userId: created.id,
        breaking: true,
        interest: true,
        likedUpdates: true,
        mostRead: true,
        webPush: false,
        dailyDigest: false,
      })
      .catch((err) => console.error("[phoneRegistration] notification prefs failed:", err));

    return { ok: true, user: created };
  } catch (err) {
    if (err instanceof RegistrationConflict) {
      return { ok: false, code: err.code, message: err.message };
    }
    // فرادة على مستوى القاعدة (users_email_lower_unique) — سباق خارج القفل.
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("users_email_lower_unique") || msg.includes("users_email_unique")) {
      return { ok: false, code: "email_taken", message: "هذا البريد الإلكتروني مستخدم بالفعل" };
    }
    throw err;
  }
}

export type CompleteProfileInput = {
  userId: string;
  email?: string | null;
  password?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

export type CompleteProfileResult =
  | { ok: true; user: typeof users.$inferSelect; emailChanged: boolean }
  | { ok: false; status: number; message: string };

/**
 * استكمال حساب جوال قديم (بريد اصطناعي و/أو بلا كلمة مرور و/أو بلا اسم).
 * - البريد الحقيقي الموجود لا يُستبدل أبدًا؛ يُستبدل الاصطناعي/الفارغ فقط.
 * - كلمة المرور تُعين فقط إن لم تكن موجودة (تغييرها له مساراته المصرح بها).
 * - الاسم write-once كسياسة المشروع.
 */
export async function completePhoneUserProfile(
  input: CompleteProfileInput,
): Promise<CompleteProfileResult> {
  const [current] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
  if (!current) return { ok: false, status: 404, message: "المستخدم غير موجود" };

  const updates: Partial<typeof users.$inferInsert> = {};
  let emailChanged = false;

  if (input.email && input.email.trim()) {
    const nextEmail = input.email.trim().toLowerCase();
    if (!EMAIL_FORMAT_REGEX.test(nextEmail)) {
      return { ok: false, status: 400, message: "صيغة البريد الإلكتروني غير صحيحة" };
    }
    if (isSyntheticPhoneEmail(nextEmail)) {
      return { ok: false, status: 400, message: "أدخل بريدًا إلكترونيًا حقيقيًا" };
    }
    const currentIsReal = Boolean(current.email?.trim()) && !isSyntheticPhoneEmail(current.email);
    if (currentIsReal) {
      // بريد حقيقي قائم — لا يُستبدل من مسار الاستكمال (تجاهل صامت كسياسة الاسم).
    } else if (nextEmail !== current.email?.trim().toLowerCase()) {
      const [taken] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(sql`lower(${users.email}) = ${nextEmail}`, sql`${users.id} <> ${input.userId}`))
        .limit(1);
      if (taken) {
        return { ok: false, status: 409, message: "هذا البريد الإلكتروني مستخدم بالفعل" };
      }
      updates.email = nextEmail;
      updates.emailVerified = false;
      emailChanged = true;
    }
  }

  if (input.password) {
    if (!current.passwordHash) {
      updates.passwordHash = await bcrypt.hash(input.password, 12);
    }
    // من يملك كلمة مرور يغيّرها من مسار تغيير كلمة المرور المصرح به فقط.
  }

  if (input.firstName?.trim() && !current.firstName?.trim()) {
    updates.firstName = input.firstName.trim();
  }
  if (input.lastName?.trim() && !current.lastName?.trim()) {
    updates.lastName = input.lastName.trim();
  }

  const nextFirst = (updates.firstName as string | undefined) ?? current.firstName ?? "";
  if (nextFirst.trim().length >= 2) {
    updates.isProfileComplete = true;
  }

  if (Object.keys(updates).length === 0) {
    return { ok: true, user: current, emailChanged: false };
  }

  try {
    const [updated] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, input.userId))
      .returning();
    return { ok: true, user: updated, emailChanged };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("users_email_lower_unique") || msg.includes("users_email_unique")) {
      return { ok: false, status: 409, message: "هذا البريد الإلكتروني مستخدم بالفعل" };
    }
    throw err;
  }
}

/** هل يحتاج هذا الحساب استكمالًا؟ (بريد اصطناعي/مفقود أو بلا كلمة مرور). */
export function phoneAccountNeedsCompletion(user: {
  email: string | null;
  passwordHash: string | null;
  authProvider: string | null;
}): boolean {
  if (user.authProvider !== "phone") return false;
  const emailMissing = !user.email?.trim() || isSyntheticPhoneEmail(user.email);
  return emailMissing || !user.passwordHash;
}
