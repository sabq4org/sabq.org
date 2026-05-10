import { useState, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Upload,
  FileSpreadsheet,
  BarChart3,
  FileText,
  Send,
  Loader2,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  PieChart,
  LineChart,
  Download,
  Sparkles,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { RichTextEditor } from "@/components/RichTextEditor";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  BarChart,
  Bar,
  PieChart as RechartsPie,
  Pie,
  LineChart as RechartsLine,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { DataStorySource, DataStoryAnalysis, DataStoryDraft } from "@shared/schema";

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

export default function DataStoryGenerator() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user, isLoading: isUserLoading } = useAuth({ redirectToLogin: true });
  
  // State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedSource, setUploadedSource] = useState<DataStorySource | null>(null);
  const [currentAnalysis, setCurrentAnalysis] = useState<DataStoryAnalysis | null>(null);
  const [currentDraft, setCurrentDraft] = useState<DataStoryDraft | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftSubtitle, setDraftSubtitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [draftExcerpt, setDraftExcerpt] = useState("");
  const [activeTab, setActiveTab] = useState("upload");
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch user's data sources
  const { data: sourcesRaw } = useQuery<DataStorySource[]>({
    queryKey: ["/api/data-stories/sources"],
    enabled: !!user,
  });
  const sources = Array.isArray(sourcesRaw) ? sourcesRaw : [];

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch('/api/data-stories/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'فشل رفع الملف');
      }
      
      return response.json();
    },
    onSuccess: (data: DataStorySource) => {
      setUploadedSource(data);
      setActiveTab("analyze");
      toast({
        title: "تم رفع الملف بنجاح",
        description: `تم تحليل ${data.rowCount} صف و ${data.columnCount} عمود`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/data-stories/sources"] });
    },
    onError: (error: Error) => {
      toast({
        title: "خطأ في رفع الملف",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Analyze mutation
  const analyzeMutation = useMutation({
    mutationFn: async (sourceId: string) => {
      return apiRequest(`/api/data-stories/${sourceId}/analyze`, {
        method: 'POST',
      });
    },
    onSuccess: (data: DataStoryAnalysis) => {
      setCurrentAnalysis(data);
      setActiveTab("insights");
      toast({
        title: "تم تحليل البيانات",
        description: "تم إنشاء الرؤى والمخططات بنجاح",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "خطأ في التحليل",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Generate story mutation
  const generateStoryMutation = useMutation({
    mutationFn: async (analysisId: string) => {
      return apiRequest(`/api/data-stories/${analysisId}/generate-story`, {
        method: 'POST',
      });
    },
    onSuccess: (data: DataStoryDraft) => {
      setCurrentDraft(data);
      setDraftTitle(data.title);
      setDraftSubtitle(data.subtitle || "");
      setDraftContent(data.content);
      setDraftExcerpt(data.excerpt || "");
      setActiveTab("story");
      toast({
        title: "تم إنشاء القصة",
        description: "تم كتابة القصة الإخبارية بنجاح",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "خطأ في إنشاء القصة",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update draft mutation
  const updateDraftMutation = useMutation({
    mutationFn: async () => {
      if (!currentDraft) throw new Error('لا يوجد مسودة');
      
      return apiRequest(`/api/data-stories/drafts/${currentDraft.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: draftTitle,
          subtitle: draftSubtitle,
          content: draftContent,
          excerpt: draftExcerpt,
        }),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: () => {
      toast({
        title: "تم حفظ التعديلات",
        description: "تم حفظ المسودة بنجاح",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "خطأ في الحفظ",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Convert to article mutation
  const convertToArticleMutation = useMutation({
    mutationFn: async () => {
      if (!currentDraft) throw new Error('لا يوجد مسودة');
      
      return apiRequest(`/api/data-stories/drafts/${currentDraft.id}/convert`, {
        method: 'POST',
      });
    },
    onSuccess: (data: any) => {
      toast({
        title: "تم تحويل القصة إلى مقال",
        description: "يمكنك الآن تحرير ونشر المقال",
      });
      navigate(`/dashboard/articles/${data.articleId}/edit`);
    },
    onError: (error: Error) => {
      toast({
        title: "خطأ في التحويل",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // File handling
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file) {
      const validTypes = [
        'text/csv',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/json'
      ];
      
      if (validTypes.includes(file.type)) {
        setSelectedFile(file);
      } else {
        toast({
          title: "نوع ملف غير مدعوم",
          description: "يرجى رفع ملف CSV أو Excel أو JSON",
          variant: "destructive",
        });
      }
    }
  }, [toast]);

  const handleUpload = () => {
    if (selectedFile) {
      uploadMutation.mutate(selectedFile);
    }
  };

  const handleAnalyze = () => {
    if (uploadedSource) {
      analyzeMutation.mutate(uploadedSource.id);
    }
  };

  const handleGenerateStory = () => {
    if (currentAnalysis) {
      generateStoryMutation.mutate(currentAnalysis.id);
    }
  };

  const handleSaveDraft = () => {
    updateDraftMutation.mutate();
  };

  const handleConvertToArticle = () => {
    convertToArticleMutation.mutate();
  };

  // Render charts
  const renderCharts = () => {
    if (!currentAnalysis?.chartConfigs) return null;

    const charts = currentAnalysis.chartConfigs as any[];
    
    return charts.map((chart, index) => {
      const chartData = chart.data || [];
      
      return (
        <Card key={index} data-testid={`card-chart-${index}`}>
          <CardHeader>
            <CardTitle className="text-lg">{chart.title}</CardTitle>
            {chart.description && (
              <CardDescription>{chart.description}</CardDescription>
            )}
          </CardHeader>
          <CardContent>
            {chart.type === 'bar' && (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey={chart.xAxis || 'name'} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey={chart.yAxis || 'value'} fill="#0088FE">
                    {chartData.map((entry: any, i: number) => (
                      <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
            
            {chart.type === 'pie' && (
              <ResponsiveContainer width="100%" height={300}>
                <RechartsPie>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={(entry) => entry.name}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey={chart.valueKey || 'value'}
                  >
                    {chartData.map((entry: any, i: number) => (
                      <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                </RechartsPie>
              </ResponsiveContainer>
            )}
            
            {chart.type === 'line' && (
              <ResponsiveContainer width="100%" height={300}>
                <RechartsLine data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey={chart.xAxis || 'name'} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey={chart.yAxis || 'value'}
                    stroke="#0088FE"
                    strokeWidth={2}
                  />
                </RechartsLine>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      );
    });
  };

  // Loading state
  if (isUserLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin" data-testid="loader-auth" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div dir="rtl" className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-page-title">
              مولد القصص من البيانات
            </h1>
            <p className="text-muted-foreground mt-1" data-testid="text-page-description">
              حول بياناتك إلى قصص إخبارية جذابة باستخدام الذكاء الاصطناعي
            </p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4" data-testid="tabs-workflow">
            <TabsTrigger value="upload" data-testid="tab-upload">
              <Upload className="h-4 w-4 ml-2" />
              رفع البيانات
            </TabsTrigger>
            <TabsTrigger 
              value="analyze" 
              disabled={!uploadedSource}
              data-testid="tab-analyze"
            >
              <BarChart3 className="h-4 w-4 ml-2" />
              التحليل
            </TabsTrigger>
            <TabsTrigger 
              value="insights" 
              disabled={!currentAnalysis}
              data-testid="tab-insights"
            >
              <TrendingUp className="h-4 w-4 ml-2" />
              الرؤى
            </TabsTrigger>
            <TabsTrigger 
              value="story" 
              disabled={!currentDraft}
              data-testid="tab-story"
            >
              <FileText className="h-4 w-4 ml-2" />
              القصة
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="space-y-4">
            <Card data-testid="card-upload">
              <CardHeader>
                <CardTitle>رفع ملف البيانات</CardTitle>
                <CardDescription>
                  قم برفع ملف CSV أو Excel أو JSON يحتوي على بياناتك
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div
                  className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                    isDragging
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover-elevate'
                  }`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  data-testid="dropzone-file"
                >
                  <FileSpreadsheet className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  {selectedFile ? (
                    <div className="space-y-2">
                      <p className="font-medium" data-testid="text-selected-file">
                        {selectedFile.name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {(selectedFile.size / 1024).toFixed(2)} KB
                      </p>
                      <Button
                        onClick={() => setSelectedFile(null)}
                        variant="outline"
                        size="sm"
                        data-testid="button-clear-file"
                      >
                        إزالة
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-lg">
                        اسحب وأفلت ملفك هنا، أو
                      </p>
                      <Button
                        onClick={() => fileInputRef.current?.click()}
                        variant="outline"
                        data-testid="button-browse-file"
                      >
                        اختر ملف
                      </Button>
                      <p className="text-sm text-muted-foreground">
                        يدعم: CSV, Excel (.xlsx), JSON
                      </p>
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.xlsx,.xls,.json"
                    onChange={handleFileSelect}
                    className="hidden"
                    data-testid="input-file"
                  />
                </div>

                {selectedFile && (
                  <Button
                    onClick={handleUpload}
                    disabled={uploadMutation.isPending}
                    className="w-full"
                    data-testid="button-upload"
                  >
                    {uploadMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                        جاري الرفع...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 ml-2" />
                        رفع الملف
                      </>
                    )}
                  </Button>
                )}
              </CardContent>
            </Card>

            {sources.length > 0 && (
              <Card data-testid="card-recent-uploads">
                <CardHeader>
                  <CardTitle>الملفات المرفوعة مؤخراً</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {sources.slice(0, 5).map((source) => (
                      <div
                        key={source.id}
                        className="flex items-center justify-between p-3 border rounded-md hover-elevate"
                        data-testid={`item-source-${source.id}`}
                      >
                        <div>
                          <p className="font-medium">{source.fileName}</p>
                          <p className="text-sm text-muted-foreground">
                            {source.rowCount} صف × {source.columnCount} عمود
                          </p>
                        </div>
                        <Badge variant={source.parseStatus === 'completed' ? 'default' : 'secondary'}>
                          {source.parseStatus === 'completed' ? 'جاهز' : source.parseStatus}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="analyze" className="space-y-4">
            <Card data-testid="card-analyze-data">
              <CardHeader>
                <CardTitle>تحليل البيانات</CardTitle>
                <CardDescription>
                  سنقوم بتحليل بياناتك وإنشاء الرؤى والمخططات
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {uploadedSource && (
                  <div className="space-y-4">
                    <div className="p-4 bg-muted rounded-lg">
                      <h3 className="font-medium mb-2" data-testid="text-source-name">
                        {uploadedSource.fileName}
                      </h3>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">عدد الصفوف:</span>{' '}
                          <span className="font-medium">{uploadedSource.rowCount}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">عدد الأعمدة:</span>{' '}
                          <span className="font-medium">{uploadedSource.columnCount}</span>
                        </div>
                      </div>
                    </div>

                    {uploadedSource.columns && (
                      <div>
                        <h4 className="font-medium mb-2">الأعمدة:</h4>
                        <div className="flex flex-wrap gap-2">
                          {(Array.isArray(uploadedSource.columns) ? uploadedSource.columns : []).map((col: any, idx) => (
                            <Badge key={idx} variant="secondary" data-testid={`badge-column-${idx}`}>
                              {typeof col === 'string' ? col : col.name || String(col)}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    <Button
                      onClick={handleAnalyze}
                      disabled={analyzeMutation.isPending}
                      className="w-full"
                      data-testid="button-analyze"
                    >
                      {analyzeMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                          جاري التحليل...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4 ml-2" />
                          تحليل البيانات بالذكاء الاصطناعي
                        </>
                      )}
                    </Button>

                    {analyzeMutation.isPending && (
                      <div className="space-y-2">
                        <Progress value={33} data-testid="progress-analyze" />
                        <p className="text-sm text-muted-foreground text-center">
                          جاري تحليل البيانات وإنشاء الرؤى...
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="insights" className="space-y-4">
            {currentAnalysis && (
              <>
                <Card data-testid="card-insights">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>الرؤى والتحليلات</CardTitle>
                        <CardDescription>
                          رؤى ذكية تم إنشاؤها من بياناتك
                        </CardDescription>
                      </div>
                      <Badge variant="default" data-testid="badge-analysis-status">
                        <CheckCircle2 className="h-3 w-3 ml-1" />
                        مكتمل
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {currentAnalysis.aiInsights && Array.isArray(currentAnalysis.aiInsights) && currentAnalysis.aiInsights.length > 0 && (
                      <div className="space-y-3">
                        {currentAnalysis.aiInsights.map((insight: any, idx: number) => (
                          <div
                            key={idx}
                            className="p-4 border rounded-lg"
                            data-testid={`item-insight-${idx}`}
                          >
                            <h4 className="font-medium mb-1">{insight.title || insight.heading}</h4>
                            <p className="text-sm text-muted-foreground">
                              {insight.description || insight.text}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}

                    <Button
                      onClick={handleGenerateStory}
                      disabled={generateStoryMutation.isPending}
                      className="w-full"
                      data-testid="button-generate-story"
                    >
                      {generateStoryMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                          جاري إنشاء القصة...
                        </>
                      ) : (
                        <>
                          <FileText className="h-4 w-4 ml-2" />
                          إنشاء قصة إخبارية
                        </>
                      )}
                    </Button>

                    {generateStoryMutation.isPending && (
                      <div className="space-y-2">
                        <Progress value={66} data-testid="progress-generate" />
                        <p className="text-sm text-muted-foreground text-center">
                          جاري كتابة القصة الإخبارية...
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <div className="grid gap-4 md:grid-cols-2">
                  {renderCharts()}
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="story" className="space-y-4">
            {currentDraft && (
              <>
                <Card data-testid="card-story-editor">
                  <CardHeader>
                    <CardTitle>تحرير القصة</CardTitle>
                    <CardDescription>
                      قم بتحرير القصة قبل تحويلها إلى مقال
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="title">العنوان</Label>
                      <Input
                        id="title"
                        value={draftTitle}
                        onChange={(e) => setDraftTitle(e.target.value)}
                        placeholder="عنوان القصة"
                        data-testid="input-title"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="subtitle">العنوان الفرعي</Label>
                      <Input
                        id="subtitle"
                        value={draftSubtitle}
                        onChange={(e) => setDraftSubtitle(e.target.value)}
                        placeholder="العنوان الفرعي (اختياري)"
                        data-testid="input-subtitle"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="excerpt">المقدمة</Label>
                      <Textarea
                        id="excerpt"
                        value={draftExcerpt}
                        onChange={(e) => setDraftExcerpt(e.target.value)}
                        placeholder="مقدمة مختصرة للقصة"
                        rows={3}
                        data-testid="input-excerpt"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>المحتوى</Label>
                      <RichTextEditor
                        content={draftContent}
                        onChange={setDraftContent}
                        placeholder="محتوى القصة..."
                      />
                    </div>

                    <div className="flex gap-2">
                      <Button
                        onClick={handleSaveDraft}
                        disabled={updateDraftMutation.isPending}
                        variant="outline"
                        data-testid="button-save-draft"
                      >
                        {updateDraftMutation.isPending ? (
                          <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4 ml-2" />
                        )}
                        حفظ المسودة
                      </Button>

                      <Button
                        onClick={handleConvertToArticle}
                        disabled={convertToArticleMutation.isPending}
                        className="flex-1"
                        data-testid="button-convert-article"
                      >
                        {convertToArticleMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                            جاري التحويل...
                          </>
                        ) : (
                          <>
                            <Send className="h-4 w-4 ml-2" />
                            تحويل إلى مقال
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {currentDraft.outline && Array.isArray(currentDraft.outline) && currentDraft.outline.length > 0 && (
                  <Card data-testid="card-story-outline">
                    <CardHeader>
                      <CardTitle>هيكل القصة</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {currentDraft.outline.map((section: any, idx: number) => (
                          <div key={idx} className="p-3 border rounded-md" data-testid={`item-outline-${idx}`}>
                            <p className="font-medium">{section.title || section.heading}</p>
                            {section.points && Array.isArray(section.points) && (
                              <ul className="text-sm text-muted-foreground mt-1 mr-4 list-disc">
                                {section.points.map((point: string, i: number) => (
                                  <li key={i}>{point}</li>
                                ))}
                              </ul>
                            )}
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
