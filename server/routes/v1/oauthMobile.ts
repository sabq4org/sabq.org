import { Router, Request, Response } from "express";
import crypto from "crypto";
import { OAuth2Client } from "google-auth-library";
import appleSignin from "apple-signin-auth";
import { eq, or } from "drizzle-orm";
import {
  users,
  appMemberSessions,
  canUserLogin,
  getUserStatusMessage,
} from "@shared/schema";
import { db } from "../../db";

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
  return [
    process.env.APPLE_CLIENT_ID,
    process.env.APPLE_IOS_BUNDLE_ID,
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
      .where(or(eq(users.googleId, googleId), eq(users.email, email)))
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
    const {
      identityToken,
      fullName,
      email: bodyEmail,
      deviceInfo,
    } = (req.body ?? {}) as {
      identityToken?: string;
      fullName?: { firstName?: string; lastName?: string };
      email?: string;
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

    const rawEmail = (verified.email ?? bodyEmail ?? "").toLowerCase().trim();
    const isPrivateRelay =
      typeof verified.is_private_email === "string"
        ? verified.is_private_email === "true"
        : Boolean(verified.is_private_email);

    const firstName = fullName?.firstName?.trim() ?? "";
    const lastName = fullName?.lastName?.trim() ?? "";

    let existing: typeof users.$inferSelect | undefined;
    [existing] = await db
      .select()
      .from(users)
      .where(eq(users.appleId, appleId))
      .limit(1);

    if (!existing && rawEmail && !isPrivateRelay) {
      [existing] = await db
        .select()
        .from(users)
        .where(eq(users.email, rawEmail))
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

export default router;
