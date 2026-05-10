import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
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
import { ChevronDown, Save, X, Plus, Trash2, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { MirqabEntryWithDetails } from "@shared/schema";
import { ObjectUploader } from "@/components/ObjectUploader";

// Form schema
const formSchema = z.object({
  // Entry fields
  title: z.string().min(3, "العنوان يجب أن يكون 3 أحرف على الأقل"),
  status: z.enum(["draft", "scheduled", "published", "archived"]),
  scheduledAt: z.string().optional(),
  tags: z.array(z.string()).optional(),
  featuredImageUrl: z.string().optional(),
  
  // SABQ Index fields
  indexValue: z.coerce.number().min(0, "القيمة يجب أن تكون أكبر من أو تساوي 0"),
  maxValue: z.coerce.number().min(1, "القيمة القصوى يجب أن تكون أكبر من 0"),
  trend: z.enum(["up", "down", "stable"]),
  indexCategory: z.enum(["economic", "political", "social", "technology"]),
  analysis: z.string().min(10, "التحليل يجب أن يكون 10 أحرف على الأقل"),
  period: z.string().min(2, "الفترة مطلوبة"),
  methodology: z.string().optional(),
  dataSources: z.array(z.string()).optional(),
  chartData: z.string().optional(), // JSON string
  
  // SEO
  seoTitle: z.string().max(70, "عنوان SEO يجب ألا يتجاوز 70 حرف").optional(),
  seoDescription: z.string().max(160, "وصف SEO يجب ألا يتجاوز 160 حرف").optional(),
  seoKeywords: z.array(z.string()).optional(),
});

type FormData = z.infer<typeof formSchema>;

export default function CreateSabqIndex() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/dashboard/mirqab/sabq-index/:id/edit");
  const isEdit = !!params?.id;
  const { toast } = useToast();
  const [seoOpen, setSeoOpen] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [sourceInput, setSourceInput] = useState("");
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
      indexValue: 0,
      maxValue: 100,
      trend: "stable",
      indexCategory: "economic",
      analysis: "",
      period: "",
      methodology: "",
      dataSources: [],
      chartData: "",
      seoTitle: "",
      seoDescription: "",
      seoKeywords: [],
    },
  });

  // Populate form when editing
  useEffect(() => {
    if (entry && entry.sabqIndex) {
      form.reset({
        title: entry.title,
        status: entry.status as any,
        scheduledAt: entry.scheduledAt ? new Date(entry.scheduledAt).toISOString().slice(0, 16) : "",
        tags: entry.tags || [],
        featuredImageUrl: entry.featuredImageUrl || "",
        indexValue: entry.sabqIndex.indexValue,
        maxValue: entry.sabqIndex.maxValue,
        trend: entry.sabqIndex.trend as any,
        indexCategory: entry.sabqIndex.indexCategory as any,
        analysis: entry.sabqIndex.analysis,
        period: entry.sabqIndex.period,
        methodology: entry.sabqIndex.methodology || "",
        dataSources: entry.sabqIndex.dataSources || [],
        chartData: entry.sabqIndex.chartData ? JSON.stringify(entry.sabqIndex.chartData, null, 2) : "",
        seoTitle: entry.seo?.metaTitle || "",
        seoDescription: entry.seo?.metaDescription || "",
        seoKeywords: entry.seo?.keywords || [],
      });
    }
  }, [entry, form]);

  const createMutation = useMutation({
    mutationFn: async (data: FormData) => {
      // Parse chart data if provided
      let chartData = null;
      if (data.chartData) {
        try {
          chartData = JSON.parse(data.chartData);
        } catch (error) {
          throw new Error("بيانات الرسم البياني غير صحيحة (JSON غير صالح)");
        }
      }

      const payload = {
        entry: {
          entryType: 'sabq_index',
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
        indexData: {
          indexValue: data.indexValue,
          maxValue: data.maxValue,
          trend: data.trend,
          indexCategory: data.indexCategory,
          analysis: data.analysis,
          period: data.period,
          methodology: data.methodology || null,
          dataSources: data.dataSources || [],
          chartData: chartData,
        },
      };

      if (isEdit && params?.id) {
        await apiRequest(`/api/mirqab/sabq-index/${params.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
          headers: { 'Content-Type': 'application/json' },
        });
      } else {
        await apiRequest('/api/mirqab/sabq-index', {
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
        description: isEdit ? "تم تحديث المؤشر بنجاح" : "تم إنشاء المؤشر بنجاح",
      });
      navigate("/dashboard/mirqab");
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في حفظ المؤشر",
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

  const addSource = () => {
    if (sourceInput.trim()) {
      const currentSources = form.getValues("dataSources") || [];
      form.setValue("dataSources", [...currentSources, sourceInput.trim()]);
      setSourceInput("");
    }
  };

  const removeSource = (index: number) => {
    const currentSources = form.getValues("dataSources") || [];
    form.setValue("dataSources", currentSources.filter((_, i) => i !== index));
  };

  const addKeyword = (keyword: string) => {
    if (keyword.trim()) {
      const currentKeywords = form.getValues("seoKeywords") || [];
      form.setValue("seoKeywords", [...currentKeywords, keyword.trim()]);
    }
  };

  const removeKeyword = (index: number) => {
    const currentKeywords = form.getValues("seoKeywords") || [];
    form.setValue("seoKeywords", currentKeywords.filter((_, i) => i !== index));
  };

  const handleImageUpload = async () => {
    setIsUploadingImage(true);
    try {
      const uploadData = await apiRequest("/api/objects/upload", {
        method: "POST",
      }) as { uploadURL: string };

      const fileUrl = uploadData.uploadURL.split('?')[0];

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
      console.error("Error uploading image:", error);
      toast({
        title: "خطأ",
        description: "فشل رفع الصورة",
        variant: "destructive",
      });
    } finally {
      setIsUploadingImage(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold" data-testid="heading-title">
            {isEdit ? "تعديل مؤشر سبق" : "إنشاء مؤشر سبق"}
          </h1>
          <p className="text-muted-foreground" data-testid="text-description">
            {isEdit ? "تحديث بيانات المؤشر" : "إضافة مؤشر جديد للمرقاب"}
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
                      <FormLabel>عنوان المؤشر*</FormLabel>
                      <FormControl>
                        <Input placeholder="مثال: مؤشر الثقة الاقتصادية" {...field} data-testid="input-title" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="indexCategory"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>الفئة*</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-category">
                              <SelectValue placeholder="اختر الفئة" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="economic">اقتصادي</SelectItem>
                            <SelectItem value="political">سياسي</SelectItem>
                            <SelectItem value="social">اجتماعي</SelectItem>
                            <SelectItem value="technology">تقني</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>حالة النشر*</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-status">
                              <SelectValue placeholder="اختر الحالة" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="draft">مسودة</SelectItem>
                            <SelectItem value="scheduled">مجدولة</SelectItem>
                            <SelectItem value="published">منشورة</SelectItem>
                            <SelectItem value="archived">مؤرشفة</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {form.watch("status") === "scheduled" && (
                  <FormField
                    control={form.control}
                    name="scheduledAt"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>موعد النشر</FormLabel>
                        <FormControl>
                          <Input type="datetime-local" {...field} data-testid="input-scheduled-at" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

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

                {/* Tags */}
                <div className="space-y-2">
                  <FormLabel>الوسوم</FormLabel>
                  <div className="flex items-center gap-2">
                    <Input
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                      placeholder="أضف وسم"
                      data-testid="input-tag"
                    />
                    <Button type="button" onClick={addTag} size="sm" data-testid="button-add-tag">
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {form.watch("tags")?.map((tag, index) => (
                      <div key={index} className="flex items-center gap-1 bg-secondary text-secondary-foreground px-3 py-1 rounded-md text-sm" data-testid={`tag-${index}`}>
                        <span>{tag}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-auto p-0 hover:bg-transparent"
                          onClick={() => removeTag(index)}
                          data-testid={`button-remove-tag-${index}`}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Index Values */}
            <Card>
              <CardHeader>
                <CardTitle>قيم المؤشر</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="indexValue"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>القيمة*</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" placeholder="75" {...field} data-testid="input-index-value" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="maxValue"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>القيمة القصوى*</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" placeholder="100" {...field} data-testid="input-max-value" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="trend"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>الاتجاه*</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-trend">
                              <SelectValue placeholder="اختر الاتجاه" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="up">↑ صاعد</SelectItem>
                            <SelectItem value="down">↓ هابط</SelectItem>
                            <SelectItem value="stable">→ مستقر</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="period"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>الفترة الزمنية*</FormLabel>
                      <FormControl>
                        <Input placeholder="مثال: الربع الأول 2025" {...field} data-testid="input-period" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Analysis */}
            <Card>
              <CardHeader>
                <CardTitle>التحليل والمنهجية</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="analysis"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>التحليل*</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="التحليل الكامل للمؤشر..."
                          className="min-h-[200px]"
                          {...field}
                          data-testid="textarea-analysis"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="methodology"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>المنهجية</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="المنهجية المستخدمة في حساب المؤشر..."
                          className="min-h-[150px]"
                          {...field}
                          data-testid="textarea-methodology"
                        />
                      </FormControl>
                      <FormDescription>
                        اختياري - شرح المنهجية المستخدمة
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Data Sources */}
                <div className="space-y-2">
                  <FormLabel>مصادر البيانات</FormLabel>
                  <div className="flex items-center gap-2">
                    <Input
                      value={sourceInput}
                      onChange={(e) => setSourceInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addSource())}
                      placeholder="أضف مصدر بيانات"
                      data-testid="input-source"
                    />
                    <Button type="button" onClick={addSource} size="sm" data-testid="button-add-source">
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                  <ul className="space-y-2 mt-2">
                    {form.watch("dataSources")?.map((source, index) => (
                      <li key={index} className="flex items-center gap-2 bg-secondary/50 px-3 py-2 rounded-md" data-testid={`source-${index}`}>
                        <span className="flex-1">{source}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeSource(index)}
                          data-testid={`button-remove-source-${index}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>

                <FormField
                  control={form.control}
                  name="chartData"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>بيانات الرسم البياني (JSON)</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder='[{"date": "2025-01-01", "value": 75}, {"date": "2025-02-01", "value": 78}]'
                          className="min-h-[150px] font-mono text-sm"
                          {...field}
                          data-testid="textarea-chart-data"
                        />
                      </FormControl>
                      <FormDescription>
                        اختياري - بيانات JSON للرسم البياني
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* SEO */}
            <Collapsible open={seoOpen} onOpenChange={setSeoOpen}>
              <Card>
                <CardHeader>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" className="w-full justify-between p-0 hover:bg-transparent" data-testid="button-toggle-seo">
                      <CardTitle>إعدادات SEO</CardTitle>
                      <ChevronDown className={`w-5 h-5 transition-transform ${seoOpen ? 'rotate-180' : ''}`} />
                    </Button>
                  </CollapsibleTrigger>
                </CardHeader>
                <CollapsibleContent>
                  <CardContent className="space-y-4">
                    <FormField
                      control={form.control}
                      name="seoTitle"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>عنوان SEO</FormLabel>
                          <FormControl>
                            <Input placeholder="عنوان محسّن لمحركات البحث" {...field} data-testid="input-seo-title" />
                          </FormControl>
                          <FormDescription>
                            يُنصح بألا يتجاوز 70 حرف
                          </FormDescription>
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
                            <Textarea
                              placeholder="وصف محسّن لمحركات البحث"
                              {...field}
                              data-testid="textarea-seo-description"
                            />
                          </FormControl>
                          <FormDescription>
                            يُنصح بألا يتجاوز 160 حرف
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <Button
                type="submit"
                disabled={createMutation.isPending}
                data-testid="button-submit"
              >
                {createMutation.isPending ? (
                  "جاري الحفظ..."
                ) : (
                  <>
                    <Save className="w-4 h-4 ml-2" />
                    {isEdit ? "تحديث" : "إنشاء"}
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/dashboard/mirqab")}
                data-testid="button-cancel"
              >
                <X className="w-4 h-4 ml-2" />
                إلغاء
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </DashboardLayout>
  );
}
