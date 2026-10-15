import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { Sparkles, Image, FileText, ChartBar, Loader2, Download, AlertCircle, Cpu } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ImageStyleSelector } from "@/components/ImageStyleSelector";
import {
  suggestOptimalModel,
  KNOWN_IMAGE_MODELS,
  type EditorImageStyle,
  type ImageTaskIntent,
} from "@shared/imageStyles";

interface AIImageGeneratorDialogProps {
  open: boolean;
  onClose: () => void;
  onImageGenerated: (imageUrl: string, alt?: string) => void;
  initialPrompt?: string;
  /** Label for the confirm action (default "إدراج في المقال"). */
  insertLabel?: string;
  /**
   * سياق الخبر الحالي (اختياري): يحسّن الوصف المبدئي ويغذّي مطابقة
   * التوجيه السياقي للنمط (مثل الواقعية الغذائية/الطبية) عبر التصنيف.
   */
  articleContext?: {
    title?: string;
    excerpt?: string;
    /** slug التصنيف أو اسمه */
    category?: string;
  };
}

/** التبويبات التي ينطبق عليها نظام الأنماط (القوالب الأخرى تحمل توجيهها الكامل) */
const STYLE_ENABLED_TABS = ["custom", "featured"];

// Color style options for news graphics - Sabq branding, minimal and elegant
const colorStyles = {
  red: {
    name: "أحمر - عاجل",
    color: "bg-red-500",
    prompt: "تدرج لوني أحمر هادئ وأنيق، تصميم بسيط ونظيف بدون زخارف، خلفية متدرجة من الأحمر الداكن للأسود، أسلوب مينيمالستي عصري",
  },
  blue: {
    name: "أزرق - خاص",
    color: "bg-blue-500",
    prompt: "تدرج لوني أزرق هادئ واحترافي، تصميم نظيف وبسيط، خلفية متدرجة من الأزرق الداكن، أسلوب مينيمالستي أنيق بدون زخارف",
  },
  gold: {
    name: "ذهبي - حصري",
    color: "bg-yellow-500",
    prompt: "تدرج لوني ذهبي ناعم وراقي، تصميم بسيط وأنيق، خلفية متدرجة من الذهبي الداكن للأسود، أسلوب مينيمالستي فاخر بدون زخارف",
  },
  green: {
    name: "أخضر - اقتصاد",
    color: "bg-green-500",
    prompt: "تدرج لوني أخضر هادئ ومهني، تصميم نظيف وبسيط، خلفية متدرجة من الأخضر الداكن، أسلوب مينيمالستي احترافي بدون زخارف",
  },
};

// Pre-built templates for common news graphics - Sabq style, minimal and professional
const templates = {
  infographic: {
    name: "انفوجرافيك إحصائي",
    icon: ChartBar,
    prompt: "انفوجرافيك بسيط ونظيف يعرض {data}، تصميم مينيمالستي، خلفية بيضاء أو رمادية فاتحة، أيقونات بسيطة، بدون زخارف أو نصوص إضافية، نمط flat design عصري",
    fields: ["data"],
    hasColorOption: false,
  },
  featured: {
    name: "صورة بارزة",
    icon: Image,
    prompt: "صورة صحفية احترافية عالية الجودة تُظهر {subject}، إضاءة طبيعية ناعمة، تكوين متوازن، صورة واقعية بدون نصوص أو شعارات، بدقة عالية",
    fields: ["subject"],
    hasColorOption: false,
  },
  breaking: {
    name: "خبر مميز",
    icon: AlertCircle,
    prompt: "خلفية هادئة وأنيقة، {colorStyle}، تصميم مينيمالستي بسيط بدون نصوص أو كلمات أو شعارات، فقط تدرجات لونية ناعمة، مناسبة لوضع النص فوقها لاحقاً",
    fields: ["headline"],
    hasColorOption: true,
  },
  comparison: {
    name: "مقارنة",
    icon: FileText,
    prompt: "انفوجرافيك مقارنة بسيط بين {item1} و {item2}، تصميم نظيف وهادئ، أيقونات بسيطة، ألوان متناسقة وهادئة، بدون زخارف أو تفاصيل زائدة",
    fields: ["item1", "item2"],
    hasColorOption: false,
  },
};

export function AIImageGeneratorDialog({
  open,
  onClose,
  onImageGenerated,
  initialPrompt = "",
  insertLabel = "إدراج في المقال",
  articleContext,
}: AIImageGeneratorDialogProps) {
  const [activeTab, setActiveTab] = useState("custom");
  const [prompt, setPrompt] = useState(initialPrompt);
  const [templateFields, setTemplateFields] = useState<Record<string, string>>({});
  const [selectedColorStyle, setSelectedColorStyle] = useState<keyof typeof colorStyles>("red");
  const [selectedStyleSlug, setSelectedStyleSlug] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [dataPoints, setDataPoints] = useState<string[]>(["", "", ""]);
  const [imageSize, setImageSize] = useState("2K");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [enableThinking, setEnableThinking] = useState(true);
  const [enableSearchGrounding, setEnableSearchGrounding] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<{url: string; alt?: string} | null>(null);
  const { toast } = useToast();

  // أنماط التوليد من السجلّ المركزي (تُدار من لوحة التحكم)
  const { data: stylesDataRaw } = useQuery<{ styles: EditorImageStyle[]; defaultSlug: string }>({
    queryKey: ["/api/image-styles"],
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });
  const availableStyles = Array.isArray(stylesDataRaw?.styles) ? stylesDataRaw.styles : [];
  // فشل الجلب أو لا أنماط → التوليد يستمر بدون styleSlug (سلوك الخادم الافتراضي)
  const effectiveStyleSlug = selectedStyleSlug ?? stylesDataRaw?.defaultSlug ?? null;

  // تحديد نية التوليد البصري واقتراح النموذج الأمثل
  const detectedIntent: ImageTaskIntent =
    activeTab === "infographic" || effectiveStyleSlug === "infographic"
      ? "infographic"
      : activeTab === "breaking"
      ? "breaking_banner"
      : activeTab === "comparison"
      ? "infographic"
      : "photo";

  const suggestedModelInfo = suggestOptimalModel(
    detectedIntent,
    effectiveStyleSlug,
    articleContext?.category
  );

  // عند فتح الحوار: لو الوصف فارغ نزرعه من initialPrompt أو من سياق الخبر
  useEffect(() => {
    if (!open || prompt.trim()) return;
    const contextPrompt = articleContext?.title
      ? `مشهد تعبيري للخبر: ${articleContext.title}${
          articleContext.excerpt ? `\n${articleContext.excerpt.slice(0, 200)}` : ""
        }`
      : "";
    const seed = initialPrompt || contextPrompt;
    if (seed) setPrompt(seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const generateMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("/api/nano-banana/generate", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: (data) => {
      if (data.imageUrl) {
        setGeneratedImage({
          url: data.imageUrl,
          alt: prompt || "صورة مولدة بالذكاء الاصطناعي"
        });
        toast({
          title: "تم توليد الصورة بنجاح",
          description: "يمكنك الآن إدراج الصورة في المقال",
        });
      } else {
        toast({
          title: "خطأ في التوليد",
          description: data.error || data.message || "فشل توليد الصورة",
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "خطأ في التوليد",
        description: error.message || "حدث خطأ أثناء توليد الصورة",
        variant: "destructive",
      });
    },
  });

  const handleGenerate = () => {
    let finalPrompt = prompt;
    let overlayText: string | undefined = undefined;
    let overlayOptions: any = undefined;

    // هل نظام الأنماط فعّال لهذا التبويب؟ (البرومبت النهائي يُركَّب في الخادم)
    const styleActive =
      STYLE_ENABLED_TABS.includes(activeTab) && !!effectiveStyleSlug && availableStyles.length > 0;

    // If using template, build prompt from template
    if (activeTab !== "custom") {
      const template = templates[activeTab as keyof typeof templates];
      if (template) {
        if (activeTab === "featured" && styleActive) {
          finalPrompt = templateFields.subject
            ? `صورة بارزة لمقال إخباري عن: ${templateFields.subject}`
            : "";
        } else {
          finalPrompt = template.prompt;
          template.fields.forEach((field) => {
            finalPrompt = finalPrompt.replace(`{${field}}`, templateFields[field] || "");
          });
        }
        // Replace color style placeholder if template has color option
        if (template.hasColorOption) {
          const colorStyle = colorStyles[selectedColorStyle];
          finalPrompt = finalPrompt.replace("{colorStyle}", colorStyle.prompt);

          // For "breaking" template, add text overlay with the headline
          if (activeTab === "breaking" && templateFields.headline) {
            overlayText = templateFields.headline;
            overlayOptions = {
              fontSize: 72,
              fontColor: "#FFFFFF",
              backgroundColor: "rgba(0, 0, 0, 0.6)",
              position: "center"
            };
          }
        }
      }
    }

    if (!finalPrompt.trim()) {
      toast({
        title: "خطأ",
        description: "يرجى إدخال وصف للصورة المطلوبة",
        variant: "destructive",
      });
      return;
    }

    const validDataPoints = dataPoints.filter((dp) => dp.trim().length > 0);

    const payload = {
      prompt: finalPrompt,
      imageSize,
      aspectRatio,
      enableThinking,
      enableSearchGrounding,
      overlayText,
      overlayOptions,
      intent: detectedIntent,
      model: selectedModel.trim() || undefined,
      dataPoints: validDataPoints.length > 0 ? validDataPoints : undefined,
      // النمط + تصنيف الخبر (للتوجيه السياقي) — الخادم يتكفل بالتركيب والحسم
      ...(styleActive
        ? { styleSlug: effectiveStyleSlug, category: articleContext?.category }
        : {}),
    };
    generateMutation.mutate(payload);
  };

  const handleInsertImage = () => {
    if (generatedImage) {
      onImageGenerated(generatedImage.url, generatedImage.alt);
      handleClose();
    }
  };

  const handleClose = () => {
    setPrompt("");
    setTemplateFields({});
    setGeneratedImage(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            مولد الصور الذكي - Nano Banana Pro
          </DialogTitle>
          <DialogDescription>
            قم بتوليد صور احترافية وانفوجرافيك لمقالك باستخدام الذكاء الاصطناعي
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!generatedImage ? (
            <>
              {/* شريط محرك التوجيه الذكي للنماذج */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/15 text-xs">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-primary shrink-0" />
                  <div>
                    <div className="font-semibold text-foreground flex items-center gap-1.5">
                      <span>محرك التوجيه الذكي للنماذج</span>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {selectedModel ? "تحديد يدوي" : "آلي تلقائي"}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground text-[11px] mt-0.5">
                      {selectedModel
                        ? `النموذج المختار يدوياً: ${KNOWN_IMAGE_MODELS.find((m) => m.id === selectedModel)?.label || selectedModel}`
                        : suggestedModelInfo.reasonAr}
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className="text-[11px] font-mono shrink-0 bg-background">
                  {selectedModel || suggestedModelInfo.model}
                </Badge>
              </div>

              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid grid-cols-5 w-full">
                  <TabsTrigger value="custom">مخصص</TabsTrigger>
                  {Object.entries(templates).map(([key, template]) => (
                    <TabsTrigger key={key} value={key}>
                      <template.icon className="w-4 h-4 ml-1" />
                      {template.name}
                    </TabsTrigger>
                  ))}
                </TabsList>

                <TabsContent value="custom" className="space-y-4">
                  <ImageStyleSelector
                    styles={availableStyles}
                    selectedSlug={effectiveStyleSlug || ""}
                    onSelect={setSelectedStyleSlug}
                    category={articleContext?.category}
                    disabled={generateMutation.isPending}
                  />
                  <div>
                    <Label htmlFor="prompt">وصف الصورة</Label>
                    <Textarea
                      id="prompt"
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="صف الصورة التي تريد توليدها بالتفصيل..."
                      className="mt-2 min-h-[120px]"
                      dir="rtl"
                    />
                  </div>
                </TabsContent>

                {Object.entries(templates).map(([key, template]) => (
                  <TabsContent key={key} value={key} className="space-y-4">
                    <Alert>
                      <template.icon className="h-4 w-4" />
                      <AlertDescription>
                        قالب {template.name} - املأ الحقول المطلوبة
                      </AlertDescription>
                    </Alert>

                    {key === "featured" && (
                      <ImageStyleSelector
                        styles={availableStyles}
                        selectedSlug={effectiveStyleSlug || ""}
                        onSelect={setSelectedStyleSlug}
                        category={articleContext?.category}
                        disabled={generateMutation.isPending}
                      />
                    )}

                    {/* Color Style Selector for templates that support it */}
                    {template.hasColorOption && (
                      <div className="space-y-3">
                        <Label>نمط اللون</Label>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {Object.entries(colorStyles).map(([colorKey, colorStyle]) => (
                            <button
                              key={colorKey}
                              type="button"
                              onClick={() => setSelectedColorStyle(colorKey as keyof typeof colorStyles)}
                              className={`flex items-center gap-2 p-3 rounded-lg border-2 transition-all ${
                                selectedColorStyle === colorKey
                                  ? "border-primary ring-2 ring-primary/20"
                                  : "border-muted hover:border-muted-foreground/30"
                              }`}
                              data-testid={`color-style-${colorKey}`}
                            >
                              <div className={`w-4 h-4 rounded-full ${colorStyle.color}`} />
                              <span className="text-sm font-medium">{colorStyle.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {template.fields.map((field) => (
                      <div key={field}>
                        <Label htmlFor={field}>
                          {field === "data" && "موضوع الإنفوجرافيك والبيانات"}
                          {field === "subject" && "موضوع الصورة"}
                          {field === "headline" && "العنوان"}
                          {field === "item1" && "العنصر الأول"}
                          {field === "item2" && "العنصر الثاني"}
                        </Label>
                        <Input
                          id={field}
                          value={templateFields[field] || ""}
                          onChange={(e) =>
                            setTemplateFields({ ...templateFields, [field]: e.target.value })
                          }
                          className="mt-2"
                          dir="rtl"
                          placeholder={
                            field === "headline"
                              ? "أدخل العنوان الذي سيظهر في الصورة..."
                              : field === "data"
                              ? "مثال: تطور الاقتصاد السعودي وصادرات الطاقة النظيفة لعام 2026..."
                              : undefined
                          }
                        />
                      </div>
                    ))}

                    {key === "infographic" && (
                      <div className="space-y-3 pt-2 border-t">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-semibold">مؤشرات وبيانات الإنفوجرافيك (اختياري)</Label>
                          <span className="text-[11px] text-muted-foreground">تُعزز دقة الرسم البياني وعناصر الفيكتور</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <Input
                            placeholder="مؤشر ١ (مثال: ٧٥٪ نمو)"
                            value={dataPoints[0]}
                            onChange={(e) => setDataPoints([e.target.value, dataPoints[1], dataPoints[2]])}
                            className="text-xs"
                            dir="rtl"
                          />
                          <Input
                            placeholder="مؤشر ٢ (مثال: ١٢ مليار ريال)"
                            value={dataPoints[1]}
                            onChange={(e) => setDataPoints([dataPoints[0], e.target.value, dataPoints[2]])}
                            className="text-xs"
                            dir="rtl"
                          />
                          <Input
                            placeholder="مؤشر ٣ (مثال: +٣٠ ألف وظيفة)"
                            value={dataPoints[2]}
                            onChange={(e) => setDataPoints([dataPoints[0], dataPoints[1], e.target.value])}
                            className="text-xs"
                            dir="rtl"
                          />
                        </div>
                      </div>
                    )}
                  </TabsContent>
                ))}
              </Tabs>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="modelSelector">نموذج التوليد</Label>
                  <Select
                    value={selectedModel || "auto"}
                    onValueChange={(val) => setSelectedModel(val === "auto" ? "" : val)}
                  >
                    <SelectTrigger id="modelSelector">
                      <SelectValue placeholder="توجيه ذكي تلقائي" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">توجيه ذكي تلقائي (موصى به)</SelectItem>
                      {KNOWN_IMAGE_MODELS.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="imageSize">حجم الصورة</Label>
                  <Select value={imageSize} onValueChange={setImageSize}>
                    <SelectTrigger id="imageSize">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1K">1K - سريع ($0.067)</SelectItem>
                      <SelectItem value="2K">2K - متوسط ($0.134)</SelectItem>
                      <SelectItem value="4K">4K - عالي الجودة ($0.24)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="aspectRatio">نسبة العرض</Label>
                  <Select value={aspectRatio} onValueChange={setAspectRatio}>
                    <SelectTrigger id="aspectRatio">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1:1">1:1 - مربع</SelectItem>
                      <SelectItem value="16:9">16:9 - عريض</SelectItem>
                      <SelectItem value="4:3">4:3 - قياسي</SelectItem>
                      <SelectItem value="3:4">3:4 - عمودي</SelectItem>
                      <SelectItem value="9:16">9:16 - قصة</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="thinking">التفكير الذكي</Label>
                  <Switch
                    id="thinking"
                    checked={enableThinking}
                    onCheckedChange={setEnableThinking}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="search">البحث التلقائي</Label>
                  <Switch
                    id="search"
                    checked={enableSearchGrounding}
                    onCheckedChange={setEnableSearchGrounding}
                  />
                </div>
              </div>
            </>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>الصورة المولدة</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <img
                  src={generatedImage.url}
                  alt={generatedImage.alt}
                  className="w-full rounded-lg"
                />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => window.open(generatedImage.url, "_blank")}
                    className="flex-1"
                  >
                    <Download className="w-4 h-4 ml-2" />
                    تحميل
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setGeneratedImage(null)}
                    className="flex-1"
                  >
                    توليد صورة جديدة
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter>
          {!generatedImage ? (
            <>
              <Button variant="outline" onClick={handleClose}>
                إلغاء
              </Button>
              <Button 
                onClick={handleGenerate} 
                disabled={generateMutation.isPending}
              >
                {generateMutation.isPending ? (
                  <>
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                    جاري التوليد...
                  </>
                ) : (
                  <>
                    <Sparkles className="ml-2 h-4 w-4" />
                    توليد الصورة
                  </>
                )}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={handleClose}>
                إلغاء
              </Button>
              <Button onClick={handleInsertImage}>
                <Image className="ml-2 h-4 w-4" />
                {insertLabel}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}