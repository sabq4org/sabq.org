// «أوافق / لا أوافق» في نهاية مقال الرأي: زرّان بارزان، وبعد الصوت تظهر النسبة
// مباشرة بشريط متحرك وتتحدث كل 15 ثانية. التصويت عبر مسار الاستطلاعات القائم.
import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Check, ThumbsDown, ThumbsUp } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { agreeVotePercents } from "@shared/opinionReaderExtras";
import { opinionExtrasKey, type OpinionAgreeState, type OpinionExtrasView } from "./opinionExtrasApi";

const nf = new Intl.NumberFormat("en-US");

export function OpinionAgreeVote({ articleId, extras }: { articleId: string; extras: OpinionExtrasView | null | undefined }) {
  const agree = extras?.agree ?? null;
  if (!extras?.agreeVoteEnabled || !agree) return null;
  return <AgreeVoteBody articleId={articleId} agree={agree} />;
}

function AgreeVoteBody({ articleId, agree }: { articleId: string; agree: OpinionAgreeState }) {
  const { toast } = useToast();
  const [optimistic, setOptimistic] = useState<OpinionAgreeState["userChoice"]>(null);
  const choice = agree.userChoice ?? optimistic;
  const showResults = Boolean(choice);
  // الشريط يبدأ من الصفر ثم يمتد: حركة تشرح أن النسبة حُسبت الآن
  const [revealed, setRevealed] = useState(Boolean(agree.userChoice));
  useEffect(() => {
    if (!showResults) return;
    const t = window.setTimeout(() => setRevealed(true), 40);
    return () => window.clearTimeout(t);
  }, [showResults]);

  const vote = useMutation({
    mutationFn: (c: "agree" | "disagree") =>
      apiRequest(`/api/polls/${agree.pollId}/vote`, {
        method: "POST",
        body: JSON.stringify({ optionId: c === "agree" ? agree.agreeOptionId : agree.disagreeOptionId }),
      }),
    onMutate: (c) => setOptimistic(c),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: opinionExtrasKey(articleId) }),
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "";
      if (/مسبق/.test(msg)) {
        queryClient.invalidateQueries({ queryKey: opinionExtrasKey(articleId) });
        return;
      }
      setOptimistic(null);
      toast({ title: "تعذر تسجيل صوتك", description: "حاول مرة أخرى بعد قليل", variant: "destructive" });
    },
  });

  // أثناء انتظار الخادم نعرض الصوت محسوبًا محليًا
  const pending = !agree.userChoice && optimistic;
  const counts = pending
    ? agreeVotePercents(agree.agree + (optimistic === "agree" ? 1 : 0), agree.disagree + (optimistic === "disagree" ? 1 : 0))
    : { agree: agree.agreePct, disagree: agree.disagreePct, total: agree.total };

  return (
    <section
      dir="rtl"
      aria-labelledby="opinion-agree-title"
      className="my-10 rounded-[28px] border border-white bg-gradient-to-br from-[#E2F2FD] to-[#EEF1FE] px-5 py-7 sm:px-8 sm:py-8"
      data-testid="opinion-agree-vote"
    >
      <p className="m-0 text-center text-[13px] font-semibold text-[#0B6FA8]">رأيك يهمّ الكاتب</p>
      <h2 id="opinion-agree-title" className="m-0 mt-1 text-center text-[22px] font-bold text-[#1B2B3A] sm:text-[26px]">
        هل توافق الكاتب؟
      </h2>

      {!showResults ? (
        <div className="mx-auto mt-6 grid max-w-md grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => vote.mutate("agree")}
            disabled={vote.isPending}
            className="flex h-14 items-center justify-center gap-2 rounded-full bg-[#1E9BE6] text-[17px] font-bold text-white shadow-[0_6px_16px_rgba(30,155,230,0.32)] transition-transform hover:bg-[#178BD2] active:scale-[0.97]"
            data-testid="button-opinion-agree"
          >
            <ThumbsUp className="h-5 w-5" aria-hidden /> أوافق
          </button>
          <button
            type="button"
            onClick={() => vote.mutate("disagree")}
            disabled={vote.isPending}
            className="flex h-14 items-center justify-center gap-2 rounded-full border border-[#D8E3EE] bg-white text-[17px] font-bold text-[#1B2B3A] transition-transform hover:bg-[#F7FAFD] active:scale-[0.97]"
            data-testid="button-opinion-disagree"
          >
            <ThumbsDown className="h-5 w-5" aria-hidden /> لا أوافق
          </button>
        </div>
      ) : (
        <div className="mx-auto mt-6 max-w-md" aria-live="polite">
          <ResultRow
            label="أوافق"
            pct={counts.agree}
            mine={choice === "agree"}
            revealed={revealed}
            barClass="bg-[#1E9BE6]"
            testId="opinion-agree-result"
          />
          <ResultRow
            label="لا أوافق"
            pct={counts.disagree}
            mine={choice === "disagree"}
            revealed={revealed}
            barClass="bg-[#A9B8F5]"
            testId="opinion-disagree-result"
          />
          <p className="m-0 mt-4 text-center text-[13px] text-[#55667A]">
            <span dir="ltr">{nf.format(counts.total)}</span> {counts.total === 1 ? "صوت" : "صوتًا"} حتى الآن · تتحدث النتيجة مباشرة
          </p>
        </div>
      )}
    </section>
  );
}

function ResultRow({
  label,
  pct,
  mine,
  revealed,
  barClass,
  testId,
}: {
  label: string;
  pct: number;
  mine: boolean;
  revealed: boolean;
  barClass: string;
  testId: string;
}) {
  return (
    <div className="mb-3" data-testid={testId}>
      <div className="mb-1.5 flex items-center justify-between text-[15px]">
        <span className={cn("flex items-center gap-1.5 font-semibold", mine ? "text-[#0B6FA8]" : "text-[#1B2B3A]")}>
          {label}
          {mine ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-[#0B6FA8]">
              <Check className="h-3 w-3" aria-hidden /> اخترتَ هذا
            </span>
          ) : null}
        </span>
        <span dir="ltr" className="text-[20px] font-bold tabular-nums text-[#1B2B3A]">
          {pct}%
        </span>
      </div>
      <div className="h-3.5 overflow-hidden rounded-full bg-white/80">
        <div
          className={cn("h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none", barClass)}
          style={{ width: revealed ? `${pct}%` : "0%" }}
        />
      </div>
    </div>
  );
}
