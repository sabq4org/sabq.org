/**
 * بطاقة توقّع مباراة روشن — نسخة بطاقة توقّعات المونديال (PredictionMatchCard)
 * بمحرّكها نفسه: عدّادا أهداف، عدد المتوقّعين، العدّاد التنازلي، وكشف التسوية
 * (+نقاط من جائزة الـ500 المقسومة بين المصيبين). الدوري يسمح بالتعادل فلا حظر.
 */
import { useEffect, useState } from "react";
import { Check, Clock, Lock, LogIn, Radio, Trophy, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/format";
import { LiveMinute } from "../../worldcup/LiveMinute";
import { ScoreStepper } from "../../worldcup/predictions/ScoreStepper";
import { countdownTo, formatKickoffTime, type RslTeam } from "../rslTypes";
import type { PredictableMatch } from "./rslPredictionsTypes";

function TeamCrest({ team }: { team: RslTeam }) {
  return (
    <div className="flex flex-col items-center gap-1.5 w-20 text-center">
      <div className="h-12 w-12 rounded-full bg-white ring-1 ring-border p-1 shrink-0">
        <img src={team.logo} alt={team.name} className="h-full w-full object-contain" loading="lazy" />
      </div>
      <span className="text-xs font-bold leading-tight line-clamp-2">{team.name}</span>
    </div>
  );
}

/** عدّاد تنازلي حيّ يُعاد رسمه كل ثانية حتى انطلاق المباراة. */
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
  match: PredictableMatch;
  isAuthenticated: boolean;
  isSubmitting: boolean;
  onSubmit: (fixtureId: number, predHome: number, predAway: number) => void;
  onRequireLogin: () => void;
}

export function RslPredictionMatchCard({ match, isAuthenticated, isSubmitting, onSubmit, onRequireLogin }: Props) {
  const { fixture, myPrediction, settlement, locked, predictionsCount } = match;
  const settled = settlement?.status === "settled";
  const started = fixture.status.live || fixture.status.finished;

  const [home, setHome] = useState(myPrediction?.predHome ?? 0);
  const [away, setAway] = useState(myPrediction?.predAway ?? 0);

  // مزامنة بعد الحفظ/إعادة الجلب — تُحدِّث القيم متى تغيّر توقّع المستخدم.
  useEffect(() => {
    if (myPrediction) {
      setHome(myPrediction.predHome);
      setAway(myPrediction.predAway);
    }
  }, [myPrediction?.predHome, myPrediction?.predAway]);

  const dirty = !myPrediction || myPrediction.predHome !== home || myPrediction.predAway !== away;
  const isWin = settled && myPrediction?.status === "correct";

  return (
    <Card className="overflow-hidden border-0 dark:border dark:border-card-border" data-testid={`rsl-pred-card-${fixture.id}`}>
      {/* شريط علوي: الجولة + حالة المباراة */}
      <div className="flex items-center justify-between bg-emerald-500/5 px-4 py-2 border-b border-emerald-500/10">
        <span className="text-[11px] font-semibold text-muted-foreground">{fixture.round}</span>
        {fixture.status.live ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">
            <Radio className="h-2.5 w-2.5 animate-pulse" />
            {fixture.status.elapsed != null ? <LiveMinute status={fixture.status} /> : "مباشر"}
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
        {/* الفريقان + المنطقة الوسطى (عدّادات أو نتيجة) */}
        <div className="flex items-start justify-between gap-2">
          <TeamCrest team={fixture.home} />

          <div className="flex flex-1 flex-col items-center justify-center pt-1">
            {settled || started ? (
              // النتيجة الفعلية — RTL: رقم المضيف يمين (تحت شعاره)؛ لا dir="ltr" وإلا انقلبت
              <div className="flex items-center gap-3 text-4xl font-black tabular-nums">
                <span>{settled ? settlement!.finalHome : fixture.goals.home ?? 0}</span>
                <span className="text-muted-foreground text-2xl">-</span>
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
              <span className="mt-1 text-[10px] text-muted-foreground">بانتظار احتساب الفائزين…</span>
            )}
          </div>

          <TeamCrest team={fixture.away} />
        </div>

        {/* المنطقة السفلية: حسب الحالة */}
        <div className="mt-4">
          {settled ? (
            <SettledFooter match={match} isWin={!!isWin} />
          ) : locked ? (
            <LockedFooter match={match} />
          ) : isAuthenticated ? (
            <Button
              onClick={() => onSubmit(fixture.id, home, away)}
              disabled={isSubmitting || (!dirty && !!myPrediction)}
              className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
              data-testid={`rsl-pred-submit-${fixture.id}`}
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
            <Button onClick={onRequireLogin} variant="outline" className="w-full gap-2 border-emerald-500/40 text-emerald-700 dark:text-emerald-300">
              <LogIn className="h-4 w-4" /> سجّل دخولك للمشاركة
            </Button>
          )}

          {/* عدد المشاركين + العدّاد التنازلي */}
          <div className="mt-2.5 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{predictionsCount > 0 ? `${formatNumber(predictionsCount)} توقّعوا` : "كن أول المتوقّعين"}</span>
            {!started && !settled && <Countdown timestamp={fixture.timestamp} />}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** تذييل المباراة المقفلة (انطلقت ولم تُحتسب بعد) — يعرض توقّع المستخدم للقراءة. */
function LockedFooter({ match }: { match: PredictableMatch }) {
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

/** تذييل المباراة المُسوّاة — كشف نتيجة التوقّع + النقاط. */
function SettledFooter({ match, isWin }: { match: PredictableMatch; isWin: boolean }) {
  const { myPrediction, settlement } = match;

  if (!myPrediction) {
    return (
      <p className="rounded-lg bg-muted/60 px-3 py-2 text-center text-xs text-muted-foreground">
        لم تشارك بتوقّع لهذه المباراة
        {settlement && settlement.winnersCount > 0 && (
          <> · فاز {formatNumber(settlement.winnersCount)} متوقّع</>
        )}
      </p>
    );
  }

  return (
    <div
      className={`rounded-xl px-3 py-2.5 ${
        isWin
          ? "bg-emerald-500/10 ring-1 ring-emerald-500/30"
          : "bg-muted/60"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-sm font-bold">
          {isWin ? (
            <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <X className="h-4 w-4 text-muted-foreground" />
          )}
          <span className={isWin ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground"}>
            توقّعك:
          </span>
          <span className="inline-flex items-center gap-1 tabular-nums font-black">
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
      {isWin && settlement && settlement.winnersCount > 1 && (
        <p className="mt-1.5 text-[11px] text-emerald-700/80 dark:text-emerald-300/80">
          شاركك الفوز {formatNumber(settlement.winnersCount - 1)} — قُسِّمت الجائزة:{" "}
          {formatNumber(settlement.pointsPerWinner)} نقطة لكل فائز
        </p>
      )}
    </div>
  );
}
