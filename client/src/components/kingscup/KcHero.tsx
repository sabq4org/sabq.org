import { useEffect, useState } from "react";
import { Radio, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import kingsCupLogo from "@assets/kings-cup-logo.png";
import {
  countdownTo,
  elapsedLabel,
  formatKickoffDay,
  formatKickoffTime,
  type KcOverview,
} from "./kcTypes";

function Countdown({ timestamp }: { timestamp: number }) {
  const [c, setC] = useState(() => countdownTo(timestamp));
  useEffect(() => {
    const t = setInterval(() => setC(countdownTo(timestamp)), 1000);
    return () => clearInterval(t);
  }, [timestamp]);
  if (c.total <= 0) return <span className="text-amber-300 font-bold">تنطلق الآن</span>;
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <span className="font-black tabular-nums text-amber-300" dir="ltr">
      {c.days > 0 ? `${c.days} يوم · ` : ""}
      {pad(c.hours)}:{pad(c.minutes)}:{pad(c.seconds)}
    </span>
  );
}

function TeamBig({ team }: { team: { name: string; logo: string } }) {
  return (
    <div className="flex flex-col items-center gap-2 min-w-0 flex-1">
      <span className="h-16 w-16 sm:h-20 sm:w-20 rounded-full bg-white p-1.5 ring-2 ring-white/20 shadow-lg">
        <img src={team.logo} alt={team.name} className="h-full w-full object-contain" loading="lazy" />
      </span>
      <span className="text-sm sm:text-base font-extrabold text-white text-center truncate w-full">
        {team.name}
      </span>
    </div>
  );
}

export function KcHero({
  overview,
  isLoading,
  onOpenMatch,
}: {
  overview: KcOverview | undefined;
  isLoading: boolean;
  onOpenMatch: (id: number) => void;
}) {
  const champion = overview?.champion ?? null;
  const fixture = overview?.matchOfTheDay?.fixture ?? overview?.nextMatch ?? null;

  return (
    <section
      dir="rtl"
      className="relative overflow-hidden bg-gradient-to-bl from-[#0b3d2e] via-[#0f5138] to-[#08301f]"
    >
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(90deg, rgba(255,255,255,0.6) 0 80px, transparent 80px 160px)",
        }}
      />
      <div className="absolute -top-24 -right-16 h-56 w-56 rounded-full bg-amber-300/10 blur-3xl" />

      <div className="relative container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-3 mb-6">
          <span className="rounded-xl bg-white p-1.5 shadow-lg shrink-0">
            <img src={kingsCupLogo} alt="كأس خادم الحرمين" className="h-12 w-auto object-contain" />
          </span>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white leading-tight">
              كأس خادم الحرمين الشريفين
            </h1>
            <p className="text-xs text-emerald-100/70">
              بطولة الأندية السعودية الإقصائية — تغطية حية بتوقيت الرياض
            </p>
          </div>
        </div>

        {champion ? (
          <div className="flex items-center justify-center gap-5 rounded-2xl bg-black/20 ring-1 ring-amber-300/30 p-6">
            <span className="relative h-20 w-20 rounded-full bg-white p-2 ring-2 ring-amber-300/70 shadow-lg shrink-0">
              <img src={champion.team.logo} alt={champion.team.name} className="h-full w-full object-contain" />
              <Trophy className="absolute -bottom-1 -left-1 h-6 w-6 text-amber-300 drop-shadow" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold text-amber-300/90">🏆 بطل كأس خادم الحرمين الشريفين</p>
              <p className="text-2xl font-black text-white truncate">{champion.team.name}</p>
              {champion.runnerUp && champion.score && (
                <p className="text-xs text-emerald-100/70">
                  فاز على {champion.runnerUp.name} في النهائي{" "}
                  <span dir="ltr" className="font-black text-amber-300">{champion.score}</span>
                  {champion.penalties && (
                    <> (بركلات الترجيح <span dir="ltr" className="font-black text-amber-300">{champion.penalties}</span>)</>
                  )}
                </p>
              )}
            </div>
          </div>
        ) : fixture ? (
          <button
            type="button"
            onClick={() => onOpenMatch(fixture.id)}
            className="w-full rounded-2xl bg-black/20 ring-1 ring-white/10 p-6 hover-elevate active-elevate-2 transition-all"
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs text-emerald-100/70">{fixture.round}</span>
              {fixture.status.live ? (
                <Badge className="bg-red-500 text-white border-0 gap-1 text-[11px]">
                  <Radio className="h-3 w-3 animate-pulse" />
                  {elapsedLabel(fixture.status)}
                </Badge>
              ) : (
                <span className="text-xs text-emerald-100/70">{formatKickoffDay(fixture.date)}</span>
              )}
            </div>
            <div className="flex items-center gap-3 sm:gap-6">
              <TeamBig team={fixture.home} />
              <div className="flex flex-col items-center shrink-0">
                {fixture.status.live || fixture.status.finished ? (
                  <span className="text-4xl font-black text-white tabular-nums" dir="ltr">
                    {fixture.goals.home ?? 0} - {fixture.goals.away ?? 0}
                  </span>
                ) : (
                  <>
                    <span className="text-2xl font-black text-white">{formatKickoffTime(fixture.date)}</span>
                    <span className="text-[11px] mt-1">
                      <Countdown timestamp={fixture.timestamp} />
                    </span>
                  </>
                )}
              </div>
              <TeamBig team={fixture.away} />
            </div>
          </button>
        ) : (
          <div className="rounded-2xl bg-black/20 ring-1 ring-white/10 p-8 text-center text-emerald-100/70">
            {isLoading ? "جارٍ تحميل بيانات البطولة…" : "لا توجد مباريات مجدولة حاليًا"}
          </div>
        )}

        <div className="flex justify-center mt-5">
          <Button asChild className="bg-amber-300 text-emerald-950 hover:bg-amber-200 font-bold rounded-full">
            <a href="/kings-cup/predictions">توقّع نتائج كأس الملك واربح النقاط</a>
          </Button>
        </div>
      </div>
    </section>
  );
}
