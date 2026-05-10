import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Check, X, Trophy, RefreshCw, Brain, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface QuizQuestion {
  id: string;
  question: string;
  choices: string[];
  order: number;
}

interface Quiz {
  id: string;
  title: string;
  description?: string;
  passingScore: number;
  showCorrectAnswers: boolean;
  allowRetake: boolean;
  questions: QuizQuestion[];
}

interface QuizResult {
  score: number;
  correctCount: number;
  totalQuestions: number;
  passed: boolean;
  passingScore: number;
  results?: {
    questionId: string;
    correct: boolean;
    correctIndex: number;
    explanation?: string;
  }[];
}

interface ArticleQuizProps {
  articleId: string;
  className?: string;
}

export function ArticleQuiz({ articleId, className }: ArticleQuizProps) {
  const { toast } = useToast();
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [startTime] = useState(Date.now());
  const [showResults, setShowResults] = useState(false);
  const [quizResult, setQuizResult] = useState<QuizResult | null>(null);
  const [sessionId] = useState(() => `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);

  // Fetch quiz data
  const { data: quiz, isLoading, error } = useQuery<Quiz>({
    queryKey: ["/api/articles", articleId, "quiz"],
    queryFn: async () => {
      const res = await fetch(`/api/articles/${articleId}/quiz`);
      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error("Failed to fetch quiz");
      }
      return res.json();
    },
    staleTime: 60000,
    retry: false,
  });

  // Check quiz status
  const { data: quizStatus } = useQuery<{
    hasQuiz: boolean;
    hasTaken: boolean;
    lastScore: number | null;
    allowRetake: boolean;
  }>({
    queryKey: ["/api/articles", articleId, "quiz/status"],
    queryFn: async () => {
      const res = await fetch(`/api/articles/${articleId}/quiz/status?sessionId=${sessionId}`);
      return res.json();
    },
    staleTime: 30000,
  });

  // Submit quiz mutation
  const submitMutation = useMutation({
    mutationFn: async (data: { answers: { questionId: string; selectedIndex: number }[]; timeSpent: number; sessionId: string }) => {
      const res = await apiRequest(`/api/articles/${articleId}/quiz/submit`, {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      });
      return res;
    },
    onSuccess: (result: QuizResult) => {
      setQuizResult(result);
      setShowResults(true);
      
      if (result.passed) {
        toast({
          title: "أحسنت! 🎉",
          description: `حصلت على ${result.score}% - لقد اجتزت الاختبار بنجاح`,
        });
      } else {
        toast({
          title: "حاول مرة أخرى",
          description: `حصلت على ${result.score}% - تحتاج ${result.passingScore}% للنجاح`,
          variant: "destructive",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "خطأ",
        description: error.message || "حدث خطأ أثناء إرسال الإجابات",
        variant: "destructive",
      });
    },
  });

  const handleAnswer = (questionId: string, selectedIndex: number) => {
    setAnswers(prev => ({ ...prev, [questionId]: selectedIndex }));
  };

  const handleSubmit = () => {
    if (!quiz) return;

    const timeSpent = Math.round((Date.now() - startTime) / 1000);
    const formattedAnswers = Object.entries(answers).map(([questionId, selectedIndex]) => ({
      questionId,
      selectedIndex,
    }));

    submitMutation.mutate({
      answers: formattedAnswers,
      timeSpent,
      sessionId,
    });
  };

  const handleRetake = () => {
    setAnswers({});
    setCurrentQuestion(0);
    setShowResults(false);
    setQuizResult(null);
  };

  const goToNextQuestion = () => {
    if (quiz && currentQuestion < quiz.questions.length - 1) {
      setCurrentQuestion(prev => prev + 1);
    }
  };

  const goToPrevQuestion = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion(prev => prev - 1);
    }
  };

  // Don't render if no quiz or loading
  if (isLoading) {
    return (
      <Card className={cn("animate-pulse", className)} dir="rtl">
        <CardHeader>
          <div className="h-6 bg-muted rounded w-1/3"></div>
          <div className="h-4 bg-muted rounded w-2/3 mt-2"></div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="h-20 bg-muted rounded"></div>
            <div className="h-12 bg-muted rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !quiz) {
    return null;
  }

  // Show previous result if taken and no retake allowed
  if (quizStatus?.hasTaken && !quizStatus.allowRetake && !showResults) {
    return (
      <Card className={cn("border-primary/20", className)} dir="rtl">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Trophy className="h-8 w-8 text-primary" />
          </div>
          <CardTitle>لقد أكملت هذا الاختبار</CardTitle>
          <CardDescription>
            نتيجتك السابقة: {quizStatus.lastScore}%
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const currentQ = quiz.questions[currentQuestion];
  const answeredCount = Object.keys(answers).length;
  const progress = (answeredCount / quiz.questions.length) * 100;
  const allAnswered = answeredCount === quiz.questions.length;

  // Show results
  if (showResults && quizResult) {
    return (
      <Card className={cn("border-primary/20", className)} dir="rtl">
        <CardHeader className="text-center">
          <div className={cn(
            "mx-auto w-20 h-20 rounded-full flex items-center justify-center mb-4",
            quizResult.passed ? "bg-green-100 dark:bg-green-900/30" : "bg-red-100 dark:bg-red-900/30"
          )}>
            {quizResult.passed ? (
              <Trophy className="h-10 w-10 text-green-600 dark:text-green-400" />
            ) : (
              <X className="h-10 w-10 text-red-600 dark:text-red-400" />
            )}
          </div>
          <CardTitle className="text-2xl">
            {quizResult.passed ? "أحسنت! 🎉" : "حاول مرة أخرى"}
          </CardTitle>
          <CardDescription className="text-lg mt-2">
            حصلت على <span className="font-bold text-foreground">{quizResult.score}%</span>
            <span className="text-muted-foreground"> ({quizResult.correctCount} من {quizResult.totalQuestions})</span>
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="flex items-center justify-center gap-4">
            <Badge variant={quizResult.passed ? "default" : "destructive"} className="text-base px-4 py-2">
              {quizResult.passed ? "ناجح" : "لم تجتز"}
            </Badge>
            <span className="text-muted-foreground">
              الحد الأدنى للنجاح: {quizResult.passingScore}%
            </span>
          </div>

          {quizResult.results && quiz.showCorrectAnswers && (
            <div className="space-y-4 mt-6">
              <h4 className="font-semibold text-lg">مراجعة الإجابات:</h4>
              {quiz.questions.map((q, idx) => {
                const result = quizResult.results?.find(r => r.questionId === q.id);
                return (
                  <div key={q.id} className={cn(
                    "p-4 rounded-lg border",
                    result?.correct ? "bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800" : "bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800"
                  )}>
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        "w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-1",
                        result?.correct ? "bg-green-500" : "bg-red-500"
                      )}>
                        {result?.correct ? (
                          <Check className="h-4 w-4 text-white" />
                        ) : (
                          <X className="h-4 w-4 text-white" />
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">{idx + 1}. {q.question}</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          الإجابة الصحيحة: {q.choices[result?.correctIndex || 0]}
                        </p>
                        {result?.explanation && (
                          <p className="text-sm text-primary mt-2 p-2 bg-primary/5 rounded">
                            {result.explanation}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>

        {quiz.allowRetake && (
          <CardFooter>
            <Button onClick={handleRetake} className="w-full" variant="outline" data-testid="button-retake-quiz">
              <RefreshCw className="h-4 w-4 ml-2" />
              إعادة الاختبار
            </Button>
          </CardFooter>
        )}
      </Card>
    );
  }

  return (
    <Card className={cn("border-primary/20", className)} dir="rtl">
      <CardHeader>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Brain className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg">{quiz.title}</CardTitle>
            {quiz.description && (
              <CardDescription>{quiz.description}</CardDescription>
            )}
          </div>
        </div>
        
        <div className="flex items-center justify-between text-sm text-muted-foreground mt-4">
          <span>السؤال {currentQuestion + 1} من {quiz.questions.length}</span>
          <span>{answeredCount} إجابات من {quiz.questions.length}</span>
        </div>
        <Progress value={progress} className="h-2 mt-2" />
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="min-h-[200px]">
          <h3 className="text-lg font-medium mb-4">{currentQ.question}</h3>
          
          <RadioGroup
            value={answers[currentQ.id]?.toString()}
            onValueChange={(value) => handleAnswer(currentQ.id, parseInt(value))}
            className="space-y-3"
            data-testid="quiz-answer-group"
          >
            {currentQ.choices.map((choice, idx) => (
              <div
                key={idx}
                className={cn(
                  "flex items-center space-x-3 space-x-reverse p-4 rounded-lg border cursor-pointer transition-all hover-elevate",
                  answers[currentQ.id] === idx 
                    ? "border-primary bg-primary/5" 
                    : "border-border hover:border-primary/50"
                )}
                onClick={() => handleAnswer(currentQ.id, idx)}
                data-testid={`option-quiz-choice-${idx}`}
              >
                <RadioGroupItem 
                  value={idx.toString()} 
                  id={`choice-${currentQ.id}-${idx}`}
                  data-testid={`input-quiz-choice-${idx}`}
                />
                <Label 
                  htmlFor={`choice-${currentQ.id}-${idx}`} 
                  className="flex-1 cursor-pointer text-base"
                  data-testid={`label-quiz-choice-${idx}`}
                >
                  {choice}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>
      </CardContent>

      <CardFooter className="flex justify-between gap-4">
        <Button
          variant="outline"
          onClick={goToPrevQuestion}
          disabled={currentQuestion === 0}
          data-testid="button-prev-question"
        >
          <ChevronRight className="h-4 w-4 ml-1" />
          السابق
        </Button>

        <div className="flex gap-2">
          {currentQuestion < quiz.questions.length - 1 ? (
            <Button
              onClick={goToNextQuestion}
              disabled={answers[currentQ.id] === undefined}
              data-testid="button-next-question"
            >
              التالي
              <ChevronLeft className="h-4 w-4 mr-1" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={!allAnswered || submitMutation.isPending}
              data-testid="button-submit-quiz"
            >
              {submitMutation.isPending ? "جاري الإرسال..." : "إرسال الإجابات"}
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}
