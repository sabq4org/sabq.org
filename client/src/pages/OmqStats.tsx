import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardLayout } from "@/components/DashboardLayout";
import { FileText, Eye, Share2, Download, Brain, TrendingUp, Calendar, ArrowRight } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface DeepAnalysis {
  id: string;
  title: string;
  topic: string;
  status: string;
  createdAt: string;
  viewsCount?: number;
  sharesCount?: number;
  downloadsCount?: number;
}

interface StatsResponse {
  totalAnalyses: number;
  totalViews: number;
  totalShares: number;
  totalDownloads: number;
  recentAnalyses?: DeepAnalysis[];
  topPerforming?: Array<{
    id: string;
    title: string;
    viewsCount: number;
  }>;
}

export default function OmqStats() {
  const [, navigate] = useLocation();

  // Fetch summary stats
  const { data: stats, isLoading } = useQuery<StatsResponse>({
    queryKey: ['/api/omq/stats/summary'],
  });

  // Helper functions
  const formatNumber = (num: number | undefined): string => {
    if (num === undefined || num === null) return '0';
    return num.toLocaleString('en-US');
  };

  const formatDate = (date: string): string => {
    return new Date(date).toLocaleDateString('ar-SA-u-ca-gregory', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getStatusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case 'completed':
      case 'published':
        return 'default';
      case 'draft':
        return 'secondary';
      case 'archived':
        return 'outline';
      default:
        return 'secondary';
    }
  };

  const getStatusLabel = (status: string): string => {
    switch (status) {
      case 'completed':
        return 'مكتمل';
      case 'published':
        return 'منشور';
      case 'draft':
        return 'مسودة';
      case 'archived':
        return 'مؤرشف';
      default:
        return status;
    }
  };

  // Prepare chart data for top performing analyses
  const chartData = stats?.topPerforming?.slice(0, 10).map(item => ({
    name: item.title.length > 30 ? item.title.substring(0, 30) + '...' : item.title,
    views: item.viewsCount
  })) || [];

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-background" dir="rtl">
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          {/* Header Section */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <Brain className="w-10 h-10 text-primary" data-testid="icon-brain-header" />
                  <h1 className="text-3xl font-bold" data-testid="text-page-title">
                    إحصائيات قسم العُمق
                  </h1>
                </div>
                <p className="text-muted-foreground text-lg" data-testid="text-page-description">
                  تحليل شامل لأداء التحليلات العميقة المدعومة بالذكاء الاصطناعي
                </p>
              </div>
              <Button
                onClick={() => navigate('/omq')}
                variant="outline"
                data-testid="button-view-all"
              >
                <ArrowRight className="w-4 h-4 ml-2" />
                عرض جميع التحليلات
              </Button>
            </div>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {isLoading ? (
              <>
                {[1, 2, 3, 4].map(i => (
                  <Card key={i} data-testid={`skeleton-kpi-${i}`}>
                    <CardHeader className="pb-2">
                      <Skeleton className="h-4 w-24" />
                    </CardHeader>
                    <CardContent>
                      <Skeleton className="h-8 w-16 mb-2" />
                      <Skeleton className="h-8 w-8" />
                    </CardContent>
                  </Card>
                ))}
              </>
            ) : (
              <>
                <Card data-testid="card-kpi-analyses">
                  <CardHeader className="pb-2">
                    <CardDescription>إجمالي التحليلات</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div className="text-3xl font-bold" data-testid="text-total-analyses">
                        {formatNumber(stats?.totalAnalyses || 0)}
                      </div>
                      <FileText className="w-8 h-8 text-primary" />
                    </div>
                  </CardContent>
                </Card>

                <Card data-testid="card-kpi-views">
                  <CardHeader className="pb-2">
                    <CardDescription>إجمالي المشاهدات</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div className="text-3xl font-bold" data-testid="text-total-views">
                        {formatNumber(stats?.totalViews || 0)}
                      </div>
                      <Eye className="w-8 h-8 text-primary" />
                    </div>
                  </CardContent>
                </Card>

                <Card data-testid="card-kpi-shares">
                  <CardHeader className="pb-2">
                    <CardDescription>إجمالي المشاركات</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div className="text-3xl font-bold" data-testid="text-total-shares">
                        {formatNumber(stats?.totalShares || 0)}
                      </div>
                      <Share2 className="w-8 h-8 text-primary" />
                    </div>
                  </CardContent>
                </Card>

                <Card data-testid="card-kpi-downloads">
                  <CardHeader className="pb-2">
                    <CardDescription>إجمالي التنزيلات</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div className="text-3xl font-bold" data-testid="text-total-downloads">
                        {formatNumber(stats?.totalDownloads || 0)}
                      </div>
                      <Download className="w-8 h-8 text-primary" />
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>

          {/* Top Performing Chart */}
          {chartData.length > 0 && (
            <Card className="mb-6" data-testid="card-top-performing">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-primary" />
                  <CardTitle>أفضل 10 تحليلات من حيث المشاهدات</CardTitle>
                </div>
                <CardDescription>
                  أكثر التحليلات مشاهدة في قسم العُمق
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="w-full h-80" data-testid="chart-top-performing">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 100, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis dataKey="name" type="category" width={100} />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))', 
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '6px'
                        }}
                      />
                      <Bar dataKey="views" fill="hsl(var(--primary))" name="المشاهدات" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recent Analyses Table */}
          <Card className="mb-6" data-testid="card-recent-analyses">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-primary" />
                <CardTitle>التحليلات الأخيرة</CardTitle>
              </div>
              <CardDescription>
                آخر التحليلات التي تم إنشاؤها في قسم العُمق
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="flex items-center justify-between">
                      <Skeleton className="h-4 w-64" />
                      <Skeleton className="h-6 w-16" />
                    </div>
                  ))}
                </div>
              ) : stats?.recentAnalyses && stats.recentAnalyses.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">العنوان</TableHead>
                        <TableHead className="text-right">الحالة</TableHead>
                        <TableHead className="text-right">المشاهدات</TableHead>
                        <TableHead className="text-right">المشاركات</TableHead>
                        <TableHead className="text-right">التنزيلات</TableHead>
                        <TableHead className="text-right">التاريخ</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stats.recentAnalyses.map(analysis => (
                        <TableRow key={analysis.id} data-testid={`row-analysis-${analysis.id}`}>
                          <TableCell className="max-w-md">
                            <Button
                              variant="link"
                              onClick={() => navigate(`/omq/${analysis.id}`)}
                              className="p-0 h-auto text-right justify-start font-medium"
                              data-testid={`link-analysis-${analysis.id}`}
                            >
                              {analysis.title}
                            </Button>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={getStatusVariant(analysis.status)}
                              data-testid={`badge-status-${analysis.id}`}
                            >
                              {getStatusLabel(analysis.status)}
                            </Badge>
                          </TableCell>
                          <TableCell data-testid={`text-views-${analysis.id}`}>
                            <div className="flex items-center gap-1">
                              <Eye className="w-4 h-4 text-muted-foreground" />
                              {formatNumber(analysis.viewsCount || 0)}
                            </div>
                          </TableCell>
                          <TableCell data-testid={`text-shares-${analysis.id}`}>
                            <div className="flex items-center gap-1">
                              <Share2 className="w-4 h-4 text-muted-foreground" />
                              {formatNumber(analysis.sharesCount || 0)}
                            </div>
                          </TableCell>
                          <TableCell data-testid={`text-downloads-${analysis.id}`}>
                            <div className="flex items-center gap-1">
                              <Download className="w-4 h-4 text-muted-foreground" />
                              {formatNumber(analysis.downloadsCount || 0)}
                            </div>
                          </TableCell>
                          <TableCell data-testid={`text-date-${analysis.id}`}>
                            {formatDate(analysis.createdAt)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-12" data-testid="empty-state">
                  <Brain className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">لا توجد تحليلات حتى الآن</p>
                  <Button
                    onClick={() => navigate('/dashboard/ai/deep')}
                    variant="outline"
                    className="mt-4"
                    data-testid="button-create-analysis"
                  >
                    إنشاء تحليل جديد
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
