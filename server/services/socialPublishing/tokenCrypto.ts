// تشفير بيانات اعتماد حسابات النشر الاجتماعي — AES-256-GCM بمفتاح مشتق من
// SOCIAL_PUBLISH_TOKEN_SECRET (وإلا SESSION_SECRET كاحتياط).
// الصيغة: v1:<iv>:<tag>:<ciphertext> base64 — نفس نمط staffProfileService.
import crypto from "crypto";

export interface SocialAccountCredentials {
  accessToken: string;
  refreshToken?: string;
  tokenType?: string;
  scope?: string;
}

function cryptoKey(): Buffer | null {
  const secret = process.env.SOCIAL_PUBLISH_TOKEN_SECRET || process.env.SESSION_SECRET;
  if (!secret) return null;
  return crypto.createHash("sha256").update(`sabq-social-publish:${secret}`).digest();
}

export function encryptCredentials(creds: SocialAccountCredentials): string {
  const key = cryptoKey();
  if (!key) {
    throw new Error("SOCIAL_PUBLISH_TOKEN_SECRET غير مضبوط — لا يمكن حفظ بيانات اعتماد الحساب");
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plain = JSON.stringify(creds);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

export function decryptCredentials(encrypted: string): SocialAccountCredentials | null {
  const key = cryptoKey();
  if (!key) return null;
  try {
    const [version, ivB64, tagB64, ctB64] = encrypted.split(":");
    if (version !== "v1") return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(ctB64, "base64")),
      decipher.final(),
    ]).toString("utf8");
    const parsed = JSON.parse(plain);
    if (!parsed || typeof parsed.accessToken !== "string") return null;
    return parsed as SocialAccountCredentials;
  } catch {
    return null;
  }
}

/** ينظف أي نص خطأ من التوكنات/الأسرار قبل تخزينه أو عرضه */
export function sanitizeSecretText(input: string, maxLength = 500): string {
  return input
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/(access_token|refresh_token|client_secret|code_verifier)=[^&\s"']+/gi, "$1=[redacted]")
    .replace(/"(access_token|refresh_token|client_secret)"\s*:\s*"[^"]*"/gi, '"$1":"[redacted]"')
    .slice(0, maxLength);
}
