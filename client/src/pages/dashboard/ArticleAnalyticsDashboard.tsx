import { useState, useEffect, useCallback, useMemo } from "react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
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
  Users,
  Network
} from "lucide-react";
import { format, subDays, subMonths } from "date-fns";
import { arSA } from "date-fns/locale";
import { useAuth, hasPermission } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { DashboardLayout } from "@/components/DashboardLayout";
import { formatNumber } from "@/lib/format";
import { apiUrl } from "@/lib/queryClient";
import { PERMISSION_CODES } from "@shared/rbac-constants";

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
  locale?: "ar" | "en";
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
    hasMore?: boolean;
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
    <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-3">
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
              <div className="flex flex-shrink-0 items-center gap-1">
                {article.locale === "en" && (
                  <Badge variant="outline" className="text-xs">EN</Badge>
                )}
                <Badge 
                  variant={article.status === 'published' ? 'default' : 'secondary'}
                  className="text-xs"
                >
                  {article.status === 'published' ? 'منشور' : 
                   article.status === 'draft' ? 'مسودة' : 'مؤرشف'}
                </Badge>
              </div>
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

interface ArticleIpBreakdown {
  distinctIps: number;
  totalCountedViews: number;
  storedViews: number;
  topIps: Array<{ ipRef: string; views: number; firstSeen: string; lastSeen: string }>;
}

// Per-IP visit breakdown — answers "is this article's traffic from one IP?".
// Forward-only: only fills for views that happen after the feature is deployed.
function IpBreakdownSection({ articleId }: { articleId: string }) {
  const { data, isLoading } = useQuery<ArticleIpBreakdown>({
    queryKey: ["/api/admin/articles", articleId, "ip-views"],
    enabled: !!articleId,
  });

  return (
    <div>
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <Network className="h-4 w-4" />
        الزيارات حسب عنوان IP
      </h3>
      {isLoading ? (
        <Skeleton className="h-24" />
      ) : !data || data.distinctIps === 0 ? (
        <div className="p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground" data-testid="ip-breakdown-empty">
          لا توجد بيانات IP لهذا المقال بعد — يبدأ التجميع للزيارات الجديدة فقط (ميزة تقدمية).
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="p-3 rounded-lg bg-muted/50 text-center">
              <p className="text-xs text-muted-foreground">عناوين مختلفة</p>
              <p className="text-lg font-bold" data-testid="ip-distinct">{formatNumber(data.distinctIps)}</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50 text-center">
              <p className="text-xs text-muted-foreground">زيارات محتسَبة</p>
              <p className="text-lg font-bold">{formatNumber(data.totalCountedViews)}</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50 text-center">
              <p className="text-xs text-muted-foreground">العدّاد المعروض</p>
              <p className="text-lg font-bold">{formatNumber(data.storedViews)}</p>
            </div>
          </div>
          {data.distinctIps === 1 && (
            <div className="mb-3 p-2 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs text-center" data-testid="ip-single-warning">
              ⚠️ كل الزيارات المحتسَبة من عنوان IP واحد
            </div>
          )}
          <div className="space-y-1">
            {data.topIps.map((row) => (
              <div key={row.ipRef} className="flex items-center justify-between p-2 rounded-lg bg-muted/30 text-xs">
                <span className="font-mono text-muted-foreground">{row.ipRef}…</span>
                <span className="flex items-center gap-3">
                  <span className="font-medium">{formatNumber(row.views)} زيارة</span>
                  <span className="text-muted-foreground">
                    {row.lastSeen ? format(new Date(row.lastSeen), "dd MMM HH:mm", { locale: arSA }) : "—"}
                  </span>
                </span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            العناوين مُجزّأة (hash) لحماية الخصوصية. تُحتسب زيارة واحدة لكل IP كل 5 دقائق.
          </p>
        </>
      )}
    </div>
  );
}

function ArticleDetailPanel({
  articleId,
  onClose,
  onExportPDF,
  onExportPrClientReport,
  canExportPrClientReport,
}: {
  articleId: string;
  onClose: () => void;
  onExportPDF: (article: ArticleDetail) => void;
  onExportPrClientReport: (article: ArticleDetail) => void;
  canExportPrClientReport: boolean;
}) {
  const { data: article, isLoading, isError, error, refetch } = useQuery<ArticleDetail>({
    queryKey: ["/api/admin/article-analytics", articleId],
    enabled: !!articleId,
    retry: 1,
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

  if (isError) {
    return (
      <div className="space-y-3 p-6 text-center">
        <p className="text-sm text-destructive">تعذر تحميل تفاصيل المقال</p>
        <p className="text-xs text-muted-foreground">
          {(error as Error)?.message || "خطأ غير متوقع"}
        </p>
        <Button size="sm" variant="outline" onClick={() => refetch()}>
          إعادة المحاولة
        </Button>
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
          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            {canExportPrClientReport && (
              <Button
                size="sm"
                onClick={() => onExportPrClientReport(article)}
                data-testid="button-export-pr-client-pdf"
                className="gap-1.5"
              >
                <FileDown className="h-4 w-4" />
                تقرير للعميل PDF
              </Button>
            )}
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

        <IpBreakdownSection articleId={article.id} />

        { (article.readingStats.avgScrollDepth > 0 || article.readingStats.avgCompletionRate > 0) && (
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
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-lg border border-border/60 bg-card p-2 text-center">
                <p className="text-xs text-muted-foreground">موافق عليها</p>
                <p className="text-lg font-bold text-emerald-600">{article.commentsBreakdown.approved}</p>
              </div>
              <div className="rounded-lg border border-border/60 bg-card p-2 text-center">
                <p className="text-xs text-muted-foreground">قيد المراجعة</p>
                <p className="text-lg font-bold text-amber-600">{article.commentsBreakdown.pending}</p>
              </div>
              <div className="rounded-lg border border-red-500/20 bg-card p-2 text-center">
                <p className="text-xs text-muted-foreground">مرفوضة</p>
                <p className="text-lg font-bold text-red-600">{article.commentsBreakdown.rejected}</p>
              </div>
              <div className="rounded-lg border border-orange-500/20 bg-card p-2 text-center">
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
              href={
                article.locale === "en"
                  ? `/en/article/${article.slug || article.englishSlug}`
                  : `/article/${article.englishSlug || article.slug}`
              } 
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
  const canExportPrClientReport = hasPermission(user, PERMISSION_CODES.SYSTEM_MANAGE_SETTINGS);
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("published");
  const [dateRange, setDateRange] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("publishedAt");
  const [offset, setOffset] = useState(0);
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [prClientDialogOpen, setPrClientDialogOpen] = useState(false);
  const [prClientArticle, setPrClientArticle] = useState<ArticleDetail | null>(null);
  const [prClientName, setPrClientName] = useState("");
  const [prClientLang, setPrClientLang] = useState<"ar" | "en">("ar");

  const limit = 20;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.trim());
    }, 350);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  // The date range feeds the queryKey, so it MUST be stable across renders.
  // A raw `new Date()` recomputed on every render produced a fresh key each time
  // → React Query refetched forever and the list never left its loading state.
  // Anchored to the current minute so repeat renders resolve to the same value.
  const dateRangeParams = useMemo(() => {
    const now = new Date();
    now.setSeconds(0, 0);
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

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (debouncedSearchQuery) params.set("query", debouncedSearchQuery);
    if (selectedCategory !== "all") params.set("categoryId", selectedCategory);
    if (selectedStatus !== "all") params.set("status", selectedStatus);
    if (sortBy) params.set("sortBy", sortBy);
    params.set("limit", String(limit));
    params.set("offset", String(offset));

    const { from, to } = dateRangeParams;
    if (from) params.set("dateFrom", from);
    if (to) params.set("dateTo", to);

    return params.toString();
  }, [debouncedSearchQuery, selectedCategory, selectedStatus, sortBy, offset, dateRangeParams]);

  const { data: categoriesRaw } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });
  const categories = Array.isArray(categoriesRaw) ? categoriesRaw : [];

  const { data: searchData, isLoading: isSearching } = useQuery<SearchResponse>({
    queryKey: [`/api/admin/article-analytics/search?${queryParams}`],
    enabled: !!user,
  });

  useEffect(() => {
    setOffset(0);
  }, [debouncedSearchQuery, selectedCategory, selectedStatus, dateRange, sortBy]);

  useEffect(() => {
    document.title = "تحليلات المقالات - لوحة التحكم";
  }, []);

  const handleSearch = useCallback(() => {
    setDebouncedSearchQuery(searchQuery.trim());
    setOffset(0);
  }, [searchQuery]);

  const handleExportPDF = useCallback(async (article: ArticleDetail) => {
    setIsExporting(true);
    try {
      const response = await fetch(apiUrl(`/api/admin/article-analytics/${article.id}/export`), {
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

  const handleExportPrClientReport = useCallback((article: ArticleDetail) => {
    setPrClientArticle(article);
    setPrClientName("");
    setPrClientLang(article.locale === "en" ? "en" : "ar");
    setPrClientDialogOpen(true);
  }, []);

  const confirmExportPrClientReport = useCallback(async () => {
    if (!prClientArticle) return;
    const article = prClientArticle;
    const clientName = prClientName.trim();
    const lang = prClientLang;
    setPrClientDialogOpen(false);
    setIsExporting(true);
    try {
      const params = new URLSearchParams();
      if (clientName) params.set("clientName", clientName);
      params.set("lang", lang);
      const qs = params.toString();
      const response = await fetch(
        apiUrl(
          `/api/admin/articles/${article.id}/pr-client-report.pdf${qs ? `?${qs}` : ""}`,
        ),
        { method: "GET", credentials: "include" },
      );
      if (!response.ok) {
        let detail = "";
        try {
          const payload = await response.json();
          detail = payload?.detail || payload?.message || "";
        } catch {
          /* ignore */
        }
        throw new Error(detail || "فشل في تصدير تقرير العميل");
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const langTag = lang === "en" ? "EN" : "AR";
      a.download = `sabq-pr-report-${langTag}-${article.slug || article.id}-${format(new Date(), "yyyy-MM-dd")}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast({
        title: lang === "en" ? "English client report ready" : "تم إنشاء تقرير العميل",
        description: clientName
          ? lang === "en"
            ? `Ready to share with: ${clientName}`
            : `جاهز للمشاركة مع: ${clientName}`
          : lang === "en"
            ? "PDF ready to share with the client"
            : "ملف PDF جاهز للمشاركة مع العميل",
      });
    } catch (error) {
      toast({
        title: "تعذر إنشاء التقرير",
        description:
          error instanceof Error && error.message
            ? error.message
            : "حدث خطأ أثناء إنشاء تقرير العميل. حاول مرة أخرى.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
      setPrClientArticle(null);
    }
  }, [prClientArticle, prClientName, prClientLang, toast]);

  const clearFilters = useCallback(() => {
    setSearchQuery("");
    setSelectedCategory("all");
    setSelectedStatus("published");
    setDateRange("all");
    setSortBy("publishedAt");
    setOffset(0);
  }, []);

  const articles = searchData?.articles || [];
  const pagination = searchData?.pagination;
  const currentPage = pagination ? Math.floor(pagination.offset / limit) + 1 : 1;
  const showNext = Boolean(pagination?.hasMore);

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-background" dir="rtl">
      <div className="mx-auto max-w-[1600px] space-y-6 pb-10" data-testid="article-analytics-dashboard">
        <header className="flex items-center gap-3 border-b border-border/60 pb-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <BarChart3 className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">تحليلات المقالات</h1>
            <p className="mt-1 text-sm text-muted-foreground">بحث وتحليل شامل لأداء المقالات</p>
          </div>
        </header>

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
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="relative flex-1">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="ابحث بالعنوان العربي أو الإنجليزي أو الرابط..."
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

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
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

                {(searchQuery || selectedCategory !== "all" || selectedStatus !== "published" || dateRange !== "all" || sortBy !== "publishedAt") && (
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
                    {articles.length > 0 && (
                      <Badge variant="outline" className="mr-2">
                        {searchQuery ? `${articles.length} نتيجة` : `آخر ${articles.length}`}
                      </Badge>
                    )}
                  </CardTitle>
                </div>
                <CardDescription>
                  يُعرض أحدث 20 خبراً منشوراً. استخدم البحث لإيجاد خبر محدد.
                </CardDescription>
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

                    {(offset > 0 || showNext) && (
                      <div className="flex items-center justify-between pt-4">
                        <p className="text-sm text-muted-foreground">
                          صفحة {currentPage}
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
                            disabled={!showNext}
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
            <Card className="lg:sticky lg:top-4">
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
                    onExportPrClientReport={handleExportPrClientReport}
                    canExportPrClientReport={canExportPrClientReport}
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

      <Dialog open={prClientDialogOpen} onOpenChange={setPrClientDialogOpen}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>تقرير للعميل PDF</DialogTitle>
            <DialogDescription>
              اختر لغة التقرير وأدخل اسم العميل أو الحملة (اختياري). النسخة الإنجليزية تستخدم الترجمة المرتبطة بنفس التصميم.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="pr-client-lang">لغة التقرير</Label>
              <Select
                value={prClientLang}
                onValueChange={(value) => setPrClientLang(value === "en" ? "en" : "ar")}
              >
                <SelectTrigger id="pr-client-lang" data-testid="select-pr-client-lang">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ar">عربي</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pr-client-name">اسم العميل / الحملة</Label>
              <Input
                id="pr-client-name"
                value={prClientName}
                onChange={(e) => setPrClientName(e.target.value)}
                placeholder="مثال: حملة موسم العلا — شركة …"
                maxLength={120}
                data-testid="input-pr-client-name"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void confirmExportPrClientReport();
                  }
                }}
              />
            </div>
            {prClientArticle && (
              <p className="text-xs text-muted-foreground line-clamp-2">
                {prClientArticle.title}
              </p>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setPrClientDialogOpen(false)}
              data-testid="button-pr-client-cancel"
            >
              إلغاء
            </Button>
            <Button
              onClick={() => void confirmExportPrClientReport()}
              data-testid="button-pr-client-confirm"
            >
              <FileDown className="h-4 w-4 ml-1" />
              {prClientLang === "en" ? "Create English PDF" : "إنشاء التقرير"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </DashboardLayout>
  );
}
