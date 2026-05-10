import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ArrowRight, Save, Loader2, Calendar as CalendarIcon, Eye, Target } from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { Campaign } from "@shared/schema";

// Zod validation schema
const formSchema = z.object({
  name: z.string().min(3, "يجب أن يكون الاسم 3 أحرف على الأقل"),
  objective: z.enum(["brand_awareness", "traffic", "conversions", "engagement"], {
    required_error: "يرجى اختيار هدف الحملة",
  }),
  dailyBudget: z.number().min(1, "عدد الظهورات اليومية يجب أن يكون أكبر من صفر"),
  totalBudget: z.number().min(1, "إجمالي عدد الظهورات يجب أن يكون أكبر من صفر"),
  startDate: z.date({
    required_error: "تاريخ البداية مطلوب",
  }),
  endDate: z.date().optional(),
}).refine(
  (data) => data.totalBudget >= data.dailyBudget,
  {
    message: "إجمالي الظهورات يجب أن يكون أكبر من أو يساوي الظهورات اليومية",
    path: ["totalBudget"],
  }
).refine(
  (data) => !data.endDate || data.endDate > data.startDate,
  {
    message: "تاريخ النهاية يجب أن يكون بعد تاريخ البداية",
    path: ["endDate"],
  }
);

type FormValues = z.infer<typeof formSchema>;

// Objective options with Arabic labels
const objectiveOptions = [
  { value: "brand_awareness", label: "الوعي بالعلامة التجارية" },
  { value: "traffic", label: "زيادة الزيارات" },
  { value: "conversions", label: "التحويلات" },
  { value: "engagement", label: "التفاعل" },
] as const;

// Map backend objective to UI value
const backendToUiObjective = (backendObjective: string): "brand_awareness" | "traffic" | "conversions" | "engagement" => {
  const mapping: Record<string, "brand_awareness" | "traffic" | "conversions" | "engagement"> = {
    "CPM": "brand_awareness",
    "CPC": "traffic", 
    "CPA": "conversions",
    "CPE": "engagement",
  };
  return mapping[backendObjective] || "brand_awareness";
};

export default function CampaignEditor() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  
  // Determine if we're editing or creating
  const isEditing = !!params.id && params.id !== 'new';
  const campaignId = isEditing ? params.id : undefined;

  // Fetch campaign data if editing
  const { data: campaign, isLoading: isLoadingCampaign } = useQuery<Campaign>({
    queryKey: ["/api/ads/campaigns", campaignId],
    enabled: isEditing,
  });

  // Form setup
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      objective: "brand_awareness",
      dailyBudget: 100,
      totalBudget: 1000,
      startDate: new Date(),
      endDate: undefined,
    },
  });

  // Load campaign data into form when editing
  useEffect(() => {
    if (campaign && isEditing) {
      form.reset({
        name: campaign.name,
        objective: backendToUiObjective(campaign.objective),
        dailyBudget: campaign.dailyBudget, // Impressions count
        totalBudget: campaign.totalBudget, // Impressions count
        startDate: new Date(campaign.startDate),
        endDate: campaign.endDate ? new Date(campaign.endDate) : undefined,
      });
    }
  }, [campaign, isEditing, form]);

  // Set page title
  useEffect(() => {
    document.title = isEditing ? "تعديل الحملة - لوحة تحكم الإعلانات" : "إنشاء حملة جديدة - لوحة تحكم الإعلانات";
  }, [isEditing]);

  // Create/Update mutation
  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      // Map UI objective to backend objective
      const objectiveMap: Record<FormValues["objective"], string> = {
        brand_awareness: "CPM",
        traffic: "CPC",
        conversions: "CPA",
        engagement: "CPE",
      };

      // Calculate bid amount based on objective (simple default logic)
      const bidAmountMap: Record<FormValues["objective"], number> = {
        brand_awareness: 5, // 5 SAR per 1000 impressions
        traffic: 2, // 2 SAR per click
        conversions: 10, // 10 SAR per conversion
        engagement: 1, // 1 SAR per engagement
      };

      const payload = {
        name: values.name,
        objective: objectiveMap[values.objective],
        dailyBudget: Math.round(values.dailyBudget), // Impressions count
        totalBudget: Math.round(values.totalBudget), // Impressions count
        startDate: values.startDate.toISOString(),
        endDate: values.endDate?.toISOString() || null,
        bidAmount: Math.round(bidAmountMap[values.objective] * 100), // Convert SAR to cents
        status: "draft",
      };

      if (isEditing && campaignId) {
        return await apiRequest(`/api/ads/campaigns/${campaignId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
          headers: { "Content-Type": "application/json" },
        });
      } else {
        return await apiRequest("/api/ads/campaigns", {
          method: "POST",
          body: JSON.stringify(payload),
          headers: { "Content-Type": "application/json" },
        });
      }
    },
    onSuccess: () => {
      // Invalidate campaigns list
      queryClient.invalidateQueries({ queryKey: ["/api/ads/campaigns"] });
      
      // Show success toast
      toast({
        title: isEditing ? "تم تحديث الحملة" : "تم إنشاء الحملة",
        description: isEditing 
          ? "تم تحديث بيانات الحملة بنجاح"
          : "تم إنشاء الحملة بنجاح. يمكنك الآن إضافة مجموعات إعلانية",
      });

      // Navigate back to campaigns list
      navigate("/dashboard/ads/campaigns");
    },
    onError: (error: any) => {
      console.error("[Campaign Editor] Error:", error);
      toast({
        title: "حدث خطأ",
        description: error.message || "فشل في حفظ الحملة. الرجاء المحاولة مرة أخرى",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (values: FormValues) => {
    mutation.mutate(values);
  };

  // Show loading skeleton while fetching campaign data
  if (isLoadingCampaign && isEditing) {
    return (
      <DashboardLayout>
        <div className="container mx-auto p-6" dir="rtl">
          <Skeleton className="h-10 w-48 mb-6" />
          <Card>
            <CardHeader>
              <Skeleton className="h-8 w-64 mb-2" />
              <Skeleton className="h-4 w-96" />
            </CardHeader>
            <CardContent className="space-y-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 max-w-4xl" dir="rtl">
        {/* Header */}
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => navigate("/dashboard/ads/campaigns")}
            className="mb-4"
            data-testid="button-back"
          >
            <ArrowRight className="h-4 w-4 ml-2" />
            العودة إلى الحملات
          </Button>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">
            {isEditing ? "تعديل الحملة" : "إنشاء حملة جديدة"}
          </h1>
          <p className="text-muted-foreground mt-2">
            {isEditing 
              ? "قم بتعديل بيانات الحملة الإعلانية"
              : "قم بإنشاء حملة إعلانية جديدة للوصول إلى جمهورك المستهدف"
            }
          </p>
        </div>

        {/* Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              بيانات الحملة الإعلانية
            </CardTitle>
            <CardDescription>
              املأ النموذج التالي لإنشاء أو تعديل حملتك الإعلانية
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                {/* Campaign Name */}
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>اسم الحملة</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="مثال: حملة العودة للمدارس 2025"
                          {...field}
                          data-testid="input-name"
                          disabled={mutation.isPending}
                        />
                      </FormControl>
                      <FormDescription>
                        اختر اسماً واضحاً ومعبراً عن هدف الحملة
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Objective */}
                <FormField
                  control={form.control}
                  name="objective"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>هدف الحملة</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        disabled={mutation.isPending}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-objective">
                            <SelectValue placeholder="اختر هدف الحملة" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {objectiveOptions.map((option) => (
                            <SelectItem
                              key={option.value}
                              value={option.value}
                              data-testid={`option-objective-${option.value}`}
                            >
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        الهدف الرئيسي الذي تريد تحقيقه من هذه الحملة
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Budget Fields - Side by Side */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Daily Impressions Budget */}
                  <FormField
                    control={form.control}
                    name="dailyBudget"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>رصيد الظهورات اليومية</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Eye className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              type="number"
                              min="1"
                              step="1"
                              placeholder="10000"
                              {...field}
                              onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                              value={field.value}
                              className="pr-10"
                              data-testid="input-daily-budget"
                              disabled={mutation.isPending}
                            />
                          </div>
                        </FormControl>
                        <FormDescription>
                          الحد الأقصى لعدد الظهورات اليومية
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Total Impressions Budget */}
                  <FormField
                    control={form.control}
                    name="totalBudget"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>إجمالي رصيد الظهورات</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Eye className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              type="number"
                              min="1"
                              step="1"
                              placeholder="100000"
                              {...field}
                              onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                              value={field.value}
                              className="pr-10"
                              data-testid="input-total-budget"
                              disabled={mutation.isPending}
                            />
                          </div>
                        </FormControl>
                        <FormDescription>
                          إجمالي عدد الظهورات المخصصة للحملة
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Date Fields - Side by Side */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Start Date */}
                  <FormField
                    control={form.control}
                    name="startDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>تاريخ البداية</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  "w-full pl-3 text-right font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                                data-testid="button-start-date"
                                disabled={mutation.isPending}
                              >
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                {field.value ? (
                                  format(field.value, "PPP", { locale: ar })
                                ) : (
                                  <span>اختر التاريخ</span>
                                )}
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormDescription>
                          متى تريد بدء عرض الإعلانات؟
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* End Date */}
                  <FormField
                    control={form.control}
                    name="endDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>تاريخ النهاية (اختياري)</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  "w-full pl-3 text-right font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                                data-testid="button-end-date"
                                disabled={mutation.isPending}
                              >
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                {field.value ? (
                                  format(field.value, "PPP", { locale: ar })
                                ) : (
                                  <span>اختر التاريخ</span>
                                )}
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              disabled={(date) => {
                                const startDate = form.getValues("startDate");
                                return date <= startDate;
                              }}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormDescription>
                          اتركه فارغاً للتشغيل المستمر
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Form Actions */}
                <div className="flex items-center gap-4 pt-6 border-t">
                  <Button
                    type="submit"
                    disabled={mutation.isPending}
                    data-testid="button-submit"
                    className="min-w-32"
                  >
                    {mutation.isPending ? (
                      <>
                        <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                        جاري الحفظ...
                      </>
                    ) : (
                      <>
                        <Save className="ml-2 h-4 w-4" />
                        {isEditing ? "تحديث الحملة" : "إنشاء الحملة"}
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => navigate("/dashboard/ads/campaigns")}
                    disabled={mutation.isPending}
                    data-testid="button-cancel"
                  >
                    إلغاء
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
