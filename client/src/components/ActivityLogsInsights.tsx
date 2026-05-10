import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, PieChart, Pie, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from "recharts";
import { Users, Activity, Clock, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { motion } from "framer-motion";

interface ActivityLogsInsightsProps {
  analytics?: {
    topUsers: Array<{
      userId: string;
      userName: string;
      email: string;
      activityCount: number;
      profileImageUrl: string | null;
    }>;
    topActions: Array<{
      action: string;
      count: number;
    }>;
    peakHours: Array<{
      hour: number;
      count: number;
    }>;
    successFailureRate: {
      successCount: number;
      failureCount: number;
      warningCount: number;
      totalCount: number;
    };
    recentActivity: Array<{
      date: string;
      count: number;
    }>;
  };
  isLoading?: boolean;
}

const COLORS = {
  success: "#10B981",
  failure: "#EF4444",
  warning: "#F59E0B",
  primary: "#3B82F6",
  secondary: "#8B5CF6",
};

const PIE_COLORS = ["#3B82F6", "#8B5CF6", "#10B981", "#F59E0B", "#EF4444", "#EC4899", "#14B8A6", "#F97316"];

export default function ActivityLogsInsights({ analytics, isLoading }: ActivityLogsInsightsProps) {
  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4" data-testid="insights-loading">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-32 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!analytics) {
    return null;
  }

  const successRate = analytics.successFailureRate.totalCount > 0
    ? ((analytics.successFailureRate.successCount / analytics.successFailureRate.totalCount) * 100).toFixed(1)
    : "0";

  const failureRate = analytics.successFailureRate.totalCount > 0
    ? ((analytics.successFailureRate.failureCount / analytics.successFailureRate.totalCount) * 100).toFixed(1)
    : "0";

  const warningRate = analytics.successFailureRate.totalCount > 0
    ? ((analytics.successFailureRate.warningCount / analytics.successFailureRate.totalCount) * 100).toFixed(1)
    : "0";

  const statusData = [
    { name: "نجاح", value: analytics.successFailureRate.successCount, color: COLORS.success },
    { name: "فشل", value: analytics.successFailureRate.failureCount, color: COLORS.failure },
    { name: "تحذير", value: analytics.successFailureRate.warningCount, color: COLORS.warning },
  ].filter(item => item.value > 0);

  return (
    <div className="space-y-6" data-testid="activity-insights">
      {/* Stats Overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Card data-testid="stat-total">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">إجمالي العمليات</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analytics.successFailureRate.totalCount.toLocaleString('en-US')}</div>
              <p className="text-xs text-muted-foreground mt-1">جميع النشاطات المسجلة</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <Card data-testid="stat-success">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">معدل النجاح</CardTitle>
              <CheckCircle2 className="h-4 w-4" style={{ color: COLORS.success }} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" style={{ color: COLORS.success }}>{successRate}%</div>
              <p className="text-xs text-muted-foreground mt-1">{analytics.successFailureRate.successCount.toLocaleString('en-US')} عملية</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <Card data-testid="stat-failure">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">معدل الفشل</CardTitle>
              <XCircle className="h-4 w-4" style={{ color: COLORS.failure }} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" style={{ color: COLORS.failure }}>{failureRate}%</div>
              <p className="text-xs text-muted-foreground mt-1">{analytics.successFailureRate.failureCount.toLocaleString('en-US')} عملية</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.3 }}
        >
          <Card data-testid="stat-warning">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">تحذيرات</CardTitle>
              <AlertTriangle className="h-4 w-4" style={{ color: COLORS.warning }} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" style={{ color: COLORS.warning }}>{warningRate}%</div>
              <p className="text-xs text-muted-foreground mt-1">{analytics.successFailureRate.warningCount.toLocaleString('en-US')} عملية</p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Charts Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Top Active Users */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.4 }}
        >
          <Card data-testid="chart-top-users">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                أكثر المستخدمين نشاطاً
              </CardTitle>
              <CardDescription>أعلى 5 مستخدمين من حيث عدد العمليات</CardDescription>
            </CardHeader>
            <CardContent>
              {(analytics?.topUsers?.length ?? 0) > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={analytics.topUsers} layout="horizontal">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" />
                    <YAxis dataKey="userName" type="category" width={100} />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))' }}
                      labelStyle={{ color: 'hsl(var(--popover-foreground))' }}
                    />
                    <Bar dataKey="activityCount" fill={COLORS.primary} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  لا توجد بيانات
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Top Actions */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.5 }}
        >
          <Card data-testid="chart-top-actions">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                أكثر العمليات تكراراً
              </CardTitle>
              <CardDescription>توزيع أنواع العمليات</CardDescription>
            </CardHeader>
            <CardContent>
              {(analytics?.topActions?.length ?? 0) > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={analytics.topActions}
                      dataKey="count"
                      nameKey="action"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={(entry) => entry.action}
                    >
                      {analytics?.topActions?.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  لا توجد بيانات
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Peak Hours */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.6 }}
        >
          <Card data-testid="chart-peak-hours">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                أوقات الذروة
              </CardTitle>
              <CardDescription>النشاط حسب ساعات اليوم</CardDescription>
            </CardHeader>
            <CardContent>
              {(analytics?.peakHours?.length ?? 0) > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={analytics.peakHours}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="hour" label={{ value: 'الساعة', position: 'insideBottom', offset: -5 }} />
                    <YAxis label={{ value: 'عدد العمليات', angle: -90, position: 'insideLeft' }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))' }}
                      labelFormatter={(value) => `الساعة ${value}:00`}
                    />
                    <Line type="monotone" dataKey="count" stroke={COLORS.secondary} strokeWidth={2} dot={{ fill: COLORS.secondary }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  لا توجد بيانات
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Status Distribution */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.7 }}
        >
          <Card data-testid="chart-status-distribution">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5" />
                توزيع حالات العمليات
              </CardTitle>
              <CardDescription>نسبة النجاح والفشل والتحذيرات</CardDescription>
            </CardHeader>
            <CardContent>
              {statusData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={statusData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={(entry) => `${entry.name}: ${entry.value}`}
                    >
                      {statusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  لا توجد بيانات
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
