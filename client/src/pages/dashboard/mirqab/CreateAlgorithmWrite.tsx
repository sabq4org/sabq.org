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
import { Checkbox } from "@/components/ui/checkbox";
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
import { ChevronDown, Save, X, Plus, Sparkles, Upload } from "lucide-react";
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
  
  // Algorithm Article fields
  content: z.string().min(50, "المحتوى يجب أن يكون 50 حرف على الأقل"),
  analysisType: z.enum(["opinion", "analysis", "forecast"]),
  modelUsed: z.string().min(2, "النموذج المستخدم مطلوب"),
  aiPercentage: z.coerce.number().min(0).max(100),
  aiPrompt: z.string().optional(),
  humanReviewed: z.boolean().default(false),
  reviewerNotes: z.string().optional(),
  
  // SEO
  seoTitle: z.string().max(70, "عنوان SEO يجب ألا يتجاوز 70 حرف").optional(),
  seoDescription: z.string().max(160, "وصف SEO يجب ألا يتجاوز 160 حرف").optional(),
  seoKeywords: z.array(z.string()).optional(),
});

type FormData = z.infer<typeof formSchema>;

export default function CreateAlgorithmWrite() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/dashboard/mirqab/algorithm-writes/:id/edit");
  const isEdit = !!params?.id;
  const { toast } = useToast();
  const [seoOpen, setSeoOpen] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
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
      content: "",
      analysisType: "analysis",
      modelUsed: "GPT-4",
      aiPercentage: 100,
      aiPrompt: "",
      humanReviewed: false,
      reviewerNotes: "",
      seoTitle: "",
      seoDescription: "",
      seoKeywords: [],
    },
  });

  const humanReviewed = form.watch("humanReviewed");

  // Populate form when editing
  useEffect(() => {
    if (entry && entry.algorithmArticle) {
      form.reset({
        title: entry.title,
        status: entry.status as any,
        scheduledAt: entry.scheduledAt ? new Date(entry.scheduledAt).toISOString().slice(0, 16) : "",
        tags: entry.tags || [],
        featuredImageUrl: entry.featuredImageUrl || "",
        content: entry.algorithmArticle.content,
        analysisType: entry.algorithmArticle.analysisType as any,
        modelUsed: entry.algorithmArticle.aiModel,
        aiPercentage: entry.algorithmArticle.aiPercentage,
        aiPrompt: entry.algorithmArticle.prompt || "",
        humanReviewed: entry.algorithmArticle.humanReviewed || false,
        reviewerNotes: entry.algorithmArticle.reviewerNotes || "",
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
          entryType: 'algorithm_article',
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
        articleData: {
          content: data.content,
          analysisType: data.analysisType,
          aiModel: data.modelUsed,
          aiPercentage: data.aiPercentage,
          prompt: data.aiPrompt || null,
          humanReviewed: data.humanReviewed,
          reviewerNotes: data.reviewerNotes || null,
        },
      };

      if (isEdit && params?.id) {
        await apiRequest(`/api/mirqab/algorithm-writes/${params.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
          headers: { 'Content-Type': 'application/json' },
        });
      } else {
        await apiRequest('/api/mirqab/algorithm-writes', {
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
        description: isEdit ? "تم تحديث المقال بنجاح" : "تم إنشاء المقال بنجاح",
      });
      navigate("/dashboard/mirqab");
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في حفظ المقال",
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
            {isEdit ? "تعديل مقال الخوارزمي" : "إنشاء مقال الخوارزمي"}
          </h1>
          <p className="text-muted-foreground" data-testid="text-description">
            {isEdit ? "تحديث بيانات المقال" : "إضافة مقال جديد مكتوب بواسطة AI"}
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
                        <Input {...field} placeholder="عنوان المقال" data-testid="input-title" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="analysisType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>نوع التحليل</FormLabel>
                      <Select 
                        onValueChange={field.onChange} 
                        value={field.value}
                        data-testid="select-analysis-type"
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="اختر نوع التحليل" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="opinion">رأي</SelectItem>
                          <SelectItem value="analysis">تحليل</SelectItem>
                          <SelectItem value="forecast">توقعات</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="content"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>المحتوى</FormLabel>
                      <FormControl>
                        <Textarea 
                          {...field} 
                          placeholder="المحتوى الكامل للمقال" 
                          rows={12}
                          data-testid="textarea-content"
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

            {/* AI Settings */}
            <Card>
              <CardHeader>
                <CardTitle>إعدادات الذكاء الاصطناعي</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="modelUsed"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>النموذج المستخدم</FormLabel>
                      <FormControl>
                        <Input 
                          {...field} 
                          placeholder="مثال: GPT-4, GPT-5, Claude" 
                          data-testid="input-model-used"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="aiPercentage"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>نسبة المحتوى المكتوب بواسطة AI ({field.value}%)</FormLabel>
                      <FormControl>
                        <Slider
                          value={[field.value]}
                          onValueChange={(values) => field.onChange(values[0])}
                          max={100}
                          step={5}
                          data-testid="slider-ai-percentage"
                        />
                      </FormControl>
                      <FormDescription>
                        نسبة المحتوى المكتوب بواسطة الذكاء الاصطناعي
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Collapsible open={promptOpen} onOpenChange={setPromptOpen}>
                  <CollapsibleTrigger asChild>
                    <Button 
                      type="button" 
                      variant="outline" 
                      className="w-full justify-between"
                      data-testid="button-toggle-prompt"
                    >
                      الـ Prompt المستخدم (اختياري)
                      <ChevronDown className={`w-4 h-4 transition-transform ${promptOpen ? 'rotate-180' : ''}`} />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-4">
                    <FormField
                      control={form.control}
                      name="aiPrompt"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Textarea 
                              {...field} 
                              placeholder="الـ Prompt المستخدم لتوليد المحتوى" 
                              rows={5}
                              data-testid="textarea-ai-prompt"
                            />
                          </FormControl>
                          <FormDescription>
                            يمكنك حفظ الـ Prompt المستخدم لتوليد المحتوى للشفافية
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CollapsibleContent>
                </Collapsible>

                <div className="pt-4 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full gap-2"
                    disabled
                    data-testid="button-generate-ai"
                  >
                    <Sparkles className="w-4 h-4" />
                    توليد بواسطة AI (قريباً)
                  </Button>
                  <p className="text-xs text-muted-foreground text-center mt-2">
                    ستتمكن قريباً من توليد المحتوى مباشرة من هنا
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Human Review */}
            <Card>
              <CardHeader>
                <CardTitle>المراجعة البشرية</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="humanReviewed"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-human-reviewed"
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none mr-3">
                        <FormLabel>
                          تمت المراجعة البشرية
                        </FormLabel>
                        <FormDescription>
                          حدد هذا الخيار إذا تمت مراجعة المحتوى من قبل محرر بشري
                        </FormDescription>
                      </div>
                    </FormItem>
                  )}
                />

                {humanReviewed && (
                  <FormField
                    control={form.control}
                    name="reviewerNotes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>ملاحظات المراجع</FormLabel>
                        <FormControl>
                          <Textarea 
                            {...field} 
                            placeholder="ملاحظات المراجع على المحتوى" 
                            rows={4}
                            data-testid="textarea-reviewer-notes"
                          />
                        </FormControl>
                        <FormDescription>
                          ملاحظات المراجع البشري على المحتوى المولد
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
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
