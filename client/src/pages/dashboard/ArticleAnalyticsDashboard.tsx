import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  Search, 
  Eye, 
  Heart, 
  Bookmark, 
  Share2, 
  MessageSquare, 
  FileText, 
  Clock, 
  TrendingUp,
  BarChart3,
  Filter,
  X,
  ChevronLeft,
  ChevronRight,
  FileDown,
  Loader2,
  Calendar,
  ArrowUpDown,
  ExternalLink,
  Users
} from "lucide-react";
import { format, subDays, subMonths } from "date-fns";
import { arSA } from "date-fns/locale";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { DashboardLayout } from "@/components/DashboardLayout";
import { formatNumber } from "@/lib/format";

interface Category {
  id: string;
  nameAr: string | null;
  slug: string;
}

interface ArticleAnalytics {
  id: string;
  title: string;
  slug: string;
  englishSlug?: string | null;
  excerpt: string | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  status: string;
  publishedAt: string | null;
  createdAt: string;
  category: {
    id: string;
    nameAr: string | null;
  } | null;
  author: {
    id: string;
    name: string | null;
  } | null;
  views: number;
  likesCount: number;
  savesCount: number;
  sharesCount: number;
  commentsCount: number;
  wordCount: number;
  avgReadingTime: number;
}

interface ArticleDetail extends ArticleAnalytics {
  content: string;
  reactions: Record<string, number>;
  commentsBreakdown: {
    pending: number;
    approved: number;
    rejected: number;
    flagged: number;
  };
  readingStats: {
    avgReadingTime: number;
    totalReaders: number;
    totalReadSessions: number;
    avgScrollDepth: number;
    avgCompletionRate: number;
  };
  recentComments: Array<{
    id: string;
    content: string;
    status: string;
    createdAt: string;
    user: { name: string | null } | null;
  }>;
}

interface SearchResponse {
  articles: ArticleAnalytics[];
  pagination: {
    totalCount: number;
    offset: number;
    limit: number;
    hasMore: boolean;
  };
}

const sortOptions = [
  { value: "views", label: "المشاهدات" },
  { value: "likes", label: "الإعجابات" },
  { value: "comments", label: "التعليقات" },
  { value: "shares", label: "المشاركات" },
  { value: "publishedAt", label: "تاريخ النشر" },
];

const statusOptions = [
  { value: "all", label: "جميع الحالات" },
  { value: "published", label: "منشور" },
  { value: "draft", label: "مسودة" },
  { value: "archived", label: "مؤرشف" },
];

const dateRangeOptions = [
  { value: "all", label: "كل الأوقات" },
  { value: "7days", label: "آخر 7 أيام" },
  { value: "30days", label: "آخر 30 يوم" },
  { value: "90days", label: "آخر 3 أشهر" },
  { value: "year", label: "آخر سنة" },
];

function StatCard({ 
  icon: Icon, 
  label, 
  value, 
  color = "primary",
  subValue 
}: { 
  icon: any; 
  label: string; 
  value: string | number; 
  color?: string;
  subValue?: string;
}) {
  const colorClasses: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    blue: "bg-blue-500/10 text-blue-500",
    green: "bg-emerald-500/10 text-emerald-500",
    purple: "bg-purple-500/10 text-purple-500",
    orange: "bg-orange-500/10 text-orange-500",
    pink: "bg-pink-500/10 text-pink-500",
    cyan: "bg-cyan-500/10 text-cyan-500",
  };

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
      <div className={`p-2 rounded-lg ${colorClasses[color]}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground truncate">{label}</p>
        <p className="text-lg font-bold" data-testid={`stat-${label}`}>
          {typeof value === 'number' ? formatNumber(value) : value}
        </p>
        {subValue && (
          <p className="text-xs text-muted-foreground">{subValue}</p>
        )}
      </div>
    </div>
  );
}

function ArticleCard({ 
  article, 
  onSelect, 
  isSelected 
}: { 
  article: ArticleAnalytics; 
  onSelect: (id: string) => void;
  isSelected: boolean;
}) {
  return (
    <Card 
      className={`cursor-pointer transition-all hover-elevate ${isSelected ? 'ring-2 ring-primary' : ''}`}
      onClick={() => onSelect(article.id)}
      data-testid={`article-card-${article.id}`}
    >
      <CardContent className="p-4">
        <div className="flex gap-4">
          {(article.imageUrl || article.thumbnailUrl) && (
            <div className="flex-shrink-0 w-24 h-16 rounded-lg overflow-hidden bg-muted">
              <img
                src={article.imageUrl || article.thumbnailUrl || ''}
                alt={article.title}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
          )}
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-sm line-clamp-2" data-testid="article-title">
                {article.title}
              </h3>
              <Badge 
                variant={article.status === 'published' ? 'default' : 'secondary'}
                className="flex-shrink-0 text-xs"
              >
                {article.status === 'published' ? 'منشور' : 
                 article.status === 'draft' ? 'مسودة' : 'مؤرشف'}
              </Badge>
            </div>
            
            {article.category && (
              <Badge variant="outline" className="text-xs">
                {article.category.nameAr}
              </Badge>
            )}

            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1" data-testid="article-views">
                <Eye className="h-3 w-3" />
                {formatNumber(article.views)}
              </span>
              <span className="flex items-center gap-1" data-testid="article-likes">
                <Heart className="h-3 w-3" />
                {formatNumber(article.likesCount)}
              </span>
              <span className="flex items-center gap-1" data-testid="article-saves">
                <Bookmark className="h-3 w-3" />
                {formatNumber(article.savesCount)}
              </span>
              <span className="flex items-center gap-1" data-testid="article-shares">
                <Share2 className="h-3 w-3" />
                {formatNumber(article.sharesCount)}
              </span>
              <span className="flex items-center gap-1" data-testid="article-comments">
                <MessageSquare className="h-3 w-3" />
                {formatNumber(article.commentsCount)}
              </span>
            </div>

            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <FileText className="h-3 w-3" />
                {formatNumber(article.wordCount)} كلمة
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {article.avgReadingTime > 0 
                  ? `${article.avgReadingTime.toFixed(1)} دقيقة`
                  : 'لا توجد بيانات'}
              </span>
              {article.publishedAt && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {format(new Date(article.publishedAt), 'dd MMM yyyy', { locale: arSA })}
                </span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ArticleDetailPanel({ 
  articleId, 
  onClose,
  onExportPDF 
}: { 
  articleId: string; 
  onClose: () => void;
  onExportPDF: (article: ArticleDetail) => void;
}) {
  const { data: article, isLoading } = useQuery<ArticleDetail>({
    queryKey: ['/api/admin/article-analytics', articleId],
    enabled: !!articleId,
  });

  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-8 w-full" />
        <div className="grid grid-cols-2 gap-3">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <Skeleton className="h-40" />
      </div>
    );
  }

  if (!article) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <p>لم يتم العثور على المقال</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[calc(100vh-200px)]">
      <div className="space-y-6 p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold line-clamp-2" data-testid="detail-title">
              {article.title}
            </h2>
            <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
              {article.category && (
                <Badge variant="outline">{article.category.nameAr}</Badge>
              )}
              {article.author && (
                <span>بواسطة: {article.author.name}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onExportPDF(article)}
              data-testid="button-export-pdf"
            >
              <FileDown className="h-4 w-4 ml-1" />
              تصدير PDF
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              data-testid="button-close-detail"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <Separator />

        <div>
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            الإحصائيات الرئيسية
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <StatCard icon={Eye} label="المشاهدات" value={article.views} color="blue" />
            <StatCard icon={Heart} label="الإعجابات" value={article.likesCount} color="pink" />
            <StatCard icon={Bookmark} label="الحفظ" value={article.savesCount} color="purple" />
            <StatCard icon={Share2} label="المشاركات" value={article.sharesCount} color="green" />
            <StatCard icon={MessageSquare} label="التعليقات" value={article.commentsCount} color="orange" />
            <StatCard icon={FileText} label="عدد الكلمات" value={article.wordCount} color="cyan" />
            <StatCard 
              icon={Clock} 
              label="متوسط وقت القراءة" 
              value={article.readingStats.avgReadingTime > 0 
                ? `${article.readingStats.avgReadingTime.toFixed(1)} دقيقة`
                : 'لا توجد بيانات'} 
              color="primary"
            />
            <StatCard 
              icon={Users} 
              label="إجمالي القراء" 
              value={article.readingStats.totalReaders} 
              color="blue"
              subValue={`${article.readingStats.totalReadSessions} جلسة قراءة`}
            />
          </div>
        </div>

        {article.readingStats.avgScrollDepth > 0 && (
          <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              إحصائيات القراءة
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">متوسط عمق التمرير</p>
                <p className="text-lg font-bold">{article.readingStats.avgScrollDepth.toFixed(0)}%</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">معدل الإكمال</p>
                <p className="text-lg font-bold">{article.readingStats.avgCompletionRate.toFixed(0)}%</p>
              </div>
            </div>
          </div>
        )}

        {article.commentsBreakdown && (
          <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              تفصيل التعليقات
            </h3>
            <div className="grid grid-cols-4 gap-2">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-center">
                <p className="text-xs text-muted-foreground">موافق عليها</p>
                <p className="text-lg font-bold text-emerald-600">{article.commentsBreakdown.approved}</p>
              </div>
              <div className="p-2 rounded-lg bg-amber-500/10 text-center">
                <p className="text-xs text-muted-foreground">قيد المراجعة</p>
                <p className="text-lg font-bold text-amber-600">{article.commentsBreakdown.pending}</p>
              </div>
              <div className="p-2 rounded-lg bg-red-500/10 text-center">
                <p className="text-xs text-muted-foreground">مرفوضة</p>
                <p className="text-lg font-bold text-red-600">{article.commentsBreakdown.rejected}</p>
              </div>
              <div className="p-2 rounded-lg bg-orange-500/10 text-center">
                <p className="text-xs text-muted-foreground">مُبلغ عنها</p>
                <p className="text-lg font-bold text-orange-600">{article.commentsBreakdown.flagged}</p>
              </div>
            </div>
          </div>
        )}

        {article.recentComments && article.recentComments.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold mb-3">آخر التعليقات</h3>
            <div className="space-y-2">
              {article.recentComments.slice(0, 5).map((comment) => (
                <div 
                  key={comment.id} 
                  className="p-3 rounded-lg bg-muted/50 text-sm"
                  data-testid={`comment-${comment.id}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium">{comment.user?.name || 'مستخدم'}</span>
                    <Badge 
                      variant={comment.status === 'approved' ? 'default' : 'secondary'}
                      className="text-xs"
                    >
                      {comment.status === 'approved' ? 'موافق عليه' : 
                       comment.status === 'pending' ? 'قيد المراجعة' : 
                       comment.status === 'rejected' ? 'مرفوض' : 'مُبلغ عنه'}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground line-clamp-2">{comment.content}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {format(new Date(comment.createdAt), 'dd MMM yyyy - HH:mm', { locale: arSA })}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="pt-4">
          <Button
            variant="outline"
            className="w-full"
            asChild
          >
            <a 
              href={`/article/${article.englishSlug || article.slug}`} 
              target="_blank" 
              rel="noopener noreferrer"
              data-testid="link-view-article"
            >
              <ExternalLink className="h-4 w-4 ml-2" />
              عرض المقال
            </a>
          </Button>
        </div>
      </div>
    </ScrollArea>
  );
}

export default function ArticleAnalyticsDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [dateRange, setDateRange] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("views");
  const [offset, setOffset] = useState(0);
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const limit = 10;

  const getDateRange = useCallback(() => {
    const now = new Date();
    switch (dateRange) {
      case "7days":
        return { from: subDays(now, 7).toISOString(), to: now.toISOString() };
      case "30days":
        return { from: subDays(now, 30).toISOString(), to: now.toISOString() };
      case "90days":
        return { from: subDays(now, 90).toISOString(), to: now.toISOString() };
      case "year":
        return { from: subMonths(now, 12).toISOString(), to: now.toISOString() };
      default:
        return { from: undefined, to: undefined };
    }
  }, [dateRange]);

  const buildQueryParams = useCallback(() => {
    const params = new URLSearchParams();
    if (searchQuery) params.set("query", searchQuery);
    if (selectedCategory !== "all") params.set("categoryId", selectedCategory);
    if (selectedStatus !== "all") params.set("status", selectedStatus);
    if (sortBy) params.set("sortBy", sortBy);
    params.set("limit", String(limit));
    params.set("offset", String(offset));
    
    const { from, to } = getDateRange();
    if (from) params.set("dateFrom", from);
    if (to) params.set("dateTo", to);
    
    return params.toString();
  }, [searchQuery, selectedCategory, selectedStatus, sortBy, offset, getDateRange]);

  const { data: categoriesRaw } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });
  const categories = Array.isArray(categoriesRaw) ? categoriesRaw : [];

  const { data: searchData, isLoading: isSearching, refetch } = useQuery<SearchResponse>({
    queryKey: [`/api/admin/article-analytics/search?${buildQueryParams()}`],
    enabled: !!user,
  });

  useEffect(() => {
    setOffset(0);
  }, [searchQuery, selectedCategory, selectedStatus, dateRange, sortBy]);

  useEffect(() => {
    document.title = "تحليلات المقالات - لوحة التحكم";
  }, []);

  const handleSearch = useCallback(() => {
    setOffset(0);
    refetch();
  }, [refetch]);

  const handleExportPDF = useCallback(async (article: ArticleDetail) => {
    setIsExporting(true);
    try {
      const response = await fetch(`/api/admin/article-analytics/${article.id}/export`, {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('فشل في تصدير التقرير');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `تقرير-${article.slug}-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "تم التصدير بنجاح",
        description: "تم تحميل تقرير PDF بنجاح",
      });
    } catch (error) {
      toast({
        title: "خطأ في التصدير",
        description: "حدث خطأ أثناء تصدير التقرير. يرجى المحاولة مرة أخرى.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  }, [toast]);

  const clearFilters = useCallback(() => {
    setSearchQuery("");
    setSelectedCategory("all");
    setSelectedStatus("all");
    setDateRange("all");
    setSortBy("views");
    setOffset(0);
  }, []);

  const articles = searchData?.articles || [];
  const pagination = searchData?.pagination;
  const totalPages = pagination ? Math.ceil(pagination.totalCount / limit) : 0;
  const currentPage = pagination ? Math.floor(pagination.offset / limit) + 1 : 1;

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-background" dir="rtl">
      <div className="container mx-auto p-4 md:p-6 lg:p-8" data-testid="article-analytics-dashboard">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
              <BarChart3 className="h-8 w-8 text-primary" />
              تحليلات المقالات
            </h1>
            <p className="text-muted-foreground mt-1">
              بحث وتحليل شامل لأداء المقالات
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Search className="h-5 w-5" />
                  البحث والتصفية
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="ابحث بالعنوان أو الكلمات المفتاحية..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                      className="pr-10"
                      data-testid="input-search"
                    />
                  </div>
                  <Button onClick={handleSearch} data-testid="button-search">
                    <Search className="h-4 w-4 ml-1" />
                    بحث
                  </Button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                    <SelectTrigger data-testid="select-category">
                      <SelectValue placeholder="التصنيف" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">جميع التصنيفات</SelectItem>
                      {categories?.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.nameAr || cat.slug}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                    <SelectTrigger data-testid="select-status">
                      <SelectValue placeholder="الحالة" />
                    </SelectTrigger>
                    <SelectContent>
                      {statusOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={dateRange} onValueChange={setDateRange}>
                    <SelectTrigger data-testid="select-date-range">
                      <SelectValue placeholder="الفترة الزمنية" />
                    </SelectTrigger>
                    <SelectContent>
                      {dateRangeOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={sortBy} onValueChange={setSortBy}>
                    <SelectTrigger data-testid="select-sort">
                      <ArrowUpDown className="h-4 w-4 ml-1" />
                      <SelectValue placeholder="الترتيب" />
                    </SelectTrigger>
                    <SelectContent>
                      {sortOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {(searchQuery || selectedCategory !== "all" || selectedStatus !== "all" || dateRange !== "all") && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">الفلاتر النشطة:</span>
                    {searchQuery && (
                      <Badge variant="secondary" className="gap-1">
                        {searchQuery}
                        <X 
                          className="h-3 w-3 cursor-pointer" 
                          onClick={() => setSearchQuery("")}
                        />
                      </Badge>
                    )}
                    {selectedCategory !== "all" && (
                      <Badge variant="secondary" className="gap-1">
                        {categories?.find(c => c.id === selectedCategory)?.nameAr}
                        <X 
                          className="h-3 w-3 cursor-pointer" 
                          onClick={() => setSelectedCategory("all")}
                        />
                      </Badge>
                    )}
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={clearFilters}
                      className="text-xs"
                    >
                      مسح الكل
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">
                    النتائج
                    {pagination && (
                      <Badge variant="outline" className="mr-2">
                        {formatNumber(pagination.totalCount)} مقال
                      </Badge>
                    )}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {isSearching ? (
                  <div className="space-y-3">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-32" />
                    ))}
                  </div>
                ) : articles.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>لا توجد نتائج مطابقة للبحث</p>
                    <p className="text-sm">جرب تغيير معايير البحث</p>
                  </div>
                ) : (
                  <>
                    {articles.map((article) => (
                      <ArticleCard
                        key={article.id}
                        article={article}
                        onSelect={setSelectedArticleId}
                        isSelected={selectedArticleId === article.id}
                      />
                    ))}

                    {pagination && totalPages > 1 && (
                      <div className="flex items-center justify-between pt-4">
                        <p className="text-sm text-muted-foreground">
                          صفحة {currentPage} من {totalPages}
                        </p>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={offset === 0}
                            onClick={() => setOffset(Math.max(0, offset - limit))}
                            data-testid="button-prev-page"
                          >
                            <ChevronRight className="h-4 w-4" />
                            السابق
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!pagination.hasMore}
                            onClick={() => setOffset(offset + limit)}
                            data-testid="button-next-page"
                          >
                            التالي
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-1">
            <Card className="sticky top-4">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  تفاصيل المقال
                </CardTitle>
                <CardDescription>
                  اختر مقالاً لعرض التفاصيل
                </CardDescription>
              </CardHeader>
              <CardContent>
                {selectedArticleId ? (
                  <ArticleDetailPanel
                    articleId={selectedArticleId}
                    onClose={() => setSelectedArticleId(null)}
                    onExportPDF={handleExportPDF}
                  />
                ) : (
                  <div dir="rtl" className="text-center py-12 text-muted-foreground">
                    <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>اختر مقالاً من القائمة</p>
                    <p className="text-sm">لعرض الإحصائيات التفصيلية</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {isExporting && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-card p-6 rounded-lg shadow-lg text-center space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
            <p className="font-medium">جاري تصدير التقرير...</p>
          </div>
        </div>
      )}
      </div>
    </DashboardLayout>
  );
}
