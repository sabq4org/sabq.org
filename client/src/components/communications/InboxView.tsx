import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertCircle, Check, ChevronLeft, ChevronRight, Clock, Inbox, Paperclip } from "lucide-react";
import type { EmailWebhookLog, TrustedEmailSender, WhatsappWebhookLog } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EmailDetailsModal } from "@/components/EmailDetailsModal";
import { describeTokenAge } from "./tokenAge";
import { useFailedEmailLogs } from "./commsQueries";
import {
  INBOX_FILTERS,
  emailStatusFor,
  fromEmailLog,
  fromWhatsappLog,
  inboxTime,
  mergeInbox,
  trackOf,
  whatsappStatusFor,
  type InboxFilter,
  type InboxItem,
} from "./inboxModel";
import { CARD, ChannelIcon, EmptyState, FilterChip, GroupLabel, PILL_QUIET, PILL_SOFT, SURFACE, StateChip, TrackBar } from "./commsUi";
import { MessageDetail } from "./MessageDetail";

const PAGE_SIZE = 50;
export type InboxChannelFilter = "all" | "email" | "whatsapp";
type Item = InboxItem<EmailWebhookLog, WhatsappWebhookLog>;

interface InboxViewProps {
  canUseEmail: boolean;
  /** واتساب مسموح للمستخدم ومفعّل ظهوره في الوارد. */
  showWhatsapp: boolean;
  channel: InboxChannelFilter;
  senders?: TrustedEmailSender[];
  onRotateToken: (sender: TrustedEmailSender) => void;
}

function useWideScreen(): boolean {
  const query = "(min-width: 1024px)";
  const [wide, setWide] = useState(() => (typeof window === "undefined" ? true : window.matchMedia(query).matches));
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setWide(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return wide;
}

function refreshInbox() {
  queryClient.invalidateQueries({ queryKey: ["/api/email-agent/logs"] });
  queryClient.invalidateQueries({ queryKey: ["/api/email-agent/stats"] });
  queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/logs"] });
  queryClient.invalidateQueries({ queryKey: ["/api/whatsapp/badge-stats"] });
}

export default function InboxView({ canUseEmail, showWhatsapp, channel, senders, onRotateToken }: InboxViewProps) {
  const { toast } = useToast();
  const wide = useWideScreen();
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [page, setPage] = useState(1);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [originalLog, setOriginalLog] = useState<EmailWebhookLog | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Item[] | null>(null);

  const wantEmail = canUseEmail && channel !== "whatsapp";
  const wantWhatsapp = showWhatsapp && channel !== "email";

  useEffect(() => {
    setPage(1);
    setChecked(new Set());
  }, [filter, channel]);

  const emailLogs = useQuery<{ logs: EmailWebhookLog[]; total: number }>({
    queryKey: ["/api/email-agent/logs", page, emailStatusFor(filter)],
    enabled: wantEmail,
    retry: 1,
    staleTime: 30000,
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (filter !== "all") params.append("status", emailStatusFor(filter));
      return apiRequest(`/api/email-agent/logs?${params}`);
    },
  });

  const whatsappLogs = useQuery<{ logs: WhatsappWebhookLog[]; total: number }>({
    queryKey: ["/api/whatsapp/logs", { status: whatsappStatusFor(filter), limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }],
    enabled: wantWhatsapp,
    retry: 1,
    staleTime: 30000,
    queryFn: () => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String((page - 1) * PAGE_SIZE) });
      if (filter !== "all") params.append("status", whatsappStatusFor(filter));
      return apiRequest(`/api/whatsapp/logs?${params}`);
    },
  });

  // الرسائل التي فشلت بعد التحقق منها تظهر في «تحتاجك الآن» أيًّا كان المرشّح والصفحة.
  const failedLogs = useFailedEmailLogs(canUseEmail);

  const items = useMemo<Item[]>(() => {
    const email = wantEmail && !emailLogs.error && Array.isArray(emailLogs.data?.logs) ? emailLogs.data.logs.map((log) => fromEmailLog(log)) : [];
    const whatsapp =
      wantWhatsapp && !whatsappLogs.error && Array.isArray(whatsappLogs.data?.logs)
        ? whatsappLogs.data.logs.map((log) => fromWhatsappLog(log)).filter((item) => filter === "all" || item.state === filter)
        : [];
    return mergeInbox(email, whatsapp) as Item[];
  }, [wantEmail, wantWhatsapp, emailLogs.data, emailLogs.error, whatsappLogs.data, whatsappLogs.error, filter]);

  const needsReprocess = useMemo<Item[]>(
    () =>
      (Array.isArray(failedLogs.data?.logs) ? failedLogs.data.logs : [])
        .map((log) => fromEmailLog(log) as Item)
        .filter((item) => item.canReprocess),
    [failedLogs.data],
  );
  const expiringSenders = useMemo(
    () =>
      (Array.isArray(senders) ? senders : []).filter((sender) => {
        if (sender.status !== "active") return false;
        const tone = describeTokenAge(sender).tone;
        return tone === "warning" || tone === "expired";
      }),
    [senders],
  );

  // فشل قناة لا يحجب وارد الأخرى: الخطأ الكامل فقط حين لا تنجح أي قناة مطلوبة.
  const emailFailed = wantEmail && !!emailLogs.error;
  const whatsappFailed = wantWhatsapp && !!whatsappLogs.error;
  const emailTotal = wantEmail && !emailFailed ? emailLogs.data?.total ?? 0 : 0;
  const whatsappTotal = wantWhatsapp && !whatsappFailed ? whatsappLogs.data?.total ?? 0 : 0;
  const total = emailTotal + whatsappTotal;
  const totalPages = Math.max(1, Math.ceil(emailTotal / PAGE_SIZE), Math.ceil(whatsappTotal / PAGE_SIZE));
  const loading = (wantEmail && emailLogs.isLoading) || (wantWhatsapp && whatsappLogs.isLoading && !whatsappFailed);
  const loadError = (emailFailed || !wantEmail) && (whatsappFailed || !wantWhatsapp);
  const partialError = loadError ? null : emailFailed ? "تعذّر تحميل رسائل البريد، والمعروض رسائل واتساب فقط." : whatsappFailed ? "تعذّر تحميل رسائل واتساب، والمعروض رسائل البريد فقط." : null;

  const selected = items.find((item) => item.key === selectedKey) ?? (wide ? items[0] : undefined);
  const senderOf = (item?: Item) =>
    item?.email?.trustedSenderId ? (senders || []).find((sender) => sender.id === item.email?.trustedSenderId) : undefined;

  const reprocess = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/email-agent/logs/${id}/reprocess`, { method: "POST" }),
    onSuccess: () => {
      refreshInbox();
      // التحرير بالذكاء يأخذ حتى دقيقة: يُحدَّث السجل مرتين ليظهر الخبر دون تحديث يدوي.
      window.setTimeout(refreshInbox, 25_000);
      window.setTimeout(refreshInbox, 70_000);
      toast({ title: "بدأت إعادة المعالجة", description: "يظهر الخبر في الوارد خلال دقيقة، منشورًا أو مسودة حسب إعداد المرسل." });
    },
    onError: (error: Error) => {
      refreshInbox();
      toast({ title: "لم تبدأ إعادة المعالجة", description: error.message || "تعذّرت إعادة المعالجة", variant: "destructive" });
    },
  });
  const reprocessingId = reprocess.isPending ? reprocess.variables ?? null : null;

  const remove = useMutation({
    mutationFn: async (targets: Item[]) => {
      const emailIds = targets.filter((item) => item.channel === "email").map((item) => item.id);
      const whatsappIds = targets.filter((item) => item.channel === "whatsapp").map((item) => item.id);
      if (emailIds.length === 1) await apiRequest(`/api/email-agent/logs/${emailIds[0]}`, { method: "DELETE" });
      else if (emailIds.length > 1)
        await apiRequest("/api/email-agent/logs/bulk-delete", { method: "POST", body: JSON.stringify({ ids: emailIds }) });
      if (whatsappIds.length === 1) await apiRequest(`/api/whatsapp/logs/${whatsappIds[0]}`, { method: "DELETE" });
      else if (whatsappIds.length > 1)
        await apiRequest("/api/whatsapp/logs/bulk-delete", { method: "POST", body: JSON.stringify({ ids: whatsappIds }) });
      return targets.length;
    },
    onSuccess: (count) => {
      refreshInbox();
      setChecked(new Set());
      setSelecting(false);
      setSheetOpen(false);
      toast({ title: "تم الحذف", description: count === 1 ? "حُذف السجل" : `حُذف ${count} سجلًا` });
    },
    onError: (error: Error) => {
      refreshInbox();
      toast({ title: "تعذّر الحذف", description: error.message || "فشل حذف السجل", variant: "destructive" });
    },
  });

  const openItem = (item: Item) => {
    if (selecting) {
      setChecked((previous) => {
        const next = new Set(previous);
        if (next.has(item.key)) next.delete(item.key);
        else next.add(item.key);
        return next;
      });
      return;
    }
    setSelectedKey(item.key);
    if (!wide) setSheetOpen(true);
  };

  const detail = (item: Item) => (
    <MessageDetail
      item={item}
      autoPublishOff={senderOf(item)?.autoPublish === false}
      reprocessing={reprocessingId === item.id}
      onReprocess={(id) => reprocess.mutate(id)}
      onOpenOriginal={item.email ? () => setOriginalLog(item.email ?? null) : undefined}
      onDelete={() => setPendingDelete([item])}
    />
  );

  const hasAttention = needsReprocess.length > 0 || expiringSenders.length > 0;

  return (
    <div className="flex flex-col gap-[22px] lg:flex-row lg:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-[22px]">
        {hasAttention && (
          <section className="flex flex-col gap-2.5" aria-label="تحتاجك الآن">
            <GroupLabel>تحتاجك الآن</GroupLabel>
            {needsReprocess.map((item) => {
              const time = inboxTime(item.at);
              return (
                <div key={item.key} className={cn(CARD, "flex flex-wrap items-center gap-3.5 px-[18px] py-4")} data-testid={`attention-log-${item.id}`}>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FDECEC] text-[#BF3038]">
                    <AlertCircle className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="flex min-w-0 flex-1 basis-64 flex-col gap-0.5">
                    <span className="text-[15px] font-semibold leading-[1.5] text-[#1B2B3A]">{item.title}</span>
                    <span className="text-[13px] text-[#55667A]">
                      {item.sender} · {time.secondary ? `${time.primary} ${time.secondary}` : time.primary} · تعطلت أثناء التحرير
                      {item.attachments > 0 ? " · المرفقات محفوظة" : ""}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={PILL_SOFT}
                    disabled={reprocessingId === item.id}
                    onClick={() => reprocess.mutate(item.id)}
                    data-testid={`button-attention-reprocess-${item.id}`}
                  >
                    {reprocessingId === item.id ? "جارٍ البدء…" : "أعد المعالجة"}
                  </button>
                </div>
              );
            })}
            {expiringSenders.map((sender) => {
              const age = describeTokenAge(sender);
              return (
                <div key={sender.id} className={cn(CARD, "flex flex-wrap items-center gap-3.5 px-[18px] py-4")} data-testid={`attention-token-${sender.id}`}>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF6E5] text-[#946000]">
                    <Clock className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="flex min-w-0 flex-1 basis-64 flex-col gap-0.5">
                    <span className="text-[15px] font-semibold leading-[1.5] text-[#1B2B3A]">
                      رمز «{sender.name}» {age.tone === "expired" ? "انتهى ولا يقبل النشر" : "يقترب من الانتهاء"}
                    </span>
                    <span className="text-[13px] text-[#55667A]">{age.text} · بعد التدوير يبقى الرمز القديم يعمل 48 ساعة</span>
                  </div>
                  <button type="button" className={PILL_SOFT} onClick={() => onRotateToken(sender)} data-testid={`button-attention-rotate-${sender.id}`}>
                    دوّر الرمز
                  </button>
                </div>
              );
            })}
          </section>
        )}

        <section className="flex flex-col gap-2.5" aria-label="الوارد">
          <GroupLabel
            aside={
              <div className="flex flex-wrap items-center gap-1.5">
                {INBOX_FILTERS.map((option) => (
                  <FilterChip key={option.value} active={filter === option.value} onClick={() => setFilter(option.value)} testId={`filter-${option.value}`}>
                    {option.label}
                  </FilterChip>
                ))}
              </div>
            }
          >
            الوارد{total > 0 ? ` · ${total}` : ""}
          </GroupLabel>

          <div className={cn(SURFACE, "overflow-hidden")}>
            <div className="flex items-center gap-3.5 border-b border-[#EEF2F6] px-[18px] py-2.5 text-xs text-[#617183]">
              <span className="hidden w-[52px] sm:block">الوقت</span>
              <span className="hidden w-[34px] sm:block" />
              <span className="min-w-0 flex-1">{selecting ? `المحدد: ${checked.size}` : "المرسل والعنوان"}</span>
              <span className="hidden w-[150px] whitespace-nowrap text-center md:block">وصول · تحقق · تحرير · نشر</span>
              {selecting ? (
                <span className="flex items-center gap-1.5">
                  <button
                    type="button"
                    className="h-9 rounded-full bg-[#FDECEC] px-3.5 text-[13px] font-semibold text-[#BF3038] disabled:opacity-50"
                    disabled={checked.size === 0}
                    onClick={() => setPendingDelete(items.filter((item) => checked.has(item.key)))}
                    data-testid="button-delete-selected"
                  >
                    حذف المحدد ({checked.size})
                  </button>
                  <button
                    type="button"
                    className="h-9 rounded-full px-3 text-[13px] font-semibold text-[#55667A]"
                    onClick={() => {
                      setSelecting(false);
                      setChecked(new Set());
                    }}
                  >
                    إلغاء
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="h-9 rounded-full px-3 text-[13px] font-semibold text-[#0B6FA8] disabled:opacity-50"
                  disabled={items.length === 0}
                  onClick={() => setSelecting(true)}
                  data-testid="button-select-mode"
                >
                  تحديد
                </button>
              )}
            </div>

            {partialError && (
              <p className="border-b border-[#EEF2F6] bg-[#FFF6E5] px-[18px] py-2.5 text-[13px] text-[#6B4500]" data-testid="inbox-partial-error">
                {partialError}
              </p>
            )}
            {loadError ? (
              <p className="px-[18px] py-10 text-center text-sm text-[#BF3038]">تعذّر تحميل الوارد. حدّث الصفحة وحاول ثانية.</p>
            ) : loading ? (
              <div className="flex flex-col gap-2 p-[18px]">
                {[1, 2, 3, 4].map((index) => (
                  <Skeleton key={index} className="h-14 w-full rounded-xl" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <EmptyState
                icon={<Inbox className="h-6 w-6" aria-hidden="true" />}
                title={filter === "all" ? "لا رسائل في الوارد" : "لا رسائل بهذه الحالة"}
                hint={
                  filter === "all"
                    ? "حين يرسل مرسل موثوق خبرًا مع رمزه يظهر هنا مع مساره خطوة بخطوة."
                    : "جرّب مرشّحًا آخر أو اختر «الكل»."
                }
              />
            ) : (
              items.map((item) => {
                const time = inboxTime(item.at);
                const tones = trackOf(item);
                const isOn = selecting ? checked.has(item.key) : wide && selected?.key === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    aria-pressed={isOn}
                    onClick={() => openItem(item)}
                    data-testid={`row-inbox-${item.id}`}
                    className={cn(
                      "flex min-h-[64px] w-full items-center gap-3.5 border-b border-s-[3px] border-b-[#EEF2F6] px-[18px] py-3 text-right transition-colors last:border-b-0",
                      isOn ? "border-s-[#1E9BE6] bg-[#F1F8FE]" : "border-s-transparent bg-white hover:bg-[#F8FAFC]",
                    )}
                  >
                    {selecting && (
                      <span
                        className={cn(
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border",
                          isOn ? "border-[#1E9BE6] bg-[#1E9BE6] text-white" : "border-[#B8C4D0] bg-white",
                        )}
                        aria-hidden="true"
                      >
                        {isOn && <Check className="h-3.5 w-3.5" />}
                      </span>
                    )}
                    <span className="hidden w-[52px] shrink-0 flex-col text-[#55667A] sm:flex">
                      <span className="text-sm font-semibold tabular-nums">{time.primary}</span>
                      {time.secondary && <span className="text-xs tabular-nums">{time.secondary}</span>}
                    </span>
                    <ChannelIcon channel={item.channel} className="hidden sm:flex" />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="line-clamp-2 text-[15px] font-semibold leading-[1.6] text-[#1B2B3A] sm:line-clamp-1">{item.title}</span>
                      <span className="flex flex-wrap items-center gap-x-1.5 text-[13px] text-[#55667A]">
                        <span className="sm:hidden">
                          {time.primary}
                          {time.secondary ? ` ${time.secondary}` : ""} ·
                        </span>
                        <span className="truncate" dir={item.channel === "whatsapp" ? "ltr" : undefined}>
                          {item.sender}
                        </span>
                        <span className="sm:hidden">· {item.channel === "whatsapp" ? "واتساب" : "بريد"}</span>
                        {item.attachments > 0 && (
                          <span className="inline-flex items-center gap-0.5">
                            · <Paperclip className="h-3 w-3" aria-hidden="true" /> {item.attachments}
                          </span>
                        )}
                      </span>
                      <TrackBar tones={tones} className="mt-1.5 md:hidden" />
                    </span>
                    <TrackBar tones={tones} className="hidden w-[150px] shrink-0 justify-center md:flex" />
                    <StateChip state={item.state} className="shrink-0" />
                  </button>
                );
              })
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 border-t border-[#EEF2F6] px-[18px] py-3 text-[13px] text-[#55667A]">
                <button
                  type="button"
                  className={cn(PILL_QUIET, "h-10 px-4")}
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  data-testid="button-prev-page"
                >
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  السابق
                </button>
                <span className="tabular-nums">
                  صفحة {page} من {totalPages}
                </span>
                <button
                  type="button"
                  className={cn(PILL_QUIET, "h-10 px-4")}
                  disabled={page >= totalPages}
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  data-testid="button-next-page"
                >
                  التالي
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
        </section>
      </div>

      {wide && (
        <aside className={cn(SURFACE, "sticky top-4 w-[380px] shrink-0 p-6")} aria-label="مسار الرسالة">
          {selected ? (
            detail(selected)
          ) : (
            <EmptyState
              icon={<Inbox className="h-6 w-6" aria-hidden="true" />}
              title="مسار الرسالة"
              hint="اختر رسالة من الوارد لترى أين وصلت: وصول، تحقق، تحرير، ثم نشر."
            />
          )}
        </aside>
      )}

      <Sheet open={!wide && sheetOpen && !!selected} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" dir="rtl" className="max-h-[88vh] overflow-y-auto rounded-t-[22px] border-0 bg-white px-5 pb-6 pt-11">
          <SheetHeader className="sr-only">
            <SheetTitle>مسار الرسالة</SheetTitle>
            <SheetDescription>تفاصيل الرسالة وخطوات معالجتها</SheetDescription>
          </SheetHeader>
          {selected && detail(selected)}
        </SheetContent>
      </Sheet>

      <EmailDetailsModal open={!!originalLog} onOpenChange={(open) => !open && setOriginalLog(null)} log={originalLog} />

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingDelete && pendingDelete.length > 1 ? `حذف ${pendingDelete.length} سجلًا؟` : "حذف السجل؟"}</AlertDialogTitle>
            <AlertDialogDescription>يُحذف سجل الرسالة من الوارد نهائيًا. الخبر المنشور أو المسودة لا يتأثران.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-delete-log-cancel">إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#BF3038] text-white hover:bg-[#a5282f]"
              onClick={() => {
                if (pendingDelete) remove.mutate(pendingDelete);
                setPendingDelete(null);
              }}
              data-testid="button-delete-log-confirm"
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
