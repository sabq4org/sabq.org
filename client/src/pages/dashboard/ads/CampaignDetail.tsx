import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useLocation, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  ArrowRight, 
  Eye, 
  MousePointer, 
  TrendingUp, 
  DollarSign, 
  Wallet,
  Plus,
  MoreVertical,
  Calendar,
  Target,
  Image as ImageIcon,
  Video,
  Trash2,
  Code,
  LayoutGrid,
  CheckCircle,
  Clock
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { formatDistanceToNow } from "date-fns";
import { arSA } from "date-fns/locale";
import type { Campaign } from "@shared/schema";

// Types for API responses
interface CampaignStats {
  totalImpressions: number;
  totalClicks: number;
  totalConversions: number;
  ctr: number;
  conversionRate: number;
}

interface CampaignWithStats extends Campaign {
  stats: CampaignStats;
}

interface AdGroupWithStats {
  id: string;
  campaignId: string;
  name: string;
  status: string;
  creativesCount: number;
  stats: {
    impressions: number;
    clicks: number;
    ctr: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

interface DailyStatRecord {
  id: string;
  campaignId: string;
  date: Date;
  impressions: number;
  clicks: number;
  conversions: number;
  spent: string;
  ctr: number;
  cpc: string;
  cpm: string;
}

interface BudgetHistoryRecord {
  id: string;
  campaignId: string;
  previousBudget: string;
  newBudget: string;
  changeType: string;
  reason?: string;
  changedBy: string;
  createdAt: Date;
}

interface Creative {
  id: string;
  adGroupId: string;
  name: string;
  type: string;
  content: string;
  destinationUrl: string;
  size: string;
  description?: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

const statusColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline",
  pending_review: "secondary",
  active: "default",
  paused: "outline",
  completed: "secondary",
  rejected: "destructive"
};

const statusLabels: Record<string, string> = {
  draft: "مسودة",
  pending_review: "قيد المراجعة",
  active: "نشطة",
  paused: "متوقفة",
  completed: "مكتملة",
  rejected: "مرفوضة"
};

const objectiveLabels: Record<string, string> = {
  cpm: "التكلفة لكل ألف ظهور (CPM)",
  cpc: "التكلفة لكل نقرة (CPC)",
  cpa: "التكلفة لكل إجراء (CPA)",
  brand_awareness: "الوعي بالعلامة التجارية",
  engagement: "التفاعل"
};

export default function CampaignDetail() {
  const [, setLocation] = useLocation();
  const params = useParams();
  const campaignId = params.id;
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");
  const [creativeToDelete, setCreativeToDelete] = useState<Creative | null>(null);
  const [showAdGroupDialog, setShowAdGroupDialog] = useState(false);
  const [adGroupName, setAdGroupName] = useState("");
  const [targetDevices, setTargetDevices] = useState<string[]>(["desktop", "mobile", "tablet"]);
  const [adGroupToDelete, setAdGroupToDelete] = useState<AdGroupWithStats | null>(null);

  useEffect(() => {
    document.title = "تفاصيل الحملة - لوحة تحكم الإعلانات";
  }, []);

  // Fetch campaign details
  const { data: campaign, isLoading: campaignLoading, error: campaignError } = useQuery<CampaignWithStats>({
    queryKey: ["/api/ads/campaigns", campaignId],
    enabled: !!campaignId,
  });

  // Fetch ad groups
  const { data: adGroupsRaw, isLoading: adGroupsLoading } = useQuery<AdGroupWithStats[]>({
    queryKey: ["/api/ads/ad-groups", { campaignId }],
    queryFn: async () => {
      const res = await fetch(`/api/ads/ad-groups?campaignId=${campaignId}`, {
        credentials: "include"
      });
      if (!res.ok) throw new Error("فشل في جلب المجموعات الإعلانية");
      return res.json();
    },
    enabled: !!campaignId && activeTab === "adGroups",
  });
  const adGroups = Array.isArray(adGroupsRaw) ? adGroupsRaw : [];

  // Fetch daily stats
  const { data: dailyStatsRaw, isLoading: statsLoading } = useQuery<DailyStatRecord[]>({
    queryKey: ["/api/ads/campaigns", campaignId, "daily-stats"],
    queryFn: async () => {
      const res = await fetch(`/api/ads/campaigns/${campaignId}/daily-stats?days=7`, {
        credentials: "include"
      });
      if (!res.ok) throw new Error("فشل في جلب الإحصائيات اليومية");
      return res.json();
    },
    enabled: !!campaignId && activeTab === "overview",
  });
  const dailyStats = Array.isArray(dailyStatsRaw) ? dailyStatsRaw : [];

  // Fetch budget history
  const { data: budgetHistoryRaw, isLoading: budgetLoading } = useQuery<BudgetHistoryRecord[]>({
    queryKey: ["/api/ads/budget/history", { campaignId }],
    queryFn: async () => {
      const res = await fetch(`/api/ads/budget/history?campaignId=${campaignId}`, {
        credentials: "include"
      });
      if (!res.ok) throw new Error("فشل في جلب سجل الميزانية");
      return res.json();
    },
    enabled: !!campaignId && activeTab === "budget",
  });
  const budgetHistory = Array.isArray(budgetHistoryRaw) ? budgetHistoryRaw : [];

  // Fetch creatives
  const { data: creativesRaw, isLoading: creativesLoading } = useQuery<Creative[]>({
    queryKey: ["/api/ads/campaigns", campaignId, "creatives"],
    queryFn: async () => {
      const res = await fetch(`/api/ads/campaigns/${campaignId}/creatives`, {
        credentials: "include"
      });
      if (!res.ok) throw new Error("فشل في جلب الإعلانات");
      return res.json();
    },
    enabled: !!campaignId && activeTab === "creatives",
  });
  const creatives = Array.isArray(creativesRaw) ? creativesRaw : [];

  // Fetch placements
  const { data: placementsRaw, isLoading: placementsLoading } = useQuery<any[]>({
    queryKey: ["/api/ads/campaigns", campaignId, "placements"],
    enabled: !!campaignId && activeTab === "placements",
  });
  const placements = Array.isArray(placementsRaw) ? placementsRaw : [];

  // Delete creative mutation
  const deleteMutation = useMutation({
    mutationFn: async (creativeId: string) => {
      return await apiRequest(`/api/ads/creatives/${creativeId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ads/campaigns", campaignId, "creatives"] });
      toast({
        title: "تم الحذف",
        description: "تم حذف الإعلان بنجاح",
      });
      setCreativeToDelete(null);
    },
    onError: (error: any) => {
      console.error("[Delete Creative] خطأ:", error);
      toast({
        title: "حدث خطأ",
        description: error.message || "فشل في حذف الإعلان",
        variant: "destructive",
      });
    },
  });

  // Create ad group mutation
  const createAdGroupMutation = useMutation({
    mutationFn: async (data: { name: string; targetDevices: string[] }) => {
      return await apiRequest("/api/ads/ad-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          name: data.name,
          targetDevices: data.targetDevices,
          targetCountries: ["SA"],
          targetCategories: [],
          targetKeywords: [],
          status: "active"
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ads/ad-groups", { campaignId }] });
      toast({
        title: "تم الإنشاء",
        description: "تم إنشاء المجموعة الإعلانية بنجاح",
      });
      setShowAdGroupDialog(false);
      setAdGroupName("");
      setTargetDevices(["desktop", "mobile", "tablet"]);
    },
    onError: (error: any) => {
      console.error("[Create Ad Group] خطأ:", error);
      toast({
        title: "حدث خطأ",
        description: error.message || "فشل في إنشاء المجموعة الإعلانية",
        variant: "destructive",
      });
    },
  });

  // Update campaign status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      return await apiRequest(`/api/ads/campaigns/${campaignId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
    },
    onSuccess: (_, newStatus) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ads/campaigns", campaignId] });
      toast({
        title: "تم التحديث",
        description: newStatus === "active" ? "تم تفعيل الحملة بنجاح" : "تم إيقاف الحملة بنجاح",
      });
    },
    onError: (error: any) => {
      console.error("[Update Campaign Status] خطأ:", error);
      toast({
        title: "حدث خطأ",
        description: error.message || "فشل في تحديث حالة الحملة",
        variant: "destructive",
      });
    },
  });

  // Delete ad group mutation
  const deleteAdGroupMutation = useMutation({
    mutationFn: async (adGroupId: string) => {
      return await apiRequest(`/api/ads/ad-groups/${adGroupId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ads/ad-groups", { campaignId }] });
      toast({
        title: "تم الحذف",
        description: "تم حذف المجموعة الإعلانية بنجاح",
      });
      setAdGroupToDelete(null);
    },
    onError: (error: any) => {
      console.error("[Delete Ad Group] خطأ:", error);
      toast({
        title: "حدث خطأ",
        description: error.message || "فشل في حذف المجموعة الإعلانية",
        variant: "destructive",
      });
    },
  });

  // Calculate total spent from daily stats
  const totalSpent = dailyStats.reduce((sum, stat) => sum + Number(stat.spent || 0), 0);

  // Calculate budget progress
  const dailyBudgetProgress = campaign ? Math.min(
    (totalSpent / (Number(campaign.dailyBudget) * 7)) * 100,
    100
  ) : 0;

  const totalBudgetProgress = campaign ? Math.min(
    (totalSpent / Number(campaign.totalBudget)) * 100,
    100
  ) : 0;

  if (campaignError) {
    return (
      <DashboardLayout>
        <div className="container mx-auto p-6" dir="rtl">
          <Card>
            <CardHeader>
              <CardTitle>خطأ</CardTitle>
              <CardDescription>فشل في تحميل بيانات الحملة</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-destructive">
                {(campaignError as Error).message || "حدث خطأ غير متوقع"}
              </p>
              <Button
                onClick={() => setLocation("/dashboard/ads/campaigns")}
                className="mt-4"
                data-testid="button-back-to-campaigns-error"
              >
                <ArrowRight className="h-4 w-4 ml-2" />
                العودة إلى الحملات
              </Button>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 max-w-7xl" dir="rtl">
        {/* Back Button */}
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => setLocation("/dashboard/ads/campaigns")}
            className="mb-4"
            data-testid="button-back-to-campaigns"
          >
            <ArrowRight className="h-4 w-4 ml-2" />
            العودة إلى الحملات
          </Button>
        </div>

        {/* Campaign Header */}
        {campaignLoading ? (
          <div className="space-y-4 mb-6">
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-6 w-1/2" />
          </div>
        ) : campaign ? (
          <div className="mb-6">
            <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-3xl font-bold" data-testid="text-campaign-name">
                  {campaign.name}
                </h1>
                <Badge variant={statusColors[campaign.status]} data-testid="badge-campaign-status">
                  {statusLabels[campaign.status] || campaign.status}
                </Badge>
              </div>
              
              {/* Status Control Buttons */}
              <div className="flex items-center gap-2">
                {campaign.status === "draft" && (
                  <Button
                    onClick={() => updateStatusMutation.mutate("active")}
                    disabled={updateStatusMutation.isPending}
                    data-testid="button-activate-campaign"
                  >
                    <CheckCircle className="h-4 w-4 ml-2" />
                    {updateStatusMutation.isPending ? "جارٍ التفعيل..." : "تفعيل الحملة"}
                  </Button>
                )}
                {campaign.status === "active" && (
                  <Button
                    variant="outline"
                    onClick={() => updateStatusMutation.mutate("paused")}
                    disabled={updateStatusMutation.isPending}
                    data-testid="button-pause-campaign"
                  >
                    <Clock className="h-4 w-4 ml-2" />
                    {updateStatusMutation.isPending ? "جارٍ الإيقاف..." : "إيقاف مؤقت"}
                  </Button>
                )}
                {campaign.status === "paused" && (
                  <Button
                    onClick={() => updateStatusMutation.mutate("active")}
                    disabled={updateStatusMutation.isPending}
                    data-testid="button-resume-campaign"
                  >
                    <CheckCircle className="h-4 w-4 ml-2" />
                    {updateStatusMutation.isPending ? "جارٍ الاستئناف..." : "استئناف الحملة"}
                  </Button>
                )}
              </div>
            </div>
            <div className="flex items-center gap-6 text-muted-foreground flex-wrap">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4" />
                <span data-testid="text-campaign-objective">
                  {objectiveLabels[campaign.objective] || campaign.objective}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                <span data-testid="text-campaign-dates">
                  {new Date(campaign.startDate).toLocaleDateString("ar-SA-u-ca-gregory")}
                  {campaign.endDate && ` - ${new Date(campaign.endDate).toLocaleDateString("ar-SA-u-ca-gregory")}`}
                </span>
              </div>
            </div>
          </div>
        ) : null}

        {/* Performance Overview Cards */}
        {campaignLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        ) : campaign ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            {/* Total Impressions */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">إجمالي الظهور</CardTitle>
                <Eye className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-total-impressions">
                  {(campaign.stats?.totalImpressions || 0).toLocaleString("en-US")}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  عدد مرات عرض الإعلان
                </p>
              </CardContent>
            </Card>

            {/* Total Clicks */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">إجمالي النقرات</CardTitle>
                <MousePointer className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-total-clicks">
                  {(campaign.stats?.totalClicks || 0).toLocaleString("en-US")}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  عدد النقرات على الإعلان
                </p>
              </CardContent>
            </Card>

            {/* CTR */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">معدل النقر (CTR)</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-ctr">
                  {(campaign.stats?.ctr || 0).toFixed(2)}%
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  نسبة النقرات إلى الظهور
                </p>
              </CardContent>
            </Card>

            {/* Total Spent */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">إجمالي الإنفاق</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-total-spent">
                  {totalSpent.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  من {Number(campaign.totalBudget).toLocaleString("en-US")} ر.س
                </p>
              </CardContent>
            </Card>

            {/* Budget Progress */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">استهلاك الميزانية</CardTitle>
                <Wallet className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-budget-progress">
                  {totalBudgetProgress.toFixed(0)}%
                </div>
                <Progress value={totalBudgetProgress} className="mt-2" />
              </CardContent>
            </Card>
          </div>
        ) : null}

        {/* Tabs Section */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4" dir="rtl">
          <TabsList>
            <TabsTrigger value="overview" data-testid="tab-overview">نظرة عامة</TabsTrigger>
            <TabsTrigger value="adGroups" data-testid="tab-ad-groups">المجموعات الإعلانية</TabsTrigger>
            <TabsTrigger value="placements" data-testid="tab-placements">البنرات</TabsTrigger>
            <TabsTrigger value="creatives" data-testid="tab-creatives">الإعلانات</TabsTrigger>
            <TabsTrigger value="budget" data-testid="tab-budget">الميزانية</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>اتجاه الأداء (آخر 7 أيام)</CardTitle>
                <CardDescription>
                  الظهور والنقرات على مدار الأسبوع
                </CardDescription>
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Skeleton className="h-80 w-full" />
                ) : dailyStats.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart
                      data={dailyStats.map(stat => ({
                        date: new Date(stat.date).toLocaleDateString("ar-SA-u-ca-gregory", { month: "short", day: "numeric" }),
                        impressions: stat.impressions,
                        clicks: stat.clicks
                      }))}
                      margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip
                        labelFormatter={(label) => `التاريخ: ${label}`}
                        formatter={(value: number, name: string) => [
                          value.toLocaleString("en-US"),
                          name === "impressions" ? "الظهور" : "النقرات"
                        ]}
                      />
                      <Legend
                        formatter={(value) => value === "impressions" ? "الظهور" : "النقرات"}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="impressions" 
                        stroke="hsl(var(--primary))" 
                        strokeWidth={2}
                        name="impressions"
                      />
                      <Line 
                        type="monotone" 
                        dataKey="clicks" 
                        stroke="hsl(var(--accent))" 
                        strokeWidth={2}
                        name="clicks"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-80 text-muted-foreground">
                    لا توجد بيانات للعرض
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Ad Groups Tab */}
          <TabsContent value="adGroups" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>المجموعات الإعلانية</CardTitle>
                    <CardDescription>
                      المجموعات الإعلانية المرتبطة بهذه الحملة
                    </CardDescription>
                  </div>
                  <Button
                    onClick={() => setShowAdGroupDialog(true)}
                    data-testid="button-create-ad-group"
                  >
                    <Plus className="h-4 w-4 ml-2" />
                    إنشاء مجموعة
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {adGroupsLoading ? (
                  <div className="space-y-2">
                    {[...Array(3)].map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : adGroups.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-right">الاسم</TableHead>
                          <TableHead className="text-right">الحالة</TableHead>
                          <TableHead className="text-right">عدد الإعلانات</TableHead>
                          <TableHead className="text-right">الظهور</TableHead>
                          <TableHead className="text-right">النقرات</TableHead>
                          <TableHead className="text-right">CTR</TableHead>
                          <TableHead className="text-right">الإجراءات</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {adGroups.map((group) => (
                          <TableRow key={group.id} data-testid={`row-ad-group-${group.id}`}>
                            <TableCell className="font-medium" data-testid={`text-ad-group-name-${group.id}`}>
                              {group.name}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={statusColors[group.status] || "outline"}
                                data-testid={`badge-ad-group-status-${group.id}`}
                              >
                                {statusLabels[group.status] || group.status}
                              </Badge>
                            </TableCell>
                            <TableCell data-testid={`text-ad-group-creatives-${group.id}`}>
                              {group.creativesCount}
                            </TableCell>
                            <TableCell data-testid={`text-ad-group-impressions-${group.id}`}>
                              {group.stats.impressions.toLocaleString("en-US")}
                            </TableCell>
                            <TableCell data-testid={`text-ad-group-clicks-${group.id}`}>
                              {group.stats.clicks.toLocaleString("en-US")}
                            </TableCell>
                            <TableCell data-testid={`text-ad-group-ctr-${group.id}`}>
                              {group.stats.ctr.toFixed(2)}%
                            </TableCell>
                            <TableCell>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    data-testid={`button-ad-group-actions-${group.id}`}
                                  >
                                    <MoreVertical className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    data-testid={`button-view-ad-group-${group.id}`}
                                    onClick={() => toast({
                                      title: "معلومات المجموعة",
                                      description: `الاسم: ${group.name}\nالحالة: ${statusLabels[group.status]}\nعدد الإعلانات: ${group.creativesCount}`
                                    })}
                                  >
                                    عرض
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    data-testid={`button-edit-ad-group-${group.id}`}
                                    onClick={() => toast({
                                      title: "التعديل",
                                      description: "يمكنك تعديل المجموعة من خلال API مباشرة"
                                    })}
                                  >
                                    تعديل
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    data-testid={`button-delete-ad-group-${group.id}`}
                                    className="text-destructive"
                                    onClick={() => setAdGroupToDelete(group)}
                                  >
                                    حذف
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="text-muted-foreground mb-4">
                      لا توجد مجموعات إعلانية حتى الآن
                    </div>
                    <Button
                      onClick={() => setShowAdGroupDialog(true)}
                      data-testid="button-create-first-ad-group"
                    >
                      <Plus className="h-4 w-4 ml-2" />
                      إنشاء أول مجموعة
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Budget Tab */}
          <TabsContent value="budget" className="space-y-4">
            {/* Budget Progress Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>الميزانية اليومية</CardTitle>
                  <CardDescription>الإنفاق مقابل الميزانية اليومية</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>المستخدم</span>
                    <span className="font-medium">
                      {campaign ? (totalSpent / 7).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 0} ر.س
                    </span>
                  </div>
                  <div className="flex justify-between text-sm mb-2">
                    <span>الميزانية</span>
                    <span className="font-medium">
                      {campaign ? Number(campaign.dailyBudget).toLocaleString("en-US") : 0} ر.س
                    </span>
                  </div>
                  <Progress value={dailyBudgetProgress} data-testid="progress-daily-budget" />
                  <p className="text-xs text-muted-foreground mt-2">
                    {dailyBudgetProgress.toFixed(0)}% من الميزانية اليومية
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>الميزانية الإجمالية</CardTitle>
                  <CardDescription>الإنفاق مقابل الميزانية الكلية</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>المستخدم</span>
                    <span className="font-medium">
                      {totalSpent.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س
                    </span>
                  </div>
                  <div className="flex justify-between text-sm mb-2">
                    <span>الميزانية</span>
                    <span className="font-medium">
                      {campaign ? Number(campaign.totalBudget).toLocaleString("en-US") : 0} ر.س
                    </span>
                  </div>
                  <Progress value={totalBudgetProgress} data-testid="progress-total-budget" />
                  <p className="text-xs text-muted-foreground mt-2">
                    {totalBudgetProgress.toFixed(0)}% من الميزانية الإجمالية
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Budget History */}
            <Card>
              <CardHeader>
                <CardTitle>سجل الميزانية</CardTitle>
                <CardDescription>
                  تغييرات الميزانية على مدار الوقت
                </CardDescription>
              </CardHeader>
              <CardContent>
                {budgetLoading ? (
                  <div className="space-y-2">
                    {[...Array(3)].map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : budgetHistory.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-right">التاريخ</TableHead>
                          <TableHead className="text-right">نوع التغيير</TableHead>
                          <TableHead className="text-right">الميزانية السابقة</TableHead>
                          <TableHead className="text-right">الميزانية الجديدة</TableHead>
                          <TableHead className="text-right">السبب</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {budgetHistory.map((record) => (
                          <TableRow key={record.id} data-testid={`row-budget-history-${record.id}`}>
                            <TableCell data-testid={`text-budget-history-date-${record.id}`}>
                              {formatDistanceToNow(new Date(record.createdAt), { 
                                addSuffix: true, 
                                locale: arSA 
                              })}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" data-testid={`badge-budget-change-type-${record.id}`}>
                                {record.changeType === "increase" ? "زيادة" : "تخفيض"}
                              </Badge>
                            </TableCell>
                            <TableCell data-testid={`text-budget-previous-${record.id}`}>
                              {Number(record.previousBudget).toLocaleString("en-US")} ر.س
                            </TableCell>
                            <TableCell data-testid={`text-budget-new-${record.id}`}>
                              {Number(record.newBudget).toLocaleString("en-US")} ر.س
                            </TableCell>
                            <TableCell data-testid={`text-budget-reason-${record.id}`}>
                              {record.reason || "-"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="flex items-center justify-center py-12 text-muted-foreground">
                    لا يوجد سجل للميزانية
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Placements Tab */}
          <TabsContent value="placements" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <CardTitle>البنرات (أماكن العرض)</CardTitle>
                    <CardDescription>
                      إدارة ربط البنرات بأماكن العرض
                    </CardDescription>
                  </div>
                  <Button
                    onClick={() => setLocation(`/dashboard/ads/campaigns/${campaignId}/placements`)}
                    data-testid="button-manage-placements"
                  >
                    <LayoutGrid className="h-4 w-4 ml-2" />
                    إدارة البنرات
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {placementsLoading ? (
                  <div className="space-y-2">
                    {[...Array(3)].map((_, i) => (
                      <Skeleton key={i} className="h-20 w-full" />
                    ))}
                  </div>
                ) : placements.length > 0 ? (
                  <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-3">
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm font-medium">إجمالي الروابط</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold" data-testid="text-placements-total">
                            {placements.length}
                          </div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm font-medium">الروابط النشطة</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold text-green-600" data-testid="text-placements-active">
                            {placements.filter((p: any) => p.status === "active").length}
                          </div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm font-medium">الروابط المجدولة</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-2xl font-bold text-blue-600" data-testid="text-placements-scheduled">
                            {placements.filter((p: any) => p.status === "scheduled").length}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                    <div className="text-center py-4">
                      <p className="text-sm text-muted-foreground mb-4">
                        يوجد {placements.length} ربط للبنرات في هذه الحملة
                      </p>
                      <Button
                        onClick={() => setLocation(`/dashboard/ads/campaigns/${campaignId}/placements`)}
                        variant="outline"
                      >
                        عرض جميع الروابط
                        <ArrowRight className="h-4 w-4 mr-2" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="rounded-full bg-muted p-4 mb-4">
                      <LayoutGrid className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h3 className="font-semibold mb-2">لا توجد روابط بنرات</h3>
                    <p className="text-sm text-muted-foreground mb-4 max-w-md">
                      قم بربط البنرات بأماكن العرض لبدء عرض الإعلانات
                    </p>
                    <Button
                      onClick={() => setLocation(`/dashboard/ads/campaigns/${campaignId}/placements`)}
                      data-testid="button-create-first-placement"
                    >
                      <Plus className="h-4 w-4 ml-2" />
                      إنشاء أول ربط
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Creatives Tab */}
          <TabsContent value="creatives" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <CardTitle>الإعلانات</CardTitle>
                    <CardDescription>
                      الإعلانات المرتبطة بهذه الحملة
                    </CardDescription>
                  </div>
                  <Button
                    onClick={() => setLocation(`/dashboard/ads/creatives?campaignId=${campaignId}`)}
                    data-testid="button-create-creative"
                  >
                    <Plus className="h-4 w-4 ml-2" />
                    إنشاء إعلان
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {creativesLoading ? (
                  <div className="space-y-2">
                    {[...Array(3)].map((_, i) => (
                      <Skeleton key={i} className="h-20 w-full" />
                    ))}
                  </div>
                ) : creatives.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-right">معاينة</TableHead>
                          <TableHead className="text-right">الاسم</TableHead>
                          <TableHead className="text-right">النوع</TableHead>
                          <TableHead className="text-right">الحجم</TableHead>
                          <TableHead className="text-right">الحالة</TableHead>
                          <TableHead className="text-right">الإجراءات</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {creatives.map((creative) => (
                          <TableRow key={creative.id} data-testid={`row-creative-${creative.id}`}>
                            <TableCell>
                              <div className="w-16 h-16 rounded bg-muted flex items-center justify-center overflow-hidden">
                                {creative.type === "image" ? (
                                  <img
                                    src={creative.content}
                                    alt={creative.name}
                                    className="w-full h-full object-cover"
                                    data-testid={`img-creative-preview-${creative.id}`}
                                  />
                                ) : creative.type === "html" ? (
                                  <Code className="h-6 w-6 text-muted-foreground" data-testid={`icon-creative-preview-html-${creative.id}`} />
                                ) : (
                                  <Video className="h-6 w-6 text-muted-foreground" />
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="font-medium" data-testid={`text-creative-name-${creative.id}`}>
                              {creative.name}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {creative.type === "image" ? (
                                  <>
                                    <ImageIcon className="h-4 w-4 text-muted-foreground" />
                                    <span data-testid={`text-creative-type-${creative.id}`}>صورة</span>
                                  </>
                                ) : creative.type === "html" ? (
                                  <>
                                    <Code className="h-4 w-4 text-muted-foreground" />
                                    <Badge variant="outline" data-testid={`badge-creative-type-html-${creative.id}`}>HTML</Badge>
                                  </>
                                ) : (
                                  <>
                                    <Video className="h-4 w-4 text-muted-foreground" />
                                    <span data-testid={`text-creative-type-${creative.id}`}>فيديو</span>
                                  </>
                                )}
                              </div>
                            </TableCell>
                            <TableCell data-testid={`text-creative-size-${creative.id}`}>
                              {creative.size}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={statusColors[creative.status] || "default"}
                                data-testid={`badge-creative-status-${creative.id}`}
                              >
                                {statusLabels[creative.status] || creative.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => window.open(creative.content, "_blank")}
                                  data-testid={`button-view-creative-${creative.id}`}
                                  title="عرض"
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setCreativeToDelete(creative)}
                                  data-testid={`button-delete-creative-${creative.id}`}
                                  title="حذف"
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="text-muted-foreground mb-4">
                      لا توجد إعلانات حتى الآن
                    </div>
                    <Button
                      onClick={() => setLocation(`/dashboard/ads/creatives?campaignId=${campaignId}`)}
                      data-testid="button-create-first-creative"
                    >
                      <Plus className="h-4 w-4 ml-2" />
                      إنشاء أول إعلان
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Delete Creative Confirmation Dialog */}
        <AlertDialog open={!!creativeToDelete} onOpenChange={(open) => !open && setCreativeToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
              <AlertDialogDescription>
                هل أنت متأكد من حذف الإعلان "{creativeToDelete?.name}"؟ هذا الإجراء لا يمكن التراجع عنه.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-delete">إلغاء</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => creativeToDelete && deleteMutation.mutate(creativeToDelete.id)}
                className="bg-destructive hover:bg-destructive/90"
                data-testid="button-confirm-delete"
              >
                حذف
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Delete Ad Group Confirmation Dialog */}
        <AlertDialog open={!!adGroupToDelete} onOpenChange={(open) => !open && setAdGroupToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>تأكيد حذف المجموعة الإعلانية</AlertDialogTitle>
              <AlertDialogDescription>
                هل أنت متأكد من حذف المجموعة الإعلانية "{adGroupToDelete?.name}"؟ سيتم حذف جميع الإعلانات المرتبطة بها. هذا الإجراء لا يمكن التراجع عنه.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-delete-ad-group">إلغاء</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => adGroupToDelete && deleteAdGroupMutation.mutate(adGroupToDelete.id)}
                className="bg-destructive hover:bg-destructive/90"
                data-testid="button-confirm-delete-ad-group"
                disabled={deleteAdGroupMutation.isPending}
              >
                {deleteAdGroupMutation.isPending ? "جارٍ الحذف..." : "حذف"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Create Ad Group Dialog */}
        <Dialog open={showAdGroupDialog} onOpenChange={setShowAdGroupDialog}>
          <DialogContent className="sm:max-w-[500px]" data-testid="dialog-create-ad-group">
            <DialogHeader>
              <DialogTitle>إنشاء مجموعة إعلانية جديدة</DialogTitle>
              <DialogDescription>
                أضف مجموعة إعلانية جديدة للحملة. يمكنك إضافة البنرات الإعلانية للمجموعة لاحقاً.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="ad-group-name">اسم المجموعة الإعلانية *</Label>
                <Input
                  id="ad-group-name"
                  placeholder="مثال: حملة رمضان - صفحة رئيسية"
                  value={adGroupName}
                  onChange={(e) => setAdGroupName(e.target.value)}
                  data-testid="input-ad-group-name"
                />
              </div>
              <div className="space-y-3">
                <Label>الأجهزة المستهدفة *</Label>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="target-desktop"
                      checked={targetDevices.includes("desktop")}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setTargetDevices([...targetDevices, "desktop"]);
                        } else {
                          setTargetDevices(targetDevices.filter(d => d !== "desktop"));
                        }
                      }}
                      data-testid="checkbox-target-desktop"
                    />
                    <Label htmlFor="target-desktop" className="cursor-pointer">
                      أجهزة الكمبيوتر
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="target-mobile"
                      checked={targetDevices.includes("mobile")}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setTargetDevices([...targetDevices, "mobile"]);
                        } else {
                          setTargetDevices(targetDevices.filter(d => d !== "mobile"));
                        }
                      }}
                      data-testid="checkbox-target-mobile"
                    />
                    <Label htmlFor="target-mobile" className="cursor-pointer">
                      الهواتف الذكية
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="target-tablet"
                      checked={targetDevices.includes("tablet")}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setTargetDevices([...targetDevices, "tablet"]);
                        } else {
                          setTargetDevices(targetDevices.filter(d => d !== "tablet"));
                        }
                      }}
                      data-testid="checkbox-target-tablet"
                    />
                    <Label htmlFor="target-tablet" className="cursor-pointer">
                      الأجهزة اللوحية
                    </Label>
                  </div>
                </div>
                {targetDevices.length === 0 && (
                  <p className="text-sm text-destructive">يجب اختيار جهاز واحد على الأقل</p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowAdGroupDialog(false);
                  setAdGroupName("");
                  setTargetDevices(["desktop", "mobile", "tablet"]);
                }}
                data-testid="button-cancel-ad-group"
              >
                إلغاء
              </Button>
              <Button
                onClick={() => {
                  if (adGroupName.trim() && targetDevices.length > 0) {
                    createAdGroupMutation.mutate({
                      name: adGroupName.trim(),
                      targetDevices
                    });
                  }
                }}
                disabled={!adGroupName.trim() || targetDevices.length === 0 || createAdGroupMutation.isPending}
                data-testid="button-submit-ad-group"
              >
                {createAdGroupMutation.isPending ? "جارٍ الإنشاء..." : "إنشاء المجموعة"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
