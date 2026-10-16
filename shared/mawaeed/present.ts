/**
 * يبني نموذج العرض العام من الصفوف المنشورة.
 * dateModified من contentUpdatedAt، لا من ساعة الطلب.
 */

import { compactOccurrenceTitle } from "./display";
import { buildFaq, METHODOLOGY, type FaqItem } from "./content";
import { daysPhrase, formatGregorian, formatHijri, formatRiyadhDayLabel, liveCountdown, riyadhDateISO } from "./dates";
import { regionSuffix, serviceLinkForSeries } from "../servicePages/catalog";
import { visionNote } from "./notes";
import {
  EXPECTED_HINT,
  HOME_COPY,
  REGIONS,
  SERIES_CATALOG,
  catalogBySlug,
  displayTitle,
  certaintyLabel,
  isPublicOccurrence,
  normalizeRegion,
  occurrenceVisibleInRegion,
  ongoingWord,
  pastWord,
  regionMeta,
  schoolBucket,
  todayWord,
  type OccurrenceRecord,
  type RegionId,
  type SeriesKind,
  type SeriesRecord,
} from "./model";

export type MawaeedCard = {
  id: string;
  seriesSlug: string;
  seriesTitle: string;
  kind: SeriesKind;
  title: string;
  startsOn: string;
  endsOn: string | null;
  dateLine: string;
  hijriLabel: string;
  gregorianLabel: string;
  countdownText: string;
  todayLabel: string;
  isPast: boolean;
  isToday: boolean;
  /** بدأ ولم ينتهِ بعد: موعد متعدد الأيام بين يومه الأول ويومه الأخير. */
  isOngoing: boolean;
  /** اليوم الأخير شاملًا بالميلادي، فقط حين يمتد الموعد أكثر من يوم. */
  endLabel: string | null;
  pastLabel: string | null;
  certainty: "confirmed" | "expected";
  certaintyLabel: string;
  expectedHint: string | null;
  sourceUrl: string;
  sourceTitle: string;
  publicNote: string | null;
  visionNote: string | null;
  regionGroup: OccurrenceRecord["regionGroup"];
};

export type MawaeedSection = { id: string; title: string; cards: MawaeedCard[] };

export type MawaeedSeriesBlock = {
  slug: string;
  title: string;
  kind: SeriesKind;
  href: string;
  summary: string;
  previous: MawaeedCard | null;
  next: MawaeedCard | null;
  following: MawaeedCard | null;
  upcoming: MawaeedCard[];
  answerLine: string;
  followLine: string | null;
};

export type MawaeedView = {
  dateModified: string;
  dateModifiedLabel: string;
  region: RegionId;
  regions: { id: RegionId; label: string }[];
  page: {
    slug: string;
    title: string;
    description: string;
    h1: string;
    canonical: string;
  };
  nav: { href: string; label: string; current: boolean }[];
  series: MawaeedSeriesBlock[];
  sections: MawaeedSection[];
  faq: FaqItem[];
  methodology: string | null;
  jsonLd: Record<string, unknown>;
};

const SITE = "https://sabq.org";

export function presentMawaeed(input: {
  pageSlug?: string | null;
  region?: string | null;
  now: Date;
  series: SeriesRecord[];
  occurrences: OccurrenceRecord[];
}): { notFound: true } | { notFound: false; view: MawaeedView } {
  const pageSlug = (input.pageSlug || "").trim();
  const region = normalizeRegion(input.region);
  const today = riyadhDateISO(input.now);
  const publishedSeries = input.series
    .filter((item) => item.published)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder);
  if (pageSlug && !publishedSeries.some((item) => item.slug === pageSlug)) {
    return { notFound: true };
  }
  const visibleSeries = pageSlug ? publishedSeries.filter((item) => item.slug === pageSlug) : publishedSeries;
  const blocks = visibleSeries.map((item) => buildBlock(item, input.occurrences, region, input.now));
  const dateModified = maxModified(pageSlug ? visibleSeries : publishedSeries);
  const dateModifiedLabel = formatRiyadhDayLabel(dateModified);
  const copy = pageSlug ? catalogBySlug(pageSlug) : null;
  const page = {
    slug: pageSlug,
    title: copy?.seoTitle ?? HOME_COPY.seoTitle,
    description: copy?.seoDescription ?? HOME_COPY.seoDescription,
    h1: copy?.h1 ?? HOME_COPY.h1,
    canonical: pageSlug ? `${SITE}/mawaeed/${pageSlug}` : `${SITE}/mawaeed`,
  };
  const focus = blocks[0];
  const faq = pageSlug
    ? buildFaq(pageSlug, focus
      ? {
          slug: focus.slug,
          next: focus.next ? toFaq(focus.next) : null,
          following: focus.following ? toFaq(focus.following) : null,
          upcoming: focus.upcoming.map(toFaq),
          regionLabel: regionMeta(region).label,
        }
      : null, dateModifiedLabel)
    : [];
  const sections = pageSlug === "school-calendar-1448" && focus ? schoolSections(focus.upcoming) : pageSlug && focus
    ? [{ id: "upcoming", title: "المواعيد القادمة", cards: focus.upcoming }]
    : [];
  const view: MawaeedView = {
    dateModified,
    dateModifiedLabel,
    region,
    regions: REGIONS.map(({ id, label }) => ({ id, label })),
    page,
    nav: nav(pageSlug, region),
    series: blocks,
    sections,
    faq,
    methodology: pageSlug ? null : METHODOLOGY,
    jsonLd: buildJsonLd(page, dateModified, blocks, faq, region),
  };
  return { notFound: false, view };
}

function toFaq(card: MawaeedCard) {
  return {
    title: compactOccurrenceTitle(card.title, card.startsOn),
    dateLine: card.dateLine,
    countdownText: card.countdownText,
    sourceTitle: card.sourceTitle,
    isPast: card.isPast,
  };
}

function buildBlock(series: SeriesRecord, rows: OccurrenceRecord[], region: RegionId, now: Date): MawaeedSeriesBlock {
  const today = riyadhDateISO(now);
  const cards = rows
    .filter((row) => row.seriesId === series.id && isPublicOccurrence(row) && occurrenceVisibleInRegion(row.regionGroup, region))
    .slice()
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn) || a.titleAr.localeCompare(b.titleAr, "ar"))
    .map((row) => toCard(series, row, now));
  const upcoming = cards.filter((card) => !card.isPast);
  const past = cards.filter((card) => card.isPast);
  const next = upcoming[0] ?? null;
  const following = upcoming[1] ?? null;
  const previous = past.length ? past[past.length - 1] : null;
  return {
    slug: series.slug,
    title: series.titleAr,
    kind: series.kind,
    href: seriesHref(series.slug, series.kind, region),
    summary: series.summaryAr,
    previous,
    next,
    following,
    upcoming: cards,
    answerLine: answerLine(series, next, region),
    followLine: followLine(series, next, following),
  };
}

function toCard(series: SeriesRecord, row: OccurrenceRecord, now: Date): MawaeedCard {
  const today = riyadhDateISO(now);
  const gregorian = formatGregorian(row.startsOn);
  const hijriLabel = formatHijri(row.startsOn, row.hijriLabel);
  const calendarDays = daysBetween(today, row.startsOn);
  // endsOn يوم شامل: الإجازة 20–28 نوفمبر قائمة حتى نهاية 28 نوفمبر.
  const lastDay = row.endsOn && row.endsOn > row.startsOn ? row.endsOn : row.startsOn;
  const isPast = daysBetween(today, lastDay) < 0;
  const isToday = calendarDays === 0;
  const isOngoing = calendarDays < 0 && !isPast;
  const endLabel = lastDay !== row.startsOn ? dayMonth(lastDay) : null;
  const todayLabel = todayWord(series.kind);
  // النص الثابت يحسب الأيام كالعدّاد الحي (24 ساعة لليوم) حتى لا يقول «بعد 9 أيام» والساعة تعرض 8 أيام و8 ساعات.
  // اليوم والغد يبقيان على فرق التقويم («تُصرف اليوم»، «بعد يوم واحد»).
  const countdownText = isPast
    ? pastWord(series.kind)
    : isOngoing
      ? `${ongoingWord(series.kind)} حتى ${endLabel}`
      : calendarDays <= 1
        ? daysPhrase(calendarDays, todayLabel)
        : daysPhrase(Math.max(1, liveCountdown(now, row.startsOn, todayLabel).days), todayLabel);
  return {
    id: row.id,
    seriesSlug: series.slug,
    seriesTitle: series.titleAr,
    kind: series.kind,
    title: displayTitle(row.titleAr),
    startsOn: row.startsOn,
    endsOn: row.endsOn,
    dateLine: `${gregorian.label} (${hijriLabel})`,
    hijriLabel,
    gregorianLabel: gregorian.label,
    countdownText,
    todayLabel,
    isPast,
    isToday,
    isOngoing,
    endLabel,
    pastLabel: isPast ? pastWord(series.kind) : null,
    certainty: row.certainty === "expected" ? "expected" : "confirmed",
    certaintyLabel: certaintyLabel(row.certainty === "expected" ? "expected" : "confirmed"),
    expectedHint: row.certainty === "expected" ? EXPECTED_HINT : null,
    sourceUrl: row.sourceUrl,
    sourceTitle: row.sourceTitle,
    publicNote: row.publicNote || null,
    visionNote: visionNote(series.kind, row.titleAr, row.startsOn),
    regionGroup: row.regionGroup,
  };
}

function dayMonth(iso: string): string {
  const parts = formatGregorian(iso);
  return `${parts.day} ${parts.month}`;
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}

function scopePhrase(region: RegionId, card: MawaeedCard): string {
  if (card.regionGroup !== "all") return ` في ${regionMeta(region).label}`;
  return "";
}

function answerLine(series: SeriesRecord, next: MawaeedCard | null, region: RegionId): string {
  if (!next) return `${series.titleAr}: لا يوجد موعد قادم معلن حاليًا.`;
  if (series.kind === "school_holiday") {
    return `أقرب إجازة للمدارس: ${next.title}، ${next.dateLine}، ${next.countdownText}${scopePhrase(region, next)}.`;
  }
  if (series.kind === "citizen_account") {
    return `موعد إيداع حساب المواطن القادم: ${next.title}، ${next.dateLine}، ${next.countdownText}.`;
  }
  if (series.kind === "salary") {
    return `الراتب القادم لموظفي الدولة المدنيين والعسكريين: ${next.dateLine}، ${next.countdownText}.`;
  }
  if (series.kind === "social_security") {
    return `صرف معاش الضمان الاجتماعي المطوّر القادم: ${next.dateLine}، ${next.countdownText}.`;
  }
  return `صرف معاشات التقاعد القادم: ${next.dateLine}، ${next.countdownText}.`;
}

function followLine(series: SeriesRecord, next: MawaeedCard | null, following: MawaeedCard | null): string | null {
  if (!next) return null;
  const source = `المصدر: ${next.sourceTitle}.`;
  if (!following) return source;
  if (series.kind === "school_holiday") {
    return `تليها ${following.title} في ${following.gregorianLabel}. ${source}`;
  }
  return source;
}

function schoolSections(cards: MawaeedCard[]): MawaeedSection[] {
  const groups: MawaeedSection[] = [
    { id: "official", title: "الإجازات الرسمية من وزارة التعليم", cards: [] },
    { id: "extra", title: "الإجازات الإضافية حسب المنطقة", cards: [] },
    { id: "year", title: "نهاية العام والعودة", cards: [] },
  ];
  for (const card of cards) {
    const bucket = schoolBucket(card.title, card.regionGroup);
    const section = groups.find((item) => item.id === bucket);
    section?.cards.push(card);
  }
  return groups.filter((section) => section.cards.length > 0);
}

/** رابط القسم. التقويم الدراسي يحمل المنطقة المختارة حتى لا تعود صفحة الخدمة إلى الرياض. */
function seriesHref(slug: string, kind: SeriesKind, region: RegionId): string {
  const path = serviceLinkForSeries(slug)?.path ?? `/mawaeed/${slug}`;
  return kind === "school_holiday" ? `${path}${regionSuffix(region)}` : path;
}

function nav(current: string, region: RegionId): MawaeedView["nav"] {
  const items = [{ href: "/mawaeed", label: "مواعيدك", slug: "" }, ...SERIES_CATALOG.map((item) => ({
    href: seriesHref(item.slug, item.kind, region),
    label: item.titleAr,
    slug: item.slug,
  }))];
  return items.map((item) => ({ href: item.href, label: item.label, current: item.slug === current }));
}

function maxModified(series: SeriesRecord[]): string {
  const stamps = series.map((item) => Date.parse(item.contentUpdatedAt)).filter((value) => Number.isFinite(value));
  if (stamps.length === 0) return "2026-09-27T00:00:00.000+03:00";
  return new Date(Math.max(...stamps)).toISOString();
}

function buildJsonLd(
  page: MawaeedView["page"],
  dateModified: string,
  blocks: MawaeedSeriesBlock[],
  faq: FaqItem[],
  region: RegionId,
): Record<string, unknown> {
  const events = blocks.flatMap((block) => (block.next ? [block.next] : []));
  const graph: Record<string, unknown>[] = [
    {
      "@type": "WebPage",
      name: page.h1,
      url: page.canonical,
      description: page.description,
      inLanguage: "ar",
      dateModified,
      isPartOf: { "@type": "WebSite", name: "سبق", url: SITE },
    },
  ];
  if (events.length > 0) {
    graph.push({
      "@type": "ItemList",
      itemListElement: events.map((card, index) => ({
        "@type": "ListItem",
        position: index + 1,
        item: eventNode(card, region),
      })),
    });
  }
  const schemaFaq = faq.filter((item) => item.inSchema);
  if (schemaFaq.length > 0) {
    graph.push({
      "@type": "FAQPage",
      mainEntity: schemaFaq.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.answer },
      })),
    });
  }
  return { "@context": "https://schema.org", "@graph": graph };
}

function eventNode(card: MawaeedCard, region: RegionId): Record<string, unknown> {
  const place = card.regionGroup === "all"
    ? "المملكة العربية السعودية"
    : regionMeta(region).label;
  return {
    "@type": "Event",
    name: card.title,
    startDate: card.startsOn,
    endDate: card.endsOn || card.startsOn,
    eventStatus: "https://schema.org/EventScheduled",
    location: { "@type": "Place", name: place },
    organizer: { "@type": "Organization", name: card.sourceTitle, url: card.sourceUrl },
    url: card.sourceUrl,
  };
}
