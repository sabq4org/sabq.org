import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle, XCircle, Clock, Wallet, ArrowLeft, Loader2 } from "lucide-react";
import sabqLogo from "@assets/sabq-logo.png";

export default function AdvertiserPaymentCallback() {
  const [, navigate] = useLocation();
  const [transactionId, setTransactionId] = useState<string | null>(null);
  
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const txId = params.get("transaction_id");
    if (txId) {
      setTransactionId(txId);
    }
  }, []);
  
  const { data: verifyData, isLoading: verifyLoading, error: verifyError } = useQuery({
    queryKey: ["/api/advertiser-payments/verify", transactionId],
    queryFn: async () => {
      const res = await fetch(`/api/advertiser-payments/verify/${transactionId}`);
      if (!res.ok) throw new Error("فشل في التحقق من المعاملة");
      return res.json();
    },
    enabled: !!transactionId,
    refetchInterval: (query) => {
      const queryData = query.state.data as { data?: { isSuccess?: boolean; isFailed?: boolean } } | undefined;
      if (!queryData?.data) return 3000;
      if (queryData.data.isSuccess || queryData.data.isFailed) return false;
      return 3000;
    },
  });
  
  const { data: transactionData, isLoading: transactionLoading } = useQuery({
    queryKey: ["/api/advertiser-payments/transaction", transactionId],
    queryFn: async () => {
      const res = await fetch(`/api/advertiser-payments/transaction/${transactionId}`);
      if (!res.ok) throw new Error("فشل في جلب تفاصيل المعاملة");
      return res.json();
    },
    enabled: !!transactionId,
  });
  
  const { data: walletData } = useQuery<{ data?: { balanceSAR: string } }>({
    queryKey: ["/api/advertiser-payments/wallet"],
    enabled: verifyData?.data?.isSuccess,
  });
  
  const isLoading = verifyLoading || transactionLoading;
  const isSuccess = verifyData?.data?.isSuccess;
  const isFailed = verifyData?.data?.isFailed;
  const isPending = !isSuccess && !isFailed && !verifyLoading;
  
  const getStatusInfo = () => {
    if (isSuccess) {
      return {
        icon: <CheckCircle className="h-16 w-16 text-green-500" />,
        title: "تم الدفع بنجاح",
        description: "تمت إضافة الرصيد إلى محفظتك الإعلانية",
        badgeVariant: "default" as const,
        badgeText: "مكتمل",
      };
    }
    if (isFailed) {
      return {
        icon: <XCircle className="h-16 w-16 text-red-500" />,
        title: "فشل الدفع",
        description: "لم يتم إتمام عملية الدفع. يرجى المحاولة مرة أخرى.",
        badgeVariant: "destructive" as const,
        badgeText: "فشل",
      };
    }
    return {
      icon: <Clock className="h-16 w-16 text-amber-500 animate-pulse" />,
      title: "جاري معالجة الدفع",
      description: "يرجى الانتظار بينما نتحقق من عملية الدفع...",
      badgeVariant: "secondary" as const,
      badgeText: "قيد المعالجة",
    };
  };
  
  const statusInfo = getStatusInfo();
  
  if (!transactionId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background" dir="rtl">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8">
            <XCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">خطأ</h2>
            <p className="text-muted-foreground mb-6">لم يتم العثور على معرف المعاملة</p>
            <Button asChild>
              <Link href="/advertise/dashboard">
                <ArrowLeft className="h-4 w-4 ml-2" />
                العودة للوحة التحكم
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <header className="border-b bg-card/50 backdrop-blur sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <img src={sabqLogo} alt="سبق" className="h-8" />
          <Badge variant="outline">بوابة المعلنين</Badge>
        </div>
      </header>
      
      <main className="max-w-xl mx-auto px-4 py-12">
        <Card>
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              {isLoading ? (
                <Loader2 className="h-16 w-16 animate-spin text-primary" />
              ) : (
                statusInfo.icon
              )}
            </div>
            <CardTitle className="text-2xl">
              {isLoading ? "جاري التحميل..." : statusInfo.title}
            </CardTitle>
            <CardDescription className="text-base">
              {isLoading ? "يرجى الانتظار..." : statusInfo.description}
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-6">
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : (
              <>
                <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">حالة المعاملة</span>
                    <Badge variant={statusInfo.badgeVariant}>{statusInfo.badgeText}</Badge>
                  </div>
                  {transactionData?.data && (
                    <>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">المبلغ</span>
                        <span className="font-bold">{transactionData.data.amountSAR} ر.س</span>
                      </div>
                      {transactionData.data.package && (
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">الباقة</span>
                          <span className="font-medium">{transactionData.data.package.nameAr}</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
                
                {isSuccess && walletData?.data && (
                  <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-green-100 dark:bg-green-900 rounded-full">
                        <Wallet className="h-5 w-5 text-green-600 dark:text-green-400" />
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">رصيدك الجديد</p>
                        <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                          {walletData.data.balanceSAR} ر.س
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                
                {isPending && !isLoading && (
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>جاري التحقق التلقائي...</span>
                  </div>
                )}
                
                <div className="flex flex-col gap-3 pt-4">
                  <Button asChild data-testid="button-return-dashboard">
                    <Link href="/advertise/dashboard">
                      <ArrowLeft className="h-4 w-4 ml-2" />
                      العودة للوحة التحكم
                    </Link>
                  </Button>
                  
                  {isFailed && (
                    <Button
                      variant="outline"
                      onClick={() => navigate("/advertise/dashboard")}
                      data-testid="button-try-again"
                    >
                      المحاولة مرة أخرى
                    </Button>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
