import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ImagePlus, Layers, LayoutGrid, Loader2, Wand2, AlertCircle, Sparkles } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ImageStyleSelector } from "@/components/ImageStyleSelector";
import { LEGACY_STYLE_SLUG_MAP, type EditorImageStyle } from "@shared/imageStyles";

interface AutoImageGeneratorProps {
  articleId?: string;
  title: string;
  content?: string;
  excerpt?: string;
  category?: string;
  language?: "ar" | "en" | "ur";
  articleType?: string;
  hasImage?: boolean;
  onImageGenerated?: (imageUrl: string, altText: string) => void;
  onOpenGptDialog?: () => void;
  onOpenCustomAiDialog?: () => void;
  onOpenInfographicDialog?: () => void;
  onOpenStoryCardsDialog?: () => void;
  canUseInfographics?: boolean;
}

export function AutoImageGenerator({
  articleId,
  title,
  content,
  excerpt,
  category,
  language = "ar",
  articleType = "news",
  hasImage = false,
  onImageGenerated,
  onOpenGptDialog,
  onOpenCustomAiDialog,
  onOpenInfographicDialog,
  onOpenStoryCardsDialog,
  canUseInfographics = false,
}: AutoImageGeneratorProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [autoGenerate, setAutoGenerate] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [selectedStyleSlug, setSelectedStyleSlug] = useState<string | null>(null);
  const [settings, setSettings] = useState<any>(null);
  const [stylesDataRaw, setStylesDataRaw] = useState<{
    styles: EditorImageStyle[];
    defaultSlug: string;
  } | null>(null);

  // جلب مؤجل بعد الـcommit عمدًا (لا useQuery): اشتراكات query أثناء طور الـmount
  // في هذه الصفحة تُبكّر effect المحرر قبل اكتمال تهيئة TipTap v3 فينهار getHTML
  useEffect(() => {
    let cancelled = false;
    apiRequest<any>("/api/auto-image/settings")
      .then((data) => { if (!cancelled) setSettings(data); })
      .catch(console.error);
    apiRequest<{ styles: EditorImageStyle[]; defaultSlug: string }>("/api/image-styles")
      .then((data) => { if (!cancelled) setStylesDataRaw(data); })
      .catch(console.error);
    return () => { cancelled = true; };
  }, []);

  const availableStyles = Array.isArray(stylesDataRaw?.styles) ? stylesDataRaw.styles : [];

  // الافتراضي المعروض: نمط الإعدادات حسب نوع المقال (بترجمة القيم القديمة)، وإلا افتراضي السجلّ
  const settingsStyle =
    articleType === "opinion" || articleType === "column"
      ? settings?.articleStyle
      : settings?.newsStyle;
  const mappedSettingsStyle = settingsStyle
    ? LEGACY_STYLE_SLUG_MAP[settingsStyle] ?? settingsStyle
    : undefined;
  const effectiveStyleSlug =
    selectedStyleSlug ??
    (availableStyles.some((s) => s.slug === mappedSettingsStyle)
      ? mappedSettingsStyle!
      : stylesDataRaw?.defaultSlug ?? null);

  const handleGenerateImage = async (forceGeneration = false) => {
    if (!title.trim()) {
      toast({
        title: language === "ar" ? "تنبيه" : "Notice",
        description:
          language === "ar"
            ? "يرجى كتابة عنوان الخبر أولاً لتوليد صورة مناسبة له"
            : "Please enter an article title first",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);

    try {
      // إذا لم يُحفظ المقال بعد (مسودة جديدة بدون articleId)، نولّد مباشرة عبر مسار Nano Banana بالنمط المختار
      if (!articleId) {
        const promptSeed = `صورة صحفية تعبيرية للخبر: ${title.trim()}${
          excerpt?.trim() ? `\n${excerpt.trim().slice(0, 220)}` : ""
        }`;
        const directRes = await apiRequest<{
          imageUrl?: string;
          error?: string;
          message?: string;
        }>("/api/nano-banana/generate", {
          method: "POST",
          body: JSON.stringify({
            prompt: promptSeed,
            imageSize: "2K",
            aspectRatio: "16:9",
            enableThinking: true,
            enableSearchGrounding: false,
            intent: effectiveStyleSlug === "infographic" ? "infographic" : "photo",
            ...(effectiveStyleSlug ? { styleSlug: effectiveStyleSlug, category } : {}),
          }),
        });

        if (directRes?.imageUrl) {
          toast({
            title: language === "ar" ? "تم التوليد بنجاح" : "Generated Successfully",
            description:
              language === "ar"
                ? "تم توليد الصورة بالذكاء الاصطناعي وتعيينها كصورة بارزة"
                : "AI image generated successfully",
          });
          onImageGenerated?.(directRes.imageUrl, title.trim());
          setShowConfirmDialog(false);
        } else {
          toast({
            title: language === "ar" ? "فشل التوليد" : "Generation Failed",
            description: directRes?.error || directRes?.message || "تعذر توليد الصورة",
            variant: "destructive",
          });
        }
        return;
      }

      const response = await apiRequest<{
        success: boolean;
        imageUrl?: string;
        altText?: string;
        message?: string;
        error?: string;
      }>("/api/auto-image/generate", {
        method: "POST",
        body: JSON.stringify({
          articleId,
          title,
          content,
          excerpt,
          category,
          language,
          articleType,
          forceGeneration,
          // نمط هذه التوليدة (من بطاقات الاختيار) — لا يغيّر إعدادات النظام
          styleSlug: effectiveStyleSlug || undefined,
        }),
      });

      if (response.success && response.imageUrl) {
        toast({
          title: language === "ar" ? "تم التوليد بنجاح" : "Generated Successfully",
          description:
            response.message ||
            (language === "ar"
              ? "تم توليد الصورة بالذكاء الاصطناعي"
              : "AI image generated successfully"),
        });

        if (onImageGenerated) {
          onImageGenerated(response.imageUrl, response.altText || "");
        }

        setShowConfirmDialog(false);
      } else {
        toast({
          title: language === "ar" ? "فشل التوليد" : "Generation Failed",
          description: response.error || response.message,
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: language === "ar" ? "تعذّر توليد الصورة" : "Image generation failed",
        description: error.message || "Failed to generate image",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const getAiDisclaimer = () => {
    if (language === "ar") {
      return "صورة تم إنشاؤها بواسطة الذكاء الاصطناعي";
    } else if (language === "ur") {
      return "مصنوعی ذہانت سے تیار کردہ تصویر";
    }
    return "AI-Generated Image";
  };

  const isAutoGenerationEligible = () => {
    if (!settings) return false;
    if (!settings.enabled) return false;
    if (!settings.articleTypes.includes(articleType)) return false;
    if (category && settings.skipCategories.includes(category)) return false;
    if (hasImage) return false;
    return true;
  };

  return (
    <>
      <Card className="border-primary/20 bg-gradient-to-b from-primary/[0.03] to-transparent shadow-sm" data-testid="ai-image-studio-block">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-sm sm:text-base flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Wand2 className="h-4 w-4" />
              </span>
              <span>
                {language === "ar" ? "توليد الصور بالذكاء الاصطناعي" : "AI Image Generation"}
              </span>
            </CardTitle>
            <span className="text-[11px] text-muted-foreground">
              اختر نمطاً للتوليد الفوري من العنوان أو افتح أداة متخصصة
            </span>
          </div>

          {/* شريط أدوات التوليد الذكي الموحد — صور GPT + استوديو مخصص + إنفوجرافيك + قصص مصورة في مكان واحد */}
          {language === "ar" && (onOpenGptDialog || onOpenCustomAiDialog || onOpenInfographicDialog || onOpenStoryCardsDialog) && (
            <div className="pt-2.5 grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
              {onOpenGptDialog && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onOpenGptDialog}
                  className="no-min-touch-size h-9 gap-1.5 px-3 text-xs font-bold border-sky-300 bg-sky-50/90 text-sky-900 hover:bg-sky-100 hover:border-sky-400 shadow-xs dark:border-sky-800 dark:bg-sky-950/70 dark:text-sky-100"
                  data-testid="button-generate-openai-image"
                >
                  <ImagePlus className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
                  صور GPT
                </Button>
              )}
              {onOpenCustomAiDialog && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onOpenCustomAiDialog}
                  className="no-min-touch-size h-9 gap-1.5 px-3 text-xs font-bold border-violet-300 bg-violet-50/90 text-violet-900 hover:bg-violet-100 hover:border-violet-400 shadow-xs dark:border-violet-800 dark:bg-violet-950/70 dark:text-violet-100"
                  data-testid="button-generate-ai-image"
                >
                  <Sparkles className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
                  توليد بوصف مخصص
                </Button>
              )}
              {canUseInfographics && onOpenInfographicDialog && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onOpenInfographicDialog}
                  className="no-min-touch-size h-9 gap-1.5 px-3 text-xs font-bold border-emerald-300 bg-emerald-50/90 text-emerald-900 hover:bg-emerald-100 hover:border-emerald-400 shadow-xs dark:border-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-100"
                  data-testid="button-generate-infographic"
                >
                  <LayoutGrid className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  إنفوجرافيك
                </Button>
              )}
              {onOpenStoryCardsDialog && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onOpenStoryCardsDialog}
                  className="no-min-touch-size h-9 gap-1.5 px-3 text-xs font-bold border-amber-300 bg-amber-50/90 text-amber-900 hover:bg-amber-100 hover:border-amber-400 shadow-xs dark:border-amber-800 dark:bg-amber-950/70 dark:text-amber-100"
                  data-testid="button-generate-story-cards"
                >
                  <Layers className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                  قصص مصورة
                </Button>
              )}
            </div>
          )}
        </CardHeader>

        <CardContent className="space-y-3.5 pt-0">
          {/* Auto Generation Toggle */}
          {!hasImage && isAutoGenerationEligible() && (
            <div className="flex items-center justify-between p-2.5 bg-muted/50 rounded-lg border border-border/60">
              <div>
                <Label htmlFor="auto-generate" className="text-xs font-semibold cursor-pointer">
                  {language === "ar"
                    ? "توليد صورة تلقائياً عند النشر"
                    : "Auto-generate image on publish"}
                </Label>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {language === "ar"
                    ? "سيتم توليد صورة بالذكاء الاصطناعي إذا لم يكن للمقال صورة"
                    : "An AI image will be generated if article has no image"}
                </p>
              </div>
              <Switch
                id="auto-generate"
                checked={autoGenerate}
                onCheckedChange={setAutoGenerate}
              />
            </div>
          )}

          {/* اختيار نمط هذه التوليدة — الافتراضي من إعدادات النظام حسب نوع المقال */}
          {language === "ar" && availableStyles.length > 0 && effectiveStyleSlug && (
            <ImageStyleSelector
              styles={availableStyles}
              selectedSlug={effectiveStyleSlug}
              onSelect={setSelectedStyleSlug}
              category={category}
              disabled={isGenerating}
            />
          )}

          {/* Manual Generation Button + GPT Quick Action */}
          <div className="flex flex-col gap-2">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <Button
                type="button"
                variant={hasImage ? "outline" : "default"}
                onClick={() => (hasImage ? setShowConfirmDialog(true) : handleGenerateImage(false))}
                disabled={isGenerating || !title.trim()}
                className="flex-1 gap-2"
                data-testid="button-auto-generate-by-style"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {language === "ar" ? "جاري التوليد..." : "Generating..."}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    {language === "ar"
                      ? hasImage
                        ? "توليد صورة جديدة بالنمط المختار"
                        : "توليد فوري بالنمط المختار"
                      : hasImage
                        ? "Generate New Image"
                        : "Generate AI Image"}
                  </>
                )}
              </Button>
            </div>

            {!title.trim() && language === "ar" && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                اكتب عنوان الخبر أولاً لتفعيل التوليد الفوري بالنمط المختار، أو استخدم «صور GPT» / «توليد بوصف مخصص».
              </p>
            )}

            <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span>
                {language === "ar"
                  ? `تُوسم الصور المولّدة تلقائياً بعبارة: «${getAiDisclaimer()}»`
                  : `AI-generated images are automatically labeled: "${getAiDisclaimer()}"`}
              </span>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Confirmation Dialog for replacing existing image */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {language === "ar" ? "استبدال الصورة الحالية؟" : "Replace Current Image?"}
            </DialogTitle>
            <DialogDescription>
              {language === "ar" ? 
                "سيتم استبدال الصورة الحالية بصورة جديدة مُولّدة بالذكاء الاصطناعي. هذا الإجراء لا يمكن التراجع عنه." : 
                "The current image will be replaced with a new AI-generated image. This action cannot be undone."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowConfirmDialog(false)}
            >
              {language === "ar" ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              variant="destructive"
              onClick={() => handleGenerateImage(true)}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin ml-2" />
                  {language === "ar" ? "جاري الاستبدال..." : "Replacing..."}
                </>
              ) : (
                language === "ar" ? "استبدال الصورة" : "Replace Image"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}