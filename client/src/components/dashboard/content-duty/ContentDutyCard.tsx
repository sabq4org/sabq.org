import { Link } from "wouter";
import { CalendarDays, Clock3, RefreshCw } from "lucide-react";
import { useContentDuty } from "@/hooks/useContentDuty";
import { dutyDays, dutySegments, formatDutyHour } from "@/lib/contentDuty";

const MANAGER_PALETTE = ["#7ed6fa", "#f9c781", "#a2adff", "#75e2c4", "#d6a8ff", "#f7a8c4"];

function colorForManager(index: number): string {
  return MANAGER_PALETTE[index % MANAGER_PALETTE.length] ?? "#b6c6d1";
}

function hourLabel(hour: number): string {
  return String(formatDutyHour(hour));
}

function statusLabel(online: boolean | null): string {
  if (online === true) return "متصل باللوحة";
  if (online === false) return "غير متصل باللوحة";
  return "الحالة غير متاحة";
}

function statusClass(online: boolean | null): string {
  if (online === true) return "bg-emerald-400/15 text-emerald-100 ring-emerald-300/30";
  if (online === false) return "bg-white/10 text-slate-200 ring-white/15";
  return "bg-amber-300/10 text-amber-100 ring-amber-200/25";
}

function StatusPill({ online }: { online: boolean | null }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${statusClass(online)}`}
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 rounded-full ${
          online === true ? "bg-emerald-300" : online === false ? "bg-slate-300" : "bg-amber-200"
        }`}
      />
      {statusLabel(online)}
    </span>
  );
}

function LoadingCard() {
  return (
    <section
      aria-busy="true"
      aria-label="جار تحميل جدول المناوبات"
      className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-700/60 dark:bg-slate-900"
    >
      <div className="space-y-5 bg-[#112d40] p-5 sm:p-6">
        <div className="h-4 w-32 animate-pulse rounded bg-white/15" />
        <div className="h-8 w-64 animate-pulse rounded bg-white/15" />
        <div className="space-y-3">
          <div className="h-10 animate-pulse rounded-xl bg-white/10" />
          <div className="h-10 animate-pulse rounded-xl bg-white/10" />
        </div>
      </div>
      <div className="space-y-3 p-5 sm:p-6">
        <div className="h-5 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
        <div className="h-10 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
        <div className="h-10 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
      </div>
    </section>
  );
}

function ErrorCard({ retry }: { retry: () => void }) {
  return (
    <section
      role="alert"
      className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-900 shadow-sm dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-100"
    >
      <p className="font-semibold">تعذر تحميل جدول المناوبات</p>
      <p className="mt-1 text-sm text-rose-800/80 dark:text-rose-100/75">تحقق من الاتصال ثم حاول مجددًا.</p>
      <button
        type="button"
        onClick={retry}
        className="mt-4 inline-flex items-center gap-2 rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm font-medium text-rose-800 transition hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-100 dark:hover:bg-rose-900/50"
      >
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        إعادة المحاولة
      </button>
    </section>
  );
}

export default function ContentDutyCard() {
  const { managers, day, hour, isLoading, isError, retry } = useContentDuty();

  if (isLoading) return <LoadingCard />;
  if (isError) return <ErrorCard retry={retry} />;

  const segments = dutySegments(managers, day);
  const activeManagers = managers.filter((manager) =>
    segments.some(
      (segment) =>
        segment.manager.key === manager.key && hour >= segment.start && hour < Math.min(segment.end, 24),
    ),
  );
  const dayName = dutyDays[day] ?? "اليوم";
  const hasDuty = segments.length > 0;

  return (
    <section
      dir="rtl"
      data-testid="content-duty-card"
      className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-700/60 dark:bg-slate-900"
    >
      <div className="bg-[#112d40] px-5 py-5 text-white sm:px-6 sm:py-6">
        <div className="flex items-center gap-2 text-xs text-[#c2dce7]">
          <Clock3 className="h-4 w-4 text-[#81d4ff]" aria-hidden="true" />
          <span>اليوم · {dayName}</span>
          <span aria-hidden="true">·</span>
          <bdi dir="ltr" className="font-semibold text-[#81d4ff]">
            {hourLabel(hour)}
          </bdi>
          <span>بتوقيت الرياض</span>
        </div>
        <h2 className="mt-3 text-xl font-bold tracking-tight sm:text-2xl">مديرو المحتوى المناوبون الآن</h2>

        {activeManagers.length > 0 ? (
          <div className="mt-5 space-y-2.5">
            {activeManagers.map((manager) => (
              <div
                key={manager.key}
                className="flex flex-wrap items-center justify-between gap-3 border-t border-[#406071] pt-2.5 first:border-t-0 first:pt-0"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: colorForManager(managers.indexOf(manager)) }}
                  />
                  <span className="truncate text-lg font-semibold">{manager.name}</span>
                </div>
                <StatusPill online={manager.online} />
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-xl border border-dashed border-[#628090] bg-white/5 px-4 py-3 text-sm text-[#d6e7ed]">
            لا توجد مناوبة مسجّلة الآن.
          </div>
        )}
      </div>

      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-slate-100">
              <CalendarDays className="h-4 w-4 text-sky-700 dark:text-sky-300" aria-hidden="true" />
              جدول {dayName}
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">الفترات الظاهرة بتوقيت الرياض</p>
          </div>
          <Link href="/dashboard/content-duty" className="rounded text-sm font-semibold text-sky-700 underline underline-offset-4 focus-visible:ring-2 dark:text-sky-300">
            عرض الجدول الأسبوعي
          </Link>
        </div>

        {hasDuty ? (
          <div className="mt-4 divide-y divide-slate-200/80 border-y border-slate-200/80 dark:divide-slate-700/70 dark:border-slate-700/70">
            {segments.map((segment) => {
              const isCurrent = hour >= segment.start && hour < Math.min(segment.end, 24);
              return (
                <div
                  key={`${segment.manager.key}-${segment.start}-${segment.endHour}`}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto_auto]"
                >
                  <b className="min-w-0 truncate text-slate-800 dark:text-slate-200">{segment.manager.name}</b>
                  <span className="period whitespace-nowrap text-slate-600 dark:text-slate-300">
                    من <bdi dir="ltr">{hourLabel(segment.start)}</bdi> إلى{" "}
                    <bdi dir="ltr">{hourLabel(segment.endHour)}</bdi>
                  </span>
                  <span
                    className={`col-span-2 text-xs sm:col-span-1 sm:text-right ${
                      isCurrent ? "font-semibold text-sky-700 dark:text-sky-300" : "text-slate-500 dark:text-slate-400"
                    }`}
                  >
                    {isCurrent
                      ? "جارية الآن"
                      : segment.carry
                        ? "تتمة من اليوم السابق"
                        : segment.overnight
                          ? "تمتد إلى اليوم التالي"
                          : hour >= segment.end ? "انتهت" : "مجدولة"}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-4 rounded-xl bg-slate-50 px-4 py-4 text-sm text-slate-600 dark:bg-slate-800/70 dark:text-slate-300">
            لا توجد فترات مناوبة لهذا اليوم.
          </p>
        )}
      </div>
    </section>
  );
}
