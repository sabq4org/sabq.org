import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Copy, Check, AlertCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface HeadlineSuggestion {
  provider: string;
  model: string;
  title: string;
  error?: string;
}

export function SmartHeadlineComparison() {
  const [content, setContent] = useState("");
  const [currentTitle, setCurrentTitle] = useState("");
  const [suggestions, setSuggestions] = useState<HeadlineSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const { toast } = useToast();

  const handleCompare = async () => {
    if (!content.trim()) {
      toast({
        title: "خطأ",
        description: "يرجى إدخال محتوى المقال",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const response = await apiRequest<{ suggestions: HeadlineSuggestion[] }>(
        "/api/ai/compare-headlines",
        {
          method: "POST",
          body: JSON.stringify({ content, currentTitle }),
        }
      );

      setSuggestions(response.suggestions);

      toast({
        title: "تم التوليد بنجاح",
        description: `تم توليد ${response?.suggestions?.filter(s => !s.error).length} عنوان من نماذج AI مختلفة`,
      });
    } catch (error: any) {
      toast({
        title: "فشل التوليد",
        description: error.message || "حدث خطأ أثناء توليد العناوين",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async (title: string, index: number) => {
    try {
      await navigator.clipboard.writeText(title);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);

      toast({
        title: "تم النسخ",
        description: "تم نسخ العنوان إلى الحافظة",
      });
    } catch (error) {
      toast({
        title: "فشل النسخ",
        description: "حدث خطأ أثناء نسخ العنوان",
        variant: "destructive",
      });
    }
  };

  const getProviderBadgeColor = (provider: string) => {
    switch (provider) {
      case "openai":
        return "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20";
      case "anthropic":
        return "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20";
      case "gemini":
        return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
      default:
        return "";
    }
  };

  const getProviderName = (provider: string) => {
    switch (provider) {
      case "openai":
        return "OpenAI";
      case "anthropic":
        return "Anthropic";
      case "gemini":
        return "Google";
      default:
        return provider;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" data-testid="icon-sparkles" />
          <CardTitle>مقارنة العناوين الذكية</CardTitle>
        </div>
        <CardDescription>
          اختبر 3 نماذج AI مختلفة (GPT-5 + Claude + Gemini) للحصول على أفضل عنوان لمقالك
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="current-title">العنوان الحالي (اختياري)</Label>
          <Input
            id="current-title"
            value={currentTitle}
            onChange={(e) => setCurrentTitle(e.target.value)}
            placeholder="العنوان الذي تريد تحسينه..."
            data-testid="input-current-title"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="content">محتوى المقال</Label>
          <Textarea
            id="content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="الصق محتوى المقال هنا..."
            rows={6}
            className="resize-none"
            data-testid="textarea-content"
          />
        </div>

        <Button
          onClick={handleCompare}
          disabled={loading || !content.trim()}
          className="w-full"
          data-testid="button-compare"
        >
          {loading ? (
            <>
              <Sparkles className="w-4 h-4 ml-2 animate-spin" />
              جاري التوليد...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 ml-2" />
              قارن العناوين (3 نماذج AI)
            </>
          )}
        </Button>

        {suggestions.length > 0 && (
          <div className="space-y-3 pt-4 border-t">
            <h3 className="font-semibold text-sm text-muted-foreground">العناوين المقترحة</h3>
            {suggestions.map((suggestion, index) => (
              <Card
                key={index}
                className={`${
                  suggestion.error ? "border-destructive/50 bg-destructive/5" : "hover-elevate"
                }`}
                data-testid={`card-suggestion-${index}`}
              >
                <CardContent className="p-4">
                  {suggestion.error ? (
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
                      <div className="flex-1 text-sm">
                        <p className="text-destructive font-medium mb-1">
                          {getProviderName(suggestion.provider)} - فشل
                        </p>
                        <p className="text-muted-foreground text-xs">{suggestion.error}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <Badge className={getProviderBadgeColor(suggestion.provider)}>
                          {getProviderName(suggestion.provider)} - {suggestion.model}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopy(suggestion.title, index)}
                          data-testid={`button-copy-${index}`}
                        >
                          {copiedIndex === index ? (
                            <>
                              <Check className="w-3 h-3 ml-1" />
                              تم
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3 ml-1" />
                              نسخ
                            </>
                          )}
                        </Button>
                      </div>
                      <p className="text-base font-medium" data-testid={`text-title-${index}`}>
                        {suggestion.title}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
