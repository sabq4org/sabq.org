/**
 * بناء سطور الإعلانات النصية الدوّارة لشريط التوقعات على الصفحة الرئيسية.
 * منطق نقي قابل للاختبار — لا يصل لقاعدة البيانات.
 *
 * المبدأ المنتج: إثبات اجتماعي + أسماء مباريات حقيقية + دعوة للنقاط،
 * بلا أسماء مستخدمين (خصوصية) وبلا أرقام جائزة ثابتة قد تتقادم.
 */

export type PromoContestInput = {
  id: string;
  competitionSlug: string;
  competitionNameAr: string;
  homeName?: string | null;
  awayName?: string | null;
  round?: string | null;
  entriesCount: number;
  locksAt: Date | string;
};

export type PromoFeedItem = {
  id: string;
  text: string;
  href: string;
  kind: "crowd" | "invite" | "hype";
};

function teamPair(home?: string | null, away?: string | null): string | null {
  const h = (home ?? "").trim();
  const a = (away ?? "").trim();
  if (!h || !a) return null;
  return `${h} × ${a}`;
}

function formatCount(n: number): string {
  return new Intl.NumberFormat("en-US").format(Math.max(0, Math.trunc(n)));
}

/** يبني عناصر الشريط من المباريات المفتوحة + سطور حماس ثابتة خفيفة. */
export function buildPredictionPromoFeed(
  contests: PromoContestInput[],
  options?: { limit?: number; now?: Date },
): PromoFeedItem[] {
  const limit = Math.min(Math.max(options?.limit ?? 8, 1), 12);
  const now = options?.now ?? new Date();
  const items: PromoFeedItem[] = [];

  const open = contests
    .filter((c) => Date.parse(String(c.locksAt)) > now.getTime())
    .sort((a, b) => Date.parse(String(a.locksAt)) - Date.parse(String(b.locksAt)));

  for (const contest of open) {
    const pair = teamPair(contest.homeName, contest.awayName);
    if (!pair) continue;
    const href = `/predictions?competition=${encodeURIComponent(contest.competitionSlug)}`;
    const round = (contest.round ?? "").trim();

    if (contest.entriesCount > 0) {
      items.push({
        id: `crowd-${contest.id}`,
        kind: "crowd",
        href,
        text: `${formatCount(contest.entriesCount)} متوقّعًا على ${pair}${round ? ` · ${round}` : ""} — شارك قبل الإقفال`,
      });
    } else {
      items.push({
        id: `invite-${contest.id}`,
        kind: "invite",
        href,
        text: `كن أول المتوقّعين لـ ${pair} وابدأ جمع النقاط`,
      });
    }

    if (items.length >= limit) break;
  }

  // سطور حماس عامة تُكمّل التدوير إن قلّت المباريات المفتوحة
  const fallbackSlug = open[0]?.competitionSlug ?? "rsl-2026";
  const fallbackName = open[0]?.competitionNameAr ?? "دوري روشن";
  const fallbackHref = `/predictions?competition=${encodeURIComponent(fallbackSlug)}`;
  const hype: PromoFeedItem[] = [
    {
      id: "hype-pool",
      kind: "hype",
      href: fallbackHref,
      text: `توقّع مباريات ${fallbackName} — النتيجة الدقيقة تشاركك بركة النقاط`,
    },
    {
      id: "hype-wallet",
      kind: "hype",
      href: fallbackHref,
      text: "نقاط الترتيب تتحوّل لمحفظة الولاء بعد صافرة النهاية — كل إصابة تحسب",
    },
    {
      id: "hype-edit",
      kind: "hype",
      href: fallbackHref,
      text: "عدّل توقّعك حتى ضربة البداية — لا تخسر فرصتك قبل الصافرة",
    },
  ];

  for (const line of hype) {
    if (items.length >= limit) break;
    items.push(line);
  }

  return items.slice(0, limit);
}
