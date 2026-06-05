/**
 * مُقترب — تزويد الزاوية والحساب من طلب مُعتمَد (موافقة بنقرة واحدة).
 *
 * عند اعتماد طلب زاوية (angle_submissions.status = "approved") تُنفّذ هذه
 * الخدمة كل الخطوات الآلية دفعةً واحدة:
 *   1. إيجاد المستخدم بالبريد (مُطبَّع lowercase) أو إنشاء حساب جديد.
 *   2. إنشاء الزاوية وربطها بالمستخدم كمدير (managerUserId).
 *   3. إسناد دور "angle_writer" عبر جدول user_roles (الآلية الوحيدة التي
 *      يقرأها getUserPermissions — بديلاً عن customPermissions المعطّل الذي
 *      كان يُكتب إلى عمود غير موجود).
 *   4. ربط الطلب بالزاوية (createdAngleId) — حارس ضد التكرار.
 *   5. إرسال بريد بيانات الدخول.
 *
 * تستبدل هذه الخدمة منطق POST /api/angle-submissions/:id/create-angle القديم
 * الذي كان يعتمد على ثلاث دوال storage غير موجودة (getUserByEmail،
 * getAllSections، createUser) فيتعطّل وقت التشغيل دائماً.
 */

import { db } from "../db";
import { storage } from "../storage";
import { users, roles, userRoles, type AngleSubmission, type Angle, type User } from "@shared/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import bcrypt from "bcrypt";
import { transliterateToEnglish, generateEnglishSlug } from "../utils/slugTransliterator";
import { logActivity, invalidateUserPermissionCache } from "../rbac";
import { invalidateUserSessionCache } from "../auth";
import { sendEmailNotification } from "./email";

const LOGIN_URL = "https://sabq.org/login";

export interface ProvisionResult {
  ok: boolean;
  alreadyProvisioned?: boolean;
  angle?: Angle;
  user?: { id: string; email: string };
  isNewUser?: boolean;
  emailSent?: boolean;
  emailError?: string;
  message: string;
}

export interface ResendCredentialsResult {
  ok: boolean;
  emailSent?: boolean;
  emailError?: string;
  message: string;
}

function generatePassword(): string {
  // حروف بلا أحرف ملتبسة (0/O، 1/l/I) لتسهيل النسخ من البريد
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let password = "";
  for (let i = 0; i < 10; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

// سلق إنجليزي قابل للقراءة من الاسم العربي (تحويل صوتي) + لاحقة فريدة قصيرة.
// مثل المقالات: لا عربي في الرابط. fallback لـ nanoid لو التحويل فارغ.
function buildAngleSlug(angleName: string): string {
  const base = transliterateToEnglish(angleName)
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return base ? `${base}-${nanoid(5)}` : generateEnglishSlug();
}

/**
 * يُنفّذ التزويد الكامل. idempotent: إن كان createdAngleId مضبوطاً مسبقاً
 * يرجع alreadyProvisioned دون أي تكرار.
 */
export async function provisionAngleFromSubmission(
  submissionId: string,
  reviewerId: string,
): Promise<ProvisionResult> {
  const submission = await storage.getAngleSubmission(submissionId);
  if (!submission) {
    return { ok: false, message: "الطلب غير موجود" };
  }
  if (submission.status !== "approved") {
    return { ok: false, message: "يجب الموافقة على الطلب أولاً قبل إنشاء الزاوية" };
  }
  if (submission.createdAngleId) {
    return { ok: true, alreadyProvisioned: true, message: "تم إنشاء الزاوية مسبقاً لهذا الطلب" };
  }

  const section = await storage.getSectionBySlug("muqtarab");
  if (!section) {
    return { ok: false, message: "قسم مُقترب غير موجود" };
  }

  // تطبيع البريد lowercase لتفادي ازدواج الحسابات (case-sensitive unique)
  const email = submission.email.trim().toLowerCase();

  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  let user: User;
  let isNewUser = false;
  let tempPassword: string | null = null;

  if (existing) {
    user = existing;
  } else {
    isNewUser = true;
    tempPassword = generatePassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 12);
    const firstName = submission.fullName.split(" ")[0] || submission.fullName;
    const lastName = submission.fullName.split(" ").slice(1).join(" ") || "";

    const [created] = await db
      .insert(users)
      .values({
        id: nanoid(),
        email,
        firstName,
        lastName,
        passwordHash: hashedPassword,
        role: "angle_writer",
        status: "active",
        emailVerified: true,
        isProfileComplete: true,
        mustChangePassword: true, // تغيير كلمة المرور إلزامي عند أول دخول
      })
      .returning();
    user = created;
  }

  // إسناد دور angle_writer عبر RBAC (idempotent عبر unique(userId, roleId))
  const [writerRole] = await db.select().from(roles).where(eq(roles.name, "angle_writer")).limit(1);
  if (writerRole) {
    await db
      .insert(userRoles)
      .values({ userId: user.id, roleId: writerRole.id, assignedBy: reviewerId })
      .onConflictDoNothing();
  } else {
    console.warn("[muqtarab] دور angle_writer غير موجود في DB — شغّل seedRBAC. تم تخطّي إسناد الدور.");
  }
  invalidateUserPermissionCache(user.id);
  invalidateUserSessionCache(user.id);

  // إنشاء الزاوية وربطها بالمستخدم كمدير
  const angle = await storage.createAngle({
    nameAr: submission.angleName,
    slug: buildAngleSlug(submission.angleName),
    shortDesc: submission.angleDescription,
    sectionId: section.id,
    colorHex: "#6366f1",
    iconKey: "Lightbulb",
    isActive: true,
    sortOrder: 999,
    managerUserId: user.id,
  });

  // ربط الطلب بالزاوية (حارس التكرار)
  await storage.updateAngleSubmission(submissionId, { createdAngleId: angle.id });

  await logActivity({
    userId: reviewerId,
    action: "create",
    entityType: "angle",
    entityId: angle.id,
    newValue: {
      angleId: angle.id,
      slug: angle.slug,
      fromSubmission: submissionId,
      userId: user.id,
      isNewUser,
    },
  });

  const emailResult = await sendCredentialsEmail(submission, email, isNewUser, tempPassword);
  if (!emailResult.success) {
    console.error("[muqtarab] فشل إرسال بريد بيانات الدخول:", emailResult.error);
  }

  const emailOk = !!emailResult.success;
  return {
    ok: true,
    angle,
    user: { id: user.id, email: user.email },
    isNewUser,
    emailSent: emailOk,
    emailError: emailResult.error,
    message: emailOk
      ? isNewUser
        ? "تم إنشاء الزاوية والحساب وإرسال بيانات الدخول"
        : "تم إنشاء الزاوية وربطها بالحساب الموجود وأُرسل بريد الدخول"
      : isNewUser
        ? "تم إنشاء الزاوية والحساب لكن فشل إرسال البريد — أعد الإرسال من لوحة الطلبات"
        : "تم إنشاء الزاوية لكن فشل إرسال البريد — أعد الإرسال من لوحة الطلبات",
  };
}

/**
 * إعادة إرسال بيانات الدخول لكاتب زاوية مُزوَّد مسبقاً.
 * يُعيد تعيين كلمة مرور مؤقتة افتراضياً حتى يصل بريد قابل للاستخدام.
 */
export async function resendAngleWriterCredentials(
  submissionId: string,
  resetPassword = true,
): Promise<ResendCredentialsResult> {
  const submission = await storage.getAngleSubmission(submissionId);
  if (!submission) {
    return { ok: false, message: "الطلب غير موجود" };
  }
  if (submission.status !== "approved") {
    return { ok: false, message: "الطلب غير معتمد" };
  }
  if (!submission.createdAngleId) {
    return { ok: false, message: "لم تُنشأ الزاوية بعد — استخدم «إنشاء الزاوية» أولاً" };
  }

  const email = submission.email.trim().toLowerCase();
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    return { ok: false, message: "لم يُعثر على حساب المستخدم المرتبط بالطلب" };
  }

  let tempPassword: string | null = null;
  let showAsNewCredentials = false;

  if (resetPassword) {
    tempPassword = generatePassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 12);
    await db
      .update(users)
      .set({
        passwordHash: hashedPassword,
        mustChangePassword: true,
        status: "active",
        emailVerified: true,
      })
      .where(eq(users.id, user.id));
    invalidateUserSessionCache(user.id);
    showAsNewCredentials = true;
  }

  const emailResult = await sendCredentialsEmail(
    submission,
    email,
    showAsNewCredentials,
    tempPassword,
  );

  if (!emailResult.success) {
    console.error("[muqtarab] فشل إعادة إرسال بريد الدخول:", emailResult.error);
    return {
      ok: false,
      emailSent: false,
      emailError: emailResult.error,
      message: emailResult.error || "فشل إرسال البريد",
    };
  }

  return {
    ok: true,
    emailSent: true,
    message: resetPassword
      ? "تم إعادة تعيين كلمة المرور وإرسال بيانات الدخول بالبريد"
      : "تم إرسال بيانات الدخول بالبريد",
  };
}

async function sendCredentialsEmail(
  submission: AngleSubmission,
  email: string,
  isNewUser: boolean,
  tempPassword: string | null,
): Promise<{ success: boolean; error?: string }> {
  const firstName = submission.fullName.split(" ")[0];
  const html = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head><meta charset="UTF-8"></head>
<body style="font-family: 'Segoe UI', Tahoma, Arial, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); margin: 0; padding: 40px 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 20px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">
    <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 40px 30px; text-align: center;">
      <div style="font-size: 60px; margin-bottom: 15px;">🚀</div>
      <h1 style="color: white; margin: 0; font-size: 28px;">زاويتك جاهزة ${firstName}!</h1>
      <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0; font-size: 18px;">حان وقت الإبداع</p>
    </div>
    <div style="padding: 40px 30px;">
      <p style="color: #1f2937; font-size: 18px; line-height: 1.8; margin: 0 0 20px;">أهلاً <strong>${firstName}</strong> 👋</p>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.8; margin: 0 0 20px;">
        تم إنشاء زاويتك <strong style="color: #10b981;">"${submission.angleName}"</strong> بنجاح! 🎉
      </p>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.8; margin: 0 0 25px;">
        يمكنك الآن تسجيل الدخول والبدء بإضافة مواضيع في زاويتك الخاصة. ستُراجع الإدارة كل موضوع قبل نشره.
      </p>

      <div style="background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); border: 2px solid #0ea5e9; padding: 25px; border-radius: 15px; margin-bottom: 25px;">
        <h3 style="color: #0369a1; margin: 0 0 15px; font-size: 18px;">🔐 بيانات الدخول</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #64748b; font-size: 14px;">البريد الإلكتروني:</td>
            <td style="padding: 8px 0; color: #1e293b; font-size: 16px; font-weight: bold; direction: ltr; text-align: right;">${email}</td>
          </tr>
          ${
            isNewUser
              ? `<tr>
            <td style="padding: 8px 0; color: #64748b; font-size: 14px;">كلمة المرور المؤقتة:</td>
            <td style="padding: 8px 0; color: #1e293b; font-size: 16px; font-weight: bold; font-family: monospace; direction: ltr; text-align: right; background: #fef3c7; padding: 5px 10px; border-radius: 5px;">${tempPassword}</td>
          </tr>`
              : `<tr>
            <td colspan="2" style="padding: 8px 0; color: #059669; font-size: 14px;">✅ لديك حساب بالفعل - استخدم كلمة المرور الحالية</td>
          </tr>`
          }
        </table>
      </div>

      <div style="text-align: center; margin-bottom: 25px;">
        <a href="${LOGIN_URL}" style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: white; text-decoration: none; padding: 15px 40px; border-radius: 10px; font-size: 16px; font-weight: bold;">تسجيل الدخول الآن</a>
      </div>

      ${
        isNewUser
          ? `<div style="background: #fef3c7; border-right: 4px solid #f59e0b; padding: 15px; border-radius: 10px; margin-bottom: 20px;">
        <p style="color: #92400e; margin: 0; font-size: 14px;">⚠️ <strong>مهم:</strong> قم بتغيير كلمة المرور فور تسجيل الدخول من صفحة الملف الشخصي.</p>
      </div>`
          : ""
      }

      <div style="background: #f0fdf4; border-right: 4px solid #10b981; padding: 20px; border-radius: 10px; margin-bottom: 20px;">
        <p style="color: #166534; margin: 0; font-size: 15px;">
          <strong>💡 صلاحياتك:</strong> يمكنك إدارة زاويتك فقط — إضافة المواضيع وتعديلها وإرسالها لمراجعة الإدارة قبل النشر.
        </p>
      </div>

      <p style="color: #6b7280; font-size: 14px; line-height: 1.8; margin: 0;">نتطلع لرؤية إبداعاتك! 🌟</p>
    </div>
    <div style="background: #f9fafb; padding: 25px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
      <p style="color: #9ca3af; font-size: 13px; margin: 0;">مع تحيات فريق <strong style="color: #6366f1;">سبق</strong> | منصة مُقترب</p>
    </div>
  </div>
</body>
</html>`;

  return sendEmailNotification({
    to: email,
    subject: `🚀 زاويتك "${submission.angleName}" جاهزة - بيانات الدخول`,
    html,
  });
}
