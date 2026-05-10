import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Link as LinkIcon, CheckCircle2, AlertCircle, Info } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface LinkResult {
  success: boolean;
  message: string;
  stats?: {
    total: number;
    success: number;
    errors: number;
  };
}

export default function StoriesAdmin() {
  const { toast } = useToast();
  const [result, setResult] = useState<LinkResult | null>(null);

  const linkArticlesMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("/api/admin/stories/link-existing", {
        method: "POST",
      }) as LinkResult;
    },
    onSuccess: (data) => {
      setResult(data);
      toast({
        title: "تمت العملية بنجاح",
        description: data.message,
      });
    },
    onError: (error: any) => {
      const errorMessage = error?.message || "حدث خطأ أثناء ربط المقالات";
      setResult({
        success: false,
        message: errorMessage,
      });
      toast({
        title: "فشلت العملية",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const handleLinkArticles = () => {
    if (confirm("هل أنت متأكد من ربط جميع المقالات المنشورة بقصص؟ قد تستغرق هذه العملية بضع دقائق.")) {
      setResult(null);
      linkArticlesMutation.mutate();
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">إدارة القصص</h1>
        <p className="text-muted-foreground">
          ربط المقالات بقصص تلقائياً باستخدام الذكاء الاصطناعي
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LinkIcon className="h-5 w-5" />
            ربط المقالات بالقصص
          </CardTitle>
          <CardDescription>
            هذه الأداة تقوم بتحليل جميع المقالات المنشورة وربطها تلقائياً بقصص مناسبة باستخدام الذكاء الاصطناعي
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              <strong>كيف تعمل؟</strong>
              <ul className="list-disc mr-6 mt-2 space-y-1">
                <li>تبحث عن قصص مشابهة لكل مقال باستخدام الذكاء الاصطناعي</li>
                <li>إذا وجدت قصة مطابقة بثقة عالية (&gt;75%)، تربط المقال بها</li>
                <li>إذا لم تجد قصة مطابقة، تنشئ قصة جديدة للمقال</li>
                <li>بعد الربط، سيظهر زر "متابعة القصة" في المقالات</li>
              </ul>
            </AlertDescription>
          </Alert>

          <Button
            onClick={handleLinkArticles}
            disabled={linkArticlesMutation.isPending}
            size="lg"
            className="w-full"
            data-testid="button-link-articles"
          >
            {linkArticlesMutation.isPending ? (
              <>
                <Loader2 className="ml-2 h-5 w-5 animate-spin" />
                جاري ربط المقالات...
              </>
            ) : (
              <>
                <LinkIcon className="ml-2 h-5 w-5" />
                ربط جميع المقالات المنشورة
              </>
            )}
          </Button>

          {result && (
            <Alert variant={result.success ? "default" : "destructive"}>
              {result.success ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              <AlertDescription>
                <div className="space-y-2">
                  <p className="font-semibold">{result.message}</p>
                  {result.stats && (
                    <div className="grid grid-cols-3 gap-4 mt-3">
                      <div className="text-center p-3 bg-muted rounded-md">
                        <div className="text-2xl font-bold">{result.stats.total}</div>
                        <div className="text-xs text-muted-foreground">إجمالي المقالات</div>
                      </div>
                      <div className="text-center p-3 bg-green-500/10 rounded-md">
                        <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                          {result.stats.success}
                        </div>
                        <div className="text-xs text-muted-foreground">تم ربطها بنجاح</div>
                      </div>
                      <div className="text-center p-3 bg-red-500/10 rounded-md">
                        <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                          {result.stats.errors}
                        </div>
                        <div className="text-xs text-muted-foreground">فشل الربط</div>
                      </div>
                    </div>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}

          <div className="pt-4 border-t">
            <h3 className="font-semibold mb-2">ملاحظات مهمة:</h3>
            <ul className="text-sm text-muted-foreground space-y-1 mr-6 list-disc">
              <li>هذه العملية قد تستغرق عدة دقائق حسب عدد المقالات</li>
              <li>سيتم استخدام OpenAI API لتحليل المقالات</li>
              <li>المقالات المرتبطة مسبقاً لن تتأثر</li>
              <li>يمكنك تشغيل هذه العملية في أي وقت لربط المقالات الجديدة</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
