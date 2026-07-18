import { useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { usePublisherAccess } from "@/hooks/usePublisherAccess";
import { PublisherLayout } from "@/components/publisher/PublisherLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  FileText,
  CheckCircle,
  Clock,
  Eye,
  Package,
  Calendar,
  Building,
  AlertTriangle,
  Zap,
  Plus,
  ArrowLeft,
  TrendingUp,
  Loader2,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface PortalOverview {
  publisher: {
    id: string;
    agencyName: string;
    agencyNameEn: string | null;
    contactPerson: string;
    email: string;
    phoneNumber: string;
    logoUrl: string | null;
    isActive: boolean;
    publishingEndsAt: string | null;
    autoPublish: boolean;
  };
  stats: {
    totalArticles: number;
    publishedArticles: number;
    draftArticles: number;
    publishedThisMonth: number;
    totalViews: number;
  };
  activeCredit: {
    packageName: string;
    totalCredits: number;
    usedCredits: number;
    remainingCredits: number;
    isUnlimited: boolean;
    expiryDate: string | null;
  } | null;
  recentArticles: Array<{
    id: string;
    title: string;
    status: string;
    englishSlug: string | null;
    views: number | null;
    createdAt: string;
    publishedAt: string | null;
  }>;
  topArticles: Array<{
    id: string;
    title: string;
    englishSlug: string | null;
    views: number | null;
    publishedAt: string | null;
  }>;
  monthlyPublishing: Array<{ month: string; published: number; views: number }>;
  attention: Array<{ type: string; severity: "warning" | "critical"; message: string }>;
}

const formatDate = (value: string | null) =>
  value ? new Date(value).toLocaleDateString("ar-SA-u-ca-gregory") : "—";

const formatViews = (views: number | null | undefined) => {
  const n = Number(views) || 0;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
};

const statusBadge = (status: string) => {
  const map: Record<string, { label: string; className: string }> = {
    draft: { label: "مسودة", className: "bg-muted text-muted-foreground" },
    pending_review: { label: "قيد المراجعة", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200" },
    published: { label: "منشور", className: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200" },
    archived: { label: "مؤرشف", className: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200" },
  };
  const config = map[status] || { label: status, className: "bg-muted text-muted-foreground" };
  return <Badge variant="outline" className={config.className}>{config.label}</Badge>;
};

export default function PublisherDashboard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = usePublisherAccess();

  // هوية المستخدم المسجل دخولاً (موظفاً كان أو مالكاً) — لا مسؤول الوكالة
  const memberName = user
    ? [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email
    : "";

  const { data, isLoading, error } = useQuery<PortalOverview>({
    queryKey: ["/api/publisher/portal/overview"],
  });

  // «طلب تجديد الباقة»: يفتح طلباً للإدارة تلقائياً (بلا تكرار للطلب المفتوح)
  const renewalMutation = useMutation({
    mutationFn: async () =>
      apiRequest<{ message: string }>("/api/publisher/portal/requests", {
        method: "POST",
        body: JSON.stringify({ type: "renewal" }),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: (result) => {
      toast({ title: "أُرسل الطلب ✅", description: result.message });
    },
    onError: (err: any) => {
      toast({
        variant: "destructive",
        title: "تعذر الإرسال",
        description: err.message || "حاول مرة أخرى لاحقاً",
      });
    },
  });

  useEffect(() => {
    if (error) {
      toast({
        variant: "destructive",
        title: "تعذر الدخول",
        // عند تعليق الوكالة يعيد الخادم رسالة واضحة — نعرضها كما هي
        description: (error as Error)?.message || "لا يمكن الوصول إلى لوحة الناشر. يرجى التأكد من صلاحياتك.",
      });
      setLocation("/");
    }
  }, [error, setLocation, toast]);

  if (isLoading || !data) {
    return (
      <PublisherLayout>
        <div className="space-y-6" dir="rtl">
          <Skeleton className="h-28 w-full rounded-xl" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
          <Skeleton className="h-72 w-full" />
        </div>
      </PublisherLayout>
    );
  }

  const { publisher, stats, activeCredit, attention } = data;
  const recentArticles = Array.isArray(data.recentArticles) ? data.recentArticles : [];
  const topArticles = Array.isArray(data.topArticles) ? data.topArticles : [];
  const monthlyPublishing = Array.isArray(data.monthlyPublishing) ? data.monthlyPublishing : [];

  const windowDaysLeft = publisher.publishingEndsAt
    ? Math.ceil((new Date(publisher.publishingEndsAt).getTime() - Date.now()) / 86_400_000)
    : null;

  const creditPercent = activeCredit && activeCredit.totalCredits > 0
    ? Math.round((activeCredit.remainingCredits / activeCredit.totalCredits) * 100)
    : 0;

  return (
    <PublisherLayout>
      <div className="space-y-6" dir="rtl">
        {/* رأس هوية الوكالة */}
        <Card data-testid="card-agency-header" className="overflow-hidden">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row md:items-center gap-4">
              {publisher.logoUrl ? (
                <img
                  src={publisher.logoUrl}
                  alt={publisher.agencyName}
                  className="h-16 w-16 rounded-xl object-contain border bg-white p-1"
                  data-testid="img-agency-logo"
                />
              ) : (
                <div className="h-16 w-16 rounded-xl border flex items-center justify-center bg-muted">
                  <Building className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-bold truncate" data-testid="text-agency-name">
                  {publisher.agencyName}
                </h1>
                <p className="text-muted-foreground text-sm truncate" data-testid="text-member-identity">
                  {memberName}
                  {user?.email && ` · ${user.email}`}
                </p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {publisher.autoPublish && (
                    <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200" data-testid="badge-auto-publish">
                      <Zap className="h-3 w-3 ml-1" />
                      نشر فوري بدون مراجعة
                    </Badge>
                  )}
                  {publisher.publishingEndsAt && windowDaysLeft !== null && (
                    windowDaysLeft >= 0 ? (
                      <Badge variant="outline" data-testid="badge-window">
                        <Calendar className="h-3 w-3 ml-1" />
                        النشر متاح حتى {formatDate(publisher.publishingEndsAt)}
                      </Badge>
                    ) : (
                      <Badge variant="destructive" data-testid="badge-window-closed">
                        انتهت فترة النشر في {formatDate(publisher.publishingEndsAt)}
                      </Badge>
                    )
                  )}
                  {!publisher.isActive && <Badge variant="destructive">الحساب معطل</Badge>}
                </div>
              </div>
              <Link href="/dashboard/publisher/article/new">
                <Button size="lg" data-testid="button-new-article" disabled={windowDaysLeft !== null && windowDaysLeft < 0}>
                  <Plus className="ml-2 h-4 w-4" />
                  خبر جديد
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* يتطلب انتباهك */}
        {attention.length > 0 && (
          <div className="space-y-2" data-testid="attention-rail">
            {attention.map((item) => (
              <div
                key={item.type}
                className={`flex items-center gap-3 rounded-lg border p-3 text-sm ${
                  item.severity === "critical"
                    ? "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
                    : "border-yellow-300 bg-yellow-50 text-yellow-900 dark:border-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-200"
                }`}
                data-testid={`attention-${item.type}`}
              >
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{item.message}</span>
              </div>
            ))}
          </div>
        )}

        {/* مؤشرات الأداء */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card data-testid="card-kpi-credits">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">الرصيد المتبقي</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {activeCredit ? (
                activeCredit.isUnlimited ? (
                  <>
                    <div className="text-2xl font-bold" data-testid="text-remaining-credits">
                      مفتوح <span className="text-lg">∞</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      {activeCredit.packageName} · نشر غير محدود
                      {activeCredit.expiryDate && ` حتى ${formatDate(activeCredit.expiryDate)}`}
                    </p>
                  </>
                ) : (
                  <>
                    <div className="text-2xl font-bold" data-testid="text-remaining-credits">
                      {activeCredit.remainingCredits}
                      <span className="text-sm font-normal text-muted-foreground"> / {activeCredit.totalCredits}</span>
                    </div>
                    <Progress value={creditPercent} className="h-2 mt-2" />
                    <p className="text-xs text-muted-foreground mt-2">
                      {activeCredit.packageName}
                      {activeCredit.expiryDate && ` · تنتهي ${formatDate(activeCredit.expiryDate)}`}
                    </p>
                  </>
                )
              ) : (
                <p className="text-sm text-muted-foreground">لا توجد باقة نشطة</p>
              )}
              <Button
                variant="outline"
                size="sm"
                className="mt-3 w-full"
                onClick={() => renewalMutation.mutate()}
                disabled={renewalMutation.isPending}
                data-testid="button-request-renewal"
              >
                {renewalMutation.isPending
                  ? <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  : <Package className="ml-2 h-4 w-4" />}
                طلب تجديد الباقة
              </Button>
            </CardContent>
          </Card>

          <Card data-testid="card-kpi-month">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">منشور هذا الشهر</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-published-month">{stats.publishedThisMonth}</div>
              <p className="text-xs text-muted-foreground mt-1">من إجمالي {stats.publishedArticles} منشور</p>
            </CardContent>
          </Card>

          <Card data-testid="card-kpi-pending">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">مسودات / قيد المراجعة</CardTitle>
              <Clock className="h-4 w-4 text-yellow-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600" data-testid="text-draft-count">{stats.draftArticles}</div>
              <p className="text-xs text-muted-foreground mt-1">بانتظار الاستكمال أو الموافقة</p>
            </CardContent>
          </Card>

          <Card data-testid="card-kpi-views">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">إجمالي المشاهدات</CardTitle>
              <Eye className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-views">{formatViews(stats.totalViews)}</div>
              <p className="text-xs text-muted-foreground mt-1">على {stats.publishedArticles} مادة منشورة</p>
            </CardContent>
          </Card>
        </div>

        {/* النشر الشهري */}
        {monthlyPublishing.length > 0 && (
          <Card data-testid="card-monthly-chart">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                النشر خلال الأشهر الأخيرة
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={monthlyPublishing}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" reversed />
                  <YAxis orientation="right" allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="published" name="مواد منشورة" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          {/* آخر المواد */}
          <Card data-testid="card-recent-articles">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                آخر المواد
              </CardTitle>
              <Link href="/dashboard/publisher/articles">
                <Button variant="ghost" size="sm" data-testid="button-view-all-articles">
                  عرض الكل
                  <ArrowLeft className="mr-2 h-4 w-4" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {recentArticles.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">لا توجد مواد بعد</p>
              ) : (
                <div className="space-y-3">
                  {recentArticles.map((article) => (
                    <div
                      key={article.id}
                      className="flex items-center justify-between gap-3 p-3 rounded-lg border"
                      data-testid={`recent-article-${article.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{article.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(article.publishedAt || article.createdAt)}
                          {article.status === "published" && ` · ${formatViews(article.views)} مشاهدة`}
                        </p>
                      </div>
                      {statusBadge(article.status)}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* الأعلى مشاهدة */}
          <Card data-testid="card-top-articles">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5" />
                الأعلى مشاهدة
              </CardTitle>
            </CardHeader>
            <CardContent>
              {topArticles.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">لا توجد مواد منشورة بعد</p>
              ) : (
                <div className="space-y-3">
                  {topArticles.map((article, index) => (
                    <div
                      key={article.id}
                      className="flex items-center gap-3 p-3 rounded-lg border"
                      data-testid={`top-article-${article.id}`}
                    >
                      <span className="text-lg font-bold text-muted-foreground w-6 text-center">
                        {index + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{article.title}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(article.publishedAt)}</p>
                      </div>
                      <Badge variant="secondary" className="shrink-0">
                        <Eye className="h-3 w-3 ml-1" />
                        {formatViews(article.views)}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </PublisherLayout>
  );
}
