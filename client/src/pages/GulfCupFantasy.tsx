import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronLeft, Crown, LogIn, Sparkles } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { NavigationBar } from "@/components/NavigationBar";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { rememberPostAuthReturn } from "@/lib/postAuthRedirect";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { GcFantasyPoolPlayer, GcFantasySquadView } from "@/components/gulfcup/gcTypes";

type PoolResponse = { budget: number; squadSize: number; players: GcFantasyPoolPlayer[] };
type MineResponse = { squad: GcFantasySquadView | null };

export default function GulfCupFantasy() {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [captainId, setCaptainId] = useState("");
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    document.title = "فانتازي خليجي 27 | سبق";
  }, []);

  const { data: poolRaw, isLoading: poolLoading } = useQuery<PoolResponse>({
    queryKey: ["/api/gulf-cup/fantasy/pool"],
    staleTime: 5 * 60_000,
  });
  const { data: mineRaw } = useQuery<MineResponse>({
    queryKey: ["/api/gulf-cup/fantasy/mine"],
    enabled: isAuthenticated,
    staleTime: 30_000,
  });

  const budget = poolRaw?.budget ?? 100;
  const squadSize = poolRaw?.squadSize ?? 7;
  const players = Array.isArray(poolRaw?.players) ? poolRaw.players : [];
  const squad = mineRaw?.squad ?? null;

  useEffect(() => {
    if (!squad || seeded) return;
    setPicked(new Set(squad.players.map((p) => p.id)));
    setCaptainId(squad.captainId);
    setSeeded(true);
  }, [squad, seeded]);

  const spent = useMemo(
    () => players.filter((p) => picked.has(p.id)).reduce((sum, p) => sum + p.price, 0),
    [players, picked],
  );
  const remaining = budget - spent;
  const canSave = picked.size === squadSize && picked.has(captainId) && spent <= budget;

  const saveMutation = useMutation({
    mutationFn: () =>
      apiRequest("/api/gulf-cup/fantasy", {
        method: "POST",
        body: JSON.stringify({ playerIds: Array.from(picked), captainId }),
      }),
    onSuccess: () => {
      toast({ title: "حُفظت تشكيلتك ⚽", description: "نقاطك تُحتسب من تقييمات المباريات" });
      queryClient.invalidateQueries({ queryKey: ["/api/gulf-cup/fantasy/mine"] });
    },
    onError: (error: unknown) => {
      toast({
        title: "تعذّر حفظ التشكيلة",
        description: error instanceof Error ? error.message : "حاول مجددًا",
        variant: "destructive",
      });
    },
  });

  const toggle = (player: GcFantasyPoolPlayer) => {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(player.id)) {
        next.delete(player.id);
        if (captainId === player.id) setCaptainId("");
        return next;
      }
      if (next.size >= squadSize || player.price > remaining) return current;
      next.add(player.id);
      return next;
    });
  };

  const goLogin = () => {
    rememberPostAuthReturn("/gulf-cup/fantasy");
    window.location.href = "/login";
  };

  return (
    <div className="public-page flex min-h-screen flex-col bg-[#EEF1F2] dark:bg-[#090E0F]" dir="rtl" lang="ar-SA-u-nu-latn">
      <Header user={user || undefined} />
      <NavigationBar />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6">
        <Link href="/gulf-cup" className="mb-4 inline-flex items-center gap-1 text-[13px] font-bold text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" />
          مركز خليجي 27
        </Link>

        <div className="mb-5">
          <h1 className="flex items-center gap-2 text-2xl font-black text-foreground">
            <Sparkles className="h-6 w-6 text-sky-600" />
            فانتازي خليجي
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            اختر {squadSize} لاعبين ضمن ميزانية {budget} نقطة. نقاط القائد تُضاعَف.
          </p>
        </div>

        {!isAuthenticated ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center">
            <p className="mb-4 text-sm text-muted-foreground">فانتازي خليجي لأعضاء سبق — سجّل دخولك لتكوّن تشكيلتك</p>
            <Button onClick={goLogin} className="rounded-full bg-sky-600 font-bold">
              <LogIn className="h-4 w-4" />
              تسجيل الدخول
            </Button>
          </div>
        ) : poolLoading ? (
          <Skeleton className="h-64 w-full rounded-2xl" />
        ) : players.length === 0 ? (
          <p className="rounded-2xl border border-dashed py-16 text-center text-sm text-muted-foreground">
            قائمة اللاعبين تُفتح قبل البطولة — عُد قريبًا لتكوّن تشكيلتك.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-border bg-card p-4">
              <div className="flex gap-6">
                <div>
                  <p className="text-lg font-black tabular-nums text-sky-700 dark:text-sky-300">{remaining}</p>
                  <p className="text-[10px] text-muted-foreground">متبقٍّ من {budget}</p>
                </div>
                <div>
                  <p className="text-lg font-black tabular-nums">
                    {picked.size}/{squadSize}
                  </p>
                  <p className="text-[10px] text-muted-foreground">لاعبون</p>
                </div>
                {squad && (
                  <div>
                    <p className="text-lg font-black tabular-nums">{squad.totalPoints}</p>
                    <p className="text-[10px] text-muted-foreground">نقاطي</p>
                  </div>
                )}
              </div>
              <Button
                disabled={!canSave || saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
                className="rounded-full bg-sky-600 font-bold"
              >
                {saveMutation.isPending ? "جارٍ الحفظ…" : squad ? "تحديث" : "حفظ"}
              </Button>
            </div>
            {picked.size > 0 && !captainId && (
              <p className="text-[12px] font-semibold text-amber-700 dark:text-amber-300">
                اضغط التاج بجانب أحد لاعبيك لتعيينه قائدًا — نقاطه تُضاعَف
              </p>
            )}
            <ul className="overflow-hidden rounded-2xl border border-border bg-card">
              {players.map((player) => {
                const isPicked = picked.has(player.id);
                const isCaptain = captainId === player.id;
                const disabled = !isPicked && (picked.size >= squadSize || player.price > remaining);
                return (
                  <li
                    key={player.id}
                    className={`flex items-center gap-2 border-b border-border/60 px-3 py-2 last:border-0 ${
                      isPicked ? "bg-sky-500/[0.06]" : ""
                    } ${disabled ? "opacity-45" : ""}`}
                  >
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => toggle(player)}
                      className="flex min-w-0 flex-1 items-center gap-2.5 text-right"
                    >
                      <span
                        className={`grid h-5 w-5 place-items-center rounded-full text-[11px] font-black ${
                          isPicked ? "bg-sky-600 text-white" : "border border-border text-muted-foreground"
                        }`}
                      >
                        {isPicked ? "✓" : ""}
                      </span>
                      {player.team?.logo ? (
                        <img src={player.team.logo} alt="" className="h-6 w-6 object-contain" loading="lazy" />
                      ) : null}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold">{player.name}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">{player.team?.name}</span>
                      </span>
                    </button>
                    {isPicked && (
                      <button
                        type="button"
                        onClick={() => setCaptainId(isCaptain ? "" : player.id)}
                        aria-label="تعيين قائد"
                        className={`rounded-full p-1.5 ${isCaptain ? "bg-amber-400 text-emerald-950" : "bg-muted text-muted-foreground"}`}
                      >
                        <Crown className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <span className="w-8 text-center text-sm font-black tabular-nums">{player.price}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
