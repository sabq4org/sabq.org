import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Globe, Loader2, RefreshCw, ExternalLink, Share2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface SeoPreviewProps {
  title?: string;
  description?: string;
  slug?: string;
  englishSlug?: string;
  imageUrl?: string;
  /** When false, hide the social-refresh action (e.g. drafts). Default true if slug exists. */
  canRefreshSocial?: boolean;
}

type RefreshResult = {
  success?: boolean;
  configured?: boolean;
  message?: string;
  results?: Array<{
    url: string;
    success: boolean;
    image?: string | null;
    error?: string;
    debuggerUrls?: { facebook?: string; linkedin?: string };
  }>;
  tips?: { whatsapp?: string; twitter?: string };
};

export function SeoPreview({
  title,
  description,
  slug,
  englishSlug,
  imageUrl,
  canRefreshSocial = true,
}: SeoPreviewProps) {
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://sabq.org";
  const shareSlug = englishSlug || slug;
  const fullUrl = shareSlug ? `${baseUrl}/article/${shareSlug}` : `${baseUrl}/article/...`;
  const { toast } = useToast();
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<RefreshResult | null>(null);

  const handleRefreshSocial = async () => {
    if (!shareSlug) return;
    setRefreshing(true);
    try {
      const data = await apiRequest<RefreshResult>("/api/admin/refresh-social-preview", {
        method: "POST",
        body: JSON.stringify({ slug: shareSlug }),
      });
      setLastRefresh(data);
      toast({
        title: data.success ? "تم تحديث معاينة المشاركة" : "يلزم تحديث يدوي",
        description: data.message,
        variant: data.success ? "default" : "destructive",
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "تعذر الاتصال بالخادم";
      toast({
        title: "فشل التحديث",
        description: message,
        variant: "destructive",
      });
    } finally {
      setRefreshing(false);
    }
  };

  const fbDebugger =
    lastRefresh?.results?.[0]?.debuggerUrls?.facebook ||
    (shareSlug
      ? `https://developers.facebook.com/tools/debug/?q=${encodeURIComponent(fullUrl)}`
      : null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Globe className="h-4 w-4" />
          معاينة في محركات البحث والمشاركة
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Badge variant="outline" className="text-xs">
          Google Search Preview
        </Badge>

        <div className="space-y-1 p-4 bg-muted/30 rounded-lg border">
          <h3 className="text-[#1a0dab] dark:text-[#8ab4f8] text-xl font-normal hover:underline cursor-pointer line-clamp-1">
            {title || "عنوان المقال"}
          </h3>
          <div className="flex items-center gap-1 text-sm">
            <span className="text-[#006621] dark:text-[#94d194]">{fullUrl}</span>
          </div>
          <p className="text-[#545454] dark:text-[#bdc1c6] text-sm line-clamp-2">
            {description ||
              "وصف المقال سيظهر هنا. هذا النص هو مثال على كيفية ظهور الوصف في نتائج البحث."}
          </p>
        </div>

        <div className="text-xs text-muted-foreground space-y-1">
          <p>
            <span className="font-semibold">العنوان:</span> {title?.length || 0}/70 حرف
            {title && title.length > 70 && (
              <span className="text-destructive mr-1">- طويل جداً!</span>
            )}
          </p>
          <p>
            <span className="font-semibold">الوصف:</span> {description?.length || 0}/160 حرف
            {description && description.length > 160 && (
              <span className="text-destructive mr-1">- طويل جداً!</span>
            )}
          </p>
        </div>

        <div className="space-y-3 pt-2 border-t">
          <div className="flex items-center gap-2">
            <Share2 className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-medium">بطاقة واتساب / فيسبوك / تويتر</p>
          </div>

          <div className="rounded-lg border overflow-hidden bg-background flex flex-row-reverse max-w-md">
            <div className="w-28 h-28 shrink-0 bg-muted">
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt=""
                  className="w-full h-full object-cover"
                  data-testid="img-social-preview-thumb"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground p-2 text-center">
                  بدون صورة — سيظهر شعار سبق
                </div>
              )}
            </div>
            <div className="flex-1 p-3 min-w-0 text-right space-y-1">
              <p className="text-sm font-medium line-clamp-2">{title || "عنوان الخبر"}</p>
              <p className="text-[11px] text-muted-foreground">sabq.org</p>
            </div>
          </div>

          {canRefreshSocial && shareSlug && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                إذا نُشر الخبر أولاً بدون صورة ثم أُضيفت لاحقاً، تحتفظ واتساب وفيسبوك بالشعار
                القديم حتى نطلب إعادة الزحف.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={handleRefreshSocial}
                  disabled={refreshing}
                  data-testid="button-refresh-social-preview"
                >
                  {refreshing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin ml-2" />
                      جاري التحديث...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 ml-2" />
                      تحديث معاينة واتساب/فيسبوك
                    </>
                  )}
                </Button>
                {fbDebugger && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => window.open(fbDebugger, "_blank", "noopener,noreferrer")}
                    data-testid="button-facebook-debugger"
                  >
                    <ExternalLink className="h-4 w-4 ml-2" />
                    Facebook Debugger
                  </Button>
                )}
              </div>
              {lastRefresh?.tips?.whatsapp && (
                <p className="text-xs text-muted-foreground">{lastRefresh.tips.whatsapp}</p>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
