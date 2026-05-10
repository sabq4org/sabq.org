import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
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
import { apiRequest } from "@/lib/queryClient";
import { Sparkles, Image, FileText, ChartBar, Loader2, Download, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AIImageGeneratorDialogProps {
  open: boolean;
  onClose: () => void;
  onImageGenerated: (imageUrl: string, alt?: string) => void;
  initialPrompt?: string;
}

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
}: AIImageGeneratorDialogProps) {
  const [activeTab, setActiveTab] = useState("custom");
  const [prompt, setPrompt] = useState(initialPrompt);
  const [templateFields, setTemplateFields] = useState<Record<string, string>>({});
  const [selectedColorStyle, setSelectedColorStyle] = useState<keyof typeof colorStyles>("red");
  const [imageSize, setImageSize] = useState("2K");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [enableThinking, setEnableThinking] = useState(true);
  const [enableSearchGrounding, setEnableSearchGrounding] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<{url: string; alt?: string} | null>(null);
  const { toast } = useToast();

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
        throw new Error(data.error || data.message || "فشل توليد الصورة");
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

    // If using template, build prompt from template
    if (activeTab !== "custom") {
      const template = templates[activeTab as keyof typeof templates];
      if (template) {
        finalPrompt = template.prompt;
        template.fields.forEach((field) => {
          finalPrompt = finalPrompt.replace(`{${field}}`, templateFields[field] || "");
        });
        // Replace color style placeholder if template has color option
        if (template.hasColorOption) {
          const colorStyle = colorStyles[selectedColorStyle];
          finalPrompt = finalPrompt.replace("{colorStyle}", colorStyle.prompt);
          
          // For "breaking" template, add text overlay with the headline
          console.log("[AIImageGeneratorDialog DEBUG] activeTab:", activeTab, "headline:", templateFields.headline, "will set overlay:", activeTab === "breaking" && templateFields.headline ? "YES" : "NO");
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

    const payload = {
      prompt: finalPrompt,
      imageSize,
      aspectRatio,
      enableThinking,
      enableSearchGrounding,
      overlayText,
      overlayOptions,
    };
    console.log("[AIImageGeneratorDialog] Sending payload:", JSON.stringify(payload, null, 2));
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
                          {field === "data" && "البيانات الإحصائية"}
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
                          placeholder={field === "headline" ? "أدخل العنوان الذي سيظهر في الصورة..." : undefined}
                        />
                      </div>
                    ))}
                  </TabsContent>
                ))}
              </Tabs>

              <div className="grid grid-cols-2 gap-4">
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
                إدراج في المقال
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}