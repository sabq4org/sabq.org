// مركز الاجتماعات — /dashboard/meetings
// اجتماعات صوتية مع مشاركة شاشة داخل اللوحة: المباشر الآن في المقدمة،
// ثم المجدولة والمنتهية حديثاً. الإنشاء عبر حوار بأنماط الوصول الأربعة.

import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageShell } from "@/components/dashboard/DashboardPageShell";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import {
  Building2, CalendarClock, Check, Headphones, Link2, ListChecks, Loader2,
  Lock, Mic, Plus, Radio, Search, Users, UsersRound, X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type MeetingListItem = {
  id: string;
  title: string;
  description: string | null;
  accessType: "all" | "department" | "selected" | "link";
  status: string;
  requireApproval: boolean;
  isLocked: boolean;
  scheduledAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  hostUserId: string;
  hostName: string;
  departmentName: string | null;
  participantCount: number;
  inviteToken: string | null;
  rsvpYesCount: number;
  rsvpNoCount: number;
  myRsvp: "yes" | "no" | null;
};

type MeetingsResponse = {
  live: MeetingListItem[];
  upcoming: MeetingListItem[];
  recent: MeetingListItem[];
  configured: boolean;
};

type FormOptions = {
  departments: { id: string; nameAr: string }[];
  staff: { userId: string; name: string; avatarUrl: string | null; department: string | null }[];
};

const ACCESS_META: Record<
  MeetingListItem["accessType"],
  { label: string; icon: LucideIcon; badgeClass: string }
> = {
  all: { label: "جميع المنسوبين", icon: UsersRound, badgeClass: "bg-primary/10 text-primary border-primary/20" },
  department: { label: "إدارة محددة", icon: Building2, badgeClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
  selected: { label: "أعضاء محددون", icon: ListChecks, badgeClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  link: { label: "رابط دعوة", icon: Link2, badgeClass: "bg-muted text-muted-foreground border-border" },
};

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return time;
  return `${d.toLocaleDateString("ar", { weekday: "long", day: "numeric", month: "numeric" })} ${time}`;
}

function initialsOf(name: string): string {
  return name.trim().slice(0, 2);
}

export default function MeetingsHub() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

  const { data: dataRaw, isLoading } = useQuery({
    queryKey: ["/api/meetings"],
    refetchInterval: 30_000,
  });
  const data = (dataRaw ?? null) as MeetingsResponse | null;
  const live = Array.isArray(data?.live) ? data.live : [];
  const upcoming = Array.isArray(data?.upcoming) ? data.upcoming : [];
  const recent = Array.isArray(data?.recent) ? data.recent : [];

  const canCreate =
    user?.permissions?.includes("*") ||
    user?.permissions?.includes("meetings.create") ||
    user?.permissions?.includes("meetings.manage");

  const weekCount = live.length + upcoming.length;
  const todayCount = upcoming.filter((m) => {
    if (!m.scheduledAt) return false;
    return new Date(m.scheduledAt).toDateString() === new Date().toDateString();
  }).length;

  return (
    <DashboardLayout>
      <DashboardPageShell maxWidthClassName="max-w-[1100px]">
        <div className="space-y-6">
          <DashboardPageHeader
            icon={Headphones}
            title="الاجتماعات"
            description="اجتماعات صوتية مع مشاركة شاشة — بهوية دليل المنسوبين وتحكم كامل بالدخول"
            titleTestId="text-meetings-title"
            actions={
              canCreate ? (
                <Button onClick={() => setCreateOpen(true)} data-testid="button-new-meeting">
                  <Plus className="ml-1 h-4 w-4" />
                  اجتماع جديد
                </Button>
              ) : undefined
            }
          />

          {data && !data.configured ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
              نظام الاجتماعات غير مفعّل بعد — يلزم ضبط متغيرات LIVEKIT على الخادم. القوائم تعمل، لكن الانضمام معطّل.
            </div>
          ) : null}

          {/* شريط الإحصاء */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className={cn(
              "rounded-xl border px-4 py-3",
              live.length
                ? "border-red-500/30 bg-red-500/5"
                : "border-border bg-card",
            )}>
              <div className={cn("text-2xl font-bold tabular-nums", live.length ? "text-red-600 dark:text-red-400" : "text-foreground")}>
                {live.length}
              </div>
              <div className="text-xs text-muted-foreground">مباشر الآن</div>
            </div>
            <div className="rounded-xl border border-border bg-card px-4 py-3">
              <div className="text-2xl font-bold tabular-nums">{todayCount}</div>
              <div className="text-xs text-muted-foreground">مجدولة اليوم</div>
            </div>
            <div className="rounded-xl border border-border bg-card px-4 py-3">
              <div className="text-2xl font-bold tabular-nums">{weekCount}</div>
              <div className="text-xs text-muted-foreground">مباشرة وقادمة</div>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card py-14 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> جارٍ تحميل الاجتماعات…
            </div>
          ) : (
            <>
              {/* المباشر الآن */}
              {live.map((m) => (
                <div
                  key={m.id}
                  className="flex flex-wrap items-center gap-4 rounded-xl border border-red-500/30 bg-card p-4"
                  data-testid={`card-live-meeting-${m.id}`}
                >
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-2.5 py-0.5 text-xs font-bold text-white">
                    <Radio className="h-3 w-3 animate-pulse" /> مباشر
                  </span>
                  <div className="min-w-[180px] flex-1">
                    <div className="flex items-center gap-2 font-bold">
                      {m.title}
                      {m.isLocked ? <Lock className="h-3.5 w-3.5 text-muted-foreground" /> : null}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      بدأ {formatTime(m.startedAt)} · يستضيفه {m.hostName} · {m.participantCount} مشاركاً
                    </div>
                  </div>
                  <AccessBadge type={m.accessType} departmentName={m.departmentName} />
                  <Button
                    onClick={() => setLocation(`/dashboard/meetings/room/${m.id}`)}
                    disabled={data ? !data.configured : false}
                    data-testid={`button-join-${m.id}`}
                  >
                    انضمام
                  </Button>
                </div>
              ))}

              {/* القادمة */}
              <MeetingRows
                title="الاجتماعات القادمة"
                empty="لا اجتماعات مجدولة"
                items={upcoming}
                right={(m) => (
                  <span className="min-w-[70px] text-xs tabular-nums text-muted-foreground">
                    {formatTime(m.scheduledAt)}
                  </span>
                )}
                action={(m) =>
                  m.hostUserId === user?.id ? (
                    <div className="flex items-center gap-2">
                      <HostRsvpSummary meeting={m} />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setLocation(`/dashboard/meetings/room/${m.id}`)}
                      >
                        بدء الآن
                      </Button>
                    </div>
                  ) : (
                    <RsvpButtons meeting={m} />
                  )
                }
              />

              {/* المنتهية حديثاً */}
              {recent.length ? (
                <MeetingRows
                  title="انتهت خلال الأسبوع"
                  empty=""
                  items={recent}
                  muted
                  right={(m) => (
                    <span className="min-w-[70px] text-xs tabular-nums text-muted-foreground">
                      {formatTime(m.endedAt)}
                    </span>
                  )}
                />
              ) : null}
            </>
          )}
        </div>
      </DashboardPageShell>

      {createOpen ? (
        <CreateMeetingDialog
          onClose={() => setCreateOpen(false)}
          onCreated={(meeting) => {
            setCreateOpen(false);
            queryClient.invalidateQueries({ queryKey: ["/api/meetings"] });
            if (meeting.status === "live") {
              setLocation(`/dashboard/meetings/room/${meeting.id}`);
            } else {
              toast({ title: "تمت الجدولة", description: "سيظهر الاجتماع في القائمة لوقته المحدد" });
            }
          }}
        />
      ) : null}
    </DashboardLayout>
  );
}

function AccessBadge({ type, departmentName }: { type: MeetingListItem["accessType"]; departmentName: string | null }) {
  const meta = ACCESS_META[type] ?? ACCESS_META.selected;
  const Icon = meta.icon;
  return (
    <Badge variant="outline" className={cn("gap-1 font-medium", meta.badgeClass)}>
      <Icon className="h-3 w-3" />
      {type === "department" && departmentName ? departmentName : meta.label}
    </Badge>
  );
}

function MeetingRows({
  title, empty, items, right, action, muted,
}: {
  title: string;
  empty: string;
  items: MeetingListItem[];
  right?: (m: MeetingListItem) => React.ReactNode;
  action?: (m: MeetingListItem) => React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border bg-muted/40 px-4 py-2 text-xs font-bold text-muted-foreground">
        {title}
      </div>
      {items.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">{empty}</div>
      ) : (
        items.map((m) => (
          <div
            key={m.id}
            className={cn(
              "flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 last:border-b-0",
              muted && "opacity-70",
            )}
          >
            {right?.(m)}
            <div className="min-w-[160px] flex-1 text-sm font-medium">{m.title}</div>
            <AccessBadge type={m.accessType} departmentName={m.departmentName} />
            <span className="text-xs text-muted-foreground">{m.hostName}</span>
            {action?.(m)}
          </div>
        ))
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// تأكيد الحضور للاجتماع المجدول — «سأحضر / لا أستطيع».
// الدعوة تبقى قائمة بالحالين، والمعتذر نطمئنه أن بابنا مفتوح متى زال ظرفه.
// ────────────────────────────────────────────────────────────────────

function RsvpButtons({ meeting }: { meeting: MeetingListItem }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const rsvpMutation = useMutation({
    mutationFn: (response: "yes" | "no") =>
      apiRequest(`/api/meetings/${meeting.id}/rsvp`, {
        method: "POST",
        body: JSON.stringify({ response }),
      }),
    onSuccess: (_data, response) => {
      queryClient.invalidateQueries({ queryKey: ["/api/meetings"] });
      if (response === "no") {
        toast({
          title: "نعتذر عن غيابك 🌹",
          description: "الدعوة تبقى قائمة — بإمكانك الانضمام لنا في أي لحظة متى زال ظرفك.",
        });
      } else {
        toast({ title: "تم تأكيد حضورك 🎉", description: "بانتظارك في موعد الاجتماع" });
      }
    },
    onError: () => toast({ title: "تعذر حفظ ردك", variant: "destructive" }),
  });

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={() => rsvpMutation.mutate("yes")}
        disabled={rsvpMutation.isPending}
        className={cn(
          "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-bold transition-colors",
          meeting.myRsvp === "yes"
            ? "border-emerald-500 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
            : "border-border text-muted-foreground hover:border-emerald-500/50 hover:text-emerald-600",
        )}
        data-testid={`button-rsvp-yes-${meeting.id}`}
      >
        <Check className="h-3 w-3" /> سأحضر
      </button>
      <button
        onClick={() => rsvpMutation.mutate("no")}
        disabled={rsvpMutation.isPending}
        className={cn(
          "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-bold transition-colors",
          meeting.myRsvp === "no"
            ? "border-amber-500 bg-amber-500/15 text-amber-600 dark:text-amber-400"
            : "border-border text-muted-foreground hover:border-amber-500/50 hover:text-amber-600",
        )}
        data-testid={`button-rsvp-no-${meeting.id}`}
      >
        <X className="h-3 w-3" /> لا أستطيع
      </button>
    </div>
  );
}

type RsvpEntry = {
  name: string;
  avatarUrl: string | null;
  department: string | null;
  rsvp: "yes" | "no";
};

function HostRsvpSummary({ meeting }: { meeting: MeetingListItem }) {
  const [open, setOpen] = useState(false);
  const { data: rsvpsRaw } = useQuery({
    queryKey: [`/api/meetings/${meeting.id}/rsvps`],
    enabled: open,
  });
  const rsvps = ((rsvpsRaw as { rsvps?: RsvpEntry[] } | null)?.rsvps ?? []) as RsvpEntry[];

  if (!meeting.rsvpYesCount && !meeting.rsvpNoCount) return null;

  const attending = rsvps.filter((r) => r.rsvp === "yes");
  const declined = rsvps.filter((r) => r.rsvp === "no");

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-[11px] font-bold text-muted-foreground hover:border-primary/40 hover:text-foreground"
        data-testid={`button-rsvp-summary-${meeting.id}`}
      >
        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
          <Check className="h-3 w-3" /> {meeting.rsvpYesCount}
        </span>
        <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
          <X className="h-3 w-3" /> {meeting.rsvpNoCount}
        </span>
      </button>

      {open ? (
        <Dialog open onOpenChange={(o) => !o && setOpen(false)}>
          <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-[420px]" dir="rtl">
            <DialogHeader>
              <DialogTitle className="text-base">تأكيدات الحضور — {meeting.title}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <RsvpGroup
                title={`سيحضرون (${meeting.rsvpYesCount})`}
                titleClass="text-emerald-600 dark:text-emerald-400"
                entries={attending}
                empty="لا تأكيدات بعد"
              />
              <RsvpGroup
                title={`معتذرون (${meeting.rsvpNoCount})`}
                titleClass="text-amber-600 dark:text-amber-400"
                entries={declined}
                empty="لا اعتذارات"
              />
              <p className="text-[11px] leading-5 text-muted-foreground">
                المعتذرون تبقى دعوتهم قائمة — يستطيعون الانضمام متى زال ظرفهم.
              </p>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}

function RsvpGroup({
  title, titleClass, entries, empty,
}: {
  title: string;
  titleClass: string;
  entries: RsvpEntry[];
  empty: string;
}) {
  return (
    <div>
      <div className={cn("mb-1.5 text-xs font-bold", titleClass)}>{title}</div>
      {entries.length === 0 ? (
        <div className="text-xs text-muted-foreground">{empty}</div>
      ) : (
        <div className="space-y-1.5">
          {entries.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <Avatar className="h-6 w-6">
                {r.avatarUrl ? <AvatarImage src={r.avatarUrl} alt="" /> : null}
                <AvatarFallback className="text-[9px]">{initialsOf(r.name)}</AvatarFallback>
              </Avatar>
              <span className="text-xs">{r.name}</span>
              {r.department ? (
                <span className="text-[10px] text-muted-foreground">· {r.department}</span>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// حوار إنشاء الاجتماع
// ────────────────────────────────────────────────────────────────────

const ACCESS_OPTIONS: { value: MeetingListItem["accessType"]; label: string; icon: LucideIcon }[] = [
  { value: "all", label: "جميع المنسوبين", icon: UsersRound },
  { value: "department", label: "إدارة محددة", icon: Building2 },
  { value: "selected", label: "أعضاء محددون", icon: ListChecks },
  { value: "link", label: "رابط دعوة", icon: Link2 },
];

function CreateMeetingDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (meeting: { id: string; status: string }) => void;
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [accessType, setAccessType] = useState<MeetingListItem["accessType"]>("all");
  const [departmentId, setDepartmentId] = useState("");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [requireApproval, setRequireApproval] = useState(true);
  const [muteOnJoin, setMuteOnJoin] = useState(true);
  const [schedule, setSchedule] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");

  const { data: optionsRaw } = useQuery({ queryKey: ["/api/meetings/form-options"] });
  const options = (optionsRaw ?? null) as FormOptions | null;
  const departments = Array.isArray(options?.departments) ? options.departments : [];
  const staff = Array.isArray(options?.staff) ? options.staff : [];

  const filteredStaff = useMemo(() => {
    const q = memberSearch.trim();
    if (!q) return staff;
    return staff.filter((s) => s.name.includes(q) || (s.department ?? "").includes(q));
  }, [staff, memberSearch]);

  const createMutation = useMutation({
    mutationFn: async () =>
      apiRequest("/api/meetings", {
        method: "POST",
        body: JSON.stringify({
          title,
          description: description || undefined,
          accessType,
          departmentId: accessType === "department" ? departmentId : undefined,
          memberIds: accessType === "selected" ? memberIds : undefined,
          requireApproval,
          muteOnJoin,
          scheduledAt: schedule && scheduledAt ? new Date(scheduledAt).toISOString() : null,
        }),
      }),
    onSuccess: (meeting: { id: string; status: string }) => onCreated(meeting),
    onError: (e: Error) => toast({ title: "تعذر إنشاء الاجتماع", description: e.message, variant: "destructive" }),
  });

  const valid =
    title.trim().length >= 3 &&
    (accessType !== "department" || departmentId) &&
    (accessType !== "selected" || memberIds.length > 0) &&
    (!schedule || scheduledAt);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      {/* على الجوال: ورقة سفلية + تذييل ثابت فوق شريط المتصفح (safe-area) */}
      <DialogContent
        className={cn(
          "flex max-h-[min(92dvh,920px)] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-[560px]",
          "left-0 right-0 top-auto bottom-0 translate-x-0 translate-y-0 rounded-t-2xl",
          "sm:left-[50%] sm:right-auto sm:top-[50%] sm:bottom-auto sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-lg",
        )}
        dir="rtl"
      >
        <DialogHeader className="shrink-0 space-y-0 border-b border-border px-5 pb-3 pt-5 text-right sm:px-6">
          <DialogTitle className="flex items-center gap-2">
            <Headphones className="h-5 w-5 text-primary" /> اجتماع جديد
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
          <div className="space-y-1.5">
            <label className="text-xs font-bold">عنوان الاجتماع</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثال: الاجتماع التحريري الصباحي"
              data-testid="input-meeting-title"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold">وصف مختصر (اختياري)</label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold">من يستطيع الدخول؟</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {ACCESS_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const selected = accessType === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setAccessType(opt.value)}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-lg border px-2 py-3 text-xs transition-colors",
                      selected
                        ? "border-primary bg-primary/10 font-bold text-primary ring-1 ring-primary"
                        : "border-border text-muted-foreground hover:border-primary/40",
                    )}
                    data-testid={`button-access-${opt.value}`}
                  >
                    <Icon className="h-4 w-4" />
                    {opt.label}
                  </button>
                );
              })}
            </div>
            {accessType === "link" ? (
              <p className="text-[11px] leading-5 text-muted-foreground">
                يُنشأ رابط دعوة تشاركه مع من تريد — غير المسجَّلين يدخلون كضيوف بعد موافقتك.
              </p>
            ) : null}
          </div>

          {accessType === "department" ? (
            <div className="space-y-1.5">
              <label className="text-xs font-bold">الإدارة</label>
              <Select value={departmentId} onValueChange={setDepartmentId}>
                <SelectTrigger data-testid="select-meeting-department">
                  <SelectValue placeholder="اختر الإدارة" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.nameAr}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {accessType === "selected" ? (
            <div className="space-y-1.5">
              <label className="text-xs font-bold">
                الأعضاء <span className="font-normal text-muted-foreground">({memberIds.length} مختار)</span>
              </label>
              <div className="relative">
                <Search className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder="ابحث بالاسم أو الإدارة"
                  className="pr-9"
                />
              </div>
              <div className="max-h-44 overflow-y-auto rounded-lg border border-border">
                {filteredStaff.map((s) => {
                  const selected = memberIds.includes(s.userId);
                  return (
                    <button
                      key={s.userId}
                      type="button"
                      onClick={() =>
                        setMemberIds((prev) =>
                          selected ? prev.filter((id) => id !== s.userId) : [...prev, s.userId],
                        )
                      }
                      className={cn(
                        "flex w-full items-center gap-2 border-b border-border px-3 py-2 text-right text-sm last:border-b-0",
                        selected ? "bg-primary/10" : "hover:bg-muted/50",
                      )}
                    >
                      <Avatar className="h-7 w-7">
                        {s.avatarUrl ? <AvatarImage src={s.avatarUrl} alt="" /> : null}
                        <AvatarFallback className="text-[10px]">{initialsOf(s.name)}</AvatarFallback>
                      </Avatar>
                      <span className="flex-1">
                        {s.name}
                        {s.department ? (
                          <span className="mr-1 text-xs text-muted-foreground">· {s.department}</span>
                        ) : null}
                      </span>
                      {selected ? <Badge className="text-[10px]">مختار</Badge> : null}
                    </button>
                  );
                })}
                {filteredStaff.length === 0 ? (
                  <div className="px-3 py-6 text-center text-xs text-muted-foreground">لا نتائج</div>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="space-y-2.5">
            <ToggleRow
              title="الموافقة قبل الدخول"
              subtitle="كل من يحاول الدخول ينتظر موافقتك في غرفة الانتظار"
              checked={requireApproval}
              onChange={setRequireApproval}
              testId="switch-require-approval"
            />
            <ToggleRow
              title="كتم الميكروفون عند الدخول"
              subtitle="يدخل المشاركون صامتين ويفتحون الميكروفون بأنفسهم"
              checked={muteOnJoin}
              onChange={setMuteOnJoin}
              testId="switch-mute-on-join"
            />
            <ToggleRow
              title="جدولة لوقت لاحق"
              subtitle="اتركه مغلقاً لبدء الاجتماع فوراً"
              checked={schedule}
              onChange={setSchedule}
              testId="switch-schedule"
            />
            {schedule ? (
              <div className="flex items-center gap-2 pr-1">
                <CalendarClock className="h-4 w-4 text-muted-foreground" />
                <Input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="max-w-[240px]"
                  dir="ltr"
                />
              </div>
            ) : null}
          </div>
        </div>

        <DialogFooter
          className={cn(
            "shrink-0 gap-2 border-t border-border bg-background px-5 pt-3",
            "pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-start sm:space-x-0 sm:px-6",
          )}
        >
          <Button
            className="w-full sm:w-auto"
            onClick={() => createMutation.mutate()}
            disabled={!valid || createMutation.isPending}
            data-testid="button-create-meeting"
          >
            {createMutation.isPending ? <Loader2 className="ml-1 h-4 w-4 animate-spin" /> : <Mic className="ml-1 h-4 w-4" />}
            {schedule ? "جدولة الاجتماع" : "إنشاء وبدء الاجتماع"}
          </Button>
          <Button className="w-full sm:w-auto" variant="outline" onClick={onClose}>
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ToggleRow({
  title, subtitle, checked, onChange, testId,
}: {
  title: string;
  subtitle: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  testId?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3.5 py-2.5">
      <div>
        <div className="text-sm font-bold">{title}</div>
        <div className="text-[11px] leading-5 text-muted-foreground">{subtitle}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} data-testid={testId} />
    </div>
  );
}
