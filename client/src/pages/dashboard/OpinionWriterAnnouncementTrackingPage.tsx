// متابعة إعلان واحد بالأسماء: كم كاتباً وصله، ومن رآه، ومن حمّل/صوّت/فتح، ومتى.
// مع فرز بالحالة (ولخيار الاستطلاع)، وبحث، وتصدير CSV، و«ذكّر من لم يتفاعل» (بريد، مرة في اليوم).
// المسار الخاص feedback-form يعرض من عبّأ نموذج «اهتماماتي ومقترحاتي» ومن لم يعبّئه.

import { useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Download, Loader2, Search } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageShell } from "@/components/dashboard/DashboardPageShell";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { announcementKindMeta, canRemindNow, REMIND_COOLDOWN_MS } from "@shared/opinionWriterAnnouncements";
import { neutralizeSpreadsheetCell, opinionWriterInterestLabel } from "@shared/opinionWriterFeedback";
import { ADMIN_ANNOUNCEMENTS_KEY, formatArDate, type AdminAnnouncement } from "./OpinionWriterAnnouncementsAdminPage";

type TrackingRow = {
  userId: string;
  name: string;
  email: string | null;
  interests: string[];
  status: "acted" | "seen" | "none";
  seenAt: string | null;
  actedAt: string | null;
  actedCount: number;
  vote: number | null;
};

type AnnouncementTracking = { announcement?: AdminAnnouncement; rows?: TrackingRow[] };
type FormTracking = { rows?: TrackingRow[]; writersTotal?: number; filled?: number };

function csvCell(value: string): string {
  return `"${neutralizeSpreadsheetCell(value).replace(/"/g, '""')}"`;
}

function relativeOrDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });
  const day = d.toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });
  const time = d.toLocaleTimeString("ar", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Riyadh", numberingSystem: "latn" });
  return day === today ? `اليوم ${time}` : formatArDate(iso, true);
}

export default function OpinionWriterAnnouncementTrackingPage() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/dashboard/opinion-writer-announcements/:id");
  const id = params?.id ?? "";
  const isForm = id === "feedback-form";
  const { toast } = useToast();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const trackingKey = isForm
    ? ["/api/admin/opinion-writer-announcements/feedback-form/tracking"]
    : [`/api/admin/opinion-writer-announcements/${id}/tracking`];
  const { data, isLoading, isError } = useQuery<(AnnouncementTracking & FormTracking) | null>({
    queryKey: trackingKey,
    enabled: Boolean(id),
    staleTime: 15_000,
  });
  const rows = Array.isArray(data?.rows) ? data!.rows! : [];
  const a = data?.announcement;
  const meta = isForm
    ? { label: "نموذج", actionLabel: "عبّأوه", pendingLabel: "لم يعبّئوه" }
    : announcementKindMeta(a?.kind ?? "note");
  const total = rows.length;
  const actedN = rows.filter((r) => r.status === "acted").length;
  const seenOnlyN = rows.filter((r) => r.status === "seen").length;
  const noneN = rows.filter((r) => r.status === "none").length;
  const seenN = actedN + seenOnlyN;
  const pendingN = total - actedN;
  const isPoll = a?.kind === "poll";

  const remind = useMutation({
    mutationFn: () => apiRequest(`/api/admin/opinion-writer-announcements/${id}/remind`, { method: "POST" }),
    onSuccess: (res: unknown) => {
      const n = (res as { recipients?: number } | null)?.recipients ?? pendingN;
      toast({ title: `يُرسل التذكير إلى ${n} كاتبًا`, description: "بالبريد، خلال دقيقتين تقريباً" });
      qc.invalidateQueries({ queryKey: trackingKey });
      qc.invalidateQueries({ queryKey: ADMIN_ANNOUNCEMENTS_KEY });
    },
    onError: (err: Error) => toast({ title: "تعذر إرسال التذكير", description: err.message, variant: "destructive" }),
  });

  const remindAllowed = !isForm && a?.active && canRemindNow(a?.lastRemindedAt) && pendingN > 0;
  const nextRemind = a?.lastRemindedAt && !canRemindNow(a.lastRemindedAt)
    ? new Date(new Date(a.lastRemindedAt).getTime() + REMIND_COOLDOWN_MS).toISOString()
    : null;

  const filters: Array<[string, string, number]> = [
    ["all", "الكل", total],
    ["acted", meta.actionLabel, actedN],
    ...(isForm ? [] : ([["seen", `رأوه و${meta.pendingLabel}`, seenOnlyN]] as Array<[string, string, number]>)),
    ["none", isForm ? meta.pendingLabel : "لم يروه", noneN],
    ...(isPoll && a ? a.pollOptions.map((o, i) => [`opt-${i}`, o, a.pollCounts?.[i] ?? 0] as [string, string, number]) : []),
  ];

  const visible = useMemo(() => {
    const q = search.trim();
    return rows.filter((r) => {
      if (filter === "acted" && r.status !== "acted") return false;
      if (filter === "seen" && r.status !== "seen") return false;
      if (filter === "none" && r.status !== "none") return false;
      if (filter.startsWith("opt-") && r.vote !== Number(filter.slice(4))) return false;
      if (q && !`${r.name} ${r.email ?? ""}`.includes(q)) return false;
      return true;
    });
  }, [rows, filter, search]);

  const statusLabel = (r: TrackingRow) => {
    if (r.status === "acted") {
      if (isPoll && a && r.vote !== null) return `صوّت: ${a.pollOptions[r.vote] ?? ""}`;
      if (isForm) return "عبّأه";
      return a?.kind === "file" ? "حمّله" : a?.kind === "link" ? "فتحه" : "اطّلع عليه";
    }
    if (r.status === "seen") return `رآه ولم ${isPoll ? "يصوّت" : a?.kind === "file" ? "يحمّله" : "يتفاعل"}`;
    return isForm ? "لم يعبّئه" : "لم يره بعد";
  };

  const exportCsv = () => {
    const header = ["الاسم", "البريد", "الاهتمامات", "الحالة", "وقت الرؤية", "وقت التفاعل", "المرات"];
    const lines = visible.map((r) =>
      [
        r.name,
        r.email ?? "",
        r.interests.map(opinionWriterInterestLabel).join("، "),
        statusLabel(r),
        r.seenAt ?? "",
        r.actedAt ?? "",
        String(r.actedCount),
      ]
        .map(csvCell)
        .join(","),
    );
    const blob = new Blob(["﻿" + [header.map(csvCell).join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `announcement-${isForm ? "feedback-form" : id}-${filter}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const title = isForm ? "اهتماماتك ومقترحاتك" : a?.title ?? "";
  const subtitle = isForm
    ? "نموذج تلقائي · يظهر لكل كاتب لم يعبّئه"
    : a
      ? `${meta.label}${a.file ? " PDF" : ""} · أُعلن ${formatArDate(a.createdAt, true)} · ${a.active ? `يظهر حتى ${formatArDate(a.expiresAt)}` : "انتهى"}`
      : "";

  return (
    <DashboardLayout>
      <DashboardPageShell maxWidthClassName="max-w-5xl" contentClassName="px-4 pb-16 sm:px-6">
        <div className="flex flex-col gap-4 pt-2" dir="rtl">
          <div>
            <button
              type="button"
              onClick={() => navigate("/dashboard/opinion-writer-announcements")}
              className="flex items-center gap-1 text-[13px] text-[#55667A] hover:text-[#0B6FA8]"
            >
              <ArrowRight className="h-4 w-4" /> إعلانات كتّاب الرأي
            </button>
            <h1 className="mt-1 text-2xl font-bold text-[#1B2B3A] sm:text-[28px]" data-testid="text-tracking-title">
              {title}
            </h1>
            <p className="m-0 mt-1 text-[13px] text-[#55667A]">{subtitle}</p>
          </div>

          {isLoading ? (
            <p className="flex items-center justify-center gap-2 py-16 text-sm text-[#55667A]">
              <Loader2 className="h-4 w-4 animate-spin" /> جارٍ التحميل…
            </p>
          ) : isError || (!isForm && !a) ? (
            <p className="py-16 text-center text-sm text-[#BF3038]">تعذر جلب المتابعة، أو الإعلان غير موجود.</p>
          ) : (
            <>
              <section className="flex flex-wrap items-center justify-between gap-5 rounded-[22px] border border-white bg-gradient-to-br from-[#E2F2FD] to-[#EEF1FE] p-5">
                <div className="flex flex-wrap items-center">
                  <div className="px-4 text-center">
                    <p className="m-0 text-3xl font-bold tabular-nums">{total}</p>
                    <p className="m-0 text-[13px] text-[#55667A]">كاتب وصله الإعلان</p>
                  </div>
                  {!isForm ? (
                    <>
                      <span className="text-xl text-[#8CCBF2]" aria-hidden="true">←</span>
                      <div className="px-4 text-center">
                        <p className="m-0 text-3xl font-bold tabular-nums">{seenN}</p>
                        <p className="m-0 text-[13px] text-[#55667A]">رأوه في لوحتهم</p>
                      </div>
                    </>
                  ) : null}
                  <span className="text-xl text-[#8CCBF2]" aria-hidden="true">←</span>
                  <div className="px-4 text-center">
                    <p className="m-0 text-3xl font-bold tabular-nums text-[#1E9BE6]" data-testid="stat-acted">{actedN}</p>
                    <p className="m-0 text-[13px] text-[#55667A]">
                      {meta.actionLabel} ({total ? Math.round((actedN / total) * 100) : 0}%)
                    </p>
                  </div>
                </div>
                {!isForm ? (
                  <div className="flex flex-col items-start gap-1.5">
                    <button
                      type="button"
                      disabled={!remindAllowed || remind.isPending}
                      onClick={() => remind.mutate()}
                      className="flex h-11 items-center gap-2 rounded-full bg-[#1E9BE6] px-5 text-sm font-bold text-white shadow-[0_6px_16px_rgba(30,155,230,0.3)] hover:bg-[#1789CE] disabled:opacity-50 disabled:shadow-none"
                      data-testid="button-remind"
                    >
                      {remind.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      ذكّر {pendingN} {meta.pendingLabel}
                    </button>
                    <span className="text-xs text-[#55667A]">
                      {!a?.active
                        ? "الإعلان منتهٍ"
                        : nextRemind
                          ? `أُرسل تذكير ${relativeOrDate(a!.lastRemindedAt)} · يمكن التذكير مجدداً ${relativeOrDate(nextRemind)}`
                          : "يصلهم بريد، ويظهر «تذكير» على الإعلان في لوحتهم. مرة في اليوم على الأكثر"}
                    </span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => navigate("/dashboard/opinion-writer-feedback")}
                    className="h-11 rounded-full bg-white px-5 text-sm font-semibold text-[#0B6FA8] hover:bg-[#F4F7FB]"
                  >
                    الردود مفروزة حسب الاهتمام
                  </button>
                )}
              </section>

              <section className="overflow-hidden rounded-[22px] bg-white shadow-[0_1px_3px_rgba(27,43,58,0.06)]">
                <div className="flex flex-wrap items-center justify-between gap-2.5 px-5 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    {filters.map(([fid, label, n]) => (
                      <button
                        key={fid}
                        type="button"
                        aria-pressed={filter === fid}
                        onClick={() => setFilter(fid)}
                        data-testid={`tracking-filter-${fid}`}
                        className={cn(
                          "h-10 rounded-full px-3.5 text-[13px] transition-colors",
                          filter === fid ? "bg-[#1E9BE6] font-semibold text-white" : "border border-[#EEF2F6] bg-white text-[#1B2B3A] hover:bg-[#F4F7FB]",
                        )}
                      >
                        {label} {n}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <div className="relative">
                      <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8A99A8]" />
                      <input
                        type="search"
                        aria-label="بحث بالاسم"
                        placeholder="بحث بالاسم"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="h-10 w-44 rounded-full border border-[#EEF2F6] bg-[#F9FBFD] pr-9 pl-3 text-[13px] outline-none focus:border-[#1E9BE6]"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={exportCsv}
                      disabled={!visible.length}
                      className="flex h-10 items-center gap-1.5 rounded-full bg-[#F4F7FB] px-3.5 text-[13px] text-[#1B2B3A] hover:bg-[#EAF0F6] disabled:opacity-50"
                    >
                      <Download className="h-3.5 w-3.5" /> CSV
                    </button>
                  </div>
                </div>
                <div className="hidden grid-cols-[minmax(0,1fr)_170px_190px] gap-3 border-b border-[#EEF2F6] px-5 py-1.5 text-xs text-[#55667A] md:grid">
                  <span>الكاتب</span>
                  <span>الحالة</span>
                  <span>الوقت</span>
                </div>
                {visible.length === 0 ? (
                  <p className="px-5 py-10 text-center text-sm text-[#55667A]">لا أحد في هذا الفرز.</p>
                ) : (
                  visible.map((r) => (
                    <div
                      key={r.userId}
                      className="grid grid-cols-1 gap-1 border-b border-[#EEF2F6] px-5 py-3 text-sm last:border-b-0 md:grid-cols-[minmax(0,1fr)_170px_190px] md:items-center md:gap-3"
                      data-testid={`tracking-row-${r.userId}`}
                    >
                      <span className="min-w-0">
                        <b className="font-semibold">{r.name}</b>
                        {r.interests.length ? (
                          <span className="text-[13px] text-[#55667A]"> · {r.interests.slice(0, 3).map(opinionWriterInterestLabel).join("، ")}</span>
                        ) : null}
                      </span>
                      <span
                        className={cn(
                          "justify-self-start rounded-full px-2.5 py-0.5 text-xs font-semibold",
                          r.status === "acted" ? "bg-[#E8F6EF] text-[#13734E]" : "bg-[#FFF6E5] text-[#946000]",
                        )}
                      >
                        {statusLabel(r)}
                      </span>
                      <span className="text-[13px] text-[#55667A]">
                        {r.actedAt
                          ? `${relativeOrDate(r.actedAt)}${r.actedCount > 1 && !isPoll ? ` · ${r.actedCount} مرات` : ""}`
                          : r.seenAt
                            ? `رآه ${relativeOrDate(r.seenAt)}`
                            : "—"}
                      </span>
                    </div>
                  ))
                )}
              </section>
            </>
          )}
        </div>
      </DashboardPageShell>
    </DashboardLayout>
  );
}
