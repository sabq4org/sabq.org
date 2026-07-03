/**
 * المساعد الرياضي المحادثي — يجيب من بياناتنا الحيّة (RAG) لا من معرفة عامة.
 * يرسل السؤال إلى POST /api/sports/intel/ask ويعرض الإجابة. أسئلة مقترحة تسهّل
 * البدء. يختفي بسلاسة إن لم يكن المحرّك مهيّأً (فحص عبر /status).
 */
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Sparkles, Send, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import type { CopilotResponse } from "./types";

const SUGGESTIONS = [
  "من يتصدّر دوري روشن الآن؟",
  "من هدّاف الدوري السعودي؟",
  "ما أبرز مباريات اليوم؟",
];

export function SportsCopilot() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);

  const { data: status } = useQuery<{ configured: boolean; enabled: boolean }>({
    queryKey: ["/api/sports/intel/status"],
    staleTime: 60 * 60_000,
  });

  const ask = useMutation({
    mutationFn: async (q: string) => {
      return apiRequest<CopilotResponse>("/api/sports/intel/ask", {
        method: "POST",
        body: JSON.stringify({ question: q }),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: (res) => {
      setAnswer(res?.answer ?? "لا تتوفّر لديّ معلومة كافية للإجابة الآن.");
    },
    onError: () => {
      setAnswer("تعذّر الحصول على إجابة الآن، حاول لاحقاً.");
    },
  });

  const submit = (q: string) => {
    const clean = q.trim();
    if (!clean || ask.isPending) return;
    setQuestion(clean);
    setAnswer(null);
    ask.mutate(clean);
  };

  if (status && !status.configured) return null;

  return (
    <section id="copilot" className="mx-auto max-w-[1200px] scroll-mt-16 px-4 pt-8 sm:px-6 sm:pt-10">
      <div className="rounded-2xl border border-primary/15 bg-gradient-to-l from-primary/[0.06] to-transparent p-5 sm:p-6">
        <div className="mb-3 flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="flex flex-col">
            <h3 className="text-base font-extrabold text-foreground sm:text-lg">مساعد سبق الرياضي</h3>
            <span className="text-[11px] font-bold text-primary/70">اسأل عن الترتيب والهدّافين والمباريات — إجابات من بياناتنا الحيّة</span>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(question);
          }}
          className="flex items-center gap-2"
        >
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            maxLength={400}
            placeholder="اكتب سؤالك الرياضي..."
            data-testid="copilot-input"
            className="flex-1 rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary/50"
          />
          <button
            type="submit"
            disabled={ask.isPending || !question.trim()}
            data-testid="copilot-submit"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-white transition-opacity disabled:opacity-50"
          >
            {ask.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </form>

        <div className="mt-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => submit(s)}
              disabled={ask.isPending}
              className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-bold text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>

        {(ask.isPending || answer) && (
          <div className="mt-4 rounded-xl bg-card/80 p-4">
            {ask.isPending ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>يقرأ المشهد...</span>
              </div>
            ) : (
              <p className="text-sm leading-relaxed text-foreground" data-testid="copilot-answer">
                {answer}
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
