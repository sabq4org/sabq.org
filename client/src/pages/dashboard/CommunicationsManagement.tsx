import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, RefreshCw, ShieldAlert } from "lucide-react";
import type { TrustedEmailSender } from "@shared/schema";
import { DashboardLayout } from "@/components/DashboardLayout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useAuth, hasAnyPermission } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { CommsHero } from "@/components/communications/CommsHero";
import InboxView, { type InboxChannelFilter } from "@/components/communications/InboxView";
import SendersView from "@/components/communications/SendersView";
import WhatsAppTab from "@/components/communications/WhatsAppTab";
import { RotateTokenDialog } from "@/components/communications/RotateTokenDialog";
import { useFailedEmailLogs, useTrustedSenders } from "@/components/communications/commsQueries";
import { describeTokenAge } from "@/components/communications/tokenAge";
import { flowCounts, fromEmailLog } from "@/components/communications/inboxModel";
import { PILL_PLAIN, PILL_PRIMARY, SURFACE } from "@/components/communications/commsUi";

interface WhatsappBadgeStats {
  newMessages: number;
  publishedToday: number;
  draftedToday?: number;
  rejectedToday: number;
}

interface EmailTodayStats {
  emailsReceived: number;
  emailsPublished: number;
  emailsDrafted: number;
  emailsRejected: number;
  emailsFailed: number;
}

type View = "inbox" | "senders" | "whatsapp";

const STATS_REFETCH_MS = 180000;
const WHATSAPP_PREF_ID = "sabq.comms.show-whatsapp";

// البوابات الأربع القديمة (سايدبار / صفحة / بريد / واتساب) كانت متضاربة، فمستخدم
// يملك communications.manage يرى الرابط ثم يصطدم بـ«غير مصرح». المرجع الآن الصلاحيات،
// مع إبقاء الأدوار النصية للحسابات القديمة التي لا تملك مدخلاً في user_roles.
const LEGACY_ROLES = ["admin", "system_admin", "manager"];
// مسارات البريد محروسة بـ admin.manage_settings، ومسارات الواتساب بدور admin/manager.
const EMAIL_PERMISSIONS = ["admin.manage_settings", "communications.manage"];

const todayLabel = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
  timeZone: "Asia/Riyadh",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

function readWhatsappPref(): boolean {
  try {
    return localStorage.getItem(WHATSAPP_PREF_ID) !== "0";
  } catch {
    return true;
  }
}

function AccessDenied({ message }: { message: string }) {
  return (
    <div className={cn(SURFACE, "flex flex-col items-center gap-3 px-6 py-16 text-center")}>
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EEF2F6] text-[#55667A]">
        <ShieldAlert className="h-6 w-6" aria-hidden="true" />
      </span>
      <p className="text-[15px] font-semibold text-[#1B2B3A]">لا تملك صلاحية هذا القسم</p>
      <p className="max-w-sm text-[13px] leading-6 text-[#55667A]">{message}</p>
    </div>
  );
}

export default function CommunicationsManagement() {
  const { user, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const [view, setView] = useState<View>("inbox");
  const [channel, setChannel] = useState<InboxChannelFilter>("all");
  const [whatsappPref, setWhatsappPref] = useState(readWhatsappPref);
  const [addSignal, setAddSignal] = useState(0);
  const [rotatingSender, setRotatingSender] = useState<TrustedEmailSender | null>(null);

  const role = user?.role || "";
  const canUseWhatsapp = !!user && (LEGACY_ROLES.includes(role) || hasAnyPermission(user, ...EMAIL_PERMISSIONS));
  const canUseEmail = !!user && (role === "admin" || role === "system_admin" || hasAnyPermission(user, ...EMAIL_PERMISSIONS));
  const canOpenPage = canUseEmail || canUseWhatsapp;
  const showWhatsapp = canUseWhatsapp && (whatsappPref || !canUseEmail);

  const whatsappStats = useQuery<WhatsappBadgeStats>({
    queryKey: ["/api/whatsapp/badge-stats"],
    enabled: showWhatsapp,
    refetchInterval: STATS_REFETCH_MS,
  });
  const emailStats = useQuery<EmailTodayStats>({
    queryKey: ["/api/email-agent/stats"],
    enabled: canUseEmail,
    refetchInterval: STATS_REFETCH_MS,
  });
  // هذا المسار هو ما يكتشف الرسائل العالقة «قيد المعالجة» ويحوّلها إلى «تعطل» (sweepStuckEmailLogs)،
  // فيبقى مستدعًى عند فتح الصفحة وتحديثها حتى تظهر في «تحتاجك الآن».
  useQuery<unknown>({
    queryKey: ["/api/email-agent/badge-stats"],
    enabled: canUseEmail,
    refetchInterval: STATS_REFETCH_MS,
  });
  const senders = useTrustedSenders(canUseEmail);
  const failedLogs = useFailedEmailLogs(canUseEmail);

  const senderList = useMemo(() => (Array.isArray(senders.data) ? senders.data : []), [senders.data]);
  const reprocessCount = useMemo(
    () => (Array.isArray(failedLogs.data?.logs) ? failedLogs.data.logs : []).filter((log) => fromEmailLog(log).canReprocess).length,
    [failedLogs.data],
  );
  const expiringCount = useMemo(
    () =>
      senderList.filter((sender) => {
        if (sender.status !== "active") return false;
        const tone = describeTokenAge(sender).tone;
        return tone === "warning" || tone === "expired";
      }).length,
    [senderList],
  );
  const flow = flowCounts(emailStats.data, showWhatsapp ? whatsappStats.data : null);
  const whatsappToday = flowCounts(null, whatsappStats.data).total;

  if (authLoading) {
    return (
      <DashboardLayout>
        <div className="flex min-h-[400px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  if (!canOpenPage) {
    return (
      <DashboardLayout>
        <div className="container mx-auto px-4 py-8" dir="rtl">
          <div className="py-20 text-center">
            <p className="text-lg text-destructive">غير مصرح لك بالوصول إلى هذه الصفحة</p>
            <p className="mt-2 text-sm text-muted-foreground">يتطلب الوصول إلى هذه الصفحة صلاحية إدارة قنوات الاتصال</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const isRefreshing = emailStats.isFetching || whatsappStats.isFetching || senders.isFetching || failedLogs.isFetching;
  const refreshAll = () => {
    for (const key of ["/api/email-agent/badge-stats", "/api/email-agent/stats", "/api/email-agent/logs", "/api/email-agent/senders", "/api/whatsapp/badge-stats", "/api/whatsapp/stats", "/api/whatsapp/logs"]) {
      queryClient.invalidateQueries({ queryKey: [key] });
    }
  };

  const toggleWhatsapp = (show: boolean) => {
    setWhatsappPref(show);
    if (!show) {
      setChannel("all");
      if (view === "whatsapp") setView("senders");
    }
    try {
      localStorage.setItem(WHATSAPP_PREF_ID, show ? "1" : "0");
    } catch {
      // التفضيل يبقى لهذه الجلسة فقط إن مُنع التخزين.
    }
  };

  const openHowTo = () => {
    setView("senders");
    window.setTimeout(() => document.getElementById("how-to-send")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };

  const needs = reprocessCount + expiringCount;
  const tabs: Array<{ id: View | "how"; label: string; count?: number; onClick: () => void; active: boolean; show: boolean }> = [
    { id: "inbox", label: "الوارد", count: needs > 0 ? needs : undefined, onClick: () => setView("inbox"), active: view === "inbox", show: true },
    {
      id: "senders",
      label: "المرسلون والرموز",
      count: senderList.length > 0 ? senderList.length : undefined,
      onClick: () => setView("senders"),
      active: view === "senders",
      show: true,
    },
    { id: "how", label: "طريقة الإرسال", onClick: openHowTo, active: false, show: canUseEmail },
    { id: "whatsapp", label: "إعدادات واتساب", onClick: () => setView("whatsapp"), active: view === "whatsapp", show: showWhatsapp },
  ];

  return (
    <DashboardLayout>
      <ErrorBoundary>
        <div className="min-h-full bg-[#F4F7FB] px-4 pb-14 pt-6 text-[#1B2B3A] sm:px-8 sm:pt-8" dir="rtl">
          <div className="mx-auto flex max-w-[1440px] flex-col gap-[22px]">
            <header className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-[13px] text-[#55667A]">غرفة الأخبار · {todayLabel.format(new Date())} · توقيت الرياض</span>
                <h1 className="text-[28px] font-bold leading-[1.3] text-[#1B2B3A]" data-testid="text-page-title">
                  قنوات الاتصال
                </h1>
              </div>
              <div className="flex flex-wrap gap-2.5">
                <button type="button" className={cn(PILL_PLAIN, "font-semibold text-[#0B6FA8]")} onClick={refreshAll} disabled={isRefreshing} data-testid="button-refresh-all">
                  <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} aria-hidden="true" />
                  تحديث
                </button>
                {canUseEmail && (
                  <button
                    type="button"
                    className={PILL_PRIMARY}
                    onClick={() => {
                      setView("senders");
                      setAddSignal((value) => value + 1);
                    }}
                    data-testid="button-add-sender"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    إضافة مرسل
                  </button>
                )}
              </div>
            </header>

            <CommsHero
              loading={(canUseEmail && !emailStats.data && emailStats.isLoading) || (showWhatsapp && !whatsappStats.data && whatsappStats.isLoading)}
              reprocessCount={reprocessCount}
              expiringCount={expiringCount}
              flow={flow}
            />

            <nav className="flex flex-wrap items-center justify-between gap-3.5" aria-label="أقسام قنوات الاتصال">
              <div className="-mx-1 flex max-w-full gap-2 overflow-x-auto px-1 py-1">
                {tabs
                  .filter((tab) => tab.show)
                  .map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      aria-pressed={tab.active}
                      onClick={tab.onClick}
                      data-testid={`tab-${tab.id}`}
                      className={cn("shrink-0 whitespace-nowrap", tab.active ? PILL_PRIMARY : PILL_PLAIN)}
                    >
                      {tab.label}
                      {tab.count !== undefined && (
                        <span
                          className={cn(
                            "rounded-full px-2 py-px text-xs font-semibold tabular-nums",
                            tab.active ? "bg-white/25 text-white" : tab.id === "inbox" ? "bg-[#E6F4FD] text-[#0B6FA8]" : "text-[#55667A]",
                          )}
                        >
                          {tab.count}
                        </span>
                      )}
                    </button>
                  ))}
              </div>
              {view === "inbox" && showWhatsapp && canUseEmail && (
                <div className="flex items-center gap-1 rounded-full bg-white p-1 shadow-[0_1px_3px_rgba(27,43,58,0.06)]" role="group" aria-label="القناة">
                  {(
                    [
                      ["all", "كل القنوات"],
                      ["email", "البريد"],
                      ["whatsapp", "واتساب"],
                    ] as Array<[InboxChannelFilter, string]>
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={channel === value}
                      onClick={() => setChannel(value)}
                      data-testid={`channel-${value}`}
                      className={cn(
                        "h-9 min-w-[44px] rounded-full px-4 text-[13px] font-semibold transition-colors",
                        channel === value ? "bg-[#E6F4FD] text-[#0B6FA8]" : "text-[#55667A] hover:bg-[#F4F7FB]",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </nav>

            {view === "inbox" && (
              <InboxView
                canUseEmail={canUseEmail}
                showWhatsapp={showWhatsapp}
                channel={canUseEmail ? channel : "whatsapp"}
                senders={senderList}
                onRotateToken={setRotatingSender}
              />
            )}

            {view === "senders" &&
              (canUseEmail ? (
                <SendersView
                  senders={senderList}
                  isLoading={senders.isLoading}
                  hasError={!!senders.error}
                  addSignal={addSignal}
                  onRotateToken={setRotatingSender}
                  emailToday={emailStats.data?.emailsReceived ?? 0}
                  whatsappToday={whatsappToday}
                  canUseWhatsapp={canUseWhatsapp}
                  showWhatsapp={showWhatsapp}
                  onToggleWhatsapp={toggleWhatsapp}
                  onOpenWhatsapp={() => {
                    if (!whatsappPref) toggleWhatsapp(true);
                    setView("whatsapp");
                  }}
                />
              ) : (
                <AccessDenied message="إدارة المرسلين ورموز البريد الذكي تتطلب صلاحية إعدادات النظام (admin.manage_settings)." />
              ))}

            {view === "whatsapp" && (
              <div className="space-y-6 rounded-[22px] bg-background p-4 text-foreground shadow-[0_2px_8px_rgba(27,43,58,0.06)] sm:p-6">
                <WhatsAppTab />
              </div>
            )}
          </div>
        </div>

        <RotateTokenDialog sender={rotatingSender} onOpenChange={(open) => !open && setRotatingSender(null)} />
      </ErrorBoundary>
    </DashboardLayout>
  );
}
