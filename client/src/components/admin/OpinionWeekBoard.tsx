import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, CircleDashed, Clock, AlarmClockOff, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

type Entry = {
  writerId: string;
  name: string;
  slotAt: string;
  state: "published" | "scheduled" | "arrived" | "missing" | "late";
  articleId: string | null;
};
type Day = { date: string; weekday: number; entries: Entry[] };

const WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"] as const;

const STATE: Record<Entry["state"], { label: string; tone: string; Icon: typeof Clock }> = {
  published: { label: "نُشر", tone: "text-emerald-700 dark:text-emerald-400", Icon: CheckCircle2 },
  scheduled: { label: "مجدول", tone: "text-sky-700 dark:text-sky-400", Icon: Clock },
  arrived: { label: "وصلت", tone: "text-violet-700 dark:text-violet-300", Icon: FileText },
  missing: { label: "لم تصل", tone: "text-muted-foreground", Icon: CircleDashed },
  late: { label: "فات موعده", tone: "text-red-600 dark:text-red-400", Icon: AlarmClockOff },
};

function clock(iso: string) {
  return new Date(iso).toLocaleTimeString("ar-SA-u-nu-latn", { timeZone: "Asia/Riyadh", hour: "numeric", minute: "2-digit" });
}

/** شريط أسبوع كتّاب الرأي فوق قائمة المسودات: من المستحق كل يوم وهل وصل مقاله. */
export function OpinionWeekBoard({ onOpenArticle }: { onOpenArticle?: (articleId: string) => void }) {
  const { data } = useQuery<{ days: Day[] }>({
    queryKey: ["/api/admin/opinion-writers/week-board"],
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
  const days = Array.isArray(data?.days) ? data.days : [];
  const entries = days.flatMap((day) => day.entries);
  if (entries.length === 0) return null;

  const arrived = entries.filter((e) => e.state !== "missing" && e.state !== "late").length;
  const late = entries.filter((e) => e.state === "late").length;

  return (
    <section className="rounded-xl border border-border/80 bg-card" data-testid="opinion-week-board" aria-label="مواعيد كتّاب الرأي هذا الأسبوع">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground">
        <span className="text-sm font-semibold text-foreground">مقالات الرأي · هذا الأسبوع</span>
        <span className="tabular-nums">
          {entries.length} مواعيد · وصل {arrived} · لم يصل {entries.length - arrived - late}
          {late > 0 ? <span className="text-red-600 dark:text-red-400"> · فات {late}</span> : null}
        </span>
      </header>
      <div className="grid grid-cols-7 gap-2 p-3">
        {days.map((day, index) => (
          <div
            key={day.date}
            className={cn(
              "min-h-[76px] min-w-0 rounded-lg border px-2.5 py-2",
              index === 0 ? "border-violet-400/70 dark:border-violet-700" : "border-border/70",
            )}
          >
            <div className="mb-1.5 flex items-center justify-between gap-1 text-[11.5px] font-semibold text-muted-foreground">
              <span className="truncate">{WEEKDAYS[day.weekday]} {Number(day.date.slice(8))}</span>
              {index === 0 ? <span className="text-violet-700 dark:text-violet-300">اليوم</span> : null}
            </div>
            {day.entries.map((entry) => {
              const state = STATE[entry.state];
              const clickable = !!entry.articleId && !!onOpenArticle;
              return (
                <button
                  key={entry.writerId}
                  type="button"
                  disabled={!clickable}
                  onClick={() => entry.articleId && onOpenArticle?.(entry.articleId)}
                  title={`${entry.name} · ${clock(entry.slotAt)} · ${state.label}`}
                  className={cn(
                    "mt-1 flex w-full min-w-0 items-center gap-1 text-start text-[11.5px] leading-5 disabled:cursor-default",
                    clickable && "hover:underline",
                    state.tone,
                  )}
                  data-testid={`week-board-${entry.writerId}`}
                >
                  <state.Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">
                    {entry.name} · {state.label}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}
