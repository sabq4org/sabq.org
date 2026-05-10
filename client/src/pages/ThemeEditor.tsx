import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Save, X, Palette, Calendar as CalendarIcon, Image as ImageIcon } from "lucide-react";
import type { Theme } from "@shared/schema";

// Form validation schema
const themeFormSchema = z.object({
  name: z.string().min(2, "الاسم مطلوب ويجب أن يكون حرفين على الأقل"),
  slug: z.string()
    .min(2, "الرمز مطلوب")
    .regex(/^[a-z0-9-]+$/, "الرمز يجب أن يحتوي على حروف إنجليزية صغيرة وأرقام وشرطات فقط"),
  priority: z.number().int().min(0).max(9999).default(5),
  status: z.enum(["draft", "review", "scheduled", "active", "expired", "disabled"]),
  isDefault: z.boolean().default(false),
  applyTo: z.array(z.string()).default([]),
  startAt: z.string().optional().nullable(),
  endAt: z.string().optional().nullable(),
  colors: z.object({
    primary: z.string().optional(),
    primaryForeground: z.string().optional(),
    secondary: z.string().optional(),
    secondaryForeground: z.string().optional(),
    background: z.string().optional(),
    foreground: z.string().optional(),
    accent: z.string().optional(),
    accentForeground: z.string().optional(),
  }).optional(),
  assets: z.object({
    logoLight: z.string().optional(),
    logoDark: z.string().optional(),
    favicon: z.string().optional(),
  }).optional(),
}).refine((data) => {
  // Validate that end date is after start date
  if (data.startAt && data.endAt) {
    return new Date(data.endAt) > new Date(data.startAt);
  }
  return true;
}, {
  message: "تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية",
  path: ["endAt"],
});

type ThemeFormData = z.infer<typeof themeFormSchema>;

// Utility functions for HSL/Hex conversion
function hexToHsl(hex: string): string {
  if (!hex || hex.length !== 7) return "";
  
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function hslToHex(hsl: string): string {
  if (!hsl) return "#000000";
  
  const parts = hsl.match(/(\d+)\s+(\d+)%\s+(\d+)%/);
  if (!parts) return "#000000";
  
  const h = parseInt(parts[1]) / 360;
  const s = parseInt(parts[2]) / 100;
  const l = parseInt(parts[3]) / 100;
  
  // HSL to RGB conversion
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  
  const r = Math.round(hue2rgb(p, q, h + 1/3) * 255);
  const g = Math.round(hue2rgb(p, q, h) * 255);
  const b = Math.round(hue2rgb(p, q, h - 1/3) * 255);
  
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// ColorPickerField component
function ColorPickerField({ 
  value, 
  onChange, 
  label, 
  placeholder,
  testId 
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder: string;
  testId: string;
}) {
  const [hexValue, setHexValue] = useState(hslToHex(value));
  
  useEffect(() => {
    setHexValue(hslToHex(value));
  }, [value]);
  
  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const hex = e.target.value;
    setHexValue(hex);
    onChange(hexToHsl(hex));
  };
  
  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const hsl = e.target.value;
    onChange(hsl);
    setHexValue(hslToHex(hsl));
  };
  
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input
          type="text"
          value={value || ""}
          onChange={handleTextChange}
          placeholder={placeholder}
          className="flex-1"
          data-testid={testId}
        />
        <Input
          type="color"
          value={hexValue}
          onChange={handleColorChange}
          className="w-[60px] h-10 p-1 cursor-pointer"
          data-testid={`${testId}-picker`}
        />
      </div>
    </div>
  );
}

export default function ThemeEditor() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const isNewTheme = id === "new";

  const form = useForm<ThemeFormData>({
    resolver: zodResolver(themeFormSchema),
    defaultValues: {
      name: "",
      slug: "",
      priority: 5,
      status: "draft",
      isDefault: false,
      applyTo: [],
      startAt: null,
      endAt: null,
      colors: {
        primary: "",
        primaryForeground: "",
        secondary: "",
        secondaryForeground: "",
        background: "",
        foreground: "",
        accent: "",
        accentForeground: "",
      },
      assets: {
        logoLight: "",
        logoDark: "",
        favicon: "",
      },
    },
  });

  // Fetch theme data if editing
  const { data: theme, isLoading: isLoadingTheme, error: themeError } = useQuery<Theme>({
    queryKey: ["/api/themes", id],
    enabled: !isNewTheme,
  });

  // Auto-generate slug from name
  const watchName = form.watch("name");
  useEffect(() => {
    if (isNewTheme && watchName) {
      const generatedSlug = watchName
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^\u0600-\u06FFa-z0-9-]/g, "");
      form.setValue("slug", generatedSlug);
    }
  }, [watchName, isNewTheme, form]);

  // Populate form when theme data is loaded
  useEffect(() => {
    if (theme && !isNewTheme) {
      form.reset({
        name: theme.name,
        slug: theme.slug,
        priority: theme.priority,
        status: theme.status as any,
        isDefault: theme.isDefault,
        applyTo: theme.applyTo || [],
        startAt: theme.startAt ? new Date(theme.startAt).toISOString().slice(0, 16) : null,
        endAt: theme.endAt ? new Date(theme.endAt).toISOString().slice(0, 16) : null,
        colors: {
          primary: theme.tokens?.colors?.primary || "",
          primaryForeground: theme.tokens?.colors?.primaryForeground || "",
          secondary: theme.tokens?.colors?.secondary || "",
          secondaryForeground: theme.tokens?.colors?.secondaryForeground || "",
          background: theme.tokens?.colors?.background || "",
          foreground: theme.tokens?.colors?.foreground || "",
          accent: theme.tokens?.colors?.accent || "",
          accentForeground: theme.tokens?.colors?.accentForeground || "",
        },
        assets: {
          logoLight: theme.assets?.logoLight || "",
          logoDark: theme.assets?.logoDark || "",
          favicon: theme.assets?.favicon || "",
        },
      });
    }
  }, [theme, isNewTheme, form]);

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: ThemeFormData) => {
      const payload = {
        name: data.name,
        slug: data.slug,
        priority: data.priority,
        status: data.status,
        isDefault: data.isDefault,
        applyTo: data.applyTo,
        startAt: data.startAt && data.startAt.trim() !== '' ? data.startAt : null,
        endAt: data.endAt && data.endAt.trim() !== '' ? data.endAt : null,
        tokens: {
          colors: {
            primary: data.colors?.primary || undefined,
            primaryForeground: data.colors?.primaryForeground || undefined,
            secondary: data.colors?.secondary || undefined,
            secondaryForeground: data.colors?.secondaryForeground || undefined,
            background: data.colors?.background || undefined,
            foreground: data.colors?.foreground || undefined,
            accent: data.colors?.accent || undefined,
            accentForeground: data.colors?.accentForeground || undefined,
          },
        },
        assets: {
          logoLight: data.assets?.logoLight || undefined,
          logoDark: data.assets?.logoDark || undefined,
          favicon: data.assets?.favicon || undefined,
        },
      };
      return await apiRequest("/api/themes", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/themes"] });
      toast({
        title: "تم الإنشاء بنجاح",
        description: "تم إنشاء السمة الجديدة بنجاح",
      });
      setLocation("/dashboard/themes");
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في إنشاء السمة",
        variant: "destructive",
      });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (data: ThemeFormData) => {
      const payload = {
        name: data.name,
        slug: data.slug,
        priority: data.priority,
        status: data.status,
        isDefault: data.isDefault,
        applyTo: data.applyTo,
        startAt: data.startAt && data.startAt.trim() !== '' ? data.startAt : null,
        endAt: data.endAt && data.endAt.trim() !== '' ? data.endAt : null,
        tokens: {
          colors: {
            primary: data.colors?.primary || undefined,
            primaryForeground: data.colors?.primaryForeground || undefined,
            secondary: data.colors?.secondary || undefined,
            secondaryForeground: data.colors?.secondaryForeground || undefined,
            background: data.colors?.background || undefined,
            foreground: data.colors?.foreground || undefined,
            accent: data.colors?.accent || undefined,
            accentForeground: data.colors?.accentForeground || undefined,
          },
        },
        assets: {
          logoLight: data.assets?.logoLight || undefined,
          logoDark: data.assets?.logoDark || undefined,
          favicon: data.assets?.favicon || undefined,
        },
      };
      return await apiRequest(`/api/themes/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/themes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/themes", id] });
      toast({
        title: "تم التحديث بنجاح",
        description: "تم تحديث السمة بنجاح",
      });
      setLocation("/dashboard/themes");
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في تحديث السمة",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ThemeFormData) => {
    if (isNewTheme) {
      createMutation.mutate(data);
    } else {
      updateMutation.mutate(data);
    }
  };

  // Handle 404 error
  if (themeError && !isNewTheme) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold text-destructive mb-4" data-testid="text-error">
            السمة غير موجودة
          </h2>
          <p className="text-muted-foreground mb-6">
            لم نتمكن من العثور على السمة المطلوبة
          </p>
          <Button onClick={() => setLocation("/dashboard/themes")} data-testid="button-back">
            العودة للقائمة
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  // Loading state
  if (isLoadingTheme && !isNewTheme) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">جاري التحميل...</p>
        </div>
      </DashboardLayout>
    );
  }

  const watchedValues = form.watch();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold" data-testid="heading-theme-editor">
              {isNewTheme ? "إنشاء سمة جديدة" : "تعديل السمة"}
            </h1>
            <p className="text-muted-foreground mt-2">
              {isNewTheme ? "إنشاء سمة جديدة للمنصة" : "تعديل بيانات السمة"}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setLocation("/dashboard/themes")}
              data-testid="button-cancel"
            >
              <X className="h-4 w-4 ml-2" />
              إلغاء
            </Button>
            <Button
              onClick={form.handleSubmit(onSubmit)}
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-save"
            >
              <Save className="h-4 w-4 ml-2" />
              {createMutation.isPending || updateMutation.isPending ? "جاري الحفظ..." : "حفظ"}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[70%_30%] gap-6">
          {/* Main Content */}
          <div className="space-y-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                {/* Basic Info Section */}
                <Card>
                  <CardHeader>
                    <CardTitle>المعلومات الأساسية</CardTitle>
                    <CardDescription>البيانات الأساسية للسمة</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>الاسم *</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="اسم السمة بالعربية"
                              {...field}
                              data-testid="input-name"
                              className="text-right"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="slug"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>الرمز *</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="theme-slug"
                              {...field}
                              data-testid="input-slug"
                            />
                          </FormControl>
                          <FormDescription>
                            يتم توليده تلقائياً من الاسم، أو أدخله يدوياً
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="priority"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>الأولوية</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                {...field}
                                onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                                data-testid="input-priority"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="status"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>الحالة</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-status">
                                  <SelectValue placeholder="اختر الحالة" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="draft" data-testid="option-draft">مسودة</SelectItem>
                                <SelectItem value="review" data-testid="option-review">قيد المراجعة</SelectItem>
                                <SelectItem value="scheduled" data-testid="option-scheduled">مجدولة</SelectItem>
                                <SelectItem value="active" data-testid="option-active">نشطة</SelectItem>
                                <SelectItem value="expired" data-testid="option-expired">منتهية</SelectItem>
                                <SelectItem value="disabled" data-testid="option-disabled">معطلة</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="isDefault"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                          <div className="space-y-0.5">
                            <FormLabel className="text-base">سمة افتراضية</FormLabel>
                            <FormDescription>
                              جعل هذه السمة افتراضية للمنصة
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-is-default"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="applyTo"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>نطاق التطبيق</FormLabel>
                          <div className="space-y-2">
                            <div className="flex flex-wrap gap-2">
                              {["site_full", "homepage_only", "articles_only", "dashboard_only"].map((scope) => (
                                <Badge
                                  key={scope}
                                  variant={field.value?.includes(scope) ? "default" : "outline"}
                                  className="cursor-pointer"
                                  onClick={() => {
                                    const current = field.value || [];
                                    if (current.includes(scope)) {
                                      field.onChange(current.filter((s) => s !== scope));
                                    } else {
                                      field.onChange([...current, scope]);
                                    }
                                  }}
                                  data-testid={`badge-scope-${scope}`}
                                >
                                  {scope === "site_full" && "الموقع بالكامل"}
                                  {scope === "homepage_only" && "الصفحة الرئيسية فقط"}
                                  {scope === "articles_only" && "المقالات فقط"}
                                  {scope === "dashboard_only" && "لوحة التحكم فقط"}
                                </Badge>
                              ))}
                            </div>
                          </div>
                          <FormDescription>
                            اختر النطاق الذي تريد تطبيق السمة عليه
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                {/* Dates Section */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CalendarIcon className="h-5 w-5" />
                      التواريخ
                    </CardTitle>
                    <CardDescription>تحديد فترة تفعيل السمة</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="startAt"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>تاريخ البداية</FormLabel>
                            <FormControl>
                              <Input
                                type="datetime-local"
                                {...field}
                                value={field.value || ""}
                                data-testid="input-start-date"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="endAt"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>تاريخ الانتهاء</FormLabel>
                            <FormControl>
                              <Input
                                type="datetime-local"
                                {...field}
                                value={field.value || ""}
                                data-testid="input-end-date"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Colors Section */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Palette className="h-5 w-5" />
                      الألوان
                    </CardTitle>
                    <CardDescription>ألوان السمة بصيغة HSL (مثال: 150 100% 22%)</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="colors.primary"
                        render={({ field }) => (
                          <FormItem>
                            <ColorPickerField
                              value={field.value || ""}
                              onChange={field.onChange}
                              label="اللون الأساسي"
                              placeholder="150 100% 22%"
                              testId="input-color-primary"
                            />
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="colors.primaryForeground"
                        render={({ field }) => (
                          <FormItem>
                            <ColorPickerField
                              value={field.value || ""}
                              onChange={field.onChange}
                              label="لون النص الأساسي"
                              placeholder="0 0% 100%"
                              testId="input-color-primary-foreground"
                            />
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="colors.secondary"
                        render={({ field }) => (
                          <FormItem>
                            <ColorPickerField
                              value={field.value || ""}
                              onChange={field.onChange}
                              label="اللون الثانوي"
                              placeholder="210 40% 96%"
                              testId="input-color-secondary"
                            />
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="colors.secondaryForeground"
                        render={({ field }) => (
                          <FormItem>
                            <ColorPickerField
                              value={field.value || ""}
                              onChange={field.onChange}
                              label="لون النص الثانوي"
                              placeholder="222 47% 11%"
                              testId="input-color-secondary-foreground"
                            />
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="colors.background"
                        render={({ field }) => (
                          <FormItem>
                            <ColorPickerField
                              value={field.value || ""}
                              onChange={field.onChange}
                              label="لون الخلفية"
                              placeholder="0 0% 100%"
                              testId="input-color-background"
                            />
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="colors.foreground"
                        render={({ field }) => (
                          <FormItem>
                            <ColorPickerField
                              value={field.value || ""}
                              onChange={field.onChange}
                              label="لون النص الرئيسي"
                              placeholder="222 47% 11%"
                              testId="input-color-foreground"
                            />
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="colors.accent"
                        render={({ field }) => (
                          <FormItem>
                            <ColorPickerField
                              value={field.value || ""}
                              onChange={field.onChange}
                              label="لون التأكيد"
                              placeholder="210 40% 96%"
                              testId="input-color-accent"
                            />
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="colors.accentForeground"
                        render={({ field }) => (
                          <FormItem>
                            <ColorPickerField
                              value={field.value || ""}
                              onChange={field.onChange}
                              label="لون نص التأكيد"
                              placeholder="222 47% 11%"
                              testId="input-color-accent-foreground"
                            />
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Assets Section */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <ImageIcon className="h-5 w-5" />
                      الأصول
                    </CardTitle>
                    <CardDescription>روابط الشعارات والأيقونات</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <FormField
                      control={form.control}
                      name="assets.logoLight"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>الشعار (وضع فاتح)</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="https://example.com/logo-light.png"
                              {...field}
                              data-testid="input-logo-light"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="assets.logoDark"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>الشعار (وضع داكن)</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="https://example.com/logo-dark.png"
                              {...field}
                              data-testid="input-logo-dark"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="assets.favicon"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>الأيقونة المصغرة (Favicon)</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="https://example.com/favicon.ico"
                              {...field}
                              data-testid="input-favicon"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>
              </form>
            </Form>
          </div>

          {/* Preview Panel */}
          <div className="space-y-4">
            <Card className="sticky top-4">
              <CardHeader>
                <CardTitle>معاينة السمة</CardTitle>
                <CardDescription>معاينة مباشرة للسمة</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Theme Name and Status */}
                <div>
                  <Label className="text-sm text-muted-foreground">الاسم</Label>
                  <p className="font-semibold" data-testid="preview-name">
                    {watchedValues.name || "غير محدد"}
                  </p>
                </div>

                <Separator />

                <div>
                  <Label className="text-sm text-muted-foreground">الحالة</Label>
                  <div className="mt-1">
                    <Badge data-testid="preview-status">
                      {watchedValues.status === "draft" && "مسودة"}
                      {watchedValues.status === "review" && "قيد المراجعة"}
                      {watchedValues.status === "scheduled" && "مجدولة"}
                      {watchedValues.status === "active" && "نشطة"}
                      {watchedValues.status === "expired" && "منتهية"}
                      {watchedValues.status === "disabled" && "معطلة"}
                    </Badge>
                  </div>
                </div>

                <Separator />

                {/* Color Preview */}
                <div>
                  <Label className="text-sm text-muted-foreground mb-3 block">معاينة الألوان</Label>
                  <div className="space-y-2">
                    {watchedValues.colors?.primary && (
                      <div className="flex items-center gap-2">
                        <div
                          className="w-10 h-10 rounded border"
                          style={{ backgroundColor: `hsl(${watchedValues.colors.primary})` }}
                          data-testid="preview-color-primary"
                        />
                        <div>
                          <p className="text-sm font-medium">أساسي</p>
                          <p className="text-xs text-muted-foreground">{watchedValues.colors.primary}</p>
                        </div>
                      </div>
                    )}
                    
                    {watchedValues.colors?.secondary && (
                      <div className="flex items-center gap-2">
                        <div
                          className="w-10 h-10 rounded border"
                          style={{ backgroundColor: `hsl(${watchedValues.colors.secondary})` }}
                          data-testid="preview-color-secondary"
                        />
                        <div>
                          <p className="text-sm font-medium">ثانوي</p>
                          <p className="text-xs text-muted-foreground">{watchedValues.colors.secondary}</p>
                        </div>
                      </div>
                    )}

                    {watchedValues.colors?.accent && (
                      <div className="flex items-center gap-2">
                        <div
                          className="w-10 h-10 rounded border"
                          style={{ backgroundColor: `hsl(${watchedValues.colors.accent})` }}
                          data-testid="preview-color-accent"
                        />
                        <div>
                          <p className="text-sm font-medium">تأكيد</p>
                          <p className="text-xs text-muted-foreground">{watchedValues.colors.accent}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <Separator />

                {/* Logo Preview */}
                {(watchedValues.assets?.logoLight || watchedValues.assets?.logoDark) && (
                  <div>
                    <Label className="text-sm text-muted-foreground mb-3 block">معاينة الشعار</Label>
                    <div className="space-y-3">
                      {watchedValues.assets?.logoLight && (
                        <div className="p-4 border rounded bg-white">
                          <img
                            src={watchedValues.assets.logoLight}
                            alt="Logo Light"
                            className="max-h-12 object-contain"
                            data-testid="preview-logo-light"
                            onError={(e) => {
                              e.currentTarget.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='40'%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23999'%3ELogo%3C/text%3E%3C/svg%3E";
                            }}
                          />
                        </div>
                      )}
                      {watchedValues.assets?.logoDark && (
                        <div className="p-4 border rounded bg-gray-900">
                          <img
                            src={watchedValues.assets.logoDark}
                            alt="Logo Dark"
                            className="max-h-12 object-contain"
                            data-testid="preview-logo-dark"
                            onError={(e) => {
                              e.currentTarget.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='40'%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23999'%3ELogo%3C/text%3E%3C/svg%3E";
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
