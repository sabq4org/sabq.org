// قواعد البريد الذكي الخالصة (بلا قاعدة بيانات ولا شبكة) — تُختبر وحدها.
// المسار نفسه في server/routes/emailAgent.ts.
import crypto from "crypto";

const TOKEN_PATTERNS = [
  /\[TOKEN:\s*[A-Fa-f0-9]{64}\s*\]/g,
  /TOKEN:\s*[A-Fa-f0-9]{64}/gi,
  /\b[A-Fa-f0-9]{64}\b/g,
];

/** يحذف رمز النشر من نص سيُخزَّن أو يُعرض: الرمز سر، والسجل يقرؤه أكثر من شخص. */
export function redactEmailTokens(text: string | null | undefined): string {
  if (!text) return "";
  let out = text;
  for (const pattern of TOKEN_PATTERNS) out = out.replace(pattern, "[TOKEN]");
  return out;
}

export function isValidSenderToken(token: unknown): token is string {
  return typeof token === "string" && /^[a-f0-9]{64}$/i.test(token);
}

/** الرمز بصيغته الصحيحة من الواجهة، وإلا رمز جديد من الخادم. لا يُقبل رمز ضعيف. */
export function resolveSenderToken(provided: unknown): string {
  return isValidSenderToken(provided) ? provided.toLowerCase() : crypto.randomBytes(32).toString("hex");
}

// ── صحة مصدر البريد (SPF / DKIM) ─────────────────────────────────────

export type SenderAuthVerdict = "pass" | "fail" | "unknown";

function domainOf(address: string | null | undefined): string {
  const raw = (address || "").trim().toLowerCase();
  const at = raw.lastIndexOf("@");
  return (at >= 0 ? raw.slice(at + 1) : raw).replace(/[>\s]/g, "");
}

/** تطابق مرن كما في DMARC: النطاق نفسه أو نطاق فرعي منه في أي الاتجاهين. */
function domainsAligned(a: string, b: string): boolean {
  if (!a || !b) return false;
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

function envelopeFrom(envelope: unknown): string {
  if (!envelope) return "";
  try {
    const parsed = typeof envelope === "string" ? JSON.parse(envelope) : envelope;
    return typeof parsed?.from === "string" ? parsed.from : "";
  } catch {
    return "";
  }
}

/**
 * يقرأ حقلي `SPF` و`dkim` اللذين يرسلهما SendGrid Inbound Parse مع كل رسالة.
 *
 * - pass: توقيع DKIM ناجح لنطاق المرسل، أو SPF ناجح ونطاق الظرف يطابق نطاق المرسل.
 * - fail: SendGrid أرسل نتيجة فحص ولم يتحقق أي من الشرطين — عنوان المرسل قد يكون منتحلًا.
 * - unknown: لا حقول فحص إطلاقًا (مزوّد آخر أو إعداد قديم) — لا نغيّر السلوك.
 */
export function evaluateSenderAuth(input: {
  fromEmail: string;
  spf?: unknown;
  dkim?: unknown;
  envelope?: unknown;
}): SenderAuthVerdict {
  const spf = typeof input.spf === "string" ? input.spf.trim().toLowerCase() : "";
  const dkim = typeof input.dkim === "string" ? input.dkim.trim().toLowerCase() : "";
  if (!spf && !dkim) return "unknown";

  const fromDomain = domainOf(input.fromEmail);
  if (!fromDomain) return "fail";

  // صيغة SendGrid: "{@gmail.com : pass}" أو عدة أزواج مفصولة بفواصل.
  const dkimPairs = dkim.matchAll(/@([a-z0-9.-]+)\s*:\s*([a-z]+)/g);
  for (const pair of dkimPairs) {
    if (pair[2] === "pass" && domainsAligned(pair[1], fromDomain)) return "pass";
  }

  if (spf === "pass" && domainsAligned(domainOf(envelopeFrom(input.envelope)), fromDomain)) return "pass";

  return "fail";
}

/**
 * النتيجة تُسجَّل دائمًا مع كل رسالة. تحويل الفاشل إلى مسودة يعمل فقط مع
 * `EMAIL_AGENT_SENDER_AUTH=enforce`: نطاق مرسل موثوق بإعداد بريد ناقص يفشل
 * الفحص وهو سليم، فنرى النتائج الفعلية للمرسلين أولًا ثم نفعّل المنع.
 */
export function senderAuthEnforced(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.EMAIL_AGENT_SENDER_AUTH || "").trim().toLowerCase() === "enforce";
}

// ── النشر باسم الصحيفة ───────────────────────────────────────────────

function normalizeArabic(text: string): string {
  return text
    .replace(/[ً-ْٰـ]/g, "")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[أإآ]/g, "ا")
    .toLowerCase();
}

const BYLINE_KEYWORDS = ["صحيفه", "سبق", "صحيفه سبق", "مجهول", "anonymous"];

/**
 * طلب صريح للنشر باسم الصحيفة: وسم (#سبق، #صحيفة…) أو سطر مستقل لا يحوي غير الكلمة.
 * ورود «سبق» داخل جملة («سبق أن أعلنت…») ليس طلبًا — كان يحوّل الكاتب خطأً.
 */
export function wantsNewspaperByline(subject: string | null | undefined, text: string | null | undefined): boolean {
  const normalized = normalizeArabic(`${subject || ""}\n${text || ""}`);
  for (const keyword of BYLINE_KEYWORDS) {
    if (normalized.includes(`#${keyword.replace(/ /g, "_")}`) || normalized.includes(`#${keyword}`)) return true;
  }
  return normalized
    .split(/\r?\n/)
    .map((line) => line.replace(/[^؀-ۿa-z ]/g, " ").replace(/\s+/g, " ").trim())
    .some((line) => BYLINE_KEYWORDS.includes(line));
}

// ── قراءة الصور (OCR) ────────────────────────────────────────────────

export const OCR_BODY_TEXT_THRESHOLD = 200;

/**
 * قراءة الصورة المرفقة مدفوعة. تلزم فقط حين يكون نص الرسالة قصيرًا (الخبر داخل الصورة)؛
 * الخبر المكتوب كاملًا صورُه صورٌ صحفية لا نصوص.
 */
export function shouldOcrAttachedImages(bodyText: string | null | undefined): boolean {
  const clean = redactEmailTokens(bodyText).replace(/\[TOKEN\]/g, "").replace(/\s+/g, " ").trim();
  return clean.length < OCR_BODY_TEXT_THRESHOLD;
}

// ── الرد على المرسل ──────────────────────────────────────────────────

export type SenderReplyOutcome =
  | { kind: "published"; title: string; url: string }
  | { kind: "draft"; title: string; note?: string }
  | { kind: "rejected"; reason: string }
  | { kind: "failed" };

const REJECTION_TEXT: Record<string, string> = {
  invalid_token: "رمز النشر غير موجود في الرسالة أو غير صحيح. أضف الرمز في العنوان أو النص ثم أعد الإرسال.",
  no_content: "لم نجد نصًا للخبر في الرسالة أو مرفقاتها.",
  quality_too_low: "النص لا يكفي لصياغة خبر. أضف التفاصيل الأساسية (من، ماذا، متى، أين) ثم أعد الإرسال.",
  no_news_value: "المحتوى لا يحمل قيمة خبرية قابلة للنشر.",
  ai_content_empty: "تعذّر تحرير النص هذه المرة. أعد الإرسال بعد قليل.",
  sender_inactive: "حسابك في البريد الذكي موقوف حاليًا. تواصل مع إدارة التحرير.",
};

export function emailAgentRepliesEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.EMAIL_AGENT_REPLY || "").trim().toLowerCase() !== "off";
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** نص الرد على المرسل الموثوق. لا يحوي الرمز ولا نص الرسالة الأصلية. */
export function buildSenderReply(
  originalSubject: string,
  outcome: SenderReplyOutcome,
): { subject: string; text: string; html: string } {
  const cleanSubject = redactEmailTokens(originalSubject).replace(/\[TOKEN\]/g, "").replace(/\s+/g, " ").trim();
  const subjectTail = cleanSubject ? `: ${cleanSubject.slice(0, 120)}` : "";

  let heading: string;
  let lines: string[];
  switch (outcome.kind) {
    case "published":
      heading = `تم النشر${subjectTail}`;
      lines = [`نُشر خبرك بعنوان: ${outcome.title}`, outcome.url];
      break;
    case "draft":
      heading = `وصل خبرك وهو بانتظار المراجعة${subjectTail}`;
      lines = [`حُفظ خبرك مسودة بعنوان: ${outcome.title}`, outcome.note || "سيراجعه المحرر قبل النشر."];
      break;
    case "rejected":
      heading = `لم يُنشر خبرك${subjectTail}`;
      lines = [REJECTION_TEXT[outcome.reason] || "تعذّر قبول الرسالة.", "أعد الإرسال بعد التصحيح."];
      break;
    default:
      heading = `تعذّرت معالجة رسالتك${subjectTail}`;
      lines = ["حدث خلل أثناء معالجة الرسالة ولم يُنشر الخبر.", "أعد إرسالها كما هي."];
  }

  const text = `${lines.join("\n")}\n\nصحيفة سبق — البريد الذكي`;
  const html =
    `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:15px;line-height:1.8;color:#1a1a1a">` +
    lines
      .map((line) =>
        /^https:\/\//.test(line)
          ? `<p><a href="${escapeHtml(line)}">${escapeHtml(line)}</a></p>`
          : `<p>${escapeHtml(line)}</p>`,
      )
      .join("") +
    `<p style="color:#777;font-size:13px">صحيفة سبق — البريد الذكي</p></div>`;
  return { subject: heading, text, html };
}

// ── التصنيف الاحتياطي ────────────────────────────────────────────────

/** حين لا يطابق تصنيف الذكاء أي قسم ولا يوجد قسم افتراضي للمرسل: «محليات» ثم أول قسم نشط. */
export function pickFallbackCategory<T extends { nameAr: string; slug?: string | null }>(active: T[]): T | null {
  return (
    active.find((c) => c.nameAr === "محليات" || c.slug === "local" || c.slug === "saudi") ||
    active[0] ||
    null
  );
}
