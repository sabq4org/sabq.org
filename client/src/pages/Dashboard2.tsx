/**
 * مركز قيادة سبق التحريري — `/dashboard2`
 *
 * صفحة موازية للوحة التحكم الحالية (`/dashboard` → NewsroomPulseDashboard).
 * - لا تعدّل اللوحة الحالية ولا أي مكوّن مشترك.
 * - تعتمد حصراً على APIs وبيانات قائمة (لا Backend جديد).
 * - كل قسم/رقم/إجراء يخضع لـ RBAC.
 *
 * قرأت قبل التنفيذ: `docs/systems/editorial/SYSTEM.md` و`docs/systems/auth-rbac/SYSTEM.md`
 * (وأُعيد استخدام أنظمة: dashboard pulse/stats, coverage-gaps, calendar, social-publishing,
 * push-notifications, media-library, smart-blocks, muqtarab, tasks — دون تكرار أي منها).
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BellRing,
  BookOpen,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Command as CommandIcon,
  Eye,
  FileClock,
  FilePenLine,
  FileText,
  Flame,
  Gauge,
  Heart,
  ImageIcon,
  Layers,
  List,
  MessageSquare,
  Newspaper,
  RefreshCw,
  Rows3,
  Search,
  Settings2,
  ShieldAlert,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
  WandSparkles,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { DashboardPageShell } from "@/components/dashboard/DashboardPageShell";
import { OnlineModeratorsWidget } from "@/components/OnlineModeratorsWidget";
import { LazySection } from "@/components/dashboard2/LazySection";
import { CommandPalette } from "@/components/dashboard2/CommandPalette";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { getHighestRole, hasAnyPermission, hasPermission, hasRole, useAuth, type User } from "@/hooks/useAuth";
import { useNav } from "@/nav/useNav";
import { resolveUserRole } from "@/lib/roleMapping";
import type { UserRole } from "@/nav/types";
import { PERMISSION_CODES } from "@shared/rbac-constants";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* أنواع الاستجابات                                                    */
/* ------------------------------------------------------------------ */

interface DashboardStats {
  articles: {
    total: number;
    published: number;
    draft: number;
    archived: number;
    scheduled: number;
    totalViews: number;
    viewsToday: number;
  };
  comments: { total: number; pending: number; approved: number; rejected: number };
  categories: { total: number };
  reactions: { total: number; todayCount: number };
  engagement: { averageTimeOnSite: number; totalReads: number; readsToday: number };
  mediaLibrary?: { totalFiles: number; totalSize: number };
  aiImages?: { total: number; thisWeek: number };
  smartBlocks?: { total: number };
  recentArticles: Array<{
    id: string;
    title: string;
    status: string;
    publishedAt?: string | null;
    createdAt?: string | null;
    views?: number;
    category?: { nameAr?: string | null } | null;
    author?: { firstName?: string | null; lastName?: string | null; email?: string | null } | null;
  }>;
  topArticles: Array<{ id: string; title: string; views: number; category?: { nameAr?: string | null } | null }>;
}

interface DashboardPulse {
  articles: {
    publishedToday: number;
    publishedYesterday: number;
    pendingReview: number;
    needsChanges: number;
    viewsYesterday: number;
  };
  comments: { receivedToday: number; moderatedToday: number; pendingOlderThanTwoHours: number };
  reactions: { yesterdayCount: number };
  engagement: { readsYesterday: number };
  trendingArticles: Array<{
    id: string;
    title: string;
    slug: string;
    views: number;
    recentViews: number;
    categoryName: string | null;
  }>;
  upcomingSchedule: Array<{ id: string; title: string; scheduledAt: string | null }>;
  hourlyViews: Array<{ hour: string; views: number }>;
  generatedAt: string;
}

interface CoverageGap {
  id: string;
  title: string;
  heatScore: number;
  momentumScore?: number | null;
  sourceName?: string | null;
  sourceCount?: number | null;
  publishedAt?: string | null;
  firstDetectedAt?: string;
  status: string;
}
interface CoverageGapsResponse {
  gaps: CoverageGap[];
}

interface CalendarReminder {
  id: string;
  eventTitle: string;
  reminderTime: string;
}
interface CalendarAssignment {
  id: string;
  eventTitle: string;
  status: string;
  role?: string | null;
}

interface MuqtarabReviewItem {
  id: string;
  title: string;
  angle?: { nameAr?: string | null } | null;
}

interface SocialStats {
  total: number;
  publishedToday: number;
  scheduledUpcoming: number;
  failed: number;
  pendingDrafts: number;
  pendingAuthorProposals: number;
}

interface PushLogStats {
  totalSent: number;
  totalFailed: number;
  successRate: number;
}

interface TaskStats {
  total: number;
  todo: number;
  inProgress: number;
  review: number;
  completed: number;
  overdue: number;
}

interface MediaStats {
  totalImages: number;
  aiGenerated: number;
  pendingAnalysis: number;
  topUsed: Array<{ id: string; title?: string | null; originalName?: string | null; url?: string | null; usage: number }>;
}

interface SmartBlocksSummary {
  total: number;
  active: number;
  inactive: number;
  scheduled: number;
  byPlacement: Record<string, number>;
}

interface TrendingKeyword {
  keyword: string;
  count: number;
  category?: string | null;
}

/* ------------------------------------------------------------------ */
/* أدوات مساعدة                                                        */
/* ------------------------------------------------------------------ */

const number = (value?: number | null) => (value ?? 0).toLocaleString("en-US");

function timeAgo(iso?: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff)) return "—";
  const mins = Math.max(1, Math.round(Math.abs(diff) / 60_000));
  const past = diff >= 0;
  const label =
    mins < 60
      ? `${number(mins)} دقيقة`
      : mins < 1440
        ? `${number(Math.round(mins / 60))} ساعة`
        : `${number(Math.round(mins / 1440))} يوم`;
  return past ? `قبل ${label}` : `بعد ${label}`;
}

function percentChange(current: number, previous: number) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

function riyadhDateKey(iso?: string | null) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function agendaBucket(iso?: string | null): "now" | "today" | "tomorrow" | "later" {
  if (!iso) return "later";
  const target = new Date(iso).getTime();
  if (!Number.isFinite(target)) return "later";
  const diffHours = (target - Date.now()) / 3_600_000;
  const todayKey = riyadhDateKey(new Date().toISOString());
  const targetKey = riyadhDateKey(iso);
  if (diffHours <= 3 && diffHours >= -6) return "now";
  if (targetKey === todayKey) return "today";
  const tomorrowKey = riyadhDateKey(new Date(Date.now() + 86_400_000).toISOString());
  if (targetKey === tomorrowKey) return "tomorrow";
  return "later";
}

function formatTime(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Riyadh",
  }).format(d);
}

/* ------------------------------------------------------------------ */
/* مكوّنات عرض صغيرة                                                  */
/* ------------------------------------------------------------------ */

type Tone = "danger" | "warning" | "info" | "success" | "neutral";

const TONE: Record<Tone, { text: string; bg: string; border: string; solid: string }> = {
  danger: { text: "text-destructive", bg: "bg-destructive/10", border: "border-destructive/25", solid: "bg-destructive" },
  warning: { text: "text-warning", bg: "bg-warning/10", border: "border-warning/25", solid: "bg-warning" },
  info: { text: "text-info", bg: "bg-info/10", border: "border-info/25", solid: "bg-info" },
  success: { text: "text-success", bg: "bg-success/10", border: "border-success/25", solid: "bg-success" },
  neutral: { text: "text-muted-foreground", bg: "bg-muted", border: "border-border", solid: "bg-muted-foreground/60" },
};

function StatusChip({ status }: { status: string }) {
  const map: Record<string, { label: string; tone: Tone }> = {
    published: { label: "منشور", tone: "success" },
    scheduled: { label: "مجدول", tone: "info" },
    draft: { label: "مسودة", tone: "neutral" },
    archived: { label: "مؤرشف", tone: "neutral" },
    pending_review: { label: "بانتظار المراجعة", tone: "warning" },
    needs_changes: { label: "تحتاج تعديلات", tone: "danger" },
  };
  const meta = map[status] ?? { label: status, tone: "neutral" as Tone };
  const tone = TONE[meta.tone];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold", tone.text, tone.bg, tone.border)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", tone.solid)} />
      {meta.label}
    </span>
  );
}

function SectionCard({
  icon: Icon,
  title,
  description,
  action,
  children,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("border-border/70 shadow-none", className)}>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-3">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </span>
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            {description ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p> : null}
          </div>
        </div>
        {action}
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  );
}

function InlineError({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/[0.06] px-4 py-5 text-center">
      <AlertTriangle className="h-5 w-5 text-destructive" />
      <p className="text-xs text-muted-foreground">تعذّر تحميل هذا القسم</p>
      {onRetry ? (
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onRetry}>
          إعادة المحاولة
        </Button>
      ) : null}
    </div>
  );
}

function EmptyLine({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border/80 bg-muted/20 px-4 py-5 text-center text-xs text-muted-foreground">
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* أقسام الصفحة                                                        */
/* ------------------------------------------------------------------ */

function NowStrip({
  stats,
  pulse,
  remindersCount,
  alertsCount,
  loading,
}: {
  stats?: DashboardStats;
  pulse?: DashboardPulse;
  remindersCount: number;
  alertsCount: number;
  loading: boolean;
}) {
  const viewsChange = pulse ? percentChange(stats?.articles.viewsToday ?? 0, pulse.articles.viewsYesterday) : 0;
  const items: {
    id: string;
    label: string;
    value: number;
    href: string;
    icon: LucideIcon;
    tone: Tone;
    hint?: string;
  }[] = [
    { id: "published", label: "نُشر اليوم", value: pulse?.articles.publishedToday ?? 0, href: "/dashboard/articles", icon: FileText, tone: "success", hint: pulse ? `أمس ${number(pulse.articles.publishedYesterday)}` : undefined },
    { id: "draft", label: "قيد التحرير", value: stats?.articles.draft ?? 0, href: "/dashboard/articles", icon: FilePenLine, tone: "neutral" },
    { id: "review", label: "بانتظار المراجعة", value: pulse?.articles.pendingReview ?? 0, href: "/dashboard/articles", icon: Clock3, tone: "warning" },
    { id: "changes", label: "تحتاج تعديلات", value: pulse?.articles.needsChanges ?? 0, href: "/dashboard/articles", icon: AlertTriangle, tone: "danger" },
    { id: "scheduled", label: "مجدول", value: stats?.articles.scheduled ?? 0, href: "#agenda", icon: CalendarClock, tone: "info" },
    { id: "events", label: "أحداث قريبة", value: remindersCount, href: "#agenda", icon: CalendarDays, tone: "info" },
    { id: "alerts", label: "تنبيهات", value: alertsCount, href: "#attention", icon: BellRing, tone: alertsCount > 0 ? "danger" : "neutral" },
  ];

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 xl:grid-cols-7" data-testid="d2-now-strip">
      {items.map((item) => {
        const tone = TONE[item.tone];
        const inner = (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[11px] font-semibold text-muted-foreground">{item.label}</span>
              <span className={cn("flex h-6 w-6 items-center justify-center rounded-md", tone.bg, tone.text)}>
                <item.icon className="h-3.5 w-3.5" />
              </span>
            </div>
            {loading ? (
              <Skeleton className="mt-2 h-7 w-12" />
            ) : (
              <div className="mt-1.5 text-2xl font-bold tabular-nums leading-none">{number(item.value)}</div>
            )}
            {item.hint || (item.id === "published" && pulse) ? (
              <div className="mt-1 text-[10px] text-muted-foreground tabular-nums">
                {item.hint ?? (viewsChange !== 0 ? `مشاهدات ${viewsChange > 0 ? "▲" : "▼"} ${Math.abs(viewsChange)}%` : "—")}
              </div>
            ) : null}
          </>
        );
        const className = cn(
          "rounded-xl border border-border/70 bg-card p-3 text-start transition-colors hover:border-primary/40 hover:bg-muted/30",
        );
        return item.href.startsWith("#") ? (
          <a key={item.id} href={item.href} className={className} data-testid={`d2-now-${item.id}`}>
            {inner}
          </a>
        ) : (
          <Link key={item.id} href={item.href} className={className} data-testid={`d2-now-${item.id}`}>
            {inner}
          </Link>
        );
      })}
    </div>
  );
}

interface PriorityItem {
  id: string;
  label: string;
  description: string;
  count: number;
  href: string;
  icon: LucideIcon;
  tone: Tone;
}

function NeedsAttention({ items, loading }: { items: PriorityItem[]; loading: boolean }) {
  const rank: Record<Tone, number> = { danger: 0, warning: 1, info: 2, success: 3, neutral: 4 };
  const sorted = [...items].sort((a, b) => rank[a.tone] - rank[b.tone] || b.count - a.count);

  return (
    <SectionCard
      icon={ShieldAlert}
      title="يحتاج تدخلك"
      description="الأعمال المرتّبة حسب الأهمية — لا يظهر لك إلا ما تملك صلاحية تنفيذه"
    >
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="flex items-center gap-2 rounded-xl border border-success/25 bg-success/[0.07] px-4 py-5 text-sm text-success">
          <CheckCircle2 className="h-4 w-4" />
          لا شيء ينتظرك الآن — كل الطوابير تحت السيطرة.
        </div>
      ) : (
        <ul className="space-y-2" data-testid="d2-attention-list">
          {sorted.map((item) => {
            const tone = TONE[item.tone];
            const rowClass = cn(
              "group flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5 transition-colors hover:border-primary/40 hover:bg-muted/30",
              item.tone === "danger" ? "border-destructive/25" : "border-border/70",
            );
            const rowInner = (
              <>
                <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", tone.bg, tone.text)}>
                  <item.icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{item.label}</div>
                  <div className="truncate text-xs text-muted-foreground">{item.description}</div>
                </div>
                <span className={cn("shrink-0 text-lg font-bold tabular-nums", tone.text)}>{number(item.count)}</span>
                <ArrowLeft className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:-translate-x-0.5" />
              </>
            );
            return (
              <li key={item.id}>
                {item.href.startsWith("#") ? (
                  <a href={item.href} className={rowClass} data-testid={`d2-attention-${item.id}`}>{rowInner}</a>
                ) : (
                  <Link href={item.href} className={rowClass} data-testid={`d2-attention-${item.id}`}>{rowInner}</Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

function LiveNewsroom({ recentArticles, canViewStats }: { recentArticles: DashboardStats["recentArticles"]; canViewStats: boolean }) {
  const list = Array.isArray(recentArticles) ? recentArticles.slice(0, 8) : [];
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,1fr)]">
      <SectionCard
        icon={Newspaper}
        title="غرفة الأخبار الحية"
        description="آخر ما أُنشئ أو حُدّث داخل التحرير — مع الحالة والمسؤول"
        action={
          <Button asChild variant="ghost" size="sm">
            <Link href="/dashboard/articles">كل المحتوى</Link>
          </Button>
        }
      >
        {list.length === 0 ? (
          <EmptyLine>لا نشاط تحريري حديث</EmptyLine>
        ) : (
          <ul className="divide-y divide-border/60" data-testid="d2-newsroom-list">
            {list.map((article) => {
              const authorName = article.author
                ? `${article.author.firstName ?? ""} ${article.author.lastName ?? ""}`.trim() || article.author.email || "—"
                : "—";
              return (
                <li key={article.id}>
                  <Link
                    href={`/dashboard/articles/${article.id}/edit`}
                    className="group flex items-center gap-3 py-2.5 transition-colors hover:bg-muted/30"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium group-hover:text-primary">{article.title}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        <span>{authorName}</span>
                        <span>·</span>
                        <span className="tabular-nums">{timeAgo(article.publishedAt || article.createdAt)}</span>
                        {article.category?.nameAr ? (
                          <>
                            <span>·</span>
                            <span>{article.category.nameAr}</span>
                          </>
                        ) : null}
                        {typeof article.views === "number" ? (
                          <>
                            <span>·</span>
                            <span className="tabular-nums">{number(article.views)} قراءة</span>
                          </>
                        ) : null}
                      </div>
                    </div>
                    <StatusChip status={article.status} />
                    <ArrowLeft className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:-translate-x-0.5" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      {canViewStats ? (
        <OnlineModeratorsWidget />
      ) : (
        <SectionCard icon={Users} title="الفريق">
          <EmptyLine>لا تملك صلاحية عرض حضور الفريق</EmptyLine>
        </SectionCard>
      )}
    </div>
  );
}

function WhatsHappening({
  trending,
  keywords,
  gaps,
  gapsLoading,
  gapsError,
  onRetryGaps,
  canViewStats,
}: {
  trending: DashboardPulse["trendingArticles"];
  keywords: TrendingKeyword[];
  gaps: CoverageGap[];
  gapsLoading: boolean;
  gapsError: boolean;
  onRetryGaps: () => void;
  canViewStats: boolean;
}) {
  const trendingList = Array.isArray(trending) ? trending.slice(0, 5) : [];
  const keywordList = Array.isArray(keywords) ? keywords.slice(0, 12) : [];
  const gapList = Array.isArray(gaps) ? gaps.slice(0, 4) : [];

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <SectionCard icon={Flame} title="ما يحدث الآن" description="الأسرع نمواً في آخر 24 ساعة، والموضوعات المتصاعدة">
        {trendingList.length === 0 ? (
          <EmptyLine>لا توجد بيانات كافية لرصد التصاعد</EmptyLine>
        ) : (
          <ol className="space-y-2" data-testid="d2-trending-list">
            {trendingList.map((article, index) => (
              <li key={article.id}>
                <Link
                  href={`/dashboard/articles/${article.id}/edit`}
                  className="group flex items-center gap-3 rounded-xl border border-border/70 bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/30"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary tabular-nums">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium group-hover:text-primary">{article.title}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                      {article.categoryName ? <span>{article.categoryName}</span> : null}
                      <span className="tabular-nums">
                        {article.recentViews ? `${number(article.recentViews)} خلال 24 ساعة` : `${number(article.views)} إجمالاً`}
                      </span>
                    </div>
                  </div>
                  <TrendingUp className="h-4 w-4 shrink-0 text-success" />
                </Link>
              </li>
            ))}
          </ol>
        )}

        {keywordList.length > 0 ? (
          <div className="mt-3 border-t border-border/60 pt-3">
            <div className="mb-2 text-[11px] font-semibold text-muted-foreground">كلمات مفتاحية متصاعدة</div>
            <div className="flex flex-wrap gap-1.5">
              {keywordList.map((kw) => (
                <Badge key={kw.keyword} variant="outline" className="gap-1 text-[11px] font-normal">
                  #{kw.keyword}
                  <span className="text-muted-foreground tabular-nums">{number(kw.count)}</span>
                </Badge>
              ))}
            </div>
          </div>
        ) : null}
      </SectionCard>

      {canViewStats ? (
        <SectionCard
          icon={Target}
          title="فجوات التغطية"
          description="مواضيع تتصاعد خارجياً بلا تغطية داخلية — من رادار المطابقة"
        >
          {gapsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : gapsError ? (
            <InlineError onRetry={onRetryGaps} />
          ) : gapList.length === 0 ? (
            <div className="flex items-center gap-2 rounded-xl border border-success/25 bg-success/[0.07] px-4 py-5 text-sm text-success">
              <CheckCircle2 className="h-4 w-4" /> لا فجوات حرجة — التغطية مواكبة.
            </div>
          ) : (
            <ul className="space-y-2" data-testid="d2-gaps-list">
              {gapList.map((gap) => {
                const hot = (gap.heatScore ?? 0) >= 70;
                return (
                  <li key={gap.id} className="rounded-xl border border-border/70 bg-card p-2.5">
                    <div className="flex items-start gap-2">
                      <span className={cn("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md", hot ? TONE.danger.bg : TONE.warning.bg)}>
                        <Flame className={cn("h-3.5 w-3.5", hot ? TONE.danger.text : TONE.warning.text)} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="line-clamp-2 text-[13px] font-medium leading-5">{gap.title}</div>
                        <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span className={hot ? TONE.danger.text : TONE.warning.text}>{number(gap.heatScore)} حرارة</span>
                          {gap.sourceName ? <span>· {gap.sourceName}</span> : null}
                          {gap.sourceCount && gap.sourceCount > 1 ? <span>· {number(gap.sourceCount)} مصادر</span> : null}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mt-3">
            <Button asChild variant="outline" size="sm" className="w-full gap-1.5">
              <Link href="/dashboard/articles">
                <FilePenLine className="h-3.5 w-3.5" /> تغطية الفجوات
              </Link>
            </Button>
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}

function AiAssistant({ gaps, user }: { gaps: CoverageGap[]; user: User | null }) {
  const gapList = Array.isArray(gaps) ? gaps.slice(0, 3) : [];
  const canAiTools = hasAnyPermission(user, "articles.ai_generate", "ai_hub.view");
  const canIfox = hasRole(user, "admin", "editor", "system_admin");

  const tools: { id: string; label: string; href: string; icon: LucideIcon; allowed: boolean }[] = [
    { id: "headlines", label: "تحسين العناوين", href: "/dashboard/articles", icon: Sparkles, allowed: hasPermission(user, "articles.ai_generate") },
    { id: "prompt", label: "مختبر البرومبت", href: "/dashboard/prompt-studio", icon: WandSparkles, allowed: hasPermission(user, "ai_hub.view") || canAiTools },
    { id: "aihub", label: "مركز الذكاء", href: "/dashboard/ai-hub", icon: Gauge, allowed: hasPermission(user, "ai_hub.view") },
    { id: "ifox", label: "استراتيجيات iFox", href: "/dashboard/ifox", icon: Target, allowed: canIfox },
  ].filter((tool) => tool.allowed);

  return (
    <SectionCard
      icon={WandSparkles}
      title="مساعد سبق التحريري"
      description="إشارات واقتراحات مبنية على بيانات النظام — قرار النشر يبقى لك دائماً"
    >
      <div className="space-y-2">
        {gapList.map((gap) => (
          <div key={gap.id} className="flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/[0.05] p-2.5">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <p className="min-w-0 flex-1 text-[13px] leading-5">
              <span className="font-semibold">موضوع يستحق تغطية:</span> <span className="line-clamp-1 align-bottom">{gap.title}</span>
            </p>
          </div>
        ))}

        {gapList.length === 0 ? (
          <div className="flex items-start gap-2 rounded-xl border border-border/70 bg-muted/20 p-3 text-xs text-muted-foreground">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            لا اقتراحات عاجلة الآن. افتح أدوات الذكاء لاقتراح زوايا أو تحسين عناوين أثناء الكتابة.
          </div>
        ) : null}

        {tools.length > 0 ? (
          <div className="flex flex-wrap gap-2 pt-1">
            {tools.map((tool) => (
              <Button key={tool.id} asChild variant="outline" size="sm" className="gap-1.5">
                <Link href={tool.href}>
                  <tool.icon className="h-3.5 w-3.5" /> {tool.label}
                </Link>
              </Button>
            ))}
          </div>
        ) : (
          <p className="pt-1 text-[11px] text-muted-foreground">لا تملك صلاحية أدوات الذكاء التحريري.</p>
        )}

        <p className="pt-1 text-[10px] leading-5 text-muted-foreground">
          هذه اقتراحات آلية ولا تُنشر تلقائياً — تعتمد على مطابقة فجوات التغطية وبيانات النظام المتاحة لصلاحياتك.
        </p>
      </div>
    </SectionCard>
  );
}

function Agenda({
  reminders,
  assignments,
  scheduled,
  loading,
  error,
  onRetry,
}: {
  reminders: CalendarReminder[];
  assignments: CalendarAssignment[];
  scheduled: DashboardPulse["upcomingSchedule"];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}) {
  const groups: { key: "now" | "today" | "tomorrow" | "later"; label: string }[] = [
    { key: "now", label: "الآن" },
    { key: "today", label: "لاحقاً اليوم" },
    { key: "tomorrow", label: "غداً" },
    { key: "later", label: "قادم" },
  ];

  const entries = useMemo(() => {
    const list: { id: string; title: string; iso: string | null; kind: string; href: string; tone: Tone }[] = [];
    for (const r of Array.isArray(reminders) ? reminders : []) {
      list.push({ id: `rem-${r.id}`, title: r.eventTitle, iso: r.reminderTime, kind: "تذكير", href: "/dashboard/calendar", tone: "info" });
    }
    for (const a of Array.isArray(assignments) ? assignments : []) {
      list.push({ id: `asg-${a.id}`, title: a.eventTitle, iso: null, kind: "مهمة مسندة", href: "/dashboard/calendar", tone: "warning" });
    }
    for (const s of Array.isArray(scheduled) ? scheduled : []) {
      list.push({ id: `sch-${s.id}`, title: s.title, iso: s.scheduledAt, kind: "نشر مجدول", href: `/dashboard/articles/${s.id}/edit`, tone: "success" });
    }
    return list;
  }, [reminders, assignments, scheduled]);

  return (
    <SectionCard
      icon={CalendarDays}
      title="أجندة اليوم"
      description="التذكيرات والمهام والمواد المجدولة — الآن، لاحقاً اليوم، وغداً"
      action={
        <Button asChild variant="ghost" size="sm">
          <Link href="/dashboard/calendar">التقويم التحريري</Link>
        </Button>
      }
    >
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      ) : error ? (
        <InlineError onRetry={onRetry} />
      ) : entries.length === 0 ? (
        <EmptyLine>لا مواعيد في الأفق القريب</EmptyLine>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {groups.map((group) => {
            const items = entries.filter((e) => agendaBucket(e.iso) === group.key);
            return (
              <div key={group.key} className="rounded-xl border border-border/70 bg-muted/10 p-2.5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-bold">{group.label}</span>
                  <span className="text-[10px] text-muted-foreground tabular-nums">{number(items.length)}</span>
                </div>
                {items.length === 0 ? (
                  <p className="py-2 text-center text-[11px] text-muted-foreground/70">—</p>
                ) : (
                  <ul className="space-y-1.5">
                    {items.slice(0, 4).map((item) => {
                      const tone = TONE[item.tone];
                      return (
                        <li key={item.id}>
                          <Link href={item.href} className="block rounded-lg border border-border/60 bg-card p-2 transition-colors hover:border-primary/40">
                            <div className="line-clamp-1 text-[12px] font-medium">{item.title}</div>
                            <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                              <span className={tone.text}>{item.kind}</span>
                              {item.iso ? <span className="tabular-nums">· {formatTime(item.iso)}</span> : null}
                            </div>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

function LivePerformance({
  stats,
  pulse,
  canViewStats,
}: {
  stats?: DashboardStats;
  pulse?: DashboardPulse;
  canViewStats: boolean;
}) {
  if (!canViewStats) return null;
  const hourly = Array.isArray(pulse?.hourlyViews) ? pulse!.hourlyViews : [];
  const viewsChange = pulse ? percentChange(stats?.articles.viewsToday ?? 0, pulse.articles.viewsYesterday) : 0;
  const readsChange = pulse ? percentChange(stats?.engagement.readsToday ?? 0, pulse.engagement.readsYesterday) : 0;

  const kpis = [
    { id: "views", label: "مرات فتح الأخبار", value: stats?.articles.viewsToday ?? 0, change: viewsChange, icon: Eye },
    { id: "reads", label: "قراءات الأعضاء", value: stats?.engagement.readsToday ?? 0, change: readsChange, icon: BookOpen },
    { id: "reactions", label: "تفاعلات اليوم", value: stats?.reactions.todayCount ?? 0, change: 0, icon: Heart },
  ];

  return (
    <SectionCard icon={Activity} title="أداء المحتوى لحظياً" description="حركة القراءة والإحصاءات اليوم حتى الآن">
      <div className="grid gap-3 sm:grid-cols-3">
        {kpis.map((kpi) => (
          <div key={kpi.id} className="rounded-xl border border-border/70 bg-card p-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-muted-foreground">{kpi.label}</span>
              <kpi.icon className="h-3.5 w-3.5 text-primary" />
            </div>
            <div className="mt-1.5 text-xl font-bold tabular-nums">{number(kpi.value)}</div>
            {kpi.change !== 0 ? (
              <div className={cn("mt-1 inline-flex items-center gap-1 text-[10px]", kpi.change > 0 ? "text-success" : "text-destructive")}>
                {kpi.change > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {Math.abs(kpi.change)}% مقارنةً بأمس
              </div>
            ) : (
              <div className="mt-1 text-[10px] text-muted-foreground">—</div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-3">
        {hourly.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={hourly} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="d2Views" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.28} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.22} />
              <XAxis dataKey="hour" tickLine={false} axisLine={false} fontSize={10} />
              <YAxis tickLine={false} axisLine={false} fontSize={10} width={40} />
              <ChartTooltip formatter={(value: number) => [number(value), "فتحة"]} />
              <Area type="monotone" dataKey="views" stroke="hsl(var(--primary))" strokeWidth={2.5} fill="url(#d2Views)" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <EmptyLine>ستظهر حركة القراءة عند تسجيل فتحات اليوم</EmptyLine>
        )}
      </div>
    </SectionCard>
  );
}

function ContentPipeline({ stats, pulse, canViewStats }: { stats?: DashboardStats; pulse?: DashboardPulse; canViewStats: boolean }) {
  const stages: { id: string; label: string; value: number; tone: Tone; href: string }[] = [
    { id: "draft", label: "مسودة", value: stats?.articles.draft ?? 0, tone: "neutral", href: "/dashboard/articles" },
    { id: "pending", label: "بانتظار المراجعة", value: pulse?.articles.pendingReview ?? 0, tone: "warning", href: "/dashboard/articles" },
    { id: "changes", label: "تحتاج تعديلات", value: pulse?.articles.needsChanges ?? 0, tone: "danger", href: "/dashboard/articles" },
    { id: "scheduled", label: "مجدول", value: stats?.articles.scheduled ?? 0, tone: "info", href: "/dashboard/articles" },
    { id: "published", label: "نُشر اليوم", value: pulse?.articles.publishedToday ?? 0, tone: "success", href: "/dashboard/articles" },
  ];
  const total = stages.reduce((sum, stage) => sum + stage.value, 0);
  const max = Math.max(...stages.map((s) => s.value), 1);

  return (
    <SectionCard
      icon={Rows3}
      title="دورة حياة الخبر"
      description="خط الإنتاج التحريري من المسودة إلى النشر — اضغط أي مرحلة للوصول لموادها"
      action={canViewStats ? <span className="text-[11px] text-muted-foreground tabular-nums">الإجمالي {number(total)}</span> : null}
    >
      <ol className="grid gap-2.5 sm:grid-cols-5" data-testid="d2-pipeline">
        {stages.map((stage, index) => {
          const tone = TONE[stage.tone];
          return (
            <li key={stage.id}>
              <Link
                href={stage.href}
                className="group flex h-full flex-col rounded-xl border border-border/70 bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/30"
                data-testid={`d2-pipeline-${stage.id}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-muted-foreground">{stage.label}</span>
                  <span className={cn("h-2 w-2 rounded-full", tone.solid)} />
                </div>
                <div className="mt-1.5 text-2xl font-bold tabular-nums">{number(stage.value)}</div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className={cn("h-full rounded-full", tone.solid)} style={{ width: `${Math.max((stage.value / max) * 100, stage.value ? 6 : 0)}%` }} />
                </div>
                <span className="mt-2 text-[10px] text-muted-foreground">المرحلة {index + 1}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </SectionCard>
  );
}

function PublishingCenter({
  social,
  push,
  scheduledCount,
  canSocial,
  canPush,
}: {
  social?: SocialStats;
  push?: PushLogStats;
  scheduledCount: number;
  canSocial: boolean;
  canPush: boolean;
}) {
  if (!canSocial && !canPush) return null;
  const failures = (social?.failed ?? 0) + (push?.totalFailed ?? 0);

  return (
    <SectionCard
      icon={BellRing}
      title="مركز النشر"
      description="حالة النشر على الموقع والإشعارات والسوشال"
      action={
        failures > 0 ? (
          <Badge variant="outline" className={cn("gap-1", TONE.danger.text, TONE.danger.bg, TONE.danger.border)}>
            <AlertTriangle className="h-3 w-3" /> {number(failures)} فشل
          </Badge>
        ) : undefined
      }
    >
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {canSocial ? (
          <>
            <PublishTile id="social-published" label="نُشر على X اليوم" value={social?.publishedToday ?? 0} icon={Zap} href="/dashboard/social-publishing" tone="success" />
            <PublishTile id="social-scheduled" label="سوشال مجدول" value={social?.scheduledUpcoming ?? 0} icon={CalendarClock} href="/dashboard/social-publishing" tone="info" />
            <PublishTile id="social-proposals" label="مقترحات الكتّاب" value={social?.pendingAuthorProposals ?? 0} icon={FilePenLine} href="/dashboard/social-publishing?filter=draft" tone="warning" />
            <PublishTile id="social-failed" label="فشل السوشال" value={social?.failed ?? 0} icon={AlertTriangle} href="/dashboard/social-publishing" tone={(social?.failed ?? 0) > 0 ? "danger" : "neutral"} />
          </>
        ) : null}
        {canPush ? (
          <>
            <PublishTile id="push-sent" label="إشعارات أُرسلت (24س)" value={push?.totalSent ?? 0} icon={BellRing} href="/dashboard/push-notifications" tone="info" />
            <PublishTile id="push-failed" label="فشل الإشعارات (24س)" value={push?.totalFailed ?? 0} icon={ShieldAlert} href="/dashboard/push-notifications" tone={(push?.totalFailed ?? 0) > 0 ? "danger" : "neutral"} />
          </>
        ) : null}
        <PublishTile id="site-scheduled" label="مواد مجدولة" value={scheduledCount} icon={CalendarClock} href="#agenda" tone="info" />
      </div>
    </SectionCard>
  );
}

function PublishTile({
  id,
  label,
  value,
  icon: Icon,
  href,
  tone,
}: {
  id: string;
  label: string;
  value: number;
  icon: LucideIcon;
  href: string;
  tone: Tone;
}) {
  const t = TONE[tone];
  const className =
    "group flex items-center gap-3 rounded-xl border border-border/70 bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/30";
  const inner = (
    <>
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", t.bg, t.text)}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-lg font-bold tabular-nums leading-none">{number(value)}</div>
        <div className="mt-1 truncate text-[11px] text-muted-foreground">{label}</div>
      </div>
    </>
  );
  return href.startsWith("#") ? (
    <a href={href} className={className} data-testid={`d2-publish-${id}`}>{inner}</a>
  ) : (
    <Link href={href} className={className} data-testid={`d2-publish-${id}`}>{inner}</Link>
  );
}

function MediaQuick({ enabled }: { enabled: boolean }) {
  const { data, isLoading, isError, refetch } = useQuery<MediaStats>({
    queryKey: ["/api/media/stats"],
    enabled,
  });
  if (!enabled) return null;
  const topUsed = Array.isArray(data?.topUsed) ? data!.topUsed.slice(0, 4) : [];

  return (
    <SectionCard
      icon={ImageIcon}
      title="مكتبة الوسائط السريعة"
      description="حالة الأصول و أكثرها استخداماً"
      action={
        <Button asChild variant="ghost" size="sm">
          <Link href="/dashboard/media-library">المكتبة</Link>
        </Button>
      }
    >
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : isError ? (
        <InlineError onRetry={() => refetch()} />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <MiniStat label="إجمالي الصور" value={data?.totalImages ?? 0} />
            <MiniStat label="بانتظار التحليل" value={data?.pendingAnalysis ?? 0} tone={(data?.pendingAnalysis ?? 0) > 0 ? "warning" : "neutral"} />
            <MiniStat label="مولّدة بالذكاء" value={data?.aiGenerated ?? 0} />
          </div>
          {topUsed.length > 0 ? (
            <div className="mt-3 space-y-1.5">
              <div className="text-[11px] font-semibold text-muted-foreground">الأكثر استخداماً</div>
              {topUsed.map((asset) => (
                <div key={asset.id} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-card px-2.5 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-[12px]">{asset.title || asset.originalName || "أصل"}</span>
                  <Badge variant="outline" className="shrink-0 text-[10px] tabular-nums">{number(asset.usage)}</Badge>
                </div>
              ))}
            </div>
          ) : null}
        </>
      )}
    </SectionCard>
  );
}

function MiniStat({ label, value, tone = "neutral" }: { label: string; value: number; tone?: Tone }) {
  const t = TONE[tone];
  return (
    <div className="rounded-lg border border-border/70 bg-muted/10 p-2.5 text-center">
      <div className={cn("text-lg font-bold tabular-nums", tone !== "neutral" && t.text)}>{number(value)}</div>
      <div className="mt-0.5 text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

function HomepageBlocks({ enabled }: { enabled: boolean }) {
  const { data, isLoading, isError, refetch } = useQuery<SmartBlocksSummary>({
    queryKey: ["/api/smart-blocks/stage/summary"],
    enabled,
  });
  if (!enabled) return null;
  const placements = data?.byPlacement ? Object.entries(data.byPlacement).slice(0, 6) : [];

  return (
    <SectionCard
      icon={Layers}
      title="الواجهة الرئيسية والبلوكات"
      description="ملخص البلوكات الذكية النشطة والمجدولة — للتنبيه لا للتحرير"
      action={
        <Button asChild variant="ghost" size="sm">
          <Link href="/dashboard/smart-blocks">إدارة البلوكات</Link>
        </Button>
      }
    >
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : isError ? (
        <InlineError onRetry={() => refetch()} />
      ) : !data ? (
        <EmptyLine>لا بيانات للبلوكات</EmptyLine>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <MiniStat label="نشط" value={data.active} tone="success" />
            <MiniStat label="مجدول" value={data.scheduled} tone="info" />
            <MiniStat label="متوقف" value={data.inactive} />
          </div>
          {placements.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {placements.map(([placement, count]) => (
                <Badge key={placement} variant="outline" className="gap-1 text-[11px] font-normal">
                  {placement}
                  <span className="text-muted-foreground tabular-nums">{number(count)}</span>
                </Badge>
              ))}
            </div>
          ) : null}
        </>
      )}
    </SectionCard>
  );
}

/* ------------------------------------------------------------------ */
/* الصفحة                                                              */
/* ------------------------------------------------------------------ */

const SECTIONS = [
  { id: "now", label: "الآن في سبق" },
  { id: "attention", label: "يحتاج تدخلك" },
  { id: "live", label: "غرفة الأخبار الحية" },
  { id: "happening", label: "ما يحدث الآن" },
  { id: "ai", label: "مساعد سبق التحريري" },
  { id: "agenda", label: "أجندة اليوم" },
  { id: "performance", label: "أداء المحتوى" },
  { id: "pipeline", label: "دورة حياة الخبر" },
  { id: "publishing", label: "مركز النشر" },
  { id: "media", label: "مكتبة الوسائط" },
  { id: "blocks", label: "الواجهة الرئيسية" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];
const SECTIONS_STORAGE_KEY = "sabq.dashboard2.sections.v1";

function loadSectionVisibility(): Record<SectionId, boolean> {
  const defaults = Object.fromEntries(SECTIONS.map((s) => [s.id, true])) as Record<SectionId, boolean>;
  try {
    const raw = localStorage.getItem(SECTIONS_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<Record<SectionId, boolean>>;
    return { ...defaults, ...parsed };
  } catch {
    return defaults;
  }
}

export default function Dashboard2() {
  const { user, isLoading: userLoading } = useAuth({ redirectToLogin: true });
  const [location, navigate] = useLocation();
  const [commandOpen, setCommandOpen] = useState(false);
  const [visibility, setVisibility] = useState<Record<SectionId, boolean>>(() => loadSectionVisibility());

  const isAngleWriter = hasRole(user, "angle_writer");
  const isReporterOnly = hasRole(user, "reporter") && !hasRole(user, "admin", "system_admin", "editor", "chief_editor", "content_manager", "analyst", "reviewer", "author", "comments_moderator");
  const isPublisherOnly = hasRole(user, "publisher") && !hasRole(user, "admin", "system_admin", "editor", "chief_editor", "content_manager", "analyst", "reviewer", "author", "comments_moderator");
  const isOpinionAuthor = user?.role === "opinion_author";

  useEffect(() => {
    if (user && isOpinionAuthor) navigate("/dashboard/opinion-author", { replace: true });
    else if (user && isAngleWriter) navigate("/dashboard/my-angle", { replace: true });
    else if (user && isReporterOnly) navigate("/dashboard/reporter/articles", { replace: true });
    else if (user && isPublisherOnly) navigate("/dashboard/publisher", { replace: true });
  }, [user, isOpinionAuthor, isAngleWriter, isReporterOnly, isPublisherOnly, navigate]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setCommandOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SECTIONS_STORAGE_KEY, JSON.stringify(visibility));
    } catch {
      /* ignore */
    }
  }, [visibility]);

  const canViewStats = !isReporterOnly && (hasPermission(user, PERMISSION_CODES.DASHBOARD_VIEW_STATS) || hasRole(user, "admin", "system_admin", "editor", "content_manager"));
  const canViewArticles = hasPermission(user, PERMISSION_CODES.ARTICLES_VIEW);
  const canMuqtarab = hasPermission(user, "muqtarab.manage");
  const canSocial = hasAnyPermission(user, PERMISSION_CODES.SOCIAL_PUBLISH_VIEW, PERMISSION_CODES.SOCIAL_PUBLISH_VIEW_LOG);
  const canMedia = hasPermission(user, PERMISSION_CODES.MEDIA_VIEW);
  const canManageBlocks = hasPermission(user, PERMISSION_CODES.SYSTEM_MANAGE_SETTINGS);
  const canViewTasks = hasAnyPermission(user, "tasks.view_all", "tasks.view_own");
  const canPush = hasRole(user, "admin");
  const canModerateComments = hasAnyPermission(user, PERMISSION_CODES.COMMENTS_VIEW, "comments.moderate") || hasRole(user, "comments_moderator");

  // التنقل للأوامر — مُرشّح بالصلاحيات مسبقاً عبر useNav
  const role: UserRole = resolveUserRole(getHighestRole(user));
  const navFlags = useMemo(() => ({ aiDeepAnalysis: false, smartThemes: true, audioSummaries: false }), []);
  const { flat } = useNav({
    role,
    flags: navFlags,
    pathname: location,
    permissions: user?.permissions || [],
    allRoles: user?.roles && user.roles.length > 0 ? user.roles : user?.role ? [user.role] : [],
  });

  /* ---------------- الاستعلامات الأساسية ---------------- */
  const statsQuery = useQuery<DashboardStats>({
    queryKey: ["/api/admin/dashboard/stats"],
    enabled: !!user && canViewStats,
    refetchInterval: 120_000,
  });
  const pulseQuery = useQuery<DashboardPulse>({
    queryKey: ["/api/admin/dashboard/pulse"],
    enabled: !!user && canViewStats,
    refetchInterval: 120_000,
  });
  const remindersQuery = useQuery<CalendarReminder[]>({
    queryKey: ["/api/calendar/upcoming-reminders"],
    enabled: !!user,
  });
  const assignmentsQuery = useQuery<CalendarAssignment[]>({
    queryKey: ["/api/calendar/my-assignments?status=pending"],
    enabled: !!user,
  });
  const gapsQuery = useQuery<CoverageGapsResponse>({
    queryKey: ["/api/admin/dashboard/coverage-gaps?status=open,drafting,scheduled"],
    enabled: !!user && canViewStats,
    refetchInterval: 180_000,
  });
  const muqtarabQuery = useQuery<MuqtarabReviewItem[]>({
    queryKey: ["/api/admin/muqtarab/review-queue"],
    enabled: !!user && canMuqtarab,
    refetchInterval: 180_000,
  });
  const socialQuery = useQuery<SocialStats>({
    queryKey: ["/api/social-publishing/stats"],
    enabled: !!user && canSocial,
    refetchInterval: 120_000,
  });
  const tasksQuery = useQuery<TaskStats>({
    queryKey: ["/api/tasks/statistics"],
    enabled: !!user && canViewTasks,
  });
  const pushQuery = useQuery<PushLogStats>({
    queryKey: ["/api/admin/push/logs/stats?days=1"],
    enabled: !!user && canPush,
  });
  const keywordsQuery = useQuery<TrendingKeyword[]>({
    queryKey: ["/api/trending-keywords"],
    enabled: !!user && canViewStats,
  });

  const stats = statsQuery.data;
  const pulse = pulseQuery.data;
  const reminders = Array.isArray(remindersQuery.data) ? remindersQuery.data : [];
  const assignments = Array.isArray(assignmentsQuery.data) ? assignmentsQuery.data : [];
  const gaps = Array.isArray(gapsQuery.data?.gaps) ? gapsQuery.data!.gaps : [];
  const keywords = Array.isArray(keywordsQuery.data) ? keywordsQuery.data : [];
  const muqtarabCount = Array.isArray(muqtarabQuery.data) ? muqtarabQuery.data.length : 0;
  const social = socialQuery.data;
  const tasks = tasksQuery.data;
  const push = pushQuery.data;
  const gapsOpenCount = gaps.filter((g) => g.status === "open").length;

  const alertsCount = (pulse?.comments.pendingOlderThanTwoHours ?? 0) + (social?.failed ?? 0) + (push?.totalFailed ?? 0);

  const priorityItems = useMemo<PriorityItem[]>(() => {
    const items: PriorityItem[] = [];
    if (canViewStats && (pulse?.articles.pendingReview ?? 0) > 0) {
      items.push({ id: "pending-review", label: "مادة بانتظار المراجعة", description: "تحتاج قراراً تحريرياً", count: pulse!.articles.pendingReview, href: "/dashboard/articles", icon: Clock3, tone: "warning" });
    }
    if (canViewStats && (pulse?.articles.needsChanges ?? 0) > 0) {
      items.push({ id: "needs-changes", label: "مادة تحتاج تعديلات", description: "أُعيدت لصاحبها أو تنتظر معالجة", count: pulse!.articles.needsChanges, href: "/dashboard/articles", icon: AlertTriangle, tone: "danger" });
    }
    if (canModerateComments && (pulse?.comments.pendingOlderThanTwoHours ?? 0) > 0) {
      items.push({ id: "comments", label: "تعليق تجاوز ساعتين", description: "بانتظار الإشراف", count: pulse!.comments.pendingOlderThanTwoHours, href: "/dashboard/ai-moderation", icon: MessageSquare, tone: "danger" });
    } else if (canModerateComments && (stats?.comments.pending ?? 0) > 0) {
      items.push({ id: "comments", label: "تعليق بانتظار الإشراف", description: "داخل نافذة الاستجابة", count: stats!.comments.pending, href: "/dashboard/ai-moderation", icon: MessageSquare, tone: "warning" });
    }
    if (canMuqtarab && muqtarabCount > 0) {
      items.push({ id: "muqtarab", label: "موضوع مُقترب", description: "بانتظار قرار التحرير", count: muqtarabCount, href: "/dashboard/muqtarab/review", icon: List, tone: "warning" });
    }
    if (canViewStats && gapsOpenCount > 0) {
      items.push({ id: "gaps", label: "فجوة تغطية", description: "موضوع متصاعد بلا تغطية", count: gapsOpenCount, href: "#happening", icon: Target, tone: "warning" });
    }
    if (canSocial && (social?.pendingAuthorProposals ?? 0) > 0) {
      items.push({ id: "social-proposals", label: "مقترح نشر اجتماعي", description: "من كتّاب الرأي للمراجعة", count: social!.pendingAuthorProposals, href: "/dashboard/social-publishing?filter=draft", icon: FilePenLine, tone: "warning" });
    }
    if (canSocial && (social?.failed ?? 0) > 0) {
      items.push({ id: "social-failed", label: "فشل نشر على X", description: "يحتاج إعادة محاولة", count: social!.failed, href: "/dashboard/social-publishing", icon: AlertTriangle, tone: "danger" });
    }
    if (canPush && (push?.totalFailed ?? 0) > 0) {
      items.push({ id: "push-failed", label: "فشل إشعار", description: "في آخر 24 ساعة", count: push!.totalFailed, href: "/dashboard/push-notifications", icon: ShieldAlert, tone: "danger" });
    }
    if (canViewTasks && (tasks?.overdue ?? 0) > 0) {
      items.push({ id: "tasks-overdue", label: "مهمة متأخرة", description: "تجاوزت موعدها", count: tasks!.overdue, href: "/dashboard/tasks", icon: FileClock, tone: "danger" });
    } else if (canViewTasks && (tasks?.todo ?? 0) > 0) {
      items.push({ id: "tasks-todo", label: "مهمة مسندة إليك", description: "لم تبدأ بعد", count: tasks!.todo, href: "/dashboard/tasks", icon: CheckCircle2, tone: "info" });
    }
    return items;
  }, [canViewStats, canModerateComments, canMuqtarab, canSocial, canPush, canViewTasks, pulse, stats, muqtarabCount, gapsOpenCount, social, push, tasks]);

  const attentionLoading = statsQuery.isLoading || pulseQuery.isLoading || (canMuqtarab && muqtarabQuery.isLoading) || (canViewTasks && tasksQuery.isLoading) || (canSocial && socialQuery.isLoading) || (canViewStats && gapsQuery.isLoading);

  const lastRefresh = pulse?.generatedAt
    ? new Intl.DateTimeFormat("ar-SA-u-nu-latn", { hour: "numeric", minute: "2-digit" }).format(new Date(pulse.generatedAt))
    : "—";

  const dateLabel = useMemo(
    () => new Intl.DateTimeFormat("ar-SA-u-nu-latn", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date()),
    [],
  );

  const refreshAll = () => {
    statsQuery.refetch();
    pulseQuery.refetch();
    remindersQuery.refetch();
    assignmentsQuery.refetch();
    if (canViewStats) {
      gapsQuery.refetch();
      keywordsQuery.refetch();
    }
    if (canMuqtarab) muqtarabQuery.refetch();
    if (canSocial) socialQuery.refetch();
    if (canViewTasks) tasksQuery.refetch();
    if (canPush) pushQuery.refetch();
  };

  const redirecting = !!user && (isOpinionAuthor || isAngleWriter || isReporterOnly || isPublisherOnly);

  if (userLoading || !user || redirecting) {
    return (
      <DashboardLayout>
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const show = (id: SectionId) => visibility[id];

  return (
    <DashboardLayout>
      <DashboardPageShell maxWidthClassName="max-w-[1600px]" contentClassName="space-y-4 px-4 pb-24 sm:px-6 sm:space-y-5">
        <DashboardPageHeader
          icon={Gauge}
          title="مركز قيادة سبق"
          description={`${dateLabel} · نسخة موازية تجريبية — اللوحة الحالية على /dashboard دون تغيير.`}
          titleTestId="d2-heading"
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => setCommandOpen(true)} data-testid="d2-open-command">
                <Search className="h-4 w-4" /> بحث سريع
                <kbd className="ms-1 hidden rounded border border-border bg-muted px-1 text-[10px] font-semibold text-muted-foreground sm:inline">⌘K</kbd>
              </Button>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 gap-1.5" data-testid="d2-customize">
                    <Settings2 className="h-4 w-4" /> تخصيص
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-64" dir="rtl">
                  <div className="mb-2 text-xs font-semibold text-muted-foreground">أقسام الصفحة</div>
                  <div className="space-y-2">
                    {SECTIONS.map((section) => (
                      <label key={section.id} className="flex cursor-pointer items-center justify-between gap-2 text-sm">
                        <span>{section.label}</span>
                        <Checkbox
                          checked={visibility[section.id]}
                          onCheckedChange={(value) => setVisibility((prev) => ({ ...prev, [section.id]: value === true }))}
                          data-testid={`d2-toggle-${section.id}`}
                        />
                      </label>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
              <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={refreshAll} disabled={statsQuery.isFetching || pulseQuery.isFetching} data-testid="d2-refresh">
                <RefreshCw className={cn("h-4 w-4", (statsQuery.isFetching || pulseQuery.isFetching) && "animate-spin")} /> تحديث
              </Button>
            </div>
          }
        />

        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5 text-primary" /> آخر تحديث للنبض {lastRefresh}
          </span>
          <span className="flex items-center gap-1.5">
            <CommandIcon className="h-3.5 w-3.5" /> اضغط ⌘K للوصول السريع لأي شاشة أو إجراء
          </span>
        </div>

        {show("now") ? (
          <LazySection eager testId="d2-section-now" label="الآن في سبق">
            <NowStrip
              stats={stats}
              pulse={pulse}
              remindersCount={reminders.length}
              alertsCount={alertsCount}
              loading={statsQuery.isLoading || pulseQuery.isLoading}
            />
          </LazySection>
        ) : null}

        {show("attention") ? (
          <div id="attention" className="scroll-mt-24">
            <NeedsAttention items={priorityItems} loading={attentionLoading} />
          </div>
        ) : null}

        {show("live") ? (
          <LazySection eager testId="d2-section-live" label="غرفة الأخبار الحية">
            <LiveNewsroom recentArticles={stats?.recentArticles ?? []} canViewStats={canViewStats} />
          </LazySection>
        ) : null}

        {show("agenda") ? (
          <LazySection id="agenda" testId="d2-section-agenda" label="أجندة اليوم">
            <Agenda
              reminders={reminders}
              assignments={assignments}
              scheduled={pulse?.upcomingSchedule ?? []}
              loading={remindersQuery.isLoading || assignmentsQuery.isLoading}
              error={remindersQuery.isError}
              onRetry={refreshAll}
            />
          </LazySection>
        ) : null}

        {show("pipeline") ? (
          <LazySection eager testId="d2-section-pipeline" label="دورة حياة الخبر">
            <ContentPipeline stats={stats} pulse={pulse} canViewStats={canViewStats} />
          </LazySection>
        ) : null}

        {show("happening") ? (
          <LazySection id="happening" testId="d2-section-happening" label="ما يحدث الآن">
            <WhatsHappening
              trending={pulse?.trendingArticles ?? []}
              keywords={keywords}
              gaps={gaps}
              gapsLoading={gapsQuery.isLoading}
              gapsError={gapsQuery.isError}
              onRetryGaps={() => gapsQuery.refetch()}
              canViewStats={canViewStats}
            />
          </LazySection>
        ) : null}

        {show("ai") ? (
          <LazySection testId="d2-section-ai" label="مساعد سبق التحريري">
            <AiAssistant gaps={gaps} user={user} />
          </LazySection>
        ) : null}

        {show("performance") ? (
          <LazySection testId="d2-section-performance" label="أداء المحتوى">
            <LivePerformance stats={stats} pulse={pulse} canViewStats={canViewStats} />
          </LazySection>
        ) : null}

        {show("publishing") ? (
          <LazySection testId="d2-section-publishing" label="مركز النشر">
            <PublishingCenter
              social={social}
              push={push}
              scheduledCount={stats?.articles.scheduled ?? 0}
              canSocial={canSocial}
              canPush={canPush}
            />
          </LazySection>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-2">
          {show("media") ? (
            <LazySection testId="d2-section-media" label="مكتبة الوسائط">
              <MediaQuick enabled={!!user && canMedia} />
            </LazySection>
          ) : null}
          {show("blocks") ? (
            <LazySection testId="d2-section-blocks" label="الواجهة الرئيسية">
              <HomepageBlocks enabled={!!user && canManageBlocks} />
            </LazySection>
          ) : null}
        </div>

        <div className="hidden justify-center pb-4 sm:flex">
          <Button asChild variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
            <Link href="/dashboard">الانتقال إلى اللوحة الكلاسيكية</Link>
          </Button>
        </div>
      </DashboardPageShell>

      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} navItems={flat} user={user} />
    </DashboardLayout>
  );
}
