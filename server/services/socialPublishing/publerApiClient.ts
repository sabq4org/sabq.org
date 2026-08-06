// عميل Publer — وسيلة نقل بديلة لمنصة X (وغيرها لاحقاً) عبر Publer API:
// مفتاح API + معرف workspace بدل OAuth، والحسابات تُربط من لوحة Publer.
// العمليات غير متزامنة: النشر والرفع من URL يعيدان job_id يُستطلع عبر
// GET /job_status/{id} حتى complete/failed.
//
// عقود مهمة (وثائق Publer كما في 2026-08):
// - النشر الفوري: POST /posts/schedule/publish بـ bulk.state="scheduled"
//   وبدون scheduled_at (جدولتنا الداخلية تبقى الحاكمة — لا نفوضها لPubler).
// - job_status المكتمل لا يتضمن معرف/رابط المنشور الخارجي — يُحل best-effort
//   من GET /posts (حقل post_link) بمطابقة النص، ولا نُفشل منشوراً نُشر فعلاً
//   لمجرد تعذر حل الرابط.
// - مهلة الاستطلاع بعد إرسال النشر خطأ «دائم» عمداً: الحالة مجهولة وقد يكون
//   المنشور صدر — إعادة المحاولة الآلية تخاطر بالتكرار، فالقرار للمستخدم.
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

// ── النشر ──────────────────────────────────────────────────────────

export interface PublerCreatePostInput {
  text: string;
  mediaIds?: string[];
  pollOptions?: PollJobOptions;
}

/**
 * نشر فوري لحساب X واحد عبر Publer. bulk.state="scheduled" بدون
 * scheduled_at = نشر فوري وفق الوثائق. يعيد job_id بعد اكتمال المهمة.
 */
export async function publishToPublerAccount(
  publerAccountId: string,
  input: PublerCreatePostInput,
): Promise<{ jobId: string }> {
  const hasMedia = Boolean(input.mediaIds && input.mediaIds.length > 0);
  const network: Record<string, unknown> = {
    type: hasMedia ? "photo" : "status",
    text: input.text,
  };
  if (hasMedia) {
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
  await pollPublerJob(String(jobId), input.pollOptions);
  return { jobId: String(jobId) };
}

/**
 * حل رابط المنشور الخارجي بعد اكتمال النشر — best-effort:
 * job_status لا يعيده، فنبحث في منشورات الحساب المنشورة عن أحدث
 * منشور نصه يطابق نصنا. أي فشل هنا يعيد null ولا يرمي.
 */
export async function resolvePublishedPostLink(
  publerAccountId: string,
  text: string,
): Promise<{ postId: string; postLink: string } | null> {
  try {
    const json = await publerFetch(
      `/posts?state[]=published_posted&account_ids[]=${encodeURIComponent(publerAccountId)}&page=1`,
      { method: "GET" },
      "posts list",
    );
    const rows: any[] = Array.isArray(json) ? json : json?.posts ?? json?.data ?? [];
    const needle = text.trim().slice(0, 80);
    const match = rows.find(
      (p) => typeof p?.text === "string" && p.text.trim().startsWith(needle) && p?.post_link,
    );
    if (!match) return null;
    return { postId: String(match.id ?? ""), postLink: String(match.post_link) };
  } catch {
    return null;
  }
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

  async createPost(accountId, input): Promise<ProviderPostResult> {
    const account = await loadPublerLinkedAccount(accountId);
    const { jobId } = await publishToPublerAccount(account.externalAccountId!, {
      text: input.text,
      mediaIds: input.mediaIds,
    });
    // المنشور صدر — حل الرابط تحسين لا شرط، وفشله لا يُفشل النشر
    const resolved = await resolvePublishedPostLink(account.externalAccountId!, input.text);
    if (resolved) {
      return { externalPostId: resolved.postId || `publer:${jobId}`, externalPostUrl: resolved.postLink };
    }
    console.warn(
      `[SocialPublish] Publer job ${jobId} اكتمل لكن تعذر حل رابط المنشور — يُسجل رابط الحساب بدلاً منه`,
    );
    return {
      externalPostId: `publer:${jobId}`,
      externalPostUrl: account.handle
        ? `https://x.com/${account.handle}`
        : "https://app.publer.com/",
    };
  },
};
