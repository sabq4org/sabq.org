import type { ReactNode } from "react";
import { Crop, ImagePlus, LayoutGrid, Loader2, Sparkles, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface InfographicFrontImageCardProps {
  bannerUrl: string;
  isAiGenerated: boolean;
  isUploading: boolean;
  isGenerating: boolean;
  canGenerate: boolean;
  /** يوجد إنفوجرافيك كامل يمكن الاقتطاع منه */
  hasInfographic: boolean;
  title: string;
  /** شريط تقدم الرفع (من المحرر) */
  progress?: ReactNode;
  onUploadClick: () => void;
  onCropClick: () => void;
  onGenerateClick: () => void;
  onDelete: () => void;
}

/**
 * «صورة الواجهة» للإنفوجرافيك: صورة عرضية 16:9 تظهر في الرئيسية والبطاقات
 * والتطبيق وعند المشاركة، بينما يظهر الإنفوجرافيك الكامل داخل المادة.
 * تُحفظ في `infographicBannerUrl` كما كانت.
 */
export function InfographicFrontImageCard({
  bannerUrl,
  isAiGenerated,
  isUploading,
  isGenerating,
  canGenerate,
  hasInfographic,
  title,
  progress,
  onUploadClick,
  onCropClick,
  onGenerateClick,
  onDelete,
}: InfographicFrontImageCardProps) {
  const busy = isUploading || isGenerating;
  const displayTitle = title.trim() || "عنوان الإنفوجرافيك";

  return (
    <Card data-testid="card-infographic-front-image">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <LayoutGrid className="h-4 w-4 text-primary" />
            <span>
              <span className="text-primary">2</span> · صورة الواجهة
            </span>
          </CardTitle>
          <span
            className={
              bannerUrl
                ? "inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700"
                : "inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700"
            }
          >
            {bannerUrl ? (isAiGenerated ? "مرفقة · AI" : "مرفقة") : "ناقصة"}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          عرضية 16:9 · تظهر في الرئيسية والبطاقات والتطبيق وعند المشاركة
        </p>
      </CardHeader>
      <CardContent className="space-y-3.5">
        {bannerUrl ? (
          <div className="relative aspect-video w-full overflow-hidden rounded-xl border bg-muted/20">
            <img
              src={bannerUrl}
              alt="صورة واجهة الإنفوجرافيك"
              className="h-full w-full object-cover"
              data-testid="img-infographic-banner-preview"
            />
            {isAiGenerated && (
              <Badge variant="secondary" className="absolute right-2 top-2 text-xs">
                <Sparkles className="ml-1 h-3 w-3" />
                مُولّدة بالذكاء الاصطناعي
              </Badge>
            )}
          </div>
        ) : (
          <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/80 bg-muted/20 p-4 text-center text-xs leading-6 text-muted-foreground">
            <ImagePlus className="h-6 w-6 text-primary" />
            <p>
              ارفع صورة عرضية صممها فريق الجرافيك.
              <br />
              بدونها تعرض البطاقات جزءًا مقصوصًا من الإنفوجرافيك.
            </p>
          </div>
        )}

        {progress}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={onUploadClick}
            disabled={busy}
            className="no-min-touch-size h-9 gap-2 rounded-full px-4 text-sm"
            data-testid="button-upload-infographic-banner"
          >
            {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            {bannerUrl ? "تغيير الصورة" : "رفع صورة مصممة"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onCropClick}
            disabled={busy || !hasInfographic}
            title={hasInfographic ? undefined : "ارفع الإنفوجرافيك الكامل أولًا"}
            className="no-min-touch-size h-9 gap-2 rounded-full px-4 text-sm"
            data-testid="button-crop-infographic-banner"
          >
            <Crop className="h-4 w-4" />
            اقتطاع من الإنفوجرافيك
          </Button>
          {canGenerate && (
            <Button
              type="button"
              variant="outline"
              onClick={onGenerateClick}
              disabled={busy || !title.trim()}
              title={!title.trim() ? "اكتب العنوان أولًا" : undefined}
              className="no-min-touch-size h-9 gap-2 rounded-full px-4 text-sm"
              data-testid="button-ai-generate-infographic-banner"
            >
              {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              توليد بالذكاء الاصطناعي
            </Button>
          )}
          {bannerUrl && (
            <Button
              type="button"
              variant="ghost"
              onClick={onDelete}
              disabled={busy}
              className="no-min-touch-size h-9 gap-1.5 rounded-full px-3 text-sm text-destructive hover:bg-destructive/10"
              data-testid="button-delete-infographic-banner"
            >
              <X className="h-4 w-4" />
              حذف
            </Button>
          )}
        </div>

        {bannerUrl && (
          <div className="space-y-2.5 border-t border-border/60 pt-3.5" data-testid="infographic-reader-preview">
            <p className="text-xs font-semibold text-muted-foreground">كيف يراها القارئ</p>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
              <div className="overflow-hidden rounded-xl border bg-background">
                <div className="aspect-video w-full overflow-hidden">
                  <img src={bannerUrl} alt="" aria-hidden="true" className="h-full w-full object-cover" />
                </div>
                <div className="space-y-1 p-2.5">
                  <span className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                    إنفوجرافيك
                  </span>
                  <p className="line-clamp-2 text-xs font-bold leading-5">{displayTitle}</p>
                </div>
                <p className="px-2.5 pb-2 text-[10px] text-muted-foreground">بطاقة الرئيسية</p>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2.5 rounded-xl border bg-background p-2">
                  <div className="aspect-video w-24 shrink-0 overflow-hidden rounded-lg">
                    <img src={bannerUrl} alt="" aria-hidden="true" className="h-full w-full object-cover" />
                  </div>
                  <p className="line-clamp-2 text-xs font-semibold leading-5">{displayTitle}</p>
                </div>
                <p className="text-[10px] text-muted-foreground">سطر في القوائم</p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
