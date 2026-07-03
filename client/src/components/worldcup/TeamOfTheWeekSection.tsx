/**
 * تشكيلة الجولة — الأعلى تقييمًا في آخر جولة مكتملة (SportMonks Team of the Week).
 * ملعب 2D بنفس روح TacticalPitch: الحارس أسفل والهجوم أعلى. يختفي بالكامل
 * إن لم تتوفر تشكيلة (أفضل جهد).
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { WcTeamOfTheWeek, WcTotwPlayer } from "./wcTypes";

function ratingColor(rating: number): string {
  if (rating >= 9) return "bg-emerald-500";
  if (rating >= 8) return "bg-lime-500";
  return "bg-amber-500";
}

function TotwPlayerChip({ player }: { player: WcTotwPlayer }) {
  return (
    <div className="flex flex-col items-center gap-0.5 w-16 sm:w-20">
      <div className="relative">
        {player.photo ? (
          <img
            src={player.photo}
            alt={player.name}
            loading="lazy"
            className="h-10 w-10 sm:h-12 sm:w-12 rounded-full object-cover bg-white ring-2 ring-white/70 shadow-md"
          />
        ) : (
          <span className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-white text-emerald-900 text-xs font-black ring-2 ring-white/70 shadow-md">
            {player.name.slice(0, 2)}
          </span>
        )}
        <span
          className={`absolute -bottom-1 -start-1 rounded-full px-1 py-px text-[9px] font-black text-white tabular-nums shadow ${ratingColor(player.rating)}`}
          dir="ltr"
        >
          {player.rating.toFixed(1)}
        </span>
      </div>
      <span className="text-[9px] sm:text-[10px] text-white text-center leading-tight line-clamp-2 drop-shadow">
        {player.name}
      </span>
      <span className="flex items-center gap-0.5 text-[8px] sm:text-[9px] text-white/75">
        {player.teamLogo && (
          <img src={player.teamLogo} alt="" loading="lazy" className="h-2.5 w-2.5 object-contain" />
        )}
        {player.teamName}
      </span>
    </div>
  );
}

export function TeamOfTheWeekSection() {
  const { data } = useQuery<WcTeamOfTheWeek>({
    queryKey: ["/api/world-cup/totw"],
    staleTime: 10 * 60 * 1000,
  });

  const rows = useMemo(() => {
    if (!data?.available) return [];
    const byRow = new Map<number, WcTotwPlayer[]>();
    for (const p of data.players) {
      if (!byRow.has(p.row)) byRow.set(p.row, []);
      byRow.get(p.row)!.push(p);
    }
    return [...byRow.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, players]) => players.sort((a, b) => a.slot - b.slot));
  }, [data]);

  if (!data?.available || rows.length === 0) return null;

  return (
    <section dir="rtl" className="py-8">
      <div className="max-w-3xl mx-auto px-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="flex items-center gap-2 text-lg font-black">
            <Sparkles className="h-5 w-5 text-amber-500" />
            تشكيلة الجولة
          </h2>
          {data.formation && (
            <Badge variant="secondary" dir="ltr" className="tabular-nums">
              {data.formation}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          الأعلى تقييمًا في آخر جولة من المونديال
        </p>
        <div className="relative rounded-2xl overflow-hidden bg-gradient-to-b from-emerald-700 to-emerald-800 ring-1 ring-emerald-900/40 aspect-[4/5] sm:aspect-[4/3]">
          {/* خطوط الملعب */}
          <div className="absolute inset-2 rounded-xl border border-white/25" />
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 h-14 w-40 border border-white/25 border-b-0 rounded-t-sm" />
          <div className="absolute top-2 left-1/2 -translate-x-1/2 h-10 w-44 border border-white/25 border-t-0" />
          <div className="absolute top-1/2 left-0 right-0 h-px bg-white/20" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-16 w-16 rounded-full border border-white/25" />

          {rows.map((rowPlayers, rowIndex) => (
            <div
              key={rowIndex}
              className="absolute left-0 right-0 flex justify-around px-2"
              style={{ bottom: `${((rowIndex + 0.55) / (rows.length + 0.35)) * 100}%` }}
              dir="ltr"
            >
              {rowPlayers.map((p) => (
                <TotwPlayerChip key={`${p.slot}-${p.name}`} player={p} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
