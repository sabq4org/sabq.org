import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Image, FileImage, Instagram, Linkedin, Facebook, Sparkles, Download } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";

interface StoryCardsGeneratorProps {
  articleId: string;
  articleTitle: string;
  articleContent: string;
  articleCategory?: string;
  articleImage?: string;
  articleAuthor?: string;
  onComplete?: (storyData: any) => void;
}

interface StorySlide {
  order: number;
  imageUrl: string;
  headline: string;
  content: string;
  template: string;
}

interface StoryCardData {
  id: string;
  articleId: string;
  slides: StorySlide[];
  template: string;
  colorScheme: string;
  brandElements: any;
  instagramStoryUrl?: string;
  facebookStoryUrl?: string;
  whatsappStatusUrl?: string;
  twitterThreadImages?: string[];
  status: string;
  createdAt: string;
}

export function StoryCardsGenerator({
  articleId,
  articleTitle,
  articleContent,
  articleCategory = "news",
  articleImage,
  articleAuthor,
  onComplete
}: StoryCardsGeneratorProps) {
  const { toast } = useToast();
  const [selectedPlatform, setSelectedPlatform] = useState<"instagram" | "linkedin" | "facebook">("instagram");
  const [slideCount, setSlideCount] = useState(5);
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "1:1" | "16:9">("9:16");
  const [language, setLanguage] = useState<"ar" | "en" | "ur">("ar");
  const [generatedStory, setGeneratedStory] = useState<StoryCardData | null>(null);
  const [isPreviewMode, setIsPreviewMode] = useState(false);

  // Generate story cards mutation
  const generateMutation = useMutation({
    mutationFn: async (platform: "instagram" | "linkedin" | "facebook") => {
      const endpoint = platform === "instagram" 
        ? "/api/story-cards/instagram-carousel"
        : platform === "linkedin" 
        ? "/api/story-cards/linkedin-document"
        : "/api/story-cards/generate";
      
      const response = await apiRequest(endpoint, {
        method: "POST",
        body: JSON.stringify({
          articleId,
          title: articleTitle,
          content: articleContent,
          category: articleCategory,
          options: {
            category: articleCategory,
            imageUrl: articleImage,
            author: articleAuthor,
            maxSlides: slideCount,
            aspectRatio,
            language
          }
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to generate story cards");
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      setGeneratedStory(data.data);
      setIsPreviewMode(true);
      toast({
        title: "نجح إنشاء القصة المصورة",
        description: `تم إنشاء ${(data?.data?.slides?.length ?? 0)} شريحة بنجاح`,
        className: "font-arabic"
      });
      if (onComplete) {
        onComplete(data.data);
      }
    },
    onError: (error) => {
      toast({
        title: "فشل إنشاء القصة",
        description: error.message,
        variant: "destructive",
        className: "font-arabic"
      });
    }
  });

  const handleGenerate = () => {
    generateMutation.mutate(selectedPlatform);
  };

  const downloadImage = (imageUrl: string, fileName: string) => {
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case "instagram":
        return <Instagram className="h-4 w-4" />;
      case "linkedin":
        return <Linkedin className="h-4 w-4" />;
      case "facebook":
        return <Facebook className="h-4 w-4" />;
      default:
        return <FileImage className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-6">
      {!isPreviewMode ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              مولد القصص المصورة بالذكاء الاصطناعي
            </CardTitle>
            <CardDescription>
              قم بإنشاء قصص مصورة جذابة للمنصات الاجتماعية المختلفة
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Platform Selection */}
            <div className="space-y-2">
              <Label>اختر المنصة</Label>
              <Tabs value={selectedPlatform} onValueChange={(v) => setSelectedPlatform(v as any)}>
                <TabsList className="w-full">
                  <TabsTrigger value="instagram" className="flex-1">
                    <Instagram className="h-4 w-4 mr-2" />
                    Instagram
                  </TabsTrigger>
                  <TabsTrigger value="linkedin" className="flex-1">
                    <Linkedin className="h-4 w-4 mr-2" />
                    LinkedIn
                  </TabsTrigger>
                  <TabsTrigger value="facebook" className="flex-1">
                    <Facebook className="h-4 w-4 mr-2" />
                    Facebook
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {/* Settings for each platform */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>عدد الشرائح</Label>
                <div className="flex items-center gap-4">
                  <Slider
                    value={[slideCount]}
                    onValueChange={([value]) => setSlideCount(value)}
                    min={3}
                    max={10}
                    step={1}
                    className="flex-1"
                  />
                  <Badge variant="secondary">{slideCount}</Badge>
                </div>
              </div>

              <div className="space-y-2">
                <Label>نسبة العرض إلى الارتفاع</Label>
                <Select value={aspectRatio} onValueChange={(v) => setAspectRatio(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="9:16">9:16 (قصة)</SelectItem>
                    <SelectItem value="1:1">1:1 (مربع)</SelectItem>
                    <SelectItem value="16:9">16:9 (أفقي)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>اللغة</Label>
                <Select value={language} onValueChange={(v) => setLanguage(v as any)}>
                  <SelectTrigger>
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

            {/* Article Info Preview */}
            <div className="p-4 bg-muted rounded-lg space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline">{articleCategory}</Badge>
                {articleAuthor && <span className="text-sm text-muted-foreground">بواسطة {articleAuthor}</span>}
              </div>
              <h3 className="font-bold text-lg line-clamp-2">{articleTitle}</h3>
              <p className="text-sm text-muted-foreground line-clamp-3">{articleContent}</p>
            </div>

            {/* Generate Button */}
            <Button 
              onClick={handleGenerate}
              disabled={generateMutation.isPending}
              className="w-full"
              size="lg"
            >
              {generateMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  جاري الإنشاء...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  إنشاء القصة المصورة
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      ) : (
        // Preview Mode
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                {getPlatformIcon(selectedPlatform)}
                معاينة القصة المصورة
              </CardTitle>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsPreviewMode(false)}
                >
                  رجوع للإعدادات
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => {
                    if (generatedStory) {
                      generatedStory.slides.forEach((slide, index) => {
                        downloadImage(slide.imageUrl, `slide-${index + 1}.png`);
                      });
                    }
                  }}
                >
                  <Download className="h-4 w-4 mr-2" />
                  تحميل الكل
                </Button>
              </div>
            </div>
            <CardDescription>
              {generatedStory?.slides.length} شريحة - {generatedStory?.template}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[500px] w-full rounded-lg">
              <div className="grid gap-4">
                <AnimatePresence>
                  {generatedStory?.slides.map((slide, index) => (
                    <motion.div
                      key={slide.order}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="relative"
                    >
                      <Card className="overflow-hidden">
                        <div className="flex gap-4">
                          <div className="relative w-1/3 aspect-[9/16]">
                            <img
                              src={slide.imageUrl}
                              alt={`Slide ${slide.order}`}
                              className="absolute inset-0 w-full h-full object-cover"
                            />
                            <Badge 
                              className="absolute top-2 right-2"
                              variant="secondary"
                            >
                              {slide.order}/{generatedStory.slides.length}
                            </Badge>
                          </div>
                          <div className="flex-1 p-4 space-y-2">
                            <h4 className="font-bold text-lg">{slide.headline}</h4>
                            <p className="text-sm text-muted-foreground">{slide.content}</p>
                            <div className="flex items-center justify-between pt-2">
                              <Badge variant="outline">{slide.template}</Badge>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => downloadImage(slide.imageUrl, `slide-${slide.order}.png`)}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </Card>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}