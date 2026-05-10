import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  useAdvertiserProfile, 
  useAdvertiserAds, 
  useAdvertiserStats,
  useAdvertiserLogout 
} from "@/hooks/useAdvertiser";
import { 
  Plus, 
  FileText, 
  Eye, 
  MousePointerClick, 
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
  Pause,
  LogOut,
  BarChart3,
  Loader2,
  ArrowLeft,
  AlertCircle,
  Wallet,
  Edit2,
  TrendingUp,
  ShoppingCart,
  CreditCard,
  Star
} from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import sabqLogo from "@assets/sabq-logo.png";

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: any }> = {
  pending_approval: { label: "قيد المراجعة", variant: "secondary", icon: Clock },
  active: { label: "نشط", variant: "default", icon: CheckCircle },
  paused: { label: "متوقف", variant: "outline", icon: Pause },
  rejected: { label: "مرفوض", variant: "destructive", icon: XCircle },
  completed: { label: "مكتمل", variant: "secondary", icon: CheckCircle },
  expired: { label: "منتهي", variant: "outline", icon: Clock },
};

function isBudgetExhaustedToday(exhaustedAt: string | Date | null | undefined): boolean {
  if (!exhaustedAt) return false;
  const exhaustedDate = new Date(exhaustedAt);
  const saudiOffset = 3 * 60 * 60 * 1000;
  const exhaustedSaudiTime = new Date(exhaustedDate.getTime() + saudiOffset);
  const nowSaudiTime = new Date(Date.now() + saudiOffset);
  return exhaustedSaudiTime.toISOString().split('T')[0] === nowSaudiTime.toISOString().split('T')[0];
}

function formatBudgetSAR(halalas: number | null | undefined): string {
  if (!halalas) return "-";
  return (halalas / 100).toFixed(2) + " ر.س";
}

function StatCard({ title, value, icon: Icon, loading }: { title: string; value: string | number; icon: any; loading?: boolean }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            {loading ? (
              <Skeleton className="h-8 w-20 mt-1" />
            ) : (
              <p className="text-2xl font-bold" data-testid={`stat-${title.replace(/\s/g, '-')}`}>{value}</p>
            )}
          </div>
          <div className="p-3 bg-primary/10 rounded-full">
            <Icon className="h-6 w-6 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdvertiserPortalDashboard() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { data: profile, isLoading: profileLoading, error: profileError } = useAdvertiserProfile();
  const { data: ads, isLoading: adsLoading } = useAdvertiserAds();
  const { data: stats, isLoading: statsLoading } = useAdvertiserStats();
  const logoutMutation = useAdvertiserLogout();
  
  // Budget editing state
  const [budgetDialogOpen, setBudgetDialogOpen] = useState(false);
  const [editingAd, setEditingAd] = useState<any>(null);
  const [budgetEnabled, setBudgetEnabled] = useState(false);
  const [budgetAmount, setBudgetAmount] = useState("");
  const [remainingBudget, setRemainingBudget] = useState<number | null>(null);
  
  // Purchase dialog state
  const [purchaseDialogOpen, setPurchaseDialogOpen] = useState(false);
  const [purchaseAd, setPurchaseAd] = useState<any>(null);
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  
  // Fetch packages and wallet
  const { data: packagesData, isLoading: packagesLoading } = useQuery({
    queryKey: ["/api/advertiser-payments/packages"],
    enabled: purchaseDialogOpen,
  });
  
  const { data: walletData, refetch: refetchWallet } = useQuery({
    queryKey: ["/api/advertiser-payments/wallet"],
  });
  
  const purchasePackageMutation = useMutation({
    mutationFn: async ({ packageId, adId }: { packageId: string; adId?: string }) => {
      return await apiRequest("/api/advertiser-payments/purchase-package", {
        method: "POST",
        body: JSON.stringify({ packageId, adId }),
      });
    },
    onSuccess: (data) => {
      if (data.data?.paymentUrl) {
        window.location.href = data.data.paymentUrl;
      } else {
        toast({
          title: "خطأ",
          description: "لم يتم الحصول على رابط الدفع",
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في بدء عملية الشراء",
        variant: "destructive",
      });
    },
  });
  
  const openPurchaseDialog = (ad: any) => {
    setPurchaseAd(ad);
    setSelectedPackageId(null);
    setPurchaseDialogOpen(true);
  };
  
  const handlePurchasePackage = () => {
    if (!selectedPackageId) return;
    purchasePackageMutation.mutate({
      packageId: selectedPackageId,
      adId: purchaseAd?.id,
    });
  };
  
  // Calculate remaining budget (totalBudget - totalCost)
  const calculateRemainingBudget = (ad: any): number | null => {
    if (!ad.totalBudget) return null; // No total budget set
    const totalBudgetHalalas = ad.totalBudget;
    const totalCostHalalas = Math.round((ad.totalCost || 0) * 100); // totalCost is in SAR
    return Math.max(0, totalBudgetHalalas - totalCostHalalas);
  };
  
  const updateBudgetMutation = useMutation({
    mutationFn: async ({ adId, dailyBudgetEnabled, dailyBudget }: { adId: string; dailyBudgetEnabled: boolean; dailyBudget: number | null }) => {
      return await apiRequest(`/api/native-ads/my-ads/${adId}/budget`, {
        method: 'PATCH',
        body: JSON.stringify({ dailyBudgetEnabled, dailyBudget }),
      });
    },
    onSuccess: (data) => {
      toast({
        title: "تم التحديث",
        description: data.message || "تم تحديث الميزانية اليومية بنجاح",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/advertiser/ads"] });
      setBudgetDialogOpen(false);
      setEditingAd(null);
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل في تحديث الميزانية",
        variant: "destructive",
      });
    },
  });
  
  const openBudgetDialog = (ad: any) => {
    setEditingAd(ad);
    setBudgetEnabled(ad.dailyBudgetEnabled || false);
    setBudgetAmount(ad.dailyBudget ? (ad.dailyBudget / 100).toString() : "");
    setRemainingBudget(calculateRemainingBudget(ad));
    setBudgetDialogOpen(true);
  };
  
  const handleSaveBudget = () => {
    if (!editingAd) return;
    
    const budgetInHalalas = budgetEnabled && budgetAmount ? Math.round(parseFloat(budgetAmount) * 100) : null;
    
    if (budgetEnabled && (!budgetInHalalas || budgetInHalalas < 1000)) {
      toast({
        title: "خطأ",
        description: "الحد الأدنى للميزانية اليومية هو 10 ريال",
        variant: "destructive",
      });
      return;
    }
    
    // Validate daily budget doesn't exceed remaining budget
    if (budgetEnabled && budgetInHalalas && remainingBudget !== null && budgetInHalalas > remainingBudget) {
      toast({
        title: "خطأ",
        description: `الميزانية اليومية تتجاوز الميزانية المتبقية (${(remainingBudget / 100).toFixed(2)} ر.س)`,
        variant: "destructive",
      });
      return;
    }
    
    updateBudgetMutation.mutate({
      adId: editingAd.id,
      dailyBudgetEnabled: budgetEnabled,
      dailyBudget: budgetInHalalas,
    });
  };

  useEffect(() => {
    document.title = "لوحة تحكم المعلن - سبق";
  }, []);

  useEffect(() => {
    if (profileError && !profileLoading) {
      navigate("/advertise/login");
    }
  }, [profileError, profileLoading, navigate]);

  const handleLogout = async () => {
    try {
      await logoutMutation.mutateAsync();
      toast({
        title: "تم تسجيل الخروج",
        description: "نراك قريباً!",
      });
      navigate("/advertise/login");
    } catch (error) {
      toast({
        title: "خطأ",
        description: "فشل تسجيل الخروج",
        variant: "destructive",
      });
    }
  };

  if (profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" dir="rtl">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!profile) {
    return null;
  }

  const formatNumber = (num: number) => {
    return num.toLocaleString('en-US');
  };

  const formatCurrency = (amount: number) => {
    return amount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + ' ر.س';
  };

  const calculateCTR = (clicks: number, impressions: number) => {
    if (impressions === 0) return "0%";
    return ((clicks / impressions) * 100).toFixed(2) + "%";
  };

  return (
    <div className="min-h-screen bg-muted/30" dir="rtl">
      <header className="bg-background border-b sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/">
                <img 
                  src={sabqLogo} 
                  alt="سبق" 
                  className="h-8"
                  data-testid="img-logo"
                />
              </Link>
              <div className="h-6 w-px bg-border" />
              <span className="text-sm font-medium text-muted-foreground">منصة المعلنين</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground" data-testid="text-user-name">
                مرحباً، {profile.name}
              </span>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleLogout}
                disabled={logoutMutation.isPending}
                data-testid="button-logout"
                className="gap-2"
              >
                {logoutMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LogOut className="h-4 w-4" />
                )}
                خروج
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">لوحة التحكم</h1>
            <p className="text-muted-foreground">مراقبة وإدارة إعلاناتك</p>
          </div>
          <div className="flex gap-2">
            <Link href="/advertise">
              <Button variant="outline" className="gap-2" data-testid="link-advertise-home">
                <ArrowLeft className="h-4 w-4" />
                الرئيسية
              </Button>
            </Link>
            <Link href="/advertise/create">
              <Button className="gap-2" data-testid="button-create-ad">
                <Plus className="h-4 w-4" />
                إنشاء إعلان جديد
              </Button>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard 
            title="إجمالي الإعلانات" 
            value={formatNumber(stats?.totalAds ?? 0)} 
            icon={FileText}
            loading={statsLoading}
          />
          <StatCard 
            title="الإعلانات النشطة" 
            value={formatNumber(stats?.activeAds ?? 0)} 
            icon={CheckCircle}
            loading={statsLoading}
          />
          <StatCard 
            title="إجمالي المشاهدات" 
            value={formatNumber(stats?.totalImpressions ?? 0)} 
            icon={Eye}
            loading={statsLoading}
          />
          <StatCard 
            title="إجمالي النقرات" 
            value={formatNumber(stats?.totalClicks ?? 0)} 
            icon={MousePointerClick}
            loading={statsLoading}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
          <Card className="col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                ملخص الأداء
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">إعلانات قيد المراجعة</span>
                {statsLoading ? (
                  <Skeleton className="h-6 w-8" />
                ) : (
                  <Badge variant="secondary" data-testid="stat-pending">{formatNumber(stats?.pendingAds ?? 0)}</Badge>
                )}
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">إجمالي التكلفة</span>
                {statsLoading ? (
                  <Skeleton className="h-6 w-20" />
                ) : (
                  <span className="font-semibold" data-testid="stat-cost">
                    {formatCurrency(stats?.totalCost ?? 0)}
                  </span>
                )}
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">معدل النقر (CTR)</span>
                {statsLoading ? (
                  <Skeleton className="h-6 w-12" />
                ) : (
                  <span className="font-semibold" data-testid="stat-ctr">
                    {calculateCTR(stats?.totalClicks ?? 0, stats?.totalImpressions ?? 0)}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>إعلاناتي</CardTitle>
          </CardHeader>
          <CardContent>
            {adsLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : ads && ads.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>العنوان</TableHead>
                      <TableHead>الحالة</TableHead>
                      <TableHead className="text-center">المشاهدات</TableHead>
                      <TableHead className="text-center">النقرات</TableHead>
                      <TableHead className="text-center">CTR</TableHead>
                      <TableHead className="text-center">التكلفة الإجمالية</TableHead>
                      <TableHead>تاريخ الإنشاء</TableHead>
                      <TableHead className="text-center">الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ads.map((ad) => {
                      const status = statusConfig[ad.status] || statusConfig.pending_approval;
                      const StatusIcon = status.icon;
                      return (
                        <TableRow key={ad.id} data-testid={`row-ad-${ad.id}`}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              {ad.imageUrl && (
                                <img 
                                  src={ad.imageUrl} 
                                  alt={ad.title}
                                  className="w-12 h-8 object-cover rounded"
                                />
                              )}
                              <div>
                                <p className="font-medium line-clamp-1">{ad.title}</p>
                                {ad.description && (
                                  <p className="text-xs text-muted-foreground line-clamp-1">{ad.description}</p>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <Badge variant={status.variant} className="gap-1" data-testid={`badge-status-${ad.id}`}>
                                <StatusIcon className="h-3 w-3" />
                                {status.label}
                              </Badge>
                              {(() => {
                                const usagePercent = (ad as any).dailyBudgetUsagePercent || 0;
                                const todaySpend = (ad as any).todaySpendHalalas || 0;
                                const dailyBudget = (ad as any).dailyBudget || 0;
                                const remainingToday = Math.max(0, dailyBudget - todaySpend);
                                const isExhausted = isBudgetExhaustedToday((ad as any).dailyBudgetExhaustedAt) || usagePercent >= 100;
                                const isWarning = usagePercent >= 80 && usagePercent < 100;
                                
                                if (!(ad as any).dailyBudgetEnabled) return null;
                                
                                return (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Badge 
                                        variant={isExhausted ? "destructive" : "secondary"}
                                        className={`text-xs gap-1 cursor-help ${isWarning ? "border-orange-500 text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30" : ""}`}
                                        data-testid={isExhausted ? `badge-budget-exhausted-${ad.id}` : isWarning ? `badge-budget-warning-${ad.id}` : `badge-budget-${ad.id}`}
                                      >
                                        {isExhausted ? (
                                          <>
                                            <AlertCircle className="h-3 w-3" />
                                            انتهى الحد اليومي
                                          </>
                                        ) : isWarning ? (
                                          <>
                                            <AlertCircle className="h-3 w-3" />
                                            متبقي: {formatBudgetSAR(remainingToday)}
                                          </>
                                        ) : (
                                          <>
                                            <Wallet className="h-3 w-3" />
                                            {formatBudgetSAR(dailyBudget)}/يوم ({100 - usagePercent}% متبقي)
                                          </>
                                        )}
                                      </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent side="bottom" dir="rtl">
                                      <div className="text-sm space-y-1">
                                        <p className="font-semibold border-b pb-1 mb-1">الميزانية اليومية</p>
                                        <p>الحد اليومي: {formatBudgetSAR(dailyBudget)}</p>
                                        <p>الإنفاق اليوم: {formatBudgetSAR(todaySpend)}</p>
                                        <p className={isExhausted ? "text-destructive font-semibold" : isWarning ? "text-orange-500 font-semibold" : "text-green-600 dark:text-green-400"}>
                                          المتبقي اليوم: {formatBudgetSAR(remainingToday)}
                                        </p>
                                        <p className="text-muted-foreground text-xs">نسبة الاستخدام: {usagePercent}%</p>
                                        {isExhausted && (
                                          <p className="text-muted-foreground text-xs mt-2 border-t pt-1">سيتم إعادة التفعيل عند منتصف الليل</p>
                                        )}
                                      </div>
                                    </TooltipContent>
                                  </Tooltip>
                                );
                              })()}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">{formatNumber(ad.impressions)}</TableCell>
                          <TableCell className="text-center">{formatNumber(ad.clicks)}</TableCell>
                          <TableCell className="text-center">{calculateCTR(ad.clicks, ad.impressions)}</TableCell>
                          <TableCell className="text-center">{formatCurrency(ad.totalCost || 0)}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {format(new Date(ad.createdAt), 'dd/MM/yyyy', { locale: ar })}
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openBudgetDialog(ad)}
                                className="gap-1"
                                data-testid={`button-edit-budget-${ad.id}`}
                              >
                                <TrendingUp className="h-3 w-3" />
                                تعديل الميزانية
                              </Button>
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() => openPurchaseDialog(ad)}
                                className="gap-1"
                                data-testid={`button-purchase-${ad.id}`}
                              >
                                <ShoppingCart className="h-3 w-3" />
                                شراء المزيد
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">لا توجد إعلانات بعد</h3>
                <p className="text-muted-foreground mb-4">
                  ابدأ بإنشاء إعلانك الأول للوصول إلى جمهورك المستهدف
                </p>
                <Link href="/advertise/create">
                  <Button data-testid="button-create-first-ad">
                    <Plus className="h-4 w-4 ml-2" />
                    إنشاء إعلان جديد
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
      
      <Dialog open={budgetDialogOpen} onOpenChange={setBudgetDialogOpen}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>تعديل الميزانية اليومية</DialogTitle>
            <DialogDescription>
              {editingAd?.title}
              {(editingAd as any)?.dailyBudgetExhaustedAt && isBudgetExhaustedToday((editingAd as any)?.dailyBudgetExhaustedAt) && (
                <div className="mt-2 p-2 bg-destructive/10 rounded-md text-destructive text-sm flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  <span>استنفذت الميزانية اليومية. ارفع الحد لإعادة تفعيل الإعلان.</span>
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {remainingBudget !== null && (
              <div className="bg-muted/50 rounded-lg p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">الميزانية المتبقية:</span>
                  <span className="font-semibold text-primary" data-testid="text-remaining-budget">
                    {(remainingBudget / 100).toFixed(2)} ر.س
                  </span>
                </div>
              </div>
            )}
            
            <div className="flex items-center justify-between">
              <Label htmlFor="budget-enabled">تفعيل الحد اليومي</Label>
              <Switch
                id="budget-enabled"
                checked={budgetEnabled}
                onCheckedChange={setBudgetEnabled}
                data-testid="switch-budget-enabled"
              />
            </div>
            
            {budgetEnabled && (
              <div className="space-y-2">
                <Label htmlFor="budget-amount">الميزانية اليومية (ريال سعودي)</Label>
                <Input
                  id="budget-amount"
                  type="number"
                  min="10"
                  max={remainingBudget !== null ? remainingBudget / 100 : undefined}
                  step="1"
                  value={budgetAmount}
                  onChange={(e) => setBudgetAmount(e.target.value)}
                  placeholder="مثال: 100"
                  data-testid="input-budget-amount"
                />
                <p className="text-xs text-muted-foreground">
                  الحد الأدنى 10 ريال. سيتوقف الإعلان عند الوصول لهذا الحد يومياً.
                  {remainingBudget !== null && (
                    <span className="block mt-1 text-amber-600 dark:text-amber-400">
                      الحد الأقصى: {(remainingBudget / 100).toFixed(2)} ر.س (الميزانية المتبقية)
                    </span>
                  )}
                </p>
              </div>
            )}
          </div>
          
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setBudgetDialogOpen(false)}
              data-testid="button-cancel-budget"
            >
              إلغاء
            </Button>
            <Button
              onClick={handleSaveBudget}
              disabled={updateBudgetMutation.isPending}
              data-testid="button-save-budget"
            >
              {updateBudgetMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin ml-2" />
              ) : null}
              حفظ التغييرات
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <Dialog open={purchaseDialogOpen} onOpenChange={setPurchaseDialogOpen}>
        <DialogContent dir="rtl" className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              شراء المزيد من الظهور
            </DialogTitle>
            <DialogDescription>
              {purchaseAd?.title}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            {walletData?.data && (
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-full">
                    <Wallet className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">رصيدك الحالي</p>
                    <p className="text-xl font-bold">{walletData.data.balanceSAR} ر.س</p>
                  </div>
                </div>
              </div>
            )}
            
            <div className="space-y-3">
              <h4 className="font-medium">اختر الباقة المناسبة:</h4>
              {packagesLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                </div>
              ) : (
                <div className="grid gap-3">
                  {packagesData?.data?.map((pkg: any) => (
                    <div
                      key={pkg.id}
                      onClick={() => setSelectedPackageId(pkg.id)}
                      className={`border rounded-lg p-4 cursor-pointer transition-all ${
                        selectedPackageId === pkg.id
                          ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                          : pkg.isFeatured
                          ? "border-primary/30 bg-primary/5 hover-elevate"
                          : "hover-elevate"
                      }`}
                      data-testid={`package-${pkg.id}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{pkg.nameAr}</p>
                            {pkg.isFeatured && (
                              <Badge variant="default" className="text-xs">
                                <Star className="h-3 w-3 ml-1" />
                                الأفضل
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {(pkg.impressions + pkg.bonusImpressions).toLocaleString("en-US")} ظهور
                            {pkg.bonusImpressions > 0 && (
                              <span className="text-primary mr-1">
                                (+{pkg.bonusImpressions.toLocaleString("en-US")} مجاني)
                              </span>
                            )}
                          </p>
                        </div>
                        <Badge variant={pkg.isFeatured ? "default" : "secondary"} className="text-base">
                          {(pkg.priceHalalas / 100).toFixed(0)} ر.س
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="text-center text-sm text-muted-foreground">
              للتواصل حول خيارات الإعلان المخصصة، تواصل معنا على:
              <br />
              <a href="mailto:ads@sabq.org" className="text-primary hover:underline">ads@sabq.org</a>
            </div>
          </div>
          
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setPurchaseDialogOpen(false)}
              data-testid="button-close-purchase"
            >
              إلغاء
            </Button>
            <Button
              onClick={handlePurchasePackage}
              disabled={!selectedPackageId || purchasePackageMutation.isPending}
              data-testid="button-confirm-purchase"
            >
              {purchasePackageMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin ml-2" />
              )}
              المتابعة للدفع
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
