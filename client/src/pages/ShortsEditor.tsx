import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
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
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient, getCsrfToken } from "@/lib/queryClient";
import { ArrowRight, Loader2, Save, Upload } from "lucide-react";
import { ObjectUploader } from "@/components/ObjectUploader";
import type { Category, User } from "@shared/schema";

// Form validation schema based on insertShortSchema
const shortFormSchema = z.object({
  title: z.string().min(3, "العنوان يجب أن يكون 3 أحرف على الأقل"),
  description: z.string().optional(),
  slug: z.string().min(1, "الرابط المختصر مطلوب"),
  coverImage: z.string().url("رابط صورة الغلاف غير صحيح").min(1, "صورة الغلاف مطلوبة"),
  hlsUrl: z.string().url("رابط HLS غير صحيح").optional().or(z.literal("")),
  mp4Url: z.string().url("رابط MP4 غير صحيح").min(1, "رابط MP4 مطلوب"),
  duration: z.number().int().positive("المدة يجب أن تكون رقم موجب").optional().nullable(),
  categoryId: z.string().optional().nullable(),
  reporterId: z.string().optional().nullable(),
  status: z.enum(["draft", "published", "scheduled", "archived"]),
  publishType: z.enum(["instant", "scheduled"]),
  scheduledAt: z.string().optional().nullable(),
  isFeatured: z.boolean(),
  displayOrder: z.number().int().default(0),
});

type ShortFormData = z.infer<typeof shortFormSchema>;

type ShortWithDetails = {
  id: string;
  title: string;
  description: string | null;
  slug: string;
  coverImage: string;
  hlsUrl: string | null;
  mp4Url: string | null;
  duration: number | null;
  categoryId: string | null;
  reporterId: string | null;
  status: string;
  publishType: string;
  scheduledAt: string | null;
  publishedAt: string | null;
  isFeatured: boolean;
  displayOrder: number;
  category?: Category;
  reporter?: User;
};

// Simple transliteration for Arabic to Latin slug
function generateSlug(title: string): string {
  const arabicToLatin: { [key: string]: string } = {
    'ا': 'a', 'أ': 'a', 'إ': 'i', 'آ': 'aa',
    'ب': 'b', 'ت': 't', 'ث': 'th', 'ج': 'j',
    'ح': 'h', 'خ': 'kh', 'د': 'd', 'ذ': 'dh',
    'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'sh',
    'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z',
    'ع': 'a', 'غ': 'gh', 'ف': 'f', 'ق': 'q',
    'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n',
    'ه': 'h', 'و': 'w', 'ي': 'y', 'ى': 'a',
    'ة': 'h', 'ئ': 'y', 'ء': 'a',
  };

  let slug = title.toLowerCase();
  
  // Replace Arabic characters
  for (const [arabic, latin] of Object.entries(arabicToLatin)) {
    slug = slug.replace(new RegExp(arabic, 'g'), latin);
  }
  
  // Remove special characters and replace spaces with hyphens
  slug = slug
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
  
  return slug || Date.now().toString();
}

export default function ShortsEditor() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { user, isLoading: isUserLoading } = useAuth({ redirectToLogin: true });
  const { toast } = useToast();

  const shortId = params.id;
  const isEditMode = !!shortId && shortId !== "new";

  const form = useForm<ShortFormData>({
    resolver: zodResolver(shortFormSchema),
    defaultValues: {
      title: "",
      description: "",
      slug: "",
      coverImage: "",
      hlsUrl: "",
      mp4Url: "",
      duration: null,
      categoryId: null,
      reporterId: null,
      status: "draft",
      publishType: "instant",
      scheduledAt: null,
      isFeatured: false,
      displayOrder: 0,
    },
  });

  // Watch status and publishType to show/hide scheduledAt field
  const status = form.watch("status");
  const publishType = form.watch("publishType");
  const title = form.watch("title");

  // Auto-generate slug from title
  useEffect(() => {
    if (title && !isEditMode) {
      const slug = generateSlug(title);
      form.setValue("slug", slug);
    }
  }, [title, isEditMode, form]);

  // Fetch categories
  const { data: categoriesRaw, isLoading: categoriesLoading } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
    enabled: !!user,
    staleTime: 0,
  });
  const categories = Array.isArray(categoriesRaw) ? categoriesRaw : [];

  // Fetch reporters (users with reporter role)
  const { data: reportersRaw, isLoading: reportersLoading } = useQuery<User[]>({
    queryKey: ["/api/users", { role: "reporter" }],
    queryFn: async () => {
      const response = await fetch("/api/users?role=reporter", {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch reporters");
      return response.json();
    },
    enabled: !!user,
    staleTime: 0,
  });
  const reporters = Array.isArray(reportersRaw) ? reportersRaw : [];

  // Fetch existing short data when editing
  const { data: shortData, isLoading: shortLoading } = useQuery<ShortWithDetails>({
    queryKey: ["/api/admin/shorts", shortId],
    queryFn: async () => {
      const response = await fetch(`/api/admin/shorts/${shortId}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch short");
      return response.json();
    },
    enabled: isEditMode && !!user,
    staleTime: 0,
  });

  // Load short data into form when editing
  useEffect(() => {
    if (shortData && isEditMode) {
      form.reset({
        title: shortData.title,
        description: shortData.description || "",
        slug: shortData.slug,
        coverImage: shortData.coverImage,
        hlsUrl: shortData.hlsUrl || "",
        mp4Url: shortData.mp4Url || "",
        duration: shortData.duration,
        categoryId: shortData.categoryId,
        reporterId: shortData.reporterId,
        status: shortData.status as any,
        publishType: shortData.publishType as any,
        scheduledAt: shortData.scheduledAt
          ? new Date(shortData.scheduledAt).toISOString().slice(0, 16)
          : null,
        isFeatured: shortData.isFeatured,
        displayOrder: shortData.displayOrder,
      });
    }
  }, [shortData, isEditMode, form]);

  // Create/Update mutation
  const saveMutation = useMutation({
    mutationFn: async (data: ShortFormData) => {
      const payload = {
        ...data,
        duration: data.duration || null,
        categoryId: data.categoryId || null,
        reporterId: data.reporterId || null,
        hlsUrl: data.hlsUrl || null,
        mp4Url: data.mp4Url || null,
        scheduledAt: data.scheduledAt || null,
      };

      if (isEditMode) {
        return await apiRequest(`/api/admin/shorts/${shortId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        return await apiRequest("/api/admin/shorts", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shorts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/shorts"] });
      toast({
        title: "تم الحفظ",
        description: isEditMode ? "تم تحديث المقطع بنجاح" : "تم إنشاء المقطع بنجاح",
      });
      navigate("/dashboard/shorts");
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل حفظ المقطع",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ShortFormData) => {
    saveMutation.mutate(data);
  };

  // Check permissions
  const hasPermission = () => {
    if (!user || !user.role) return false;
    // For now, simple role check - in production would use RBAC
    const allowedRoles = ["admin", "system_admin", "editor", "reporter"];
    return allowedRoles.includes(user.role);
  };

  if (isUserLoading || !user) {
    return (
      <DashboardLayout>
        <Skeleton className="h-96" data-testid="loading-skeleton" />
      </DashboardLayout>
    );
  }

  if (!hasPermission()) {
    return (
      <DashboardLayout>
        <Card>
          <CardHeader>
            <CardTitle>غير مصرح</CardTitle>
          </CardHeader>
          <CardContent>
            <p>لا تملك صلاحية {isEditMode ? "تعديل" : "إنشاء"} المقاطع القصيرة</p>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  if (isEditMode && shortLoading) {
    return (
      <DashboardLayout>
        <Skeleton className="h-96" data-testid="loading-skeleton" />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6" dir="rtl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold" data-testid="heading-editor-title">
            {isEditMode ? "تعديل المقطع" : "إنشاء مقطع قصير"}
          </h1>
          <Button
            variant="ghost"
            onClick={() => navigate("/dashboard/shorts")}
            data-testid="button-back"
          >
            <ArrowRight className="ml-2 h-4 w-4" />
            رجوع
          </Button>
        </div>

        {/* Form */}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Column - Metadata */}
              <Card>
                <CardHeader>
                  <CardTitle>معلومات أساسية</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Title */}
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>العنوان *</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="أدخل عنوان المقطع"
                            data-testid="input-title"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Description */}
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>الوصف</FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            placeholder="أدخل وصف المقطع (اختياري)"
                            rows={4}
                            data-testid="textarea-description"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Slug */}
                  <FormField
                    control={form.control}
                    name="slug"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>الرابط المختصر *</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="short-slug"
                            data-testid="input-slug"
                            dir="ltr"
                          />
                        </FormControl>
                        <FormDescription>
                          يتم إنشاؤه تلقائياً من العنوان
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Category */}
                  <FormField
                    control={form.control}
                    name="categoryId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>القسم</FormLabel>
                        <Select
                          value={field.value || ""}
                          onValueChange={field.onChange}
                          disabled={categoriesLoading}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-category">
                              <SelectValue placeholder="اختر القسم" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {categories.map((category) => (
                              <SelectItem
                                key={category.id}
                                value={category.id}
                                data-testid={`select-category-${category.id}`}
                              >
                                {category.nameAr}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Reporter */}
                  <FormField
                    control={form.control}
                    name="reporterId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>المراسل</FormLabel>
                        <Select
                          value={field.value || ""}
                          onValueChange={field.onChange}
                          disabled={reportersLoading}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-reporter">
                              <SelectValue placeholder="اختر المراسل" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {reporters.map((reporter) => (
                              <SelectItem
                                key={reporter.id}
                                value={reporter.id}
                                data-testid={`select-reporter-${reporter.id}`}
                              >
                                {reporter.firstName && reporter.lastName
                                  ? `${reporter.firstName} ${reporter.lastName}`
                                  : reporter.email}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Duration */}
                  <FormField
                    control={form.control}
                    name="duration"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>المدة (بالثواني)</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            placeholder="60"
                            value={field.value || ""}
                            onChange={(e) =>
                              field.onChange(
                                e.target.value ? parseInt(e.target.value, 10) : null
                              )
                            }
                            data-testid="input-duration"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              {/* Right Column - Media & Settings */}
              <Card>
                <CardHeader>
                  <CardTitle>الوسائط والإعدادات</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Cover Image */}
                  <FormField
                    control={form.control}
                    name="coverImage"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>صورة الغلاف *</FormLabel>
                        <div className="flex gap-2">
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="https://example.com/cover.jpg"
                              dir="ltr"
                              data-testid="input-cover-image"
                              className="flex-1"
                            />
                          </FormControl>
                          <ObjectUploader
                            maxNumberOfFiles={1}
                            maxFileSize={10485760}
                            allowedFileTypes={['.jpg', '.jpeg', '.png', '.gif', '.webp']}
                            onGetUploadParameters={async () => {
                              const csrfToken = getCsrfToken();
                              const response = await fetch('/api/admin/shorts/upload', {
                                method: 'POST',
                                credentials: 'include',
                                headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : {},
                              });
                              if (!response.ok) throw new Error('Failed to get upload URL');
                              const data = await response.json();
                              return {
                                method: 'PUT' as const,
                                url: data.uploadURL,
                              };
                            }}
                            onComplete={(result) => {
                              const uploadedUrl = result.successful?.[0]?.uploadURL;
                              if (uploadedUrl) {
                                form.setValue('coverImage', uploadedUrl);
                                toast({
                                  title: "تم رفع الصورة بنجاح",
                                  description: "تم رفع صورة الغلاف بنجاح",
                                });
                              }
                            }}
                            size="default"
                            variant="outline"
                          >
                            <Upload className="h-4 w-4 ml-2" />
                            رفع
                          </ObjectUploader>
                        </div>
                        <FormDescription>
                          صيغ مدعومة: JPG, PNG, GIF, WebP (حد أقصى 10 ميجابايت)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* MP4 URL */}
                  <FormField
                    control={form.control}
                    name="mp4Url"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>فيديو MP4 *</FormLabel>
                        <div className="flex gap-2">
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="https://example.com/video.mp4"
                              dir="ltr"
                              data-testid="input-mp4-url"
                              className="flex-1"
                            />
                          </FormControl>
                          <ObjectUploader
                            maxNumberOfFiles={1}
                            maxFileSize={524288000}
                            allowedFileTypes={['.mp4', '.mov', '.avi']}
                            onGetUploadParameters={async () => {
                              const csrfToken = getCsrfToken();
                              const response = await fetch('/api/admin/shorts/upload', {
                                method: 'POST',
                                credentials: 'include',
                                headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : {},
                              });
                              if (!response.ok) throw new Error('Failed to get upload URL');
                              const data = await response.json();
                              return {
                                method: 'PUT' as const,
                                url: data.uploadURL,
                              };
                            }}
                            onComplete={(result) => {
                              const uploadedUrl = result.successful?.[0]?.uploadURL;
                              if (uploadedUrl) {
                                form.setValue('mp4Url', uploadedUrl);
                                toast({
                                  title: "تم رفع الفيديو بنجاح",
                                  description: "تم رفع فيديو MP4 بنجاح",
                                });
                              }
                            }}
                            size="default"
                            variant="outline"
                          >
                            <Upload className="h-4 w-4 ml-2" />
                            رفع
                          </ObjectUploader>
                        </div>
                        <FormDescription>
                          صيغ مدعومة: MP4, MOV, AVI (حد أقصى 500 ميجابايت)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* HLS URL */}
                  <FormField
                    control={form.control}
                    name="hlsUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>ملف HLS (m3u8) - اختياري</FormLabel>
                        <div className="flex gap-2">
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="https://example.com/video.m3u8"
                              dir="ltr"
                              data-testid="input-hls-url"
                              className="flex-1"
                            />
                          </FormControl>
                          <ObjectUploader
                            maxNumberOfFiles={1}
                            maxFileSize={52428800}
                            allowedFileTypes={['.m3u8', '.ts']}
                            onGetUploadParameters={async () => {
                              const csrfToken = getCsrfToken();
                              const response = await fetch('/api/admin/shorts/upload', {
                                method: 'POST',
                                credentials: 'include',
                                headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : {},
                              });
                              if (!response.ok) throw new Error('Failed to get upload URL');
                              const data = await response.json();
                              return {
                                method: 'PUT' as const,
                                url: data.uploadURL,
                              };
                            }}
                            onComplete={(result) => {
                              const uploadedUrl = result.successful?.[0]?.uploadURL;
                              if (uploadedUrl) {
                                form.setValue('hlsUrl', uploadedUrl);
                                toast({
                                  title: "تم رفع ملف HLS بنجاح",
                                  description: "تم رفع ملف البث التكيفي بنجاح",
                                });
                              }
                            }}
                            size="default"
                            variant="outline"
                          >
                            <Upload className="h-4 w-4 ml-2" />
                            رفع
                          </ObjectUploader>
                        </div>
                        <FormDescription>
                          للبث التكيفي - صيغ مدعومة: m3u8, ts (حد أقصى 50 ميجابايت)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Status */}
                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>الحالة *</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger data-testid="select-status">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="draft" data-testid="select-status-draft">
                              مسودة
                            </SelectItem>
                            <SelectItem value="published" data-testid="select-status-published">
                              منشور
                            </SelectItem>
                            <SelectItem value="scheduled" data-testid="select-status-scheduled">
                              مجدول
                            </SelectItem>
                            <SelectItem value="archived" data-testid="select-status-archived">
                              مؤرشف
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Publish Type */}
                  <FormField
                    control={form.control}
                    name="publishType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>نوع النشر *</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger data-testid="select-publish-type">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="instant" data-testid="select-publish-type-instant">
                              فوري
                            </SelectItem>
                            <SelectItem value="scheduled" data-testid="select-publish-type-scheduled">
                              مجدول
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Scheduled Date (show only if status is published/scheduled or publishType is scheduled) */}
                  {(status === "published" || status === "scheduled" || publishType === "scheduled") && (
                    <FormField
                      control={form.control}
                      name="scheduledAt"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>تاريخ ووقت النشر</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="datetime-local"
                              value={field.value || ""}
                              data-testid="input-scheduled-at"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {/* Is Featured */}
                  <FormField
                    control={form.control}
                    name="isFeatured"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="checkbox-is-featured"
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none mr-2">
                          <FormLabel>مقطع مميز</FormLabel>
                          <FormDescription>
                            عرض هذا المقطع في القسم المميز
                          </FormDescription>
                        </div>
                      </FormItem>
                    )}
                  />

                  {/* Display Order */}
                  <FormField
                    control={form.control}
                    name="displayOrder"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>ترتيب العرض</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            value={field.value}
                            onChange={(e) =>
                              field.onChange(parseInt(e.target.value, 10) || 0)
                            }
                            data-testid="input-display-order"
                          />
                        </FormControl>
                        <FormDescription>
                          رقم أكبر = أولوية أعلى في الترتيب
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/dashboard/shorts")}
                disabled={saveMutation.isPending}
                data-testid="button-cancel"
              >
                إلغاء
              </Button>
              <Button
                type="submit"
                disabled={saveMutation.isPending}
                data-testid="button-save"
              >
                {saveMutation.isPending ? (
                  <>
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                    جاري الحفظ...
                  </>
                ) : (
                  <>
                    <Save className="ml-2 h-4 w-4" />
                    حفظ
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </DashboardLayout>
  );
}
