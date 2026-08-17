// بطاقة مسابقة الموسم (بطل الموسم / هدّاف الموسم) — سطح توقّع الاختيار الطويل:
// قائمة خيارات جاهزة من metadata.options (تُدمج عند إنشاء المسابقة بسكربت
// create-rsl-longterm-contests.ts)، وحمولة {pickId, pickName} على نفس نقطة
// الحفظ الموحّدة. الأزرار للمسجّلين، وغيرهم يُدعى لتسجيل الدخول.

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Crown, Goal, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  contestTypeLabelAr,
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
};

export function PredictionSeasonCard({ contest, competitionSlug, isAuthenticated, onLoginNeeded }: Props) {
  const { toast } = useToast();
  const mine = contest.myEntry?.payload;
  const [editing, setEditing] = useState(false);
  const [pickId, setPickId] = useState<string | null>(mine?.pickId ?? null);

  // ساعة حية كل 30 ثانية — حتى لا يبقى زر «توقّع» ظاهرًا بعد مرور الإغلاق في تبويب خامل.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const lockPassed = Date.parse(contest.locksAt) <= now;
  const isOpen = contest.status === "open" && !lockPassed;

  const { data: detailRaw } = useQuery<PredContestDetail>({
    queryKey: [`/api/predictions/contests/${contest.id}`],
    enabled: editing && isOpen,
    staleTime: 5 * 60_000,
  });

  const options = Array.isArray(contest.metadata?.options) ? contest.metadata.options : [];
  const selected = options.find((option) => option.id === pickId) ?? null;
  const mineName = mine?.pickName ?? options.find((o) => o.id === mine?.pickId)?.name ?? null;

  const submitMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/predictions/contests/${contest.id}/entry`, {
        method: "PUT",
        body: JSON.stringify({ prediction: { pickId, pickName: selected?.name } }),
      }),
    onSuccess: () => {
      toast({ title: "تم حفظ توقّعك ✅", description: "يمكنك تعديله حتى إقفال المسابقة" });
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: [`/api/predictions/competitions/${competitionSlug}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/predictions/me/entries"] });
    },
    onError: () =>
      toast({
        title: "تعذّر حفظ التوقّع",
        description: "ربما أُقفلت المسابقة — حدّث الصفحة",
        variant: "destructive",
      }),
  });

  const Icon = contest.contestType === "champion" ? Crown : Goal;
  const countdown = isOpen ? lockCountdownAr(contest.locksAt, now) : null;
  const title = contest.metadata?.title ?? contestTypeLabelAr(contest.contestType);

  return (
    <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-bl from-amber-500/10 to-transparent p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[13.5px] font-extrabold text-foreground">
          <Icon className="h-4 w-4 text-amber-500" />
          {title}
        </span>
        {isOpen ? (
          mineName ? (
            <button
              type="button"
              onClick={() => (isAuthenticated ? setEditing((v) => !v) : onLoginNeeded())}
              className="rounded-full bg-amber-500/15 px-3 py-1 text-[11px] font-bold text-amber-700 transition hover:bg-amber-500/25 dark:text-amber-400"
            >
              اخترتَ {mineName} · تعديل
            </button>
          ) : (
            <button
              type="button"
              onClick={() => (isAuthenticated ? setEditing((v) => !v) : onLoginNeeded())}
              className="rounded-full bg-amber-500 px-4 py-1 text-[11px] font-bold text-white transition hover:opacity-90"
            >
              توقّع الآن
            </button>
          )
        ) : contest.status === "settled" ? (
          <span className="rounded-full bg-muted px-3 py-1 text-[11px] font-bold text-muted-foreground">حُسمت</span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-3 py-1 text-[11px] font-bold text-destructive">
            <Lock className="h-3 w-3" />
            {mineName ? `اخترتَ ${mineName} — مقفل` : "مقفلة"}
          </span>
        )}
      </div>

      {countdown && <p className="mt-1.5 text-[11px] text-muted-foreground">{countdown}</p>}

      {editing && isOpen && (
        <div className="mt-3 space-y-3 border-t border-amber-500/20 pt-3">
          {detailRaw?.rule && (
            <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-[11.5px] font-semibold leading-relaxed text-amber-800 dark:text-amber-300">
              {ruleSummaryAr(detailRaw.rule)}
            </p>
          )}
          {options.length === 0 ? (
            <p className="text-center text-[12px] text-muted-foreground">قائمة الخيارات غير متاحة حاليًا</p>
          ) : (
            <div className="grid max-h-64 grid-cols-2 gap-1.5 overflow-y-auto sm:grid-cols-3">
              {options.map((option) => {
                const active = option.id === pickId;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setPickId(option.id)}
                    aria-pressed={active}
                    className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 text-right transition ${
                      active
                        ? "border-amber-500 bg-amber-500/15"
                        : "border-border bg-card hover:bg-muted"
                    }`}
                  >
                    {option.logo ? (
                      <img src={option.logo} alt="" className="h-6 w-6 shrink-0 rounded-full bg-white object-contain p-0.5" loading="lazy" />
                    ) : (
                      <span className="h-6 w-6 shrink-0 rounded-full bg-muted" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-[11.5px] font-bold text-foreground">{option.name}</span>
                    {active && <Check className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />}
                  </button>
                );
              })}
            </div>
          )}
          <button
            type="button"
            onClick={() => submitMutation.mutate()}
            disabled={!pickId || submitMutation.isPending}
            className="w-full rounded-xl bg-amber-500 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {submitMutation.isPending
              ? "جارٍ الحفظ…"
              : selected
                ? `تأكيد الاختيار: ${selected.name}`
                : "اختر أولًا"}
          </button>
        </div>
      )}
    </div>
  );
}
