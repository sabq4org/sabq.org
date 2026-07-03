/**
 * شريط إرث الموسم الماضي — نفس شريط حقائق المونديال (TournamentFacts): بطاقات
 * صغيرة على شريط فاصل تحت الهيرو. يظهر قبل انطلاق الموسم الجديد (وأثناء
 * جولاته الأولى تبقى معلومة «حامل اللقب» قيّمة) ويعتمد بيانات hero.lastSeason
 * القادمة مع الطلب نفسه — بلا نداء إضافي.
 */
import { Award, CalendarDays, Trophy } from "lucide-react";
import { formatKickoffDay, type RslHero } from "./rslTypes";

function FactCard({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
        {icon}
      </div>
      <div className="min-w-0 text-right">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <div className="text-sm">{children}</div>
      </div>
    </div>
  );
}

export function RslFacts({ hero }: { hero: RslHero | undefined }) {
  const last = hero?.lastSeason;
  const outlook = hero?.outlook;
  if (!last?.champion && !last?.topScorer && !outlook?.nextSeasonStart) return null;

  return (
    <section dir="rtl" className="border-b border-border/60 bg-muted/20 py-5">
      <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {last?.champion && (
            <FactCard
              icon={<Trophy className="h-5 w-5" />}
              label={`حامل اللقب${last.previousSeason ? ` (${last.previousSeason})` : ""}`}
            >
              <span className="inline-flex items-center gap-1.5 font-bold">
                <img src={last.champion.logo} alt={last.champion.name} className="h-5 w-5 object-contain shrink-0" loading="lazy" />
                {last.champion.name}
              </span>
            </FactCard>
          )}
          {last?.topScorer && (
            <FactCard icon={<Award className="h-5 w-5" />} label="هدّاف الموسم الماضي">
              <span className="inline-flex items-center gap-1.5 font-bold">
                {last.topScorer.photo && (
                  <img src={last.topScorer.photo} alt={last.topScorer.name} className="h-5 w-5 rounded-full object-cover shrink-0" loading="lazy" />
                )}
                {last.topScorer.name}
                <span className="text-xs font-normal text-muted-foreground">({last.topScorer.goals} هدفًا)</span>
              </span>
            </FactCard>
          )}
          {outlook?.phase !== "in-season" && outlook?.nextSeasonStart && (
            <FactCard icon={<CalendarDays className="h-5 w-5" />} label="انطلاقة الموسم الجديد">
              <span className="font-bold">{formatKickoffDay(outlook.nextSeasonStart)}</span>
            </FactCard>
          )}
        </div>
      </div>
    </section>
  );
}
