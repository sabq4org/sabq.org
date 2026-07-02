import { Radio } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatKickoffTime, elapsedLabel, type KcFixture } from "./kcTypes";

function TeamSide({ team, align }: { team: KcFixture["home"]; align: "start" | "end" }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 min-w-0 flex-1",
        align === "end" ? "flex-row-reverse text-left" : "text-right",
      )}
    >
      <span className="h-9 w-9 shrink-0 rounded-full bg-white p-1 ring-1 ring-border shadow-sm">
        <img src={team.logo} alt={team.name} className="h-full w-full object-contain" loading="lazy" />
      </span>
      <span className="text-sm font-bold truncate">{team.name}</span>
    </div>
  );
}

export function KcMatchCard({
  fixture,
  onOpen,
}: {
  fixture: KcFixture;
  onOpen?: (id: number) => void;
}) {
  const started = fixture.status.live || fixture.status.finished;
  const pen = fixture.penalties;

  return (
    <button
      type="button"
      onClick={() => onOpen?.(fixture.id)}
      data-testid={`kc-match-${fixture.id}`}
      className="w-full text-right rounded-xl border border-border bg-card hover-elevate active-elevate-2 transition-all p-3"
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-[11px] text-muted-foreground truncate">{fixture.round}</span>
        {fixture.status.live ? (
          <Badge className="bg-red-500 text-white border-0 gap-1 text-[10px] px-2 py-0">
            <Radio className="h-2.5 w-2.5 animate-pulse" />
            {elapsedLabel(fixture.status)}
          </Badge>
        ) : (
          <span className="text-[11px] text-muted-foreground">
            {fixture.status.finished ? fixture.status.label : formatKickoffTime(fixture.date)}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <TeamSide team={fixture.home} align="start" />
        <div className="flex flex-col items-center shrink-0 px-1">
          {started ? (
            <span className="text-lg font-black tabular-nums leading-none" dir="ltr">
              {fixture.goals.home ?? 0} - {fixture.goals.away ?? 0}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">ضد</span>
          )}
          {pen && pen.home != null && pen.away != null && (
            <span className="text-[10px] text-muted-foreground tabular-nums" dir="ltr">
              ({pen.home} - {pen.away} ت.ت)
            </span>
          )}
        </div>
        <TeamSide team={fixture.away} align="end" />
      </div>
    </button>
  );
}
