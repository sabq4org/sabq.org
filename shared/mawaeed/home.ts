/**
 * منطق صفحة /mawaeed داخل تطبيق الموقع: البطل، بطاقة المدارس، وباقي السلاسل.
 * نقي بلا React حتى يُختبر وحده ويبقى مطابقاً لمنطق النسخة المولَّدة على الحافة (functions/mawaeedPage.js).
 */

import type { MawaeedCard, MawaeedSeriesBlock } from "./present";

export const SCHOOL_KIND = "school_holiday";

/** أقرب موعد قادم عبر كل السلاسل (أول موعد لكل سلسلة ثم الأبكر بينها). */
export function nearestCard(series: MawaeedSeriesBlock[]): MawaeedCard | null {
  let best: MawaeedCard | null = null;
  for (const block of series) {
    const card = block.next;
    if (!card) continue;
    if (!best || card.startsOn < best.startsOn) best = card;
  }
  return best;
}

export function schoolBlock(series: MawaeedSeriesBlock[]): MawaeedSeriesBlock | null {
  return series.find((block) => block.kind === SCHOOL_KIND) ?? null;
}

/** صفوف بطاقة المدارس: المواعيد التي لم تنتهِ، من الأقرب، بعدد محدود. */
export function schoolRows(block: MawaeedSeriesBlock | null, limit = 6): MawaeedCard[] {
  if (!block) return [];
  return block.upcoming.filter((card) => !card.isPast).slice(0, limit);
}

function compareByNextDate(a: MawaeedSeriesBlock, b: MawaeedSeriesBlock): number {
  if (!a.next && !b.next) return 0;
  if (!a.next) return 1;
  if (!b.next) return -1;
  return a.next.startsOn.localeCompare(b.next.startsOn);
}

/**
 * شريط «نبض المواعيد الخمسة» في أعلى الصفحة: كل السلاسل مرتبة من الأقرب للأبعد
 * حتى يرى القارئ المواعيد الخمسة كلها بنظرة واحدة فوق الطيّ دون أن تحتكر الإجازات الشاشة.
 */
export function pulseBlocks(series: MawaeedSeriesBlock[]): MawaeedSeriesBlock[] {
  return series.slice().sort(compareByNextDate);
}

/**
 * بطاقات «مواعيد الرواتب والدعم الشهري»: كل السلاسل المالية (عدا المدارس لأن لها لوحتها المستقلة)
 * مرتبة من الأقرب للأبعد.
 */
export function financialBlocks(series: MawaeedSeriesBlock[]): MawaeedSeriesBlock[] {
  return series
    .filter((block) => block.kind !== SCHOOL_KIND)
    .slice()
    .sort(compareByNextDate);
}

/** عنوان مختصر لبطاقات الشريط السريع العلوي. */
export function shortSeriesTitle(block: Pick<MawaeedSeriesBlock, "kind" | "title">): string {
  switch (block.kind) {
    case "school_holiday":
      return "الإجازة القادمة";
    case "salary":
      return "رواتب الدولة";
    case "pension":
      return "معاشات التقاعد";
    case "social_security":
      return "الضمان المطوّر";
    case "citizen_account":
      return "حساب المواطن";
    default:
      return block.title;
  }
}

/**
 * «باقي المواعيد»: كل السلاسل عدا المدارس (لها بطاقتها) وعدا سلسلة البطل، مرتبة بالأقرب.
 * السلاسل بلا موعد قادم تأتي أخيراً حتى لا تتصدر بطاقة فارغة.
 */
export function boardBlocks(series: MawaeedSeriesBlock[], hero: MawaeedCard | null): MawaeedSeriesBlock[] {
  return series
    .filter((block) => block.kind !== SCHOOL_KIND && (!hero || block.slug !== hero.seriesSlug))
    .slice()
    .sort(compareByNextDate);
}

/** هل يتبع البطل المنطقة المختارة؟ فقط حين يكون أقرب موعد إجازة مدرسية. */
export function heroFollowsRegion(hero: MawaeedCard | null): boolean {
  return hero?.kind === SCHOOL_KIND;
}

