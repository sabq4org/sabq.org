import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useRoleProtection } from "@/hooks/useRoleProtection";
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
import { X, Save, Send, ArrowRight } from "lucide-react";
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
  coverImageUrl: z.string().url("يجب إدخال رابط صحيح").optional().or(z.literal("")),
  categoryId: z.string().min(1, "يجب اختيار التصنيف"),
  tags: z.array(z.string()).optional(),
});

type ArticleFormData = z.infer<typeof articleSchema>;

interface Category {
  id: string;
  name: string;
}

interface Tag {
  id: string;
  name: string;
}

interface Article {
  id: string;
  title: string;
  titleEn: string | null;
  summary: string;
  summaryEn: string | null;
  content: string;
  coverImageUrl: string | null;
  categoryId: string;
  tags: string[];
  status: string;
}

export default function PublisherArticleEditor() {
  useRoleProtection('publisher');
  const { id } = useParams<{ id?: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagSearch, setTagSearch] = useState("");

  const isEditMode = !!id;

  // Fetch categories
  const { data: categoriesRaw } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });
  const categories = Array.isArray(categoriesRaw) ? categoriesRaw : [];

  // Fetch tags
  const { data: tagsData } = useQuery<{ tags: Tag[] }>({
    queryKey: ["/api/tags"],
  });

  // Fetch article if editing
  const { data: articleData, isLoading: articleLoading } = useQuery<Article>({
    queryKey: [`/api/publisher/articles/${id}`],
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
      coverImageUrl: "",
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
        class: "prose prose-sm sm:prose lg:prose-lg xl:prose-2xl focus:outline-none min-h-[300px] p-4",
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
        coverImageUrl: articleData.coverImageUrl || "",
        categoryId: articleData.categoryId,
        tags: articleData.tags || [],
      });
      editor.commands.setContent(articleData.content);
      setSelectedTags(articleData.tags || []);
    }
  }, [articleData, form, editor]);

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: ArticleFormData & { status: string }) => {
      return apiRequest("/api/publisher/articles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/publisher/articles"] });
      queryClient.invalidateQueries({ queryKey: ["/api/publisher/dashboard"] });
      toast({
        title: "نجح",
        description: "تم حفظ المقال بنجاح",
      });
      setLocation("/dashboard/publisher/articles");
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "خطأ",
        description: error.message || "حدث خطأ أثناء حفظ المقال",
      });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (data: ArticleFormData & { status: string }) => {
      return apiRequest(`/api/publisher/articles/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/publisher/articles"] });
      queryClient.invalidateQueries({ queryKey: [`/api/publisher/articles/${id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/publisher/dashboard"] });
      toast({
        title: "نجح",
        description: "تم تحديث المقال بنجاح",
      });
      setLocation("/dashboard/publisher/articles");
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "خطأ",
        description: error.message || "حدث خطأ أثناء تحديث المقال",
      });
    },
  });

  const onSubmit = (status: "draft" | "pending_review") => {
    form.handleSubmit((data) => {
      const payload = {
        ...data,
        tags: selectedTags,
        status,
      };

      if (isEditMode) {
        updateMutation.mutate(payload);
      } else {
        createMutation.mutate(payload);
      }
    })();
  };

  const handleTagToggle = (tagId: string) => {
    setSelectedTags((prev) =>
      prev.includes(tagId) ? prev.filter((t) => t !== tagId) : [...prev, tagId]
    );
  };

  const filteredTags = tagsData?.tags.filter((tag) =>
    tag.name.toLowerCase().includes(tagSearch.toLowerCase())
  ) || [];

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
          {isEditMode ? "تعديل المقال" : "إنشاء مقال جديد"}
        </h1>
        <p className="text-muted-foreground mt-1">
          {isEditMode ? "قم بتعديل المقال وإرساله للمراجعة" : "أنشئ مقال جديد وأرسله للمراجعة"}
        </p>
      </div>

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
              <CardTitle>رابط صورة الغلاف - اختياري</CardTitle>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="coverImageUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input
                        placeholder="https://example.com/image.jpg"
                        {...field}
                        data-testid="input-cover-image"
                      />
                    </FormControl>
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
                            {category.nameAr}
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
                    const tag = tagsData?.tags.find((t) => t.id === tagId);
                    return tag ? (
                      <Badge
                        key={tagId}
                        variant="secondary"
                        className="cursor-pointer"
                        onClick={() => handleTagToggle(tagId)}
                        data-testid={`badge-tag-${tagId}`}
                      >
                        {tag.name}
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
                      {tag.name}
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
                  onClick={() => onSubmit("draft")}
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-save-draft"
                >
                  <Save className="ml-2 h-4 w-4" />
                  حفظ كمسودة
                </Button>
                <Button
                  type="button"
                  onClick={() => onSubmit("pending_review")}
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-submit-review"
                >
                  <Send className="ml-2 h-4 w-4" />
                  إرسال للمراجعة
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
