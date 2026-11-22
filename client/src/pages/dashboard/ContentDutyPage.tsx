import { useMemo, useState } from "react";
import { CalendarDays, Clock3, RefreshCw } from "lucide-react";
import { Link } from "wouter";
import type { ContentDutyManager } from "@shared/contentDuty";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { useContentDuty } from "@/hooks/useContentDuty";
import { dutyDays, dutySegments, formatDutyHour } from "@/lib/contentDuty";

const MANAGER_PALETTE = ["#7ed6fa", "#f9c781", "#a2adff", "#75e2c4", "#d6a8ff", "#f7a8c4"];

const AXIS_HOURS = [0, 6, 12, 18, 24];

function colorForManager(index: number): string {
  return MANAGER_PALETTE[index % MANAGER_PALETTE.length] ?? "#b6c6d1";
}

function hourLabel(hour: number): string {
  return String(formatDutyHour(hour));
}

function dayName(day: number): string {
  return dutyDays[day] ?? "اليوم";
}

function currentSegment(segment: ReturnType<typeof dutySegments>[number], hour: number): boolean {
  return hour >= segment.start && hour < Math.min(segment.end, 24);
}

function TimelineChart({
  managers,
  segments,
  hour,
  selectedDay,
  isToday,
}: {
  managers: ContentDutyManager[];
  segments: ReturnType<typeof dutySegments>;
  hour: number;
  selectedDay: number;
  isToday: boolean;
}) {
  const segmentByManager = useMemo(() => {
    const grouped = new Map<string, typeof segments>();
    for (const segment of segments) {
      const existing = grouped.get(segment.manager.key) ?? [];
      existing.push(segment);
      grouped.set(segment.manager.key, existing);
    }
    return grouped;
  }, [segments]);

  return (
    <section
      aria-labelledby="content-duty-plot-title"
      className="rounded-2xl border border-[#29475a] bg-[#112d40] p-4 text-white shadow-sm sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="content-duty-plot-title" className="text-base font-bold text-white">
            تغطية {dayName(selectedDay)} على مدار 24 ساعة
          </h2>
          <p className="mt-1 text-xs text-[#c2dce7]">كل شريط يوضح فترة المناوبة المسجّلة</p>
        </div>
        {isToday ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-[#e3f5fd]">
            <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
            <bdi dir="ltr">{hourLabel(hour)}</bdi> الآن
          </span>
        ) : (
          <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-[#d8e9f2]">
            اليوم المختار
          </span>
        )}
      </div>

      <div className="mt-6" dir="rtl">
        <div className="grid grid-cols-[minmax(104px,0.65fr)_minmax(0,2fr)] items-end gap-3 border-b border-[#406071] pb-2 text-[11px] text-[#d1e3ec] sm:grid-cols-[minmax(150px,0.65fr)_minmax(0,2fr)] sm:gap-4">
          <span>المدير</span>
          <div className="relative h-5" aria-hidden="true">
            {AXIS_HOURS.map((axisHour) => (
              <bdi
                key={axisHour}
                dir="ltr"
                className="absolute top-0 translate-x-1/2 tabular-nums"
                style={{ right: `${(axisHour / 24) * 100}%` }}
              >
                {hourLabel(axisHour)}
              </bdi>
            ))}
          </div>
        </div>

        <div className="relative divide-y divide-[#315061]" aria-hidden="true">
          {managers.map((manager, managerIndex) => {
            const managerSegments = segmentByManager.get(manager.key) ?? [];
            return (
              <div
                key={manager.key}
                className="grid grid-cols-[minmax(104px,0.65fr)_minmax(0,2fr)] items-center gap-3 py-3 sm:grid-cols-[minmax(150px,0.65fr)_minmax(0,2fr)] sm:gap-4"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: colorForManager(managerIndex) }}
                  />
                  <span className="truncate text-xs font-medium text-white sm:text-sm">
                    {manager.name}
                  </span>
                </div>
                <div className="relative h-9 overflow-hidden rounded-lg bg-[#1c3c50]">
                  {AXIS_HOURS.slice(1, -1).map((axisHour) => (
                    <span
                      key={axisHour}
                      className="absolute inset-y-0 border-r border-dashed border-[#587181]"
                      style={{ right: `${(axisHour / 24) * 100}%` }}
                    />
                  ))}
                  {managerSegments.map((segment) => {
                    const width = Math.max(0, Math.min(24, segment.end) - Math.max(0, segment.start));
                    if (width <= 0) return null;
                    return (
                      <span
                        key={`${segment.start}-${segment.endHour}`}
                        className="absolute inset-y-1 rounded-md shadow-sm ring-1 ring-black/5"
                        style={{
                          right: `${(Math.max(0, segment.start) / 24) * 100}%`,
                          width: `${(width / 24) * 100}%`,
                          backgroundColor: colorForManager(managerIndex),
                        }}
                      />
                    );
                  })}
                  {isToday ? (
                    <span
                      className="absolute inset-y-0 w-px bg-white/80"
                      style={{ right: `${(Math.min(24, Math.max(0, hour)) / 24) * 100}%` }}
                    />
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <ul className="sr-only">
        {segments.length > 0 ? (
          segments.map((segment) => {
            const overnightNote = segment.overnight
              ? ` — حتى ${hourLabel(segment.endHour)} فجر ${dayName((selectedDay + 1) % dutyDays.length)}`
              : "";
            return (
              <li key={`${segment.manager.key}-${segment.start}-${segment.endHour}`}>
                {segment.manager.name}: من {hourLabel(segment.start)} إلى {hourLabel(segment.end)}
                {isToday && currentSegment(segment, hour) ? " — جارية الآن" : ""}
                {overnightNote}
              </li>
            );
          })
        ) : (
          <li>لا توجد مناوبات مسجّلة لهذا اليوم.</li>
        )}
      </ul>
    </section>
  );
}

function HandoverList({
  managers,
  segments,
  hour,
  selectedDay,
  isToday,
}: {
  managers: ContentDutyManager[];
  segments: ReturnType<typeof dutySegments>;
  hour: number;
  selectedDay: number;
  isToday: boolean;
}) {
  const nextDay = (selectedDay + 1) % dutyDays.length;
  const previousDay = (selectedDay + dutyDays.length - 1) % dutyDays.length;
  return (
    <section
      aria-labelledby="content-duty-handover-title"
      className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-700/60 dark:bg-slate-900 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="content-duty-handover-title" className="text-base font-bold text-slate-900 dark:text-slate-100">
            تسليم الفترات
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">التسلسل الزمني الكامل للمناوبات</p>
        </div>
        <span className="text-xs text-slate-500 dark:text-slate-400">بنظام 24 ساعة</span>
      </div>

      {segments.length > 0 ? (
        <div className="mt-4 divide-y divide-slate-200/80 border-y border-slate-200/80 dark:divide-slate-700/70 dark:border-slate-700/70">
          {segments.map((segment) => {
            const isCurrent = isToday && currentSegment(segment, hour);
            const note = segment.carry
              ? `تتمة من ${dayName(previousDay)}`
              : segment.overnight
                ? `حتى ${hourLabel(segment.endHour)} فجر ${dayName(nextDay)}`
                : "";
            return (
              <div
                key={`${segment.manager.key}-${segment.start}-${segment.endHour}`}
                className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-4"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{
                      backgroundColor: colorForManager(Math.max(0, managers.findIndex((manager) => manager.key === segment.manager.key))),
                    }}
                    aria-hidden="true"
                  />
                  <b className="truncate text-sm text-slate-800 dark:text-slate-200">{segment.manager.name}</b>
                </div>
                <span className="whitespace-nowrap text-sm text-slate-700 dark:text-slate-300">
                  من <bdi dir="ltr">{hourLabel(segment.start)}</bdi> إلى{" "}
                  <bdi dir="ltr">{hourLabel(segment.end)}</bdi>
                </span>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                  <span className={isCurrent ? "font-semibold text-sky-700 dark:text-sky-300" : "text-slate-500 dark:text-slate-400"}>
                    {isCurrent ? "جارية الآن" : isToday && hour >= segment.end ? "انتهت" : "مجدولة"}
                  </span>
                  {note ? <span className="text-slate-500 dark:text-slate-400">{note}</span> : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-4 rounded-xl bg-slate-50 px-4 py-4 text-sm text-slate-600 dark:bg-slate-800/70 dark:text-slate-300">
          لا توجد مناوبات مسجّلة لهذا اليوم.
        </p>
      )}

      <p className="mt-4 text-xs leading-6 text-slate-500 dark:text-slate-400">
        الفترات الفارغة في المخطط تعني أنه لا توجد مناوبة مسجّلة في الجدول الحالي.
      </p>
    </section>
  );
}

function PageLoading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="جار تحميل جدول المناوبات">
      <div className="h-24 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />
      <div className="h-12 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
      <div className="h-80 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />
    </div>
  );
}

function PageError({ retry }: { retry: () => void }) {
  return (
    <section
      role="alert"
      className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-100"
    >
      <h2 className="font-semibold">تعذر تحميل جدول المناوبات</h2>
      <p className="mt-1 text-sm opacity-80">تحقق من الاتصال ثم أعد المحاولة.</p>
      <button
        type="button"
        onClick={retry}
        className="mt-4 inline-flex items-center gap-2 rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm font-medium text-rose-800 hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-100 dark:hover:bg-rose-900/50"
      >
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        إعادة المحاولة
      </button>
    </section>
  );
}

export default function ContentDutyPage() {
  const { managers, day, hour, isLoading, isError, retry } = useContentDuty();
  const [manualDay, setManualDay] = useState<number | null>(null);
  const selectedDay = manualDay ?? day;
  const segments = useMemo(() => dutySegments(managers, selectedDay), [managers, selectedDay]);

  return (
    <DashboardLayout>
      <main dir="rtl" className="mx-auto w-full max-w-[1440px] space-y-5 pb-24 sm:space-y-6 sm:pb-10">
        <DashboardPageHeader
          icon={CalendarDays}
          title="جدول المناوبات"
          description="فترات مديري المحتوى في غرفة الأخبار — بتوقيت الرياض"
          actions={
            <Link
              href="/dashboard"
              className="inline-flex items-center rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              العودة إلى لوحة التحكم
            </Link>
          }
        />

        {isLoading ? (
          <PageLoading />
        ) : isError ? (
          <PageError retry={retry} />
        ) : (
          <>
            <nav
              aria-label="اختر يومًا"
              className="grid grid-cols-7 gap-1 rounded-2xl border border-slate-200/80 bg-white p-2 shadow-sm dark:border-slate-700/60 dark:bg-slate-900 sm:gap-2"
            >
              {dutyDays.map((label, index) => {
                const selected = index === selectedDay;
                return (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setManualDay(index)}
                    className={`rounded-xl px-1 py-2.5 text-[11px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 sm:px-3 sm:text-sm ${
                      selected
                        ? "bg-[#112d40] text-white shadow-sm"
                        : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </nav>

            <div className="space-y-5">
              <TimelineChart
                managers={managers}
                segments={segments}
                hour={hour}
                selectedDay={selectedDay}
                isToday={selectedDay === day}
              />
              <HandoverList
                managers={managers}
                segments={segments}
                hour={hour}
                selectedDay={selectedDay}
                isToday={selectedDay === day}
              />
            </div>
          </>
        )}
      </main>
    </DashboardLayout>
  );
}
