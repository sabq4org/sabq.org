/**
 * يبني نموذج صفحة خدمة من عرض مواعيدك الجاهز.
 * لا يحسب تاريخًا ولا يغيّر شارة «متوقع» / «مؤكد».
 */

import type { FaqItem } from "../mawaeed/content";
import { METHODOLOGY } from "../mawaeed/content";
import type { MawaeedCard, MawaeedView } from "../mawaeed/present";
import { servicePageById, type ServicePageSpec } from "./catalog";

const SITE = "https://sabq.org";

export type ServicePageNext = {
  title: string;
  startsOn: string;
  gregorianLabel: string;
  hijriLabel: string;
  countdownText: string;
  todayLabel: string;
  certainty: "confirmed" | "expected";
  certaintyLabel: string;
  expectedHint: string | null;
  sourceUrl: string;
  sourceTitle: string;
  isToday: boolean;
};

export type ServicePageRow = {
  title: string;
  startsOn: string;
  gregorianLabel: string;
  hijriLabel: string;
  countdownText: string;
  certaintyLabel: string;
  isPast: boolean;
  isNext: boolean;
  pastLabel: string | null;
};

export type ServicePageLink = { href: string; label: string };

export type ServicePageModel = {
  id: string;
  path: string;
  title: string;
  description: string;
  h1: string;
  canonical: string;
  dateModified: string;
  dateModifiedLabel: string;
  leadPrefix: string;
  shiftRule: string | null;
  explanation: string[];
  next: ServicePageNext | null;
  rows: ServicePageRow[];
  faq: FaqItem[];
  links: ServicePageLink[];
  relatedQuery: string | null;
  relatedSource: "keyword" | "search";
  tone: "citizen" | "salary";
  calendarHref: string | null;
  ogImage: string;
  jsonLd: Record<string, unknown>;
};

export function presentServicePage(id: string, view: MawaeedView): ServicePageModel | null {
  const spec = servicePageById(id);
  if (!spec || spec.source.type !== "mawaeed") return null;
  const block = view.series.find((item) => item.slug === spec.source.seriesSlug);
  if (!block) return null;
  const next = block.next ? toNext(block.next) : null;
  const rows = block.upcoming.map((card) => toRow(card, next?.startsOn ?? null));
  const shiftRule = polishShiftRule(shiftRuleText(block.summary, view.faq));
  const description = metaDescription(next, shiftRule, spec);
  const links = relatedLinks(spec, block.href);
  const canonical = `${SITE}${spec.path}`;
  const faq = view.faq.filter((item) => item.question.trim() && item.answer.trim());
  return {
    id: spec.id,
    path: spec.path,
    title: spec.title,
    description,
    h1: spec.h1,
    canonical,
    dateModified: view.dateModified,
    dateModifiedLabel: view.dateModifiedLabel,
    leadPrefix: next ? "موعد الصرف القادم هو" : "لا يوجد موعد قادم معلن حاليًا.",
    shiftRule,
    explanation: explanationParagraphs(serviceSummary(block.summary)),
    next,
    rows,
    faq,
    links,
    relatedQuery: spec.relatedQuery,
    relatedSource: spec.relatedSource,
    tone: spec.tone,
    calendarHref: rows.some((row) => !row.isPast) ? `/api/service-pages/${spec.id}/calendar.ics` : null,
    ogImage: `${SITE}/api/service-pages/${spec.id}/og.png`,
    jsonLd: buildJsonLd({ spec, canonical, description, dateModified: view.dateModified, faq }),
  };
}

function toNext(card: MawaeedCard): ServicePageNext {
  return {
    title: card.title,
    startsOn: card.startsOn,
    gregorianLabel: card.gregorianLabel,
    hijriLabel: card.hijriLabel,
    countdownText: card.countdownText,
    todayLabel: card.todayLabel,
    certainty: card.certainty,
    certaintyLabel: card.certaintyLabel,
    expectedHint: card.expectedHint,
    sourceUrl: card.sourceUrl,
    sourceTitle: card.sourceTitle,
    isToday: card.isToday,
  };
}

function toRow(card: MawaeedCard, nextStartsOn: string | null): ServicePageRow {
  return {
    title: card.title,
    startsOn: card.startsOn,
    gregorianLabel: card.gregorianLabel,
    hijriLabel: card.hijriLabel,
    countdownText: card.countdownText,
    certaintyLabel: card.certaintyLabel,
    isPast: card.isPast,
    isNext: nextStartsOn === card.startsOn && !card.isPast,
    pastLabel: card.pastLabel,
  };
}

const SALARY_SHIFT = "حسب وزارة المالية، إذا وافق يوم 27 الجمعة يُصرف الخميس الذي قبله، وإذا وافق السبت يُصرف الأحد الذي بعده.";

/** يعيد صياغة الجملة القائمة للقارئ، بلا قاعدة جديدة. */
function polishShiftRule(rule: string | null): string | null {
  if (!rule) return null;
  if (/الخميس قبله/.test(rule) && /الأحد بعده/.test(rule)) return SALARY_SHIFT;
  return rule;
}

function serviceSummary(summary: string): string {
  return summary.replace(
    /موعد صرف رواتب موظفي الدولة المدنيين والعسكريين حسب جدول وزارة المالية: يوم 27 ميلادي، وإن وافق الجمعة فالخميس قبله، وإن وافق السبت فالأحد بعده\./,
    `تصرف وزارة المالية رواتب موظفي الدولة المدنيين والعسكريين يوم 27 من كل شهر ميلادي. ${SALARY_SHIFT}`,
  );
}

/** جملة الإزاحة الموجودة أصلًا في ملخص السلسلة أو سؤالها، بلا صياغة قاعدة جديدة. */
export function shiftRuleText(summary: string, faq: FaqItem[]): string | null {
  const fromSummary = summary
    .split(/(?<=\.)\s+/)
    .map((sentence) => sentence.trim())
    .find((sentence) => /الجمعة|السبت/.test(sentence));
  if (fromSummary) return fromSummary;
  const fromFaq = faq.find((item) => /الجمعة|السبت/.test(item.question) && item.answer.trim());
  return fromFaq ? fromFaq.answer.trim() : null;
}

function explanationParagraphs(summary: string): string[] {
  const paragraphs = [summary.trim()].filter(Boolean);
  const badge = METHODOLOGY.split(/(?<=\.)\s+/).find((sentence) => sentence.includes("«متوقع»"));
  if (badge) paragraphs.push(badge.trim());
  return paragraphs;
}

function metaDescription(next: ServicePageNext | null, _shiftRule: string | null, spec: ServicePageSpec): string {
  if (!next) return spec.fallbackDescription;
  const status = next.certainty === "expected"
    ? "الموعد محسوب من الجدول المعتاد إلى أن يصدر الإعلان الرسمي."
    : "الموعد مؤكد.";
  const text = `موعد الصرف القادم ${next.gregorianLabel} الموافق ${next.hijriLabel}، ${next.countdownText}. ${status}`;
  return clip(text, 180);
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > 80 ? cut.slice(0, space) : cut).trim()}…`;
}

function relatedLinks(spec: ServicePageSpec, seriesHref: string): ServicePageLink[] {
  return [
    { href: seriesHref, label: spec.sourceLabel },
    { href: "/mawaeed", label: "كل مواعيدك" },
  ];
}

function buildJsonLd(input: {
  spec: ServicePageSpec;
  canonical: string;
  description: string;
  dateModified: string;
  faq: FaqItem[];
}): Record<string, unknown> {
  const breadcrumbId = `${input.canonical}#breadcrumb`;
  const graph: Record<string, unknown>[] = [
    {
      "@type": "WebPage",
      "@id": input.canonical,
      name: input.spec.h1,
      url: input.canonical,
      description: input.description,
      inLanguage: "ar",
      dateModified: input.dateModified,
      isPartOf: { "@type": "WebSite", name: "سبق", url: `${SITE}/` },
      breadcrumb: { "@id": breadcrumbId },
    },
    {
      "@type": "BreadcrumbList",
      "@id": breadcrumbId,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "سبق", item: `${SITE}/` },
        { "@type": "ListItem", position: 2, name: "مواعيدك", item: `${SITE}/mawaeed` },
        { "@type": "ListItem", position: 3, name: input.spec.h1, item: input.canonical },
      ],
    },
  ];
  const schemaFaq = input.faq.filter((item) => item.inSchema);
  if (schemaFaq.length > 0) {
    graph.push({
      "@type": "FAQPage",
      "@id": `${input.canonical}#faq`,
      mainEntity: schemaFaq.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.answer },
      })),
    });
  }
  return { "@context": "https://schema.org", "@graph": graph };
}
