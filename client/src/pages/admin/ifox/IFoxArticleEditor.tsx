import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ArticleWithDetails } from "@shared/schema";
import { IFoxSidebar } from "@/components/admin/ifox/IFoxSidebar";
import { ImageFocalPointPicker } from "@/components/ImageFocalPointPicker";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RichTextEditor } from "@/components/RichTextEditor";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useRoleProtection } from "@/hooks/useRoleProtection";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import {
  Save,
  Send,
  Clock,
  Calendar as CalendarIcon,
  ArrowLeft,
  Eye,
  Sparkles,
  Brain,
  Lightbulb,
  TrendingUp,
  ImagePlus,
  Tag,
  Globe,
  AlertCircle,
  RefreshCw,
  Laptop,
  BookOpen,
  Gamepad2,
  Heart,
  DollarSign,
  ChevronRight,
  Wand2,
  BarChart3,
  X,
  FileText,
  Mic,
  Loader2,
  Focus,
  ChevronDown
} from "lucide-react";

// iFox Categories
const IFOX_CATEGORIES = [
  { slug: 'ai-news', nameAr: 'آي سبق - أخبار AI', icon: Sparkles, color: "text-[hsl(var(--ifox-accent-primary))]", bgColor: "bg-[hsl(var(--ifox-accent-primary)/.1)]" },
  { slug: 'ai-insights', nameAr: 'آي عمق - تحليلات', icon: BarChart3, color: "text-[hsl(var(--ifox-info))]", bgColor: "bg-[hsl(var(--ifox-info)/.1)]" },
  { slug: 'ai-opinions', nameAr: 'آي رأي - آراء', icon: FileText, color: "text-[hsl(var(--ifox-warning))]", bgColor: "bg-[hsl(var(--ifox-warning)/.1)]" },
  { slug: 'ai-tools', nameAr: 'آي تطبيق - أدوات', icon: Laptop, color: "text-[hsl(var(--ifox-success))]", bgColor: "bg-[hsl(var(--ifox-success)/.1)]" },
  { slug: 'ai-voice', nameAr: 'آي صوت - بودكاست', icon: Mic, color: "text-[hsl(var(--ifox-error))]", bgColor: "bg-[hsl(var(--ifox-error)/.1)]" },
];

const articleSchema = z.object({
  title: z.string().min(10, "العنوان يجب أن يكون 10 أحرف على الأقل"),
  titleEn: z.string().optional(),
  slug: z.string().optional(),
  excerpt: z.string().min(50, "الوصف يجب أن يكون 50 حرف على الأقل"),
  content: z.string().min(100, "المحتوى يجب أن يكون 100 حرف على الأقل"),
  category: z.string().min(1, "يرجى اختيار التصنيف"),
  tags: z.array(z.string()).optional(),
  featuredImage: z.string().optional(),
  publishDate: z.date().optional(),
  status: z.enum(["draft", "published", "scheduled"]),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
  seoKeywords: z.array(z.string()).optional(),
});

type ArticleFormData = z.infer<typeof articleSchema>;

export default function IFoxArticleEditor() {
  useRoleProtection('admin');
  const { toast } = useToast();
  const params = useParams();
  const [, setLocation] = useLocation();
  const articleId = params.id;
  const isEditMode = !!articleId;

  const [previewMode, setPreviewMode] = useState(false);
  const [aiScore, setAiScore] = useState(0);
  const [sentimentScore, setSentimentScore] = useState<{ positive: number; negative: number; neutral: number } | null>(null);
  const [generatingTitle, setGeneratingTitle] = useState(false);
  const [generatingSuggestions, setGeneratingSuggestions] = useState(false);
  const [analyzingContent, setAnalyzingContent] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [exitDialog, setExitDialog] = useState(false);
  const [captionAltText, setCaptionAltText] = useState("");
  const [captionPlain, setCaptionPlain] = useState("");
  const [captionSourceName, setCaptionSourceName] = useState("");
  const [imageFocalPoint, setImageFocalPoint] = useState<{x: number; y: number; subject?: string; confidence?: string} | null>(null);
  const [focalPointOpen, setFocalPointOpen] = useState(false);

  // Fetch iFox categories using dedicated endpoint
  const { data: ifoxCategories, isLoading: categoriesLoading, isError: categoriesError } = useQuery<Array<{ id: string; slug: string; nameAr: string }>>({
    queryKey: ['/api/admin/ifox/categories'], // New dedicated endpoint
    staleTime: 1000 * 60 * 60, // 1 hour (matches server cache)
    retry: 2, // Allow 2 retries
  });

  // Fetch article data if in edit mode
  const { data: articleData, isLoading } = useQuery<ArticleWithDetails>({
    queryKey: ['/api/admin/ifox/articles', articleId],
    queryFn: async () => {
      const response = await fetch(`/api/admin/ifox/articles/${articleId}`);
      if (!response.ok) throw new Error('Failed to fetch article');
      return response.json();
    },
    enabled: isEditMode && !!articleId,
  });

  const { data: mediaAssetsRaw, refetch: refetchMediaAssets } = useQuery<any[]>({
    queryKey: ["/api/articles", articleData?.id, "media-assets"],
    enabled: isEditMode && !!articleData?.id,
  });
  const mediaAssets = Array.isArray(mediaAssetsRaw) ? mediaAssetsRaw : [];

  useEffect(() => {
    const heroAsset = mediaAssets?.find((a: any) => a.displayOrder === 0);
    if (heroAsset) {
      setCaptionAltText(heroAsset.altText || "");
      setCaptionPlain(heroAsset.captionPlain || "");
      setCaptionSourceName(heroAsset.sourceName || "");
    }
  }, [mediaAssets]);

  const saveCaptionMutation = useMutation({
    mutationFn: async () => {
      const heroAsset = mediaAssets?.find((a: any) => a.displayOrder === 0);
      const data = {
        altText: captionAltText || articleData?.title || "صورة الخبر",
        captionPlain: captionPlain || null,
        sourceName: captionSourceName || null,
      };
      if (heroAsset?.id) {
        return apiRequest(`/api/media-assets/${heroAsset.id}`, {
          method: "PATCH",
          body: JSON.stringify(data),
          headers: { "Content-Type": "application/json" },
        });
      } else {
        return apiRequest(`/api/articles/${articleData?.id}/media-assets`, {
          method: "POST",
          body: JSON.stringify({
            ...data,
            locale: "ar",
            displayOrder: 0,
          }),
          headers: { "Content-Type": "application/json" },
        });
      }
    },
    onSuccess: () => {
      toast({ title: "تم حفظ تعريف الصورة" });
      refetchMediaAssets();
    },
    onError: () => {
      toast({ title: "فشل في حفظ تعريف الصورة", variant: "destructive" });
    },
  });

  // Build mapping from iFox categories (no filtering needed - endpoint returns only iFox categories)
  const categorySlugToId: Record<string, string> = {};
  ifoxCategories?.forEach(cat => {
    categorySlugToId[cat.slug] = cat.id;
  });

  // Fallback: if fetch failed in edit mode, use article's current category
  if (isEditMode && articleData?.category && (!ifoxCategories || ifoxCategories.length === 0)) {
    categorySlugToId[articleData.category.slug] = articleData.category.id;
  }

  const form = useForm<ArticleFormData>({
    resolver: zodResolver(articleSchema),
    defaultValues: {
      title: "",
      titleEn: "",
      excerpt: "",
      content: "",
      category: "",
      tags: [],
      featuredImage: "",
      status: "draft",
      publishDate: undefined,
      seoTitle: "",
      seoDescription: "",
      seoKeywords: [],
    },
  });

  // Update form when article data is loaded
  useEffect(() => {
    if (isEditMode && articleData) {
      // In edit mode, use the category slug directly from article data
      const categorySlug = articleData.category?.slug || "";
      
      form.reset({
        title: articleData.title || "",
        titleEn: articleData.subtitle || "",
        slug: articleData.slug || "",
        excerpt: articleData.excerpt || "",
        content: articleData.content || "",
        category: categorySlug,
        tags: [],
        featuredImage: articleData.imageUrl || "",
        status: (articleData.status === "published" || articleData.status === "scheduled") ? articleData.status : "draft",
        publishDate: articleData.publishedAt ? new Date(articleData.publishedAt) : undefined,
        seoTitle: articleData.seo?.metaTitle || "",
        seoDescription: articleData.seo?.metaDescription || "",
        seoKeywords: articleData.seo?.keywords || [],
      });
      setAiScore(0);
      setSentimentScore(null);
      if (articleData.imageFocalPoint) {
        setImageFocalPoint(articleData.imageFocalPoint as any);
      }
    }
  }, [articleData, isEditMode, form]);

  // Save/Update mutation
  const saveMutation = useMutation({
    mutationFn: async (data: ArticleFormData) => {
      // Validate category slug exists
      if (!data.category) {
        throw new Error("يرجى اختيار تصنيف صحيح");
      }
      
      const url = isEditMode 
        ? `/api/admin/ifox/articles/${articleId}`
        : "/api/admin/ifox/articles";
      
      // Prepare payload matching backend schema
      const payload: any = {
        title: data.title,
        subtitle: data.titleEn,
        slug: data.slug,
        content: data.content,
        excerpt: data.excerpt,
        categorySlug: data.category, // ✅ Send slug (string), backend converts to UUID
        imageUrl: data.featuredImage,
        status: data.status,
        seo: {
          metaTitle: data.seoTitle || '',
          metaDescription: data.seoDescription || '',
          keywords: data.seoKeywords || [],
        },
        aiScore,
        sentimentScore,
        imageFocalPoint: imageFocalPoint || undefined,
      };
      
      // Handle publish date based on status
      if (data.status === 'scheduled' && data.publishDate) {
        payload.scheduledAt = data.publishDate.toISOString();
      } else if (data.status === 'published' && data.publishDate) {
        payload.publishedAt = data.publishDate.toISOString();
      }
      
      return apiRequest(url, {
        method: isEditMode ? "PATCH" : "POST",
        body: JSON.stringify(payload),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: (data) => {
      toast({
        title: "تم الحفظ",
        description: isEditMode ? "تم تحديث المقال بنجاح" : "تم إنشاء المقال بنجاح",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ifox/articles"] });
      if (!isEditMode && data.id) {
        setLocation(`/dashboard/admin/ifox/articles/edit/${data.id}`);
      }
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل حفظ المقال",
        variant: "destructive",
      });
    },
  });

  // AI Title Generation
  const generateAITitle = async () => {
    setGeneratingTitle(true);
    try {
      const response = await apiRequest("/api/admin/ifox/ai/generate-title", {
        method: "POST",
        body: JSON.stringify({
          content: form.getValues("content"),
          category: form.getValues("category"),
        }),
        headers: { "Content-Type": "application/json" },
      });
      
      if (response.title) {
        form.setValue("title", response.title);
        if (response.titleEn) {
          form.setValue("titleEn", response.titleEn);
        }
        toast({
          title: "تم التوليد",
          description: "تم توليد العنوان بنجاح",
        });
      }
    } catch (error) {
      toast({
        title: "خطأ",
        description: "فشل توليد العنوان",
        variant: "destructive",
      });
    } finally {
      setGeneratingTitle(false);
    }
  };

  // AI Content Suggestions
  const generateSuggestions = async () => {
    setGeneratingSuggestions(true);
    try {
      const response = await apiRequest("/api/admin/ifox/ai/generate-suggestions", {
        method: "POST",
        body: JSON.stringify({
          title: form.getValues("title"),
          content: form.getValues("content"),
          category: form.getValues("category"),
        }),
        headers: { "Content-Type": "application/json" },
      });
      
      if (response.suggestions) {
        // Show suggestions in a modal or sidebar
        toast({
          title: "اقتراحات المحتوى",
          description: response.suggestions.join("\n"),
        });
      }
    } catch (error) {
      toast({
        title: "خطأ",
        description: "فشل توليد الاقتراحات",
        variant: "destructive",
      });
    } finally {
      setGeneratingSuggestions(false);
    }
  };

  // Analyze Content Quality
  const analyzeContent = async () => {
    setAnalyzingContent(true);
    try {
      const response = await apiRequest("/api/admin/ifox/ai/analyze-content", {
        method: "POST",
        body: JSON.stringify({
          title: form.getValues("title"),
          content: form.getValues("content"),
          category: form.getValues("category"),
        }),
        headers: { "Content-Type": "application/json" },
      });
      
      if (response.score) {
        setAiScore(response.score);
        setSentimentScore(response.sentiment || null);
        toast({
          title: "تم التحليل",
          description: `جودة المحتوى: ${response.score}%`,
        });
      }
    } catch (error) {
      toast({
        title: "خطأ",
        description: "فشل تحليل المحتوى",
        variant: "destructive",
      });
    } finally {
      setAnalyzingContent(false);
    }
  };

  const handleAddTag = () => {
    if (tagInput.trim()) {
      const currentTags = form.getValues("tags") || [];
      form.setValue("tags", [...currentTags, tagInput.trim()]);
      setTagInput("");
    }
  };

  const handleRemoveTag = (tag: string) => {
    const currentTags = form.getValues("tags") || [];
    form.setValue("tags", currentTags.filter(t => t !== tag));
  };

  const onSubmit = (data: ArticleFormData) => {
    saveMutation.mutate(data);
  };

  const getAIScoreColor = (score: number) => {
    if (score >= 80) return "text-[hsl(var(--ifox-success))]";
    if (score >= 60) return "text-[hsl(var(--ifox-info))]";
    if (score >= 40) return "text-[hsl(var(--ifox-warning))]";
    return "text-[hsl(var(--ifox-error))]";
  };

  const getAIScoreLabel = (score: number) => {
    if (score >= 80) return "ممتاز";
    if (score >= 60) return "جيد";
    if (score >= 40) return "متوسط";
    return "يحتاج تحسين";
  };

  if (isLoading) {
    return (
      <div className="flex h-screen bg-[hsl(var(--ifox-surface-primary))]">
        <IFoxSidebar className="hidden lg:block" />
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[hsl(var(--ifox-accent-primary))]"></div>
        </div>
      </div>
    );
  }

  // Check if categories are ready
  const isCategoriesReady = isEditMode 
    ? ( Object.keys(categorySlugToId).length > 0 ) // Edit: need at least 1
    : ( ifoxCategories && ifoxCategories.length === 5 ); // Create: need all 5

  const canSave = !saveMutation.isPending && isCategoriesReady;

  return (
    <div className="flex h-screen bg-[hsl(var(--ifox-surface-primary))]">
      <IFoxSidebar className="hidden lg:block" />
      <div className="flex-1 overflow-y-auto">
        <ScrollArea className="h-full">
          <div className="max-w-7xl mx-auto p-3 sm:p-4 md:p-6 space-y-3 sm:space-y-4 md:space-y-6" dir="rtl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-3 md:gap-4 min-w-0 flex-1">
            <Button
              variant="ghost"
              onClick={() => setExitDialog(true)}
              className="gap-1 sm:gap-2 shrink-0"
              size="sm"
              data-testid="button-back"
            >
              <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="hidden sm:inline">العودة</span>
            </Button>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold truncate">
                {isEditMode ? "تحرير المقال" : "مقال جديد"}
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground truncate">آي فوكس - المحتوى التقني</p>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              onClick={() => setPreviewMode(!previewMode)}
              className="gap-1 sm:gap-2 flex-1 sm:flex-none"
              size="sm"
              data-testid="button-preview"
            >
              <Eye className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="text-xs sm:text-sm">{previewMode ? "إغلاق المعاينة" : "معاينة"}</span>
            </Button>
          </div>
        </div>

        {/* AI Score Card */}
        <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
          <CardContent className="p-3 sm:p-4 md:p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
              <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                <div className="p-2 sm:p-3 rounded-lg bg-primary/10 shrink-0">
                  <Sparkles className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm text-muted-foreground">تقييم جودة المحتوى</p>
                  <div className="flex items-center gap-2 mt-1 overflow-x-auto">
                    <Progress value={aiScore} className="h-2 w-24 sm:w-32" />
                    <span className={cn("text-lg sm:text-xl md:text-2xl font-bold whitespace-nowrap", getAIScoreColor(aiScore))}>
                      {aiScore}%
                    </span>
                    <Badge variant="secondary" className="text-xs">{getAIScoreLabel(aiScore)}</Badge>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Button
                  variant="outline"
                  onClick={analyzeContent}
                  disabled={analyzingContent || !form.getValues("content")}
                  className="gap-1 sm:gap-2 flex-1 sm:flex-none"
                  size="sm"
                  data-testid="button-analyze"
                >
                  {analyzingContent ? (
                    <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                  ) : (
                    <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5" />
                  )}
                  <span className="text-xs sm:text-sm">تحليل المحتوى</span>
                </Button>
              </div>
            </div>

            {/* Sentiment Analysis */}
            {sentimentScore && (
              <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t">
                <p className="text-xs sm:text-sm font-medium mb-2">تحليل المشاعر</p>
                <div className="grid grid-cols-3 gap-2 sm:gap-3 md:gap-4">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">إيجابي</p>
                    <p className="text-sm sm:text-base md:text-lg font-bold text-[hsl(var(--ifox-success))]">{sentimentScore.positive}%</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">محايد</p>
                    <p className="text-sm sm:text-base md:text-lg font-bold text-[hsl(var(--ifox-text-secondary))]">{sentimentScore.neutral}%</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">سلبي</p>
                    <p className="text-sm sm:text-base md:text-lg font-bold text-[hsl(var(--ifox-error))]">{sentimentScore.negative}%</p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-3 sm:gap-4 md:gap-6">
              {/* Main Content */}
              <div className="space-y-3 sm:space-y-4 md:space-y-6 min-w-0">
                {/* Basic Info */}
                <Card>
                  <CardHeader className="p-3 sm:p-4 md:p-6">
                    <CardTitle className="text-base sm:text-lg md:text-xl">المعلومات الأساسية</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 sm:p-4 md:p-6 space-y-3 sm:space-y-4">
                    <FormField
                      control={form.control}
                      name="title"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs sm:text-sm">العنوان (عربي) *</FormLabel>
                          <div className="flex flex-col sm:flex-row gap-2">
                            <FormControl>
                              <Input {...field} dir="rtl" placeholder="أدخل عنوان المقال" className="text-xs sm:text-sm md:text-base" data-testid="input-title" />
                            </FormControl>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={generateAITitle}
                              disabled={generatingTitle || !form.getValues("content")}
                              className="gap-1 sm:gap-2 whitespace-nowrap w-full sm:w-auto"
                              size="sm"
                              data-testid="button-generate-title"
                            >
                              {generatingTitle ? (
                                <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                              ) : (
                                <Wand2 className="w-4 h-4 sm:w-5 sm:h-5" />
                              )}
                              <span className="text-xs sm:text-sm">توليد بـ AI</span>
                            </Button>
                          </div>
                          <FormMessage className="text-xs" />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="titleEn"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs sm:text-sm">العنوان (إنجليزي)</FormLabel>
                          <FormControl>
                            <Input {...field} dir="ltr" placeholder="Enter article title" className="text-xs sm:text-sm md:text-base" data-testid="input-title-en" />
                          </FormControl>
                          <FormMessage className="text-xs" />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="excerpt"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs sm:text-sm">الوصف المختصر *</FormLabel>
                          <FormControl>
                            <Textarea
                              {...field}
                              dir="rtl"
                              rows={3}
                              placeholder="أدخل وصف مختصر للمقال"
                              className="text-xs sm:text-sm md:text-base"
                              data-testid="textarea-excerpt"
                            />
                          </FormControl>
                          <FormDescription className="text-xs">
                            سيظهر هذا الوصف في قوائم المقالات ونتائج البحث
                          </FormDescription>
                          <FormMessage className="text-xs" />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                {/* Content Editor */}
                <Card>
                  <CardHeader className="p-3 sm:p-4 md:p-6">
                    <CardTitle className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-base sm:text-lg md:text-xl">
                      <span className="truncate">محتوى المقال</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={generateSuggestions}
                        disabled={generatingSuggestions || !form.getValues("title")}
                        className="gap-1 sm:gap-2 w-full sm:w-auto whitespace-nowrap"
                        data-testid="button-suggestions"
                      >
                        {generatingSuggestions ? (
                          <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                        ) : (
                          <Lightbulb className="w-4 h-4 sm:w-5 sm:h-5" />
                        )}
                        <span className="text-xs sm:text-sm">اقتراحات AI</span>
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 sm:p-4 md:p-6">
                    <FormField
                      control={form.control}
                      name="content"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <RichTextEditor
                              content={field.value}
                              onChange={field.onChange}
                              placeholder="ابدأ بكتابة محتوى المقال..."
                            />
                          </FormControl>
                          <FormMessage className="text-xs" />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>
              </div>

              {/* Sidebar */}
              <div className="space-y-3 sm:space-y-4 md:space-y-6 min-w-0">
                {/* Publishing Options */}
                <Card>
                  <CardHeader className="p-3 sm:p-4 md:p-6">
                    <CardTitle className="text-base sm:text-lg md:text-xl">خيارات النشر</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 sm:p-4 md:p-6 space-y-3 sm:space-y-4">
                    <FormField
                      control={form.control}
                      name="status"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs sm:text-sm">الحالة</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-status" className="text-xs sm:text-sm md:text-base">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="draft">مسودة</SelectItem>
                              <SelectItem value="published">منشور</SelectItem>
                              <SelectItem value="scheduled">مجدول</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage className="text-xs" />
                        </FormItem>
                      )}
                    />

                    {form.watch("status") === "scheduled" && (
                      <FormField
                        control={form.control}
                        name="publishDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs sm:text-sm">تاريخ النشر</FormLabel>
                            <Popover>
                              <PopoverTrigger asChild>
                                <FormControl>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className={cn(
                                      "w-full justify-start text-right gap-1 sm:gap-2",
                                      !field.value && "text-muted-foreground"
                                    )}
                                    data-testid="button-publish-date"
                                  >
                                    <CalendarIcon className="w-4 h-4 sm:w-5 sm:h-5 ml-2" />
                                    <span className="text-xs sm:text-sm truncate">
                                      {field.value ? (
                                        format(field.value, "PPP", { locale: ar })
                                      ) : (
                                        "اختر التاريخ"
                                      )}
                                    </span>
                                  </Button>
                                </FormControl>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0">
                                <Calendar
                                  mode="single"
                                  selected={field.value}
                                  onSelect={field.onChange}
                                  initialFocus
                                />
                              </PopoverContent>
                            </Popover>
                            <FormMessage className="text-xs" />
                          </FormItem>
                        )}
                      />
                    )}

                    <div className="flex gap-2 pt-2 sm:pt-4">
                      <Button
                        type="submit"
                        disabled={!canSave || form.formState.isSubmitting}
                        className="flex-1 gap-1 sm:gap-2"
                        size="sm"
                        data-testid="button-save"
                      >
                        {saveMutation.isPending ? (
                          <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                        ) : form.watch("status") === "published" ? (
                          <Send className="w-4 h-4 sm:w-5 sm:h-5" />
                        ) : form.watch("status") === "scheduled" ? (
                          <Clock className="w-4 h-4 sm:w-5 sm:h-5" />
                        ) : (
                          <Save className="w-4 h-4 sm:w-5 sm:h-5" />
                        )}
                        <span className="text-xs sm:text-sm">
                          {saveMutation.isPending ? "جاري الحفظ..." :
                           form.watch("status") === "published" ? "نشر" : 
                           form.watch("status") === "scheduled" ? "جدولة" : "حفظ"}
                        </span>
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Category */}
                <Card>
                  <CardHeader className="p-3 sm:p-4 md:p-6">
                    <CardTitle className="text-base sm:text-lg md:text-xl">التصنيف</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 sm:p-4 md:p-6">
                    {categoriesLoading && (
                      <div className="text-sm text-muted-foreground flex items-center gap-2 mb-4 p-3 rounded-lg bg-muted/50">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        جاري تحميل التصنيفات...
                      </div>
                    )}

                    {isEditMode && !categoriesLoading && ifoxCategories && ifoxCategories.length < 5 && articleData?.category && (
                      <div className="text-sm text-amber-600 dark:text-amber-500 flex items-center gap-2 mb-4 p-3 rounded-lg bg-amber-100 dark:bg-amber-900/20">
                        <AlertCircle className="h-4 w-4" />
                        تم تحميل التصنيف الحالي فقط. لتغيير التصنيف، يرجى إعادة تحميل الصفحة.
                      </div>
                    )}

                    {!isEditMode && categoriesError && (
                      <div className="text-sm text-destructive flex items-center gap-2 mb-4 p-3 rounded-lg bg-destructive/10">
                        <AlertCircle className="h-4 w-4" />
                        فشل تحميل التصنيفات. يرجى إعادة تحميل الصفحة.
                      </div>
                    )}

                    <FormField
                      control={form.control}
                      name="category"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <div className="space-y-2 overflow-x-auto max-h-[60vh] overflow-y-auto">
                              {IFOX_CATEGORIES.map((category) => {
                                const Icon = category.icon;
                                const isSelected = field.value === category.slug;
                                return (
                                  <button
                                    key={category.slug}
                                    type="button"
                                    onClick={() => field.onChange(category.slug)}
                                    className={cn(
                                      "w-full flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg transition-all min-w-0",
                                      isSelected
                                        ? `${category.bgColor} ${category.color} ring-2 ring-primary`
                                        : "hover:bg-muted"
                                    )}
                                    data-testid={`button-category-${category.slug}`}
                                  >
                                    <div className={cn("p-1.5 sm:p-2 rounded-lg shrink-0", category.bgColor)}>
                                      <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
                                    </div>
                                    <span className="font-medium text-xs sm:text-sm truncate flex-1 text-right">{category.nameAr}</span>
                                    {isSelected && (
                                      <ChevronRight className="w-4 h-4 ml-auto shrink-0" />
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </FormControl>
                          <FormMessage className="text-xs" />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                {/* Tags */}
                <Card>
                  <CardHeader className="p-3 sm:p-4 md:p-6">
                    <CardTitle className="text-base sm:text-lg md:text-xl">الكلمات المفتاحية</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 sm:p-4 md:p-6 space-y-3 sm:space-y-4">
                    <div className="flex gap-2">
                      <Input
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        placeholder="أضف كلمة مفتاحية"
                        className="text-xs sm:text-sm md:text-base"
                        onKeyPress={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddTag();
                          }
                        }}
                        data-testid="input-tag"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleAddTag}
                        size="sm"
                        className="shrink-0"
                        data-testid="button-add-tag"
                      >
                        <Tag className="w-4 h-4 sm:w-5 sm:h-5" />
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-1.5 sm:gap-2 overflow-x-auto max-h-48 overflow-y-auto">
                      {form.watch("tags")?.map((tag) => (
                        <Badge
                          key={tag}
                          variant="secondary"
                          className="gap-1 cursor-pointer text-xs whitespace-nowrap"
                          onClick={() => handleRemoveTag(tag)}
                          data-testid={`badge-tag-${tag}`}
                        >
                          <span className="truncate max-w-[120px]">{tag}</span>
                          <X className="w-3 h-3 shrink-0" />
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Featured Image */}
                <Card>
                  <CardHeader className="p-3 sm:p-4 md:p-6">
                    <CardTitle className="text-base sm:text-lg md:text-xl">الصورة البارزة</CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 sm:p-4 md:p-6">
                    <FormField
                      control={form.control}
                      name="featuredImage"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <div className="space-y-3 sm:space-y-4">
                              {field.value ? (
                                <>
                                  <div className="relative">
                                    <img
                                      src={field.value}
                                      alt="Featured"
                                      className="w-full h-32 sm:h-40 object-cover rounded-lg"
                                    />
                                    <Button
                                      type="button"
                                      variant="destructive"
                                      size="icon"
                                      className="absolute top-2 left-2"
                                      onClick={() => field.onChange("")}
                                      data-testid="button-remove-featured-image"
                                    >
                                      <X className="w-4 h-4" />
                                    </Button>
                                  </div>
                                  {isEditMode && (
                                    <div className="space-y-2 mt-3">
                                      <Input
                                        placeholder="النص البديل للصورة (مهم لـ SEO)"
                                        value={captionAltText}
                                        onChange={(e) => setCaptionAltText(e.target.value)}
                                        className="text-xs sm:text-sm"
                                        data-testid="input-caption-alt-text"
                                      />
                                      <Textarea
                                        placeholder="تعريف الصورة (يظهر أسفل الصورة في صفحة الخبر)"
                                        value={captionPlain}
                                        onChange={(e) => setCaptionPlain(e.target.value)}
                                        rows={2}
                                        className="text-xs sm:text-sm resize-none"
                                        data-testid="textarea-caption-plain"
                                      />
                                      <Input
                                        placeholder="المصدر (مثال: واس، رويترز)"
                                        value={captionSourceName}
                                        onChange={(e) => setCaptionSourceName(e.target.value)}
                                        className="text-xs sm:text-sm"
                                        data-testid="input-caption-source"
                                      />
                                      <Button
                                        type="button"
                                        size="sm"
                                        onClick={() => saveCaptionMutation.mutate()}
                                        disabled={saveCaptionMutation.isPending}
                                        data-testid="button-save-caption"
                                      >
                                        {saveCaptionMutation.isPending ? (
                                          <Loader2 className="h-4 w-4 animate-spin ml-2" />
                                        ) : (
                                          <Save className="h-4 w-4 ml-2" />
                                        )}
                                        حفظ تعريف الصورة
                                      </Button>
                                    </div>
                                  )}
                                  <Collapsible open={focalPointOpen} onOpenChange={setFocalPointOpen}>
                                    <CollapsibleTrigger asChild>
                                      <Button variant="ghost" size="sm" className="w-full justify-between mt-2" type="button" data-testid="button-toggle-focal-point">
                                        <span className="flex items-center gap-2">
                                          <Focus className="h-4 w-4" />
                                          نقطة التركيز
                                          {imageFocalPoint && (
                                            <Badge variant="secondary" className="text-xs">
                                              {imageFocalPoint.x}%, {imageFocalPoint.y}%
                                            </Badge>
                                          )}
                                        </span>
                                        <ChevronDown className={cn("h-4 w-4 transition-transform", focalPointOpen && "rotate-180")} />
                                      </Button>
                                    </CollapsibleTrigger>
                                    <CollapsibleContent>
                                      <ImageFocalPointPicker
                                        imageUrl={field.value}
                                        currentFocalPoint={imageFocalPoint || undefined}
                                        onFocalPointChange={setImageFocalPoint}
                                      />
                                    </CollapsibleContent>
                                  </Collapsible>
                                </>
                              ) : (
                                <div className="border-2 border-dashed rounded-lg p-4 sm:p-6 text-center">
                                  <ImagePlus className="w-6 h-6 sm:w-8 sm:h-8 mx-auto text-muted-foreground mb-2" />
                                  <p className="text-xs sm:text-sm text-muted-foreground">
                                    اختر صورة بارزة
                                  </p>
                                </div>
                              )}
                              <Input
                                type="url"
                                placeholder="رابط الصورة"
                                value={field.value}
                                onChange={field.onChange}
                                className="text-xs sm:text-sm md:text-base"
                                data-testid="input-featured-image"
                              />
                            </div>
                          </FormControl>
                          <FormMessage className="text-xs" />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>
              </div>
            </div>
          </form>
        </Form>

        {/* Exit Confirmation Dialog */}
        <AlertDialog open={exitDialog} onOpenChange={setExitDialog}>
          <AlertDialogContent data-testid="dialog-exit" className="max-w-[90vw] sm:max-w-lg">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-base sm:text-lg md:text-xl">هل تريد المغادرة؟</AlertDialogTitle>
              <AlertDialogDescription className="text-xs sm:text-sm">
                قد تفقد التغييرات غير المحفوظة. هل أنت متأكد من المغادرة؟
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-col sm:flex-row gap-2">
              <AlertDialogCancel className="text-xs sm:text-sm m-0" data-testid="button-stay">البقاء</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => setLocation("/dashboard/admin/ifox/articles")}
                className="text-xs sm:text-sm m-0"
                data-testid="button-leave"
              >
                المغادرة
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}