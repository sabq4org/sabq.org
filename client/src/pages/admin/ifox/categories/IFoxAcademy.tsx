import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { IFoxCategoryTemplate } from "@/components/admin/ifox/IFoxCategoryTemplate";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useRoleProtection } from "@/hooks/useRoleProtection";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import {
  GraduationCap,
  Plus,
  BookOpen,
  Video,
  FileText,
  Award,
  Clock,
  Users,
  Trophy,
  Star,
  Play,
  CheckCircle,
  Circle,
  Lock,
  Unlock,
  Edit,
  Trash2,
  Eye,
  TrendingUp,
  Target,
  Zap,
  Brain,
  Lightbulb,
  PenTool,
  Download,
  Share2,
  ChevronRight,
  ChevronDown,
  Code,
  Palette
} from "lucide-react";

const difficultyLevels = [
  { value: "beginner", label: "مبتدئ", color: "bg-green-500/20 text-green-400", icon: Zap },
  { value: "intermediate", label: "متوسط", color: "bg-amber-500/20 text-amber-400", icon: Brain },
  { value: "advanced", label: "متقدم", color: "bg-red-500/20 text-red-400", icon: Trophy },
];

const courseSchema = z.object({
  title: z.string().min(5, "عنوان الدورة يجب أن يكون 5 أحرف على الأقل"),
  description: z.string().min(20, "الوصف يجب أن يكون 20 حرف على الأقل"),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  duration: z.string().min(1, "يرجى تحديد مدة الدورة"),
  price: z.number().min(0),
  isFree: z.boolean(),
  thumbnail: z.string().optional(),
  objectives: z.array(z.string()).min(1, "أضف هدفاً واحداً على الأقل"),
  requirements: z.array(z.string()).optional(),
  certificateEnabled: z.boolean().default(true),
});

const lessonSchema = z.object({
  title: z.string().min(5, "عنوان الدرس يجب أن يكون 5 أحرف على الأقل"),
  description: z.string().optional(),
  moduleId: z.string(),
  order: z.number(),
  type: z.enum(["video", "text", "quiz", "exercise"]),
  content: z.string(),
  videoUrl: z.string().url().optional().or(z.literal("")),
  duration: z.string().optional(),
  isPreview: z.boolean().default(false),
});

type CourseFormData = z.infer<typeof courseSchema>;
type LessonFormData = z.infer<typeof lessonSchema>;

interface Course {
  id: string;
  title: string;
  description: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  duration: string;
  thumbnail?: string;
  students: number;
  rating: number;
  progress?: number;
  modules: Module[];
}

interface Module {
  id: string;
  title: string;
  lessons: Lesson[];
  order: number;
}

interface Lesson {
  id: string;
  title: string;
  type: "video" | "text" | "quiz" | "exercise";
  duration: string;
  completed: boolean;
  isLocked: boolean;
}

export default function IFoxAcademy() {
  useRoleProtection("admin");
  const { toast } = useToast();

  const [showCourseDialog, setShowCourseDialog] = useState(false);
  const [showLessonDialog, setShowLessonDialog] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [expandedModules, setExpandedModules] = useState<string[]>([]);
  const [objectiveInput, setObjectiveInput] = useState("");
  const [requirementInput, setRequirementInput] = useState("");

  const courseForm = useForm<CourseFormData>({
    resolver: zodResolver(courseSchema),
    defaultValues: {
      title: "",
      description: "",
      difficulty: "beginner",
      duration: "",
      price: 0,
      isFree: true,
      objectives: [],
      requirements: [],
      certificateEnabled: true,
    },
  });

  const lessonForm = useForm<LessonFormData>({
    resolver: zodResolver(lessonSchema),
    defaultValues: {
      title: "",
      description: "",
      moduleId: "",
      order: 1,
      type: "video",
      content: "",
      videoUrl: "",
      duration: "",
      isPreview: false,
    },
  });

  // Fetch courses
  const { data: courses, isLoading } = useQuery<Course[]>({
    queryKey: ["/api/admin/ifox/academy/courses"],
    queryFn: async () => {
      // Mock data for now
      return [
        {
          id: "1",
          title: "أساسيات ChatGPT للمبتدئين",
          description: "تعلم كيفية استخدام ChatGPT بفعالية من الصفر",
          difficulty: "beginner",
          duration: "3 ساعات",
          thumbnail: "#",
          students: 1234,
          rating: 4.8,
          progress: 75,
          modules: [
            {
              id: "m1",
              title: "المقدمة والأساسيات",
              order: 1,
              lessons: [
                { id: "l1", title: "مقدمة في ChatGPT", type: "video", duration: "10:23", completed: true, isLocked: false },
                { id: "l2", title: "إنشاء حساب والبدء", type: "video", duration: "5:15", completed: true, isLocked: false },
                { id: "l3", title: "واجهة المستخدم", type: "text", duration: "8 دقائق", completed: true, isLocked: false },
                { id: "l4", title: "اختبار قصير", type: "quiz", duration: "5 دقائق", completed: false, isLocked: false },
              ],
            },
            {
              id: "m2",
              title: "التطبيقات العملية",
              order: 2,
              lessons: [
                { id: "l5", title: "كتابة المحتوى", type: "video", duration: "15:42", completed: false, isLocked: false },
                { id: "l6", title: "البرمجة مع ChatGPT", type: "video", duration: "20:10", completed: false, isLocked: true },
                { id: "l7", title: "تمرين عملي", type: "exercise", duration: "30 دقيقة", completed: false, isLocked: true },
              ],
            },
          ],
        },
        {
          id: "2",
          title: "إنشاء الصور بـ Midjourney",
          description: "احترف توليد الصور الإبداعية بالذكاء الاصطناعي",
          difficulty: "intermediate",
          duration: "5 ساعات",
          students: 856,
          rating: 4.9,
          progress: 30,
          modules: [
            {
              id: "m3",
              title: "البداية مع Midjourney",
              order: 1,
              lessons: [
                { id: "l8", title: "ما هو Midjourney", type: "video", duration: "8:30", completed: true, isLocked: false },
                { id: "l9", title: "الإعداد والتثبيت", type: "video", duration: "12:45", completed: true, isLocked: false },
              ],
            },
          ],
        },
        {
          id: "3",
          title: "تطوير تطبيقات AI متقدمة",
          description: "بناء تطبيقات ذكية باستخدام أحدث تقنيات AI",
          difficulty: "advanced",
          duration: "12 ساعة",
          students: 342,
          rating: 4.7,
          modules: [],
        },
      ];
    },
  });

  // Save course mutation
  const saveCourseMutation = useMutation({
    mutationFn: async (data: CourseFormData) => {
      return apiRequest("/api/admin/ifox/academy/courses", {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      toast({
        title: "تم الحفظ",
        description: "تم حفظ الدورة بنجاح",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ifox/academy/courses"] });
      setShowCourseDialog(false);
      courseForm.reset();
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل حفظ الدورة",
        variant: "destructive",
      });
    },
  });

  // Save lesson mutation
  const saveLessonMutation = useMutation({
    mutationFn: async (data: LessonFormData) => {
      return apiRequest("/api/admin/ifox/academy/lessons", {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => {
      toast({
        title: "تم الحفظ",
        description: "تم حفظ الدرس بنجاح",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ifox/academy/courses"] });
      setShowLessonDialog(false);
      lessonForm.reset();
    },
    onError: (error: any) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل حفظ الدرس",
        variant: "destructive",
      });
    },
  });

  const toggleModule = (moduleId: string) => {
    setExpandedModules(prev =>
      prev.includes(moduleId)
        ? prev.filter(id => id !== moduleId)
        : [...prev, moduleId]
    );
  };

  const handleAddObjective = () => {
    if (objectiveInput.trim()) {
      const current = courseForm.getValues("objectives") || [];
      courseForm.setValue("objectives", [...current, objectiveInput.trim()]);
      setObjectiveInput("");
    }
  };

  const handleAddRequirement = () => {
    if (requirementInput.trim()) {
      const current = courseForm.getValues("requirements") || [];
      courseForm.setValue("requirements", [...current, requirementInput.trim()]);
      setRequirementInput("");
    }
  };

  const getLessonIcon = (type: string) => {
    switch (type) {
      case "video": return Video;
      case "text": return FileText;
      case "quiz": return Brain;
      case "exercise": return PenTool;
      default: return FileText;
    }
  };

  const stats = [
    { label: "إجمالي الدورات", value: courses?.length || 0, icon: BookOpen, trend: { value: 10, isPositive: true } },
    { label: "الطلاب النشطون", value: "2,432", icon: Users, trend: { value: 18, isPositive: true } },
    { label: "معدل الإكمال", value: "78%", icon: Target, trend: { value: 5.2, isPositive: true } },
    { label: "التقييم المتوسط", value: "4.8", icon: Star },
  ];

  const actions = [
    {
      label: "دورة جديدة",
      icon: Plus,
      onClick: () => setShowCourseDialog(true),
      variant: "default" as const,
    },
  ];

  return (
    <IFoxCategoryTemplate
      title="AI Academy - التعليم"
      description="منصة تعليمية شاملة لتعلم تقنيات الذكاء الاصطناعي"
      icon={GraduationCap}
      gradient="bg-gradient-to-br from-amber-500 to-yellow-600"
      iconColor="text-[hsl(var(--ifox-text-primary))]"
      stats={stats}
      actions={actions}
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Course List */}
        <div className="lg:col-span-2 space-y-4">
          {courses?.map((course, index) => {
            const difficultyConfig = difficultyLevels.find(d => d.value === course.difficulty);
            const DifficultyIcon = difficultyConfig?.icon || Zap;
            
            return (
              <motion.div
                key={course.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Card className="bg-gradient-to-br from-[hsl(var(--ifox-surface-overlay)/.1)] to-[hsl(var(--ifox-surface-overlay)/.05)] border-[hsl(var(--ifox-surface-overlay)/.1)] backdrop-blur-lg">
                  <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                      {/* Thumbnail */}
                      {course.thumbnail ? (
                        <img
                          src={course.thumbnail}
                          alt={course.title}
                          className="w-32 h-24 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="w-32 h-24 rounded-lg bg-gradient-to-br from-amber-500/20 to-yellow-500/20 flex items-center justify-center">
                          <GraduationCap className="h-10 w-10 text-amber-400" />
                        </div>
                      )}

                      {/* Course Info */}
                      <div className="flex-1">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <h3 className="text-xl font-bold text-[hsl(var(--ifox-text-primary))] mb-1">
                              {course.title}
                            </h3>
                            <p className="text-[hsl(var(--ifox-text-secondary))] text-sm mb-3">
                              {course.description}
                            </p>
                          </div>
                          <Badge className={cn(difficultyConfig?.color)}>
                            <DifficultyIcon className="h-3 w-3 mr-1" />
                            {difficultyConfig?.label}
                          </Badge>
                        </div>

                        {/* Stats */}
                        <div className="flex items-center gap-4 text-sm text-[hsl(var(--ifox-text-secondary))] mb-4">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {course.duration}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {course.students} طالب
                          </span>
                          <span className="flex items-center gap-1">
                            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                            {course.rating}
                          </span>
                        </div>

                        {/* Progress */}
                        {course.progress !== undefined && (
                          <div className="mb-4">
                            <div className="flex items-center justify-between text-sm mb-1">
                              <span className="text-[hsl(var(--ifox-text-secondary))]">التقدم</span>
                              <span className="text-amber-400">{course.progress}%</span>
                            </div>
                            <Progress value={course.progress} className="h-2 bg-[hsl(var(--ifox-surface-overlay)/.2)]" />
                          </div>
                        )}

                        {/* Modules */}
                        {course.modules.length > 0 && (
                          <div className="space-y-2">
                            {course.modules.map((module) => (
                              <div key={module.id} className="bg-[hsl(var(--ifox-surface-overlay)/.05)] rounded-lg">
                                <button
                                  onClick={() => toggleModule(module.id)}
                                  className="w-full p-3 flex items-center justify-between text-[hsl(var(--ifox-text-primary))] hover:bg-[hsl(var(--ifox-surface-overlay)/.1)] transition-colors rounded-lg"
                                >
                                  <div className="flex items-center gap-2">
                                    {expandedModules.includes(module.id) ? (
                                      <ChevronDown className="h-4 w-4" />
                                    ) : (
                                      <ChevronRight className="h-4 w-4" />
                                    )}
                                    <span className="font-medium">{module.title}</span>
                                  </div>
                                  <Badge variant="secondary" className="bg-[hsl(var(--ifox-surface-overlay)/.1)]">
                                    {module.lessons.length} دروس
                                  </Badge>
                                </button>

                                {expandedModules.includes(module.id) && (
                                  <div className="px-3 pb-3">
                                    {module.lessons.map((lesson) => {
                                      const LessonIcon = getLessonIcon(lesson.type);
                                      return (
                                        <div
                                          key={lesson.id}
                                          className="flex items-center justify-between p-2 hover:bg-[hsl(var(--ifox-surface-overlay)/.05)] rounded transition-colors"
                                        >
                                          <div className="flex items-center gap-3">
                                            {lesson.completed ? (
                                              <CheckCircle className="h-4 w-4 text-green-400" />
                                            ) : (
                                              <Circle className="h-4 w-4 text-[hsl(var(--ifox-text-secondary))]" />
                                            )}
                                            <LessonIcon className="h-4 w-4 text-[hsl(var(--ifox-text-secondary))]" />
                                            <span className={cn(
                                              "text-sm",
                                              lesson.completed ? "text-[hsl(var(--ifox-text-secondary))]" : "text-[hsl(var(--ifox-text-primary))]"
                                            )}>
                                              {lesson.title}
                                            </span>
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <span className="text-xs text-[hsl(var(--ifox-text-secondary))]">
                                              {lesson.duration}
                                            </span>
                                            {lesson.isLocked ? (
                                              <Lock className="h-3 w-3 text-[hsl(var(--ifox-text-secondary))]" />
                                            ) : (
                                              <Play className="h-3 w-3 text-amber-400" />
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-2 mt-4">
                          <Button
                            variant="default"
                            size="sm"
                            className="bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-600 hover:to-yellow-700"
                            onClick={() => setSelectedCourse(course)}
                          >
                            <Edit className="h-4 w-4 mr-2" />
                            تعديل
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-[hsl(var(--ifox-surface-overlay)/.2)] text-[hsl(var(--ifox-text-primary))] hover:bg-[hsl(var(--ifox-surface-overlay)/.1)]"
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            معاينة
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-[hsl(var(--ifox-text-primary))] hover:bg-[hsl(var(--ifox-surface-overlay)/.1)]"
                            onClick={() => setShowLessonDialog(true)}
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            إضافة درس
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-400 hover:bg-red-500/10 mr-auto"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Quick Stats */}
          <Card className="bg-gradient-to-br from-[hsl(var(--ifox-surface-overlay)/.1)] to-[hsl(var(--ifox-surface-overlay)/.05)] border-[hsl(var(--ifox-surface-overlay)/.1)] backdrop-blur-lg">
            <CardHeader>
              <CardTitle className="text-[hsl(var(--ifox-text-primary))] flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-amber-400" />
                إحصائيات سريعة
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-[hsl(var(--ifox-text-secondary))]">الدروس المكتملة اليوم</span>
                  <span className="text-2xl font-bold text-amber-400">47</span>
                </div>
                <Progress value={65} className="h-2 bg-[hsl(var(--ifox-surface-overlay)/.2)]" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-[hsl(var(--ifox-text-secondary))]">الشهادات الممنوحة</span>
                  <span className="text-2xl font-bold text-green-400">23</span>
                </div>
                <Progress value={80} className="h-2 bg-[hsl(var(--ifox-surface-overlay)/.2)]" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-[hsl(var(--ifox-text-secondary))]">التمارين المنجزة</span>
                  <span className="text-2xl font-bold text-blue-400">156</span>
                </div>
                <Progress value={45} className="h-2 bg-[hsl(var(--ifox-surface-overlay)/.2)]" />
              </div>
            </CardContent>
          </Card>

          {/* Popular Topics */}
          <Card className="bg-gradient-to-br from-[hsl(var(--ifox-surface-overlay)/.1)] to-[hsl(var(--ifox-surface-overlay)/.05)] border-[hsl(var(--ifox-surface-overlay)/.1)] backdrop-blur-lg">
            <CardHeader>
              <CardTitle className="text-[hsl(var(--ifox-text-primary))] flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-amber-400" />
                المواضيع الشائعة
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {[
                  { name: "ChatGPT", count: 234, icon: MessageSquare },
                  { name: "Midjourney", count: 189, icon: Palette },
                  { name: "Stable Diffusion", count: 156, icon: ImageIcon },
                  { name: "GitHub Copilot", count: 143, icon: Code },
                ].map((topic, index) => {
                  const TopicIcon = topic.icon;
                  return (
                    <div
                      key={index}
                      className="flex items-center justify-between p-2 rounded-lg hover:bg-[hsl(var(--ifox-surface-overlay)/.05)] transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <TopicIcon className="h-4 w-4 text-[hsl(var(--ifox-text-secondary))]" />
                        <span className="text-[hsl(var(--ifox-text-primary))] text-sm">{topic.name}</span>
                      </div>
                      <Badge variant="secondary" className="bg-amber-500/20 text-amber-400">
                        {topic.count}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Achievement */}
          <Card className="bg-gradient-to-br from-amber-500/20 to-yellow-500/10 border-amber-500/30">
            <CardContent className="p-6">
              <div className="text-center">
                <Award className="h-12 w-12 text-amber-400 mx-auto mb-3" />
                <h3 className="text-[hsl(var(--ifox-text-primary))] font-bold mb-2">إنجاز الأسبوع</h3>
                <p className="text-[hsl(var(--ifox-text-secondary))] text-sm mb-3">
                  تم إكمال 500+ درس هذا الأسبوع
                </p>
                <Button 
                  className="w-full bg-amber-500 hover:bg-amber-600 text-[hsl(var(--ifox-text-primary))]"
                  size="sm"
                >
                  <Trophy className="h-4 w-4 mr-2" />
                  عرض التفاصيل
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Add Course Dialog */}
      <Dialog open={showCourseDialog} onOpenChange={setShowCourseDialog}>
        <DialogContent className="max-w-3xl bg-slate-900 border-[hsl(var(--ifox-surface-overlay)/.1)] text-[hsl(var(--ifox-text-primary))] max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-2xl">إضافة دورة جديدة</DialogTitle>
            <DialogDescription className="text-[hsl(var(--ifox-text-secondary))]">
              أنشئ دورة تعليمية جديدة في أكاديمية AI
            </DialogDescription>
          </DialogHeader>

          <Form {...courseForm}>
            <form onSubmit={courseForm.handleSubmit(data => saveCourseMutation.mutate(data))} className="space-y-6">
              <Tabs defaultValue="basic" className="w-full">
                <TabsList className="w-full bg-[hsl(var(--ifox-surface-overlay)/.1)]">
                  <TabsTrigger value="basic" className="flex-1">المعلومات الأساسية</TabsTrigger>
                  <TabsTrigger value="objectives" className="flex-1">الأهداف والمتطلبات</TabsTrigger>
                  <TabsTrigger value="pricing" className="flex-1">التسعير والإعدادات</TabsTrigger>
                </TabsList>

                <TabsContent value="basic" className="space-y-4 mt-6">
                  <FormField
                    control={courseForm.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>عنوان الدورة *</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="مثال: أساسيات ChatGPT للمبتدئين"
                            className="bg-[hsl(var(--ifox-surface-overlay)/.1)] border-[hsl(var(--ifox-surface-overlay)/.2)] text-[hsl(var(--ifox-text-primary))] placeholder:text-[hsl(var(--ifox-text-secondary))]"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={courseForm.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>وصف الدورة *</FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            rows={4}
                            placeholder="وصف شامل للدورة وما سيتعلمه الطالب"
                            className="bg-[hsl(var(--ifox-surface-overlay)/.1)] border-[hsl(var(--ifox-surface-overlay)/.2)] text-[hsl(var(--ifox-text-primary))] placeholder:text-[hsl(var(--ifox-text-secondary))]"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={courseForm.control}
                      name="difficulty"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>مستوى الصعوبة *</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="bg-[hsl(var(--ifox-surface-overlay)/.1)] border-[hsl(var(--ifox-surface-overlay)/.2)] text-[hsl(var(--ifox-text-primary))]">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {difficultyLevels.map((level) => (
                                <SelectItem key={level.value} value={level.value}>
                                  {level.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={courseForm.control}
                      name="duration"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>المدة المتوقعة *</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="مثال: 5 ساعات"
                              className="bg-[hsl(var(--ifox-surface-overlay)/.1)] border-[hsl(var(--ifox-surface-overlay)/.2)] text-[hsl(var(--ifox-text-primary))] placeholder:text-[hsl(var(--ifox-text-secondary))]"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="objectives" className="space-y-4 mt-6">
                  {/* Objectives */}
                  <div className="space-y-2">
                    <Label>أهداف الدورة *</Label>
                    <div className="flex gap-2">
                      <Input
                        value={objectiveInput}
                        onChange={(e) => setObjectiveInput(e.target.value)}
                        placeholder="أضف هدفاً للدورة"
                        onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), handleAddObjective())}
                        className="bg-[hsl(var(--ifox-surface-overlay)/.1)] border-[hsl(var(--ifox-surface-overlay)/.2)] text-[hsl(var(--ifox-text-primary))] placeholder:text-[hsl(var(--ifox-text-secondary))]"
                      />
                      <Button
                        type="button"
                        onClick={handleAddObjective}
                        variant="outline"
                        className="border-[hsl(var(--ifox-surface-overlay)/.2)] text-[hsl(var(--ifox-text-primary))] hover:bg-[hsl(var(--ifox-surface-overlay)/.1)]"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {courseForm.watch("objectives")?.map((obj, index) => (
                        <div key={index} className="flex items-center gap-2 bg-amber-500/10 p-2 rounded">
                          <Target className="h-4 w-4 text-amber-400" />
                          <span className="flex-1 text-[hsl(var(--ifox-text-primary))]">{obj}</span>
                          <button
                            type="button"
                            onClick={() => {
                              const current = courseForm.getValues("objectives");
                              courseForm.setValue("objectives", current.filter((_, i) => i !== index));
                            }}
                            className="text-[hsl(var(--ifox-text-secondary))] hover:text-red-400"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Requirements */}
                  <div className="space-y-2">
                    <Label>المتطلبات المسبقة</Label>
                    <div className="flex gap-2">
                      <Input
                        value={requirementInput}
                        onChange={(e) => setRequirementInput(e.target.value)}
                        placeholder="أضف متطلباً مسبقاً (اختياري)"
                        onKeyPress={(e) => e.key === "Enter" && (e.preventDefault(), handleAddRequirement())}
                        className="bg-[hsl(var(--ifox-surface-overlay)/.1)] border-[hsl(var(--ifox-surface-overlay)/.2)] text-[hsl(var(--ifox-text-primary))] placeholder:text-[hsl(var(--ifox-text-secondary))]"
                      />
                      <Button
                        type="button"
                        onClick={handleAddRequirement}
                        variant="outline"
                        className="border-[hsl(var(--ifox-surface-overlay)/.2)] text-[hsl(var(--ifox-text-primary))] hover:bg-[hsl(var(--ifox-surface-overlay)/.1)]"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {courseForm.watch("requirements")?.map((req, index) => (
                        <div key={index} className="flex items-center gap-2 bg-blue-500/10 p-2 rounded">
                          <CheckCircle className="h-4 w-4 text-blue-400" />
                          <span className="flex-1 text-[hsl(var(--ifox-text-primary))]">{req}</span>
                          <button
                            type="button"
                            onClick={() => {
                              const current = courseForm.getValues("requirements") || [];
                              courseForm.setValue("requirements", current.filter((_, i) => i !== index));
                            }}
                            className="text-[hsl(var(--ifox-text-secondary))] hover:text-red-400"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="pricing" className="space-y-4 mt-6">
                  <FormField
                    control={courseForm.control}
                    name="isFree"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border border-[hsl(var(--ifox-surface-overlay)/.1)] p-4 bg-[hsl(var(--ifox-surface-overlay)/.05)]">
                        <div className="space-y-0.5">
                          <FormLabel>دورة مجانية</FormLabel>
                          <FormDescription className="text-[hsl(var(--ifox-text-secondary))]">
                            هل هذه الدورة متاحة مجاناً للجميع؟
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            className="border-[hsl(var(--ifox-surface-overlay)/.2)]"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  {!courseForm.watch("isFree") && (
                    <FormField
                      control={courseForm.control}
                      name="price"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>سعر الدورة</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="number"
                              placeholder="السعر بالريال"
                              onChange={(e) => field.onChange(parseFloat(e.target.value))}
                              className="bg-[hsl(var(--ifox-surface-overlay)/.1)] border-[hsl(var(--ifox-surface-overlay)/.2)] text-[hsl(var(--ifox-text-primary))] placeholder:text-[hsl(var(--ifox-text-secondary))]"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  <FormField
                    control={courseForm.control}
                    name="certificateEnabled"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border border-[hsl(var(--ifox-surface-overlay)/.1)] p-4 bg-[hsl(var(--ifox-surface-overlay)/.05)]">
                        <div className="space-y-0.5">
                          <FormLabel>شهادة إتمام</FormLabel>
                          <FormDescription className="text-[hsl(var(--ifox-text-secondary))]">
                            منح شهادة للطلاب عند إكمال الدورة
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            className="border-[hsl(var(--ifox-surface-overlay)/.2)]"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </TabsContent>
              </Tabs>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-6 border-t border-[hsl(var(--ifox-surface-overlay)/.1)]">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowCourseDialog(false)}
                  className="text-[hsl(var(--ifox-text-primary))] hover:bg-[hsl(var(--ifox-surface-overlay)/.1)]"
                >
                  إلغاء
                </Button>
                <Button
                  type="submit"
                  disabled={saveCourseMutation.isPending}
                  className="bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-600 hover:to-yellow-700"
                >
                  {saveCourseMutation.isPending ? "جاري الحفظ..." : "حفظ الدورة"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Add Lesson Dialog */}
      <Dialog open={showLessonDialog} onOpenChange={setShowLessonDialog}>
        <DialogContent className="max-w-2xl bg-slate-900 border-[hsl(var(--ifox-surface-overlay)/.1)] text-[hsl(var(--ifox-text-primary))] max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-2xl">إضافة درس جديد</DialogTitle>
            <DialogDescription className="text-[hsl(var(--ifox-text-secondary))]">
              أضف درساً جديداً إلى الدورة
            </DialogDescription>
          </DialogHeader>

          <Form {...lessonForm}>
            <form onSubmit={lessonForm.handleSubmit(data => saveLessonMutation.mutate(data))} className="space-y-6">
              <FormField
                control={lessonForm.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>عنوان الدرس *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="مثال: مقدمة في ChatGPT"
                        className="bg-[hsl(var(--ifox-surface-overlay)/.1)] border-[hsl(var(--ifox-surface-overlay)/.2)] text-[hsl(var(--ifox-text-primary))] placeholder:text-[hsl(var(--ifox-text-secondary))]"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={lessonForm.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>نوع الدرس *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-[hsl(var(--ifox-surface-overlay)/.1)] border-[hsl(var(--ifox-surface-overlay)/.2)] text-[hsl(var(--ifox-text-primary))]">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="video">فيديو</SelectItem>
                        <SelectItem value="text">نص</SelectItem>
                        <SelectItem value="quiz">اختبار</SelectItem>
                        <SelectItem value="exercise">تمرين</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {lessonForm.watch("type") === "video" && (
                <FormField
                  control={lessonForm.control}
                  name="videoUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>رابط الفيديو</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="url"
                          placeholder="https://..."
                          dir="ltr"
                          className="bg-[hsl(var(--ifox-surface-overlay)/.1)] border-[hsl(var(--ifox-surface-overlay)/.2)] text-[hsl(var(--ifox-text-primary))] placeholder:text-[hsl(var(--ifox-text-secondary))]"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={lessonForm.control}
                name="content"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>محتوى الدرس *</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        rows={6}
                        placeholder="اكتب محتوى الدرس هنا"
                        className="bg-[hsl(var(--ifox-surface-overlay)/.1)] border-[hsl(var(--ifox-surface-overlay)/.2)] text-[hsl(var(--ifox-text-primary))] placeholder:text-[hsl(var(--ifox-text-secondary))]"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={lessonForm.control}
                name="isPreview"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border border-[hsl(var(--ifox-surface-overlay)/.1)] p-4 bg-[hsl(var(--ifox-surface-overlay)/.05)]">
                    <div className="space-y-0.5">
                      <FormLabel>درس مجاني للمعاينة</FormLabel>
                      <FormDescription className="text-[hsl(var(--ifox-text-secondary))]">
                        السماح للزوار بمشاهدة هذا الدرس مجاناً
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        className="border-[hsl(var(--ifox-surface-overlay)/.2)]"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <div className="flex items-center justify-end gap-3 pt-6 border-t border-[hsl(var(--ifox-surface-overlay)/.1)]">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowLessonDialog(false)}
                  className="text-[hsl(var(--ifox-text-primary))] hover:bg-[hsl(var(--ifox-surface-overlay)/.1)]"
                >
                  إلغاء
                </Button>
                <Button
                  type="submit"
                  disabled={saveLessonMutation.isPending}
                  className="bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-600 hover:to-yellow-700"
                >
                  {saveLessonMutation.isPending ? "جاري الحفظ..." : "حفظ الدرس"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </IFoxCategoryTemplate>
  );
}