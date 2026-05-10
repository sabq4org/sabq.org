import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { IFoxLayout } from "@/components/admin/ifox/IFoxLayout";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useToast } from "@/hooks/use-toast";
import { useRoleProtection } from "@/hooks/useRoleProtection";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import type { ArticleWithDetails } from "@shared/schema";
import {
  Plus,
  Search,
  Filter,
  Edit,
  Trash2,
  Eye,
  Calendar,
  Brain,
  Sparkles,
  Laptop,
  BookOpen,
  Gamepad2,
  Heart,
  DollarSign,
  Globe,
  AlertCircle,
  FileText,
  Clock,
  BarChart3,
} from "lucide-react";

// iFox Categories
const IFOX_CATEGORIES = [
  { slug: 'ai-news', nameAr: 'آي سبق - أخبار AI', icon: Sparkles, color: "text-[hsl(var(--ifox-accent-primary))]", bgColor: "bg-[hsl(var(--ifox-accent-primary)/.1)]" },
  { slug: 'ai-insights', nameAr: 'آي عمق - تحليلات', icon: BarChart3, color: "text-[hsl(var(--ifox-info))]", bgColor: "bg-[hsl(var(--ifox-info)/.1)]" },
  { slug: 'ai-opinions', nameAr: 'آي رأي - آراء', icon: FileText, color: "text-[hsl(var(--ifox-warning))]", bgColor: "bg-[hsl(var(--ifox-warning)/.1)]" },
  { slug: 'ai-tools', nameAr: 'آي تطبيق - أدوات', icon: Laptop, color: "text-[hsl(var(--ifox-success))]", bgColor: "bg-[hsl(var(--ifox-success)/.1)]" },
  { slug: 'ai-voice', nameAr: 'آي صوت - بودكاست', icon: Brain, color: "text-[hsl(var(--ifox-error))]", bgColor: "bg-[hsl(var(--ifox-error)/.1)]" },
];

const statusConfig = {
  published: { 
    label: "منشور", 
    color: "bg-[hsl(var(--ifox-success)/.2)] text-[hsl(var(--ifox-success))] border-[hsl(var(--ifox-success)/.3)]",
    icon: Eye 
  },
  draft: { 
    label: "مسودة", 
    color: "bg-[hsl(var(--ifox-text-tertiary)/.2)] text-[hsl(var(--ifox-text-secondary))] border-[hsl(var(--ifox-text-tertiary)/.3)]",
    icon: FileText 
  },
  scheduled: { 
    label: "مجدول", 
    color: "bg-[hsl(var(--ifox-info)/.2)] text-[hsl(var(--ifox-info))] border-[hsl(var(--ifox-info)/.3)]",
    icon: Clock 
  },
  archived: { 
    label: "مؤرشف", 
    color: "bg-[hsl(var(--ifox-warning)/.2)] text-[hsl(var(--ifox-warning))] border-[hsl(var(--ifox-warning)/.3)]",
    icon: BarChart3 
  },
};

interface ArticlesResponse {
  articles: ArticleWithDetails[];
  total: number;
}

export default function IFoxArticles() {
  useRoleProtection('admin');
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categorySlugFilter, setCategorySlugFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [articleToDelete, setArticleToDelete] = useState<string | null>(null);
  
  const limit = 12;

  // Build query params
  const buildQueryParams = () => {
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.append("status", statusFilter);
    if (categorySlugFilter !== "all") params.append("categorySlug", categorySlugFilter);
    if (searchQuery) params.append("search", searchQuery);
    params.append("page", page.toString());
    params.append("limit", limit.toString());
    return params.toString();
  };

  // Fetch articles
  const { data, isLoading, error } = useQuery<ArticlesResponse>({
    queryKey: ["/api/ifox/articles", statusFilter, categorySlugFilter, searchQuery, page],
    queryFn: async () => {
      const response = await fetch(`/api/ifox/articles?${buildQueryParams()}`);
      if (!response.ok) throw new Error("Failed to fetch articles");
      return response.json();
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (articleId: string) => {
      return apiRequest(`/api/ifox/articles/${articleId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      toast({
        title: "تم الحذف",
        description: "تم حذف المقال بنجاح",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/ifox/articles"] });
      setDeleteDialogOpen(false);
      setArticleToDelete(null);
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل حذف المقال",
        variant: "destructive",
      });
    },
  });

  const handleDelete = (articleId: string) => {
    setArticleToDelete(articleId);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (articleToDelete) {
      deleteMutation.mutate(articleToDelete);
    }
  };

  const getCategoryInfo = (category?: { slug: string; nameAr: string }) => {
    if (!category) return IFOX_CATEGORIES[0];
    return IFOX_CATEGORIES.find(c => c.slug === category.slug) || IFOX_CATEGORIES[0];
  };

  const totalPages = data ? Math.ceil(data.total / limit) : 0;

  return (
    <IFoxLayout>
      <ScrollArea className="h-full">
        <div className="p-3 sm:p-4 md:p-6 space-y-4 md:space-y-6" dir="rtl">
          {/* Header */}
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4"
          >
            <div>
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold bg-gradient-to-r from-[hsl(var(--ifox-accent-primary)/1)] to-[hsl(var(--ifox-accent-secondary)/1)] bg-clip-text text-transparent" data-testid="text-page-title">
                إدارة المقالات
              </h1>
              <p className="text-[hsl(var(--ifox-text-secondary))] text-sm sm:text-base mt-1" data-testid="text-page-description">
                عرض وإدارة جميع مقالات آي فوكس
              </p>
            </div>
            <Button
              onClick={() => setLocation("/dashboard/admin/ifox/articles/new")}
              className="bg-gradient-to-r from-[hsl(var(--ifox-accent-primary)/1)] to-[hsl(var(--ifox-accent-secondary)/1)] hover:opacity-90 gap-2"
              data-testid="button-new-article"
            >
              <Plus className="w-4 h-4" />
              <span>مقال جديد</span>
            </Button>
          </motion.div>

          {/* Filters */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <Card className="bg-[hsl(var(--ifox-surface-secondary))] border-[hsl(var(--ifox-border-primary))]">
              <CardContent className="p-3 sm:p-4">
                <div className="flex flex-col sm:flex-row gap-3">
                  {/* Search */}
                  <div className="flex-1 relative">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--ifox-text-tertiary))]" />
                    <Input
                      placeholder="بحث عن مقال..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pr-10 bg-[hsl(var(--ifox-surface-primary))] border-[hsl(var(--ifox-border-secondary))]"
                      data-testid="input-search"
                    />
                  </div>

                  {/* Status Filter */}
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-full sm:w-[180px] bg-[hsl(var(--ifox-surface-primary))] border-[hsl(var(--ifox-border-secondary))]" data-testid="select-status-filter">
                      <SelectValue placeholder="حالة المقال" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">جميع الحالات</SelectItem>
                      <SelectItem value="published">منشور</SelectItem>
                      <SelectItem value="draft">مسودة</SelectItem>
                      <SelectItem value="scheduled">مجدول</SelectItem>
                      <SelectItem value="archived">مؤرشف</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Category Filter */}
                  <Select value={categorySlugFilter} onValueChange={setCategorySlugFilter}>
                    <SelectTrigger className="w-full sm:w-[180px] bg-[hsl(var(--ifox-surface-primary))] border-[hsl(var(--ifox-border-secondary))]" data-testid="select-category-filter">
                      <SelectValue placeholder="التصنيف" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">جميع التصنيفات</SelectItem>
                      {IFOX_CATEGORIES.map((cat) => (
                        <SelectItem key={cat.slug} value={cat.slug}>
                          {cat.nameAr}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Loading State */}
          {isLoading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Card key={i} className="animate-pulse bg-[hsl(var(--ifox-surface-secondary))] border-[hsl(var(--ifox-border-primary))]">
                  <CardHeader>
                    <div className="h-6 bg-[hsl(var(--ifox-surface-overlay))] rounded w-3/4 mb-2"></div>
                    <div className="h-4 bg-[hsl(var(--ifox-surface-overlay))] rounded w-1/2"></div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="h-4 bg-[hsl(var(--ifox-surface-overlay))] rounded"></div>
                      <div className="h-4 bg-[hsl(var(--ifox-surface-overlay))] rounded w-5/6"></div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Error State */}
          {error && (
            <Card className="bg-[hsl(var(--ifox-error)/.1)] border-[hsl(var(--ifox-error)/.3)]">
              <CardContent className="p-6 flex flex-col items-center justify-center gap-3">
                <AlertCircle className="w-12 h-12 text-[hsl(var(--ifox-error))]" />
                <h3 className="text-lg font-semibold text-[hsl(var(--ifox-text-primary))]">حدث خطأ في تحميل المقالات</h3>
                <p className="text-[hsl(var(--ifox-text-secondary))] text-center">
                  {error instanceof Error ? error.message : "يرجى المحاولة مرة أخرى"}
                </p>
                <Button
                  onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/ifox/articles"] })}
                  variant="outline"
                  className="border-[hsl(var(--ifox-error))] text-[hsl(var(--ifox-error))] hover:bg-[hsl(var(--ifox-error)/.1)]"
                  data-testid="button-retry"
                >
                  إعادة المحاولة
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Empty State */}
          {!isLoading && !error && data && data.articles.length === 0 && (
            <Card className="bg-[hsl(var(--ifox-surface-secondary))] border-[hsl(var(--ifox-border-primary))]">
              <CardContent className="p-8 sm:p-12 flex flex-col items-center justify-center gap-4">
                <motion.div
                  animate={{
                    y: [0, -10, 0],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                >
                  <FileText className="w-16 h-16 sm:w-20 sm:h-20 text-[hsl(var(--ifox-text-tertiary))]" />
                </motion.div>
                <h3 className="text-lg sm:text-xl font-semibold text-[hsl(var(--ifox-text-primary))]">لا توجد مقالات</h3>
                <p className="text-[hsl(var(--ifox-text-secondary))] text-center max-w-md">
                  {searchQuery || statusFilter !== "all" || categorySlugFilter !== "all"
                    ? "لم يتم العثور على مقالات تطابق معايير البحث"
                    : "ابدأ بإنشاء أول مقال آي فوكس الخاص بك"}
                </p>
                {(!searchQuery && statusFilter === "all" && categorySlugFilter === "all") && (
                  <Button
                    onClick={() => setLocation("/dashboard/admin/ifox/articles/new")}
                    className="bg-gradient-to-r from-[hsl(var(--ifox-accent-primary)/1)] to-[hsl(var(--ifox-accent-secondary)/1)] hover:opacity-90 gap-2 mt-2"
                    data-testid="button-create-first-article"
                  >
                    <Plus className="w-4 h-4" />
                    <span>إنشاء مقال جديد</span>
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {/* Articles Grid */}
          {!isLoading && !error && data && data.articles.length > 0 && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4"
              >
                <AnimatePresence mode="popLayout">
                  {data?.articles?.map((article, index) => {
                    const categoryInfo = getCategoryInfo(article.category);
                    const statusInfo = statusConfig[article.status as keyof typeof statusConfig];
                    const StatusIcon = statusInfo?.icon || FileText;

                    return (
                      <motion.div
                        key={article.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ duration: 0.3, delay: index * 0.05 }}
                        layout
                      >
                        <Card className="bg-[hsl(var(--ifox-surface-secondary))] border-[hsl(var(--ifox-border-primary))] hover-elevate overflow-hidden h-full flex flex-col" data-testid={`card-article-${article.id}`}>
                          <CardHeader className="flex-1">
                            <div className="flex items-start justify-between gap-2 mb-2">
                              {/* Category Badge */}
                              {categoryInfo && (
                                <Badge 
                                  className={cn(
                                    "gap-1 text-xs",
                                    categoryInfo.bgColor,
                                    categoryInfo.color
                                  )}
                                  data-testid={`badge-category-${article.id}`}
                                >
                                  <categoryInfo.icon className="w-3 h-3" />
                                  {categoryInfo.nameAr}
                                </Badge>
                              )}

                              {/* AI Flag */}
                              {article.aiGenerated && (
                                <Badge 
                                  className="gap-1 text-xs bg-[hsl(var(--ifox-accent-primary)/.2)] text-[hsl(var(--ifox-accent-primary))] border-[hsl(var(--ifox-accent-primary)/.3)]"
                                  data-testid={`badge-ai-${article.id}`}
                                >
                                  <Brain className="w-3 h-3" />
                                  AI
                                </Badge>
                              )}
                            </div>

                            <CardTitle className="text-base sm:text-lg text-[hsl(var(--ifox-text-primary))] line-clamp-2" data-testid={`text-title-${article.id}`}>
                              {article.title}
                            </CardTitle>

                            {article.excerpt && (
                              <p className="text-sm text-[hsl(var(--ifox-text-secondary))] line-clamp-2 mt-2" data-testid={`text-excerpt-${article.id}`}>
                                {article.excerpt}
                              </p>
                            )}

                            {/* Status and Date */}
                            <div className="flex items-center gap-2 mt-3">
                              <Badge 
                                className={cn("gap-1 text-xs border", statusInfo?.color)}
                                data-testid={`badge-status-${article.id}`}
                              >
                                <StatusIcon className="w-3 h-3" />
                                {statusInfo?.label}
                              </Badge>
                              {article.publishedAt && (
                                <span className="text-xs text-[hsl(var(--ifox-text-tertiary))] flex items-center gap-1" data-testid={`text-date-${article.id}`}>
                                  <Calendar className="w-3 h-3" />
                                  {format(new Date(article.publishedAt), "dd MMM yyyy", { locale: ar })}
                                </span>
                              )}
                            </div>

                            {/* Views */}
                            {article.views !== undefined && article.views > 0 && (
                              <div className="text-xs text-[hsl(var(--ifox-text-tertiary))] flex items-center gap-1 mt-2" data-testid={`text-views-${article.id}`}>
                                <Eye className="w-3 h-3" />
                                {article.views.toLocaleString('ar-SA')} مشاهدة
                              </div>
                            )}
                          </CardHeader>

                          <CardContent className="pt-0 pb-3 px-4 sm:px-6">
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setLocation(`/admin/ifox/articles/${article.id}/edit`)}
                                className="flex-1 gap-2 border-[hsl(var(--ifox-border-secondary))] hover:border-[hsl(var(--ifox-accent-primary))] hover:text-[hsl(var(--ifox-accent-primary))]"
                                data-testid={`button-edit-${article.id}`}
                              >
                                <Edit className="w-3 h-3" />
                                تحرير
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDelete(article.id)}
                                className="gap-2 border-[hsl(var(--ifox-error)/.3)] text-[hsl(var(--ifox-error))] hover:bg-[hsl(var(--ifox-error)/.1)] hover:border-[hsl(var(--ifox-error))]"
                                data-testid={`button-delete-${article.id}`}
                              >
                                <Trash2 className="w-3 h-3" />
                                حذف
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </motion.div>

              {/* Pagination */}
              {totalPages > 1 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.5, delay: 0.3 }}
                  className="flex items-center justify-center gap-2 mt-6"
                >
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="border-[hsl(var(--ifox-border-secondary))]"
                    data-testid="button-previous-page"
                  >
                    السابق
                  </Button>
                  
                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => {
                      // Show first, last, current, and adjacent pages
                      if (
                        pageNum === 1 ||
                        pageNum === totalPages ||
                        (pageNum >= page - 1 && pageNum <= page + 1)
                      ) {
                        return (
                          <Button
                            key={pageNum}
                            variant={page === pageNum ? "default" : "outline"}
                            size="sm"
                            onClick={() => setPage(pageNum)}
                            className={cn(
                              "w-8 h-8 p-0",
                              page === pageNum 
                                ? "bg-gradient-to-r from-[hsl(var(--ifox-accent-primary)/1)] to-[hsl(var(--ifox-accent-secondary)/1)]"
                                : "border-[hsl(var(--ifox-border-secondary))]"
                            )}
                            data-testid={`button-page-${pageNum}`}
                          >
                            {pageNum}
                          </Button>
                        );
                      } else if (pageNum === page - 2 || pageNum === page + 2) {
                        return <span key={pageNum} className="text-[hsl(var(--ifox-text-tertiary))]">...</span>;
                      }
                      return null;
                    })}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="border-[hsl(var(--ifox-border-secondary))]"
                    data-testid="button-next-page"
                  >
                    التالي
                  </Button>
                </motion.div>
              )}
            </>
          )}
        </div>
      </ScrollArea>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-[hsl(var(--ifox-surface-secondary))] border-[hsl(var(--ifox-border-primary))]" dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[hsl(var(--ifox-text-primary))]">
              تأكيد الحذف
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[hsl(var(--ifox-text-secondary))]">
              هل أنت متأكد من حذف هذا المقال؟ هذا الإجراء لا يمكن التراجع عنه.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel 
              className="border-[hsl(var(--ifox-border-secondary))]"
              data-testid="button-cancel-delete"
            >
              إلغاء
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
              className="bg-[hsl(var(--ifox-error))] hover:bg-[hsl(var(--ifox-error)/.8)]"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "جاري الحذف..." : "حذف"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </IFoxLayout>
  );
}
