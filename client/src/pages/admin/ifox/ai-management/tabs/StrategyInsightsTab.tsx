import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Lightbulb,
  TrendingUp,
  CheckCircle2,
  Clock,
  Loader2,
  Eye,
  X,
  Target,
  Calendar,
  BarChart3,
  AlertCircle,
  Zap,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { IfoxStrategyInsight } from "@shared/schema";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

type StatusFilter = "all" | "active" | "implemented" | "dismissed" | "expired";
type CategoryFilter = "all" | "trending_topic" | "content_gap" | "timing_optimization" | "audience_preference";

export default function StrategyInsightsTab() {
  const [selectedInsight, setSelectedInsight] = useState<IfoxStrategyInsight | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const { toast } = useToast();

  // Fetch insights
  const { data: insightsRaw, isLoading } = useQuery<IfoxStrategyInsight[]>({
    queryKey: ["/api/ifox/ai-management/strategy"],
  });
  const insights = Array.isArray(insightsRaw) ? insightsRaw : [];

  // Update status mutation
  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest(`/api/ifox/ai-management/strategy/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ifox/ai-management/strategy"] });
      setSelectedInsight(null);
      toast({
        title: "تم التحديث",
        description: "تم تحديث حالة التوصية بنجاح",
      });
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "فشل تحديث حالة التوصية",
        variant: "destructive",
      });
    },
  });

  // Filter insights
  const filteredInsights = insights.filter((insight) => {
    if (statusFilter !== "all" && insight.status !== statusFilter) return false;
    if (categoryFilter !== "all" && insight.insightType !== categoryFilter) return false;
    return true;
  });

  // Calculate stats
  const totalInsights = insights.length;
  const implementedInsights = insights.filter((i) => i.status === "implemented").length;
  const pendingInsights = insights.filter((i) => i.status === "active").length;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">إجمالي التوصيات</CardTitle>
            <Lightbulb className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-insights">
              {totalInsights}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">التوصيات المنفذة</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600" data-testid="text-implemented-insights">
              {implementedInsights}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">التوصيات المعلقة</CardTitle>
            <Clock className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600" data-testid="text-pending-insights">
              {pendingInsights}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Lightbulb className="w-5 h-5" />
                التوصيات الاستراتيجية
              </CardTitle>
              <CardDescription>
                توصيات ذكية مدعومة بالبيانات لتحسين المحتوى
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2 w-full md:w-auto">
              <Select value={categoryFilter} onValueChange={(v: CategoryFilter) => setCategoryFilter(v)}>
                <SelectTrigger className="w-full md:w-48" data-testid="select-category-filter">
                  <SelectValue placeholder="نوع التوصية" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الأنواع</SelectItem>
                  <SelectItem value="trending_topic">مواضيع رائجة</SelectItem>
                  <SelectItem value="content_gap">فجوات محتوى</SelectItem>
                  <SelectItem value="timing_optimization">تحسين التوقيت</SelectItem>
                  <SelectItem value="audience_preference">تفضيلات الجمهور</SelectItem>
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={(v: StatusFilter) => setStatusFilter(v)}>
                <SelectTrigger className="w-full md:w-48" data-testid="select-status-filter">
                  <SelectValue placeholder="الحالة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الحالات</SelectItem>
                  <SelectItem value="active">نشط</SelectItem>
                  <SelectItem value="implemented">منفذ</SelectItem>
                  <SelectItem value="dismissed">مرفوض</SelectItem>
                  <SelectItem value="expired">منتهي الصلاحية</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin" data-testid="loader-insights" />
            </div>
          ) : filteredInsights.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground" data-testid="text-no-insights">
              {statusFilter === "all" && categoryFilter === "all"
                ? "لا توجد توصيات استراتيجية بعد"
                : "لا توجد توصيات تطابق الفلاتر المحددة"}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" data-testid="insights-grid">
              {filteredInsights.map((insight) => (
                <InsightCard
                  key={insight.id}
                  insight={insight}
                  onView={() => setSelectedInsight(insight)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Details Dialog */}
      <Dialog open={selectedInsight !== null} onOpenChange={() => setSelectedInsight(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lightbulb className="w-5 h-5" />
              تفاصيل التوصية الاستراتيجية
            </DialogTitle>
            <DialogDescription>
              عرض التفاصيل الكاملة والإجراءات الموصى بها
            </DialogDescription>
          </DialogHeader>

          {selectedInsight && (
            <div className="space-y-6">
              {/* Header Section */}
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <h2 className="text-2xl font-bold mb-2" data-testid="dialog-insight-title">
                      {selectedInsight.title}
                    </h2>
                    <p className="text-muted-foreground" data-testid="dialog-insight-description">
                      {selectedInsight.description}
                    </p>
                  </div>
                  <Badge variant={getStatusVariant(selectedInsight.status || "active")} data-testid="dialog-insight-status">
                    {getStatusLabel(selectedInsight.status || "active")}
                  </Badge>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" data-testid="dialog-insight-type">
                    {getCategoryLabel(selectedInsight.insightType)}
                  </Badge>
                  <Badge variant="outline" data-testid="dialog-insight-priority">
                    أولوية: {getPriorityLabel(selectedInsight.priority || "medium")}
                  </Badge>
                  {selectedInsight.expectedImpact && (
                    <Badge variant="outline" data-testid="dialog-insight-impact">
                      {getImpactLabel(selectedInsight.expectedImpact)}
                    </Badge>
                  )}
                  {selectedInsight.confidenceScore !== null && selectedInsight.confidenceScore !== undefined && (
                    <Badge variant="outline" data-testid="dialog-insight-confidence">
                      ثقة: {selectedInsight.confidenceScore}%
                    </Badge>
                  )}
                </div>
              </div>

              {/* Recommendation Section */}
              <div className="p-4 bg-primary/5 border-r-4 border-primary rounded-lg">
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <Target className="w-4 h-4" />
                  التوصية
                </h3>
                <p className="text-sm" data-testid="dialog-insight-recommendation">
                  {selectedInsight.recommendation}
                </p>
              </div>

              {/* Content Gap */}
              {selectedInsight.contentGap && (
                <div className="p-4 bg-yellow-50 dark:bg-yellow-950/20 border-r-4 border-yellow-500 rounded-lg">
                  <h3 className="font-semibold mb-2 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    فجوة المحتوى
                  </h3>
                  <p className="text-sm" data-testid="dialog-insight-gap">
                    {selectedInsight.contentGap}
                  </p>
                </div>
              )}

              {/* Differentiation Strategy */}
              {selectedInsight.differentiationStrategy && (
                <div className="p-4 bg-blue-50 dark:bg-blue-950/20 border-r-4 border-blue-500 rounded-lg">
                  <h3 className="font-semibold mb-2 flex items-center gap-2">
                    <Zap className="w-4 h-4" />
                    استراتيجية التميز
                  </h3>
                  <p className="text-sm" data-testid="dialog-insight-strategy">
                    {selectedInsight.differentiationStrategy}
                  </p>
                </div>
              )}

              {/* Timing & Frequency */}
              {(selectedInsight.bestPublishTime || selectedInsight.optimalFrequency) && (
                <div className="grid gap-4 md:grid-cols-2">
                  {selectedInsight.bestPublishTime && (
                    <div className="p-4 border rounded-lg">
                      <h3 className="font-semibold mb-2 flex items-center gap-2 text-sm">
                        <Calendar className="w-4 h-4" />
                        أفضل وقت للنشر
                      </h3>
                      <p className="text-sm text-muted-foreground" data-testid="dialog-insight-publish-time">
                        {format(new Date(selectedInsight.bestPublishTime), "PPp", { locale: ar })}
                      </p>
                    </div>
                  )}
                  {selectedInsight.optimalFrequency && (
                    <div className="p-4 border rounded-lg">
                      <h3 className="font-semibold mb-2 flex items-center gap-2 text-sm">
                        <BarChart3 className="w-4 h-4" />
                        التكرار الأمثل
                      </h3>
                      <p className="text-sm text-muted-foreground" data-testid="dialog-insight-frequency">
                        {getFrequencyLabel(selectedInsight.optimalFrequency)}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Related Topics */}
              {selectedInsight.relatedTopics && Array.isArray(selectedInsight.relatedTopics) && selectedInsight.relatedTopics.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-semibold text-sm">مواضيع ذات صلة</h3>
                  <div className="flex flex-wrap gap-2" data-testid="dialog-insight-topics">
                    {selectedInsight.relatedTopics.map((topic: any, index: number) => (
                      <Badge key={index} variant="secondary">
                        {typeof topic === 'string' ? topic : topic.name || topic.title}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Metadata */}
              <div className="pt-4 border-t space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">النموذج المستخدم:</span>
                  <span className="font-medium">{selectedInsight.analysisModel || "gpt-4"}</span>
                </div>
                {selectedInsight.estimatedLifespan && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">عمر الموضوع المقدر:</span>
                    <span className="font-medium">{selectedInsight.estimatedLifespan} يوم</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">تاريخ الإنشاء:</span>
                  <span className="font-medium">
                    {format(new Date(selectedInsight.createdAt), "PPp", { locale: ar })}
                  </span>
                </div>
                {selectedInsight.expiresAt && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">تنتهي في:</span>
                    <span className="font-medium">
                      {format(new Date(selectedInsight.expiresAt), "PPp", { locale: ar })}
                    </span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              {selectedInsight.status === "active" && (
                <div className="flex gap-2 pt-4 border-t">
                  <Button
                    onClick={() =>
                      updateStatusMutation.mutate({
                        id: selectedInsight.id,
                        status: "implemented",
                      })
                    }
                    disabled={updateStatusMutation.isPending}
                    data-testid="button-mark-implemented"
                  >
                    {updateStatusMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin ml-2" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 ml-2" />
                    )}
                    تعليم كمُنفذ
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() =>
                      updateStatusMutation.mutate({
                        id: selectedInsight.id,
                        status: "dismissed",
                      })
                    }
                    disabled={updateStatusMutation.isPending}
                    data-testid="button-dismiss"
                  >
                    <X className="w-4 h-4 ml-2" />
                    رفض
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Insight Card Component
interface InsightCardProps {
  insight: IfoxStrategyInsight;
  onView: () => void;
}

function InsightCard({ insight, onView }: InsightCardProps) {
  return (
    <Card
      className="hover-elevate cursor-pointer transition-all"
      onClick={onView}
      data-testid={`card-insight-${insight.id}`}
    >
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <Badge variant="outline" data-testid={`badge-type-${insight.id}`}>
            {getCategoryLabel(insight.insightType)}
          </Badge>
          <Badge variant={getStatusVariant(insight.status || "active")} data-testid={`badge-status-${insight.id}`}>
            {getStatusLabel(insight.status || "active")}
          </Badge>
        </div>
        <CardTitle className="text-lg leading-tight" data-testid={`text-title-${insight.id}`}>
          {insight.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground line-clamp-3" data-testid={`text-description-${insight.id}`}>
          {insight.description}
        </p>

        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="text-xs" data-testid={`badge-priority-${insight.id}`}>
            {getPriorityLabel(insight.priority || "medium")}
          </Badge>
          {insight.expectedImpact && (
            <Badge variant="secondary" className="text-xs" data-testid={`badge-impact-${insight.id}`}>
              {getImpactLabel(insight.expectedImpact)}
            </Badge>
          )}
          {insight.confidenceScore !== null && insight.confidenceScore !== undefined && (
            <Badge variant="secondary" className="text-xs" data-testid={`badge-confidence-${insight.id}`}>
              {insight.confidenceScore}% ثقة
            </Badge>
          )}
        </div>

        <div className="flex items-center justify-between pt-2 border-t">
          <span className="text-xs text-muted-foreground">
            {format(new Date(insight.createdAt), "PPp", { locale: ar })}
          </span>
          <Button variant="ghost" size="sm" data-testid={`button-view-${insight.id}`}>
            <Eye className="w-4 h-4 ml-1" />
            عرض
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Helper Functions
function getCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    trending_topic: "موضوع رائج",
    content_gap: "فجوة محتوى",
    timing_optimization: "تحسين التوقيت",
    audience_preference: "تفضيلات الجمهور",
  };
  return labels[category] || category;
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    active: "نشط",
    implemented: "منفذ",
    dismissed: "مرفوض",
    expired: "منتهي الصلاحية",
  };
  return labels[status] || status;
}

function getStatusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    active: "default",
    implemented: "secondary",
    dismissed: "destructive",
    expired: "outline",
  };
  return variants[status] || "default";
}

function getPriorityLabel(priority: string): string {
  const labels: Record<string, string> = {
    low: "أولوية منخفضة",
    medium: "أولوية متوسطة",
    high: "أولوية عالية",
    critical: "أولوية حرجة",
  };
  return labels[priority] || priority;
}

function getImpactLabel(impact: string): string {
  const labels: Record<string, string> = {
    high_traffic: "زيارات عالية",
    high_engagement: "تفاعل عالي",
    viral_potential: "إمكانية انتشار",
    seo_boost: "تحسين SEO",
  };
  return labels[impact] || impact;
}

function getFrequencyLabel(frequency: string): string {
  const labels: Record<string, string> = {
    daily: "يومي",
    twice_weekly: "مرتين أسبوعياً",
    weekly: "أسبوعي",
    monthly: "شهري",
  };
  return labels[frequency] || frequency;
}
