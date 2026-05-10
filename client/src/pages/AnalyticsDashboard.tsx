import { useLocation } from "wouter";
import { useEffect, lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import AnalyticsMetrics from "@/components/dashboard/AnalyticsMetrics";
const AnalyticsChart = lazy(() => import("@/components/dashboard/AnalyticsChart"));
import TopContentTable from "@/components/dashboard/TopContentTable";
import RecentActivityFeed from "@/components/dashboard/RecentActivityFeed";

interface User {
  id: string;
  name?: string;
  email?: string;
  role?: string;
}

export default function AnalyticsDashboard() {
  const [, setLocation] = useLocation();
  
  const { data: user, isLoading } = useQuery<User>({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  // Check authorization - only admin, super_admin, chief_editor, editor
  const authorizedRoles = ['admin', 'super_admin', 'chief_editor', 'editor'];

  useEffect(() => {
    if (!isLoading && (!user || !authorizedRoles.includes(user.role || ''))) {
      setLocation('/');
    }
  }, [user, isLoading, setLocation]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  if (!user || !authorizedRoles.includes(user.role || '')) {
    return null;
  }

  // Set page title
  useEffect(() => {
    document.title = "لوحة التحليلات - سبق الذكية";
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-4 md:p-6 lg:p-8 space-y-6" data-testid="analytics-dashboard">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">لوحة التحليلات</h1>
            <p className="text-muted-foreground mt-2">
              نظرة شاملة على أداء المنصة والإحصائيات التفصيلية
            </p>
          </div>
        </div>

        {/* Metrics Cards Row */}
        <AnalyticsMetrics />

        {/* Main Chart */}
        <Suspense fallback={<div className="animate-pulse bg-muted/30 rounded-lg h-80" />}>
          <AnalyticsChart />
        </Suspense>

        {/* Two Column Layout for Tables */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Content */}
          <TopContentTable />

          {/* Recent Activity */}
          <RecentActivityFeed />
        </div>
      </div>
    </div>
  );
}
