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

/**
 * أي رابط حالة على x.com أو twitter.com (مع www/mobile، استعلام، أو مسار زائد
 * مثل /photo/1). يُستخرج معرف التغريدة الرقمي. اسم العرض ومسار الملف وروابط الأخبار تُرفض.
 */
export function parseXStatusUrl(raw: string | null | undefined): ResolvedXStatus | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    try {
      url = new URL(`https://${trimmed}`);
    } catch {
      return null;
    }
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase().replace(/^(www|mobile)\./, "");
  if (host !== "x.com" && host !== "twitter.com") return null;
  const statusMatch = url.pathname.match(/\/status\/(\d+)/);
  if (!statusMatch) return null;
  const tweetId = statusMatch[1];
  const handleMatch = url.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/status\/(\d+)/);
  if (handleMatch && handleMatch[2] === tweetId) {
    return {
      handle: handleMatch[1],
      tweetId,
      statusUrl: `https://x.com/${handleMatch[1]}/status/${tweetId}`,
    };
  }
  return {
    handle: "",
    tweetId,
    statusUrl: `https://x.com/i/web/status/${tweetId}`,
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

const MIN_TEXT_SIGNAL = 12;

function collapseWs(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/** السطر الأول من النص المنشور، بلا رابط الخبر إن كان ملحقاً في نهايته. */
function tweetBody(text: string, linkUrl?: string | null): string {
  const line = text.trim().split("\n")[0]?.trim() ?? "";
  const link = (linkUrl ?? "").trim();
  if (link && line.endsWith(link)) return line.slice(0, -link.length).trim();
  return line;
}

export interface MatchPublishedOptions {
  /** معرف حساب Publer (ليس job id). صف بحساب آخر يُستبعد. */
  accountId?: string;
  linkUrl?: string | null;
}

function rowAccountId(row: Record<string, unknown>): string | null {
  const id = row.account_id ?? row.accountId;
  return typeof id === "string" && id.length > 0 ? id : null;
}

/**
 * post_link هو رابط الشبكة وقد يكون أي شكل status على x.com/twitter.com.
 * url في نفس الكائن رابط المحتوى (الخبر) ولا يُعتمد كتغريدة إلا إذا كان status.
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

function contentMatches(row: Record<string, unknown>, body: string, linkUrl?: string | null): boolean {
  const text = typeof row.text === "string" ? collapseWs(row.text) : "";
  const attached = typeof row.url === "string" ? row.url.trim() : "";
  const bodyNorm = collapseWs(body);
  const signal = bodyNorm.slice(0, 40);
  const textHit =
    signal.length >= MIN_TEXT_SIGNAL &&
    (text.startsWith(signal) ||
      text.includes(signal) ||
      (text.length >= MIN_TEXT_SIGNAL && bodyNorm.startsWith(collapseWs(text).slice(0, 40))));
  const link = (linkUrl ?? "").trim();
  const linkHit = link.length > 0 && (text.includes(link) || attached === link || attached.includes(link));
  return textHit || linkHit;
}

/**
 * لا نطابق بمعرف المهمة `publer:<jobId>` ولا بمعرف صف Publer.
 * الشرط: نفس الحساب (إن وُجد account_id) + النص أو linkUrl + post_link بصيغة status.
 */
export function matchPublishedXStatus(
  rows: readonly unknown[],
  text: string,
  opts: MatchPublishedOptions = {},
): ResolvedXStatus | null {
  const body = tweetBody(text, opts.linkUrl);
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const accountId = rowAccountId(record);
    if (opts.accountId && accountId && accountId !== opts.accountId) continue;
    if (!contentMatches(record, body, opts.linkUrl)) continue;
    const status = statusFromPostFields(row);
    if (status) return status;
  }
  return null;
}

export interface PublishedRowStats {
  rowCount: number;
  withStatusLink: number;
  contentMatches: number;
  accountMismatches: number;
}

export function summarizePublishedRows(
  rows: readonly unknown[],
  text: string,
  opts: MatchPublishedOptions = {},
): PublishedRowStats {
  const body = tweetBody(text, opts.linkUrl);
  const stats: PublishedRowStats = { rowCount: 0, withStatusLink: 0, contentMatches: 0, accountMismatches: 0 };
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    stats.rowCount += 1;
    const record = row as Record<string, unknown>;
    if (statusFromPostFields(row)) stats.withStatusLink += 1;
    const accountId = rowAccountId(record);
    if (opts.accountId && accountId && accountId !== opts.accountId) {
      stats.accountMismatches += 1;
      continue;
    }
    if (contentMatches(record, body, opts.linkUrl)) stats.contentMatches += 1;
  }
  return stats;
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

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * نافذة from/to حول وقت النشر. الوثائق: from وto تاريخ ISO، وfrom مطلوب مع to.
 * اليوم السابق وحتى اليوم التالي ليبقى المنشور داخل الحدين حتى لو كانا حصريين.
 */
export function publerPublishedWindow(
  publishedAt?: Date | string | null,
  now = new Date(),
): { from: string; to: string } {
  const parsed = publishedAt ? new Date(publishedAt) : now;
  const base = Number.isNaN(parsed.getTime()) ? now : parsed;
  return {
    from: isoDay(new Date(base.getTime() - 24 * 60 * 60 * 1000)),
    to: isoDay(new Date(base.getTime() + 2 * 24 * 60 * 60 * 1000)),
  };
}

/**
 * job_status لا يعيد معرف المنشور، ومعرف المهمة ليس معرف GET /posts/{id}.
 * مرشّح الوثائق للقائمة هو account_ids[] (جسم الإنشاء يستخدم accounts[]).
 * state قيمة واحدة في كل طلب: published ثم published_posted إن لزم.
 */
function publishedPostsPath(
  accountId: string,
  page: number,
  window: { from: string; to: string },
  state: string,
): string {
  return (
    `/posts?state=${encodeURIComponent(state)}` +
    `&account_ids[]=${encodeURIComponent(accountId)}` +
    `&from=${window.from}&to=${window.to}&page=${page}`
  );
}

type FetchRowsResult =
  | { ok: true; rows: unknown[] }
  | { ok: false; httpStatus?: number; message: string };

async function fetchPublishedRows(
  accountId: string,
  page: number,
  window: { from: string; to: string },
  state: string,
  timeoutMs: number,
): Promise<FetchRowsResult> {
  try {
    const json = await publerFetch(
      publishedPostsPath(accountId, page, window, state),
      { method: "GET" },
      "posts list",
      timeoutMs,
    );
    return { ok: true, rows: postRowsFromResponse(json) };
  } catch (error) {
    const httpStatus = error instanceof SocialProviderError ? error.opts.httpStatus : undefined;
    const message = redactPublerMessage(error instanceof Error ? error.message : "lookup failed");
    return { ok: false, httpStatus, message };
  }
}

export interface ResolvePublishedPostLinkOptions {
  timeoutMs?: number;
  /** رابط الخبر كما خُزّن عندنا — Publer يضعه غالباً في url لا في text */
  linkUrl?: string | null;
  /** وقت نشر الصف عندنا؛ غيابه يعني نافذة حول الآن (النشر الفوري) */
  publishedAt?: Date | string | null;
}

function redactPublerMessage(message: string): string {
  let out = sanitizeSecretText(message);
  for (const secret of [process.env.PUBLER_API_KEY, process.env.PUBLER_WORKSPACE_ID]) {
    if (secret && secret.length >= 4) out = out.split(secret).join("[redacted]");
  }
  return out.replace(/Bearer-API\s+\S+/gi, "Bearer-API [redacted]");
}

function logPublerLookup(level: "info" | "warn", entry: Record<string, unknown>): void {
  const line = JSON.stringify({ event: "publer_post_link_lookup", ...entry });
  if (level === "info") console.info(line);
  else console.warn(line);
}

/**
 * حل رابط الحالة من GET /posts داخل نافذة التاريخ. أي فشل يعيد null ولا يرمي.
 * سجل واحد لكل محاولة: found / not_found (مع الأعداد) / error. بلا أسرار.
 */
export async function resolvePublishedPostLink(
  publerAccountId: string,
  text: string,
  opts: ResolvePublishedPostLinkOptions = {},
): Promise<ResolvedXStatus | null> {
  const timeoutMs = opts.timeoutMs ?? POST_LINK_LOOKUP_TIMEOUT_MS;
  const window = publerPublishedWindow(opts.publishedAt);
  const matchOpts: MatchPublishedOptions = { accountId: publerAccountId, linkUrl: opts.linkUrl };
  const totals: PublishedRowStats = { rowCount: 0, withStatusLink: 0, contentMatches: 0, accountMismatches: 0 };
  let pages = 0;
  let lastError: { httpStatus?: number; message: string } | null = null;

  // published يشمل المنشور حسب الوثائق؛ published_posted احتياط إن رجعت الأولى فراغاً أو بلا مطابقة.
  for (const state of ["published", "published_posted"]) {
    for (const page of [0, 1]) {
      const fetched = await fetchPublishedRows(publerAccountId, page, window, state, timeoutMs);
      if (!fetched.ok) {
        lastError = { httpStatus: fetched.httpStatus, message: fetched.message };
        break;
      }
      pages += 1;
      const stats = summarizePublishedRows(fetched.rows, text, matchOpts);
      totals.rowCount += stats.rowCount;
      totals.withStatusLink += stats.withStatusLink;
      totals.contentMatches += stats.contentMatches;
      totals.accountMismatches += stats.accountMismatches;
      const hit = matchPublishedXStatus(fetched.rows, text, matchOpts);
      if (hit) {
        logPublerLookup("info", {
          outcome: "found",
          accountId: publerAccountId,
          state,
          from: window.from,
          to: window.to,
          page,
          tweetId: hit.tweetId,
          ...totals,
        });
        return hit;
      }
      if (fetched.rows.length === 0) break;
    }
  }

  if (pages === 0 && lastError) {
    logPublerLookup("warn", {
      outcome: "error",
      accountId: publerAccountId,
      from: window.from,
      to: window.to,
      httpStatus: lastError.httpStatus ?? null,
      message: lastError.message,
    });
    return null;
  }

  logPublerLookup("warn", {
    outcome: "not_found",
    accountId: publerAccountId,
    from: window.from,
    to: window.to,
    pages,
    ...totals,
  });
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
