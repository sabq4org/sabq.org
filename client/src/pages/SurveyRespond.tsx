import { useEffect, useMemo, useRef, useState } from "react";
import { useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Star } from "lucide-react";

type PublicQuestion = {
  id: string;
  type: "single" | "multi" | "short_text" | "long_text" | "stars" | "scale";
  text: string;
  hint: string | null;
  required: boolean;
  options: string[] | null;
  settings: { maxChoices?: number; scaleMin?: number; scaleMax?: number; minLabel?: string; maxLabel?: string } | null;
};

type PublicSurvey = {
  survey: {
    title: string;
    purpose: string | null;
    welcomeTitle: string | null;
    welcomeMessage: string | null;
    thankYouTitle: string | null;
    thankYouMessage: string | null;
    status: string;
  };
  questions: PublicQuestion[];
  recipient: {
    name: string;
    stats: { publishedCount: number; totalViews: number; sinceYear: number | null } | null;
  };
  alreadyCompleted: boolean;
};

type AnswerValue = number | number[] | string;

const AUTO_ADVANCE_TYPES = new Set(["single", "stars", "scale"]);

function formatCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}م`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}ألف`;
  return String(value);
}

const TYPE_LABELS: Record<PublicQuestion["type"], string> = {
  single: "اختيار واحد",
  multi: "اختيار متعدد",
  short_text: "نص قصير",
  long_text: "نص طويل",
  stars: "تقييم نجوم",
  scale: "مقياس",
};

export default function SurveyRespond() {
  const [, params] = useRoute("/survey/:token");
  const token = params?.token ?? "";

  const { data, isLoading, error } = useQuery<PublicSurvey>({
    queryKey: [`/api/public/surveys/${token}`],
    enabled: token.length > 0,
    retry: false,
    staleTime: Infinity,
  });

  const [stage, setStage] = useState<"intro" | "questions" | "done">("intro");
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
  }, []);

  const questions = useMemo(() => data?.questions ?? [], [data]);
  const question = questions[current];
  const isLast = current === questions.length - 1;

  const submitMutation = useMutation({
    mutationFn: async () => {
      const durationSeconds = startedAtRef.current
        ? Math.min(Math.round((Date.now() - startedAtRef.current) / 1000), 24 * 60 * 60)
        : undefined;
      return apiRequest(`/api/public/surveys/${token}/submit`, {
        method: "POST",
        body: JSON.stringify({ answers, durationSeconds }),
      });
    },
    onSuccess: () => setStage("done"),
    onError: (mutationError: Error) => {
      setSubmitError(mutationError.message || "تعذر إرسال إجاباتك؛ حاول مرة أخرى");
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center" dir="rtl">
        <div className="text-muted-foreground animate-pulse">جارٍ فتح الاستطلاع…</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <SurveyShell>
        <div className="rounded-2xl border border-border bg-card shadow-sm p-10 text-center">
          <div className="text-4xl mb-4">🔗</div>
          <h1 className="text-xl font-extrabold mb-2">هذا الرابط غير صالح</h1>
          <p className="text-muted-foreground">تأكد من فتح الرابط كما وصلك في البريد أو لوحة الكاتب، أو تواصل مع إدارة التحرير.</p>
        </div>
      </SurveyShell>
    );
  }

  const { survey, recipient } = data;
  const firstName = recipient.name.split(" ")[0] || recipient.name;

  if (survey.status === "closed" && stage !== "done") {
    return (
      <SurveyShell>
        <div className="rounded-2xl border border-border bg-card shadow-sm p-10 text-center">
          <div className="text-4xl mb-4">⏳</div>
          <h1 className="text-xl font-extrabold mb-2">أُغلق هذا الاستطلاع</h1>
          <p className="text-muted-foreground">شكرًا لاهتمامك يا {firstName} — انتهت فترة المشاركة في هذا الاستطلاع.</p>
        </div>
      </SurveyShell>
    );
  }

  if (data.alreadyCompleted && stage !== "done") {
    return (
      <SurveyShell>
        <SuccessCard
          title={survey.thankYouTitle || `وصلت إجاباتك يا ${firstName} 🌟`}
          message="سبق أن أكملت هذا الاستطلاع — إجاباتك محفوظة لدينا، ولا حاجة لإعادتها."
          signature
        />
      </SurveyShell>
    );
  }

  const setAnswer = (value: AnswerValue) => {
    if (!question) return;
    setAnswers((previous) => ({ ...previous, [question.id]: value }));
    if (AUTO_ADVANCE_TYPES.has(question.type) && !isLast) {
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = setTimeout(() => setCurrent((index) => Math.min(index + 1, questions.length - 1)), 450);
    }
  };

  const toggleMulti = (optionIndex: number) => {
    if (!question) return;
    const previous = answers[question.id];
    const selected = new Set(Array.isArray(previous) ? previous : []);
    const maxChoices = question.settings?.maxChoices ?? (question.options?.length ?? 12);
    if (selected.has(optionIndex)) {
      selected.delete(optionIndex);
    } else if (selected.size < maxChoices) {
      selected.add(optionIndex);
    }
    setAnswers((current) => ({ ...current, [question.id]: [...selected].sort((a, b) => a - b) }));
  };

  const answerOf = (target: PublicQuestion) => answers[target.id];
  const canProceed = !question?.required || (() => {
    const value = answerOf(question);
    if (value === undefined || value === "") return false;
    if (Array.isArray(value)) return value.length > 0;
    return true;
  })();

  const goNext = () => {
    setSubmitError(null);
    if (!isLast) {
      setCurrent((index) => index + 1);
    } else {
      submitMutation.mutate();
    }
  };

  return (
    <SurveyShell>
      {stage === "intro" && (
        <div className="rounded-2xl border border-border bg-card shadow-lg overflow-hidden animate-in fade-in slide-in-from-bottom-3 duration-500">
          <div
            className="relative px-7 py-8 text-white"
            style={{ background: "linear-gradient(135deg,#0B486F 0%,#0E6DB0 55%,#1E9DF1 130%)" }}
          >
            <div
              aria-hidden
              className="absolute inset-0 opacity-10 pointer-events-none"
              style={{ background: "repeating-linear-gradient(0deg,transparent 0 7px,#fff 7px 8px)" }}
            />
            <div className="flex items-center gap-2 text-xs font-bold opacity-90 mb-3">
              <span className="inline-block w-5 h-0.5 rounded bg-amber-400" />
              {survey.purpose ? `استطلاع: ${survey.purpose}` : "استطلاع رأي من صحيفة سبق"}
            </div>
            <h1 className="text-2xl font-extrabold leading-relaxed mb-1" style={{ textWrap: "balance" }}>
              {(survey.welcomeTitle || "أهلًا بك يا {name}، رأيك يصنع الخطوة القادمة").replace("{name}", firstName)}
            </h1>
            {survey.welcomeMessage && <p className="text-sm opacity-90 max-w-prose">{survey.welcomeMessage}</p>}
          </div>

          <div className="px-7 py-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center font-extrabold text-lg border border-border">
                {firstName.charAt(0)}
              </div>
              <div>
                <div className="font-extrabold">{recipient.name}</div>
                {recipient.stats?.sinceYear && (
                  <div className="text-sm text-muted-foreground">معنا في سبق منذ {recipient.stats.sinceYear}</div>
                )}
              </div>
            </div>

            {recipient.stats && (
              <div className="grid grid-cols-2 gap-2.5 mb-5">
                <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-center">
                  <div className="text-xl font-extrabold text-amber-600 dark:text-amber-400 tabular-nums">
                    {formatCount(recipient.stats.publishedCount)}
                  </div>
                  <div className="text-xs text-muted-foreground">مادة منشورة</div>
                </div>
                <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-center">
                  <div className="text-xl font-extrabold text-amber-600 dark:text-amber-400 tabular-nums">
                    {formatCount(recipient.stats.totalViews)}
                  </div>
                  <div className="text-xs text-muted-foreground">قراءة لموادك</div>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 text-sm text-muted-foreground mb-5">
              <span className="tabular-nums">{questions.length} أسئلة</span>
              <span className="w-1 h-1 rounded-full bg-border" />
              <span>دقائق معدودة</span>
              <span className="w-1 h-1 rounded-full bg-border" />
              <span>تصل إجاباتك لإدارة التحرير مباشرة</span>
            </div>

            <button
              type="button"
              className="rounded-xl bg-primary text-primary-foreground font-extrabold px-7 py-3 transition hover:opacity-90 active:translate-y-px"
              onClick={() => {
                startedAtRef.current = Date.now();
                setStage("questions");
              }}
              data-testid="survey-start"
            >
              ابدأ الاستطلاع
            </button>
          </div>
        </div>
      )}

      {stage === "questions" && question && (
        <div className="rounded-2xl border border-border bg-card shadow-lg px-7 py-6 animate-in fade-in slide-in-from-bottom-2 duration-300" key={question.id}>
          <div className="flex items-center gap-3 mb-6">
            <span className="text-xs font-bold text-muted-foreground whitespace-nowrap tabular-nums">
              السؤال {current + 1} من {questions.length}
            </span>
            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${(current / questions.length) * 100}%` }}
              />
            </div>
          </div>

          <span className="inline-flex items-center text-[11px] font-extrabold text-primary bg-primary/10 rounded-full px-3 py-1 mb-3">
            {TYPE_LABELS[question.type]}
          </span>
          <h2 className="text-lg font-extrabold leading-relaxed mb-1" style={{ textWrap: "balance" }}>
            {question.text} {question.required && <span className="text-amber-500">*</span>}
          </h2>
          <p className="text-sm text-muted-foreground mb-5">{question.hint || (question.required ? "" : "اختياري")}</p>

          {(question.type === "single" || question.type === "multi") && (
            <div className="flex flex-col gap-2.5">
              {(question.options ?? []).map((option, optionIndex) => {
                const value = answerOf(question);
                const selected = question.type === "single"
                  ? value === optionIndex
                  : Array.isArray(value) && value.includes(optionIndex);
                return (
                  <button
                    key={optionIndex}
                    type="button"
                    onClick={() => (question.type === "single" ? setAnswer(optionIndex) : toggleMulti(optionIndex))}
                    className={`flex items-center gap-3 w-full text-right rounded-xl border px-4 py-3 transition ${
                      selected
                        ? "border-primary bg-primary/10"
                        : "border-border bg-muted/30 hover:border-primary/60"
                    }`}
                    data-testid={`survey-option-${optionIndex}`}
                  >
                    <span
                      className={`flex-none w-5 h-5 border-2 flex items-center justify-center transition ${
                        question.type === "single" ? "rounded-full" : "rounded-md"
                      } ${selected ? "border-primary bg-primary" : "border-border bg-card"}`}
                    >
                      {selected && <span className={`w-1.5 h-1.5 bg-white ${question.type === "single" ? "rounded-full" : "rounded-sm"}`} />}
                    </span>
                    <span className="text-sm font-medium">{option}</span>
                  </button>
                );
              })}
            </div>
          )}

          {question.type === "scale" && (
            <div>
              <div className="flex flex-wrap gap-1.5">
                {(() => {
                  const min = question.settings?.scaleMin ?? 0;
                  const max = question.settings?.scaleMax ?? 10;
                  const value = answerOf(question);
                  return Array.from({ length: max - min + 1 }, (_, offset) => min + offset).map((scaleValue) => (
                    <button
                      key={scaleValue}
                      type="button"
                      onClick={() => setAnswer(scaleValue)}
                      className={`flex-1 min-w-[42px] h-11 rounded-lg border font-extrabold text-sm tabular-nums transition ${
                        value === scaleValue
                          ? "bg-primary border-primary text-primary-foreground"
                          : "bg-muted/30 border-border hover:border-primary/60"
                      }`}
                      data-testid={`survey-scale-${scaleValue}`}
                    >
                      {scaleValue}
                    </button>
                  ));
                })()}
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mt-2">
                <span>{question.settings?.minLabel || ""}</span>
                <span>{question.settings?.maxLabel || ""}</span>
              </div>
            </div>
          )}

          {question.type === "stars" && (
            <div className="flex gap-2 flex-row-reverse justify-end">
              {[5, 4, 3, 2, 1].map((starValue) => {
                const value = answerOf(question);
                const lit = typeof value === "number" && starValue <= value;
                return (
                  <button
                    key={starValue}
                    type="button"
                    onClick={() => setAnswer(starValue)}
                    className="p-1 transition hover:scale-110"
                    aria-label={`${starValue} من 5`}
                    data-testid={`survey-star-${starValue}`}
                  >
                    <Star
                      className={`w-8 h-8 ${lit ? "fill-amber-400 text-amber-400" : "text-border"}`}
                    />
                  </button>
                );
              })}
            </div>
          )}

          {(question.type === "short_text" || question.type === "long_text") && (
            <textarea
              value={typeof answerOf(question) === "string" ? (answerOf(question) as string) : ""}
              onChange={(event) => setAnswers((previous) => ({ ...previous, [question.id]: event.target.value }))}
              placeholder="اكتب إجابتك هنا…"
              rows={question.type === "long_text" ? 5 : 2}
              maxLength={question.type === "long_text" ? 5000 : 500}
              className="w-full rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm focus:outline-none focus:border-primary resize-y"
              data-testid="survey-text-answer"
            />
          )}

          {submitError && <p className="text-sm text-destructive mt-4">{submitError}</p>}

          <div className="flex justify-between items-center mt-7">
            <button
              type="button"
              onClick={() => setCurrent((index) => Math.max(index - 1, 0))}
              className={`rounded-xl border border-border text-muted-foreground font-bold px-5 py-2.5 text-sm transition hover:bg-muted/40 ${current === 0 ? "invisible" : ""}`}
            >
              السابق
            </button>
            {AUTO_ADVANCE_TYPES.has(question.type) && !isLast ? (
              <span className="text-xs text-muted-foreground">ينتقل تلقائيًا بعد اختيارك</span>
            ) : (
              <button
                type="button"
                onClick={goNext}
                disabled={!canProceed || submitMutation.isPending}
                className="rounded-xl bg-primary text-primary-foreground font-extrabold px-7 py-2.5 text-sm transition hover:opacity-90 disabled:opacity-45 disabled:cursor-not-allowed"
                data-testid="survey-next"
              >
                {isLast ? (submitMutation.isPending ? "جارٍ الإرسال…" : "إرسال الاستطلاع") : "متابعة"}
              </button>
            )}
          </div>
        </div>
      )}

      {stage === "done" && (
        <SuccessCard
          title={(survey.thankYouTitle || `وصلت إجاباتك يا ${firstName} 🌟`).replace("{name}", firstName)}
          message={
            survey.thankYouMessage ||
            "شكرًا لوقتك وصراحتك. كل إجابة كتبتها ستُقرأ باهتمام، وستكون جزءًا من قرارات التطوير القادمة."
          }
          extra={
            data.recipient.stats
              ? `أثريت سبق بـ${formatCount(data.recipient.stats.publishedCount)} مادة… ورأيك اليوم أثراها أكثر.`
              : undefined
          }
          signature
        />
      )}
    </SurveyShell>
  );
}

function SurveyShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground py-10 px-4" dir="rtl">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-xl bg-primary text-primary-foreground font-extrabold text-lg flex items-center justify-center">
            س
          </div>
          <div>
            <div className="font-extrabold text-sm">صحيفة سبق</div>
            <div className="text-xs text-muted-foreground">استطلاعات الرأي</div>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

function SuccessCard({ title, message, extra, signature }: { title: string; message: string; extra?: string; signature?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-card shadow-lg px-8 py-12 text-center animate-in fade-in zoom-in-95 duration-500">
      <div className="w-20 h-20 mx-auto mb-5 rounded-full bg-emerald-50 dark:bg-emerald-950 border-2 border-emerald-500 flex items-center justify-center">
        <svg viewBox="0 0 24 24" className="w-10 h-10 text-emerald-500" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5 10 17.5 19 7" />
        </svg>
      </div>
      <h2 className="text-xl font-extrabold mb-3">{title}</h2>
      <p className="text-muted-foreground text-sm max-w-prose mx-auto mb-2 leading-relaxed">{message}</p>
      {extra && <p className="text-muted-foreground text-sm max-w-prose mx-auto leading-relaxed">{extra}</p>}
      {signature && (
        <div className="mt-7 pt-5 border-t border-dashed border-border max-w-[280px] mx-auto text-sm text-muted-foreground">
          مع خالص التقدير،
          <div className="font-extrabold text-foreground mt-0.5">إدارة التحرير — صحيفة سبق</div>
        </div>
      )}
    </div>
  );
}
