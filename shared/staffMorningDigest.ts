// ملخص الصباح لتطبيق «مكتب سبق» (2026-11-09): إشعار واحد يوميًا لكل عضو
// بما ينتظر قراره. منطق خالص بلا قاعدة بيانات: نص الإشعار، ويوم الرياض،
// وفحص «أُرسل اليوم». الإرسال في server/services/staffMorningDigestService.ts.

export const STAFF_MORNING_DIGEST_PUSH_TYPE = "desk.morning_digest";
export const STAFF_MORNING_DIGEST_DEEPLINK = "sabqdesk://morning-digest";
export const STAFF_MORNING_DIGEST_TITLE = "صباح الخير، بانتظار قرارك";

/** ما ينتظر قرار العضو — بعد الحجب بالصلاحيات (أرقام GET /api/v1/staff/counts). */
export interface StaffMorningDigestCounts {
  /** مقترحات التغريدات (inbox.social). */
  tweets: number;
  /** مقالات الرأي بانتظار المكتب (opinionPending). */
  opinion: number;
  /** رسائل الكتّاب غير المقروءة (inbox.tickets). */
  messages: number;
  /** مسودات الأخبار: مراسلون + بريد (news.reporters + news.email). */
  news: number;
  /** طلبات التعديل المعلّقة (news.editRequests). */
  editRequests: number;
}

export interface StaffMorningDigestText {
  title: string;
  body: string;
}

interface ArabicNoun {
  /** المفرد مع «واحد/واحدة»: «تغريدة واحدة». */
  one: string;
  /** المثنى: «تغريدتان». */
  two: string;
  /** جمع 3–10: «تغريدات». */
  plural: string;
  /** تمييز 11–99 (مفرد منصوب): «تغريدة»، «خبرًا». */
  singularAccusative: string;
  /** تمييز المئات (مفرد مجرور): «تغريدة»، «خبر». */
  singular: string;
}

const NOUNS: Record<keyof StaffMorningDigestCounts, ArabicNoun> = {
  tweets: { one: "تغريدة واحدة", two: "تغريدتان", plural: "تغريدات", singularAccusative: "تغريدة", singular: "تغريدة" },
  opinion: { one: "مقال رأي واحد", two: "مقالا رأي", plural: "مقالات رأي", singularAccusative: "مقال رأي", singular: "مقال رأي" },
  messages: { one: "رسالة واحدة", two: "رسالتان", plural: "رسائل", singularAccusative: "رسالة", singular: "رسالة" },
  news: { one: "خبر واحد", two: "خبران", plural: "أخبار", singularAccusative: "خبرًا", singular: "خبر" },
  editRequests: { one: "طلب تعديل واحد", two: "طلبا تعديل", plural: "طلبات تعديل", singularAccusative: "طلب تعديل", singular: "طلب تعديل" },
};

/** ترتيب الأجزاء في نص الإشعار. */
const PART_ORDER: (keyof StaffMorningDigestCounts)[] = ["tweets", "opinion", "messages", "news", "editRequests"];

function safeCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/**
 * العدد مع معدوده بأرقام لاتينية: 1 «تغريدة واحدة»، 2 «تغريدتان»،
 * 3–10 «3 تغريدات»، 11–99 «11 تغريدة». فوق المئة تحكم الخانتان الأخيرتان
 * (103 «تغريدات»، 111 «تغريدة»، 100–102 مفرد مجرور).
 */
export function arabicCountPhrase(count: number, noun: ArabicNoun): string {
  const n = safeCount(count);
  if (n === 0) return "";
  if (n === 1) return noun.one;
  if (n === 2) return noun.two;
  const lastTwo = n % 100;
  if (lastTwo >= 3 && lastTwo <= 10) return `${n} ${noun.plural}`;
  if (lastTwo >= 11) return `${n} ${noun.singularAccusative}`;
  return `${n} ${noun.singular}`;
}

/** نص إشعار الصباح؛ null إن لم يكن هناك ما ينتظر (لا يُرسل شيء). */
export function buildStaffMorningDigestText(
  counts: Partial<StaffMorningDigestCounts> | null | undefined,
): StaffMorningDigestText | null {
  const parts = PART_ORDER
    .map((key) => arabicCountPhrase(safeCount(counts?.[key]), NOUNS[key]))
    .filter(Boolean);
  if (parts.length === 0) return null;
  return { title: STAFF_MORNING_DIGEST_TITLE, body: parts.join("، ") };
}

const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;

/** يوم التقويم بتوقيت الرياض (UTC+3 بلا توقيت صيفي) بصيغة YYYY-MM-DD. */
export function riyadhDayKey(date: Date = new Date()): string {
  return new Date(date.getTime() + RIYADH_OFFSET_MS).toISOString().slice(0, 10);
}

/** هل القيمة المخزنة ({ day }) تقول إن ملخص اليوم (بتوقيت الرياض) أُرسل؟ */
export function isMorningDigestSentToday(stored: unknown, now: Date = new Date()): boolean {
  const day = stored && typeof stored === "object" ? (stored as { day?: unknown }).day : null;
  return typeof day === "string" && day === riyadhDayKey(now);
}
