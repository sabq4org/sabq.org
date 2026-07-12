import { MapPin, Radio } from "lucide-react";
import { Link } from "wouter";
import { SAUDI_TEAM_ID, formatKickoffTime, type AcFixture } from "./acTypes";

function TeamRow({ team, highlight }: { team: AcFixture["home"]; highlight: boolean }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="h-7 w-7 shrink-0 rounded-full bg-white p-0.5 ring-1 ring-black/5">
        {team.logo ? (
          <img src={team.logo} alt={team.name} className="h-full w-full object-contain" loading="lazy" />
        ) : null}
      </div>
      <span
        className={`truncate text-sm ${highlight ? "font-extrabold text-emerald-700 dark:text-emerald-300" : "font-bold text-foreground"}`}
      >
        {team.name}
      </span>
    </div>
  );
}

export function AcMatchCard({ fixture }: { fixture: AcFixture }) {
  const started = fixture.status.live || fixture.status.finished;
  const homeSaudi = fixture.home.id === SAUDI_TEAM_ID;
  const awaySaudi = fixture.away.id === SAUDI_TEAM_ID;
  const involvesSaudi = homeSaudi || awaySaudi;

  return (
    <Link
      href={`/asian-cup/match/${fixture.id}`}
      className={`rounded-2xl border p-3.5 transition-shadow hover:shadow-md ${
        involvesSaudi
          ? "border-emerald-300/50 bg-emerald-50/60 dark:border-emerald-500/30 dark:bg-emerald-950/20"
          : "border-border bg-card"
      }`}
    >
      <div className="mb-2.5 flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="truncate">{fixture.round}</span>
        {fixture.status.live ? (
          <span className="flex items-center gap-1 font-bold text-red-500">
            <Radio className="h-3 w-3 animate-pulse" />
            {fixture.status.elapsed != null ? `${fixture.status.elapsed}'` : "مباشر"}
          </span>
        ) : (
          <span>{fixture.status.finished ? "انتهت" : formatKickoffTime(fixture.date)}</span>
        )}
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <TeamRow team={fixture.home} highlight={homeSaudi} />
        <div className="px-1 text-center" dir="ltr">
          {started ? (
            <span className="text-lg font-black tabular-nums text-foreground">
              {fixture.goals.away ?? 0} - {fixture.goals.home ?? 0}
            </span>
          ) : (
            <span className="text-xs font-bold text-muted-foreground">VS</span>
          )}
        </div>
        <div className="flex justify-end">
          <TeamRow team={fixture.away} highlight={awaySaudi} />
        </div>
      </div>

      {fixture.venue?.name && (
        <div className="mt-2.5 flex items-center gap-1 text-[11px] text-muted-foreground">
          <MapPin className="h-3 w-3" />
          <span className="truncate">
            {fixture.venue.name}
            {fixture.venue.city ? ` — ${fixture.venue.city}` : ""}
          </span>
        </div>
      )}
    </Link>
  );
}
