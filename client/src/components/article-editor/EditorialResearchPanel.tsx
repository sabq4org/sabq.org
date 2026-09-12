import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Loader2, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth, hasRole } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { EDITORIAL_RESEARCH_ROLES, ACTIVE_RESEARCH_STATUSES, researchStatusLabels, type ResearchCapabilities, type ResearchJob, type ResearchResult } from "@shared/editorialResearch";

const prefix = "/api/editorial-research";
export function EditorialResearchPanel({ onReview }: { onReview: (result: ResearchResult) => void }) {
  const { user } = useAuth();
  const canResearch = hasRole(user, ...EDITORIAL_RESEARCH_ROLES);
  const queryClient = useQueryClient();
  const [topic, setTopic] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const request = useRef<{ topic: string; requestId: string } | null>(null);
  const key = [prefix, "jobs", user?.id];
  const capabilities = useQuery<ResearchCapabilities>({ queryKey: [prefix, "capabilities", user?.id], queryFn: () => apiRequest(`${prefix}/capabilities`), enabled: Boolean(user?.id) && canResearch, retry: false });
  const historyAvailable = capabilities.data?.historyAvailable ?? capabilities.data?.enabled ?? false;
  const history = useQuery<ResearchJob[]>({ queryKey: key, queryFn: () => apiRequest(`${prefix}/jobs`), enabled: Boolean(user?.id) && canResearch && historyAvailable, retry: false, refetchInterval: query => (query.state.data ?? []).some(j => ACTIVE_RESEARCH_STATUSES.includes(j.status)) ? 4000 : false });
  const jobs = Array.isArray(history.data) ? history.data : [];
  const selected = jobs.find(j => j.id === selectedId) ?? jobs[0];
  const active = jobs.some(j => ACTIVE_RESEARCH_STATUSES.includes(j.status));
  const updateJob = (job: ResearchJob) => {
    setSelectedId(job.id);
    queryClient.setQueryData<ResearchJob[]>(key, current => [job, ...(current ?? []).filter(j => j.id !== job.id)].slice(0, 20));
    void queryClient.invalidateQueries({ queryKey: key });
  };
  const create = useMutation({ mutationFn: () => {
    const trimmed = topic.trim();
    if (!request.current || request.current.topic !== trimmed) request.current = { topic: trimmed, requestId: crypto.randomUUID() };
    return apiRequest<ResearchJob>(`${prefix}/jobs`, { method: "POST", body: JSON.stringify(request.current), headers: { "Content-Type": "application/json" } });
  }, onSuccess: job => { updateJob(job); request.current = null; } });
  const cancel = useMutation({ mutationFn: (id: string) => apiRequest<ResearchJob>(`${prefix}/jobs/${id}/cancel`, { method: "POST" }), onSuccess: updateJob });
  const error = create.error ?? cancel.error ?? history.error ?? capabilities.error;
  if (!canResearch) return null;
  if (!historyAvailable) return <div className="space-y-4" dir="rtl" data-testid="editorial-research-panel">
    <Alert variant={capabilities.isError ? "destructive" : "default"}><AlertDescription role="status">
      {capabilities.isPending ? "جارٍ التحقق من توفر مساعد البحث..." : capabilities.isError ? "تعذر التحقق من توفر مساعد البحث. حاول تحديث الحالة." : capabilities.data?.reason ?? "مساعد البحث غير مفعّل حاليًا."}
    </AlertDescription></Alert>
    <Button size="sm" variant="outline" onClick={() => { void capabilities.refetch(); }} disabled={capabilities.isFetching} className="gap-1"><RotateCw className="h-3 w-3" /> تحديث الحالة</Button>
  </div>;
  return <div className="space-y-4" dir="rtl" data-testid="editorial-research-panel">
    <p className="text-sm text-muted-foreground leading-6">اكتب موضوعًا للبحث في المصادر العامة. يصلك تقرير ومصادر ونقاط تحتاج مراجعتك، ويمكنك العودة إلى المهمة بعد إغلاق الصفحة.</p>
    {(capabilities.data && !capabilities.data.enabled) && <Alert><AlertDescription>{capabilities.data.reason}</AlertDescription></Alert>}
    <div className="space-y-2">
      <Label htmlFor="research-topic">موضوع البحث</Label>
      <Textarea id="research-topic" value={topic} maxLength={2000} rows={3} placeholder="مثال: تقرير عن أحدث بيانات السياحة المحلية ومصادرها الرسمية" onChange={e => { setTopic(e.target.value); create.reset(); }} disabled={create.isPending} data-testid="research-topic" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">حتى {capabilities.data?.dailyLimit ?? 5} مهام خلال 24 ساعة؛ تُراجع مهلة البحث بعد {capabilities.data?.maxMinutes ?? 5} دقائق.</p>
        <Button className="gap-2" onClick={() => create.mutate()} disabled={!capabilities.data?.enabled || history.isPending || history.isError || active || topic.trim().length < 20 || create.isPending} data-testid="research-start">
          {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} ابدأ البحث
        </Button>
      </div>
    </div>
    {error && <Alert variant="destructive"><AlertDescription role="alert">{error instanceof Error ? error.message : "تعذر تحديث البحث."}</AlertDescription></Alert>}
    <div className="flex items-center justify-between"><Label>مهامك الأخيرة</Label><Button size="sm" variant="ghost" onClick={() => { void history.refetch(); void capabilities.refetch(); }} disabled={history.isFetching} className="gap-1"><RotateCw className="h-3 w-3" /> تحديث</Button></div>
    {history.isPending && <p role="status">جارٍ تحميل المهام...</p>}
    {jobs.length === 0 && !history.isPending && !history.isError && <p className="text-sm text-muted-foreground">لا توجد مهام بحث سابقة.</p>}
    {jobs.length > 0 && <select aria-label="اختر مهمة بحث" className="w-full rounded-md border bg-background p-2 text-sm" value={selected?.id ?? ""} onChange={e => { setSelectedId(e.target.value); cancel.reset(); }}>
      {jobs.map(job => <option value={job.id} key={job.id}>{job.topic.slice(0, 75)} — {researchStatusLabels[job.status]}</option>)}
    </select>}
    {selected && <div className="space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium" role="status" data-testid="research-status">{researchStatusLabels[selected.status]}</p>
        {ACTIVE_RESEARCH_STATUSES.includes(selected.status) && <Button size="sm" variant="outline" disabled={cancel.isPending || selected.status === "cancelling"} onClick={() => cancel.mutate(selected.id)}>إلغاء المهمة</Button>}
      </div>
      {selected.error && <p className="text-sm text-destructive" role="alert">{selected.error}</p>}
      {selected.research && <>
        <details className="text-sm leading-6"><summary className="cursor-pointer">ملخص البحث</summary><p className="whitespace-pre-wrap pt-2">{selected.research.summary}</p></details>
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">المصادر التي فتحها البحث — تحتاج مراجعة المحرر</p>
          {selected.research.sources.map((s, i) => <div className="text-sm leading-6" key={`${i}-${s.url}`}>
            <a href={/^https?:\/\//.test(s.url) ? s.url : undefined} target="_blank" rel="noopener noreferrer" className="text-primary underline break-words">{s.title}</a>
            <p className="text-xs text-muted-foreground">{s.evidence}</p>
          </div>)}
        </div>
        {selected.research.openQuestions.length > 0 && <div className="rounded-md bg-muted p-2"><p className="text-sm font-medium">نقاط تحتاج تحققًا</p><ul className="list-disc ps-5 text-sm leading-6">{selected.research.openQuestions.map((q, i) => <li key={i}>{q}</li>)}</ul></div>}
      </>}
      {selected.result && selected.status === "completed" && <Button className="w-full" onClick={() => onReview(selected.result!)} data-testid="research-review">مراجعة التقرير وإدراجه</Button>}
      <p className="text-xs text-muted-foreground">{selected.usage ? `الاستهلاك المسجل للبحث: ${selected.usage.total_tokens.toLocaleString("en-US")} توكن` : "استهلاك البحث لم يتوفر بعد."} — لا يشمل هذا العداد تكلفة التحرير أو الأدوات أو بيئة التشغيل.</p>
    </div>}
  </div>;
}
