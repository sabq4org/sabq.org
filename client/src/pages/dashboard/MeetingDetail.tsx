// صفحة تفاصيل الاجتماع — /dashboard/meetings/:id
// تجمّع الموعد، المضيف، الأجندة، والحضور (RSVP/انتظار) قبل وبعد الجلسة.

import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageShell } from "@/components/dashboard/DashboardPageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
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
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, apiUrl } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import {
  ArrowRight, CalendarClock, Check, Clock, Copy, FileText, Headphones,
  Link2, ListOrdered, Loader2, Plus, Radio, Trash2, UserRound, Users, X,
} from "lucide-react";

type AgendaItem = {
  id: string;
  title: string;
  durationMinutes: number | null;
  done: boolean;
};

type AttendanceEntry = {
  participantId: string;
  userId: string | null;
  name: string;
  avatarUrl: string | null;
  department: string | null;
  role: string;
  status: string;
  rsvp: string | null;
  rsvpAt: string | null;
  isGuest: boolean;
  joinedAt: string | null;
  leftAt: string | null;
};

type MeetingDetail = {
  id: string;
  title: string;
  description: string | null;
  accessType: string;
  status: string;
  requireApproval: boolean;
  muteOnJoin: boolean;
  isLocked: boolean;
  minutesEnabled: boolean;
  minutesStatus: string;
  durationMinutes: number | null;
  agenda: AgendaItem[];
  scheduledAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  inviteToken: string | null;
  isHost: boolean;
  myRsvp: "yes" | "no" | null;
  configured: boolean;
  host: {
    userId: string;
    name: string;
    avatarUrl: string | null;
    department: string | null;
    jobTitle: string | null;
  };
  attendance: {
    counts: {
      invited: number;
      rsvpYes: number;
      rsvpNo: number;
      rsvpPending: number;
      waiting: number;
      inRoom: number;
    };
    attendees: AttendanceEntry[];
  };
};

const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("ar", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function initialsOf(name: string): string {
  return name.trim().slice(0, 2);
}

function statusMeta(status: string): { label: string; className: string } {
  switch (status) {
    case "live":
      return { label: "مباشر", className: "bg-red-600 text-white" };
    case "scheduled":
      return { label: "مجدول", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30" };
    case "ended":
      return { label: "منتهٍ", className: "bg-muted text-muted-foreground" };
    case "cancelled":
      return { label: "ملغى", className: "bg-destructive/10 text-destructive" };
    default:
      return { label: status, className: "bg-muted text-muted-foreground" };
  }
}

export default function MeetingDetailPage() {
  const params = useParams<{ id: string }>();
  const meetingId = params.id;
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [liveToast, setLiveToast] = useState<string | null>(null);

  const detailKey = `/api/meetings/${meetingId}`;
  const { data: dataRaw, isLoading, error } = useQuery({
    queryKey: [detailKey],
    enabled: Boolean(meetingId),
    refetchInterval: 30_000,
  });
  const meeting = (dataRaw ?? null) as MeetingDetail | null;

  // تحديث لحظي عند كل موافقة/تعديل
  useEffect(() => {
    if (!meetingId) return;
    const es = new EventSource(apiUrl(`/api/meetings/${meetingId}/events`), { withCredentials: true });
    const refresh = () => {
      queryClient.invalidateQueries({ queryKey: [detailKey] });
      queryClient.invalidateQueries({ queryKey: ["/api/meetings"] });
    };
    es.addEventListener("rsvp_updated", (ev) => {
      refresh();
      try {
        const p = JSON.parse((ev as MessageEvent).data) as { name?: string; response?: string };
        if (p.name && p.response) {
          setLiveToast(
            p.response === "yes" ? `${p.name} أكّد الحضور` : `${p.name} اعتذر`,
          );
        }
      } catch { /* */ }
    });
    es.addEventListener("meeting_updated", refresh);
    es.addEventListener("meeting_started", refresh);
    es.addEventListener("meeting_ended", refresh);
    es.addEventListener("join_requested", refresh);
    es.addEventListener("request_resolved", refresh);
    return () => es.close();
  }, [meetingId, detailKey, queryClient]);

  useEffect(() => {
    if (!liveToast) return;
    const t = setTimeout(() => setLiveToast(null), 4000);
    return () => clearTimeout(t);
  }, [liveToast]);

  const rsvpMutation = useMutation({
    mutationFn: (response: "yes" | "no") =>
      apiRequest(`/api/meetings/${meetingId}/rsvp`, {
        method: "POST",
        body: JSON.stringify({ response }),
      }),
    onSuccess: (_d, response) => {
      queryClient.invalidateQueries({ queryKey: [detailKey] });
      queryClient.invalidateQueries({ queryKey: ["/api/meetings"] });
      toast({
        title: response === "yes" ? "تم تأكيد حضورك" : "نعتذر عن غيابك",
        description: response === "yes"
          ? "بانتظارك في موعد الاجتماع"
          : "الدعوة تبقى قائمة متى زال ظرفك",
      });
    },
    onError: (e: Error) => toast({ title: "تعذر حفظ ردك", description: e.message, variant: "destructive" }),
  });

  const cancelMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/meetings/${meetingId}`, {
        method: "PATCH",
        body: JSON.stringify({ cancel: true }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [detailKey] });
      queryClient.invalidateQueries({ queryKey: ["/api/meetings"] });
      setCancelOpen(false);
      toast({ title: "أُلغي الاجتماع" });
    },
    onError: (e: Error) => toast({ title: "تعذر الإلغاء", description: e.message, variant: "destructive" }),
  });

  const copyInvite = async () => {
    if (!meeting?.inviteToken) return;
    const url = `${window.location.origin}/meet/${meeting.inviteToken}`;
    await navigator.clipboard.writeText(url);
    toast({ title: "نُسخ رابط الدعوة" });
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <DashboardPageShell maxWidthClassName="max-w-[960px]">
          <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> جارٍ تحميل التفاصيل…
          </div>
        </DashboardPageShell>
      </DashboardLayout>
    );
  }

  if (error || !meeting) {
    return (
      <DashboardLayout>
        <DashboardPageShell maxWidthClassName="max-w-[960px]">
          <div className="space-y-4 py-10 text-center">
            <p className="text-sm text-muted-foreground">تعذر فتح الاجتماع أو أنه غير متاح لك.</p>
            <Button variant="outline" onClick={() => setLocation("/dashboard/meetings")}>
              العودة للاجتماعات
            </Button>
          </div>
        </DashboardPageShell>
      </DashboardLayout>
    );
  }

  const st = statusMeta(meeting.status);
  const counts = meeting.attendance.counts;
  const yes = meeting.attendance.attendees.filter((a) => a.rsvp === "yes");
  const no = meeting.attendance.attendees.filter((a) => a.rsvp === "no");
  const pending = meeting.attendance.attendees.filter(
    (a) => a.role !== "host" && !a.isGuest && a.rsvp !== "yes" && a.rsvp !== "no",
  );
  const waiting = meeting.attendance.attendees.filter((a) => a.status === "pending");

  return (
    <DashboardLayout>
      <DashboardPageShell maxWidthClassName="max-w-[960px]">
        <div className="space-y-6">
          <button
            type="button"
            onClick={() => setLocation("/dashboard/meetings")}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowRight className="h-3.5 w-3.5" /> الاجتماعات
          </button>

          {liveToast ? (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
              {liveToast}
            </div>
          ) : null}

          {/* رأس */}
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-start gap-4">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("inline-flex items-center gap-1 rounded-md px-2.5 py-0.5 text-xs font-bold", st.className)}>
                    {meeting.status === "live" ? <Radio className="h-3 w-3 animate-pulse" /> : null}
                    {st.label}
                  </span>
                  {meeting.minutesEnabled ? (
                    <Badge variant="outline" className="gap-1 text-[11px]">
                      <FileText className="h-3 w-3" /> أمين المحضر
                    </Badge>
                  ) : null}
                </div>
                <h1 className="text-xl font-bold leading-snug sm:text-2xl" data-testid="text-meeting-detail-title">
                  {meeting.title}
                </h1>
                {meeting.description ? (
                  <p className="text-sm leading-6 text-muted-foreground">{meeting.description}</p>
                ) : null}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <CalendarClock className="h-3.5 w-3.5" />
                    {meeting.status === "scheduled"
                      ? formatWhen(meeting.scheduledAt)
                      : meeting.status === "live"
                        ? `بدأ ${formatWhen(meeting.startedAt)}`
                        : formatWhen(meeting.endedAt || meeting.startedAt)}
                  </span>
                  {meeting.durationMinutes ? (
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" /> {meeting.durationMinutes} دقيقة
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {meeting.status === "live" ? (
                  <Button
                    onClick={() => setLocation(`/dashboard/meetings/room/${meeting.id}`)}
                    disabled={!meeting.configured}
                    data-testid="button-detail-join"
                  >
                    انضمام للغرفة
                  </Button>
                ) : null}
                {meeting.status === "scheduled" && meeting.isHost ? (
                  <Button
                    onClick={() => setLocation(`/dashboard/meetings/room/${meeting.id}`)}
                    disabled={!meeting.configured}
                    data-testid="button-detail-start"
                  >
                    بدء الآن
                  </Button>
                ) : null}
                {meeting.status === "scheduled" && !meeting.isHost ? (
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      variant={meeting.myRsvp === "yes" ? "default" : "outline"}
                      onClick={() => rsvpMutation.mutate("yes")}
                      disabled={rsvpMutation.isPending}
                    >
                      <Check className="ml-1 h-3.5 w-3.5" /> سأحضر
                    </Button>
                    <Button
                      size="sm"
                      variant={meeting.myRsvp === "no" ? "secondary" : "outline"}
                      onClick={() => rsvpMutation.mutate("no")}
                      disabled={rsvpMutation.isPending}
                    >
                      <X className="ml-1 h-3.5 w-3.5" /> لا أستطيع
                    </Button>
                  </div>
                ) : null}
                {meeting.isHost && meeting.inviteToken ? (
                  <Button size="sm" variant="outline" onClick={copyInvite}>
                    <Copy className="ml-1 h-3.5 w-3.5" /> رابط الدعوة
                  </Button>
                ) : null}
                {meeting.isHost && (meeting.status === "scheduled" || meeting.status === "live") ? (
                  <Button size="sm" variant="outline" onClick={() => setEditing((v) => !v)}>
                    {editing ? "إغلاق التعديل" : "تعديل"}
                  </Button>
                ) : null}
                {meeting.isHost && meeting.status === "scheduled" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive border-destructive/40"
                    onClick={() => setCancelOpen(true)}
                  >
                    إلغاء
                  </Button>
                ) : null}
              </div>
            </div>
          </div>

          {editing && meeting.isHost ? (
            <EditMeetingForm
              meeting={meeting}
              onSaved={() => {
                setEditing(false);
                queryClient.invalidateQueries({ queryKey: [detailKey] });
                queryClient.invalidateQueries({ queryKey: ["/api/meetings"] });
              }}
              onCancel={() => setEditing(false)}
            />
          ) : null}

          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            <div className="space-y-4">
              {/* أجندة */}
              <section className="rounded-xl border border-border bg-card p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-bold">
                  <ListOrdered className="h-4 w-4 text-primary" />
                  الأجندة
                  <span className="text-xs font-normal text-muted-foreground">
                    ({meeting.agenda.length} بند)
                  </span>
                </div>
                {meeting.agenda.length === 0 ? (
                  <p className="text-sm text-muted-foreground">لا أجندة محددة لهذا الاجتماع.</p>
                ) : (
                  <ol className="space-y-2">
                    {meeting.agenda.map((item, i) => (
                      <li
                        key={item.id}
                        className={cn(
                          "flex items-start gap-3 rounded-lg border border-border px-3 py-2.5",
                          item.done && "opacity-60",
                        )}
                      >
                        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold tabular-nums">
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className={cn("text-sm font-medium", item.done && "line-through")}>
                            {item.title}
                          </div>
                          {item.durationMinutes ? (
                            <div className="text-[11px] text-muted-foreground">
                              ~{item.durationMinutes} د
                            </div>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </section>

              {/* حضور */}
              <section className="rounded-xl border border-border bg-card p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-bold">
                  <Users className="h-4 w-4 text-primary" />
                  الحضور والردود
                </div>
                <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <CountPill label="سيحضرون" value={counts.rsvpYes} tone="emerald" />
                  <CountPill label="معتذرون" value={counts.rsvpNo} tone="amber" />
                  <CountPill label="لم يردوا" value={counts.rsvpPending} tone="muted" />
                  <CountPill label="في الانتظار" value={counts.waiting} tone="blue" />
                </div>

                <AttendanceGroup title={`سيحضرون (${yes.length})`} tone="emerald" entries={yes} empty="لا تأكيدات بعد" />
                <AttendanceGroup title={`معتذرون (${no.length})`} tone="amber" entries={no} empty="لا اعتذارات" className="mt-4" />
                {meeting.isHost && pending.length > 0 ? (
                  <AttendanceGroup
                    title={`لم يردوا بعد (${pending.length})`}
                    tone="muted"
                    entries={pending}
                    empty=""
                    className="mt-4"
                  />
                ) : null}
                {meeting.isHost && waiting.length > 0 ? (
                  <AttendanceGroup
                    title={`غرفة الانتظار (${waiting.length})`}
                    tone="blue"
                    entries={waiting}
                    empty=""
                    className="mt-4"
                  />
                ) : null}
              </section>
            </div>

            {/* المضيف */}
            <aside className="space-y-4">
              <section className="rounded-xl border border-border bg-card p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-bold">
                  <UserRound className="h-4 w-4 text-primary" />
                  مضيف الاجتماع
                </div>
                <div className="flex items-center gap-3">
                  <Avatar className="h-12 w-12">
                    {meeting.host.avatarUrl ? <AvatarImage src={meeting.host.avatarUrl} alt="" /> : null}
                    <AvatarFallback>{initialsOf(meeting.host.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="truncate font-bold">{meeting.host.name}</div>
                    {meeting.host.jobTitle ? (
                      <div className="truncate text-xs text-muted-foreground">{meeting.host.jobTitle}</div>
                    ) : null}
                    {meeting.host.department ? (
                      <div className="truncate text-[11px] text-muted-foreground">{meeting.host.department}</div>
                    ) : null}
                    {meeting.host.userId === user?.id ? (
                      <Badge variant="outline" className="mt-1 text-[10px]">أنت المضيف</Badge>
                    ) : null}
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground space-y-2">
                <div className="font-bold text-foreground">إعدادات الدخول</div>
                <div className="flex items-center gap-1.5">
                  <Link2 className="h-3.5 w-3.5" />
                  نمط الوصول: {accessLabel(meeting.accessType)}
                </div>
                <div>الموافقة قبل الدخول: {meeting.requireApproval ? "مفعّلة" : "مغلقة"}</div>
                <div>كتم عند الدخول: {meeting.muteOnJoin ? "نعم" : "لا"}</div>
                {meeting.status === "live" ? (
                  <div>داخل الغرفة الآن: {counts.inRoom}</div>
                ) : null}
              </section>

              {meeting.status === "ended" && meeting.minutesEnabled ? (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setLocation("/dashboard/meetings")}
                >
                  <FileText className="ml-1 h-4 w-4" /> فتح المحضر من القائمة
                </Button>
              ) : null}
            </aside>
          </div>
        </div>
      </DashboardPageShell>

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>إلغاء الاجتماع؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيُعلَم المدعوون بإلغاء «{meeting.title}». يمكن حذف السجل لاحقاً من القائمة.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:flex-row-reverse sm:justify-start">
            <AlertDialogCancel>تراجع</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={cancelMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                cancelMutation.mutate();
              }}
            >
              {cancelMutation.isPending ? <Loader2 className="ml-1 h-4 w-4 animate-spin" /> : null}
              تأكيد الإلغاء
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}

function accessLabel(type: string): string {
  switch (type) {
    case "all": return "جميع المنسوبين";
    case "department": return "إدارة محددة";
    case "selected": return "أعضاء محددون";
    case "link": return "رابط دعوة";
    default: return type;
  }
}

function CountPill({
  label, value, tone,
}: {
  label: string;
  value: number;
  tone: "emerald" | "amber" | "muted" | "blue";
}) {
  const toneClass = {
    emerald: "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400",
    amber: "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400",
    muted: "border-border bg-muted/40 text-muted-foreground",
    blue: "border-sky-500/30 bg-sky-500/5 text-sky-700 dark:text-sky-400",
  }[tone];
  return (
    <div className={cn("rounded-lg border px-3 py-2", toneClass)}>
      <div className="text-lg font-bold tabular-nums">{value}</div>
      <div className="text-[11px]">{label}</div>
    </div>
  );
}

function AttendanceGroup({
  title, tone, entries, empty, className,
}: {
  title: string;
  tone: "emerald" | "amber" | "muted" | "blue";
  entries: AttendanceEntry[];
  empty: string;
  className?: string;
}) {
  const titleClass = {
    emerald: "text-emerald-600 dark:text-emerald-400",
    amber: "text-amber-600 dark:text-amber-400",
    muted: "text-muted-foreground",
    blue: "text-sky-600 dark:text-sky-400",
  }[tone];
  return (
    <div className={className}>
      <div className={cn("mb-1.5 text-xs font-bold", titleClass)}>{title}</div>
      {entries.length === 0 ? (
        empty ? <div className="text-xs text-muted-foreground">{empty}</div> : null
      ) : (
        <div className="space-y-1.5">
          {entries.map((a) => (
            <div key={a.participantId} className="flex items-center gap-2">
              <Avatar className="h-7 w-7">
                {a.avatarUrl ? <AvatarImage src={a.avatarUrl} alt="" /> : null}
                <AvatarFallback className="text-[9px]">{initialsOf(a.name)}</AvatarFallback>
              </Avatar>
              <span className="text-xs font-medium">{a.name}</span>
              {a.department ? (
                <span className="text-[10px] text-muted-foreground">· {a.department}</span>
              ) : null}
              {a.role === "host" ? (
                <Badge variant="outline" className="text-[9px]">مضيف</Badge>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EditMeetingForm({
  meeting,
  onSaved,
  onCancel,
}: {
  meeting: MeetingDetail;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState(meeting.title);
  const [description, setDescription] = useState(meeting.description || "");
  const [scheduledAt, setScheduledAt] = useState(toLocalInput(meeting.scheduledAt));
  const [durationMinutes, setDurationMinutes] = useState(
    meeting.durationMinutes ? String(meeting.durationMinutes) : "",
  );
  const [requireApproval, setRequireApproval] = useState(meeting.requireApproval);
  const [muteOnJoin, setMuteOnJoin] = useState(meeting.muteOnJoin);
  const [agenda, setAgenda] = useState<AgendaItem[]>(
    meeting.agenda.length
      ? meeting.agenda
      : [],
  );
  const [newItem, setNewItem] = useState("");

  const saveMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/meetings/${meeting.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title,
          description: description || null,
          scheduledAt:
            meeting.status === "scheduled" && scheduledAt
              ? new Date(scheduledAt).toISOString()
              : undefined,
          durationMinutes: durationMinutes ? Number(durationMinutes) : null,
          agenda,
          requireApproval,
          muteOnJoin,
        }),
      }),
    onSuccess: () => {
      toast({ title: "تم حفظ التعديلات" });
      onSaved();
    },
    onError: (e: Error) =>
      toast({ title: "تعذر الحفظ", description: e.message, variant: "destructive" }),
  });

  const addAgendaItem = () => {
    const t = newItem.trim();
    if (!t) return;
    setAgenda((prev) => [
      ...prev,
      { id: crypto.randomUUID(), title: t, durationMinutes: null, done: false },
    ]);
    setNewItem("");
  };

  return (
    <section className="space-y-4 rounded-xl border border-primary/30 bg-card p-4">
      <div className="flex items-center gap-2 text-sm font-bold">
        <Headphones className="h-4 w-4 text-primary" /> تعديل الاجتماع
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <label className="text-xs font-bold">العنوان</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <label className="text-xs font-bold">الوصف</label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        </div>
        {meeting.status === "scheduled" ? (
          <div className="space-y-1.5">
            <label className="text-xs font-bold">موعد الاجتماع</label>
            <Input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              dir="ltr"
            />
          </div>
        ) : null}
        <div className="space-y-1.5">
          <label className="text-xs font-bold">المدة المتوقعة</label>
          <Select value={durationMinutes || "none"} onValueChange={(v) => setDurationMinutes(v === "none" ? "" : v)}>
            <SelectTrigger>
              <SelectValue placeholder="بدون تحديد" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">بدون تحديد</SelectItem>
              {DURATION_OPTIONS.map((d) => (
                <SelectItem key={d} value={String(d)}>{d} دقيقة</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-bold">الأجندة</label>
        <div className="space-y-1.5">
          {agenda.map((item, i) => (
            <div key={item.id} className="flex items-center gap-2">
              <span className="w-5 text-center text-[11px] text-muted-foreground">{i + 1}</span>
              <Input
                value={item.title}
                onChange={(e) =>
                  setAgenda((prev) =>
                    prev.map((a) => (a.id === item.id ? { ...a, title: e.target.value } : a)),
                  )
                }
                className="flex-1"
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={() => setAgenda((prev) => prev.filter((a) => a.id !== item.id))}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            placeholder="بند جديد…"
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addAgendaItem())}
          />
          <Button type="button" variant="outline" onClick={addAgendaItem}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
          <span className="text-sm">الموافقة قبل الدخول</span>
          <Switch checked={requireApproval} onCheckedChange={setRequireApproval} />
        </div>
        <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
          <span className="text-sm">كتم الميكروفون عند الدخول</span>
          <Switch checked={muteOnJoin} onCheckedChange={setMuteOnJoin} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={title.trim().length < 3 || saveMutation.isPending}
        >
          {saveMutation.isPending ? <Loader2 className="ml-1 h-4 w-4 animate-spin" /> : null}
          حفظ
        </Button>
        <Button variant="outline" onClick={onCancel}>إلغاء</Button>
      </div>
    </section>
  );
}
