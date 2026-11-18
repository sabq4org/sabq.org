import type { ReactNode } from "react";
import { Link } from "wouter";
import { X } from "lucide-react";
import { PlacementChips, UsualComparison } from "@/components/publisher/ArticleInsights";
import { articleHref, ratioPercent, type CampaignReport, type CampaignReportArticle, type CampaignSummary } from "@/components/publisher/campaignTypes";
import { CAMPAIGN_STAGE_LABELS, waitLabel, type CampaignArticleStage } from "@shared/publisherCampaigns";
import { formatDateShort, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

const STAGE_TONE: Record<CampaignArticleStage, string> = {
  published: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
  scheduled: "bg-sky-50 text-sky-800 dark:bg-sky-950/40 dark:text-sky-200",
  with_sabq: "bg-primary/10 text-primary",
  needs_changes: "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
  draft: "bg-muted text-muted-foreground",
  archived: "bg-muted text-muted-foreground",
};

export function StagePill({ stage }: { stage: CampaignArticleStage }) {
  return (
    <span className={cn("inline-flex w-[104px] shrink-0 justify-center rounded-full px-2.5 py-0.5 text-xs font-semibold", STAGE_TONE[stage])}>
      {CAMPAIGN_STAGE_LABELS[stage]}
    </span>
  );
}

const dayName = (day: string) =>
  new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", { weekday: "short", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));

/** «خط الحملة»: أيام فترة الحملة (أو أيام النشر) ونقطة لكل خبر نُشر فيها. */
export function CampaignDayStrip({ report }: { report: CampaignReport }) {
  const { startsOn, endsOn } = report.campaign;
  const counts = new Map(report.days.map((d) => [d.day, d.published]));
  let days: string[] = report.days.map((d) => d.day);
  if (startsOn && endsOn) {
    const range: string[] = [];
    const cursor = new Date(`${startsOn}T12:00:00Z`);
    const end = new Date(`${endsOn}T12:00:00Z`);
    while (cursor <= end && range.length < 31) {
      range.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    // كل أيام النشر تبقى، حتى لو تجاوزت الفترة سقف الـ31 يومًا المعروضة فارغة
    days = Array.from(new Set([...days, ...range])).sort();
  }
  if (days.length === 0) return null;
  const today = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);

  return (
    <div className="min-w-0">
      <div className="mb-2 text-xs text-muted-foreground">خط الحملة: عدد ما نُشر في كل يوم</div>
      <div className="flex gap-2 overflow-x-auto pb-1" data-testid="campaign-day-strip">
        {days.map((day) => {
          const n = counts.get(day) ?? 0;
          const isToday = day === today;
          const future = day > today;
          return (
            <div
              key={day}
              className={cn(
                "flex min-w-[58px] flex-col items-center rounded-2xl px-2 py-2 text-center",
                isToday
                  ? "bg-primary text-primary-foreground shadow-[0_6px_16px_rgba(30,155,230,.3)]"
                  : future
                    ? "text-muted-foreground"
                    : "bg-card shadow-sm",
              )}
            >
              <span className={cn("text-[11px]", isToday ? "" : "text-muted-foreground")}>{isToday ? "اليوم" : dayName(day)}</span>
              <bdi className="text-base font-bold tabular-nums">{Number(day.slice(8))}</bdi>
              <span className="mt-1 flex h-1.5 gap-[3px]" aria-label={`${n} منشور`}>
                {Array.from({ length: Math.min(n, 4) }).map((_, i) => (
                  <i key={i} className={cn("block h-1.5 w-1.5 rounded-full", isToday ? "bg-primary-foreground" : "bg-primary")} />
                ))}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** بطاقة الملخّص: الرقم الأهم (القراءات حتى الآن) وحده كبير. */
export function CampaignHero({ report, children }: { report: CampaignReport; children?: ReactNode }) {
  const pct = ratioPercent(report.totals.vsUsualRatio);
  const above = (report.totals.vsUsualRatio ?? 0) >= 1;
  return (
    <div
      className="flex flex-wrap items-center gap-6 rounded-[22px] border border-white bg-gradient-to-br from-[#E2F2FD] to-[#EEF1FE] p-5 dark:border-border dark:from-primary/10 dark:to-primary/5 md:p-6"
      data-testid="campaign-hero"
    >
      <div className="min-w-[220px] flex-1">
        <div className="text-sm text-muted-foreground">قراءات مواد الحملة حتى الآن</div>
        <bdi className="block text-[34px] font-bold leading-tight tabular-nums">{formatNumber(report.totals.views)}</bdi>
        <div className="text-sm">
          <bdi className="tabular-nums">{formatNumber(report.counts.published)}</bdi> منشورة من{" "}
          <bdi className="tabular-nums">{formatNumber(report.counts.total)}</bdi>
          {pct ? (
            <>
              {" · "}
              {above ? "أعلى" : "أقل"} من المعتاد في أقسامها{" "}
              <bdi dir="ltr" className={cn("font-bold tabular-nums", above ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground")}>
                {pct}
              </bdi>
            </>
          ) : null}
        </div>
      </div>
      {children ? <div className="min-w-0 flex-[2_1_380px]">{children}</div> : null}
    </div>
  );
}

function ArticleLine({
  article,
  editable,
  onRemove,
}: {
  article: CampaignReportArticle;
  editable: boolean;
  onRemove?: (id: string) => void;
}) {
  const meta: string[] = [];
  if (article.stage === "published" && article.publishedAt) meta.push(formatDateShort(article.publishedAt));
  if (article.stage === "scheduled" && article.scheduledAt) meta.push(`مجدول ${formatDateShort(article.scheduledAt)}`);
  if (article.stage === "with_sabq" && article.waitingSince) meta.push(`أُرسلت للمراجعة ${waitLabel(article.waitingSince)}`);
  if (article.stage === "needs_changes" && article.waitingSince) meta.push(`أعادها المحرر ${waitLabel(article.waitingSince)}`);
  if (article.categoryName) meta.push(article.categoryName);

  const editHref = `/dashboard/publisher/article/${article.id}/edit`;
  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-3 border-t border-border/60 px-4 py-3.5 md:px-5",
        article.stage === "needs_changes" && "bg-amber-50/60 dark:bg-amber-950/20",
      )}
      data-testid={`campaign-article-${article.id}`}
    >
      <StagePill stage={article.stage} />
      <div className="min-w-0 flex-[1_1_260px]">
        {article.stage === "published" ? (
          <a href={articleHref(article)} target="_blank" rel="noreferrer" className="font-semibold hover:text-primary hover:underline">
            {article.title}
          </a>
        ) : (
          <div className="font-semibold">{article.title}</div>
        )}
        {article.reviewNote ? (
          <div className="mt-0.5 text-sm text-amber-900 dark:text-amber-200">ملاحظة المحرر: {article.reviewNote}</div>
        ) : null}
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>{meta.join(" · ")}</span>
          <PlacementChips value={article.placements} />
        </div>
      </div>
      {article.stage === "published" ? (
        <div className="w-28 text-left">
          <bdi className="block text-base font-bold tabular-nums">{formatNumber(article.views ?? 0)}</bdi>
          <UsualComparison value={article.vsUsual} status="published" />
        </div>
      ) : editable && (article.stage === "needs_changes" || article.stage === "draft") ? (
        <Link
          href={editHref}
          className={cn(
            "inline-flex min-h-[40px] items-center rounded-full px-4 text-sm font-semibold",
            article.stage === "needs_changes" ? "bg-primary text-primary-foreground" : "border bg-card",
          )}
        >
          {article.stage === "needs_changes" ? "افتح المادة للتعديل" : "أكمل الكتابة"}
        </Link>
      ) : (
        <span className="text-xs text-muted-foreground">{article.stage === "with_sabq" ? "الدور على سبق" : ""}</span>
      )}
      {editable && onRemove ? (
        <button
          type="button"
          onClick={() => onRemove(article.id)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={`إزالة «${article.title}» من الحملة`}
          title="إزالة من الحملة (لا يُحذف الخبر)"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </li>
  );
}

export function CampaignArticleList({
  report,
  editable,
  onRemove,
  emptyAction,
}: {
  report: CampaignReport;
  editable: boolean;
  onRemove?: (id: string) => void;
  emptyAction?: ReactNode;
}) {
  const { counts } = report;
  const summary = [
    counts.published ? `${formatNumber(counts.published)} منشورة` : null,
    counts.scheduled ? `${formatNumber(counts.scheduled)} مجدولة` : null,
    counts.withSabq ? `${formatNumber(counts.withSabq)} عند المحرر` : null,
    counts.needsChanges ? `${formatNumber(counts.needsChanges)} تحتاج تعديلك` : null,
    counts.drafts ? `${formatNumber(counts.drafts)} مسودة` : null,
  ].filter(Boolean);

  return (
    <section className="overflow-hidden rounded-[20px] bg-card shadow-[0_1px_2px_rgba(27,43,58,.04),0_8px_24px_rgba(27,43,58,.06)]">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-3 pt-4 md:px-5">
        <h2 className="text-lg font-bold">مواد الحملة</h2>
        <span className="text-sm text-muted-foreground">{summary.join(" · ") || "لا مواد بعد"}</span>
      </div>
      {report.articles.length === 0 ? (
        <div className="border-t border-border/60 px-5 py-10 text-center text-sm text-muted-foreground">
          <p>لم تُضف مواد إلى هذه الحملة بعد.</p>
          {emptyAction ? <div className="mt-3">{emptyAction}</div> : null}
        </div>
      ) : (
        <ul>
          {report.articles.map((article) => (
            <ArticleLine key={article.id} article={article} editable={editable} onRemove={onRemove} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** شريط تقدّم الحملة: مقطع لكل مادة، أزرق للمنشور وكهرماني لما قيد الإجراء. */
export function CampaignProgressBar({ counts }: { counts: CampaignSummary["counts"] }) {
  const inProgress = counts.withSabq + counts.needsChanges + counts.scheduled;
  const segments = [
    ...Array.from({ length: counts.published }, () => "bg-primary"),
    ...Array.from({ length: inProgress }, () => "bg-amber-400"),
    ...Array.from({ length: counts.drafts }, () => "bg-border"),
  ].slice(0, 24);
  if (segments.length === 0) return <div className="h-2 rounded bg-border/70" />;
  return (
    <div className="flex gap-[3px]" aria-hidden>
      {segments.map((cls, i) => (
        <span key={i} className={cn("h-2 flex-1 rounded", cls)} />
      ))}
    </div>
  );
}
