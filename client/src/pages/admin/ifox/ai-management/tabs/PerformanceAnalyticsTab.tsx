import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { StatsCard } from "@/components/en/dashboard/StatsCard";
import { TrendingUp, FileText, Target, CheckCircle2, Bookmark } from "lucide-react";

type TimeRange = 'today' | 'week' | 'month' | 'all';

interface PerformanceMetrics {
  articlesGenerated: number;
  avgQualityScore: number;
  successRate: number;
  totalSaves: number;
  metrics: Array<{
    name: string;
    value: number | string;
    trend: number;
  }>;
}

export default function PerformanceAnalyticsTab() {
  const [timeRange, setTimeRange] = useState<TimeRange>('all');

  const { data: metrics = {
    articlesGenerated: 0,
    avgQualityScore: 0,
    successRate: 0,
    totalSaves: 0,
    metrics: []
  }, isLoading } = useQuery<PerformanceMetrics>({
    queryKey: ['/api/ifox/ai-management/metrics', { timeRange }],
  });

  const timeRangeButtons: Array<{ value: TimeRange; label: string }> = [
    { value: 'today', label: 'اليوم' },
    { value: 'week', label: 'هذا الأسبوع' },
    { value: 'month', label: 'هذا الشهر' },
    { value: 'all', label: 'الكل' },
  ];

  return (
    <div className="space-y-6" data-testid="performance-analytics-tab">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            <CardTitle>تحليلات الأداء</CardTitle>
          </div>
          <CardDescription>
            مقارنة أداء المحتوى AI vs البشري
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-6 flex-wrap" data-testid="time-filters">
            {timeRangeButtons.map((btn) => (
              <Button
                key={btn.value}
                variant={timeRange === btn.value ? "default" : "outline"}
                size="sm"
                onClick={() => setTimeRange(btn.value)}
                data-testid={`filter-${btn.value}`}
              >
                {btn.label}
              </Button>
            ))}
          </div>

          {isLoading ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <Card key={i}>
                    <CardContent className="p-6">
                      <Skeleton className="h-20 w-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
              <Skeleton className="h-64 w-full" />
            </div>
          ) : metrics ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6" data-testid="kpi-cards">
                <StatsCard
                  title="المقالات المُولّدة"
                  value={metrics.articlesGenerated.toLocaleString('ar-SA')}
                  icon={FileText}
                  iconColor="text-blue-600 dark:text-blue-400"
                  iconBgColor="bg-blue-500/10"
                  testId="kpi-articles-generated"
                />
                
                <StatsCard
                  title="متوسط جودة المحتوى"
                  value={`${metrics.avgQualityScore}%`}
                  icon={Target}
                  iconColor="text-green-600 dark:text-green-400"
                  iconBgColor="bg-green-500/10"
                  testId="kpi-avg-quality-score"
                />
                
                <StatsCard
                  title="معدل النجاح"
                  value={`${metrics.successRate}%`}
                  icon={CheckCircle2}
                  iconColor="text-purple-600 dark:text-purple-400"
                  iconBgColor="bg-purple-500/10"
                  testId="kpi-success-rate"
                />
                
                <StatsCard
                  title="إجمالي الحفظ"
                  value={metrics.totalSaves.toLocaleString('ar-SA')}
                  icon={Bookmark}
                  iconColor="text-orange-600 dark:text-orange-400"
                  iconBgColor="bg-orange-500/10"
                  testId="kpi-total-saves"
                />
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">مقاييس الأداء التفصيلية</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table data-testid="metrics-table">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">المقياس</TableHead>
                        <TableHead className="text-right">القيمة</TableHead>
                        <TableHead className="text-right">الاتجاه</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {metrics.metrics.map((metric, index) => (
                        <TableRow key={index} data-testid={`metric-row-${index}`}>
                          <TableCell className="font-medium" data-testid={`metric-name-${index}`}>
                            {metric.name}
                          </TableCell>
                          <TableCell data-testid={`metric-value-${index}`}>
                            {metric.value}
                          </TableCell>
                          <TableCell data-testid={`metric-trend-${index}`}>
                            <span className={metric.trend > 0 ? 'text-green-600 dark:text-green-400' : metric.trend < 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}>
                              {metric.trend > 0 && '+'}
                              {metric.trend !== 0 ? `${metric.trend}%` : '—'}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              لا توجد بيانات متاحة
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
