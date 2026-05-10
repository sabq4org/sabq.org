import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Loader2, Save } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { UrCategory } from "@shared/schema";

// Form Schema
const formSchema = z.object({
  config: z.object({
    sections: z.array(z.object({
      categorySlug: z.string().min(1, "زمرہ ضروری ہے"),
      headlineMode: z.enum(["latest", "mostViewed", "editorsPick"]),
      statType: z.enum(["dailyCount", "weeklyCount", "totalViews", "engagementRate"]),
      teaser: z.string().optional(),
      listSize: z.number().min(3, "کم از کم 3").max(8, "زیادہ سے زیادہ 8"),
    })).length(4, "بالکل 4 زمرے منتخب کریں"),
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

export default function UrduQuadCategoriesPage() {
  const { toast } = useToast();

  // Fetch Urdu categories
  const { data: categoriesData, isLoading: categoriesLoading } = useQuery<UrCategory[]>({
    queryKey: ["/api/ur/categories"],
  });

  // Fetch current Urdu settings
  const { data: settings, isLoading: settingsLoading } = useQuery<{ config: FormData["config"]; isActive: boolean }>({
    queryKey: ["/api/ur/admin/blocks/quad-categories/settings"],
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

  // Save mutation for Urdu settings
  const saveMutation = useMutation({
    mutationFn: async (data: FormData) => {
      return await apiRequest("/api/ur/admin/blocks/quad-categories/settings", {
        method: "PUT",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ur/blocks/quad-categories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ur/admin/blocks/quad-categories/settings"] });
      toast({
        title: "کامیابی سے محفوظ کیا گیا",
        description: "اردو چار زمرے بلاک کی ترتیبات محفوظ کی گئیں",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "محفوظ کرنے میں ناکامی",
        description: error.message || "محفوظ کرتے وقت ایک خرابی پیش آئی",
      });
    },
  });

  const onSubmit = (data: FormData) => {
    saveMutation.mutate(data);
  };

  if (settingsLoading || categoriesLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6" dir="rtl">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <div className="grid gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-64 w-full" />
          ))}
        </div>
      </div>
    );
  }

  const activeCategories = categoriesData?.filter((c) => c.status === "active") || [];

  return (
    <div className="container mx-auto p-6 max-w-6xl" dir="rtl" data-testid="quad-categories-settings-page">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold" data-testid="page-title">
            چار زمرے بلاک
          </h1>
          <p className="text-muted-foreground mt-2" data-testid="page-description">
            ہوم پیج پر ایک بلاک میں 4 زمرے دکھانے کی ترتیبات
          </p>
        </div>

        <Separator />

        {/* Form */}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Sections Configuration */}
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">چار زمرے</h2>
              <div className="grid gap-6">
                {[0, 1, 2, 3].map((index) => (
                  <Card key={index} data-testid={`section-card-${index}`}>
                    <CardHeader>
                      <CardTitle className="text-lg">کالم {index + 1}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Category Selection */}
                      <FormField
                        control={form.control}
                        name={`config.sections.${index}.categorySlug`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>زمرہ</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid={`category-select-${index}`}>
                                  <SelectValue placeholder="زمرہ منتخب کریں" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {activeCategories.map((cat) => (
                                  <SelectItem key={cat.slug} value={cat.slug}>
                                    {cat.name}
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
                            <FormLabel>خبروں کا ذریعہ</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid={`headline-mode-${index}`}>
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="latest">تازہ ترین</SelectItem>
                                <SelectItem value="mostViewed">سب سے زیادہ دیکھے گئے</SelectItem>
                                <SelectItem value="editorsPick">ایڈیٹرز کی پسند</SelectItem>
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
                            <FormLabel>اعداد و شمار کی قسم</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid={`stat-type-${index}`}>
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="dailyCount">آج کے مضامین کی تعداد</SelectItem>
                                <SelectItem value="weeklyCount">ہفتہ وار مضامین کی تعداد</SelectItem>
                                <SelectItem value="totalViews">کل ملاحظات</SelectItem>
                                <SelectItem value="engagementRate">مشغولیت کی شرح</SelectItem>
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
                            <FormLabel>مختصر تفصیل (اختیاری)</FormLabel>
                            <FormControl>
                              <Input 
                                {...field} 
                                placeholder="مثال: آج کی اہم علاقائی کوریج"
                                data-testid={`teaser-${index}`}
                              />
                            </FormControl>
                            <FormDescription>
                              زمرہ کے نام کے نیچے دکھایا گیا تفصیلی متن
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
                            <FormLabel>مضامین کی تعداد (اہم مضمون کے بعد)</FormLabel>
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
                              3 سے 8 مضامین
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
                <CardTitle>عمومی ترتیبات</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Mobile Carousel */}
                <FormField
                  control={form.control}
                  name="config.mobileCarousel"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">موبائل سوائپ فعال کریں</FormLabel>
                        <FormDescription>
                          موبائل آلات پر سوائپ کے قابل کیروسل میں زمرے دکھائیں
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
                      <FormLabel>تازہ گھنٹے</FormLabel>
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
                        گھنٹوں کی تعداد جس میں مضامین کو "تازہ" سمجھا جائے (1-72)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Badges Section */}
                <div className="space-y-4">
                  <FormLabel className="text-base">بیجز</FormLabel>
                  
                  <FormField
                    control={form.control}
                    name="config.badges.exclusive"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">خصوصی</FormLabel>
                          <FormDescription>
                            خصوصی مضامین کے لیے بیج دکھائیں
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="exclusive-badge-switch"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="config.badges.breaking"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">عاجل خبر</FormLabel>
                          <FormDescription>
                            عاجل خبروں کے لیے بیج دکھائیں
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="breaking-badge-switch"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="config.badges.analysis"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">تجزیہ</FormLabel>
                          <FormDescription>
                            تجزیاتی مضامین کے لیے بیج دکھائیں
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="analysis-badge-switch"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                {/* Background Color */}
                <FormField
                  control={form.control}
                  name="config.backgroundColor"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>پس منظر کا رنگ (اختیاری)</FormLabel>
                      <FormControl>
                        <Input 
                          {...field} 
                          placeholder="#FFFFFF یا transparent"
                          data-testid="background-color-input"
                        />
                      </FormControl>
                      <FormDescription>
                        CSS رنگ کی قدر (ہیکس، RGB، یا نام)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <Separator />

            {/* Submit Button */}
            <div className="flex justify-end gap-4">
              <Button
                type="submit"
                size="lg"
                disabled={saveMutation.isPending}
                data-testid="save-button"
              >
                {saveMutation.isPending ? (
                  <>
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                    محفوظ ہو رہا ہے...
                  </>
                ) : (
                  <>
                    <Save className="ml-2 h-4 w-4" />
                    محفوظ کریں
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
