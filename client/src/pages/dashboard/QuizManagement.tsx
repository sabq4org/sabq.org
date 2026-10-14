import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plus,
  Trash2,
  GripVertical,
  Brain,
  Save,
  ArrowRight,
  Search,
  CheckCircle2,
  FileQuestion,
  Clock,
  Sparkles,
  RefreshCw,
  X,
  FileText,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, apiUrl, queryClient } from "@/lib/queryClient";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import type { Article } from "@shared/schema";

interface QuizQuestion {
  question: string;
  choices: string[];
  correctIndex: number;
  explanation?: string;
}

interface QuizFormData {
  title: string;
  description: string;
  passingScore: number;
  showCorrectAnswers: boolean;
  allowRetake: boolean;
  questions: QuizQuestion[];
}

type QuestionFilter = "all" | "active" | "inactive";

export default function QuizManagement() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [selectedArticleId, setSelectedArticleId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<QuestionFilter>("all");
  const [formData, setFormData] = useState<QuizFormData>({
    title: "اختبر فهمك للمقال",
    description: "أجب على الأسئلة التالية لاختبار فهمك للمحتوى",
    passingScore: 70,
    showCorrectAnswers: true,
    allowRetake: true,
    questions: [
      {
        question: "",
        choices: ["", "", "", ""],
        correctIndex: 0,
        explanation: "",
      },
    ],
  });

  // Fetch published articles
  const {
    data: articlesData,
    isLoading: isLoadingArticles,
    isFetching: isFetchingArticles,
    refetch: refetchArticles,
  } = useQuery<{ articles: Article[]; total: number }>({
    queryKey: ["/api/articles", { status: "published", limit: 50, search: searchQuery }],
    queryFn: async () => {
      const params = new URLSearchParams({
        status: "published",
        limit: "50",
        ...(searchQuery && { search: searchQuery }),
      });
      const res = await fetch(apiUrl(`/api/articles?${params}`), { credentials: "include" });
      return res.json();
    },
  });

  const articles = useMemo(
    () => (Array.isArray(articlesData?.articles) ? articlesData.articles : []),
    [articlesData]
  );

  // Check if selected article has quiz
  const { data: existingQuiz, isLoading: isLoadingQuiz } = useQuery({
    queryKey: ["/api/admin/articles", selectedArticleId, "quiz"],
    queryFn: async () => {
      if (!selectedArticleId) return null;
      const res = await fetch(apiUrl(`/api/admin/articles/${selectedArticleId}/quiz`), {
        credentials: "include",
      });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!selectedArticleId,
  });

  // Create quiz mutation
  const createMutation = useMutation({
    mutationFn: async (data: QuizFormData) => {
      const res = await apiRequest(`/api/articles/${selectedArticleId}/quiz`, {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      });
      return res;
    },
    onSuccess: () => {
      toast({
        title: "تم بنجاح",
        description: "تم إنشاء الاختبار بنجاح",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/articles", selectedArticleId, "quiz"] });
    },
    onError: (error: Error) => {
      toast({
        title: "خطأ",
        description: error.message || "فشل إنشاء الاختبار",
        variant: "destructive",
      });
    },
  });

  const questions = useMemo(
    () => (Array.isArray(formData.questions) ? formData.questions : []),
    [formData.questions]
  );

  const isQuestionComplete = (q: QuizQuestion) => {
    const choices = Array.isArray(q.choices) ? q.choices : [];
    const filledChoices = choices.filter((c) => c && c.trim().length > 0);
    return Boolean(q.question && q.question.trim().length > 0 && filledChoices.length >= 2);
  };

  const kpiStats = useMemo(() => {
    const existingQuestions = Array.isArray((existingQuiz as any)?.questions)
      ? (existingQuiz as any).questions
      : [];
    const completedQuestionsCount = questions.filter(isQuestionComplete).length;
    const incompleteQuestionsCount = Math.max(0, questions.length - completedQuestionsCount);
    const hasExistingQuiz = Boolean(existingQuiz);
    const totalQuizzes = hasExistingQuiz ? 1 : 1;
    const activeQuizzes = hasExistingQuiz ? 1 : completedQuestionsCount > 0 && selectedArticleId ? 1 : 0;
    const inactiveQuizzes = hasExistingQuiz ? 0 : activeQuizzes === 0 ? 1 : 0;
    const totalQuestionsCount = questions.length + existingQuestions.length;

    return {
      totalQuizzes,
      activeQuizzes,
      inactiveQuizzes,
      totalQuestionsCount: questions.length,
      savedQuestionsCount: existingQuestions.length,
      completedQuestionsCount,
      incompleteQuestionsCount,
      totalQuizQuestionsCombined: totalQuestionsCount,
    };
  }, [existingQuiz, questions, selectedArticleId]);

  const filteredQuestionsWithIndex = useMemo(() => {
    return questions
      .map((question, originalIndex) => ({
        question,
        originalIndex,
        complete: isQuestionComplete(question),
      }))
      .filter((item) => {
        if (statusFilter === "active") return item.complete;
        if (statusFilter === "inactive") return !item.complete;
        return true;
      });
  }, [questions, statusFilter]);

  const addQuestion = () => {
    setFormData((prev) => {
      const currentQuestions = Array.isArray(prev.questions) ? prev.questions : [];
      return {
        ...prev,
        questions: [
          ...currentQuestions,
          {
            question: "",
            choices: ["", "", "", ""],
            correctIndex: 0,
            explanation: "",
          },
        ],
      };
    });
  };

  const removeQuestion = (index: number) => {
    if (questions.length <= 1) {
      toast({
        title: "تنبيه",
        description: "يجب أن يحتوي الاختبار على سؤال واحد على الأقل",
        variant: "destructive",
      });
      return;
    }
    setFormData((prev) => {
      const currentQuestions = Array.isArray(prev.questions) ? prev.questions : [];
      return {
        ...prev,
        questions: currentQuestions.filter((_, i) => i !== index),
      };
    });
  };

  const updateQuestion = (index: number, field: keyof QuizQuestion, value: string | number | string[]) => {
    setFormData((prev) => {
      const currentQuestions = Array.isArray(prev.questions) ? prev.questions : [];
      return {
        ...prev,
        questions: currentQuestions.map((q, i) =>
          i === index ? { ...q, [field]: value } : q
        ),
      };
    });
  };

  const updateChoice = (questionIndex: number, choiceIndex: number, value: string) => {
    setFormData((prev) => {
      const currentQuestions = Array.isArray(prev.questions) ? prev.questions : [];
      return {
        ...prev,
        questions: currentQuestions.map((q, i) => {
          if (i !== questionIndex) return q;
          const currentChoices = Array.isArray(q.choices) ? q.choices : [];
          return {
            ...q,
            choices: currentChoices.map((c, ci) => (ci === choiceIndex ? value : c)),
          };
        }),
      };
    });
  };

  const handleSubmit = () => {
    if (!selectedArticleId) {
      toast({
        title: "تنبيه",
        description: "يرجى اختيار مقال أولاً",
        variant: "destructive",
      });
      return;
    }

    // Validate questions
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.question.trim()) {
        toast({
          title: "تنبيه",
          description: `يرجى إدخال نص السؤال ${i + 1}`,
          variant: "destructive",
        });
        return;
      }
      const choices = Array.isArray(q.choices) ? q.choices : [];
      const filledChoices = choices.filter((c) => c.trim());
      if (filledChoices.length < 2) {
        toast({
          title: "تنبيه",
          description: `يجب أن يحتوي السؤال ${i + 1} على خيارين على الأقل`,
          variant: "destructive",
        });
        return;
      }
    }

    createMutation.mutate(formData);
  };

  const selectedArticle = articles.find((a) => a.id === selectedArticleId);

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-[1600px] space-y-6 p-4 md:p-6 pb-10" dir="rtl">
        {/* Unified Header */}
        <DashboardPageHeader
          icon={Brain}
          titleTestId="heading-title"
          title={
            <span className="inline-flex flex-wrap items-center gap-2">
              <span>إدارة اختبارات المقالات</span>
              <Badge variant="secondary" className="text-xs font-medium tabular-nums">
                {articles.length} مقال
              </Badge>
            </span>
          }
          description="أضف اختبارات واستبيانات تفاعلية لمقالاتك لقياس تفاعل القراء واستيعاب المحتوى"
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLocation("/dashboard/articles")}
                className="gap-1.5"
                data-testid="button-back"
              >
                <ArrowRight className="h-4 w-4" />
                <span>العودة للمقالات</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchArticles()}
                disabled={isFetchingArticles}
                className="gap-1.5"
                data-testid="button-refresh-quizzes"
              >
                <RefreshCw className={`h-4 w-4 ${isFetchingArticles ? "animate-spin" : ""}`} />
                <span>تحديث</span>
              </Button>
            </div>
          }
        />

        {/* 4-Card KPI Summary Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4" data-testid="kpi-strip-quizzes">
          <Card className="rounded-xl border-border/60 shadow-xs">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground">
                    إجمالي الاستبيانات/الاختبارات
                  </p>
                  <p
                    className="text-2xl font-bold tracking-tight tabular-nums"
                    data-testid="stat-total-quizzes"
                  >
                    {kpiStats.totalQuizzes}
                  </p>
                </div>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Brain className="h-4 w-4 sm:h-5 sm:w-5" />
                </span>
              </div>
              <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="tabular-nums">{articles.length}</span>
                <span>مقال منشور متاح للربط</span>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-xl border-border/60 shadow-xs">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground">نشطة</p>
                  <p
                    className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400 tabular-nums"
                    data-testid="stat-active-quizzes"
                  >
                    {kpiStats.activeQuizzes}
                  </p>
                </div>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5" />
                </span>
              </div>
              <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="tabular-nums">{kpiStats.completedQuestionsCount}</span>
                <span>سؤال مكتمل وجاهز للنشر</span>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-xl border-border/60 shadow-xs">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground">غير نشطة</p>
                  <p
                    className="text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400 tabular-nums"
                    data-testid="stat-inactive-quizzes"
                  >
                    {kpiStats.inactiveQuizzes}
                  </p>
                </div>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <Clock className="h-4 w-4 sm:h-5 sm:w-5" />
                </span>
              </div>
              <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="tabular-nums">{kpiStats.incompleteQuestionsCount}</span>
                <span>سؤال قيد الإعداد (مسودة)</span>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-xl border-border/60 shadow-xs">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <p className="text-xs sm:text-sm font-medium text-muted-foreground">إجمالي الأسئلة</p>
                  <p
                    className="text-2xl font-bold tracking-tight tabular-nums"
                    data-testid="stat-total-questions"
                  >
                    {kpiStats.totalQuestionsCount}
                  </p>
                </div>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
                  <FileQuestion className="h-4 w-4 sm:h-5 sm:w-5" />
                </span>
              </div>
              <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>نسبة النجاح المطلوبة:</span>
                <span className="font-semibold text-foreground tabular-nums">{formData.passingScore}%</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search & Quick Filter Toolbar */}
        <div className="rounded-xl border border-border/60 bg-card p-4 shadow-xs space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="ابحث في المقالات..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-10 pl-9 h-10"
                data-testid="input-search-articles"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="no-min-touch-size absolute left-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="مسح البحث"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="w-full lg:w-[360px]">
              <Select
                value={selectedArticleId || "all"}
                onValueChange={(val) => setSelectedArticleId(val === "all" ? "" : val)}
              >
                <SelectTrigger data-testid="select-article" className="h-10">
                  <SelectValue placeholder="اختر مقالاً..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">اختر مقالاً...</SelectItem>
                  {isLoadingArticles ? (
                    <div className="p-2 text-center text-muted-foreground">جاري التحميل...</div>
                  ) : (
                    articles.map((article) => (
                      <SelectItem key={article.id} value={article.id}>
                        {article.title}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground ml-1">تصفية الأسئلة:</span>
              {(
                [
                  { id: "all", label: "الكل", count: questions.length },
                  { id: "active", label: "نشط", count: kpiStats.completedQuestionsCount },
                  { id: "inactive", label: "غير نشط", count: kpiStats.incompleteQuestionsCount },
                ] as const
              ).map((pill) => (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => setStatusFilter(pill.id)}
                  data-testid={`filter-pill-${pill.id}`}
                  className={`no-min-touch-size inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    statusFilter === pill.id
                      ? "bg-primary text-primary-foreground shadow-2xs"
                      : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <span>{pill.label}</span>
                  <Badge
                    variant={statusFilter === pill.id ? "secondary" : "outline"}
                    className="h-4 px-1.5 text-[10px] tabular-nums"
                  >
                    {pill.count}
                  </Badge>
                </button>
              ))}
            </div>

            {existingQuiz && (
              <Badge variant="secondary" className="text-xs gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                يوجد اختبار مرتبط بهذا المقال
              </Badge>
            )}
          </div>
        </div>

        {/* Selected Article Preview Card */}
        {selectedArticle && (
          <Card className="rounded-xl border-border/60 bg-card shadow-xs">
            <CardContent className="p-4 sm:p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary mt-0.5">
                    <FileText className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-foreground">{selectedArticle.title}</h3>
                      {isLoadingQuiz && (
                        <Badge variant="outline" className="text-xs">
                          جاري التحقق من الاختبار...
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                      {selectedArticle.aiSummary || selectedArticle.excerpt || "مقال منشور"}
                    </p>
                  </div>
                </div>
                {existingQuiz && (
                  <Badge className="w-fit shrink-0 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20">
                    مرتبط باختبار نشط
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quiz Settings */}
        <Card className="rounded-xl border-border/60 shadow-xs">
          <CardHeader className="border-b border-border/50 pb-4">
            <CardTitle className="text-lg">إعدادات الاختبار</CardTitle>
            <CardDescription>تخصيص العنوان ونسبة النجاح وخيارات العرض للقراء</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="title">عنوان الاختبار</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
                  data-testid="input-quiz-title"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="passingScore">نسبة النجاح (%)</Label>
                <Input
                  id="passingScore"
                  type="number"
                  min="0"
                  max="100"
                  value={formData.passingScore}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, passingScore: parseInt(e.target.value) || 70 }))
                  }
                  className="tabular-nums"
                  data-testid="input-passing-score"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">وصف الاختبار</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                data-testid="input-quiz-description"
              />
            </div>

            <div className="flex flex-wrap gap-6 pt-1">
              <div className="flex items-center gap-2">
                <Switch
                  id="showCorrectAnswers"
                  checked={formData.showCorrectAnswers}
                  onCheckedChange={(checked) =>
                    setFormData((prev) => ({ ...prev, showCorrectAnswers: checked }))
                  }
                  data-testid="switch-show-answers"
                />
                <Label htmlFor="showCorrectAnswers">إظهار الإجابات الصحيحة</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="allowRetake"
                  checked={formData.allowRetake}
                  onCheckedChange={(checked) =>
                    setFormData((prev) => ({ ...prev, allowRetake: checked }))
                  }
                  data-testid="switch-allow-retake"
                />
                <Label htmlFor="allowRetake">السماح بإعادة الاختبار</Label>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Questions Summary Overview: Desktop Table + Mobile Stacked Cards */}
        <Card className="rounded-xl border-border/60 shadow-xs overflow-hidden">
          <CardHeader className="border-b border-border/50 pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <CardTitle className="text-lg">ملخص الأسئلة ({filteredQuestionsWithIndex.length})</CardTitle>
                <CardDescription>نظرة سريعة على حالة الأسئلة والخيارات المحددة</CardDescription>
              </div>
              <Badge variant="outline" className="w-fit tabular-nums">
                {kpiStats.completedQuestionsCount} من {questions.length} مكتمل
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {/* Desktop Table */}
            <div className="hidden md:block">
              <Table dir="rtl">
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="w-24 text-right">الرقم</TableHead>
                    <TableHead className="text-right">نص السؤال</TableHead>
                    <TableHead className="text-center">الخيارات المعبأة</TableHead>
                    <TableHead className="text-center">الإجابة الصحيحة</TableHead>
                    <TableHead className="text-center">الحالة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredQuestionsWithIndex.map(({ question, originalIndex, complete }) => {
                    const choices = Array.isArray(question.choices) ? question.choices : [];
                    const filledCount = choices.filter((c) => c && c.trim().length > 0).length;
                    const correctText = choices[question.correctIndex]?.trim() || `الخيار ${question.correctIndex + 1}`;
                    return (
                      <TableRow key={originalIndex} data-testid={`row-question-summary-${originalIndex}`}>
                        <TableCell className="font-medium tabular-nums">
                          السؤال {originalIndex + 1}
                        </TableCell>
                        <TableCell className="max-w-md truncate">
                          {question.question.trim() || (
                            <span className="text-muted-foreground italic">لم يتم إدخال نص السؤال بعد</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center tabular-nums">
                          {filledCount} / {choices.length}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary" className="font-normal max-w-[180px] truncate">
                            {correctText}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant="outline"
                            className={
                              complete
                                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20"
                                : "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20"
                            }
                          >
                            {complete ? "نشط / مكتمل" : "غير نشط / ناقص"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Mobile Stacked Cards */}
            <div className="md:hidden p-3 space-y-2.5">
              {filteredQuestionsWithIndex.map(({ question, originalIndex, complete }) => {
                const choices = Array.isArray(question.choices) ? question.choices : [];
                const filledCount = choices.filter((c) => c && c.trim().length > 0).length;
                const correctText = choices[question.correctIndex]?.trim() || `الخيار ${question.correctIndex + 1}`;
                return (
                  <div
                    key={originalIndex}
                    className="rounded-xl border border-border/60 bg-background p-3.5 space-y-2"
                    data-testid={`row-question-summary-${originalIndex}-mobile`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="outline" className="tabular-nums">
                        السؤال {originalIndex + 1}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={
                          complete
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20 text-xs"
                            : "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20 text-xs"
                        }
                      >
                        {complete ? "نشط / مكتمل" : "غير نشط / ناقص"}
                      </Badge>
                    </div>
                    <p className="text-sm font-medium line-clamp-2">
                      {question.question.trim() || "لم يتم إدخال نص السؤال بعد"}
                    </p>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground pt-1 border-t border-border/40">
                      <span className="tabular-nums">
                        الخيارات: {filledCount}/{choices.length}
                      </span>
                      <span className="truncate max-w-[180px]">الإجابة: {correctText}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Questions Builder */}
        <Card className="rounded-xl border-border/60 shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between gap-2 border-b border-border/50 pb-4">
            <div>
              <CardTitle className="text-lg">تحرير الأسئلة</CardTitle>
              <CardDescription>أضف أسئلة الاختبار مع الخيارات وحدد الإجابة الصحيحة</CardDescription>
            </div>
            <Button onClick={addQuestion} size="sm" data-testid="button-add-question">
              <Plus className="h-4 w-4 ml-1" />
              سؤال جديد
            </Button>
          </CardHeader>
          <CardContent className="space-y-6 pt-5">
            {filteredQuestionsWithIndex.map(({ question, originalIndex: qIndex, complete }) => {
              const choices = Array.isArray(question.choices) ? question.choices : [];
              return (
                <div
                  key={qIndex}
                  className="p-4 sm:p-5 border border-border/60 rounded-xl bg-card space-y-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <GripVertical className="h-5 w-5 text-muted-foreground" />
                      <Badge variant="outline" className="tabular-nums">
                        السؤال {qIndex + 1}
                      </Badge>
                      <Badge
                        variant="secondary"
                        className={
                          complete
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-xs"
                            : "text-xs"
                        }
                      >
                        {complete ? "مكتمل" : "مسودة"}
                      </Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeQuestion(qIndex)}
                      className="text-destructive hover:text-destructive"
                      data-testid={`button-remove-question-${qIndex}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <Label>نص السؤال</Label>
                    <Textarea
                      value={question.question}
                      onChange={(e) => updateQuestion(qIndex, "question", e.target.value)}
                      placeholder="أدخل نص السؤال..."
                      data-testid={`input-question-text-${qIndex}`}
                    />
                  </div>

                  <div className="space-y-3">
                    <Label>الخيارات (اختر الإجابة الصحيحة)</Label>
                    {choices.map((choice, cIndex) => (
                      <div key={cIndex} className="flex items-center gap-2">
                        <input
                          type="radio"
                          name={`correct-${qIndex}`}
                          checked={question.correctIndex === cIndex}
                          onChange={() => updateQuestion(qIndex, "correctIndex", cIndex)}
                          className="w-4 h-4 shrink-0"
                          data-testid={`radio-correct-${qIndex}-${cIndex}`}
                        />
                        <Input
                          value={choice}
                          onChange={(e) => updateChoice(qIndex, cIndex, e.target.value)}
                          placeholder={`الخيار ${cIndex + 1}`}
                          className="flex-1"
                          data-testid={`input-choice-${qIndex}-${cIndex}`}
                        />
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <Label>شرح الإجابة (اختياري)</Label>
                    <Input
                      value={question.explanation || ""}
                      onChange={(e) => updateQuestion(qIndex, "explanation", e.target.value)}
                      placeholder="شرح لماذا هذه الإجابة صحيحة..."
                      data-testid={`input-explanation-${qIndex}`}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
          <CardFooter className="border-t border-border/50 pt-4">
            <Button
              onClick={handleSubmit}
              disabled={!selectedArticleId || createMutation.isPending}
              className="w-full"
              data-testid="button-save-quiz"
            >
              {createMutation.isPending ? (
                "جاري الحفظ..."
              ) : (
                <>
                  <Save className="h-4 w-4 ml-2" />
                  حفظ الاختبار
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </DashboardLayout>
  );
}

