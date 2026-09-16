/**
 * إعادة إرسال بيانات دخول كاتب الرأي بعد الموافقة.
 */
import bcrypt from "bcrypt";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users, opinionAuthorApplications } from "@shared/schema";
import { invalidateAllUserSessions } from "../auth";
import { sendOpinionAuthorApprovalEmail } from "./employeeNotifications";

export interface ResendOpinionAuthorCredentialsResult {
  ok: boolean;
  emailSent?: boolean;
  emailError?: string;
  /** Present when ok — admin-only endpoint may surface for manual delivery (Yahoo spam, etc.) */
  temporaryPassword?: string;
  email?: string;
  message: string;
}

export async function resendOpinionAuthorCredentials(
  applicationId: string,
): Promise<ResendOpinionAuthorCredentialsResult> {
  const [application] = await db
    .select()
    .from(opinionAuthorApplications)
    .where(eq(opinionAuthorApplications.id, applicationId))
    .limit(1);

  if (!application) {
    return { ok: false, message: "الطلب غير موجود" };
  }
  if (application.status !== "approved") {
    return { ok: false, message: "الطلب غير معتمد" };
  }
  if (!application.createdUserId) {
    return { ok: false, message: "لم يُربط الطلب بحساب مستخدم بعد" };
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, application.createdUserId))
    .limit(1);

  if (!user) {
    return { ok: false, message: "لم يُعثر على حساب المستخدم المرتبط بالطلب" };
  }

  const temporaryPassword = nanoid(12);
  const hashedPassword = await bcrypt.hash(temporaryPassword, 12);

  await db
    .update(users)
    .set({
      passwordHash: hashedPassword,
      mustChangePassword: true,
      status: "active",
      emailVerified: true,
      role: "opinion_author",
    })
    .where(eq(users.id, user.id));

  // New credentials issued to an existing account — evict every prior session
  // so a stolen session can't survive the reset (audit #8).
  await invalidateAllUserSessions(user.id);

  const emailResult = await sendOpinionAuthorApprovalEmail(
    application.email,
    application.arabicName || "كاتب الرأي",
    temporaryPassword,
  );

  if (!emailResult.success) {
    console.error("[opinion-author] فشل إعادة إرسال بريد الدخول:", emailResult.error);
    // Password was already rotated — return ok so admin can copy the temp password
    // manually (common with Yahoo/Hotmail spam filters).
    return {
      ok: true,
      emailSent: false,
      emailError: emailResult.error,
      temporaryPassword,
      email: application.email,
      message:
        "تم تعيين كلمة مرور مؤقتة جديدة لكن فشل إرسال البريد — انسخ كلمة المرور وأرسلها للكاتب يدوياً (واتساب/رسالة)",
    };
  }

  return {
    ok: true,
    emailSent: true,
    temporaryPassword,
    email: application.email,
    message: "تم إعادة تعيين كلمة المرور وإرسال بيانات الدخول بالبريد",
  };
}
