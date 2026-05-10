import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useRoleProtection } from "@/hooks/useRoleProtection";
import { PublisherLayout } from "@/components/publisher/PublisherLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FileText,
  CheckCircle,
  Clock,
  XCircle,
  Package,
  Calendar,
  CreditCard,
  Building,
  User,
  Mail,
  Phone,
  ArrowRight,
} from "lucide-react";
import { Link } from "wouter";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface PublisherDashboardData {
  publisher: {
    agencyName: string;
    contactPerson: string;
    email: string;
    phone: string;
  };
  credits: {
    packageName: string;
    remainingCredits: number;
    totalCredits: number;
    usedCredits: number;
    expiryDate: string | null;
  } | null;
  stats: {
    totalArticles: number;
    approvedArticles: number;
    pendingArticles: number;
    rejectedArticles: number;
  };
  recentArticles: Array<{
    id: string;
    title: string;
    status: string;
    createdAt: string;
  }>;
  creditUsageChart: Array<{
    date: string;
    used: number;
  }>;
}

export default function PublisherDashboard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  useRoleProtection('publisher');

  const { data, isLoading, error } = useQuery<PublisherDashboardData>({
    queryKey: ["/api/publisher/dashboard"],
  });

  useEffect(() => {
    if (error) {
      toast({
        variant: "destructive",
        title: "خطأ",
        description: "لا يمكن الوصول إلى لوحة تحكم الناشر. يرجى التأكد من صلاحياتك.",
      });
      setLocation("/");
    }
  }, [error, setLocation, toast]);

  if (isLoading) {
    return (
      <PublisherLayout>
        <div className="space-y-6">
          <Skeleton className="h-10 w-64" />
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        </div>
      </PublisherLayout>
    );
  }

  if (!data) {
    return <PublisherLayout><div /></PublisherLayout>;
  }

  const { publisher, credits, stats, recentArticles, creditUsageChart } = data;

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
      draft: { variant: "secondary", label: "مسودة" },
      pending_review: { variant: "outline", label: "قيد المراجعة" },
      published: { variant: "default", label: "منشور" },
      rejected: { variant: "destructive", label: "مرفوض" },
    };
    const config = variants[status] || { variant: "secondary", label: status };
    return <Badge variant={config.variant} data-testid={`badge-status-${status}`}>{config.label}</Badge>;
  };

  return (
    <PublisherLayout>
      <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">لوحة تحكم الناشر</h1>
          <p className="text-muted-foreground mt-1">مرحباً بك في لوحة التحكم الخاصة بك</p>
        </div>
        <Link href="/dashboard/publisher/articles">
          <Button data-testid="button-view-articles">
            <FileText className="ml-2 h-4 w-4" />
            إدارة المقالات
          </Button>
        </Link>
      </div>

      {/* Publisher Info Card */}
      <Card data-testid="card-publisher-info">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building className="h-5 w-5" />
            معلومات الناشر
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="flex items-center gap-3">
              <Building className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">اسم الوكالة</p>
                <p className="font-medium" data-testid="text-agency-name">{publisher.agencyName}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <User className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">شخص الاتصال</p>
                <p className="font-medium" data-testid="text-contact-person">{publisher.contactPerson}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">البريد الإلكتروني</p>
                <p className="font-medium text-sm" data-testid="text-email">{publisher.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">الهاتف</p>
                <p className="font-medium" data-testid="text-phone">{publisher.phone}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Credits Card */}
      {credits && (
        <Card data-testid="card-credits">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              الرصيد الحالي
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-sm text-muted-foreground">اسم الباقة</p>
                <p className="text-lg font-bold" data-testid="text-package-name">{credits.packageName}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">الرصيد المتبقي</p>
                <p className="text-2xl font-bold text-primary" data-testid="text-remaining-credits">
                  {credits.remainingCredits}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">المستخدم / الإجمالي</p>
                <p className="text-lg font-semibold" data-testid="text-used-total">
                  {credits.usedCredits} / {credits.totalCredits}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  تاريخ الانتهاء
                </p>
                <p className="text-lg font-medium" data-testid="text-expiry-date">
                  {credits.expiryDate
                    ? new Date(credits.expiryDate).toLocaleDateString("ar-SA-u-ca-gregory")
                    : "لا يوجد"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card data-testid="card-stat-total">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">إجمالي المقالات</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-articles">{stats.totalArticles}</div>
            <p className="text-xs text-muted-foreground mt-1">جميع المقالات المرسلة</p>
          </CardContent>
        </Card>

        <Card data-testid="card-stat-approved">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">المقالات المنشورة</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600" data-testid="text-approved-articles">
              {stats.approvedArticles}
            </div>
            <p className="text-xs text-muted-foreground mt-1">تم الموافقة عليها ونشرها</p>
          </CardContent>
        </Card>

        <Card data-testid="card-stat-pending">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">قيد المراجعة</CardTitle>
            <Clock className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600" data-testid="text-pending-articles">
              {stats.pendingArticles}
            </div>
            <p className="text-xs text-muted-foreground mt-1">بانتظار موافقة الإدارة</p>
          </CardContent>
        </Card>

        <Card data-testid="card-stat-rejected">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">المرفوضة</CardTitle>
            <XCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600" data-testid="text-rejected-articles">
              {stats.rejectedArticles}
            </div>
            <p className="text-xs text-muted-foreground mt-1">تم رفضها من الإدارة</p>
          </CardContent>
        </Card>
      </div>

      {/* Credit Usage Chart */}
      {creditUsageChart.length > 0 && (
        <Card data-testid="card-usage-chart">
          <CardHeader>
            <CardTitle>استخدام الرصيد</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={creditUsageChart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="used" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Recent Activity */}
      <Card data-testid="card-recent-activity">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>النشاط الأخير</CardTitle>
          <Link href="/dashboard/publisher/articles">
            <Button variant="ghost" size="sm" data-testid="button-view-all">
              عرض الكل
              <ArrowRight className="mr-2 h-4 w-4" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {recentArticles.length === 0 ? (
            <p className="text-muted-foreground text-center py-8" data-testid="text-no-recent">
              لا توجد مقالات حديثة
            </p>
          ) : (
            <div className="space-y-4">
              {recentArticles.map((article) => (
                <div
                  key={article.id}
                  className="flex items-center justify-between p-3 rounded-lg border"
                  data-testid={`recent-article-${article.id}`}
                >
                  <div className="flex-1">
                    <p className="font-medium">{article.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(article.createdAt).toLocaleDateString("ar-SA-u-ca-gregory")}
                    </p>
                  </div>
                  {getStatusBadge(article.status)}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      </div>
    </PublisherLayout>
  );
}
