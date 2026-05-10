import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest, getCsrfToken } from "@/lib/queryClient";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { 
  Brain, 
  Sparkles, 
  FileText, 
  TrendingUp, 
  Loader2, 
  ChevronRight,
  Clock,
  Trash2,
  Download,
  CheckCircle,
  Edit,
  Eye,
  EyeOff,
  Globe
} from "lucide-react";
// Markdown content will be displayed in pre-formatted text

interface DeepAnalysis {
  id: string;
  title: string;
  topic: string;
  keywords: string[];
  status: string;
  createdAt: string;
  gptAnalysis: string | null;
  geminiAnalysis: string | null;
  claudeAnalysis: string | null;
  mergedAnalysis: string | null;
  executiveSummary: string | null;
  recommendations: string | null;
}

// Helper function to get status badge variant and text
const getStatusConfig = (status: string) => {
  switch (status) {
    case 'draft':
      return { variant: 'secondary' as const, text: 'مسودة', icon: Edit };
    case 'completed':
      return { variant: 'default' as const, text: 'جاهز للنشر', icon: CheckCircle };
    case 'published':
      return { variant: 'default' as const, text: 'منشور', icon: Globe };
    case 'archived':
      return { variant: 'outline' as const, text: 'مؤرشف', icon: EyeOff };
    default:
      return { variant: 'secondary' as const, text: status, icon: FileText };
  }
};

export default function DeepAnalysis() {
  const { toast } = useToast();
  const [location] = useLocation();
  const [topic, setTopic] = useState("");
  const [keywords, setKeywords] = useState("");
  const [category, setCategory] = useState("");
  const [saudiContext, setSaudiContext] = useState("");
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("unified");
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState({ percent: 0, message: '' });

  const urlParams = new URLSearchParams(location.split('?')[1] || '');
  const editId = urlParams.get('id') || urlParams.get('edit');

  const { data: analyses, isLoading: isLoadingList } = useQuery<{ analyses: DeepAnalysis[]; total: number }>({
    queryKey: ['/api/deep-analysis'],
  });

  const { data: selectedAnalysis } = useQuery<DeepAnalysis>({
    queryKey: ['/api/deep-analysis', selectedAnalysisId],
    enabled: !!selectedAnalysisId,
  });

  useEffect(() => {
    if (editId && !selectedAnalysisId) {
      setSelectedAnalysisId(editId);
      setActiveTab("unified");
    }
  }, [editId, selectedAnalysisId]);

  useEffect(() => {
    if (selectedAnalysis) {
      setTopic(selectedAnalysis.topic || "");
      setKeywords(selectedAnalysis.keywords?.join(', ') || "");
      setCategory("");
      setSaudiContext("");
    }
  }, [selectedAnalysis]);

  const handleGenerateWithSSE = async (data: { topic: string; keywords: string[]; category?: string; saudiContext?: string }) => {
    setIsGenerating(true);
    setProgress({ percent: 0, message: 'جاري الاتصال...' });

    try {
      const csrfToken = getCsrfToken();
      const response = await fetch('/api/deep-analysis/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        },
        credentials: 'include', // Important: include cookies for authentication
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error('فشل في بدء التوليد');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('لا يمكن قراءة الاستجابة');
      }

      let buffer = '';
      let currentEvent = '';

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          // Stream ended - ensure cleanup
          if (isGenerating) {
            setIsGenerating(false);
            setProgress({ percent: 0, message: '' });
          }
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.substring(7).trim();
          } else if (line.startsWith('data: ')) {
            try {
              const eventData = JSON.parse(line.substring(6));

              if (currentEvent === 'progress') {
                setProgress({ percent: eventData.percent, message: eventData.message });
              } else if (currentEvent === 'complete') {
                setProgress({ percent: 100, message: eventData.message });
                queryClient.invalidateQueries({ queryKey: ['/api/deep-analysis'] });
                setSelectedAnalysisId(eventData.analysis.id);
                setActiveTab("unified");
                toast({
                  title: "تم التوليد بنجاح",
                  description: "تم إنشاء التحليل العميق بنجاح",
                });
                setIsGenerating(false);
              } else if (currentEvent === 'error') {
                throw new Error(eventData.message);
              }
            } catch (e) {
              // Ignore JSON parse errors for incomplete chunks
            }
          }
        }
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "خطأ",
        description: error.message || "حدث خطأ أثناء توليد التحليل",
      });
      setIsGenerating(false);
      setProgress({ percent: 0, message: '' });
    }
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/deep-analysis/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: (_data, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ['/api/deep-analysis'] });
      if (selectedAnalysisId === deletedId) {
        setSelectedAnalysisId(null);
      }
      toast({
        title: "تم الحذف",
        description: "تم حذف التحليل بنجاح",
      });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      return apiRequest(`/api/deep-analysis/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/deep-analysis'] });
      queryClient.invalidateQueries({ queryKey: ['/api/deep-analysis', selectedAnalysisId] });
      toast({
        title: "تم التحديث",
        description: data.message || "تم تحديث حالة التحليل بنجاح",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "خطأ",
        description: error.message || "فشل تحديث الحالة",
      });
    },
  });

  const handleGenerate = () => {
    if (!topic.trim()) {
      toast({
        variant: "destructive",
        title: "خطأ",
        description: "يرجى إدخال موضوع التحليل",
      });
      return;
    }

    const keywordArray = keywords
      .split(',')
      .map(k => k.trim())
      .filter(k => k.length > 0);

    handleGenerateWithSSE({
      topic: topic.trim(),
      keywords: keywordArray,
      category: category || undefined,
      saudiContext: saudiContext || undefined,
    });
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl" dir="rtl">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Brain className="w-8 h-8 text-primary" />
          <h1 className="text-4xl font-bold">التحليل العميق الذكي</h1>
        </div>
        <p className="text-muted-foreground text-lg">
          محرك تحليل متعدد النماذج AI (GPT-5.1 + Gemini 3 + Claude) لتوليد تحليلات استراتيجية شاملة
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-3 space-y-4">
          <Card data-testid="card-analysis-settings">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5" />
                إعدادات التحليل
              </CardTitle>
              <CardDescription>قم بإعداد معايير التحليل العميق</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="topic">الموضوع *</Label>
                <Textarea
                  id="topic"
                  data-testid="input-topic"
                  placeholder="مثال: تأثير الذكاء الاصطناعي على سوق العمل السعودي..."
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  rows={4}
                  className="resize-none"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="keywords">الكلمات المفتاحية</Label>
                <Input
                  id="keywords"
                  data-testid="input-keywords"
                  placeholder="افصل بينها بفاصلة"
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  مثال: ذكاء اصطناعي، رؤية 2030، سوق العمل
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="category">التصنيف</Label>
                <Input
                  id="category"
                  data-testid="input-category"
                  placeholder="اختياري"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="saudiContext">السياق السعودي</Label>
                <Textarea
                  id="saudiContext"
                  data-testid="input-saudi-context"
                  placeholder="معلومات إضافية متعلقة بالسعودية..."
                  value={saudiContext}
                  onChange={(e) => setSaudiContext(e.target.value)}
                  rows={3}
                  className="resize-none"
                />
              </div>

              <Button
                data-testid="button-generate-analysis"
                onClick={handleGenerate}
                disabled={isGenerating || !topic.trim()}
                className="w-full"
                size="lg"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                    جاري التوليد...
                  </>
                ) : (
                  <>
                    <Brain className="w-4 h-4 ml-2" />
                    توليد تحليل عميق
                  </>
                )}
              </Button>

              {isGenerating && (
                <div className="p-3 bg-muted rounded-md space-y-2">
                  <p className="text-sm text-center text-muted-foreground">
                    {progress.message || 'يتم الآن استدعاء 3 نماذج AI بالتوازي...'}
                  </p>
                  <div className="w-full bg-background rounded-full h-2 overflow-hidden">
                    <div 
                      className="bg-primary h-full transition-all duration-500"
                      style={{ width: `${progress.percent}%` }}
                    />
                  </div>
                  <p className="text-xs text-center text-muted-foreground">
                    {progress.percent}%
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-analysis-history">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5" />
                التحليلات السابقة
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingList ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : analyses && analyses.analyses.length > 0 ? (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {analyses.analyses.map((analysis) => {
                    const statusConfig = getStatusConfig(analysis.status);
                    const StatusIcon = statusConfig.icon;
                    
                    return (
                      <div
                        key={analysis.id}
                        data-testid={`card-history-${analysis.id}`}
                        className={`p-3 rounded-md border cursor-pointer transition-colors hover-elevate ${
                          selectedAnalysisId === analysis.id ? 'bg-primary/10 border-primary' : 'bg-card'
                        }`}
                        onClick={() => setSelectedAnalysisId(analysis.id)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0 space-y-2">
                            <p className="font-medium text-sm truncate" data-testid={`text-title-${analysis.id}`}>
                              {analysis.title}
                            </p>
                            <div className="flex items-center gap-2">
                              <Badge variant={statusConfig.variant} className="text-xs" data-testid={`badge-status-${analysis.id}`}>
                                <StatusIcon className="w-3 h-3 ml-1" />
                                {statusConfig.text}
                              </Badge>
                              <p className="text-xs text-muted-foreground">
                                {new Date(analysis.createdAt).toLocaleDateString('en-US')}
                              </p>
                            </div>
                          </div>
                          <Button
                            data-testid={`button-delete-${analysis.id}`}
                            size="icon"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteMutation.mutate(analysis.id);
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8 text-sm">
                  لا توجد تحليلات سابقة
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-9">
          {selectedAnalysis ? (
            <Card data-testid="card-analysis-results">
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <CardTitle className="text-2xl" data-testid="text-selected-title">
                        {selectedAnalysis.title}
                      </CardTitle>
                      <Badge variant={getStatusConfig(selectedAnalysis.status).variant} data-testid="badge-selected-status">
                        {(() => {
                          const StatusIcon = getStatusConfig(selectedAnalysis.status).icon;
                          return <StatusIcon className="w-3 h-3 ml-1" />;
                        })()}
                        {getStatusConfig(selectedAnalysis.status).text}
                      </Badge>
                    </div>
                    <CardDescription>
                      تم الإنشاء: {new Date(selectedAnalysis.createdAt).toLocaleString('en-US')}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {/* Publish/Unpublish buttons */}
                    {selectedAnalysis.status === 'completed' && (
                      <Button
                        data-testid="button-publish"
                        variant="default"
                        onClick={() => updateStatusMutation.mutate({ id: selectedAnalysis.id, status: 'published' })}
                        disabled={updateStatusMutation.isPending}
                      >
                        <Eye className="w-4 h-4 ml-2" />
                        نشر
                      </Button>
                    )}
                    {selectedAnalysis.status === 'published' && (
                      <Button
                        data-testid="button-unpublish"
                        variant="outline"
                        onClick={() => updateStatusMutation.mutate({ id: selectedAnalysis.id, status: 'completed' })}
                        disabled={updateStatusMutation.isPending}
                      >
                        <EyeOff className="w-4 h-4 ml-2" />
                        إلغاء النشر
                      </Button>
                    )}
                    <Button size="icon" variant="outline" data-testid="button-download">
                      <Download className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                {selectedAnalysis.keywords.length > 0 && (
                  <div className="flex gap-2 flex-wrap mt-3">
                    {selectedAnalysis.keywords.map((keyword, idx) => (
                      <Badge key={idx} variant="secondary" data-testid={`badge-keyword-${idx}`}>
                        {keyword}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardHeader>
              <CardContent>
                <Tabs value={activeTab} onValueChange={setActiveTab} dir="rtl">
                  <TabsList className="grid w-full grid-cols-6">
                    <TabsTrigger value="unified" data-testid="tab-unified">
                      <FileText className="w-4 h-4 ml-2" />
                      موحد
                    </TabsTrigger>
                    <TabsTrigger value="gpt" data-testid="tab-gpt">
                      GPT-5
                    </TabsTrigger>
                    <TabsTrigger value="gemini" data-testid="tab-gemini">
                      Gemini
                    </TabsTrigger>
                    <TabsTrigger value="claude" data-testid="tab-claude">
                      Claude
                    </TabsTrigger>
                    <TabsTrigger value="summary" data-testid="tab-summary">
                      <TrendingUp className="w-4 h-4 ml-2" />
                      ملخص
                    </TabsTrigger>
                    <TabsTrigger value="recommendations" data-testid="tab-recommendations">
                      <ChevronRight className="w-4 h-4 ml-2" />
                      توصيات
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="unified" className="mt-6" data-testid="content-unified">
                    <div className="prose prose-slate dark:prose-invert max-w-none">
                      {selectedAnalysis.mergedAnalysis ? (
                        <div className="whitespace-pre-wrap text-base leading-relaxed">
                          {selectedAnalysis.mergedAnalysis}
                        </div>
                      ) : (
                        <p className="text-center text-muted-foreground py-8">
                          لا يتوفر تحليل موحد
                        </p>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="gpt" className="mt-6" data-testid="content-gpt">
                    <div className="prose prose-slate dark:prose-invert max-w-none">
                      {selectedAnalysis.gptAnalysis ? (
                        <div className="whitespace-pre-wrap text-base leading-relaxed">
                          {selectedAnalysis.gptAnalysis}
                        </div>
                      ) : (
                        <p className="text-center text-muted-foreground py-8">
                          لا يتوفر تحليل من GPT-5
                        </p>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="gemini" className="mt-6" data-testid="content-gemini">
                    <div className="prose prose-slate dark:prose-invert max-w-none">
                      {selectedAnalysis.geminiAnalysis ? (
                        <div className="whitespace-pre-wrap text-base leading-relaxed">
                          {selectedAnalysis.geminiAnalysis}
                        </div>
                      ) : (
                        <p className="text-center text-muted-foreground py-8">
                          لا يتوفر تحليل من Gemini
                        </p>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="claude" className="mt-6" data-testid="content-claude">
                    <div className="prose prose-slate dark:prose-invert max-w-none">
                      {selectedAnalysis.claudeAnalysis ? (
                        <div className="whitespace-pre-wrap text-base leading-relaxed">
                          {selectedAnalysis.claudeAnalysis}
                        </div>
                      ) : (
                        <p className="text-center text-muted-foreground py-8">
                          لا يتوفر تحليل من Claude
                        </p>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="summary" className="mt-6" data-testid="content-summary">
                    <Card className="bg-primary/5 border-primary/20">
                      <CardContent className="pt-6">
                        <div className="prose prose-slate dark:prose-invert max-w-none">
                          {selectedAnalysis.executiveSummary ? (
                            <div className="whitespace-pre-wrap text-base leading-relaxed">
                              {selectedAnalysis.executiveSummary}
                            </div>
                          ) : (
                            <p className="text-center text-muted-foreground py-8">
                              لا يتوفر ملخص تنفيذي
                            </p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="recommendations" className="mt-6" data-testid="content-recommendations">
                    <div className="space-y-3">
                      {selectedAnalysis.recommendations ? (
                        selectedAnalysis.recommendations.split('\n').filter(r => r.trim()).map((rec, idx) => (
                          <Card key={idx} className="hover-elevate" data-testid={`card-recommendation-${idx}`}>
                            <CardContent className="pt-4">
                              <div className="flex items-start gap-3">
                                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                  <span className="text-sm font-bold text-primary">
                                    {idx + 1}
                                  </span>
                                </div>
                                <p className="flex-1 pt-1">{rec}</p>
                              </div>
                            </CardContent>
                          </Card>
                        ))
                      ) : (
                        <p className="text-center text-muted-foreground py-8">
                          لا توجد توصيات
                        </p>
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-20">
                <div className="text-center">
                  <Brain className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-2xl font-semibold mb-2">ابدأ بتوليد تحليل عميق</h3>
                  <p className="text-muted-foreground max-w-md mx-auto">
                    قم بإدخال موضوع التحليل في لوحة الإعدادات على اليسار، ثم اضغط على "توليد تحليل عميق" للحصول على
                    تحليل شامل متعدد الأبعاد من 3 نماذج AI متقدمة
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
