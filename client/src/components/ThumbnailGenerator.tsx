import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ImageIcon, AlertCircle, Check, Sparkles, Crop, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface ThumbnailGeneratorProps {
  articleId?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  thumbnailManuallyDeleted?: boolean;
  articleTitle?: string;
  articleExcerpt?: string;
  onThumbnailGenerated?: (thumbnailUrl: string, manuallyDeleted?: boolean) => void;
  autoGenerate?: boolean;
}

type ThumbnailMethod = 'crop' | 'ai-smart';
type ThumbnailStyle = 'news' | 'professional' | 'vibrant' | 'minimal' | 'modern';

export function ThumbnailGenerator({
  articleId,
  imageUrl,
  thumbnailUrl,
  thumbnailManuallyDeleted = false,
  articleTitle,
  articleExcerpt,
  onThumbnailGenerated,
  autoGenerate = false // Default to false - generate only on user request
}: ThumbnailGeneratorProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentThumbnail, setCurrentThumbnail] = useState(
    thumbnailUrl ? `${thumbnailUrl}?t=${Date.now()}` : undefined
  );
  const [method, setMethod] = useState<ThumbnailMethod>('ai-smart');
  const [style, setStyle] = useState<ThumbnailStyle>('news');

  const generateThumbnail = async (selectedMethod?: ThumbnailMethod) => {
    if (!imageUrl) {
      toast({
        title: "لا توجد صورة",
        description: "يجب رفع صورة أولاً قبل توليد الصورة المصغرة",
        variant: "destructive"
      });
      return;
    }

    setIsGenerating(true);
    const useMethod = selectedMethod || method;

    try {
      const response = await apiRequest<{
        success: boolean;
        thumbnailUrl?: string;
        method?: string;
        message?: string;
      }>("/api/thumbnails/generate", {
        method: "POST",
        body: JSON.stringify({
          articleId,
          imageUrl,
          method: useMethod,
          style: useMethod === 'ai-smart' ? style : undefined,
          title: articleTitle,
          excerpt: articleExcerpt
        })
      });

      if (response.success && response.thumbnailUrl) {
        // Add timestamp to prevent caching
        const thumbnailWithTimestamp = `${response.thumbnailUrl}?t=${Date.now()}`;
        setCurrentThumbnail(thumbnailWithTimestamp);
        
        if (onThumbnailGenerated) {
          // Reset manually deleted flag since we generated a new thumbnail
          onThumbnailGenerated(response.thumbnailUrl, false);
        }

        const methodLabel = useMethod === 'ai-smart' ? 'بالذكاء الاصطناعي' : 'بالقص الذكي';
        toast({
          title: "تم توليد الصورة المصغرة",
          description: `تم إنشاء صورة الغلاف ${methodLabel} بنسبة 16:9 بنجاح`
        });
      } else {
        throw new Error(response.message || "فشل توليد الصورة المصغرة");
      }
    } catch (error: any) {
      toast({
        title: "خطأ",
        description: error.message || "فشل توليد الصورة المصغرة",
        variant: "destructive"
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // Sync currentThumbnail with thumbnailUrl prop changes
  useEffect(() => {
    if (thumbnailUrl && thumbnailUrl !== "") {
      setCurrentThumbnail(`${thumbnailUrl}?t=${Date.now()}`);
    } else if (thumbnailUrl === "") {
      setCurrentThumbnail(undefined);
    }
  }, [thumbnailUrl]);

  // NOTE: Auto-generation disabled - thumbnails are only generated on user request
  // The autoGenerate prop is kept for backwards compatibility but defaults to false

  if (!imageUrl) {
    return null;
  }

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <ImageIcon className="h-4 w-4" />
          صورة الغلاف المصغرة (16:9)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Thumbnail Preview */}
        {currentThumbnail ? (
          <div className="space-y-3">
            <div className="relative aspect-video w-full overflow-hidden rounded-lg border bg-muted">
              <img
                src={currentThumbnail}
                alt="صورة الغلاف المصغرة"
                className="h-full w-full object-cover"
                data-testid="thumbnail-preview"
              />
              <div className="absolute top-2 right-2 bg-black/70 text-white px-2 py-1 rounded text-xs flex items-center gap-1">
                {method === 'ai-smart' && <Sparkles className="h-3 w-3" />}
                16:9
              </div>
            </div>
            <Alert>
              <Check className="h-4 w-4" />
              <AlertDescription>
                تم توليد صورة الغلاف المصغرة وستظهر في قوائم الأخبار
              </AlertDescription>
            </Alert>
            
            {/* Delete Thumbnail Button */}
            <div className="flex justify-end">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  setCurrentThumbnail(undefined);
                  if (onThumbnailGenerated) {
                    // Mark thumbnail as manually deleted to prevent auto-generation
                    onThumbnailGenerated("", true);
                  }
                  toast({
                    title: "تم حذف صورة الغلاف",
                    description: "تم حذف صورة الغلاف المصغرة بنجاح",
                  });
                }}
                className="gap-2"
                data-testid="button-delete-thumbnail"
              >
                <X className="h-4 w-4" />
                حذف صورة الغلاف
              </Button>
            </div>
          </div>
        ) : (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              لا توجد صورة غلاف مصغرة. سيتم عرض الصورة الأصلية في القوائم.
            </AlertDescription>
          </Alert>
        )}

        {/* Generation Method Selection */}
        <div className="space-y-3 p-4 rounded-lg border bg-muted/30">
          <Label className="text-sm font-medium">طريقة توليد الصورة المصغرة</Label>
          
          <RadioGroup 
            value={method} 
            onValueChange={(value) => setMethod(value as ThumbnailMethod)}
            className="space-y-3"
          >
            <div className="flex items-start space-x-2 space-x-reverse">
              <RadioGroupItem value="ai-smart" id="ai-smart" data-testid="radio-ai-smart" />
              <div className="flex-1">
                <Label htmlFor="ai-smart" className="cursor-pointer flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="font-medium">AI Smart Thumbnail</span>
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  يعيد توليد الصورة بشكل احترافي باستخدام الذكاء الاصطناعي بنسبة 16:9
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-2 space-x-reverse">
              <RadioGroupItem value="crop" id="crop" data-testid="radio-crop" />
              <div className="flex-1">
                <Label htmlFor="crop" className="cursor-pointer flex items-center gap-2">
                  <Crop className="h-4 w-4" />
                  <span className="font-medium">Smart Crop</span>
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  يقص الصورة بذكاء مع الحفاظ على الأجزاء المهمة (سريع)
                </p>
              </div>
            </div>
          </RadioGroup>

          {/* AI Style Selection (only for AI Smart) */}
          {method === 'ai-smart' && (
            <div className="space-y-2 pt-2 border-t">
              <Label htmlFor="style" className="text-sm">نمط التوليد</Label>
              <Select value={style} onValueChange={(value) => setStyle(value as ThumbnailStyle)}>
                <SelectTrigger id="style" data-testid="select-style">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="news">أخبار احترافية (News)</SelectItem>
                  <SelectItem value="professional">احترافي (Professional)</SelectItem>
                  <SelectItem value="vibrant">حيوي وجذاب (Vibrant)</SelectItem>
                  <SelectItem value="minimal">بسيط ونظيف (Minimal)</SelectItem>
                  <SelectItem value="modern">عصري (Modern)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Generate Button */}
        <Button
          onClick={() => generateThumbnail()}
          disabled={isGenerating || !imageUrl}
          variant={currentThumbnail ? "outline" : "default"}
          className="w-full"
          data-testid="button-generate-thumbnail"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin ml-2" />
              {method === 'ai-smart' ? 'جاري التوليد بالذكاء الاصطناعي...' : 'جاري القص الذكي...'}
            </>
          ) : (
            <>
              {method === 'ai-smart' ? (
                <Sparkles className="h-4 w-4 ml-2" />
              ) : (
                <ImageIcon className="h-4 w-4 ml-2" />
              )}
              {currentThumbnail ? "إعادة توليد الصورة المصغرة" : "توليد صورة الغلاف (16:9)"}
            </>
          )}
        </Button>

        {/* Info Text */}
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground text-center">
            صورة الغلاف تظهر فقط في قوائم الأخبار بنسبة 16:9 محسّنة للعرض السريع
          </p>
          
          {method === 'ai-smart' && (
            <Alert className="bg-primary/10 border-primary/20">
              <Sparkles className="h-4 w-4 text-primary" />
              <AlertDescription className="text-xs">
                <strong>AI Smart Thumbnail:</strong> يستخدم Gemini AI لتحليل الصورة وإعادة إنشائها بشكل احترافي مناسب لبطاقات الأخبار
              </AlertDescription>
            </Alert>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
