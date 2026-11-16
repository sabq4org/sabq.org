import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Ban, CheckCircle, Clock, Copy, Edit, Eye, EyeOff, Mail, MessageCircle, MoreHorizontal, Search, Trash2, Users } from "lucide-react";
import type { TrustedEmailSender } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { AddSenderDialog } from "@/components/AddSenderDialog";
import { describeTokenAge, type TokenAgeTone } from "./tokenAge";
import { EmptyState, GroupLabel, PILL_PRIMARY, PILL_QUIET, PILL_SOFT, SURFACE } from "./commsUi";

interface SenderFormValues {
  email: string;
  name: string;
  language: "ar" | "en" | "ur";
  autoPublish: boolean;
  defaultCategory?: string;
  status: "active" | "suspended" | "revoked";
  token?: string;
}

interface SendersViewProps {
  senders?: TrustedEmailSender[];
  isLoading: boolean;
  hasError: boolean;
  /** يزيد كلما ضُغط «إضافة مرسل» في ترويسة الصفحة. */
  addSignal: number;
  onRotateToken: (sender: TrustedEmailSender) => void;
  emailToday: number;
  whatsappToday: number;
  canUseWhatsapp: boolean;
  showWhatsapp: boolean;
  onToggleWhatsapp: (show: boolean) => void;
  onOpenWhatsapp: () => void;
}

const GRID = "grid grid-cols-[minmax(0,2fr)_96px_minmax(0,1.5fr)_minmax(0,1.7fr)_124px_44px] items-center gap-3.5";
const LANGUAGE: Record<string, string> = { en: "إنجليزية", ur: "أردية" };
const BAR: Record<TokenAgeTone, { track: string; fill: string; text: string }> = {
  fresh: { track: "bg-[#E6F4FD]", fill: "bg-[#1E9BE6]", text: "text-[#55667A]" },
  warning: { track: "bg-[#F3E3C2]", fill: "bg-[#E9A93A]", text: "font-semibold text-[#946000]" },
  expired: { track: "bg-[#F6D5D7]", fill: "bg-[#BF3038]", text: "font-semibold text-[#BF3038]" },
  open: { track: "bg-[#EEF2F6]", fill: "bg-transparent", text: "text-[#55667A]" },
};

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const last = words[words.length - 1] || "";
  return last.replace(/^ال/, "").slice(0, 2) || "؟";
}

function refreshSenders() {
  queryClient.invalidateQueries({ queryKey: ["/api/email-agent/senders"] });
  queryClient.invalidateQueries({ queryKey: ["/api/email-agent/stats"] });
}

export default function SendersView({
  senders,
  isLoading,
  hasError,
  addSignal,
  onRotateToken,
  emailToday,
  whatsappToday,
  canUseWhatsapp,
  showWhatsapp,
  onToggleWhatsapp,
  onOpenWhatsapp,
}: SendersViewProps) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TrustedEmailSender | null>(null);
  const [visibleTokens, setVisibleTokens] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<TrustedEmailSender | null>(null);
  const [enablingAuto, setEnablingAuto] = useState<TrustedEmailSender | null>(null);

  useEffect(() => {
    if (addSignal > 0) {
      setEditing(null);
      setDialogOpen(true);
    }
  }, [addSignal]);

  const list = useMemo(() => (Array.isArray(senders) ? senders : []), [senders]);
  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return list;
    return list.filter((sender) => sender.name.toLowerCase().includes(term) || sender.email.toLowerCase().includes(term));
  }, [list, search]);
  const expiring = list.find((sender) => {
    if (sender.status !== "active") return false;
    const tone = describeTokenAge(sender).tone;
    return tone === "warning" || tone === "expired";
  });

  const create = useMutation({
    mutationFn: (values: SenderFormValues) => apiRequest("/api/email-agent/senders", { method: "POST", body: JSON.stringify(values) }),
    onSuccess: () => {
      refreshSenders();
      toast({ title: "تمت الإضافة", description: "أُضيف المرسل الموثوق" });
      setDialogOpen(false);
    },
    onError: (error: Error) =>
      toast({ title: "تعذّرت الإضافة", description: error.message || "فشل في إضافة المرسل الموثوق", variant: "destructive" }),
  });

  const update = useMutation({
    mutationFn: ({ id, values }: { id: string; values: Partial<SenderFormValues>; done?: string }) =>
      apiRequest(`/api/email-agent/senders/${id}`, { method: "PUT", body: JSON.stringify(values) }),
    onSuccess: (_data, variables) => {
      refreshSenders();
      toast({ title: "تم الحفظ", description: variables.done || "حُدّثت بيانات المرسل" });
      setEditing(null);
      setDialogOpen(false);
    },
    onError: (error: Error) =>
      toast({ title: "تعذّر الحفظ", description: error.message || "فشل في تحديث المرسل الموثوق", variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/email-agent/senders/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      refreshSenders();
      toast({ title: "تم الحذف", description: "حُذف المرسل الموثوق" });
    },
    onError: (error: Error) =>
      toast({ title: "تعذّر الحذف", description: error.message || "فشل في حذف المرسل الموثوق", variant: "destructive" }),
  });

  const setAutoPublish = (sender: TrustedEmailSender, autoPublish: boolean) =>
    update.mutate({
      id: sender.id,
      values: { autoPublish },
      done: autoPublish ? `رسائل «${sender.name}» تُنشر تلقائيًا` : `رسائل «${sender.name}» تُحفظ مسودات`,
    });

  const copyToken = (token: string) => {
    navigator.clipboard.writeText(token);
    toast({ title: "تم النسخ", description: "نُسخ الرمز السري إلى الحافظة" });
  };
  const toggleToken = (id: string) =>
    setVisibleTokens((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const identity = (sender: TrustedEmailSender) => {
    const active = sender.status === "active";
    return (
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold",
            active ? "bg-[#E6F4FD] text-[#0B6FA8]" : "bg-[#EEF2F6] text-[#55667A]",
          )}
          aria-hidden="true"
        >
          {initials(sender.name)}
        </span>
        <div className="flex min-w-0 flex-col">
          <span className={cn("flex items-center gap-1.5 text-[15px] font-semibold", active ? "text-[#1B2B3A]" : "text-[#55667A]")}>
            <span className="truncate">{sender.name}</span>
            {!active && (
              <span className="shrink-0 rounded-full bg-[#EEF2F6] px-2.5 py-0.5 text-xs font-semibold text-[#55667A]">
                {sender.status === "revoked" ? "ملغي" : "موقوف"}
              </span>
            )}
          </span>
          <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-[#55667A]">
            <span dir="ltr" className="truncate">
              {sender.email}
            </span>
            {LANGUAGE[sender.language] && <span className="shrink-0">· {LANGUAGE[sender.language]}</span>}
          </span>
        </div>
      </div>
    );
  };

  const autoSwitch = (sender: TrustedEmailSender) => (
    <Switch
      dir="ltr"
      checked={sender.autoPublish}
      disabled={update.isPending || sender.status !== "active"}
      onCheckedChange={(next) => (next ? setEnablingAuto(sender) : setAutoPublish(sender, false))}
      aria-label={sender.autoPublish ? "النشر التلقائي مفعّل" : "النشر التلقائي متوقف، الرسائل تُحفظ مسودات"}
      className="data-[state=checked]:bg-[#1E9BE6] data-[state=unchecked]:bg-[#DCE4EC]"
      data-testid={`switch-auto-publish-${sender.id}`}
    />
  );

  const tokenCell = (sender: TrustedEmailSender) =>
    sender.token ? (
      <div className="flex min-w-0 items-center gap-1">
        <code
          dir="ltr"
          className={cn("font-mono text-[13px] tracking-wide text-[#1B2B3A]", visibleTokens.has(sender.id) ? "min-w-0 break-all text-xs leading-5" : "shrink-0")}
        >
          {visibleTokens.has(sender.id) ? sender.token : `••••${sender.token.slice(-4)}`}
        </code>
        <button
          type="button"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#55667A] hover:bg-[#F4F7FB]"
          onClick={() => toggleToken(sender.id)}
          aria-label={visibleTokens.has(sender.id) ? "إخفاء الرمز" : "إظهار الرمز"}
          data-testid={`button-toggle-token-${sender.id}`}
        >
          {visibleTokens.has(sender.id) ? <EyeOff className="h-[17px] w-[17px]" /> : <Eye className="h-[17px] w-[17px]" />}
        </button>
        <button
          type="button"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#55667A] hover:bg-[#F4F7FB]"
          onClick={() => copyToken(sender.token)}
          aria-label="نسخ الرمز"
          data-testid={`button-copy-token-${sender.id}`}
        >
          <Copy className="h-[17px] w-[17px]" />
        </button>
      </div>
    ) : (
      <span className="text-[13px] text-[#617183]">لا يوجد رمز</span>
    );

  const ageCell = (sender: TrustedEmailSender) => {
    const age = describeTokenAge(sender);
    const tone = BAR[age.tone];
    return (
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className={cn("flex h-1.5 overflow-hidden rounded-full", tone.track)} aria-hidden="true">
          <div className={cn("rounded-full", tone.fill)} style={{ width: `${age.percent}%` }} />
        </div>
        <span className={cn("text-xs leading-5", tone.text)} data-testid={`text-token-age-${sender.id}`}>
          {age.text}
        </span>
      </div>
    );
  };

  const mainAction = (sender: TrustedEmailSender) => {
    if (sender.status === "suspended") {
      return (
        <button
          type="button"
          className={cn(PILL_QUIET, "h-10 w-full px-3 text-[13px]")}
          onClick={() => update.mutate({ id: sender.id, values: { status: "active" }, done: `فُعّل «${sender.name}»` })}
          data-testid={`button-activate-${sender.id}`}
        >
          تفعيل
        </button>
      );
    }
    if (sender.status !== "active") return <span />;
    const tone = describeTokenAge(sender).tone;
    const urgent = tone === "warning" || tone === "expired";
    return (
      <button
        type="button"
        className={cn(urgent ? PILL_PRIMARY : PILL_SOFT, "h-10 w-full px-3 text-[13px] shadow-none")}
        onClick={() => onRotateToken(sender)}
        data-testid={`button-rotate-token-${sender.id}`}
      >
        دوّر الرمز
      </button>
    );
  };

  const menu = (sender: TrustedEmailSender) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-full text-[#55667A] hover:bg-[#F4F7FB]"
          aria-label={`خيارات ${sender.name}`}
          data-testid={`button-actions-${sender.id}`}
        >
          <MoreHorizontal className="h-[18px] w-[18px]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => {
            setEditing(sender);
            setDialogOpen(true);
          }}
          data-testid={`action-edit-${sender.id}`}
        >
          <Edit className="ml-2 h-4 w-4" />
          تعديل
        </DropdownMenuItem>
        {sender.status === "active" && (
          <DropdownMenuItem
            onClick={() => update.mutate({ id: sender.id, values: { status: "suspended" }, done: `أُوقف «${sender.name}»` })}
            data-testid={`action-suspend-${sender.id}`}
          >
            <Ban className="ml-2 h-4 w-4" />
            إيقاف
          </DropdownMenuItem>
        )}
        {sender.status === "suspended" && (
          <DropdownMenuItem
            onClick={() => update.mutate({ id: sender.id, values: { status: "active" }, done: `فُعّل «${sender.name}»` })}
            data-testid={`action-activate-${sender.id}`}
          >
            <CheckCircle className="ml-2 h-4 w-4" />
            تفعيل
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => setDeleting(sender)}
          className="text-destructive focus:text-destructive"
          data-testid={`action-delete-${sender.id}`}
        >
          <Trash2 className="ml-2 h-4 w-4" />
          حذف
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="flex flex-col gap-[22px] 2xl:flex-row 2xl:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-[22px]">
        {expiring && (
          <div className="flex flex-wrap items-center gap-3.5 rounded-[18px] bg-[#FFF6E5] px-[18px] py-3.5" data-testid="banner-token-expiring">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#946000]">
              <Clock className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="flex min-w-0 flex-1 basis-64 flex-col gap-0.5 text-[#6B4500]">
              <span className="text-[15px] font-semibold">
                رمز «{expiring.name}»: {describeTokenAge(expiring).text}
              </span>
              <span className="text-[13px]">دوّره الآن وأرسل الرمز الجديد للمرسل. القديم يبقى يعمل 48 ساعة حتى لا يتعطل النشر.</span>
            </div>
            <button
              type="button"
              className="inline-flex h-11 items-center rounded-full bg-white px-5 text-sm font-semibold text-[#946000]"
              onClick={() => onRotateToken(expiring)}
              data-testid="button-banner-rotate"
            >
              دوّر الرمز
            </button>
          </div>
        )}

        <section className="flex flex-col gap-2.5" aria-label="المرسلون الموثوقون">
          <GroupLabel
            aside={
              <label className="flex h-11 min-w-0 flex-1 basis-56 items-center gap-2.5 rounded-full bg-white px-4 shadow-[0_1px_3px_rgba(27,43,58,0.06)] sm:max-w-xs">
                <Search className="h-4 w-4 shrink-0 text-[#617183]" aria-hidden="true" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="ابحث باسم المرسل أو بريده"
                  className="min-w-0 flex-1 border-0 bg-transparent text-sm text-[#1B2B3A] outline-none placeholder:text-[#617183]"
                  data-testid="input-search-senders"
                />
              </label>
            }
          >
            المرسلون الموثوقون{list.length > 0 ? ` · ${list.length}` : ""}
          </GroupLabel>

          <div className={cn(SURFACE, "overflow-hidden")}>
            {hasError ? (
              <p className="px-[18px] py-10 text-center text-sm text-[#BF3038]">تعذّر تحميل المرسلين. حدّث الصفحة وحاول ثانية.</p>
            ) : isLoading ? (
              <div className="flex flex-col gap-2 p-[18px]">
                {[1, 2, 3].map((index) => (
                  <Skeleton key={index} className="h-16 w-full rounded-xl" />
                ))}
              </div>
            ) : shown.length === 0 ? (
              <EmptyState
                icon={<Users className="h-6 w-6" aria-hidden="true" />}
                title={list.length === 0 ? "لا مرسلين موثوقين بعد" : "لا نتائج لهذا البحث"}
                hint={list.length === 0 ? "أضف أول مرسل ليستطيع النشر عبر البريد برمزه السري." : undefined}
              />
            ) : (
              <>
                <div className="hidden xl:block">
                  <div className={cn(GRID, "border-b border-[#EEF2F6] px-5 py-2.5 text-xs text-[#617183]")}>
                    <span>المرسل</span>
                    <span>نشر تلقائي</span>
                    <span>الرمز السري</span>
                    <span>عمر الرمز</span>
                    <span />
                    <span />
                  </div>
                  {shown.map((sender) => (
                    <div
                      key={sender.id}
                      className={cn(GRID, "border-b border-[#EEF2F6] px-5 py-3.5 last:border-b-0", expiring?.id === sender.id && "bg-[#FFFCF5]")}
                      data-testid={`row-sender-${sender.id}`}
                    >
                      {identity(sender)}
                      {autoSwitch(sender)}
                      {tokenCell(sender)}
                      {ageCell(sender)}
                      {mainAction(sender)}
                      {menu(sender)}
                    </div>
                  ))}
                </div>
                <div className="xl:hidden">
                  {shown.map((sender) => (
                    <div
                      key={sender.id}
                      className={cn("flex flex-col gap-3 border-b border-[#EEF2F6] px-[18px] py-4 last:border-b-0", expiring?.id === sender.id && "bg-[#FFFCF5]")}
                      data-testid={`card-sender-${sender.id}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        {identity(sender)}
                        {menu(sender)}
                      </div>
                      <div className="flex items-center justify-between gap-3 text-[13px] text-[#55667A]">
                        <span>نشر تلقائي</span>
                        {autoSwitch(sender)}
                      </div>
                      {tokenCell(sender)}
                      <div className="flex items-end justify-between gap-3">
                        <div className="min-w-0 flex-1">{ageCell(sender)}</div>
                        <div className="w-[124px] shrink-0">{mainAction(sender)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </section>
      </div>

      <aside id="how-to-send" className="grid w-full shrink-0 gap-[22px] md:grid-cols-2 2xl:flex 2xl:w-[340px] 2xl:flex-col">
        <section className="flex flex-col gap-2.5" aria-label="طريقة الإرسال">
          <GroupLabel>طريقة الإرسال</GroupLabel>
          <ol className={cn(SURFACE, "px-5 py-1.5")}>
            {[
              ["أرسل من بريد مسجّل هنا", "الرسالة من أي عنوان آخر تُرفض عند التحقق."],
              ["ضع الرمز السري في عنوان الرسالة أو نصها", "يُحذف الرمز من الخبر تلقائيًا قبل التحرير."],
              ["أرفق الصور أو ملف Word", "يصل الرد للمرسل بالنتيجة، منشورًا أو مسودة حسب إعداده."],
            ].map(([title, note], index) => (
              <li key={title} className="flex gap-3.5 border-b border-[#EEF2F6] py-3.5 last:border-b-0">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#E6F4FD] text-[13px] font-bold text-[#0B6FA8]">
                  {index + 1}
                </span>
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-[15px] font-semibold text-[#1B2B3A]">{title}</span>
                  <span className="text-[13px] leading-[1.7] text-[#55667A]">{note}</span>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="flex flex-col gap-2.5" aria-label="القنوات">
          <GroupLabel>القنوات</GroupLabel>
          <div className={cn(SURFACE, "px-5 py-1.5")}>
            <div className="flex items-center gap-3.5 border-b border-[#EEF2F6] py-3.5">
              <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl bg-[#E6F4FD] text-[#0B6FA8]">
                <Mail className="h-[18px] w-[18px]" aria-hidden="true" />
              </span>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-[15px] font-semibold text-[#1B2B3A]">البريد الذكي</span>
                <span className="text-[13px] text-[#55667A]">القناة الأساسية · {emailToday} اليوم</span>
              </div>
            </div>
            <div className="flex items-center gap-3.5 py-3.5">
              <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl bg-[#EEF2F6] text-[#55667A]">
                <MessageCircle className="h-[18px] w-[18px]" aria-hidden="true" />
              </span>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-[15px] font-semibold text-[#1B2B3A]">واتساب</span>
                <span className="text-[13px] text-[#55667A]">
                  قناة ثانوية · {whatsappToday} اليوم
                  {canUseWhatsapp && (
                    <>
                      {" · "}
                      <button type="button" className="font-semibold text-[#0B6FA8] hover:underline" onClick={onOpenWhatsapp} data-testid="link-whatsapp-settings">
                        إعداداتها ورموزها
                      </button>
                    </>
                  )}
                </span>
              </div>
              <Switch
                dir="ltr"
                checked={showWhatsapp}
                disabled={!canUseWhatsapp}
                onCheckedChange={onToggleWhatsapp}
                aria-label="إظهار واتساب في الوارد"
                className="data-[state=checked]:bg-[#1E9BE6] data-[state=unchecked]:bg-[#DCE4EC]"
                data-testid="switch-show-whatsapp"
              />
            </div>
          </div>
          <p className="px-1.5 text-xs leading-[1.7] text-[#617183]">
            عند إطفاء المفتاح يختفي واتساب من الوارد ومن الأرقام على هذا المتصفح، وتبقى إعداداته ورموزه كما هي.
          </p>
        </section>
      </aside>

      <AddSenderDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={async (values) => {
          if (editing) await update.mutateAsync({ id: editing.id, values });
          else await create.mutateAsync(values);
        }}
        editingSender={editing}
        isSubmitting={create.isPending || update.isPending}
      />

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف «{deleting?.name}»؟</AlertDialogTitle>
            <AlertDialogDescription>لا يمكن التراجع. يُحذف المرسل الموثوق نهائيًا ويتوقف رمزه عن العمل.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-delete-cancel">إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#BF3038] text-white hover:bg-[#a5282f]"
              onClick={() => {
                if (deleting) remove.mutate(deleting.id);
                setDeleting(null);
              }}
              data-testid="button-delete-confirm"
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!enablingAuto} onOpenChange={(open) => !open && setEnablingAuto(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تفعيل النشر التلقائي لـ«{enablingAuto?.name}»؟</AlertDialogTitle>
            <AlertDialogDescription>
              رسائل هذا المرسل ستُنشر في الموقع مباشرة بعد التحرير الذكي دون مراجعة محرر. يمكنك إيقافه في أي وقت.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-auto-cancel">إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#1E9BE6] text-white hover:bg-[#1787cc]"
              onClick={() => {
                if (enablingAuto) setAutoPublish(enablingAuto, true);
                setEnablingAuto(null);
              }}
              data-testid="button-auto-confirm"
            >
              فعّل النشر التلقائي
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
