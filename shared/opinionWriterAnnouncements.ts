// إعلانات كتّاب الرأي: ملف، استطلاع، رابط، أو ملاحظة تظهر أعلى مساحة الكاتب حتى تاريخ انتهاء،
// مع متابعة بالأسماء (من رآه، من حمّله أو فتحه، من صوّت). الاجتماع القادم ونموذج «اهتماماتي»
// يظهران تلقائياً ولا يحتاجان إعلاناً. ثوابت ودوال خالصة يستعملها الخادم والواجهة.

export const ANNOUNCEMENT_KINDS = [
  { id: "file", label: "ملف", actionLabel: "حمّلوه", pendingLabel: "لم يحمّلوه" },
  { id: "poll", label: "استطلاع", actionLabel: "صوّتوا", pendingLabel: "لم يصوّتوا" },
  { id: "link", label: "رابط", actionLabel: "فتحوه", pendingLabel: "لم يفتحوه" },
  { id: "note", label: "ملاحظة", actionLabel: "قرأوها", pendingLabel: "لم يقرأوها" },
] as const;

export type AnnouncementKind = (typeof ANNOUNCEMENT_KINDS)[number]["id"];

const KIND_IDS = new Set<string>(ANNOUNCEMENT_KINDS.map((k) => k.id));

export function announcementKindMeta(kind: string) {
  return ANNOUNCEMENT_KINDS.find((k) => k.id === kind) ?? ANNOUNCEMENT_KINDS[3];
}

/** نوع الأثر المسجل لكل كاتب. «acted» = الفعل المقصود من الإعلان (تحميل/تصويت/فتح/قراءة). */
export const ENGAGEMENT_ACTIONS = ["seen", "acted"] as const;
export type EngagementAction = (typeof ENGAGEMENT_ACTIONS)[number];

export const MAX_ANNOUNCEMENT_TITLE = 160;
export const MAX_ANNOUNCEMENT_BODY = 1000;
export const MAX_POLL_OPTIONS = 6;
export const MAX_POLL_OPTION_CHARS = 80;
export const MAX_ANNOUNCEMENT_DAYS = 120;
export const DEFAULT_ANNOUNCEMENT_DAYS = 14;
/** «ذكّر من لم يتفاعل» مرة واحدة في اليوم على الأكثر لكل إعلان */
export const REMIND_COOLDOWN_MS = 24 * 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

export type CreateAnnouncementInput = {
  kind: AnnouncementKind;
  title: string;
  body: string | null;
  fileId: string | null;
  linkUrl: string | null;
  pollOptions: string[];
  expiresAt: Date;
  sendEmail: boolean;
};

export type AnnouncementValidation =
  | { ok: true; value: CreateAnnouncementInput }
  | { ok: false; code: string; message: string };

const ALLOWED_KEYS = new Set([
  "kind",
  "title",
  "body",
  "fileId",
  "linkUrl",
  "pollOptions",
  "expiresAt",
  "sendEmail",
]);

function fail(code: string, message: string): AnnouncementValidation {
  return { ok: false, code, message };
}

function isNullish(v: unknown) {
  return v === undefined || v === null;
}

function clean(value: string): string {
  return value.replace(/\r\n/g, "\n").trim();
}

/**
 * طلب إنشاء إعلان: كل حقل غير معروف أو بنوع خاطئ أو لا يخص النوع المختار يُرفض برمز واضح
 * بدل تجاهله بصمت (REVIEW.md A4).
 */
export function validateCreateAnnouncement(body: unknown, now: Date = new Date()): AnnouncementValidation {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return fail("INVALID_BODY", "صيغة الطلب غير صحيحة");
  }
  const raw = body as Record<string, unknown>;
  const unknownKeys = Object.keys(raw).filter((k) => !ALLOWED_KEYS.has(k));
  if (unknownKeys.length) return fail("UNKNOWN_FIELD", `حقول غير مدعومة: ${unknownKeys.join("، ")}`);

  if (typeof raw.kind !== "string" || !KIND_IDS.has(raw.kind)) {
    return fail("INVALID_KIND", "نوع الإعلان غير معروف");
  }
  const kind = raw.kind as AnnouncementKind;

  if (typeof raw.title !== "string") return fail("INVALID_FIELD_TYPE", "العنوان مطلوب");
  const title = clean(raw.title);
  if (title.length < 3) return fail("TITLE_REQUIRED", "اكتب عنواناً واضحاً للإعلان");
  if (title.length > MAX_ANNOUNCEMENT_TITLE) {
    return fail("TITLE_TOO_LONG", `العنوان أطول من ${MAX_ANNOUNCEMENT_TITLE} حرفاً`);
  }

  let bodyText: string | null = null;
  if (!isNullish(raw.body)) {
    if (typeof raw.body !== "string") return fail("INVALID_FIELD_TYPE", "نص الإعلان يجب أن يكون نصاً");
    const b = clean(raw.body);
    if (b.length > MAX_ANNOUNCEMENT_BODY) return fail("BODY_TOO_LONG", `النص أطول من ${MAX_ANNOUNCEMENT_BODY} حرف`);
    bodyText = b || null;
  }

  // حقول خاصة بنوع واحد: وجودها مع نوع آخر خطأ صريح
  const hasFile = !isNullish(raw.fileId) && raw.fileId !== "";
  const hasLink = !isNullish(raw.linkUrl) && raw.linkUrl !== "";
  const hasPoll = Array.isArray(raw.pollOptions) ? raw.pollOptions.length > 0 : !isNullish(raw.pollOptions);
  if (hasFile && kind !== "file") return fail("FIELD_NOT_FOR_KIND", "الملف يخص إعلانات الملفات فقط");
  if (hasLink && kind !== "link") return fail("FIELD_NOT_FOR_KIND", "الرابط يخص إعلانات الروابط فقط");
  if (hasPoll && kind !== "poll") return fail("FIELD_NOT_FOR_KIND", "الخيارات تخص الاستطلاع فقط");

  let fileId: string | null = null;
  if (kind === "file") {
    if (typeof raw.fileId !== "string" || !raw.fileId.trim()) return fail("FILE_REQUIRED", "اختر الملف");
    fileId = raw.fileId.trim();
  }

  let linkUrl: string | null = null;
  if (kind === "link") {
    if (typeof raw.linkUrl !== "string") return fail("LINK_REQUIRED", "أضف الرابط");
    const u = raw.linkUrl.trim();
    if (u.startsWith("/") && !u.startsWith("//")) {
      linkUrl = u.slice(0, 500);
    } else {
      let parsed: URL;
      try {
        parsed = new URL(u);
      } catch {
        return fail("INVALID_LINK", "الرابط غير صالح");
      }
      if (parsed.protocol !== "https:") return fail("INVALID_LINK", "يُقبل رابط https فقط");
      if (u.length > 500) return fail("INVALID_LINK", "الرابط طويل جداً");
      linkUrl = parsed.toString();
    }
  }

  let pollOptions: string[] = [];
  if (kind === "poll") {
    if (!Array.isArray(raw.pollOptions)) return fail("POLL_OPTIONS_REQUIRED", "أضف خيارات الاستطلاع");
    const opts: string[] = [];
    for (const o of raw.pollOptions) {
      if (typeof o !== "string") return fail("INVALID_FIELD_TYPE", "كل خيار يجب أن يكون نصاً");
      const t = clean(o);
      if (!t) continue;
      if (t.length > MAX_POLL_OPTION_CHARS) return fail("POLL_OPTION_TOO_LONG", `الخيار أطول من ${MAX_POLL_OPTION_CHARS} حرفاً`);
      if (opts.includes(t)) return fail("POLL_OPTION_DUPLICATE", "خيار مكرر");
      opts.push(t);
    }
    if (opts.length < 2) return fail("POLL_OPTIONS_REQUIRED", "الاستطلاع يحتاج خيارين على الأقل");
    if (opts.length > MAX_POLL_OPTIONS) return fail("POLL_TOO_MANY_OPTIONS", `${MAX_POLL_OPTIONS} خيارات على الأكثر`);
    pollOptions = opts;
  }

  if (kind === "note" && !bodyText) return fail("BODY_REQUIRED", "اكتب نص الملاحظة");

  let expiresAt: Date;
  if (isNullish(raw.expiresAt) || raw.expiresAt === "") {
    expiresAt = new Date(now.getTime() + DEFAULT_ANNOUNCEMENT_DAYS * DAY_MS);
  } else {
    if (typeof raw.expiresAt !== "string") return fail("INVALID_FIELD_TYPE", "تاريخ الانتهاء غير صالح");
    // تاريخ بلا وقت = نهاية ذلك اليوم بتوقيت الرياض (23:59 = 20:59 UTC)
    const s = raw.expiresAt.trim();
    const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T20:59:59Z`) : new Date(s);
    if (Number.isNaN(d.getTime())) return fail("INVALID_EXPIRY", "تاريخ الانتهاء غير صالح");
    if (d.getTime() <= now.getTime()) return fail("INVALID_EXPIRY", "تاريخ الانتهاء يجب أن يكون في المستقبل");
    if (d.getTime() - now.getTime() > MAX_ANNOUNCEMENT_DAYS * DAY_MS) {
      return fail("INVALID_EXPIRY", `أقصى مدة للإعلان ${MAX_ANNOUNCEMENT_DAYS} يوماً`);
    }
    expiresAt = d;
  }

  let sendEmail = false;
  if (!isNullish(raw.sendEmail)) {
    if (typeof raw.sendEmail !== "boolean") return fail("INVALID_FIELD_TYPE", "خيار البريد يجب أن يكون نعم أو لا");
    sendEmail = raw.sendEmail;
  }

  return { ok: true, value: { kind, title, body: bodyText, fileId, linkUrl, pollOptions, expiresAt, sendEmail } };
}

export type VoteValidation = { ok: true; optionIndex: number } | { ok: false; code: string; message: string };

export function validateVote(body: unknown, optionCount: number): VoteValidation {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, code: "INVALID_BODY", message: "صيغة الطلب غير صحيحة" };
  }
  const raw = body as Record<string, unknown>;
  const extra = Object.keys(raw).filter((k) => k !== "optionIndex");
  if (extra.length) return { ok: false, code: "UNKNOWN_FIELD", message: `حقول غير مدعومة: ${extra.join("، ")}` };
  const idx = raw.optionIndex;
  if (typeof idx !== "number" || !Number.isInteger(idx) || idx < 0 || idx >= optionCount) {
    return { ok: false, code: "INVALID_OPTION", message: "اختر أحد الخيارات" };
  }
  return { ok: true, optionIndex: idx };
}

export type WriterEngagementStatus = "acted" | "seen" | "none";

export function engagementStatus(row: { seenAt?: string | null; actedAt?: string | null }): WriterEngagementStatus {
  if (row.actedAt) return "acted";
  if (row.seenAt) return "seen";
  return "none";
}

/** يحق إرسال تذكير جديد؟ (مرة في اليوم على الأكثر) */
export function canRemindNow(lastRemindedAt: Date | string | null | undefined, now: Date = new Date()): boolean {
  if (!lastRemindedAt) return true;
  const t = new Date(lastRemindedAt).getTime();
  if (Number.isNaN(t)) return true;
  return now.getTime() - t >= REMIND_COOLDOWN_MS;
}

export function isAnnouncementActive(
  a: { archivedAt?: Date | string | null; expiresAt: Date | string },
  now: Date = new Date(),
): boolean {
  if (a.archivedAt) return false;
  return new Date(a.expiresAt).getTime() > now.getTime();
}

/** أعداد الأصوات لكل خيار (بترتيب الخيارات) */
export function tallyVotes(optionCount: number, votes: Array<number | null | undefined>): number[] {
  const out = new Array<number>(optionCount).fill(0);
  for (const v of votes) {
    if (typeof v === "number" && v >= 0 && v < optionCount) out[v] += 1;
  }
  return out;
}
