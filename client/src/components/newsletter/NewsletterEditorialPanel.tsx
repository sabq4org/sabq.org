import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Download, FileText, Loader2, Pencil, Plus, RefreshCw, ShieldCheck } from "lucide-react";
import { apiRequest, apiUrl } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

type EditorialListItem = {
  id: string;
  title: string;
  preheader: string;
  type: "daily" | "weekly";
  status: "draft" | "approved";
  revision: number;
  contentHash: string;
  approvedHash: string | null;
  approvedAt: string | null;
  updatedAt: string;
  sourceCount: number;
};

type EditorialDetail = EditorialListItem & {
  items: Array<{ articleId: string; title: string; summary: string; url: string; publishedAt: string | null }>;
  sourceReferences: Array<{ articleId: string; title: string; url: string; publishedAt: string | null }>;
  html: string;
};

const statusLabel: Record<EditorialListItem["status"], string> = { draft: "مسودة تحتاج مراجعة", approved: "معتمدة للتصدير اليدوي" };

async function getEditorialList(): Promise<EditorialListItem[]> {
  const response = await fetch(apiUrl("/api/newsletter/editorial"), { credentials: "include" });
  if (!response.ok) throw new Error("تعذر تحميل المسودات");
  return response.json();
}

async function getEditorialDetail(id: string): Promise<EditorialDetail> {
  const response = await fetch(apiUrl(`/api/newsletter/editorial/${id}`), { credentials: "include" });
  if (!response.ok) throw new Error("تعذر تحميل المسودة");
  return response.json();
}

export function NewsletterEditorialPanel() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [preheader, setPreheader] = useState("");
  const [summaries, setSummaries] = useState<Record<string, string>>({});
  const [editingEnabled, setEditingEnabled] = useState(false);
  const { data: drafts = [], isLoading, isError: listFailed, error: listError } = useQuery({ queryKey: ["newsletter-editorial"], queryFn: getEditorialList });
  const detailQuery = useQuery({ queryKey: ["newsletter-editorial", selectedId], queryFn: () => getEditorialDetail(selectedId!), enabled: Boolean(selectedId) });

  const selected = detailQuery.data;
  const canEdit = selected?.status === "draft" || editingEnabled;
  const isDirty = Boolean(selected && (title !== selected.title || preheader !== selected.preheader || selected.items.some((item) => (summaries[item.articleId] ?? item.summary) !== item.summary)));
  const createMutation = useMutation({
    mutationFn: (type: "daily" | "weekly") => apiRequest("/api/newsletter/editorial/drafts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type }) }),
    onSuccess: (created: EditorialDetail) => { setSelectedId(created.id); queryClient.invalidateQueries({ queryKey: ["newsletter-editorial"] }); setMessage("أُنشئت مسودة مبنية على مقالات منشورة. راجعها قبل الاعتماد."); },
    onError: (error: Error) => setMessage(error.message),
  });
  const saveMutation = useMutation({
    mutationFn: () => apiRequest(`/api/newsletter/editorial/${selected!.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedHash: selected!.contentHash, title, preheader, items: selected!.items.map((item) => ({ articleId: item.articleId, summary: summaries[item.articleId] ?? item.summary })) }) }),
    onSuccess: (updated: EditorialDetail) => { queryClient.setQueryData(["newsletter-editorial", selected!.id], updated); queryClient.invalidateQueries({ queryKey: ["newsletter-editorial"] }); setEditingEnabled(true); setMessage("حُفظ التعديل وأُبطلت حالة الاعتماد السابقة إن وجدت."); },
    onError: (error: Error) => setMessage(error.message),
  });
  const approveMutation = useMutation({
    mutationFn: () => apiRequest(`/api/newsletter/editorial/${selected!.id}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedHash: selected!.contentHash }) }),
    onSuccess: (updated: EditorialDetail) => { queryClient.setQueryData(["newsletter-editorial", selected!.id], updated); queryClient.invalidateQueries({ queryKey: ["newsletter-editorial"] }); setEditingEnabled(false); setMessage("اعتمدت المسودة. التصدير متاح كـHTML للإدراج اليدوي في MailerLite؛ لم يُرسل شيء."); },
    onError: (error: Error) => setMessage(error.message),
  });

  const openDetail = (id: string) => {
    setSelectedId(id); setEditingEnabled(false);
    const item = drafts.find((draft) => draft.id === id);
    if (item) { setTitle(item.title); setPreheader(item.preheader); }
  };

  useEffect(() => {
    if (!selected) return;
    setTitle(selected.title); setPreheader(selected.preheader); setSummaries(Object.fromEntries(selected.items.map((item) => [item.articleId, item.summary]))); setEditingEnabled(selected.status === "draft");
  }, [selected]);

  const exportDraft = async () => {
    if (!selected) return;
    const response = await fetch(apiUrl(`/api/newsletter/editorial/${selected.id}/export`), { credentials: "include" });
    if (!response.ok) { setMessage((await response.json()).message || "لا يمكن تصدير مسودة غير معتمدة"); return; }
    const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `sabq-newsletter-${selected.id}.html`; anchor.click(); URL.revokeObjectURL(url);
  };

  return (
    <Card dir="rtl" data-testid="newsletter-editorial-panel">
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div><CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary" /> تحرير النشرة وتجهيز MailerLite</CardTitle><CardDescription>مسودات مبنية على مقالات منشورة، بمراجعة بشرية وتصدير HTML يدوي فقط.</CardDescription></div>
          <div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => createMutation.mutate("daily")} disabled={createMutation.isPending}><Plus className="ml-1 h-4 w-4" />مسودة يومية (5)</Button><Button size="sm" variant="outline" onClick={() => createMutation.mutate("weekly")} disabled={createMutation.isPending}><Plus className="ml-1 h-4 w-4" />مسودة أسبوعية (5)</Button></div>
        </div>
        {message && <p className="rounded-md bg-muted px-3 py-2 text-sm" role="status">{message}</p>}
      </CardHeader>
      <CardContent className="grid gap-5 lg:grid-cols-[260px_1fr]">
        <div className="space-y-2">
          {isLoading ? <p className="text-sm text-muted-foreground">جارٍ تحميل المسودات…</p> : listFailed ? <p className="text-sm text-destructive">{(listError as Error)?.message || "تعذر تحميل المسودات"}</p> : drafts.length === 0 ? <p className="text-sm text-muted-foreground">لا توجد مسودات بعد.</p> : drafts.map((draft) => <button key={draft.id} type="button" onClick={() => openDetail(draft.id)} className={`w-full rounded-lg border p-3 text-right transition ${selectedId === draft.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}><span className="block truncate text-sm font-semibold">{draft.title}</span><span className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground"><span>{draft.type === "weekly" ? "أسبوعية" : "يومية"} · {draft.sourceCount} مصادر</span><Badge variant={draft.status === "approved" ? "default" : "secondary"}>{draft.status === "approved" ? "معتمدة" : "مسودة"}</Badge></span></button>)}
        </div>
        <div className="min-h-[260px] rounded-lg border p-4">
          {!selected && <div className="flex h-full min-h-[220px] items-center justify-center text-center text-sm text-muted-foreground"><div><RefreshCw className="mx-auto mb-2 h-7 w-7" /><p>اختر مسودة لمراجعة النص والمصادر.</p></div></div>}
          {detailQuery.isLoading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />جارٍ تحميل المسودة…</div>}
          {detailQuery.isError && <p className="text-sm text-destructive">{(detailQuery.error as Error)?.message || "تعذر تحميل المسودة"}</p>}
          {selected && !detailQuery.isLoading && !detailQuery.isError && <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><Badge variant={selected.status === "approved" ? "default" : "secondary"}>{statusLabel[selected.status]}</Badge><span className="text-xs text-muted-foreground">revision {selected.revision} · hash {selected.contentHash.slice(0, 12)}…</span></div><div className="flex flex-wrap gap-2">{selected.status === "approved" && !editingEnabled && <Button variant="outline" size="sm" onClick={() => setEditingEnabled(true)}><Pencil className="ml-1 h-4 w-4" />تعديل نسخة معتمدة</Button>}<Button variant="outline" size="sm" onClick={exportDraft} disabled={selected.status !== "approved" || isDirty}><Download className="ml-1 h-4 w-4" />تصدير HTML</Button>{selected.status === "draft" && <Button size="sm" onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending || isDirty}><ShieldCheck className="ml-1 h-4 w-4" />اعتماد بشري</Button>}</div></div>
            <div className="grid gap-3 md:grid-cols-2"><label className="space-y-1 text-sm font-medium">العنوان<input value={title} onChange={(event) => setTitle(event.target.value)} disabled={!canEdit} className="mt-1 flex h-10 w-full rounded-lg border-2 border-border bg-background px-3 text-sm" /></label><label className="space-y-1 text-sm font-medium">المقدمة<input value={preheader} onChange={(event) => setPreheader(event.target.value)} disabled={!canEdit} className="mt-1 flex h-10 w-full rounded-lg border-2 border-border bg-background px-3 text-sm" /></label></div>
            <div className="space-y-3"><h3 className="flex items-center gap-2 text-sm font-semibold"><Pencil className="h-4 w-4" />النصوص والمصادر</h3>{selected.items.map((item) => <div key={item.articleId} className="rounded-md bg-muted/40 p-3"><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">{item.title}</span><a className="text-xs text-primary hover:underline" href={item.url} target="_blank" rel="noreferrer">فتح المصدر</a></div><Textarea value={summaries[item.articleId] ?? item.summary} onChange={(event) => setSummaries((current) => ({ ...current, [item.articleId]: event.target.value }))} disabled={!canEdit} maxLength={700} rows={3} /></div>)}</div>
            {canEdit && <div className="flex items-center gap-2"><Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !isDirty}><CheckCircle2 className="ml-1 h-4 w-4" />حفظ التعديل</Button>{isDirty && <span className="text-xs text-amber-700">تعديل غير محفوظ؛ الاعتماد والتصدير متوقفان حتى الحفظ.</span>}</div>}
            <div><h3 className="mb-2 text-sm font-semibold">معاينة HTML</h3><iframe title="معاينة النشرة" sandbox="" srcDoc={selected.html} className="h-[360px] w-full rounded-md border bg-white" /></div>
            <p className="text-xs text-muted-foreground">المصادقة والاعتماد لا ينشئان حملة بعيدة ولا يرسلان بريدًا. بعد الاعتماد نزّل HTML وأدرجَه يدويًا في MailerLite، ثم راجع تذييل المزود وبيانات الحساب.</p>
          </div>}
        </div>
      </CardContent>
    </Card>
  );
}
