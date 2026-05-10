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
import { Slider } from "@/components/ui/slider";
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

// Form schema
const formSchema = z.object({
  // Entry fields
  title: z.string().min(3, "العنوان يجب أن يكون 3 أحرف على الأقل"),
  status: z.enum(["draft", "scheduled", "published", "archived"]),
  scheduledAt: z.string().optional(),
  tags: z.array(z.string()).optional(),
  featuredImageUrl: z.string().optional(),
  
  // Next Story fields
  executiveSummary: z.string().min(10, "الملخص التنفيذي يجب أن يكون 10 أحرف على الأقل"),
  content: z.string().min(50, "المحتوى يجب أن يكون 50 حرف على الأقل"),
  confidenceLevel: z.coerce.number().min(0).max(100),
  expectedTiming: z.enum(["week", "month", "quarter", "year"]),
  expectedDate: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  dataSources: z.array(z.string()).optional(),
  aiAnalysis: z.string().optional(),
  relatedArticleIds: z.array(z.string()).optional(),
  
  // SEO
  seoTitle: z.string().max(70, "عنوان SEO يجب ألا يتجاوز 70 حرف").optional(),
  seoDescription: z.string().max(160, "وصف SEO يجب ألا يتجاوز 160 حرف").optional(),
  seoKeywords: z.array(z.string()).optional(),
});

type FormData = z.infer<typeof formSchema>;

export default function CreateNextStory() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/dashboard/mirqab/next-stories/:id/edit");
  const isEdit = !!params?.id;
  const { toast } = useToast();
  const [seoOpen, setSeoOpen] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [keywordInput, setKeywordInput] = useState("");
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
      executiveSummary: "",
      content: "",
      confidenceLevel: 50,
      expectedTiming: "month",
      expectedDate: "",
      keywords: [],
      dataSources: [],
      aiAnalysis: "",
      relatedArticleIds: [],
      seoTitle: "",
      seoDescription: "",
      seoKeywords: [],
    },
  });

  // Populate form when editing
  useEffect(() => {
    if (entry && entry.nextStory) {
      form.reset({
        title: entry.title,
        status: entry.status as any,
        scheduledAt: entry.scheduledAt ? new Date(entry.scheduledAt).toISOString().slice(0, 16) : "",
        tags: entry.tags || [],
        featuredImageUrl: entry.featuredImageUrl || "",
        executiveSummary: entry.nextStory.executiveSummary,
        content: entry.nextStory.content,
        confidenceLevel: entry.nextStory.confidenceLevel,
        expectedTiming: entry.nextStory.expectedTiming as any,
        expectedDate: entry.nextStory.expectedDate ? new Date(entry.nextStory.expectedDate).toISOString().slice(0, 10) : "",
        keywords: entry.nextStory.keywords || [],
        dataSources: entry.nextStory.dataSources || [],
        aiAnalysis: entry.nextStory.aiAnalysis || "",
        relatedArticleIds: entry.nextStory.relatedArticleIds || [],
        seoTitle: entry.seo?.metaTitle || "",
        seoDescription: entry.seo?.metaDescription || "",
        seoKeywords: entry.seo?.keywords || [],
      });
    }
  }, [entry, form]);

  const createMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const payload = {
        entry: {
          entryType: 'next_story',
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
        storyData: {
          executiveSummary: data.executiveSummary,
          content: data.content,
          confidenceLevel: data.confidenceLevel,
          expectedTiming: data.expectedTiming,
          expectedDate: data.expectedDate || null,
          keywords: data.keywords || [],
          dataSources: data.dataSources || [],
          aiAnalysis: data.aiAnalysis || null,
          relatedArticleIds: data.relatedArticleIds || [],
        },
      };

      if (isEdit && params?.id) {
        await apiRequest(`/api/mirqab/next-stories/${params.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
          headers: { 'Content-Type': 'application/json' },
        });
      } else {
        await apiRequest('/api/mirqab/next-stories', {
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
        description: isEdit ? "تم تحديث القصة بنجاح" : "تم إنشاء القصة بنجاح",
      });
      navigate("/dashboard/mirqab");
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في حفظ القصة",
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

  const addKeyword = () => {
    if (keywordInput.trim()) {
      const currentKeywords = form.getValues("keywords") || [];
      form.setValue("keywords", [...currentKeywords, keywordInput.trim()]);
      setKeywordInput("");
    }
  };

  const removeKeyword = (index: number) => {
    const currentKeywords = form.getValues("keywords") || [];
    form.setValue("keywords", currentKeywords.filter((_, i) => i !== index));
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
            {isEdit ? "تعديل قصة قادمة" : "إنشاء قصة قادمة"}
          </h1>
          <p className="text-muted-foreground" data-testid="text-description">
            {isEdit ? "تحديث بيانات القصة" : "إضافة قصة جديدة للمرقاب"}
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
                        <Input {...field} placeholder="عنوان القصة" data-testid="input-title" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="executiveSummary"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>الملخص التنفيذي</FormLabel>
                      <FormControl>
                        <Textarea 
                          {...field} 
                          placeholder="ملخص موجز للقصة القادمة" 
                          rows={3}
                          data-testid="textarea-executive-summary"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="content"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>المحتوى الكامل</FormLabel>
                      <FormControl>
                        <Textarea 
                          {...field} 
                          placeholder="التحليل الكامل للقصة" 
                          rows={8}
                          data-testid="textarea-content"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="confidenceLevel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>مستوى الثقة ({field.value}%)</FormLabel>
                      <FormControl>
                        <Slider
                          value={[field.value]}
                          onValueChange={(values) => field.onChange(values[0])}
                          max={100}
                          step={5}
                          data-testid="slider-confidence"
                        />
                      </FormControl>
                      <FormDescription>
                        مستوى الثقة بحدوث هذا السيناريو
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="expectedTiming"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>التوقيت المتوقع</FormLabel>
                        <Select 
                          onValueChange={field.onChange} 
                          value={field.value}
                          data-testid="select-expected-timing"
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="اختر التوقيت" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="week">خلال أسبوع</SelectItem>
                            <SelectItem value="month">خلال شهر</SelectItem>
                            <SelectItem value="quarter">خلال ربع سنة</SelectItem>
                            <SelectItem value="year">خلال سنة</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="expectedDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>التاريخ المتوقع (اختياري)</FormLabel>
                        <FormControl>
                          <Input 
                            type="date" 
                            {...field} 
                            data-testid="input-expected-date"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

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

            {/* Keywords */}
            <Card>
              <CardHeader>
                <CardTitle>الكلمات المفتاحية</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    value={keywordInput}
                    onChange={(e) => setKeywordInput(e.target.value)}
                    placeholder="أضف كلمة مفتاحية"
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addKeyword())}
                    data-testid="input-keyword"
                  />
                  <Button type="button" onClick={addKeyword} data-testid="button-add-keyword">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {form.watch("keywords")?.map((keyword, index) => (
                    <Badge key={index} variant="secondary" className="gap-1" data-testid={`badge-keyword-${index}`}>
                      {keyword}
                      <button
                        type="button"
                        onClick={() => removeKeyword(index)}
                        className="ml-1 hover:text-destructive"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Data Sources */}
            <Card>
              <CardHeader>
                <CardTitle>المصادر والبيانات</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    value={sourceInput}
                    onChange={(e) => setSourceInput(e.target.value)}
                    placeholder="أضف مصدر أو بيان"
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addSource())}
                    data-testid="input-source"
                  />
                  <Button type="button" onClick={addSource} data-testid="button-add-source">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                <div className="space-y-2">
                  {form.watch("dataSources")?.map((source, index) => (
                    <div 
                      key={index} 
                      className="flex items-start gap-2 p-2 bg-secondary/20 rounded-md"
                      data-testid={`source-item-${index}`}
                    >
                      <span className="flex-1 text-sm">{source}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeSource(index)}
                        className="h-6 w-6"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* AI Analysis */}
            <Card>
              <CardHeader>
                <CardTitle>التحليل الذكي (اختياري)</CardTitle>
              </CardHeader>
              <CardContent>
                <FormField
                  control={form.control}
                  name="aiAnalysis"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Textarea 
                          {...field} 
                          placeholder="التحليل الذكي للقصة" 
                          rows={5}
                          data-testid="textarea-ai-analysis"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
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
