/**
 * AI Image Studio - Nano Banana Pro Interface
 * Generate professional images using Gemini 3 Pro Image
 */

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Sparkles, Image as ImageIcon, Download, Trash2, Clock, DollarSign, Loader2, FolderOpen, CheckCircle2, Palette, Shuffle, Briefcase, Rocket, Lightbulb } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

interface Generation {
  id: string;
  prompt: string;
  negativePrompt?: string;
  model: string;
  aspectRatio: string;
  imageSize: string;
  status: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  generationTime?: number;
  cost?: number;
  errorMessage?: string;
  mediaFileId?: string;
  createdAt: string;
}

interface NotebookLMGeneration {
  id: string;
  fileName: string;
  originalName: string;
  url: string;
  thumbnailUrl?: string;
  title?: string;
  description?: string;
  aiGenerationPrompt?: string;
  keywords?: string[];
  createdAt: string;
  width?: number;
  height?: number;
}

interface Stats {
  total: number;
  completed: number;
  failed: number;
  processing: number;
  totalCost: number;
  avgGenerationTime: number;
}

// Infographic styles constant
const INFOGRAPHIC_STYLES = [
  { 
    id: "none", 
    name: "بدون نمط محدد", 
    nameEn: "No Specific Style",
    description: "استخدام البرومبت فقط", 
    prompt: "" 
  },
  {
    id: "illustration-mix",
    name: "Illustration Mix",
    nameEn: "Illustration Mix",
    description: "رسومات فلات + تدرجات خفيفة",
    prompt: "Arabic infographic with main header block and multiple detailed sub-points, 9:16 vertical format, unified Arabic font, soft illustration mix style, flat-illustration elements, balanced soft colors, clean layout with icons for each point, friendly aesthetic, no heavy ornaments."
  },
  {
    id: "premium-gradient",
    name: "Premium Gradient",
    nameEn: "Premium Gradient",
    description: "ألوان ذهبية ناعمة وتدرجات ممتازة",
    prompt: "Arabic infographic with main header block and multiple detailed sub-points, 9:16 vertical layout, Premium Gradient luxury style, elegant soft Arabic typography, warm beige background, subtle golden gradients, refined icons, smooth soft shadows, high-end illustrated elements, clean section dividers, rich decorative touches without clutter."
  },
  {
    id: "premium-gradient-2",
    name: "Premium Gradient 2",
    nameEn: "Premium Gradient 2",
    description: "تدرجات ذهبية واضحة وراقية + أيقونات 2.5D",
    prompt: "Arabic infographic with main header and central numeric highlight, premium gradient style, 9:16 vertical layout, elegant Arabic font, gold and teal luxury color palette, semi-3D 2.5D illustrated buildings, soft shadows, clean geometric background lines, refined icons for each section, high-end corporate feel, modern business aesthetic, no clutter."
  },
  {
    id: "corporate-clean",
    name: "Corporate Clean",
    nameEn: "Corporate Clean",
    description: "ألوان هادئة وأيقونات بسيطة للأعمال",
    prompt: "Arabic corporate infographic, 9:16 vertical layout, clean business style, unified Arabic font, blue-gray professional palette, flat minimal icons, structured boxes for key numbers, subtle geometric background lines, clear hierarchy for sections (market summary, rising companies, declining companies), no decorative elements."
  },
  {
    id: "2.5d-soft",
    name: "2.5D Soft Illustrations",
    nameEn: "2.5D Soft Illustrations",
    description: "رسومات ناعمة شبه ثلاثية الأبعاد",
    prompt: "Arabic process infographic with a flowing curved path and numbered steps (1–8), 9:16 vertical layout, 2.5D soft illustration style, clean soft gradients, unified Arabic font, pastel color palette, semi-3D illustrated icons, smooth shadows, friendly aesthetic, organized step-by-step layout with clear titles and short descriptions."
  }
];

export default function ImageStudio() {
  const { toast } = useToast();
  const [selectedModel, setSelectedModel] = useState<"nano-banana" | "notebooklm">("nano-banana");
  const [selectedStyle, setSelectedStyle] = useState<string>("none");
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [imageSize, setImageSize] = useState("2K");
  const [enableSearchGrounding, setEnableSearchGrounding] = useState(false);
  const [enableThinking, setEnableThinking] = useState(true);
  
  // NotebookLM specific options
  const [notebookLmDetail, setNotebookLmDetail] = useState<"concise" | "standard" | "detailed">("standard");
  const [notebookLmOrientation, setNotebookLmOrientation] = useState<"square" | "portrait" | "landscape">("landscape");
  const [notebookLmLanguage, setNotebookLmLanguage] = useState("ar"); // Arabic default
  const [notebookLmColorStyle, setNotebookLmColorStyle] = useState<"auto" | "vibrant" | "professional" | "elegant" | "modern">("auto");
  
  // Loading states
  const [isGeneratingNotebookLm, setIsGeneratingNotebookLm] = useState(false);

  // Fetch Nano Banana generations
  const { data: nanoBananaData, isLoading: isLoadingNanoBanana } = useQuery<{ generations: Generation[] }>({
    queryKey: ["/api/nano-banana/generations"],
    refetchInterval: selectedModel === "nano-banana" ? 5000 : false, // Auto-refresh only when selected
  });
  
  const nanoBananaGenerations = nanoBananaData?.generations || [];

  // Fetch NotebookLM generations
  const { data: notebookLmData, isLoading: isLoadingNotebookLm } = useQuery<{ 
    generations: NotebookLMGeneration[], 
    total: number 
  }>({
    queryKey: ["/api/notebooklm/generations"],
    refetchInterval: selectedModel === "notebooklm" ? 5000 : false, // Auto-refresh only when selected
  });
  
  const notebookLmGenerations = notebookLmData?.generations || [];

  // Combine generations based on selected model
  const generations = selectedModel === "notebooklm" 
    ? notebookLmGenerations.map(gen => ({
        id: gen.id,
        prompt: gen.aiGenerationPrompt || gen.title || "",
        model: "notebooklm",
        aspectRatio: "",
        imageSize: "",
        status: "completed",
        imageUrl: gen.url,
        thumbnailUrl: gen.thumbnailUrl,
        createdAt: gen.createdAt,
      } as Generation))
    : nanoBananaGenerations;

  const isLoading = selectedModel === "notebooklm" ? isLoadingNotebookLm : isLoadingNanoBanana;

  // Fetch stats (only for Nano Banana)
  const { data: stats } = useQuery<Stats>({
    queryKey: ["/api/nano-banana/stats"],
    enabled: selectedModel !== "notebooklm", // Only fetch when not using NotebookLM
  });

  // Generate mutation
  const generateMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("/api/nano-banana/generate", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      toast({
        title: "جاري التوليد",
        description: "يتم الآن توليد الصورة باستخدام Nano Banana Pro",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/nano-banana/generations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/nano-banana/stats"] });
      setPrompt("");
      setNegativePrompt("");
    },
    onError: (error: any) => {
      // Check if it's an auth error
      if (error.message?.includes("401") || error.message?.includes("Unauthorized")) {
        toast({
          variant: "destructive",
          title: "غير مصرح",
          description: "يجب تسجيل الدخول للوصول إلى هذه الميزة",
          action: <Button onClick={() => window.location.href = '/login'}>تسجيل الدخول</Button>,
        });
        // Redirect after 3 seconds
        setTimeout(() => {
          window.location.href = '/login';
        }, 3000);
      } else {
        toast({
          variant: "destructive",
          title: "فشل التوليد",
          description: error.message || "حدث خطأ أثناء توليد الصورة",
        });
      }
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/nano-banana/generations/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      toast({
        title: "تم الحذف",
        description: "تم حذف الصورة بنجاح",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/nano-banana/generations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/nano-banana/stats"] });
    },
  });

  // Save to media library mutation
  const saveToLibraryMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/nano-banana/generations/${id}/save-to-library`, {
        method: "POST",
      });
    },
    onSuccess: (data) => {
      toast({
        title: "تم الحفظ بنجاح",
        description: "تم حفظ الصورة في مكتبة الوسائط بنجاح",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/nano-banana/generations"] });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "فشل الحفظ",
        description: error.message || "حدث خطأ أثناء حفظ الصورة",
      });
    },
  });

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast({
        variant: "destructive",
        title: "المحتوى مطلوب",
        description: "يرجى إدخال وصف للصورة أو المحتوى المراد توليده",
      });
      return;
    }

    // Get the selected style prompt
    const selectedStyleData = INFOGRAPHIC_STYLES.find(s => s.id === selectedStyle);
    const stylePrompt = selectedStyleData?.prompt || "";
    
    // Merge style prompt with user prompt
    const finalPrompt = stylePrompt 
      ? `${stylePrompt}\n\nUser request: ${prompt}`
      : prompt;

    if (selectedModel === "nano-banana") {
      generateMutation.mutate({
        prompt: finalPrompt,
        negativePrompt: negativePrompt || undefined,
        aspectRatio,
        imageSize,
        enableSearchGrounding,
        enableThinking,
      });
    } else {
      // NotebookLM generation
      setIsGeneratingNotebookLm(true);
      
      toast({
        title: "جاري التوليد",
        description: "يتم الآن توليد الإنفوجرافيك باستخدام NotebookLM...",
      });
      
      try {
        const result = await apiRequest("/api/notebooklm/generate", {
          method: "POST",
          body: JSON.stringify({
            prompt: finalPrompt,
            detail: notebookLmDetail,
            orientation: notebookLmOrientation,
            language: notebookLmLanguage,
            colorStyle: notebookLmColorStyle,
          }),
        });
        
        if (result.success) {
          toast({
            title: "تم التوليد بنجاح",
            description: "تم توليد الإنفوجرافيك بنجاح",
          });
          queryClient.invalidateQueries({ queryKey: ["/api/notebooklm/generations"] });
          setPrompt("");
        }
      } catch (error: any) {
        // Check if it's an auth error
        if (error.message?.includes("401") || error.message?.includes("Unauthorized")) {
          toast({
            variant: "destructive",
            title: "غير مصرح",
            description: "يجب تسجيل الدخول للوصول إلى هذه الميزة",
            action: <Button onClick={() => window.location.href = '/login'}>تسجيل الدخول</Button>,
          });
        } else {
          toast({
            variant: "destructive",
            title: "فشل التوليد",
            description: error.message || "حدث خطأ أثناء توليد الإنفوجرافيك",
          });
        }
      } finally {
        setIsGeneratingNotebookLm(false);
      }
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl" dir="rtl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2 flex items-center gap-3">
          <Sparkles className="w-10 h-10 text-purple-500" />
          AI Image Studio
        </h1>
        <p className="text-muted-foreground text-lg">
          توليد صور احترافية باستخدام Gemini 3 Pro Image (Nano Banana Pro)
        </p>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">إجمالي الصور</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">الناجحة</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                التكلفة الإجمالية
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${stats.totalCost.toFixed(2)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Clock className="w-4 h-4" />
                متوسط الوقت
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.avgGenerationTime}s</div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Generation Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5" />
              توليد صورة جديدة
            </CardTitle>
            <CardDescription>
              اختر النموذج المناسب لتوليد صور احترافية عالية الجودة
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Model Selection */}
            <div className="space-y-2">
              <Label>اختر النموذج</Label>
              <div className="grid grid-cols-2 gap-4">
                <Card 
                  className={`cursor-pointer transition-all ${
                    selectedModel === "nano-banana" 
                      ? "ring-2 ring-purple-500 bg-purple-50 dark:bg-purple-900/20" 
                      : "hover:shadow-md"
                  }`}
                  onClick={() => setSelectedModel("nano-banana")}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-semibold flex items-center gap-2">
                          <ImageIcon className="w-4 h-4" />
                          Nano Banana Pro
                        </h4>
                        <p className="text-sm text-muted-foreground mt-1">
                          Google Gemini 3 - توليد صور احترافية
                        </p>
                      </div>
                      <Badge variant={selectedModel === "nano-banana" ? "default" : "outline"}>
                        {selectedModel === "nano-banana" ? "مُختار" : "اختر"}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>

                <Card 
                  className={`cursor-pointer transition-all ${
                    selectedModel === "notebooklm" 
                      ? "ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/20" 
                      : "hover:shadow-md"
                  }`}
                  onClick={() => setSelectedModel("notebooklm")}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-semibold flex items-center gap-2">
                          <Sparkles className="w-4 h-4" />
                          NotebookLM
                        </h4>
                        <p className="text-sm text-muted-foreground mt-1">
                          Google AI - إنفوجرافيك ذكي
                        </p>
                      </div>
                      <Badge variant={selectedModel === "notebooklm" ? "default" : "outline"}>
                        {selectedModel === "notebooklm" ? "مُختار" : "اختر"}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Style Selection - Shows for both Nano Banana and NotebookLM */}
            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <Palette className="w-4 h-4" />
                اختر النمط الاحترافي
              </Label>
              <p className="text-sm text-muted-foreground">
                اختر نمطاً احترافياً لإنفوجرافيكك، أو اترك "بدون نمط" لاستخدام البرومبت فقط
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {INFOGRAPHIC_STYLES.map((style) => (
                  <Card
                    key={style.id}
                    className={`cursor-pointer transition-all ${
                      selectedStyle === style.id
                        ? "ring-2 ring-primary bg-primary/5"
                        : "hover-elevate"
                    }`}
                    onClick={() => setSelectedStyle(style.id)}
                    data-testid={`style-card-${style.id}`}
                  >
                    <CardContent className="p-3">
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <h4 className="font-semibold text-sm">
                              {style.name}
                            </h4>
                            {style.nameEn !== style.name && (
                              <p className="text-xs text-muted-foreground">
                                {style.nameEn}
                              </p>
                            )}
                          </div>
                          <Badge 
                            variant={selectedStyle === style.id ? "default" : "outline"}
                            className="shrink-0"
                          >
                            {selectedStyle === style.id ? "مُختار" : "اختر"}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {style.description}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
              {selectedStyle !== "none" && (
                <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                  <p className="text-sm text-green-700 dark:text-green-300 flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>
                      <strong>تم اختيار النمط:</strong>{" "}
                      {INFOGRAPHIC_STYLES.find(s => s.id === selectedStyle)?.name}
                      <br />
                      <span className="text-xs">
                        سيتم دمج هذا النمط مع برومبتك تلقائياً
                      </span>
                    </span>
                  </p>
                </div>
              )}
            </div>

            <div>
              <Label htmlFor="prompt">
                {selectedModel === "nano-banana" ? "البرومبت (الوصف)" : "المحتوى أو الموضوع"}
              </Label>
              <Textarea
                id="prompt"
                data-testid="input-prompt"
                placeholder={
                  selectedModel === "nano-banana" 
                    ? "اكتب وصفاً تفصيلياً للصورة المراد توليدها..."
                    : "اكتب المحتوى أو المعلومات المراد تحويلها إلى إنفوجرافيك..."
                }
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={4}
                className="resize-none"
              />
            </div>

            {/* Model-specific options */}
            {selectedModel === "nano-banana" ? (
              <>
                <div>
                  <Label htmlFor="negative-prompt">البرومبت السلبي (اختياري)</Label>
                  <Textarea
                    id="negative-prompt"
                    data-testid="input-negative-prompt"
                    placeholder="ما الذي تريد تجنبه في الصورة..."
                    value={negativePrompt}
                    onChange={(e) => setNegativePrompt(e.target.value)}
                    rows={2}
                    className="resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="aspect-ratio">نسبة العرض</Label>
                    <Select value={aspectRatio} onValueChange={setAspectRatio}>
                      <SelectTrigger id="aspect-ratio" data-testid="select-aspect-ratio">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1:1">1:1 (مربع)</SelectItem>
                        <SelectItem value="3:4">3:4 (عمودي)</SelectItem>
                        <SelectItem value="4:3">4:3 (أفقي)</SelectItem>
                        <SelectItem value="9:16">9:16 (هاتف)</SelectItem>
                        <SelectItem value="16:9">16:9 (شاشة عريضة)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="image-size">حجم الصورة</Label>
                    <Select value={imageSize} onValueChange={setImageSize}>
                      <SelectTrigger id="image-size" data-testid="select-image-size">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="2K">2K (2048x2048)</SelectItem>
                        <SelectItem value="4K">4K (4096x4096)</SelectItem>
                        <SelectItem value="8K">8K (8192x8192)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="search-grounding">البحث الأرضي</Label>
                    <Switch
                      id="search-grounding"
                      checked={enableSearchGrounding}
                      onCheckedChange={setEnableSearchGrounding}
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    استخدام بحث Google للحصول على صور أكثر دقة
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="thinking">التفكير العميق</Label>
                    <Switch
                      id="thinking"
                      checked={enableThinking}
                      onCheckedChange={setEnableThinking}
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    السماح للذكاء الاصطناعي بالتفكير قبل التوليد
                  </p>
                </div>
              </>
            ) : (
              <>
                {/* NotebookLM specific options */}
                <div>
                  <Label htmlFor="detail-level">مستوى التفصيل</Label>
                  <Select value={notebookLmDetail} onValueChange={setNotebookLmDetail as any}>
                    <SelectTrigger id="detail-level" data-testid="select-detail-level">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="concise">مختصر</SelectItem>
                      <SelectItem value="standard">قياسي</SelectItem>
                      <SelectItem value="detailed">مفصّل</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="orientation">الاتجاه</Label>
                    <Select value={notebookLmOrientation} onValueChange={setNotebookLmOrientation as any}>
                      <SelectTrigger id="orientation" data-testid="select-orientation">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="square">مربع</SelectItem>
                        <SelectItem value="portrait">عمودي</SelectItem>
                        <SelectItem value="landscape">أفقي</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="language">اللغة</Label>
                    <Select value={notebookLmLanguage} onValueChange={setNotebookLmLanguage}>
                      <SelectTrigger id="language" data-testid="select-language">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ar">العربية</SelectItem>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="ur">اردو</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label htmlFor="color-style" className="flex items-center gap-2">
                    <Palette className="w-4 h-4" />
                    نمط الألوان
                  </Label>
                  <Select value={notebookLmColorStyle} onValueChange={setNotebookLmColorStyle as any}>
                    <SelectTrigger id="color-style" data-testid="select-color-style">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">
                        <span className="flex items-center gap-2">
                          <Shuffle className="w-4 h-4" />
                          تلقائي (متنوع)
                        </span>
                      </SelectItem>
                      <SelectItem value="vibrant">
                        <span className="flex items-center gap-2">
                          <Sparkles className="w-4 h-4" />
                          زاهي ونابض
                        </span>
                      </SelectItem>
                      <SelectItem value="professional">
                        <span className="flex items-center gap-2">
                          <Briefcase className="w-4 h-4" />
                          احترافي وأنيق
                        </span>
                      </SelectItem>
                      <SelectItem value="elegant">
                        <span className="flex items-center gap-2">
                          <Sparkles className="w-4 h-4" />
                          راقي وفاخر
                        </span>
                      </SelectItem>
                      <SelectItem value="modern">
                        <span className="flex items-center gap-2">
                          <Rocket className="w-4 h-4" />
                          عصري وجريء
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    اختر نمط الألوان المناسب لإنفوجرافيكك
                  </p>
                </div>

                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    <strong className="flex items-center gap-2">
                      <Lightbulb className="w-4 h-4" />
                      ميزات NotebookLM:
                    </strong>
                    <br />
                    • تحويل المحتوى النصي إلى إنفوجرافيك ذكي
                    <br />
                    • تحليل البيانات وإنشاء رسوم بيانية
                    <br />
                    • إنشاء خرائط مفاهيمية وملخصات بصرية
                  </p>
                </div>
              </>
            )}

            <Button
              data-testid="button-generate"
              onClick={handleGenerate}
              disabled={
                generateMutation.isPending || 
                isGeneratingNotebookLm || 
                !prompt.trim()
              }
              className="w-full"
              size="lg"
            >
              {(generateMutation.isPending || isGeneratingNotebookLm) ? (
                <>
                  <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                  {selectedModel === "notebooklm" ? "جاري توليد الإنفوجرافيك..." : 
                   "جاري التوليد..."}
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 ml-2" />
                  {selectedModel === "notebooklm" ? "توليد إنفوجرافيك" : 
                   "توليد الصورة"}
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Recent Generations */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ImageIcon className="w-5 h-5" />
              {selectedModel === "notebooklm" 
                ? "الإنفوجرافيك المولد بـ NotebookLM"
                : "الصور المولدة بـ Nano Banana Pro"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 max-h-[600px] overflow-y-auto">
              {isLoading ? (
                <div className="text-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
                </div>
              ) : generations && generations.length > 0 ? (
                generations.map((gen) => (
                  <div
                    key={gen.id}
                    className="border rounded-lg p-4 space-y-2"
                    data-testid={`generation-${gen.id}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium line-clamp-2 flex-1">{gen.prompt}</p>
                      <div className="flex gap-2 flex-wrap justify-end">
                        <Badge
                          variant={
                            gen.status === "completed"
                              ? "default"
                              : gen.status === "failed"
                              ? "destructive"
                              : "secondary"
                          }
                        >
                          {gen.status === "completed"
                            ? "مكتمل"
                            : gen.status === "failed"
                            ? "فشل"
                            : "جاري المعالجة"}
                        </Badge>
                        {gen.mediaFileId && (
                          <Badge variant="secondary" className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                            <CheckCircle2 className="w-3 h-3 ml-1" />
                            محفوظ في المكتبة
                          </Badge>
                        )}
                      </div>
                    </div>

                    {gen.imageUrl && (
                      <img
                        src={gen.imageUrl}
                        alt={gen.prompt}
                        className="w-full rounded-lg"
                        data-testid={`image-${gen.id}`}
                      />
                    )}

                    {gen.errorMessage && (
                      <p className="text-sm text-destructive">{gen.errorMessage}</p>
                    )}

                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {format(new Date(gen.createdAt), "dd MMM yyyy HH:mm", { locale: ar })}
                      </span>
                      {gen.generationTime && <span>{gen.generationTime}s</span>}
                      {gen.cost && <span>${gen.cost.toFixed(3)}</span>}
                    </div>

                    {gen.status === "completed" && gen.imageUrl && (
                      <div className="flex gap-2">
                        {selectedModel === "nano-banana" && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="flex-1">
                                  <Button
                                    size="sm"
                                    variant="default"
                                    onClick={() => saveToLibraryMutation.mutate(gen.id)}
                                    disabled={saveToLibraryMutation.isPending || !!gen.mediaFileId}
                                    className="w-full"
                                    data-testid={`button-save-${gen.id}`}
                                  >
                                    {saveToLibraryMutation.isPending ? (
                                      <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                                    ) : gen.mediaFileId ? (
                                      <CheckCircle2 className="w-4 h-4 ml-2" />
                                    ) : (
                                      <FolderOpen className="w-4 h-4 ml-2" />
                                    )}
                                    {gen.mediaFileId ? "محفوظة" : "حفظ في المكتبة"}
                                  </Button>
                                </span>
                              </TooltipTrigger>
                              {gen.mediaFileId && (
                                <TooltipContent>
                                  <p>تم حفظ هذه الصورة في مكتبة الوسائط مسبقاً</p>
                                </TooltipContent>
                              )}
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          asChild
                          className="flex-1"
                          data-testid={`button-download-${gen.id}`}
                        >
                          <a href={gen.imageUrl} download target="_blank" rel="noopener noreferrer">
                            <Download className="w-4 h-4 ml-2" />
                            تحميل
                          </a>
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => deleteMutation.mutate(gen.id)}
                          data-testid={`button-delete-${gen.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p>لا توجد صور مولدة بعد</p>
                  <p className="text-sm">ابدأ بتوليد صورتك الأولى</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
