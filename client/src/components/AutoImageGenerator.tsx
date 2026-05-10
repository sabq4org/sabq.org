import { useState } from "react";
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
import { Loader2, Wand2, AlertCircle, Sparkles } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

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
  onImageGenerated
}: AutoImageGeneratorProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [autoGenerate, setAutoGenerate] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [settings, setSettings] = useState<any>(null);

  // Fetch settings on mount
  useState(() => {
    apiRequest<any>("/api/auto-image/settings")
      .then(data => setSettings(data))
      .catch(console.error);
  });

  const handleGenerateImage = async (forceGeneration = false) => {
    if (!articleId) {
      toast({
        title: language === "ar" ? "خطأ" : "Error",
        description: language === "ar" ? 
          "يجب حفظ المقال أولاً قبل توليد الصورة" : 
          "Article must be saved before generating image",
        variant: "destructive"
      });
      return;
    }

    setIsGenerating(true);
    
    try {
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
          forceGeneration
        })
      });

      if (response.success && response.imageUrl) {
        toast({
          title: language === "ar" ? "تم التوليد بنجاح" : "Generated Successfully",
          description: response.message || 
            (language === "ar" ? 
              "تم توليد الصورة بالذكاء الاصطناعي" : 
              "AI image generated successfully")
        });

        // Call callback with generated image
        if (onImageGenerated) {
          onImageGenerated(response.imageUrl, response.altText || "");
        }

        setShowConfirmDialog(false);
      } else {
        toast({
          title: language === "ar" ? "فشل التوليد" : "Generation Failed",
          description: response.error || response.message,
          variant: "destructive"
        });
      }
    } catch (error: any) {
      toast({
        title: language === "ar" ? "خطأ" : "Error",
        description: error.message || "Failed to generate image",
        variant: "destructive"
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
    
    // Check if enabled
    if (!settings.enabled) return false;
    
    // Check article type
    if (!settings.articleTypes.includes(articleType)) return false;
    
    // Check if category is skipped
    if (category && settings.skipCategories.includes(category)) return false;
    
    // Article must not have an image
    if (hasImage) return false;
    
    return true;
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wand2 className="h-4 w-4" />
            {language === "ar" ? "التوليد التلقائي للصور" : "Auto Image Generation"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Auto Generation Toggle */}
          {!hasImage && isAutoGenerationEligible() && (
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div>
                <Label htmlFor="auto-generate">
                  {language === "ar" ? 
                    "توليد صورة تلقائياً عند النشر" : 
                    "Auto-generate image on publish"}
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  {language === "ar" ? 
                    "سيتم توليد صورة بالذكاء الاصطناعي إذا لم يكن للمقال صورة" : 
                    "An AI image will be generated if article has no image"}
                </p>
              </div>
              <Switch
                id="auto-generate"
                checked={autoGenerate}
                onCheckedChange={setAutoGenerate}
              />
            </div>
          )}

          {/* Manual Generation Button */}
          <div className="flex flex-col gap-2">
            {hasImage && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>
                  {language === "ar" ? "المقال له صورة بالفعل" : "Article already has an image"}
                </AlertTitle>
                <AlertDescription>
                  {language === "ar" ? 
                    "يمكنك توليد صورة جديدة لاستبدال الصورة الحالية" : 
                    "You can generate a new image to replace the current one"}
                </AlertDescription>
              </Alert>
            )}

            <Button
              variant={hasImage ? "outline" : "default"}
              onClick={() => hasImage ? setShowConfirmDialog(true) : handleGenerateImage(false)}
              disabled={isGenerating || !title}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin ml-2" />
                  {language === "ar" ? "جاري التوليد..." : "Generating..."}
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 ml-2" />
                  {language === "ar" ? 
                    (hasImage ? "توليد صورة جديدة" : "توليد صورة بالذكاء الاصطناعي") : 
                    (hasImage ? "Generate New Image" : "Generate AI Image")}
                </>
              )}
            </Button>

            {/* AI Disclaimer */}
            <Alert className="mt-2">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>
                {language === "ar" ? "تنبيه مهم" : "Important Notice"}
              </AlertTitle>
              <AlertDescription>
                {language === "ar" ? 
                  `الصور المُولّدة بالذكاء الاصطناعي سيتم تعريفها تلقائياً بعبارة: "${getAiDisclaimer()}"` : 
                  `AI-generated images will be automatically labeled with: "${getAiDisclaimer()}"`}
              </AlertDescription>
            </Alert>
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