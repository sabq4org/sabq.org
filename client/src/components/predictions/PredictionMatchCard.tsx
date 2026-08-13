// بطاقة مباراة في مركز التوقعات — سطح التوقع نفسه على الويب: عدّاد نتيجة
// وشريط قاعدة مولّد من الملف الفعّال (يُجلب عند فتح العدّاد)، وحالة واحدة
// واضحة لكل مباراة. الأزرار للمسجّلين، وغيرهم يُدعى لتسجيل الدخول.

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Lock, Minus, Plus, Shield, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatNumber } from "@/lib/format";
import {
  kickoffTimeAr,
  lockCountdownAr,
  ruleSummaryAr,
  type PredContest,
  type PredContestDetail,
} from "./predictionTypes";

type Props = {
  contest: PredContest;
  competitionSlug: string;
  isAuthenticated: boolean;
  onLoginNeeded: () => void;
  onOpenSettlement: (contestId: string) => void;
  /** تمييز من رابط عميق (?fixture= / ?contest=) */
  highlighted?: boolean;
};

export function PredictionMatchCard({
  contest,
  competitionSlug,
  isAuthenticated,
  onLoginNeeded,
  onOpenSettlement,
  highlighted = false,
}: Props) {
  const { toast } = useToast();
  const mine = contest.myEntry?.payload;
  const [editing, setEditing] = useState(false);
  const [predHome, setPredHome] = useState(mine?.predHome ?? 0);
  const [predAway, setPredAway] = useState(mine?.predAway ?? 0);

  // ساعة حية كل 30 ثانية: العدّاد التنازلي كان يُحسب مرة واحدة عند الرسم،
  // فيبقى تبويب خامل يعرض «توقّع الآن» بعد انطلاق المباراة ثم يفشل الحفظ.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const lockPassed = Date.parse(contest.locksAt) <= now;
  const isOpen = contest.status === "open" && !lockPassed;

  // القاعدة تُجلب عند فتح العدّاد فقط — من ملف الاحتساب الفعّال
  const { data: detailRaw } = useQuery<PredContestDetail>({
    queryKey: [`/api/predictions/contests/${contest.id}`],
    enabled: editing && isOpen,
    staleTime: 5 * 60_000,
  });

  const submitMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/predictions/contests/${contest.id}/entry`, {
        method: "PUT",
        body: JSON.stringify({ prediction: { predHome, predAway } }),
      }),
    onSuccess: () => {
      toast({ title: "تم حفظ توقّعك ✅", description: "يمكنك تعديله حتى ضربة البداية" });
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: [`/api/predictions/competitions/${competitionSlug}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/predictions/me/entries"] });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : "";
      const locked = message.includes("PREDICTION_LOCKED") || message.includes("409");
      toast({
        title: locked ? "أُقفل التوقّع" : "تعذّر حفظ التوقّع",
        description: locked
          ? "انطلقت المباراة — التوقّع يُقفل عند ضربة البداية"
          : "تحقّق من اتصالك وحاول مجددًا",
        variant: "destructive",
      });
      if (locked) {
        setEditing(false);
        queryClient.invalidateQueries({ queryKey: [`/api/predictions/competitions/${competitionSlug}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/predictions/me/entries"] });
      }
    },
  });

  const home = contest.metadata?.home;
  const away = contest.metadata?.away;
  const countdown = isOpen ? lockCountdownAr(contest.locksAt, now) : null;

  return (
    <div
      id={`pred-contest-${contest.id}`}
      data-fixture-ref={contest.externalRef ?? undefined}
      data-testid={`prediction-match-card-${contest.id}`}
      className={`rounded-2xl border bg-card p-4 shadow-sm scroll-mt-24 transition ring-offset-2 ${
        highlighted
          ? "border-sky-500 ring-2 ring-sky-400/70"
          : "border-border"
      }`}
    >
      {/* الفريقان والوسط */}
      <div className="flex items-center gap-2">
        <TeamSide name={home?.name} logo={home?.logo} />
        <div className="min-w-[72px] text-center">
          {contest.status === "settled" && contest.result ? (
            // المضيف معروض يمينًا في RTL — الضيف أولًا داخل LTR ليلاصق كل رقم فريقه
            <span className="text-xl font-extrabold tabular-nums text-foreground" dir="ltr">
              {contest.result.finalAway}–{contest.result.finalHome}
            </span>
          ) : (
            <span className="text-sm font-bold tabular-nums text-muted-foreground">
              {kickoffTimeAr(contest.locksAt)}
            </span>
          )}
        </div>
        <TeamSide name={away?.name} logo={away?.logo} trailing />
      </div>

      {/* السطر السفلي: يمين = جولة/عدّاد + عدد المشاركين · يسار = حالة التوقّع */}
      <div className="mt-3 flex items-end justify-between gap-2">
        <div className="min-w-0 space-y-0.5 text-start">
          <p className="text-[11px] text-muted-foreground">
            {[contest.metadata?.round, countdown].filter(Boolean).join(" · ")}
          </p>
          <p
            className="inline-flex items-center gap-1 text-[11px] font-semibold tabular-nums text-muted-foreground"
            data-testid={`contest-entries-count-${contest.id}`}
          >
            <Users className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
            {(contest.entriesCount ?? 0) > 0
              ? `${formatNumber(contest.entriesCount ?? 0)} متوقّع`
              : "كن أول المتوقّعين"}
          </p>
        </div>
        <StatusChip
          contest={contest}
          lockPassed={lockPassed}
          onPredict={() => {
            if (!isAuthenticated) return onLoginNeeded();
            setEditing((value) => !value);
          }}
          onOpenSettlement={() => onOpenSettlement(contest.id)}
        />
      </div>

      {/* العدّاد + القاعدة + الحفظ */}
      {editing && isOpen && (
        <div className="mt-4 space-y-3 border-t border-border pt-4">
          {detailRaw?.rule && (
            <p className="rounded-xl bg-primary/10 px-3 py-2 text-[11.5px] font-semibold leading-relaxed text-primary">
              {ruleSummaryAr(detailRaw.rule)}
            </p>
          )}
          <div className="flex items-center justify-center gap-6">
            <Stepper value={predHome} onChange={setPredHome} label={home?.name ?? "المضيف"} />
            <span className="text-xl font-extrabold text-muted-foreground">-</span>
            <Stepper value={predAway} onChange={setPredAway} label={away?.name ?? "الضيف"} />
          </div>
          <button
            type="button"
            onClick={() => submitMutation.mutate()}
            disabled={submitMutation.isPending}
            className="w-full rounded-xl bg-primary py-2.5 text-sm font-bold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
          >
            {submitMutation.isPending ? (
              "جارٍ الحفظ…"
            ) : (
              <>تأكيد التوقّع <span dir="ltr" className="tabular-nums">{predAway}–{predHome}</span></>
            )}
          </button>
          <p className="text-center text-[10.5px] text-muted-foreground">
            يُقفل التوقّع عند ضربة البداية — ويمكنك تعديله حتى ذلك الحين
          </p>
        </div>
      )}
    </div>
  );
}

function TeamSide({ name, logo, trailing }: { name?: string | null; logo?: string | null; trailing?: boolean }) {
  return (
    <div className={`flex flex-1 items-center gap-2 ${trailing ? "flex-row-reverse" : ""}`}>
      {logo ? (
        <img src={logo} alt="" className="h-7 w-7 object-contain" loading="lazy" />
      ) : (
        <Shield className="h-6 w-6 text-muted-foreground/40" />
      )}
      <span className="truncate text-[13px] font-bold text-foreground">{name ?? "يُحدد لاحقًا"}</span>
    </div>
  );
}

function StatusChip({
  contest,
  lockPassed,
  onPredict,
  onOpenSettlement,
}: {
  contest: PredContest;
  lockPassed: boolean;
  onPredict: () => void;
  onOpenSettlement: () => void;
}) {
  const mine = contest.myEntry?.payload;
  // انقضى موعد الإغلاق والحالة لم تنقلب بعد (عامل القفل يعمل كل دقيقة) —
  // نعرض «مقفل» فورًا بدل زر توقّع سيفشل حتمًا.
  if (contest.status === "open" && lockPassed) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-3 py-1 text-[11px] font-bold text-destructive">
        <Lock className="h-3 w-3" />
        {mine ? (
          <>توقّعك <span dir="ltr" className="tabular-nums">{mine.predAway}–{mine.predHome}</span> مقفل</>
        ) : (
          "أُقفل التوقّع"
        )}
      </span>
    );
  }
  switch (contest.status) {
    case "open":
      return mine ? (
        <button
          type="button"
          onClick={onPredict}
          className="rounded-full bg-primary/10 px-3 py-1 text-[11px] font-bold text-primary transition hover:bg-primary/20"
        >
          توقّعتَ <span dir="ltr" className="tabular-nums">{mine.predAway}–{mine.predHome}</span> · تعديل
        </button>
      ) : (
        <button
          type="button"
          onClick={onPredict}
          className="rounded-full bg-primary px-4 py-1 text-[11px] font-bold text-primary-foreground transition hover:opacity-90"
        >
          توقّع الآن
        </button>
      );
    case "locked":
    case "ready":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-3 py-1 text-[11px] font-bold text-destructive">
          <Lock className="h-3 w-3" />
          {mine ? (
            <>توقّعك <span dir="ltr" className="tabular-nums">{mine.predAway}–{mine.predHome}</span> مقفل</>
          ) : (
            "مقفل — بانتظار النتيجة"
          )}
        </span>
      );
    case "settled":
      return (
        <button
          type="button"
          onClick={onOpenSettlement}
          className="rounded-full bg-amber-500/15 px-3 py-1 text-[11px] font-bold text-amber-700 transition hover:bg-amber-500/25 dark:text-amber-400"
        >
          احتُسبت — التفاصيل
        </button>
      );
    case "void":
      return (
        <span className="rounded-full bg-muted px-3 py-1 text-[11px] font-bold text-muted-foreground">أُلغيت</span>
      );
    default:
      return null;
  }
}

function Stepper({ value, onChange, label }: { value: number; onChange: (next: number) => void; label: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="max-w-[90px] truncate text-[11px] font-bold text-muted-foreground">{label}</span>
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-2xl font-extrabold tabular-nums text-foreground">
        {value}
      </span>
      <div className="flex gap-2">
        <StepButton onClick={() => value > 0 && onChange(value - 1)} ariaLabel="إنقاص الأهداف">
          <Minus className="h-3.5 w-3.5" />
        </StepButton>
        <StepButton onClick={() => value < 20 && onChange(value + 1)} ariaLabel="زيادة الأهداف">
          <Plus className="h-3.5 w-3.5" />
        </StepButton>
      </div>
    </div>
  );
}

function StepButton({
  onClick,
  ariaLabel,
  children,
}: {
  onClick: () => void;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary transition hover:bg-primary/20"
    >
      {children}
    </button>
  );
}
