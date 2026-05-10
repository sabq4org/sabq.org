import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { IFoxLayout } from "@/components/admin/ifox/IFoxLayout";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useRoleProtection } from "@/hooks/useRoleProtection";
import {
  Zap,
  Sparkles,
  Calendar,
  Clock,
  Brain,
  FileText,
  Newspaper,
  BarChart3,
  CheckCircle,
  AlertCircle,
  Loader2,
  ArrowRight,
  Wand2
} from "lucide-react";
import mascotImage from "@assets/sabq_ai_mascot_1_1_1763712965053.png";

const contentSchema = z.object({
  topic: z.string().min(10, "الموضوع يجب أن يكون 10 أحرف على الأقل"),
  description: z.string().optional(),
  contentType: z.enum(["news", "article", "analysis", "opinion"]),
  categoryId: z.string().min(1, "يجب اختيار التصنيف"),
  scheduledFor: z.string(),
  priority: z.enum(["low", "medium", "high"]),
});

type ContentRequest = z.infer<typeof contentSchema>;

interface ScheduledTask {
  id: string;
  topicIdea: string | null;
  plannedContentType: string | null;
  scheduledDate: string;
  actualPublishedAt?: string | null;
  status: string;
  createdAt: string;
}

export default function IFoxContentGenerator() {
  useRoleProtection('admin');
  const { toast } = useToast();
  const [showSuccess, setShowSuccess] = useState(false);

  const form = useForm<ContentRequest>({
    resolver: zodResolver(contentSchema),
    defaultValues: {
      topic: "",
      description: "",
      contentType: "news",
      categoryId: "112b3ebd-ab7c-424c-a2d8-ee0287df5506",
      scheduledFor: new Date(Date.now() + 3600000).toISOString().slice(0, 16), // 1 hour from now
      priority: "medium",
    },
  });

  // Fetch iFox categories
  const { data: ifoxCategoriesRaw } = useQuery<any[]>({
    queryKey: ["/api/ifox/ai-management/categories"],
  });
  const ifoxCategories = Array.isArray(ifoxCategoriesRaw) ? ifoxCategoriesRaw : [];

  // Fetch scheduled tasks
  const { data: scheduledTasksRaw, isLoading } = useQuery<ScheduledTask[]>({
    queryKey: ["/api/ifox/ai-management/calendar"],
  });
  const scheduledTasks = Array.isArray(scheduledTasksRaw) ? scheduledTasksRaw : [];

  // Create task mutation
  const createTaskMutation = useMutation({
    mutationFn: async (data: ContentRequest) => {
      return await apiRequest("/api/ifox/ai-management/calendar", {
        method: "POST",
        body: JSON.stringify({
          scheduledDate: new Date(data.scheduledFor),
          slot: new Date(data.scheduledFor).getHours() < 12 ? "morning" : 
                 new Date(data.scheduledFor).getHours() < 17 ? "afternoon" : 
                 new Date(data.scheduledFor).getHours() < 21 ? "evening" : "night",
          topicIdea: data.topic,
          aiSuggestion: data.description || "",
          plannedContentType: data.contentType,
          categoryId: data.categoryId,
          assignmentType: "ai",
          status: "planned",
          keywords: [],
          suggestedCategories: [],
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ifox/ai-management/calendar"] });
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
      form.reset();
      toast({
        title: "✨ تم جدولة المهمة بنجاح",
        description: "سيتم معالجة المحتوى تلقائياً في الوقت المحدد",
      });
    },
    onError: (error: any) => {
      toast({
        title: "خطأ في الجدولة",
        description: error.message || "حدث خطأ أثناء جدولة المهمة",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ContentRequest) => {
    createTaskMutation.mutate(data);
  };

  // Helper function to format date in Riyadh timezone (UTC+3)
  // Uses browser's timezone-aware toLocaleString instead of manual offset math
  const formatRiyadhTime = (utcDate: string) => {
    const date = new Date(utcDate);
    return date.toLocaleString('ar-SA-u-ca-gregory', {
      timeZone: 'Asia/Riyadh',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }) + ' (الرياض)';
  };

  const contentTypeIcons = {
    news: Newspaper,
    article: FileText,
    analysis: BarChart3,
    opinion: Brain,
  };

  const priorityColors = {
    low: "from-[hsl(var(--ifox-info)/1)] to-[hsl(var(--ifox-info-muted)/1)]",
    medium: "from-[hsl(var(--ifox-warning)/1)] to-[hsl(var(--ifox-warning-muted)/1)]",
    high: "from-[hsl(var(--ifox-error)/1)] to-[hsl(var(--ifox-error-muted)/1)]",
  };

  // Filter tasks by status
  const plannedTasks = scheduledTasks.filter(task => task.status === 'planned' || task.status === 'in_progress');
  const completedTasks = scheduledTasks.filter(task => task.status === 'completed');

  return (
    <IFoxLayout>
      <ScrollArea className="h-full">
        <div className="p-6 space-y-6" dir="rtl">
            {/* Header */}
            <motion.div
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="space-y-2"
            >
              <div className="flex items-center gap-4">
                {/* Animated AI Mascot */}
                <motion.div
                  className="relative"
                  animate={{
                    y: [0, -8, 0],
                    rotate: [0, 2, -2, 0],
                  }}
                  transition={{
                    duration: 4,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                >
                  <motion.div
                    className="absolute inset-0 rounded-full blur-xl opacity-60"
                    animate={{
                      scale: [1, 1.2, 1],
                      opacity: [0.4, 0.7, 0.4],
                    }}
                    transition={{
                      duration: 3,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                    style={{
                      background: "radial-gradient(circle, hsl(var(--ifox-error-glow) / 0.6), hsl(var(--ifox-accent-glow-secondary) / 0.6))",
                    }}
                  />
                  <img 
                    src={mascotImage} 
                    alt="iFox AI" 
                    className="w-20 h-20 relative z-10"
                    style={{ filter: 'drop-shadow(0 25px 50px hsl(var(--ifox-surface-overlay) / 0.2))' }}
                  />
                </motion.div>

                <div>
                  <h1 className="text-3xl font-bold bg-gradient-to-r from-[hsl(var(--ifox-accent-primary)/1)] to-[hsl(var(--ifox-accent-secondary)/1)] bg-clip-text text-transparent">
                    محرك المحتوى الذكي
                  </h1>
                  <p className="text-[hsl(var(--ifox-text-primary))] text-lg">
                    أنشئ محتوى احترافي بالذكاء الاصطناعي - جدوله وانتظر النتيجة
                  </p>
                </div>

                <motion.div
                  className="mr-auto flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-[hsl(var(--ifox-accent-primary)/.2)] to-[hsl(var(--ifox-accent-secondary)/.2)] border border-[hsl(var(--ifox-accent-primary)/.3)]"
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <motion.div
                    className="w-2 h-2 rounded-full bg-[hsl(var(--ifox-accent-primary))]"
                    animate={{
                      opacity: [0.5, 1, 0.5],
                      boxShadow: [
                        "0 0 5px hsl(var(--ifox-error-glow) / 0.5)",
                        "0 0 15px hsl(var(--ifox-error))",
                        "0 0 5px hsl(var(--ifox-error-glow) / 0.5)",
                      ],
                    }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  />
                  <span className="text-xs font-medium text-[hsl(var(--ifox-accent-primary))]">تجريبي</span>
                  <Sparkles className="w-3 h-3 text-[hsl(var(--ifox-accent-primary))]" />
                </motion.div>
              </div>
            </motion.div>

            {/* Success Animation */}
            {showSuccess && (
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50"
              >
                <Card className="bg-gradient-to-br from-[hsl(var(--ifox-success)/.9)] to-[hsl(var(--ifox-success-muted)/.9)] border-[hsl(var(--ifox-success)/.5)] backdrop-blur-lg shadow-[0_25px_50px_hsl(var(--ifox-surface-overlay)/.2)]">
                  <CardContent className="p-8 text-center">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: [0, 1.2, 1] }}
                      transition={{ duration: 0.5 }}
                    >
                      <CheckCircle className="w-16 h-16 text-[hsl(var(--ifox-text-primary))] mx-auto mb-4" />
                    </motion.div>
                    <h3 className="text-2xl font-bold text-[hsl(var(--ifox-text-primary))] mb-2">تم بنجاح! ✨</h3>
                    <p className="text-[hsl(var(--ifox-text-primary))]">المهمة مجدولة وجاهزة للمعالجة</p>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Main Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Request Form */}
              <motion.div
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.1 }}
              >
                <Card className="bg-[hsl(var(--ifox-surface-primary)/.8)] border-[hsl(var(--ifox-surface-overlay))] backdrop-blur-lg">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-[hsl(var(--ifox-text-primary))] font-bold">
                      <Wand2 className="w-5 h-5 text-[hsl(var(--ifox-accent-primary))]" />
                      طلب محتوى جديد
                    </CardTitle>
                    <CardDescription className="text-[hsl(var(--ifox-text-secondary))]">
                      اكتب ما تريد والذكاء الاصطناعي سيقوم بالباقي
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Form {...form}>
                      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        {/* Topic */}
                        <FormField
                          control={form.control}
                          name="topic"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-[hsl(var(--ifox-text-primary))]">موضوع المحتوى *</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="مثال: أحدث تطورات الذكاء الاصطناعي في 2024"
                                  className="bg-[hsl(var(--ifox-surface-muted)/.7)] border-[hsl(var(--ifox-surface-overlay))] text-[hsl(var(--ifox-text-primary))] placeholder:text-[hsl(var(--ifox-text-secondary))]"
                                  data-testid="input-topic"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        {/* Description */}
                        <FormField
                          control={form.control}
                          name="description"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-[hsl(var(--ifox-text-primary))]">تفاصيل إضافية (اختياري)</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder="أضف أي تفاصيل أو توجيهات للذكاء الاصطناعي..."
                                  className="bg-[hsl(var(--ifox-surface-muted)/.7)] border-[hsl(var(--ifox-surface-overlay))] text-[hsl(var(--ifox-text-primary))] placeholder:text-[hsl(var(--ifox-text-secondary))] min-h-[100px]"
                                  data-testid="input-description"
                                  {...field}
                                />
                              </FormControl>
                              <FormDescription className="text-[hsl(var(--ifox-text-secondary))] text-xs">
                                كلما كانت التفاصيل أكثر، كان المحتوى أفضل
                              </FormDescription>
                            </FormItem>
                          )}
                        />

                        {/* Content Type */}
                        <FormField
                          control={form.control}
                          name="contentType"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-[hsl(var(--ifox-text-primary))]">نوع المحتوى *</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger className="bg-[hsl(var(--ifox-surface-muted)/.7)] border-[hsl(var(--ifox-surface-overlay))] text-[hsl(var(--ifox-text-primary))]" data-testid="select-content-type">
                                    <SelectValue />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="news">
                                    <div className="flex items-center gap-2">
                                      <Newspaper className="w-4 h-4" />
                                      <span>خبر</span>
                                    </div>
                                  </SelectItem>
                                  <SelectItem value="article">
                                    <div className="flex items-center gap-2">
                                      <FileText className="w-4 h-4" />
                                      <span>مقال</span>
                                    </div>
                                  </SelectItem>
                                  <SelectItem value="analysis">
                                    <div className="flex items-center gap-2">
                                      <BarChart3 className="w-4 h-4" />
                                      <span>تحليل</span>
                                    </div>
                                  </SelectItem>
                                  <SelectItem value="opinion">
                                    <div className="flex items-center gap-2">
                                      <Brain className="w-4 h-4" />
                                      <span>رأي</span>
                                    </div>
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            </FormItem>
                          )}
                        />

                        {/* Category */}
                        <FormField
                          control={form.control}
                          name="categoryId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-[hsl(var(--ifox-text-primary))]">التصنيف *</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger 
                                    className="bg-[hsl(var(--ifox-surface-muted)/.7)] border-[hsl(var(--ifox-surface-overlay))] text-[hsl(var(--ifox-text-primary))]" 
                                    data-testid="select-category"
                                  >
                                    <SelectValue />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {ifoxCategories.map((category) => (
                                    <SelectItem key={category.id} value={category.id}>
                                      {category.name_ar}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        {/* Scheduling */}
                        <div className="grid grid-cols-2 gap-4">
                          <FormField
                            control={form.control}
                            name="scheduledFor"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-[hsl(var(--ifox-text-primary))]">موعد التنفيذ *</FormLabel>
                                <FormControl>
                                  <Input
                                    type="datetime-local"
                                    className="bg-[hsl(var(--ifox-surface-muted)/.7)] border-[hsl(var(--ifox-surface-overlay))] text-[hsl(var(--ifox-text-primary))]"
                                    data-testid="input-scheduled-for"
                                    {...field}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="priority"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-[hsl(var(--ifox-text-primary))]">الأولوية *</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                  <FormControl>
                                    <SelectTrigger className="bg-[hsl(var(--ifox-surface-muted)/.7)] border-[hsl(var(--ifox-surface-overlay))] text-[hsl(var(--ifox-text-primary))]" data-testid="select-priority">
                                      <SelectValue />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="low">منخفضة</SelectItem>
                                    <SelectItem value="medium">متوسطة</SelectItem>
                                    <SelectItem value="high">عالية</SelectItem>
                                  </SelectContent>
                                </Select>
                              </FormItem>
                            )}
                          />
                        </div>

                        {/* Submit Button */}
                        <Button
                          type="submit"
                          className="w-full bg-gradient-to-r from-[hsl(var(--ifox-accent-primary)/1)] to-[hsl(var(--ifox-accent-secondary)/1)] hover:from-[hsl(var(--ifox-accent-primary)/1)] hover:to-[hsl(var(--ifox-accent-secondary)/1)] text-[hsl(var(--ifox-text-primary))] font-bold"
                          disabled={createTaskMutation.isPending}
                          data-testid="button-submit"
                        >
                          {createTaskMutation.isPending ? (
                            <>
                              <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                              جاري الجدولة...
                            </>
                          ) : (
                            <>
                              <Zap className="w-4 h-4 ml-2" />
                              جدولة المهمة
                              <ArrowRight className="w-4 h-4 mr-2" />
                            </>
                          )}
                        </Button>
                      </form>
                    </Form>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Scheduled Tasks */}
              <motion.div
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                <Card className="bg-[hsl(var(--ifox-surface-primary)/.8)] border-[hsl(var(--ifox-surface-overlay))] backdrop-blur-lg">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-[hsl(var(--ifox-text-primary))] font-bold">
                      <Calendar className="w-5 h-5 text-[hsl(var(--ifox-accent-primary))]" />
                      المهام المجدولة
                    </CardTitle>
                    <CardDescription className="text-[hsl(var(--ifox-text-secondary))]">
                      {plannedTasks.length} مهمة في الانتظار
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[500px]">
                      <div className="space-y-3">
                        {isLoading ? (
                          <div className="text-center py-12 text-[hsl(var(--ifox-text-secondary))]">
                            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                            جاري التحميل...
                          </div>
                        ) : plannedTasks.length === 0 ? (
                          <div className="text-center py-12">
                            <AlertCircle className="w-12 h-12 text-[hsl(var(--ifox-text-secondary))] mx-auto mb-3" />
                            <p className="text-[hsl(var(--ifox-text-secondary))]">لا توجد مهام مجدولة حالياً</p>
                            <p className="text-[hsl(var(--ifox-text-secondary))] text-sm mt-1">ابدأ بإنشاء مهمة جديدة من النموذج</p>
                          </div>
                        ) : (
                          plannedTasks.map((task, index) => {
                            const ContentIcon = contentTypeIcons[task.plannedContentType as keyof typeof contentTypeIcons] || FileText;
                            const statusColors = {
                              planned: "from-[hsl(var(--ifox-info)/1)] to-[hsl(var(--ifox-info-muted)/1)]",
                              in_progress: "from-[hsl(var(--ifox-warning)/1)] to-[hsl(var(--ifox-warning-muted)/1)]",
                              completed: "from-[hsl(var(--ifox-success)/1)] to-[hsl(var(--ifox-success-muted)/1)]",
                              cancelled: "from-[hsl(var(--ifox-error)/1)] to-[hsl(var(--ifox-error-muted)/1)]",
                            };

                            return (
                              <motion.div
                                key={task.id}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.05 }}
                                className="p-4 rounded-lg bg-[hsl(var(--ifox-surface-muted)/.7)] border border-[hsl(var(--ifox-surface-overlay))] hover:border-[hsl(var(--ifox-surface-overlay))] transition-all"
                                data-testid={`task-${task.id}`}
                              >
                                <div className="flex items-start justify-between mb-2">
                                  <div className="flex items-start gap-3 flex-1">
                                    <div className={`p-2 rounded-lg bg-gradient-to-r ${statusColors[task.status as keyof typeof statusColors] || statusColors.planned}`}>
                                      <ContentIcon className="w-4 h-4 text-[hsl(var(--ifox-text-primary))]" />
                                    </div>
                                    <div className="flex-1">
                                      <h4 className="text-[hsl(var(--ifox-text-primary))] font-semibold mb-1 line-clamp-2">
                                        {task.topicIdea || 'محتوى جديد'}
                                      </h4>
                                      <div className="flex items-center gap-3 text-xs text-[hsl(var(--ifox-text-secondary))]">
                                        <span className="flex items-center gap-1">
                                          <Clock className="w-3 h-3" />
                                          {formatRiyadhTime(task.scheduledDate)}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                  <div className={`px-2 py-1 rounded-full text-xs font-medium text-[hsl(var(--ifox-text-primary))] bg-gradient-to-r ${statusColors[task.status as keyof typeof statusColors] || statusColors.planned}`}>
                                    {task.status === 'planned' && 'مجدولة'}
                                    {task.status === 'in_progress' && 'قيد المعالجة'}
                                    {task.status === 'completed' && 'مكتملة'}
                                    {task.status === 'cancelled' && 'ملغاة'}
                                  </div>
                                </div>
                              </motion.div>
                            );
                          })
                        )}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </motion.div>
            </div>

            {/* Info Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="bg-gradient-to-br from-[hsl(var(--ifox-info)/.2)] to-[hsl(var(--ifox-info)/.2)] border-[hsl(var(--ifox-info)/.3)] backdrop-blur-sm">
                <CardContent className="p-4 text-center">
                  <Brain className="w-8 h-8 text-[hsl(var(--ifox-info))] mx-auto mb-2" />
                  <h3 className="font-bold text-[hsl(var(--ifox-text-primary))] mb-1">ذكاء اصطناعي متقدم</h3>
                  <p className="text-xs text-[hsl(var(--ifox-text-primary))]">محتوى احترافي بجودة عالية</p>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-[hsl(var(--ifox-accent-primary)/.2)] to-[hsl(var(--ifox-accent-secondary)/.2)] border-[hsl(var(--ifox-accent-primary)/.3)] backdrop-blur-sm">
                <CardContent className="p-4 text-center">
                  <Calendar className="w-8 h-8 text-[hsl(var(--ifox-accent-primary))] mx-auto mb-2" />
                  <h3 className="font-bold text-[hsl(var(--ifox-text-primary))] mb-1">جدولة تلقائية</h3>
                  <p className="text-xs text-[hsl(var(--ifox-text-primary))]">حدد الوقت ودع النظام يعمل</p>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-[hsl(var(--ifox-warning)/.2)] to-[hsl(var(--ifox-warning)/.2)] border-[hsl(var(--ifox-warning)/.3)] backdrop-blur-sm">
                <CardContent className="p-4 text-center">
                  <Sparkles className="w-8 h-8 text-[hsl(var(--ifox-warning))] mx-auto mb-2" />
                  <h3 className="font-bold text-[hsl(var(--ifox-text-primary))] mb-1">نتائج فورية</h3>
                  <p className="text-xs text-[hsl(var(--ifox-text-primary))]">محتوى جاهز للنشر مباشرة</p>
                </CardContent>
              </Card>
            </div>

            {/* Completed Tasks Section */}
            {completedTasks.length > 0 && (
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3 }}
              >
                <Card className="bg-gradient-to-br from-[hsl(var(--ifox-success)/.1)] to-[hsl(var(--ifox-success)/.1)] border-[hsl(var(--ifox-success)/.3)] backdrop-blur-lg">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-[hsl(var(--ifox-text-primary))] font-bold">
                      <CheckCircle className="w-5 h-5 text-[hsl(var(--ifox-success))]" />
                      المهام المكتملة
                    </CardTitle>
                    <CardDescription className="text-[hsl(var(--ifox-text-primary))]">
                      {completedTasks.length} مهمة تم إنجازها بنجاح
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[300px]">
                      <div className="space-y-3">
                        {completedTasks.map((task, index) => {
                          const ContentIcon = contentTypeIcons[task.plannedContentType as keyof typeof contentTypeIcons] || FileText;
                          
                          return (
                            <motion.div
                              key={task.id}
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: index * 0.05 }}
                              className="p-4 rounded-lg bg-[hsl(var(--ifox-success)/.05)] border border-[hsl(var(--ifox-success)/.2)] hover:border-[hsl(var(--ifox-success)/.4)] transition-all"
                              data-testid={`completed-task-${task.id}`}
                            >
                              <div className="flex items-start gap-3">
                                <div className="p-2 rounded-lg bg-gradient-to-r from-[hsl(var(--ifox-success)/1)] to-[hsl(var(--ifox-success-muted)/1)]">
                                  <ContentIcon className="w-4 h-4 text-[hsl(var(--ifox-text-primary))]" />
                                </div>
                                <div className="flex-1">
                                  <h4 className="text-[hsl(var(--ifox-text-primary))] font-semibold mb-1 line-clamp-2">
                                    {task.topicIdea || 'محتوى جديد'}
                                  </h4>
                                  <div className="flex items-center gap-3 text-xs text-[hsl(var(--ifox-text-primary))]">
                                    <span className="flex items-center gap-1">
                                      <Clock className="w-3 h-3" />
                                      {task.actualPublishedAt 
                                        ? `تم النشر: ${formatRiyadhTime(task.actualPublishedAt)}`
                                        : `مجدول: ${formatRiyadhTime(task.scheduledDate)}`
                                      }
                                    </span>
                                  </div>
                                </div>
                                <CheckCircle className="w-5 h-5 text-[hsl(var(--ifox-success))]" />
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </div>
        </ScrollArea>
    </IFoxLayout>
  );
}
