import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DutyShiftView } from "@/components/dashboard/content-duty/DutyShiftView";
import { DutyTeamView } from "@/components/dashboard/content-duty/DutyTeamView";
import { DutyRosterView } from "@/components/dashboard/content-duty/DutyRosterView";
import { useContentDutyRoom, useContentDutyRoster, useContentDutyTeam } from "@/hooks/useContentDuty";
import { dutyErrorMessage } from "@/lib/contentDuty";

type Tab = "shift" | "team" | "roster";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "shift", label: "الوردية" },
  { id: "team", label: "أداء الأسبوع" },
  { id: "roster", label: "الجدول" },
];

function Loading({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label={label}>
      <div className="h-[220px] animate-pulse rounded-[22px] bg-[#EEF4FA]" />
      <div className="h-[160px] animate-pulse rounded-[22px] bg-[#EEF4FA]" />
    </div>
  );
}

function ErrorBox({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <section role="alert" className="rounded-[22px] bg-white p-6 shadow-[0_1px_4px_rgba(27,43,58,.06)]">
      <h2 className="m-0 text-base font-bold text-[#BF3038]">تعذر تحميل المناوبة</h2>
      <p className="mt-1 text-sm text-[#55667A]">{dutyErrorMessage(error)}</p>
      <button
        type="button"
        onClick={retry}
        className="mt-4 inline-flex h-10 items-center gap-2 rounded-full bg-[#E6F4FD] px-4 text-sm font-semibold text-[#0B6FA8] hover:bg-[#D6ECFB]"
      >
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        إعادة المحاولة
      </button>
    </section>
  );
}

export default function ContentDutyPage() {
  const [tab, setTab] = useState<Tab>("shift");
  const [shiftKey, setShiftKey] = useState<string | null>(null);
  const [week, setWeek] = useState<string | null>(null);

  // الجدول متاح لكل الموظفين، ومنه نعرف مستوى الصلاحية قبل طلب أرقام الأداء.
  const roster = useContentDutyRoster(week, true);
  const access = roster.data?.access ?? null;
  const canSeeNumbers = access === "lead" || access === "manager";
  const activeTab: Tab = canSeeNumbers ? tab : "roster";

  const room = useContentDutyRoom(shiftKey, canSeeNumbers && activeTab === "shift");
  const team = useContentDutyTeam(canSeeNumbers && activeTab === "team");

  const tabs = canSeeNumbers ? TABS : TABS.filter((t) => t.id === "roster");
  const options = room.data?.options ?? [];

  return (
    <DashboardLayout>
      <main dir="rtl" className="mx-auto flex w-full max-w-[1280px] flex-col gap-5 pb-24 text-[#1B2B3A] sm:pb-10">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="m-0 text-2xl font-bold">المناوبة الآن</h1>
            <p className="mt-1 text-sm text-[#55667A]">حضور مديري المحتوى وإنتاجهم والمواد المنتظرة، بتوقيت الرياض</p>
          </div>
          {tabs.length > 1 ? (
            <nav aria-label="أقسام غرفة المناوبة" className="flex gap-1 rounded-full bg-white p-1 shadow-[0_1px_4px_rgba(27,43,58,.06)]">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={activeTab === t.id}
                  onClick={() => setTab(t.id)}
                  className={`h-9 rounded-full px-4 text-sm font-semibold transition ${activeTab === t.id ? "bg-[#1E9BE6] text-white" : "text-[#55667A] hover:bg-[#F1F6FB]"}`}
                >
                  {t.label}
                </button>
              ))}
            </nav>
          ) : null}
        </header>

        {roster.isLoading ? (
          <Loading label="جار تحميل المناوبة" />
        ) : roster.isError || !roster.data ? (
          <ErrorBox error={roster.error} retry={() => roster.refetch()} />
        ) : activeTab === "shift" ? (
          <>
            {options.length > 1 ? (
              <label className="flex flex-wrap items-center gap-2 text-sm text-[#55667A]">
                الوردية
                <select
                  value={room.data?.shift?.key ?? shiftKey ?? ""}
                  onChange={(e) => setShiftKey(e.target.value || null)}
                  className="h-10 rounded-full border border-[#DCE5EE] bg-white px-4 text-sm text-[#1B2B3A]"
                >
                  {options.map((o) => (
                    <option key={o.key} value={o.key}>{o.live ? `الآن · ${o.label}` : o.label}</option>
                  ))}
                </select>
              </label>
            ) : null}
            {room.isLoading ? (
              <Loading label="جار تحميل الوردية" />
            ) : room.isError || !room.data ? (
              <ErrorBox error={room.error} retry={() => room.refetch()} />
            ) : room.data.shift ? (
              <DutyShiftView room={room.data} />
            ) : (
              <section className="rounded-[22px] bg-white p-6 text-sm text-[#55667A] shadow-[0_1px_4px_rgba(27,43,58,.06)]">
                لا وردية لعرضها الآن. أضف الورديات من تبويب «الجدول».
              </section>
            )}
          </>
        ) : activeTab === "team" ? (
          team.isLoading ? (
            <Loading label="جار تحميل أداء الأسبوع" />
          ) : team.isError || !team.data ? (
            <ErrorBox error={team.error} retry={() => team.refetch()} />
          ) : (
            <DutyTeamView team={team.data} />
          )
        ) : (
          <DutyRosterView roster={roster.data} onWeek={setWeek} />
        )}
      </main>
    </DashboardLayout>
  );
}
