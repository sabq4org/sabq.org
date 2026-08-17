import { Router, Request, Response } from "express";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import { OAuth2Client } from "google-auth-library";
import appleSignin from "apple-signin-auth";
import { eq, or, sql } from "drizzle-orm";
import {
  users,
  appMemberSessions,
  canUserLogin,
  getUserStatusMessage,
} from "@shared/schema";
import { db } from "../../db";
import { varaSendOtp, varaVerifyOtp } from "../../services/varaPhoneOtp";
import { normalizePhone, findOrCreatePhoneUser } from "../../services/phoneAuth";
import { createTwoFactorChallenge } from "../../services/mobileTwoFactorChallenge";

const router = Router();

const SESSION_TTL_DAYS = 30;
const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;

const googleClient = new OAuth2Client();

type DeviceInfo = {
  platform?: string;
  osVersion?: string;
  appVersion?: string;
  deviceName?: string;
  deviceId?: string;
};

function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function getGoogleAudiences(): string[] {
  return [
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_IOS_CLIENT_ID,
    process.env.GOOGLE_ANDROID_CLIENT_ID,
  ].filter((v): v is string => Boolean(v && v.trim()));
}

function getAppleAudiences(): string[] {
  const extraBundles = (process.env.APPLE_MOBILE_BUNDLE_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [
    process.env.APPLE_CLIENT_ID,
    process.env.APPLE_IOS_BUNDLE_ID,
    process.env.APPLE_SPORTS_BUNDLE_ID,
    process.env.APPLE_GULFCUP_BUNDLE_ID,
    process.env.APPLE_ASIANCUP_BUNDLE_ID,
    ...extraBundles,
  ].filter((v): v is string => Boolean(v && v.trim()));
}

function buildUserPayload(user: typeof users.$inferSelect) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
    phone: user.phoneNumber ?? null,
    gender: user.gender ?? null,
    city: user.city ?? null,
    country: user.country ?? "SA",
    locale: user.locale ?? "ar",
    emailVerified: user.emailVerified ?? true,
    phoneVerified: user.phoneVerified ?? false,
    role: user.role ?? "reader",
    isProfileComplete: user.isProfileComplete ?? false,
    profileImageUrl: user.profileImageUrl ?? null,
  };
}

async function issueSession(
  userId: string,
  deviceInfo: DeviceInfo | undefined,
  ipAddress: string | undefined,
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.insert(appMemberSessions).values({
    memberId: userId,
    tokenHash,
    deviceInfo: deviceInfo ?? null,
    ipAddress: ipAddress ?? null,
    isActive: true,
    expiresAt,
  });

  return { token, expiresAt };
}

// If the matched account has 2FA enabled, an external identity (Google / Apple /
// SMS) must NOT bypass TOTP (audit #1). Returns true after sending a challenge
// response — callers must `return` immediately. New accounts (twoFactorEnabled
// falsy) proceed to a normal session. Completed via POST /api/v1/auth/verify-2fa.
async function maybeRequireTwoFactor(
  user: { id: string; twoFactorEnabled?: boolean | null },
  res: Response,
): Promise<boolean> {
  if (!user.twoFactorEnabled) return false;
  const challengeToken = await createTwoFactorChallenge(user.id);
  res.status(200).json({
    success: false,
    requires2FA: true,
    challengeToken,
    message: "يرجى إدخال رمز التحقق بخطوتين",
  });
  return true;
}

// MARK: - دخول/تسجيل بالجوال (Twilio Verify) — E.164 دولي (+ أو 00) أو سعودي محلي.
// (التطبيع + إنشاء/ربط المستخدم في services/phoneAuth.ts — مشترك مع الويب.)

// حدّ إرسال الرمز — يحمي من قصف الرسائل والتكلفة: 5 إرسالات/نافذة لكل رقم (أو IP).
const phoneSendLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // ساعة
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  // Custom keyGenerator already falls back to req.ip — disable IPv6 validation noise.
  validate: { keyGeneratorIpFallback: false, ip: false, xForwardedForHeader: false },
  keyGenerator: (req) => {
    const e164 = normalizePhone(req.body?.phone);
    return e164 || req.ip || "unknown";
  },
  message: {
    success: false,
    message: "تجاوزت الحد المسموح لإرسال الرموز. حاول بعد قليل.",
  },
});

router.post("/auth/google", async (req: Request, res: Response) => {
  try {
    const { idToken, deviceInfo } = (req.body ?? {}) as {
      idToken?: string;
      deviceInfo?: DeviceInfo;
    };

    if (!idToken || typeof idToken !== "string") {
      return res.status(400).json({
        success: false,
        message: "idToken مطلوب",
      });
    }

    const audiences = getGoogleAudiences();
    if (audiences.length === 0) {
      console.error("[v1 OAuth] No Google client IDs configured");
      return res.status(503).json({
        success: false,
        message: "Google Sign-In غير مفعّل على الخادم",
      });
    }

    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: audiences,
      });
      payload = ticket.getPayload();
    } catch (err) {
      console.error("[v1 OAuth] Google token verification failed:", err);
      return res.status(401).json({
        success: false,
        message: "فشل التحقق من Google",
      });
    }

    if (!payload?.sub || !payload?.email) {
      return res.status(401).json({
        success: false,
        message: "بيانات Google غير مكتملة",
      });
    }

    if (!payload.email_verified) {
      return res.status(401).json({
        success: false,
        message: "البريد الإلكتروني من Google غير موثّق",
      });
    }

    const googleId = payload.sub;
    const email = payload.email.toLowerCase();
    const firstName = payload.given_name ?? "";
    const lastName = payload.family_name ?? "";
    const profileImageUrl = payload.picture ?? null;

    const [existing] = await db
      .select()
      .from(users)
      // lower(email) لا العمود حرفيًا — الحسابات المخزّنة بأحرف كبيرة يفوّتها
      // الشرط الحرفي فيصطدم الإدراج بقيد users_email_lower_unique
      // (حادثة NODE-EXPRESS-G في نظيره الويب).
      .where(or(eq(users.googleId, googleId), sql`lower(${users.email}) = ${email}`))
      .limit(1);

    let user: typeof users.$inferSelect;

    if (existing) {
      if (!canUserLogin(existing)) {
        return res.status(403).json({
          success: false,
          message:
            getUserStatusMessage(existing) ||
            "لا يمكنك تسجيل الدخول بسبب حالة حسابك",
        });
      }

      const updates: Partial<typeof users.$inferInsert> = {};
      if (!existing.googleId) {
        updates.googleId = googleId;
        updates.authProvider = "google";
      }
      if (Object.keys(updates).length > 0) {
        await db.update(users).set(updates).where(eq(users.id, existing.id));
      }
      user = { ...existing, ...updates };
    } else {
      const { nanoid } = await import("nanoid");
      const newUserId = nanoid();
      const [created] = await db
        .insert(users)
        .values({
          id: newUserId,
          email,
          firstName,
          lastName,
          profileImageUrl,
          role: "reader",
          authProvider: "google",
          googleId,
          emailVerified: true,
          status: "active",
          isProfileComplete: false,
        })
        .returning();
      user = created;
    }

    if (await maybeRequireTwoFactor(user, res)) return;

    const { token, expiresAt } = await issueSession(
      user.id,
      deviceInfo,
      req.ip,
    );

    return res.json({
      success: true,
      message: "تم تسجيل الدخول عبر Google",
      token,
      expiresAt: expiresAt.toISOString(),
      user: buildUserPayload(user),
    });
  } catch (error) {
    console.error("[v1 OAuth] /auth/google unexpected error:", error);
    return res.status(500).json({
      success: false,
      message: "خطأ داخلي في الخادم",
    });
  }
});

router.post("/auth/apple", async (req: Request, res: Response) => {
  try {
    // NOTE: the client may still send `email` — it is deliberately ignored.
    // Only the Apple-signed token may establish identity (see rawEmail below).
    const {
      identityToken,
      fullName,
      deviceInfo,
    } = (req.body ?? {}) as {
      identityToken?: string;
      fullName?: { firstName?: string; lastName?: string };
      deviceInfo?: DeviceInfo;
    };

    if (!identityToken || typeof identityToken !== "string") {
      return res.status(400).json({
        success: false,
        message: "identityToken مطلوب",
      });
    }

    const audiences = getAppleAudiences();
    if (audiences.length === 0) {
      console.error("[v1 OAuth] No Apple audiences configured");
      return res.status(503).json({
        success: false,
        message: "Apple Sign-In غير مفعّل على الخادم",
      });
    }

    let verified: Awaited<ReturnType<typeof appleSignin.verifyIdToken>>;
    try {
      verified = await appleSignin.verifyIdToken(identityToken, {
        audience: audiences as unknown as string,
        ignoreExpiration: false,
      });
    } catch (err) {
      console.error("[v1 OAuth] Apple token verification failed:", err);
      return res.status(401).json({
        success: false,
        message: "فشل التحقق من Apple",
      });
    }

    const appleId = verified.sub;
    if (!appleId) {
      return res.status(401).json({
        success: false,
        message: "بيانات Apple غير مكتملة",
      });
    }

    // SECURITY: identity comes from the Apple-signed token ONLY.
    // The previous `verified.email ?? bodyEmail` fallback was a full account
    // takeover: the attacker runs the client, so they can request an Apple
    // authorization WITHOUT the email scope, receive a genuinely signed token
    // that carries no `email` claim, then name any victim in `req.body.email`.
    // That string was used to match the victim's row, weld the attacker's
    // `appleId` onto it, and mint a 30-day Bearer session for the victim.
    // The web strategy (server/auth.ts) already hard-fails on a missing token
    // email — mobile now behaves the same.
    const rawEmail = (verified.email ?? "").toLowerCase().trim();
    const isPrivateRelay =
      typeof verified.is_private_email === "string"
        ? verified.is_private_email === "true"
        : Boolean(verified.is_private_email);
    // Apple omits `email_verified` on some tokens; only an explicit false is
    // disqualifying. Mirrors the Google handler's check above.
    const emailIsVerified =
      verified.email_verified === undefined
        ? true
        : typeof verified.email_verified === "string"
          ? verified.email_verified === "true"
          : Boolean(verified.email_verified);

    const firstName = fullName?.firstName?.trim() ?? "";
    const lastName = fullName?.lastName?.trim() ?? "";

    let existing: typeof users.$inferSelect | undefined;
    [existing] = await db
      .select()
      .from(users)
      .where(eq(users.appleId, appleId))
      .limit(1);

    // Linking an Apple identity onto an existing account is only safe when
    // Apple itself vouches for the address (verified, not a private relay).
    if (!existing && rawEmail && !isPrivateRelay && emailIsVerified) {
      [existing] = await db
        .select()
        .from(users)
        // lower(email) — كما في مسار Google أعلاه.
        .where(sql`lower(${users.email}) = ${rawEmail}`)
        .limit(1);
    }

    let user: typeof users.$inferSelect;

    if (existing) {
      if (!canUserLogin(existing)) {
        return res.status(403).json({
          success: false,
          message:
            getUserStatusMessage(existing) ||
            "لا يمكنك تسجيل الدخول بسبب حالة حسابك",
        });
      }

      const updates: Partial<typeof users.$inferInsert> = {};
      if (!existing.appleId) {
        updates.appleId = appleId;
        updates.authProvider = "apple";
      }
      if (firstName && lastName && !existing.firstName) {
        updates.firstName = firstName;
        updates.lastName = lastName;
      }
      if (Object.keys(updates).length > 0) {
        await db.update(users).set(updates).where(eq(users.id, existing.id));
      }
      user = { ...existing, ...updates };
    } else {
      if (!rawEmail) {
        return res.status(401).json({
          success: false,
          message: "لم نتمكن من الحصول على البريد الإلكتروني من Apple",
        });
      }

      const { nanoid } = await import("nanoid");
      const newUserId = nanoid();
      const [created] = await db
        .insert(users)
        .values({
          id: newUserId,
          email: rawEmail,
          firstName,
          lastName,
          role: "reader",
          authProvider: "apple",
          appleId,
          emailVerified: true,
          status: "active",
          isProfileComplete: false,
        })
        .returning();
      user = created;
    }

    if (await maybeRequireTwoFactor(user, res)) return;

    const { token, expiresAt } = await issueSession(
      user.id,
      deviceInfo,
      req.ip,
    );

    return res.json({
      success: true,
      message: "تم تسجيل الدخول عبر Apple",
      token,
      expiresAt: expiresAt.toISOString(),
      user: buildUserPayload(user),
    });
  } catch (error) {
    console.error("[v1 OAuth] /auth/apple unexpected error:", error);
    return res.status(500).json({
      success: false,
      message: "خطأ داخلي في الخادم",
    });
  }
});

// إرسال رمز التحقق (SMS) عبر Twilio Verify.
router.post("/auth/phone/send", phoneSendLimiter, async (req: Request, res: Response) => {
  try {
    const e164 = normalizePhone(req.body?.phone);
    if (!e164) {
      return res.status(400).json({
        success: false,
        message: "رقم جوال غير صحيح. أدخل الرقم بصيغة دولية مثل +9665XXXXXXXX.",
      });
    }
    const result = await varaSendOtp(e164);
    return res.status(result.success ? 200 : 502).json(result);
  } catch (error) {
    console.error("[v1 OAuth] /auth/phone/send error:", error);
    return res.status(500).json({ success: false, message: "تعذّر إرسال رمز التحقق" });
  }
});

// حدّ محاولات التحقق — يمنع تخمين رمز SMS/تكرار المطابقة بحساب قائم.
const phoneVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "محاولات كثيرة جدًا. حاول لاحقًا." },
});

// التحقق من الرمز → دخول العضو، وإنشاء حسابه إن لم يكن موجودًا (نفس SSO سبق).
router.post("/auth/phone/verify", phoneVerifyLimiter, async (req: Request, res: Response) => {
  try {
    const e164 = normalizePhone(req.body?.phone);
    const code = String(req.body?.code ?? "").replace(/[^0-9]/g, "");
    if (!e164) {
      return res.status(400).json({ success: false, message: "رقم جوال غير صحيح" });
    }
    if (code.length < 4) {
      return res.status(400).json({ success: false, message: "رمز التحقق غير صحيح" });
    }

    const check = await varaVerifyOtp(e164, code);
    if (!check.valid) {
      return res.status(401).json({ success: false, message: check.message });
    }

    const deviceInfo: DeviceInfo | undefined = req.body?.deviceInfo;

    // البحث عن المستخدم أو إنشاؤه (منطق مشترك مع الويب).
    const result = await findOrCreatePhoneUser(e164);
    if (!result.ok) {
      return res.status(result.status).json({ success: false, message: result.message });
    }
    const user = result.user;

    // 2FA gate — SMS alone must not bypass TOTP on an existing account (SIM-swap).
    if (await maybeRequireTwoFactor(user, res)) return;

    const { token, expiresAt } = await issueSession(user.id, deviceInfo, req.ip);

    return res.json({
      success: true,
      message: "تم تسجيل الدخول عبر الجوال",
      token,
      expiresAt: expiresAt.toISOString(),
      user: buildUserPayload(user),
    });
  } catch (error) {
    console.error("[v1 OAuth] /auth/phone/verify error:", error);
    return res.status(500).json({ success: false, message: "خطأ داخلي في الخادم" });
  }
});

export default router;
