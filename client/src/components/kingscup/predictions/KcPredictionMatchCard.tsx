/**
 * بطاقة توقّع مباراة كأس الملك — نفس بطاقة توقّعات المونديال
 * (PredictionMatchCard): شريط علوي بالجولة والحالة، شعارا الفريقين، عدّادا
 * أهداف (ScoreStepper)، زر حفظ، وعدّاد تنازلي حتى قفل التوقّع عند الانطلاق.
 */
import { useEffect, useState } from "react";
import { Check, Clock, Lock, LogIn, Radio } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LiveMinute } from "../../worldcup/LiveMinute";
import { ScoreStepper } from "../../worldcup/predictions/ScoreStepper";
import { countdownTo, formatKickoffTime, type KcFixture, type KcTeam } from "../kcTypes";
import type { KcSavedPrediction } from "./kcPredictionsTypes";

function TeamCrest({ team }: { team: KcTeam }) {
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
  fixture: KcFixture;
  myPrediction: KcSavedPrediction | null;
  isAuthenticated: boolean;
  isSubmitting: boolean;
  onSubmit: (fixture: KcFixture, predHome: number, predAway: number) => void;
  onRequireLogin: () => void;
}

export function KcPredictionMatchCard({
  fixture,
  myPrediction,
  isAuthenticated,
  isSubmitting,
  onSubmit,
  onRequireLogin,
}: Props) {
  const started = fixture.status.live || fixture.status.finished;
  const locked = started || fixture.timestamp * 1000 <= Date.now();

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

  return (
    <Card className="overflow-hidden border-0 dark:border dark:border-card-border" data-testid={`kc-pred-card-${fixture.id}`}>
      {/* شريط علوي: الجولة + حالة المباراة */}
      <div className="flex items-center justify-between bg-emerald-500/5 px-4 py-2 border-b border-emerald-500/10">
        <span className="text-[11px] font-semibold text-muted-foreground">{fixture.round}</span>
        {fixture.status.live ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">
            <Radio className="h-2.5 w-2.5 animate-pulse" />
            {fixture.status.elapsed != null ? <LiveMinute status={fixture.status} /> : "مباشر"}
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
        {/* الفريقان + المنطقة الوسطى (عدّادات أو نتيجة حية) */}
        <div className="flex items-start justify-between gap-2">
          <TeamCrest team={fixture.home} />

          <div className="flex flex-1 flex-col items-center justify-center pt-1">
            {started ? (
              // النتيجة الحية — RTL: رقم المضيف يمين (تحت شعاره)؛ لا dir="ltr" وإلا انقلبت
              <div className="flex items-center gap-3 text-4xl font-black tabular-nums">
                <span>{fixture.goals.home ?? 0}</span>
                <span className="text-muted-foreground text-2xl">-</span>
                <span>{fixture.goals.away ?? 0}</span>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <ScoreStepper value={home} onChange={setHome} disabled={locked} label={fixture.home.name} />
                <span className="pt-3 text-lg font-black text-muted-foreground">×</span>
                <ScoreStepper value={away} onChange={setAway} disabled={locked} label={fixture.away.name} />
              </div>
            )}
            {started && (
              <span className="mt-1 text-[10px] text-muted-foreground">تُحتسب النقاط بعد صافرة النهاية</span>
            )}
          </div>

          <TeamCrest team={fixture.away} />
        </div>

        {/* المنطقة السفلية: حسب الحالة */}
        <div className="mt-4">
          {locked ? (
            <LockedFooter myPrediction={myPrediction} />
          ) : isAuthenticated ? (
            <Button
              onClick={() => onSubmit(fixture, home, away)}
              disabled={isSubmitting || (!dirty && !!myPrediction)}
              className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
              data-testid={`kc-pred-submit-${fixture.id}`}
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

          {/* التذكير بالنقاط + العدّاد التنازلي */}
          <div className="mt-2.5 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>نتيجة دقيقة = 3 نقاط · اتجاه صحيح = نقطة</span>
            {!started && <Countdown timestamp={fixture.timestamp} />}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/** تذييل المباراة المقفلة (انطلقت ولم تُحتسب بعد) — يعرض توقّع المستخدم للقراءة. */
function LockedFooter({ myPrediction }: { myPrediction: KcSavedPrediction | null }) {
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
