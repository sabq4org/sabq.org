import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { AccountSectionHeader } from "@/components/AccountSectionHeader";
import { useAuth } from "@/hooks/useAuth";
import { useBehaviorTracking } from "@/hooks/useBehaviorTracking";
import { getGuestFocusSessions, type GuestSession } from "@/hooks/useFocusSession";
import {
  Clock,
  BookOpenCheck,
  Flame,
  Trophy,
  ArrowUp,
  ArrowDown,
  Minus,
  FolderOpen,
  Hourglass,
  FileText,
  Eye,
  BookOpen,
  BarChart3,
  LogIn,
} from "lucide-react";

interface DailyAggregate {
  date: string;
  sessions: number;
  focusedSeconds: number;
  completed: number;
}

interface TopArticle {
  articleId: string;
  title: string | null;
  slug: string | null;
  sessions: number;
  focusedSeconds: number;
}

interface TopCategory {
  name: string;
  sessions: number;
  focusedSeconds: number;
}

interface LongestSession {
  id: string;
  articleId: string;
  articleTitle: string | null;
  articleSlug: string | null;
  focusedSeconds: number;
  startedAt: string;
}

interface WeekAggregate {
  range: { start: string; end: string };
  totalSessions: number;
  totalArticles: number;
  totalFocusedSeconds: number;
  totalCompleted: number;
  averageSessionSeconds: number;
  daily: DailyAggregate[];
  topArticles: TopArticle[];
  topCategory: TopCategory | null;
  longestSession: LongestSession | null;
}

interface WeeklyReportPayload extends WeekAggregate {
  current: WeekAggregate;
  previous: WeekAggregate;
}

export type FocusWeeklyLanguage = "ar" | "en" | "ur";

interface Props {
  language?: FocusWeeklyLanguage;
}

const LABELS = {
  ar: {
    dir: "rtl" as const,
    locale: "ar-SA",
    title: "تقرير القراءة الأسبوعي",
    subtitle: "ملخص جلسات القراءة المركّزة خلال آخر سبعة أيام",
    totalSessions: "عدد الجلسات",
    totalFocus: "إجمالي زمن التركيز",
    completed: "جلسات مكتملة",
    average: "متوسط الجلسة",
    daily: "نشاط أسبوعك",
    topArticles: "أكثر المقالات قراءة",
    minutes: "دقيقة",
    seconds: "ثانية",
    sessionsUnit: "جلسة",
    noData: "لا توجد جلسات قراءة بعد. ابدأ بقراءة مقال في وضع التركيز.",
    guestNote: "تظهر هنا الجلسات المحفوظة على هذا الجهاز فقط. سجّل الدخول للحصول على تقرير شامل عبر أجهزتك.",
    backHome: "العودة للرئيسية",
    articleLinkPrefix: "/article/",
    homeHref: "/",
    loginHref: "/login",
    currentWeek: "هذا الأسبوع",
    previousWeek: "الأسبوع الماضي",
    vsPrevious: "مقابل الأسبوع الماضي",
    samePrevious: "بدون تغيير",
    articlesUnit: "مقال",
    totalArticles: "عدد المقالات",
    topCategoryLabel: "أكثر تصنيف قراءةً",
    longestSessionLabel: "أطول جلسة قراءة",
    noCategory: "لا يوجد بعد",
    highlights: "أبرز ما في الأسبوع",
    emptyHeadline: "ابدأ أول جلسة تركيز",
    emptyLead: "اقرأ بلا تشتيت — بلا إعلانات ولا قوائم جانبية — ويُحفظ زمن تركيزك هنا كل أسبوع.",
    step1Title: "افتح مقالًا",
    step1Body: "اختر أي خبر يهمّك من القائمة أدناه أو من الرئيسية.",
    step2Title: "فعّل وضع التركيز",
    step2Body: "من صفحة المقال اضغط زر «وضع التركيز» وابدأ القراءة بهدوء.",
    step3Title: "عد إلى تقريرك",
    step3Body: "بعد الجلسة تظهر إحصائياتك هنا: الزمن، المقالات، ونشاط أيامك.",
    previewTitle: "هكذا سيبدو تقريرك",
    previewHint: "معاينة — تُملأ تلقائيًا بعد أول جلسة.",
    startHere: "ابدأ من هنا",
    openFocusHint: "من صفحة المقال: زر وضع التركيز",
    loginCta: "سجّل الدخول لمزامنة أجهزتك",
    browseHome: "تصفّح الأخبار",
  },
  en: {
    dir: "ltr" as const,
    locale: "en-US",
    title: "Weekly Reading Report",
    subtitle: "Your focused reading activity over the last 7 days",
    totalSessions: "Sessions",
    totalFocus: "Total focus time",
    completed: "Completed reads",
    average: "Average session",
    daily: "This week's activity",
    topArticles: "Most read articles",
    minutes: "min",
    seconds: "sec",
    sessionsUnit: "sessions",
    noData: "No reading sessions yet. Start reading an article in focus mode.",
    guestNote: "Showing sessions saved on this device only. Sign in for a unified report across devices.",
    backHome: "Back to home",
    articleLinkPrefix: "/en/article/",
    homeHref: "/en",
    loginHref: "/login",
    currentWeek: "This week",
    previousWeek: "Last week",
    vsPrevious: "vs last week",
    samePrevious: "no change",
    articlesUnit: "articles",
    totalArticles: "Articles",
    topCategoryLabel: "Top category",
    longestSessionLabel: "Longest session",
    noCategory: "No category yet",
    highlights: "This week's highlights",
    emptyHeadline: "Start your first focus session",
    emptyLead: "Read without distraction — no ads or side rails — and your focus time lands here every week.",
    step1Title: "Open an article",
    step1Body: "Pick a story below or from the homepage.",
    step2Title: "Turn on Focus mode",
    step2Body: "On the article page, tap “Focus mode” and read in peace.",
    step3Title: "Come back to your report",
    step3Body: "After a session, your stats appear here: time, articles, and daily activity.",
    previewTitle: "Your report will look like this",
    previewHint: "Preview — fills in after your first session.",
    startHere: "Start here",
    openFocusHint: "On the article page: Focus mode button",
    loginCta: "Sign in to sync across devices",
    browseHome: "Browse news",
  },
  ur: {
    dir: "rtl" as const,
    locale: "ur-PK",
    title: "ہفتہ وار پڑھائی رپورٹ",
    subtitle: "گزشتہ سات دنوں کے دوران آپ کی مرکوز پڑھائی کی سرگرمی",
    totalSessions: "سیشنز",
    totalFocus: "کل مرکوز وقت",
    completed: "مکمل پڑھائیاں",
    average: "اوسط سیشن",
    daily: "ہفتے کی سرگرمی",
    topArticles: "سب سے زیادہ پڑھے گئے",
    minutes: "منٹ",
    seconds: "سیکنڈ",
    sessionsUnit: "سیشنز",
    noData: "ابھی تک کوئی سیشن نہیں۔ توجہ مرکوز پڑھائی شروع کریں۔",
    guestNote: "صرف اس آلے پر محفوظ سیشنز دکھائے جا رہے ہیں۔ تمام آلات پر مشترکہ رپورٹ کے لیے سائن ان کریں۔",
    backHome: "ہوم پیج",
    articleLinkPrefix: "/ur/article/",
    homeHref: "/ur",
    loginHref: "/login",
    currentWeek: "اس ہفتے",
    previousWeek: "گزشتہ ہفتہ",
    vsPrevious: "گزشتہ ہفتے کے مقابلے",
    samePrevious: "کوئی تبدیلی نہیں",
    articlesUnit: "مضامین",
    totalArticles: "مضامین کی تعداد",
    topCategoryLabel: "سب سے زیادہ پڑھا گیا زمرہ",
    longestSessionLabel: "سب سے طویل سیشن",
    noCategory: "ابھی کوئی نہیں",
    highlights: "ہفتے کی جھلکیاں",
    emptyHeadline: "اپنا پہلا فوکس سیشن شروع کریں",
    emptyLead: "بغیر خلفشار پڑھیں — اور آپ کا مرکوز وقت ہر ہفتے یہاں محفوظ ہوگا۔",
    step1Title: "مضمون کھولیں",
    step1Body: "نیچے یا ہوم سے کوئی خبر منتخب کریں۔",
    step2Title: "فوکس موڈ چالو کریں",
    step2Body: "مضمون کے صفحے پر «توجہ مرکوز پڑھائی» دبائیں اور پرسکون پڑھیں۔",
    step3Title: "اپنی رپورٹ دیکھیں",
    step3Body: "سیشن کے بعد یہاں وقت، مضامین اور روزانہ سرگرمی ظاہر ہوگی۔",
    previewTitle: "آپ کی رپورٹ ایسی نظر آئے گی",
    previewHint: "پیش نظارہ — پہلے سیشن کے بعد بھرتی ہے۔",
    startHere: "یہاں سے شروع کریں",
    openFocusHint: "مضمون کے صفحے پر: فوکس موڈ بٹن",
    loginCta: "آلات پر ہم آہنگی کے لیے سائن ان کریں",
    browseHome: "خبریں دیکھیں",
  },
};

type Labels = (typeof LABELS)[FocusWeeklyLanguage];

interface SuggestedArticle {
  id: string;
  title: string | null;
  slug: string | null;
  status?: string | null;
}

function formatMinutes(totalSeconds: number, locale: string, labels: { minutes: string; seconds: string }) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (m === 0) return `${s.toLocaleString(locale)} ${labels.seconds}`;
  return `${m.toLocaleString(locale)} ${labels.minutes}`;
}

function emptyWeek(start: Date, end: Date): WeekAggregate {
  const daily: DailyAggregate[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    daily.push({ date: d.toISOString().slice(0, 10), sessions: 0, focusedSeconds: 0, completed: 0 });
  }
  return {
    range: { start: start.toISOString(), end: end.toISOString() },
    totalSessions: 0,
    totalArticles: 0,
    totalFocusedSeconds: 0,
    totalCompleted: 0,
    averageSessionSeconds: 0,
    daily,
    topArticles: [],
    topCategory: null,
    longestSession: null,
  };
}

function aggregateGuest(sessions: GuestSession[], start: Date, end: Date): WeekAggregate {
  const week = emptyWeek(start, end);
  const articleMap = new Map<string, TopArticle>();
  const categoryMap = new Map<string, TopCategory>();
  let longest: GuestSession | null = null;

  for (const s of sessions) {
    const ts = s.startedAt;
    if (ts < start.getTime() || ts > end.getTime()) continue;
    week.totalSessions += 1;
    week.totalFocusedSeconds += s.focusedSeconds;
    if (s.completed) week.totalCompleted += 1;
    const key = new Date(ts).toISOString().slice(0, 10);
    const day = week.daily.find((d) => d.date === key);
    if (day) {
      day.sessions += 1;
      day.focusedSeconds += s.focusedSeconds;
      if (s.completed) day.completed += 1;
    }
    const ac = articleMap.get(s.articleId) || {
      articleId: s.articleId,
      title: s.articleTitle || null,
      slug: s.articleSlug || null,
      sessions: 0,
      focusedSeconds: 0,
    };
    ac.sessions += 1;
    ac.focusedSeconds += s.focusedSeconds;
    articleMap.set(s.articleId, ac);

    const catName = (s.categoryName || "").trim();
    if (catName) {
      const cc = categoryMap.get(catName) || { name: catName, sessions: 0, focusedSeconds: 0 };
      cc.sessions += 1;
      cc.focusedSeconds += s.focusedSeconds;
      categoryMap.set(catName, cc);
    }

    if (!longest || s.focusedSeconds > longest.focusedSeconds) {
      longest = s;
    }
  }

  week.totalArticles = articleMap.size;
  week.averageSessionSeconds = week.totalSessions
    ? Math.round(week.totalFocusedSeconds / week.totalSessions)
    : 0;
  week.topArticles = Array.from(articleMap.values())
    .sort((a, b) => b.focusedSeconds - a.focusedSeconds)
    .slice(0, 5);
  week.topCategory = Array.from(categoryMap.values())
    .sort((a, b) => b.focusedSeconds - a.focusedSeconds)[0] || null;
  week.longestSession = longest
    ? {
        id: longest.id,
        articleId: longest.articleId,
        articleTitle: longest.articleTitle || null,
        articleSlug: longest.articleSlug || null,
        focusedSeconds: longest.focusedSeconds,
        startedAt: new Date(longest.startedAt).toISOString(),
      }
    : null;
  return week;
}

function buildGuestReport(): WeeklyReportPayload {
  const now = new Date();
  const currentEnd = new Date(now);
  currentEnd.setUTCHours(23, 59, 59, 999);
  const currentStart = new Date(currentEnd);
  currentStart.setUTCDate(currentStart.getUTCDate() - 6);
  currentStart.setUTCHours(0, 0, 0, 0);

  const previousEnd = new Date(currentStart);
  previousEnd.setUTCMilliseconds(previousEnd.getUTCMilliseconds() - 1);
  const previousStart = new Date(previousEnd);
  previousStart.setUTCDate(previousStart.getUTCDate() - 6);
  previousStart.setUTCHours(0, 0, 0, 0);

  const sessions = getGuestFocusSessions();
  const current = aggregateGuest(sessions, currentStart, currentEnd);
  const previous = aggregateGuest(sessions, previousStart, previousEnd);
  return { ...current, current, previous };
}

interface DeltaInfo {
  direction: "up" | "down" | "flat";
  pct: number;
}

function computeDelta(current: number, previous: number): DeltaInfo {
  if (previous === 0 && current === 0) return { direction: "flat", pct: 0 };
  if (previous === 0) return { direction: "up", pct: 100 };
  const delta = current - previous;
  const pct = Math.round((delta / previous) * 100);
  if (pct === 0) return { direction: "flat", pct: 0 };
  return { direction: pct > 0 ? "up" : "down", pct: Math.abs(pct) };
}

export default function FocusWeeklyReport({ language = "ar" }: Props) {
  const labels = LABELS[language];
  const { logBehavior } = useBehaviorTracking();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  const { data: serverReport, isLoading } = useQuery<WeeklyReportPayload>({
    queryKey: ["/api/me/focus-sessions/weekly"],
    enabled: isAuthenticated,
    retry: false,
  });

  const articlesQueryKey =
    language === "en"
      ? ["/api/en/articles"]
      : language === "ur"
        ? ["/api/ur/articles"]
        : ["/api/articles"];

  const { data: articlesRaw } = useQuery<SuggestedArticle[]>({
    queryKey: articlesQueryKey,
    staleTime: 2 * 60 * 1000,
    enabled: true,
  });

  const suggestedArticles = useMemo(() => {
    const list = Array.isArray(articlesRaw) ? articlesRaw : [];
    return list
      .filter((a) => a?.slug && a?.title && (a.status == null || a.status === "published"))
      .slice(0, 4);
  }, [articlesRaw]);

  const guestReport = useMemo<WeeklyReportPayload | null>(() => {
    if (isAuthenticated) return null;
    return buildGuestReport();
  }, [isAuthenticated]);

  const report: WeeklyReportPayload | null = isAuthenticated ? (serverReport || null) : guestReport;
  const current = report?.current ?? (report ? { ...report, current: undefined, previous: undefined } as WeekAggregate : null);
  const previous = report?.previous ?? null;

  useEffect(() => {
    logBehavior("weekly_report_view", { language, isLoggedIn: isAuthenticated });
  }, [logBehavior, language, isAuthenticated]);

  const maxDaySeconds = useMemo(() => {
    if (!current || current.daily.length === 0) return 0;
    return Math.max(...current.daily.map((d) => d.focusedSeconds), 1);
  }, [current]);

  const showSkeleton = (authLoading && !guestReport) || (isAuthenticated && isLoading);
  const empty = !showSkeleton && (!current || current.totalSessions === 0);

  return (
    <div dir={labels.dir} className="flex min-h-screen flex-col bg-background" data-testid="page-focus-weekly">
      <Header user={user || undefined} />
      <div className="border-b border-primary/10 bg-ai-gradient-soft">
        <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
          <AccountSectionHeader
            icon={Eye}
            title={labels.title}
            subtitle={labels.subtitle}
            testId="text-weekly-title"
          />
          {!isAuthenticated && !authLoading ? (
            <p className="mt-1 rounded-xl border border-border/50 bg-background/60 p-3 text-sm text-muted-foreground" data-testid="text-weekly-guest-note">
              {labels.guestNote}
            </p>
          ) : null}
        </div>
      </div>
      <main className="flex-1 py-8">
        <div className="container mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {showSkeleton ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Skeleton className="h-28" />
              <Skeleton className="h-28" />
              <Skeleton className="h-28" />
              <Skeleton className="h-28" />
            </div>
          ) : empty ? (
            <EmptyActivation
              labels={labels}
              isAuthenticated={isAuthenticated}
              suggestedArticles={suggestedArticles}
            />
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                  icon={<FileText className="h-5 w-5" />}
                  label={labels.totalArticles}
                  value={(current!.totalArticles ?? 0).toLocaleString(labels.locale)}
                  delta={previous ? computeDelta(current!.totalArticles ?? 0, previous.totalArticles ?? 0) : null}
                  deltaLabels={labels}
                  testId="card-stat-articles"
                />
                <StatCard
                  icon={<Clock className="h-5 w-5" />}
                  label={labels.totalFocus}
                  value={formatMinutes(current!.totalFocusedSeconds, labels.locale, labels)}
                  delta={previous ? computeDelta(current!.totalFocusedSeconds, previous.totalFocusedSeconds) : null}
                  deltaLabels={labels}
                  testId="card-stat-focus"
                />
                <StatCard
                  icon={<BookOpenCheck className="h-5 w-5" />}
                  label={labels.totalSessions}
                  value={current!.totalSessions.toLocaleString(labels.locale)}
                  delta={previous ? computeDelta(current!.totalSessions, previous.totalSessions) : null}
                  deltaLabels={labels}
                  testId="card-stat-sessions"
                />
                <StatCard
                  icon={<Flame className="h-5 w-5" />}
                  label={labels.completed}
                  value={current!.totalCompleted.toLocaleString(labels.locale)}
                  delta={previous ? computeDelta(current!.totalCompleted, previous.totalCompleted) : null}
                  deltaLabels={labels}
                  testId="card-stat-completed"
                />
              </div>

              <Card className="mt-6 border-0 shadow-sm dark:border dark:border-card-border">
                <CardHeader>
                  <CardTitle>{labels.highlights}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 sm:grid-cols-3" data-testid="grid-weekly-highlights">
                    <HighlightTile
                      icon={<FolderOpen className="h-4 w-4" />}
                      label={labels.topCategoryLabel}
                      value={current!.topCategory?.name || labels.noCategory}
                      meta={current!.topCategory
                        ? formatMinutes(current!.topCategory.focusedSeconds, labels.locale, labels)
                        : ""}
                      testId="text-weekly-top-category"
                    />
                    <HighlightTile
                      icon={<Hourglass className="h-4 w-4" />}
                      label={labels.longestSessionLabel}
                      value={current!.longestSession
                        ? formatMinutes(current!.longestSession.focusedSeconds, labels.locale, labels)
                        : labels.noCategory}
                      meta={current!.longestSession?.articleTitle || ""}
                      href={current!.longestSession?.articleSlug
                        ? `${labels.articleLinkPrefix}${current!.longestSession.articleSlug}`
                        : undefined}
                      testId="text-weekly-longest-session"
                    />
                    <HighlightTile
                      icon={<Trophy className="h-4 w-4" />}
                      label={labels.average}
                      value={formatMinutes(current!.averageSessionSeconds, labels.locale, labels)}
                      meta={`${current!.totalSessions.toLocaleString(labels.locale)} ${labels.sessionsUnit}`}
                      testId="text-weekly-average-tile"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card className="mt-6 border-0 shadow-sm dark:border dark:border-card-border">
                <CardHeader>
                  <CardTitle>{labels.daily}</CardTitle>
                  <CardDescription data-testid="text-weekly-current-range">
                    {labels.currentWeek}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3" data-testid="list-weekly-daily">
                    {current!.daily.map((d) => {
                      const widthPct = maxDaySeconds > 0 ? Math.round((d.focusedSeconds / maxDaySeconds) * 100) : 0;
                      const dateLabel = new Date(d.date).toLocaleDateString(labels.locale, { weekday: "short", day: "numeric", month: "short" });
                      return (
                        <div key={d.date} className="flex items-center gap-3" data-testid={`row-weekly-day-${d.date}`}>
                          <div className="w-24 text-sm text-muted-foreground">{dateLabel}</div>
                          <div className="relative h-3 flex-1 overflow-hidden rounded-md bg-muted">
                            <div
                              className="absolute inset-y-0 start-0 bg-primary"
                              style={{ width: `${widthPct}%` }}
                              aria-hidden="true"
                            />
                          </div>
                          <div className="w-32 text-end text-sm tabular-nums" data-testid={`text-weekly-day-time-${d.date}`}>
                            {formatMinutes(d.focusedSeconds, labels.locale, labels)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {previous ? (
                <Card className="mt-6 border-0 shadow-sm dark:border dark:border-card-border">
                  <CardHeader>
                    <CardTitle>{labels.previousWeek}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="grid-weekly-previous">
                      <PreviousStat
                        label={labels.totalArticles}
                        value={(previous.totalArticles ?? 0).toLocaleString(labels.locale)}
                        testId="text-prev-articles"
                      />
                      <PreviousStat
                        label={labels.totalFocus}
                        value={formatMinutes(previous.totalFocusedSeconds, labels.locale, labels)}
                        testId="text-prev-focus"
                      />
                      <PreviousStat
                        label={labels.topCategoryLabel}
                        value={previous.topCategory?.name || labels.noCategory}
                        testId="text-prev-top-category"
                      />
                      <PreviousStat
                        label={labels.longestSessionLabel}
                        value={previous.longestSession
                          ? formatMinutes(previous.longestSession.focusedSeconds, labels.locale, labels)
                          : labels.noCategory}
                        testId="text-prev-longest-session"
                      />
                      <PreviousStat
                        label={labels.totalSessions}
                        value={previous.totalSessions.toLocaleString(labels.locale)}
                        testId="text-prev-sessions"
                      />
                      <PreviousStat
                        label={labels.average}
                        value={formatMinutes(previous.averageSessionSeconds, labels.locale, labels)}
                        testId="text-prev-average"
                      />
                    </div>
                  </CardContent>
                </Card>
              ) : null}

              {current!.topArticles.length > 0 ? (
                <Card className="mt-6 border-0 shadow-sm dark:border dark:border-card-border">
                  <CardHeader>
                    <CardTitle>{labels.topArticles}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ol className="space-y-3" data-testid="list-weekly-top-articles">
                      {current!.topArticles.map((a, i) => (
                        <li key={a.articleId} className="flex items-center gap-3" data-testid={`row-top-article-${a.articleId}`}>
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold tabular-nums">
                            {(i + 1).toLocaleString(labels.locale)}
                          </span>
                          <div className="min-w-0 flex-1">
                            {a.slug ? (
                              <Link
                                href={`${labels.articleLinkPrefix}${a.slug}`}
                                className="block truncate text-sm font-medium hover:underline"
                                data-testid={`link-top-article-${a.articleId}`}
                              >
                                {a.title || a.slug}
                              </Link>
                            ) : (
                              <span className="block truncate text-sm font-medium">{a.title || a.articleId}</span>
                            )}
                            <span className="text-xs text-muted-foreground">
                              {a.sessions.toLocaleString(labels.locale)} {labels.sessionsUnit}
                            </span>
                          </div>
                          <div className="shrink-0 text-sm tabular-nums">
                            {formatMinutes(a.focusedSeconds, labels.locale, labels)}
                          </div>
                        </li>
                      ))}
                    </ol>
                  </CardContent>
                </Card>
              ) : null}
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}

function EmptyActivation({
  labels,
  isAuthenticated,
  suggestedArticles,
}: {
  labels: Labels;
  isAuthenticated: boolean;
  suggestedArticles: SuggestedArticle[];
}) {
  const steps = [
    { icon: BookOpen, title: labels.step1Title, body: labels.step1Body },
    { icon: Eye, title: labels.step2Title, body: labels.step2Body },
    { icon: BarChart3, title: labels.step3Title, body: labels.step3Body },
  ];
  const ghostHeights = [28, 55, 18, 72, 40, 60, 35];

  return (
    <div className="space-y-6" data-testid="weekly-empty-activation">
      <Card className="overflow-hidden border-primary/15 bg-gradient-to-b from-primary/[0.06] to-background">
        <CardContent className="space-y-5 py-8 text-center sm:px-10">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Eye className="h-7 w-7" aria-hidden="true" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold sm:text-2xl" data-testid="text-weekly-empty-headline">
              {labels.emptyHeadline}
            </h2>
            <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
              {labels.emptyLead}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button asChild data-testid="button-weekly-browse-home">
              <Link href={labels.homeHref}>{labels.browseHome}</Link>
            </Button>
            {!isAuthenticated ? (
              <Button asChild variant="outline" data-testid="button-weekly-login-cta">
                <Link href={labels.loginHref}>
                  <LogIn className="me-2 h-4 w-4" aria-hidden="true" />
                  {labels.loginCta}
                </Link>
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3" data-testid="list-weekly-empty-steps">
        {steps.map((step, i) => (
          <Card key={step.title} className="bg-muted/20">
            <CardContent className="space-y-2 p-4 text-start">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold tabular-nums text-primary">
                  {(i + 1).toLocaleString(labels.locale)}
                </span>
                <step.icon className="h-4 w-4 text-primary" aria-hidden="true" />
              </div>
              <p className="text-sm font-semibold">{step.title}</p>
              <p className="text-xs leading-relaxed text-muted-foreground">{step.body}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{labels.previewTitle}</CardTitle>
          <CardDescription>{labels.previewHint}</CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className="flex h-28 items-end justify-between gap-2 rounded-lg border border-dashed bg-muted/30 px-3 pb-3 pt-6 opacity-70"
            aria-hidden="true"
            data-testid="weekly-empty-ghost-chart"
          >
            {ghostHeights.map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-t-md bg-primary/25"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 opacity-60">
            <div className="rounded-md border bg-muted/40 p-3">
              <div className="h-2 w-12 rounded bg-muted-foreground/20" />
              <div className="mt-2 h-5 w-10 rounded bg-muted-foreground/15" />
            </div>
            <div className="rounded-md border bg-muted/40 p-3">
              <div className="h-2 w-14 rounded bg-muted-foreground/20" />
              <div className="mt-2 h-5 w-12 rounded bg-muted-foreground/15" />
            </div>
            <div className="rounded-md border bg-muted/40 p-3">
              <div className="h-2 w-10 rounded bg-muted-foreground/20" />
              <div className="mt-2 h-5 w-8 rounded bg-muted-foreground/15" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{labels.startHere}</CardTitle>
          <CardDescription>{labels.openFocusHint}</CardDescription>
        </CardHeader>
        <CardContent>
          {suggestedArticles.length > 0 ? (
            <ul className="space-y-2" data-testid="list-weekly-suggested-articles">
              {suggestedArticles.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`${labels.articleLinkPrefix}${a.slug}`}
                    className="flex items-center gap-3 rounded-lg border bg-background px-3 py-3 text-start transition hover:bg-muted/50"
                    data-testid={`link-weekly-suggested-${a.id}`}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{a.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground" data-testid="text-weekly-empty-fallback">
              {labels.noData}
            </p>
          )}
          <div className="mt-4 text-center">
            <Link
              href={labels.homeHref}
              className="text-sm text-primary underline-offset-4 hover:underline"
              data-testid="link-weekly-back"
            >
              {labels.backHome}
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  testId: string;
  delta: DeltaInfo | null;
  deltaLabels: { vsPrevious: string; samePrevious: string };
}

function StatCard({ icon, label, value, testId, delta, deltaLabels }: StatCardProps) {
  return (
    <Card className="border-0 shadow-sm dark:border dark:border-card-border hover-elevate" data-testid={testId}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardDescription>{label}</CardDescription>
        <span className="rounded-lg bg-primary/10 p-2 text-primary" aria-hidden="true">{icon}</span>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tabular-nums">{value}</div>
        {delta ? (
          <div
            className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground"
            data-testid={`${testId}-delta`}
          >
            {delta.direction === "up" ? (
              <ArrowUp className="h-3 w-3 text-success" aria-hidden="true" />
            ) : delta.direction === "down" ? (
              <ArrowDown className="h-3 w-3 text-destructive" aria-hidden="true" />
            ) : (
              <Minus className="h-3 w-3" aria-hidden="true" />
            )}
            <span className="tabular-nums">
              {delta.direction === "flat" ? deltaLabels.samePrevious : `${delta.pct}%`}
            </span>
            <span>{deltaLabels.vsPrevious}</span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function PreviousStat({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums" data-testid={testId}>{value}</div>
    </div>
  );
}

interface HighlightTileProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  meta?: string;
  href?: string;
  testId: string;
}

function HighlightTile({ icon, label, value, meta, href, testId }: HighlightTileProps) {
  const body = (
    <>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span aria-hidden="true">{icon}</span>
        <span>{label}</span>
      </div>
      <div className="mt-2 truncate text-base font-semibold" data-testid={testId}>{value}</div>
      {meta ? <div className="mt-1 truncate text-xs text-muted-foreground">{meta}</div> : null}
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        className="block rounded-md border bg-muted/30 p-3 hover-elevate"
        data-testid={`${testId}-link`}
      >
        {body}
      </Link>
    );
  }
  return <div className="rounded-md border bg-muted/30 p-3">{body}</div>;
}
