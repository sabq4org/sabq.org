/**
 * Advanced Infographic Editor with Visual AI
 * Features: Real-time preview, template editing, regeneration, multiple exports
 */

import { useState, useCallback, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Loader2, 
  Sparkles, 
  Palette, 
  Layout, 
  Type, 
  Download, 
  RefreshCw,
  Layers,
  Eye,
  EyeOff,
  Wand2,
  ImageIcon,
  Settings,
  Share2,
  Copy,
  Check,
  X,
  Plus,
  Minus
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  infographicShapes,
  infographicStyles,
  combineInfographicPrompts,
} from "@/config/infographicTemplates";

interface AdvancedInfographicEditorProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: InfographicData) => void;
  initialData?: Partial<InfographicData>;
  articleId?: string;
  language?: "ar" | "en" | "ur";
}

interface InfographicData {
  imageUrl: string;
  thumbnailUrl?: string;
  template: string;
  style: string;
  content: string;
  elements: InfographicElement[];
  settings: InfographicSettings;
  metadata: {
    generationTime?: number;
    cost?: number;
    model?: string;
  };
}

interface InfographicElement {
  id: string;
  type: "text" | "shape" | "icon" | "chart" | "image";
  content: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  style: Record<string, any>;
  visible: boolean;
}

interface InfographicSettings {
  backgroundColor: string;
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string;
  fontSize: number;
  aspectRatio: "1:1" | "16:9" | "9:16" | "4:3";
  enableWatermark: boolean;
  enableBranding: boolean;
  exportFormat: "png" | "jpg" | "webp";
}

const DEFAULT_SETTINGS: InfographicSettings = {
  backgroundColor: "#FFFFFF",
  primaryColor: "#0066CC",
  secondaryColor: "#FF6B35",
  fontFamily: "Inter",
  fontSize: 16,
  aspectRatio: "16:9",
  enableWatermark: true,
  enableBranding: true,
  exportFormat: "png",
};

export function AdvancedInfographicEditor({
  open,
  onClose,
  onSave,
  initialData,
  articleId,
  language = "ar",
}: AdvancedInfographicEditorProps) {
  const [selectedShape, setSelectedShape] = useState(initialData?.template || "basic-info");
  const [selectedStyle, setSelectedStyle] = useState(initialData?.style || "minimal-flat");
  const [content, setContent] = useState(initialData?.content || "");
  const [elements, setElements] = useState<InfographicElement[]>(initialData?.elements || []);
  const [settings, setSettings] = useState<InfographicSettings>(
    initialData?.settings || DEFAULT_SETTINGS
  );
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [generatedImageUrl, setGeneratedImageUrl] = useState(initialData?.imageUrl || "");
  const [previewMode, setPreviewMode] = useState<"original" | "edited">("original");
  const [activeTab, setActiveTab] = useState("template");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [variations, setVariations] = useState<string[]>([]);
  
  const { toast } = useToast();

  // Add new element to canvas
  const addElement = useCallback(() => {
    const newElement: InfographicElement = {
      id: `element-${Date.now()}`,
      type: "text",
      content: language === "ar" ? "نص جديد" : language === "ur" ? "نیا متن" : "New Text",
      position: { x: 50, y: 50 },
      size: { width: 200, height: 50 },
      style: {
        color: settings.primaryColor,
        fontSize: settings.fontSize,
        fontFamily: settings.fontFamily,
      },
      visible: true,
    };
    setElements([...elements, newElement]);
  }, [elements, settings, language]);

  // Update element
  const updateElement = useCallback((id: string, updates: Partial<InfographicElement>) => {
    setElements(elements.map(el => el.id === id ? { ...el, ...updates } : el));
  }, [elements]);

  // Delete element
  const deleteElement = useCallback((id: string) => {
    setElements(elements.filter(el => el.id !== id));
  }, [elements]);

  // Toggle element visibility
  const toggleElementVisibility = useCallback((id: string) => {
    setElements(elements.map(el => 
      el.id === id ? { ...el, visible: !el.visible } : el
    ));
  }, [elements]);

  // Generate infographic
  const handleGenerate = async () => {
    if (!content.trim()) {
      toast({
        title: language === "ar" ? "محتوى مطلوب" : language === "ur" ? "مواد درکار" : "Content required",
        description: language === "ar" ? "الرجاء إدخال المحتوى للإنفوجرافيك" : 
                     language === "ur" ? "انفوگرافک کے لیے مواد داخل کریں" :
                     "Please enter content for the infographic",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    
    try {
      const combinedPrompt = combineInfographicPrompts(
        selectedShape,
        selectedStyle,
        content,
        language
      );

      // Add advanced settings to prompt
      const advancedPrompt = `${combinedPrompt}
Visual Settings:
- Background: ${settings.backgroundColor}
- Primary Color: ${settings.primaryColor}
- Secondary Color: ${settings.secondaryColor}
- Aspect Ratio: ${settings.aspectRatio}
- Font: ${settings.fontFamily}
${settings.enableWatermark ? "- Include subtle watermark" : ""}
${settings.enableBranding ? "- Include brand elements" : ""}

Additional Elements:
${elements.filter(el => el.visible).map(el => 
  `- ${el.type}: ${el.content} at position (${el.position.x}, ${el.position.y})`
).join('\n')}
`;

      const response = await apiRequest<{
        imageUrl: string;
        thumbnailUrl: string;
        message: string;
        generationTime: number;
        cost: number;
        model: string;
      }>("/api/nano-banana/generate", {
        method: "POST",
        body: JSON.stringify({
          prompt: advancedPrompt,
          aspectRatio: settings.aspectRatio,
          imageSize: "2K",
          numImages: 1,
          enableSearchGrounding: true,
          enableThinking: true,
        }),
      });

      setGeneratedImageUrl(response.imageUrl);
      
      toast({
        title: language === "ar" ? "تم التوليد بنجاح" : 
               language === "ur" ? "کامیابی سے تیار ہوا" :
               "Generated successfully",
        description: `${language === "ar" ? "الوقت:" : language === "ur" ? "وقت:" : "Time:"} ${response.generationTime}ms | ${
          language === "ar" ? "التكلفة:" : language === "ur" ? "لاگت:" : "Cost:"
        } $${response.cost}`,
      });
    } catch (error: any) {
      toast({
        title: language === "ar" ? "فشل التوليد" : 
               language === "ur" ? "جنریٹ کرنے میں ناکام" :
               "Generation failed",
        description: error.message || "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // Regenerate with variations
  const handleRegenerate = async () => {
    setIsRegenerating(true);
    
    try {
      // Generate 3 variations
      const promises = Array.from({ length: 3 }, async (_, index) => {
        const variationPrompt = combineInfographicPrompts(
          selectedShape,
          selectedStyle,
          content + ` (Variation ${index + 1})`,
          language
        );
        
        const response = await apiRequest<{ imageUrl: string }>(
          "/api/nano-banana/generate",
          {
            method: "POST",
            body: JSON.stringify({
              prompt: variationPrompt,
              aspectRatio: settings.aspectRatio,
              imageSize: "2K",
              numImages: 1,
            }),
          }
        );
        
        return response.imageUrl;
      });
      
      const results = await Promise.all(promises);
      setVariations(results);
      
      toast({
        title: language === "ar" ? "تم توليد 3 تصاميم" : 
               language === "ur" ? "3 ڈیزائن تیار ہوئے" :
               "Generated 3 variations",
      });
    } catch (error: any) {
      toast({
        title: language === "ar" ? "فشل إعادة التوليد" : 
               language === "ur" ? "دوبارہ تیار کرنے میں ناکام" :
               "Regeneration failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsRegenerating(false);
    }
  };

  // Export infographic
  const handleExport = async (format?: string) => {
    const exportFormat = format || settings.exportFormat;
    
    try {
      // For now, just download the current image
      const link = document.createElement("a");
      link.href = generatedImageUrl;
      link.download = `infographic-${Date.now()}.${exportFormat}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast({
        title: language === "ar" ? "تم التصدير" : 
               language === "ur" ? "برآمد ہوا" :
               "Exported successfully",
      });
    } catch (error) {
      toast({
        title: language === "ar" ? "فشل التصدير" : 
               language === "ur" ? "برآمد میں ناکام" :
               "Export failed",
        variant: "destructive",
      });
    }
  };

  // Save infographic
  const handleSave = () => {
    const data: InfographicData = {
      imageUrl: generatedImageUrl,
      template: selectedShape,
      style: selectedStyle,
      content,
      elements,
      settings,
      metadata: {
        generationTime: Date.now(),
        model: "nano-banana-pro",
      },
    };
    
    onSave(data);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-7xl h-[90vh] p-0">
        <div className="flex h-full">
          {/* Left Panel - Controls */}
          <div className="w-96 border-r p-6 overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {language === "ar" ? "محرر الإنفوجرافيك المتقدم" : 
                 language === "ur" ? "ایڈوانسڈ انفوگرافک ایڈیٹر" :
                 "Advanced Infographic Editor"}
              </DialogTitle>
              <DialogDescription>
                {language === "ar" ? "صمم إنفوجرافيك احترافي بقوة الذكاء الاصطناعي" :
                 language === "ur" ? "AI کی طاقت سے پروفیشنل انفوگرافک ڈیزائن کریں" :
                 "Design professional infographics with AI power"}
              </DialogDescription>
            </DialogHeader>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-6">
              <TabsList className="grid grid-cols-4">
                <TabsTrigger value="template">
                  <Layout className="h-4 w-4" />
                </TabsTrigger>
                <TabsTrigger value="content">
                  <Type className="h-4 w-4" />
                </TabsTrigger>
                <TabsTrigger value="style">
                  <Palette className="h-4 w-4" />
                </TabsTrigger>
                <TabsTrigger value="elements">
                  <Layers className="h-4 w-4" />
                </TabsTrigger>
              </TabsList>

              {/* Template Tab */}
              <TabsContent value="template" className="space-y-4">
                <div>
                  <Label>{language === "ar" ? "القالب" : language === "ur" ? "ٹیمپلیٹ" : "Template"}</Label>
                  <RadioGroup value={selectedShape} onValueChange={setSelectedShape}>
                    {Object.entries(infographicShapes).map(([key, shape]) => (
                      <div key={key} className="flex items-start space-x-2 rtl:space-x-reverse p-3 border rounded-lg mb-2">
                        <RadioGroupItem value={key} id={`shape-${key}`} />
                        <Label htmlFor={`shape-${key}`} className="flex-1 cursor-pointer">
                          <div className="font-medium">
                            {language === "ar" ? shape.name : 
                             language === "ur" ? shape.nameEn :
                             shape.nameEn}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {language === "ar" ? shape.description :
                             language === "ur" ? shape.descriptionEn :
                             shape.descriptionEn}
                          </div>
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>
              </TabsContent>

              {/* Content Tab */}
              <TabsContent value="content" className="space-y-4">
                <div>
                  <Label>{language === "ar" ? "المحتوى" : language === "ur" ? "مواد" : "Content"}</Label>
                  <Textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder={
                      language === "ar" ? "أدخل محتوى الإنفوجرافيك..." :
                      language === "ur" ? "انفوگرافک کا مواد داخل کریں..." :
                      "Enter infographic content..."
                    }
                    className="h-64"
                    dir={language === "ar" || language === "ur" ? "rtl" : "ltr"}
                  />
                </div>

                {articleId && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      // Auto-extract content from article
                      toast({
                        title: language === "ar" ? "استخراج المحتوى..." : 
                               language === "ur" ? "مواد نکال رہے ہیں..." :
                               "Extracting content...",
                      });
                    }}
                  >
                    <Wand2 className="mr-2 h-4 w-4" />
                    {language === "ar" ? "استخراج من المقال" :
                     language === "ur" ? "آرٹیکل سے نکالیں" :
                     "Extract from Article"}
                  </Button>
                )}
              </TabsContent>

              {/* Style Tab */}
              <TabsContent value="style" className="space-y-4">
                <div>
                  <Label>{language === "ar" ? "النمط البصري" : language === "ur" ? "بصری انداز" : "Visual Style"}</Label>
                  <RadioGroup value={selectedStyle} onValueChange={setSelectedStyle}>
                    {Object.entries(infographicStyles).map(([key, style]) => (
                      <div key={key} className="flex items-start space-x-2 rtl:space-x-reverse p-3 border rounded-lg mb-2">
                        <RadioGroupItem value={key} id={`style-${key}`} />
                        <Label htmlFor={`style-${key}`} className="flex-1 cursor-pointer">
                          <div className="font-medium">
                            {language === "ar" ? style.name : 
                             language === "ur" ? style.nameEn :
                             style.nameEn}
                          </div>
                          <div className="w-6 h-6 rounded-full mt-1" style={{ backgroundColor: style.color }} />
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>

                {/* Advanced Settings */}
                <div className="space-y-4">
                  <Button
                    variant="ghost"
                    className="w-full justify-between"
                    onClick={() => setShowAdvanced(!showAdvanced)}
                  >
                    <span>{language === "ar" ? "إعدادات متقدمة" : 
                           language === "ur" ? "ایڈوانسڈ سیٹنگز" :
                           "Advanced Settings"}</span>
                    <Settings className="h-4 w-4" />
                  </Button>

                  {showAdvanced && (
                    <div className="space-y-4 p-4 border rounded-lg">
                      {/* Colors */}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>{language === "ar" ? "اللون الأساسي" : "Primary Color"}</Label>
                          <Input
                            type="color"
                            value={settings.primaryColor}
                            onChange={(e) => setSettings({...settings, primaryColor: e.target.value})}
                          />
                        </div>
                        <div>
                          <Label>{language === "ar" ? "اللون الثانوي" : "Secondary Color"}</Label>
                          <Input
                            type="color"
                            value={settings.secondaryColor}
                            onChange={(e) => setSettings({...settings, secondaryColor: e.target.value})}
                          />
                        </div>
                      </div>

                      {/* Aspect Ratio */}
                      <div>
                        <Label>{language === "ar" ? "نسبة العرض" : "Aspect Ratio"}</Label>
                        <Select
                          value={settings.aspectRatio}
                          onValueChange={(value: any) => setSettings({...settings, aspectRatio: value})}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1:1">1:1 (Square)</SelectItem>
                            <SelectItem value="16:9">16:9 (Landscape)</SelectItem>
                            <SelectItem value="9:16">9:16 (Portrait)</SelectItem>
                            <SelectItem value="4:3">4:3 (Classic)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Font Size */}
                      <div>
                        <Label>{language === "ar" ? "حجم الخط" : "Font Size"}: {settings.fontSize}px</Label>
                        <Slider
                          value={[settings.fontSize]}
                          onValueChange={([value]) => setSettings({...settings, fontSize: value})}
                          min={12}
                          max={48}
                          step={2}
                        />
                      </div>

                      {/* Toggles */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>{language === "ar" ? "علامة مائية" : "Watermark"}</Label>
                          <Switch
                            checked={settings.enableWatermark}
                            onCheckedChange={(checked) => setSettings({...settings, enableWatermark: checked})}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <Label>{language === "ar" ? "عناصر العلامة التجارية" : "Branding"}</Label>
                          <Switch
                            checked={settings.enableBranding}
                            onCheckedChange={(checked) => setSettings({...settings, enableBranding: checked})}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* Elements Tab */}
              <TabsContent value="elements" className="space-y-4">
                <div className="flex justify-between items-center">
                  <Label>{language === "ar" ? "العناصر" : language === "ur" ? "عناصر" : "Elements"}</Label>
                  <Button size="sm" onClick={addElement}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>

                <ScrollArea className="h-64">
                  {elements.map((element) => (
                    <div key={element.id} className="flex items-center justify-between p-2 border rounded mb-2">
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => toggleElementVisibility(element.id)}
                        >
                          {element.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                        </Button>
                        <span className="text-sm">{element.content.substring(0, 20)}...</span>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteElement(element.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </ScrollArea>
              </TabsContent>
            </Tabs>

            {/* Action Buttons */}
            <div className="mt-6 space-y-2">
              <Button
                onClick={handleGenerate}
                disabled={isGenerating || !content.trim()}
                className="w-full"
                size="lg"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {language === "ar" ? "جاري التوليد..." :
                     language === "ur" ? "تیار ہو رہا ہے..." :
                     "Generating..."}
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    {language === "ar" ? "توليد الإنفوجرافيك" :
                     language === "ur" ? "انفوگرافک تیار کریں" :
                     "Generate Infographic"}
                  </>
                )}
              </Button>

              {generatedImageUrl && (
                <>
                  <Button
                    onClick={handleRegenerate}
                    disabled={isRegenerating}
                    variant="outline"
                    className="w-full"
                  >
                    {isRegenerating ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-2 h-4 w-4" />
                    )}
                    {language === "ar" ? "إعادة توليد (3 تصاميم)" :
                     language === "ur" ? "دوبارہ تیار کریں (3 ڈیزائن)" :
                     "Regenerate (3 variations)"}
                  </Button>

                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleExport()}
                      variant="secondary"
                      className="flex-1"
                    >
                      <Download className="mr-2 h-4 w-4" />
                      {language === "ar" ? "تصدير" : language === "ur" ? "برآمد" : "Export"}
                    </Button>
                    <Button
                      onClick={handleSave}
                      className="flex-1"
                    >
                      <Check className="mr-2 h-4 w-4" />
                      {language === "ar" ? "حفظ" : language === "ur" ? "محفوظ" : "Save"}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Right Panel - Preview */}
          <div className="flex-1 bg-muted/10 p-6">
            <div className="h-full flex flex-col">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">
                  {language === "ar" ? "المعاينة" : language === "ur" ? "پیش نظارہ" : "Preview"}
                </h3>
                
                {generatedImageUrl && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={previewMode === "original" ? "default" : "outline"}
                      onClick={() => setPreviewMode("original")}
                    >
                      {language === "ar" ? "الأصلي" : "Original"}
                    </Button>
                    <Button
                      size="sm"
                      variant={previewMode === "edited" ? "default" : "outline"}
                      onClick={() => setPreviewMode("edited")}
                    >
                      {language === "ar" ? "المحرر" : "Edited"}
                    </Button>
                  </div>
                )}
              </div>

              <div className="flex-1 border rounded-lg bg-background overflow-hidden">
                {generatedImageUrl ? (
                  <div className="h-full flex items-center justify-center p-4">
                    <img
                      src={generatedImageUrl}
                      alt="Generated Infographic"
                      className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
                    />
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                    <ImageIcon className="h-16 w-16 mb-4" />
                    <p className="text-lg">
                      {language === "ar" ? "لم يتم توليد إنفوجرافيك بعد" :
                       language === "ur" ? "ابھی انفوگرافک تیار نہیں ہوا" :
                       "No infographic generated yet"}
                    </p>
                    <p className="text-sm mt-2">
                      {language === "ar" ? "اختر قالباً وأدخل المحتوى للبدء" :
                       language === "ur" ? "شروع کرنے کے لیے ٹیمپلیٹ منتخب کریں اور مواد داخل کریں" :
                       "Select a template and enter content to get started"}
                    </p>
                  </div>
                )}
              </div>

              {/* Variations */}
              {variations.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium mb-2">
                    {language === "ar" ? "التصاميم البديلة" : 
                     language === "ur" ? "متبادل ڈیزائن" :
                     "Alternative Designs"}
                  </h4>
                  <div className="grid grid-cols-3 gap-2">
                    {variations.map((url, index) => (
                      <div
                        key={index}
                        className="border rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary"
                        onClick={() => setGeneratedImageUrl(url)}
                      >
                        <img
                          src={url}
                          alt={`Variation ${index + 1}`}
                          className="w-full h-24 object-cover"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}