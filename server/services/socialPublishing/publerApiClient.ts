// عميل Publer — وسيلة نقل بديلة لمنصة X (وغيرها لاحقاً) عبر Publer API:
// مفتاح API + معرف workspace بدل OAuth، والحسابات تُربط من لوحة Publer.
// العمليات غير متزامنة: النشر والرفع من URL يعيدان job_id يُستطلع عبر
// GET /job_status/{id} حتى complete/failed.
//
// عقود مهمة (وثائق Publer، https://publer.com/docs — 2026-09):
// - النشر الفوري: POST /posts/schedule/publish بـ bulk.state="scheduled"
//   وبدون scheduled_at (جدولتنا الداخلية تبقى الحاكمة — لا نفوضها لPubler).
// - GET /job_status/{id} عند الاكتمال: { status, payload: { failures } }.
//   الوثائق لا تضع فيه رابط المنشور ولا معرف التغريدة. إن ظهر post_link
//   لاحقاً داخل الحمولة نقبله، وإلا فالمصدر هو GET /posts.
// - GET /posts → PostSummary.post_link = رابط المنشور على الشبكة بعد النشر
//   (يبقى null وهو مجدول). الحقل url رابط المحتوى المرفق (الخبر) لا التغريدة.
//   معرف الصف id معرف Publer لا معرف التغريدة؛ نستخرج الأخير من /status/{id}.
// - GET /accounts.name اسم عرض. لا حقل username لحساباتنا (username للمتنافسين فقط).
//   social_id معرف المنصة الرقمي لا @handle. لا نبني رابطاً من اسم العرض.
// - مهلة استطلاع job_status بعد إرسال النشر خطأ «دائم» عمداً: الحالة مجهولة
//   وقد يكون المنشور صدر — إعادة المحاولة الآلية تخاطر بالتكرار.
// - تعذر حل post_link لا يُفشل منشوراً صدر. الرابط يُستكمل باستطلاع قصير ثم
//   عند قراءة واجهة البوت. المؤقت: https://x.com/{handle} أو null.
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { socialPlatformAccounts, type SocialPlatformAccount } from "@shared/schema";
import { sanitizeSecretText } from "./tokenCrypto";
import {
  SocialProviderError,
  type ProviderIdentity,
  type ProviderPostResult,
  type SocialPublishProvider,
} from "./types";

const PUBLER_API_BASE = "https://app.publer.com/api/v1";
const DEFAULT_TIMEOUT_MS = 15_000;
const MEDIA_TIMEOUT_MS = 60_000;
/** استطلاع المهمة: كل ثانيتين حتى 90 ثانية افتراضياً */
const JOB_POLL_INTERVAL_MS = 2_000;
const JOB_POLL_TIMEOUT_MS = 90_000;

export function publerConfigured(): boolean {
  return Boolean(process.env.PUBLER_API_KEY && process.env.PUBLER_WORKSPACE_ID);
}

/** وسيلة النقل الفعالة لمنصة X — publer عند التهيئة والاختيار الصريح */
export function activeSocialTransport(): "x_api" | "publer" {
  return process.env.SOCIAL_PUBLISH_TRANSPORT === "publer" && publerConfigured()
    ? "publer"
    : "x_api";
}

function publerHeaders(): Record<string, string> {
  const apiKey = process.env.PUBLER_API_KEY;
  const workspaceId = process.env.PUBLER_WORKSPACE_ID;
  if (!apiKey || !workspaceId) {
    throw new SocialProviderError(
      "تكامل Publer غير مهيأ — PUBLER_API_KEY / PUBLER_WORKSPACE_ID مفقودان",
      { retryable: false },
    );
  }
  return {
    Authorization: `Bearer-API ${apiKey}`,
    "Publer-Workspace-Id": workspaceId,
  };
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
      throw new SocialProviderError(`مهلة الاتصال بـ Publer (${timeoutMs}ms)`, { retryable: true });
    }
    throw new SocialProviderError(
      sanitizeSecretText(`تعذر الاتصال بـ Publer: ${err?.message || "network error"}`),
      { retryable: true },
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * يصنف استجابة Publer الفاشلة: 429/5xx مؤقتة، والبقية دائمة.
 * 401/403 هنا خلل مفتاح/خطة (وليس اعتماد حساب اجتماعي) — لا نعلّم الحساب
 * expired حتى لا يُطالَب المستخدم بإعادة ربط لا علاقة لها بالمشكلة.
 */
async function toPublerError(res: Response, phase: string): Promise<SocialProviderError> {
  let detail = "";
  try {
    const body = await res.json();
    detail = body?.error ?? body?.message ?? body?.errors?.[0]?.message ?? "";
    if (typeof detail !== "string") detail = JSON.stringify(detail);
  } catch {
    // جسم غير JSON — نكتفي بالحالة
  }
  const hint =
    res.status === 401 || res.status === 403
      ? " — تحقق من PUBLER_API_KEY وخطة Business وworkspace"
      : "";
  return new SocialProviderError(
    sanitizeSecretText(`Publer ${phase} فشل (HTTP ${res.status})${detail ? `: ${detail}` : ""}${hint}`),
    { httpStatus: res.status, retryable: res.status === 429 || res.status >= 500 },
  );
}

async function publerFetch(
  path: string,
  init: RequestInit,
  phase: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<any> {
  const res = await fetchWithTimeout(
    `${PUBLER_API_BASE}${path}`,
    { ...init, headers: { ...(init.headers as Record<string, string>), ...publerHeaders() } },
    timeoutMs,
  );
  if (!res.ok) throw await toPublerError(res, phase);
  return res.json();
}

// ── الحسابات ───────────────────────────────────────────────────────

export interface PublerAccount {
  id: string;
  provider: string; // "twitter" | "facebook" | …
  name: string;
  socialId: string | null;
  picture: string | null;
  type: string | null;
}

export async function listPublerAccounts(): Promise<PublerAccount[]> {
  const json = await publerFetch("/accounts", { method: "GET" }, "accounts");
  const rows = Array.isArray(json) ? json : Array.isArray(json?.accounts) ? json.accounts : [];
  return rows.map((a: any) => ({
    id: String(a?.id ?? ""),
    provider: String(a?.provider ?? ""),
    name: String(a?.name ?? ""),
    socialId: a?.social_id ? String(a.social_id) : null,
    picture: a?.picture ? String(a.picture) : null,
    type: a?.type ? String(a.type) : null,
  })).filter((a: PublerAccount) => a.id && a.provider);
}

// ── استطلاع المهام ─────────────────────────────────────────────────

export interface PollJobOptions {
  intervalMs?: number;
  timeoutMs?: number;
  /** مهلة الاستطلاع خطأ دائم (نشر) أو مؤقت (وسائط) — الافتراضي دائم */
  timeoutRetryable?: boolean;
}

export async function pollPublerJob(jobId: string, opts: PollJobOptions = {}): Promise<any> {
  const intervalMs = opts.intervalMs ?? JOB_POLL_INTERVAL_MS;
  const timeoutMs = opts.timeoutMs ?? JOB_POLL_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const json = await publerFetch(`/job_status/${encodeURIComponent(jobId)}`, { method: "GET" }, "job_status");
    const status: string = json?.data?.status ?? json?.status ?? "";
    if (status === "complete" || status === "completed") {
      const failures = json?.data?.result?.payload?.failures ?? json?.data?.payload?.failures ?? {};
      if (failures && typeof failures === "object" && Object.keys(failures).length > 0) {
        throw new SocialProviderError(
          sanitizeSecretText(`رفضت Publer/المنصة النشر: ${JSON.stringify(failures)}`),
          { retryable: false },
        );
      }
      return json?.data ?? json;
    }
    if (status === "failed") {
      throw new SocialProviderError(
        sanitizeSecretText(`فشلت مهمة Publer: ${JSON.stringify(json?.data?.result ?? json?.data ?? {})}`),
        { retryable: false },
      );
    }
    if (Date.now() >= deadline) {
      throw new SocialProviderError(
        `انتهت مهلة تأكيد مهمة Publer (${jobId}) — تحقق يدوياً قبل إعادة المحاولة`,
        { retryable: opts.timeoutRetryable ?? false },
      );
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

// ── الوسائط ────────────────────────────────────────────────────────

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
};

/** رفع مباشر multipart (حقل file) — يعيد معرف الوسائط فوراً بلا مهمة */
export async function uploadImageToPubler(image: {
  buffer: Buffer;
  mimeType: string;
}): Promise<string> {
  const form = new FormData();
  const ext = EXT_BY_MIME[image.mimeType] ?? "jpg";
  form.set(
    "file",
    new Blob([new Uint8Array(image.buffer)], { type: image.mimeType }),
    `social-post.${ext}`,
  );
  const json = await publerFetch("/media", { method: "POST", body: form }, "media upload", MEDIA_TIMEOUT_MS);
  const mediaId: string | undefined = json?.id ?? json?.data?.id;
  if (!mediaId) {
    throw new SocialProviderError("استجابة رفع الوسائط لدى Publer بلا معرف", { retryable: false });
  }
  return String(mediaId);
}

/**
 * رفع فيديو من رابط عام عبر POST /media/from-url — غير متزامن:
 * يعيد job_id ثم نستطلع حتى الاكتمال ونستخرج معرف الوسائط من الحمولة.
 * مهلة أطول (المعالجة قد تطول) وقابلة لإعادة المحاولة — لا منشور صدر بعد.
 */
export async function uploadVideoToPublerFromUrl(
  url: string,
  opts: PollJobOptions = {},
): Promise<string> {
  const json = await publerFetch(
    "/media/from-url",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ media: [{ url }], type: "single", in_library: false }),
    },
    "media from-url",
    MEDIA_TIMEOUT_MS,
  );
  const jobId: string | undefined = json?.data?.job_id ?? json?.job_id;
  if (!jobId) {
    throw new SocialProviderError("استجابة رفع الفيديو لدى Publer بلا job_id", { retryable: false });
  }
  const data = await pollPublerJob(String(jobId), {
    intervalMs: opts.intervalMs ?? 3_000,
    timeoutMs: opts.timeoutMs ?? 5 * 60 * 1000,
    timeoutRetryable: opts.timeoutRetryable ?? true,
  });
  const mediaId = extractMediaIdFromJobPayload(data);
  if (!mediaId) {
    throw new SocialProviderError(
      "اكتملت مهمة رفع الفيديو لكن تعذر استخراج معرف الوسائط من استجابة Publer",
      { retryable: false },
    );
  }
  return mediaId;
}

/** يبحث دفاعياً عن معرف الوسائط في حمولة المهمة — أشكال Publer غير موثقة بدقة */
export function extractMediaIdFromJobPayload(data: any): string | null {
  const payload = data?.result?.payload ?? data?.payload ?? data;
  const candidates = [
    payload?.media?.[0]?.id,
    payload?.media?.[0]?._id,
    payload?.ids?.[0],
    payload?.id,
    Array.isArray(payload) ? payload[0]?.id : undefined,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.length > 0) return c;
    if (typeof c === "number") return String(c);
  }
  return null;
}

// ── النشر ──────────────────────────────────────────────────────────

export interface PublerCreatePostInput {
  text: string;
  mediaIds?: string[];
  videoMediaId?: string;
  pollOptions?: PollJobOptions;
}

/**
 * نشر فوري لحساب X واحد عبر Publer. bulk.state="scheduled" بدون
 * scheduled_at = نشر فوري وفق الوثائق. يعيد job_id بعد اكتمال المهمة.
 */
export async function publishToPublerAccount(
  publerAccountId: string,
  input: PublerCreatePostInput,
): Promise<{ jobId: string; job: unknown }> {
  const hasImages = Boolean(input.mediaIds && input.mediaIds.length > 0);
  const hasVideo = Boolean(input.videoMediaId);
  const network: Record<string, unknown> = {
    type: hasVideo ? "video" : hasImages ? "photo" : "status",
    text: input.text,
  };
  if (hasVideo) {
    network.media = [{ id: input.videoMediaId, type: "video" }];
  } else if (hasImages) {
    network.media = input.mediaIds!.map((id) => ({ id, type: "image" }));
  }
  const body = {
    bulk: {
      state: "scheduled",
      posts: [
        {
          networks: { twitter: network },
          accounts: [{ id: publerAccountId }],
        },
      ],
    },
  };
  const json = await publerFetch(
    "/posts/schedule/publish",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    "publish",
  );
  const jobId: string | undefined = json?.data?.job_id ?? json?.job_id;
  if (!jobId) {
    throw new SocialProviderError("استجابة النشر لدى Publer بلا job_id", { retryable: false });
  }
  const job = await pollPublerJob(String(jobId), input.pollOptions);
  return { jobId: String(jobId), job };
}

const X_HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;
/** استطلاع post_link بعد اكتمال المهمة: قصير ومحدود حتى لا نطوّل النشر */
const POST_LINK_POLL_ATTEMPTS = 3;
const POST_LINK_POLL_INTERVAL_MS = 2_000;
const POST_LINK_LOOKUP_TIMEOUT_MS = 8_000;

export interface ResolvedXStatus {
  /** الرقم في /status/ — معرف التغريدة لا معرف Publer */
  tweetId: string;
  statusUrl: string;
  handle: string;
}

/** يقبل رابط حالة X/Twitter فقط. اسم العرض ومسار الملف وروابط الأخبار تُرفض. */
export function parseXStatusUrl(raw: string | null | undefined): ResolvedXStatus | null {
  if (!raw || typeof raw !== "string") return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (host !== "x.com" && host !== "twitter.com") return null;
  const match = url.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/status\/(\d+)\/?$/);
  if (!match) return null;
  const handle = match[1];
  const tweetId = match[2];
  return {
    handle,
    tweetId,
    statusUrl: `https://x.com/${handle}/status/${tweetId}`,
  };
}

/**
 * رابط ملف الحساب. المعرف يجب أن يطابق شكل @handle في X.
 * اسم العرض (عربي، مسافات، أطول من 15) يعيد null — لا يُصنع منه رابط.
 */
export function xProfileUrlFromHandle(handle: string | null | undefined): string | null {
  const cleaned = (handle ?? "").trim().replace(/^@/, "");
  if (!X_HANDLE_RE.test(cleaned)) return null;
  return `https://x.com/${cleaned}`;
}

/** منشور Publer نُشر ولم يُحفظ له رابط /status/ بعد. المعرف المؤقت `publer:<jobId>`. */
export function needsPublerStatusBackfill(post: {
  status: string;
  externalPostId?: string | null;
  externalPostUrl?: string | null;
}): boolean {
  if (post.status !== "published") return false;
  if (parseXStatusUrl(post.externalPostUrl)) return false;
  return typeof post.externalPostId === "string" && post.externalPostId.startsWith("publer:");
}

export function buildPublerExternalRef(input: {
  jobId: string;
  handle: string | null | undefined;
  resolved: ResolvedXStatus | null;
}): ProviderPostResult {
  if (input.resolved) {
    return {
      externalPostId: input.resolved.tweetId,
      externalPostUrl: input.resolved.statusUrl,
    };
  }
  return {
    externalPostId: `publer:${input.jobId}`,
    externalPostUrl: xProfileUrlFromHandle(input.handle),
  };
}

function publishedPostNeedle(text: string): string {
  return text.trim().slice(0, 80);
}

function rowTextStartsWith(row: unknown, needle: string): boolean {
  if (!needle || !row || typeof row !== "object") return false;
  const value = (row as { text?: unknown }).text;
  return typeof value === "string" && value.trim().startsWith(needle);
}

/**
 * post_link هو رابط الشبكة. url في نفس الكائن رابط المحتوى (الخبر)
 * ولا يُعتمد إلا إذا كان هو نفسه رابط status.
 */
function statusFromPostFields(row: unknown): ResolvedXStatus | null {
  if (!row || typeof row !== "object") return null;
  const record = row as { post_link?: unknown; url?: unknown };
  if (typeof record.post_link === "string") {
    const fromLink = parseXStatusUrl(record.post_link);
    if (fromLink) return fromLink;
  }
  if (typeof record.url === "string") return parseXStatusUrl(record.url);
  return null;
}

export function matchPublishedXStatus(rows: readonly unknown[], text: string): ResolvedXStatus | null {
  const needle = publishedPostNeedle(text);
  if (!needle) return null;
  for (const row of rows) {
    if (!rowTextStartsWith(row, needle)) continue;
    const status = statusFromPostFields(row);
    if (status) return status;
  }
  return null;
}

/** يمشي حمولة job_status بحثاً عن post_link/url بصيغة status. النصوص الحرة لا تُمسح. */
export function findXStatusInJobPayload(data: unknown, depth = 0): ResolvedXStatus | null {
  if (depth > 8 || data == null || typeof data !== "object") return null;
  if (Array.isArray(data)) {
    for (const item of data) {
      const hit = findXStatusInJobPayload(item, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  const fromFields = statusFromPostFields(data);
  if (fromFields) return fromFields;
  for (const value of Object.values(data as Record<string, unknown>)) {
    if (value && typeof value === "object") {
      const hit = findXStatusInJobPayload(value, depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}

function postRowsFromResponse(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  if (json && typeof json === "object") {
    const record = json as { posts?: unknown; data?: unknown };
    if (Array.isArray(record.posts)) return record.posts;
    if (Array.isArray(record.data)) return record.data;
  }
  return [];
}

function publishedPostsPath(accountId: string, page: number, query?: string): string {
  const base = `/posts?state[]=published_posted&account_ids[]=${encodeURIComponent(accountId)}&page=${page}`;
  if (!query) return base;
  return `${base}&query=${encodeURIComponent(query)}`;
}

async function fetchPublishedRows(
  accountId: string,
  page: number,
  query: string | undefined,
  timeoutMs: number,
): Promise<unknown[] | null> {
  try {
    const json = await publerFetch(
      publishedPostsPath(accountId, page, query),
      { method: "GET" },
      "posts list",
      timeoutMs,
    );
    return postRowsFromResponse(json);
  } catch {
    return null;
  }
}

export interface ResolvePublishedPostLinkOptions {
  timeoutMs?: number;
  /** بحث نصي لمنشور قد لا يكون في الصفحة الأولى بعد مرور الوقت */
  search?: boolean;
}

/**
 * حل رابط الحالة من GET /posts. أي فشل يعيد null ولا يرمي.
 * إن وُجد الصف ومطابق النص بلا post_link نعود فوراً: الرابط لم يُملأ بعد
 * وصفحة تالية لن تخلقه.
 */
export async function resolvePublishedPostLink(
  publerAccountId: string,
  text: string,
  opts: ResolvePublishedPostLinkOptions = {},
): Promise<ResolvedXStatus | null> {
  const timeoutMs = opts.timeoutMs ?? POST_LINK_LOOKUP_TIMEOUT_MS;
  const line = text.trim().split("\n")[0]?.trim() ?? "";
  const query = opts.search && line ? line.slice(0, 60) : undefined;
  const steps: Array<{ page: number; query?: string }> = query
    ? [{ page: 0, query }, { page: 0 }, { page: 1 }]
    : [{ page: 0 }, { page: 1 }];
  for (const step of steps) {
    const rows = await fetchPublishedRows(publerAccountId, step.page, step.query, timeoutMs);
    if (!rows) return null;
    const hit = matchPublishedXStatus(rows, text);
    if (hit) return hit;
    // نتيجة البحث قد تُسقط post_link. التوقف المبكر فقط للقائمة غير المفلترة:
    // الصف موجود والرابط لم يُملأ بعد، وصفحة تالية لن تخلقه.
    if (!step.query && rows.some((row) => rowTextStartsWith(row, publishedPostNeedle(text)))) return null;
  }
  return null;
}

export async function pollPublishedPostLink(
  publerAccountId: string,
  text: string,
  opts: { attempts?: number; intervalMs?: number; timeoutMs?: number } = {},
): Promise<ResolvedXStatus | null> {
  const attempts = Math.max(1, opts.attempts ?? POST_LINK_POLL_ATTEMPTS);
  const intervalMs = opts.intervalMs ?? POST_LINK_POLL_INTERVAL_MS;
  const timeoutMs = opts.timeoutMs ?? POST_LINK_LOOKUP_TIMEOUT_MS;
  for (let i = 0; i < attempts; i++) {
    if (i > 0 && intervalMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    const hit = await resolvePublishedPostLink(publerAccountId, text, { timeoutMs });
    if (hit) return hit;
  }
  return null;
}

/**
 * بعد اكتمال مهمة النشر: رابط الحالة من حمولة المهمة إن وُجد (الوثائق لا تضمنه)،
 * وإلا استطلاع قصير لـ GET /posts. الغياب لا يُفشل النشر: معرف `publer:<jobId>`
 * ورابط ملف الحساب أو null.
 */
export async function resolveExternalRefAfterPublerJob(input: {
  jobId: string;
  job: unknown;
  publerAccountId: string;
  text: string;
  handle: string | null | undefined;
  poll?: { attempts?: number; intervalMs?: number; timeoutMs?: number };
}): Promise<ProviderPostResult> {
  const fromJob = findXStatusInJobPayload(input.job);
  const resolved =
    fromJob ??
    (await pollPublishedPostLink(input.publerAccountId, input.text, input.poll ?? {
      attempts: POST_LINK_POLL_ATTEMPTS,
      intervalMs: POST_LINK_POLL_INTERVAL_MS,
      timeoutMs: POST_LINK_LOOKUP_TIMEOUT_MS,
    }));
  return buildPublerExternalRef({
    jobId: input.jobId,
    handle: input.handle,
    resolved,
  });
}

// ── تطبيق عقد المزود ───────────────────────────────────────────────

async function loadPublerLinkedAccount(accountId: string): Promise<SocialPlatformAccount> {
  const [account] = await db
    .select()
    .from(socialPlatformAccounts)
    .where(eq(socialPlatformAccounts.id, accountId))
    .limit(1);
  if (!account) {
    throw new SocialProviderError("حساب المنصة غير موجود", { retryable: false });
  }
  if (account.status !== "connected" || !account.externalAccountId) {
    throw new SocialProviderError(
      "حساب X غير مزامَن من Publer — استخدم «مزامنة حسابات Publer» في صفحة النشر الاجتماعي",
      { retryable: false },
    );
  }
  return account;
}

export const publerProvider: SocialPublishProvider = {
  platform: "x",

  async verifyIdentity(accountId: string): Promise<ProviderIdentity> {
    const account = await loadPublerLinkedAccount(accountId);
    const accounts = await listPublerAccounts();
    const match = accounts.find((a) => a.id === account.externalAccountId);
    if (!match) {
      throw new SocialProviderError(
        "حساب X لم يعد موجوداً في workspace لدى Publer — أعد المزامنة",
        { retryable: false, credentialsInvalid: true },
      );
    }
    return {
      externalAccountId: match.id,
      handle: account.handle ?? "",
      displayName: match.name,
    };
  },

  async uploadImage(accountId, image): Promise<string> {
    await loadPublerLinkedAccount(accountId);
    return uploadImageToPubler(image);
  },

  async uploadVideoFromUrl(accountId, url): Promise<string> {
    await loadPublerLinkedAccount(accountId);
    return uploadVideoToPublerFromUrl(url);
  },

  async createPost(accountId, input): Promise<ProviderPostResult> {
    const account = await loadPublerLinkedAccount(accountId);
    const { jobId, job } = await publishToPublerAccount(account.externalAccountId!, {
      text: input.text,
      mediaIds: input.mediaIds,
      videoMediaId: input.videoMediaId,
    });
    // المنشور صدر — غياب post_link لا يُفشل النشر ولا يُصنع رابط من اسم العرض
    const result = await resolveExternalRefAfterPublerJob({
      jobId,
      job,
      publerAccountId: account.externalAccountId!,
      text: input.text,
      handle: account.handle,
    });
    if (!parseXStatusUrl(result.externalPostUrl)) {
      console.warn(
        `[SocialPublish] Publer job ${jobId} اكتمل دون رابط status — externalPostUrl معلّق حتى يظهر post_link`,
      );
    }
    return result;
  },
};
