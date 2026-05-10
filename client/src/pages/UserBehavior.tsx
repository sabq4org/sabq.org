import { useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Users, 
  Clock, 
  Heart, 
  MessageSquare, 
  Bookmark,
  TrendingUp,
  Smartphone,
  Monitor,
  Tablet,
  RefreshCw,
  Sun,
  CloudSun,
  Moon,
  Sunrise,
  BarChart3
} from "lucide-react";
import { BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, XAxis, YAxis } from "recharts";
import { useState } from "react";

interface UserBehaviorData {
  totalUsers: number;
  readingTimeAvg: number;
  totalReads: number;
  topCategories: Array<{ name: string; count: number }>;
  interactionCounts: {
    likes: number;
    comments: number;
    bookmarks: number;
  };
  activeHours: {
    morning: number;
    noon: number;
    evening: number;
    night: number;
  };
  deviceDistribution: {
    mobile: number;
    desktop: number;
    tablet: number;
  };
  returnRate: number;
  returningUsersCount: number;
}

const COLORS = {
  primary: "#8b5cf6",
  blue: "#3b82f6",
  green: "#10b981",
  pink: "#ec4899",
  orange: "#f97316",
  yellow: "#eab308",
};

export default function UserBehavior() {
  const [range, setRange] = useState("7d");

  const { data, isLoading, refetch } = useQuery<UserBehaviorData>({
    queryKey: [`/api/analytics/user-behavior?range=${range}`],
  });

  const handleRangeChange = (newRange: string) => {
    setRange(newRange);
  };

  const deviceData = data ? [
    { name: "هاتف محمول", value: data.deviceDistribution.mobile, icon: Smartphone },
    { name: "حاسوب", value: data.deviceDistribution.desktop, icon: Monitor },
    { name: "تابلت", value: data.deviceDistribution.tablet, icon: Tablet },
  ] : [];

  const timeData = data ? [
    { name: "صباحاً (6-12)", value: data.activeHours.morning, icon: Sunrise },
    { name: "ظهراً (12-5)", value: data.activeHours.noon, icon: Sun },
    { name: "مساءً (5-10)", value: data.activeHours.evening, icon: CloudSun },
    { name: "ليلاً (10-6)", value: data.activeHours.night, icon: Moon },
  ] : [];

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="container mx-auto p-6 space-y-6">
          <div className="flex items-center justify-between mb-6">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-10 w-32" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6" dir="rtl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold" data-testid="heading-user-behavior">
              سلوك المستخدمين الذكي
            </h1>
            <p className="text-muted-foreground mt-1">
              تحليلات تفاعلية لحركة المستخدمين داخل المنصة، مدعومة بالذكاء الاصطناعي
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={range === "7d" ? "default" : "outline"}
              size="sm"
              onClick={() => handleRangeChange("7d")}
              data-testid="button-range-7d"
            >
              7 أيام
            </Button>
            <Button
              variant={range === "30d" ? "default" : "outline"}
              size="sm"
              onClick={() => handleRangeChange("30d")}
              data-testid="button-range-30d"
            >
              30 يوم
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="gap-2"
              data-testid="button-refresh"
            >
              <RefreshCw className="h-4 w-4" />
              تحديث
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">إجمالي المستخدمين</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-total-users">
                {data?.totalUsers}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                مسجلين في المنصة
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">متوسط وقت القراءة</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-reading-time">
                {data?.readingTimeAvg} دقيقة
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                لكل مقال
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">إجمالي القراءات</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-total-reads">
                {data?.totalReads}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                خلال الفترة المحددة
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">معدل العودة</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-return-rate">
                {data?.returnRate}%
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                من المستخدمين يعودون
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Interactions Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Heart className="h-5 w-5" />
                التفاعلات
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-pink-50 dark:bg-pink-950/20 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Heart className="h-5 w-5 text-pink-500" />
                    <span className="font-medium">الإعجابات</span>
                  </div>
                  <span className="text-lg font-bold" data-testid="stat-likes">
                    {data?.interactionCounts.likes}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-5 w-5 text-blue-500" />
                    <span className="font-medium">التعليقات</span>
                  </div>
                  <span className="text-lg font-bold" data-testid="stat-comments">
                    {data?.interactionCounts.comments}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-950/20 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Bookmark className="h-5 w-5 text-green-500" />
                    <span className="font-medium">الحفظ</span>
                  </div>
                  <span className="text-lg font-bold" data-testid="stat-bookmarks">
                    {data?.interactionCounts.bookmarks}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Top Categories */}
          <Card>
            <CardHeader>
              <CardTitle>الاهتمامات الذكية</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={data?.topCategories || []}>
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill={COLORS.primary} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Device & Time Analysis */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Device Distribution */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="h-5 w-5" />
                الأجهزة والمتصفحات
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={deviceData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={(entry) => `${entry.name}: ${entry.value}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {deviceData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={Object.values(COLORS)[index]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Active Hours */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                النشاط الزمني
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {timeData.map((period, index) => {
                  const Icon = period.icon;
                  const maxValue = Math.max(...timeData.map(t => t.value));
                  const percentage = maxValue > 0 ? (period.value / maxValue) * 100 : 0;
                  
                  return (
                    <div key={index} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                          <span>{period.name}</span>
                        </div>
                        <span className="font-medium">{period.value}</span>
                      </div>
                      <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-primary transition-all"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
