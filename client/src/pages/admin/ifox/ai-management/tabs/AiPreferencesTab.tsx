import { useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Loader2, Settings, RotateCcw, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { IfoxAiPreferences } from "@shared/schema";

// Schema
const preferencesFormSchema = z.object({
  writingStyle: z.enum(["professional", "casual", "formal", "creative"]),
  tone: z.enum(["neutral", "optimistic", "serious", "conversational"]),
  contentDepth: z.enum(["brief", "medium", "comprehensive"]),
  defaultWordCount: z.number().min(300).max(3000),
  primaryModel: z.enum(["gpt-4", "gpt-3.5-turbo", "claude-3", "gemini-pro"]),
  temperature: z.number().min(0).max(1),
  autoGenerateSeo: z.boolean(),
  autoGenerateImages: z.boolean(),
  enableQualityCheck: z.boolean(),
  qualityThreshold: z.number().min(0).max(100),
  autoPublishEnabled: z.boolean(),
});

type PreferencesFormValues = z.infer<typeof preferencesFormSchema>;

export default function AiPreferencesTab() {
  const { toast } = useToast();

  // Fetch preferences
  const { data: preferences, isLoading, isError } = useQuery<IfoxAiPreferences>({
    queryKey: ["/api/ifox/ai-management/preferences"],
  });

  // Form
  const form = useForm<PreferencesFormValues>({
    resolver: zodResolver(preferencesFormSchema),
    defaultValues: {
      writingStyle: "professional",
      tone: "neutral",
      contentDepth: "medium",
      defaultWordCount: 800,
      primaryModel: "gpt-4",
      temperature: 0.7,
      autoGenerateSeo: true,
      autoGenerateImages: true,
      enableQualityCheck: true,
      qualityThreshold: 70,
      autoPublishEnabled: false,
    },
  });

  // Update form when data loads
  useEffect(() => {
    if (preferences) {
      form.reset({
        writingStyle: (preferences.writingStyle || "professional") as PreferencesFormValues["writingStyle"],
        tone: (preferences.tone || "neutral") as PreferencesFormValues["tone"],
        contentDepth: (preferences.contentDepth || "medium") as PreferencesFormValues["contentDepth"],
        defaultWordCount: preferences.defaultWordCount || 800,
        primaryModel: (preferences.primaryModel || "gpt-4") as PreferencesFormValues["primaryModel"],
        temperature: preferences.temperature ?? 0.7,
        autoGenerateSeo: preferences.autoGenerateSeo ?? true,
        autoGenerateImages: preferences.autoGenerateImages ?? true,
        enableQualityCheck: preferences.enableQualityCheck ?? true,
        qualityThreshold: preferences.qualityThreshold || 70,
        autoPublishEnabled: preferences.autoPublishEnabled ?? false,
      });
    }
  }, [preferences]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: (data: PreferencesFormValues) => 
      apiRequest("/api/ifox/ai-management/preferences", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ifox/ai-management/preferences"] });
      toast({
        title: "تم الحفظ",
        description: "تم حفظ الإعدادات بنجاح",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل حفظ الإعدادات",
        variant: "destructive",
      });
    },
  });

  // Reset mutation
  const resetMutation = useMutation({
    mutationFn: () => 
      apiRequest("/api/ifox/ai-management/preferences/reset", {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ifox/ai-management/preferences"] });
      toast({
        title: "تمت الإعادة",
        description: "تمت إعادة الإعدادات إلى القيم الافتراضية",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل إعادة التعيين",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: PreferencesFormValues) => {
    saveMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>جاري التحميل...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center text-destructive">
            حدث خطأ أثناء تحميل الإعدادات
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            <CardTitle>إعدادات الذكاء الاصطناعي</CardTitle>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => resetMutation.mutate()}
            disabled={resetMutation.isPending}
            data-testid="button-reset-preferences"
          >
            {resetMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin ml-2" />
            ) : (
              <RotateCcw className="w-4 h-4 ml-2" />
            )}
            إعادة تعيين
          </Button>
        </div>
        <CardDescription>
          تخصيص إعدادات توليد المحتوى بالذكاء الاصطناعي
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* القسم 1: Writing Settings */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">إعدادات الكتابة</h3>
              
              {/* Writing Style */}
              <FormField
                control={form.control}
                name="writingStyle"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>أسلوب الكتابة</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-writing-style">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="professional">احترافي</SelectItem>
                        <SelectItem value="casual">غير رسمي</SelectItem>
                        <SelectItem value="formal">رسمي</SelectItem>
                        <SelectItem value="creative">إبداعي</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Tone */}
              <FormField
                control={form.control}
                name="tone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>النبرة</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-tone">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="neutral">محايد</SelectItem>
                        <SelectItem value="optimistic">متفائل</SelectItem>
                        <SelectItem value="serious">جاد</SelectItem>
                        <SelectItem value="conversational">حواري</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Content Depth */}
              <FormField
                control={form.control}
                name="contentDepth"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>عمق المحتوى</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-content-depth">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="brief">موجز</SelectItem>
                        <SelectItem value="medium">متوسط</SelectItem>
                        <SelectItem value="comprehensive">شامل</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Default Word Count */}
              <FormField
                control={form.control}
                name="defaultWordCount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>عدد الكلمات الافتراضي: {field.value}</FormLabel>
                    <FormControl>
                      <Slider
                        min={300}
                        max={3000}
                        step={100}
                        value={[field.value]}
                        onValueChange={(vals) => field.onChange(vals[0])}
                        data-testid="slider-word-count"
                      />
                    </FormControl>
                    <FormDescription>300 - 3000 كلمة</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* القسم 2: AI Model Settings */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">إعدادات النموذج</h3>
              
              {/* Primary Model */}
              <FormField
                control={form.control}
                name="primaryModel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>النموذج الأساسي</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-primary-model">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="gpt-4">GPT-4</SelectItem>
                        <SelectItem value="gpt-3.5-turbo">GPT-3.5 Turbo</SelectItem>
                        <SelectItem value="claude-3">Claude 3</SelectItem>
                        <SelectItem value="gemini-pro">Gemini Pro</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Temperature */}
              <FormField
                control={form.control}
                name="temperature"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>درجة الإبداع: {field.value.toFixed(1)}</FormLabel>
                    <FormControl>
                      <Slider
                        min={0}
                        max={1}
                        step={0.1}
                        value={[field.value]}
                        onValueChange={(vals) => field.onChange(vals[0])}
                        data-testid="slider-temperature"
                      />
                    </FormControl>
                    <FormDescription>0 (متحفظ) - 1 (إبداعي)</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* القسم 3: Automation Settings */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">إعدادات التشغيل التلقائي</h3>
              
              {/* Auto Generate SEO */}
              <FormField
                control={form.control}
                name="autoGenerateSeo"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">توليد SEO تلقائياً</FormLabel>
                      <FormDescription>
                        إنشاء العنوان والوصف والكلمات المفتاحية تلقائياً
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-auto-seo"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              {/* Auto Generate Images */}
              <FormField
                control={form.control}
                name="autoGenerateImages"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">توليد الصور تلقائياً</FormLabel>
                      <FormDescription>
                        إنشاء الصور المميزة باستخدام Visual AI
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-auto-images"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              {/* Enable Quality Check */}
              <FormField
                control={form.control}
                name="enableQualityCheck"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">تفعيل فحص الجودة</FormLabel>
                      <FormDescription>
                        فحص المحتوى تلقائياً قبل النشر
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-quality-check"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              {/* Quality Threshold */}
              <FormField
                control={form.control}
                name="qualityThreshold"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>الحد الأدنى للجودة: {field.value}%</FormLabel>
                    <FormControl>
                      <Slider
                        min={0}
                        max={100}
                        step={5}
                        value={[field.value]}
                        onValueChange={(vals) => field.onChange(vals[0])}
                        data-testid="slider-quality-threshold"
                      />
                    </FormControl>
                    <FormDescription>0% - 100%</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Auto Publish Enabled */}
              <FormField
                control={form.control}
                name="autoPublishEnabled"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-4 border-primary/20 bg-primary/5">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base font-semibold">النشر التلقائي</FormLabel>
                      <FormDescription>
                        نشر المحتوى تلقائياً بعد اجتياز فحص الجودة (استخدم بحذر!)
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-auto-publish"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            {/* Submit Button */}
            <div className="flex justify-end gap-2">
              <Button
                type="submit"
                disabled={saveMutation.isPending}
                data-testid="button-save-preferences"
              >
                {saveMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin ml-2" />
                ) : (
                  <Save className="w-4 h-4 ml-2" />
                )}
                حفظ الإعدادات
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
