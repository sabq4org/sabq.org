import { useEffect, useState } from "react";
import { Bot, Check, Clock, Coins, Lock, LogIn, Radio, Trophy, Users, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScoreStepper } from "@/components/worldcup/predictions/ScoreStepper";
import { ProbabilityBar } from "@/components/asiancup/predictions/ProbabilityBar";
import { formatKickoffTime, type GcTeam } from "../gcTypes";
import { formatNumber } from "@/lib/format";
import {
  tierPool,
  TIER_AR,
  TIER_EMOJI,
  type GcPredictableMatch,
  type GcTier,
} from "./gcPredictionTypes";

function TeamCrest({ team }: { team: GcTeam }) {
  return (
    <div className="flex w-20 flex-col items-center gap-1.5 text-center">
      <div className="h-12 w-12 shrink-0 rounded-full bg-white p-1 ring-1 ring-border">
        {team.logo ? (
          <img src={team.logo} alt={team.name} className="h-full w-full object-contain" loading="lazy" />
        ) : null}
      </div>
      <span className="line-clamp-2 text-xs font-bold leading-tight">{team.name}</span>
    </div>
  );
}

function Countdown({ timestamp }: { timestamp: number }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const total = Math.max(0, timestamp * 1000 - Date.now());
  if (total <= 0) return null;
  const days = Math.floor(total / 86_400_000);
  const hours = Math.floor((total % 86_400_000) / 3_600_000);
  const minutes = Math.floor((total % 3_600_000) / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <span className="inline-flex items-center gap-1 tabular-nums" dir="ltr">
      <Clock className="h-3 w-3" />
      {days > 0 && <span>{days}ي </span>}
      {pad(hours)}:{pad(minutes)}:{pad(seconds)}
    </span>
  );
}

interface Props {
  match: GcPredictableMatch;
  isAuthenticated: boolean;
  isSubmitting: boolean;
  onSubmit: (fixtureId: number, predHome: number, predAway: number) => void;
  onRequireLogin: () => void;
}

export function GcPredictionMatchCard({ match, isAuthenticated, isSubmitting, onSubmit, onRequireLogin }: Props) {
  const { fixture, myPrediction, settlement, locked, probs, crowd, poolAvailable } = match;
  const settled = settlement?.status === "settled";
  const voided = settlement?.status === "void" || myPrediction?.status === "void";
  const started = fixture.status.live || fixture.status.finished;

  const [home, setHome] = useState(myPrediction?.predHome ?? 0);
  const [away, setAway] = useState(myPrediction?.predAway ?? 0);

  useEffect(() => {
    if (myPrediction) {
      setHome(myPrediction.predHome);
      setAway(myPrediction.predAway);
    }
  }, [myPrediction?.predHome, myPrediction?.predAway]);

  const dirty = !myPrediction || myPrediction.predHome !== home || myPrediction.predAway !== away;
  const isWin = settled && myPrediction?.status === "correct" && (myPrediction?.pointsAwarded ?? 0) > 0;
  const editable = !locked && !settled && !voided && !started;
  const jackpot = poolAvailable - 1000;

  return (
    <Card className="overflow-hidden border-0 dark:border dark:border-card-border" data-testid={`gc-pred-card-${fixture.id}`}>
      <div className="flex items-center justify-between border-b border-sky-500/15 bg-gradient-to-l from-sky-500/10 to-sky-600/5 px-4 py-2">
        <span className="text-[11px] font-semibold text-muted-foreground">{fixture.round}</span>
        {fixture.status.live ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">
            <Radio className="h-2.5 w-2.5 animate-pulse" />
            {fixture.status.elapsed != null ? `${fixture.status.elapsed}'` : "مباشر"}
          </span>
        ) : voided ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-500/10 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:text-slate-300">
            <X className="h-2.5 w-2.5" /> أُلغيت — لا تُحتسب
          </span>
        ) : settled ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-700 px-2 py-0.5 text-[10px] font-bold text-white">
            <Trophy className="h-2.5 w-2.5" /> انتهت
          </span>
        ) : locked ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
            <Lock className="h-2.5 w-2.5" /> أُغلقت التوقّعات
          </span>
        ) : (
          <span className="text-[11px] font-bold text-green-800 dark:text-green-300">{formatKickoffTime(fixture.date)}</span>
        )}
      </div>

      <CardContent className="p-4">
        {/* البركة المتاحة */}
        {!voided && <div className="mb-3 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-sky-500/15 to-sky-400/5 px-3 py-1.5 ring-1 ring-sky-500/25">
          <Coins className="h-4 w-4 text-sky-600 dark:text-sky-400" />
          <span className="text-xs font-bold text-sky-700 dark:text-sky-300">
            بركة هذه المباراة: <span className="tabular-nums">{formatNumber(poolAvailable)}</span> نقطة
          </span>
          {jackpot > 0 && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-sky-500 px-1.5 py-0.5 text-[9px] font-black text-white">
              +{formatNumber(jackpot)} متراكمة
            </span>
          )}
        </div>}

        <div className="flex items-start justify-between gap-2">
          <TeamCrest team={fixture.home} />
          <div className="flex flex-1 flex-col items-center justify-center pt-1">
            {voided ? (
              <div className="rounded-xl bg-muted px-4 py-2 text-sm font-black text-muted-foreground">
                لا نتيجة محتسبة
              </div>
            ) : settled || started ? (
              <div className="flex items-center gap-3 text-4xl font-black tabular-nums">
                <span>{settled ? settlement!.finalHome : fixture.goals.home ?? 0}</span>
                <span className="text-2xl text-muted-foreground">-</span>
                <span>{settled ? settlement!.finalAway : fixture.goals.away ?? 0}</span>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <ScoreStepper value={home} onChange={setHome} disabled={locked} label={fixture.home.name} />
                <span className="pt-3 text-lg font-black text-muted-foreground">×</span>
                <ScoreStepper value={away} onChange={setAway} disabled={locked} label={fixture.away.name} />
              </div>
            )}
            {!settled && !voided && started && <span className="mt-1 text-[10px] text-muted-foreground">بانتظار احتساب النقاط…</span>}
          </div>
          <TeamCrest team={fixture.away} />
        </div>

        {/* المساعد الذكي */}
        <div className="mt-4 space-y-3 rounded-xl bg-muted/30 p-3">
          <ProbabilityBar
            icon={<Bot className="h-3.5 w-3.5 text-green-700 dark:text-green-400" />}
            label="توقّع سبق الذكي"
            homeName={fixture.home.name}
            awayName={fixture.away.name}
            home={probs.home}
            draw={probs.draw}
            away={probs.away}
            highlightTop
          />
          {crowd.total > 0 && (
            <ProbabilityBar
              icon={<Users className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />}
              label={`إجماع الجمهور · ${formatNumber(crowd.total)} توقّع`}
              homeName={fixture.home.name}
              awayName={fixture.away.name}
              home={crowd.home}
              draw={crowd.draw}
              away={crowd.away}
            />
          )}
        </div>

        {/* توزيع البركة على الطبقات (معاينة) */}
        {editable && (
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            {(["exact", "margin", "outcome"] as const).map((t) => (
              <div key={t} className="rounded-lg bg-sky-500/[0.06] px-2 py-1.5 text-center ring-1 ring-sky-500/15">
                <p className="text-[10px] font-bold text-muted-foreground">
                  {TIER_EMOJI[t]} {TIER_AR[t]}
                </p>
                <p className="text-xs font-black tabular-nums text-sky-700 dark:text-sky-300">
                  {formatNumber(tierPool(poolAvailable, t))}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* المنطقة السفلية */}
        <div className="mt-3">
          {voided ? (
            <p className="rounded-lg bg-slate-500/10 px-3 py-2 text-center text-xs font-bold text-slate-600 dark:text-slate-300">
              أُلغيت المباراة — توقّعك لا يُحتسب ولا يؤثر في رصيدك
            </p>
          ) : settled ? (
            <SettledFooter match={match} isWin={!!isWin} />
          ) : locked ? (
            <LockedFooter match={match} />
          ) : isAuthenticated ? (
            <Button
              onClick={() => onSubmit(fixture.id, home, away)}
              disabled={isSubmitting || (!dirty && !!myPrediction)}
              className="w-full gap-2 bg-green-700 text-white hover:bg-green-800"
              data-testid={`gc-pred-submit-${fixture.id}`}
            >
              {myPrediction && !dirty ? (
                <>
                  <Check className="h-4 w-4" /> تم حفظ توقّعك
                </>
              ) : myPrediction ? (
                "تعديل التوقّع"
              ) : (
                "احفظ توقّعي"
              )}
            </Button>
          ) : (
            <Button
              onClick={onRequireLogin}
              variant="outline"
              className="w-full gap-2 border-green-600/40 text-green-800 dark:text-green-300"
            >
              <LogIn className="h-4 w-4" /> سجّل دخولك للمشاركة
            </Button>
          )}

          <div className="mt-2.5 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              {match.predictionsCount > 0 ? `${formatNumber(match.predictionsCount)} توقّعوا` : "كن أول المتوقّعين"}
            </span>
            {!started && !settled && !voided && <Countdown timestamp={fixture.timestamp} />}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function LockedFooter({ match }: { match: GcPredictableMatch }) {
  const { myPrediction } = match;
  if (!myPrediction) {
    return (
      <p className="rounded-lg bg-muted/60 px-3 py-2 text-center text-xs text-muted-foreground">
        لم تشارك بتوقّع لهذه المباراة
      </p>
    );
  }
  return (
    <p className="rounded-lg bg-muted/60 px-3 py-2 text-center text-xs">
      <span className="text-muted-foreground">توقّعك: </span>
      <span className="font-bold tabular-nums">
        {myPrediction.predHome} - {myPrediction.predAway}
      </span>
    </p>
  );
}

function tierWinnersCount(settlement: GcPredictableMatch["settlement"], tier: GcTier): number {
  if (!settlement) return 0;
  if (tier === "exact") return settlement.exactWinners;
  if (tier === "margin") return settlement.marginWinners;
  if (tier === "outcome") return settlement.outcomeWinners;
  return 0;
}

function SettledFooter({ match, isWin }: { match: GcPredictableMatch; isWin: boolean }) {
  const { myPrediction, settlement } = match;

  if (!myPrediction) {
    return (
      <p className="rounded-lg bg-muted/60 px-3 py-2 text-center text-xs text-muted-foreground">
        لم تشارك بتوقّع لهذه المباراة
      </p>
    );
  }

  const tier = myPrediction.tier;
  const shared = tier !== "none" ? tierWinnersCount(settlement, tier) : 0;

  return (
    <div className={`rounded-xl px-3 py-2.5 ${isWin ? "bg-sky-500/10 ring-1 ring-sky-500/30" : "bg-muted/60"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-sm font-bold">
          {isWin ? (
            <Check className="h-4 w-4 text-green-700 dark:text-green-400" />
          ) : (
            <X className="h-4 w-4 text-muted-foreground" />
          )}
          <span className={isWin ? "text-green-800 dark:text-green-300" : "text-muted-foreground"}>توقّعك:</span>
          <span className="font-black tabular-nums">
            {myPrediction.predHome} - {myPrediction.predAway}
          </span>
        </span>
        {isWin ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-sky-500 px-2.5 py-1 text-xs font-black text-white">
            <Coins className="h-3 w-3" /> +{formatNumber(myPrediction.pointsAwarded)} نقطة
          </span>
        ) : (
          <span className="text-xs font-semibold text-muted-foreground">لم تُصب النتيجة</span>
        )}
      </div>

      {isWin && tier !== "none" && (
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-green-600/15 px-2.5 py-1 text-[11px] font-bold text-green-800 dark:text-green-300">
          {TIER_EMOJI[tier]} {TIER_AR[tier]}
          {shared > 1 && <span className="text-muted-foreground">· تقاسمتها مع {formatNumber(shared - 1)} غيرك</span>}
        </p>
      )}

      {settlement && settlement.exactWinners > 0 && (
        <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          🎯 طابق النتيجة بالضبط {formatNumber(settlement.exactWinners)} متوقّع
        </p>
      )}
    </div>
  );
}
