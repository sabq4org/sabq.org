import { Link } from "wouter";
import { MapPin, Radio } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatKickoffTime, type WcFixture, type WcTeam } from "./wcTypes";

function TeamRow({ team, goals, winner }: { team: WcTeam; goals: number | null; winner: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      {/* رابط لصفحة المنتخب — يوقف النقر عن فتح مركز المباراة (نقر البطاقة) */}
      <Link
        href={`/world-cup/team/${team.id}`}
        onClick={(e) => e.stopPropagation()}
        className="flex items-center gap-2 min-w-0 rounded hover-elevate active-elevate-2 px-1 -mx-1 transition-all"
      >
        <div className="h-7 w-7 shrink-0 rounded-full bg-white ring-1 ring-border p-0.5">
          <img src={team.logo} alt={team.name} className="h-full w-full object-contain" loading="lazy" />
        </div>
        <span className={`truncate text-sm ${winner ? "font-extrabold" : "font-semibold"}`}>{team.name}</span>
      </Link>
      {goals != null && (
        <span className={`text-base tabular-nums ${winner ? "font-black text-emerald-600 dark:text-emerald-400" : "font-bold"}`}>
          {goals}
        </span>
      )}
    </div>
  );
}

export function StatusBadge({ fixture }: { fixture: WcFixture }) {
  if (fixture.status.live) {
    return (
      <Badge className="bg-red-500 text-white border-0 gap-1 text-[10px] px-2 py-0.5">
        <Radio className="h-2.5 w-2.5 animate-pulse" />
        {fixture.status.elapsed != null ? `${fixture.status.elapsed}'` : fixture.status.label}
      </Badge>
    );
  }
  if (fixture.status.finished) {
    return (
      <Badge variant="secondary" className="text-[10px] px-2 py-0.5">
        {fixture.status.label}
      </Badge>
    );
  }
  return (
    <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-[10px] px-2 py-0.5">
      {formatKickoffTime(fixture.date)}
    </Badge>
  );
}

interface MatchCardProps {
  fixture: WcFixture;
  onOpen: (fixtureId: number) => void;
}

export function MatchCard({ fixture, onOpen }: MatchCardProps) {
  const started = fixture.status.live || fixture.status.finished;
  return (
    <Card
      onClick={() => onOpen(fixture.id)}
      className="group cursor-pointer overflow-hidden border-0 dark:border dark:border-card-border hover-elevate active-elevate-2 transition-all duration-300"
      data-testid={`wc-match-card-${fixture.id}`}
    >
      <CardContent className="p-3.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold text-muted-foreground">{fixture.round}</span>
          <StatusBadge fixture={fixture} />
        </div>

        <div className="space-y-1.5">
          <TeamRow
            team={fixture.home}
            goals={started ? fixture.goals.home ?? 0 : null}
            winner={fixture.home.winner === true}
          />
          <TeamRow
            team={fixture.away}
            goals={started ? fixture.goals.away ?? 0 : null}
            winner={fixture.away.winner === true}
          />
        </div>

        {fixture.penalties && (
          <p className="text-[11px] text-muted-foreground" dir="rtl">
            ركلات الترجيح: <span dir="ltr" className="tabular-nums">{fixture.penalties.home} - {fixture.penalties.away}</span>
          </p>
        )}

        <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/60">
          <span className="flex items-center gap-1 truncate">
            <MapPin className="h-3 w-3 shrink-0" />
            {fixture.venue.name} — {fixture.venue.city}
          </span>
          <span className="shrink-0 font-semibold text-emerald-600 dark:text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity">
            مركز المباراة ←
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
