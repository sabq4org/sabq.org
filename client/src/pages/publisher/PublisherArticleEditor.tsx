import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { usePublisherAccess } from "@/hooks/usePublisherAccess";
import { PublisherLayout } from "@/components/publisher/PublisherLayout";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
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
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { X, Save, Send, ArrowRight, Upload, Loader2, AlertTriangle, Zap } from "lucide-react";
import { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEditor, EditorContent } from "@tiptap/react";
import Placeholder from "@tiptap/extension-placeholder";

const articleSchema = z.object({
  title: z.string().min(10, "العنوان يجب أن يكون 10 أحرف على الأقل"),
  titleEn: z.string().optional(),
  summary: z.string().min(20, "الملخص يجب أن يكون 20 حرف على الأقل"),
  summaryEn: z.string().optional(),
  content: z.string().min(50, "المحتوى يجب أن يكون 50 حرف على الأقل"),
  // كان الحقل coverImageUrl ولا يُحفظ إطلاقاً — عمود المقال الفعلي imageUrl
  imageUrl: z.string().url("يجب إدخال رابط صحيح").optional().or(z.literal("")),
  categoryId: z.string().min(1, "يجب اختيار التصنيف"),
  tags: z.array(z.string()).optional(),
});

type ArticleFormData = z.infer<typeof articleSchema>;

interface Category {
  id: string;
  name: string;
  nameAr?: string | null;
}

interface Tag {
  id: string;
  // /api/tags يعيد nameAr/nameEn؛ name احتياط لأي شكل قديم
  name?: string | null;
  nameAr?: string | null;
  nameEn?: string | null;
}

const tagLabel = (tag: Tag) => tag.nameAr || tag.name || tag.nameEn || "";

interface Article {
  id: string;
  title: string;
  titleEn: string | null;
  summary: string;
  summaryEn: string | null;
  content: string;
  imageUrl: string | null;
  categoryId: string;
  tags: string[];
  status: string;
  publisherStatus: string | null;
  publisherReviewNotes: string | null;
}

export default function PublisherArticleEditor() {
  usePublisherAccess();
  const { id } = useParams<{ id?: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagSearch, setTagSearch] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const isEditMode = !!id;

  // نعرف إن كان الناشر موثوقاً (نشر فوري) لضبط نص زر الإرسال
  const { data: overview } = useQuery<{ publisher: { autoPublish: boolean } }>({
    queryKey: ["/api/publisher/portal/overview"],
  });
  const autoPublish = overview?.publisher?.autoPublish === true;

  // الناشر الموثوق يكتب من المحرر الأساسي الكامل (وسائط، جدولة، توليد ذكي)
  // وينشر منه مباشرة — هذا النموذج المبسط مخصص لمسار المراجعة فقط
  useEffect(() => {
    if (!isEditMode && autoPublish) {
      setLocation("/dashboard/articles/new", { replace: true });
    }
  }, [autoPublish, isEditMode, setLocation]);

  // Fetch categories
  const { data: categoriesRaw } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });
  const categories = Array.isArray(categoriesRaw) ? categoriesRaw : [];

  // Fetch tags — /api/tags يعيد مصفوفة مباشرة؛ نتحوط لأي شكل
  // (اتفاقية null-guard في المشروع — كانت الصفحة تنهار على tags.filter)
  const { data: tagsRaw } = useQuery<Tag[] | { tags: Tag[] }>({
    queryKey: ["/api/tags"],
  });
  const allTags: Tag[] = Array.isArray(tagsRaw)
    ? tagsRaw
    : Array.isArray((tagsRaw as { tags?: Tag[] } | undefined)?.tags)
      ? (tagsRaw as { tags: Tag[] }).tags
      : [];

  // Fetch article if editing — كان المسار /api/publisher/articles/:id غير
  // موجود أصلاً في الخادم؛ البوابة الجديدة توفره بفحص ملكية
  const { data: articleData, isLoading: articleLoading } = useQuery<Article>({
    queryKey: [`/api/publisher/portal/articles/${id}`],
    enabled: isEditMode,
  });

  const form = useForm<ArticleFormData>({
    resolver: zodResolver(articleSchema),
    defaultValues: {
      title: "",
      titleEn: "",
      summary: "",
      summaryEn: "",
      content: "",
      imageUrl: "",
      categoryId: "",
      tags: [],
    },
  });

  // Tiptap editor
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: "اكتب محتوى المقال هنا...",
      }),
    ],
    content: "",
    editorProps: {
      attributes: {
        class: "prose prose-sm sm:prose lg:prose-lg xl:prose-2xl dark:prose-invert text-foreground focus:outline-none min-h-[300px] p-4",
        "data-testid": "publisher-rich-text-editor-content",
      },
    },
    onUpdate: ({ editor }) => {
      form.setValue("content", editor.getHTML());
    },
  });

  // Update form when article data is loaded
  useEffect(() => {
    if (articleData && editor) {
      form.reset({
        title: articleData.title,
        titleEn: articleData.titleEn || "",
        summary: articleData.summary,
        summaryEn: articleData.summaryEn || "",
        content: articleData.content,
        imageUrl: articleData.imageUrl || "",
        categoryId: articleData.categoryId,
        tags: articleData.tags || [],
      });
      editor.commands.setContent(articleData.content);
      setSelectedTags(articleData.tags || []);
    }
  }, [articleData, form, editor]);

  const invalidatePortalQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/publisher/portal/articles"] });
    queryClient.invalidateQueries({ queryKey: ["/api/publisher/portal/overview"] });
    if (id) queryClient.invalidateQueries({ queryKey: [`/api/publisher/portal/articles/${id}`] });
  };

  // حفظ كمسودة، أو حفظ + إرسال للمراجعة (نشر فوري للناشر الموثوق)
  const onSubmit = (submitForReview: boolean) => {
    form.handleSubmit(async (data) => {
      setIsSaving(true);
      try {
        const payload = { ...data, tags: selectedTags };

        if (isEditMode) {
          await apiRequest(`/api/publisher/articles/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (submitForReview) {
            const result = await apiRequest<{ message: string; published: boolean }>(
              `/api/publisher/portal/articles/${id}/submit`,
              { method: "POST", headers: { "Content-Type": "application/json" } },
            );
            toast({
              title: result.published ? "نُشرت المادة 🎉" : "أُرسلت للمراجعة",
              description: result.message,
            });
          } else {
            toast({ title: "تم الحفظ", description: "حُفظت المادة كمسودة" });
          }
        } else {
          const created = await apiRequest<{ submit: { ok: boolean; published: boolean; message: string } | null }>(
            "/api/publisher/articles",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...payload, submitForReview }),
            },
          );
          if (submitForReview && created.submit) {
            toast({
              title: created.submit.published ? "نُشرت المادة 🎉" : created.submit.ok ? "أُرسلت للمراجعة" : "حُفظت كمسودة",
              description: created.submit.message,
              variant: created.submit.ok ? "default" : "destructive",
            });
          } else {
            toast({ title: "تم الحفظ", description: "حُفظت المادة كمسودة" });
          }
        }

        invalidatePortalQueries();
        setLocation("/dashboard/publisher/articles");
      } catch (error: any) {
        toast({
          variant: "destructive",
          title: "خطأ",
          description: error.message || "حدث خطأ أثناء حفظ المادة",
        });
      } finally {
        setIsSaving(false);
      }
    })();
  };

  // رفع صورة الغلاف إلى مكتبة الوسائط (بدل لصق رابط نصي)
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ variant: "destructive", title: "خطأ", description: "يرجى اختيار ملف صورة" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ variant: "destructive", title: "خطأ", description: "حجم الصورة يتجاوز 10 ميجابايت" });
      return;
    }
    setIsUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const uploaded = await apiRequest<{ url: string }>("/api/media/upload", {
        method: "POST",
        body: formData,
        isFormData: true,
      });
      form.setValue("imageUrl", uploaded.url, { shouldValidate: true });
      toast({ title: "تم رفع الصورة", description: "أُضيفت صورة الغلاف بنجاح" });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "خطأ",
        description: error.message || "فشل رفع الصورة",
      });
    } finally {
      setIsUploadingImage(false);
      e.target.value = "";
    }
  };

  const handleTagToggle = (tagId: string) => {
    setSelectedTags((prev) =>
      prev.includes(tagId) ? prev.filter((t) => t !== tagId) : [...prev, tagId]
    );
  };

  const filteredTags = allTags.filter((tag) =>
    tagLabel(tag).toLowerCase().includes(tagSearch.toLowerCase())
  );

  if (isEditMode && articleLoading) {
    return (
      <PublisherLayout>
        <div className="space-y-6" dir="rtl">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-96" />
        </div>
      </PublisherLayout>
    );
  }

  // Check if article can be edited
  if (isEditMode && articleData && articleData.status !== "draft") {
    return (
      <PublisherLayout>
        <div dir="rtl">
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-lg font-medium">لا يمكن تعديل هذا المقال</p>
              <p className="text-muted-foreground mt-2">يمكن تعديل المسودات فقط</p>
              <Button
                className="mt-4"
                onClick={() => setLocation("/dashboard/publisher/articles")}
                data-testid="button-back"
              >
                <ArrowRight className="ml-2 h-4 w-4" />
                العودة للقائمة
              </Button>
            </CardContent>
          </Card>
        </div>
      </PublisherLayout>
    );
  }

  return (
    <PublisherLayout>
      <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold" data-testid="text-page-title">
          {isEditMode ? "تعديل المادة" : "خبر جديد"}
        </h1>
        <p className="text-muted-foreground mt-1">
          {autoPublish
            ? "مادتك تُنشر مباشرة فور الإرسال (ناشر موثوق) ويُخصم رصيد واحد"
            : isEditMode ? "عدّل المادة وأعد إرسالها للمراجعة" : "أنشئ مادة جديدة وأرسلها للمراجعة"}
        </p>
      </div>

      {/* ملاحظات المحرر عند «تحتاج تعديلات» */}
      {isEditMode && articleData?.publisherStatus === "needs_changes" && (
        <div
          className="flex items-start gap-3 rounded-lg border border-yellow-300 bg-yellow-50 p-4 text-yellow-900 dark:border-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-200"
          data-testid="banner-needs-changes"
        >
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">المحرر طلب تعديلات على هذه المادة</p>
            {articleData.publisherReviewNotes && (
              <p className="mt-1 text-sm whitespace-pre-wrap">{articleData.publisherReviewNotes}</p>
            )}
            <p className="mt-2 text-xs opacity-80">عدّل المادة ثم اضغط «إرسال للمراجعة» لإعادتها لفريق التحرير.</p>
          </div>
        </div>
      )}

      <Form {...form}>
        <form className="space-y-6">
          {/* Title Arabic */}
          <Card data-testid="card-title-ar">
            <CardHeader>
              <CardTitle>العنوان (عربي) *</CardTitle>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input
                        placeholder="اكتب عنوان المقال بالعربية"
                        {...field}
                        data-testid="input-title"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Title English */}
          <Card data-testid="card-title-en">
            <CardHeader>
              <CardTitle>العنوان (إنجليزي) - اختياري</CardTitle>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="titleEn"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input
                        placeholder="Enter article title in English (optional)"
                        {...field}
                        data-testid="input-title-en"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Summary Arabic */}
          <Card data-testid="card-summary-ar">
            <CardHeader>
              <CardTitle>الملخص (عربي) *</CardTitle>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="summary"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Textarea
                        placeholder="اكتب ملخص المقال بالعربية"
                        rows={3}
                        {...field}
                        data-testid="textarea-summary"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Summary English */}
          <Card data-testid="card-summary-en">
            <CardHeader>
              <CardTitle>الملخص (إنجليزي) - اختياري</CardTitle>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="summaryEn"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Textarea
                        placeholder="Enter article summary in English (optional)"
                        rows={3}
                        {...field}
                        data-testid="textarea-summary-en"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Content Editor */}
          <Card data-testid="card-content">
            <CardHeader>
              <CardTitle>المحتوى (عربي) *</CardTitle>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="content"
                render={() => (
                  <FormItem>
                    <FormControl>
                      <div className="border rounded-md" data-testid="editor-content">
                        <EditorContent editor={editor} />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Cover Image */}
          <Card data-testid="card-cover-image">
            <CardHeader>
              <CardTitle>صورة الغلاف - اختياري</CardTitle>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="imageUrl"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-start gap-4">
                      {field.value ? (
                        <div className="relative">
                          <img
                            src={field.value}
                            alt="صورة الغلاف"
                            className="h-28 w-44 rounded-md border object-cover"
                            data-testid="img-cover-preview"
                          />
                          <Button
                            type="button"
                            variant="destructive"
                            size="icon"
                            className="absolute -top-2 -left-2 h-6 w-6"
                            onClick={() => form.setValue("imageUrl", "")}
                            data-testid="button-remove-cover"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex h-28 w-44 items-center justify-center rounded-md border-2 border-dashed bg-muted">
                          {isUploadingImage
                            ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            : <Upload className="h-6 w-6 text-muted-foreground" />}
                        </div>
                      )}
                      <div className="flex-1 space-y-2">
                        <Input
                          type="file"
                          accept="image/*"
                          onChange={handleImageUpload}
                          disabled={isUploadingImage}
                          className="cursor-pointer"
                          data-testid="input-cover-file"
                        />
                        <p className="text-xs text-muted-foreground">
                          {isUploadingImage ? "جاري رفع الصورة..." : "JPG أو PNG أو WEBP، بحد أقصى 10 ميجابايت"}
                        </p>
                      </div>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Category */}
          <Card data-testid="card-category">
            <CardHeader>
              <CardTitle>التصنيف *</CardTitle>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="categoryId"
                render={({ field }) => (
                  <FormItem>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-category">
                          <SelectValue placeholder="اختر التصنيف" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categories.map((category) => (
                          <SelectItem key={category.id} value={category.id}>
                            {category.nameAr || category.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Tags */}
          <Card data-testid="card-tags">
            <CardHeader>
              <CardTitle>الوسوم - اختياري</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <Input
                  placeholder="بحث عن وسم..."
                  value={tagSearch}
                  onChange={(e) => setTagSearch(e.target.value)}
                  data-testid="input-tag-search"
                />
                <div className="flex flex-wrap gap-2">
                  {selectedTags.map((tagId) => {
                    const tag = allTags.find((t) => t.id === tagId);
                    return tag ? (
                      <Badge
                        key={tagId}
                        variant="secondary"
                        className="cursor-pointer"
                        onClick={() => handleTagToggle(tagId)}
                        data-testid={`badge-tag-${tagId}`}
                      >
                        {tagLabel(tag)}
                        <X className="mr-1 h-3 w-3" />
                      </Badge>
                    ) : null;
                  })}
                </div>
                <div className="max-h-48 overflow-y-auto border rounded-md p-2 space-y-1">
                  {filteredTags.map((tag) => (
                    <div
                      key={tag.id}
                      className={`p-2 rounded cursor-pointer hover-elevate ${
                        selectedTags.includes(tag.id) ? "bg-primary/10" : ""
                      }`}
                      onClick={() => handleTagToggle(tag.id)}
                      data-testid={`tag-option-${tag.id}`}
                    >
                      {tagLabel(tag)}
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <Card data-testid="card-actions">
            <CardContent className="pt-6">
              <div className="flex gap-4 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setLocation("/dashboard/publisher/articles")}
                  data-testid="button-cancel"
                >
                  إلغاء
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => onSubmit(false)}
                  disabled={isSaving || isUploadingImage}
                  data-testid="button-save-draft"
                >
                  {isSaving ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Save className="ml-2 h-4 w-4" />}
                  حفظ كمسودة
                </Button>
                <Button
                  type="button"
                  onClick={() => onSubmit(true)}
                  disabled={isSaving || isUploadingImage}
                  data-testid="button-submit-review"
                >
                  {isSaving
                    ? <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                    : autoPublish ? <Zap className="ml-2 h-4 w-4" /> : <Send className="ml-2 h-4 w-4" />}
                  {autoPublish ? "نشر الآن" : "إرسال للمراجعة"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </Form>
      </div>
    </PublisherLayout>
  );
}
