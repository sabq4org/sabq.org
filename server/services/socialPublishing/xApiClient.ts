// عميل منصة X (Twitter سابقاً) — OAuth 2.0 Authorization Code + PKCE،
// تجديد التوكن بالتناوب (refresh tokens أحادية الاستخدام)، رفع الوسائط
// المجزأ (INIT/APPEND/FINALIZE)، وإنشاء المنشور عبر POST /2/tweets.
//
// المتطلبات (وثائق X كما في 2026-08): scopes = tweet.read tweet.write
// users.read media.write offline.access. النشر البرمجي يتطلب خطة مدفوعة
// أو pay-per-use — راجع docs/setup/X_PUBLISHING_SETUP_AR.md.
import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { socialPlatformAccounts, type SocialPlatformAccount } from "@shared/schema";
import {
  decryptCredentials,
  encryptCredentials,
  sanitizeSecretText,
  type SocialAccountCredentials,
} from "./tokenCrypto";
import {
  SocialProviderError,
  type ProviderIdentity,
  type ProviderPostResult,
  type SocialPublishProvider,
} from "./types";

const X_AUTHORIZE_URL = "https://x.com/i/oauth2/authorize";
const X_TOKEN_URL = "https://api.x.com/2/oauth2/token";
const X_REVOKE_URL = "https://api.x.com/2/oauth2/revoke";
const X_API_BASE = "https://api.x.com/2";
export const X_OAUTH_SCOPES = "tweet.read tweet.write users.read media.write offline.access";

const DEFAULT_TIMEOUT_MS = 15_000;
const MEDIA_TIMEOUT_MS = 45_000;
/** نجدد قبل الانتهاء بخمس دقائق */
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

export function xOAuthConfigured(): boolean {
  return Boolean(process.env.X_CLIENT_ID && process.env.X_CLIENT_SECRET);
}

function requireClientConfig(): { clientId: string; clientSecret: string } {
  const clientId = process.env.X_CLIENT_ID;
  const clientSecret = process.env.X_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new SocialProviderError("تكامل X غير مهيأ — X_CLIENT_ID / X_CLIENT_SECRET مفقودان", {
      retryable: false,
    });
  }
  return { clientId, clientSecret };
}

function basicAuthHeader(): string {
  const { clientId, clientSecret } = requireClientConfig();
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal, redirect: "error" });
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new SocialProviderError(`مهلة الاتصال بمنصة X (${timeoutMs}ms)`, { retryable: true });
    }
    throw new SocialProviderError(
      sanitizeSecretText(`تعذر الاتصال بمنصة X: ${err?.message || "network error"}`),
      { retryable: true },
    );
  } finally {
    clearTimeout(timer);
  }
}

/** يصنف استجابة X الفاشلة: 429/5xx مؤقتة، 401 اعتماد باطل، والبقية دائمة */
async function toProviderError(res: Response, phase: string): Promise<SocialProviderError> {
  let detail = "";
  let errorCode: string | undefined;
  try {
    const body = await res.json();
    errorCode =
      body?.error ?? body?.errors?.[0]?.code?.toString() ?? body?.reason ?? undefined;
    detail =
      body?.error_description ?? body?.detail ?? body?.errors?.[0]?.message ?? body?.title ?? "";
  } catch {
    // جسم غير JSON — نكتفي بالحالة
  }
  const retryable = res.status === 429 || res.status >= 500;
  const credentialsInvalid = res.status === 401;
  return new SocialProviderError(
    sanitizeSecretText(`X ${phase} فشل (HTTP ${res.status})${detail ? `: ${detail}` : ""}`),
    { httpStatus: res.status, errorCode, retryable, credentialsInvalid },
  );
}

// ── OAuth: بدء الربط والتبادل ──────────────────────────────────────

export interface XOAuthStart {
  authorizeUrl: string;
  state: string;
  codeVerifier: string;
}

export function buildAuthorizeRequest(redirectUri: string): XOAuthStart {
  const { clientId } = requireClientConfig();
  const state = crypto.randomBytes(24).toString("base64url");
  const codeVerifier = crypto.randomBytes(48).toString("base64url");
  const challenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: X_OAUTH_SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return { authorizeUrl: `${X_AUTHORIZE_URL}?${params.toString()}`, state, codeVerifier };
}

interface XTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
}

async function requestToken(body: URLSearchParams): Promise<XTokenResponse> {
  const res = await fetchWithTimeout(X_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuthHeader(),
    },
    body: body.toString(),
  });
  if (!res.ok) throw await toProviderError(res, "token");
  const json = (await res.json()) as XTokenResponse;
  if (!json.access_token) {
    throw new SocialProviderError("استجابة توكن X بلا access_token", { retryable: false });
  }
  return json;
}

export async function exchangeAuthorizationCode(input: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<{ credentials: SocialAccountCredentials; expiresAt: Date | null }> {
  const { clientId } = requireClientConfig();
  const json = await requestToken(
    new URLSearchParams({
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: input.redirectUri,
      client_id: clientId,
      code_verifier: input.codeVerifier,
    }),
  );
  return {
    credentials: {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      tokenType: json.token_type,
      scope: json.scope,
    },
    expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : null,
  };
}

export async function revokeAccessToken(token: string): Promise<void> {
  const { clientId } = requireClientConfig();
  try {
    await fetchWithTimeout(X_REVOKE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: basicAuthHeader(),
      },
      body: new URLSearchParams({ token, client_id: clientId }).toString(),
    });
  } catch {
    // أفضل جهد — فك الربط محلياً يمضي حتى لو فشل الإبطال
  }
}

// ── إدارة التوكن للحساب المخزن ─────────────────────────────────────

async function loadAccount(accountId: string): Promise<SocialPlatformAccount> {
  const [account] = await db
    .select()
    .from(socialPlatformAccounts)
    .where(eq(socialPlatformAccounts.id, accountId))
    .limit(1);
  if (!account) {
    throw new SocialProviderError("حساب المنصة غير موجود", { retryable: false });
  }
  if (account.status !== "connected") {
    throw new SocialProviderError(
      `حساب X غير متصل (الحالة: ${account.status}) — أعد ربط الحساب`,
      { retryable: false, credentialsInvalid: true },
    );
  }
  return account;
}

async function markAccountExpired(accountId: string): Promise<void> {
  await db
    .update(socialPlatformAccounts)
    .set({ status: "expired", updatedAt: new Date() })
    .where(eq(socialPlatformAccounts.id, accountId));
}

// single-flight للتجديد — refresh tokens أحادية الاستخدام لدى X،
// وتجديدان متوازيان يُبطل أحدهما الآخر
const refreshInFlight = new Map<string, Promise<string>>();

async function doRefresh(account: SocialPlatformAccount, creds: SocialAccountCredentials): Promise<string> {
  const { clientId } = requireClientConfig();
  if (!creds.refreshToken) {
    await markAccountExpired(account.id);
    throw new SocialProviderError("انتهت صلاحية اعتماد X ولا يوجد refresh token — أعد ربط الحساب", {
      retryable: false,
      credentialsInvalid: true,
    });
  }
  let json: XTokenResponse;
  try {
    json = await requestToken(
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: creds.refreshToken,
        client_id: clientId,
      }),
    );
  } catch (err) {
    if (err instanceof SocialProviderError && !err.opts.retryable) {
      await markAccountExpired(account.id);
      throw new SocialProviderError("رفضت X تجديد التوكن — أعد ربط الحساب", {
        httpStatus: err.opts.httpStatus,
        retryable: false,
        credentialsInvalid: true,
      });
    }
    throw err;
  }
  const rotated: SocialAccountCredentials = {
    accessToken: json.access_token,
    // X يناوب refresh token — احفظ الجديد وإلا فقدنا الحساب عند أول تجديد تالٍ
    refreshToken: json.refresh_token ?? creds.refreshToken,
    tokenType: json.token_type,
    scope: json.scope ?? creds.scope,
  };
  await db
    .update(socialPlatformAccounts)
    .set({
      credentialsEncrypted: encryptCredentials(rotated),
      tokenExpiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : null,
      lastVerifiedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(socialPlatformAccounts.id, account.id));
  return rotated.accessToken;
}

async function getFreshAccessToken(accountId: string): Promise<string> {
  const account = await loadAccount(accountId);
  if (!account.credentialsEncrypted) {
    throw new SocialProviderError("لا توجد بيانات اعتماد محفوظة للحساب — أعد ربط الحساب", {
      retryable: false,
      credentialsInvalid: true,
    });
  }
  const creds = decryptCredentials(account.credentialsEncrypted);
  if (!creds) {
    throw new SocialProviderError(
      "تعذر فك تشفير اعتماد الحساب (تغيّر SOCIAL_PUBLISH_TOKEN_SECRET؟) — أعد ربط الحساب",
      { retryable: false, credentialsInvalid: true },
    );
  }
  const expiresAt = account.tokenExpiresAt ? account.tokenExpiresAt.getTime() : 0;
  const needsRefresh = !expiresAt || expiresAt - Date.now() < TOKEN_REFRESH_MARGIN_MS;
  if (!needsRefresh) return creds.accessToken;

  const existing = refreshInFlight.get(accountId);
  if (existing) return existing;
  const promise = doRefresh(account, creds).finally(() => refreshInFlight.delete(accountId));
  refreshInFlight.set(accountId, promise);
  return promise;
}

// ── عمليات API ─────────────────────────────────────────────────────

async function xApiFetch(
  accountId: string,
  path: string,
  init: RequestInit,
  phase: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<any> {
  const accessToken = await getFreshAccessToken(accountId);
  const res = await fetchWithTimeout(
    `${X_API_BASE}${path}`,
    {
      ...init,
      headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${accessToken}` },
    },
    timeoutMs,
  );
  if (!res.ok) {
    const err = await toProviderError(res, phase);
    if (err.opts.credentialsInvalid) await markAccountExpired(accountId);
    throw err;
  }
  return res.json();
}

async function verifyIdentity(accountId: string): Promise<ProviderIdentity> {
  const json = await xApiFetch(accountId, "/users/me", { method: "GET" }, "users/me");
  const user = json?.data;
  if (!user?.id) {
    throw new SocialProviderError("استجابة هوية X غير متوقعة", { retryable: false });
  }
  return { externalAccountId: user.id, handle: user.username ?? "", displayName: user.name ?? "" };
}

/** هوية عبر توكن مباشر — تُستخدم أثناء الربط قبل حفظ الحساب */
export async function fetchIdentityWithToken(accessToken: string): Promise<ProviderIdentity> {
  const res = await fetchWithTimeout(`${X_API_BASE}/users/me`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw await toProviderError(res, "users/me");
  const json = await res.json();
  const user = json?.data;
  if (!user?.id) {
    throw new SocialProviderError("استجابة هوية X غير متوقعة", { retryable: false });
  }
  return { externalAccountId: user.id, handle: user.username ?? "", displayName: user.name ?? "" };
}

const MEDIA_SEGMENT_BYTES = 4 * 1024 * 1024; // < 5MB لكل مقطع وفق وثائق X

async function uploadImage(
  accountId: string,
  image: { buffer: Buffer; mimeType: string },
): Promise<string> {
  // INIT
  const initForm = new FormData();
  initForm.set("command", "INIT");
  initForm.set("total_bytes", String(image.buffer.length));
  initForm.set("media_type", image.mimeType);
  initForm.set("media_category", "tweet_image");
  const initJson = await xApiFetch(
    accountId,
    "/media/upload",
    { method: "POST", body: initForm },
    "media INIT",
    MEDIA_TIMEOUT_MS,
  );
  const mediaId: string | undefined =
    initJson?.data?.id ?? initJson?.data?.media_id_string ?? initJson?.media_id_string;
  if (!mediaId) {
    throw new SocialProviderError("استجابة INIT للوسائط بلا media_id", { retryable: false });
  }

  // APPEND — مقاطع متسلسلة
  for (let segment = 0; segment * MEDIA_SEGMENT_BYTES < image.buffer.length; segment++) {
    const chunk = image.buffer.subarray(
      segment * MEDIA_SEGMENT_BYTES,
      (segment + 1) * MEDIA_SEGMENT_BYTES,
    );
    const appendForm = new FormData();
    appendForm.set("command", "APPEND");
    appendForm.set("media_id", mediaId);
    appendForm.set("segment_index", String(segment));
    appendForm.set("media", new Blob([new Uint8Array(chunk)], { type: image.mimeType }));
    const accessToken = await getFreshAccessToken(accountId);
    const res = await fetchWithTimeout(
      `${X_API_BASE}/media/upload`,
      { method: "POST", headers: { Authorization: `Bearer ${accessToken}` }, body: appendForm },
      MEDIA_TIMEOUT_MS,
    );
    // APPEND الناجح يرجع 2xx بجسم فارغ غالباً
    if (!res.ok) {
      const err = await toProviderError(res, "media APPEND");
      if (err.opts.credentialsInvalid) await markAccountExpired(accountId);
      throw err;
    }
  }

  // FINALIZE
  const finalizeForm = new FormData();
  finalizeForm.set("command", "FINALIZE");
  finalizeForm.set("media_id", mediaId);
  const finalizeJson = await xApiFetch(
    accountId,
    "/media/upload",
    { method: "POST", body: finalizeForm },
    "media FINALIZE",
    MEDIA_TIMEOUT_MS,
  );
  // الصور لا تحتاج STATUS إلا إذا ظهرت processing_info قيد المعالجة
  const state = finalizeJson?.data?.processing_info?.state ?? finalizeJson?.processing_info?.state;
  if (state && state !== "succeeded") {
    if (state === "failed") {
      throw new SocialProviderError("فشلت معالجة الصورة لدى X", { retryable: false });
    }
    // in_progress/pending — ننتظر مرة واحدة ثم نتحقق
    const waitMs =
      ((finalizeJson?.data?.processing_info?.check_after_secs ??
        finalizeJson?.processing_info?.check_after_secs ??
        2) as number) * 1000;
    await new Promise((r) => setTimeout(r, Math.min(waitMs, 10_000)));
    const statusJson = await xApiFetch(
      accountId,
      `/media/upload?command=STATUS&media_id=${encodeURIComponent(mediaId)}`,
      { method: "GET" },
      "media STATUS",
      MEDIA_TIMEOUT_MS,
    );
    const finalState = statusJson?.data?.processing_info?.state ?? statusJson?.processing_info?.state;
    if (finalState && finalState !== "succeeded") {
      throw new SocialProviderError(`معالجة الصورة لدى X لم تكتمل (${finalState})`, {
        retryable: finalState !== "failed",
      });
    }
  }
  return mediaId;
}

async function createPost(
  accountId: string,
  input: { text: string; mediaIds?: string[] },
): Promise<ProviderPostResult> {
  const payload: Record<string, unknown> = { text: input.text };
  if (input.mediaIds && input.mediaIds.length > 0) {
    payload.media = { media_ids: input.mediaIds };
  }
  const json = await xApiFetch(
    accountId,
    "/tweets",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    "create post",
  );
  const postId: string | undefined = json?.data?.id;
  if (!postId) {
    throw new SocialProviderError("استجابة إنشاء المنشور بلا معرف", { retryable: false });
  }
  const [account] = await db
    .select({ handle: socialPlatformAccounts.handle })
    .from(socialPlatformAccounts)
    .where(eq(socialPlatformAccounts.id, accountId))
    .limit(1);
  const handle = account?.handle;
  return {
    externalPostId: postId,
    externalPostUrl: handle
      ? `https://x.com/${handle}/status/${postId}`
      : `https://x.com/i/web/status/${postId}`,
  };
}

export const xProvider: SocialPublishProvider = {
  platform: "x",
  verifyIdentity,
  uploadImage,
  createPost,
};
