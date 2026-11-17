// صفحة المحضر — /dashboard/meetings/:id/minutes
// رابط ثابت للمحضر بدل حوار لا يُفتح إلا من قائمة الأسبوع: المسودة للمضيف وحده،
// الحفظ مستقل عن الاعتماد، المهام بمسؤول وموعد وحالة، والاعتماد يوضح لمن سيُرسل.

import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageShell } from "@/components/dashboard/DashboardPageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
import { apiRequest, apiUrl } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { ArrowRight, Download, Loader2, Plus, Trash2 } from "lucide-react";
import {
  DECISIONS_FORMS,
  EMPTY_MINUTES,
  MINUTES_FORMS,
  RECIPIENTS_FORMS,
  TASKS_FORMS,
  arCount,
  cleanMinutesForSave,
  formatMs,
  minutesEqual,
  minutesStatusLabel,
  normalizeMinutes,
  transcriptDeletionDate,
  type MinutesDoc,
  type MinutesTask,
} from "@/components/meetings/minutesShared";

type Attendee = {
  participantId: string;
  name: string;
  role: string;
  status: string;
  rsvp: string | null;
  isGuest: boolean;
  joinedAt: string | null;
};

type MeetingDetail = {
  id: string;
  title: string;
  status: string;
  startedAt: string | null;
  endedAt: string | null;
  isHost: boolean;
  attendance?: { attendees?: Attendee[] };
};

type MinutesResponse = {
  minutesEnabled: boolean;
  minutesStatus: string;
  minutes: unknown;
  minutesGeneratedAt: string | null;
  minutesApprovedAt: string | null;
  isHost: boolean;
  recipients?: number;
  canDownloadPdf?: boolean;
  stats?: { segments: number; speakers: number; diagnosis?: string | null };
};

type TranscriptResponse = {
  segments: Array<{ speakerName: string; text: string; startMs: number }>;
};

const DATE_FMT = new Intl.DateTimeFormat("ar-u-ca-gregory-nu-latn", {
  weekday: "long", day: "numeric", month: "long", year: "numeric",
});
const SHORT_DATE_FMT = new Intl.DateTimeFormat("ar-u-ca-gregory-nu-latn", {
  day: "numeric", month: "long", year: "numeric",
});
const TIME_FMT = new Intl.DateTimeFormat("ar-u-ca-gregory-nu-latn", {
  hour: "numeric", minute: "2-digit",
});

function safeDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

const TONE_CLASS: Record<string, string> = {
  ok: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  warn: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  bad: "bg-destructive/10 text-destructive",
  muted: "bg-muted text-muted-foreground",
};

function Panel({
  title, aside, children, testId,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-border bg-card" data-testid={testId}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="text-sm font-bold">{title}</h2>
        {aside}
      </header>
      <div className="px-4 py-3 text-sm leading-7">{children}</div>
    </section>
  );
}

export default function MeetingMinutesPage() {
  const params = useParams<{ id: string }>();
  const meetingId = params.id;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const detailKey = `/api/meetings/${meetingId}`;
  const minutesKey = `/api/meetings/${meetingId}/minutes`;
  const transcriptKey = `/api/meetings/${meetingId}/transcript`;

  const { data: detailRaw, isLoading: detailLoading, error: detailError } = useQuery({
    queryKey: [detailKey],
    enabled: Boolean(meetingId),
  });
  const meeting = (detailRaw ?? null) as MeetingDetail | null;

  const { data: minutesRaw, isLoading: minutesLoading } = useQuery({
    queryKey: [minutesKey],
    enabled: Boolean(meetingId),
    staleTime: 0,
    // التفريغ والتوليد يكتملان في الخلفية — نتابع الحالة حتى تستقر
    refetchInterval: (query) => {
      const s = (query.state.data as MinutesResponse | null | undefined)?.minutesStatus;
      return s === "recording" || s === "generating" ? 5_000 : false;
    },
  });
  const data = (minutesRaw ?? null) as MinutesResponse | null;
  const status = data?.minutesStatus ?? "none";
  const isHost = Boolean(data?.isHost);
  const saved = useMemo(() => normalizeMinutes(data?.minutes), [data?.minutes]);
  const hasMinutes = status === "draft" || status === "approved";

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<MinutesDoc>(EMPTY_MINUTES);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);

  // خروج من وضع التحرير إن تغيّرت الحالة (اعتماد من تبويب آخر، إعادة توليد)
  useEffect(() => {
    if (status !== "draft") setEditing(false);
  }, [status]);

  const dirty = editing && !minutesEqual(draft, saved);

  const { data: transcriptRaw, isFetching: transcriptLoading } = useQuery({
    queryKey: [transcriptKey],
    enabled: Boolean(meetingId) && showTranscript && isHost,
  });
  const segmentsRaw = (transcriptRaw as TranscriptResponse | null | undefined)?.segments;
  const segments = Array.isArray(segmentsRaw) ? segmentsRaw : [];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [minutesKey] });
    queryClient.invalidateQueries({ queryKey: [detailKey] });
    queryClient.invalidateQueries({ queryKey: ["/api/meetings-archive"] });
    queryClient.invalidateQueries({ queryKey: ["/api/meetings-archive/open-tasks"] });
  };

  const saveDraft = useMutation({
    mutationFn: (doc: MinutesDoc) =>
      apiRequest(minutesKey, { method: "PATCH", body: JSON.stringify(cleanMinutesForSave(doc)) }),
    onSuccess: () => {
      invalidate();
      setEditing(false);
      toast({ title: "حُفظت المسودة" });
    },
    onError: (e: Error) =>
      toast({ title: "تعذر حفظ المسودة", description: e.message, variant: "destructive" }),
  });

  const approve = useMutation({
    mutationFn: async () => {
      // تعديلات غير محفوظة تُحفظ أولاً حتى يُعتمد ويُرسل ما يراه المضيف
      if (dirty) {
        await apiRequest(minutesKey, { method: "PATCH", body: JSON.stringify(cleanMinutesForSave(draft)) });
      }
      return apiRequest<{ emailsSent?: number }>(`${minutesKey}/approve`, { method: "POST" });
    },
    onSuccess: (r) => {
      invalidate();
      setConfirmApprove(false);
      setEditing(false);
      toast({
        title: "اعتُمد المحضر",
        description: `أُرسل بالبريد إلى ${arCount(r?.emailsSent ?? 0, RECIPIENTS_FORMS)}`,
      });
    },
    onError: (e: Error) => {
      setConfirmApprove(false);
      invalidate();
      toast({ title: "تعذر الاعتماد", description: e.message, variant: "destructive" });
    },
  });

  const regenerate = useMutation({
    mutationFn: () => apiRequest(`${minutesKey}/regenerate`, { method: "POST" }),
    onSuccess: () => {
      invalidate();
      toast({ title: "أُعيد توليد المحضر" });
    },
    onError: (e: Error) =>
      toast({ title: "تعذر إعادة التوليد", description: e.message, variant: "destructive" }),
  });

  const toggleTask = useMutation({
    mutationFn: ({ index, done, task }: { index: number; done: boolean; task: string }) =>
      apiRequest(`${minutesKey}/tasks/${index}`, { method: "PATCH", body: JSON.stringify({ done, task }) }),
    onSuccess: invalidate,
    onError: (e: Error) => {
      // 409: القائمة تغيّرت في تبويب آخر — نجلب الحالة الحالية
      invalidate();
      toast({ title: "تعذر تحديث المهمة", description: e.message, variant: "destructive" });
    },
  });

  const back = () => setLocation("/dashboard/meetings");

  if (detailLoading || minutesLoading) {
    return (
      <DashboardLayout>
        <DashboardPageShell maxWidthClassName="max-w-[1000px]">
          <div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> جارٍ تحميل المحضر…
          </div>
        </DashboardPageShell>
      </DashboardLayout>
    );
  }

  if (detailError || !meeting || !data) {
    return (
      <DashboardLayout>
        <DashboardPageShell maxWidthClassName="max-w-[1000px]">
          <div className="space-y-4 py-10 text-center">
            <p className="text-sm text-muted-foreground">تعذر فتح المحضر أو أنه غير متاح لك.</p>
            <Button variant="outline" onClick={back}>العودة للاجتماعات</Button>
          </div>
        </DashboardPageShell>
      </DashboardLayout>
    );
  }

  const doc = editing ? draft : saved;
  const started = safeDate(meeting.startedAt);
  const ended = safeDate(meeting.endedAt);
  const durationMin = started && ended && ended > started
    ? Math.max(1, Math.round((ended.getTime() - started.getTime()) / 60_000))
    : null;
  const attendeesRaw = meeting.attendance?.attendees;
  const attendees = Array.isArray(attendeesRaw) ? attendeesRaw : [];
  const attended = attendees.filter((a) => a.status === "admitted" && a.joinedAt);
  const absent = attendees.filter((a) => !a.isGuest && a.role !== "host" && !a.joinedAt);
  const statusChip = minutesStatusLabel(status, isHost);
  const noTranscript = isHost && data.stats?.segments === 0;
  const sttFailure = noTranscript && Boolean(data.stats?.diagnosis?.startsWith("stt-"));
  const deletion = transcriptDeletionDate(meeting.endedAt);
  const canEdit = isHost && status === "draft";
  const canToggleTasks = isHost && hasMinutes && !editing;
  const busy = saveDraft.isPending || approve.isPending || regenerate.isPending;

  const startEditing = () => {
    setDraft(saved);
    setEditing(true);
  };
  const setList = (key: "decisions" | "deferred", i: number, value: string) =>
    setDraft((d) => ({ ...d, [key]: d[key].map((x, j) => (j === i ? value : x)) }));
  const addToList = (key: "decisions" | "deferred") =>
    setDraft((d) => ({ ...d, [key]: [...d[key], ""] }));
  const removeFromList = (key: "decisions" | "deferred", i: number) =>
    setDraft((d) => ({ ...d, [key]: d[key].filter((_, j) => j !== i) }));
  const setTask = (i: number, patch: Partial<MinutesTask>) =>
    setDraft((d) => ({ ...d, actionItems: d.actionItems.map((a, j) => (j === i ? { ...a, ...patch } : a)) }));

  // رسالة الحالة حين لا يوجد محضر يُعرض
  const emptyMessage = (() => {
    if (!data.minutesEnabled) return "لم يُفعَّل مُدوِّن سبق AI لهذا الاجتماع، فلا محضر له.";
    if (meeting.status !== "ended") return "يُولَّد المحضر بعد انتهاء الاجتماع.";
    switch (status) {
      case "recording":
        return "اكتمل الاجتماع، والتفريغ يُجمَّع الآن. تتحدث هذه الصفحة تلقائيًا.";
      case "generating":
        return "جارٍ توليد المحضر من التفريغ. تتحدث هذه الصفحة تلقائيًا.";
      case "failed":
        if (sttFailure) return "تعطلت خدمة التفريغ في هذا الاجتماع، فلا محضر له. أبلغ الفريق التقني.";
        if (noTranscript) return "لم يُلتقط كلام في هذا الاجتماع، فلا محضر له.";
        return isHost ? "تعذر توليد المحضر. جرّب إعادة التوليد." : "لا يوجد محضر لهذا الاجتماع.";
      case "draft":
        return "المحضر قيد المراجعة لدى مضيف الاجتماع، ويظهر هنا بعد اعتماده.";
      default:
        return "لا يوجد محضر لهذا الاجتماع بعد.";
    }
  })();

  const showDocument = hasMinutes && (isHost || status === "approved");

  return (
    <DashboardLayout>
      <DashboardPageShell maxWidthClassName="max-w-[1000px]">
        <div className="space-y-5">
          <button
            type="button"
            onClick={back}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            data-testid="link-minutes-back"
          >
            <ArrowRight className="h-3.5 w-3.5" /> الاجتماعات · أرشيف المحاضر
          </button>

          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <h1 className="text-xl font-bold leading-snug sm:text-2xl" data-testid="text-minutes-title">
                محضر {meeting.title}
              </h1>
              <p className="text-xs text-muted-foreground" data-testid="text-minutes-meta">
                {[
                  ended ? DATE_FMT.format(ended) : started ? DATE_FMT.format(started) : null,
                  started && ended ? `${TIME_FMT.format(started)} – ${TIME_FMT.format(ended)}` : null,
                  durationMin ? arCount(durationMin, MINUTES_FORMS) : null,
                  isHost && attendees.length ? `حضر ${attended.length} من ${attendees.length}` : null,
                ].filter(Boolean).join(" · ")}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn("rounded-md px-2.5 py-1 text-xs font-bold", TONE_CLASS[statusChip.tone])}
                data-testid="chip-minutes-status"
              >
                {status === "draft" && isHost ? "مسودة: تراها أنت فقط حتى تعتمدها" : statusChip.label}
              </span>
              {data.canDownloadPdf && !editing ? (
                <Button asChild size="sm" variant={status === "approved" ? "default" : "outline"}>
                  <a href={apiUrl(`${minutesKey}/pdf`)} download data-testid="link-minutes-pdf">
                    <Download className="ml-1 h-4 w-4" />
                    {status === "approved" ? "تحميل PDF" : "معاينة PDF للمسودة"}
                  </a>
                </Button>
              ) : null}
              {data.canDownloadPdf && isHost && !editing && (data.stats?.segments ?? 0) > 0 ? (
                <Button asChild size="sm" variant="outline">
                  <a
                    href={apiUrl(`${minutesKey}/pdf?transcript=1`)}
                    download
                    title="نسخة لك وحدك: المحضر وبعده ملحق التفريغ. لا تُوزَّع."
                    data-testid="link-minutes-pdf-transcript"
                  >
                    <Download className="ml-1 h-4 w-4" />
                    PDF مع التفريغ (لك فقط)
                  </a>
                </Button>
              ) : null}
            </div>
          </div>

          {!showDocument ? (
            <div className="rounded-xl border border-border bg-card px-4 py-10 text-center" data-testid="text-minutes-empty">
              <p className="mx-auto max-w-md text-sm leading-7 text-muted-foreground">
                {status === "recording" || status === "generating" ? (
                  <Loader2 className="ml-2 inline h-4 w-4 animate-spin" />
                ) : null}
                {emptyMessage}
              </p>
              {isHost && status === "failed" && !noTranscript ? (
                <Button
                  variant="outline"
                  className="mt-4"
                  disabled={busy}
                  onClick={() => regenerate.mutate()}
                  data-testid="button-minutes-regenerate"
                >
                  {regenerate.isPending ? <Loader2 className="ml-1 h-4 w-4 animate-spin" /> : null}
                  إعادة التوليد
                </Button>
              ) : null}
            </div>
          ) : (
            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
              <div className="min-w-0 space-y-4">
                <Panel
                  title="الملخص"
                  testId="panel-minutes-summary"
                  aside={canEdit && !editing ? (
                    <Button size="sm" variant="outline" onClick={startEditing} data-testid="button-minutes-edit">
                      تعديل المحضر
                    </Button>
                  ) : null}
                >
                  {editing ? (
                    <Textarea
                      value={draft.summary}
                      onChange={(e) => setDraft((d) => ({ ...d, summary: e.target.value }))}
                      rows={5}
                      aria-label="ملخص الاجتماع"
                      data-testid="input-minutes-summary"
                    />
                  ) : (
                    <p className="whitespace-pre-wrap">{doc.summary || "لا ملخص."}</p>
                  )}
                </Panel>

                <Panel title={`القرارات (${doc.decisions.length})`} testId="panel-minutes-decisions">
                  <EditableList
                    items={doc.decisions}
                    editing={editing}
                    empty="لا قرارات مسجلة."
                    addLabel="إضافة قرار"
                    itemLabel="قرار"
                    onChange={(i, v) => setList("decisions", i, v)}
                    onAdd={() => addToList("decisions")}
                    onRemove={(i) => removeFromList("decisions", i)}
                  />
                </Panel>

                <Panel
                  title={`المهام (${doc.actionItems.length})`}
                  testId="panel-minutes-tasks"
                  aside={editing ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDraft((d) => ({ ...d, actionItems: [...d.actionItems, { task: "", owner: null, due: null }] }))}
                      data-testid="button-minutes-add-task"
                    >
                      <Plus className="ml-1 h-3.5 w-3.5" /> إضافة مهمة
                    </Button>
                  ) : null}
                >
                  {doc.actionItems.length === 0 ? (
                    <p className="text-muted-foreground">لا مهام مسجلة.</p>
                  ) : editing ? (
                    <div className="space-y-3">
                      {draft.actionItems.map((a, i) => (
                        <div key={i} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px_130px_auto]">
                          <Input
                            value={a.task}
                            onChange={(e) => setTask(i, { task: e.target.value })}
                            placeholder="المهمة"
                            aria-label={`المهمة ${i + 1}`}
                          />
                          <Input
                            value={a.owner ?? ""}
                            onChange={(e) => setTask(i, { owner: e.target.value })}
                            placeholder="المسؤول"
                            aria-label={`مسؤول المهمة ${i + 1}`}
                          />
                          <Input
                            value={a.due ?? ""}
                            onChange={(e) => setTask(i, { due: e.target.value })}
                            placeholder="الموعد"
                            aria-label={`موعد المهمة ${i + 1}`}
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => setDraft((d) => ({ ...d, actionItems: d.actionItems.filter((_, j) => j !== i) }))}
                            aria-label={`حذف المهمة ${i + 1}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <ul className="-mx-4 -my-3 divide-y divide-border">
                      {doc.actionItems.map((a, i) => (
                        <li
                          key={i}
                          className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-1 px-4 py-3 sm:grid-cols-[auto_minmax(0,1fr)_140px_110px_70px] sm:items-center"
                          data-testid={`row-minutes-task-${i}`}
                        >
                          {/* المربع بحجمه الطبيعي داخل هدف لمس 44px (القاعدة العامة تنفخ الزر نفسه) */}
                          <label className="-m-3 flex h-11 w-11 shrink-0 items-center justify-center">
                            <Checkbox
                              className="no-min-touch-size"
                              checked={Boolean(a.done)}
                              disabled={!canToggleTasks || toggleTask.isPending}
                              onCheckedChange={(v) => toggleTask.mutate({ index: i, done: v === true, task: a.task })}
                              aria-label={a.done ? `إعادة فتح: ${a.task}` : `إنجاز: ${a.task}`}
                              data-testid={`checkbox-minutes-task-${i}`}
                            />
                          </label>
                          <span className={cn("font-medium leading-6", a.done && "text-muted-foreground line-through")}>
                            {a.task}
                          </span>
                          <span className="col-start-2 text-xs text-muted-foreground sm:col-start-auto sm:text-sm sm:text-foreground">
                            {a.owner || "بلا مسؤول"}
                            <span className="sm:hidden"> · {a.due || "بلا موعد"}</span>
                          </span>
                          <span className="hidden text-xs text-muted-foreground sm:inline">
                            {a.due || "بلا موعد"}
                          </span>
                          <span
                            className={cn(
                              "col-start-2 w-fit rounded-md px-2 py-0.5 text-xs font-bold sm:col-start-auto",
                              a.done ? TONE_CLASS.ok : TONE_CLASS.warn,
                            )}
                          >
                            {a.done ? "منجزة" : "جارية"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>

                <Panel title="نقاط مؤجلة" testId="panel-minutes-deferred">
                  <EditableList
                    items={doc.deferred}
                    editing={editing}
                    empty="لا نقاط مؤجلة."
                    addLabel="إضافة نقطة"
                    itemLabel="نقطة مؤجلة"
                    onChange={(i, v) => setList("deferred", i, v)}
                    onAdd={() => addToList("deferred")}
                    onRemove={(i) => removeFromList("deferred", i)}
                  />
                </Panel>
              </div>

              <aside className="min-w-0 space-y-4">
                {canEdit ? (
                  <div className="space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm leading-6" data-testid="box-minutes-approve">
                    <p className="font-bold">
                      الاعتماد يرسل المحضر بالبريد إلى {arCount(data.recipients ?? 0, RECIPIENTS_FORMS)} ولا يمكن سحبه.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button disabled={busy} onClick={() => setConfirmApprove(true)} data-testid="button-minutes-approve">
                        اعتمد وأرسل
                      </Button>
                      {editing ? (
                        <>
                          <Button
                            variant="outline"
                            disabled={busy || !dirty}
                            onClick={() => saveDraft.mutate(draft)}
                            data-testid="button-minutes-save"
                          >
                            {saveDraft.isPending ? <Loader2 className="ml-1 h-4 w-4 animate-spin" /> : null}
                            احفظ المسودة
                          </Button>
                          <Button variant="ghost" disabled={busy} onClick={() => setEditing(false)}>
                            إلغاء التعديل
                          </Button>
                        </>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {editing
                        ? dirty
                          ? "لديك تعديلات غير محفوظة. الاعتماد يحفظها أولًا."
                          : "لا تعديلات بعد."
                        : "الحفظ مستقل عن الاعتماد، والضغط مرتين لا يكرر البريد."}
                    </p>
                  </div>
                ) : null}

                {status === "approved" ? (
                  <div className="rounded-xl border border-border bg-card p-4 text-sm leading-6" data-testid="box-minutes-approved">
                    <p className="font-bold">محضر معتمد</p>
                    <p className="text-xs text-muted-foreground">
                      {safeDate(data.minutesApprovedAt)
                        ? `اعتُمد ووُزّع بالبريد في ${SHORT_DATE_FMT.format(safeDate(data.minutesApprovedAt)!)}.`
                        : "اعتُمد ووُزّع بالبريد."}
                      {isHost ? " ما زال بإمكانك تحديث حالة المهام." : ""}
                    </p>
                  </div>
                ) : null}

                {isHost && attendees.length ? (
                  <Panel title="الحضور" aside={<span className="text-xs text-muted-foreground">{attended.length} من {attendees.length}</span>} testId="panel-minutes-attendance">
                    <div className="space-y-2 text-xs leading-6 text-muted-foreground">
                      <p>
                        <span className="font-bold text-foreground">حضروا: </span>
                        {attended.length ? attended.map((a) => a.name).join("، ") : "لا أحد"}
                      </p>
                      {absent.length ? (
                        <p>
                          <span className="font-bold text-foreground">لم يحضروا: </span>
                          {absent.map((a) => a.name).join("، ")}
                        </p>
                      ) : null}
                    </div>
                  </Panel>
                ) : null}

                {isHost ? (
                  <Panel title="التفريغ الخام" aside={<span className="text-xs text-muted-foreground">للمضيف فقط</span>} testId="panel-minutes-transcript">
                    <div className="space-y-3 text-xs leading-6 text-muted-foreground">
                      <p>
                        {arCount(data.stats?.segments ?? 0, { one: "مقطع واحد", two: "مقطعان", few: "مقاطع", many: "مقطعًا", zero: "لا مقاطع" })}
                        {deletion ? ` · يُحذف آليًا في ${SHORT_DATE_FMT.format(deletion)} (بعد 30 يومًا).` : "."}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!data.stats?.segments}
                          onClick={() => setShowTranscript((v) => !v)}
                          aria-expanded={showTranscript}
                          data-testid="button-minutes-transcript"
                        >
                          {showTranscript ? "إخفاء التفريغ" : "عرض التفريغ"}
                        </Button>
                        {status === "draft" && !noTranscript ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy || editing}
                            onClick={() => regenerate.mutate()}
                            data-testid="button-minutes-regenerate"
                          >
                            {regenerate.isPending ? <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin" /> : null}
                            إعادة التوليد
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </Panel>
                ) : null}
              </aside>
            </div>
          )}

          {isHost && showTranscript ? (
            <Panel title="نص التفريغ" testId="panel-minutes-transcript-text">
              {transcriptLoading ? (
                <p className="text-muted-foreground"><Loader2 className="ml-2 inline h-4 w-4 animate-spin" /> جارٍ تحميل التفريغ…</p>
              ) : segments.length === 0 ? (
                <p className="text-muted-foreground">لا يوجد تفريغ محفوظ لهذا الاجتماع.</p>
              ) : (
                <ol className="max-h-[420px] space-y-2 overflow-y-auto">
                  {segments.map((s, i) => (
                    <li key={i} className="grid grid-cols-[48px_minmax(0,1fr)] gap-2">
                      <span className="text-xs tabular-nums text-muted-foreground" dir="ltr">{formatMs(s.startMs)}</span>
                      <span>
                        <span className="font-bold">{s.speakerName}: </span>
                        {s.text}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </Panel>
          ) : null}
        </div>
      </DashboardPageShell>

      <AlertDialog open={confirmApprove} onOpenChange={(o) => !approve.isPending && setConfirmApprove(o)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>اعتماد المحضر وإرساله؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيُرسل «محضر {meeting.title}» بالبريد إلى {arCount(data.recipients ?? 0, RECIPIENTS_FORMS)}، ويصبح ظاهرًا لكل مشارك.
              {" "}
              {arCount(cleanMinutesForSave(doc).decisions.length, DECISIONS_FORMS)} و{arCount(cleanMinutesForSave(doc).actionItems.length, TASKS_FORMS)}.
              {dirty ? " تعديلاتك غير المحفوظة ستُحفظ أولًا." : ""}
              {" "}لا يمكن سحب المحضر بعد الاعتماد.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:flex-row-reverse sm:justify-start">
            <AlertDialogCancel disabled={approve.isPending}>تراجع</AlertDialogCancel>
            <AlertDialogAction
              disabled={approve.isPending}
              onClick={(e) => {
                e.preventDefault();
                approve.mutate();
              }}
              data-testid="button-minutes-confirm-approve"
            >
              {approve.isPending ? <Loader2 className="ml-1 h-4 w-4 animate-spin" /> : null}
              اعتمد وأرسل
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}

function EditableList({
  items, editing, empty, addLabel, itemLabel, onChange, onAdd, onRemove,
}: {
  items: string[];
  editing: boolean;
  empty: string;
  addLabel: string;
  itemLabel: string;
  onChange: (index: number, value: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  if (!editing) {
    return items.length ? (
      <ul className="list-disc space-y-1 pr-5">
        {items.map((d, i) => <li key={i}>{d}</li>)}
      </ul>
    ) : (
      <p className="text-muted-foreground">{empty}</p>
    );
  }
  return (
    <div className="space-y-2">
      {items.map((d, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input value={d} onChange={(e) => onChange(i, e.target.value)} aria-label={`${itemLabel} ${i + 1}`} />
          <Button
            size="icon"
            variant="ghost"
            className="shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => onRemove(i)}
            aria-label={`حذف ${itemLabel} ${i + 1}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button size="sm" variant="outline" onClick={onAdd}>
        <Plus className="ml-1 h-3.5 w-3.5" /> {addLabel}
      </Button>
    </div>
  );
}
