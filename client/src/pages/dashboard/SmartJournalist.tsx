import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { 
  Bot, 
  Send, 
  Sparkles, 
  FileText, 
  Image as ImageIcon, 
  Type,
  CheckCircle2,
  Loader2,
  Eye,
  Copy,
  Download
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

interface JournalistTask {
  id: string;
  prompt: string;
  status: "pending" | "processing" | "completed" | "failed";
  progress: number;
  currentStep: string | null;
  result: {
    draft?: {
      title: string;
      content: string;
      metadata: {
        wordCount: number;
        estimatedReadTime: number;
        tone: string;
        complexity: string;
      };
    };
    mediaResults?: {
      query: string;
      images: Array<{
        url: string;
        description: string;
        alt: string;
        source: string;
      }>;
      totalFound: number;
    };
    headlines?: Array<{
      text: string;
      style: string;
      aiModel: string;
    }>;
    researchSummary?: string;
    analysis?: string;
  } | null;
  createdAt: string;
  completedAt: string | null;
  errorMessage: string | null;
}

export default function SmartJournalist() {
  const { toast } = useToast();
  const [prompt, setPrompt] = useState("");
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<JournalistTask | null>(null);

  // Fetch recent tasks
  const { data: recentTasksRaw, isLoading: tasksLoading } = useQuery<JournalistTask[]>({
    queryKey: ["/api/journalist-tasks/recent"],
    refetchInterval: (query) => {
      const tasks = query.state.data as JournalistTask[] | undefined;
      if (!tasks) return false;
      const hasActiveTask = tasks.some(t => t.status === "pending" || t.status === "processing");
      return hasActiveTask ? 3000 : false; // Poll every 3 seconds if there's an active task
    },
  });
  const recentTasks = Array.isArray(recentTasksRaw) ? recentTasksRaw : [];

  // Get active task for real-time progress
  const activeTask = recentTasks.find(t => t.id === activeTaskId);

  // Create task mutation
  const createTaskMutation = useMutation({
    mutationFn: async (taskPrompt: string) => {
      return await apiRequest("/api/journalist-tasks", {
        method: "POST",
        body: JSON.stringify({ prompt: taskPrompt }),
      });
    },
    onSuccess: (data: JournalistTask) => {
      setActiveTaskId(data.id);
      queryClient.invalidateQueries({ queryKey: ["/api/journalist-tasks/recent"] });
      toast({ 
        title: "تم إنشاء المهمة", 
        description: "بدأ الوكيل الذكي العمل على مهمتك"
      });
      setPrompt(""); // Clear the prompt
    },
    onError: () => {
      toast({ 
        title: "حدث خطأ", 
        description: "فشل في إنشاء المهمة", 
        variant: "destructive" 
      });
    },
  });

  const handleSubmit = () => {
    if (!prompt.trim()) {
      toast({ 
        title: "تنبيه", 
        description: "يرجى إدخال وصف للمهمة الصحفية", 
        variant: "destructive" 
      });
      return;
    }
    createTaskMutation.mutate(prompt);
  };

  const getStatusBadge = (status: JournalistTask["status"]) => {
    switch (status) {
      case "pending":
        return <Badge variant="secondary" data-testid={`status-pending`}><Loader2 className="h-3 w-3 mr-1 animate-spin" /> في الانتظار</Badge>;
      case "processing":
        return <Badge variant="default" data-testid={`status-processing`}><Loader2 className="h-3 w-3 mr-1 animate-spin" /> جاري المعالجة</Badge>;
      case "completed":
        return <Badge variant="outline" className="bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300 border-green-300 dark:border-green-700" data-testid={`status-completed`}><CheckCircle2 className="h-3 w-3 mr-1" /> مكتمل</Badge>;
      case "failed":
        return <Badge variant="destructive" data-testid={`status-failed`}>فشل</Badge>;
      default:
        return null;
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "تم النسخ", description: "تم نسخ المحتوى إلى الحافظة" });
  };

  const openPreview = (task: JournalistTask) => {
    setSelectedTask(task);
    setPreviewDialogOpen(true);
  };

  return (
    <DashboardLayout>
      <div className="mx-auto w-full max-w-[1600px] space-y-6 px-4 pb-10 sm:px-6" dir="rtl">
        <DashboardPageHeader
          icon={Bot}
          title="الوكيل الصحفي الذكي"
          description="اطلب من الوكيل الذكي إنشاء مقالات صحفية كاملة مع البحث والتحليل والوسائط والعناوين"
        />

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Input Panel */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  مهمة صحفية جديدة
                </CardTitle>
                <CardDescription>
                  اشرح للوكيل الذكي ما تريد كتابته. مثال: "اكتب مقالاً تحليلياً عن تأثير الذكاء الاصطناعي على صناعة الإعلام في السعودية"
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="prompt">وصف المهمة الصحفية</Label>
                  <Textarea
                    id="prompt"
                    placeholder="اكتب وصفاً تفصيلياً للمقال الذي تريد إنشاءه..."
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    className="min-h-32 resize-none"
                    disabled={createTaskMutation.isPending}
                    data-testid="input-task-prompt"
                  />
                </div>
                <Button
                  onClick={handleSubmit}
                  disabled={createTaskMutation.isPending || !prompt.trim()}
                  className="w-full"
                  size="lg"
                  data-testid="button-submit-task"
                >
                  {createTaskMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                      جاري الإنشاء...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 ml-2" />
                      إنشاء المقال
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Active Task Progress */}
            {activeTask && (activeTask.status === "pending" || activeTask.status === "processing") && (
              <Card className="border-primary/50 dark:border-border">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      جاري العمل على المهمة
                    </span>
                    {getStatusBadge(activeTask.status)}
                  </CardTitle>
                  <CardDescription className="line-clamp-2">{activeTask.prompt}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">التقدم</span>
                      <span className="font-medium">{activeTask.progress}%</span>
                    </div>
                    <Progress value={activeTask.progress} className="h-2" />
                  </div>
                  {activeTask.currentStep && (
                    <div className="bg-muted/50 rounded-lg p-3">
                      <p className="text-sm text-muted-foreground">الخطوة الحالية:</p>
                      <p className="text-sm font-medium mt-1">{activeTask.currentStep}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Recent Tasks Sidebar */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle>المهام الأخيرة</CardTitle>
                <CardDescription>آخر المهام التي تم إنشاؤها</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[600px] pr-4">
                  {tasksLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : recentTasks.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p className="text-sm">لا توجد مهام بعد</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {recentTasks.map((task) => (
                        <Card 
                          key={task.id} 
                          className={`hover-elevate cursor-pointer ${task.id === activeTaskId ? 'border-primary dark:border-border dark:bg-muted/60' : ''}`}
                          onClick={() => task.status === "completed" && openPreview(task)}
                          data-testid={`task-card-${task.id}`}
                        >
                          <CardContent className="p-4 space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-medium line-clamp-2 flex-1">
                                {task.prompt}
                              </p>
                              {getStatusBadge(task.status)}
                            </div>
                            {task.status === "processing" && task.progress !== undefined && (
                              <Progress value={task.progress} className="h-1" />
                            )}
                            {task.status === "completed" && task.result?.draft && (
                              <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t">
                                <FileText className="h-3 w-3" />
                                <span>{task.result?.draft?.metadata?.wordCount} كلمة</span>
                                <Separator orientation="vertical" className="h-3" />
                                {task.result?.headlines && (
                                  <>
                                    <Type className="h-3 w-3" />
                                    <span>{task.result?.headlines?.length} عنوان</span>
                                  </>
                                )}
                                {task.result?.mediaResults && task.result?.mediaResults?.images?.length > 0 && (
                                  <>
                                    <Separator orientation="vertical" className="h-3" />
                                    <ImageIcon className="h-3 w-3" />
                                    <span>{task.result?.mediaResults?.images?.length} صورة</span>
                                  </>
                                )}
                              </div>
                            )}
                            {task.status === "failed" && task.errorMessage && (
                              <p className="text-xs text-destructive mt-2">{task.errorMessage}</p>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Preview Dialog */}
      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              معاينة المقال
            </DialogTitle>
            <DialogDescription>
              {selectedTask?.prompt}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh]">
            {selectedTask?.result && (
              <div className="space-y-6 p-1">
                {/* Headlines */}
                {selectedTask.result?.headlines && selectedTask.result?.headlines?.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="font-semibold flex items-center gap-2">
                      <Type className="h-4 w-4" />
                      العناوين المقترحة
                    </h3>
                    <div className="space-y-2">
                      {selectedTask.result?.headlines?.map((headline, idx) => (
                        <Card key={idx} className="hover-elevate">
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1">
                                <p className="font-medium">{headline.text}</p>
                                <div className="flex items-center gap-2 mt-2">
                                  <Badge variant="secondary" className="text-xs">
                                    {headline.style}
                                  </Badge>
                                  <span className="text-xs text-muted-foreground">
                                    {headline.aiModel}
                                  </span>
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => copyToClipboard(headline.text)}
                                data-testid={`button-copy-headline-${idx}`}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {/* Draft Article */}
                {selectedTask.result?.draft && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        مسودة المقال
                      </h3>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(selectedTask.result?.draft?.content || '')}
                        data-testid="button-copy-draft"
                      >
                        <Copy className="h-3 w-3 ml-2" />
                        نسخ المحتوى
                      </Button>
                    </div>
                    <Card>
                      <CardContent className="p-6 space-y-4">
                        <div>
                          <h2 className="text-2xl font-bold">{selectedTask.result?.draft?.title}</h2>
                          <div className="flex items-center gap-3 mt-3 text-sm text-muted-foreground">
                            <span>{selectedTask.result?.draft?.metadata?.wordCount} كلمة</span>
                            <Separator orientation="vertical" className="h-4" />
                            <span>{selectedTask.result?.draft?.metadata?.estimatedReadTime} دقيقة قراءة</span>
                            <Separator orientation="vertical" className="h-4" />
                            <Badge variant="secondary" className="text-xs">
                              {selectedTask.result?.draft?.metadata?.tone}
                            </Badge>
                          </div>
                        </div>
                        <Separator />
                        <div 
                          className="prose prose-sm max-w-none dark:prose-invert"
                          style={{ whiteSpace: 'pre-wrap' }}
                        >
                          {selectedTask.result?.draft?.content}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}

                {/* Media Results */}
                {selectedTask.result?.mediaResults && selectedTask.result?.mediaResults?.images?.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="font-semibold flex items-center gap-2">
                      <ImageIcon className="h-4 w-4" />
                      الصور المقترحة ({selectedTask.result?.mediaResults?.images?.length})
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      {selectedTask.result?.mediaResults?.images?.map((img, idx) => (
                        <Card key={idx} className="overflow-hidden hover-elevate">
                          <div className="aspect-video bg-muted relative">
                            <img
                              src={img.url}
                              alt={img.alt}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          </div>
                          <CardContent className="p-3">
                            <p className="text-sm font-medium line-clamp-2">{img.description}</p>
                            <p className="text-xs text-muted-foreground mt-1">{img.source}</p>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
