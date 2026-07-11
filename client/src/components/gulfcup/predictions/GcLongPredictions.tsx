import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Coins, Crown, Goal, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatNumber } from "@/lib/format";
import type { GcLongData } from "./gcPredictionTypes";

export function GcLongPredictions({
  isAuthenticated,
  onRequireLogin,
}: {
  isAuthenticated: boolean;
  onRequireLogin: () => void;
}) {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<GcLongData>({
    queryKey: ["/api/gulf-cup/predictions/long"],
    staleTime: 60_000,
  });

  const teams = Array.isArray(data?.teams) ? data!.teams : [];
  const mine = Array.isArray(data?.mine) ? data!.mine : [];
  const myChampion = mine.find((m) => m.kind === "champion");
  const myScorer = mine.find((m) => m.kind === "top_scorer");

  const votes = useMemo(() => {
    const map = new Map<number, number>();
    for (const v of data?.championVotes ?? []) if (v.teamId != null) map.set(v.teamId, v.n);
    return map;
  }, [data?.championVotes]);
  const totalVotes = Array.from(votes.values()).reduce((a, b) => a + b, 0);

  const [champPick, setChampPick] = useState<number | null>(null);
  const [scorer, setScorer] = useState("");

  const champMutation = useMutation({
    mutationFn: (teamId: number) =>
      apiRequest("/api/gulf-cup/predictions/long", {
        method: "POST",
        body: JSON.stringify({ kind: "champion", teamId }),
      }),
    onSuccess: () => {
      toast({ title: "تم حفظ توقّع البطل 👑", description: "بالتوفيق! تُسوّى الجائزة بعد النهائي." });
      queryClient.invalidateQueries({ queryKey: ["/api/gulf-cup/predictions/long"] });
    },
    onError: (err: any) =>
      toast({ title: "تعذّر الحفظ", description: err?.message || "حاول مجددًا", variant: "destructive" }),
  });

  const scorerMutation = useMutation({
    mutationFn: (playerName: string) =>
      apiRequest("/api/gulf-cup/predictions/long", {
        method: "POST",
        body: JSON.stringify({ kind: "top_scorer", playerName }),
      }),
    onSuccess: () => {
      toast({ title: "تم حفظ توقّع الهدّاف ⚽", description: "بالتوفيق!" });
      queryClient.invalidateQueries({ queryKey: ["/api/gulf-cup/predictions/long"] });
    },
    onError: (err: any) =>
      toast({ title: "تعذّر الحفظ", description: err?.message || "حاول مجددًا", variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="h-40 animate-pulse rounded-2xl bg-muted/60" />
        <div className="h-28 animate-pulse rounded-2xl bg-muted/60" />
      </div>
    );
  }

  // فشل الجلب (مثلًا المسابقة غير مفعّلة) — رسالة واضحة بدل فراغ صامت.
  if (!data) {
    return (
      <div className="rounded-2xl border border-dashed border-border py-14 text-center">
        <Crown className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
        <p className="font-bold">توقّعات البطل والهدّاف غير متاحة حاليًا</p>
        <p className="mt-1 text-sm text-muted-foreground">تُفتح هنا قبل انطلاق البطولة — عُد قريبًا.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* البطل */}
      <section className="rounded-2xl border border-amber-500/20 bg-gradient-to-l from-amber-500/[0.06] to-transparent p-4">
        <div className="mb-1 flex items-center gap-2">
          <Crown className="h-5 w-5 text-amber-500" />
          <h3 className="text-base font-black">من يرفع كأس خليجي 27؟</h3>
          <span className="ms-auto inline-flex items-center gap-1 rounded-full bg-amber-500 px-2.5 py-0.5 text-[11px] font-black text-white">
            <Coins className="h-3 w-3" /> {formatNumber(data?.pools.champion ?? 5000)} نقطة
          </span>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          تُقسَّم بركة البطل بالتساوي على كل من يصيب المنتخب البطل. تُغلق عند انطلاق البطولة.
        </p>

        {myChampion?.teamName && (
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-green-600/15 px-3 py-1 text-xs font-bold text-green-800 dark:text-green-300">
            <Check className="h-3.5 w-3.5" /> اخترت: {myChampion.teamName}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {teams.map((t) => {
            const selected = (champPick ?? myChampion?.teamId) === t.id;
            const pct = totalVotes > 0 ? Math.round(((votes.get(t.id) ?? 0) / totalVotes) * 100) : 0;
            return (
              <button
                key={t.id}
                onClick={() => (isAuthenticated ? setChampPick(t.id) : onRequireLogin())}
                className={`relative flex flex-col items-center gap-1.5 overflow-hidden rounded-xl border p-2.5 text-center transition ${
                  selected ? "border-amber-500 bg-amber-500/10 ring-1 ring-amber-500/40" : "border-border hover:border-amber-400/50"
                }`}
                data-testid={`gc-champion-${t.id}`}
              >
                <span className="h-10 w-10 rounded-full bg-white p-1 ring-1 ring-border">
                  {t.logo ? <img src={t.logo} alt={t.name} className="h-full w-full object-contain" loading="lazy" /> : null}
                </span>
                <span className="line-clamp-1 text-xs font-bold">{t.name}</span>
                {totalVotes > 0 && <span className="text-[10px] tabular-nums text-muted-foreground">{pct}%</span>}
              </button>
            );
          })}
        </div>

        {isAuthenticated ? (
          <Button
            className="mt-3 w-full gap-2 bg-amber-500 text-white hover:bg-amber-600"
            disabled={champPick == null || champPick === myChampion?.teamId || champMutation.isPending}
            onClick={() => champPick != null && champMutation.mutate(champPick)}
          >
            <Crown className="h-4 w-4" /> {myChampion ? "تعديل توقّع البطل" : "احفظ توقّع البطل"}
          </Button>
        ) : (
          <Button onClick={onRequireLogin} variant="outline" className="mt-3 w-full gap-2">
            <LogIn className="h-4 w-4" /> سجّل دخولك للتوقّع
          </Button>
        )}
      </section>

      {/* الهدّاف */}
      <section className="rounded-2xl border border-green-600/20 bg-gradient-to-l from-green-600/[0.05] to-transparent p-4">
        <div className="mb-1 flex items-center gap-2">
          <Goal className="h-5 w-5 text-green-700 dark:text-green-400" />
          <h3 className="text-base font-black">من هدّاف البطولة؟</h3>
          <span className="ms-auto inline-flex items-center gap-1 rounded-full bg-green-700 px-2.5 py-0.5 text-[11px] font-black text-white">
            <Coins className="h-3 w-3" /> {formatNumber(data?.pools.top_scorer ?? 5000)} نقطة
          </span>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">اكتب اسم اللاعب الذي تتوقّع تصدّره لقائمة الهدّافين.</p>

        {myScorer?.playerName && (
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-green-600/15 px-3 py-1 text-xs font-bold text-green-800 dark:text-green-300">
            <Check className="h-3.5 w-3.5" /> اخترت: {myScorer.playerName}
          </div>
        )}

        <div className="flex gap-2">
          <input
            value={scorer}
            onChange={(e) => setScorer(e.target.value)}
            placeholder={myScorer?.playerName || "اسم اللاعب…"}
            maxLength={60}
            className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-green-500"
            data-testid="gc-scorer-input"
            onFocus={() => !isAuthenticated && onRequireLogin()}
          />
          <Button
            className="gap-2 bg-green-700 text-white hover:bg-green-800"
            disabled={scorer.trim().length < 2 || scorerMutation.isPending}
            onClick={() => (isAuthenticated ? scorerMutation.mutate(scorer.trim()) : onRequireLogin())}
          >
            حفظ
          </Button>
        </div>
      </section>
    </div>
  );
}
