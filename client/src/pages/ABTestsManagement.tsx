import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { 
  FlaskConical, 
  Plus, 
  Play, 
  Pause, 
  CheckCircle, 
  Trash2, 
  BarChart3, 
  Image as ImageIcon,
  Type,
  Layout,
  MousePointer,
  Layers
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const experimentSchema = z.object({
  name: z.string().min(3, "الاسم يجب أن يكون 3 أحرف على الأقل"),
  description: z.string().optional(),
  testType: z.enum(["headline", "image", "layout", "cta", "mixed"]),
  successMetric: z.enum(["ctr", "read_time", "engagement", "conversions"]),
  articleId: z.string().optional(),
  createdBy: z.string(),
  variants: z.array(z.object({
    name: z.string().min(1, "الاسم مطلوب"),
    isControl: z.boolean(),
    trafficAllocation: z.number().min(0).max(100),
    variantData: z.object({
      headline: z.string().optional(),
      imageUrl: z.string().optional(),
      excerpt: z.string().optional(),
      ctaText: z.string().optional(),
      layout: z.string().optional(),
    }),
  })).min(2, "يجب إضافة 2 variants على الأقل"),
});

type ExperimentFormValues = z.infer<typeof experimentSchema>;

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, { color: string; label: string }> = {
    draft: { color: "bg-gray-500", label: "مسودة" },
    running: { color: "bg-green-500", label: "قيد التشغيل" },
    paused: { color: "bg-yellow-500", label: "متوقف" },
    completed: { color: "bg-blue-500", label: "مكتمل" },
  };

  const variant = variants[status] || variants.draft;

  return (
    <Badge 
      className={`${variant.color} text-white`}
      data-testid={`badge-status-${status}`}
    >
      {variant.label}
    </Badge>
  );
}

function TestTypeIcon({ type }: { type: string }) {
  const icons: Record<string, any> = {
    headline: Type,
    image: ImageIcon,
    layout: Layout,
    cta: MousePointer,
    mixed: Layers,
  };

  const Icon = icons[type] || FlaskConical;
  return <Icon className="h-4 w-4" />;
}

export default function ABTestsManagement() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [testTypeFilter, setTestTypeFilter] = useState<string>("all");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [experimentToDelete, setExperimentToDelete] = useState<string | null>(null);

  const { data: experimentsRaw, isLoading } = useQuery({
    queryKey: ["/api/ab-tests", statusFilter, testTypeFilter],
    queryFn: () =>
      fetch(`/api/ab-tests?status=${statusFilter !== "all" ? statusFilter : ""}&testType=${testTypeFilter !== "all" ? testTypeFilter : ""}`)
        .then((res) => res.json()),
  });
  const experiments = Array.isArray(experimentsRaw) ? experimentsRaw : [];

  const { data: publishedArticlesRaw } = useQuery({
    queryKey: ["/api/articles", "published"],
    queryFn: () =>
      fetch("/api/articles?status=published&limit=100")
        .then((res) => res.json()),
  });
  const publishedArticles = Array.isArray(publishedArticlesRaw) ? publishedArticlesRaw : [];

  const createMutation = useMutation({
    mutationFn: async (data: ExperimentFormValues) => {
      const { variants, ...experimentData } = data;
      
      const experiment = await apiRequest("/api/ab-tests", {
        method: "POST",
        body: JSON.stringify(experimentData),
      });

      for (const variant of variants) {
        await apiRequest("/api/ab-tests/variants", {
          method: "POST",
          body: JSON.stringify({
            experimentId: experiment.id,
            ...variant,
          }),
        });
      }

      return experiment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ab-tests"] });
      toast({
        title: "تم إنشاء التجربة بنجاح",
        description: "تم إضافة التجربة الجديدة",
      });
      setCreateDialogOpen(false);
      form.reset();
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "حدث خطأ أثناء إنشاء التجربة",
        variant: "destructive",
      });
    },
  });

  const startMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/ab-tests/${id}/start`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ab-tests"] });
      toast({ title: "تم بدء التجربة" });
    },
  });

  const pauseMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/ab-tests/${id}/pause`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ab-tests"] });
      toast({ title: "تم إيقاف التجربة مؤقتاً" });
    },
  });

  const completeMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/ab-tests/${id}/complete`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ab-tests"] });
      toast({ title: "تم إكمال التجربة" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/ab-tests/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ab-tests"] });
      toast({ title: "تم حذف التجربة" });
      setDeleteDialogOpen(false);
      setExperimentToDelete(null);
    },
  });

  const form = useForm<ExperimentFormValues>({
    resolver: zodResolver(experimentSchema),
    defaultValues: {
      name: "",
      description: "",
      testType: "headline",
      successMetric: "ctr",
      articleId: "",
      variants: [
        { name: "A (Control)", isControl: true, trafficAllocation: 50, variantData: {} },
        { name: "B", isControl: false, trafficAllocation: 50, variantData: {} },
      ],
    },
  });

  const testType = form.watch("testType");
  const variants = form.watch("variants");

  const onSubmit = (data: ExperimentFormValues) => {
    const userId = (window as any).__USER_ID__;
    createMutation.mutate({ ...data, createdBy: userId });
  };

  const addVariant = () => {
    const currentVariants = form.getValues("variants");
    const nextLetter = String.fromCharCode(65 + currentVariants.length);
    form.setValue("variants", [
      ...currentVariants,
      {
        name: nextLetter,
        isControl: false,
        trafficAllocation: 0,
        variantData: {},
      },
    ]);
  };

  const removeVariant = (index: number) => {
    const currentVariants = form.getValues("variants");
    if (currentVariants.length > 2) {
      form.setValue(
        "variants",
        currentVariants.filter((_, i) => i !== index)
      );
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6" dir="rtl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FlaskConical className="h-8 w-8 text-primary" data-testid="icon-header" />
            <div>
              <h1 className="text-3xl font-bold" data-testid="text-page-title">اختبارات A/B</h1>
              <p className="text-muted-foreground" data-testid="text-page-description">
                إدارة ومراقبة اختبارات A/B لتحسين الأداء
              </p>
            </div>
          </div>

          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-experiment">
                <Plus className="ml-2 h-4 w-4" />
                إنشاء تجربة جديدة
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
              <DialogHeader>
                <DialogTitle data-testid="text-dialog-title">إنشاء تجربة A/B جديدة</DialogTitle>
                <DialogDescription data-testid="text-dialog-description">
                  أضف تجربة جديدة لاختبار عناصر مختلفة في المحتوى
                </DialogDescription>
              </DialogHeader>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>اسم التجربة</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="مثال: اختبار عنوان المقال الرئيسي" data-testid="input-experiment-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>الوصف (اختياري)</FormLabel>
                        <FormControl>
                          <Textarea {...field} placeholder="وصف الهدف من التجربة..." data-testid="input-experiment-description" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="testType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>نوع الاختبار</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-test-type">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="headline">العنوان الرئيسي</SelectItem>
                              <SelectItem value="image">الصورة</SelectItem>
                              <SelectItem value="layout">التخطيط</SelectItem>
                              <SelectItem value="cta">زر الإجراء</SelectItem>
                              <SelectItem value="mixed">متعدد</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="successMetric"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>معيار النجاح</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-success-metric">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="ctr">نسبة النقرات (CTR)</SelectItem>
                              <SelectItem value="read_time">وقت القراءة</SelectItem>
                              <SelectItem value="engagement">التفاعل</SelectItem>
                              <SelectItem value="conversions">التحويلات</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="articleId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>المقال (اختياري)</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || undefined}>
                          <FormControl>
                            <SelectTrigger data-testid="select-article">
                              <SelectValue placeholder="اختر مقال (اختياري)..." />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {publishedArticles.map((article: any) => (
                              <SelectItem key={article.id} value={article.id}>
                                {article.title}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          ربط التجربة بمقال معين (اختياري)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold">الخيارات (Variants)</h3>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addVariant}
                        data-testid="button-add-variant"
                      >
                        <Plus className="ml-2 h-4 w-4" />
                        إضافة خيار
                      </Button>
                    </div>

                    {variants.map((variant, index) => (
                      <Card key={index} data-testid={`card-variant-${index}`}>
                        <CardHeader>
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-base">الخيار {variant.name}</CardTitle>
                            {variants.length > 2 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeVariant(index)}
                                data-testid={`button-remove-variant-${index}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <FormField
                            control={form.control}
                            name={`variants.${index}.name`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>الاسم</FormLabel>
                                <FormControl>
                                  <Input {...field} data-testid={`input-variant-name-${index}`} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <div className="grid grid-cols-2 gap-4">
                            <FormField
                              control={form.control}
                              name={`variants.${index}.isControl`}
                              render={({ field }) => (
                                <FormItem className="flex items-center gap-2 space-y-0">
                                  <FormControl>
                                    <Checkbox
                                      checked={field.value}
                                      onCheckedChange={field.onChange}
                                      data-testid={`checkbox-is-control-${index}`}
                                    />
                                  </FormControl>
                                  <FormLabel className="cursor-pointer">خيار التحكم (Control)</FormLabel>
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name={`variants.${index}.trafficAllocation`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>نسبة الزيارات (%)</FormLabel>
                                  <FormControl>
                                    <Input
                                      type="number"
                                      {...field}
                                      onChange={(e) => field.onChange(parseInt(e.target.value))}
                                      data-testid={`input-traffic-allocation-${index}`}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>

                          {testType === "headline" && (
                            <FormField
                              control={form.control}
                              name={`variants.${index}.variantData.headline`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>العنوان الرئيسي</FormLabel>
                                  <FormControl>
                                    <Input {...field} placeholder="أدخل العنوان..." data-testid={`input-headline-${index}`} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          )}

                          {testType === "image" && (
                            <FormField
                              control={form.control}
                              name={`variants.${index}.variantData.imageUrl`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>رابط الصورة</FormLabel>
                                  <FormControl>
                                    <Input {...field} placeholder="https://..." data-testid={`input-image-url-${index}`} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          )}

                          {testType === "cta" && (
                            <FormField
                              control={form.control}
                              name={`variants.${index}.variantData.ctaText`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>نص زر الإجراء</FormLabel>
                                  <FormControl>
                                    <Input {...field} placeholder="اقرأ المزيد" data-testid={`input-cta-${index}`} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setCreateDialogOpen(false)}
                      data-testid="button-cancel"
                    >
                      إلغاء
                    </Button>
                    <Button
                      type="submit"
                      disabled={createMutation.isPending}
                      data-testid="button-submit"
                    >
                      {createMutation.isPending ? "جاري الإنشاء..." : "إنشاء التجربة"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <Tabs value={statusFilter} onValueChange={setStatusFilter} className="w-full">
              <TabsList data-testid="tabs-status-filter">
                <TabsTrigger value="all" data-testid="tab-all">الكل</TabsTrigger>
                <TabsTrigger value="draft" data-testid="tab-draft">مسودات</TabsTrigger>
                <TabsTrigger value="running" data-testid="tab-running">قيد التشغيل</TabsTrigger>
                <TabsTrigger value="paused" data-testid="tab-paused">متوقفة</TabsTrigger>
                <TabsTrigger value="completed" data-testid="tab-completed">مكتملة</TabsTrigger>
              </TabsList>
            </Tabs>

            <Select value={testTypeFilter} onValueChange={setTestTypeFilter}>
              <SelectTrigger className="w-[200px]" data-testid="select-type-filter">
                <SelectValue placeholder="نوع الاختبار" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الأنواع</SelectItem>
                <SelectItem value="headline">العنوان</SelectItem>
                <SelectItem value="image">الصورة</SelectItem>
                <SelectItem value="layout">التخطيط</SelectItem>
                <SelectItem value="cta">زر الإجراء</SelectItem>
                <SelectItem value="mixed">متعدد</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-full mt-2" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-20 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : experiments.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FlaskConical className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground" data-testid="text-no-experiments">
                لا توجد تجارب متاحة
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {experiments.map((experiment: any) => {
              const conversionRate =
                experiment.totalExposures > 0
                  ? ((experiment.totalConversions / experiment.totalExposures) * 100).toFixed(2)
                  : "0.00";

              return (
                <Card key={experiment.id} data-testid={`card-experiment-${experiment.id}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <CardTitle className="text-lg" data-testid={`text-experiment-name-${experiment.id}`}>
                          {experiment.name}
                        </CardTitle>
                        {experiment.description && (
                          <CardDescription className="mt-1" data-testid={`text-experiment-description-${experiment.id}`}>
                            {experiment.description}
                          </CardDescription>
                        )}
                      </div>
                      <StatusBadge status={experiment.status} />
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2 text-sm">
                      <TestTypeIcon type={experiment.testType} />
                      <span className="text-muted-foreground" data-testid={`text-test-type-${experiment.id}`}>
                        {experiment.testType === "headline" && "العنوان الرئيسي"}
                        {experiment.testType === "image" && "الصورة"}
                        {experiment.testType === "layout" && "التخطيط"}
                        {experiment.testType === "cta" && "زر الإجراء"}
                        {experiment.testType === "mixed" && "متعدد"}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-muted-foreground">المشاهدات</p>
                        <p className="font-semibold" data-testid={`text-exposures-${experiment.id}`}>
                          {experiment.totalExposures.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">التحويلات</p>
                        <p className="font-semibold" data-testid={`text-conversions-${experiment.id}`}>
                          {experiment.totalConversions.toLocaleString()}
                        </p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-muted-foreground">معدل التحويل</p>
                        <p className="font-semibold text-primary" data-testid={`text-conversion-rate-${experiment.id}`}>
                          {conversionRate}%
                        </p>
                      </div>
                    </div>

                    {experiment.startedAt && (
                      <div className="text-xs text-muted-foreground" data-testid={`text-dates-${experiment.id}`}>
                        <p>بدأت: {new Date(experiment.startedAt).toLocaleDateString("ar-SA-u-ca-gregory")}</p>
                        {experiment.endedAt && (
                          <p>انتهت: {new Date(experiment.endedAt).toLocaleDateString("ar-SA-u-ca-gregory")}</p>
                        )}
                      </div>
                    )}
                  </CardContent>

                  <CardFooter className="flex flex-wrap gap-2">
                    {experiment.status === "draft" && (
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => startMutation.mutate(experiment.id)}
                        disabled={startMutation.isPending}
                        data-testid={`button-start-${experiment.id}`}
                      >
                        <Play className="ml-1 h-3 w-3" />
                        بدء
                      </Button>
                    )}

                    {experiment.status === "running" && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => pauseMutation.mutate(experiment.id)}
                          disabled={pauseMutation.isPending}
                          data-testid={`button-pause-${experiment.id}`}
                        >
                          <Pause className="ml-1 h-3 w-3" />
                          إيقاف
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => completeMutation.mutate(experiment.id)}
                          disabled={completeMutation.isPending}
                          data-testid={`button-complete-${experiment.id}`}
                        >
                          <CheckCircle className="ml-1 h-3 w-3" />
                          إكمال
                        </Button>
                      </>
                    )}

                    {experiment.status === "paused" && (
                      <>
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => startMutation.mutate(experiment.id)}
                          disabled={startMutation.isPending}
                          data-testid={`button-resume-${experiment.id}`}
                        >
                          <Play className="ml-1 h-3 w-3" />
                          استئناف
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => completeMutation.mutate(experiment.id)}
                          disabled={completeMutation.isPending}
                          data-testid={`button-complete-${experiment.id}`}
                        >
                          <CheckCircle className="ml-1 h-3 w-3" />
                          إكمال
                        </Button>
                      </>
                    )}

                    <Link href={`/dashboard/ab-tests/${experiment.id}`}>
                      <Button size="sm" variant="outline" data-testid={`button-view-analytics-${experiment.id}`}>
                        <BarChart3 className="ml-1 h-3 w-3" />
                        التحليلات
                      </Button>
                    </Link>

                    {experiment.status === "draft" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setExperimentToDelete(experiment.id);
                          setDeleteDialogOpen(true);
                        }}
                        data-testid={`button-delete-${experiment.id}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف هذه التجربة؟ لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => experimentToDelete && deleteMutation.mutate(experimentToDelete)}
              data-testid="button-confirm-delete"
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
