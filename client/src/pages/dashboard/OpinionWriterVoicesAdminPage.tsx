// أصوات كتّاب الرأي («صوتي») للمسؤول ومدير النظام فقط: من سجّل، وحالة صوته، وتاريخ الموافقة.
// تشغيل التسجيل الأصلي متاح هنا فقط ويُسجَّل في سجل النشاط.
import { useQuery } from "@tanstack/react-query";
import { Mic, Play } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageShell } from "@/components/dashboard/DashboardPageShell";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { apiUrl } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

type AdminVoiceRow = {
  userId: string;
  name: string;
  status: "processing" | "ready" | "failed" | "deleted" | "none";
  consentedAt: string | null;
  readyAt: string | null;
  consentWithdrawnAt: string | null;
  sampleSeconds: number | null;
  hasSample: boolean;
  updatedAt: string;
};

const STATUS: Record<AdminVoiceRow["status"], { label: string; cls: string }> = {
  ready: { label: "جاهز", cls: "bg-[#E5F6EE] text-[#1F7A55]" },
  processing: { label: "قيد التجهيز", cls: "bg-[#E6F4FD] text-[#0B6FA8]" },
  failed: { label: "تعذر التجهيز", cls: "bg-[#FDF3E2] text-[#8A5A12]" },
  deleted: { label: "سحب موافقته", cls: "bg-[#F1F4F8] text-[#55667A]" },
  none: { label: "لم يسجّل", cls: "bg-[#F1F4F8] text-[#55667A]" },
};

function fmt(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("ar", { day: "numeric", month: "short", year: "numeric", numberingSystem: "latn" });
  } catch {
    return "—";
  }
}

export default function OpinionWriterVoicesAdminPage() {
  const { data, isLoading, isError } = useQuery<{ voices?: AdminVoiceRow[] }>({ queryKey: ["/api/admin/opinion-writer-voices"] });
  const rows = Array.isArray(data?.voices) ? data.voices : [];
  const readyCount = rows.filter((r) => r.status === "ready").length;

  return (
    <DashboardLayout>
      <DashboardPageShell maxWidthClassName="max-w-4xl" contentClassName="px-4 pb-16 sm:px-6">
        <DashboardPageHeader
          icon={Mic}
          title="أصوات كتّاب الرأي"
          description="من سجّل صوته في «صوتي» وحالته. الصوت لمقالات صاحبه فقط وباختياره."
          titleTestId="text-admin-writer-voices-title"
        />
        <section className="rounded-[20px] bg-white shadow-[0_1px_3px_rgba(27,43,58,0.06)] dark:bg-card">
          <div className="flex items-center justify-between border-b border-[#EEF2F6] px-5 py-3.5 dark:border-border">
            <span className="text-sm text-[#55667A]">أصوات جاهزة</span>
            <span className="text-2xl font-bold tabular-nums text-[#1E9BE6]">{readyCount}</span>
          </div>
          {isLoading ? <p className="px-5 py-6 text-sm text-[#6B7C8F]">جارٍ التحميل…</p> : null}
          {isError ? <p className="px-5 py-6 text-sm text-[#C0392B]">تعذر جلب القائمة.</p> : null}
          {!isLoading && !isError && rows.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-[#6B7C8F]">لم يسجّل أي كاتب صوته بعد. تظهر هنا الأسماء حين يبدأ الكتّاب من صفحة «صوتي».</p>
          ) : null}
          {rows.map((r) => (
            <div key={r.userId} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-[#EEF2F6] px-5 py-3.5 last:border-b-0 dark:border-border">
              <div className="min-w-0 flex-1">
                <b className="block font-semibold">{r.name}</b>
                <span className="text-[13px] text-[#6B7C8F]">
                  {r.status === "deleted" ? `سحب موافقته ${fmt(r.consentWithdrawnAt)}` : `وافق ${fmt(r.consentedAt)}`}
                  {r.sampleSeconds ? <> · <span className="tabular-nums" dir="ltr">{r.sampleSeconds}s</span></> : null}
                </span>
              </div>
              <span className={cn("rounded-full px-3 py-0.5 text-[13px] font-semibold", STATUS[r.status].cls)}>{STATUS[r.status].label}</span>
              {r.hasSample ? (
                <a href={apiUrl(`/api/admin/opinion-writer-voices/${encodeURIComponent(r.userId)}/sample`)} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[13px] text-[#0B6FA8]">
                  <Play className="h-3.5 w-3.5" /> التسجيل
                </a>
              ) : null}
            </div>
          ))}
        </section>
      </DashboardPageShell>
    </DashboardLayout>
  );
}
