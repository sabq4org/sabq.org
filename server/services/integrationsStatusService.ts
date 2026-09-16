// خدمة حالة التكاملات الخارجية — تغذي صفحة "إعدادات التكاملات" في اللوحة.
//
// المبدأ الأمني الحاكم (نفس فلسفة AI Hub): لا تُعرض المفاتيح أبداً — لا كاملة
// ولا مقنّعة. الاستجابة تحمل فقط: هل المتغيرات مضبوطة، أسماء الناقص منها،
// ونتيجة فحص الاتصال الحي (نجاح/فشل + زمن + رمز خطأ عام بدون تفاصيل حساسة).
//
// الفحوص الحية قراءة فقط (جلب حساب/نطاقات/إحصاءات) — لا تُرسل أي رسالة
// أو بريد ولا تُحدث أي أثر جانبي عند المزوّد.

const LIVE_CHECK_TIMEOUT_MS = 5_000;
const CACHE_TTL_MS = 60_000;

export type IntegrationCategory =
  | "messaging"
  | "email"
  | "media"
  | "storage"
  | "infra"
  | "seo"
  | "sports";

export interface IntegrationStatus {
  key: string;
  name: string;
  nameEn: string;
  category: IntegrationCategory;
  /** كل المتغيرات المطلوبة موجودة */
  configured: boolean;
  /** أسماء متغيرات البيئة الناقصة (أسماء فقط — آمنة للعرض للأدمن) */
  missingVars: string[];
  /** هل تدعم الخدمة فحص اتصال حي */
  supportsLiveCheck: boolean;
  /** نتيجة آخر فحص حي إن وُجد */
  ok?: boolean;
  latencyMs?: number;
  errorCode?: string;
  checkedAt?: string;
}

interface IntegrationDef {
  key: string;
  name: string;
  nameEn: string;
  category: IntegrationCategory;
  requiredVars: string[];
  /** فحص حي — يرمي خطأً عند الفشل. غيابه يعني "فحص تهيئة فقط". */
  liveCheck?: () => Promise<void>;
}

class LiveCheckError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

function envSet(name: string): boolean {
  return Boolean(process.env[name] && process.env[name]!.trim() !== "");
}

/** fetch بمهلة، يحوّل أكواد HTTP لأخطاء عامة دون تسريب جسم الاستجابة */
async function probeFetch(url: string, init: RequestInit = {}): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LIVE_CHECK_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (res.ok) return;
    if (res.status === 401 || res.status === 403) throw new LiveCheckError("unauthorized");
    if (res.status === 404) throw new LiveCheckError("not_found");
    if (res.status === 429) throw new LiveCheckError("rate_limited");
    throw new LiveCheckError(`http_${res.status}`);
  } catch (err) {
    if (err instanceof LiveCheckError) throw err;
    if (err instanceof Error && err.name === "AbortError") throw new LiveCheckError("timeout");
    throw new LiveCheckError("network");
  } finally {
    clearTimeout(timer);
  }
}

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new LiveCheckError("timeout")), LIVE_CHECK_TIMEOUT_MS),
    ),
  ]);
}

const INTEGRATIONS: IntegrationDef[] = [
  {
    key: "twilio",
    name: "تويليو (واتساب / OTP)",
    nameEn: "Twilio",
    category: "messaging",
    requiredVars: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"],
    liveCheck: async () => {
      const sid = process.env.TWILIO_ACCOUNT_SID!;
      const auth = Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN!}`).toString("base64");
      await probeFetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, {
        headers: { Authorization: `Basic ${auth}` },
      });
    },
  },
  {
    key: "bevatel",
    name: "بيفاتل (رسائل OTP باسم SABQ)",
    nameEn: "Bevatel SMS",
    category: "messaging",
    requiredVars: ["BEVATEL_API_KEY"],
    liveCheck: async () => {
      const base = (process.env.BEVATEL_API_BASE || "https://sms-api.bevatel.com").replace(/\/+$/, "");
      await probeFetch(`${base}/users/me`, {
        headers: { Authorization: `Bearer ${process.env.BEVATEL_API_KEY!}` },
      });
    },
  },
  {
    key: "sendgrid",
    name: "سيندجريد (البريد)",
    nameEn: "SendGrid",
    category: "email",
    requiredVars: ["SENDGRID_API_KEY"],
    liveCheck: async () => {
      await probeFetch("https://api.sendgrid.com/v3/scopes", {
        headers: { Authorization: `Bearer ${process.env.SENDGRID_API_KEY!}` },
      });
    },
  },
  {
    key: "mailersend",
    name: "مايلرسند (البريد الأساسي)",
    nameEn: "MailerSend",
    category: "email",
    requiredVars: ["MAILERSEND_API_KEY"],
    liveCheck: async () => {
      await probeFetch("https://api.mailersend.com/v1/domains", {
        headers: { Authorization: `Bearer ${process.env.MAILERSEND_API_KEY!}` },
      });
    },
  },
  {
    key: "mailerlite",
    name: "مايلرلايت (النشرات)",
    nameEn: "MailerLite",
    category: "email",
    requiredVars: ["MAILERLITE_API_KEY"],
    liveCheck: async () => {
      await probeFetch("https://connect.mailerlite.com/api/groups?limit=1", {
        headers: { Authorization: `Bearer ${process.env.MAILERLITE_API_KEY!}` },
      });
    },
  },
  {
    key: "cloudflare_images",
    name: "كلاودفلير للصور",
    nameEn: "Cloudflare Images",
    category: "media",
    requiredVars: ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_IMAGES_TOKEN", "CLOUDFLARE_ACCOUNT_HASH"],
    liveCheck: async () => {
      await probeFetch(
        `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/images/v1/stats`,
        { headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_IMAGES_TOKEN!}` } },
      );
    },
  },
  {
    key: "cloudflare_purge",
    name: "كلاودفلير (تفريغ الكاش)",
    nameEn: "Cloudflare Purge",
    category: "infra",
    requiredVars: ["CLOUDFLARE_ZONE_ID", "CLOUDFLARE_API_TOKEN"],
    liveCheck: async () => {
      await probeFetch("https://api.cloudflare.com/client/v4/user/tokens/verify", {
        headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN!}` },
      });
    },
  },
  {
    key: "object_storage",
    name: "التخزين السحابي (ملفات غير الصور)",
    nameEn: "Object Storage",
    category: "storage",
    requiredVars: ["PRIVATE_OBJECT_DIR"],
    liveCheck: async () => {
      const { objectStorageClient, getBucketConfig } = await import("../objectStorage");
      const config = getBucketConfig();
      const [exists] = await withTimeout(objectStorageClient.bucket(config.bucketName).exists());
      if (!exists) throw new LiveCheckError("bucket_not_found");
    },
  },
  {
    key: "redis",
    name: "ريدس (الجلسات والكاش)",
    nameEn: "Redis",
    category: "infra",
    requiredVars: ["REDIS_URL"],
    liveCheck: async () => {
      const { getRedisClient } = await import("../redis");
      const client = getRedisClient();
      if (!client) throw new LiveCheckError("not_connected");
      // GET لمفتاح غير موجود = رحلة ذهاب وإياب كاملة بدون أي أثر
      await withTimeout(client.get("integrations:ping"));
    },
  },
  {
    key: "elevenlabs",
    name: "إليفن لابز (الصوت)",
    nameEn: "ElevenLabs",
    category: "media",
    requiredVars: ["ELEVENLABS_API_KEY"],
    liveCheck: async () => {
      await probeFetch("https://api.elevenlabs.io/v1/user", {
        headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY! },
      });
    },
  },
  {
    key: "fcm",
    name: "إشعارات أندرويد (FCM)",
    nameEn: "Firebase Cloud Messaging",
    category: "messaging",
    requiredVars: ["FCM_SERVER_KEY"],
  },
  {
    key: "apns",
    name: "إشعارات آبل (APNs)",
    nameEn: "Apple Push Notification service",
    category: "messaging",
    requiredVars: ["APNS_KEY_ID", "APNS_TEAM_ID", "APNS_PRIVATE_KEY"],
  },
  {
    key: "indexnow",
    name: "إندكس ناو (فهرسة فورية)",
    nameEn: "IndexNow",
    category: "seo",
    requiredVars: ["INDEXNOW_KEY"],
  },
  {
    key: "thesports",
    name: "ذا سبورتس (بيانات المباريات)",
    nameEn: "TheSports",
    category: "sports",
    requiredVars: ["THESPORTS_USER", "THESPORTS_SECRET"],
  },
];

interface CachedResult {
  ok: boolean;
  latencyMs: number;
  errorCode?: string;
  checkedAt: string;
  expiresAt: number;
}

const liveResultCache = new Map<string, CachedResult>();
const inFlight = new Map<string, Promise<CachedResult>>();

function configStatus(def: IntegrationDef): Omit<IntegrationStatus, "ok" | "latencyMs" | "errorCode" | "checkedAt"> {
  const missingVars = def.requiredVars.filter((v) => !envSet(v));
  return {
    key: def.key,
    name: def.name,
    nameEn: def.nameEn,
    category: def.category,
    configured: missingVars.length === 0,
    missingVars,
    supportsLiveCheck: Boolean(def.liveCheck),
  };
}

/** حالة كل التكاملات: التهيئة تُحسب لحظياً + آخر نتيجة فحص حي من الكاش */
export function getStatuses(): IntegrationStatus[] {
  return INTEGRATIONS.map((def) => {
    const base = configStatus(def);
    const cached = liveResultCache.get(def.key);
    if (cached && cached.expiresAt > Date.now()) {
      return {
        ...base,
        ok: cached.ok,
        latencyMs: cached.latencyMs,
        errorCode: cached.errorCode,
        checkedAt: cached.checkedAt,
      };
    }
    return base;
  });
}

/**
 * فحص اتصال حي لتكامل واحد. النتائج تُخزن 60 ثانية، والطلبات المتزامنة
 * لنفس الخدمة تتشارك فحصاً واحداً — حماية من إغراق المزوّد بالضغط المتكرر.
 */
export async function testIntegration(key: string): Promise<IntegrationStatus> {
  const def = INTEGRATIONS.find((d) => d.key === key);
  if (!def) throw new Error("unknown_integration");

  const base = configStatus(def);
  if (!base.configured) {
    return { ...base, ok: false, errorCode: "not_configured", checkedAt: new Date().toISOString() };
  }
  if (!def.liveCheck) {
    return base;
  }

  const cached = liveResultCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return { ...base, ok: cached.ok, latencyMs: cached.latencyMs, errorCode: cached.errorCode, checkedAt: cached.checkedAt };
  }

  let pending = inFlight.get(key);
  if (!pending) {
    pending = (async (): Promise<CachedResult> => {
      const started = Date.now();
      try {
        await def.liveCheck!();
        return {
          ok: true,
          latencyMs: Date.now() - started,
          checkedAt: new Date().toISOString(),
          expiresAt: Date.now() + CACHE_TTL_MS,
        };
      } catch (err) {
        return {
          ok: false,
          latencyMs: Date.now() - started,
          errorCode: err instanceof LiveCheckError ? err.code : "unknown",
          checkedAt: new Date().toISOString(),
          expiresAt: Date.now() + CACHE_TTL_MS,
        };
      }
    })();
    inFlight.set(key, pending);
    pending.finally(() => inFlight.delete(key));
  }

  const result = await pending;
  liveResultCache.set(key, result);
  return { ...base, ok: result.ok, latencyMs: result.latencyMs, errorCode: result.errorCode, checkedAt: result.checkedAt };
}

/** فحص شامل لكل التكاملات القابلة للفحص — بالتوازي */
export async function testAllIntegrations(): Promise<IntegrationStatus[]> {
  return Promise.all(INTEGRATIONS.map((def) => testIntegration(def.key)));
}
