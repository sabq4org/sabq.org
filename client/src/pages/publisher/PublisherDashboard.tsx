import { useEffect, useState, type ReactNode, type ComponentType } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { usePublisherAccess } from "@/hooks/usePublisherAccess";
import { useAuth } from "@/hooks/useAuth";
import { PublisherLayout } from "@/components/publisher/PublisherLayout";
import {
  PublisherRequestDialog,
  REQUEST_TYPE_LABELS,
} from "@/components/publisher/PublisherRequestDialog";
import {
  Tooltip as UiTooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  FileText,
  Eye,
  Package,
  Calendar,
  AlertTriangle,
  Plus,
  ArrowLeft,
  TrendingUp,
  Clock,
  Sparkles,
  ExternalLink,
  Send,
  Hourglass,
  PenLine,
  MessageSquareWarning,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/utils";
import { formatCompactNumber, formatDateShort } from "@/lib/format";

interface PortalOverview {
  publisher: {
    id: string;
    agencyName: string;
    agencyNameEn: string | null;
    contactPerson: string;
    email: string;
    phoneNumber: string;
    logoUrl: string | null;
    isActive: boolean;
    publishingEndsAt: string | null;
    autoPublish: boolean;
  };
  publishBlock: { reason: string; requestType: string } | null;
  openRequest: { id: string; type: string; createdAt: string } | null;
  stats: {
    totalArticles: number;
    publishedArticles: number;
    draftArticles: number;
    publishedThisMonth: number;
    totalViews: number;
    pendingReview: number;
    needsChanges: number;
  };
  activeCredit: {
    packageName: string;
    totalCredits: number;
    usedCredits: number;
    remainingCredits: number;
    expiryDate: string | null;
    isUnlimited?: boolean;
  } | null;
  recentArticles: Array<{
    id: string;
    title: string;
    status: string;
    englishSlug: string | null;
    views: number | null;
    createdAt: string;
    publishedAt: string | null;
  }>;
  topArticles: Array<{
    id: string;
    title: string;
    englishSlug: string | null;
    views: number | null;
    publishedAt: string | null;
  }>;
  monthlyPublishing: Array<{ month: string; published: number; views: number }>;
  attention: Array<{
    type: string;
    severity: "warning" | "critical";
    message: string;
    action?:
      | { kind: "request"; requestType: string; label: string }
      | { kind: "link"; href: string; label: string };
  }>;
}

const formatViews = (views: number | null | undefined) => formatCompactNumber(views);

const statusBadge = (status: string) => {
  const map: Record<string, { label: string; className: string }> = {
    draft: { label: "مسودة", className: "bg-muted text-muted-foreground" },
    pending_review: {
      label: "قيد المراجعة",
      className: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
    },
    published: {
      label: "منشور",
      className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
    },
    archived: {
      label: "مؤرشف",
      className: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
    },
  };
  const config = map[status] || { label: status, className: "bg-muted text-muted-foreground" };
  return (
    <Badge variant="outline" className={cn("border-0", config.className)}>
      {config.label}
    </Badge>
  );
};

function KpiCard({
  title,
  value,
  hint,
  icon: Icon,
  iconClass,
  testId,
  children,
}: {
  title: string;
  value: ReactNode;
  hint?: string;
  icon: ComponentType<{ className?: string }>;
  iconClass: string;
  testId: string;
  children?: ReactNode;
}) {
  return (
    <Card
      data-testid={testId}
      className="group relative overflow-hidden border-border/60 shadow-sm transition-shadow hover:shadow-md"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -start-6 -top-6 h-24 w-24 rounded-full bg-primary/[0.06] transition-transform group-hover:scale-110"
      />
      <CardHeader className="relative flex flex-row items-start justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className={cn("rounded-xl p-2", iconClass)}>
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent className="relative">
        <div className="text-3xl font-bold tracking-tight">{value}</div>
        {hint ? <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p> : null}
        {children}
      </CardContent>
    </Card>
  );
}

function PipelineRow({
  icon: Icon,
  label,
  value,
  tone,
  testId,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone: string;
  testId: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </span>
      <span className={cn("font-bold tabular-nums", value === 0 ? "text-muted-foreground/60" : tone)} data-testid={testId}>
        {value}
      </span>
    </div>
  );
}

export default function PublisherDashboard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  usePublisherAccess();
  const [requestType, setRequestType] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<PortalOverview>({
    queryKey: ["/api/publisher/portal/overview"],
  });

  useEffect(() => {
    if (error) {
      toast({
        variant: "destructive",
        title: "خطأ",
        description: "لا يمكن الوصول إلى لوحة الناشر. يرجى التأكد من صلاحياتك.",
      });
      setLocation("/");
    }
  }, [error, setLocation, toast]);

  if (isLoading || !data) {
    return (
      <PublisherLayout>
        <div className="space-y-6" dir="rtl">
          <Skeleton className="h-20 w-full rounded-2xl" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-36 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
      </PublisherLayout>
    );
  }

  const { publisher, stats, activeCredit, attention } = data;
  const recentArticles = Array.isArray(data.recentArticles) ? data.recentArticles : [];
  const topArticles = Array.isArray(data.topArticles) ? data.topArticles : [];
  const monthlyPublishing = Array.isArray(data.monthlyPublishing) ? data.monthlyPublishing : [];

  const windowDaysLeft = publisher.publishingEndsAt
    ? Math.ceil((new Date(publisher.publishingEndsAt).getTime() - Date.now()) / 86_400_000)
    : null;

  const creditPercent =
    activeCredit && activeCredit.totalCredits > 0
      ? Math.round((activeCredit.remainingCredits / activeCredit.totalCredits) * 100)
      : 0;

  const isOpenEndedCredit = !!activeCredit?.isUnlimited;

  const firstName = user?.firstName?.trim();
  const greeting = firstName ? `أهلاً ${firstName}` : "أهلاً بك";

  const publishBlock = data.publishBlock;
  const openRequest = data.openRequest;
  // «مسودة» الحقيقية = ما لم يُرسل بعد. الرقم القديم كان يجمع الثلاثة معاً
  // فيرى الناشر ٩ «مسودات» بينما ٧ منها عند المحرر ولا شيء عليه فيها.
  const trueDrafts = Math.max(0, stats.draftArticles - stats.pendingReview - stats.needsChanges);

  const newArticleButton = (
    <Button
      size="lg"
      className="rounded-xl shadow-sm"
      data-testid="button-new-article"
      disabled={!!publishBlock}
    >
      <Plus className="ml-2 h-4 w-4" />
      خبر جديد
    </Button>
  );

  return (
    <PublisherLayout>
      <div className="w-full space-y-6" dir="rtl">
        {/* ترحيب + إجراء سريع */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 text-xs font-medium text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              لوحة أداء الوكالة
            </div>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl" data-testid="text-dashboard-greeting">
              {greeting}
            </h1>
            <p className="text-sm text-muted-foreground">
              ملخص نشر {publisher.agencyName}
              {publisher.publishingEndsAt && windowDaysLeft !== null && windowDaysLeft >= 0
                ? ` · متاح حتى ${formatDateShort(publisher.publishingEndsAt)}`
                : ""}
            </p>
          </div>

          {/* الزر المعطّل كان صامتاً تماماً: ضغطة بلا استجابة ولا سبب */}
          {publishBlock ? (
            <div className="flex flex-col items-start gap-1.5 sm:items-end">
              <UiTooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0}>{newArticleButton}</span>
                </TooltipTrigger>
                <TooltipContent>{publishBlock.reason}</TooltipContent>
              </UiTooltip>
              <p className="text-xs text-muted-foreground" data-testid="text-publish-blocked">
                {publishBlock.reason}
              </p>
            </div>
          ) : (
            <Link href="/dashboard/publisher/article/new">{newArticleButton}</Link>
          )}
        </div>

        {/* طلب مفتوح لدى الإدارة */}
        {openRequest && (
          <div
            className="flex flex-wrap items-center gap-2 rounded-xl border border-sky-200 bg-sky-50/80 px-4 py-3 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-100"
            data-testid="banner-open-request"
          >
            <Hourglass className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              طلب «{REQUEST_TYPE_LABELS[openRequest.type] ?? openRequest.type}» قيد المعالجة لدى الإدارة منذ{" "}
              {formatDateShort(openRequest.createdAt)}
            </span>
          </div>
        )}

        {/* يتطلب انتباهك */}
        {attention.length > 0 && (
          <div className="space-y-2" data-testid="attention-rail">
            {attention.map((item) => (
              <div
                key={item.type}
                className={cn(
                  "flex flex-col gap-2 rounded-xl border p-3.5 text-sm shadow-sm sm:flex-row sm:items-center",
                  item.severity === "critical"
                    ? "border-red-200 bg-red-50/90 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
                    : "border-amber-200 bg-amber-50/90 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
                )}
                data-testid={`attention-${item.type}`}
              >
                <div className="flex flex-1 items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="leading-relaxed">{item.message}</span>
                </div>

                {item.action?.kind === "link" && (
                  <Link href={item.action.href}>
                    <Button variant="outline" size="sm" className="shrink-0 bg-background/60">
                      {item.action.label}
                    </Button>
                  </Link>
                )}
                {item.action?.kind === "request" && !openRequest && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 gap-1.5 bg-background/60"
                    onClick={() => setRequestType(item.action!.kind === "request" ? item.action!.requestType : null)}
                    data-testid={`button-request-${item.type}`}
                  >
                    <Send className="h-3.5 w-3.5" />
                    {item.action.label}
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* مؤشرات الأداء */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            testId="card-kpi-credits"
            title="الرصيد المتبقي"
            icon={Package}
            iconClass="bg-teal-500/10 text-teal-600 dark:text-teal-300"
            value={
              activeCredit ? (
                <span data-testid="text-remaining-credits">
                  {isOpenEndedCredit ? (
                    <span className="inline-flex items-baseline gap-1.5">
                      مفتوحة
                      <span className="text-2xl text-muted-foreground">∞</span>
                    </span>
                  ) : (
                    <>
                      {activeCredit.remainingCredits}
                      <span className="text-base font-normal text-muted-foreground">
                        {" "}
                        / {activeCredit.totalCredits}
                      </span>
                    </>
                  )}
                </span>
              ) : (
                <span className="text-lg font-semibold text-muted-foreground">لا توجد باقة</span>
              )
            }
            hint={
              activeCredit
                ? `${activeCredit.packageName}${
                    activeCredit.expiryDate ? ` · حتى ${formatDateShort(activeCredit.expiryDate)}` : ""
                  }`
                : undefined
            }
          >
            {activeCredit && !isOpenEndedCredit ? (
              <Progress value={creditPercent} className="mt-3 h-1.5" />
            ) : null}
          </KpiCard>

          <KpiCard
            testId="card-kpi-month"
            title="منشور هذا الشهر"
            icon={TrendingUp}
            iconClass="bg-sky-500/10 text-sky-600 dark:text-sky-300"
            value={<span data-testid="text-published-month">{stats.publishedThisMonth}</span>}
            hint={`من إجمالي ${stats.publishedArticles} منشور`}
          />

          {/* رقم واحد لا يكفي: «تحتاج تعديلاتك» مطلوب منكم، و«عند المحرر»
              ليس مطلوباً منكم، و«مسودة» لم تُرسل أصلاً. */}
          <KpiCard
            testId="card-kpi-pipeline"
            title="تحت الإجراء"
            icon={Clock}
            iconClass="bg-amber-500/10 text-amber-600 dark:text-amber-300"
            value={
              <span data-testid="text-draft-count">
                {stats.needsChanges + stats.pendingReview + trueDrafts}
              </span>
            }
          >
            <div className="mt-3 space-y-1.5 text-xs">
              <PipelineRow
                icon={MessageSquareWarning}
                label="تحتاج تعديلاتك"
                value={stats.needsChanges}
                tone="text-red-600 dark:text-red-300"
                testId="text-needs-changes-count"
              />
              <PipelineRow
                icon={Clock}
                label="عند المحرر"
                value={stats.pendingReview}
                tone="text-amber-600 dark:text-amber-300"
                testId="text-pending-count"
              />
              <PipelineRow
                icon={PenLine}
                label="مسودة لم تُرسل"
                value={trueDrafts}
                tone="text-muted-foreground"
                testId="text-true-drafts-count"
              />
            </div>
          </KpiCard>

          <KpiCard
            testId="card-kpi-views"
            title="إجمالي المشاهدات"
            icon={Eye}
            iconClass="bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
            value={<span data-testid="text-total-views">{formatViews(stats.totalViews)}</span>}
            hint={`على ${stats.publishedArticles} مادة منشورة`}
          />
        </div>

        {/* النشر الشهري */}
        {monthlyPublishing.length > 0 && (
          <Card
            data-testid="card-monthly-chart"
            className="border-border/60 shadow-sm"
          >
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <span className="rounded-lg bg-primary/10 p-1.5 text-primary">
                  <TrendingUp className="h-4 w-4" />
                </span>
                النشر خلال الأشهر الأخيرة
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={monthlyPublishing}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" vertical={false} />
                  <XAxis dataKey="month" reversed tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis orientation="right" allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid hsl(var(--border))",
                      background: "hsl(var(--background))",
                    }}
                  />
                  <Bar
                    dataKey="published"
                    name="مواد منشورة"
                    fill="hsl(var(--primary))"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={48}
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <Card data-testid="card-recent-articles" className="border-border/60 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <span className="rounded-lg bg-sky-500/10 p-1.5 text-sky-600 dark:text-sky-300">
                  <FileText className="h-4 w-4" />
                </span>
                آخر المواد
              </CardTitle>
              <Link href="/dashboard/publisher/articles">
                <Button variant="ghost" size="sm" className="rounded-lg" data-testid="button-view-all-articles">
                  عرض الكل
                  <ArrowLeft className="mr-1.5 h-4 w-4" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {recentArticles.length === 0 ? (
                <div className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
                  لا توجد مواد بعد — ابدأ بخبر جديد
                </div>
              ) : (
                <div className="space-y-2">
                  {recentArticles.map((article) => (
                    <div
                      key={article.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-transparent bg-muted/30 px-3 py-2.5 transition-colors hover:border-border hover:bg-muted/50"
                      data-testid={`recent-article-${article.id}`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{article.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatDateShort(article.publishedAt || article.createdAt)}
                          {article.status === "published" && ` · ${formatViews(article.views)}`}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {statusBadge(article.status)}
                        {article.status === "published" && article.englishSlug ? (
                          <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                            <a
                              href={`/article/${article.englishSlug}`}
                              target="_blank"
                              rel="noreferrer"
                              aria-label="فتح المادة"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-top-articles" className="border-border/60 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <span className="rounded-lg bg-emerald-500/10 p-1.5 text-emerald-600 dark:text-emerald-300">
                  <Eye className="h-4 w-4" />
                </span>
                الأعلى مشاهدة
              </CardTitle>
            </CardHeader>
            <CardContent>
              {topArticles.length === 0 ? (
                <div className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
                  لا توجد مواد منشورة بعد
                </div>
              ) : (
                <div className="space-y-2">
                  {topArticles.map((article, index) => (
                    <div
                      key={article.id}
                      className="flex items-center gap-3 rounded-xl border border-transparent bg-muted/30 px-3 py-2.5 transition-colors hover:border-border hover:bg-muted/50"
                      data-testid={`top-article-${article.id}`}
                    >
                      <span
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                          index === 0
                            ? "bg-amber-400/20 text-amber-700 dark:text-amber-300"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{article.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatDateShort(article.publishedAt)}
                        </p>
                      </div>
                      <Badge variant="secondary" className="shrink-0 rounded-lg font-medium">
                        <Eye className="ml-1 h-3 w-3" />
                        {formatViews(article.views)}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* شريط معلومات خفيف */}
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-border/80 bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
          {publisher.publishingEndsAt ? (
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              نافذة النشر: حتى {formatDateShort(publisher.publishingEndsAt)}
            </span>
          ) : null}
          {activeCredit ? (
            <span className="inline-flex items-center gap-1.5">
              <Package className="h-3.5 w-3.5" />
              الباقة النشطة: {activeCredit.packageName}
            </span>
          ) : null}
          <div className="ms-auto flex items-center gap-3">
            {!openRequest && (
              <button
                type="button"
                className="inline-flex items-center gap-1.5 text-primary hover:underline"
                onClick={() => setRequestType("renewal")}
                data-testid="button-open-request-dialog"
              >
                <Send className="h-3.5 w-3.5" />
                طلب من الإدارة
              </button>
            )}
            <Link href="/dashboard/publisher/credits" className="text-primary hover:underline">
              تفاصيل الرصيد
            </Link>
          </div>
        </div>
      </div>

      <PublisherRequestDialog
        open={requestType !== null}
        onOpenChange={(open) => !open && setRequestType(null)}
        defaultType={requestType ?? undefined}
      />
    </PublisherLayout>
  );
}
