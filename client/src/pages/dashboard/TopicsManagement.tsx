import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { getCsrfToken } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Plus,
  Edit,
  Trash2,
  Eye,
  ExternalLink,
  Loader2,
  ChevronRight,
  Upload,
  Archive,
  X,
} from "lucide-react";
import { RichTextEditor } from "@/components/RichTextEditor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { insertTopicSchema, topicSeoMetaSchema } from "@shared/schema";
import type { Topic, Angle } from "@shared/schema";
import { DashboardLayout } from "@/components/DashboardLayout";

const topicFormSchema = insertTopicSchema.extend({
  title: z.string().min(2, "العنوان يجب أن يكون حرفين على الأقل"),
  slug: z.string().min(2, "المعرف يجب أن يكون حرفين على الأقل")
    .regex(/^[\u0600-\u06FFa-z0-9-]+$/, "المعرف يجب أن يحتوي على أحرف عربية أو إنجليزية صغيرة وأرقام وشرطات فقط"),
  excerpt: z.string().optional(),
  content: z.object({
    blocks: z.array(z.object({
      type: z.enum(["text", "image", "video", "link", "embed", "quote", "heading"]),
      content: z.string().optional(),
      url: z.string().optional(),
      alt: z.string().optional(),
      caption: z.string().optional(),
      level: z.number().optional(),
      metadata: z.record(z.any()).optional(),
    })).optional(),
    rawHtml: z.string().optional(),
    plainText: z.string().optional(),
  }).optional(),
  heroImageUrl: z.string().optional().or(z.literal("")),
  seoMeta: topicSeoMetaSchema.optional(),
});

type TopicFormValues = z.infer<typeof topicFormSchema>;

function generateSlug(title: string): string {
  return title
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\u0600-\u06FFa-z0-9-]/gi, '')
    .toLowerCase()
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function getStatusBadge(status: string) {
  switch (status) {
    case "published":
      return <Badge variant="default" className="bg-green-600">منشور</Badge>;
    case "archived":
      return <Badge variant="secondary" className="bg-orange-500 text-white">مؤرشف</Badge>;
    case "draft":
    default:
      return <Badge variant="secondary">مسودة</Badge>;
  }
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "-";
  const d = new Date(date);
  return d.toLocaleDateString("ar-SA-u-ca-gregory", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function TopicsManagement() {
  const { angleId } = useParams<{ angleId: string }>();
  const { user } = useAuth({ redirectToLogin: true });
  const { toast } = useToast();

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingTopic, setEditingTopic] = useState<Topic | null>(null);
  const [deletingTopic, setDeletingTopic] = useState<Topic | null>(null);
  const [seoExpanded, setSeoExpanded] = useState(false);
  const [heroImagePreview, setHeroImagePreview] = useState<string>("");
  const [isUploadingHero, setIsUploadingHero] = useState(false);
  const [editorContent, setEditorContent] = useState<string>("");
  const heroFileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<TopicFormValues>({
    resolver: zodResolver(topicFormSchema),
    defaultValues: {
      angleId: angleId || "",
      title: "",
      slug: "",
      excerpt: "",
      content: { blocks: [], plainText: "" },
      heroImageUrl: "",
      seoMeta: {
        metaTitle: "",
        metaDescription: "",
        keywords: [],
        ogImage: "",
        canonicalUrl: "",
      },
      createdBy: user?.id || "",
    },
  });

  const { data: angle, isLoading: isAngleLoading } = useQuery<Angle>({
    queryKey: ["/api/admin/muqtarab/angles", angleId],
    queryFn: async () => {
      const res = await fetch(`/api/muqtarab/angles/${angleId}`);
      if (!res.ok) throw new Error("Failed to fetch angle");
      return res.json();
    },
    enabled: !!angleId,
  });

  const { data: topicsData, isLoading: isTopicsLoading } = useQuery<{ topics: Topic[]; total: number }>({
    queryKey: ["/api/admin/muqtarab/angles", angleId, "topics"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/muqtarab/angles/${angleId}/topics`);
      if (!res.ok) throw new Error("Failed to fetch topics");
      return res.json();
    },
    enabled: !!angleId,
  });
  
  const topics = topicsData?.topics || [];

  const createMutation = useMutation({
    mutationFn: async (data: TopicFormValues) => {
      return await apiRequest("/api/admin/muqtarab/topics", {
        method: "POST",
        body: JSON.stringify({
          ...data,
          angleId,
          createdBy: user?.id,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/muqtarab/angles", angleId, "topics"] });
      setIsCreateDialogOpen(false);
      form.reset();
      toast({
        title: "تم إنشاء الموضوع",
        description: "تم إضافة الموضوع بنجاح",
      });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في إنشاء الموضوع",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<TopicFormValues> }) => {
      return await apiRequest(`/api/admin/muqtarab/topics/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...data,
          updatedBy: user?.id,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/muqtarab/angles", angleId, "topics"] });
      setEditingTopic(null);
      form.reset();
      toast({
        title: "تم تحديث الموضوع",
        description: "تم تحديث الموضوع بنجاح",
      });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في تحديث الموضوع",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/admin/muqtarab/topics/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/muqtarab/angles", angleId, "topics"] });
      setDeletingTopic(null);
      toast({
        title: "تم حذف الموضوع",
        description: "تم حذف الموضوع بنجاح",
      });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في حذف الموضوع",
        variant: "destructive",
      });
    },
  });

  const publishMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/admin/muqtarab/topics/${id}/publish`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/muqtarab/angles", angleId, "topics"] });
      toast({
        title: "تم نشر الموضوع",
        description: "الموضوع الآن متاح للقراء",
      });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في نشر الموضوع",
        variant: "destructive",
      });
    },
  });

  const unpublishMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/admin/muqtarab/topics/${id}/unpublish`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/muqtarab/angles", angleId, "topics"] });
      toast({
        title: "تم إلغاء النشر",
        description: "الموضوع أصبح مسودة",
      });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في إلغاء نشر الموضوع",
        variant: "destructive",
      });
    },
  });

  const handleCreate = () => {
    form.reset({
      angleId: angleId || "",
      title: "",
      slug: "",
      excerpt: "",
      content: { blocks: [], rawHtml: "", plainText: "" },
      heroImageUrl: "",
      seoMeta: {
        metaTitle: "",
        metaDescription: "",
        keywords: [],
        ogImage: "",
        canonicalUrl: "",
      },
      createdBy: user?.id || "",
    });
    setSeoExpanded(false);
    setEditorContent("");
    setHeroImagePreview("");
    setIsCreateDialogOpen(true);
  };

  const handleEdit = (topic: Topic) => {
    setEditingTopic(topic);
    setSeoExpanded(false);
    const contentData = topic.content as { blocks?: any[]; rawHtml?: string; plainText?: string } | null;
    const rawHtml = contentData?.rawHtml || "";
    setEditorContent(rawHtml);
    setHeroImagePreview(topic.heroImageUrl || "");
    form.reset({
      angleId: topic.angleId,
      title: topic.title,
      slug: topic.slug,
      excerpt: topic.excerpt || "",
      content: topic.content || { blocks: [], rawHtml: "", plainText: "" },
      heroImageUrl: topic.heroImageUrl || "",
      seoMeta: topic.seoMeta || {
        metaTitle: "",
        metaDescription: "",
        keywords: [],
        ogImage: "",
        canonicalUrl: "",
      },
      createdBy: topic.createdBy,
    });
  };

  const handleHeroImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: "خطأ",
        description: "نوع الملف غير مدعوم. يرجى اختيار صورة بصيغة JPEG, PNG, GIF أو WebP",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "خطأ",
        description: "حجم الملف كبير جداً. الحد الأقصى 10 ميجابايت",
        variant: "destructive",
      });
      return;
    }

    setIsUploadingHero(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const csrfToken = getCsrfToken();
      const response = await fetch("/api/media/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
        headers: csrfToken ? { "X-CSRF-Token": csrfToken } : undefined,
      });

      if (!response.ok) {
        throw new Error("فشل في رفع الصورة");
      }

      const result = await response.json();
      const imageUrl = result.proxyUrl || result.url;
      form.setValue("heroImageUrl", imageUrl);
      setHeroImagePreview(imageUrl);
      toast({
        title: "تم رفع الصورة",
        description: "تم رفع صورة الغلاف بنجاح",
      });
    } catch (error) {
      console.error("Upload error:", error);
      toast({
        title: "خطأ",
        description: "فشل في رفع الصورة",
        variant: "destructive",
      });
    } finally {
      setIsUploadingHero(false);
      if (heroFileInputRef.current) {
        heroFileInputRef.current.value = "";
      }
    }
  };

  const handleEditorChange = (html: string) => {
    setEditorContent(html);
    const plainText = html.replace(/<[^>]*>/g, "").trim();
    form.setValue("content", {
      blocks: [],
      rawHtml: html,
      plainText: plainText,
    });
  };

  const handleSubmit = form.handleSubmit((data) => {
    if (editingTopic) {
      updateMutation.mutate({ id: editingTopic.id, data });
    } else {
      createMutation.mutate(data);
    }
  });

  const handlePublish = (topic: Topic) => {
    if (topic.status === "published") {
      unpublishMutation.mutate(topic.id);
    } else {
      publishMutation.mutate(topic.id);
    }
  };

  const title = form.watch("title");
  useEffect(() => {
    if (title && !editingTopic) {
      form.setValue("slug", generateSlug(title));
    }
  }, [title, editingTopic, form]);

  const isLoading = isAngleLoading || isTopicsLoading;

  return (
    <DashboardLayout>
      <div className="space-y-6" dir="rtl">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4" data-testid="breadcrumb">
          <Link href="/dashboard/muqtarab" className="hover:text-foreground" data-testid="link-muqtarab">
            مُقترب
          </Link>
          <ChevronRight className="h-4 w-4" />
          <span className="text-foreground" data-testid="text-angle-name">
            {isAngleLoading ? (
              <Loader2 className="h-4 w-4 animate-spin inline" />
            ) : (
              angle?.nameAr || "..."
            )}
          </span>
          <ChevronRight className="h-4 w-4" />
          <span className="text-foreground">المواضيع</span>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-page-title">
              إدارة المواضيع
            </h1>
            <p className="text-muted-foreground mt-1">
              إدارة مواضيع زاوية {angle?.nameAr || "..."}
            </p>
          </div>
          <Button
            onClick={handleCreate}
            disabled={!angleId}
            data-testid="button-create-topic"
          >
            <Plus className="h-4 w-4 ml-2" />
            إضافة موضوع جديد
          </Button>
        </div>

        <Card data-testid="card-topics-table">
          <CardHeader>
            <CardTitle>المواضيع ({topics.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8" data-testid="loader-topics">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : topics.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground" data-testid="text-no-topics">
                لا توجد مواضيع. ابدأ بإضافة موضوع جديد.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">العنوان</TableHead>
                      <TableHead className="text-right">الحالة</TableHead>
                      <TableHead className="text-right">تاريخ النشر</TableHead>
                      <TableHead className="text-right">الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topics.map((topic) => (
                      <TableRow key={topic.id} data-testid={`row-topic-${topic.id}`}>
                        <TableCell>
                          <div data-testid={`text-topic-title-${topic.id}`}>
                            <div className="font-medium">{topic.title}</div>
                            <div className="text-sm text-muted-foreground">
                              <code className="bg-muted px-1 py-0.5 rounded text-xs">
                                {topic.slug}
                              </code>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell data-testid={`badge-status-${topic.id}`}>
                          {getStatusBadge(topic.status)}
                        </TableCell>
                        <TableCell data-testid={`text-published-at-${topic.id}`}>
                          {formatDate(topic.publishedAt)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleEdit(topic)}
                              data-testid={`button-edit-${topic.id}`}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handlePublish(topic)}
                              disabled={publishMutation.isPending || unpublishMutation.isPending}
                              data-testid={`button-publish-${topic.id}`}
                            >
                              {topic.status === "published" ? (
                                <Archive className="h-4 w-4" />
                              ) : (
                                <Upload className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setDeletingTopic(topic)}
                              data-testid={`button-delete-${topic.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                            {topic.status === "published" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                asChild
                                data-testid={`button-view-${topic.id}`}
                              >
                                <a
                                  href={`/muqtarab/${angle?.slug}/${topic.slug}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </a>
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog
          open={isCreateDialogOpen || !!editingTopic}
          onOpenChange={(open) => {
            if (!open) {
              setIsCreateDialogOpen(false);
              setEditingTopic(null);
              form.reset();
            }
          }}
        >
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" dir="rtl">
            <DialogHeader>
              <DialogTitle data-testid="text-dialog-title">
                {editingTopic ? "تعديل الموضوع" : "موضوع جديد"}
              </DialogTitle>
              <DialogDescription>
                {editingTopic
                  ? "تعديل معلومات الموضوع"
                  : "إضافة موضوع جديد إلى الزاوية"}
              </DialogDescription>
            </DialogHeader>

            <Form {...form}>
              <form onSubmit={handleSubmit} className="space-y-4">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>العنوان *</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="مثال: مستقبل الإعلام الرقمي"
                          data-testid="input-title"
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
                      <FormLabel>المعرف (Slug) *</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="مستقبل-الإعلام-الرقمي"
                          dir="rtl"
                          data-testid="input-slug"
                        />
                      </FormControl>
                      <FormDescription>
                        يتم توليده تلقائياً من العنوان - يدعم العربية والإنجليزية
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="excerpt"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>الوصف المختصر</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="وصف مختصر للموضوع يظهر في قائمة المواضيع"
                          rows={2}
                          data-testid="input-excerpt"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormItem>
                  <FormLabel>المحتوى</FormLabel>
                  <div className="border rounded-md" data-testid="editor-content">
                    <RichTextEditor
                      content={editorContent}
                      onChange={handleEditorChange}
                      placeholder="اكتب محتوى الموضوع هنا..."
                      dir="rtl"
                    />
                  </div>
                  <FormDescription>
                    استخدم أدوات التنسيق لإضافة نصوص، صور، روابط وغيرها
                  </FormDescription>
                </FormItem>

                <FormField
                  control={form.control}
                  name="heroImageUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>صورة الغلاف</FormLabel>
                      <FormControl>
                        <div className="space-y-3">
                          <input
                            type="file"
                            ref={heroFileInputRef}
                            onChange={handleHeroImageUpload}
                            accept="image/jpeg,image/png,image/gif,image/webp"
                            className="hidden"
                            data-testid="input-hero-file"
                          />
                          
                          {heroImagePreview ? (
                            <div className="relative inline-block">
                              <img
                                src={heroImagePreview}
                                alt="صورة الغلاف"
                                className="max-h-40 rounded-md border object-cover"
                                data-testid="preview-hero-image"
                              />
                              <Button
                                type="button"
                                size="icon"
                                variant="destructive"
                                className="absolute -top-2 -left-2 h-6 w-6"
                                onClick={() => {
                                  setHeroImagePreview("");
                                  form.setValue("heroImageUrl", "");
                                }}
                                data-testid="button-remove-hero"
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            <div
                              onClick={() => heroFileInputRef.current?.click()}
                              className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary hover:bg-muted/50 transition-colors"
                              data-testid="dropzone-hero"
                            >
                              {isUploadingHero ? (
                                <div className="flex flex-col items-center gap-2">
                                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                                  <span className="text-sm text-muted-foreground">جاري الرفع...</span>
                                </div>
                              ) : (
                                <div className="flex flex-col items-center gap-2">
                                  <Upload className="h-8 w-8 text-muted-foreground" />
                                  <span className="text-sm text-muted-foreground">
                                    اضغط لرفع صورة الغلاف
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    JPEG, PNG, GIF, WebP - حتى 10MB
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Collapsible open={seoExpanded} onOpenChange={setSeoExpanded}>
                  <CollapsibleTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full justify-start gap-2 text-muted-foreground"
                      data-testid="button-toggle-seo"
                    >
                      <ChevronRight className={`h-4 w-4 transition-transform ${seoExpanded ? 'rotate-90' : ''}`} />
                      بيانات SEO (اختياري)
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-4 pt-4">
                    <FormField
                      control={form.control}
                      name="seoMeta.metaTitle"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>عنوان SEO</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="عنوان يظهر في نتائج البحث"
                              data-testid="input-seo-title"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="seoMeta.metaDescription"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>وصف SEO</FormLabel>
                          <FormControl>
                            <Textarea
                              {...field}
                              placeholder="وصف يظهر في نتائج البحث (150-160 حرف)"
                              rows={2}
                              data-testid="input-seo-description"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="seoMeta.ogImage"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>صورة المشاركة (OG Image)</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="url"
                              placeholder="https://example.com/og-image.jpg"
                              data-testid="input-seo-og-image"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CollapsibleContent>
                </Collapsible>

                <DialogFooter className="gap-2 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsCreateDialogOpen(false);
                      setEditingTopic(null);
                      form.reset();
                    }}
                    data-testid="button-cancel"
                  >
                    إلغاء
                  </Button>
                  <Button
                    type="submit"
                    disabled={createMutation.isPending || updateMutation.isPending}
                    data-testid="button-submit"
                  >
                    {(createMutation.isPending || updateMutation.isPending) && (
                      <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                    )}
                    {editingTopic ? "حفظ التعديلات" : "إنشاء الموضوع"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        <AlertDialog
          open={!!deletingTopic}
          onOpenChange={(open) => {
            if (!open) setDeletingTopic(null);
          }}
        >
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle data-testid="text-delete-title">
                حذف الموضوع
              </AlertDialogTitle>
              <AlertDialogDescription data-testid="text-delete-description">
                هل أنت متأكد من حذف الموضوع "{deletingTopic?.title}"؟
                لا يمكن التراجع عن هذا الإجراء.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel data-testid="button-cancel-delete">
                إلغاء
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (deletingTopic) {
                    deleteMutation.mutate(deletingTopic.id);
                  }
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="button-confirm-delete"
              >
                {deleteMutation.isPending && (
                  <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                )}
                حذف
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}
