import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue 
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  Sparkles, 
  Download, 
  Copy, 
  Loader2,
  Trash2,
  ImagePlus,
  Grid3X3
} from "lucide-react";
import { infographicShapes, infographicStyles } from "@/config/infographicTemplates";

export default function InfographicStudio() {
  const { toast } = useToast();
  const [content, setContent] = useState("");
  const [shape, setShape] = useState("timeline");
  const [type, setType] = useState("minimal-flat");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<Array<{
    url: string;
    prompt: string;
    timestamp: Date;
  }>>([]);

  const handleGenerate = async () => {
    if (!content) {
      toast({
        title: "محتوى مطلوب",
        description: "يرجى إدخال المحتوى لإنشاء الإنفوجرافيك",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    try {
      const selectedShape = infographicShapes[shape];
      const selectedType = infographicStyles[type];
      
      const combinedPrompt = `${selectedShape.prompt}. ${selectedType.prompt}. Content: ${content}`;

      const response = await apiRequest("/api/nano-banana/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          prompt: combinedPrompt,
          model: "gemini-3-pro-image-preview",
          aspectRatio: "16:9",
          imageSize: "2K",
          numImages: 1,
          enableSearchGrounding: false,
          enableThinking: true
        }),
      });

      if (response.error) {
        throw new Error(response.error);
      }

      if (!response.imageUrl) {
        throw new Error("لم يتم إرجاع رابط الصورة من الخادم");
      }

      const newImage = {
        url: response.imageUrl,
        prompt: content,
        timestamp: new Date(),
      };

      setGeneratedImages([newImage, ...generatedImages]);
      
      toast({
        title: "تم التوليد بنجاح",
        description: "تم إنشاء الإنفوجرافيك",
      });
    } catch (error) {
      console.error("Infographic generation error:", error);
      toast({
        title: "خطأ في التوليد",
        description: error instanceof Error ? error.message : "حدث خطأ أثناء توليد الإنفوجرافيك",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = async (url: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `infographic-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(downloadUrl);
      
      toast({
        title: "تم التحميل",
        description: "تم تحميل الإنفوجرافيك بنجاح",
      });
    } catch (error) {
      toast({
        title: "خطأ في التحميل",
        description: "فشل تحميل الإنفوجرافيك",
        variant: "destructive",
      });
    }
  };

  const handleCopyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast({
        title: "تم النسخ",
        description: "تم نسخ رابط الصورة",
      });
    } catch (error) {
      toast({
        title: "خطأ",
        description: "فشل نسخ الرابط",
        variant: "destructive",
      });
    }
  };

  const handleDelete = (index: number) => {
    setGeneratedImages(prev => prev.filter((_, i) => i !== index));
    toast({
      title: "تم الحذف",
      description: "تم حذف الإنفوجرافيك",
    });
  };

  return (
    <DashboardLayout>
      <div className="h-full flex flex-col" dir="rtl">
        <div className="flex items-center justify-between p-4 border-b bg-background">
          <div className="flex items-center gap-3">
            <Grid3X3 className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold">استوديو الإنفوجرافيك</h1>
          </div>
          <Badge variant="outline" className="gap-1">
            <Sparkles className="h-3 w-3" />
            Gemini AI
          </Badge>
        </div>

        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          <div className="lg:w-[400px] border-l flex flex-col bg-muted/30">
            <div className="p-4 space-y-4 flex-1 overflow-y-auto">
              <div>
                <label className="text-sm font-medium mb-2 block">المحتوى</label>
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="أدخل النقاط أو النص..."
                  className="min-h-[150px] bg-background resize-none"
                  data-testid="textarea-infographic-content"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium mb-2 block">الشكل</label>
                  <Select value={shape} onValueChange={setShape}>
                    <SelectTrigger data-testid="select-shape" className="bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(infographicShapes).map(([key, value]) => (
                        <SelectItem key={key} value={key}>
                          <span className="flex items-center gap-2">
                            <span>{value.icon}</span>
                            <span>{value.name}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">النمط</label>
                  <Select value={type} onValueChange={setType}>
                    <SelectTrigger data-testid="select-type" className="bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(infographicStyles).map(([key, value]) => (
                        <SelectItem key={key} value={key}>
                          <span className="flex items-center gap-2">
                            <span 
                              className="w-3 h-3 rounded-full flex-shrink-0"
                              style={{ background: value.color }}
                            />
                            <span>{value.name}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="p-4 border-t bg-background">
              <Button 
                onClick={handleGenerate}
                disabled={isGenerating || !content}
                className="w-full"
                size="lg"
                data-testid="button-generate-studio"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                    جاري التوليد...
                  </>
                ) : (
                  <>
                    <ImagePlus className="h-4 w-4 ml-2" />
                    توليد الإنفوجرافيك
                  </>
                )}
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="p-4 border-b bg-background flex items-center justify-between">
              <h2 className="font-medium">المعرض</h2>
              <span className="text-sm text-muted-foreground">{generatedImages.length} صورة</span>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4">
              {generatedImages.length === 0 ? (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center text-muted-foreground">
                    <Grid3X3 className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p>لا توجد صور بعد</p>
                    <p className="text-sm mt-1">أدخل المحتوى واضغط توليد</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {generatedImages.map((image, index) => (
                    <Card key={index} className="overflow-hidden group">
                      <div className="aspect-video relative">
                        <img 
                          src={image.url} 
                          alt={`Infographic ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                          <Button
                            size="icon"
                            variant="secondary"
                            onClick={() => handleDownload(image.url)}
                            data-testid={`button-download-${index}`}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="secondary"
                            onClick={() => handleCopyUrl(image.url)}
                            data-testid={`button-copy-${index}`}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="destructive"
                            onClick={() => handleDelete(index)}
                            data-testid={`button-delete-${index}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <CardContent className="p-3">
                        <p className="text-sm line-clamp-2">{image.prompt}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(image.timestamp).toLocaleString('ar-SA-u-ca-gregory')}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
