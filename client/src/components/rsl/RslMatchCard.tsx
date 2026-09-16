/**
 * بطاقة مباراة دوري روشن — نفس بطاقة مباراة المونديال/كأس الملك:
 * صفّان للفريقين مع النتيجة، شارة الحالة بالدقيقة الحية، وتذييل الملعب
 * مع «مركز المباراة» عند التحويم. أسماء الأندية تفتح صفحاتها في /sports/team.
 */
import { Link } from "wouter";
import { MapPin, Radio } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { LiveMinute } from "../worldcup/LiveMinute";
import { formatKickoffTime, type RslFixture, type RslTeam } from "./rslTypes";

function TeamRow({ team, goals, winner }: { team: RslTeam; goals: number | null; winner: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      {/* رابط لصفحة النادي — يوقف النقر عن فتح مركز المباراة (نقر البطاقة) */}
      <Link
        href={`/sports/team/${team.id}`}
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

export function StatusBadge({ fixture }: { fixture: RslFixture }) {
  if (fixture.status.live) {
    return (
      <Badge className="bg-red-500 text-white border-0 gap-1 text-[10px] px-2 py-0.5">
        <Radio className="h-2.5 w-2.5 animate-pulse" />
        {fixture.status.elapsed != null ? <LiveMinute status={fixture.status} /> : fixture.status.label}
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

/** فائز مباراة الدوري — من الأهداف فقط (لا ترجيح في الدوري). */
export function rslWinnerSide(fixture: RslFixture): "home" | "away" | null {
  if (!fixture.status.finished) return null;
  const { home, away } = fixture.goals;
  if (home != null && away != null && home !== away) return home > away ? "home" : "away";
  return null;
}

interface RslMatchCardProps {
  fixture: RslFixture;
  onOpen: (fixtureId: number) => void;
}

export function RslMatchCard({ fixture, onOpen }: RslMatchCardProps) {
  const started = fixture.status.live || fixture.status.finished;
  const winSide = rslWinnerSide(fixture);
  return (
    <Card
      onClick={() => onOpen(fixture.id)}
      className="group cursor-pointer overflow-hidden border-0 bg-muted/45 hover-elevate active-elevate-2 transition-all duration-300 dark:bg-card"
      data-testid={`rsl-match-card-${fixture.id}`}
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
            winner={winSide === "home"}
          />
          <TeamRow
            team={fixture.away}
            goals={started ? fixture.goals.away ?? 0 : null}
            winner={winSide === "away"}
          />
        </div>

        <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/60">
          <span className="flex items-center gap-1 truncate">
            <MapPin className="h-3 w-3 shrink-0" />
            {fixture.venue.name || "الملعب يُعلن لاحقًا"}
            {fixture.venue.city ? ` — ${fixture.venue.city}` : ""}
          </span>
          <span className="shrink-0 font-semibold text-emerald-600 dark:text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity">
            مركز المباراة ←
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
