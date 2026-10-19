import appleSignin from "apple-signin-auth";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "@shared/schema";

/**
 * إلغاء رمز «تسجيل الدخول بآبل» عند حذف الحساب (بند أبل 5.1.1(v)).
 *
 * لا نحفظ refresh token لأحد: تطبيق iOS يطلب من آبل تفويضًا جديدًا لحظة
 * الحذف ويرسل `authorizationCode`، فنبادله برمز ثم نلغيه بعد نجاح الحذف.
 * هذا يغطي أيضًا الحسابات التي سجّلت قبل هذا التغيير.
 *
 * يحتاج APPLE_TEAM_ID وAPPLE_KEY_ID وAPPLE_PRIVATE_KEY (مفتاح Sign in with
 * Apple نفسه الذي يستخدمه الويب في server/auth.ts)، ومعرّف العميل هو
 * Bundle ID للتطبيق الذي أصدر الرمز.
 */

function formatPrivateKey(raw: string): string {
  return (raw.includes("\n") ? raw : raw.replace(/\\n/g, "\n")).trim();
}

export function isAppleRevocationConfigured(): boolean {
  return Boolean(process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID && process.env.APPLE_PRIVATE_KEY);
}

function clientSecretFor(clientID: string): string {
  return appleSignin.getClientSecret({
    clientID,
    teamID: process.env.APPLE_TEAM_ID!,
    keyIdentifier: process.env.APPLE_KEY_ID!,
    privateKey: formatPrivateKey(process.env.APPLE_PRIVATE_KEY!),
  });
}

/** Bundle IDs المقبولة كمُصدر للرمز — نفس قائمة التحقق في /auth/apple. */
export function appleClientIds(): string[] {
  const extra = (process.env.APPLE_MOBILE_BUNDLE_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const ids = [
    process.env.APPLE_IOS_BUNDLE_ID,
    process.env.APPLE_SPORTS_BUNDLE_ID,
    process.env.APPLE_GULFCUP_BUNDLE_ID,
    process.env.APPLE_ASIANCUP_BUNDLE_ID,
    ...extra,
    process.env.APPLE_CLIENT_ID,
    "com.sabq.sabqorg",
  ].filter((v): v is string => Boolean(v && v.trim()));
  return Array.from(new Set(ids));
}

export type PreparedAppleRevocation = { clientID: string; refreshToken: string };

/**
 * يبادل رمز التفويض ويتحقق أن صاحبه هو مستخدم آبل نفسه المرتبط بالحساب.
 * يعيد null عند أي فشل — الحذف لا يتوقف على آبل.
 */
export async function prepareAppleRevocation(input: {
  authorizationCode: string;
  clientID: string;
  expectedAppleId: string | null;
}): Promise<PreparedAppleRevocation | null> {
  if (!isAppleRevocationConfigured()) {
    console.warn("[AppleRevoke] APPLE_TEAM_ID/APPLE_KEY_ID/APPLE_PRIVATE_KEY missing — skipping revocation");
    return null;
  }
  try {
    const tokens = await appleSignin.getAuthorizationToken(input.authorizationCode, {
      clientID: input.clientID,
      clientSecret: clientSecretFor(input.clientID),
      redirectUri: "",
    });
    if (!tokens?.refresh_token || !tokens.id_token) {
      console.warn("[AppleRevoke] token exchange returned no refresh token", (tokens as any)?.error ?? "");
      return null;
    }
    const verified = await appleSignin.verifyIdToken(tokens.id_token, { audience: input.clientID });
    if (input.expectedAppleId && verified.sub !== input.expectedAppleId) {
      console.warn("[AppleRevoke] authorization belongs to a different Apple ID — skipping");
      return null;
    }
    return { clientID: input.clientID, refreshToken: tokens.refresh_token };
  } catch (error) {
    console.warn("[AppleRevoke] token exchange failed:", error);
    return null;
  }
}

export async function revokeAppleToken(prepared: PreparedAppleRevocation): Promise<boolean> {
  try {
    await appleSignin.revokeAuthorizationToken(prepared.refreshToken, {
      clientID: prepared.clientID,
      clientSecret: clientSecretFor(prepared.clientID),
      tokenTypeHint: "refresh_token",
    });
    return true;
  } catch (error) {
    console.warn("[AppleRevoke] revoke failed:", error);
    return false;
  }
}

export async function getUserAppleId(userId: string): Promise<string | null> {
  const [row] = await db.select({ appleId: users.appleId }).from(users).where(eq(users.id, userId)).limit(1);
  return row?.appleId ?? null;
}
