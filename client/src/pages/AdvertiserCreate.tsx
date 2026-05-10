import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  ArrowLeft, 
  ArrowRight, 
  CheckCircle, 
  Upload, 
  Image as ImageIcon,
  User,
  FileText,
  Target,
  Eye,
  Calendar as CalendarIcon,
  Loader2,
  Building2,
  Mail,
  Phone,
  Link as LinkIcon
} from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import type { Category } from "@shared/schema";
import { useAdvertiserProfile } from "@/hooks/useAdvertiser";

const advertiserInfoSchema = z.object({
  advertiserName: z.string().min(2, "الاسم مطلوب"),
  email: z.string().email("البريد الإلكتروني غير صحيح"),
  phone: z.string().min(9, "رقم الجوال غير صحيح"),
  company: z.string().optional(),
});

const adContentSchema = z.object({
  title: z.string().min(5, "العنوان يجب أن يكون 5 أحرف على الأقل").max(100, "العنوان طويل جداً"),
  description: z.string().max(200, "الوصف طويل جداً").optional(),
  imageUrl: z.string().min(1, "صورة الإعلان مطلوبة"),
  destinationUrl: z.string().url("رابط الوجهة غير صحيح"),
  callToAction: z.string().max(30, "نص الزر طويل جداً").optional(),
});

const targetingSchema = z.object({
  targetCategories: z.array(z.string()).optional(),
  startDate: z.date({ required_error: "تاريخ البداية مطلوب" }),
  endDate: z.date().optional().nullable(),
  dailyBudgetEnabled: z.boolean().optional().default(false),
  dailyBudget: z.coerce.number().min(10, "الحد الأدنى 10 ريال").optional(),
});

const fullSchema = advertiserInfoSchema.merge(adContentSchema).merge(targetingSchema).refine((data) => {
  if (data.dailyBudgetEnabled && !data.dailyBudget) {
    return false;
  }
  return true;
}, {
  message: "الميزانية اليومية مطلوبة عند تفعيل الحد اليومي",
  path: ["dailyBudget"],
});

type FormValues = z.infer<typeof fullSchema>;

const steps = [
  { id: 1, title: "معلومات المعلن", icon: User },
  { id: 2, title: "محتوى الإعلان", icon: FileText },
  { id: 3, title: "الاستهداف", icon: Target },
  { id: 4, title: "المعاينة", icon: Eye },
];

export default function AdvertiserCreate() {
  const [currentStep, setCurrentStep] = useState(1);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const { data: advertiser, isLoading: isLoadingAdvertiser } = useAdvertiserProfile();

  useEffect(() => {
    document.title = "إنشاء إعلان جديد - سبق";
  }, []);

  const form = useForm<FormValues>({
    resolver: zodResolver(fullSchema),
    defaultValues: {
      advertiserName: "",
      email: "",
      phone: "",
      company: "",
      title: "",
      description: "",
      imageUrl: "",
      destinationUrl: "",
      callToAction: "اقرأ المزيد",
      targetCategories: [],
      startDate: new Date(),
      endDate: null,
      dailyBudgetEnabled: false,
      dailyBudget: undefined,
    },
  });
  
  useEffect(() => {
    if (advertiser) {
      form.setValue("advertiserName", advertiser.name || "");
      form.setValue("email", advertiser.email || "");
      form.setValue("phone", advertiser.phone || "");
      form.setValue("company", advertiser.company || "");
    }
  }, [advertiser, form]);

  const { data: categoriesRaw } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });
  const categories = Array.isArray(categoriesRaw) ? categoriesRaw : [];

  // Track if we've already submitted to prevent duplicate submissions (useRef for synchronous check)
  const isSubmittingRef = useRef(false);
  
  const submitMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      // Synchronous check to prevent duplicate submissions (useRef updates immediately)
      if (isSubmittingRef.current) {
        console.log("[AdvertiserCreate] Prevented duplicate submission (ref check)");
        return { duplicate: true };
      }
      // Set flag immediately before async operation
      isSubmittingRef.current = true;
      
      console.log("[AdvertiserCreate] Submitting ad...");
      return await apiRequest("/api/native-ads/submit", {
        method: "POST",
        body: JSON.stringify({
          advertiserName: values.advertiserName,
          advertiserEmail: values.email,
          advertiserPhone: values.phone,
          advertiserCompany: values.company,
          advertiserId: advertiser?.id,
          title: values.title,
          description: values.description,
          imageUrl: values.imageUrl,
          destinationUrl: values.destinationUrl,
          callToAction: values.callToAction,
          targetCategories: values.targetCategories,
          startDate: values.startDate,
          endDate: values.endDate,
          dailyBudgetEnabled: values.dailyBudgetEnabled,
          dailyBudget: values.dailyBudget ? values.dailyBudget * 100 : undefined,
        }),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: (data) => {
      // Ignore if this was a prevented duplicate
      if (data?.duplicate) return;
      
      console.log("[AdvertiserCreate] Submission successful");
      // Show success overlay on preview instead of immediately transitioning
      setShowSuccessOverlay(true);
    },
    onError: (error: any) => {
      // Reset submission flag on error so user can retry
      isSubmittingRef.current = false;
      toast({
        title: "خطأ",
        description: error.message || "فشل في إرسال الإعلان",
        variant: "destructive",
      });
    },
  });

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/native-ads/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "فشل في رفع الصورة");
      }

      const data = await response.json();
      form.setValue("imageUrl", data.url);
      toast({
        title: "تم رفع الصورة",
        description: "تم رفع الصورة بنجاح",
      });
    } catch (error: any) {
      toast({
        title: "خطأ",
        description: error.message || "فشل في رفع الصورة",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const validateCurrentStep = async () => {
    let fieldsToValidate: (keyof FormValues)[] = [];
    
    switch (currentStep) {
      case 1:
        fieldsToValidate = ["advertiserName", "email", "phone"];
        break;
      case 2:
        fieldsToValidate = ["title", "imageUrl", "destinationUrl"];
        break;
      case 3:
        fieldsToValidate = ["startDate"];
        // Add daily budget validation when enabled
        const dailyBudgetEnabled = form.getValues("dailyBudgetEnabled");
        if (dailyBudgetEnabled) {
          fieldsToValidate.push("dailyBudget");
        }
        break;
    }

    const result = await form.trigger(fieldsToValidate);
    return result;
  };

  const goToNextStep = async () => {
    const isValid = await validateCurrentStep();
    if (isValid && currentStep < 4) {
      setCurrentStep(currentStep + 1);
    }
  };

  const goToPreviousStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const onSubmit = (values: FormValues) => {
    submitMutation.mutate(values);
  };

  if (isSubmitted) {
    return (
      <div dir="rtl" className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-lg w-full">
          <CardContent className="pt-12 pb-8 text-center">
            <div className="rounded-full bg-green-500/10 p-6 w-fit mx-auto mb-6">
              <CheckCircle className="h-16 w-16 text-green-500" />
            </div>
            <h1 
              className="text-2xl font-bold text-foreground mb-4"
              data-testid="text-success-title"
            >
              تم إرسال إعلانك بنجاح
            </h1>
            <p className="text-muted-foreground mb-8">
              شكراً لاختيارك سبق. سيقوم فريقنا بمراجعة إعلانك وسنتواصل معك خلال 24 ساعة.
            </p>
            <div className="flex flex-col gap-4">
              <Link href="/">
                <Button className="w-full" data-testid="button-go-home">
                  العودة للرئيسية
                </Button>
              </Link>
              <Link href="/advertise">
                <Button variant="outline" className="w-full" data-testid="button-create-another">
                  إنشاء إعلان آخر
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const imageUrl = form.watch("imageUrl");
  const formValues = form.watch();

  return (
    <div dir="rtl" className="min-h-screen bg-muted/30 py-8">
      <div className="container mx-auto px-4">
        <div className="mb-8">
          <Link href="/advertise">
            <Button variant="ghost" className="gap-2 mb-4" data-testid="button-back">
              <ArrowRight className="h-4 w-4" />
              العودة
            </Button>
          </Link>
          <h1 className="text-3xl font-bold text-foreground" data-testid="text-page-title">
            إنشاء إعلان جديد
          </h1>
          <p className="text-muted-foreground mt-2">
            أكمل الخطوات التالية لنشر إعلانك
          </p>
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          <div className="lg:w-64 flex-shrink-0">
            <Card>
              <CardContent className="pt-6">
                <nav className="space-y-2">
                  {steps.map((step) => (
                    <div
                      key={step.id}
                      className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                        currentStep === step.id
                          ? "bg-primary/10 text-primary"
                          : currentStep > step.id
                          ? "text-green-600"
                          : "text-muted-foreground"
                      }`}
                      data-testid={`step-indicator-${step.id}`}
                    >
                      <div
                        className={`rounded-full p-2 ${
                          currentStep === step.id
                            ? "bg-primary text-primary-foreground"
                            : currentStep > step.id
                            ? "bg-green-500 text-white"
                            : "bg-muted"
                        }`}
                      >
                        {currentStep > step.id ? (
                          <CheckCircle className="h-4 w-4" />
                        ) : (
                          <step.icon className="h-4 w-4" />
                        )}
                      </div>
                      <span className="font-medium">{step.title}</span>
                    </div>
                  ))}
                </nav>
              </CardContent>
            </Card>
          </div>

          <div className="flex-1">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)}>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      {(() => {
                        const StepIcon = steps[currentStep - 1].icon;
                        return StepIcon ? <StepIcon className="h-5 w-5" /> : null;
                      })()}
                      {steps[currentStep - 1].title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {currentStep === 1 && (
                      <>
                        <FormField
                          control={form.control}
                          name="advertiserName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>الاسم الكامل *</FormLabel>
                              <FormControl>
                                <div className="relative">
                                  <User className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                  <Input 
                                    {...field} 
                                    className="pr-10" 
                                    placeholder="أدخل اسمك الكامل"
                                    data-testid="input-advertiser-name"
                                  />
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="email"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>البريد الإلكتروني *</FormLabel>
                              <FormControl>
                                <div className="relative">
                                  <Mail className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                  <Input 
                                    {...field} 
                                    type="email" 
                                    className="pr-10" 
                                    placeholder="example@email.com"
                                    data-testid="input-email"
                                  />
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="phone"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>رقم الجوال *</FormLabel>
                              <FormControl>
                                <div className="relative">
                                  <Phone className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                  <Input 
                                    {...field} 
                                    className="pr-10" 
                                    placeholder="05xxxxxxxx"
                                    data-testid="input-phone"
                                  />
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="company"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>اسم الشركة (اختياري)</FormLabel>
                              <FormControl>
                                <div className="relative">
                                  <Building2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                  <Input 
                                    {...field} 
                                    className="pr-10" 
                                    placeholder="اسم شركتك أو مؤسستك"
                                    data-testid="input-company"
                                  />
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </>
                    )}

                    {currentStep === 2 && (
                      <>
                        <FormField
                          control={form.control}
                          name="title"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>عنوان الإعلان *</FormLabel>
                              <FormControl>
                                <Input 
                                  {...field} 
                                  placeholder="عنوان جذاب لإعلانك"
                                  data-testid="input-ad-title"
                                />
                              </FormControl>
                              <FormDescription>
                                {field.value?.length || 0}/100 حرف
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="description"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>وصف الإعلان (اختياري)</FormLabel>
                              <FormControl>
                                <Textarea 
                                  {...field} 
                                  placeholder="وصف مختصر لإعلانك"
                                  rows={3}
                                  data-testid="input-ad-description"
                                />
                              </FormControl>
                              <FormDescription>
                                {field.value?.length || 0}/200 حرف
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="imageUrl"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>صورة الإعلان *</FormLabel>
                              <FormControl>
                                <div className="space-y-4">
                                  {imageUrl ? (
                                    <div className="relative aspect-video rounded-lg overflow-hidden border bg-muted">
                                      <img 
                                        src={imageUrl} 
                                        alt="معاينة الإعلان" 
                                        className="w-full h-full object-cover"
                                      />
                                      <Button
                                        type="button"
                                        variant="secondary"
                                        size="sm"
                                        className="absolute bottom-2 left-2"
                                        onClick={() => form.setValue("imageUrl", "")}
                                        data-testid="button-remove-image"
                                      >
                                        تغيير الصورة
                                      </Button>
                                    </div>
                                  ) : (
                                    <label 
                                      className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-8 cursor-pointer hover:bg-muted/50 transition-colors"
                                      data-testid="upload-image-area"
                                    >
                                      {isUploading ? (
                                        <Loader2 className="h-10 w-10 text-muted-foreground animate-spin" />
                                      ) : (
                                        <>
                                          <Upload className="h-10 w-10 text-muted-foreground mb-3" />
                                          <span className="text-sm text-muted-foreground">
                                            اضغط لرفع صورة الإعلان
                                          </span>
                                          <span className="text-xs text-muted-foreground mt-1">
                                            PNG, JPG حتى 10MB
                                          </span>
                                        </>
                                      )}
                                      <input
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={handleImageUpload}
                                        disabled={isUploading}
                                        data-testid="input-image-upload"
                                      />
                                    </label>
                                  )}
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="destinationUrl"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>رابط الوجهة *</FormLabel>
                              <FormControl>
                                <div className="relative">
                                  <LinkIcon className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                  <Input 
                                    {...field} 
                                    className="pr-10" 
                                    placeholder="https://example.com"
                                    data-testid="input-destination-url"
                                  />
                                </div>
                              </FormControl>
                              <FormDescription>
                                الرابط الذي سينتقل إليه المستخدم عند النقر على الإعلان
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="callToAction"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>نص زر الإجراء</FormLabel>
                              <Select
                                value={field.value}
                                onValueChange={field.onChange}
                              >
                                <FormControl>
                                  <SelectTrigger data-testid="select-cta">
                                    <SelectValue placeholder="اختر نص الزر" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="اقرأ المزيد">اقرأ المزيد</SelectItem>
                                  <SelectItem value="تسوق الآن">تسوق الآن</SelectItem>
                                  <SelectItem value="اعرف المزيد">اعرف المزيد</SelectItem>
                                  <SelectItem value="سجل الآن">سجل الآن</SelectItem>
                                  <SelectItem value="احجز الآن">احجز الآن</SelectItem>
                                  <SelectItem value="تواصل معنا">تواصل معنا</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </>
                    )}

                    {currentStep === 3 && (
                      <>
                        <FormField
                          control={form.control}
                          name="targetCategories"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>الفئات المستهدفة (اختياري)</FormLabel>
                              <FormDescription>
                                اختر الفئات التي تريد عرض إعلانك فيها
                              </FormDescription>
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
                                {categories.map((category) => (
                                  <div
                                    key={category.id}
                                    className="flex items-center space-x-2 space-x-reverse"
                                  >
                                    <Checkbox
                                      id={category.id}
                                      checked={field.value?.includes(category.id)}
                                      onCheckedChange={(checked) => {
                                        const value = field.value || [];
                                        if (checked) {
                                          field.onChange([...value, category.id]);
                                        } else {
                                          field.onChange(value.filter((id) => id !== category.id));
                                        }
                                      }}
                                      data-testid={`checkbox-category-${category.id}`}
                                    />
                                    <Label htmlFor={category.id} className="text-sm cursor-pointer">
                                      {category.nameAr}
                                    </Label>
                                  </div>
                                ))}
                              </div>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <FormField
                            control={form.control}
                            name="startDate"
                            render={({ field }) => (
                              <FormItem className="flex flex-col">
                                <FormLabel>تاريخ البداية *</FormLabel>
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <FormControl>
                                      <Button
                                        variant="outline"
                                        className="w-full justify-start text-right font-normal"
                                        data-testid="button-start-date"
                                      >
                                        <CalendarIcon className="ml-2 h-4 w-4" />
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
                                      disabled={(date) => date < new Date()}
                                      initialFocus
                                    />
                                  </PopoverContent>
                                </Popover>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="endDate"
                            render={({ field }) => (
                              <FormItem className="flex flex-col">
                                <FormLabel>تاريخ الانتهاء (اختياري)</FormLabel>
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <FormControl>
                                      <Button
                                        variant="outline"
                                        className="w-full justify-start text-right font-normal"
                                        data-testid="button-end-date"
                                      >
                                        <CalendarIcon className="ml-2 h-4 w-4" />
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
                                      selected={field.value || undefined}
                                      onSelect={field.onChange}
                                      disabled={(date) => {
                                        const startDate = form.getValues("startDate");
                                        return date < (startDate || new Date());
                                      }}
                                      initialFocus
                                    />
                                  </PopoverContent>
                                </Popover>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <div className="space-y-4 pt-4 border-t">
                          <FormField
                            control={form.control}
                            name="dailyBudgetEnabled"
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-start space-x-3 space-x-reverse rtl:space-x-reverse">
                                <FormControl>
                                  <Checkbox
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                    data-testid="checkbox-daily-budget-enabled"
                                  />
                                </FormControl>
                                <div className="space-y-1 leading-none">
                                  <FormLabel className="cursor-pointer">
                                    تفعيل حد الميزانية اليومية
                                  </FormLabel>
                                  <FormDescription>
                                    سيتوقف عرض الإعلان تلقائياً عند الوصول للحد اليومي
                                  </FormDescription>
                                </div>
                              </FormItem>
                            )}
                          />

                          {form.watch("dailyBudgetEnabled") && (
                            <FormField
                              control={form.control}
                              name="dailyBudget"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>الميزانية اليومية (ريال) *</FormLabel>
                                  <FormControl>
                                    <Input
                                      type="number"
                                      min={10}
                                      step={1}
                                      placeholder="مثال: 100"
                                      value={field.value === undefined || field.value === null ? "" : field.value}
                                      onChange={(e) => {
                                        const rawValue = e.target.value;
                                        if (rawValue === "" || rawValue === null) {
                                          field.onChange(undefined);
                                        } else {
                                          const numValue = parseFloat(rawValue);
                                          if (!isNaN(numValue)) {
                                            field.onChange(numValue);
                                          }
                                        }
                                      }}
                                      data-testid="input-daily-budget"
                                    />
                                  </FormControl>
                                  <FormDescription>
                                    الحد الأدنى 10 ريال. الميزانية تُحتسب على النقرات فقط.
                                  </FormDescription>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          )}
                        </div>
                      </>
                    )}

                    {currentStep === 4 && (
                      <div className="space-y-6">
                        {showSuccessOverlay ? (
                          <div className="flex flex-col items-center justify-center rounded-lg p-8 text-center bg-background border min-h-[400px]">
                            <div className="rounded-full bg-green-500/10 p-6 mb-6">
                              <CheckCircle className="h-16 w-16 text-green-500" />
                            </div>
                            <h3 className="text-xl font-bold text-foreground mb-2" data-testid="text-overlay-success">
                              تم إرسال الإعلان بنجاح!
                            </h3>
                            <p className="text-muted-foreground mb-6 max-w-sm">
                              سيقوم فريقنا بمراجعة إعلانك وسنتواصل معك خلال 24 ساعة
                            </p>
                            <div className="flex flex-col sm:flex-row gap-3">
                              <Button 
                                onClick={() => setIsSubmitted(true)}
                                className="gap-2"
                                data-testid="button-finish"
                              >
                                <CheckCircle className="h-4 w-4" />
                                إنهاء
                              </Button>
                              <Link href="/advertise">
                                <Button variant="outline" className="gap-2" data-testid="button-create-another-overlay">
                                  إنشاء إعلان آخر
                                </Button>
                              </Link>
                            </div>
                          </div>
                        ) : (
                        <>
                        <div className="bg-muted/50 rounded-lg p-6">
                          <h3 className="font-semibold mb-4 flex items-center gap-2">
                            <User className="h-5 w-5" />
                            معلومات المعلن
                          </h3>
                          <dl className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                            <div>
                              <dt className="text-muted-foreground">الاسم</dt>
                              <dd className="font-medium" data-testid="preview-name">{formValues.advertiserName}</dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">البريد الإلكتروني</dt>
                              <dd className="font-medium" data-testid="preview-email">{formValues.email}</dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">رقم الجوال</dt>
                              <dd className="font-medium" data-testid="preview-phone">{formValues.phone}</dd>
                            </div>
                            {formValues.company && (
                              <div>
                                <dt className="text-muted-foreground">الشركة</dt>
                                <dd className="font-medium" data-testid="preview-company">{formValues.company}</dd>
                              </div>
                            )}
                          </dl>
                        </div>

                        <div className="bg-muted/50 rounded-lg p-6">
                          <h3 className="font-semibold mb-4 flex items-center gap-2">
                            <FileText className="h-5 w-5" />
                            معاينة الإعلان كما سيظهر للزوار
                          </h3>
                          <p className="text-xs text-muted-foreground mb-4">
                            هكذا سيظهر إعلانك على الموقع. يتم اقتصاص الصورة تلقائياً لتناسب الإطار.
                          </p>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Desktop Preview */}
                            <div>
                              <span className="text-xs text-muted-foreground mb-2 block">📱 نسخة سطح المكتب</span>
                              <div className="border rounded-lg overflow-hidden bg-card max-w-[280px]">
                                {formValues.imageUrl && (
                                  <div className="aspect-video overflow-hidden bg-muted">
                                    <img 
                                      src={formValues.imageUrl} 
                                      alt={formValues.title}
                                      className="w-full h-full object-cover"
                                    />
                                  </div>
                                )}
                                <div className="p-3 space-y-2">
                                  <h4 className="font-semibold text-sm line-clamp-2 leading-relaxed" data-testid="preview-ad-title">
                                    {formValues.title}
                                  </h4>
                                  {formValues.description && (
                                    <p className="text-xs text-muted-foreground line-clamp-2" data-testid="preview-ad-description">
                                      {formValues.description}
                                    </p>
                                  )}
                                  <Button type="button" size="sm" variant="secondary" className="w-full justify-center gap-2 pointer-events-none" data-testid="preview-cta-button">
                                    <span>{formValues.callToAction || "المزيد"}</span>
                                    <ArrowLeft className="h-4 w-4" />
                                  </Button>
                                  <div className="flex items-center gap-1 text-xs text-muted-foreground pt-1">
                                    <span className="flex items-center gap-1">
                                      <ArrowLeft className="h-3 w-3" />
                                      {formValues.advertiserName || "اسم المعلن"}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Mobile Preview */}
                            <div>
                              <span className="text-xs text-muted-foreground mb-2 block">📲 نسخة الجوال</span>
                              <div className="rounded-lg overflow-hidden bg-card border border-border/50 max-w-[180px]">
                                {formValues.imageUrl && (
                                  <div className="aspect-[16/10] overflow-hidden bg-muted">
                                    <img 
                                      src={formValues.imageUrl} 
                                      alt={formValues.title}
                                      className="w-full h-full object-cover"
                                    />
                                  </div>
                                )}
                                <div className="p-2.5 space-y-1.5">
                                  <h4 className="text-sm font-semibold text-foreground line-clamp-2 leading-snug">
                                    {formValues.title}
                                  </h4>
                                  {formValues.description && (
                                    <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                                      {formValues.description}
                                    </p>
                                  )}
                                  <div className="flex items-center justify-between pt-1">
                                    <span className="text-[10px] text-muted-foreground/70">
                                      {formValues.advertiserName || "اسم المعلن"}
                                    </span>
                                    <span className="text-[10px] text-primary/80 flex items-center gap-0.5">
                                      {formValues.callToAction || "المزيد"}
                                      <ArrowLeft className="h-2.5 w-2.5" />
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="bg-muted/50 rounded-lg p-6">
                          <h3 className="font-semibold mb-4 flex items-center gap-2">
                            <Target className="h-5 w-5" />
                            معلومات الاستهداف
                          </h3>
                          <dl className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                            <div>
                              <dt className="text-muted-foreground">تاريخ البداية</dt>
                              <dd className="font-medium" data-testid="preview-start-date">
                                {formValues.startDate 
                                  ? format(formValues.startDate, "PPP", { locale: ar })
                                  : "-"
                                }
                              </dd>
                            </div>
                            <div>
                              <dt className="text-muted-foreground">تاريخ الانتهاء</dt>
                              <dd className="font-medium" data-testid="preview-end-date">
                                {formValues.endDate 
                                  ? format(formValues.endDate, "PPP", { locale: ar })
                                  : "غير محدد"
                                }
                              </dd>
                            </div>
                            <div className="md:col-span-2">
                              <dt className="text-muted-foreground">الفئات المستهدفة</dt>
                              <dd className="font-medium" data-testid="preview-categories">
                                {formValues.targetCategories && formValues.targetCategories.length > 0
                                  ? categories
                                      .filter((c) => formValues.targetCategories?.includes(c.id))
                                      .map((c) => c.nameAr)
                                      .join("، ")
                                  : "جميع الفئات"
                                }
                              </dd>
                            </div>
                          </dl>
                        </div>
                        </>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <div className="flex items-center justify-between mt-6">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={goToPreviousStep}
                    disabled={currentStep === 1}
                    className="gap-2"
                    data-testid="button-previous"
                  >
                    <ArrowRight className="h-4 w-4" />
                    السابق
                  </Button>

                  {currentStep < 4 ? (
                    <Button
                      type="button"
                      onClick={goToNextStep}
                      className="gap-2"
                      data-testid="button-next"
                    >
                      التالي
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button
                      type="submit"
                      disabled={submitMutation.isPending}
                      className="gap-2"
                      data-testid="button-submit"
                    >
                      {submitMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          جاري الإرسال...
                        </>
                      ) : (
                        <>
                          <CheckCircle className="h-4 w-4" />
                          إرسال الإعلان
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </form>
            </Form>
          </div>
        </div>
      </div>
    </div>
  );
}
