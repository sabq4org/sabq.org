import { useLocation, Link } from "wouter";
import { useEffect, lazy, Suspense } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import AnalyticsMetrics from "@/components/dashboard/AnalyticsMetrics";
const AnalyticsChart = lazy(() => import("@/components/dashboard/AnalyticsChart"));
import TopContentTable from "@/components/dashboard/TopContentTable";
import RecentActivityFeed from "@/components/dashboard/RecentActivityFeed";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { Button } from "@/components/ui/button";
import { useAuth, hasRole, hasAnyPermission } from "@/hooks/useAuth";
import { BarChart3, MousePointerClick, FileBarChart, RefreshCw } from "lucide-react";

export default function AnalyticsDashboard() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { user, isLoading } = useAuth();

  const isAuthorized =
    hasRole(
      user,
      "admin",
      "super_admin",
      "superadmin",
      "system_admin",
      "chief_editor",
      "editor",
      "analyst"
    ) || hasAnyPermission(user, "analytics.view", "articles.view");

  useEffect(() => {
    if (!isLoading && (!user || !isAuthorized)) {
      setLocation("/");
    }
  }, [user, isLoading, isAuthorized, setLocation]);

  useEffect(() => {
    document.title = "لوحة التحليلات - سبق الذكية";
  }, []);

  const handleRefreshAll = () => {
    void queryClient.invalidateQueries({ queryKey: ["/api/analytics/overview"] });
    void queryClient.invalidateQueries({ queryKey: ["/api/analytics/chart"] });
    void queryClient.invalidateQueries({ queryKey: ["/api/analytics/top-content"] });
    void queryClient.invalidateQueries({ queryKey: ["/api/analytics/recent-activity"] });
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="space-y-4 text-center">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">جاري تحميل لوحة التحليلات...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!user || !isAuthorized) {
    return null;
  }

  return (
    <DashboardLayout>
      <div
        className="mx-auto w-full max-w-[1600px] space-y-6 px-4 pb-12 sm:px-6"
        dir="rtl"
        data-testid="analytics-dashboard"
      >
        <DashboardPageHeader
          icon={BarChart3}
          title="لوحات التحليلات الشاملة"
          description="نظرة تنفيذية موحّدة على مؤشرات أداء المنصة، نمو القراءات، المحتوى الأعلى تفاعلاً، وسجل النشاط الفوري"
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/dashboard/analytics/behavior">
                <Button variant="outline" size="sm" className="gap-1.5 rounded-xl">
                  <MousePointerClick className="h-4 w-4 text-primary" />
                  سلوك المستخدمين
                </Button>
              </Link>
              <Link href="/dashboard/article-analytics">
                <Button variant="outline" size="sm" className="gap-1.5 rounded-xl">
                  <FileBarChart className="h-4 w-4 text-primary" />
                  تحليلات المقالات
                </Button>
              </Link>
              <Button
                variant="default"
                size="sm"
                onClick={handleRefreshAll}
                className="gap-1.5 rounded-xl"
                data-testid="button-refresh-analytics-dashboard"
              >
                <RefreshCw className="h-4 w-4" />
                تحديث المؤشرات
              </Button>
            </div>
          }
        />

        {/* Metrics Cards Row */}
        <AnalyticsMetrics />

        {/* Main Chart */}
        <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-muted/30" />}>
          <AnalyticsChart />
        </Suspense>

        {/* Two Column Layout for Tables */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <TopContentTable />
          </div>
          <div className="lg:col-span-5">
            <RecentActivityFeed />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
