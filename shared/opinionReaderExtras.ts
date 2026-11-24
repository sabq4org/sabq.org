/**
 * إضافات مقال الرأي — منطق خالص بلا قاعدة بيانات، يستعمله الخادم والويب.
 * 1) «جملة المقال»: عبارة يختارها الكاتب تظهر بطاقةً قابلة للمشاركة صورةً.
 * 2) «أوافق / لا أوافق» في نهاية المقال، يفعّلها الكاتب.
 * (تغيير الموعد الأسبوعي مرة واحدة في shared/opinionSlotChange.ts)
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
