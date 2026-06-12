import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ChevronLeft, MapPin, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "./MatchCard";
import {
  formatKickoffDay,
  formatKickoffTime,
  SAUDI_TEAM_ID,
  type WcFixture,
  type WcOverview,
  type WcSquad,
} from "./wcTypes";

interface SaudiSpotlightProps {
  saudi: WcOverview["saudi"] | undefined;
  onOpenMatch: (fixtureId: number) => void;
  onOpenPlayer: (playerId: number) => void;
}

/** شريط لاعبي الأخضر — كل لاعب يفتح بطاقته الشاملة */
function SaudiSquadStrip({ onOpenPlayer }: { onOpenPlayer: (playerId: number) => void }) {
  const { data: squad } = useQuery<WcSquad>({
    queryKey: [`/api/world-cup/squad/${SAUDI_TEAM_ID}`],
    staleTime: 60 * 60 * 1000,
  });
  const players = Array.isArray(squad?.players) ? squad.players : [];
  if (players.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-bold text-emerald-100/80">تشكيلة الأخضر — اضغط على اللاعب لملفه الكامل</p>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {players.map((player) => (
          <button
            key={player.id || `${player.name}-${player.number}`}
            type="button"
            onClick={() => player.id > 0 && onOpenPlayer(player.id)}
            disabled={player.id <= 0}
            className="flex flex-col items-center gap-1 w-16 shrink-0 disabled:cursor-default group"
            data-testid={`wc-saudi-player-${player.id}`}
          >
            <span className="h-12 w-12 rounded-full overflow-hidden bg-white/90 ring-2 ring-white/20 group-hover:ring-emerald-300/70 transition-all">
              {player.photo && (
                <img src={player.photo} alt={player.name} className="h-full w-full object-cover" loading="lazy" />
              )}
            </span>
            <span className="text-[9px] text-emerald-50/90 text-center leading-tight line-clamp-2 w-full">
              {player.name}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function SaudiFixtureRow({ fixture, onOpen }: { fixture: WcFixture; onOpen: (id: number) => void }) {
  const opponent = fixture.home.id === SAUDI_TEAM_ID ? fixture.away : fixture.home;
  const started = fixture.status.live || fixture.status.finished;
  const saudiGoals = fixture.home.id === SAUDI_TEAM_ID ? fixture.goals.home : fixture.goals.away;
  const opponentGoals = fixture.home.id === SAUDI_TEAM_ID ? fixture.goals.away : fixture.goals.home;

  return (
    <button
      type="button"
      onClick={() => onOpen(fixture.id)}
      className="w-full flex items-center justify-between gap-3 rounded-xl bg-white/[0.07] hover:bg-white/[0.12] ring-1 ring-white/10 px-3.5 py-2.5 transition-colors text-right"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="h-8 w-8 shrink-0 rounded-full bg-white p-1">
          <img src={opponent.logo} alt={opponent.name} className="h-full w-full object-contain" loading="lazy" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-white truncate">ضد {opponent.name}</p>
          <p className="text-[11px] text-emerald-100/70 truncate">
            {fixture.round} · {formatKickoffDay(fixture.date)}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {started ? (
          <>
            <span className="text-lg font-black text-white tabular-nums" dir="ltr">
              {saudiGoals ?? 0} - {opponentGoals ?? 0}
            </span>
            <StatusBadge fixture={fixture} />
          </>
        ) : (
          <span className="text-sm font-bold text-emerald-200">{formatKickoffTime(fixture.date)}</span>
        )}
        <ChevronLeft className="h-4 w-4 text-emerald-200/60" />
      </div>
    </button>
  );
}

export function SaudiSpotlight({ saudi, onOpenMatch, onOpenPlayer }: SaudiSpotlightProps) {
  if (!saudi || saudi.fixtures.length === 0) return null;

  const saudiRow = saudi.group?.rows.find((row) => row.team.id === SAUDI_TEAM_ID);
  const rankLabel = saudiRow
    ? ["", "الأول", "الثاني", "الثالث", "الرابع"][saudiRow.rank] ?? `${saudiRow.rank}`
    : null;

  return (
    <section dir="rtl" className="py-8">
      <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
          className="relative overflow-hidden rounded-3xl bg-gradient-to-bl from-emerald-800 via-emerald-900 to-[#063828] p-6 sm:p-8 shadow-xl"
        >
          <div className="absolute -top-20 -left-20 h-64 w-64 rounded-full bg-emerald-400/20 blur-3xl" />
          <div className="absolute bottom-0 right-0 opacity-[0.06]">
            <Shield className="h-56 w-56 text-white" />
          </div>

          {/* minmax(0,1fr) + min-w-0: عرض شريط التشكيلة الداخلي (~1.8k px) يتسرب
              عبر min-width:auto الافتراضي لعنصر الـgrid فيمدد البطاقة كاملة */}
          <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div className="space-y-4 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl sm:text-3xl font-black text-white">مشوار الأخضر</h2>
                <Badge className="bg-white/15 text-emerald-50 border-0">{saudi.group?.group ?? "كأس العالم 2026"}</Badge>
                {saudiRow && rankLabel && (
                  <Badge className="bg-emerald-300 text-emerald-950 border-0 font-bold">
                    المركز {rankLabel} · {saudiRow.points} نقاط
                  </Badge>
                )}
              </div>
              {saudi.next && (
                <p className="text-sm text-emerald-100/80 flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" />
                  المباراة القادمة على {saudi.next.venue.name} في {saudi.next.venue.city}
                </p>
              )}
              <div className="space-y-2">
                {saudi.fixtures.map((fixture) => (
                  <SaudiFixtureRow key={fixture.id} fixture={fixture} onOpen={onOpenMatch} />
                ))}
              </div>
              <SaudiSquadStrip onOpenPlayer={onOpenPlayer} />
            </div>

            {saudi.group && (
              <div className="lg:w-72 rounded-2xl bg-black/20 ring-1 ring-white/10 p-4 self-start">
                <h3 className="text-sm font-bold text-emerald-100 mb-3">{saudi.group.group}</h3>
                <div className="space-y-1.5">
                  {saudi.group.rows.map((row) => (
                    <div
                      key={row.team.id}
                      className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm ${
                        row.team.id === SAUDI_TEAM_ID
                          ? "bg-emerald-400/20 ring-1 ring-emerald-300/40 font-bold text-white"
                          : "text-emerald-50/90"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-4 text-center text-xs text-emerald-200/70 tabular-nums">{row.rank}</span>
                        <img src={row.team.logo} alt={row.team.name} className="h-4 w-4 object-contain" loading="lazy" />
                        <span className="truncate">{row.team.name}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs tabular-nums shrink-0">
                        <span className="text-emerald-200/70">{row.played} لعب</span>
                        <span className="font-black text-white">{row.points} ن</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
