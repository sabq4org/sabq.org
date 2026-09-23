// تفاصيل المهمة: المسار الكامل بين الوكلاء، المخرجات المنظمة لكل خطوة،
// المصادر، الثقة والمخاطر، الأخطاء والإعادات، السجل الزمني، وأزرار التدخل
// البشري المسموح بها بحسب الحالة والصلاحية. كل ما يُعرض مقترح آلي إلى أن
// يُوسم «اعتمده الإنسان».
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { OPS_PERMISSIONS, hasOpsPermission, type OpsHumanAction } from "@shared/opsRoom";
import {
  OPS_AGENTS,
  OPS_PRIORITY_LABELS_AR,
  OPS_STATUS_LABELS_AR,
  OPS_TASK_TYPE_LABELS_AR,
  STATUS_BADGE,
  fmtDuration,
  timeAgoAr,
  type OpsStepView,
  type OpsTaskDetail,
} from "./shared";

interface Props {
  taskId: string | null;
  onClose: () => void;
  permissions: string[];
}

function StepCard({ step, canApprove, canReassign, onAction, busy }: { step: OpsStepView; canApprove: boolean; canReassign: boolean; onAction: (a: OpsHumanAction, stepId?: string) => void; busy: boolean }) {
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState(false);
  const [edited, setEdited] = useState("");
  const meta = OPS_AGENTS[step.agentSlug];
  const result = (step.output?.result as Record<string, unknown> | undefined) ?? null;
  const summary = typeof step.output?.summaryAr === "string" ? (step.output.summaryAr as string) : null;
  const warnings = Array.isArray(step.output?.warnings) ? (step.output!.warnings as string[]) : [];
  const missing = Array.isArray(step.output?.missingInfo) ? (step.output!.missingInfo as string[]) : [];

  return (
    <div className={cn("rounded-xl border p-3 space-y-2", step.status === "awaiting_approval" && "border-amber-400", step.status === "needs_info" && "border-red-400", step.status === "running" && "border-sky-400")}>
      <div className="flex items-center gap-2">
        <img src={meta?.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold">{step.agentNameAr} · {step.title}</div>
          <div className="text-[11px] text-muted-foreground">
            {step.dependsOn.length ? `بعد: ${step.dependsOn.join("، ")}` : "بداية المسار"} · محاولة {step.attempts}/{step.maxAttempts}
            {step.startedAt && step.finishedAt ? ` · ${fmtDuration(new Date(step.finishedAt).getTime() - new Date(step.startedAt).getTime())}` : ""}
          </div>
        </div>
        <Badge className={cn("shrink-0", STATUS_BADGE[step.status])}>{OPS_STATUS_LABELS_AR[step.status]}</Badge>
      </div>

      {step.humanNote && <div className="text-xs rounded bg-amber-50 dark:bg-amber-950 px-2 py-1">ملاحظة بشرية: {step.humanNote}</div>}
      {step.lastError && <div className="text-xs rounded bg-red-50 dark:bg-red-950 px-2 py-1">خطأ: {step.lastError}</div>}

      {summary && (
        <div className="text-xs space-y-1">
          <div><span className="text-muted-foreground">الملخص:</span> {summary}</div>
          <div className="flex gap-3 text-muted-foreground">
            <span>الثقة <b className="text-foreground tabular-nums">{step.confidence ?? "—"}%</b></span>
            <span>المخاطر <b className="text-foreground">{step.riskLevel}</b></span>
            {step.humanEdited && <Badge variant="outline" className="text-[10px]">عُدّل بشريًا</Badge>}
            {step.approvedAt && <Badge variant="outline" className="text-[10px] bg-emerald-50 dark:bg-emerald-950">اعتمده الإنسان</Badge>}
            {!step.approvedAt && step.output && <Badge variant="outline" className="text-[10px]">مقترح آلي</Badge>}
          </div>
          {warnings.length > 0 && <div className="text-amber-700 dark:text-amber-300">تحذيرات: {warnings.join(" · ")}</div>}
          {missing.length > 0 && <div className="text-red-700 dark:text-red-300">ناقص: {missing.join(" · ")}</div>}
          {step.sources.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {step.sources.slice(0, 6).map((s, i) => (
                <a key={i} href={s.url} target="_blank" rel="noreferrer" className="underline text-sky-700 dark:text-sky-300 truncate max-w-[220px]" dir="ltr">{s.title || s.url}</a>
              ))}
            </div>
          )}
        </div>
      )}

      {result && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">المخرج المنظم</summary>
          <pre className="mt-1 max-h-72 overflow-auto rounded bg-muted p-2 text-[11px] whitespace-pre-wrap" dir="auto">{JSON.stringify(result, null, 2)}</pre>
        </details>
      )}

      {step.status === "awaiting_approval" && canApprove && (
        <div className="space-y-2 border-t pt-2">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="ملاحظة الاعتماد أو التعديل المطلوب" />
          {editing && (
            <Textarea value={edited} onChange={(e) => setEdited(e.target.value)} rows={5} dir="auto" placeholder='JSON للحقول المعدّلة، مثل {"finalHeadline":"…"}' />
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy} onClick={() => {
              let editedResult: Record<string, unknown> | undefined;
              if (editing && edited.trim()) {
                try { editedResult = JSON.parse(edited) as Record<string, unknown>; } catch { alert("JSON غير صالح"); return; }
              }
              onAction({ action: "approve", note: note || undefined, editedResult }, step.id);
            }}>
              {editing ? "اعتماد بعد التعديل" : "اعتماد"}
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setEditing((v) => !v)}>{editing ? "إلغاء التعديل" : "تعديل ثم اعتماد"}</Button>
            <Button size="sm" variant="outline" disabled={busy || !note.trim()} onClick={() => onAction({ action: "request_changes", note }, step.id)}>إعادة للوكيل بملاحظة</Button>
          </div>
        </div>
      )}
      {canReassign && step.status !== "running" && (
        <div className="text-[11px]">
          <button className="underline text-muted-foreground" disabled={busy} onClick={() => onAction({ action: "reassign", stepKey: step.stepKey, note: note || undefined })}>
            إعادة التكليف من هذه الخطوة ↺
          </button>
        </div>
      )}
    </div>
  );
}

export function TaskDrawer({ taskId, onClose, permissions }: Props) {
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const { data: raw, isLoading } = useQuery<OpsTaskDetail>({
    queryKey: [`/api/admin/ops-room/tasks/${taskId}`],
    enabled: Boolean(taskId),
    refetchInterval: 4000,
  });
  const detail = raw ?? null;

  const act = useMutation({
    mutationFn: ({ action, stepId }: { action: OpsHumanAction; stepId?: string }) =>
      apiRequest(`/api/admin/ops-room/tasks/${taskId}/actions`, { method: "POST", body: JSON.stringify({ ...action, stepId }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/ops-room/tasks/${taskId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ops-room/overview"] });
      setNote("");
    },
    onError: (err: Error) => toast({ title: "تعذر تنفيذ الإجراء", description: err.message, variant: "destructive" }),
  });
  const onAction = (action: OpsHumanAction, stepId?: string) => act.mutate({ action, stepId });

  const canApprove = hasOpsPermission(permissions, OPS_PERMISSIONS.approve);
  const canReassign = hasOpsPermission(permissions, OPS_PERMISSIONS.reassign);
  const canStop = hasOpsPermission(permissions, OPS_PERMISSIONS.stop);
  const canEdit = hasOpsPermission(permissions, OPS_PERMISSIONS.edit);
  const canSeeOutputs = hasOpsPermission(permissions, OPS_PERMISSIONS.outputsView) || hasOpsPermission(permissions, OPS_PERMISSIONS.view);

  const t = detail?.task;
  const steps = Array.isArray(detail?.steps) ? detail!.steps : [];
  const events = Array.isArray(detail?.events) ? detail!.events : [];

  return (
    <Sheet open={Boolean(taskId)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="left" dir="rtl" className="w-full sm:max-w-2xl overflow-y-auto">
        {isLoading || !t ? (
          <div className="space-y-3 mt-6"><Skeleton className="h-8" /><Skeleton className="h-40" /><Skeleton className="h-40" /></div>
        ) : (
          <>
            <SheetHeader className="text-right">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className={STATUS_BADGE[t.status]}>{OPS_STATUS_LABELS_AR[t.status]}</Badge>
                <Badge variant="outline">{OPS_TASK_TYPE_LABELS_AR[t.taskType as keyof typeof OPS_TASK_TYPE_LABELS_AR] ?? t.taskType}</Badge>
                <Badge variant="outline">أولوية {OPS_PRIORITY_LABELS_AR[t.priority as keyof typeof OPS_PRIORITY_LABELS_AR] ?? t.priority}</Badge>
                <Badge variant="outline">مخاطر {t.riskLevel}</Badge>
                {t.origin === "radar" && <Badge variant="outline">من الرادار</Badge>}
              </div>
              <SheetTitle className="text-lg">{t.title}</SheetTitle>
              <SheetDescription>
                {t.routeTitleAr} · {t.stepsCompleted}/{t.stepsTotal} خطوات · أُنشئت {timeAgoAr(t.createdAt)}
                {t.reassignCount > 0 ? ` · أُعيد تكليفها ${t.reassignCount}` : ""}
              </SheetDescription>
            </SheetHeader>

            {t.description && <p className="text-sm text-muted-foreground mt-2">{t.description}</p>}
            {t.lastError && t.status === "failed" && <div className="mt-2 text-xs rounded bg-red-50 dark:bg-red-950 px-2 py-1">توقفت عند {OPS_AGENTS[t.failedAtAgent as keyof typeof OPS_AGENTS]?.nameAr ?? t.failedAtAgent}: {t.lastError}</div>}
            {t.humanNote && t.status === "needs_info" && <div className="mt-2 text-xs rounded bg-amber-50 dark:bg-amber-950 px-2 py-1">المطلوب: {t.humanNote}</div>}

            {/* أزرار التدخل على مستوى المهمة */}
            <div className="mt-3 flex flex-wrap gap-2 items-start">
              {canStop && !["completed", "cancelled", "stopped", "failed"].includes(t.status) && (
                <Button size="sm" variant="destructive" disabled={act.isPending} onClick={() => onAction({ action: "stop", note: note || undefined })}>إيقاف فوري</Button>
              )}
              {canStop && t.status === "stopped" && <Button size="sm" disabled={act.isPending} onClick={() => onAction({ action: "resume" })}>استئناف</Button>}
              {canReassign && t.status === "failed" && <Button size="sm" disabled={act.isPending} onClick={() => onAction({ action: "retry" })}>إعادة المحاولة</Button>}
              {canEdit && t.status === "awaiting_approval" && (
                <Button size="sm" variant="outline" disabled={act.isPending || !note.trim()} onClick={() => onAction({ action: "request_info", note })}>طلب معلومات إضافية</Button>
              )}
              {canEdit && t.status === "needs_info" && (
                <Button size="sm" disabled={act.isPending || !note.trim()} onClick={() => onAction({ action: "provide_info", note })}>تزويد المعلومات واستئناف</Button>
              )}
              {canStop && !["completed", "cancelled"].includes(t.status) && (
                <Button size="sm" variant="ghost" disabled={act.isPending} onClick={() => onAction({ action: "cancel", note: note || undefined })}>إلغاء</Button>
              )}
            </div>
            {(canEdit || canStop) && <Textarea className="mt-2" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="ملاحظة / معلومات إضافية / سبب الإيقاف" />}

            <Tabs defaultValue="route" dir="rtl" className="mt-4">
              <TabsList className="w-full justify-start">
                <TabsTrigger value="route">المسار والمخرجات</TabsTrigger>
                <TabsTrigger value="log">السجل الزمني ({events.length})</TabsTrigger>
                <TabsTrigger value="input">المدخلات</TabsTrigger>
              </TabsList>
              <TabsContent value="route" className="space-y-2">
                {/* خط المسار */}
                <div className="flex flex-wrap gap-1 text-[11px] mb-2">
                  {steps.map((s, i) => (
                    <span key={s.id} className="flex items-center gap-1">
                      {i > 0 && <span className="text-muted-foreground">←</span>}
                      <span className={cn("rounded-full px-2 py-0.5", STATUS_BADGE[s.status])}>{s.agentNameAr}{s.approvalGate ? " ✋" : ""}</span>
                    </span>
                  ))}
                </div>
                {canSeeOutputs ? steps.map((s) => <StepCard key={s.id} step={s} canApprove={canApprove} canReassign={canReassign && !["running"].includes(t.status)} onAction={onAction} busy={act.isPending} />) : <p className="text-sm text-muted-foreground">لا تملك صلاحية الاطلاع على المخرجات.</p>}
              </TabsContent>
              <TabsContent value="log">
                <ul className="divide-y text-xs">
                  {events.slice().reverse().map((e) => (
                    <li key={e.id} className="py-1.5 flex gap-2">
                      <span className="text-muted-foreground whitespace-nowrap w-24 shrink-0">{timeAgoAr(e.createdAt)}</span>
                      <span className={cn("shrink-0 font-bold", e.actorType === "human" ? "text-emerald-700 dark:text-emerald-300" : e.actorType === "agent" ? "text-sky-700 dark:text-sky-300" : "text-muted-foreground")}>{e.actorNameAr}</span>
                      <span className="flex-1">{e.messageAr}{e.durationMs ? <span className="text-muted-foreground"> ({fmtDuration(e.durationMs)})</span> : null}</span>
                    </li>
                  ))}
                </ul>
              </TabsContent>
              <TabsContent value="input">
                <pre className="max-h-96 overflow-auto rounded bg-muted p-2 text-[11px] whitespace-pre-wrap" dir="auto">{JSON.stringify(t.input, null, 2)}</pre>
              </TabsContent>
            </Tabs>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
