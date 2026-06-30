import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Clock, Coins, Crown, Goal, Info, Lock, LogIn, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatNumber } from "@/lib/format";
import type { WcLongData } from "./predictionsTypes";

const LONG_KEY = ["/api/world-cup/predictions/long"];

// مدرّج وزن المبادر للبطل — يُعرَض كخطّ زمني يوضّح أن الأبكر يربح حصّة أكبر.
const WEIGHT_TIERS = [
  { stage: "r32", label: "حتى دور الـ16", mult: "×1.0", weight: 100 },
  { stage: "r16", label: "دور الـ16", mult: "×0.6", weight: 60 },
  { stage: "qf", label: "ربع النهائي", mult: "×0.3", weight: 30 },
] as const;

export function WcLongPredictions({
  isAuthenticated,
  onRequireLogin,
}: {
  isAuthenticated: boolean;
  onRequireLogin: () => void;
}) {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<WcLongData>({
    queryKey: LONG_KEY,
    retry: false,
    staleTime: 60_000,
  });

  const teams = Array.isArray(data?.teams) ? data!.teams : [];
  const scorers = Array.isArray(data?.scorers) ? data!.scorers : [];
  const mine = Array.isArray(data?.mine) ? data!.mine : [];
  const myChampion = mine.find((m) => m.kind === "champion");
  const myScorer = mine.find((m) => m.kind === "top_scorer");

  const champVotes = useMemo(() => {
    const m = new Map<number, { n: number; w: number }>();
    for (const v of data?.champion.votes ?? []) if (v.teamId != null) m.set(v.teamId, { n: v.n, w: v.w });
    return m;
  }, [data?.champion.votes]);
  const champTotalVotes = Array.from(champVotes.values()).reduce((a, b) => a + b.n, 0);

  const scorerVotes = useMemo(() => {
    const m = new Map<number, number>();
    for (const v of data?.topScorer.votes ?? []) if (v.playerId != null) m.set(v.playerId, v.n);
    return m;
  }, [data?.topScorer.votes]);
  const scorerTotalVotes = Array.from(scorerVotes.values()).reduce((a, b) => a + b, 0);

  const [champPick, setChampPick] = useState<number | null>(null);
  const [scorerPick, setScorerPick] = useState<number | null>(null);

  const champMutation = useMutation({
    mutationFn: (teamId: number) =>
      apiRequest("/api/world-cup/predictions/long", {
        method: "POST",
        body: JSON.stringify({ kind: "champion", teamId }),
      }),
    onSuccess: () => {
      toast({ title: "تم حفظ توقّع البطل 👑", description: "بالتوفيق! تُسوّى الجائزة بعد النهائي." });
      queryClient.invalidateQueries({ queryKey: LONG_KEY });
    },
    onError: (err: any) =>
      toast({ title: "تعذّر الحفظ", description: err?.message || "حاول مجددًا", variant: "destructive" }),
  });

  const scorerMutation = useMutation({
    mutationFn: (playerId: number) =>
      apiRequest("/api/world-cup/predictions/long", {
        method: "POST",
        body: JSON.stringify({ kind: "top_scorer", playerId }),
      }),
    onSuccess: () => {
      toast({ title: "تم حفظ توقّع الهدّاف ⚽", description: "بالتوفيق!" });
      queryClient.invalidateQueries({ queryKey: LONG_KEY });
    },
    onError: (err: any) =>
      toast({ title: "تعذّر الحفظ", description: err?.message || "حاول مجددًا", variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-64 animate-pulse rounded-2xl bg-muted/60" />
        <div className="h-48 animate-pulse rounded-2xl bg-muted/60" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-2xl border border-dashed border-border py-14 text-center">
        <Crown className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
        <p className="font-bold">توقّعات البطولة قيد الإطلاق</p>
        <p className="mt-1 text-sm text-muted-foreground">عُد قريبًا — توقّع البطل والهدّاف واربح آلاف النقاط.</p>
      </div>
    );
  }

  const champOpen = data.champion.open;
  const liveWeight = data.champion.weight ?? 0; // الوزن لو حفظتُ الآن
  const pickedChampId = champPick ?? myChampion?.teamId ?? null;

  // حصّة البطل التقديرية إذا فاز اختيارك = البركة × وزنك ÷ (أوزان من اختاروا نفس
  // المنتخب + وزنك إن لم تكن محسوبًا بعد).
  const myChampWeight = myChampion?.weight ?? liveWeight;
  const estChampShare = (() => {
    if (!pickedChampId || myChampWeight <= 0) return 0;
    const teamW = champVotes.get(pickedChampId)?.w ?? 0;
    const alreadyOnTeam = myChampion?.teamId === pickedChampId;
    const denom = teamW + (alreadyOnTeam ? 0 : myChampWeight);
    return denom > 0 ? Math.floor((data.pools.champion * myChampWeight) / denom) : 0;
  })();

  return (
    <div className="space-y-5">
      {/* ═══ كيف تعمل المسابقة؟ ═══ */}
      <section className="rounded-2xl border border-border bg-muted/30 p-4">
        <div className="mb-2.5 flex items-center gap-2">
          <Info className="h-5 w-5 text-emerald-600" />
          <h3 className="text-base font-black">كيف تعمل توقّعات البطولة؟</h3>
        </div>
        <ul className="space-y-2 text-xs leading-relaxed text-muted-foreground sm:text-[13px]">
          <li className="flex gap-2">
            <span>🏆</span>
            <span>
              <b className="text-foreground">البطل ({formatNumber(data?.pools.champion ?? 10000)} نقطة):</b> اختر من يرفع
              الكأس من المنتخبات <b>المتأهّلة لدور الـ32</b>. تُقسَّم الجائزة على كل من يصيب البطل <b>مرجّحةً بوزن توقّعك</b> —
              لا بالتساوي.
            </span>
          </li>
          <li className="flex gap-2">
            <span>⏱️</span>
            <span>
              <b className="text-foreground">وزن المبادر:</b> كلّما ثبّت توقّعك أبكر كبُرت حصّتك —
              <b> ×1.0</b> حتى دور الـ16، <b>×0.6</b> في دور الـ16، <b>×0.3</b> في ربع النهائي، ثم <b>يُغلق</b> عند انطلاق نصف النهائي.
            </span>
          </li>
          <li className="flex gap-2">
            <span>⚽</span>
            <span>
              <b className="text-foreground">الهدّاف ({formatNumber(data?.pools.top_scorer ?? 3000)} نقطة):</b> اختر متصدّر
              الهدّافين. تُقسَّم الجائزة <b>بالتساوي</b> على المصيبين، ويُغلق التوقّع عند انطلاق ربع النهائي.
            </span>
          </li>
          <li className="flex gap-2">
            <span>🎯</span>
            <span>
              <b className="text-foreground">الاحتساب:</b> تُمنَح النقاط تلقائيًّا بعد النهائي — البطل = الفائز باللقب، الهدّاف =
              متصدّر لائحة الهدّافين الرسمية.
            </span>
          </li>
        </ul>
      </section>

      {/* ═══ البطل ═══ */}
      <section className="overflow-hidden rounded-2xl border border-amber-500/25 bg-gradient-to-bl from-amber-500/[0.08] to-transparent">
        <div className="flex items-center gap-2 border-b border-amber-500/15 px-4 py-3">
          <Crown className="h-5 w-5 text-amber-500" />
          <h3 className="text-base font-black">من يرفع كأس العالم 2026؟</h3>
          <span className="ms-auto inline-flex items-center gap-1 rounded-full bg-amber-500 px-2.5 py-0.5 text-[11px] font-black text-white">
            <Coins className="h-3 w-3" /> {formatNumber(data.pools.champion)} نقطة
          </span>
        </div>

        <div className="p-4">
          {/* خطّ وزن المبادر — العنصر الإبداعي */}
          <div className="mb-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-3">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-amber-700 dark:text-amber-300">
              <TrendingUp className="h-3.5 w-3.5" />
              ثبّت مبكرًا = حصّة أكبر — تُقسَّم الجائزة مرجّحةً بوزن توقّعك
            </div>
            <div className="flex items-center gap-1">
              {WEIGHT_TIERS.map((t, i) => {
                const active = data.champion.stage === t.stage;
                const passed =
                  WEIGHT_TIERS.findIndex((x) => x.stage === data.champion.stage) > i || !champOpen;
                return (
                  <div key={t.stage} className="flex flex-1 items-center gap-1">
                    <div
                      className={`flex-1 rounded-lg px-1.5 py-1.5 text-center transition ${
                        active
                          ? "bg-amber-500 text-white shadow-sm"
                          : passed
                            ? "bg-muted/60 text-muted-foreground line-through"
                            : "bg-background text-foreground ring-1 ring-amber-500/20"
                      }`}
                    >
                      <div className="text-[13px] font-black tabular-nums">{t.mult}</div>
                      <div className="text-[9px] leading-tight opacity-80">{t.label}</div>
                    </div>
                    {i < WEIGHT_TIERS.length - 1 && <span className="text-amber-400">‹</span>}
                  </div>
                );
              })}
              <span className="text-amber-400">‹</span>
              <div
                className={`rounded-lg px-2 py-1.5 text-center ${
                  !champOpen ? "bg-rose-500 text-white" : "bg-background text-muted-foreground ring-1 ring-border"
                }`}
              >
                <Lock className="mx-auto h-3 w-3" />
                <div className="text-[9px] leading-tight">إغلاق</div>
              </div>
            </div>
          </div>

          {myChampion?.teamName ? (
            <StatusPill
              status={myChampion.status}
              points={myChampion.pointsAwarded}
              label={`اخترت: ${myChampion.teamName}`}
              extra={
                myChampion.status === "pending" && champOpen
                  ? `بوزن ×${(myChampion.weight / 100).toFixed(1)}`
                  : undefined
              }
            />
          ) : null}

          {champOpen ? (
            <>
              <p className="mb-2 mt-3 text-xs font-bold text-muted-foreground">
                اختر البطل من المتأهّلين لدور الـ32 ({formatNumber(teams.length)} منتخبًا)
              </p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {teams.map((t) => {
                  const selected = pickedChampId === t.id;
                  const pct =
                    champTotalVotes > 0
                      ? Math.round(((champVotes.get(t.id)?.n ?? 0) / champTotalVotes) * 100)
                      : 0;
                  return (
                    <button
                      key={t.id}
                      onClick={() => (isAuthenticated ? setChampPick(t.id) : onRequireLogin())}
                      className={`relative flex flex-col items-center gap-1.5 overflow-hidden rounded-xl border p-2.5 text-center transition ${
                        selected
                          ? "border-amber-500 bg-amber-500/10 ring-1 ring-amber-500/40"
                          : "border-border hover:border-amber-400/50"
                      }`}
                      data-testid={`wc-champion-${t.id}`}
                    >
                      <span className="h-10 w-10 rounded-full bg-white p-1 ring-1 ring-border">
                        {t.logo ? (
                          <img src={t.logo} alt={t.name} className="h-full w-full object-contain" loading="lazy" />
                        ) : null}
                      </span>
                      <span className="line-clamp-1 text-xs font-bold">{t.name}</span>
                      {champTotalVotes > 0 && (
                        <span className="text-[10px] tabular-nums text-muted-foreground">{pct}%</span>
                      )}
                    </button>
                  );
                })}
              </div>

              {pickedChampId && estChampShare > 0 && (
                <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-center text-xs font-bold text-amber-700 dark:text-amber-300">
                  إذا فاز اختيارك، حصّتك التقديرية ≈ {formatNumber(estChampShare)} نقطة
                </p>
              )}

              {isAuthenticated ? (
                <Button
                  className="mt-3 w-full gap-2 bg-amber-500 text-white hover:bg-amber-600"
                  disabled={champPick == null || champPick === myChampion?.teamId || champMutation.isPending}
                  onClick={() => champPick != null && champMutation.mutate(champPick)}
                >
                  <Crown className="h-4 w-4" />
                  {myChampion ? `حدّث البطل (بوزن ×${(liveWeight / 100).toFixed(1)})` : `احفظ البطل (بوزن ×${(liveWeight / 100).toFixed(1)})`}
                </Button>
              ) : (
                <Button onClick={onRequireLogin} variant="outline" className="mt-3 w-full gap-2">
                  <LogIn className="h-4 w-4" /> سجّل دخولك للتوقّع
                </Button>
              )}
            </>
          ) : (
            <div className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-dashed border-rose-300 py-4 text-sm font-bold text-rose-600 dark:text-rose-400">
              <Lock className="h-4 w-4" /> أُغلق توقّع البطل — انطلق نصف النهائي
            </div>
          )}
        </div>
      </section>

      {/* ═══ الهدّاف ═══ */}
      <section className="overflow-hidden rounded-2xl border border-emerald-600/25 bg-gradient-to-bl from-emerald-600/[0.06] to-transparent">
        <div className="flex items-center gap-2 border-b border-emerald-600/15 px-4 py-3">
          <Goal className="h-5 w-5 text-emerald-700 dark:text-emerald-400" />
          <h3 className="text-base font-black">من هدّاف البطولة؟</h3>
          <span className="ms-auto inline-flex items-center gap-1 rounded-full bg-emerald-700 px-2.5 py-0.5 text-[11px] font-black text-white">
            <Coins className="h-3 w-3" /> {formatNumber(data.pools.top_scorer)} نقطة
          </span>
        </div>

        <div className="p-4">
          <p className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" /> تُقسَّم بالتساوي على المصيبين · يُغلق عند انطلاق ربع النهائي
          </p>

          {myScorer?.playerName ? (
            <StatusPill status={myScorer.status} points={myScorer.pointsAwarded} label={`اخترت: ${myScorer.playerName}`} />
          ) : null}

          {!data.topScorer.open ? (
            <div className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-dashed border-rose-300 py-4 text-sm font-bold text-rose-600 dark:text-rose-400">
              <Lock className="h-4 w-4" /> أُغلق توقّع الهدّاف — انطلق ربع النهائي
            </div>
          ) : scorers.length === 0 ? (
            <p className="mt-3 text-center text-sm text-muted-foreground">لم تُسجّل أهداف بعد — عُد بعد انطلاق المباريات.</p>
          ) : (
            <>
              <div className="mt-1 grid gap-2 sm:grid-cols-2">
                {scorers.map((s) => {
                  const selected = (scorerPick ?? myScorer?.playerId) === s.id;
                  const pct =
                    scorerTotalVotes > 0 ? Math.round(((scorerVotes.get(s.id) ?? 0) / scorerTotalVotes) * 100) : 0;
                  return (
                    <button
                      key={s.id}
                      onClick={() => (isAuthenticated ? setScorerPick(s.id) : onRequireLogin())}
                      className={`flex items-center gap-2.5 rounded-xl border p-2 text-right transition ${
                        selected
                          ? "border-emerald-600 bg-emerald-600/10 ring-1 ring-emerald-600/40"
                          : "border-border hover:border-emerald-500/50"
                      }`}
                      data-testid={`wc-scorer-${s.id}`}
                    >
                      <span className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-muted ring-1 ring-border">
                        {s.photo ? <img src={s.photo} alt={s.name} className="h-full w-full object-cover" loading="lazy" /> : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="line-clamp-1 text-sm font-bold">{s.name}</span>
                        </span>
                        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          {s.team.logo ? <img src={s.team.logo} alt="" className="h-3 w-3 object-contain" /> : null}
                          <span className="line-clamp-1">{s.team.name}</span>
                        </span>
                      </span>
                      <span className="shrink-0 text-center">
                        <span className="block text-base font-black tabular-nums text-emerald-700 dark:text-emerald-400">{formatNumber(s.goals)}</span>
                        <span className="block text-[9px] text-muted-foreground">{scorerTotalVotes > 0 ? `${pct}%` : "هدف"}</span>
                      </span>
                    </button>
                  );
                })}
              </div>

              {isAuthenticated ? (
                <Button
                  className="mt-3 w-full gap-2 bg-emerald-700 text-white hover:bg-emerald-800"
                  disabled={scorerPick == null || scorerPick === myScorer?.playerId || scorerMutation.isPending}
                  onClick={() => scorerPick != null && scorerMutation.mutate(scorerPick)}
                >
                  <Goal className="h-4 w-4" /> {myScorer ? "حدّث توقّع الهدّاف" : "احفظ توقّع الهدّاف"}
                </Button>
              ) : (
                <Button onClick={onRequireLogin} variant="outline" className="mt-3 w-full gap-2">
                  <LogIn className="h-4 w-4" /> سجّل دخولك للتوقّع
                </Button>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function StatusPill({
  status,
  points,
  label,
  extra,
}: {
  status: string;
  points: number;
  label: string;
  extra?: string;
}) {
  const cls =
    status === "correct"
      ? "bg-emerald-600/15 text-emerald-800 dark:text-emerald-300"
      : status === "incorrect"
        ? "bg-rose-500/15 text-rose-700 dark:text-rose-300"
        : "bg-amber-500/15 text-amber-800 dark:text-amber-300";
  return (
    <div className={`inline-flex flex-wrap items-center gap-2 rounded-full px-3 py-1 text-xs font-bold ${cls}`}>
      <Check className="h-3.5 w-3.5" /> {label}
      {status === "correct" && <span className="tabular-nums">· أصبت +{formatNumber(points)}</span>}
      {status === "incorrect" && <span>· لم تُصب</span>}
      {extra && <span className="opacity-80">· {extra}</span>}
    </div>
  );
}
