// قطع الصفحة الرئيسية الجديدة لكاتب الرأي (النموذج المعتمد 2026-11-23):
// ترويسة بالاسم وروابط نحيفة، شريط «مقالتك الآن» بمراحلها، تبويبات حبوب،
// وفي «مقالاتي»: بطاقة الموعد الأسبوعي مع «اطلب تغيير الموعد»، وشرائح فرز الحالات.

import { PenLine } from "lucide-react";
import { cn } from "@/lib/utils";
import { WriterInquiriesButton } from "@/components/WriterInquiriesButton";
import { WEEKDAYS_AR, type ScheduleBannerData } from "./WriterPriorityRail";

const RIYADH = "Asia/Riyadh";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join(" ");
}

function todayLabel(): string {
  return new Date().toLocaleDateString("ar", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: RIYADH,
    numberingSystem: "latn",
  });
}

function dateTime(iso: string): string {
  return new Date(iso).toLocaleString("ar", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
    timeZone: RIYADH,
    numberingSystem: "latn",
  });
}

const LINK_PILL =
  "inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-4 text-sm text-[#1B2B3A] shadow-[0_1px_3px_rgba(27,43,58,0.06)] transition-colors hover:bg-[#F4F7FB]";

export function WriterHomeHeader({
  greeting,
  name,
  profileImageUrl,
  createBlocked,
  startTitle,
  onStartWriting,
  onOpenGuide,
  onOpenFiles,
}: {
  greeting: string;
  name: string;
  profileImageUrl: string | null;
  createBlocked: boolean;
  startTitle?: string;
  onStartWriting: () => void;
  onOpenGuide: () => void;
  onOpenFiles: () => void;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4" dir="rtl" data-testid="writer-home-header">
      <div className="flex min-w-0 items-center gap-3.5">
        {profileImageUrl ? (
          <img src={profileImageUrl} alt="" className="h-[52px] w-[52px] shrink-0 rounded-full object-cover ring-[3px] ring-white" />
        ) : (
          <span className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-full bg-[#E6F4FD] text-lg font-bold text-[#0B6FA8] ring-[3px] ring-white">
            {initials(name)}
          </span>
        )}
        <div className="min-w-0">
          <p className="m-0 text-[13px] text-[#55667A]">
            {greeting}، {todayLabel()}
          </p>
          <h1 className="m-0 mt-0.5 truncate text-2xl font-bold text-[#1B2B3A] sm:text-[28px]">{name}</h1>
        </div>
      </div>
      <div className="-mx-1 flex max-w-full items-center gap-2 overflow-x-auto px-1 pb-0.5">
        <button type="button" className={LINK_PILL} onClick={onOpenGuide}>
          دليل الكاتب
        </button>
        <WriterInquiriesButton className="h-11 shrink-0 whitespace-nowrap rounded-full border-0 bg-white px-4 shadow-[0_1px_3px_rgba(27,43,58,0.06)]" />
        <button type="button" className={LINK_PILL} onClick={onOpenFiles}>
          ملفاتي
        </button>
        <button
          type="button"
          disabled={createBlocked}
          title={startTitle}
          onClick={onStartWriting}
          className={cn(
            "order-first inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-[#1E9BE6] px-5 sm:order-none text-[15px] font-bold text-white shadow-[0_6px_16px_rgba(30,155,230,0.3)] transition-colors hover:bg-[#1789CE]",
            createBlocked && "opacity-60",
          )}
          data-testid="button-writer-start-writing"
        >
          <PenLine className="h-[18px] w-[18px]" aria-hidden="true" />
          ابدأ الكتابة
        </button>
      </div>
    </header>
  );
}

type PipelineArticle = {
  id: string;
  title: string;
  stage: "scheduled" | "pending_review" | "approved";
  scheduledAt: string | null;
};

const STAGES = [
  { key: "sent", label: "أُرسلت" },
  { key: "reviewed", label: "رُوجعت" },
  { key: "scheduled", label: "مجدولة" },
  { key: "published", label: "منشورة" },
] as const;

export function WriterArticleNowStrip({ article, onOpen }: { article: PipelineArticle; onOpen: () => void }) {
  // المرحلة الحالية: 0 أُرسلت، 1 رُوجعت (اعتُمدت)، 2 مجدولة
  const current = article.stage === "scheduled" ? 2 : article.stage === "approved" ? 1 : 0;
  const headline =
    article.stage === "scheduled"
      ? `«${article.title}» مجدولة للنشر`
      : article.stage === "approved"
        ? `«${article.title}» اعتُمدت وتنتظر موعد النشر`
        : `«${article.title}» لدى هيئة التحرير`;
  const sub =
    article.stage === "scheduled" && article.scheduledAt
      ? `${dateTime(article.scheduledAt)} · يمكنك حفظ مسودة جديدة، وتُرسل بعد نشرها`
      : "سيصلك تنبيه فور جدولتها · يمكنك حفظ مسودة جديدة، وتُرسل بعد نشر هذه";
  return (
    <section
      className="flex flex-wrap items-center justify-between gap-3.5 rounded-[22px] bg-white px-5 py-4 shadow-[0_1px_3px_rgba(27,43,58,0.06)]"
      dir="rtl"
      data-testid="writer-active-pipeline-notice"
    >
      <button type="button" onClick={onOpen} className="flex min-w-0 items-center gap-3.5 text-right" data-testid="button-view-active-pipeline-article">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-[#E8F6EF] text-[#13734E]">
          <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
        </span>
        <span className="min-w-0">
          <span className="block text-[13px] text-[#55667A]">مقالتك الآن</span>
          <span className="block truncate text-base font-semibold text-[#1B2B3A]">{headline}</span>
          <span className="block text-[13px] text-[#55667A]">{sub}</span>
        </span>
      </button>
      <ol className="m-0 flex list-none items-center p-0" aria-label="مراحل المقالة">
        {STAGES.map((st, i) => (
          <li key={st.key} className="flex items-center">
            {i > 0 ? <span className={cn("h-0.5 w-4 sm:w-6", i <= current ? "bg-[#13734E]" : "bg-[#EEF2F6]")} aria-hidden="true" /> : null}
            <span
              aria-current={i === current ? "step" : undefined}
              className={cn(
                "whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold",
                i < current && "bg-[#E8F6EF] text-[#13734E]",
                i === current && "bg-[#1E9BE6] text-white shadow-[0_3px_8px_rgba(30,155,230,0.3)]",
                i > current && "bg-[#F4F7FB] font-normal text-[#617183]",
              )}
            >
              {st.label}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

const TABS = [
  { id: "today", label: "اليوم" },
  { id: "ideas", label: "أفكاري" },
  { id: "articles", label: "مقالاتي" },
  { id: "performance", label: "أدائي" },
] as const;

export function WriterTabPills({
  value,
  onChange,
  articlesBadge,
}: {
  value: string;
  onChange: (v: string) => void;
  articlesBadge: number;
}) {
  return (
    <nav aria-label="أقسام مساحة الكاتب" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5" dir="rtl">
      {TABS.map((t) => {
        const active = value === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            aria-pressed={active}
            data-testid={`writer-tab-${t.id}`}
            className={cn(
              "inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full px-5 text-[13px] transition-colors",
              active
                ? "bg-[#1E9BE6] font-semibold text-white shadow-[0_3px_8px_rgba(30,155,230,0.3)]"
                : "border border-[#EEF2F6] bg-white text-[#1B2B3A] hover:bg-[#F4F7FB]",
            )}
          >
            {t.label}
            {t.id === "articles" && articlesBadge > 0 ? (
              <span className={cn("min-w-5 rounded-full px-1.5 text-[11px] font-bold", active ? "bg-white/25" : "bg-[#FDECEC] text-[#BF3038]")}>
                {articlesBadge > 99 ? "+99" : articlesBadge}
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}

export function WriterWeeklySlotCard({
  banner,
  onRequestChange,
}: {
  banner: ScheduleBannerData | null;
  onRequestChange: () => void;
}) {
  if (!banner) return null;
  const next = new Date(banner.nextPublishAt);
  const dayNum = next.toLocaleDateString("ar", { day: "numeric", timeZone: RIYADH, numberingSystem: "latn" });
  const dayName = next.toLocaleDateString("ar", { weekday: "long", timeZone: RIYADH });
  const time = next.toLocaleTimeString("ar", { hour: "numeric", minute: "2-digit", timeZone: RIYADH, numberingSystem: "latn" });
  return (
    <section
      className="flex flex-wrap items-center gap-4 rounded-[22px] border border-white bg-gradient-to-br from-[#E2F2FD] to-[#EEF1FE] px-5 py-4"
      dir="rtl"
      data-testid="writer-weekly-slot"
    >
      <div className="rounded-[14px] bg-white px-3.5 py-1.5 text-center">
        <p className="m-0 text-[11px] text-[#55667A]">{dayName}</p>
        <p className="m-0 text-2xl font-bold leading-tight text-[#1E9BE6]">{dayNum}</p>
      </div>
      <div className="min-w-0 flex-1">
        <p className="m-0 text-[13px] text-[#55667A]">
          موعدك الأسبوعي: كل {WEEKDAYS_AR[banner.weekday] ?? dayName} · <span dir="ltr">{time}</span>
        </p>
        <p className="m-0 mt-0.5 text-[15px] font-bold text-[#1B2B3A]">سلّم قبل {dateTime(banner.submitDeadline)}</p>
        {banner.state === "late" ? (
          <span className="mt-1 inline-block rounded-full bg-[#FDECEC] px-2.5 py-0.5 text-xs font-semibold text-[#BF3038]">فات موعد التسليم</span>
        ) : banner.state === "reminder" ? (
          <span className="mt-1 inline-block rounded-full bg-[#FFF6E5] px-2.5 py-0.5 text-xs font-semibold text-[#946000]">اقترب موعد التسليم</span>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onRequestChange}
        className="h-11 rounded-full bg-white px-4 text-[13px] font-semibold text-[#0B6FA8] hover:bg-[#F4F7FB]"
        data-testid="button-request-slot-change"
      >
        اطلب تغيير الموعد
      </button>
    </section>
  );
}

export type ArticleStatusFilter = "active" | "action" | "scheduled" | "published" | "drafts" | "declined" | "all";

type FilterableArticle = { status: string; reviewStatus?: string | null };

export function filterTrackedArticles<T extends FilterableArticle>(list: T[], f: ArticleStatusFilter): T[] {
  return list.filter((a) => {
    const closed = ["published", "archived", "rejected"].includes(a.status);
    switch (f) {
      case "active":
        return !closed && (a.status === "scheduled" || Boolean(a.reviewStatus) && a.reviewStatus !== "rejected");
      case "action":
        return !closed && a.reviewStatus === "needs_changes";
      case "scheduled":
        return a.status === "scheduled";
      case "published":
        return a.status === "published";
      case "drafts":
        return a.status === "draft" && !a.reviewStatus;
      case "declined":
        return a.reviewStatus === "rejected" || a.status === "rejected";
      default:
        return true;
    }
  });
}

export function ArticleStatusChips({
  value,
  onChange,
  counts,
}: {
  value: ArticleStatusFilter;
  onChange: (v: ArticleStatusFilter) => void;
  counts: { all: number; active: number; action: number; scheduled: number; completed: number; drafts: number; declined: number };
}) {
  const chips: Array<[ArticleStatusFilter, string, number]> = [
    ["active", "الجارية", counts.active],
    ["action", "تحتاج إجراءك", counts.action],
    ["scheduled", "مجدولة", counts.scheduled],
    ["published", "منشورة", counts.completed],
    ["drafts", "مسودات", counts.drafts],
    ["declined", "لم تُنشر", counts.declined],
    ["all", "الكل", counts.all],
  ];
  return (
    <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5" dir="rtl" role="group" aria-label="فرز المقالات">
      {chips
        .filter(([id, , n]) => n > 0 || id === "active" || id === "all")
        .map(([id, label, n]) => (
          <button
            key={id}
            type="button"
            aria-pressed={value === id}
            onClick={() => onChange(id)}
            data-testid={`article-filter-${id}`}
            className={cn(
              "inline-flex h-10 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-3.5 text-[13px] transition-colors",
              value === id
                ? "bg-[#1E9BE6] font-semibold text-white"
                : id === "action"
                  ? "bg-[#FFF6E5] font-semibold text-[#946000]"
                  : "bg-white text-[#1B2B3A] shadow-[0_1px_3px_rgba(27,43,58,0.06)] hover:bg-[#F4F7FB]",
            )}
          >
            {label} <span className="tabular-nums">{n}</span>
          </button>
        ))}
    </div>
  );
}
