import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Coins, Crown, Sparkles } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatNumber } from "@/lib/format";

/**
 * «فانتازي خليجي المصغّر» — اختر 7 لاعبين ضمن ميزانية، عيّن قائدًا (نقاطه
 * تُضاعَف)، ونقاطك من تقييمات المباريات الفعلية. تبويب داخل صفحة التوقعات.
 */

interface PoolPlayer {
  id: string;
  name: string;
  team: { id: number; name: string; logo: string } | null;
  position: string | null;
  price: number;
}

interface MySquad {
  players: (PoolPlayer & { isCaptain: boolean; points: number })[];
  captainId: string;
  spent: number;
  budget: number;
  totalPoints: number;
}

export function GcFantasyTab({
  isAuthenticated,
  onRequireLogin,
}: {
  isAuthenticated: boolean;
  onRequireLogin: () => void;
}) {
  const { toast } = useToast();

  const { data: poolData, isLoading: poolLoading } = useQuery<{
    budget: number;
    squadSize: number;
    players: PoolPlayer[];
  }>({ queryKey: ["/api/gulf-cup/fantasy/pool"], staleTime: 5 * 60_000 });

  const { data: mineData } = useQuery<{ squad: MySquad | null }>({
    queryKey: ["/api/gulf-cup/fantasy/mine"],
    enabled: isAuthenticated,
    staleTime: 30_000,
  });

  const pool = Array.isArray(poolData?.players) ? poolData.players : [];
  const budget = poolData?.budget ?? 100;
  const squadSize = poolData?.squadSize ?? 7;
  const existing = mineData?.squad ?? null;

  // الحالة المحلية للاختيار — تُبدأ من تشكيلتي المحفوظة إن وُجدت.
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [captain, setCaptain] = useState<string>("");

  const selection = useMemo(() => {
    if (picked) return picked;
    return new Set(existing?.players.map((p) => p.id) ?? []);
  }, [picked, existing]);
  const captainId = captain || existing?.captainId || "";

  const spent = useMemo(
    () => pool.filter((p) => selection.has(p.id)).reduce((a, p) => a + p.price, 0),
    [pool, selection],
  );
  const remaining = budget - spent;

  const toggle = (p: PoolPlayer) => {
    const next = new Set(selection);
    if (next.has(p.id)) {
      next.delete(p.id);
      if (captainId === p.id) setCaptain("");
    } else {
      if (next.size >= squadSize) {
        toast({ title: "اكتملت التشكيلة", description: `اخترت ${squadSize} لاعبين`, variant: "destructive" });
        return;
      }
      if (p.price > remaining) {
        toast({ title: "تجاوزت الميزانية", description: `المتبقّي ${remaining} نقطة`, variant: "destructive" });
        return;
      }
      next.add(p.id);
    }
    setPicked(next);
  };

  const save = useMutation({
    mutationFn: () =>
      apiRequest("/api/gulf-cup/fantasy", {
        method: "POST",
        body: JSON.stringify({ playerIds: Array.from(selection), captainId }),
      }),
    onSuccess: () => {
      toast({ title: "حُفظت تشكيلتك ⚽", description: "نقاطك تُحتسب من تقييمات المباريات" });
      setPicked(null);
      setCaptain("");
      queryClient.invalidateQueries({ queryKey: ["/api/gulf-cup/fantasy/mine"] });
      queryClient.invalidateQueries({ queryKey: ["/api/gulf-cup/fantasy/leaderboard"] });
    },
    onError: (e: any) =>
      toast({ title: "تعذّر الحفظ", description: e?.message || "حاول مجددًا", variant: "destructive" }),
  });

  if (!isAuthenticated) {
    return (
      <div className="rounded-2xl border border-dashed border-border py-14 text-center">
        <Sparkles className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
        <p className="font-bold">فانتازي خليجي لأعضاء سبق</p>
        <p className="mt-1 text-sm text-muted-foreground">
          سجّل دخولك لتكوّن تشكيلتك وتنافس بنقاط تقييمات اللاعبين الفعلية.
        </p>
        <button
          onClick={onRequireLogin}
          className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#0F8054] px-5 py-2 text-sm font-bold text-white transition hover:bg-[#0A6B47]"
        >
          تسجيل الدخول
        </button>
      </div>
    );
  }

  if (poolLoading) return <div className="h-64 animate-pulse rounded-2xl bg-muted/60" />;

  if (pool.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border py-14 text-center">
        <Sparkles className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
        <p className="font-bold">قائمة اللاعبين تُفتح قبل انطلاق البطولة</p>
        <p className="mt-1 text-sm text-muted-foreground">عُد قريبًا لتكوّن تشكيلتك المثالية.</p>
      </div>
    );
  }

  const canSave = selection.size === squadSize && captainId && spent <= budget;

  return (
    <div className="space-y-4">
      {/* شريط الميزانية + نقاطي */}
      <div className="sticky top-16 z-10 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card/95 p-3.5 backdrop-blur">
        <div className="flex items-center gap-1.5">
          <Coins className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-black text-foreground tabular-nums">
            {remaining} / {budget}
          </span>
          <span className="text-[11px] text-muted-foreground">متبقٍّ</span>
        </div>
        <div className="text-sm font-bold text-muted-foreground">
          {selection.size} / {squadSize} لاعبين
        </div>
        {existing && (
          <div className="flex items-center gap-1.5 text-sm">
            <span className="text-muted-foreground">نقاطي:</span>
            <span className="font-black text-[#0A6B47] dark:text-emerald-300 tabular-nums">
              {formatNumber(existing.totalPoints)}
            </span>
          </div>
        )}
        <button
          onClick={() => save.mutate()}
          disabled={!canSave || save.isPending}
          className="mr-auto rounded-full bg-[#0F8054] px-5 py-2 text-sm font-bold text-white transition hover:bg-[#0A6B47] disabled:opacity-50"
        >
          {existing ? "تحديث التشكيلة" : "حفظ التشكيلة"}
        </button>
      </div>

      {captainId === "" && selection.size > 0 && (
        <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-[11px] font-bold text-amber-700 dark:text-amber-300">
          👑 اختر قائدًا من تشكيلتك بالضغط على أيقونة التاج — نقاطه تُضاعَف
        </p>
      )}

      {/* قائمة اللاعبين */}
      <ul className="grid gap-2 sm:grid-cols-2">
        {pool.map((p) => {
          const isPicked = selection.has(p.id);
          const isCaptain = captainId === p.id;
          const disabled = !isPicked && (selection.size >= squadSize || p.price > remaining);
          return (
            <li
              key={p.id}
              className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 transition ${
                isPicked ? "border-[#0F8054]/40 bg-[#0F8054]/5" : "border-border bg-card"
              } ${disabled ? "opacity-50" : ""}`}
            >
              <button
                onClick={() => toggle(p)}
                disabled={disabled}
                className="flex min-w-0 flex-1 items-center gap-2.5 text-start"
              >
                <span
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border ${
                    isPicked ? "border-[#0F8054] bg-[#0F8054] text-white" : "border-border text-transparent"
                  }`}
                >
                  <Check className="h-3.5 w-3.5" />
                </span>
                {p.team?.logo ? (
                  <img src={p.team.logo} alt="" className="h-5 w-5 shrink-0 object-contain" loading="lazy" />
                ) : null}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold text-foreground">{p.name}</span>
                  <span className="text-[10px] text-muted-foreground">{p.team?.name ?? ""}</span>
                </span>
              </button>
              {isPicked && (
                <button
                  onClick={() => setCaptain(isCaptain ? "" : p.id)}
                  className={`shrink-0 rounded-full p-1.5 transition ${
                    isCaptain ? "bg-amber-400 text-emerald-950" : "text-muted-foreground hover:text-amber-500"
                  }`}
                  title="اجعله القائد (نقاط مضاعفة)"
                >
                  <Crown className="h-4 w-4" />
                </button>
              )}
              <span className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs font-black tabular-nums text-foreground">
                {p.price}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
