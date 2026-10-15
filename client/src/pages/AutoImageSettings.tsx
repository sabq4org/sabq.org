import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { DashboardPageShell } from "@/components/dashboard/DashboardPageShell";
import { toast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import {
  Settings,
  Save,
  Loader2,
  Image as ImageIcon,
  Wand2,
  Check,
  X,
  Plus,
  Zap,
  Palette,
  FileType,
  FolderX,
  Sparkles,
  RefreshCw,
  RotateCcw,
  LayoutGrid,
  Newspaper,
  PenTool,
  BarChart3,
} from "lucide-react";
import type { Category } from "@shared/schema";
import { ImageStylesManager } from "@/components/admin/ImageStylesManager";
import { LEGACY_STYLE_SLUG_MAP, type ImageStyleSettings } from "@shared/imageStyles";

interface AutoImageSettings {
  enabled: boolean;
  articleTypes: string[];
  skipCategories: string[];
  defaultStyle: string;
  newsStyle: string;
  articleStyle: string;
  provider: string;
  autoPublish: boolean;
  generateOnSave: boolean;
  imagePromptTemplate?: string;
  maxMonthlyGenerations?: number;
  currentMonthGenerations?: number;
}

type AutoImageSectionFilter = "all" | "styles" | "general" | "targeting" | "limits";

const SectionHeader = ({
  title,
  subtitle,
  icon: Icon,
  badge,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ElementType;
  badge?: React.ReactNode;
}) => (
  <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-border/60 pb-3.5">
    <div className="flex items-center gap-3 min-w-0">
      <div className="h-7 w-1.5 rounded-full bg-primary shrink-0" />
      {Icon && (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
      )}
      <div className="min-w-0">
        <h3 className="text-base sm:text-lg font-bold text-foreground leading-tight">{title}</h3>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-0.5 leading-normal">{subtitle}</p>
        )}
      </div>
    </div>
    {badge && <div className="flex items-center shrink-0">{badge}</div>}
  </div>
);

export default function AutoImageSettingsPage() {
  const [settings, setSettings] = useState<AutoImageSettings>({
    enabled: false,
    articleTypes: ["news", "analysis"],
    skipCategories: ["opinion", "columns"],
    defaultStyle: "photorealistic",
    newsStyle: "photorealistic",
    articleStyle: "photorealistic",
    provider: "nano-banana",
    autoPublish: false,
    generateOnSave: false,
    imagePromptTemplate: "",
    maxMonthlyGenerations: 100,
    currentMonthGenerations: 0,
  });

  const [newCategory, setNewCategory] = useState("");
  const [activeSection, setActiveSection] = useState<AutoImageSectionFilter>("all");

  // Fetch categories
  const { data: categoriesRaw } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
    enabled: true,
  });
  const categories = Array.isArray(categoriesRaw) ? categoriesRaw : [];

  // Fetch settings
  const {
    data,
    isLoading,
    isFetching: isFetchingSettings,
    refetch: refetchSettings,
  } = useQuery<AutoImageSettings>({
    queryKey: ["/api/auto-image/settings"],
  });

  // سجلّ أنماط توليد الصور — مصدر خيارات «نمط الأخبار/المقالات» (يُدار في القسم أعلاه)
  const {
    data: imageStylesRaw,
    isFetching: isFetchingStyles,
    refetch: refetchStyles,
  } = useQuery<ImageStyleSettings>({
    queryKey: ["/api/admin/image-styles"],
  });
  const registryStyles = Array.isArray(imageStylesRaw?.styles) ? imageStylesRaw.styles : [];

  const normalizeDataToState = (source: AutoImageSettings): AutoImageSettings => {
    const mapStyle = (value?: string) =>
      (value && (LEGACY_STYLE_SLUG_MAP[value] ?? value)) || "realistic";
    const newsStyle = mapStyle(source.newsStyle || source.defaultStyle);
    const articleStyle = mapStyle(source.articleStyle || source.defaultStyle);
    return {
      ...source,
      articleTypes: Array.isArray(source.articleTypes) ? source.articleTypes : ["news", "analysis"],
      skipCategories: Array.isArray(source.skipCategories)
        ? source.skipCategories
        : ["opinion", "columns"],
      newsStyle,
      articleStyle,
      defaultStyle: newsStyle,
    };
  };

  // Update local settings when data is fetched (backfill newsStyle/articleStyle from legacy defaultStyle)
  useEffect(() => {
    if (data) {
      setSettings(normalizeDataToState(data));
    }
  }, [data]);

  // Update settings mutation
  const updateSettingsMutation = useMutation({
    mutationFn: async (updatedSettings: AutoImageSettings) => {
      const payload = {
        ...updatedSettings,
        defaultStyle: updatedSettings.newsStyle || updatedSettings.defaultStyle,
      };
      return await apiRequest<{ success: boolean }>("/api/auto-image/settings", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      toast({
        title: "تم حفظ الإعدادات",
        description: "تم تحديث إعدادات التوليد التلقائي بنجاح",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/auto-image/settings"] });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ في حفظ الإعدادات",
        description: error.message || "حدث خطأ أثناء حفظ الإعدادات",
        variant: "destructive",
      });
    },
  });

  const handleSaveSettings = () => {
    updateSettingsMutation.mutate(settings);
  };

  const handleRefreshAll = () => {
    refetchSettings();
    refetchStyles();
  };

  const handleResetSettings = () => {
    if (data) {
      setSettings(normalizeDataToState(data));
      toast({
        title: "تمت استعادة الإعدادات",
        description: "تم التراجع عن التغييرات غير المحفوظة",
      });
    }
  };

  const safeArticleTypes = Array.isArray(settings.articleTypes) ? settings.articleTypes : [];
  const safeSkipCategories = Array.isArray(settings.skipCategories) ? settings.skipCategories : [];

  const addSkipCategory = () => {
    if (newCategory && !safeSkipCategories.includes(newCategory)) {
      setSettings({
        ...settings,
        skipCategories: [...safeSkipCategories, newCategory],
      });
      setNewCategory("");
    }
  };

  const removeSkipCategory = (category: string) => {
    setSettings({
      ...settings,
      skipCategories: safeSkipCategories.filter((c) => c !== category),
    });
  };

  const toggleArticleType = (type: string) => {
    if (safeArticleTypes.includes(type)) {
      setSettings({
        ...settings,
        articleTypes: safeArticleTypes.filter((t) => t !== type),
      });
    } else {
      setSettings({
        ...settings,
        articleTypes: [...safeArticleTypes, type],
      });
    }
  };

  const articleTypeOptions = [
    { value: "news", label: "أخبار", desc: "الأخبار اليومية والتقارير الميدانية" },
    { value: "analysis", label: "تحليلات", desc: "القراءات المعمقة والتحليلات" },
    { value: "column", label: "أعمدة", desc: "الأعمدة الصحفية الدورية" },
    { value: "opinion", label: "آراء", desc: "مقالات كتّاب الرأي" },
  ];

  // خيارات الأنماط من السجلّ المركزي (قسم «أنماط توليد الصور» أعلاه)
  const styleOptions = useMemo(
    () =>
      registryStyles.length
        ? registryStyles.map((style) => ({
            value: style.slug,
            label: style.enabled ? style.nameAr : `${style.nameAr} (معطّل)`,
            rawLabel: style.nameAr,
          }))
        : [
            { value: "realistic", label: "واقعية", rawLabel: "واقعية" },
            { value: "graphic", label: "رسومية", rawLabel: "رسومية" },
            { value: "illustration", label: "توضيحية", rawLabel: "توضيحية" },
          ],
    [registryStyles],
  );

  const providerOptions = [
    { value: "nano-banana", label: "Nano Banana Pro" },
    { value: "gemini", label: "Google Gemini" },
    { value: "dall-e", label: "DALL-E 3" },
  ];

  const getStyleDisplayName = (slug: string) => {
    const found = styleOptions.find((opt) => opt.value === slug);
    return found ? found.rawLabel : slug || "واقعية";
  };

  const currentProviderLabel =
    providerOptions.find((p) => p.value === settings.provider)?.label || settings.provider;

  const maxMonthly = settings.maxMonthlyGenerations || 100;
  const currentMonthly = settings.currentMonthGenerations || 0;
  const usagePercentage = maxMonthly
    ? Math.min(100, Math.round((currentMonthly / maxMonthly) * 100))
    : 0;
  const remainingGenerations = Math.max(0, maxMonthly - currentMonthly);

  const isFetchingAny = isFetchingSettings || isFetchingStyles;

  const sectionFilterPills: {
    id: AutoImageSectionFilter;
    label: string;
    icon: React.ElementType;
  }[] = [
    { id: "all", label: "كل الأقسام", icon: LayoutGrid },
    { id: "styles", label: "سجل أنماط الصور", icon: Palette },
    { id: "general", label: "الإعدادات الرئيسية", icon: Settings },
    { id: "targeting", label: "أنواع المحتوى والاستثناءات", icon: FileType },
    { id: "limits", label: "الحصة والإعدادات المتقدمة", icon: Zap },
  ];

  const showStylesSection = activeSection === "all" || activeSection === "styles";
  const showGeneralSection = activeSection === "all" || activeSection === "general";
  const showTargetingSection = activeSection === "all" || activeSection === "targeting";
  const showLimitsSection = activeSection === "all" || activeSection === "limits";

  if (isLoading) {
    return (
      <DashboardLayout>
        <DashboardPageShell
          maxWidthClassName="max-w-[1600px]"
          contentClassName="px-4 pb-10 pt-2 sm:px-6"
        >
          <Skeleton className="h-24 w-full rounded-2xl" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-28 w-full rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-72 w-full rounded-2xl" />
          <Skeleton className="h-72 w-full rounded-2xl" />
        </DashboardPageShell>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <DashboardPageShell
        maxWidthClassName="max-w-[1600px]"
        contentClassName="px-4 pb-10 pt-2 sm:px-6"
      >
        <div className="space-y-6" data-testid="auto-image-settings-page">
          {/* Unified Page Header */}
          <DashboardPageHeader
            icon={Wand2}
            title="إعدادات التوليد التلقائي للصور"
            titleTestId="text-page-title"
            description={
              <span className="inline-flex flex-wrap items-center gap-2">
                <span>
                  تحكم في إعدادات توليد الصور بالذكاء الاصطناعي للمقالات وسجل الأنماط البصرية
                </span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                    settings.enabled
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : "border-border bg-muted text-muted-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      settings.enabled ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground",
                    )}
                  />
                  {settings.enabled ? "التوليد التلقائي مفعّل" : "التوليد التلقائي معطّل"}
                </span>
              </span>
            }
            actions={
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleRefreshAll}
                  disabled={isFetchingAny}
                  className="gap-1.5 h-9"
                  data-testid="button-refresh-settings"
                >
                  <RefreshCw className={cn("h-4 w-4", isFetchingAny && "animate-spin")} />
                  <span>تحديث</span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleResetSettings}
                  disabled={updateSettingsMutation.isPending}
                  className="gap-1.5 h-9 text-muted-foreground hover:text-foreground"
                  data-testid="button-reset-settings"
                >
                  <RotateCcw className="h-4 w-4" />
                  <span>استعادة</span>
                </Button>
                <Button
                  type="button"
                  onClick={handleSaveSettings}
                  disabled={updateSettingsMutation.isPending}
                  className="flex-1 sm:flex-initial gap-2 h-9"
                  data-testid="button-save-settings"
                >
                  {updateSettingsMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      جاري الحفظ...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      حفظ الإعدادات
                    </>
                  )}
                </Button>
              </div>
            }
          />

          {/* 4-Card KPI Summary Strip */}
          <div
            className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"
            data-testid="auto-image-kpi-strip"
          >
            {/* KPI 1: Auto-generation Status */}
            <div
              className={cn(
                "rounded-2xl border p-4 shadow-xs bg-gradient-to-br via-card to-card",
                settings.enabled
                  ? "border-emerald-500/25 from-emerald-500/[0.06]"
                  : "border-border/80 from-slate-50/90 dark:from-slate-900/70",
              )}
              data-testid="kpi-auto-image-status"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs sm:text-sm font-semibold text-muted-foreground">
                  حالة التوليد التلقائي
                </p>
                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border",
                    settings.enabled
                      ? "border-emerald-500/25 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                      : "border-border bg-muted text-muted-foreground",
                  )}
                >
                  <Settings className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span
                  className={cn(
                    "h-2.5 w-2.5 rounded-full shrink-0",
                    settings.enabled ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/50",
                  )}
                />
                <p
                  className={cn(
                    "text-xl sm:text-2xl font-black tracking-tight",
                    settings.enabled
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-muted-foreground",
                  )}
                >
                  {settings.enabled ? "مفعّل" : "معطّل"}
                </p>
              </div>
              <div className="mt-2.5 flex items-center justify-between gap-1 border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
                <span className="truncate">{currentProviderLabel}</span>
                <span className="font-semibold text-foreground shrink-0">
                  {settings.autoPublish ? "نشر فوري" : "مراجعة يدوية"}
                </span>
              </div>
            </div>

            {/* KPI 2: News Image Style */}
            <div
              className="rounded-2xl border border-sky-500/25 bg-gradient-to-br from-sky-500/[0.06] via-card to-card p-4 shadow-xs"
              data-testid="kpi-news-style"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs sm:text-sm font-semibold text-muted-foreground">
                  نمط صور الأخبار
                </p>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-sky-500/25 bg-sky-500/15 text-sky-600 dark:text-sky-400">
                  <Newspaper className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-2 text-lg sm:text-2xl font-black tracking-tight text-sky-600 dark:text-sky-400 truncate">
                {getStyleDisplayName(settings.newsStyle)}
              </p>
              <div className="mt-2.5 flex items-center justify-between gap-1 border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
                <span>للأخبار والتحليلات</span>
                <code
                  className="font-mono text-[10px] text-sky-600 dark:text-sky-400"
                  dir="ltr"
                >
                  {settings.newsStyle}
                </code>
              </div>
            </div>

            {/* KPI 3: Articles / Opinion Image Style */}
            <div
              className="rounded-2xl border border-purple-500/25 bg-gradient-to-br from-purple-500/[0.06] via-card to-card p-4 shadow-xs"
              data-testid="kpi-article-style"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs sm:text-sm font-semibold text-muted-foreground">
                  نمط صور المقالات
                </p>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-purple-500/25 bg-purple-500/15 text-purple-600 dark:text-purple-400">
                  <PenTool className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-2 text-lg sm:text-2xl font-black tracking-tight text-purple-600 dark:text-purple-400 truncate">
                {getStyleDisplayName(settings.articleStyle)}
              </p>
              <div className="mt-2.5 flex items-center justify-between gap-1 border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
                <span>للرأي والأعمدة</span>
                <code
                  className="font-mono text-[10px] text-purple-600 dark:text-purple-400"
                  dir="ltr"
                >
                  {settings.articleStyle}
                </code>
              </div>
            </div>

            {/* KPI 4: Monthly Usage & Quota */}
            <div
              className="rounded-2xl border border-amber-500/25 bg-gradient-to-br from-amber-500/[0.06] via-card to-card p-4 shadow-xs"
              data-testid="kpi-monthly-usage"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs sm:text-sm font-semibold text-muted-foreground">
                  الاستهلاك الشهري
                </p>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-500/25 bg-amber-500/15 text-amber-600 dark:text-amber-400">
                  <BarChart3 className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-2 flex items-baseline justify-between gap-1.5">
                <p
                  className="text-xl sm:text-2xl font-black tracking-tight tabular-nums text-foreground"
                  dir="ltr"
                >
                  {currentMonthly} / {maxMonthly}
                </p>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[11px] font-bold tabular-nums",
                    usagePercentage > 80
                      ? "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400"
                      : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
                  )}
                >
                  {usagePercentage}%
                </Badge>
              </div>
              <div className="mt-2.5 flex items-center justify-between gap-1 border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
                <span>المتبقي هذا الشهر</span>
                <span className="font-semibold text-foreground tabular-nums">
                  {remainingGenerations} صورة
                </span>
              </div>
            </div>
          </div>

          {/* Quick Section Filter Bar */}
          <div
            className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border/80 bg-card p-2.5 sm:p-3 shadow-2xs"
            role="tablist"
            aria-label="تصفية أقسام إعدادات الصور"
            data-testid="auto-image-filter-bar"
          >
            <div className="flex flex-wrap items-center gap-1.5">
              {sectionFilterPills.map((pill) => {
                const Icon = pill.icon;
                const isActive = activeSection === pill.id;
                return (
                  <button
                    key={pill.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setActiveSection(pill.id)}
                    data-testid={`filter-section-${pill.id}`}
                    className={cn(
                      "no-min-touch-size inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all",
                      isActive
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span>{pill.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground px-2">
              <ImageIcon className="h-3.5 w-3.5" />
              <span>{registryStyles.filter((s) => s.enabled).length} أنماط مفعّلة في السجل</span>
            </div>
          </div>

          {/* أنماط توليد الصور — السجلّ المركزي (يدوي + تلقائي) */}
          {showStylesSection && <ImageStylesManager />}

          {/* Main Settings */}
          {showGeneralSection && (
            <Card className="rounded-2xl border-border/80 bg-card shadow-xs">
              <CardContent className="p-5 sm:p-6">
                <SectionHeader
                  title="الإعدادات الرئيسية والأنماط التلقائية"
                  subtitle="التحكم في تفعيل التوليد التلقائي، مزود الخدمة، وربط كل نوع محتوى بنمط بصري من السجل المركزي"
                  icon={Settings}
                />

                <div className="space-y-6">
                  {/* Enable/Disable Toggle */}
                  <div className="flex items-center justify-between gap-4 rounded-2xl border border-border/70 bg-muted/30 p-4">
                    <div className="space-y-1">
                      <Label htmlFor="enabled" className="text-base font-bold cursor-pointer">
                        تفعيل التوليد التلقائي
                      </Label>
                      <p className="text-xs sm:text-sm text-muted-foreground">
                        توليد صور تلقائياً للمقالات التي لا تحتوي على صور عند الإنشاء أو الحفظ
                      </p>
                    </div>
                    <Switch
                      id="enabled"
                      checked={settings.enabled}
                      onCheckedChange={(checked) => setSettings({ ...settings, enabled: checked })}
                      data-testid="switch-enabled"
                    />
                  </div>

                  <Separator />

                  {/* Provider & Style by content kind */}
                  <div className="grid gap-4 lg:grid-cols-3">
                    {/* Provider Selection */}
                    <div className="space-y-2 rounded-2xl border border-border/60 bg-background/60 p-4">
                      <Label className="flex items-center gap-2 text-sm font-bold">
                        <Zap className="h-4 w-4 text-amber-500" />
                        مزود خدمة التوليد
                      </Label>
                      <Select
                        value={settings.provider}
                        onValueChange={(value) => setSettings({ ...settings, provider: value })}
                      >
                        <SelectTrigger data-testid="select-provider" className="rounded-xl">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {providerOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        اختر مزود الخدمة المفضل لتوليد الصور في المسار التلقائي
                      </p>
                    </div>

                    {/* News Style */}
                    <div className="space-y-2 rounded-2xl border border-sky-500/20 bg-sky-500/[0.03] p-4">
                      <Label className="flex items-center gap-2 text-sm font-bold">
                        <Palette className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                        نمط صور الأخبار
                      </Label>
                      <Select
                        value={settings.newsStyle}
                        onValueChange={(value) =>
                          setSettings({ ...settings, newsStyle: value, defaultStyle: value })
                        }
                      >
                        <SelectTrigger data-testid="select-news-style" className="rounded-xl">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {styleOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        يُطبّق تلقائياً على الأخبار والتحليلات (`news`, `analysis`)
                      </p>
                    </div>

                    {/* Article Style */}
                    <div className="space-y-2 rounded-2xl border border-purple-500/20 bg-purple-500/[0.03] p-4">
                      <Label className="flex items-center gap-2 text-sm font-bold">
                        <Palette className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                        نمط صور المقالات
                      </Label>
                      <Select
                        value={settings.articleStyle}
                        onValueChange={(value) =>
                          setSettings({ ...settings, articleStyle: value })
                        }
                      >
                        <SelectTrigger data-testid="select-article-style" className="rounded-xl">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {styleOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        يُطبّق تلقائياً على مقالات الرأي والأعمدة (`opinion`, `column`)
                      </p>
                    </div>
                  </div>

                  {/* Auto Generation Behavior Options */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="flex items-center justify-between gap-4 rounded-2xl border border-border/70 bg-muted/25 p-4">
                      <div className="space-y-1">
                        <Label htmlFor="generateOnSave" className="text-sm font-bold cursor-pointer">
                          توليد عند الحفظ
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          توليد صورة تلقائياً عند حفظ المقال بدون صورة بارزة
                        </p>
                      </div>
                      <Switch
                        id="generateOnSave"
                        checked={settings.generateOnSave}
                        onCheckedChange={(checked) =>
                          setSettings({ ...settings, generateOnSave: checked })
                        }
                        data-testid="switch-generate-on-save"
                      />
                    </div>

                    <div className="flex items-center justify-between gap-4 rounded-2xl border border-border/70 bg-muted/25 p-4">
                      <div className="space-y-1">
                        <Label htmlFor="autoPublish" className="text-sm font-bold cursor-pointer">
                          النشر التلقائي للصور
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          اعتماد ونشر الصور المُولّدة تلقائياً دون انتظار مراجعة يدوية
                        </p>
                      </div>
                      <Switch
                        id="autoPublish"
                        checked={settings.autoPublish}
                        onCheckedChange={(checked) =>
                          setSettings({ ...settings, autoPublish: checked })
                        }
                        data-testid="switch-auto-publish"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Targeting: Article Types + Skip Categories */}
          {showTargetingSection && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Article Types Settings */}
              <Card className="rounded-2xl border-border/80 bg-card shadow-xs">
                <CardContent className="p-5 sm:p-6">
                  <SectionHeader
                    title="أنواع المقالات المشمولة"
                    subtitle="اختر أنواع المقالات التي سيتم توليد صور لها تلقائياً"
                    icon={FileType}
                    badge={
                      <Badge variant="outline" className="text-xs tabular-nums">
                        {safeArticleTypes.length} / {articleTypeOptions.length} مفعّل
                      </Badge>
                    }
                  />

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {articleTypeOptions.map((type) => {
                      const isSelected = safeArticleTypes.includes(type.value);
                      return (
                        <div
                          key={type.value}
                          className={cn(
                            "p-4 rounded-2xl border cursor-pointer transition-all",
                            isSelected
                              ? "border-primary bg-primary/[0.06] shadow-2xs"
                              : "border-border/70 bg-muted/20 hover:border-primary/40",
                          )}
                          onClick={() => toggleArticleType(type.value)}
                          data-testid={`toggle-type-${type.value}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <FileType
                                  className={cn(
                                    "h-4 w-4",
                                    isSelected ? "text-primary" : "text-muted-foreground",
                                  )}
                                />
                                <span className="font-bold text-sm text-foreground">
                                  {type.label}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground">{type.desc}</p>
                            </div>
                            <span
                              className={cn(
                                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
                                isSelected
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border bg-background text-muted-foreground",
                              )}
                            >
                              {isSelected ? (
                                <Check className="h-3.5 w-3.5" />
                              ) : (
                                <X className="h-3.5 w-3.5" />
                              )}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Skip Categories Settings */}
              <Card className="rounded-2xl border-border/80 bg-card shadow-xs">
                <CardContent className="p-5 sm:p-6">
                  <SectionHeader
                    title="الفئات المستثناة"
                    subtitle="التصنيفات التي لن يتم توليد صور لها تلقائياً"
                    icon={FolderX}
                    badge={
                      <Badge variant="outline" className="text-xs tabular-nums">
                        {safeSkipCategories.length} مستثناة
                      </Badge>
                    }
                  />

                  <div className="space-y-4">
                    <div className="flex gap-2">
                      <Select value={newCategory} onValueChange={setNewCategory}>
                        <SelectTrigger
                          className="flex-1 rounded-xl"
                          data-testid="select-skip-category"
                        >
                          <SelectValue placeholder="اختر فئة لاستثنائها" />
                        </SelectTrigger>
                        <SelectContent>
                          {categories
                            .filter((cat) => !safeSkipCategories.includes(cat.nameAr))
                            .map((cat) => (
                              <SelectItem key={cat.id} value={cat.nameAr}>
                                {cat.nameAr}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        onClick={addSkipCategory}
                        disabled={!newCategory}
                        className="rounded-xl gap-1.5"
                        data-testid="button-add-skip-category"
                      >
                        <Plus className="h-4 w-4" />
                        <span className="hidden sm:inline">إضافة</span>
                      </Button>
                    </div>

                    <div className="min-h-[88px] rounded-2xl border border-border/60 bg-muted/20 p-3.5">
                      <div className="flex flex-wrap gap-2">
                        {safeSkipCategories.map((category) => (
                          <Badge
                            key={category}
                            variant="secondary"
                            className="px-3 py-1.5 rounded-xl flex items-center gap-2 border border-orange-500/25 bg-orange-500/10 text-orange-700 dark:text-orange-300"
                          >
                            <FolderX className="h-3.5 w-3.5" />
                            <span>{category}</span>
                            <button
                              type="button"
                              onClick={() => removeSkipCategory(category)}
                              className="no-min-touch-size hover:text-destructive transition-colors"
                              data-testid={`button-remove-category-${category}`}
                              aria-label={`إزالة ${category}`}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </Badge>
                        ))}
                        {safeSkipCategories.length === 0 && (
                          <p className="text-xs text-muted-foreground py-4 w-full text-center">
                            لا توجد فئات مستثناة حالياً — جميع التصنيفات مسموح لها بالتوليد التلقائي
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Monthly Usage & Advanced Settings */}
          {showLimitsSection && (
            <Card className="rounded-2xl border-border/80 bg-card shadow-xs">
              <CardContent className="p-5 sm:p-6">
                <SectionHeader
                  title="الحصة الشهرية والإعدادات المتقدمة"
                  subtitle="متابعة استهلاك التوليد الشهري وضبط السقف الأعلى للتوليد التلقائي"
                  icon={Zap}
                />

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  {/* Monthly Limit & Progress */}
                  <div className="space-y-4 rounded-2xl border border-border/70 bg-muted/20 p-4">
                    <div className="space-y-2">
                      <Label htmlFor="maxMonthly" className="flex items-center gap-2 font-bold">
                        <Zap className="h-4 w-4 text-amber-500" />
                        الحد الأقصى الشهري
                      </Label>
                      <Input
                        id="maxMonthly"
                        type="number"
                        min="0"
                        max="10000"
                        value={settings.maxMonthlyGenerations || 100}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            maxMonthlyGenerations: parseInt(e.target.value) || 100,
                          })
                        }
                        className="max-w-xs rounded-xl"
                        data-testid="input-max-monthly"
                      />
                      <p className="text-xs text-muted-foreground">
                        الحد الأقصى لعدد الصور المُولّدة تلقائياً خلال الشهر الواحد
                      </p>
                    </div>

                    {maxMonthly > 0 && (
                      <div className="space-y-2 border-t border-border/60 pt-3">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-foreground">استخدام الشهر الحالي</span>
                          <span className="text-muted-foreground tabular-nums">
                            {currentMonthly} / {maxMonthly} صورة ({usagePercentage}%)
                          </span>
                        </div>
                        <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className={cn(
                              "h-full transition-all rounded-full",
                              usagePercentage > 80
                                ? "bg-rose-500"
                                : usagePercentage > 50
                                  ? "bg-amber-500"
                                  : "bg-emerald-500",
                            )}
                            style={{ width: `${usagePercentage}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Deprecated Prompt Template Notice (respecting SYSTEM.md line 51) */}
                  <div className="flex flex-col justify-center rounded-2xl border border-dashed border-border/80 bg-muted/15 p-5 space-y-2">
                    <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                      <Sparkles className="h-4 w-4 text-primary shrink-0" />
                      <span>إدارة أوامر التوليد (Prompts) من سجل الأنماط</span>
                    </div>
                    <p className="text-xs sm:text-sm leading-relaxed text-muted-foreground">
                      قالب التوليد المخصص القديم أُلغي — تعليمات الأسلوب والتوجيهات السياقية تُدار الآن
                      مركزياً من قسم «أنماط توليد الصور» أعلى الصفحة وتُطبَّق فعليًا على كل توليد يدوي أو
                      تلقائي عبر الخادم.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </DashboardPageShell>
    </DashboardLayout>
  );
}

