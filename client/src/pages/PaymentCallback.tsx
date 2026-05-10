import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { CheckCircle, XCircle, Loader2, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface PurchaseData {
  id: string;
  articleId: string;
  status: string;
  priceHalalas: number;
  currency: string;
  chargeId: string | null;
  accessToken: string;
  createdAt: string;
  article: {
    id: string;
    title: string;
    slug: string;
    imageUrl: string | null;
  };
  priceSAR: string;
  statusArabic: string;
}

export default function PaymentCallback() {
  const [, navigate] = useLocation();
  const [redirectCountdown, setRedirectCountdown] = useState(5);
  
  const searchParams = new URLSearchParams(window.location.search);
  const purchaseId = searchParams.get("purchase_id");

  const { data, isLoading, isError, error } = useQuery<{ success: boolean; data: PurchaseData }>({
    queryKey: ["/api/payments/purchase", purchaseId],
    queryFn: async () => {
      const response = await fetch(`/api/payments/purchase/${purchaseId}`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("فشل في جلب تفاصيل الطلب");
      }
      return response.json();
    },
    enabled: !!purchaseId,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data?.data?.status === "pending") {
        return 2000;
      }
      return false;
    },
  });

  const purchase = data?.data;
  const isSuccess = purchase?.status === "completed";
  const isFailed = purchase?.status === "failed";
  const isPending = purchase?.status === "pending";

  useEffect(() => {
    if (isSuccess && purchase?.article?.slug) {
      const timer = setInterval(() => {
        setRedirectCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            const redirectUrl = `/article/${purchase.article.slug}?token=${purchase.accessToken}`;
            navigate(redirectUrl);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [isSuccess, purchase, navigate]);

  if (!purchaseId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" dir="rtl">
        <Card className="max-w-md w-full" data-testid="card-error">
          <CardContent className="p-8 text-center">
            <XCircle className="h-16 w-16 mx-auto text-destructive mb-4" />
            <h1 className="text-xl font-bold mb-2" data-testid="text-error-title">خطأ</h1>
            <p className="text-muted-foreground" data-testid="text-error-message">
              لم يتم العثور على معرف الطلب
            </p>
            <Button 
              className="mt-6 gap-2" 
              onClick={() => navigate("/")}
              data-testid="button-go-home"
            >
              <ArrowRight className="h-4 w-4" />
              العودة للرئيسية
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" dir="rtl">
        <Card className="max-w-md w-full" data-testid="card-loading">
          <CardContent className="p-8 text-center">
            <Loader2 className="h-16 w-16 mx-auto text-primary animate-spin mb-4" />
            <h1 className="text-xl font-bold mb-2" data-testid="text-loading-title">
              جاري التحقق من حالة الدفع...
            </h1>
            <p className="text-muted-foreground" data-testid="text-loading-message">
              يرجى الانتظار
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" dir="rtl">
        <Card className="max-w-md w-full" data-testid="card-fetch-error">
          <CardContent className="p-8 text-center">
            <XCircle className="h-16 w-16 mx-auto text-destructive mb-4" />
            <h1 className="text-xl font-bold mb-2" data-testid="text-fetch-error-title">
              خطأ في جلب البيانات
            </h1>
            <p className="text-muted-foreground" data-testid="text-fetch-error-message">
              {(error as Error)?.message || "حدث خطأ غير متوقع"}
            </p>
            <Button 
              className="mt-6 gap-2" 
              onClick={() => window.location.reload()}
              data-testid="button-retry"
            >
              إعادة المحاولة
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" dir="rtl">
        <Card className="max-w-md w-full" data-testid="card-pending">
          <CardContent className="p-8 text-center">
            <Loader2 className="h-16 w-16 mx-auto text-primary animate-spin mb-4" />
            <h1 className="text-xl font-bold mb-2" data-testid="text-pending-title">
              جاري معالجة الدفع...
            </h1>
            <p className="text-muted-foreground" data-testid="text-pending-message">
              يرجى الانتظار بينما نتحقق من حالة الدفع
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" dir="rtl">
        <Card className="max-w-md w-full border-green-500/50" data-testid="card-success">
          <CardHeader className="text-center pb-2">
            <CheckCircle className="h-16 w-16 mx-auto text-green-600 mb-4" />
            <CardTitle className="text-2xl text-green-700 dark:text-green-400" data-testid="text-success-title">
              تم الشراء بنجاح
            </CardTitle>
            <CardDescription className="text-base" data-testid="text-success-description">
              شكراً لك! تم إتمام عملية الشراء بنجاح
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            {purchase?.article && (
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground mb-1">المقال</p>
                <p className="font-medium" data-testid="text-article-title">
                  {purchase.article.title}
                </p>
              </div>
            )}
            
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground mb-1">المبلغ المدفوع</p>
              <p className="font-bold text-lg" data-testid="text-paid-amount">
                {purchase?.priceSAR} ر.س
              </p>
            </div>
            
            <p className="text-sm text-muted-foreground" data-testid="text-redirect-countdown">
              سيتم تحويلك للمقال خلال {redirectCountdown} ثواني...
            </p>
            
            <Button 
              className="w-full gap-2" 
              onClick={() => navigate(`/article/${purchase?.article?.slug}?token=${purchase?.accessToken}`)}
              data-testid="button-go-to-article"
            >
              <ArrowRight className="h-4 w-4" />
              الذهاب للمقال الآن
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isFailed) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" dir="rtl">
        <Card className="max-w-md w-full border-destructive/50" data-testid="card-failed">
          <CardHeader className="text-center pb-2">
            <XCircle className="h-16 w-16 mx-auto text-destructive mb-4" />
            <CardTitle className="text-2xl text-destructive" data-testid="text-failed-title">
              فشلت عملية الدفع
            </CardTitle>
            <CardDescription className="text-base" data-testid="text-failed-description">
              عذراً، لم تتم عملية الدفع بنجاح
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            {purchase?.article && (
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground mb-1">المقال</p>
                <p className="font-medium" data-testid="text-failed-article-title">
                  {purchase.article.title}
                </p>
              </div>
            )}
            
            <p className="text-sm text-muted-foreground">
              يمكنك المحاولة مرة أخرى أو التواصل مع الدعم الفني
            </p>
            
            <div className="flex flex-col gap-2">
              <Button 
                className="w-full gap-2" 
                onClick={() => purchase?.article?.slug && navigate(`/article/${purchase.article.slug}`)}
                data-testid="button-try-again"
              >
                المحاولة مرة أخرى
              </Button>
              <Button 
                variant="outline"
                className="w-full gap-2" 
                onClick={() => navigate("/")}
                data-testid="button-go-home-failed"
              >
                <ArrowRight className="h-4 w-4" />
                العودة للرئيسية
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" dir="rtl">
      <Card className="max-w-md w-full" data-testid="card-unknown">
        <CardContent className="p-8 text-center">
          <Loader2 className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h1 className="text-xl font-bold mb-2" data-testid="text-unknown-title">
            حالة غير معروفة
          </h1>
          <p className="text-muted-foreground" data-testid="text-unknown-status">
            حالة الطلب: {purchase?.statusArabic || purchase?.status}
          </p>
          <Button 
            className="mt-6 gap-2" 
            onClick={() => navigate("/")}
            data-testid="button-go-home-unknown"
          >
            <ArrowRight className="h-4 w-4" />
            العودة للرئيسية
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
