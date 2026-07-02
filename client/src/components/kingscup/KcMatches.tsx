import { CalendarDays } from "lucide-react";
import { KcMatchCard } from "./KcMatchCard";
import { formatKickoffDay, riyadhDayKey, type KcFixture } from "./kcTypes";

interface DayGroup {
  key: string;
  label: string;
  items: KcFixture[];
}

function groupByDay(fixtures: KcFixture[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const fx of [...fixtures].sort((a, b) => a.timestamp - b.timestamp)) {
    const key = riyadhDayKey(fx.date);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(fx);
    else groups.push({ key, label: formatKickoffDay(fx.date), items: [fx] });
  }
  return groups;
}

export function KcMatches({
  fixtures,
  isLoading,
  onOpenMatch,
}: {
  fixtures: KcFixture[];
  isLoading: boolean;
  onOpenMatch: (id: number) => void;
}) {
  const days = groupByDay(fixtures);

  return (
    <section id="kc-schedule" className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-2 mb-5">
        <CalendarDays className="h-5 w-5 text-emerald-600" />
        <h2 className="text-lg font-black">جدول المباريات</h2>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">جارٍ تحميل المباريات…</p>
      ) : days.length === 0 ? (
        <p className="text-sm text-muted-foreground">لا توجد مباريات مجدولة حاليًا.</p>
      ) : (
        <div className="space-y-6">
          {days.map((day) => (
            <div key={day.key}>
              <p className="text-sm font-bold text-muted-foreground mb-2">{day.label}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {day.items.map((fx) => (
                  <KcMatchCard key={fx.id} fixture={fx} onOpen={onOpenMatch} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
