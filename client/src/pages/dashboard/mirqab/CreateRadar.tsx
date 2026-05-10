import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, Save, X, Plus, Trash2, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { MirqabEntryWithDetails } from "@shared/schema";
import { ObjectUploader } from "@/components/ObjectUploader";

// Alert schema
const alertSchema = z.object({
  title: z.string().min(3, "العنوان يجب أن يكون 3 أحرف على الأقل"),
  description: z.string().min(10, "الوصف يجب أن يكون 10 أحرف على الأقل"),
  importance: z.enum(["high", "medium", "low"]),
  category: z.string().optional(),
  data: z.string().optional(), // JSON string
});

// Form schema
const formSchema = z.object({
  // Entry fields
  title: z.string().min(3, "العنوان يجب أن يكون 3 أحرف على الأقل"),
  status: z.enum(["draft", "scheduled", "published", "archived"]),
  scheduledAt: z.string().optional(),
  tags: z.array(z.string()).optional(),
  featuredImageUrl: z.string().optional(),
  
  // Radar fields
  reportDate: z.string().min(1, "تاريخ التقرير مطلوب"),
  summary: z.string().min(10, "ملخص اليوم يجب أن يكون 10 أحرف على الأقل"),
  alerts: z.array(alertSchema).min(1, "يجب إضافة تنبيه واحد على الأقل"),
  
  // SEO
  seoTitle: z.string().max(70, "عنوان SEO يجب ألا يتجاوز 70 حرف").optional(),
  seoDescription: z.string().max(160, "وصف SEO يجب ألا يتجاوز 160 حرف").optional(),
  seoKeywords: z.array(z.string()).optional(),
});

type FormData = z.infer<typeof formSchema>;

export default function CreateRadar() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/dashboard/mirqab/radar/:id/edit");
  const isEdit = !!params?.id;
  const { toast } = useToast();
  const [seoOpen, setSeoOpen] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  // Fetch existing entry if editing
  const { data: entry } = useQuery<MirqabEntryWithDetails>({
    queryKey: ['/api/mirqab/entries', params?.id],
    enabled: isEdit && !!params?.id,
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      status: "draft",
      scheduledAt: "",
      tags: [],
      featuredImageUrl: "",
      reportDate: new Date().toISOString().slice(0, 10),
      summary: "",
      alerts: [
        { title: "", description: "", importance: "medium", category: "", data: "" }
      ],
      seoTitle: "",
      seoDescription: "",
      seoKeywords: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "alerts",
  });

  // Populate form when editing
  useEffect(() => {
    if (entry && entry.radarAlert) {
      const alerts = entry.radarAlert.alerts?.map(alert => ({
        title: alert.title,
        description: alert.description,
        importance: alert.importance as "high" | "medium" | "low",
        category: alert.category || "",
        data: alert.data ? JSON.stringify(alert.data, null, 2) : "",
      })) || [];

      form.reset({
        title: entry.title,
        status: entry.status as any,
        scheduledAt: entry.scheduledAt ? new Date(entry.scheduledAt).toISOString().slice(0, 16) : "",
        tags: entry.tags || [],
        featuredImageUrl: entry.featuredImageUrl || "",
        reportDate: new Date(entry.radarAlert.reportDate).toISOString().slice(0, 10),
        summary: entry.radarAlert.summary,
        alerts: alerts.length > 0 ? alerts : [{ title: "", description: "", importance: "medium", category: "", data: "" }],
        seoTitle: entry.seo?.metaTitle || "",
        seoDescription: entry.seo?.metaDescription || "",
        seoKeywords: entry.seo?.keywords || [],
      });
    }
  }, [entry, form]);

  const createMutation = useMutation({
    mutationFn: async (data: FormData) => {
      // Parse alert data
      const alerts = data.alerts.map(alert => {
        let parsedData = null;
        if (alert.data) {
          try {
            parsedData = JSON.parse(alert.data);
          } catch (error) {
            throw new Error(`بيانات التنبيه "${alert.title}" غير صحيحة (JSON غير صالح)`);
          }
        }
        return {
          title: alert.title,
          description: alert.description,
          importance: alert.importance,
          category: alert.category || undefined,
          data: parsedData,
        };
      });

      const payload = {
        entry: {
          entryType: 'radar',
          title: data.title,
          slug: `${data.title.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
          status: data.status,
          visibility: 'public',
          scheduledAt: data.scheduledAt || null,
          tags: data.tags || [],
          featuredImageUrl: data.featuredImageUrl || null,
          seo: {
            metaTitle: data.seoTitle || null,
            metaDescription: data.seoDescription || null,
            keywords: data.seoKeywords || [],
          },
        },
        radarData: {
          reportDate: data.reportDate,
          summary: data.summary,
          alerts: alerts,
        },
      };

      if (isEdit && params?.id) {
        await apiRequest(`/api/mirqab/radar/${params.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
          headers: { 'Content-Type': 'application/json' },
        });
      } else {
        await apiRequest('/api/mirqab/radar', {
          method: 'POST',
          body: JSON.stringify(payload),
          headers: { 'Content-Type': 'application/json' },
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/mirqab/entries'] });
      toast({
        title: isEdit ? "تم التحديث" : "تم الإنشاء",
        description: isEdit ? "تم تحديث التقرير بنجاح" : "تم إنشاء التقرير بنجاح",
      });
      navigate("/dashboard/mirqab");
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في حفظ التقرير",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FormData) => {
    createMutation.mutate(data);
  };

  const addTag = () => {
    if (tagInput.trim()) {
      const currentTags = form.getValues("tags") || [];
      form.setValue("tags", [...currentTags, tagInput.trim()]);
      setTagInput("");
    }
  };

  const removeTag = (index: number) => {
    const currentTags = form.getValues("tags") || [];
    form.setValue("tags", currentTags.filter((_, i) => i !== index));
  };

  const addSeoKeyword = (keyword: string) => {
    if (keyword.trim()) {
      const currentKeywords = form.getValues("seoKeywords") || [];
      form.setValue("seoKeywords", [...currentKeywords, keyword.trim()]);
    }
  };

  const removeSeoKeyword = (index: number) => {
    const currentKeywords = form.getValues("seoKeywords") || [];
    form.setValue("seoKeywords", currentKeywords.filter((_, i) => i !== index));
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold" data-testid="heading-title">
            {isEdit ? "تعديل تقرير رادار" : "إنشاء تقرير رادار"}
          </h1>
          <p className="text-muted-foreground" data-testid="text-description">
            {isEdit ? "تحديث بيانات التقرير" : "إضافة تقرير جديد للمرقاب"}
          </p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Basic Information */}
            <Card>
              <CardHeader>
                <CardTitle>المعلومات الأساسية</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>العنوان</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="عنوان التقرير" data-testid="input-title" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="reportDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>تاريخ التقرير</FormLabel>
                      <FormControl>
                        <Input 
                          type="date" 
                          {...field} 
                          data-testid="input-report-date"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="summary"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>ملخص اليوم</FormLabel>
                      <FormControl>
                        <Textarea 
                          {...field} 
                          placeholder="ملخص شامل لأبرز أحداث اليوم" 
                          rows={4}
                          data-testid="textarea-summary"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="featuredImageUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>الصورة المميزة</FormLabel>
                      <FormControl>
                        <div className="space-y-4">
                          <ObjectUploader
                            maxNumberOfFiles={1}
                            maxFileSize={10485760}
                            allowedFileTypes={['.jpg', '.jpeg', '.png', '.gif', '.webp']}
                            onGetUploadParameters={async () => {
                              const uploadData = await apiRequest("/api/objects/upload", {
                                method: "POST",
                              }) as { uploadURL: string };
                              return {
                                method: "PUT" as const,
                                url: uploadData.uploadURL,
                              };
                            }}
                            onComplete={async (result) => {
                              if (result.successful && result.successful.length > 0) {
                                const uploadedFile = result.successful[0];
                                const fileUrl = uploadedFile.uploadURL?.split('?')[0];
                                
                                try {
                                  const aclData = await apiRequest("/api/article-images", {
                                    method: "PUT",
                                    body: JSON.stringify({ imageURL: fileUrl }),
                                    headers: {
                                      "Content-Type": "application/json",
                                    },
                                  }) as { objectPath: string };

                                  form.setValue("featuredImageUrl", aclData.objectPath);
                                  toast({
                                    title: "تم رفع الصورة بنجاح",
                                    description: "تم إضافة الصورة المميزة",
                                  });
                                } catch (error) {
                                  toast({
                                    title: "خطأ",
                                    description: "فشل معالجة الصورة",
                                    variant: "destructive",
                                  });
                                }
                              }
                            }}
                            variant="outline"
                            size="default"
                          >
                            <Upload className="w-4 h-4 ml-2" />
                            رفع صورة
                          </ObjectUploader>

                          {field.value && (
                            <div className="relative">
                              <img 
                                src={field.value} 
                                alt="Featured" 
                                className="max-w-full h-auto rounded-lg border max-h-64 object-cover"
                                data-testid="img-featured-preview"
                              />
                              <Button
                                type="button"
                                variant="destructive"
                                size="sm"
                                className="absolute top-2 left-2"
                                onClick={() => form.setValue("featuredImageUrl", "")}
                                data-testid="button-remove-image"
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </FormControl>
                      <FormDescription>
                        اختياري - رفع صورة مميزة (JPG, PNG, GIF, WebP - حتى 10 MB)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Alerts */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>التنبيهات ({fields.length})</CardTitle>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => append({ title: "", description: "", importance: "medium", category: "", data: "" })}
                    data-testid="button-add-alert"
                  >
                    <Plus className="w-4 h-4 ml-1" />
                    إضافة تنبيه
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {fields.map((field, index) => (
                  <div key={field.id} className="p-4 border rounded-lg space-y-4" data-testid={`alert-item-${index}`}>
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold">تنبيه {index + 1}</h4>
                      {fields.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => remove(index)}
                          data-testid={`button-remove-alert-${index}`}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      )}
                    </div>

                    <FormField
                      control={form.control}
                      name={`alerts.${index}.title`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>العنوان</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="عنوان التنبيه" data-testid={`input-alert-title-${index}`} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name={`alerts.${index}.description`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>الوصف</FormLabel>
                          <FormControl>
                            <Textarea 
                              {...field} 
                              placeholder="وصف التنبيه" 
                              rows={3}
                              data-testid={`textarea-alert-description-${index}`}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name={`alerts.${index}.importance`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>مستوى الأهمية</FormLabel>
                            <Select 
                              onValueChange={field.onChange} 
                              value={field.value}
                              data-testid={`select-importance-${index}`}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="high">عالي</SelectItem>
                                <SelectItem value="medium">متوسط</SelectItem>
                                <SelectItem value="low">منخفض</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name={`alerts.${index}.category`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>الفئة (اختياري)</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="مثال: اقتصاد، سياسة" data-testid={`input-alert-category-${index}`} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name={`alerts.${index}.data`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>البيانات الداعمة (JSON - اختياري)</FormLabel>
                          <FormControl>
                            <Textarea 
                              {...field} 
                              placeholder='{"key": "value"}'
                              rows={3}
                              className="font-mono text-sm"
                              data-testid={`textarea-alert-data-${index}`}
                            />
                          </FormControl>
                          <FormDescription>
                            بيانات إضافية بصيغة JSON
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {index < fields.length - 1 && <Separator />}
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Publishing Settings */}
            <Card>
              <CardHeader>
                <CardTitle>إعدادات النشر</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>الحالة</FormLabel>
                        <Select 
                          onValueChange={field.onChange} 
                          value={field.value}
                          data-testid="select-status"
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="draft">مسودة</SelectItem>
                            <SelectItem value="scheduled">مجدول</SelectItem>
                            <SelectItem value="published">منشور</SelectItem>
                            <SelectItem value="archived">مؤرشف</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="scheduledAt"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>موعد النشر المجدول</FormLabel>
                        <FormControl>
                          <Input 
                            type="datetime-local" 
                            {...field} 
                            data-testid="input-scheduled-at"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div>
                  <FormLabel>الوسوم</FormLabel>
                  <div className="flex gap-2 mt-2">
                    <Input
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      placeholder="أضف وسم"
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                      data-testid="input-tag"
                    />
                    <Button type="button" onClick={addTag} data-testid="button-add-tag">
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {form.watch("tags")?.map((tag, index) => (
                      <Badge key={index} variant="secondary" className="gap-1" data-testid={`badge-tag-${index}`}>
                        {tag}
                        <button
                          type="button"
                          onClick={() => removeTag(index)}
                          className="ml-1 hover:text-destructive"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* SEO Settings */}
            <Collapsible open={seoOpen} onOpenChange={setSeoOpen}>
              <Card>
                <CollapsibleTrigger asChild>
                  <CardHeader className="cursor-pointer hover-elevate">
                    <div className="flex items-center justify-between">
                      <CardTitle>إعدادات SEO</CardTitle>
                      <ChevronDown className={`w-5 h-5 transition-transform ${seoOpen ? 'rotate-180' : ''}`} />
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="space-y-4">
                    <FormField
                      control={form.control}
                      name="seoTitle"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>عنوان SEO</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="عنوان SEO" data-testid="input-seo-title" />
                          </FormControl>
                          <FormDescription>حد أقصى 70 حرف</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="seoDescription"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>وصف SEO</FormLabel>
                          <FormControl>
                            <Textarea {...field} placeholder="وصف SEO" rows={3} data-testid="textarea-seo-description" />
                          </FormControl>
                          <FormDescription>حد أقصى 160 حرف</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>

            {/* Submit Buttons */}
            <div className="flex gap-4">
              <Button 
                type="submit" 
                disabled={createMutation.isPending}
                data-testid="button-submit"
              >
                <Save className="w-4 h-4 ml-2" />
                {createMutation.isPending ? "جاري الحفظ..." : "حفظ"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/dashboard/mirqab")}
                data-testid="button-cancel"
              >
                إلغاء
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </DashboardLayout>
  );
}
