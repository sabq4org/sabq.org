import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Sparkles, Palette, Layout, Check, ImageIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  infographicShapes,
  infographicStyles,
  combineInfographicPrompts,
} from "@/config/infographicTemplates";
import type { InfographicShape, InfographicStyle } from "@/config/infographicTemplates";

interface InfographicGeneratorDialogProps {
  open: boolean;
  onClose: () => void;
  onImageGenerated: (imageUrl: string, altText: string) => void;
  initialContent?: string;
  language?: 'ar' | 'en' | 'ur';
}

export function InfographicGeneratorDialog({
  open,
  onClose,
  onImageGenerated,
  initialContent = "",
  language = 'ar',
}: InfographicGeneratorDialogProps) {
  const [selectedShape, setSelectedShape] = useState<string>('basic-info');
  const [selectedStyle, setSelectedStyle] = useState<string>('minimal-flat');
  const [content, setContent] = useState(initialContent);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string>("");
  const [activeTab, setActiveTab] = useState("shape");
  const { toast } = useToast();

  const handleGenerate = async () => {
    if (!content.trim()) {
      toast({
        title: language === 'ar' ? "محتوى مطلوب" : language === 'ur' ? "مواد درکار" : "Content required",
        description: language === 'ar' ? "الرجاء إدخال المحتوى للإنفوجرافيك" : 
                     language === 'ur' ? "انفوگرافک کے لیے مواد داخل کریں" :
                     "Please enter content for the infographic",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    setGeneratedImageUrl("");

    try {
      const combinedPrompt = combineInfographicPrompts(
        selectedShape,
        selectedStyle,
        content,
        language
      );

      const response = await apiRequest<{ imageUrl: string; message: string; generationTime: number; cost: number }>(
        "/api/nano-banana/generate",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: combinedPrompt,
            altText: `${getShapeName(selectedShape)} - ${getStyleName(selectedStyle)}`,
          }),
        }
      );

      if (response.imageUrl) {
        setGeneratedImageUrl(response.imageUrl);
        toast({
          title: language === 'ar' ? "تم توليد الإنفوجرافيك!" : 
                 language === 'ur' ? "انفوگرافک تیار ہوا!" :
                 "Infographic Generated!",
          description: language === 'ar' ? 
            `تم التوليد في ${response.generationTime?.toFixed(1) || 0} ثانية` :
            language === 'ur' ?
            `${response.generationTime?.toFixed(1) || 0} سیکنڈ میں تیار ہوا` :
            `Generated in ${response.generationTime?.toFixed(1) || 0} seconds`,
        });
      }
    } catch (error: any) {
      console.error("Error generating infographic:", error);
      toast({
        title: language === 'ar' ? "خطأ في التوليد" : 
               language === 'ur' ? "تیاری میں خرابی" :
               "Generation Error",
        description: error.message || (language === 'ar' ? "فشل في توليد الإنفوجرافيك" : 
                                       language === 'ur' ? "انفوگرافک بنانے میں ناکامی" :
                                       "Failed to generate infographic"),
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleUseImage = () => {
    if (generatedImageUrl) {
      const altText = `${getShapeName(selectedShape)} - ${getStyleName(selectedStyle)}`;
      onImageGenerated(generatedImageUrl, altText);
      onClose();
      // Reset state
      setGeneratedImageUrl("");
      setContent("");
    }
  };

  const getShapeName = (shapeId: string): string => {
    const shape = infographicShapes[shapeId];
    return shape ? (language === 'ar' ? shape.name : shape.nameEn) : '';
  };

  const getStyleName = (styleId: string): string => {
    const style = infographicStyles[styleId];
    return style ? (language === 'ar' ? style.name : style.nameEn) : '';
  };

  const getShapeDescription = (shapeId: string): string => {
    const shape = infographicShapes[shapeId];
    return shape ? (language === 'ar' ? shape.description : shape.descriptionEn) : '';
  };

  const getStyleDescription = (styleId: string): string => {
    const style = infographicStyles[styleId];
    return style ? (language === 'ar' ? style.description : style.descriptionEn) : '';
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {language === 'ar' ? 'مولد الإنفوجرافيك الاحترافي' : 
             language === 'ur' ? 'پروفیشنل انفوگرافک جنریٹر' :
             'Professional Infographic Generator'}
          </DialogTitle>
          <DialogDescription>
            {language === 'ar' ? 'اختر شكل ونوع التصميم ثم أدخل المحتوى' : 
             language === 'ur' ? 'ڈیزائن کی شکل اور قسم منتخب کریں، پھر مواد داخل کریں' :
             'Select design shape and style, then enter content'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Settings */}
          <div className="space-y-6">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="shape" className="gap-2">
                  <Layout className="h-4 w-4" />
                  {language === 'ar' ? 'شكل التصميم' : 
                   language === 'ur' ? 'ڈیزائن شکل' :
                   'Design Shape'}
                </TabsTrigger>
                <TabsTrigger value="style" className="gap-2">
                  <Palette className="h-4 w-4" />
                  {language === 'ar' ? 'نوع التصميم' : 
                   language === 'ur' ? 'ڈیزائن قسم' :
                   'Design Style'}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="shape" className="mt-4">
                <ScrollArea className="h-[300px] pr-4">
                  <RadioGroup value={selectedShape} onValueChange={setSelectedShape}>
                    <div className="space-y-3">
                      {Object.values(infographicShapes).map((shape) => (
                        <Card
                          key={shape.id}
                          className={`cursor-pointer transition-all ${
                            selectedShape === shape.id ? 'ring-2 ring-primary' : ''
                          }`}
                          onClick={() => setSelectedShape(shape.id)}
                        >
                          <CardHeader className="pb-3">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <CardTitle className="text-sm font-medium">
                                  {language === 'ar' ? shape.name : shape.nameEn}
                                </CardTitle>
                                <CardDescription className="text-xs mt-1">
                                  {language === 'ar' ? shape.description : shape.descriptionEn}
                                </CardDescription>
                              </div>
                              <RadioGroupItem value={shape.id} />
                            </div>
                          </CardHeader>
                        </Card>
                      ))}
                    </div>
                  </RadioGroup>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="style" className="mt-4">
                <ScrollArea className="h-[300px] pr-4">
                  <RadioGroup value={selectedStyle} onValueChange={setSelectedStyle}>
                    <div className="space-y-3">
                      {Object.values(infographicStyles).map((style) => (
                        <Card
                          key={style.id}
                          className={`cursor-pointer transition-all ${
                            selectedStyle === style.id ? 'ring-2 ring-primary' : ''
                          }`}
                          onClick={() => setSelectedStyle(style.id)}
                        >
                          <CardHeader className="pb-3">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <CardTitle className="text-sm font-medium">
                                  {language === 'ar' ? style.name : style.nameEn}
                                </CardTitle>
                                <CardDescription className="text-xs mt-1">
                                  {language === 'ar' ? style.description : style.descriptionEn}
                                </CardDescription>
                              </div>
                              <RadioGroupItem value={style.id} />
                            </div>
                          </CardHeader>
                        </Card>
                      ))}
                    </div>
                  </RadioGroup>
                </ScrollArea>
              </TabsContent>
            </Tabs>

            {/* Content Input */}
            <div className="space-y-2">
              <Label htmlFor="content">
                {language === 'ar' ? 'محتوى الإنفوجرافيك' : 
                 language === 'ur' ? 'انفوگرافک مواد' :
                 'Infographic Content'}
              </Label>
              <Textarea
                id="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={
                  language === 'ar' ? 'أدخل المحتوى النصي للإنفوجرافيك هنا...' : 
                  language === 'ur' ? 'یہاں انفوگرافک کا متن داخل کریں...' :
                  'Enter infographic text content here...'
                }
                className="h-32"
                disabled={isGenerating}
              />
            </div>
          </div>

          {/* Right Column - Preview */}
          <div className="space-y-4">
            {/* Selected Options Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">
                  {language === 'ar' ? 'الخيارات المحددة' : 
                   language === 'ur' ? 'منتخب شدہ اختیارات' :
                   'Selected Options'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2">
                  <Layout className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">
                    {getShapeName(selectedShape)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Palette className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">
                    {getStyleName(selectedStyle)}
                  </span>
                </div>
                {content && (
                  <div className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-green-500 mt-0.5" />
                    <span className="text-sm text-muted-foreground">
                      {language === 'ar' ? 'المحتوى جاهز' : 
                       language === 'ur' ? 'مواد تیار ہے' :
                       'Content ready'}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Generated Image Preview */}
            {generatedImageUrl && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">
                    {language === 'ar' ? 'معاينة الإنفوجرافيك' : 
                     language === 'ur' ? 'انفوگرافک پیش نظارہ' :
                     'Infographic Preview'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="relative aspect-[9/16] w-full overflow-hidden rounded-lg border">
                    <img
                      src={generatedImageUrl}
                      alt="Generated Infographic"
                      className="h-full w-full object-contain"
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2">
              {!generatedImageUrl ? (
                <Button
                  onClick={handleGenerate}
                  disabled={isGenerating || !content.trim()}
                  className="flex-1"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {language === 'ar' ? 'جاري التوليد...' : 
                       language === 'ur' ? 'تیار کیا جا رہا ہے...' :
                       'Generating...'}
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      {language === 'ar' ? 'توليد الإنفوجرافيك' : 
                       language === 'ur' ? 'انفوگرافک تیار کریں' :
                       'Generate Infographic'}
                    </>
                  )}
                </Button>
              ) : (
                <>
                  <Button
                    onClick={handleUseImage}
                    className="flex-1"
                    variant="default"
                  >
                    <ImageIcon className="mr-2 h-4 w-4" />
                    {language === 'ar' ? 'استخدام هذا التصميم' : 
                     language === 'ur' ? 'یہ ڈیزائن استعمال کریں' :
                     'Use This Design'}
                  </Button>
                  <Button
                    onClick={handleGenerate}
                    disabled={isGenerating || !content.trim()}
                    variant="outline"
                  >
                    {isGenerating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}