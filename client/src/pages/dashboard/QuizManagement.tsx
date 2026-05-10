import { useState } from "react";
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
import { Separator } from "@/components/ui/separator";
import { Plus, Trash2, GripVertical, Brain, Save, ArrowRight, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
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

export default function QuizManagement() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [selectedArticleId, setSelectedArticleId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
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
  const { data: articlesData, isLoading: isLoadingArticles } = useQuery<{ articles: Article[]; total: number }>({
    queryKey: ["/api/articles", { status: "published", limit: 50, search: searchQuery }],
    queryFn: async () => {
      const params = new URLSearchParams({
        status: "published",
        limit: "50",
        ...(searchQuery && { search: searchQuery }),
      });
      const res = await fetch(`/api/articles?${params}`);
      return res.json();
    },
  });

  // Check if selected article has quiz
  const { data: existingQuiz, isLoading: isLoadingQuiz } = useQuery({
    queryKey: ["/api/admin/articles", selectedArticleId, "quiz"],
    queryFn: async () => {
      if (!selectedArticleId) return null;
      const res = await fetch(`/api/admin/articles/${selectedArticleId}/quiz`);
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

  const addQuestion = () => {
    setFormData((prev) => ({
      ...prev,
      questions: [
        ...prev.questions,
        {
          question: "",
          choices: ["", "", "", ""],
          correctIndex: 0,
          explanation: "",
        },
      ],
    }));
  };

  const removeQuestion = (index: number) => {
    if (formData.questions.length <= 1) {
      toast({
        title: "تنبيه",
        description: "يجب أن يحتوي الاختبار على سؤال واحد على الأقل",
        variant: "destructive",
      });
      return;
    }
    setFormData((prev) => ({
      ...prev,
      questions: prev.questions.filter((_, i) => i !== index),
    }));
  };

  const updateQuestion = (index: number, field: keyof QuizQuestion, value: string | number | string[]) => {
    setFormData((prev) => ({
      ...prev,
      questions: prev.questions.map((q, i) =>
        i === index ? { ...q, [field]: value } : q
      ),
    }));
  };

  const updateChoice = (questionIndex: number, choiceIndex: number, value: string) => {
    setFormData((prev) => ({
      ...prev,
      questions: prev.questions.map((q, i) =>
        i === questionIndex
          ? { ...q, choices: q.choices.map((c, ci) => (ci === choiceIndex ? value : c)) }
          : q
      ),
    }));
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
    for (let i = 0; i < formData.questions.length; i++) {
      const q = formData.questions[i];
      if (!q.question.trim()) {
        toast({
          title: "تنبيه",
          description: `يرجى إدخال نص السؤال ${i + 1}`,
          variant: "destructive",
        });
        return;
      }
      const filledChoices = q.choices.filter((c) => c.trim());
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

  const selectedArticle = articlesData?.articles?.find((a) => a.id === selectedArticleId);

  return (
    <div className="min-h-screen bg-background p-4 md:p-6" dir="rtl">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/dashboard/articles")}
            data-testid="button-back"
          >
            <ArrowRight className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="heading-title">
              <Brain className="h-6 w-6 text-primary" />
              إدارة اختبارات المقالات
            </h1>
            <p className="text-muted-foreground">أضف اختبارات تفاعلية لمقالاتك</p>
          </div>
        </div>

        {/* Article Selection */}
        <Card>
          <CardHeader>
            <CardTitle>اختر المقال</CardTitle>
            <CardDescription>حدد المقال الذي تريد إضافة اختبار له</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="ابحث في المقالات..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-10"
                data-testid="input-search-articles"
              />
            </div>
            
            <Select value={selectedArticleId} onValueChange={setSelectedArticleId}>
              <SelectTrigger data-testid="select-article">
                <SelectValue placeholder="اختر مقالاً..." />
              </SelectTrigger>
              <SelectContent>
                {isLoadingArticles ? (
                  <div className="p-2 text-center text-muted-foreground">جاري التحميل...</div>
                ) : (
                  articlesData?.articles?.map((article) => (
                    <SelectItem key={article.id} value={article.id}>
                      {article.title}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>

            {selectedArticle && (
              <div className="p-4 bg-muted/50 rounded-lg">
                <h3 className="font-medium">{selectedArticle.title}</h3>
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                  {selectedArticle.aiSummary || selectedArticle.excerpt}
                </p>
              </div>
            )}

            {existingQuiz && (
              <Badge variant="secondary" className="text-sm">
                يوجد اختبار مرتبط بهذا المقال
              </Badge>
            )}
          </CardContent>
        </Card>

        {/* Quiz Settings */}
        <Card>
          <CardHeader>
            <CardTitle>إعدادات الاختبار</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
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
                  onChange={(e) => setFormData((prev) => ({ ...prev, passingScore: parseInt(e.target.value) || 70 }))}
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

            <div className="flex flex-wrap gap-6">
              <div className="flex items-center gap-2">
                <Switch
                  id="showCorrectAnswers"
                  checked={formData.showCorrectAnswers}
                  onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, showCorrectAnswers: checked }))}
                  data-testid="switch-show-answers"
                />
                <Label htmlFor="showCorrectAnswers">إظهار الإجابات الصحيحة</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="allowRetake"
                  checked={formData.allowRetake}
                  onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, allowRetake: checked }))}
                  data-testid="switch-allow-retake"
                />
                <Label htmlFor="allowRetake">السماح بإعادة الاختبار</Label>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Questions */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle>الأسئلة</CardTitle>
              <CardDescription>أضف أسئلة الاختبار مع الخيارات</CardDescription>
            </div>
            <Button onClick={addQuestion} size="sm" data-testid="button-add-question">
              <Plus className="h-4 w-4 ml-1" />
              سؤال جديد
            </Button>
          </CardHeader>
          <CardContent className="space-y-6">
            {formData.questions.map((question, qIndex) => (
              <div key={qIndex} className="p-4 border rounded-lg space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <GripVertical className="h-5 w-5 text-muted-foreground" />
                    <Badge variant="outline">السؤال {qIndex + 1}</Badge>
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
                  {question.choices.map((choice, cIndex) => (
                    <div key={cIndex} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`correct-${qIndex}`}
                        checked={question.correctIndex === cIndex}
                        onChange={() => updateQuestion(qIndex, "correctIndex", cIndex)}
                        className="w-4 h-4"
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
            ))}
          </CardContent>
          <CardFooter>
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
    </div>
  );
}
