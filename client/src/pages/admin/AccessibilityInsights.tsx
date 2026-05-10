import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { MobileOptimizedKpiCard } from "@/components/MobileOptimizedKpiCard";
import { useAuth } from "@/hooks/useAuth";
import { Activity, TrendingUp, Users, UserCheck } from "lucide-react";

// TypeScript Types
interface AccessibilityStats {
  totalEvents: number;
  eventsByType: { eventType: string; count: number }[];
  eventsByLanguage: { language: string; count: number }[];
  topFeatures: { feature: string; count: number }[];
  uniqueSessions: number;
  uniqueUsers: number | null;
  timeRange: string;
}

interface AccessibilityEvent {
  id: string;
  eventType: string;
  eventAction: string;
  eventValue: string | null;
  language: string;
  pageUrl: string;
  createdAt: string;
}

// Helper function to translate event types to Arabic
function translateEventType(type: string): string {
  const translations: Record<string, string> = {
    'fontSize': 'حجم الخط',
    'highContrast': 'التباين العالي',
    'reduceMotion': 'تقليل الحركة',
    'readingMode': 'وضع القراءة',
    'voiceCommand': 'الأوامر الصوتية',
    'skipLink': 'روابط التخطي',
    'liveRegion': 'الإعلانات الحية',
  };
  return translations[type] || type;
}

// Chart colors
const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

// TanStack Query Hooks
function useAccessibilityStats(timeRange: '24h' | '7d' | '30d' = '7d') {
  const { user } = useAuth();
  
  return useQuery<AccessibilityStats>({
    queryKey: ['/api/accessibility/stats', { timeRange }],
    enabled: !!user,
    refetchInterval: 60000, // 60s polling
    queryFn: async () => {
      const params = new URLSearchParams({ timeRange });
      const res = await fetch(`/api/accessibility/stats?${params}`, {
        credentials: 'include',
      });
      if (!res.ok) {
        const error = await res.text();
        throw new Error(error || 'فشل في تحميل الإحصائيات');
      }
      return await res.json();
    },
  });
}

function useAccessibilityRecent(limit: number = 50) {
  const { user } = useAuth();
  
  return useQuery<AccessibilityEvent[]>({
    queryKey: ['/api/accessibility/recent', { limit }],
    enabled: !!user,
    refetchInterval: 60000,
    queryFn: async () => {
      const params = new URLSearchParams({ limit: String(limit) });
      const res = await fetch(`/api/accessibility/recent?${params}`, {
        credentials: 'include',
      });
      if (!res.ok) {
        const error = await res.text();
        throw new Error(error || 'فشل في تحميل الأحداث الأخيرة');
      }
      return await res.json();
    },
  });
}

export default function AccessibilityInsights() {
  const { user, isLoading: authLoading } = useAuth();
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d'>('7d');
  const statsQuery = useAccessibilityStats(timeRange);
  const recentQuery = useAccessibilityRecent(50);
  
  // استخرج topFeature من stats
  const topFeature = statsQuery.data?.topFeatures?.[0]?.feature || '-';

  // Prepare chart data
  const eventTypeData = statsQuery.data?.eventsByType.map(item => ({
    name: translateEventType(item.eventType),
    value: item.count
  })) || [];

  const languageData = statsQuery.data?.eventsByLanguage.map(item => ({
    language: item.language === 'ar' ? 'العربية' : 
              item.language === 'en' ? 'English' : 
              item.language === 'ur' ? 'اردو' :
              item.language, // fallback to original language code for unknown locales
    count: item.count
  })) || [];

  // Check authorization - admins and editorial team only
  if (authLoading) {
    return (
      <div className="container mx-auto p-4 md:p-6 space-y-6" dir="rtl">
        <div className="space-y-2">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-6 w-96" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  if (!user || !['admin', 'super_admin', 'editor'].includes(user.role || '')) {
    return (
      <div className="container mx-auto p-4 md:p-6" dir="rtl">
        <Card>
          <CardContent className="p-6">
            <p className="text-center text-muted-foreground">
              عذراً، ليس لديك صلاحية للوصول إلى هذه الصفحة.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">لوحة إمكانية الوصول</h1>
          <p className="text-muted-foreground">تحليلات شاملة لاستخدام ميزات إمكانية الوصول</p>
        </div>
        
        {/* Time Range Filter */}
        <Tabs value={timeRange} onValueChange={(v) => setTimeRange(v as '24h' | '7d' | '30d')}>
          <TabsList dir="rtl">
            <TabsTrigger value="24h" data-testid="filter-24h">24 ساعة</TabsTrigger>
            <TabsTrigger value="7d" data-testid="filter-7d">7 أيام</TabsTrigger>
            <TabsTrigger value="30d" data-testid="filter-30d">30 يوم</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      
      {/* KPI Cards */}
      {statsQuery.isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : statsQuery.error ? (
        <Card>
          <CardContent className="p-6">
            <p className="text-center text-destructive">
              حدث خطأ في تحميل البيانات. يرجى المحاولة مرة أخرى.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MobileOptimizedKpiCard
            label="إجمالي الأحداث"
            value={statsQuery.data?.totalEvents?.toLocaleString('ar-SA-u-ca-gregory') || '0'}
            icon={Activity}
            iconColor="text-primary"
            iconBgColor="bg-primary/10"
            testId="kpi-total-events"
          />
          
          <MobileOptimizedKpiCard
            label="أكثر ميزة استخداماً"
            value={topFeature}
            icon={TrendingUp}
            iconColor="text-green-600"
            iconBgColor="bg-green-600/10"
            testId="kpi-top-feature"
          />
          
          <MobileOptimizedKpiCard
            label="الجلسات النشطة"
            value={statsQuery.data?.uniqueSessions?.toLocaleString('ar-SA-u-ca-gregory') || '0'}
            icon={Users}
            iconColor="text-blue-600"
            iconBgColor="bg-blue-600/10"
            testId="kpi-active-sessions"
          />
          
          <MobileOptimizedKpiCard
            label="مستخدمون فريدون"
            value={statsQuery.data?.uniqueUsers?.toLocaleString('ar-SA-u-ca-gregory') || '-'}
            icon={UserCheck}
            iconColor="text-purple-600"
            iconBgColor="bg-purple-600/10"
            testId="kpi-unique-users"
          />
        </div>
      )}
      
      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Event Type Distribution - Pie Chart */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">توزيع الأحداث حسب النوع</h3>
          {statsQuery.isLoading ? (
            <div className="flex justify-center items-center h-[300px]">
              <p className="text-muted-foreground">جاري التحميل...</p>
            </div>
          ) : eventTypeData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={eventTypeData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => `${entry.name}: ${entry.value}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {eventTypeData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex justify-center items-center h-[300px]">
              <p className="text-muted-foreground">لا توجد بيانات متاحة</p>
            </div>
          )}
        </Card>

        {/* Language Distribution - Bar Chart */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">الاستخدام حسب اللغة</h3>
          {statsQuery.isLoading ? (
            <div className="flex justify-center items-center h-[300px]">
              <p className="text-muted-foreground">جاري التحميل...</p>
            </div>
          ) : languageData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={languageData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="language" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex justify-center items-center h-[300px]">
              <p className="text-muted-foreground">لا توجد بيانات متاحة</p>
            </div>
          )}
        </Card>
      </div>

      {/* Recent Events Table */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">آخر الأحداث</h3>
        
        {recentQuery.isLoading ? (
          <div className="flex justify-center p-8">
            <p className="text-muted-foreground">جاري التحميل...</p>
          </div>
        ) : recentQuery.data && recentQuery.data.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">الوقت</TableHead>
                  <TableHead className="text-right">النوع</TableHead>
                  <TableHead className="text-right">الإجراء</TableHead>
                  <TableHead className="text-right">القيمة</TableHead>
                  <TableHead className="text-right">اللغة</TableHead>
                  <TableHead className="text-right">الصفحة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentQuery?.data?.slice(0, 20).map((event) => (
                  <TableRow key={event.id} data-testid={`event-row-${event.id}`}>
                    <TableCell className="text-right">
                      {new Date(event.createdAt).toLocaleString('ar-SA-u-ca-gregory', { 
                        dateStyle: 'short', 
                        timeStyle: 'short' 
                      })}
                    </TableCell>
                    <TableCell className="text-right">{translateEventType(event.eventType)}</TableCell>
                    <TableCell className="text-right">{event.eventAction}</TableCell>
                    <TableCell className="text-right">{event.eventValue || '-'}</TableCell>
                    <TableCell className="text-right">{event.language}</TableCell>
                    <TableCell className="text-right">{event.pageUrl}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-center text-muted-foreground p-8">لا توجد أحداث حتى الآن</p>
        )}
      </Card>
    </div>
  );
}
