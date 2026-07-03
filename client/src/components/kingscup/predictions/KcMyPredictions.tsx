/**
 * قائمة «توقّعاتي» لكأس الملك — نفس قائمة المونديال (MyPredictionsList):
 * بطاقة لكل توقّع بشريط حالة علوي (+نقاط / لم تُصب / قيد الانتظار) وكتلتي
 * نتيجة (توقّعي × النتيجة). النقاط: 3 دقيقة، 1 اتجاه، 0 خطأ.
 */
import { Clock, Target, Trophy, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatKickoffDay } from "../kcTypes";
import { formatNumber } from "@/lib/format";
import type { KcSavedPrediction } from "./kcPredictionsTypes";

/** شعار + اسم النادي — عمود متمركز بعرض ثابت (المضيف يمينًا في RTL). */
function Crest({ name, logo }: { name: string | null; logo: string | null }) {
  return (
    <div className="flex w-16 shrink-0 flex-col items-center gap-1.5 text-center">
      <div className="h-11 w-11 rounded-full bg-white p-1 ring-1 ring-border">
        {logo ? (
          <img src={logo} alt={name ?? ""} className="h-full w-full object-contain" loading="lazy" />
        ) : (
          <div className="h-full w-full rounded-full bg-muted" />
        )}
      </div>
      <span className="line-clamp-2 text-[11px] font-bold leading-tight">{name ?? "—"}</span>
    </div>
  );
}

/**
 * كتلة نتيجة (توقّعي/النتيجة) — رقمان منفصلان بلا dir="ltr": في RTL يقع رقم
 * المضيف يمينًا (تحت شعاره) والضيف يسارًا، مطابقةً لبطاقة التوقّع.
 */
function ScoreBlock({
  label,
  home,
  away,
  tone = "default",
}: {
  label: string;
  home: number;
  away: number;
  tone?: "default" | "win" | "muted";
}) {
  const numClass =
    tone === "win"
      ? "text-emerald-700 dark:text-emerald-300"
      : tone === "muted"
        ? "text-muted-foreground"
        : "text-foreground";
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[10px] font-medium text-muted-foreground">{label}</span>
      <div className={`flex items-center gap-2 text-2xl font-black tabular-nums ${numClass}`}>
        <span>{home}</span>
        <span className="text-base text-muted-foreground">-</span>
        <span>{away}</span>
      </div>
    </div>
  );
}

interface Props {
  predictions: KcSavedPrediction[];
  isLoading: boolean;
}

export function KcMyPredictions({ predictions, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted/60" />
        ))}
      </div>
    );
  }

  if (predictions.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border py-12 text-center">
        <Trophy className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">لم تضع أي توقّع بعد — ابدأ من تبويب «المباريات».</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {predictions.map((p) => {
        const settled = p.points != null && p.actualHome != null && p.actualAway != null;
        const exact = settled && p.points === 3;
        const direction = settled && p.points === 1;
        const isWin = exact || direction;
        const kickoffIso = p.kickoffTs > 0 ? new Date(p.kickoffTs * 1000).toISOString() : null;

        return (
          <Card
            key={p.fixtureId}
            className={`overflow-hidden border-0 dark:border dark:border-card-border ${
              isWin ? "ring-1 ring-emerald-500/40" : ""
            }`}
            data-testid={`kc-my-pred-${p.fixtureId}`}
          >
            {/* شريط علوي: اليوم + حالة التوقّع */}
            <div
              className={`flex items-center justify-between px-4 py-2 ${
                isWin ? "bg-emerald-500/10" : "bg-muted/40"
              }`}
            >
              <span className="text-[11px] font-semibold text-muted-foreground">
                {kickoffIso ? formatKickoffDay(kickoffIso) : "كأس خادم الحرمين الشريفين"}
              </span>
              {settled ? (
                exact ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-0.5 text-[11px] font-black text-white">
                    <Trophy className="h-3 w-3" /> نتيجة دقيقة +{formatNumber(p.points ?? 0)} نقاط
                  </span>
                ) : direction ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-black text-emerald-700 dark:text-emerald-300">
                    <Target className="h-3 w-3" /> اتجاه صحيح +1 نقطة
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-bold text-muted-foreground">
                    <X className="h-3 w-3" /> لم تُصب
                  </span>
                )
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-bold text-amber-600 dark:text-amber-400">
                  <Clock className="h-3 w-3" /> قيد الانتظار
                </span>
              )}
            </div>

            {/* الفريقان + توقّعي/النتيجة */}
            <div className="flex items-center justify-between gap-2 px-4 py-3">
              <Crest name={p.homeName} logo={p.homeLogo} />

              <div className="flex flex-1 items-center justify-center gap-4">
                <ScoreBlock label="توقّعي" home={p.predHome} away={p.predAway} tone={isWin ? "win" : "default"} />
                {settled && (
                  <>
                    <div className="h-9 w-px bg-border" />
                    <ScoreBlock label="النتيجة" home={p.actualHome!} away={p.actualAway!} tone="muted" />
                  </>
                )}
              </div>

              <Crest name={p.awayName} logo={p.awayLogo} />
            </div>
          </Card>
        );
      })}
    </div>
  );
}
