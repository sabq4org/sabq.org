// طلبات تسجيل الناشرين (/dashboard/admin/publisher-applications) — النموذج المعتمد 2026-11-18:
// https://claude.ai/artifact/JS7f3BUNPNyyz8eNxR8ShB
// القبول ينشئ حساب «ناشر» ويرسل كلمة مرور مؤقتة؛ الرفض يتطلب سببًا يصل للوكالة.
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageShell } from "@/components/dashboard/DashboardPageShell";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { publisherApplicationRef } from "@shared/publisherApplications";
import { Check, Inbox, Link2, Loader2, X } from "lucide-react";
import { displayTimeZone } from "@/lib/displayTimeZone";

type Application = {
  id: string;
  agencyName: string;
  agencyNameEn: string | null;
  contactPerson: string;
  contactPersonEn: string | null;
  email: string;
  phoneNumber: string;
  logoUrl: string;
  commercialRegistration: string | null;
  taxNumber: string | null;
  address: string | null;
  loginFirstName: string;
  loginLastName: string;
  loginEmail: string;
  status: "pending" | "approved" | "rejected";
  reviewNotes: string | null;
  reviewedAt: string | null;
  reviewerName: string | null;
  createdPublisherId: string | null;
  createdAt: string;
  loginEmailInUse: boolean;
};

type ListResponse = {
  applications: Application[];
  counts: { pending: number; approved: number; rejected: number };
};

const QUERY_KEY = ["/api/admin/publisher-applications"];

const dateFmt = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: displayTimeZone(),
});
const fmt = (iso: string | null) => (iso ? dateFmt.format(new Date(iso)) : "");

function oneYearFromToday(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between gap-3 py-1 text-sm text-[#1B2B3A]"
    >
      <span>{label}</span>
      <span className={`relative inline-block h-[26px] w-11 rounded-full transition ${checked ? "bg-[#1E9BE6]" : "bg-[#DCE4EC]"}`}>
        <span className={`absolute top-[3px] h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-[3px]" : "left-[21px]"}`} />
      </span>
    </button>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 border-b border-[#EEF2F6] py-3 text-sm last:border-b-0">
      <span className="text-[#55667A]">{label}</span>
      <span className="min-w-0 break-words text-[#1B2B3A]">{children}</span>
    </div>
  );
}

function LogoBox({ app, size }: { app: Application; size: number }) {
  const [broken, setBroken] = useState(false);
  if (broken || !app.logoUrl) {
    return (
      <span
        style={{ width: size, height: size }}
        className="flex shrink-0 items-center justify-center rounded-[14px] bg-[#E6F4FD] font-bold text-[#0B6FA8]"
      >
        {app.agencyName.trim().charAt(0)}
      </span>
    );
  }
  return (
    <img
      src={app.logoUrl}
      alt={`شعار ${app.agencyName}`}
      style={{ width: size, height: size }}
      className="shrink-0 rounded-[14px] border border-[#EEF2F6] bg-white object-contain p-1"
      onError={() => setBroken(true)}
    />
  );
}

export default function AdminPublisherApplications() {
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [publishingEndsAt, setPublishingEndsAt] = useState(oneYearFromToday());
  const [autoPublish, setAutoPublish] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [notes, setNotes] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  useEffect(() => {
    document.title = "طلبات تسجيل الناشرين | سبق";
  }, []);

  const { data: dataRaw, isLoading, isError } = useQuery<ListResponse | null>({ queryKey: QUERY_KEY });
  const applications = Array.isArray(dataRaw?.applications) ? dataRaw!.applications : [];
  const counts = dataRaw?.counts ?? { pending: 0, approved: 0, rejected: 0 };
  const pending = applications.filter((a) => a.status === "pending");
  const reviewed = applications.filter((a) => a.status !== "pending");

  const selected = useMemo(
    () => applications.find((a) => a.id === selectedId) ?? pending[0] ?? reviewed[0] ?? null,
    [applications, pending, reviewed, selectedId],
  );

  useEffect(() => {
    setPublishingEndsAt(oneYearFromToday());
    setAutoPublish(false);
    setIsActive(true);
    setNotes("");
    setRejecting(false);
    setReason("");
  }, [selected?.id]);

  const approve = useMutation({
    mutationFn: (id: string) =>
      apiRequest<{ message: string; emailSent: boolean }>(`/api/admin/publisher-applications/${id}/approve`, {
        method: "POST",
        body: JSON.stringify({ publishingEndsAt, autoPublish, isActive, notes }),
      }),
    onSuccess: (res) => {
      toast({ title: res.message, variant: res.emailSent ? "default" : "destructive" });
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/publishers"] });
    },
    onError: (e: Error) => toast({ title: "تعذر القبول", description: e.message, variant: "destructive" }),
  });

  const reject = useMutation({
    mutationFn: (id: string) =>
      apiRequest<{ message: string }>(`/api/admin/publisher-applications/${id}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    onSuccess: (res) => {
      toast({ title: res.message });
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (e: Error) => toast({ title: "تعذر الرفض", description: e.message, variant: "destructive" }),
  });

  const copyLink = async () => {
    const url = `${window.location.origin}/publisher/register`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "نُسخ رابط التسجيل", description: url });
    } catch {
      toast({ title: "رابط التسجيل", description: url });
    }
  };

  const busy = approve.isPending || reject.isPending;

  const card = (app: Application) => {
    const active = selected?.id === app.id;
    return (
      <button
        key={app.id}
        type="button"
        onClick={() => setSelectedId(app.id)}
        className={`flex w-full items-center gap-3 rounded-[18px] bg-white px-4 py-3.5 text-right transition ${
          active
            ? "shadow-[0_0_0_2px_#1E9BE6,0_6px_16px_rgba(30,155,230,.18)]"
            : "shadow-[0_2px_12px_rgba(27,43,58,.06)] hover:shadow-[0_0_0_1px_#BFE2F8]"
        }`}
        data-testid={`application-${app.id}`}
      >
        <LogoBox app={app} size={44} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[15px] font-semibold text-[#1B2B3A]">{app.agencyName}</span>
          <span className="truncate text-xs text-[#617183]">
            {app.contactPerson} · {fmt(app.createdAt)}
          </span>
        </span>
        {app.status === "pending" ? (
          <span className="shrink-0 rounded-full bg-[#FFF6E5] px-2.5 py-1 text-xs text-[#946000]">جديد</span>
        ) : app.status === "approved" ? (
          <span className="shrink-0 rounded-full bg-[#E8F6EF] px-2.5 py-1 text-xs text-[#13734E]">مقبول</span>
        ) : (
          <span className="shrink-0 rounded-full bg-[#F4F7FB] px-2.5 py-1 text-xs text-[#55667A]">مرفوض</span>
        )}
      </button>
    );
  };

  return (
    <DashboardLayout>
      <DashboardPageShell maxWidthClassName="max-w-[1400px]" contentClassName="px-4 pb-12 sm:px-6">
        <div dir="rtl" className="flex flex-col gap-5 text-[#1B2B3A]">
          <div className="flex flex-wrap items-end justify-between gap-3 pt-2">
            <div className="flex flex-col gap-1">
              <span className="text-[13px] text-[#55667A]">الناشرون</span>
              <h1 className="m-0 text-[28px] font-bold">طلبات التسجيل</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[#FFF6E5] px-3.5 py-1.5 text-[13px] font-semibold text-[#946000]">
                {counts.pending} بانتظارك
              </span>
              <span className="rounded-full bg-[#E8F6EF] px-3.5 py-1.5 text-[13px] text-[#13734E]">{counts.approved} مقبولة</span>
              <span className="rounded-full bg-white px-3.5 py-1.5 text-[13px] text-[#55667A] shadow-[0_2px_8px_rgba(27,43,58,.06)]">
                {counts.rejected} مرفوضة
              </span>
              <button
                type="button"
                onClick={copyLink}
                className="flex h-10 items-center gap-1.5 rounded-full bg-[#E6F4FD] px-4 text-sm font-semibold text-[#0B6FA8]"
                data-testid="button-copy-register-link"
              >
                <Link2 className="h-4 w-4" />
                نسخ رابط التسجيل
              </button>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 py-16 text-[#55667A]">
              <Loader2 className="h-5 w-5 animate-spin" /> جارٍ التحميل
            </div>
          ) : isError ? (
            <div className="rounded-[18px] bg-[#FDECEC] px-4 py-3 text-sm text-[#BF3038]">تعذر جلب الطلبات. حدّث الصفحة.</div>
          ) : applications.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-[22px] bg-white px-6 py-14 text-center shadow-[0_2px_12px_rgba(27,43,58,.06)]">
              <span className="flex h-14 w-14 items-center justify-center rounded-[16px] bg-[#E6F4FD]">
                <Inbox className="h-7 w-7 text-[#1E9BE6]" />
              </span>
              <span className="text-[17px] font-semibold">لا توجد طلبات بعد</span>
              <span className="max-w-sm text-sm text-[#55667A]">أرسل رابط التسجيل للوكالات، وستظهر طلباتها هنا للمراجعة.</span>
            </div>
          ) : (
            <div className="flex flex-col items-start gap-5 lg:flex-row">
              <div className="flex w-full flex-col gap-2.5 lg:w-[380px] lg:shrink-0">
                {pending.map(card)}
                {pending.length === 0 ? (
                  <div className="rounded-[18px] bg-white px-4 py-3.5 text-sm text-[#55667A] shadow-[0_2px_12px_rgba(27,43,58,.06)]">
                    لا طلبات بانتظارك الآن.
                  </div>
                ) : null}
                {reviewed.length ? <span className="px-1 pt-2.5 text-[13px] text-[#55667A]">تمت مراجعتها</span> : null}
                {reviewed.map(card)}
              </div>

              {selected ? (
                <div className="flex w-full min-w-0 flex-1 flex-col gap-4">
                  <div className="flex flex-wrap items-center gap-5 rounded-[22px] bg-white p-6 shadow-[0_2px_12px_rgba(27,43,58,.06)]">
                    <LogoBox app={selected} size={112} />
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <h2 className="m-0 text-[22px] font-bold">{selected.agencyName}</h2>
                      {selected.agencyNameEn ? (
                        <span dir="ltr" className="text-right text-sm text-[#55667A]">
                          {selected.agencyNameEn}
                        </span>
                      ) : null}
                      <div className="mt-1.5 flex flex-wrap gap-3.5 text-[13px]">
                        <a href={selected.logoUrl} target="_blank" rel="noreferrer" className="text-[#0B6FA8] hover:underline">
                          فتح الشعار بالحجم الكامل
                        </a>
                        <span className="text-[#617183]" dir="ltr">
                          {publisherApplicationRef(selected.id)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-start gap-4 xl:flex-row">
                    <div className="w-full min-w-0 flex-1 rounded-[22px] bg-white px-5 py-1.5 shadow-[0_2px_12px_rgba(27,43,58,.06)]">
                      <Row label="الشخص المسؤول">
                        {selected.contactPerson}
                        {selected.contactPersonEn ? <> · <span dir="ltr">{selected.contactPersonEn}</span></> : null}
                      </Row>
                      <Row label="البريد"><span dir="ltr">{selected.email}</span></Row>
                      <Row label="الجوال"><span dir="ltr">{selected.phoneNumber}</span></Row>
                      <Row label="السجل التجاري"><span dir="ltr">{selected.commercialRegistration || "—"}</span></Row>
                      <Row label="الرقم الضريبي"><span dir="ltr">{selected.taxNumber || "—"}</span></Row>
                      <Row label="العنوان">{selected.address || "—"}</Row>
                      <Row label="حساب الدخول">
                        {selected.loginFirstName} {selected.loginLastName} · <span dir="ltr">{selected.loginEmail}</span>
                      </Row>
                      <Row label="تاريخ الطلب">{fmt(selected.createdAt)}</Row>
                      {selected.status === "pending" ? (
                        <Row label="فحص بريد الدخول">
                          {selected.loginEmailInUse ? (
                            <span className="font-semibold text-[#BF3038]">مستخدم لحساب آخر في سبق</span>
                          ) : (
                            <span className="font-semibold text-[#13734E]">غير مستخدم في سبق</span>
                          )}
                        </Row>
                      ) : null}
                    </div>

                    {selected.status === "pending" ? (
                      <div className="flex w-full flex-col gap-3.5 rounded-[22px] bg-white p-5 shadow-[0_2px_12px_rgba(27,43,58,.06)] xl:w-[330px] xl:shrink-0">
                        {!rejecting ? (
                          <>
                            <span className="text-[15px] font-semibold">إعدادات الحساب عند القبول</span>
                            <label className="flex flex-col gap-1.5 text-[13px] text-[#55667A]">
                              النشر متاح حتى
                              <input
                                type="date"
                                dir="ltr"
                                value={publishingEndsAt}
                                onChange={(e) => setPublishingEndsAt(e.target.value)}
                                className="h-[42px] rounded-[12px] border border-[#DCE4EC] bg-white px-3 text-left text-[#1B2B3A]"
                              />
                              <span className="text-xs">اتركه فارغًا لنشر مفتوح بلا تاريخ انتهاء.</span>
                            </label>
                            <Toggle checked={autoPublish} onChange={setAutoPublish} label="نشر فوري بدون مراجعة" />
                            <Toggle checked={isActive} onChange={setIsActive} label="الحساب نشط" />
                            <label className="flex flex-col gap-1.5 text-[13px] text-[#55667A]">
                              ملاحظات للإدارة
                              <textarea
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                className="h-16 resize-none rounded-[12px] border border-[#DCE4EC] px-3 py-2 text-sm text-[#1B2B3A]"
                              />
                            </label>
                            {selected.loginEmailInUse ? (
                              <span className="rounded-[12px] bg-[#FDECEC] px-3 py-2 text-xs text-[#BF3038]">
                                بريد الدخول مستخدم لحساب آخر، فلن يكتمل القبول. اطلب من الوكالة بريدًا آخر.
                              </span>
                            ) : null}
                            <button
                              type="button"
                              disabled={busy || selected.loginEmailInUse}
                              onClick={() => approve.mutate(selected.id)}
                              className="flex h-[46px] items-center justify-center gap-2 rounded-full bg-[#1E9BE6] text-[15px] font-semibold text-white shadow-[0_6px_16px_rgba(30,155,230,.3)] disabled:opacity-60"
                              data-testid="button-approve"
                            >
                              {approve.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                              قبول وإرسال بيانات الدخول
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => setRejecting(true)}
                              className="h-[42px] rounded-full border border-[#F3C7CA] bg-white text-sm font-semibold text-[#BF3038] disabled:opacity-60"
                              data-testid="button-reject-open"
                            >
                              رفض مع ذكر السبب
                            </button>
                            <span className="text-xs leading-relaxed text-[#617183]">
                              القبول ينشئ حسابًا بدور «ناشر» ويرسل كلمة مرور مؤقتة إلى بريد الدخول. الباقة تُضاف بعدها من صفحة الناشر.
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="text-[15px] font-semibold">سبب الرفض</span>
                            <span className="text-xs text-[#55667A]">يصل السبب إلى الوكالة في رسالة الرفض.</span>
                            <textarea
                              value={reason}
                              onChange={(e) => setReason(e.target.value)}
                              autoFocus
                              className="h-28 resize-none rounded-[12px] border border-[#DCE4EC] px-3 py-2 text-sm"
                              data-testid="input-reject-reason"
                            />
                            <button
                              type="button"
                              disabled={busy || reason.trim().length < 3}
                              onClick={() => reject.mutate(selected.id)}
                              className="flex h-[44px] items-center justify-center gap-2 rounded-full bg-[#BF3038] text-sm font-semibold text-white disabled:opacity-60"
                              data-testid="button-reject-confirm"
                            >
                              {reject.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                              رفض الطلب وإبلاغ الوكالة
                            </button>
                            <button type="button" onClick={() => setRejecting(false)} className="h-10 rounded-full text-sm text-[#55667A]">
                              رجوع
                            </button>
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="flex w-full flex-col gap-2 rounded-[22px] bg-white p-5 text-sm shadow-[0_2px_12px_rgba(27,43,58,.06)] xl:w-[330px] xl:shrink-0">
                        <span className={`font-semibold ${selected.status === "approved" ? "text-[#13734E]" : "text-[#BF3038]"}`}>
                          {selected.status === "approved" ? "تم القبول" : "تم الرفض"}
                        </span>
                        <span className="text-[#55667A]">
                          {fmt(selected.reviewedAt)}
                          {selected.reviewerName ? ` · ${selected.reviewerName}` : ""}
                        </span>
                        {selected.reviewNotes ? <span className="text-[#1B2B3A]">{selected.reviewNotes}</span> : null}
                        {selected.createdPublisherId ? (
                          <a href={`/dashboard/admin/publishers/${selected.createdPublisherId}`} className="text-[#0B6FA8] hover:underline">
                            فتح صفحة الناشر وإضافة الباقة
                          </a>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </DashboardPageShell>
    </DashboardLayout>
  );
}
