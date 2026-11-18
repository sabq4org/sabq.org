import { useMemo } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ChevronLeft, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardAnnouncementBanner } from "@/components/DashboardAnnouncementBanner";
import { cn } from "@/lib/utils";
import { hasPermission } from "@/hooks/useAuth";

/**
 * «مكتبك الآن»: لوحة النظرة العامة لدور مدير المحتوى وحده.
 * تبني الصفحة حول سؤال واحد: ماذا ينتظر قراري الآن؟
 * - شريط مسار من 5 خطوات بدل الأقسام الثلاثة المكررة.
 * - «بانتظار قرارك»: أقدم المواد المرفوعة للمراجعة بعناوينها.
 * - المجدول القادم صفوفًا مضغوطة، و«أدواتك» حسب الصلاحية فقط.
 * البيانات من /api/admin/dashboard/pulse (نفس مفتاح الكاش في NewsroomPulseDashboard).
 */

export interface DeskPulse {
  articles: {
    publishedToday: number;
    publishedYesterday: number;
    pendingReview: number;
    needsChanges: number;
    draft: number;
    scheduled: number;
  };
  upcomingSchedule: Array<{ id: string; title: string; scheduledAt: string | null }>;
  reviewQueue?: Array<{
    id: string;
    title: string;
    articleType: string;
    categoryName: string | null;
    authorName: string | null;
    riskLabel: string | null;
    waitingSince: string;
  }>;
  generatedAt: string;
}

type DeskUser = Parameters<typeof hasPermission>[0] & { firstName?: string | null };

const RIYADH = "Asia/Riyadh";
const num = (v?: number) => (v ?? 0).toLocaleString("en-US");

const timeFmt = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: RIYADH,
});
const dayFmt = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: RIYADH,
});
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: RIYADH });

const RISK_LABELS: Record<string, { label: string; className: string }> = {
  safe: { label: "آمن", className: "bg-primary/10 text-primary" },
  needs_look: { label: "يحتاج نظرة", className: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  sensitive: { label: "حساس", className: "bg-orange-500/10 text-orange-700 dark:text-orange-300" },
};

const TYPE_LABELS: Record<string, string> = {
  opinion: "رأي",
  analysis: "تحليل",
  infographic: "إنفوجراف",
  column: "عمود",
};

export function waitingLabel(sinceIso: string, nowMs: number): string {
  const since = new Date(sinceIso).getTime();
  if (!Number.isFinite(since)) return "";
  const minutes = Math.max(0, Math.floor((nowMs - since) / 60_000));
  if (minutes < 1) return "الآن";
  if (minutes < 60) return `منذ ${minutes} د`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `منذ ${hours} س`;
  return `منذ ${Math.floor(hours / 24)} يوم`;
}

function dayHeading(iso: string, nowMs: number): string {
  const key = dayKeyFmt.format(new Date(iso));
  if (key === dayKeyFmt.format(new Date(nowMs))) return "اليوم";
  if (key === dayKeyFmt.format(new Date(nowMs + 86_400_000))) return `غدًا · ${dayFmt.format(new Date(iso))}`;
  return dayFmt.format(new Date(iso));
}

type FlowStep = {
  key: string;
  label: string;
  count: number;
  href: string;
  hint?: string;
  hintTone?: "link" | "good";
  /** الخطوة التي تنتظر قرار مدير المحتوى: تُلوَّن بالأزرق حين فيها مواد. */
  urgent?: boolean;
};

function FlowStrip({ steps }: { steps: FlowStep[] }) {
  return (
    <nav
      aria-label="مسار المواد"
      className="flex max-w-full overflow-x-auto rounded-2xl bg-card shadow-sm ring-1 ring-border/60 md:grid md:grid-cols-5 md:overflow-hidden"
      data-testid="cm-flow"
    >
      {steps.map((step, i) => {
        const hot = Boolean(step.urgent && step.count > 0);
        const empty = step.count === 0;
        return (
          <Link
            key={step.key}
            href={step.href}
            data-testid={`cm-flow-${step.key}`}
            className={cn(
              "w-[112px] shrink-0 px-4 py-3 transition-colors md:w-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
              i > 0 && "border-s border-border/60",
              hot ? "bg-primary text-primary-foreground" : "hover:bg-muted/40",
            )}
          >
            <div
              className={cn(
                "text-2xl font-bold tabular-nums leading-tight",
                empty && !hot && "text-muted-foreground/50",
              )}
              dir="ltr"
              style={{ textAlign: "right" }}
            >
              {num(step.count)}
            </div>
            <div className={cn("text-[13px]", hot ? "text-primary-foreground/85" : "text-muted-foreground")}>
              {step.label}
            </div>
            {step.hint && (
              <div
                className={cn(
                  "mt-0.5 hidden text-xs md:block",
                  hot
                    ? "text-primary-foreground/85"
                    : step.hintTone === "good"
                      ? "text-emerald-700 dark:text-emerald-300"
                      : "text-primary",
                )}
              >
                {step.hint}
              </div>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function Panel({
  title,
  action,
  children,
  testId,
}: {
  title: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <section className="rounded-2xl bg-card shadow-sm ring-1 ring-border/60" data-testid={testId}>
      <header className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3 sm:px-5">
        <h2 className="text-base font-bold text-foreground">{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

function PanelLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-0.5 text-[13px] font-medium text-primary hover:underline">
      {children}
      <ChevronLeft className="h-3.5 w-3.5" />
    </Link>
  );
}

export function ContentManagerDesk({ user }: { user: DeskUser }) {
  const canSocial = hasPermission(user, "social_publish.view");
  const canTicker = hasPermission(user, "breaking_ticker.manage");

  const pulseQuery = useQuery<DeskPulse>({
    queryKey: ["/api/admin/dashboard/pulse"],
    refetchInterval: 120_000,
  });
  const { data: socialRaw } = useQuery<{ scheduledUpcoming: number; pendingAuthorProposals: number }>({
    queryKey: ["/api/social-publishing/stats"],
    enabled: canSocial,
    refetchInterval: 60_000,
  });
  const { data: tickerRaw } = useQuery<{ topic?: { topicTitle?: string } } | null>({
    queryKey: ["/api/breaking-ticker/active"],
    enabled: canTicker,
    refetchInterval: 120_000,
  });

  const pulse = pulseQuery.data ?? null;
  const nowMs = pulse?.generatedAt ? new Date(pulse.generatedAt).getTime() : Date.now();
  const queue = Array.isArray(pulse?.reviewQueue) ? pulse.reviewQueue : [];
  const schedule = Array.isArray(pulse?.upcomingSchedule) ? pulse.upcomingSchedule : [];
  const a = pulse?.articles;

  const riyadhHour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: RIYADH }).format(new Date()));
  const greeting = riyadhHour < 12 ? "صباح الخير" : "مساء الخير";
  const today = useMemo(
    () =>
      new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: RIYADH,
      }).format(new Date()),
    [],
  );

  const scheduleGroups = useMemo(() => {
    const groups: Array<{ heading: string; items: typeof schedule }> = [];
    for (const item of schedule.slice(0, 5)) {
      if (!item.scheduledAt) continue;
      const heading = dayHeading(item.scheduledAt, nowMs);
      const last = groups[groups.length - 1];
      if (last && last.heading === heading) last.items.push(item);
      else groups.push({ heading, items: [item] });
    }
    return groups;
  }, [schedule, nowMs]);

  const nextScheduled = schedule.find((s) => s.scheduledAt)?.scheduledAt ?? null;
  const oldestWaiting = queue[0]?.waitingSince ?? null;

  const steps: FlowStep[] = a
    ? [
        { key: "draft", label: "مسودات قيد الإعداد", count: a.draft, href: "/dashboard/articles?status=draft" },
        {
          key: "review",
          label: "بانتظار مراجعتك",
          count: a.pendingReview,
          href: "/dashboard/articles?status=draft",
          urgent: true,
          hint: oldestWaiting ? `أقدمها ${waitingLabel(oldestWaiting, nowMs)}` : undefined,
        },
        {
          key: "changes",
          label: "أُعيدت للتعديل",
          count: a.needsChanges,
          href: "/dashboard/articles?status=draft",
        },
        {
          key: "scheduled",
          label: "مجدولة",
          count: a.scheduled,
          href: "/dashboard/articles?status=scheduled",
          hint: nextScheduled ? `التالية ${timeFmt.format(new Date(nextScheduled))}` : undefined,
          hintTone: "link",
        },
        {
          key: "published",
          label: "نُشرت اليوم",
          count: a.publishedToday,
          href: "/dashboard/articles?status=published",
          hint: `أمس حتى الآن ${num(a.publishedYesterday)}`,
          hintTone: "good",
        },
      ]
    : [];

  const quietNotes = [
    a && a.needsChanges === 0 ? "لا مواد مُعادة للتعديل" : null,
    canSocial && (socialRaw?.pendingAuthorProposals ?? 0) === 0 ? "لا مقترحات X معلقة" : null,
  ].filter(Boolean) as string[];

  return (
    <main dir="rtl" className="mx-auto max-w-[1240px] space-y-5 pb-24 sm:pb-10" data-testid="content-manager-desk">
      <DashboardAnnouncementBanner deferLoading={pulseQuery.isLoading} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[13px] text-muted-foreground">
            {greeting} {user.firstName || ""} · {today}
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">مكتبك الآن</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={() => pulseQuery.refetch()}
            disabled={pulseQuery.isFetching}
            aria-label="تحديث"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", pulseQuery.isFetching && "animate-spin")} />
          </Button>
          <Button asChild size="sm" className="gap-1.5 rounded-full">
            <Link href="/dashboard/articles/new">
              <Plus className="h-4 w-4" />
              خبر جديد
            </Link>
          </Button>
        </div>
      </div>

      {pulseQuery.isLoading ? (
        <Skeleton className="h-[88px] w-full rounded-2xl" />
      ) : pulseQuery.isError || !a ? (
        <div className="rounded-2xl bg-card p-6 text-center shadow-sm ring-1 ring-border/60">
          <p className="font-semibold">تعذر تحميل حالة المكتب</p>
          <Button className="mt-3 rounded-full" size="sm" onClick={() => pulseQuery.refetch()}>
            إعادة المحاولة
          </Button>
        </div>
      ) : (
        <FlowStrip steps={steps} />
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <Panel
          testId="cm-review-queue"
          title={
            <span className="flex items-center gap-2">
              بانتظار قرارك
              {a && a.pendingReview > 0 && (
                <span className="rounded-full bg-amber-500/10 px-2.5 text-xs font-semibold tabular-nums text-amber-700 dark:text-amber-300">
                  {num(a.pendingReview)}
                </span>
              )}
            </span>
          }
          action={<PanelLink href="/dashboard/articles?status=draft">كل المسودات</PanelLink>}
        >
          <div className="space-y-2.5 p-3">
            {pulseQuery.isLoading &&
              [1, 2].map((i) => <Skeleton key={i} className="h-[72px] w-full rounded-xl" />)}
            {!pulseQuery.isLoading && queue.length === 0 && (
              <div className="flex items-center gap-2 px-2 py-6 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                لا مواد بانتظار المراجعة الآن
              </div>
            )}
            {queue.map((item) => {
              const risk = item.riskLabel ? RISK_LABELS[item.riskLabel] : undefined;
              const type = TYPE_LABELS[item.articleType];
              return (
                <div
                  key={item.id}
                  className="flex flex-col gap-2 rounded-xl border border-border/60 px-3.5 py-3 sm:flex-row sm:items-center"
                  data-testid="cm-review-item"
                >
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/dashboard/articles/${item.id}/edit`}
                      className="line-clamp-2 font-semibold leading-snug text-foreground hover:text-primary"
                    >
                      {item.title || "بلا عنوان"}
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
                      {item.authorName && <span>{item.authorName}</span>}
                      {(type || item.categoryName) && <span>{[type, item.categoryName].filter(Boolean).join(" · ")}</span>}
                      <span className="tabular-nums">ينتظر {waitingLabel(item.waitingSince, nowMs)}</span>
                      {risk && (
                        <span className={cn("rounded-full px-2 py-px font-semibold", risk.className)}>{risk.label}</span>
                      )}
                    </div>
                  </div>
                  <Button asChild size="sm" className="shrink-0 self-start rounded-full sm:self-auto">
                    <Link href={`/dashboard/articles/${item.id}/edit`}>راجع وانشر</Link>
                  </Button>
                </div>
              );
            })}
          </div>
          {quietNotes.length > 0 && (
            <div className="flex items-center gap-2 border-t border-border/60 px-4 py-2.5 text-[13px] text-muted-foreground sm:px-5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              {quietNotes.join(" · ")}
            </div>
          )}
        </Panel>

        <div className="space-y-5">
          <Panel
            testId="cm-schedule"
            title="المجدول القادم"
            action={
              <PanelLink href="/dashboard/articles?status=scheduled">
                الكل {a ? <span className="tabular-nums">{num(a.scheduled)}</span> : null}
              </PanelLink>
            }
          >
            {scheduleGroups.length === 0 ? (
              <p className="px-5 py-5 text-sm text-muted-foreground">
                {pulseQuery.isLoading ? "جارٍ التحميل…" : "لا مواد مجدولة"}
              </p>
            ) : (
              <div className="py-1">
                {scheduleGroups.map((group) => (
                  <div key={group.heading}>
                    <div className="px-5 pb-0.5 pt-2 text-xs text-muted-foreground">{group.heading}</div>
                    <ul>
                      {group.items.map((item) => (
                        <li key={item.id} className="border-t border-border/40 first:border-t-0">
                          <Link
                            href={`/dashboard/articles/${item.id}/edit`}
                            className="flex items-baseline gap-3 px-5 py-2 hover:bg-muted/40"
                          >
                            <span className="w-16 shrink-0 text-[13px] font-semibold tabular-nums text-primary">
                              {item.scheduledAt ? timeFmt.format(new Date(item.scheduledAt)) : ""}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-sm text-foreground">{item.title}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {(canTicker || canSocial) && (
            <Panel testId="cm-tools" title="أدواتك">
              <div className="divide-y divide-border/60">
                {canTicker && (
                  <div className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                    <span>شريط العاجل</span>
                    <span className="flex min-w-0 items-center gap-2">
                      {tickerRaw?.topic ? (
                        <span className="truncate rounded-full bg-red-500/10 px-2.5 py-0.5 text-xs font-semibold text-red-700 dark:text-red-300">
                          نشط: {tickerRaw.topic.topicTitle}
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                          لا عاجل نشط
                        </span>
                      )}
                      <PanelLink href="/dashboard/breaking-ticker">إدارة</PanelLink>
                    </span>
                  </div>
                )}
                {canSocial && (
                  <Link
                    href="/dashboard/social-publishing"
                    className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-muted/40"
                  >
                    <span>تغريدات X المجدولة</span>
                    <span className="font-bold tabular-nums">{num(socialRaw?.scheduledUpcoming)}</span>
                  </Link>
                )}
                {canSocial && (socialRaw?.pendingAuthorProposals ?? 0) > 0 && (
                  <Link
                    href="/dashboard/social-publishing?filter=draft"
                    className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-muted/40"
                  >
                    <span>مقترحات X من الكتّاب</span>
                    <span className="rounded-full bg-amber-500/10 px-2.5 text-xs font-semibold tabular-nums text-amber-700 dark:text-amber-300">
                      {num(socialRaw?.pendingAuthorProposals)}
                    </span>
                  </Link>
                )}
              </div>
            </Panel>
          )}
        </div>
      </div>
    </main>
  );
}
