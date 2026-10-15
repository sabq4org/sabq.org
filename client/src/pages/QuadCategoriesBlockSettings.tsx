import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { DashboardPageShell } from "@/components/dashboard/DashboardPageShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  LayoutGrid,
  Loader2,
  Save,
  Eye,
  Trash2,
  Clock,
  Newspaper,
  Smartphone,
  Sparkles,
  CheckCircle2,
  SlidersHorizontal,
  BarChart3,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { categories } from "@shared/schema";
import { cn } from "@/lib/utils";

// Form Schema
const formSchema = z.object({
  config: z.object({
    sections: z
      .array(
        z.object({
          categorySlug: z.string().min(1, "يجب اختيار تصنيف"),
          headlineMode: z.enum(["latest", "mostViewed", "editorsPick"]),
          statType: z.enum(["dailyCount", "weeklyCount", "totalViews", "engagementRate"]),
          teaser: z.string().optional(),
          listSize: z.number().min(3, "الحد الأدنى 3").max(8, "الحد الأقصى 8"),
        }),
      )
      .length(4, "يجب اختيار 4 تصنيفات بالضبط"),
    mobileCarousel: z.boolean(),
    freshHours: z.number().min(1).max(72),
    badges: z.object({
      exclusive: z.boolean(),
      breaking: z.boolean(),
      analysis: z.boolean(),
    }),
    backgroundColor: z.string().optional(),
  }),
});

type FormData = z.infer<typeof formSchema>;

const arabicNumerals = ["١", "٢", "٣", "٤"] as const;

const headlineModeLabels: Record<string, string> = {
  latest: "الأحدث",
  mostViewed: "الأكثر مشاهدة",
  editorsPick: "اختيار المحررين",
};

const statTypeLabels: Record<string, string> = {
  dailyCount: "عدد أخبار اليوم",
  weeklyCount: "عدد أخبار الأسبوع",
  totalViews: "إجمالي المشاهدات",
  engagementRate: "معدل التفاعل",
};

export default function QuadCategoriesBlockSettings() {
  const { toast } = useToast();

  // Fetch categories
  const { data: categoriesData, isLoading: categoriesLoading } = useQuery<
    Array<typeof categories.$inferSelect>
  >({
    queryKey: ["/api/categories"],
  });

  // Fetch current settings
  const { data: settings, isLoading: settingsLoading } = useQuery<{
    config: FormData["config"];
    isActive: boolean;
  }>({
    queryKey: ["/api/admin/blocks/quad-categories/settings"],
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      config: {
        sections: [
          { categorySlug: "", headlineMode: "latest", statType: "dailyCount", teaser: "", listSize: 5 },
          { categorySlug: "", headlineMode: "latest", statType: "dailyCount", teaser: "", listSize: 5 },
          { categorySlug: "", headlineMode: "latest", statType: "dailyCount", teaser: "", listSize: 5 },
          { categorySlug: "", headlineMode: "latest", statType: "dailyCount", teaser: "", listSize: 5 },
        ],
        mobileCarousel: true,
        freshHours: 12,
        badges: {
          exclusive: true,
          breaking: true,
          analysis: true,
        },
        backgroundColor: undefined,
      },
    },
  });

  // Update form when settings load
  useEffect(() => {
    if (settings && !form.formState.isDirty) {
      form.reset(settings);
    }
  }, [settings]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (data: FormData) => {
      return await apiRequest("/api/admin/blocks/quad-categories/settings", {
        method: "PUT",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ["/api/blocks/quad-categories"] });
      queryClient.refetchQueries({ queryKey: ["/api/blocks/quad-categories"] });
      queryClient.removeQueries({ queryKey: ["/api/admin/blocks/quad-categories/settings"] });
      queryClient.refetchQueries({ queryKey: ["/api/admin/blocks/quad-categories/settings"] });
      toast({
        title: "تم الحفظ بنجاح",
        description: "تم حفظ إعدادات بلوك التصنيفات الرباعية",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "فشل الحفظ",
        description: error.message || "حدث خطأ أثناء الحفظ",
      });
    },
  });

  const onSubmit = (data: FormData) => {
    saveMutation.mutate(data);
  };

  if (settingsLoading || categoriesLoading) {
    return (
      <DashboardLayout>
        <DashboardPageShell
          maxWidthClassName="max-w-[1600px]"
          contentClassName="px-4 pb-10 pt-2 sm:px-6"
        >
          <Skeleton className="h-24 w-full rounded-2xl" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-28 w-full rounded-2xl" />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-72 w-full rounded-2xl" />
            ))}
          </div>
        </DashboardPageShell>
      </DashboardLayout>
    );
  }

  const safeCategories = Array.isArray(categoriesData) ? categoriesData : [];
  const activeCategories = safeCategories.filter(
    (c) => c.status === "visible" || c.status === "active",
  );

  const watchedConfig = form.watch("config");
  const watchedSections = Array.isArray(watchedConfig?.sections) ? watchedConfig.sections : [];
  const configuredSectionsCount = watchedSections.filter(
    (s) => Boolean(s?.categorySlug && s.categorySlug.trim().length > 0),
  ).length;
  const freshHours = Number.isFinite(Number(watchedConfig?.freshHours))
    ? Number(watchedConfig?.freshHours)
    : 12;
  const totalListArticles = watchedSections.reduce(
    (sum, s) => sum + (Number.isFinite(Number(s?.listSize)) ? Number(s.listSize) : 0),
    0,
  );
  const mobileCarouselEnabled = Boolean(watchedConfig?.mobileCarousel);
  const activeBadgesCount = [
    watchedConfig?.badges?.breaking,
    watchedConfig?.badges?.exclusive,
    watchedConfig?.badges?.analysis,
  ].filter(Boolean).length;
  const isBlockActive = settings?.isActive ?? configuredSectionsCount === 4;

  return (
    <DashboardLayout>
      <DashboardPageShell
        maxWidthClassName="max-w-[1600px]"
        contentClassName="px-4 pb-10 pt-2 sm:px-6"
      >
        <div className="space-y-6" data-testid="quad-categories-settings-page">
          <DashboardPageHeader
            icon={LayoutGrid}
            title="بلوك التصنيفات الرباعية"
            description={
              <span className="inline-flex flex-wrap items-center gap-2">
                <span data-testid="page-description">
                  إعدادات عرض 4 تصنيفات في بلوك واحد على الصفحة الرئيسية
                </span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold tabular-nums",
                    configuredSectionsCount === 4 && isBlockActive
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
                  )}
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      configuredSectionsCount === 4 && isBlockActive
                        ? "bg-emerald-500"
                        : "bg-amber-500",
                    )}
                  />
                  {configuredSectionsCount === 4
                    ? `مهيأ بالكامل (${configuredSectionsCount}/4)`
                    : `قيد الإعداد (${configuredSectionsCount}/4)`}
                </span>
              </span>
            }
            titleTestId="page-title"
            actions={
              <Button
                type="button"
                onClick={form.handleSubmit(onSubmit)}
                disabled={saveMutation.isPending || !form.formState.isDirty}
                className="no-min-touch-size h-9"
                data-testid="top-save-button"
              >
                {saveMutation.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                <Save className="ml-2 h-4 w-4" />
                حفظ الإعدادات
              </Button>
            }
          />

          {/* 4-Card KPI Summary Strip */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* 1. Configured Sections */}
            <div
              className="rounded-2xl border border-border/80 bg-gradient-to-br from-slate-50/90 via-card to-card p-4 shadow-xs dark:from-slate-900/80 dark:via-slate-950 dark:to-slate-950"
              data-testid="kpi-configured-sections"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs sm:text-sm font-semibold text-muted-foreground">
                  الأقسام المهيأة
                </p>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                  <CheckCircle2 className="h-4 w-4" />
                </span>
              </div>
              <p
                className="mt-2 text-2xl sm:text-3xl font-black tracking-tight tabular-nums text-foreground"
                dir="ltr"
              >
                {configuredSectionsCount} / 4
              </p>
              <div className="mt-2.5 flex items-center justify-between gap-1 border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
                <span>أعمدة التصنيفات</span>
                <span className="font-semibold text-foreground tabular-nums">
                  {activeCategories.length} تصنيف متاح
                </span>
              </div>
            </div>

            {/* 2. Freshness Window */}
            <div
              className="rounded-2xl border border-sky-500/25 bg-gradient-to-br from-sky-500/[0.06] via-card to-card p-4 shadow-xs"
              data-testid="kpi-freshness-window"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs sm:text-sm font-semibold text-muted-foreground">
                  نافذة الحداثة
                </p>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-sky-500/25 bg-sky-500/15 text-sky-600 dark:text-sky-400">
                  <Clock className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-1.5">
                <p
                  className="text-2xl sm:text-3xl font-black tracking-tight tabular-nums text-sky-600 dark:text-sky-400"
                  dir="ltr"
                >
                  {freshHours}
                </p>
                <span className="text-xs font-semibold text-muted-foreground">ساعة</span>
              </div>
              <div className="mt-2.5 flex items-center justify-between gap-1 border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
                <span>وسم الأخبار بشارة «جديد»</span>
                <span className="font-semibold text-sky-600 dark:text-sky-400 tabular-nums">
                  1–72 ساعة
                </span>
              </div>
            </div>

            {/* 3. Total Articles Displayed */}
            <div
              className="rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/[0.06] via-card to-card p-4 shadow-xs"
              data-testid="kpi-total-articles"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs sm:text-sm font-semibold text-muted-foreground">
                  إجمالي الأخبار المعروضة
                </p>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                  <Newspaper className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-1.5">
                <p
                  className="text-2xl sm:text-3xl font-black tracking-tight tabular-nums text-emerald-600 dark:text-emerald-400"
                  dir="ltr"
                >
                  {totalListArticles}
                </p>
                <span className="text-xs text-muted-foreground">خبر بالقوائم</span>
              </div>
              <div className="mt-2.5 flex items-center justify-between gap-1 border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
                <span>بالإضافة لـ 4 أخبار رئيسية</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                  المجموع {totalListArticles + 4}
                </span>
              </div>
            </div>

            {/* 4. Mobile Display Mode & Badges */}
            <div
              className="rounded-2xl border border-purple-500/25 bg-gradient-to-br from-purple-500/[0.06] via-card to-card p-4 shadow-xs"
              data-testid="kpi-mobile-mode"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs sm:text-sm font-semibold text-muted-foreground">
                  وضع عرض الجوال والشارات
                </p>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-purple-500/25 bg-purple-500/15 text-purple-600 dark:text-purple-400">
                  <Smartphone className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-2 text-lg sm:text-xl font-black tracking-tight text-purple-600 dark:text-purple-400">
                {mobileCarouselEnabled ? "كاروسيل متحرك" : "شبكة ثابتة"}
              </p>
              <div className="mt-2.5 flex items-center justify-between gap-1 border-t border-border/50 pt-2 text-[11px] text-muted-foreground">
                <span>الشارات التفاعلية المفعّلة</span>
                <span className="font-semibold text-purple-600 dark:text-purple-400 tabular-nums">
                  {activeBadgesCount} / 3 شارات
                </span>
              </div>
            </div>
          </div>

          {/* Form */}
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Sections Configuration - 2x2 Editorial Grid */}
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
                      التصنيفات الأربعة
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      خصص التصنيف ومصدر العناوين ونوع الإحصائية لكل عمود في الشبكة الرباعية
                    </p>
                  </div>
                  <Badge variant="outline" className="tabular-nums text-xs">
                    شبكة 2×2 تحريرية
                  </Badge>
                </div>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {[0, 1, 2, 3].map((index) => {
                    const sec = watchedSections[index];
                    const selectedCat = activeCategories.find(
                      (c) => c.slug === sec?.categorySlug,
                    );
                    const categoryDisplayName =
                      selectedCat?.nameAr || "لم يُختر تصنيف بعد";
                    const headlineLabel =
                      headlineModeLabels[sec?.headlineMode || "latest"] || "الأحدث";
                    const statLabel =
                      statTypeLabels[sec?.statType || "dailyCount"] || "عدد أخبار اليوم";

                    return (
                      <Card
                        key={index}
                        data-testid={`section-card-${index}`}
                        className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-xs transition-all hover:border-primary/30"
                      >
                        <CardHeader className="border-b border-border/50 bg-muted/20 pb-3.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5">
                              <span className="inline-flex items-center justify-center rounded-lg border border-primary/25 bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
                                القسم {arabicNumerals[index]}
                              </span>
                              <CardTitle className="text-base font-bold">
                                العمود {index + 1}
                              </CardTitle>
                            </div>
                            <Badge
                              variant={selectedCat ? "secondary" : "outline"}
                              className="text-xs"
                            >
                              {categoryDisplayName}
                            </Badge>
                          </div>

                          {/* Live Mini-Preview */}
                          <div className="mt-3 rounded-xl border border-border/60 bg-background/80 p-3">
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <div className="flex items-center gap-1.5 font-semibold text-foreground">
                                <Eye className="h-3.5 w-3.5 text-primary" />
                                <span>معاينة البطاقة:</span>
                                <span className="text-primary">{categoryDisplayName}</span>
                              </div>
                              <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground tabular-nums">
                                1 رئيسي + {sec?.listSize || 5} أخبار
                              </span>
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                              <span className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/40 px-2 py-0.5">
                                <Sparkles className="h-3 w-3 text-amber-500" />
                                المصدر: {headlineLabel}
                              </span>
                              <span className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/40 px-2 py-0.5">
                                <BarChart3 className="h-3 w-3 text-sky-500" />
                                الإحصائية: {statLabel}
                              </span>
                              {sec?.teaser ? (
                                <span className="truncate rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-emerald-700 dark:text-emerald-300">
                                  «{sec.teaser}»
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </CardHeader>

                        <CardContent className="space-y-4 pt-4">
                          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            {/* Category Selection */}
                            <FormField
                              control={form.control}
                              name={`config.sections.${index}.categorySlug`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>التصنيف</FormLabel>
                                  <Select
                                    onValueChange={field.onChange}
                                    value={field.value}
                                  >
                                    <FormControl>
                                      <SelectTrigger
                                        data-testid={`category-select-${index}`}
                                      >
                                        <SelectValue placeholder="اختر تصنيفاً" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      {activeCategories.map((cat) => (
                                        <SelectItem key={cat.slug} value={cat.slug}>
                                          {cat.nameAr}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            {/* Headline Mode */}
                            <FormField
                              control={form.control}
                              name={`config.sections.${index}.headlineMode`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>مصدر الأخبار</FormLabel>
                                  <Select
                                    onValueChange={field.onChange}
                                    value={field.value}
                                  >
                                    <FormControl>
                                      <SelectTrigger
                                        data-testid={`headline-mode-${index}`}
                                      >
                                        <SelectValue />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="latest">الأحدث</SelectItem>
                                      <SelectItem value="mostViewed">
                                        الأكثر مشاهدة
                                      </SelectItem>
                                      <SelectItem value="editorsPick">
                                        اختيار المحررين
                                      </SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>

                          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            {/* Stat Type */}
                            <FormField
                              control={form.control}
                              name={`config.sections.${index}.statType`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>نوع الإحصائية</FormLabel>
                                  <Select
                                    onValueChange={field.onChange}
                                    value={field.value}
                                  >
                                    <FormControl>
                                      <SelectTrigger data-testid={`stat-type-${index}`}>
                                        <SelectValue />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="dailyCount">
                                        عدد أخبار اليوم
                                      </SelectItem>
                                      <SelectItem value="weeklyCount">
                                        عدد أخبار الأسبوع
                                      </SelectItem>
                                      <SelectItem value="totalViews">
                                        إجمالي المشاهدات
                                      </SelectItem>
                                      <SelectItem value="engagementRate">
                                        معدل التفاعل
                                      </SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            {/* List Size */}
                            <FormField
                              control={form.control}
                              name={`config.sections.${index}.listSize`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>عدد الأخبار (بعد الرئيسي)</FormLabel>
                                  <FormControl>
                                    <Input
                                      type="number"
                                      min={3}
                                      max={8}
                                      {...field}
                                      onChange={(e) =>
                                        field.onChange(parseInt(e.target.value))
                                      }
                                      data-testid={`list-size-${index}`}
                                    />
                                  </FormControl>
                                  <FormDescription className="text-[11px]">
                                    من 3 إلى 8 أخبار
                                  </FormDescription>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>

                          {/* Teaser */}
                          <FormField
                            control={form.control}
                            name={`config.sections.${index}.teaser`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>وصف قصير (اختياري)</FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    placeholder="مثال: أبرز تغطيات المناطق اليوم"
                                    data-testid={`teaser-${index}`}
                                  />
                                </FormControl>
                                <FormDescription className="text-[11px]">
                                  نص وصفي يظهر أسفل اسم التصنيف
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>

              <Separator />

              {/* Global Settings */}
              <Card className="overflow-hidden rounded-2xl border border-border/80 shadow-xs">
                <CardHeader className="border-b border-border/50 bg-muted/20">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <SlidersHorizontal className="h-4 w-4" />
                    </span>
                    <div>
                      <CardTitle className="text-lg">إعدادات العرض العامة</CardTitle>
                      <CardDescription>
                        تحكم بنافذة الحداثة، تجربة الجوال، الشارات التفاعلية، ولون الخلفية
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6 pt-5">
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {/* Mobile Carousel */}
                    <FormField
                      control={form.control}
                      name="config.mobileCarousel"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-xl border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">
                              تفعيل السوايب على الجوال
                            </FormLabel>
                            <FormDescription>
                              عرض التصنيفات في شكل كاروسيل قابل للسوايب على الأجهزة المحمولة
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="mobile-carousel-switch"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    {/* Fresh Hours */}
                    <FormField
                      control={form.control}
                      name="config.freshHours"
                      render={({ field }) => (
                        <FormItem className="rounded-xl border p-4">
                          <FormLabel>
                            الحد الأقصى لعمر الخبر &quot;الجديد&quot; (بالساعات)
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={1}
                              max={72}
                              {...field}
                              onChange={(e) =>
                                field.onChange(parseInt(e.target.value))
                              }
                              data-testid="fresh-hours-input"
                            />
                          </FormControl>
                          <FormDescription>
                            الأخبار الأحدث من هذا العدد من الساعات ستحصل على شارة &quot;جديد&quot;
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Badges */}
                  <div className="space-y-3">
                    <FormLabel className="text-base font-semibold">
                      الشارات المفعّلة ({activeBadgesCount}/3)
                    </FormLabel>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <FormField
                        control={form.control}
                        name="config.badges.breaking"
                        render={({ field }) => (
                          <FormItem className="flex items-center justify-between rounded-xl border p-3.5">
                            <FormLabel className="text-sm font-medium">
                              شارة &quot;عاجل&quot;
                            </FormLabel>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                data-testid="badge-breaking-switch"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="config.badges.exclusive"
                        render={({ field }) => (
                          <FormItem className="flex items-center justify-between rounded-xl border p-3.5">
                            <FormLabel className="text-sm font-medium">
                              شارة &quot;حصري&quot;
                            </FormLabel>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                data-testid="badge-exclusive-switch"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="config.badges.analysis"
                        render={({ field }) => (
                          <FormItem className="flex items-center justify-between rounded-xl border p-3.5">
                            <FormLabel className="text-sm font-medium">
                              شارة &quot;تحليل&quot;
                            </FormLabel>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                data-testid="badge-analysis-switch"
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <Separator />

                  {/* Background Color */}
                  <FormField
                    control={form.control}
                    name="config.backgroundColor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>لون خلفية البلوك (اختياري)</FormLabel>
                        <div className="flex items-center gap-3">
                          <FormControl>
                            <Input
                              type="color"
                              {...field}
                              value={field.value || "#ffffff"}
                              className="h-10 w-20 cursor-pointer"
                              data-testid="background-color-picker"
                            />
                          </FormControl>
                          <Input
                            type="text"
                            value={field.value || ""}
                            onChange={(e) => field.onChange(e.target.value)}
                            placeholder="#ffffff"
                            className="flex-1"
                            data-testid="background-color-input"
                          />
                          {field.value && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="no-min-touch-size h-8"
                              onClick={() => field.onChange(undefined)}
                              data-testid="clear-background-color"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                        <FormDescription>
                          اختر لون خلفية للبلوك. الخلفية ستمتد على كامل عرض الصفحة. اترك فارغاً لاستخدام الخلفية الافتراضية.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              {/* Actions */}
              <div className="flex justify-end gap-3">
                <Button
                  type="submit"
                  disabled={saveMutation.isPending || !form.formState.isDirty}
                  data-testid="save-button"
                >
                  {saveMutation.isPending && (
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  )}
                  <Save className="ml-2 h-4 w-4" />
                  حفظ الإعدادات
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </DashboardPageShell>
    </DashboardLayout>
  );
}
