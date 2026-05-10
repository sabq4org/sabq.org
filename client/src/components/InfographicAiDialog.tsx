import { useState } from "react";
import { Sparkles, Copy, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface InfographicSuggestions {
  title: string;
  subtitle?: string;
  bulletPoints: Array<{
    icon?: string;
    text: string;
    highlight?: string;
  }>;
  keywords: string[];
  description: string;
  visualDesign?: {
    style?: string;
    colorScheme?: string[];
    suggestedIcons?: string[];
    layoutSuggestion?: string;
  };
}

interface InfographicAiDialogProps {
  content: string;
  title: string;
  category?: string;
  onApplySuggestions: (suggestions: Partial<InfographicSuggestions>) => void;
}

export function InfographicAiDialog({
  content,
  title,
  category,
  onApplySuggestions,
}: InfographicAiDialogProps) {
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<InfographicSuggestions | null>(null);
  const { toast } = useToast();

  const generateSuggestions = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("/api/ai/infographic-suggestions", {
        method: "POST",
        body: JSON.stringify({ content, title, category }),
      });
      return response.suggestions as InfographicSuggestions;
    },
    onSuccess: (data) => {
      setSuggestions(data);
      toast({
        title: "✨ اقتراحات جاهزة",
        description: "تم توليد اقتراحات الإنفوجرافيك بنجاح",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "خطأ في توليد الاقتراحات",
        description: error.message || "حدث خطأ أثناء توليد الاقتراحات",
      });
    },
  });

  const handleGenerateSuggestions = () => {
    if (!content && !title) {
      toast({
        variant: "destructive",
        title: "معلومات غير كافية",
        description: "يرجى إضافة عنوان أو محتوى للمقال أولاً",
      });
      return;
    }
    generateSuggestions.mutate();
  };

  const handleApplyTitle = () => {
    if (suggestions?.title) {
      onApplySuggestions({ title: suggestions.title, subtitle: suggestions.subtitle });
      toast({
        title: "تم تطبيق العنوان",
        description: "تم تحديث العنوان والعنوان الفرعي",
      });
    }
  };

  const handleApplyBulletPoints = () => {
    if (suggestions?.bulletPoints) {
      const bulletContent = suggestions.bulletPoints
        .map((point) => {
          const highlight = point.highlight ? `**${point.highlight}** - ` : "";
          return `• ${highlight}${point.text}`;
        })
        .join("\n\n");
      onApplySuggestions({ description: bulletContent });
      toast({
        title: "تم تطبيق النقاط",
        description: "تم إضافة النقاط الرئيسية إلى المحتوى",
      });
    }
  };

  const handleApplyKeywords = () => {
    if (suggestions?.keywords) {
      onApplySuggestions({ keywords: suggestions.keywords });
      toast({
        title: "تم تطبيق الكلمات المفتاحية",
        description: "تم تحديث الكلمات المفتاحية",
      });
    }
  };

  const handleApplyDescription = () => {
    if (suggestions?.description) {
      onApplySuggestions({ description: suggestions.description });
      toast({
        title: "تم تطبيق الوصف",
        description: "تم تحديث وصف المقال",
      });
    }
  };

  const handleApplyAll = () => {
    if (suggestions) {
      const bulletContent = suggestions.bulletPoints
        .map((point) => {
          const highlight = point.highlight ? `**${point.highlight}** - ` : "";
          return `• ${highlight}${point.text}`;
        })
        .join("\n\n");
      
      onApplySuggestions({
        title: suggestions.title,
        subtitle: suggestions.subtitle,
        description: `${suggestions.description}\n\n${bulletContent}`,
        keywords: suggestions.keywords,
      });
      
      toast({
        title: "تم تطبيق جميع الاقتراحات",
        description: "تم تحديث جميع الحقول بنجاح",
      });
      setOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          data-testid="button-infographic-ai"
          className="gap-2"
          onClick={() => {
            setOpen(true);
            if (!suggestions && !generateSuggestions.isPending) {
              handleGenerateSuggestions();
            }
          }}
        >
          <Sparkles className="h-4 w-4" />
          اقتراحات AI للإنفوجرافيك
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="text-xl">
            اقتراحات AI للإنفوجرافيك
          </DialogTitle>
          <DialogDescription>
            اقتراحات ذكية لتحسين محتوى الإنفوجرافيك وجعله أكثر جاذبية وفعالية
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-6">
          {generateSuggestions.isPending ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                جاري توليد الاقتراحات الذكية...
              </p>
            </div>
          ) : suggestions ? (
            <ScrollArea className="h-[60vh] pr-4">
              <div className="space-y-6">
                {/* Title Suggestion */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">العنوان المقترح</CardTitle>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleApplyTitle}
                        data-testid="button-apply-title"
                      >
                        <Copy className="h-3 w-3 ml-2" />
                        تطبيق
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-lg font-bold mb-2">{suggestions.title}</p>
                    {suggestions.subtitle && (
                      <p className="text-sm text-muted-foreground">
                        {suggestions.subtitle}
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* Bullet Points */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">النقاط الرئيسية</CardTitle>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleApplyBulletPoints}
                        data-testid="button-apply-bullet-points"
                      >
                        <Copy className="h-3 w-3 ml-2" />
                        تطبيق
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {suggestions.bulletPoints.map((point, index) => (
                        <li key={index} className="flex items-start gap-2">
                          <span className="text-primary font-bold mt-1">
                            {point.icon || "•"}
                          </span>
                          <div className="flex-1">
                            {point.highlight && (
                              <span className="font-semibold text-primary">{point.highlight}: </span>
                            )}
                            <span>{point.text}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>

                {/* Keywords */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">الكلمات المفتاحية</CardTitle>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleApplyKeywords}
                        data-testid="button-apply-keywords"
                      >
                        <Copy className="h-3 w-3 ml-2" />
                        تطبيق
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {suggestions.keywords.map((keyword, index) => (
                        <Badge key={index} variant="secondary">
                          {keyword}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Description */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">الوصف المقترح</CardTitle>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleApplyDescription}
                        data-testid="button-apply-description"
                      >
                        <Copy className="h-3 w-3 ml-2" />
                        تطبيق
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-relaxed">{suggestions.description}</p>
                  </CardContent>
                </Card>

                {/* Visual Design Suggestions */}
                {suggestions.visualDesign && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">اقتراحات التصميم المرئي</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {suggestions.visualDesign.style && (
                        <div>
                          <p className="text-sm font-medium mb-1">الأسلوب المقترح:</p>
                          <p className="text-sm text-muted-foreground">
                            {suggestions.visualDesign.style}
                          </p>
                        </div>
                      )}
                      
                      {suggestions.visualDesign.colorScheme && (
                        <div>
                          <p className="text-sm font-medium mb-2">الألوان المقترحة:</p>
                          <div className="flex gap-2">
                            {suggestions.visualDesign.colorScheme.map((color, index) => (
                              <div
                                key={index}
                                className="w-12 h-12 rounded-md border shadow-sm flex items-center justify-center text-xs"
                                style={{ backgroundColor: color }}
                              >
                                {color}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {suggestions.visualDesign.suggestedIcons && (
                        <div>
                          <p className="text-sm font-medium mb-1">الأيقونات المقترحة:</p>
                          <p className="text-sm text-muted-foreground">
                            {suggestions.visualDesign.suggestedIcons.join("، ")}
                          </p>
                        </div>
                      )}
                      
                      {suggestions.visualDesign.layoutSuggestion && (
                        <div>
                          <p className="text-sm font-medium mb-1">اقتراح التخطيط:</p>
                          <p className="text-sm text-muted-foreground">
                            {suggestions.visualDesign.layoutSuggestion}
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            </ScrollArea>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <Sparkles className="h-12 w-12 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                اضغط على "توليد الاقتراحات" للبدء
              </p>
              <Button onClick={handleGenerateSuggestions}>
                توليد الاقتراحات
              </Button>
            </div>
          )}

          {suggestions && !generateSuggestions.isPending && (
            <div className="flex justify-between items-center mt-6 pt-4 border-t">
              <Button
                variant="outline"
                onClick={handleGenerateSuggestions}
                disabled={generateSuggestions.isPending}
              >
                توليد اقتراحات جديدة
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setOpen(false)}
                >
                  إغلاق
                </Button>
                <Button
                  onClick={handleApplyAll}
                  data-testid="button-apply-all"
                >
                  تطبيق جميع الاقتراحات
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}