import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  Plus, 
  Filter, 
  TrendingUp, 
  Eye, 
  Edit2, 
  Pause, 
  Play,
  Search,
  Trash2,
  Loader2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

type Campaign = {
  id: string;
  name: string;
  status: "draft" | "pending_review" | "active" | "paused" | "ended";
  objective: string;
  dailyBudget: number;
  totalBudget: number;
  spentBudget: number;
  startDate: string;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
  stats?: {
    impressions: number;
    clicks: number;
    ctr: number;
  };
};

const statusColors: Record<Campaign["status"], string> = {
  active: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
  paused: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20",
  ended: "bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20",
  pending_review: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  draft: "bg-muted text-muted-foreground border-border",
};

const statusLabels: Record<Campaign["status"], string> = {
  active: "نشطة",
  paused: "متوقفة مؤقتاً",
  ended: "منتهية",
  pending_review: "قيد المراجعة",
  draft: "مسودة",
};

function formatImpressions(count: number): string {
  return new Intl.NumberFormat("en-US").format(count);
}

function formatNumber(num: number): string {
  return new Intl.NumberFormat("en-US").format(num);
}

function CampaignsTableSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-4 p-4 border rounded-lg">
          <Skeleton className="h-12 w-12 rounded" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-20" />
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  const [, setLocation] = useLocation();

  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-16">
        <div className="rounded-full bg-primary/10 p-6 mb-4">
          <TrendingUp className="h-12 w-12 text-primary" />
        </div>
        <h3 className="text-xl font-semibold mb-2">لا توجد حملات إعلانية</h3>
        <p className="text-muted-foreground mb-6 text-center max-w-md">
          ابدأ أول حملة إعلانية لك للوصول إلى جمهورك المستهدف على منصة سبق الذكية
        </p>
        <Button
          onClick={() => setLocation("/dashboard/ads/campaigns/new")}
          data-testid="button-create-first-campaign"
        >
          <Plus className="h-4 w-4 ml-2" />
          إنشاء حملة جديدة
        </Button>
      </CardContent>
    </Card>
  );
}

export default function CampaignsList() {
  const { user } = useAuth({ redirectToLogin: true });
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [campaignToDelete, setCampaignToDelete] = useState<Campaign | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    document.title = "إدارة الحملات الإعلانية - لوحة تحكم الإعلانات";
  }, []);

  // Fetch campaigns
  const { data: campaignsRaw, isLoading, error } = useQuery<Campaign[]>({
    queryKey: ["/api/ads/campaigns", statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter && statusFilter !== "all") {
        params.append("status", statusFilter);
      }
      
      const url = `/api/ads/campaigns${params.toString() ? `?${params.toString()}` : ""}`;
      const response = await fetch(url, { credentials: "include" });
      
      if (!response.ok) {
        throw new Error("فشل في جلب الحملات");
      }
      
      return response.json();
    },
    enabled: !!user,
  });
  const campaigns = Array.isArray(campaignsRaw) ? campaignsRaw : [];

  // Delete campaign mutation
  const deleteMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      await apiRequest(`/api/ads/campaigns/${campaignId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ads/campaigns"] });
      toast({
        title: "تم حذف الحملة",
        description: "تم حذف الحملة الإعلانية بنجاح",
      });
      setCampaignToDelete(null);
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في حذف الحملة",
        variant: "destructive",
      });
    },
  });

  // Toggle campaign status (pause/resume)
  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, newStatus }: { id: string; newStatus: "active" | "paused" }) => {
      await apiRequest(`/api/ads/campaigns/${id}`, {
        method: "PUT",
        body: JSON.stringify({ status: newStatus }),
        headers: {
          "Content-Type": "application/json",
        },
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/ads/campaigns"] });
      const action = variables.newStatus === "paused" ? "إيقاف" : "تشغيل";
      toast({
        title: `تم ${action} الحملة`,
        description: `تم ${action} الحملة الإعلانية بنجاح`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في تحديث حالة الحملة",
        variant: "destructive",
      });
    },
  });

  // Handle pause/resume
  const handleToggleStatus = (campaign: Campaign) => {
    const newStatus = campaign.status === "active" ? "paused" : "active";
    toggleStatusMutation.mutate({ id: campaign.id, newStatus });
  };

  // Handle delete
  const handleDelete = (campaign: Campaign) => {
    setCampaignToDelete(campaign);
  };

  const confirmDelete = () => {
    if (campaignToDelete) {
      deleteMutation.mutate(campaignToDelete.id);
    }
  };

  // Filter campaigns by search term
  const filteredCampaigns = campaigns.filter((campaign) =>
    campaign.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Calculate summary stats
  const totalCampaigns = campaigns.length;
  const activeCampaigns = campaigns.filter((c) => c.status === "active").length;
  const totalSpent = campaigns.reduce((sum, c) => sum + c.spentBudget, 0);
  const totalBudget = campaigns.reduce((sum, c) => sum + c.totalBudget, 0);

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6" dir="rtl">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-end gap-3 mb-2">
            <div className="text-right">
              <h1 className="text-3xl font-bold">الحملات الإعلانية</h1>
              <p className="text-muted-foreground">
                إدارة ومتابعة حملاتك الإعلانية وإحصائياتها
              </p>
            </div>
            <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600">
              <TrendingUp className="h-6 w-6 text-white" />
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4 mb-6">
          <Card className="hover-elevate active-elevate-2 transition-all bg-purple-50 dark:bg-card">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">إجمالي الحملات</CardTitle>
              <div className="p-2 rounded-md bg-purple-500/20">
                <TrendingUp className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-campaigns">
                {formatNumber(totalCampaigns)}
              </div>
            </CardContent>
          </Card>

          <Card className="hover-elevate active-elevate-2 transition-all bg-green-50 dark:bg-card">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">الحملات النشطة</CardTitle>
              <div className="p-2 rounded-md bg-green-500/20">
                <Play className="h-4 w-4 text-green-600 dark:text-green-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600 dark:text-green-400" data-testid="text-active-campaigns">
                {formatNumber(activeCampaigns)}
              </div>
            </CardContent>
          </Card>

          <Card className="hover-elevate active-elevate-2 transition-all bg-blue-50 dark:bg-card">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">الظهورات المستهلكة</CardTitle>
              <div className="p-2 rounded-md bg-blue-500/20">
                <Eye className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-spent-budget">
                {formatImpressions(totalSpent)}
              </div>
            </CardContent>
          </Card>

          <Card className="hover-elevate active-elevate-2 transition-all bg-amber-50 dark:bg-card">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">إجمالي الظهورات</CardTitle>
              <div className="p-2 rounded-md bg-amber-500/20">
                <Eye className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-budget">
                {formatImpressions(totalBudget)}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Actions */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <CardTitle>قائمة الحملات</CardTitle>
                <CardDescription>
                  إدارة وتتبع جميع حملاتك الإعلانية
                </CardDescription>
              </div>
              <Button
                onClick={() => setLocation("/dashboard/ads/campaigns/new")}
                data-testid="button-create-campaign"
              >
                <Plus className="h-4 w-4 ml-2" />
                إنشاء حملة جديدة
              </Button>
            </div>
          </CardHeader>

          <CardContent>
            {/* Search and Filters */}
            <div className="flex flex-col md:flex-row gap-4 mb-6">
              <div className="flex-1 relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="البحث عن حملة..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pr-10"
                  data-testid="input-search-campaigns"
                />
              </div>

              <Select
                value={statusFilter}
                onValueChange={setStatusFilter}
              >
                <SelectTrigger className="w-full md:w-48" data-testid="select-status-filter">
                  <Filter className="h-4 w-4 ml-2" />
                  <SelectValue placeholder="تصفية حسب الحالة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الحملات</SelectItem>
                  <SelectItem value="active">نشطة</SelectItem>
                  <SelectItem value="paused">متوقفة مؤقتاً</SelectItem>
                  <SelectItem value="ended">منتهية</SelectItem>
                  <SelectItem value="pending_review">قيد المراجعة</SelectItem>
                  <SelectItem value="draft">مسودة</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Loading State */}
            {isLoading && <CampaignsTableSkeleton />}

            {/* Error State */}
            {error && (
              <div className="text-center py-8">
                <p className="text-destructive">حدث خطأ في تحميل الحملات</p>
              </div>
            )}

            {/* Empty State */}
            {!isLoading && !error && filteredCampaigns.length === 0 && campaigns.length === 0 && (
              <EmptyState />
            )}

            {/* No Results State */}
            {!isLoading && !error && filteredCampaigns.length === 0 && campaigns.length > 0 && (
              <div className="text-center py-8">
                <p className="text-muted-foreground">لا توجد نتائج للبحث</p>
              </div>
            )}

            {/* Campaigns Table */}
            {!isLoading && !error && filteredCampaigns.length > 0 && (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">اسم الحملة</TableHead>
                      <TableHead className="text-right">الحالة</TableHead>
                      <TableHead className="text-right">رصيد الظهورات</TableHead>
                      <TableHead className="text-right">المشاهدات</TableHead>
                      <TableHead className="text-right">النقرات</TableHead>
                      <TableHead className="text-right">معدل النقر (CTR)</TableHead>
                      <TableHead className="text-right">الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCampaigns.map((campaign) => {
                      const budgetProgress = (campaign.spentBudget / campaign.totalBudget) * 100;
                      const stats = campaign.stats || { impressions: 0, clicks: 0, ctr: 0 };

                      return (
                        <TableRow 
                          key={campaign.id}
                          data-testid={`row-campaign-${campaign.id}`}
                          className="hover:bg-muted/30"
                        >
                          <TableCell>
                            <div>
                              <p className="font-medium" data-testid={`text-campaign-name-${campaign.id}`}>
                                {campaign.name}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {campaign.objective}
                              </p>
                            </div>
                          </TableCell>

                          <TableCell>
                            <Badge
                              variant="outline"
                              className={statusColors[campaign.status]}
                              data-testid={`badge-status-${campaign.id}`}
                            >
                              {statusLabels[campaign.status]}
                            </Badge>
                          </TableCell>

                          <TableCell>
                            <div className="space-y-1">
                              <p className="text-sm font-medium">
                                {formatImpressions(campaign.spentBudget)} / {formatImpressions(campaign.totalBudget)}
                              </p>
                              <div className="w-24 bg-muted rounded-full h-1.5">
                                <div
                                  className="bg-primary h-1.5 rounded-full transition-all"
                                  style={{ width: `${Math.min(budgetProgress, 100)}%` }}
                                />
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {budgetProgress.toFixed(0)}% مستهلك
                              </p>
                            </div>
                          </TableCell>

                          <TableCell>
                            <span data-testid={`text-impressions-${campaign.id}`}>
                              {formatNumber(stats.impressions)}
                            </span>
                          </TableCell>

                          <TableCell>
                            <span data-testid={`text-clicks-${campaign.id}`}>
                              {formatNumber(stats.clicks)}
                            </span>
                          </TableCell>

                          <TableCell>
                            <span 
                              className="font-medium text-primary"
                              data-testid={`text-ctr-${campaign.id}`}
                            >
                              {stats.ctr.toFixed(2)}%
                            </span>
                          </TableCell>

                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setLocation(`/dashboard/ads/campaigns/${campaign.id}`)}
                                data-testid={`button-view-${campaign.id}`}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>

                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setLocation(`/dashboard/ads/campaigns/${campaign.id}/edit`)}
                                data-testid={`button-edit-${campaign.id}`}
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>

                              {campaign.status === "active" && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleToggleStatus(campaign)}
                                  disabled={toggleStatusMutation.isPending}
                                  data-testid={`button-pause-${campaign.id}`}
                                >
                                  {toggleStatusMutation.isPending ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Pause className="h-4 w-4" />
                                  )}
                                </Button>
                              )}

                              {campaign.status === "paused" && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleToggleStatus(campaign)}
                                  disabled={toggleStatusMutation.isPending}
                                  data-testid={`button-resume-${campaign.id}`}
                                >
                                  {toggleStatusMutation.isPending ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Play className="h-4 w-4" />
                                  )}
                                </Button>
                              )}

                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDelete(campaign)}
                                disabled={deleteMutation.isPending}
                                data-testid={`button-delete-${campaign.id}`}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!campaignToDelete} onOpenChange={(open) => !open && setCampaignToDelete(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد حذف الحملة</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف الحملة "{campaignToDelete?.name}"؟
              <br />
              <span className="text-destructive font-medium">
                تحذير: سيتم حذف جميع البنرات والإحصائيات المرتبطة بهذه الحملة بشكل نهائي.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">
              إلغاء
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
              className="bg-destructive hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                  جاري الحذف...
                </>
              ) : (
                "حذف الحملة"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
