/**
 * إضافات مقال الرأي — منطق خالص بلا قاعدة بيانات، يستعمله الخادم والويب.
 * 1) تغيير الموعد بيد الكاتب مرة واحدة لكل مقال.
 * 2) «جملة المقال»: عبارة يختارها الكاتب تظهر بطاقةً قابلة للمشاركة صورةً.
 * 3) «أوافق / لا أوافق» في نهاية المقال، يفعّلها الكاتب.
 */

// ── جملة المقال ──

export const PULL_QUOTE_MIN_CHARS = 15;
export const PULL_QUOTE_MAX_CHARS = 240;
export const OPINION_WRITER_CARD_SUBTITLE = "كاتب رأي في صحيفة سبق";

/** يزيل علامات التنصيص المحيطة ويوحّد المسافات. */
export function normalizePullQuote(raw: string | null | undefined): string {
  if (!raw) return "";
  let s = String(raw).replace(/[‏‎]/g, "").replace(/\s+/g, " ").trim();
  const pairs: Array<[string, string]> = [["«", "»"], ["\"", "\""], ["“", "”"], ["'", "'"], ["„", "“"]];
  let changed = true;
  while (changed && s.length >= 2) {
    changed = false;
    for (const [open, close] of pairs) {
      if (s.startsWith(open) && s.endsWith(close)) {
        s = s.slice(open.length, s.length - close.length).trim();
        changed = true;
      }
    }
  }
  return s;
}

export function validatePullQuote(raw: string | null | undefined): { ok: true; value: string | null } | { ok: false; message: string } {
  const value = normalizePullQuote(raw);
  if (!value) return { ok: true, value: null };
  const len = Array.from(value).length;
  if (len < PULL_QUOTE_MIN_CHARS) return { ok: false, message: `العبارة قصيرة جدًا (${PULL_QUOTE_MIN_CHARS} حرفًا على الأقل)` };
  if (len > PULL_QUOTE_MAX_CHARS) return { ok: false, message: `العبارة طويلة (${PULL_QUOTE_MAX_CHARS} حرفًا على الأكثر)` };
  return { ok: true, value };
}

/** تطبيع للمقارنة فقط: بلا تشكيل ولا تطويل، وهمزات الألف ألفًا، والتاء المربوطة هاءً. */
function foldArabic(s: string): string {
  return s
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/[ً-ْٰـ]/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[«»"“”'.,،؛:!?؟\-–—()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** هل العبارة من نص المقال؟ تنبيه للكاتب فقط، لا يمنع الحفظ. */
export function pullQuoteAppearsInArticle(quote: string, articleHtml: string | null | undefined): boolean {
  const q = foldArabic(normalizePullQuote(quote));
  if (!q) return true;
  return foldArabic(articleHtml ?? "").includes(q);
}

/** أسطر البطاقة: تقسيم بالكلمات على عرض تقريبي بالحروف. */
export function wrapQuoteLines(text: string, maxCharsPerLine: number): string[] {
  const words = normalizePullQuote(text).split(" ").filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (Array.from(next).length > maxCharsPerLine && line) {
      lines.push(line);
      line = w;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// ── أوافق / لا أوافق ──

export const AGREE_POLL_QUESTION = "هل توافق الكاتب؟";
export const AGREE_OPTION_TEXT = "أوافق";
export const DISAGREE_OPTION_TEXT = "لا أوافق";
/** علامة الخيار في poll_options.color لتمييز استطلاع «أوافق» عن استطلاعات التحرير. */
export const AGREE_OPTION_MARK = "agree";
export const DISAGREE_OPTION_MARK = "disagree";

/** نسبتان صحيحتان مجموعهما 100 دائمًا (أو 0/0 بلا أصوات). */
export function agreeVotePercents(agree: number, disagree: number): { agree: number; disagree: number; total: number } {
  const a = Math.max(0, Math.floor(agree || 0));
  const d = Math.max(0, Math.floor(disagree || 0));
  const total = a + d;
  if (total === 0) return { agree: 0, disagree: 0, total: 0 };
  const agreePct = Math.round((a / total) * 100);
  return { agree: agreePct, disagree: 100 - agreePct, total };
}

// ── تغيير الموعد مرة واحدة ──

/** لا يُغيَّر موعد يحين خلال ساعة، ولا يُختار موعد جديد قبل ساعة من الآن. */
export const RESCHEDULE_MIN_LEAD_MS = 60 * 60 * 1000;
/** أبعد موعد جديد: 30 يومًا من الآن. */
export const RESCHEDULE_MAX_AHEAD_MS = 30 * 24 * 60 * 60 * 1000;

const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;

/** «2026-11-27» + «20:30» بتوقيت الرياض (UTC+3 بلا توقيت صيفي) → لحظة UTC. */
export function riyadhLocalToDate(date: string, time: string): Date | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? "");
  const tm = /^(\d{2}):(\d{2})$/.exec(time ?? "");
  if (!dm || !tm) return null;
  const [y, mo, d, h, mi] = [Number(dm[1]), Number(dm[2]), Number(dm[3]), Number(tm[1]), Number(tm[2])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const ms = Date.UTC(y, mo - 1, d, h, mi) - RIYADH_OFFSET_MS;
  const out = new Date(ms);
  // يرفض 31 فبراير وأمثاله
  const back = new Date(ms + RIYADH_OFFSET_MS);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return out;
}

/** لحظة UTC → { date, time } بتوقيت الرياض لتعبئة الحقول. */
export function dateToRiyadhLocal(at: Date | string): { date: string; time: string } {
  const t = new Date(new Date(at).getTime() + RIYADH_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`,
    time: `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`,
  };
}

export type RescheduleEligibility =
  | { canReschedule: true }
  | { canReschedule: false; reason: "not_scheduled" | "already_used" | "too_close" };

export function rescheduleEligibility(input: {
  status: string;
  scheduledAt: Date | string | null | undefined;
  alreadyUsed: boolean;
  nowMs: number;
}): RescheduleEligibility {
  if (input.alreadyUsed) return { canReschedule: false, reason: "already_used" };
  const at = input.scheduledAt ? new Date(input.scheduledAt).getTime() : NaN;
  if (input.status !== "scheduled" || !Number.isFinite(at)) return { canReschedule: false, reason: "not_scheduled" };
  if (at - input.nowMs < RESCHEDULE_MIN_LEAD_MS) return { canReschedule: false, reason: "too_close" };
  return { canReschedule: true };
}

export const RESCHEDULE_REASON_LABELS: Record<"not_scheduled" | "already_used" | "too_close", string> = {
  not_scheduled: "تغيير الموعد متاح للمقال المجدول فقط",
  already_used: "استخدمت تغيير الموعد لهذا المقال من قبل",
  too_close: "بقي أقل من ساعة على النشر، تواصل مع التحرير",
};

/** خطأ الموعد الجديد بالعربية، أو null إن كان صالحًا. */
export function rescheduleTargetError(target: Date | null, currentMs: number, nowMs: number): string | null {
  if (!target || !Number.isFinite(target.getTime())) return "اختر تاريخًا ووقتًا صحيحين";
  const t = target.getTime();
  if (t - nowMs < RESCHEDULE_MIN_LEAD_MS) return "اختر موعدًا بعد ساعة على الأقل من الآن";
  if (t - nowMs > RESCHEDULE_MAX_AHEAD_MS) return "اختر موعدًا خلال 30 يومًا";
  if (Math.abs(t - currentMs) < 60 * 1000) return "هذا هو موعدك الحالي، اختر موعدًا مختلفًا";
  return null;
}
