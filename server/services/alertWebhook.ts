// إرسال Webhook تنبيهات بجسم JSON، بمصادقة Webhook بوت الديسك نفسها (#2161، deskBotAlerts.ts):
// قيمة السر الخام في ترويسة (الافتراضي Authorization) كما هي دون تعديل، ولا ترويسة إن فرغ السر.
// يُستخدم لقناة «عين المناوبة» (DUTY_ALERT_WEBHOOK_*) المنفصلة عن أنواع بوت الديسك.
// لا يرمي أبداً، ولا يكتب السر في السجل.

export const ALERT_WEBHOOK_DEFAULT_HEADER = "Authorization";
export const ALERT_WEBHOOK_TIMEOUT_MS = 5_000;

export interface AlertWebhookPostResult {
  ok: boolean;
  /** رمز HTTP إن وصل رد */
  status?: number;
  /** وصف الخطأ بعد حجب السر */
  error?: string;
}

function maskSecret(text: string, secret: string): string {
  if (!secret) return text;
  return text.split(secret).join("***");
}

export async function postAlertWebhook(options: {
  url: string;
  secret: string;
  headerName?: string;
  body: string;
  /** ترويسات إضافية كما هي (مثل توقيع HMAC) */
  extraHeaders?: Record<string, string>;
  timeoutMs?: number;
  logPrefix: string;
  /** وصف قصير للسجل، مثل kind=absent id=12 */
  describe: string;
}): Promise<AlertWebhookPostResult> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.extraHeaders ?? {}),
  };
  if (options.secret) {
    headers[options.headerName || ALERT_WEBHOOK_DEFAULT_HEADER] = options.secret;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? ALERT_WEBHOOK_TIMEOUT_MS);

  try {
    const res = await fetch(options.url, {
      method: "POST",
      headers,
      body: options.body,
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`${options.logPrefix} webhook HTTP ${res.status} for ${options.describe}`);
      return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    }
    return { ok: true, status: res.status };
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : String(err);
    const safe = maskSecret(rawMsg, options.secret);
    console.warn(`${options.logPrefix} webhook delivery failed for ${options.describe}: ${safe}`);
    return { ok: false, error: safe.slice(0, 300) };
  } finally {
    clearTimeout(timer);
  }
}
