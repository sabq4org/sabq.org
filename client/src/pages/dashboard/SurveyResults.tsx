import { Link, useRoute } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { ArrowRight, BarChart3, MessageSquareText, Sparkles, Star } from "lucide-react";

type QuestionResult = {
  id: string;
  type: "single" | "multi" | "short_text" | "long_text" | "stars" | "scale";
  text: string;
  options: string[] | null;
  settings: { minLabel?: string; maxLabel?: string } | null;
  answered: number;
  counts?: number[];
  average?: number | null;
  distribution?: Record<string, number>;
  textAnswers?: { value: string; userName: string; submittedAt: string }[];
};

type Results = {
  survey: { id: string; title: string; purpose: string | null; status: string; sentAt: string | null };
  totals: { invited: number; opened: number; completed: number; completionRate: number };
  questions: QuestionResult[];
};

type Analysis = {
  id: string;
  status: "completed" | "failed";
  responsesCount: number;
  summary: string | null;
  sentiment: { positive: number; neutral: number; negative: number; note?: string } | null;
  themes: { theme: string; evidence: string; mentions?: number }[] | null;
  recommendations: { title: string; detail: string; priority: "high" | "medium" | "low"; basedOn?: string }[] | null;
  quickWins: string[] | null;
  error: string | null;
  createdAt: string;
};

const PRIORITY_STYLES: Record<string, { label: string; className: string }> = {
  high: { label: "أولوية عالية", className: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" },
  medium: { label: "أولوية متوسطة", className: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
  low: { label: "أولوية منخفضة", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
};

export default function SurveyResults() {
  const [, params] = useRoute("/dashboard/surveys/:id/results");
  const surveyId = params?.id ?? "";
  const { toast } = useToast();

  const { data: resultsRaw, isLoading } = useQuery({
    queryKey: [`/api/surveys/${surveyId}/results`],
    enabled: Boolean(surveyId),
  });
  const results = resultsRaw as Results | null | undefined;

  const { data: analysisRaw } = useQuery({
    queryKey: [`/api/surveys/${surveyId}/analysis`],
    enabled: Boolean(surveyId),
  });
  const analysis = (analysisRaw as { analysis: Analysis | null } | null | undefined)?.analysis ?? null;

  const analyzeMutation = useMutation({
    mutationFn: () => apiRequest(`/api/surveys/${surveyId}/analyze`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/surveys/${surveyId}/analysis`] });
      toast({ title: "اكتمل التحليل", description: "توصيات الذكاء الاصطناعي جاهزة أدناه" });
    },
    onError: (error: Error) => toast({ title: "تعذر التحليل", description: error.message, variant: "destructive" }),
  });

  if (isLoading || !results) {
    return (
      <DashboardLayout>
        <div className="p-6 max-w-4xl mx-auto space-y-4" dir="rtl">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-5" dir="rtl">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <Link href="/dashboard/surveys" className="text-sm text-muted-foreground inline-flex items-center gap-1 mb-1 hover:text-foreground">
              <ArrowRight className="w-3.5 h-3.5" />
              كل الاستطلاعات
            </Link>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-primary" />
              {results.survey.title}
            </h1>
          </div>
          <Badge variant={results.survey.status === "active" ? "default" : "outline"}>
            {results.survey.status === "active" ? "نشط" : results.survey.status === "closed" ? "مغلق" : "مسودة"}
          </Badge>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "مدعوون", value: results.totals.invited },
            { label: "فتحوا الرابط", value: results.totals.opened },
            { label: "أكملوا الإجابة", value: results.totals.completed },
            { label: "نسبة الإكمال", value: `${results.totals.completionRate}٪` },
          ].map((stat) => (
            <Card key={stat.label}>
              <CardContent className="py-4 text-center">
                <div className="text-2xl font-extrabold text-primary tabular-nums">{stat.value}</div>
                <div className="text-xs text-muted-foreground mt-1">{stat.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="border-primary/40">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              التحليل الذكي والتوصيات
            </CardTitle>
            <Button
              size="sm"
              onClick={() => analyzeMutation.mutate()}
              disabled={analyzeMutation.isPending || results.totals.completed === 0}
              data-testid="button-generate-analysis"
            >
              {analyzeMutation.isPending ? "جارٍ التحليل…" : analysis ? "إعادة التحليل" : "توليد التحليل"}
            </Button>
          </CardHeader>
          <CardContent>
            {results.totals.completed === 0 ? (
              <p className="text-sm text-muted-foreground">بانتظار أول إجابة قبل إمكانية التحليل.</p>
            ) : !analysis ? (
              <p className="text-sm text-muted-foreground">
                اضغط «توليد التحليل» ليقرأ الذكاء الاصطناعي كل الإجابات — خصوصًا النصية — ويخرج بملخص تنفيذي وتوصيات مرتبة بالأولوية.
              </p>
            ) : analysis.status === "failed" ? (
              <p className="text-sm text-destructive">فشل آخر تحليل ({analysis.error || "خطأ غير معروف"}) — جرّب مرة أخرى.</p>
            ) : (
              <div className="space-y-5">
                {analysis.summary && (
                  <div>
                    <h3 className="font-bold text-sm mb-1.5">الملخص التنفيذي</h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">{analysis.summary}</p>
                  </div>
                )}

                {analysis.sentiment && (
                  <div>
                    <h3 className="font-bold text-sm mb-2">المزاج العام للإجابات</h3>
                    <div className="flex h-3 rounded-full overflow-hidden border border-border">
                      <div className="bg-emerald-500" style={{ width: `${analysis.sentiment.positive}%` }} title={`إيجابي ${analysis.sentiment.positive}٪`} />
                      <div className="bg-slate-300 dark:bg-slate-600" style={{ width: `${analysis.sentiment.neutral}%` }} title={`محايد ${analysis.sentiment.neutral}٪`} />
                      <div className="bg-red-400" style={{ width: `${analysis.sentiment.negative}%` }} title={`سلبي ${analysis.sentiment.negative}٪`} />
                    </div>
                    <div className="flex gap-4 text-xs text-muted-foreground mt-1.5 tabular-nums">
                      <span>إيجابي {analysis.sentiment.positive}٪</span>
                      <span>محايد {analysis.sentiment.neutral}٪</span>
                      <span>سلبي {analysis.sentiment.negative}٪</span>
                    </div>
                    {analysis.sentiment.note && <p className="text-xs text-muted-foreground mt-1">{analysis.sentiment.note}</p>}
                  </div>
                )}

                {analysis.themes && analysis.themes.length > 0 && (
                  <div>
                    <h3 className="font-bold text-sm mb-2">المحاور المتكررة في الإجابات</h3>
                    <div className="space-y-2">
                      {analysis.themes.map((theme, index) => (
                        <div key={index} className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                          <div className="text-sm font-bold flex items-center gap-2">
                            {theme.theme}
                            {theme.mentions != null && <span className="text-xs font-normal text-muted-foreground tabular-nums">({theme.mentions} إشارة)</span>}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">{theme.evidence}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {analysis.recommendations && analysis.recommendations.length > 0 && (
                  <div>
                    <h3 className="font-bold text-sm mb-2">التوصيات للمسؤول</h3>
                    <div className="space-y-2.5">
                      {analysis.recommendations.map((recommendation, index) => {
                        const priority = PRIORITY_STYLES[recommendation.priority] ?? PRIORITY_STYLES.medium;
                        return (
                          <div key={index} className="rounded-xl border border-border p-3.5">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="font-bold text-sm">{index + 1}. {recommendation.title}</span>
                              <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 ${priority.className}`}>{priority.label}</span>
                            </div>
                            <p className="text-sm text-muted-foreground leading-relaxed">{recommendation.detail}</p>
                            {recommendation.basedOn && (
                              <p className="text-xs text-muted-foreground mt-1.5 border-r-2 border-primary/40 pr-2">مبنية على: {recommendation.basedOn}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {analysis.quickWins && analysis.quickWins.length > 0 && (
                  <div>
                    <h3 className="font-bold text-sm mb-2">مكاسب سريعة (خلال أسبوع)</h3>
                    <ul className="space-y-1 text-sm text-muted-foreground list-disc pr-5">
                      {analysis.quickWins.map((win, index) => <li key={index}>{win}</li>)}
                    </ul>
                  </div>
                )}

                <p className="text-xs text-muted-foreground border-t border-border pt-3">
                  حُلّلت {analysis.responsesCount} إجابة · {new Date(analysis.createdAt).toLocaleString("ar-SA")}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {results.questions.map((question, questionIndex) => (
          <Card key={question.id}>
            <CardHeader>
              <CardTitle className="text-base leading-relaxed">
                <span className="text-muted-foreground tabular-nums">س{questionIndex + 1}.</span> {question.text}
                <span className="text-xs font-normal text-muted-foreground mr-2 tabular-nums">({question.answered} إجابة)</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(question.type === "single" || question.type === "multi") && (
                <div className="space-y-2">
                  {(question.options ?? []).map((option, optionIndex) => {
                    const count = question.counts?.[optionIndex] ?? 0;
                    const percent = question.answered > 0 ? Math.round((count / question.answered) * 100) : 0;
                    return (
                      <div key={optionIndex}>
                        <div className="flex justify-between text-sm mb-1">
                          <span>{option}</span>
                          <span className="text-muted-foreground tabular-nums">{count} ({percent}٪)</span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div className="h-full bg-primary rounded-full" style={{ width: `${percent}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {(question.type === "stars" || question.type === "scale") && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    {question.type === "stars" && <Star className="w-5 h-5 fill-amber-400 text-amber-400" />}
                    <span className="text-2xl font-extrabold tabular-nums">{question.average ?? "—"}</span>
                    <span className="text-sm text-muted-foreground">المتوسط {question.type === "stars" ? "من 5" : "من 10"}</span>
                  </div>
                  <div className="flex items-end gap-1 h-16">
                    {Object.entries(question.distribution ?? {})
                      .sort(([a], [b]) => Number(a) - Number(b))
                      .map(([value, count]) => {
                        const max = Math.max(...Object.values(question.distribution ?? { 0: 1 }));
                        return (
                          <div key={value} className="flex-1 flex flex-col items-center gap-1">
                            <div className="w-full bg-primary/70 rounded-t" style={{ height: `${(count / max) * 100}%`, minHeight: 3 }} title={`${count} إجابة`} />
                            <span className="text-[10px] text-muted-foreground tabular-nums">{value}</span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {(question.type === "short_text" || question.type === "long_text") && (
                <div className="space-y-2.5">
                  {(question.textAnswers ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">لا إجابات نصية بعد.</p>
                  ) : (
                    (question.textAnswers ?? []).map((answer, answerIndex) => (
                      <div key={answerIndex} className="rounded-lg border border-border bg-muted/20 px-3.5 py-2.5">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                          <MessageSquareText className="w-3.5 h-3.5" />
                          {answer.userName}
                        </div>
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{answer.value}</p>
                      </div>
                    ))
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </DashboardLayout>
  );
}
