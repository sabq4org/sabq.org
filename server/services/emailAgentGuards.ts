// قواعد البريد الذكي الخالصة (بلا قاعدة بيانات ولا شبكة) — تُختبر وحدها.
// المسار نفسه في server/routes/emailAgent.ts.
import crypto from "crypto";

// نمط واحد يأكل الأقواس وكلمة TOKEN بأي حالة أحرف، فيبقى الناتج «[TOKEN]» دائمًا
// وتطابق بصمة العنوان المخزَّن بصمة العنوان الأصلي (emailAgentDedup.normalizeEmailSubject).
const TOKEN_PATTERNS = [/\[\s*(?:TOKEN:\s*)?(?<![A-Fa-f0-9])[A-Fa-f0-9]{64}(?![A-Fa-f0-9])\s*\]|(?:TOKEN:\s*)?(?<![A-Fa-f0-9])[A-Fa-f0-9]{64}(?![A-Fa-f0-9])/gi];

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
  token_expired: "انتهت صلاحية رمز النشر. اطلب رمزًا جديدًا من إدارة التحرير ثم أعد الإرسال.",
};

export function emailAgentRepliesEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.EMAIL_AGENT_REPLY || "").trim().toLowerCase() !== "off";
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * صور الخبر بعد الأولى (الأولى صورة رئيسية): كتلة تحت النص بصيغة محرر سبق نفسها،
 * صورة واحدة = صورة عادية، وأكثر = «ألبوم» (div[data-image-gallery]). الويب والتطبيقات
 * تقرأ وسوم img داخلها، والمحرر يفتحها كتلة صورة/ألبوم لا «مرفقات» جانبية.
 */
export function buildEmailImagesHtml(urls: string[], title: string): string {
  const clean = urls.filter((u) => /^https:\/\//i.test(u));
  if (clean.length === 0) return "";
  const alt = (i: number) => escapeHtml(`${title} - صورة ${i + 2}`.slice(0, 125));
  if (clean.length === 1) {
    return `<img src="${escapeHtml(clean[0])}" alt="${alt(0)}" data-align="center" data-width="100%">`;
  }
  const images = clean.map((src) => ({ src, caption: "" }));
  const children = clean
    .map(
      (src, i) =>
        `<div class="album-image-container" style="margin-bottom: 24px;"><img src="${escapeHtml(src)}" alt="${alt(i)}" style="width: 100%; height: auto; border-radius: 8px; display: block;"></div>`,
    )
    .join("");
  return `<div data-image-gallery="" data-images="${escapeHtml(JSON.stringify(images))}" class="photo-album" style="width: 100%; padding: 16px 0;">${children}</div>`;
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

// ── التصنيف ──────────────────────────────────────────────────────────

type EditorialCategory = {
  nameAr: string;
  nameEn?: string | null;
  slug?: string | null;
  status?: string | null;
  isIfoxCategory?: boolean | null;
};

/**
 * الأقسام التي يجوز للبريد الذكي أن ينشر فيها: الظاهرة («visible») والداخلية («active»)،
 * بلا أقسام آي فوكس. كانت التصفية على «active» وحدها، والأقسام العامة كلها «visible»،
 * فوصلت القائمة فارغة وسقط كل خبر إلى أول قسم («محليات»).
 */
export function selectEditorialCategories<T extends EditorialCategory>(all: T[]): T[] {
  return all.filter((c) => (c.status === "visible" || c.status === "active") && !c.isIfoxCategory);
}

function normalizeCategoryName(value: string | null | undefined): string {
  return (value || "")
    .replace(/[«»"'“”]/g, "")
    .replace(/[\u064B-\u0652\u0640]/g, "") // تشكيل وتطويل
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function withoutArticle(value: string): string {
  return value.startsWith("ال") && value.length > 4 ? value.slice(2) : value;
}

/** يطابق التصنيف الذي اقترحه النموذج مع قسم فعلي: الاسم العربي أو الإنجليزي أو الرابط، ثم تطابق جزئي. */
export function matchDetectedCategory<T extends EditorialCategory>(
  detected: string | null | undefined,
  categories: T[],
): T | null {
  const name = normalizeCategoryName(detected);
  if (!name) return null;
  const bare = withoutArticle(name);
  const exact = categories.find((c) => {
    const ar = normalizeCategoryName(c.nameAr);
    return (
      ar === name ||
      withoutArticle(ar) === bare ||
      normalizeCategoryName(c.nameEn) === name ||
      normalizeCategoryName(c.slug) === name
    );
  });
  if (exact) return exact;
  if (bare.length < 3) return null;
  return (
    categories.find((c) => {
      const ar = withoutArticle(normalizeCategoryName(c.nameAr));
      const en = normalizeCategoryName(c.nameEn);
      return (
        (ar.length >= 3 && (ar.includes(bare) || bare.includes(ar))) ||
        (en.length >= 3 && (en.includes(name) || name.includes(en)))
      );
    }) || null
  );
}

/** حين لا يطابق تصنيف الذكاء أي قسم ولا يوجد قسم افتراضي للمرسل: «محليات» ثم أول قسم نشط. */
export function pickFallbackCategory<T extends { nameAr: string; slug?: string | null }>(active: T[]): T | null {
  return (
    active.find((c) => c.nameAr === "محليات" || c.slug === "local" || c.slug === "saudi") ||
    active[0] ||
    null
  );
}

// ── تدوير الرمز وانتهاؤه ─────────────────────────────────────────────

export const PREVIOUS_TOKEN_GRACE_HOURS = 48;
export const TOKEN_EXPIRY_WARNING_DAYS = 14;

export type TokenExpiryOption = "6m" | "1y" | "none";

export function isTokenExpiryOption(value: unknown): value is TokenExpiryOption {
  return value === "6m" || value === "1y" || value === "none";
}

/** تاريخ انتهاء الرمز الجديد حسب اختيار المحرر. `none` = بلا انتهاء. */
export function resolveTokenExpiry(option: TokenExpiryOption, now: Date = new Date()): Date | null {
  if (option === "none") return null;
  const expires = new Date(now);
  expires.setUTCMonth(expires.getUTCMonth() + (option === "6m" ? 6 : 12));
  return expires;
}

/**
 * مهلة الرمز السابق بعد التدوير: 48 ساعة، ولا تتجاوز انتهاءه الأصلي.
 * الرمز المنتهي أصلًا لا يُمنح مهلة (null): التدوير لا يحيي رمزًا انتهى.
 */
export function resolvePreviousTokenGrace(currentExpiresAt: Date | string | null | undefined, now: Date = new Date()): Date | null {
  const grace = new Date(now.getTime() + PREVIOUS_TOKEN_GRACE_HOURS * 60 * 60 * 1000);
  if (!currentExpiresAt) return grace;
  const expires = new Date(currentExpiresAt);
  if (Number.isNaN(expires.getTime())) return grace;
  if (expires.getTime() <= now.getTime()) return null;
  return expires.getTime() < grace.getTime() ? expires : grace;
}

function tokensEqual(provided: string, stored: string): boolean {
  const a = Buffer.from(provided.toLowerCase());
  const b = Buffer.from(stored.toLowerCase());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export type SenderTokenVerdict = "valid" | "valid_previous" | "expired" | "invalid";

/**
 * يطابق الرمز المرسل برمز المرسل الحالي، ثم بالسابق ما دامت مهلته قائمة.
 * الرمز الحالي المنتهي يُرفض بسبب مستقل ليعرف المرسل أن عليه طلب رمز جديد.
 */
export function evaluateSenderToken(
  provided: string | null | undefined,
  sender: {
    token?: string | null;
    tokenExpiresAt?: Date | string | null;
    previousToken?: string | null;
    previousTokenValidUntil?: Date | string | null;
  },
  now: Date = new Date(),
): SenderTokenVerdict {
  if (!provided) return "invalid";
  if (sender.token && tokensEqual(provided, sender.token)) {
    const expiresAt = sender.tokenExpiresAt ? new Date(sender.tokenExpiresAt) : null;
    if (expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= now.getTime()) return "expired";
    return "valid";
  }
  if (sender.previousToken && sender.previousTokenValidUntil && tokensEqual(provided, sender.previousToken)) {
    const until = new Date(sender.previousTokenValidUntil);
    if (!Number.isNaN(until.getTime()) && until.getTime() > now.getTime()) return "valid_previous";
  }
  return "invalid";
}

// ── إعادة المعالجة ───────────────────────────────────────────────────

const REPROCESSABLE_REASONS = new Set(["processing_error", "processing_interrupted"]);

/**
 * «أعد المعالجة» للرسالة التي فشلت بعد التحقق من مرسلها ورمزها ولم تُنشئ مقالًا.
 * المرفوضة (رمز ناقص، مرسل غير موثوق…) لا تعاد: إعادتها تتجاوز الرمز.
 */
export function isReprocessableLog(log: {
  status?: string | null;
  rejectionReason?: string | null;
  tokenVerified?: boolean | null;
  trustedSenderId?: string | null;
  articleId?: string | null;
}): boolean {
  return (
    log.status === "failed" &&
    log.tokenVerified === true &&
    !!log.trustedSenderId &&
    !log.articleId &&
    REPROCESSABLE_REASONS.has(log.rejectionReason || "")
  );
}
