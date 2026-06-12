import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { SmartHeadlineComparison } from "@/components/SmartHeadlineComparison";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { 
  Sparkles, 
  FileText, 
  Share2, 
  Image as ImageIcon, 
  Languages,
  Copy,
  Check,
  Loader2,
  AlertCircle,
  Shield,
  ChevronDown,
  TrendingUp
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function AITools() {
  return (
    <DashboardLayout>
      <div dir="rtl" className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">مركز الذكاء الاصطناعي للمحتوى</h1>
          <p className="text-muted-foreground">
            أدوات ذكية متكاملة لتحسين وإنتاج المحتوى الصحفي باستخدام أحدث نماذج الذكاء الاصطناعي
          </p>
        </div>

        <Card className="bg-gradient-to-br from-primary/5 to-primary/10 dark:from-transparent dark:to-transparent border-primary/20 dark:border-border">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              <CardTitle>300+ نموذج AI متاح</CardTitle>
            </div>
            <CardDescription>
              GPT-5.1، Claude Opus 4.1، Gemini 3 Pro، وأكثر من 300 نموذج ذكاء اصطناعي جاهز للاستخدام
            </CardDescription>
          </CardHeader>
        </Card>

        <Tabs defaultValue="headlines" className="w-full">
          <TabsList className="grid w-full grid-cols-7 gap-1" data-testid="tabs-list">
            <TabsTrigger value="headlines" data-testid="tab-headlines">
              <Sparkles className="w-4 h-4 ml-2" />
              العناوين الذكية
            </TabsTrigger>
            <TabsTrigger value="summarizer" data-testid="tab-summarizer">
              <FileText className="w-4 h-4 ml-2" />
              التلخيص
            </TabsTrigger>
            <TabsTrigger value="social" data-testid="tab-social">
              <Share2 className="w-4 h-4 ml-2" />
              منشورات
            </TabsTrigger>
            <TabsTrigger value="images" data-testid="tab-images">
              <ImageIcon className="w-4 h-4 ml-2" />
              الصور
            </TabsTrigger>
            <TabsTrigger value="translate" data-testid="tab-translate">
              <Languages className="w-4 h-4 ml-2" />
              الترجمة
            </TabsTrigger>
            <TabsTrigger value="fact-checker" data-testid="tab-fact-checker">
              <Shield className="w-4 h-4 ml-2" />
              كشف المضلل
            </TabsTrigger>
            <TabsTrigger value="trends-analysis" data-testid="tab-trends-analysis">
              <TrendingUp className="w-4 h-4 ml-2" />
              تحليل الاتجاهات
            </TabsTrigger>
          </TabsList>

          <TabsContent value="headlines" className="mt-6">
            <SmartHeadlineComparison />
          </TabsContent>

          <TabsContent value="summarizer" className="mt-6">
            <TextSummarizer />
          </TabsContent>

          <TabsContent value="social" className="mt-6">
            <SocialMediaGenerator />
          </TabsContent>

          <TabsContent value="images" className="mt-6">
            <SmartImageSearch />
          </TabsContent>

          <TabsContent value="translate" className="mt-6">
            <InstantTranslator />
          </TabsContent>

          <TabsContent value="fact-checker" className="mt-6">
            <FactChecker />
          </TabsContent>

          <TabsContent value="trends-analysis" className="mt-6">
            <TrendsAnalyzer />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

function TextSummarizer() {
  const [text, setText] = useState("");
  const [language, setLanguage] = useState<"ar" | "en" | "ur">("ar");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleSummarize = async () => {
    if (!text.trim()) {
      toast({
        title: "خطأ",
        description: "يرجى إدخال النص المراد تلخيصه",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const response = await apiRequest<{ 
        summary: string; 
        wordCount: number; 
        compressionRate: number;
      }>("/api/ai-tools/summarize", {
        method: "POST",
        body: JSON.stringify({ text, language }),
      });

      setResult(response);
      toast({
        title: "تم التلخيص بنجاح",
        description: `تم تقليل النص بنسبة ${response.compressionRate}%`,
      });
    } catch (error: any) {
      toast({
        title: "فشل التلخيص",
        description: error.message || "حدث خطأ أثناء تلخيص النص",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!result) return;
    
    try {
      await navigator.clipboard.writeText(result.summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        title: "تم النسخ",
        description: "تم نسخ الملخص إلى الحافظة",
      });
    } catch (error) {
      toast({
        title: "فشل النسخ",
        description: "حدث خطأ أثناء نسخ النص",
        variant: "destructive",
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" />
          <CardTitle>تلخيص النصوص الذكي</CardTitle>
        </div>
        <CardDescription>
          استخدم Claude Sonnet 4-5 لتلخيص النصوص الطويلة مع الحفاظ على النقاط الرئيسية (30% من الطول الأصلي)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="language">اللغة</Label>
          <Select value={language} onValueChange={(v) => setLanguage(v as any)}>
            <SelectTrigger data-testid="select-language">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ar">العربية</SelectItem>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="ur">اردو</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="text">النص الأصلي</Label>
          <Textarea
            id="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="الصق النص المراد تلخيصه هنا..."
            rows={8}
            className="resize-none"
            data-testid="textarea-text"
          />
          <p className="text-xs text-muted-foreground">
            عدد الكلمات: {text.trim().split(/\s+/).filter(w => w.length > 0).length}
          </p>
        </div>

        <Button
          onClick={handleSummarize}
          disabled={loading || !text.trim()}
          className="w-full"
          data-testid="button-summarize"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 ml-2 animate-spin" />
              جاري التلخيص...
            </>
          ) : (
            <>
              <FileText className="w-4 h-4 ml-2" />
              لخص النص
            </>
          )}
        </Button>

        {result && (
          <div className="space-y-3 pt-4 border-t">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">الملخص</h3>
              <div className="flex items-center gap-2">
                <Badge variant="outline" data-testid="badge-word-count">
                  {result.wordCount} كلمة
                </Badge>
                <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20" data-testid="badge-compression">
                  تقليل {result.compressionRate}%
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopy}
                  data-testid="button-copy-summary"
                >
                  {copied ? (
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
            </div>
            <Card>
              <CardContent className="p-4">
                <p className="text-base leading-relaxed" data-testid="text-summary">
                  {result.summary}
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SocialMediaGenerator() {
  const [articleTitle, setArticleTitle] = useState("");
  const [articleSummary, setArticleSummary] = useState("");
  const [platform, setPlatform] = useState<"twitter" | "facebook" | "linkedin">("twitter");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleGenerate = async () => {
    if (!articleTitle.trim() || !articleSummary.trim()) {
      toast({
        title: "خطأ",
        description: "يرجى إدخال العنوان والملخص",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const response = await apiRequest<{
        post: string;
        hashtags: string[];
        characterCount: number;
      }>("/api/ai-tools/social-post", {
        method: "POST",
        body: JSON.stringify({ articleTitle, articleSummary, platform }),
      });

      setResult(response);
      toast({
        title: "تم إنشاء المنشور بنجاح",
        description: `منشور ${platform} جاهز (${response.characterCount} حرف)`,
      });
    } catch (error: any) {
      toast({
        title: "فشل إنشاء المنشور",
        description: error.message || "حدث خطأ أثناء إنشاء المنشور",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!result) return;
    
    try {
      await navigator.clipboard.writeText(result.post);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        title: "تم النسخ",
        description: "تم نسخ المنشور إلى الحافظة",
      });
    } catch (error) {
      toast({
        title: "فشل النسخ",
        description: "حدث خطأ أثناء نسخ النص",
        variant: "destructive",
      });
    }
  };

  const platformConfig = {
    twitter: { name: "تويتر", maxChars: 280, color: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
    facebook: { name: "فيسبوك", maxChars: 500, color: "bg-blue-700/10 text-blue-700 border-blue-700/20" },
    linkedin: { name: "لينكد إن", maxChars: 700, color: "bg-blue-600/10 text-blue-600 border-blue-600/20" },
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Share2 className="w-5 h-5 text-primary" />
          <CardTitle>منشورات وسائل التواصل</CardTitle>
        </div>
        <CardDescription>
          استخدم GPT-4o لإنشاء منشورات احترافية مخصصة لكل منصة تواصل اجتماعي
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="platform">المنصة</Label>
          <Select value={platform} onValueChange={(v) => setPlatform(v as any)}>
            <SelectTrigger data-testid="select-platform">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="twitter">تويتر (280 حرف)</SelectItem>
              <SelectItem value="facebook">فيسبوك (500 حرف)</SelectItem>
              <SelectItem value="linkedin">لينكد إن (700 حرف)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="article-title">عنوان المقال</Label>
          <Textarea
            id="article-title"
            value={articleTitle}
            onChange={(e) => setArticleTitle(e.target.value)}
            placeholder="اكتب عنوان المقال..."
            rows={2}
            className="resize-none"
            data-testid="textarea-article-title"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="article-summary">ملخص المقال</Label>
          <Textarea
            id="article-summary"
            value={articleSummary}
            onChange={(e) => setArticleSummary(e.target.value)}
            placeholder="اكتب ملخصاً للمقال..."
            rows={4}
            className="resize-none"
            data-testid="textarea-article-summary"
          />
        </div>

        <Button
          onClick={handleGenerate}
          disabled={loading || !articleTitle.trim() || !articleSummary.trim()}
          className="w-full"
          data-testid="button-generate-post"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 ml-2 animate-spin" />
              جاري الإنشاء...
            </>
          ) : (
            <>
              <Share2 className="w-4 h-4 ml-2" />
              أنشئ منشور {platformConfig[platform].name}
            </>
          )}
        </Button>

        {result && (
          <div className="space-y-3 pt-4 border-t">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">المنشور</h3>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={platformConfig[platform].color} data-testid="badge-platform">
                  {platformConfig[platform].name}
                </Badge>
                <Badge variant="outline" data-testid="badge-char-count">
                  {result.characterCount} حرف
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopy}
                  data-testid="button-copy-post"
                >
                  {copied ? (
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
            </div>
            <Card>
              <CardContent className="p-4 space-y-3">
                <p className="text-base leading-relaxed whitespace-pre-wrap" data-testid="text-post">
                  {result.post}
                </p>
                {result.hashtags && result.hashtags.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-2 border-t">
                    {result?.hashtags?.map((tag: string, idx: number) => (
                      <Badge key={idx} variant="secondary" data-testid={`badge-hashtag-${idx}`}>
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SmartImageSearch() {
  const [contentText, setContentText] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const { toast } = useToast();

  const handleSearch = async () => {
    if (!contentText.trim()) {
      toast({
        title: "خطأ",
        description: "يرجى إدخال المحتوى",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const response = await apiRequest<{
        queries: string[];
        keywords: string[];
        description: string;
      }>("/api/ai-tools/image-search", {
        method: "POST",
        body: JSON.stringify({ contentText }),
      });

      setResult(response);
      toast({
        title: "تم إنشاء الاقتراحات بنجاح",
        description: `تم توليد ${(response?.queries?.length ?? 0)} استعلامات بحث`,
      });
    } catch (error: any) {
      toast({
        title: "فشل الاقتراح",
        description: error.message || "حدث خطأ أثناء اقتراح كلمات البحث",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async (query: string, index: number) => {
    try {
      await navigator.clipboard.writeText(query);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
      toast({
        title: "تم النسخ",
        description: "تم نسخ استعلام البحث إلى الحافظة",
      });
    } catch (error) {
      toast({
        title: "فشل النسخ",
        description: "حدث خطأ أثناء نسخ النص",
        variant: "destructive",
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <ImageIcon className="w-5 h-5 text-primary" />
          <CardTitle>البحث الذكي عن الصور</CardTitle>
        </div>
        <CardDescription>
          استخدم Gemini 2.0 لاقتراح استعلامات بحث دقيقة للعثور على الصور المناسبة لمحتواك
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="content-text">محتوى المقال</Label>
          <Textarea
            id="content-text"
            value={contentText}
            onChange={(e) => setContentText(e.target.value)}
            placeholder="الصق محتوى المقال هنا لتحليله واقتراح صور مناسبة..."
            rows={6}
            className="resize-none"
            data-testid="textarea-content-text"
          />
        </div>

        <Button
          onClick={handleSearch}
          disabled={loading || !contentText.trim()}
          className="w-full"
          data-testid="button-search-images"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 ml-2 animate-spin" />
              جاري التحليل...
            </>
          ) : (
            <>
              <ImageIcon className="w-4 h-4 ml-2" />
              اقترح كلمات بحث
            </>
          )}
        </Button>

        {result && (
          <div className="space-y-4 pt-4 border-t">
            {result.description && (
              <Card className="bg-muted/50">
                <CardContent className="p-4">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-sm mb-1">الصورة المثالية</p>
                      <p className="text-sm text-muted-foreground" data-testid="text-description">
                        {result.description}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {result.queries && result.queries.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-semibold text-sm">استعلامات البحث (للاستخدام في مكتبات الصور)</h3>
                {result?.queries?.map((query: string, idx: number) => (
                  <Card key={idx} className="hover-elevate" data-testid={`card-query-${idx}`}>
                    <CardContent className="p-3 flex items-center justify-between">
                      <code className="text-sm bg-muted px-2 py-1 rounded" data-testid={`text-query-${idx}`}>
                        {query}
                      </code>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopy(query, idx)}
                        data-testid={`button-copy-query-${idx}`}
                      >
                        {copiedIndex === idx ? (
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
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {result.keywords && (result?.keywords?.length ?? 0) > 0 && (
              <div className="space-y-2">
                <h3 className="font-semibold text-sm">كلمات مفتاحية</h3>
                <div className="flex flex-wrap gap-2">
                  {result?.keywords?.map((keyword: string, idx: number) => (
                    <Badge key={idx} variant="outline" data-testid={`badge-keyword-${idx}`}>
                      {keyword}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function InstantTranslator() {
  const [text, setText] = useState("");
  const [fromLang, setFromLang] = useState("ar");
  const [toLang, setToLang] = useState("en");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const languages = [
    { value: "ar", label: "العربية" },
    { value: "en", label: "English" },
    { value: "ur", label: "اردو" },
    { value: "fr", label: "Français" },
    { value: "es", label: "Español" },
    { value: "de", label: "Deutsch" },
    { value: "tr", label: "Türkçe" },
  ];

  const handleTranslate = async () => {
    if (!text.trim()) {
      toast({
        title: "خطأ",
        description: "يرجى إدخال النص المراد ترجمته",
        variant: "destructive",
      });
      return;
    }

    if (fromLang === toLang) {
      toast({
        title: "خطأ",
        description: "يرجى اختيار لغتين مختلفتين",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const response = await apiRequest<{
        translatedText: string;
        originalLength: number;
        translatedLength: number;
      }>("/api/ai-tools/translate", {
        method: "POST",
        body: JSON.stringify({ text, fromLang, toLang }),
      });

      setResult(response);
      toast({
        title: "تمت الترجمة بنجاح",
        description: `تم ترجمة ${response.originalLength} كلمة`,
      });
    } catch (error: any) {
      toast({
        title: "فشلت الترجمة",
        description: error.message || "حدث خطأ أثناء الترجمة",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!result) return;
    
    try {
      await navigator.clipboard.writeText(result.translatedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        title: "تم النسخ",
        description: "تم نسخ الترجمة إلى الحافظة",
      });
    } catch (error) {
      toast({
        title: "فشل النسخ",
        description: "حدث خطأ أثناء نسخ النص",
        variant: "destructive",
      });
    }
  };

  const swapLanguages = () => {
    const temp = fromLang;
    setFromLang(toLang);
    setToLang(temp);
    if (result) {
      setText(result.translatedText);
      setResult(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Languages className="w-5 h-5 text-primary" />
          <CardTitle>الترجمة الفورية</CardTitle>
        </div>
        <CardDescription>
          استخدم Claude Sonnet 4-5 للترجمة الاحترافية مع الحفاظ على النبرة والأسلوب الأصلي
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div className="space-y-2">
            <Label htmlFor="from-lang">من</Label>
            <Select value={fromLang} onValueChange={setFromLang}>
              <SelectTrigger data-testid="select-from-lang">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {languages.map((lang) => (
                  <SelectItem key={lang.value} value={lang.value}>
                    {lang.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-center">
            <Button
              variant="ghost"
              size="icon"
              onClick={swapLanguages}
              data-testid="button-swap-langs"
            >
              <Languages className="w-4 h-4" />
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="to-lang">إلى</Label>
            <Select value={toLang} onValueChange={setToLang}>
              <SelectTrigger data-testid="select-to-lang">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {languages.map((lang) => (
                  <SelectItem key={lang.value} value={lang.value}>
                    {lang.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="text">النص الأصلي</Label>
          <Textarea
            id="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="اكتب أو الصق النص المراد ترجمته..."
            rows={6}
            className="resize-none"
            data-testid="textarea-translate-text"
          />
          <p className="text-xs text-muted-foreground">
            عدد الكلمات: {text.trim().split(/\s+/).filter(w => w.length > 0).length}
          </p>
        </div>

        <Button
          onClick={handleTranslate}
          disabled={loading || !text.trim() || fromLang === toLang}
          className="w-full"
          data-testid="button-translate"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 ml-2 animate-spin" />
              جاري الترجمة...
            </>
          ) : (
            <>
              <Languages className="w-4 h-4 ml-2" />
              ترجم النص
            </>
          )}
        </Button>

        {result && (
          <div className="space-y-3 pt-4 border-t">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">الترجمة</h3>
              <div className="flex items-center gap-2">
                <Badge variant="outline" data-testid="badge-translated-word-count">
                  {result.translatedLength} كلمة
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopy}
                  data-testid="button-copy-translation"
                >
                  {copied ? (
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
            </div>
            <Card>
              <CardContent className="p-4">
                <p className="text-base leading-relaxed" data-testid="text-translation">
                  {result.translatedText}
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TrendsAnalyzer() {
  const [timeframe, setTimeframe] = useState<"day" | "week" | "month">("week");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleAnalyze = async () => {
    setLoading(true);
    try {
      const response = await apiRequest<{
        trendingTopics: Array<{
          topic: string;
          relevanceScore: number;
          category: string;
          mentionCount: number;
        }>;
        keywords: Array<{
          keyword: string;
          frequency: number;
          sentiment: "positive" | "neutral" | "negative";
        }>;
        insights: {
          overallSentiment: "positive" | "neutral" | "negative";
          engagementLevel: "high" | "medium" | "low";
          summary: string;
          recommendations: string[];
        };
        timeRange: {
          from: string;
          to: string;
        };
      }>("/api/ai-tools/analyze-trends", {
        method: "POST",
        body: JSON.stringify({ timeframe, limit: 50 }),
      });

      setResult(response);
      toast({
        title: "تم التحليل بنجاح",
        description: `تم تحليل ${(response?.trendingTopics?.length ?? 0)} موضوع رائج`,
      });
    } catch (error: any) {
      toast({
        title: "فشل التحليل",
        description: error.message || "حدث خطأ أثناء تحليل الاتجاهات",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getSentimentColors = (sentiment: "positive" | "neutral" | "negative") => {
    const colors = {
      positive: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      neutral: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
      negative: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    };
    return colors[sentiment];
  };

  const getSentimentLabel = (sentiment: "positive" | "neutral" | "negative") => {
    const labels = {
      positive: "إيجابي",
      neutral: "محايد",
      negative: "سلبي",
    };
    return labels[sentiment];
  };

  const getEngagementColors = (level: "high" | "medium" | "low") => {
    const colors = {
      high: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
      medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
      low: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
    };
    return colors[level];
  };

  const getEngagementLabel = (level: "high" | "medium" | "low") => {
    const labels = {
      high: "عالي",
      medium: "متوسط",
      low: "منخفض",
    };
    return labels[level];
  };

  const getTimeframeLabel = (tf: "day" | "week" | "month") => {
    const labels = {
      day: "آخر يوم",
      week: "آخر أسبوع",
      month: "آخر شهر",
    };
    return labels[tf];
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" />
          <CardTitle>تحليل الاتجاهات والموضوعات الرائجة</CardTitle>
        </div>
        <CardDescription>
          اكتشف ما يهتم به القراء ووجّه استراتيجية المحتوى باستخدام Claude Sonnet 4-5 و Gemini 2.0 Flash
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Select value={timeframe} onValueChange={(v) => setTimeframe(v as any)}>
            <SelectTrigger className="w-[200px]" data-testid="select-timeframe">
              <SelectValue placeholder="اختر الفترة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">آخر يوم</SelectItem>
              <SelectItem value="week">آخر أسبوع</SelectItem>
              <SelectItem value="month">آخر شهر</SelectItem>
            </SelectContent>
          </Select>
          <Button
            onClick={handleAnalyze}
            disabled={loading}
            data-testid="button-analyze-trends"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                جاري التحليل...
              </>
            ) : (
              <>
                <TrendingUp className="w-4 h-4 ml-2" />
                تحليل الاتجاهات
              </>
            )}
          </Button>
        </div>

        {result && (
          <div className="space-y-6 pt-4">
            {/* Overall Insights */}
            <Card className="bg-gradient-to-br from-primary/5 to-primary/10 dark:from-transparent dark:to-transparent border-primary/20 dark:border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">الملخص العام</CardTitle>
                <CardDescription className="text-xs">
                  {getTimeframeLabel(timeframe)} ({new Date(result.timeRange.from).toLocaleDateString('ar')} - {new Date(result.timeRange.to).toLocaleDateString('ar')})
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Badge className={getSentimentColors(result.insights.overallSentiment)} data-testid="badge-overall-sentiment">
                    المشاعر العامة: {getSentimentLabel(result.insights.overallSentiment)}
                  </Badge>
                  <Badge className={getEngagementColors(result.insights.engagementLevel)} data-testid="badge-engagement-level">
                    مستوى التفاعل: {getEngagementLabel(result.insights.engagementLevel)}
                  </Badge>
                </div>
                <p className="text-sm leading-relaxed" data-testid="text-summary">
                  {result.insights.summary}
                </p>
              </CardContent>
            </Card>

            {/* Trending Topics */}
            {(result?.trendingTopics?.length ?? 0) > 0 && (
              <div className="space-y-3">
                <h3 className="font-semibold text-sm">الموضوعات الرائجة ({(result?.trendingTopics?.length ?? 0)})</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {result?.trendingTopics?.map((topic: any, index: number) => (
                    <Card key={index} data-testid={`card-topic-${index}`}>
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-2">
                          <CardTitle className="text-sm" data-testid={`text-topic-name-${index}`}>
                            {topic.topic}
                          </CardTitle>
                          <Badge variant="outline" data-testid={`badge-topic-category-${index}`}>
                            {topic.category}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">مستوى الأهمية</span>
                            <span className="font-medium" data-testid={`text-topic-score-${index}`}>
                              {topic.relevanceScore}%
                            </span>
                          </div>
                          <Progress 
                            value={topic.relevanceScore} 
                            className="h-2" 
                            data-testid={`progress-topic-${index}`}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground" data-testid={`text-topic-mentions-${index}`}>
                          عدد الإشارات: {topic.mentionCount}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Keywords */}
            {(result?.keywords?.length ?? 0) > 0 && (
              <div className="space-y-3">
                <h3 className="font-semibold text-sm">الكلمات المفتاحية ({(result?.keywords?.length ?? 0)})</h3>
                <Card>
                  <CardContent className="p-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                      {result?.keywords?.slice(0, 15).map((keyword: any, index: number) => (
                        <div 
                          key={index} 
                          className="flex items-center justify-between gap-2 p-2 rounded-md border"
                          data-testid={`item-keyword-${index}`}
                        >
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className="text-sm font-medium truncate" data-testid={`text-keyword-${index}`}>
                              {keyword.keyword}
                            </span>
                            <Badge 
                              variant="outline" 
                              className={`text-xs ${getSentimentColors(keyword.sentiment)}`}
                              data-testid={`badge-keyword-sentiment-${index}`}
                            >
                              {getSentimentLabel(keyword.sentiment)}
                            </Badge>
                          </div>
                          <span className="text-xs text-muted-foreground shrink-0" data-testid={`text-keyword-freq-${index}`}>
                            ×{keyword.frequency}
                          </span>
                        </div>
                      ))}
                    </div>
                    {(result?.keywords?.length ?? 0) > 15 && (
                      <p className="text-xs text-muted-foreground text-center mt-3">
                        وأكثر من {(result?.keywords?.length ?? 0) - 15} كلمة أخرى...
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Recommendations */}
            {(result?.insights?.recommendations?.length ?? 0) > 0 && (
              <div className="space-y-3">
                <h3 className="font-semibold text-sm">توصيات استراتيجية المحتوى</h3>
                <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-card dark:to-card border-blue-200 dark:border-border">
                  <CardContent className="p-4">
                    <ul className="space-y-2">
                      {result?.insights?.recommendations?.map((rec: string, index: number) => (
                        <li key={index} className="flex items-start gap-2 text-sm" data-testid={`text-recommendation-${index}`}>
                          <span className="text-primary mt-0.5 shrink-0">✓</span>
                          <span>{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Empty State */}
            {(result?.trendingTopics?.length ?? 0) === 0 && (result?.keywords?.length ?? 0) === 0 && (
              <Alert data-testid="alert-empty-state">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>لا توجد بيانات كافية</AlertTitle>
                <AlertDescription>
                  {result.insights.summary}
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FactChecker() {
  const [claim, setClaim] = useState("");
  const [context, setContext] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleCheck = async () => {
    if (!claim.trim()) {
      toast({
        title: "خطأ",
        description: "يرجى إدخال المعلومة المراد التحقق منها",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const response = await apiRequest<{
        overallVerdict: "credible" | "questionable" | "false";
        confidenceScore: number;
        models: Array<{
          model: string;
          verdict: "credible" | "questionable" | "false";
          confidence: number;
          reasoning: string;
          redFlags: string[];
        }>;
        consensus: string;
        recommendations: string[];
      }>("/api/ai-tools/fact-check", {
        method: "POST",
        body: JSON.stringify({ claim, context: context || undefined }),
      });

      setResult(response);
      toast({
        title: "تم التحقق بنجاح",
        description: `النتيجة: ${getVerdictLabel(response.overallVerdict)}`,
      });
    } catch (error: any) {
      toast({
        title: "فشل التحقق",
        description: error.message || "حدث خطأ أثناء التحقق من المعلومة",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getVerdictLabel = (verdict: "credible" | "questionable" | "false") => {
    const labels = {
      credible: "موثوقة",
      questionable: "مشكوك فيها",
      false: "كاذبة",
    };
    return labels[verdict];
  };

  const getVerdictColors = (verdict: "credible" | "questionable" | "false") => {
    const colors = {
      credible: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      questionable: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
      false: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    };
    return colors[verdict];
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary" />
          <CardTitle>كشف المعلومات المضللة</CardTitle>
        </div>
        <CardDescription>
          تحقق من صحة المعلومات باستخدام 3 نماذج ذكاء اصطناعي (Claude، GPT-4o، Gemini)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="claim">المعلومة المراد التحقق منها</Label>
          <Textarea
            id="claim"
            value={claim}
            onChange={(e) => setClaim(e.target.value)}
            placeholder="أدخل المعلومة أو الادعاء المراد التحقق من صحته..."
            rows={4}
            className="resize-none"
            data-testid="input-fact-claim"
          />
          <p className="text-xs text-muted-foreground">
            عدد الأحرف: {claim.length} / 5000
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="context">السياق (اختياري)</Label>
          <Textarea
            id="context"
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="أضف سياقاً إضافياً لمساعدة النماذج في التحليل..."
            rows={3}
            className="resize-none"
            data-testid="input-fact-context"
          />
        </div>

        <Button
          onClick={handleCheck}
          disabled={loading || !claim.trim()}
          className="w-full"
          data-testid="button-check-fact"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 ml-2 animate-spin" />
              جاري التحقق من المعلومة...
            </>
          ) : (
            <>
              <Shield className="w-4 h-4 ml-2" />
              تحقق من المعلومة
            </>
          )}
        </Button>

        {result && (
          <div className="space-y-4 pt-4 border-t">
            {/* Overall Verdict */}
            <div className="space-y-3">
              <h3 className="font-semibold text-sm">النتيجة النهائية</h3>
              <div className="flex items-center justify-between">
                <Badge 
                  className={getVerdictColors(result.overallVerdict)} 
                  data-testid="badge-overall-verdict"
                >
                  {getVerdictLabel(result.overallVerdict)}
                </Badge>
                <span className="text-sm text-muted-foreground" data-testid="text-confidence-score">
                  مستوى الثقة: {result.confidenceScore}%
                </span>
              </div>
              <Progress 
                value={result.confidenceScore} 
                className="h-2" 
                data-testid="progress-confidence"
              />
              <p className="text-sm text-muted-foreground" data-testid="text-consensus">
                {result.consensus}
              </p>
            </div>

            {/* Models Analysis */}
            <div className="space-y-3">
              <h3 className="font-semibold text-sm">تحليل النماذج</h3>
              <div className="grid gap-3">
                {result?.models?.map((model: any, index: number) => (
                  <Card key={index} data-testid={`card-model-${index}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm">{model.model}</CardTitle>
                        <Badge 
                          variant="outline" 
                          className={getVerdictColors(model.verdict)}
                          data-testid={`badge-model-verdict-${index}`}
                        >
                          {getVerdictLabel(model.verdict)}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">الثقة:</span>
                        <Progress value={model.confidence} className="h-1.5 flex-1" />
                        <span className="text-xs font-medium">{model.confidence}%</span>
                      </div>
                      
                      <Accordion type="single" collapsible>
                        <AccordionItem value="reasoning" className="border-0">
                          <AccordionTrigger 
                            className="py-2 text-xs hover:no-underline"
                            data-testid={`accordion-reasoning-${index}`}
                          >
                            <div className="flex items-center gap-1">
                              <ChevronDown className="h-3 w-3" />
                              <span>عرض الأسباب التفصيلية</span>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent>
                            <p className="text-xs text-muted-foreground leading-relaxed" data-testid={`text-reasoning-${index}`}>
                              {model.reasoning}
                            </p>
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>

                      {model.redFlags && model.redFlags.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs font-medium">علامات تحذيرية:</p>
                          <ul className="text-xs text-muted-foreground space-y-1">
                            {model.redFlags.map((flag: string, i: number) => (
                              <li key={i} className="flex items-start gap-1" data-testid={`text-red-flag-${index}-${i}`}>
                                <span className="text-red-500 mt-0.5">•</span>
                                <span>{flag}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            {/* Red Flags Alert */}
            {result?.models?.some((m: any) => m.redFlags && m.redFlags.length > 0) && (
              <Alert variant="destructive" data-testid="alert-red-flags">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>تحذير: علامات مشبوهة</AlertTitle>
                <AlertDescription>
                  اكتشفت النماذج بعض العلامات التحذيرية في هذه المعلومة. يرجى التحقق من المصادر الأصلية.
                </AlertDescription>
              </Alert>
            )}

            {/* Recommendations */}
            <div className="space-y-3">
              <h3 className="font-semibold text-sm">توصيات للتحقق الإضافي</h3>
              <Card>
                <CardContent className="p-4">
                  <ul className="space-y-2">
                    {result?.recommendations?.map((rec: string, index: number) => (
                      <li key={index} className="flex items-start gap-2 text-sm" data-testid={`text-recommendation-${index}`}>
                        <span className="text-primary mt-0.5">✓</span>
                        <span>{rec}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
