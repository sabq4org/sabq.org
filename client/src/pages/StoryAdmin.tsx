import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Sparkles, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

export default function StoryAdmin() {
  const [result, setResult] = useState<any>(null);

  const linkMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("/api/admin/stories/link-existing", { method: "POST" });
      return res;
    },
    onSuccess: (data) => {
      setResult(data);
    },
    onError: (error: any) => {
      setResult({ error: error.message || "حدث خطأ" });
    },
  });

  const handleLinkArticles = () => {
    setResult(null);
    linkMutation.mutate();
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="text-3xl font-bold">إدارة نظام تتبع القصص</h1>
          <p className="text-muted-foreground mt-2">
            ربط المقالات الموجودة بنظام القصص باستخدام الذكاء الاصطناعي
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              ربط المقالات بالقصص
            </CardTitle>
            <CardDescription>
              سيقوم النظام بتحليل جميع المقالات المنشورة وربطها بقصص مناسبة باستخدام الذكاء الاصطناعي
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-muted rounded-lg">
              <h3 className="font-semibold mb-2">كيف يعمل النظام؟</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>• يحلل النظام محتوى كل مقال باستخدام الذكاء الاصطناعي</li>
                <li>• يبحث عن قصص مشابهة موجودة بالفعل</li>
                <li>• إذا وجد تطابق (ثقة ≥ 75%)، يربط المقال بالقصة</li>
                <li>• إذا لم يجد تطابق، ينشئ قصة جديدة</li>
              </ul>
            </div>

            <Button
              onClick={handleLinkArticles}
              disabled={linkMutation.isPending}
              className="w-full"
              data-testid="button-link-articles"
            >
              {linkMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                  جاري الربط...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 ml-2" />
                  ربط جميع المقالات بالقصص
                </>
              )}
            </Button>

            {result && (
              <Alert variant={result.error ? "destructive" : "default"}>
                {result.error ? (
                  <XCircle className="w-4 h-4" />
                ) : (
                  <CheckCircle className="w-4 h-4" />
                )}
                <AlertDescription>
                  {result.error ? (
                    <span>{result.error}</span>
                  ) : (
                    <div className="space-y-2">
                      <p className="font-semibold">{result.message}</p>
                      {result.stats && (
                        <div className="text-sm space-y-1">
                          <p>• إجمالي المقالات: {result.stats.total}</p>
                          <p className="text-green-600">• تم الربط بنجاح: {result.stats.success}</p>
                          {result.stats.errors > 0 && (
                            <p className="text-red-600">• أخطاء: {result.stats.errors}</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>ملاحظات مهمة</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              ⚠️ <strong>تحذير:</strong> هذه العملية قد تستغرق عدة دقائق حسب عدد المقالات
            </p>
            <p>
              💡 <strong>معلومة:</strong> المقالات الجديدة تُربط تلقائياً عند النشر، لا حاجة لهذه الأداة
            </p>
            <p>
              🔄 <strong>مهم:</strong> يمكنك تشغيل هذه الأداة عدة مرات، النظام يتجنب التكرار
            </p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
