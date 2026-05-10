import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Loader2, Save, Eye, Trash2, Plus } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { categories } from "@shared/schema";

// Form Schema
const formSchema = z.object({
  config: z.object({
    sections: z.array(z.object({
      categorySlug: z.string().min(1, "يجب اختيار تصنيف"),
      headlineMode: z.enum(["latest", "mostViewed", "editorsPick"]),
      statType: z.enum(["dailyCount", "weeklyCount", "totalViews", "engagementRate"]),
      teaser: z.string().optional(),
      listSize: z.number().min(3, "الحد الأدنى 3").max(8, "الحد الأقصى 8"),
    })).length(4, "يجب اختيار 4 تصنيفات بالضبط"),
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

export default function QuadCategoriesBlockSettings() {
  const { toast } = useToast();

  // Fetch categories
  const { data: categoriesData, isLoading: categoriesLoading } = useQuery<Array<typeof categories.$inferSelect>>({
    queryKey: ["/api/categories"],
  });

  // Fetch current settings
  const { data: settings, isLoading: settingsLoading } = useQuery<{ config: FormData["config"]; isActive: boolean }>({
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
        <div className="container mx-auto p-6 space-y-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
          <div className="grid gap-6">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-64 w-full" />
            ))}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const activeCategories = categoriesData?.filter((c) => c.status === "visible") || [];

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 max-w-6xl" data-testid="quad-categories-settings-page">
        <div className="space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-3xl font-bold" data-testid="page-title">
              بلوك التصنيفات الرباعية
            </h1>
            <p className="text-muted-foreground mt-2" data-testid="page-description">
              إعدادات عرض 4 تصنيفات في بلوك واحد على الصفحة الرئيسية
            </p>
          </div>

        <Separator />

        {/* Form */}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Sections Configuration */}
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">التصنيفات الأربعة</h2>
              <div className="grid gap-6">
                {[0, 1, 2, 3].map((index) => (
                  <Card key={index} data-testid={`section-card-${index}`}>
                    <CardHeader>
                      <CardTitle className="text-lg">العمود {index + 1}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Category Selection */}
                      <FormField
                        control={form.control}
                        name={`config.sections.${index}.categorySlug`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>التصنيف</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid={`category-select-${index}`}>
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
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid={`headline-mode-${index}`}>
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="latest">الأحدث</SelectItem>
                                <SelectItem value="mostViewed">الأكثر مشاهدة</SelectItem>
                                <SelectItem value="editorsPick">اختيار المحررين</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Stat Type */}
                      <FormField
                        control={form.control}
                        name={`config.sections.${index}.statType`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>نوع الإحصائية</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid={`stat-type-${index}`}>
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="dailyCount">عدد أخبار اليوم</SelectItem>
                                <SelectItem value="weeklyCount">عدد أخبار الأسبوع</SelectItem>
                                <SelectItem value="totalViews">إجمالي المشاهدات</SelectItem>
                                <SelectItem value="engagementRate">معدل التفاعل</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

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
                            <FormDescription>
                              نص وصفي يظهر أسفل اسم التصنيف
                            </FormDescription>
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
                            <FormLabel>عدد الأخبار (بعد الخبر الرئيسي)</FormLabel>
                            <FormControl>
                              <Input 
                                type="number" 
                                min={3} 
                                max={8}
                                {...field}
                                onChange={(e) => field.onChange(parseInt(e.target.value))}
                                data-testid={`list-size-${index}`}
                              />
                            </FormControl>
                            <FormDescription>
                              من 3 إلى 8 أخبار
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            <Separator />

            {/* Global Settings */}
            <Card>
              <CardHeader>
                <CardTitle>إعدادات عامة</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Mobile Carousel */}
                <FormField
                  control={form.control}
                  name="config.mobileCarousel"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">تفعيل السوايب على الجوال</FormLabel>
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
                    <FormItem>
                      <FormLabel>الحد الأقصى لعمر الخبر "الجديد" (بالساعات)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          min={1} 
                          max={72}
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value))}
                          data-testid="fresh-hours-input"
                        />
                      </FormControl>
                      <FormDescription>
                        الأخبار الأحدث من هذا العدد من الساعات ستحصل على شارة "جديد"
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Badges */}
                <div className="space-y-4">
                  <FormLabel className="text-base">الشارات المفعّلة</FormLabel>
                  
                  <FormField
                    control={form.control}
                    name="config.badges.breaking"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-3">
                        <FormLabel className="text-sm font-normal">شارة "عاجل"</FormLabel>
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
                      <FormItem className="flex items-center justify-between rounded-lg border p-3">
                        <FormLabel className="text-sm font-normal">شارة "حصري"</FormLabel>
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
                      <FormItem className="flex items-center justify-between rounded-lg border p-3">
                        <FormLabel className="text-sm font-normal">شارة "تحليل"</FormLabel>
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

                <Separator />

                {/* Background Color */}
                <FormField
                  control={form.control}
                  name="config.backgroundColor"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>لون خلفية البلوك (اختياري)</FormLabel>
                      <div className="flex gap-3 items-center">
                        <FormControl>
                          <Input 
                            type="color"
                            {...field}
                            value={field.value || "#ffffff"}
                            className="w-20 h-10 cursor-pointer"
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
            <div className="flex gap-3 justify-end">
              <Button
                type="submit"
                disabled={saveMutation.isPending || !form.formState.isDirty}
                data-testid="save-button"
              >
                {saveMutation.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                <Save className="ml-2 h-4 w-4" />
                حفظ الإعدادات
              </Button>
            </div>
          </form>
        </Form>
      </div>
      </div>
    </DashboardLayout>
  );
}
