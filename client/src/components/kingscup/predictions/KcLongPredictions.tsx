/**
 * توقّعات البطولة طويلة المدى لكأس الملك (البطل + الهدّاف) — نفس تبويب
 * «توقّع البطل» في المونديال (WcLongPredictions): صندوق «كيف تعمل؟»، قسم
 * البطل الذهبي بشبكة الأندية ونِسَب التصويت، وقسم الهدّاف الأخضر باختيار
 * من قائمة هدّافي البطولة أو كتابة الاسم. يُقفَل عند بلوغ الأدوار الحاسمة.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Coins, Crown, Flame, Goal, Info, Lock, LogIn, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatNumber } from "@/lib/format";
import type { KcScorer } from "../kcTypes";
import { KC_COMPETITION_SLUG, type KcLongData } from "./kcPredictionsTypes";

export function KcLongPredictions({
  isAuthenticated,
  onRequireLogin,
  endpoint,
  scorersKey = "/api/kings-cup/scorers",
}: {
  isAuthenticated: boolean;
  onRequireLogin: () => void;
  /**
   * مسار توقّعات البطولة طويلة المدى (GET/POST /long). افتراضيًّا محرّك الحوض
   * القديم؛ الكؤوس المُوحّدة تمرّر مسارها الخاص مثل "/api/kings-cup/predictions"
   * ليُدار خلف علمها المستقل نفسه (نفس جدول sports_pool_long تحت الغطاء).
   */
  endpoint?: string;
  /** مسار قائمة الهدّافين المرشّحين. */
  scorersKey?: string;
}) {
  const { toast } = useToast();
  // GET/POST المسار: إمّا المسار المُوحّد الممرَّر أو محرّك الحوض القديم مع ?comp=
  const longGetKey = endpoint ? `${endpoint}/long` : `/api/sports/predictions/long?comp=${KC_COMPETITION_SLUG}`;
  const longPostUrl = endpoint ? `${endpoint}/long` : "/api/sports/predictions/long";
  const LONG_KEY = [longGetKey];
  const { data, isLoading } = useQuery<KcLongData>({
    queryKey: LONG_KEY,
    retry: false,
    staleTime: 60_000,
  });

  // هدّافو البطولة الحاليون — مرشّحون جاهزون لتوقّع الهدّاف
  const { data: scorersData } = useQuery<{ scorers: KcScorer[] }>({
    queryKey: [scorersKey],
    staleTime: 10 * 60_000,
  });
  const scorers = Array.isArray(scorersData?.scorers) ? scorersData.scorers.slice(0, 10) : [];

  const teams = Array.isArray(data?.teams) ? data.teams : [];
  const mine = Array.isArray(data?.mine) ? data.mine : [];
  const myChampion = mine.find((m) => m.kind === "champion");
  const myScorer = mine.find((m) => m.kind === "top_scorer");
  const locked = data?.locked ?? false;

  const champVotes = useMemo(() => {
    const m = new Map<number, number>();
    for (const v of data?.championVotes ?? []) if (v.teamId != null) m.set(v.teamId, v.n);
    return m;
  }, [data?.championVotes]);
  const champTotalVotes = Array.from(champVotes.values()).reduce((a, b) => a + b, 0);

  // الأكثر توقّعًا للبطل — نفس منطق نسبة % المعروضة على كل بطاقة
  const champLeader = useMemo(() => {
    if (champTotalVotes === 0) return null;
    let best: { teamId: number; n: number } | null = null;
    for (const [teamId, n] of Array.from(champVotes.entries())) {
      if (!best || n > best.n) best = { teamId, n };
    }
    if (!best) return null;
    const team = teams.find((t) => t.id === best!.teamId);
    if (!team) return null;
    return { name: team.name, pct: Math.round((best.n / champTotalVotes) * 100) };
  }, [champVotes, champTotalVotes, teams]);

  const [champPick, setChampPick] = useState<number | null>(null);
  const [scorerName, setScorerName] = useState<string | null>(null);
  const pickedChampId = champPick ?? myChampion?.teamId ?? null;
  const pickedScorerName = scorerName ?? myScorer?.playerName ?? "";

  const champMutation = useMutation({
    mutationFn: (teamId: number) =>
      apiRequest(longPostUrl, {
        method: "POST",
        body: JSON.stringify({ competitionSlug: KC_COMPETITION_SLUG, kind: "champion", teamId }),
      }),
    onSuccess: () => {
      toast({ title: "تم حفظ توقّع البطل 👑", description: "بالتوفيق! تُسوّى الجائزة بعد النهائي." });
      queryClient.invalidateQueries({ queryKey: LONG_KEY });
    },
    onError: (err: any) =>
      toast({ title: "تعذّر الحفظ", description: err?.message || "حاول مجددًا", variant: "destructive" }),
  });

  const scorerMutation = useMutation({
    mutationFn: (playerName: string) =>
      apiRequest(longPostUrl, {
        method: "POST",
        body: JSON.stringify({ competitionSlug: KC_COMPETITION_SLUG, kind: "top_scorer", playerName }),
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

  const canSubmitScorer = pickedScorerName.trim().length >= 2 && pickedScorerName.trim() !== (myScorer?.playerName ?? "");

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
              <b className="text-foreground">البطل ({formatNumber(data.pools.champion)} نقطة):</b> اختر من يرفع
              كأس خادم الحرمين الشريفين من الأندية المشاركة — وتُمنح الجائزة للمصيبين بعد النهائي.
            </span>
          </li>
          <li className="flex gap-2">
            <span>⚽</span>
            <span>
              <b className="text-foreground">الهدّاف ({formatNumber(data.pools.top_scorer)} نقطة):</b> اختر متصدّر
              هدّافي البطولة عند نهايتها.
            </span>
          </li>
          <li className="flex gap-2">
            <span>⏱️</span>
            <span>
              <b className="text-foreground">الإغلاق:</b> تُقفل توقّعات البطل والهدّاف عند انطلاق الأدوار الحاسمة —
              ثبّت توقّعك مبكرًا.
            </span>
          </li>
        </ul>
      </section>

      {/* ═══ البطل ═══ */}
      <section className="overflow-hidden rounded-2xl border border-amber-500/25 bg-gradient-to-bl from-amber-500/[0.08] to-transparent">
        <div className="flex items-center gap-2 border-b border-amber-500/15 px-4 py-3">
          <Crown className="h-5 w-5 text-amber-500" />
          <h3 className="text-base font-black">من يرفع كأس الملك؟</h3>
          <span className="ms-auto inline-flex items-center gap-1 rounded-full bg-amber-500 px-2.5 py-0.5 text-[11px] font-black text-white">
            <Coins className="h-3 w-3" /> {formatNumber(data.pools.champion)} نقطة
          </span>
        </div>

        <div className="p-4">
          {champTotalVotes > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl bg-amber-500/[0.06] px-3 py-2 text-xs">
              <span className="flex items-center gap-1.5 font-bold text-amber-800 dark:text-amber-300">
                <Users className="h-3.5 w-3.5" /> {formatNumber(champTotalVotes)} توقّعوا
              </span>
              {champLeader && (
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Flame className="h-3.5 w-3.5 text-amber-500" />
                  الأكثر توقّعًا: <b className="text-foreground">{champLeader.name}</b>
                  <span className="tabular-nums">({champLeader.pct}%)</span>
                </span>
              )}
            </div>
          )}

          {myChampion?.teamName ? (
            <StatusPill status={myChampion.status} points={myChampion.pointsAwarded} label={`اخترت: ${myChampion.teamName}`} />
          ) : null}

          {locked ? (
            <div className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-dashed border-rose-300 py-4 text-sm font-bold text-rose-600 dark:text-rose-400">
              <Lock className="h-4 w-4" /> أُقفلت توقّعات البطل — انطلقت الأدوار الحاسمة
            </div>
          ) : (
            <>
              <p className="mb-2 mt-3 text-xs font-bold text-muted-foreground">
                اختر البطل من الأندية المشاركة ({formatNumber(teams.length)})
              </p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {teams.map((t) => {
                  const selected = pickedChampId === t.id;
                  const pct =
                    champTotalVotes > 0
                      ? Math.round(((champVotes.get(t.id) ?? 0) / champTotalVotes) * 100)
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
                      data-testid={`kc-champion-${t.id}`}
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

              {isAuthenticated ? (
                <Button
                  className="mt-3 w-full gap-2 bg-amber-500 text-white hover:bg-amber-600"
                  disabled={champPick == null || champPick === myChampion?.teamId || champMutation.isPending}
                  onClick={() => champPick != null && champMutation.mutate(champPick)}
                >
                  <Crown className="h-4 w-4" />
                  {myChampion ? "حدّث توقّع البطل" : "احفظ توقّع البطل"}
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
          {myScorer?.playerName ? (
            <StatusPill status={myScorer.status} points={myScorer.pointsAwarded} label={`اخترت: ${myScorer.playerName}`} />
          ) : null}

          {locked ? (
            <div className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-dashed border-rose-300 py-4 text-sm font-bold text-rose-600 dark:text-rose-400">
              <Lock className="h-4 w-4" /> أُقفلت توقّعات الهدّاف — انطلقت الأدوار الحاسمة
            </div>
          ) : (
            <>
              {scorers.length > 0 && (
                <>
                  <p className="mb-2 mt-1 text-xs font-bold text-muted-foreground">اختر من متصدّري الهدّافين حاليًا</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {scorers.map((s) => {
                      const selected = pickedScorerName.trim() === s.name;
                      return (
                        <button
                          key={s.id || s.name}
                          onClick={() => (isAuthenticated ? setScorerName(s.name) : onRequireLogin())}
                          className={`flex items-center gap-2.5 rounded-xl border p-2 text-right transition ${
                            selected
                              ? "border-emerald-600 bg-emerald-600/10 ring-1 ring-emerald-600/40"
                              : "border-border hover:border-emerald-500/50"
                          }`}
                          data-testid={`kc-scorer-pick-${s.id}`}
                        >
                          <span className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-muted ring-1 ring-border">
                            {s.photo ? <img src={s.photo} alt={s.name} className="h-full w-full object-cover" loading="lazy" /> : null}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="line-clamp-1 text-sm font-bold">{s.name}</span>
                            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                              {s.team?.logo ? <img src={s.team.logo} alt="" className="h-3 w-3 object-contain" /> : null}
                              <span className="line-clamp-1">{s.team?.name}</span>
                            </span>
                          </span>
                          <span className="shrink-0 text-center">
                            <span className="block text-base font-black tabular-nums text-emerald-700 dark:text-emerald-400">{formatNumber(s.goals)}</span>
                            <span className="block text-[9px] text-muted-foreground">{s.goals === 1 ? "هدف" : "أهداف"}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              <p className="mb-2 mt-3 text-xs font-bold text-muted-foreground">
                {scorers.length > 0 ? "أو اكتب اسم لاعب آخر" : "اكتب اسم اللاعب"}
              </p>
              <Input
                placeholder="اسم اللاعب"
                value={pickedScorerName}
                onChange={(e) => setScorerName(e.target.value)}
                disabled={!isAuthenticated}
              />

              {isAuthenticated ? (
                <Button
                  className="mt-3 w-full gap-2 bg-emerald-700 text-white hover:bg-emerald-800"
                  disabled={!canSubmitScorer || scorerMutation.isPending}
                  onClick={() => scorerMutation.mutate(pickedScorerName.trim())}
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
}: {
  status: string;
  points: number;
  label: string;
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
    </div>
  );
}
