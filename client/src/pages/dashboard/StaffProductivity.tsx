import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useQuery } from "@tanstack/react-query";
import { FileText, Eye, Heart, MessageSquare, TrendingUp, Users, Award, Star, Crown, Medal, Flame } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

type TimeRange = 'day' | 'week' | 'month' | 'all';

interface StaffMember {
  userId: string;
  name: string;
  email: string;
  role: string;
  articlesCount: number;
  totalViews: number;
  reactionsCount: number;
  commentsCount: number;
  productivityScore: number;
}

interface ProductivityData {
  staff: StaffMember[];
  totals: {
    totalArticles: number;
    totalViews: number;
    totalReactions: number;
    totalComments: number;
  };
  range: TimeRange;
}

const roleLabels: Record<string, string> = {
  reporter: "مراسل",
  content_manager: "مدير محتوى",
  editor: "محرر",
  senior_editor: "محرر أول",
  editor_in_chief: "رئيس التحرير",
  moderator: "مشرف",
  opinion_author: "كاتب رأي",
  admin: "مسؤول",
  system_admin: "مسؤول النظام",
};

const rangeLabels: Record<TimeRange, string> = {
  day: "اليوم",
  week: "الأسبوع",
  month: "الشهر",
  all: "الكل",
};

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'م';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'ك';
  }
  return num.toString();
}

const SectionHeader = ({ title, color }: { title: string; color: string }) => (
  <div className="flex items-center gap-3 px-1">
    <div className={`h-8 w-1 ${color} rounded-full`}></div>
    <h3 className="text-lg font-bold text-foreground">{title}</h3>
  </div>
);

function StaffTableSkeleton() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="text-right">الاسم</TableHead>
          <TableHead className="text-right">الدور</TableHead>
          <TableHead className="text-right">المقالات</TableHead>
          <TableHead className="text-right">المشاهدات</TableHead>
          <TableHead className="text-right">التفاعلات</TableHead>
          <TableHead className="text-right">التعليقات</TableHead>
          <TableHead className="text-right">النقاط</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: 5 }).map((_, i) => (
          <TableRow key={i}>
            {Array.from({ length: 7 }).map((_, j) => (
              <TableCell key={j}>
                <Skeleton className="h-4 w-16" data-testid={`skeleton-cell-${i}-${j}`} />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function StaffProductivity() {
  const [timeRange, setTimeRange] = useState<TimeRange>('week');

  const { data, isLoading, error } = useQuery<ProductivityData>({
    queryKey: ['/api/staff/productivity', timeRange],
    queryFn: async () => {
      const response = await fetch(`/api/staff/productivity?range=${timeRange}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to fetch productivity data');
      }
      return response.json();
    },
  });

  return (
    <DashboardLayout>
      <div className="space-y-6" dir="rtl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-accent-purple/30">
              <TrendingUp className="h-6 w-6 text-accent-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">لوحة إنتاجية الموظفين</h1>
              <p className="text-sm text-muted-foreground">متابعة الأداء لاتخاذ قرارات الرواتب</p>
            </div>
          </div>
          
          <div className="flex gap-2 flex-wrap" data-testid="time-range-filter">
            {(Object.keys(rangeLabels) as TimeRange[]).map((range) => (
              <Button
                key={range}
                variant={timeRange === range ? "default" : "outline"}
                size="sm"
                onClick={() => setTimeRange(range)}
                data-testid={`btn-range-${range}`}
              >
                {rangeLabels[range]}
              </Button>
            ))}
          </div>
        </div>

        {/* Section: KPI Stats */}
        <div className="space-y-3">
          <SectionHeader title="إحصائيات الفريق" color="bg-blue-500" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4 md:gap-6">
            {/* Articles Stats */}
            <Card className="hover-elevate active-elevate-2 transition-all bg-blue-50 dark:bg-blue-950/30" data-testid="card-articles-stats">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">إجمالي المقالات</CardTitle>
                <div className="p-2 rounded-md bg-accent-blue/30">
                  <FileText className="h-4 w-4 text-primary" data-testid="icon-articles" />
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-8 w-20" />
                ) : (
                  <>
                    <div className="text-2xl font-bold" data-testid="text-articles-total">
                      {formatNumber(data?.totals.totalArticles || 0)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      مقال منشور
                    </p>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Views Stats */}
            <Card className="hover-elevate active-elevate-2 transition-all bg-amber-50 dark:bg-amber-950/30" data-testid="card-views-stats">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">إجمالي المشاهدات</CardTitle>
                <div className="p-2 rounded-md bg-accent-blue/30">
                  <Eye className="h-4 w-4 text-primary" data-testid="icon-views" />
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-8 w-20" />
                ) : (
                  <>
                    <div className="text-2xl font-bold" data-testid="text-views-total">
                      {formatNumber(data?.totals.totalViews || 0)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      مشاهدة كلية
                    </p>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Reactions Stats */}
            <Card className="hover-elevate active-elevate-2 transition-all bg-green-50 dark:bg-green-950/30" data-testid="card-reactions-stats">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">إجمالي التفاعلات</CardTitle>
                <div className="p-2 rounded-md bg-accent-green/30">
                  <Heart className="h-4 w-4 text-green-600 dark:text-green-400" data-testid="icon-reactions" />
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-8 w-20" />
                ) : (
                  <>
                    <div className="text-2xl font-bold" data-testid="text-reactions-total">
                      {formatNumber(data?.totals.totalReactions || 0)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      تفاعل مع المحتوى
                    </p>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Comments Stats */}
            <Card className="hover-elevate active-elevate-2 transition-all bg-violet-50 dark:bg-violet-950/30" data-testid="card-comments-stats">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">إجمالي التعليقات</CardTitle>
                <div className="p-2 rounded-md bg-accent-purple/30">
                  <MessageSquare className="h-4 w-4 text-accent-foreground" data-testid="icon-comments" />
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-8 w-20" />
                ) : (
                  <>
                    <div className="text-2xl font-bold" data-testid="text-comments-total">
                      {formatNumber(data?.totals.totalComments || 0)}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      تعليق على المقالات
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Section: Recognition Wall - حائط التقدير */}
        <div className="space-y-3">
          <SectionHeader title="حائط التقدير" color="bg-yellow-500" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* الأبرز - Most Prominent */}
            <Card className="hover-elevate active-elevate-2 transition-all bg-gradient-to-br from-yellow-50 to-amber-50 dark:from-yellow-950/30 dark:to-amber-950/30 border-yellow-200 dark:border-yellow-800" data-testid="card-top-performers">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <div className="p-2 rounded-full bg-yellow-500/20">
                    <Crown className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                  </div>
                  الأبرز
                  <Badge variant="secondary" className="mr-auto">أعلى الدرجات</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {data?.staff
                      .sort((a, b) => b.productivityScore - a.productivityScore)
                      .slice(0, 3)
                      .map((member, index) => {
                        const medals = [
                          { icon: Crown, color: "text-yellow-500", bg: "bg-yellow-500/20" },
                          { icon: Medal, color: "text-gray-400", bg: "bg-gray-400/20" },
                          { icon: Medal, color: "text-amber-600", bg: "bg-amber-600/20" },
                        ];
                        const MedalIcon = medals[index]?.icon || Star;
                        return (
                          <div
                            key={member.userId}
                            className="flex items-center gap-3 p-3 rounded-lg bg-white/60 dark:bg-black/20 border border-yellow-200/50 dark:border-yellow-700/30"
                            data-testid={`top-performer-${index}`}
                          >
                            <div className={`p-2 rounded-full ${medals[index]?.bg}`}>
                              <MedalIcon className={`h-5 w-5 ${medals[index]?.color}`} />
                            </div>
                            <Avatar className="h-10 w-10 border-2 border-yellow-300 dark:border-yellow-700">
                              <AvatarFallback className="bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300 font-bold">
                                {(member.name || member.email)?.[0]?.toUpperCase() || "؟"}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-foreground truncate" data-testid={`top-name-${index}`}>
                                {member.name || member.email?.split("@")[0]}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {roleLabels[member.role] || member.role}
                              </p>
                            </div>
                            <div className="text-left">
                              <p className="text-xl font-bold text-yellow-600 dark:text-yellow-400" data-testid={`top-score-${index}`}>
                                {member.productivityScore.toFixed(0)}
                              </p>
                              <p className="text-xs text-muted-foreground">نقطة</p>
                            </div>
                          </div>
                        );
                      })}
                    {(!data?.staff || data.staff.length === 0) && (
                      <p className="text-center text-muted-foreground py-4">لا توجد بيانات</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* الأكثر نشاطاً - Most Active */}
            <Card className="hover-elevate active-elevate-2 transition-all bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-950/30 dark:to-red-950/30 border-orange-200 dark:border-orange-800" data-testid="card-most-active">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <div className="p-2 rounded-full bg-orange-500/20">
                    <Flame className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                  </div>
                  الأكثر نشاطاً
                  <Badge variant="secondary" className="mr-auto">أكثر المقالات</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {data?.staff
                      .sort((a, b) => b.articlesCount - a.articlesCount)
                      .slice(0, 3)
                      .map((member, index) => {
                        const flames = [
                          { intensity: "text-red-500", bg: "bg-red-500/20" },
                          { intensity: "text-orange-500", bg: "bg-orange-500/20" },
                          { intensity: "text-amber-500", bg: "bg-amber-500/20" },
                        ];
                        return (
                          <div
                            key={member.userId}
                            className="flex items-center gap-3 p-3 rounded-lg bg-white/60 dark:bg-black/20 border border-orange-200/50 dark:border-orange-700/30"
                            data-testid={`most-active-${index}`}
                          >
                            <div className={`p-2 rounded-full ${flames[index]?.bg}`}>
                              <Flame className={`h-5 w-5 ${flames[index]?.intensity}`} />
                            </div>
                            <Avatar className="h-10 w-10 border-2 border-orange-300 dark:border-orange-700">
                              <AvatarFallback className="bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300 font-bold">
                                {(member.name || member.email)?.[0]?.toUpperCase() || "؟"}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-foreground truncate" data-testid={`active-name-${index}`}>
                                {member.name || member.email?.split("@")[0]}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {roleLabels[member.role] || member.role}
                              </p>
                            </div>
                            <div className="text-left">
                              <p className="text-xl font-bold text-orange-600 dark:text-orange-400" data-testid={`active-articles-${index}`}>
                                {member.articlesCount}
                              </p>
                              <p className="text-xs text-muted-foreground">مقال</p>
                            </div>
                          </div>
                        );
                      })}
                    {(!data?.staff || data.staff.length === 0) && (
                      <p className="text-center text-muted-foreground py-4">لا توجد بيانات</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Section: Staff Performance Table */}
        <div className="space-y-3">
          <SectionHeader title="ترتيب الموظفين" color="bg-orange-500" />
          <Card className="hover-elevate active-elevate-2 transition-all" data-testid="card-staff-table">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-muted-foreground" />
                أداء الموظفين
              </CardTitle>
              <Badge variant="secondary">
                {data?.staff.length || 0} موظف
              </Badge>
            </CardHeader>
            <CardContent>
              {error ? (
                <div className="text-center text-destructive py-8" data-testid="error-message">
                  حدث خطأ في تحميل البيانات
                </div>
              ) : isLoading ? (
                <StaffTableSkeleton />
              ) : (
                <div className="overflow-x-auto">
                  <Table data-testid="staff-table">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">الاسم</TableHead>
                        <TableHead className="text-right">الدور</TableHead>
                        <TableHead className="text-right">المقالات</TableHead>
                        <TableHead className="text-right">المشاهدات</TableHead>
                        <TableHead className="text-right">التفاعلات</TableHead>
                        <TableHead className="text-right">التعليقات</TableHead>
                        <TableHead className="text-right">النقاط</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data?.staff.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                            لا توجد بيانات للعرض
                          </TableCell>
                        </TableRow>
                      ) : (
                        data?.staff.map((member, index) => (
                          <TableRow key={member.userId} data-testid={`row-staff-${index}`}>
                            <TableCell className="font-medium" data-testid={`text-name-${member.userId}`}>
                              {member.name || member.email?.split('@')[0]}
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary" data-testid={`badge-role-${member.userId}`}>
                                {roleLabels[member.role] || member.role}
                              </Badge>
                            </TableCell>
                            <TableCell data-testid={`text-articles-${member.userId}`}>
                              {member.articlesCount}
                            </TableCell>
                            <TableCell data-testid={`text-views-${member.userId}`}>
                              {formatNumber(member.totalViews)}
                            </TableCell>
                            <TableCell data-testid={`text-reactions-${member.userId}`}>
                              {member.reactionsCount}
                            </TableCell>
                            <TableCell data-testid={`text-comments-${member.userId}`}>
                              {member.commentsCount}
                            </TableCell>
                            <TableCell>
                              <Badge 
                                variant={member.productivityScore > 100 ? "default" : "outline"}
                                data-testid={`badge-score-${member.userId}`}
                              >
                                {member.productivityScore.toFixed(1)}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Score Formula Info */}
        <div className="space-y-3">
          <SectionHeader title="معادلة الحساب" color="bg-slate-500" />
          <Card className="hover-elevate active-elevate-2 transition-all bg-blue-50 dark:bg-blue-950/30">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-md bg-accent-blue/30">
                  <TrendingUp className="h-4 w-4 text-primary" />
                </div>
                <div className="text-sm text-muted-foreground">
                  <p className="font-medium mb-1 text-foreground">معادلة حساب النقاط:</p>
                  <p className="font-mono text-xs bg-muted/50 p-2 rounded">
                    النقاط = (عدد المقالات × 10) + (المشاهدات × 0.01) + (التفاعلات × 2) + (التعليقات × 3)
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
