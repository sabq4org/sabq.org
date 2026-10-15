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
  X,
  ChevronLeft,
  ChevronRight,
  FileDown,
  Loader2,
  Calendar,
  ArrowUpDown,
  ExternalLink,
  Users,
  Network,
  RefreshCw,
  Filter,
} from "lucide-react";
import { format, subDays, subMonths } from "date-fns";
import { arSA } from "date-fns/locale";
import { useAuth, hasPermission } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { formatNumber } from "@/lib/format";
import { apiUrl } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
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
  subValue,
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
      <div className={`p-2 rounded-lg shrink-0 ${colorClasses[color] || colorClasses.primary}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground truncate">{label}</p>
        <p className="text-lg font-bold tabular-nums" data-testid={`stat-${label}`}>
          {typeof value === "number" ? formatNumber(value) : value}
        </p>
        {subValue && (
          <p className="text-xs text-muted-foreground truncate">{subValue}</p>
        )}
      </div>
    </div>
  );
}

function ArticleMobileCard({
  article,
  onSelect,
  isSelected,
}: {
  article: ArticleAnalytics;
  onSelect: (id: string) => void;
  isSelected: boolean;
}) {
  return (
    <Card
      className={cn(
        "cursor-pointer rounded-xl border-border/60 bg-card transition-all hover-elevate",
        isSelected && "ring-2 ring-primary border-primary/50",
      )}
      onClick={() => onSelect(article.id)}
      data-testid={`article-card-${article.id}-mobile`}
    >
      <CardContent className="p-3.5">
        <div className="flex gap-3">
          {(article.imageUrl || article.thumbnailUrl) && (
            <div className="flex-shrink-0 w-20 h-16 rounded-lg overflow-hidden bg-muted">
              <img
                src={article.imageUrl || article.thumbnailUrl || ""}
                alt={article.title}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
          )}
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-sm line-clamp-2" data-testid="article-title-mobile">
                {article.title}
              </h3>
              <div className="flex flex-shrink-0 items-center gap-1">
                {article.locale === "en" && (
                  <Badge variant="outline" className="text-[11px] px-1.5 py-0">
                    EN
                  </Badge>
                )}
                <Badge
                  variant={article.status === "published" ? "default" : "secondary"}
                  className="text-[11px] px-1.5 py-0"
                >
                  {article.status === "published"
                    ? "منشور"
                    : article.status === "draft"
                      ? "مسودة"
                      : "مؤرشف"}
                </Badge>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {article.category && (
                <Badge variant="outline" className="text-[11px] px-1.5 py-0">
                  {article.category.nameAr}
                </Badge>
              )}
              {article.publishedAt && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  {format(new Date(article.publishedAt), "dd MMM yyyy", { locale: arSA })}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-3 pt-2.5 border-t border-border/50 grid grid-cols-5 gap-1 text-center text-xs text-muted-foreground">
          <div className="flex flex-col items-center gap-0.5" data-testid="article-views-mobile">
            <span className="flex items-center gap-1 font-semibold tabular-nums text-foreground">
              <Eye className="h-3 w-3 text-blue-500" />
              {formatNumber(article.views)}
            </span>
            <span className="text-[10px]">مشاهدة</span>
          </div>
          <div className="flex flex-col items-center gap-0.5" data-testid="article-likes-mobile">
            <span className="flex items-center gap-1 font-semibold tabular-nums text-foreground">
              <Heart className="h-3 w-3 text-pink-500" />
              {formatNumber(article.likesCount)}
            </span>
            <span className="text-[10px]">إعجاب</span>
          </div>
          <div className="flex flex-col items-center gap-0.5" data-testid="article-saves-mobile">
            <span className="flex items-center gap-1 font-semibold tabular-nums text-foreground">
              <Bookmark className="h-3 w-3 text-purple-500" />
              {formatNumber(article.savesCount)}
            </span>
            <span className="text-[10px]">حفظ</span>
          </div>
          <div className="flex flex-col items-center gap-0.5" data-testid="article-shares-mobile">
            <span className="flex items-center gap-1 font-semibold tabular-nums text-foreground">
              <Share2 className="h-3 w-3 text-emerald-500" />
              {formatNumber(article.sharesCount)}
            </span>
            <span className="text-[10px]">مشاركة</span>
          </div>
          <div className="flex flex-col items-center gap-0.5" data-testid="article-comments-mobile">
            <span className="flex items-center gap-1 font-semibold tabular-nums text-foreground">
              <MessageSquare className="h-3 w-3 text-orange-500" />
              {formatNumber(article.commentsCount)}
            </span>
            <span className="text-[10px]">تعليق</span>
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

  const topIps = Array.isArray(data?.topIps) ? data.topIps : [];

  return (
    <div>
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <Network className="h-4 w-4 text-primary" />
        الزيارات حسب عنوان IP
      </h3>
      {isLoading ? (
        <Skeleton className="h-24 rounded-xl" />
      ) : !data || data.distinctIps === 0 ? (
        <div className="p-3 rounded-xl border border-border/60 bg-muted/40 text-sm text-muted-foreground" data-testid="ip-breakdown-empty">
          لا توجد بيانات IP لهذا المقال بعد — يبدأ التجميع للزيارات الجديدة فقط (ميزة تقدمية).
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2.5 mb-3">
            <div className="p-2.5 rounded-xl border border-border/60 bg-muted/40 text-center">
              <p className="text-xs text-muted-foreground">عناوين مختلفة</p>
              <p className="text-lg font-bold tabular-nums" data-testid="ip-distinct">
                {formatNumber(data.distinctIps)}
              </p>
            </div>
            <div className="p-2.5 rounded-xl border border-border/60 bg-muted/40 text-center">
              <p className="text-xs text-muted-foreground">زيارات محتسَبة</p>
              <p className="text-lg font-bold tabular-nums">{formatNumber(data.totalCountedViews)}</p>
            </div>
            <div className="p-2.5 rounded-xl border border-border/60 bg-muted/40 text-center">
              <p className="text-xs text-muted-foreground">العدّاد المعروض</p>
              <p className="text-lg font-bold tabular-nums">{formatNumber(data.storedViews)}</p>
            </div>
          </div>
          {data.distinctIps === 1 && (
            <div className="mb-3 p-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs text-center" data-testid="ip-single-warning">
              ⚠️ كل الزيارات المحتسَبة من عنوان IP واحد
            </div>
          )}
          <div className="space-y-1.5">
            {topIps.map((row) => (
              <div key={row.ipRef} className="flex items-center justify-between p-2 rounded-lg bg-muted/30 text-xs">
                <span className="font-mono text-muted-foreground">{row.ipRef}…</span>
                <span className="flex items-center gap-3">
                  <span className="font-medium tabular-nums">{formatNumber(row.views)} زيارة</span>
                  <span className="text-muted-foreground tabular-nums">
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
        <Skeleton className="h-8 w-full rounded-xl" />
        <div className="grid grid-cols-2 gap-3">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-40 rounded-xl" />
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

  const recentComments = Array.isArray(article.recentComments) ? article.recentComments : [];
  const avgReadingTime = article.readingStats?.avgReadingTime ?? 0;
  const totalReaders = article.readingStats?.totalReaders ?? 0;
  const totalReadSessions = article.readingStats?.totalReadSessions ?? 0;
  const avgScrollDepth = article.readingStats?.avgScrollDepth ?? 0;
  const avgCompletionRate = article.readingStats?.avgCompletionRate ?? 0;

  return (
    <ScrollArea className="h-[calc(100vh-200px)]">
      <div className="space-y-6 p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg sm:text-xl font-bold line-clamp-2" data-testid="detail-title">
              {article.title}
            </h2>
            <div className="flex flex-wrap items-center gap-2 mt-2 text-sm text-muted-foreground">
              {article.category && (
                <Badge variant="outline">{article.category.nameAr}</Badge>
              )}
              {article.author && (
                <span>بواسطة: {article.author.name}</span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-stretch gap-2 sm:items-end shrink-0">
            {canExportPrClientReport && (
              <Button
                size="sm"
                onClick={() => onExportPrClientReport(article)}
                data-testid="button-export-pr-client-pdf"
                className="gap-1.5 rounded-xl"
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
                className="rounded-xl"
              >
                <FileDown className="h-4 w-4 ml-1" />
                تصدير PDF
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                data-testid="button-close-detail"
                className="rounded-xl"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <Separator />

        <div>
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
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
              value={avgReadingTime > 0 ? `${avgReadingTime.toFixed(1)} دقيقة` : "لا توجد بيانات"}
              color="primary"
            />
            <StatCard
              icon={Users}
              label="إجمالي القراء"
              value={totalReaders}
              color="blue"
              subValue={`${totalReadSessions} جلسة قراءة`}
            />
          </div>
        </div>

        <IpBreakdownSection articleId={article.id} />

        {(avgScrollDepth > 0 || avgCompletionRate > 0) && (
          <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              إحصائيات القراءة
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl border border-border/60 bg-muted/40">
                <p className="text-xs text-muted-foreground">متوسط عمق التمرير</p>
                <p className="text-lg font-bold tabular-nums">{avgScrollDepth.toFixed(0)}%</p>
              </div>
              <div className="p-3 rounded-xl border border-border/60 bg-muted/40">
                <p className="text-xs text-muted-foreground">معدل الإكمال</p>
                <p className="text-lg font-bold tabular-nums">{avgCompletionRate.toFixed(0)}%</p>
              </div>
            </div>
          </div>
        )}

        {article.commentsBreakdown && (
          <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" />
              تفصيل التعليقات
            </h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-xl border border-border/60 bg-card p-2.5 text-center">
                <p className="text-xs text-muted-foreground">موافق عليها</p>
                <p className="text-lg font-bold tabular-nums text-emerald-600">{article.commentsBreakdown.approved}</p>
              </div>
              <div className="rounded-xl border border-border/60 bg-card p-2.5 text-center">
                <p className="text-xs text-muted-foreground">قيد المراجعة</p>
                <p className="text-lg font-bold tabular-nums text-amber-600">{article.commentsBreakdown.pending}</p>
              </div>
              <div className="rounded-xl border border-red-500/20 bg-card p-2.5 text-center">
                <p className="text-xs text-muted-foreground">مرفوضة</p>
                <p className="text-lg font-bold tabular-nums text-red-600">{article.commentsBreakdown.rejected}</p>
              </div>
              <div className="rounded-xl border border-orange-500/20 bg-card p-2.5 text-center">
                <p className="text-xs text-muted-foreground">مُبلغ عنها</p>
                <p className="text-lg font-bold tabular-nums text-orange-600">{article.commentsBreakdown.flagged}</p>
              </div>
            </div>
          </div>
        )}

        {recentComments.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold mb-3">آخر التعليقات</h3>
            <div className="space-y-2">
              {recentComments.slice(0, 5).map((comment) => (
                <div
                  key={comment.id}
                  className="p-3 rounded-xl border border-border/60 bg-muted/40 text-sm"
                  data-testid={`comment-${comment.id}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium">{comment.user?.name || "مستخدم"}</span>
                    <Badge
                      variant={comment.status === "approved" ? "default" : "secondary"}
                      className="text-xs"
                    >
                      {comment.status === "approved"
                        ? "موافق عليه"
                        : comment.status === "pending"
                          ? "قيد المراجعة"
                          : comment.status === "rejected"
                            ? "مرفوض"
                            : "مُبلغ عنه"}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground line-clamp-2">{comment.content}</p>
                  <p className="text-xs text-muted-foreground mt-1 tabular-nums">
                    {format(new Date(comment.createdAt), "dd MMM yyyy - HH:mm", { locale: arSA })}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="pt-4">
          <Button variant="outline" className="w-full rounded-xl" asChild>
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

  const {
    data: searchData,
    isLoading: isSearching,
    isFetching: isFetchingSearch,
    refetch: refetchSearch,
  } = useQuery<SearchResponse>({
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

  const handleExportPDF = useCallback(
    async (article: ArticleDetail) => {
      setIsExporting(true);
      try {
        const response = await fetch(apiUrl(`/api/admin/article-analytics/${article.id}/export`), {
          method: "GET",
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error("فشل في تصدير التقرير");
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `تقرير-${article.slug}-${format(new Date(), "yyyy-MM-dd")}.pdf`;
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
    },
    [toast],
  );

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

  const articles = Array.isArray(searchData?.articles) ? searchData.articles : [];
  const pagination = searchData?.pagination;
  const currentPage = pagination ? Math.floor(pagination.offset / limit) + 1 : 1;
  const showNext = Boolean(pagination?.hasMore);
  const hasActiveFilters =
    Boolean(searchQuery) ||
    selectedCategory !== "all" ||
    selectedStatus !== "published" ||
    dateRange !== "all" ||
    sortBy !== "publishedAt";

  const kpiSummary = useMemo(() => {
    const count = articles.length;
    let totalViews = 0;
    let totalLikes = 0;
    let totalSaves = 0;
    let totalShares = 0;
    let totalComments = 0;
    let readingTimeSum = 0;
    let readingTimeCount = 0;

    for (const a of articles) {
      totalViews += Number(a.views || 0);
      totalLikes += Number(a.likesCount || 0);
      totalSaves += Number(a.savesCount || 0);
      totalShares += Number(a.sharesCount || 0);
      totalComments += Number(a.commentsCount || 0);
      if (Number(a.avgReadingTime) > 0) {
        readingTimeSum += Number(a.avgReadingTime);
        readingTimeCount += 1;
      }
    }

    const totalEngagement = totalLikes + totalSaves + totalShares + totalComments;
    const avgViews = count > 0 ? Math.round(totalViews / count) : 0;
    const avgReadingTime = readingTimeCount > 0 ? readingTimeSum / readingTimeCount : 0;

    return {
      count,
      totalCount: pagination?.totalCount ?? count,
      totalViews,
      avgViews,
      totalLikes,
      totalSaves,
      totalShares,
      totalComments,
      totalEngagement,
      avgReadingTime,
    };
  }, [articles, pagination?.totalCount]);

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-background" dir="rtl">
        <div className="mx-auto max-w-[1600px] space-y-6 pb-10" data-testid="article-analytics-dashboard">
          <DashboardPageHeader
            icon={BarChart3}
            title={
              <span className="flex flex-wrap items-center gap-2">
                <span>تحليلات المقالات</span>
                <Badge variant="secondary" className="rounded-lg px-2 py-0.5 text-xs font-medium">
                  تحليلات الأداء
                </Badge>
              </span>
            }
            description="بحث وتحليل شامل لأداء المقالات وتفاعلات القرّاء وتصدير تقارير PDF"
            titleTestId="text-article-analytics-title"
            actions={
              <div className="flex flex-wrap items-center gap-2">
                {hasActiveFilters && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={clearFilters}
                    className="h-9 gap-1.5 rounded-xl text-xs text-muted-foreground hover:text-foreground"
                    data-testid="button-header-clear-filters"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>مسح الفلاتر</span>
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void refetchSearch()}
                  disabled={isFetchingSearch}
                  className="h-9 gap-1.5 rounded-xl border-border/80 text-xs font-medium"
                  data-testid="button-refresh-analytics"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", isFetchingSearch && "animate-spin")} />
                  <span>تحديث البيانات</span>
                </Button>
              </div>
            }
          />

          {/* KPI Summary Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4" data-testid="kpi-summary-strip">
            <Card className="rounded-xl border-border/60 bg-card shadow-none">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs sm:text-sm font-medium text-muted-foreground">
                    إجمالي المقالات المطابقة
                  </span>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <FileText className="h-4 w-4" />
                  </span>
                </div>
                <div className="mt-2 text-2xl font-bold tabular-nums text-foreground" data-testid="kpi-total-articles">
                  {isSearching ? "..." : formatNumber(kpiSummary.totalCount)}
                </div>
                <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                  المعروض حالياً: {formatNumber(kpiSummary.count)} مقال
                </p>
              </CardContent>
            </Card>

            <Card className="rounded-xl border-border/60 bg-card shadow-none">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs sm:text-sm font-medium text-muted-foreground">
                    مشاهدات الصفحة الحالية
                  </span>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                    <Eye className="h-4 w-4" />
                  </span>
                </div>
                <div className="mt-2 text-2xl font-bold tabular-nums text-foreground" data-testid="kpi-total-views">
                  {isSearching ? "..." : formatNumber(kpiSummary.totalViews)}
                </div>
                <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                  المتوسط: {formatNumber(kpiSummary.avgViews)} مشاهدة / مقال
                </p>
              </CardContent>
            </Card>

            <Card className="rounded-xl border-border/60 bg-card shadow-none">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs sm:text-sm font-medium text-muted-foreground">
                    إجمالي التفاعلات
                  </span>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <Heart className="h-4 w-4" />
                  </span>
                </div>
                <div className="mt-2 text-2xl font-bold tabular-nums text-foreground" data-testid="kpi-total-engagement">
                  {isSearching ? "..." : formatNumber(kpiSummary.totalEngagement)}
                </div>
                <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                  {formatNumber(kpiSummary.totalLikes)} إعجاب · {formatNumber(kpiSummary.totalShares)} مشاركة
                </p>
              </CardContent>
            </Card>

            <Card className="rounded-xl border-border/60 bg-card shadow-none">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs sm:text-sm font-medium text-muted-foreground">
                    التعليقات ومتوسط القراءة
                  </span>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                    <MessageSquare className="h-4 w-4" />
                  </span>
                </div>
                <div className="mt-2 text-2xl font-bold tabular-nums text-foreground" data-testid="kpi-total-comments">
                  {isSearching ? "..." : formatNumber(kpiSummary.totalComments)}
                </div>
                <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                  متوسط القراءة: {kpiSummary.avgReadingTime > 0 ? `${kpiSummary.avgReadingTime.toFixed(1)} دقيقة` : "—"}
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              {/* Search & Quick Filter Toolbar */}
              <Card className="rounded-xl border-border/60 bg-card shadow-none">
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-base font-bold flex items-center gap-2">
                      <Filter className="h-4 w-4 text-primary" />
                      البحث والتصفية السريعة
                    </CardTitle>
                    {articles.length > 0 && (
                      <Badge variant="outline" className="rounded-lg text-xs tabular-nums">
                        {searchQuery ? `${articles.length} نتيجة` : `آخر ${articles.length}`}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <div className="relative flex-1">
                      <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="ابحث بالعنوان العربي أو الإنجليزي أو الرابط..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                        className="pr-10 rounded-xl border-border/60 bg-background"
                        data-testid="input-search"
                      />
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => setSearchQuery("")}
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          aria-label="مسح البحث"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <Button onClick={handleSearch} className="rounded-xl" data-testid="button-search">
                      <Search className="h-4 w-4 ml-1.5" />
                      بحث
                    </Button>
                  </div>

                  {/* Quick Status Filter Pills */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-muted-foreground ml-1">الحالة:</span>
                    {statusOptions.map((opt) => {
                      const active = selectedStatus === opt.value;
                      return (
                        <Button
                          key={opt.value}
                          type="button"
                          size="sm"
                          variant={active ? "default" : "outline"}
                          onClick={() => setSelectedStatus(opt.value)}
                          className={cn(
                            "h-7 rounded-xl px-2.5 text-xs font-medium",
                            !active && "border-border/60 bg-card text-muted-foreground hover:text-foreground",
                          )}
                          data-testid={`pill-status-${opt.value}`}
                        >
                          {opt.label}
                        </Button>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                      <SelectTrigger className="rounded-xl border-border/60 bg-card" data-testid="select-category">
                        <SelectValue placeholder="التصنيف" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">جميع التصنيفات</SelectItem>
                        {categories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.nameAr || cat.slug}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                      <SelectTrigger className="rounded-xl border-border/60 bg-card" data-testid="select-status">
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
                      <SelectTrigger className="rounded-xl border-border/60 bg-card" data-testid="select-date-range">
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
                      <SelectTrigger className="rounded-xl border-border/60 bg-card" data-testid="select-sort">
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

                  {hasActiveFilters && (
                    <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/40">
                      <span className="text-xs text-muted-foreground">الفلاتر النشطة:</span>
                      {searchQuery && (
                        <Badge variant="secondary" className="gap-1 rounded-lg">
                          {searchQuery}
                          <X
                            className="h-3 w-3 cursor-pointer"
                            onClick={() => setSearchQuery("")}
                          />
                        </Badge>
                      )}
                      {selectedCategory !== "all" && (
                        <Badge variant="secondary" className="gap-1 rounded-lg">
                          {categories.find((c) => c.id === selectedCategory)?.nameAr || selectedCategory}
                          <X
                            className="h-3 w-3 cursor-pointer"
                            onClick={() => setSelectedCategory("all")}
                          />
                        </Badge>
                      )}
                      {dateRange !== "all" && (
                        <Badge variant="secondary" className="gap-1 rounded-lg">
                          {dateRangeOptions.find((d) => d.value === dateRange)?.label}
                          <X
                            className="h-3 w-3 cursor-pointer"
                            onClick={() => setDateRange("all")}
                          />
                        </Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearFilters}
                        className="h-7 rounded-lg text-xs"
                        data-testid="button-clear-filters"
                      >
                        مسح الكل
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Results Card (Desktop Table + Mobile Stacked Cards) */}
              <Card className="rounded-xl border-border/60 bg-card shadow-none overflow-hidden">
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <span>النتائج</span>
                      {articles.length > 0 && (
                        <Badge variant="outline" className="rounded-lg tabular-nums">
                          {searchQuery ? `${articles.length} نتيجة` : `آخر ${articles.length}`}
                        </Badge>
                      )}
                    </CardTitle>
                  </div>
                  <CardDescription>
                    يُعرض أحدث 20 خبراً منشوراً. اضغط على أي مقال لعرض الإحصائيات التفصيلية وتصدير التقارير.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {isSearching ? (
                    <div className="space-y-3">
                      {[...Array(5)].map((_, i) => (
                        <Skeleton key={i} className="h-24 rounded-xl" />
                      ))}
                    </div>
                  ) : articles.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>لا توجد نتائج مطابقة للبحث</p>
                      <p className="text-sm">
                        {debouncedSearchQuery.length > 0 && debouncedSearchQuery.length < 3
                          ? "اكتب 3 أحرف على الأقل للبحث في العناوين"
                          : "جرب تغيير معايير البحث"}
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Desktop Table View */}
                      <div className="hidden md:block rounded-xl border border-border/60 overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/40 border-b border-border/60 text-xs text-muted-foreground">
                            <tr>
                              <th className="py-3 px-4 text-right font-semibold">المقال</th>
                              <th className="py-3 px-3 text-center font-semibold">المشاهدات</th>
                              <th className="py-3 px-3 text-center font-semibold">الإعجابات</th>
                              <th className="py-3 px-3 text-center font-semibold">الحفظ</th>
                              <th className="py-3 px-3 text-center font-semibold">المشاركات</th>
                              <th className="py-3 px-3 text-center font-semibold">التعليقات</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/50">
                            {articles.map((article) => {
                              const isSelected = selectedArticleId === article.id;
                              return (
                                <tr
                                  key={article.id}
                                  onClick={() => setSelectedArticleId(article.id)}
                                  className={cn(
                                    "cursor-pointer transition-colors hover:bg-muted/40",
                                    isSelected && "bg-primary/5 ring-1 ring-inset ring-primary/40",
                                  )}
                                  data-testid={`article-card-${article.id}`}
                                >
                                  <td className="py-3 px-4">
                                    <div className="flex items-center gap-3 min-w-0">
                                      {(article.imageUrl || article.thumbnailUrl) && (
                                        <div className="flex-shrink-0 w-16 h-12 rounded-lg overflow-hidden bg-muted">
                                          <img
                                            src={article.imageUrl || article.thumbnailUrl || ""}
                                            alt={article.title}
                                            className="w-full h-full object-cover"
                                            loading="lazy"
                                          />
                                        </div>
                                      )}
                                      <div className="min-w-0 flex-1 space-y-1">
                                        <div className="flex items-start justify-between gap-2">
                                          <h3 className="font-semibold text-sm line-clamp-1 text-foreground" data-testid="article-title">
                                            {article.title}
                                          </h3>
                                          <div className="flex shrink-0 items-center gap-1">
                                            {article.locale === "en" && (
                                              <Badge variant="outline" className="text-[11px] px-1.5 py-0">
                                                EN
                                              </Badge>
                                            )}
                                            <Badge
                                              variant={article.status === "published" ? "default" : "secondary"}
                                              className="text-[11px] px-1.5 py-0"
                                            >
                                              {article.status === "published"
                                                ? "منشور"
                                                : article.status === "draft"
                                                  ? "مسودة"
                                                  : "مؤرشف"}
                                            </Badge>
                                          </div>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                          {article.category && (
                                            <Badge variant="outline" className="text-[11px] px-1.5 py-0">
                                              {article.category.nameAr}
                                            </Badge>
                                          )}
                                          <span className="flex items-center gap-1 tabular-nums">
                                            <FileText className="h-3 w-3" />
                                            {formatNumber(article.wordCount)} كلمة
                                          </span>
                                          <span className="flex items-center gap-1 tabular-nums">
                                            <Clock className="h-3 w-3" />
                                            {article.avgReadingTime > 0
                                              ? `${article.avgReadingTime.toFixed(1)} دقيقة`
                                              : "لا توجد بيانات"}
                                          </span>
                                          {article.publishedAt && (
                                            <span className="flex items-center gap-1 tabular-nums">
                                              <Calendar className="h-3 w-3" />
                                              {format(new Date(article.publishedAt), "dd MMM yyyy", { locale: arSA })}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="py-3 px-3 text-center">
                                    <span className="inline-flex items-center gap-1 text-xs font-semibold tabular-nums" data-testid="article-views">
                                      <Eye className="h-3.5 w-3.5 text-blue-500" />
                                      {formatNumber(article.views)}
                                    </span>
                                  </td>
                                  <td className="py-3 px-3 text-center">
                                    <span className="inline-flex items-center gap-1 text-xs font-semibold tabular-nums" data-testid="article-likes">
                                      <Heart className="h-3.5 w-3.5 text-pink-500" />
                                      {formatNumber(article.likesCount)}
                                    </span>
                                  </td>
                                  <td className="py-3 px-3 text-center">
                                    <span className="inline-flex items-center gap-1 text-xs font-semibold tabular-nums" data-testid="article-saves">
                                      <Bookmark className="h-3.5 w-3.5 text-purple-500" />
                                      {formatNumber(article.savesCount)}
                                    </span>
                                  </td>
                                  <td className="py-3 px-3 text-center">
                                    <span className="inline-flex items-center gap-1 text-xs font-semibold tabular-nums" data-testid="article-shares">
                                      <Share2 className="h-3.5 w-3.5 text-emerald-500" />
                                      {formatNumber(article.sharesCount)}
                                    </span>
                                  </td>
                                  <td className="py-3 px-3 text-center">
                                    <span className="inline-flex items-center gap-1 text-xs font-semibold tabular-nums" data-testid="article-comments">
                                      <MessageSquare className="h-3.5 w-3.5 text-orange-500" />
                                      {formatNumber(article.commentsCount)}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Mobile Stacked Cards View */}
                      <div className="space-y-3 md:hidden">
                        {articles.map((article) => (
                          <ArticleMobileCard
                            key={article.id}
                            article={article}
                            onSelect={setSelectedArticleId}
                            isSelected={selectedArticleId === article.id}
                          />
                        ))}
                      </div>

                      {(offset > 0 || showNext) && (
                        <div className="flex items-center justify-between pt-4">
                          <p className="text-sm text-muted-foreground tabular-nums">
                            صفحة {currentPage}
                          </p>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={offset === 0}
                              onClick={() => setOffset(Math.max(0, offset - limit))}
                              className="rounded-xl"
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
                              className="rounded-xl"
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
              <Card className="lg:sticky lg:top-4 rounded-xl border-border/60 bg-card shadow-none">
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-primary" />
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
            <div className="bg-card p-6 rounded-xl border border-border/60 shadow-lg text-center space-y-4">
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
                  <SelectTrigger id="pr-client-lang" className="rounded-xl" data-testid="select-pr-client-lang">
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
                  className="rounded-xl"
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
                className="rounded-xl"
                data-testid="button-pr-client-cancel"
              >
                إلغاء
              </Button>
              <Button
                onClick={() => void confirmExportPrClientReport()}
                className="rounded-xl"
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
