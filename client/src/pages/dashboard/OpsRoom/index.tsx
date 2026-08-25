// غرفة عمليات سبق الذكية — صفحة تجريبية مستقلة (/dashboard/ops-room).
// الشريط العلوي (مؤشرات حقيقية + إنشاء + إيقاف الغرفة) → لوحة سير العمل
// بالأعمدة → خريطة الوكلاء بحالتهم الحية → النشاط اللحظي. كل رقم من
// سجل المهام الفعلي؛ لا بيانات وهمية.
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, Bot, CheckCircle2, Clock, Pause, Play, Plus, Radio, Users } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { OPS_PERMISSIONS, hasOpsPermission } from "@shared/opsRoom";
import { CreateTaskDialog } from "./CreateTaskDialog";
import { TaskDrawer } from "./TaskDrawer";
import {
  AGENT_STATUS_META,
  BOARD_COLUMNS,
  OPS_STATUS_LABELS_AR,
  OPS_TASK_TYPE_LABELS_AR,
  STATUS_BADGE,
  agentName,
  fmtDuration,
  timeAgoAr,
  type OpsRoomMetrics,
  type OpsRoomOverview,
  type OpsTaskSummary,
} from "./shared";

function StatTile({ icon: Icon, value, label, tone }: { icon: typeof Activity; value: string; label: string; tone?: string }) {
  return (
    <Card>
      <CardContent className="py-3 flex items-center gap-3">
        <Icon className={cn("w-5 h-5", tone ?? "text-primary")} />
        <div>
          <div className="text-lg font-bold tabular-nums leading-tight">{value}</div>
          <div className="text-[11px] text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function TaskCard({ task, onOpen }: { task: OpsTaskSummary; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="w-full text-right rounded-lg border bg-card p-2.5 hover:shadow-sm transition-shadow" data-testid={`ops-task-${task.id}`}>
      <div className="text-sm font-bold leading-snug line-clamp-2">{task.title}</div>
      <div className="mt-1 flex items-center gap-1.5 flex-wrap text-[10px] text-muted-foreground">
        <span>{OPS_TASK_TYPE_LABELS_AR[task.taskType as keyof typeof OPS_TASK_TYPE_LABELS_AR] ?? task.taskType}</span>
        <span>·</span>
        <span className="tabular-nums">{task.stepsCompleted}/{task.stepsTotal}</span>
        {task.currentAgentSlug && <><span>·</span><span>{agentName(task.currentAgentSlug)}</span></>}
        {task.riskLevel === "high" && <Badge variant="outline" className="text-[9px] px-1 py-0 border-red-300 text-red-700 dark:text-red-300">مخاطر عالية</Badge>}
      </div>
      <div className="mt-1.5 flex items-center justify-between">
        <span className={cn("text-[10px] rounded-full px-2 py-0.5", STATUS_BADGE[task.status])}>{OPS_STATUS_LABELS_AR[task.status]}</span>
        <span className="text-[10px] text-muted-foreground">{timeAgoAr(task.updatedAt)}</span>
      </div>
    </button>
  );
}

export default function OpsRoomPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const perms = useMemo(() => (Array.isArray(user?.permissions) ? (user!.permissions as string[]) : []), [user]);
  const canView = hasOpsPermission(perms, OPS_PERMISSIONS.view);
  const canCreate = hasOpsPermission(perms, OPS_PERMISSIONS.create);
  const canSettings = hasOpsPermission(perms, OPS_PERMISSIONS.settings);
  const canManageAgents = hasOpsPermission(perms, OPS_PERMISSIONS.agentsManage);

  const { data: raw, isLoading } = useQuery<OpsRoomOverview>({
    queryKey: ["/api/admin/ops-room/overview"],
    enabled: canView,
    refetchInterval: 5000,
  });
  const overview = raw ?? null;
  const { data: metricsRaw } = useQuery<OpsRoomMetrics>({ queryKey: ["/api/admin/ops-room/metrics"], enabled: canView, refetchInterval: 60_000 });
  const metrics = metricsRaw ?? null;

  const pause = useMutation({
    mutationFn: (paused: boolean) => apiRequest("/api/admin/ops-room/pause", { method: "POST", body: JSON.stringify({ paused }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/ops-room/overview"] }),
    onError: (err: Error) => toast({ title: "تعذر تغيير حالة الغرفة", description: err.message, variant: "destructive" }),
  });
  const toggleAgent = useMutation({
    mutationFn: ({ slug, enabled }: { slug: string; enabled: boolean }) => apiRequest(`/api/admin/ops-room/agents/${slug}`, { method: "POST", body: JSON.stringify({ enabled }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/ops-room/overview"] }),
    onError: (err: Error) => toast({ title: "تعذر تغيير حالة الوكيل", description: err.message, variant: "destructive" }),
  });

  if (authLoading) {
    return <DashboardLayout><Skeleton className="h-64 rounded-xl m-6" /></DashboardLayout>;
  }
  if (!canView) {
    return (
      <DashboardLayout>
        <Card className="max-w-lg mx-auto mt-16" dir="rtl"><CardContent className="py-10 text-center space-y-2">
          <Radio className="w-10 h-10 mx-auto text-muted-foreground" />
          <h2 className="text-lg font-bold">غرفة عمليات سبق الذكية</h2>
          <p className="text-sm text-muted-foreground">لا تملك صلاحية مشاهدة الغرفة (ops_room.view)</p>
        </CardContent></Card>
      </DashboardLayout>
    );
  }

  const tasks = Array.isArray(overview?.tasks) ? overview!.tasks : [];
  const agents = Array.isArray(overview?.agents) ? overview!.agents : [];
  const activity = Array.isArray(overview?.activity) ? overview!.activity : [];

  return (
    <DashboardLayout>
      <div dir="rtl" className="mx-auto max-w-[1600px] space-y-5 px-4 pb-10 sm:px-6">
        <DashboardPageHeader
          icon={Radio}
          title={<span>غرفة عمليات سبق الذكية <Badge variant="outline" className="ms-2 align-middle">تجريبية</Badge></span>}
          description="الوكلاء يتبادلون المهام عبر سجل مركزي بمخرجات منظمة — لا نشر ولا إرسال دون اعتماد بشري صريح"
          actions={
            <div className="flex gap-2">
              {canSettings && overview && (
                <Button variant={overview.paused ? "default" : "outline"} size="sm" onClick={() => pause.mutate(!overview.paused)} disabled={pause.isPending}>
                  {overview.paused ? <><Play className="w-4 h-4 me-1" /> تشغيل الغرفة</> : <><Pause className="w-4 h-4 me-1" /> إيقاف استقبال المهام</>}
                </Button>
              )}
              {canCreate && (
                <Button size="sm" onClick={() => setCreateOpen(true)} disabled={overview?.paused}><Plus className="w-4 h-4 me-1" /> مهمة جديدة</Button>
              )}
            </div>
          }
        />

        {overview?.paused && (
          <div className="rounded-lg border border-amber-400 bg-amber-50 dark:bg-amber-950 px-3 py-2 text-sm">الغرفة متوقفة: لا تُستقبل مهام جديدة ولا تُوزَّع خطوات؛ الخطوات الجارية تكمل ثم تنتظر.</div>
        )}

        {/* الشريط العلوي */}
        {isLoading || !overview ? (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3" data-testid="ops-stats">
            <StatTile icon={Activity} value={String(overview.stats.active)} label="مهام نشطة" />
            <StatTile icon={AlertTriangle} value={String(overview.stats.stuck)} label="متعثرة أو تحتاج معلومات" tone="text-red-600" />
            <StatTile icon={Clock} value={String(overview.stats.awaitingApproval)} label="تنتظر اعتمادًا بشريًا" tone="text-amber-600" />
            <StatTile icon={CheckCircle2} value={overview.stats.avgDurationMs === null ? "—" : fmtDuration(overview.stats.avgDurationMs)} label={`متوسط زمن الإنجاز (${overview.stats.completed7d} مهمة/7 أيام)`} tone="text-emerald-600" />
            <StatTile icon={Bot} value={metrics ? `$${metrics.aiCostUsd30d}` : "—"} label={metrics ? `تكلفة النماذج 30 يومًا (${metrics.aiCalls30d} استدعاء)` : "تكلفة النماذج"} />
          </div>
        )}

        {/* لوحة سير العمل */}
        <section>
          <h2 className="text-sm font-bold mb-2">لوحة سير العمل</h2>
          <div className="overflow-x-auto pb-2">
            <div className="grid grid-flow-col auto-cols-[minmax(230px,1fr)] gap-3 min-w-[900px]">
              {BOARD_COLUMNS.map((col) => {
                const items = tasks.filter((t) => col.statuses.includes(t.status));
                return (
                  <div key={col.key} className="rounded-xl border bg-muted/30 p-2 min-h-[200px]">
                    <div className="flex items-center gap-2 mb-2 px-1">
                      <span className={cn("w-2 h-2 rounded-full", col.tone)} />
                      <span className="text-xs font-bold">{col.labelAr}</span>
                      <span className="text-[10px] text-muted-foreground tabular-nums">{items.length}</span>
                    </div>
                    <div className="space-y-2">
                      {items.slice(0, 30).map((t) => <TaskCard key={t.id} task={t} onOpen={() => setOpenTaskId(t.id)} />)}
                      {items.length === 0 && <div className="text-[11px] text-muted-foreground px-1">لا مهام</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* خريطة الوكلاء */}
        <section>
          <h2 className="text-sm font-bold mb-2 flex items-center gap-2"><Users className="w-4 h-4" /> خريطة الوكلاء</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2">
            {agents.map((a) => {
              const meta = AGENT_STATUS_META[a.status];
              return (
                <Card key={a.slug} className={cn(a.status === "stuck" && "border-red-300", a.status === "working" && "border-sky-300")} data-testid={`ops-agent-${a.slug}`}>
                  <CardContent className="p-2.5 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <img src={a.avatarUrl} alt={a.nameAr} className="w-9 h-9 rounded-full object-cover" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-bold leading-tight">{a.nameAr}</div>
                        <div className="text-[10px] text-muted-foreground truncate">{a.roleAr}</div>
                      </div>
                      <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", meta.dot)} title={meta.labelAr} />
                    </div>
                    <div className="text-[10px] text-muted-foreground leading-snug">
                      <div><b className="text-foreground">{meta.labelAr}</b>{a.currentTask ? ` · ${a.currentTask.stepTitle}` : ""}</div>
                      {a.currentTask && <button className="underline truncate block max-w-full text-start" onClick={() => setOpenTaskId(a.currentTask!.id)}>{a.currentTask.title}</button>}
                      {a.currentTask?.runningSinceMs ? <div>منذ {fmtDuration(a.currentTask.runningSinceMs)}</div> : null}
                      <div>آخر نشاط {timeAgoAr(a.lastActivityAt)}</div>
                      <div>نجاح 7 أيام: {a.successRate === null ? "لا بيانات" : `${a.successRate}% (${a.completed7d + a.failed7d})`}</div>
                    </div>
                    {canManageAgents && (
                      <button className="text-[10px] underline text-muted-foreground" disabled={toggleAgent.isPending} onClick={() => toggleAgent.mutate({ slug: a.slug, enabled: a.status === "paused" })}>
                        {a.status === "paused" ? "تشغيل الوكيل" : "إيقاف الوكيل"}
                      </button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        {/* النشاط اللحظي */}
        <section>
          <h2 className="text-sm font-bold mb-2">النشاط اللحظي</h2>
          <Card><CardContent className="p-0">
            <ul className="divide-y text-xs max-h-80 overflow-y-auto">
              {activity.map((e) => (
                <li key={e.id} className="px-3 py-1.5 flex gap-2 items-baseline">
                  <span className="text-muted-foreground whitespace-nowrap w-24 shrink-0">{timeAgoAr(e.createdAt)}</span>
                  <span className={cn("shrink-0 font-bold", e.actorType === "human" ? "text-emerald-700 dark:text-emerald-300" : e.actorType === "agent" ? "text-sky-700 dark:text-sky-300" : "text-muted-foreground")}>{e.actorNameAr}</span>
                  <button className="flex-1 text-start hover:underline" onClick={() => e.taskId !== "room" && setOpenTaskId(e.taskId)}>{e.messageAr}</button>
                </li>
              ))}
              {activity.length === 0 && <li className="px-3 py-4 text-muted-foreground">لا نشاط بعد — أنشئ أول مهمة.</li>}
            </ul>
          </CardContent></Card>
          {metrics && (
            <p className="text-[11px] text-muted-foreground mt-2">
              30 يومًا: إعادات {metrics.retries} · تدخل بشري {metrics.humanInterventionRate ?? "—"}% · قبول من أول مرة {metrics.firstPassAcceptanceRate ?? "—"}% · انتظار الاعتماد {fmtDuration(metrics.avgApprovalWaitMs)}
            </p>
          )}
        </section>
      </div>

      <CreateTaskDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={(id) => setOpenTaskId(id)} />
      <TaskDrawer taskId={openTaskId} onClose={() => setOpenTaskId(null)} permissions={perms} />
    </DashboardLayout>
  );
}
