import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { IFoxLayout } from "@/components/admin/ifox/IFoxLayout";
import { useRoleProtection } from "@/hooks/useRoleProtection";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { apiRequest, queryClient } from "@/lib/queryClient";
import mascotImage from "@assets/sabq_ai_mascot_1_1_1763712965053.png";
import {
  Bot,
  Plus,
  Calendar,
  PlayCircle,
  XCircle,
  CheckCircle,
  AlertCircle,
  Clock,
  Trash2,
  Edit,
  Zap,
  Brain,
  Image as ImageIcon,
  FileText,
  TrendingUp,
  Activity,
  Loader2
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

interface AITask {
  id: string;
  taskName: string;
  scheduledAt: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  categoryId: string;
  categoryName?: string;
  priority: 'low' | 'medium' | 'high';
  articleId?: string;
  errorMessage?: string;
  completedAt?: string;
  generateImage: boolean;
  publishAfterGeneration: boolean;
}

interface TaskStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  cancelled: number;
  total: number;
}

interface Category {
  id: string;
  nameAr: string;
  nameEn: string;
  slug: string;
  description?: string;
  icon?: string;
  color?: string;
  status?: string;
}

export default function IFoxAITasks() {
  useRoleProtection('admin');
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    scheduledAt: '',
    categoryId: '',
    generateImage: true,
    autoPublish: true,
    contentType: 'news' as const,
    keywords: '',
    tone: 'formal' as const,
  });

  // Fetch tasks with proper query params
  const { data: tasksData, isLoading: tasksLoading } = useQuery<{ tasks: AITask[], total: number }>({
    queryKey: ['/api/ai-tasks', statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') {
        params.append('status', statusFilter);
      }
      const url = `/api/ai-tasks${params.toString() ? '?' + params.toString() : ''}`;
      const response = await fetch(url, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to fetch tasks');
      }
      return response.json();
    },
  });

  // Fetch stats
  const { data: stats } = useQuery<TaskStats>({
    queryKey: ['/api/ai-tasks/stats'],
  });

  // Fetch categories for iFox
  const { data: categoriesRaw } = useQuery<Category[]>({
    queryKey: ['/api/admin/ifox/categories'],
  });
  const categories = Array.isArray(categoriesRaw) ? categoriesRaw : [];

  // Create task mutation
  const createTaskMutation = useMutation({
    mutationFn: async (taskData: typeof newTask) => {
      // Convert scheduledAt to ISO string for backend
      const scheduledAtDate = new Date(taskData.scheduledAt);
      
      return await apiRequest('/api/ai-tasks', {
        method: 'POST',
        body: JSON.stringify({
          title: taskData.title,
          description: taskData.description || undefined,
          scheduledAt: scheduledAtDate.toISOString(),
          categoryId: taskData.categoryId || undefined,
          contentType: taskData.contentType,
          locale: 'ar',
          keywords: taskData.keywords ? taskData.keywords.split(',').map(k => k.trim()).filter(Boolean) : [],
          tone: taskData.tone,
          generateImage: taskData.generateImage,
          autoPublish: taskData.autoPublish,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ai-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/ai-tasks/stats'] });
      setIsCreateDialogOpen(false);
      setNewTask({
        title: '',
        description: '',
        scheduledAt: '',
        categoryId: '',
        generateImage: true,
        autoPublish: true,
        contentType: 'news',
        keywords: '',
        tone: 'formal',
      });
      toast({
        title: "تم إنشاء المهمة",
        description: "سيتم تنفيذ المهمة تلقائياً في الوقت المحدد",
      });
    },
    onError: () => {
      toast({
        title: "خطأ",
        description: "فشل إنشاء المهمة. حاول مرة أخرى",
        variant: "destructive",
      });
    },
  });

  // Execute task mutation
  const executeTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      return await apiRequest(`/api/ai-tasks/${taskId}/execute`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ai-tasks'] });
      toast({
        title: "بدأ التنفيذ",
        description: "جاري تنفيذ المهمة الآن...",
      });
    },
  });

  // Cancel task mutation
  const cancelTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      return await apiRequest(`/api/ai-tasks/${taskId}/cancel`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ai-tasks'] });
      toast({
        title: "تم الإلغاء",
        description: "تم إلغاء المهمة بنجاح",
      });
    },
  });

  // Delete task mutation
  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      return await apiRequest(`/api/ai-tasks/${taskId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ai-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/ai-tasks/stats'] });
      toast({
        title: "تم الحذف",
        description: "تم حذف المهمة بنجاح",
      });
    },
  });

  const getStatusBadge = (status: AITask['status']) => {
    const variants = {
      pending: { variant: "outline" as const, icon: Clock, color: "text-[hsl(var(--ifox-warning))]" },
      processing: { variant: "default" as const, icon: Loader2, color: "text-[hsl(var(--ifox-info))]" },
      completed: { variant: "default" as const, icon: CheckCircle, color: "text-[hsl(var(--ifox-success))]" },
      failed: { variant: "destructive" as const, icon: AlertCircle, color: "text-[hsl(var(--ifox-error))]" },
      cancelled: { variant: "outline" as const, icon: XCircle, color: "text-[hsl(var(--ifox-text-secondary))]" },
    };
    
    const config = variants[status];
    const Icon = config.icon;
    
    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className={`w-3 h-3 ${status === 'processing' ? 'animate-spin' : ''} ${config.color}`} />
        {status === 'pending' ? 'قيد الانتظار' :
         status === 'processing' ? 'جاري التنفيذ' :
         status === 'completed' ? 'مكتمل' :
         status === 'failed' ? 'فشل' : 'ملغي'}
      </Badge>
    );
  };

  const getPriorityBadge = (priority: AITask['priority']) => {
    const colors = {
      low: 'bg-[hsl(var(--ifox-success)/.1)] text-[hsl(var(--ifox-success))]',
      medium: 'bg-[hsl(var(--ifox-warning)/.1)] text-[hsl(var(--ifox-warning))]',
      high: 'bg-[hsl(var(--ifox-error)/.1)] text-[hsl(var(--ifox-error))]',
    };
    
    return (
      <Badge variant="outline" className={colors[priority]}>
        {priority === 'low' ? 'منخفض' : priority === 'medium' ? 'متوسط' : 'عالي'}
      </Badge>
    );
  };

  const statsCards = [
    {
      title: "قيد الانتظار",
      value: stats?.pending || 0,
      icon: Clock,
      color: "from-[hsl(var(--ifox-warning)/1)] to-[hsl(var(--ifox-warning-muted)/1)]",
      description: "مهام في انتظار التنفيذ"
    },
    {
      title: "جاري التنفيذ",
      value: stats?.processing || 0,
      icon: Activity,
      color: "from-[hsl(var(--ifox-info)/1)] to-[hsl(var(--ifox-info-muted)/1)]",
      description: "مهام قيد المعالجة"
    },
    {
      title: "مكتملة",
      value: stats?.completed || 0,
      icon: CheckCircle,
      color: "from-[hsl(var(--ifox-success)/1)] to-[hsl(var(--ifox-success-muted)/1)]",
      description: "مهام تم إنجازها"
    },
    {
      title: "فشلت",
      value: stats?.failed || 0,
      icon: AlertCircle,
      color: "from-[hsl(var(--ifox-error)/1)] to-[hsl(var(--ifox-error-muted)/1)]",
      description: "مهام فشل تنفيذها"
    },
  ];

  return (
    <IFoxLayout>
      <ScrollArea className="h-full">
        <div className="flex h-full flex-col">
          <div className="p-6 space-y-6" dir="rtl">
        {/* Header with Mascot */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 relative overflow-hidden rounded-2xl bg-gradient-to-br from-[hsl(var(--ifox-accent-primary)/.2)] via-[hsl(var(--ifox-accent-secondary)/.2)] to-[hsl(var(--ifox-accent-primary)/.2)] p-8 border border-[hsl(var(--ifox-accent-primary)/.3)]"
        >
          <div className="relative z-10 flex items-center justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-[hsl(var(--ifox-accent-primary)/.2)] border border-[hsl(var(--ifox-accent-primary)/.3)]">
                  <Bot className="w-8 h-8 text-[hsl(var(--ifox-accent-primary))]" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-[hsl(var(--ifox-text-primary))]">
                    🤖 غرفة الأخبار الذكية
                  </h1>
                  <p className="text-[hsl(var(--ifox-text-primary))] mt-1">
                    إنشاء ونشر المحتوى تلقائياً باستخدام الذكاء الاصطناعي
                  </p>
                </div>
              </div>
            </div>
            
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button 
                  size="lg" 
                  className="bg-gradient-to-r from-[hsl(var(--ifox-accent-primary)/1)] to-[hsl(var(--ifox-accent-secondary)/1)] hover:from-[hsl(var(--ifox-accent-muted)/1)] hover:to-[hsl(var(--ifox-accent-muted)/1)]"
                  data-testid="button-create-task"
                >
                  <Plus className="w-5 h-5 ml-2" />
                  إنشاء مهمة جديدة
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="text-right">إنشاء مهمة AI جديدة</DialogTitle>
                  <DialogDescription className="text-right">
                    قم بجدولة مهمة لإنشاء محتوى تلقائياً باستخدام GPT-4
                  </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">عنوان المهمة</Label>
                    <Input
                      id="title"
                      placeholder="مثال: مقال عن التطورات التكنولوجية"
                      value={newTask.title}
                      onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                      data-testid="input-task-title"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="description">وصف المهمة</Label>
                    <Textarea
                      id="description"
                      placeholder="وصف تفصيلي للموضوع الذي تريد الكتابة عنه..."
                      value={newTask.description}
                      onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                      rows={4}
                      data-testid="input-task-description"
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="scheduledAt">وقت التنفيذ</Label>
                      <Input
                        id="scheduledAt"
                        type="datetime-local"
                        value={newTask.scheduledAt}
                        onChange={(e) => setNewTask({ ...newTask, scheduledAt: e.target.value })}
                        data-testid="input-scheduled-at"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="categoryId">القسم</Label>
                      <Select 
                        value={newTask.categoryId} 
                        onValueChange={(value) => setNewTask({ ...newTask, categoryId: value })}
                      >
                        <SelectTrigger data-testid="select-category">
                          <SelectValue placeholder="اختر القسم" />
                        </SelectTrigger>
                        <SelectContent>
                          {categories?.map((cat) => (
                            <SelectItem key={cat.id} value={cat.id}>
                              {cat.nameAr}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="tone">أسلوب الكتابة</Label>
                      <Select 
                        value={newTask.tone} 
                        onValueChange={(value: any) => setNewTask({ ...newTask, tone: value })}
                      >
                        <SelectTrigger data-testid="select-tone">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="formal">رسمي</SelectItem>
                          <SelectItem value="urgent">عاجل</SelectItem>
                          <SelectItem value="analytical">تحليلي</SelectItem>
                          <SelectItem value="neutral">محايد</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="contentType">نوع المحتوى</Label>
                      <Select 
                        value={newTask.contentType} 
                        onValueChange={(value: any) => setNewTask({ ...newTask, contentType: value })}
                      >
                        <SelectTrigger data-testid="select-content-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="news">خبر</SelectItem>
                          <SelectItem value="report">تقرير</SelectItem>
                          <SelectItem value="analysis">تحليل</SelectItem>
                          <SelectItem value="opinion">رأي</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="keywords">كلمات مفتاحية (مفصولة بفاصلة)</Label>
                    <Input
                      id="keywords"
                      placeholder="تكنولوجيا, ذكاء اصطناعي, ابتكار"
                      value={newTask.keywords}
                      onChange={(e) => setNewTask({ ...newTask, keywords: e.target.value })}
                      data-testid="input-keywords"
                    />
                  </div>
                  
                  <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
                    <div className="flex items-center gap-2">
                      <ImageIcon className="w-5 h-5 text-[hsl(var(--ifox-info))]" />
                      <Label htmlFor="generateImage" className="cursor-pointer">إنشاء صورة AI</Label>
                    </div>
                    <Switch
                      id="generateImage"
                      checked={newTask.generateImage}
                      onCheckedChange={(checked) => setNewTask({ ...newTask, generateImage: checked })}
                      data-testid="switch-generate-image"
                    />
                  </div>
                  
                  <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
                    <div className="flex items-center gap-2">
                      <Zap className="w-5 h-5 text-[hsl(var(--ifox-success))]" />
                      <Label htmlFor="autoPublish" className="cursor-pointer">نشر تلقائي</Label>
                    </div>
                    <Switch
                      id="autoPublish"
                      checked={newTask.autoPublish}
                      onCheckedChange={(checked) => setNewTask({ ...newTask, autoPublish: checked })}
                      data-testid="switch-auto-publish"
                    />
                  </div>
                </div>
                
                <div className="flex flex-row-reverse gap-2 justify-start" dir="rtl">
                  <Button 
                    variant="outline" 
                    onClick={() => setIsCreateDialogOpen(false)}
                    data-testid="button-cancel-task"
                  >
                    إلغاء
                  </Button>
                  <Button 
                    onClick={() => createTaskMutation.mutate(newTask)}
                    disabled={createTaskMutation.isPending || !newTask.title || !newTask.scheduledAt || !newTask.categoryId}
                    data-testid="button-save-task"
                  >
                    {createTaskMutation.isPending && <Loader2 className="w-4 h-4 ml-2 animate-spin" />}
                    إنشاء المهمة
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          
          {/* Animated Mascot */}
          <motion.img
            src={mascotImage}
            alt="iFox AI Mascot"
            className="absolute left-8 bottom-0 w-32 h-32 opacity-30"
            animate={{
              y: [0, -10, 0],
              rotate: [-5, 5, -5],
            }}
            transition={{
              duration: 4,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        </motion.div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {statsCards.map((stat, index) => (
            <motion.div
              key={stat.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Card className="overflow-hidden border-[hsl(var(--ifox-surface-overlay))] bg-[hsl(var(--ifox-surface-primary)/.8)]">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="text-sm text-[hsl(var(--ifox-text-secondary))]">{stat.title}</p>
                      <p className="text-3xl font-bold text-[hsl(var(--ifox-text-primary))]">{stat.value}</p>
                      <p className="text-xs text-[hsl(var(--ifox-text-secondary))]">{stat.description}</p>
                    </div>
                    <div className={`p-3 rounded-xl bg-gradient-to-br ${stat.color} opacity-20`}>
                      <stat.icon className="w-8 h-8 text-[hsl(var(--ifox-text-primary))]" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Tasks Table */}
        <Card className="border-[hsl(var(--ifox-surface-overlay))] bg-[hsl(var(--ifox-surface-primary)/.8)]">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-[hsl(var(--ifox-text-primary))]">المهام المجدولة</CardTitle>
                <CardDescription className="text-[hsl(var(--ifox-text-secondary))]">
                  إدارة مهام إنشاء المحتوى التلقائي
                </CardDescription>
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40" data-testid="select-status-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل المهام</SelectItem>
                  <SelectItem value="pending">قيد الانتظار</SelectItem>
                  <SelectItem value="processing">جاري التنفيذ</SelectItem>
                  <SelectItem value="completed">مكتملة</SelectItem>
                  <SelectItem value="failed">فشلت</SelectItem>
                  <SelectItem value="cancelled">ملغية</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[600px]">
              <Table>
                <TableHeader>
                  <TableRow className="border-[hsl(var(--ifox-surface-overlay))]">
                    <TableHead className="text-right text-[hsl(var(--ifox-text-primary))]">المهمة</TableHead>
                    <TableHead className="text-right text-[hsl(var(--ifox-text-primary))]">القسم</TableHead>
                    <TableHead className="text-right text-[hsl(var(--ifox-text-primary))]">الحالة</TableHead>
                    <TableHead className="text-right text-[hsl(var(--ifox-text-primary))]">الأولوية</TableHead>
                    <TableHead className="text-right text-[hsl(var(--ifox-text-primary))]">موعد التنفيذ</TableHead>
                    <TableHead className="text-right text-[hsl(var(--ifox-text-primary))]">الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tasksLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8">
                        <Loader2 className="w-8 h-8 animate-spin mx-auto text-[hsl(var(--ifox-accent-primary))]" />
                      </TableCell>
                    </TableRow>
                  ) : tasksData?.tasks.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-[hsl(var(--ifox-text-secondary))]">
                        لا توجد مهام مجدولة
                      </TableCell>
                    </TableRow>
                  ) : (
                    tasksData?.tasks.map((task) => (
                      <TableRow key={task.id} className="border-[hsl(var(--ifox-surface-overlay))] hover-elevate">
                        <TableCell className="text-[hsl(var(--ifox-text-primary))]" data-testid={`text-task-name-${task.id}`}>
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-[hsl(var(--ifox-accent-primary))]" />
                            {task.taskName}
                          </div>
                        </TableCell>
                        <TableCell className="text-[hsl(var(--ifox-text-primary))]">{task.categoryName || task.categoryId}</TableCell>
                        <TableCell>{getStatusBadge(task.status)}</TableCell>
                        <TableCell>{getPriorityBadge(task.priority)}</TableCell>
                        <TableCell className="text-[hsl(var(--ifox-text-primary))]" dir="ltr">
                          {format(new Date(task.scheduledAt), 'dd/MM/yyyy HH:mm', { locale: ar })}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            {task.status === 'pending' && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => executeTaskMutation.mutate(task.id)}
                                  disabled={executeTaskMutation.isPending}
                                  data-testid={`button-execute-${task.id}`}
                                >
                                  <PlayCircle className="w-4 h-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => cancelTaskMutation.mutate(task.id)}
                                  disabled={cancelTaskMutation.isPending}
                                  data-testid={`button-cancel-${task.id}`}
                                >
                                  <XCircle className="w-4 h-4" />
                                </Button>
                              </>
                            )}
                            {task.status !== 'processing' && (
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => deleteTaskMutation.mutate(task.id)}
                                disabled={deleteTaskMutation.isPending}
                                data-testid={`button-delete-${task.id}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                            {task.articleId && (
                              <Button
                                size="sm"
                                variant="outline"
                                asChild
                                data-testid={`button-view-article-${task.id}`}
                              >
                                <a href={`/dashboard/admin/ifox/articles/${task.articleId}`}>
                                  <FileText className="w-4 h-4" />
                                </a>
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
        </div>
      </div>
      </ScrollArea>
    </IFoxLayout>
  );
}
