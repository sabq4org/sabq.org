/**
 * إكمال تسجيل عضوية الجوال (ويب — جلسة Passport):
 *
 *   POST /api/auth/phone/complete-registration
 *     بعد نجاح OTP لرقم جديد يعيد /api/auth/phone/verify تذكرة registrationToken.
 *     هنا تُقدَّم بيانات التسجيل (اسم + بريد حقيقي + كلمة مرور) ويُنشأ الحساب
 *     ذريًا بلا أي بريد اصطناعي، ثم تُنشأ الجلسة ويُرسل تحقق البريد.
 *
 *   POST /api/auth/complete-account
 *     استكمال حساب جوال قديم (بريد اصطناعي/مفقود أو بلا كلمة مرور) لمستخدم مسجّل
 *     دخوله. البريد الجديد يبقى غير موثق حتى ينجح رابط التحقق.
 *     (الاسم ليس complete-profile — ذاك مسار onboarding قديم في interests.ts
 *     يسجَّل قبلنا في splitRoutesIndex وكان يبتلع الطلبات ويعيد نجاحًا بلا حفظ.)
 *
 * استعلامات Drizzle في services/phoneRegistrationService (ADR-001 — لا db هنا).
 */

import { Router, type Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { isAuthenticated } from "../auth";
import { validatePassword } from "../utils/passwordPolicy";
import {
  peekPhoneRegistrationTicket,
  registerPhoneUser,
  completePhoneUserProfile,
} from "../services/phoneRegistrationService";
import { sendVerificationEmail } from "../services/email";
import { memoryCache } from "../memoryCache";

const router = Router();

// نفس روح authLimiter في routes.ts: يمنع تخمين التذاكر وقصف الإنشاء.
const registrationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "محاولات كثيرة جدًا. حاول لاحقًا." },
  validate: { xForwardedForHeader: false, ip: false, keyGeneratorIpFallback: false },
});

const nameRegex = /^[؀-ۿa-zA-Z\s'\-]+$/;

const completeRegistrationSchema = z.object({
  registrationToken: z.string().min(16).max(200),
  firstName: z
    .string()
    .trim()
    .min(2, "الاسم الأول يجب أن يكون حرفين على الأقل")
    .max(60, "الاسم الأول طويل جداً")
    .regex(nameRegex, "الاسم الأول يحتوي على رموز غير صالحة"),
  lastName: z
    .string()
    .trim()
    .max(60, "اسم العائلة طويل جداً")
    .regex(nameRegex, "اسم العائلة يحتوي على رموز غير صالحة")
    .optional()
    .nullable()
    .or(z.literal("")),
  email: z
    .string()
    .trim()
    .max(254, "البريد الإلكتروني طويل جداً")
    .email("البريد الإلكتروني غير صحيح"),
  password: z.string().min(1, "كلمة المرور مطلوبة").max(128, "كلمة المرور طويلة جداً"),
  confirmPassword: z.string().optional(),
});

router.post(
  "/api/auth/phone/complete-registration",
  registrationLimiter,
  async (req: any, res: Response) => {
    try {
      const parsed = completeRegistrationSchema.safeParse(req.body);
      if (!parsed.success) {
        const firstError = parsed.error.errors[0];
        return res.status(400).json({ message: firstError?.message || "البيانات غير صحيحة" });
      }
      const { registrationToken, firstName, lastName, email, password, confirmPassword } =
        parsed.data;

      if (typeof confirmPassword === "string" && confirmPassword !== password) {
        return res.status(400).json({ message: "كلمتا المرور غير متطابقتين" });
      }

      const pwCheck = validatePassword(password);
      if (!pwCheck.ok) {
        return res.status(400).json({ message: pwCheck.message });
      }

      // فحص التذكرة دون استهلاكها: أخطاء النموذج القابلة للتصحيح (بريد مستخدم،
      // كلمة ضعيفة) يجب ألا تحرق الإثبات. الاستهلاك الذري داخل registerPhoneUser.
      const ticket = await peekPhoneRegistrationTicket(registrationToken);
      if (!ticket) {
        return res.status(410).json({
          code: "ticket_invalid",
          message: "انتهت صلاحية جلسة التحقق. أعد التحقق من رقم جوالك.",
        });
      }

      const result = await registerPhoneUser({
        rawToken: registrationToken,
        firstName,
        lastName: lastName || null,
        email,
        password,
      });

      if (!result.ok) {
        const status =
          result.code === "ticket_invalid" ? 410 : result.code === "email_taken" ? 409 : 409;
        return res.status(status).json({ code: result.code, message: result.message });
      }

      const user = result.user;

      // تحقق البريد: البريد يبقى unverified حتى ينجح الرابط — الإرسال لا يعطّل التسجيل.
      const emailResult = await sendVerificationEmail(user.id, user.email!).catch((err) => {
        console.error("[phoneRegistration] verification email failed:", err);
        return { success: false as const, error: "send failed" };
      });

      req.logIn(user, (err: unknown) => {
        if (err) {
          console.error("[phoneRegistration] session error after registration:", err);
          return res
            .status(500)
            .json({ message: "تم إنشاء الحساب ولكن فشل تسجيل الدخول التلقائي" });
        }
        return res.status(201).json({
          message: emailResult.success
            ? "تم إنشاء حسابك. أرسلنا رابط تحقق إلى بريدك الإلكتروني."
            : "تم إنشاء حسابك بنجاح",
          emailSent: emailResult.success,
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            phone: user.phoneNumber,
            emailVerified: user.emailVerified,
          },
        });
      });
    } catch (error) {
      console.error("[phoneRegistration] complete-registration error:", error);
      return res.status(500).json({ message: "خطأ داخلي في الخادم" });
    }
  },
);

const completeProfileSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(2, "الاسم الأول يجب أن يكون حرفين على الأقل")
    .max(60)
    .regex(nameRegex, "الاسم الأول يحتوي على رموز غير صالحة")
    .optional()
    .nullable()
    .or(z.literal("")),
  lastName: z
    .string()
    .trim()
    .max(60)
    .regex(nameRegex, "اسم العائلة يحتوي على رموز غير صالحة")
    .optional()
    .nullable()
    .or(z.literal("")),
  email: z
    .string()
    .trim()
    .max(254)
    .email("البريد الإلكتروني غير صحيح")
    .optional()
    .nullable()
    .or(z.literal("")),
  password: z.string().max(128).optional().nullable().or(z.literal("")),
});

router.post(
  "/api/auth/complete-account",
  isAuthenticated,
  registrationLimiter,
  async (req: any, res: Response) => {
    try {
      const userId = req.user?.id as string | undefined;
      if (!userId) return res.status(401).json({ message: "غير مصرح" });

      const parsed = completeProfileSchema.safeParse(req.body);
      if (!parsed.success) {
        const firstError = parsed.error.errors[0];
        return res.status(400).json({ message: firstError?.message || "البيانات غير صحيحة" });
      }
      const { firstName, lastName, email, password } = parsed.data;

      if (password) {
        const pwCheck = validatePassword(password);
        if (!pwCheck.ok) {
          return res.status(400).json({ message: pwCheck.message });
        }
      }

      const result = await completePhoneUserProfile({
        userId,
        email: email || null,
        password: password || null,
        firstName: firstName || null,
        lastName: lastName || null,
      });

      if (!result.ok) {
        return res.status(result.status).json({ message: result.message });
      }

      let emailSent = false;
      if (result.emailChanged && result.user.email) {
        const emailResult = await sendVerificationEmail(result.user.id, result.user.email).catch(
          (err) => {
            console.error("[phoneRegistration] verification email failed:", err);
            return { success: false as const, error: "send failed" };
          },
        );
        emailSent = emailResult.success;
      }

      // /api/auth/user يُخزَّن 60 ثانية — يجب إبطاله ليرى الحارس الحالة الجديدة فورًا.
      memoryCache.delete(`auth-user:${userId}`);

      return res.json({
        message: emailSent
          ? "تم حفظ بياناتك. أرسلنا رابط تحقق إلى بريدك الإلكتروني."
          : "تم حفظ بياناتك بنجاح",
        emailSent,
        user: {
          id: result.user.id,
          email: result.user.email,
          firstName: result.user.firstName,
          lastName: result.user.lastName,
          emailVerified: result.user.emailVerified,
          isProfileComplete: result.user.isProfileComplete,
        },
      });
    } catch (error) {
      console.error("[phoneRegistration] complete-profile error:", error);
      return res.status(500).json({ message: "خطأ داخلي في الخادم" });
    }
  },
);

export default router;
