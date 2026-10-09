/**
 * رادار سبق الذكي — غرفة رصد المصادر العالمية في لوحة التحكم.
 * بطاقات لكل مادة مرصودة: قيمة إخبارية + ترجمة تفسيرية + تحويل تحريري
 * بمعيار سبق، وتصدير يفتح محرر المقالات معبأً بالكامل (النشر بضغطة زر).
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  BellRing,
  ExternalLink,
  FileCheck2,
  Globe,
  Plus,
  SearchCheck,
  Radar,
  RotateCcw,
  Satellite,
  Send,
  Trash2,
  Wand2,
  X,
  Zap,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

// ---------- أنواع استجابات الـ API ----------

interface RadarStatsResponse {
  newToday: number;
  breakingActive: number;
  readyDrafts: number;
  exportedTotal: number;
  activeSources: number;
  lastFetchedAt: string | null;
  newsapiLastFetchedAt: string | null;
  telegramConfigured: boolean;
  webSearchConfigured: boolean;
  filteredToday?: number;
  mergedToday?: number;
}

interface RadarStatusResponse {
  enabled: boolean;
  forceDisabled: boolean;
  cronEnabled: boolean;
  clustering: boolean;
  autoTransform: boolean;
  dailyAnalyzeCap: number;
  analyzedToday: number;
  lastAnalyzedAt: string | null;
  lastCycle: { finishedAt: string; summary: { analysisCapped?: boolean } } | null;
}

interface RadarItemRow {
  id: string;
  sourceId: string;
  sourceName: string | null;
  sourceType: "rss" | "json" | "x" | null;
  xValue: string | null;
  publisher: string | null;
  link: string;
  originalTitle: string;
  originalExcerpt: string | null;
  originalLanguage: string | null;
  publishedAt: string | null;
  fetchedAt: string;
  status: "new" | "analyzed" | "ready" | "exported" | "dismissed" | "filtered" | "merged";
  newsValue: number | null;
  scoreBreakdown: { reason?: string; saudiRelevance?: number; breakingDeniedBy?: string | null } | null;
  isBreaking: boolean;
  breakingUntil?: string | null;
  // فرز الدقة — محاور منفصلة بدل رقم واحد يوحي باحتمال صحة
  publisherType?: string | null;
  wireOrigin?: string | null;
  textBasis?: "body" | "title_only" | null;
  qualityFlags?: string[] | null;
  screenReason?: string | null;
  eventTiming?: "new" | "ongoing" | "old" | "unknown" | null;
  timingEvidence?: string | null;
  contentType?: string | null;
  evidenceScore?: number | null;
  freshnessScore?: number | null;
  priorityScore?: number | null;
  lane?: "opportunity" | "watch" | "background" | null;
  storySourceCount?: number | null;
  mergedCopies?: number;
  storySiblings?: number;
  matchedKeywords: string[] | null;
  translatedTitle: string | null;
  translatedSummary: string | null;
  exportedArticleId: string | null;
  // حقول مسار «طوّر ببحث» فقط — بقية المسودة لا تعرضها البطاقة
  draft: {
    developNotes?: string[];
    developSources?: { title: string; url: string }[];
    developedWithSearch?: boolean;
  } | null;
}

interface RadarSourceRow {
  id: string;
  name: string;
  url: string;
  type: "rss" | "json" | "x";
  language: string;
  categorySlug: string | null;
  fetchIntervalMinutes: number;
  isActive: boolean;
  lastFetchedAt: string | null;
  lastError: string | null;
  xType?: string | null;
  xValue?: string | null;
  xProvider?: string | null;
  tier?: string | null;
  region?: string | null;
  weight?: number | null;
  packId?: string | null;
}

interface RadarHealthResponse {
  active: number;
  rss: number;
  xWatches: number;
  withError: number;
  neverFetched: number;
  errors: Array<{ id: string; name: string; type: string; lastError: string | null; tier: string | null }>;
}

interface RadarRuleRow {
  id: string;
  label: string;
  keywords: string[];
  minNewsValue: number;
  markBreaking: boolean;
  notifyTelegram: boolean;
  isActive: boolean;
}

interface CategoryRow {
  id: string;
  nameAr: string;
  slug: string;
  status?: string;
}

// ---------- ثوابت العرض ----------

// المسارات الثلاثة: فرص (مرتبة بالأولوية المركبة) · يحتاج تحققًا (ادعاءات/دليل ضعيف)
// · خلفية (قديم/ترويجي) — لا تزاحم الخلفية الوارد الحي
const TABS: { id: string; label: string; params: Record<string, string> }[] = [
  { id: "inbox", label: "فرص", params: { status: "new,analyzed", lane: "opportunity", sort: "priority" } },
  { id: "watch", label: "يحتاج تحققًا", params: { status: "new,analyzed", lane: "watch", sort: "priority" } },
  { id: "breaking", label: "عاجل", params: { status: "new,analyzed,ready", breaking: "true", sort: "priority" } },
  { id: "ready", label: "جاهز للنشر", params: { status: "ready" } },
  { id: "background", label: "خلفية", params: { status: "analyzed", lane: "background" } },
  { id: "exported", label: "صُدِّر", params: { status: "exported" } },
  { id: "dismissed", label: "مستبعد", params: { status: "dismissed" } },
  { id: "filtered", label: "مستبعد آليًا", params: { status: "filtered" } },
];

const PUBLISHER_TYPE_LABELS: Record<string, string> = {
  official: "جهة رسمية",
  wire: "وكالة",
  major: "مؤسسة كبرى",
  press_release: "بيان صحفي",
  aggregator: "مجمّع",
  social: "تواصل",
};

const TIMING_LABELS: Record<string, string> = {
  new: "حدث جديد",
  ongoing: "تطور مستمر",
  old: "حدث قديم",
  unknown: "توقيت غير محسوم",
};

/** عاجل نشط = وسم لم تنتهِ صلاحيته (المواد القديمة بلا صلاحية: 3 ساعات من الرصد) */
function isActiveBreaking(item: RadarItemRow): boolean {
  if (!item.isBreaking) return false;
  const until = item.breakingUntil
    ? new Date(item.breakingUntil).getTime()
    : new Date(item.fetchedAt).getTime() + 3 * 3_600_000;
  return until > Date.now();
}

const EMPTY_MESSAGES: Record<string, string> = {
  inbox: "لا فرص في هذه النافذة — جرّب نافذة أوسع أو تبويب «يحتاج تحققًا»",
  watch: "لا ادعاءات أو مواد ضعيفة الدليل تحتاج تحققًا الآن",
  background: "لا مواد خلفية",
  filtered: "لا مواد مستبعدة آليًا — البيانات الصحفية والتواريخ المستحيلة تظهر هنا مع السبب",
  breaking: "لا رصد عاجلًا الآن — التنبيهات تظهر هنا فور مطابقة قواعدك",
  ready: "لا مسودات جاهزة — حوّل مادة من تبويب الرصد لتظهر هنا",
  exported: "لم يُصدَّر شيء بعد — المواد المصدَّرة تبقى هنا للتوثيق",
  dismissed: "لا مواد مستبعدة",
};

function scoreColor(value: number): string {
  if (value >= 80) return "bg-red-500";
  if (value >= 60) return "bg-amber-500";
  if (value >= 40) return "bg-blue-500";
  return "bg-gray-400";
}

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ar });
  } catch {
    return "";
  }
}

function describeRunStatus(status: RadarStatusResponse | undefined): string {
  if (!status) return "تعذر التحقق من حالة الرادار — أزرار التنفيذ معطلة مؤقتًا.";
  if (status.forceDisabled) {
    return "الرادار متوقف بقفل طارئ — لا يمكن تشغيله من هذا الزر. البيانات السابقة محفوظة.";
  }
  if (!status.enabled) {
    return "الرادار متوقف بالكامل — البيانات السابقة محفوظة، ولن تُجرى عمليات جلب أو تحليل أو تحويل جديدة.";
  }
  const parts: string[] = [status.cronEnabled ? "الرصد الآلي يعمل" : "الرصد الآلي متوقف"];
  if (status.lastAnalyzedAt) parts.push(`آخر تحليل ${timeAgo(status.lastAnalyzedAt)}`);
  parts.push(`تحليل اليوم ${status.analyzedToday}/${status.dailyAnalyzeCap}`);
  if (status.analyzedToday >= status.dailyAnalyzeCap) parts.push("بلغ السقف اليومي — التحليل مؤجل");
  parts.push(status.autoTransform ? "التحويل التلقائي مفعّل" : "التحويل التلقائي معطّل");
  return parts.join(" · ");
}

// ---------- الصفحة ----------

export default function SmartRadar() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("inbox");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [channelFilter, setChannelFilter] = useState<"all" | "feed" | "x">("all");
  // الافتراضي آخر 24 ساعة: «كل الأوقات» مع الترتيب بالرصد كان يخلط القديم بالحي
  const [timeFilter, setTimeFilter] = useState<"all" | "1" | "3" | "24">("24");
  const [limit, setLimit] = useState(30);

  const tabParams = TABS.find((t) => t.id === activeTab)?.params ?? {};

  // ---------- الاستعلامات ----------

  const { data: statsRaw } = useQuery<RadarStatsResponse>({
    queryKey: ["/api/radar/stats"],
    refetchInterval: 60_000,
  });
  const stats = statsRaw ?? null;

  const {
    data: runStatus,
    isLoading: statusLoading,
    isError: statusError,
  } = useQuery<RadarStatusResponse>({
    queryKey: ["/api/radar/status"],
    refetchInterval: 60_000,
  });
  const statusAvailable = Boolean(runStatus) && !statusError;

  const invalidateRadar = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/radar/items"] });
    queryClient.invalidateQueries({ queryKey: ["/api/radar/stats"] });
  };

  const statusMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      apiRequest<RadarStatusResponse>("/api/radar/status", {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      }),
    onSuccess: (nextStatus) => {
      queryClient.setQueryData(["/api/radar/status"], nextStatus);
      queryClient.invalidateQueries({ queryKey: ["/api/radar/status"] });
      invalidateRadar();
      toast({
        title: "تم تحديث حالة الرادار",
        description: "البيانات السابقة محفوظة، وستتبع العمليات الجديدة الحالة المحدّثة.",
      });
    },
    onError: (error: Error) =>
      toast({ title: "تعذر تحديث حالة الرادار", description: error.message, variant: "destructive" }),
  });
  // لا نسمح بأي عملية قد تجلب أو تحلل أو تولّد تكلفة قبل تأكيد الحالة من الخادم.
  const radarActionsEnabled =
    statusAvailable && runStatus?.enabled === true && !runStatus.forceDisabled && !statusMutation.isPending;

  const { data: itemsRaw, isLoading: itemsLoading } = useQuery<{
    items: RadarItemRow[];
    total: number;
  }>({
    queryKey: [
      "/api/radar/items",
      {
        ...tabParams,
        sourceId: sourceFilter === "all" ? undefined : sourceFilter,
        channel: channelFilter === "all" ? undefined : channelFilter,
        sinceHours: timeFilter === "all" ? undefined : Number(timeFilter),
        limit,
      },
    ],
    refetchInterval: 60_000,
  });
  const items = Array.isArray(itemsRaw?.items) ? itemsRaw.items : [];
  const total = itemsRaw?.total ?? 0;

  const { data: sourcesRaw } = useQuery<{ sources: RadarSourceRow[] }>({
    queryKey: ["/api/radar/sources"],
  });
  const allSources = Array.isArray(sourcesRaw?.sources) ? sourcesRaw.sources : [];
  const sources = allSources.filter((s) => s.type !== "x");
  const xWatches = allSources.filter((s) => s.type === "x");

  const { data: health } = useQuery<RadarHealthResponse>({
    queryKey: ["/api/radar/health"],
    refetchInterval: 120_000,
  });

  const { data: rulesRaw } = useQuery<{ rules: RadarRuleRow[] }>({
    queryKey: ["/api/radar/alert-rules"],
  });
  const rules = Array.isArray(rulesRaw?.rules) ? rulesRaw.rules : [];

  const { data: categoriesRaw } = useQuery<CategoryRow[]>({ queryKey: ["/api/categories"] });
  const categories = Array.isArray(categoriesRaw) ? categoriesRaw : [];

  const guardedRadarAction = (action: () => void) => {
    if (!radarActionsEnabled) {
      toast({
        title: "الرادار متوقف",
        description: "البيانات السابقة محفوظة، ويمكن إعادة التشغيل من زر حالة الرادار.",
        variant: "destructive",
      });
      return;
    }
    action();
  };

  // ---------- إجراءات المواد ----------

  const transformMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/radar/items/${id}/transform`, { method: "POST" }),
    onSuccess: () => {
      invalidateRadar();
      toast({ title: "✅ تم التحويل التحريري — المسودة جاهزة في تبويب «جاهز للنشر»" });
    },
    onError: (error: Error) =>
      toast({ title: "❌ فشل التحويل التحريري", description: error.message, variant: "destructive" }),
  });

  // «طوّر ببحث» — نظام التحرير الموحد: بحث تحقق + مسودة مثراة بعزو
  const developMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/radar/items/${id}/develop`, { method: "POST" }),
    onSuccess: () => {
      invalidateRadar();
      toast({ title: "✅ طُوّرت المادة — المسودة وملاحظات المراجع في تبويب «جاهز للنشر»" });
    },
    onError: (error: Error) =>
      toast({ title: "❌ فشل التطوير التحريري", description: error.message, variant: "destructive" }),
  });

  const exportMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest<{ articleId: string }>(`/api/radar/items/${id}/export`, { method: "POST" }),
    onSuccess: (data) => {
      invalidateRadar();
      toast({ title: "✅ أُنشئت المسودة — فتح المحرر للمراجعة والنشر" });
      setLocation(`/dashboard/articles/${data.articleId}/edit`);
    },
    onError: (error: Error) =>
      toast({ title: "❌ فشل التصدير", description: error.message, variant: "destructive" }),
  });

  const dismissMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/radar/items/${id}/dismiss`, { method: "POST" }),
    onSuccess: () => {
      invalidateRadar();
      toast({ title: "تم استبعاد المادة" });
    },
    onError: (error: Error) =>
      toast({ title: "❌ فشل الاستبعاد", description: error.message, variant: "destructive" }),
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/radar/items/${id}/restore`, { method: "POST" }),
    onSuccess: () => {
      invalidateRadar();
      toast({ title: "تمت استعادة المادة" });
    },
    onError: (error: Error) =>
      toast({ title: "❌ فشلت الاستعادة", description: error.message, variant: "destructive" }),
  });

  const pendingItemId =
    transformMutation.isPending || exportMutation.isPending || developMutation.isPending
      ? (transformMutation.variables ?? exportMutation.variables ?? developMutation.variables)
      : null;

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-[1600px] space-y-6 pb-10" dir="rtl">
        {/* ---------- الترويسة ---------- */}
        <DashboardPageHeader
          icon={Radar}
          title="رادار سبق الذكي"
          description={statusLoading ? "جارٍ التحقق من حالة الرادار..." : describeRunStatus(statusError ? undefined : runStatus)}
          actions={
            <>
            <Button
              variant={radarActionsEnabled ? "destructive" : "default"}
              size="sm"
              className="font-semibold"
              disabled={
                !statusAvailable ||
                statusLoading ||
                statusMutation.isPending ||
                Boolean(runStatus?.forceDisabled)
              }
              onClick={() => statusMutation.mutate(!radarActionsEnabled)}
              aria-pressed={radarActionsEnabled}
              data-testid="button-radar-master-switch"
              title={
                !statusAvailable
                  ? "جارٍ التحقق من حالة الرادار"
                  : runStatus?.forceDisabled
                    ? "لا يمكن تشغيل الرادار أثناء القفل الطارئ"
                  : radarActionsEnabled
                    ? "إيقاف الجلب والتحليل والتحويلات الجديدة"
                    : "إعادة تشغيل عمليات الرادار"
              }
            >
              {statusLoading || statusMutation.isPending
                ? "جارٍ تحديث الحالة..."
                : runStatus?.forceDisabled
                  ? "التشغيل غير متاح"
                  : radarActionsEnabled
                  ? "إيقاف الرادار بالكامل"
                  : "تشغيل الرادار"}
            </Button>
            <SourcesSheet sources={sources} categories={categories} allowFetching={radarActionsEnabled} />
            <WatchesSheet watches={xWatches} categories={categories} allowFetching={radarActionsEnabled} />
            <RulesDialog rules={rules} telegramConfigured={stats?.telegramConfigured ?? false} />
            </>
          }
        />

        {statusError && !statusLoading && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            تعذر التحقق من حالة الرادار؛ أزرار التنفيذ معطلة مؤقتًا. ستتجدد المحاولة تلقائيًا.
          </div>
        )}

        {health && health.withError > 0 && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            {health.withError} مصدر/رصدة بخطأ جلب — راجع «المصادر» أو «رصدات X». شبكة نشطة:{" "}
            {health.rss} RSS · {health.xWatches} X
          </div>
        )}

        {/* ---------- مؤشرات سريعة ---------- */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <KpiCard
            icon={<Satellite className="h-4 w-4" />}
            label="وارد اليوم"
            value={stats?.newToday}
            hint={
              stats?.mergedToday || stats?.filteredToday
                ? `${stats?.mergedToday ?? 0} نسخة ضُمّت · ${stats?.filteredToday ?? 0} استُبعدت آليًا`
                : undefined
            }
          />
          <KpiCard
            icon={<Zap className="h-4 w-4 text-red-500" />}
            label="عاجل نشط"
            value={stats?.breakingActive}
            highlight={Boolean(stats?.breakingActive)}
          />
          <KpiCard icon={<Wand2 className="h-4 w-4" />} label="مسودات جاهزة" value={stats?.readyDrafts} />
          <KpiCard icon={<FileCheck2 className="h-4 w-4" />} label="صُدِّر للنشر" value={stats?.exportedTotal} />
          <KpiCard
            icon={<Globe className="h-4 w-4" />}
            label="مصادر نشطة"
            value={stats?.activeSources}
            hint={stats?.lastFetchedAt ? `آخر جلب ${timeAgo(stats.lastFetchedAt)}` : undefined}
          />
        </div>

        {/* ممر NewsAPI يجلب كل ساعة ترشيدًا للتوكنز — المؤشر يطمئن أنه حي دون فتح «المصادر» */}
        {stats?.newsapiLastFetchedAt && (
          <p className="text-xs text-muted-foreground">
            NewsAPI.ai: آخر سحب {timeAgo(stats.newsapiLastFetchedAt)} · يجلب مرة كل ساعة
          </p>
        )}

        {/* ---------- التبويبات والفلاتر ---------- */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="w-full overflow-x-auto sm:w-auto">
          <Tabs value={activeTab} onValueChange={(value) => { setActiveTab(value); setLimit(30); }}>
            <TabsList className="w-max">
              {TABS.map((tab) => (
                <TabsTrigger key={tab.id} value={tab.id}>
                  {tab.label}
                  {tab.id === "breaking" && (stats?.breakingActive ?? 0) > 0 && (
                    <span className="mr-1 inline-block h-2 w-2 animate-pulse rounded-full bg-red-500" />
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Select
              value={timeFilter}
              onValueChange={(value) => setTimeFilter(value as "all" | "1" | "3" | "24")}
            >
              <SelectTrigger className="w-full sm:w-36">
                <SelectValue placeholder="الوقت" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الأوقات</SelectItem>
                <SelectItem value="1">آخر ساعة</SelectItem>
                <SelectItem value="3">آخر 3 ساعات</SelectItem>
                <SelectItem value="24">آخر 24 ساعة</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={channelFilter}
              onValueChange={(value) => setChannelFilter(value as "all" | "feed" | "x")}
            >
              <SelectTrigger className="w-full sm:w-36">
                <SelectValue placeholder="القناة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                <SelectItem value="feed">صحف / RSS</SelectItem>
                <SelectItem value="x">إكس فقط</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue placeholder="كل المصادر" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المصادر</SelectItem>
                {allSources.map((source) => (
                  <SelectItem key={source.id} value={source.id}>
                    {source.type === "x" ? `X · ${source.name}` : source.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* ---------- شبكة البطاقات ---------- */}
        {itemsLoading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-56 rounded-xl" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <Radar className="h-10 w-10 text-muted-foreground" />
              <p className="text-muted-foreground">{EMPTY_MESSAGES[activeTab]}</p>
              {sources.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  ابدأ من «المصادر» / «رصدات X» — أو: npx tsx scripts/seed-radar-pack.ts --all
                </p>
              )}
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {items.map((item) => (
                <RadarItemCard
                  key={item.id}
                  item={item}
                  busy={pendingItemId === item.id}
                  searchConfigured={stats?.webSearchConfigured ?? false}
                  onTransform={() => guardedRadarAction(() => transformMutation.mutate(item.id))}
                  onDevelop={() => guardedRadarAction(() => developMutation.mutate(item.id))}
                  onExport={() => guardedRadarAction(() => exportMutation.mutate(item.id))}
                  radarActionsEnabled={radarActionsEnabled}
                  onDismiss={() => dismissMutation.mutate(item.id)}
                  onRestore={() => restoreMutation.mutate(item.id)}
                  onOpenArticle={(articleId) => setLocation(`/dashboard/articles/${articleId}/edit`)}
                />
              ))}
            </div>
            {items.length < total && (
              <div className="flex justify-center">
                <Button variant="outline" onClick={() => setLimit((prev) => prev + 30)}>
                  عرض المزيد ({items.length} من {total})
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

// ---------- مكوّنات فرعية ----------

function KpiCard({
  icon,
  label,
  value,
  hint,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | undefined;
  hint?: string;
  highlight?: boolean;
}) {
  return (
    <Card className={highlight ? "border-red-300 dark:border-border" : undefined}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {icon}
          {label}
        </div>
        <div className="mt-1 text-2xl font-bold">{value ?? "—"}</div>
        {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function RadarItemCard({
  item,
  busy,
  radarActionsEnabled,
  onTransform,
  onExport,
  onDismiss,
  onRestore,
  onOpenArticle,
  onDevelop,
  searchConfigured,
}: {
  item: RadarItemRow;
  busy: boolean;
  radarActionsEnabled: boolean;
  onTransform: () => void;
  onExport: () => void;
  onDismiss: () => void;
  onRestore: () => void;
  onOpenArticle: (articleId: string) => void;
  onDevelop: () => void;
  searchConfigured: boolean;
}) {
  const score = item.newsValue;
  const keywords = Array.isArray(item.matchedKeywords) ? item.matchedKeywords : [];
  const flags = Array.isArray(item.qualityFlags) ? item.qualityFlags : [];
  const breaking = isActiveBreaking(item);
  const timeUnreliable = flags.includes("future_date") || flags.includes("missing_date");
  const pastYear = flags.find((f) => f.startsWith("past_year:"))?.split(":")[1];

  return (
    <Card className={`flex flex-col ${breaking ? "border-red-300 dark:border-border" : ""}`}>
      <CardHeader className="space-y-2 pb-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {breaking && (
            <Badge variant="destructive" className="animate-pulse">
              <Zap className="ml-0.5 h-3 w-3" /> عاجل
            </Badge>
          )}
          {/* شأن سعودي (تقييم المحلل ≥60) — تمييز بصري سريع لأولوية سبق الأولى */}
          {(item.scoreBreakdown?.saudiRelevance ?? 0) >= 60 && (
            <Badge
              variant="outline"
              className="border-green-600 text-green-700 dark:text-green-400"
              title={`صلة سعودية ${item.scoreBreakdown?.saudiRelevance}%`}
            >
              🇸🇦 سعودي
            </Badge>
          )}
          {/* لمواد ممرات الاصطياد (Google News/GDELT) الناشر الحقيقي أهم من اسم الممر */}
          <Badge variant="secondary" title={item.publisher ? item.sourceName ?? undefined : undefined}>
            {item.publisher ?? item.sourceName ?? "مصدر"}
            {item.publisherType && PUBLISHER_TYPE_LABELS[item.publisherType]
              ? ` · ${PUBLISHER_TYPE_LABELS[item.publisherType]}`
              : ""}
          </Badge>
          {(item.storySourceCount ?? 0) > 1 && (
            <Badge variant="outline" title="ناشرون/وكالات مستقلة — نسخ الناشر نفسه بلغات مختلفة تُعد مصدرًا واحدًا">
              {item.storySourceCount} مصادر مستقلة
            </Badge>
          )}
          {(item.mergedCopies ?? 0) + (item.storySiblings ?? 0) > 0 && (
            <Badge variant="outline" title="تغطيات أخرى للقصة نفسها من ناشرين ولغات مختلفة — تظهر بطاقة واحدة للقصة">
              +{(item.mergedCopies ?? 0) + (item.storySiblings ?? 0)} تغطية
            </Badge>
          )}
          {item.eventTiming && item.eventTiming !== "new" && (
            <Badge
              variant="outline"
              className={item.eventTiming === "old" ? "border-red-400 text-red-700 dark:text-red-300" : ""}
              title={item.timingEvidence ?? undefined}
            >
              {TIMING_LABELS[item.eventTiming]}
            </Badge>
          )}
          {item.textBasis === "title_only" && (
            <Badge variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-300" title="وصل العنوان وحده — لا ملخص حتى لا يُنسب للمصدر ما لم يُقرأ">
              المتن لم يُقرأ
            </Badge>
          )}
          {item.contentType === "claim" && (
            <Badge variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-300">
              ادعاء غير مؤكد
            </Badge>
          )}
          {item.sourceType === "x" ? (
            <Badge className="bg-sky-600 text-white hover:bg-sky-600">
              X{item.xValue ? ` · ${item.xValue}` : ""}
            </Badge>
          ) : (
            <Badge variant="outline">{item.sourceType === "json" ? "JSON" : "RSS"}</Badge>
          )}
          {item.originalLanguage && <Badge variant="outline">{item.originalLanguage}</Badge>}
          {!item.translatedTitle && (
            <Badge variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-300">
              بانتظار الترجمة
            </Badge>
          )}
          {/* «نُشر» = تاريخ المصدر الحقيقي؛ غيابه يُعلن صراحةً بوقت الرصد —
              عرض وقت الجلب كأنه وقت النشر أوهم بأن خبرًا قديمًا «منذ دقائق» */}
          <span className="text-muted-foreground">
            {item.publishedAt && !timeUnreliable
              ? `نُشر ${timeAgo(item.publishedAt)}`
              : `رُصد ${timeAgo(item.fetchedAt)} — ${flags.includes("future_date") ? "تاريخ النشر مستقبلي غير موثوق" : "تاريخ النشر غير معروف"}`}
            {pastYear ? ` · يذكر عام ${pastYear}` : ""}
          </span>
        </div>
        {score != null && (
          <div className="flex items-center gap-2" title="الصلة لجمهور سبق — ليست احتمال صحة الخبر">
            <span className="text-[11px] text-muted-foreground">صلة</span>
            <Progress value={score} className="h-1.5 flex-1" indicatorClassName={scoreColor(score)} />
            <span className="text-xs font-bold tabular-nums">{score}</span>
          </div>
        )}
        {item.evidenceScore != null && item.freshnessScore != null && (
          <div className="flex gap-3 text-[11px] text-muted-foreground tabular-nums">
            <span title="نوع الناشر + التأييد المستقل">دليل {item.evidenceScore}</span>
            <span title="عمر الزمن الموثوق للحدث">حداثة {item.freshnessScore}</span>
            {item.priorityScore != null && <span className="font-medium text-foreground">أولوية {item.priorityScore}</span>}
          </div>
        )}
      </CardHeader>
      <CardContent className="flex-1 space-y-2 pb-2">
        <h3 className="font-bold leading-snug line-clamp-2">
          {item.translatedTitle ?? item.originalTitle}
        </h3>
        {item.translatedTitle && (
          <p className="text-xs text-muted-foreground line-clamp-1" dir="ltr">
            {item.originalTitle}
          </p>
        )}
        {item.translatedSummary && (
          <p className="text-sm text-muted-foreground line-clamp-3">{item.translatedSummary}</p>
        )}
        {item.status === "filtered" && item.screenReason && (
          <p className="text-xs text-red-700 dark:text-red-300">استُبعد آليًا: {item.screenReason}</p>
        )}
        {item.scoreBreakdown?.reason && (
          <p className="text-xs italic text-muted-foreground line-clamp-2">
            {item.scoreBreakdown.reason}
          </p>
        )}
        {/* ملاحظات المراجع من مسار «طوّر ببحث» — تظهر مع المسودة الجاهزة */}
        {item.status === "ready" && (item.draft?.developNotes?.length ?? 0) > 0 && (
          <div className="space-y-1 rounded-md border bg-muted/40 p-2">
            <div className="flex items-center gap-1.5 text-[11px] font-medium">
              <SearchCheck className="h-3 w-3" />
              {item.draft?.developedWithSearch
                ? `طُوّرت ببحث تحقق (${item.draft?.developSources?.length ?? 0} مصدر)`
                : "طُوّرت بوضع متحفظ — بلا بحث خارجي"}
            </div>
            <ul className="space-y-0.5">
              {(item.draft?.developNotes ?? []).slice(0, 3).map((note, i) => (
                <li key={i} className="text-[11px] leading-4 text-muted-foreground">
                  • {note}
                </li>
              ))}
            </ul>
          </div>
        )}
        {keywords.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {keywords.slice(0, 4).map((keyword) => (
              <Badge key={keyword} variant="outline" className="text-[10px]">
                <BellRing className="ml-0.5 h-2.5 w-2.5" />
                {keyword}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap items-center gap-2 pt-0">
        {(item.status === "new" || item.status === "analyzed") && (
          <>
            <Button size="sm" onClick={onTransform} disabled={busy || !radarActionsEnabled}>
              <Wand2 className={`ml-1 h-4 w-4 ${busy ? "animate-pulse" : ""}`} />
              {busy ? "جارٍ التحويل..." : "تحويل تحريري"}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={onDevelop}
              disabled={busy || !radarActionsEnabled}
              title={
                searchConfigured
                  ? "تطوير معزز ببحث تحقق من الويب — مسودة مثراة بعزو + ملاحظات مراجع"
                  : "البحث غير مهيأ (TAVILY_API_KEY / SERPER_API_KEY) — سيُطوَّر بوضع متحفظ مع قائمة ما يلزم تحققه"
              }
              data-testid={`button-radar-develop-${item.id}`}
            >
              <SearchCheck className={`ml-1 h-4 w-4 ${busy ? "animate-pulse" : ""}`} />
              {busy ? "جارٍ التطوير..." : "طوّر ببحث"}
            </Button>
          </>
        )}
        {item.status === "ready" && (
          <Button size="sm" onClick={onExport} disabled={busy || !radarActionsEnabled}>
            <Send className="ml-1 h-4 w-4" />
            {busy ? "جارٍ التصدير..." : "تصدير وفتح المحرر"}
          </Button>
        )}
        {item.status === "exported" && item.exportedArticleId && (
          <Button size="sm" variant="outline" onClick={() => onOpenArticle(item.exportedArticleId!)}>
            <FileCheck2 className="ml-1 h-4 w-4" />
            فتح المقال
          </Button>
        )}
        {(item.status === "dismissed" || item.status === "filtered") && (
          <Button size="sm" variant="outline" onClick={onRestore}>
            <RotateCcw className="ml-1 h-4 w-4" />
            استعادة
          </Button>
        )}
        {(item.status === "new" || item.status === "analyzed" || item.status === "ready") && (
          <Button size="sm" variant="ghost" onClick={onDismiss} title="استبعاد">
            <X className="h-4 w-4" />
          </Button>
        )}
        <a
          href={item.link}
          target="_blank"
          rel="noopener noreferrer"
          className="mr-auto text-muted-foreground hover:text-foreground"
          title="المصدر الأصلي"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      </CardFooter>
    </Card>
  );
}

// ---------- إدارة المصادر ----------

const EMPTY_SOURCE_FORM = {
  name: "",
  url: "",
  type: "rss" as "rss" | "json",
  language: "en",
  categorySlug: "",
  fetchIntervalMinutes: 15,
};

function SourcesSheet({
  sources,
  categories,
  allowFetching,
}: {
  sources: RadarSourceRow[];
  categories: CategoryRow[];
  allowFetching: boolean;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState(EMPTY_SOURCE_FORM);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const activeCategories = useMemo(
    () => categories.filter((c) => !c.status || c.status === "active"),
    [categories]
  );

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/radar/sources"] });
    queryClient.invalidateQueries({ queryKey: ["/api/radar/stats"] });
    queryClient.invalidateQueries({ queryKey: ["/api/radar/health"] });
  };

  const createMutation = useMutation({
    mutationFn: (body: typeof EMPTY_SOURCE_FORM) =>
      apiRequest("/api/radar/sources", {
        method: "POST",
        body: JSON.stringify({ ...body, categorySlug: body.categorySlug || null }),
      }),
    onSuccess: () => {
      invalidate();
      setForm(EMPTY_SOURCE_FORM);
      toast({ title: "✅ أُضيف المصدر (الجلب متوقف إجبارياً)" });
    },
    onError: (error: Error) =>
      toast({ title: "❌ فشلت إضافة المصدر", description: error.message, variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiRequest(`/api/radar/sources/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive }),
      }),
    onSuccess: invalidate,
    onError: (error: Error) =>
      toast({ title: "❌ فشل التعديل", description: error.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/radar/sources/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidate();
      setDeleteId(null);
      toast({ title: "تم حذف المصدر ومواده" });
    },
    onError: (error: Error) =>
      toast({ title: "❌ فشل الحذف", description: error.message, variant: "destructive" }),
  });

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <Globe className="ml-1 h-4 w-4" />
          المصادر ({sources.length})
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-full overflow-y-auto sm:max-w-lg" dir="rtl">
        <SheetHeader className="text-right">
          <SheetTitle>مصادر الرادار</SheetTitle>
          <SheetDescription>
            RSS أو JSON — حزم جاهزة: npx tsx scripts/seed-radar-pack.ts us-nationals us-broadcast
          </SheetDescription>
        </SheetHeader>

        {/* إضافة مصدر */}
        <div className="mt-4 space-y-3 rounded-lg border p-4">
          <h4 className="flex items-center gap-1 text-sm font-bold">
            <Plus className="h-4 w-4" /> إضافة مصدر
          </h4>
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <Label className="text-xs">الاسم</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="BBC World"
              />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">الرابط</Label>
              <Input
                dir="ltr"
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://feeds.bbci.co.uk/news/world/rss.xml"
              />
            </div>
            <div>
              <Label className="text-xs">النوع</Label>
              <Select
                value={form.type}
                onValueChange={(value) => setForm({ ...form, type: value as "rss" | "json" })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rss">RSS</SelectItem>
                  <SelectItem value="json">JSON API</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">لغة المصدر</Label>
              <Input
                dir="ltr"
                value={form.language}
                onChange={(e) => setForm({ ...form, language: e.target.value })}
                placeholder="en"
              />
            </div>
            <div>
              <Label className="text-xs">تصنيف افتراضي</Label>
              <Select
                value={form.categorySlug || "none"}
                onValueChange={(value) =>
                  setForm({ ...form, categorySlug: value === "none" ? "" : value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="بلا" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">يحدده الذكاء</SelectItem>
                  {activeCategories.map((category) => (
                    <SelectItem key={category.slug} value={category.slug}>
                      {category.nameAr}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">الفترة (دقائق)</Label>
              <Input
                type="number"
                min={1}
                value={form.fetchIntervalMinutes}
                onChange={(e) =>
                  setForm({ ...form, fetchIntervalMinutes: Number(e.target.value) || 15 })
                }
              />
            </div>
          </div>
          <Button
            size="sm"
            className="w-full"
            disabled={!allowFetching || !form.name.trim() || !form.url.trim() || createMutation.isPending}
            onClick={() => createMutation.mutate(form)}
            title={!allowFetching ? "الرادار متوقف: ستتمكن من إضافة المصدر بعد إعادة التشغيل" : undefined}
          >
            {createMutation.isPending ? "جارٍ الإضافة..." : "إضافة المصدر"}
          </Button>
        </div>

        {/* قائمة المصادر */}
        <div className="mt-4 space-y-2">
          {sources.map((source) => (
            <div key={source.id} className="rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      !source.isActive ? "bg-gray-300" : source.lastError ? "bg-red-500" : "bg-green-500"
                    }`}
                  />
                  <span className="font-medium">{source.name}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {source.type === "json" ? "JSON" : "RSS"}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {source.language}
                  </Badge>
                </div>
                <Switch
                  checked={source.isActive}
                  onCheckedChange={(checked) =>
                    toggleMutation.mutate({ id: source.id, isActive: checked })
                  }
                />
              </div>
              <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  كل {source.fetchIntervalMinutes} د
                  {source.lastFetchedAt ? ` · آخر جلب ${timeAgo(source.lastFetchedAt)}` : " · لم يُجلب بعد"}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-red-500"
                  onClick={() => setDeleteId(source.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              {source.lastError && (
                <p className="mt-1 text-xs text-red-500 line-clamp-2" dir="ltr">
                  {source.lastError}
                </p>
              )}
            </div>
          ))}
          {sources.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              لا مصادر بعد — أضف أول مصدر أعلاه
            </p>
          )}
        </div>

        <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader className="text-right">
              <AlertDialogTitle>حذف المصدر؟</AlertDialogTitle>
              <AlertDialogDescription>
                سيُحذف المصدر وكل مواده المرصودة غير المُصدَّرة. لا تراجع عن هذا الإجراء.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>إلغاء</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700"
                onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              >
                حذف
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}

// ---------- رصدات إكس ----------

const EMPTY_WATCH_FORM = {
  value: "",
  label: "",
  type: "auto" as "auto" | "keyword" | "hashtag" | "account" | "query" | "trend",
  provider: "auto" as "auto" | "official" | "twitterapiio",
  language: "en",
  categorySlug: "",
  fetchIntervalMinutes: 1,
};

function WatchesSheet({
  watches,
  categories,
  allowFetching,
}: {
  watches: RadarSourceRow[];
  categories: CategoryRow[];
  allowFetching: boolean;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState(EMPTY_WATCH_FORM);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const activeCategories = useMemo(
    () => categories.filter((c) => !c.status || c.status === "active"),
    [categories]
  );

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/radar/sources"] });
    queryClient.invalidateQueries({ queryKey: ["/api/radar/watches"] });
    queryClient.invalidateQueries({ queryKey: ["/api/radar/stats"] });
    queryClient.invalidateQueries({ queryKey: ["/api/radar/health"] });
  };

  const createMutation = useMutation({
    mutationFn: (body: typeof EMPTY_WATCH_FORM) =>
      apiRequest<{ watch: RadarSourceRow; inserted: number | null; fetchError: string | null }>(
        "/api/radar/watches",
        {
          method: "POST",
          body: JSON.stringify({
            value: body.value.trim(),
            label: body.label.trim() || undefined,
            type: body.type === "auto" ? undefined : body.type,
            provider: body.provider,
            language: body.language || "en",
            categorySlug: body.categorySlug || undefined,
            fetchIntervalMinutes: body.fetchIntervalMinutes,
          }),
        }
      ),
    onSuccess: () => {
      invalidate();
      setForm(EMPTY_WATCH_FORM);
      toast({ title: "✅ أُضيفت الرصدة (الجلب متوقف إجبارياً)" });
    },
    onError: (error: Error) =>
      toast({ title: "❌ فشلت إضافة الرصدة", description: error.message, variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiRequest(`/api/radar/sources/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive }),
      }),
    onSuccess: invalidate,
    onError: (error: Error) =>
      toast({ title: "❌ فشل التعديل", description: error.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/radar/sources/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidate();
      setDeleteId(null);
      toast({ title: "تم حذف الرصدة" });
    },
    onError: (error: Error) =>
      toast({ title: "❌ فشل الحذف", description: error.message, variant: "destructive" }),
  });

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <Zap className="ml-1 h-4 w-4" />
          رصدات X ({watches.length})
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-full overflow-y-auto sm:max-w-lg" dir="rtl">
        <SheetHeader className="text-right">
          <SheetTitle>رصدات إكس</SheetTitle>
          <SheetDescription>
            حساب أو كلمة أو هاشتاق أو ترند — الرصدات تُجلب ضمن دورة الرادار وفق فترتها
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-3 rounded-lg border p-4">
          <h4 className="flex items-center gap-1 text-sm font-bold">
            <Plus className="h-4 w-4" /> إضافة رصدة
          </h4>
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <Label className="text-xs">القيمة</Label>
              <Input
                dir="ltr"
                value={form.value}
                onChange={(e) => setForm({ ...form, value: e.target.value })}
                placeholder="@AP أو #الهلال أو رؤية 2030"
              />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">الاسم (اختياري)</Label>
              <Input
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="AP Breaking"
              />
            </div>
            <div>
              <Label className="text-xs">النوع</Label>
              <Select
                value={form.type}
                onValueChange={(value) =>
                  setForm({ ...form, type: value as typeof form.type })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">تخمين تلقائي</SelectItem>
                  <SelectItem value="account">حساب</SelectItem>
                  <SelectItem value="keyword">كلمة</SelectItem>
                  <SelectItem value="hashtag">هاشتاق</SelectItem>
                  <SelectItem value="query">استعلام</SelectItem>
                  <SelectItem value="trend">ترند</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">المزوّد</Label>
              <Select
                value={form.provider}
                onValueChange={(value) =>
                  setForm({ ...form, provider: value as typeof form.provider })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">تلقائي</SelectItem>
                  <SelectItem value="official">رسمي</SelectItem>
                  <SelectItem value="twitterapiio">twitterapi.io</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">لغة</Label>
              <Input
                dir="ltr"
                value={form.language}
                onChange={(e) => setForm({ ...form, language: e.target.value })}
                placeholder="en"
              />
            </div>
            <div>
              <Label className="text-xs">الفترة (دقائق)</Label>
              <Input
                type="number"
                min={1}
                value={form.fetchIntervalMinutes}
                onChange={(e) =>
                  setForm({ ...form, fetchIntervalMinutes: Number(e.target.value) || 1 })
                }
              />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">تصنيف افتراضي</Label>
              <Select
                value={form.categorySlug || "none"}
                onValueChange={(value) =>
                  setForm({ ...form, categorySlug: value === "none" ? "" : value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="بلا" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">يحدده الذكاء</SelectItem>
                  {activeCategories.map((category) => (
                    <SelectItem key={category.slug} value={category.slug}>
                      {category.nameAr}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            size="sm"
            className="w-full"
            disabled={!allowFetching || !form.value.trim() || createMutation.isPending}
            onClick={() => createMutation.mutate(form)}
            title={!allowFetching ? "الرادار متوقف: ستتمكن من إضافة الرصدة بعد إعادة التشغيل" : undefined}
          >
            {createMutation.isPending ? "جارٍ الإضافة..." : "إضافة الرصدة"}
          </Button>
        </div>

        <div className="mt-4 space-y-2">
          {watches.map((watch) => (
            <div key={watch.id} className="rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      !watch.isActive ? "bg-gray-300" : watch.lastError ? "bg-red-500" : "bg-green-500"
                    }`}
                  />
                  <span className="font-medium">{watch.name}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {watch.xType ?? "x"}
                  </Badge>
                  {watch.tier && (
                    <Badge variant="secondary" className="text-[10px]">
                      Tier {watch.tier}
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-[10px]" dir="ltr">
                    {watch.xValue}
                  </Badge>
                </div>
                <Switch
                  checked={watch.isActive}
                  onCheckedChange={(checked) =>
                    toggleMutation.mutate({ id: watch.id, isActive: checked })
                  }
                />
              </div>
              <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  كل {watch.fetchIntervalMinutes} د
                  {watch.lastFetchedAt ? ` · آخر جلب ${timeAgo(watch.lastFetchedAt)}` : " · لم يُجلب بعد"}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-red-500"
                    onClick={() => setDeleteId(watch.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              {watch.lastError && (
                <p className="mt-1 text-xs text-red-500 line-clamp-2" dir="ltr">
                  {watch.lastError}
                </p>
              )}
            </div>
          ))}
          {watches.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              لا رصدات بعد — أضف @AP أعلاه أو: npx tsx scripts/seed-radar-pack.ts x-news-accounts
            </p>
          )}
        </div>

        <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader className="text-right">
              <AlertDialogTitle>حذف الرصدة؟</AlertDialogTitle>
              <AlertDialogDescription>
                سيُحذف الرصدة وكل موادها غير المُصدَّرة.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>إلغاء</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700"
                onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              >
                حذف
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}

// ---------- قواعد التنبيه ----------

const EMPTY_RULE_FORM = {
  label: "",
  keywords: "",
  minNewsValue: 0,
  markBreaking: true,
  notifyTelegram: true,
};

function RulesDialog({
  rules,
  telegramConfigured,
}: {
  rules: RadarRuleRow[];
  telegramConfigured: boolean;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState(EMPTY_RULE_FORM);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/radar/alert-rules"] });

  const createMutation = useMutation({
    mutationFn: (body: typeof EMPTY_RULE_FORM) =>
      apiRequest("/api/radar/alert-rules", {
        method: "POST",
        body: JSON.stringify({
          label: body.label,
          keywords: body.keywords
            .split(/[،,]/)
            .map((s) => s.trim())
            .filter(Boolean),
          minNewsValue: body.minNewsValue,
          markBreaking: body.markBreaking,
          notifyTelegram: body.notifyTelegram,
        }),
      }),
    onSuccess: () => {
      invalidate();
      setForm(EMPTY_RULE_FORM);
      toast({ title: "✅ أُضيفت قاعدة التنبيه" });
    },
    onError: (error: Error) =>
      toast({ title: "❌ فشلت إضافة القاعدة", description: error.message, variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiRequest(`/api/radar/alert-rules/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive }),
      }),
    onSuccess: invalidate,
    onError: (error: Error) =>
      toast({ title: "❌ فشل التعديل", description: error.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/radar/alert-rules/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      invalidate();
      toast({ title: "تم حذف القاعدة" });
    },
    onError: (error: Error) =>
      toast({ title: "❌ فشل الحذف", description: error.message, variant: "destructive" }),
  });

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <BellRing className="ml-1 h-4 w-4" />
          قواعد التنبيه ({rules.length})
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg" dir="rtl">
        <DialogHeader className="text-right">
          <DialogTitle>قواعد التنبيه الذكي</DialogTitle>
          <DialogDescription>
            عند مطابقة كلمة من القاعدة على مادة مرصودة: تُعلَّم عاجلًا وتُرسل تنبيهًا فوريًا.
            {telegramConfigured
              ? " تيليجرام: مفعّل ✅"
              : " تيليجرام: غير مهيأ — اضبط TELEGRAM_BOT_TOKEN وTELEGRAM_RADAR_CHAT_ID على الخادم"}
          </DialogDescription>
        </DialogHeader>

        {/* إضافة قاعدة */}
        <div className="space-y-3 rounded-lg border p-4">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">اسم القاعدة</Label>
              <Input
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="المونديال 2026"
              />
            </div>
            <div>
              <Label className="text-xs">حد القيمة الأدنى (0–100)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={form.minNewsValue}
                onChange={(e) => setForm({ ...form, minNewsValue: Number(e.target.value) || 0 })}
              />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">الكلمات المفتاحية (افصل بفاصلة — بأي لغة)</Label>
              <Input
                value={form.keywords}
                onChange={(e) => setForm({ ...form, keywords: e.target.value })}
                placeholder="World Cup 2026, Saudi team, المنتخب السعودي"
              />
            </div>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <Switch
                checked={form.markBreaking}
                onCheckedChange={(checked) => setForm({ ...form, markBreaking: checked })}
              />
              تعليم كعاجل
            </span>
            <span className="flex items-center gap-2">
              <Switch
                checked={form.notifyTelegram}
                onCheckedChange={(checked) => setForm({ ...form, notifyTelegram: checked })}
              />
              تنبيه تيليجرام
            </span>
          </div>
          <Button
            size="sm"
            className="w-full"
            disabled={!form.label.trim() || !form.keywords.trim() || createMutation.isPending}
            onClick={() => createMutation.mutate(form)}
          >
            {createMutation.isPending ? "جارٍ الإضافة..." : "إضافة القاعدة"}
          </Button>
        </div>

        {/* قائمة القواعد */}
        <div className="space-y-2">
          {rules.map((rule) => (
            <div key={rule.id} className="rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{rule.label}</span>
                <div className="flex items-center gap-1">
                  <Switch
                    checked={rule.isActive}
                    onCheckedChange={(checked) =>
                      toggleMutation.mutate({ id: rule.id, isActive: checked })
                    }
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-red-500"
                    onClick={() => deleteMutation.mutate(rule.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {(rule.keywords ?? []).map((keyword) => (
                  <Badge key={keyword} variant="secondary" className="text-[10px]">
                    {keyword}
                  </Badge>
                ))}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {rule.minNewsValue > 0 ? `حد أدنى ${rule.minNewsValue} · ` : ""}
                {rule.markBreaking ? "يعلَّم عاجلًا" : "بلا تعليم"} ·{" "}
                {rule.notifyTelegram ? "تيليجرام" : "لوحة فقط"}
              </p>
            </div>
          ))}
          {rules.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              لا قواعد بعد — مثال: «World Cup 2026, Saudi» لتنبيه فوري عند أي رصد
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
