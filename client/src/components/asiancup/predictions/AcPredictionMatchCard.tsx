import { useEffect, useState } from "react";
import { Bot, Check, Clock, Flame, Lock, LogIn, Radio, Sparkles, Target, Trophy, Users, X, Zap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScoreStepper } from "@/components/worldcup/predictions/ScoreStepper";
import { formatKickoffTime, countdownTo, type AcTeam } from "../acTypes";
import { formatNumber } from "@/lib/format";
import { ProbabilityBar } from "./ProbabilityBar";
import { potentialPoints, type AcPredictableMatch } from "./acPredictionTypes";

function TeamCrest({ team }: { team: AcTeam }) {
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

/** عدّاد تنازلي حيّ حتى انطلاق المباراة. */
function Countdown({ timestamp }: { timestamp: number }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const c = countdownTo(timestamp);
  if (c.total <= 0) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <span className="inline-flex items-center gap-1 tabular-nums" dir="ltr">
      <Clock className="h-3 w-3" />
      {c.days > 0 && <span>{c.days}ي </span>}
      {pad(c.hours)}:{pad(c.minutes)}:{pad(c.seconds)}
    </span>
  );
}

interface Props {
  match: AcPredictableMatch;
  currentStreak: number;
  isAuthenticated: boolean;
  isSubmitting: boolean;
  onSubmit: (fixtureId: number, predHome: number, predAway: number) => void;
  onRequireLogin: () => void;
}

export function AcPredictionMatchCard({
  match,
  currentStreak,
  isAuthenticated,
  isSubmitting,
  onSubmit,
  onRequireLogin,
}: Props) {
  const { fixture, myPrediction, settlement, locked, probs, crowd } = match;
  const settled = settlement?.status === "settled";
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
  const isWin = settled && myPrediction?.status === "correct";

  const editable = !locked && !settled && !started;
  const pot = editable ? potentialPoints(home, away, probs, currentStreak) : null;

  return (
    <Card className="overflow-hidden border-0 dark:border dark:border-card-border" data-testid={`ac-pred-card-${fixture.id}`}>
      <div className="flex items-center justify-between border-b border-emerald-500/10 bg-emerald-500/5 px-4 py-2">
        <span className="text-[11px] font-semibold text-muted-foreground">{fixture.round}</span>
        {fixture.status.live ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">
            <Radio className="h-2.5 w-2.5 animate-pulse" />
            {fixture.status.elapsed != null ? `${fixture.status.elapsed}'` : "مباشر"}
          </span>
        ) : settled ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white">
            <Trophy className="h-2.5 w-2.5" /> انتهت
          </span>
        ) : locked ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
            <Lock className="h-2.5 w-2.5" /> أُغلقت التوقّعات
          </span>
        ) : (
          <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
            {formatKickoffTime(fixture.date)}
          </span>
        )}
      </div>

      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <TeamCrest team={fixture.home} />
          <div className="flex flex-1 flex-col items-center justify-center pt-1">
            {settled || started ? (
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
            {!settled && started && (
              <span className="mt-1 text-[10px] text-muted-foreground">بانتظار احتساب النقاط…</span>
            )}
          </div>
          <TeamCrest team={fixture.away} />
        </div>

        {/* المساعد الذكي: احتمالات النموذج + إجماع الجمهور */}
        <div className="mt-4 space-y-3 rounded-xl bg-muted/30 p-3">
          <ProbabilityBar
            icon={<Bot className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />}
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

        {/* معاينة النقاط المحتملة (لحظية) */}
        {pot && (
          <div className="mt-3 flex items-center justify-between rounded-xl bg-emerald-500/10 px-3 py-2 ring-1 ring-emerald-500/20">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300">
              <Zap className="h-3.5 w-3.5" /> نقاط محتملة إن أصبت
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="text-sm font-black tabular-nums text-emerald-700 dark:text-emerald-300">
                {pot.min}–{pot.max}
              </span>
              <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-600/90 px-2 py-0.5 text-[10px] font-black text-white tabular-nums">
                <Sparkles className="h-2.5 w-2.5" /> جرأة ×{pot.boldness.toFixed(2)}
              </span>
              {currentStreak >= 3 && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-orange-500/90 px-2 py-0.5 text-[10px] font-black text-white">
                  <Flame className="h-2.5 w-2.5" /> سلسلة {formatNumber(currentStreak)}
                </span>
              )}
            </span>
          </div>
        )}

        {/* المنطقة السفلية: حسب الحالة */}
        <div className="mt-3">
          {settled ? (
            <SettledFooter match={match} isWin={!!isWin} />
          ) : locked ? (
            <LockedFooter match={match} />
          ) : isAuthenticated ? (
            <Button
              onClick={() => onSubmit(fixture.id, home, away)}
              disabled={isSubmitting || (!dirty && !!myPrediction)}
              className="w-full gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
              data-testid={`ac-pred-submit-${fixture.id}`}
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
              className="w-full gap-2 border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
            >
              <LogIn className="h-4 w-4" /> سجّل دخولك للمشاركة
            </Button>
          )}

          <div className="mt-2.5 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              {match.predictionsCount > 0
                ? `${formatNumber(match.predictionsCount)} توقّعوا`
                : "كن أول المتوقّعين"}
            </span>
            {!started && !settled && <Countdown timestamp={fixture.timestamp} />}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** تذييل المباراة المقفلة — يعرض توقّع المستخدم للقراءة. */
function LockedFooter({ match }: { match: AcPredictableMatch }) {
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
      <span className="inline-flex items-center gap-1 align-baseline font-bold tabular-nums">
        <span>{myPrediction.predHome}</span>
        <span>-</span>
        <span>{myPrediction.predAway}</span>
      </span>
    </p>
  );
}

/** شارة طبقة محقّقة (نتيجة / فارق / مطابقة). */
function TierBadge({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
        active
          ? "bg-emerald-600 text-white"
          : "bg-muted text-muted-foreground/60 line-through"
      }`}
    >
      {label}
    </span>
  );
}

/** تذييل المباراة المُسوّاة — كشف توقّع المستخدم + تفصيل احتساب نقاطه المهاريّة. */
function SettledFooter({ match, isWin }: { match: AcPredictableMatch; isWin: boolean }) {
  const { myPrediction, settlement } = match;

  if (!myPrediction) {
    return (
      <p className="rounded-lg bg-muted/60 px-3 py-2 text-center text-xs text-muted-foreground">
        لم تشارك بتوقّع لهذه المباراة
        {settlement && settlement.outcomeWinners > 0 && (
          <> · أصاب النتيجة {formatNumber(settlement.outcomeWinners)} متوقّع</>
        )}
      </p>
    );
  }

  return (
    <div className={`rounded-xl px-3 py-2.5 ${isWin ? "bg-emerald-500/10 ring-1 ring-emerald-500/30" : "bg-muted/60"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-sm font-bold">
          {isWin ? (
            <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <X className="h-4 w-4 text-muted-foreground" />
          )}
          <span className={isWin ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground"}>توقّعك:</span>
          <span className="inline-flex items-center gap-1 font-black tabular-nums">
            <span>{myPrediction.predHome}</span>
            <span>-</span>
            <span>{myPrediction.predAway}</span>
          </span>
        </span>
        {isWin ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-black text-white">
            <Trophy className="h-3 w-3" /> +{formatNumber(myPrediction.pointsAwarded)} نقطة
          </span>
        ) : (
          <span className="text-xs font-semibold text-muted-foreground">لم تُصب النتيجة</span>
        )}
      </div>

      {isWin && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <TierBadge active={myPrediction.outcomeHit} label="نتيجة ✓" />
          <TierBadge active={myPrediction.marginHit} label="فارق ✓" />
          <TierBadge active={myPrediction.exactHit} label="مطابقة ✓" />
          <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
            <Sparkles className="h-2.5 w-2.5" /> جرأة ×{(myPrediction.boldnessMult / 100).toFixed(2)}
          </span>
          {myPrediction.streakMult > 100 && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-orange-500/15 px-2 py-0.5 text-[10px] font-bold text-orange-600 dark:text-orange-400">
              <Flame className="h-2.5 w-2.5" /> سلسلة ×{(myPrediction.streakMult / 100).toFixed(2)}
            </span>
          )}
        </div>
      )}

      {settlement && settlement.exactWinners > 0 && (
        <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <Target className="h-3 w-3" /> طابق النتيجة بالضبط {formatNumber(settlement.exactWinners)} متوقّع
        </p>
      )}
    </div>
  );
}
