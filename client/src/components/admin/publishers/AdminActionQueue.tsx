import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { CampaignProgressBar } from "@/components/publisher/CampaignReportBody";
import { campaignPeriod, type CampaignSummary } from "@/components/publisher/campaignTypes";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  ACTION_KIND_LABELS,
  waitLabel,
  waitTone,
  type ActionQueueItem,
  type WaitTone,
} from "@shared/publisherCampaigns";

const TONE_TEXT: Record<WaitTone, string> = {
  calm: "text-muted-foreground",
  warn: "text-amber-700 dark:text-amber-300",
  late: "text-red-700 dark:text-red-300",
};
const TONE_DOT: Record<WaitTone, string> = {
  calm: "bg-primary",
  warn: "bg-amber-400",
  late: "bg-red-500",
};

/** رابط في الصفحة نفسها (#requests) يمرّر إليها، وغيره ينتقل عبر wouter. */
function QueueAction({ href, primary, children }: { href: string; primary: boolean; children: ReactNode }) {
  const className = cn(
    "inline-flex min-h-[40px] items-center rounded-full px-4 text-sm font-semibold",
    primary ? "bg-primary text-primary-foreground" : "border bg-card",
  );
  const [path, hash] = href.split("#");
  if (hash && typeof window !== "undefined" && window.location.pathname === path) {
    return (
      <a
        href={href}
        className={className}
        onClick={(e) => {
          e.preventDefault();
          document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
      >
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

/** «بانتظار إجراء من سبق» أولًا، والأقدم في الأعلى، مع من عليه الدور والزر المباشر. */
export function AdminActionQueue() {
  const [side, setSide] = useState<"sabq" | "agency">("sabq");
  const { data, isLoading, error } = useQuery<{ sabq: ActionQueueItem[]; agency: ActionQueueItem[] }>({
    queryKey: ["/api/admin/publishers/action-queue"],
    refetchInterval: 60_000,
  });
  const sabq = Array.isArray(data?.sabq) ? data!.sabq : [];
  const agency = Array.isArray(data?.agency) ? data!.agency : [];
  const items = side === "sabq" ? sabq : agency;
  const lateCount = sabq.filter((i) => waitTone(i.waitingSince) === "late").length;

  return (
    <section
      className="overflow-hidden rounded-[20px] bg-card shadow-[0_1px_2px_rgba(27,43,58,.04),0_8px_24px_rgba(27,43,58,.06)]"
      data-testid="admin-action-queue"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pb-3 pt-4 md:px-5">
        <div>
          <h2 className="text-lg font-bold">بانتظار إجراء</h2>
          <p className="text-sm text-muted-foreground">
            {lateCount ? `${formatNumber(lateCount)} تجاوزت يومًا عند سبق. ` : ""}الأقدم أولًا.
          </p>
        </div>
        <div className="flex gap-2">
          {(["sabq", "agency"] as const).map((key) => {
            const count = key === "sabq" ? sabq.length : agency.length;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSide(key)}
                className={cn(
                  "min-h-[40px] rounded-full px-4 text-sm font-semibold transition-colors",
                  side === key ? "bg-primary text-primary-foreground shadow-[0_6px_16px_rgba(30,155,230,.3)]" : "bg-muted/60 text-muted-foreground",
                )}
                data-testid={`queue-tab-${key}`}
              >
                {key === "sabq" ? "عند سبق" : "عند الوكالات"} <bdi className="tabular-nums">{formatNumber(count)}</bdi>
              </button>
            );
          })}
        </div>
      </div>

      {isLoading ? (
        <div className="px-5 pb-5">
          <Skeleton className="h-32 rounded-2xl" />
        </div>
      ) : error ? (
        <div className="border-t border-border/60 px-5 py-8 text-center text-sm text-muted-foreground">
          {(error as Error).message || "تعذر تحميل قائمة العمل"}
        </div>
      ) : items.length === 0 ? (
        <div className="border-t border-border/60 px-5 py-8 text-center text-sm text-muted-foreground">
          {side === "sabq" ? "لا شيء ينتظر سبق الآن." : "لا شيء ينتظر الوكالات الآن."}
        </div>
      ) : (
        <ul>
          {items.slice(0, 30).map((item) => {
            const tone = waitTone(item.waitingSince);
            return (
              <li
                key={`${item.kind}-${item.id}`}
                className="flex flex-wrap items-center gap-3 border-t border-border/60 px-4 py-3.5 md:px-5"
                data-testid={`queue-item-${item.id}`}
              >
                <span className={cn("h-2 w-2 shrink-0 rounded-full", TONE_DOT[tone])} aria-hidden />
                <div className="min-w-0 flex-[1_1_280px]">
                  <div className="truncate font-semibold">{item.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {[ACTION_KIND_LABELS[item.kind], item.agencyName, item.detail].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <div className="w-36 text-xs">
                  <div className={cn("font-semibold", TONE_TEXT[tone])}>{waitLabel(item.waitingSince)}</div>
                  <div className="text-muted-foreground">الدور على: {item.owner}</div>
                </div>
                <QueueAction href={item.href} primary={side === "sabq"}>
                  {item.action}
                </QueueAction>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** الحملات الجارية عند كل الوكالات: تقدّم كل ملف وقراءاته، وفتح تقريره. */
export function AdminRunningCampaigns() {
  const { data, isLoading, error } = useQuery<{ campaigns: CampaignSummary[] }>({
    queryKey: ["/api/admin/publishers/campaigns"],
  });
  const campaigns = Array.isArray(data?.campaigns) ? data!.campaigns : [];
  // قبل تنفيذ ملف SQL على قاعدة ما يعيد الخادم 503: لا نعرض قسمًا فارغًا بخطأ
  if (isLoading || error || campaigns.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-[20px] bg-card shadow-sm" data-testid="admin-running-campaigns">
      <div className="px-4 pb-2 pt-4 md:px-5">
        <h2 className="text-lg font-bold">الحملات الجارية</h2>
      </div>
      <ul>
        {campaigns.map((c) => {
          const period = campaignPeriod(c.startsOn, c.endsOn);
          return (
            <li key={c.id} className="border-t border-border/60">
              <Link
                href={`/dashboard/admin/publisher-campaigns/${c.id}`}
                className="flex flex-wrap items-center gap-4 px-4 py-3.5 hover:bg-muted/40 md:px-5"
              >
                <div className="min-w-0 flex-[1_1_240px]">
                  <div className="font-semibold">{c.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {[c.agencyName, c.clientName ? `العميل: ${c.clientName}` : null, period].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <div className="w-full sm:w-52">
                  <CampaignProgressBar counts={c.counts} />
                  <div className="mt-1 text-xs text-muted-foreground">
                    <bdi className="tabular-nums">{formatNumber(c.counts.published)}</bdi> منشورة من{" "}
                    <bdi className="tabular-nums">{formatNumber(c.counts.total)}</bdi>
                    {c.counts.withSabq ? ` · ${formatNumber(c.counts.withSabq)} عند المحرر` : ""}
                  </div>
                </div>
                <div className="w-24 text-left">
                  <bdi className="block font-bold tabular-nums">{formatNumber(c.views)}</bdi>
                  <span className="text-xs text-muted-foreground">قراءة</span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
