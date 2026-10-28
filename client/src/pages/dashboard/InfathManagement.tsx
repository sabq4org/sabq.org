import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ClipboardPaste,
  ExternalLink,
  Eye,
  Gavel,
  History,
  Plus,
  Save,
  Send,
  Trash2,
  Undo2,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { hasPermission, useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import {
  INFATH_CATEGORIES,
  INFATH_DAY_NAMES,
  INFATH_FORMATS,
  INFATH_MAX_AUCTIONS,
  INFATH_PASTE_COLUMNS,
  INFATH_REGIONS,
  INFATH_RESULT_STATUSES,
  addDays,
  formatDateNumeric,
  formatSar,
  formatWeekRange,
  parseInfathPaste,
  riyadhToday,
  summarizeWeek,
  weekDates,
  weekStartOf,
  weekStatusLabel,
  type InfathAuction,
  type InfathAuctionInput,
  type InfathWeekStatus,
} from "@shared/infath";

type WeekListItem = {
  id: string;
  weekStart: string;
  weekEnd: string;
  status: InfathWeekStatus;
  auctionsCount: number;
  reviewNote: string | null;
  publishedAt: string | null;
  updatedAt: string;
};

type ChangeItem = {
  id: string;
  action: string;
  note: string | null;
  actorName: string | null;
  createdAt: string;
};

type WeekDetail = WeekListItem & {
  auctions: InfathAuction[];
  publishedAuctions: InfathAuction[] | null;
  submittedAt: string | null;
  approvedAt: string | null;
  submittedByName: string | null;
  approvedByName: string | null;
  changes: ChangeItem[];
};

/** صف قيد التحرير: الأرقام نصوص حتى لا يقفز المؤشر أثناء الكتابة. */
type DraftRow = Omit<InfathAuction, "assetsCount" | "assetsSold" | "soldValue" | "url"> & {
  assetsCount: string;
  assetsSold: string;
  soldValue: string;
  url: string;
};

const STATUS_TONE: Record<InfathWeekStatus, string> = {
  draft: "bg-slate-100 text-slate-700",
  pending: "bg-amber-50 text-amber-800",
  returned: "bg-rose-50 text-rose-700",
  approved: "bg-emerald-50 text-emerald-800",
};

const ACTION_LABELS: Record<string, string> = {
  create: "أنشأ الأسبوع",
  save: "حفظ المزادات",
  submit: "أرسل للاعتماد",
  approve: "اعتمد ونشر",
  return: "أعاد للتعديل",
};

const cell = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400";

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `r${Date.now()}${Math.random().toString(36).slice(2)}`;
}

function toDraft(a: InfathAuction): DraftRow {
  return {
    ...a,
    url: a.url ?? "",
    assetsCount: String(a.assetsCount),
    assetsSold: a.assetsSold == null ? "" : String(a.assetsSold),
    soldValue: a.soldValue == null ? "" : String(a.soldValue),
  };
}

function inputToDraft(a: InfathAuctionInput): DraftRow {
  return {
    id: a.id,
    date: a.date,
    time: a.time,
    city: a.city,
    region: a.region,
    assetType: a.assetType,
    category: a.category,
    format: a.format,
    resultStatus: a.resultStatus ?? "scheduled",
    url: a.url ?? "",
    assetsCount: String(a.assetsCount),
    assetsSold: a.assetsSold == null ? "" : String(a.assetsSold),
    soldValue: a.soldValue == null ? "" : String(a.soldValue),
  };
}

function numOrNull(value: string): number | null {
  const cleaned = value.replace(/[,\s٬]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function toPayload(row: DraftRow) {
  const held = row.resultStatus === "held";
  return {
    id: row.id,
    date: row.date,
    time: row.time,
    city: row.city.trim(),
    region: row.region,
    assetType: row.assetType.trim(),
    category: row.category,
    assetsCount: numOrNull(row.assetsCount) ?? 0,
    format: row.format,
    url: row.url.trim() || null,
    resultStatus: row.resultStatus,
    assetsSold: held ? numOrNull(row.assetsSold) : null,
    soldValue: held ? numOrNull(row.soldValue) : null,
  };
}

function asAuction(row: DraftRow): InfathAuction {
  return toPayload(row) as InfathAuction;
}

function stampText(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(new Date(iso).getTime() + 3 * 3600_000).toISOString();
  return `${formatDateNumeric(d.slice(0, 10))} ${d.slice(11, 16)}`;
}

export default function InfathManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canApprove = hasPermission(user, "infath.approve");

  const weeksQuery = useQuery<WeekListItem[]>({ queryKey: ["/api/infath/admin/weeks"] });
  const weeks = Array.isArray(weeksQuery.data) ? weeksQuery.data : [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    if (selectedId || !weeks.length) return;
    const thisWeek = weekStartOf(riyadhToday());
    setSelectedId((weeks.find((w) => w.weekStart === thisWeek) ?? weeks[0]).id);
  }, [weeks, selectedId]);

  const detailQuery = useQuery<WeekDetail>({
    queryKey: ["/api/infath/admin/weeks", selectedId],
    queryFn: () => apiRequest(`/api/infath/admin/weeks/${selectedId}`),
    enabled: Boolean(selectedId),
  });
  const detail = detailQuery.data ?? null;

  const [rows, setRows] = useState<DraftRow[]>([]);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!detail) return;
    setRows(detail.auctions.map(toDraft));
    setDirty(false);
  }, [detail]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const summary = useMemo(
    () => (detail ? summarizeWeek(detail.weekStart, rows.map(asAuction)) : null),
    [detail, rows],
  );

  const update = (id: string, patch: Partial<DraftRow>) => {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
    setDirty(true);
  };

  const addRow = () => {
    if (!detail) return;
    const last = rows[rows.length - 1];
    const today = riyadhToday();
    const date = last?.date ?? (today >= detail.weekStart && today <= detail.weekEnd ? today : detail.weekStart);
    setRows((current) => [...current, {
      id: newId(),
      date,
      time: last?.time ?? "10:00",
      city: "",
      region: last?.region ?? "riyadh",
      assetType: "",
      category: "residential",
      assetsCount: "",
      format: "online",
      url: "",
      resultStatus: "scheduled",
      assetsSold: "",
      soldValue: "",
    }]);
    setDirty(true);
  };

  const afterWrite = async (data: WeekDetail) => {
    queryClient.setQueryData(["/api/infath/admin/weeks", data.id], data);
    await queryClient.invalidateQueries({ queryKey: ["/api/infath/admin/weeks"], exact: true });
  };

  const fail = (title: string) => (error: unknown) => {
    toast({ variant: "destructive", title, description: error instanceof Error ? error.message : "حاول مرة أخرى." });
  };

  const save = useMutation({
    mutationFn: () => apiRequest<WeekDetail>(`/api/infath/admin/weeks/${detail!.id}/auctions`, {
      method: "PUT",
      body: JSON.stringify({ auctions: rows.map(toPayload), expectedUpdatedAt: detail!.updatedAt }),
    }),
    onSuccess: async (data) => {
      await afterWrite(data);
      toast({
        title: "حُفظت المزادات",
        description: detail?.publishedAt ? "الصفحة العامة باقية على آخر نسخة معتمدة حتى يُعتمد هذا التعديل." : "أرسل الأسبوع للاعتماد عند اكتماله.",
      });
    },
    onError: fail("لم تُحفظ المزادات"),
  });

  const action = useMutation({
    mutationFn: (input: { kind: "submit" | "approve" | "return"; note?: string }) =>
      apiRequest<WeekDetail>(`/api/infath/admin/weeks/${detail!.id}/${input.kind}`, {
        method: "POST",
        body: JSON.stringify({ expectedUpdatedAt: detail!.updatedAt, ...(input.note ? { note: input.note } : {}) }),
      }),
    onSuccess: async (data, input) => {
      await afterWrite(data);
      toast({
        title: input.kind === "approve" ? "اعتُمد الأسبوع ونُشر" : input.kind === "return" ? "أُعيد الأسبوع لإنفاذ" : "أُرسل الأسبوع للاعتماد",
        description: input.kind === "approve" ? "يظهر على sabq.org/infath خلال دقيقة." : undefined,
      });
      setReturnOpen(false);
      setReturnNote("");
    },
    onError: fail("تعذر تنفيذ الطلب"),
  });

  const [newOpen, setNewOpen] = useState(false);
  const nextSunday = addDays(weekStartOf(riyadhToday()), 7);
  const weekChoices = [-7, 0, 7, 14].map((offset) => addDays(weekStartOf(riyadhToday()), offset))
    .filter((w) => !weeks.some((item) => item.weekStart === w));
  const [newWeek, setNewWeek] = useState<string>(nextSunday);
  const create = useMutation({
    mutationFn: (weekStart: string) => apiRequest<WeekListItem>("/api/infath/admin/weeks", { method: "POST", body: JSON.stringify({ weekStart }) }),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/infath/admin/weeks"], exact: true });
      setSelectedId(data.id);
      setNewOpen(false);
    },
    onError: fail("لم يُنشأ الأسبوع"),
  });

  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const parsed = useMemo(() => (pasteText.trim() ? parseInfathPaste(pasteText, newId) : { rows: [], errors: [] }), [pasteText]);
  // لا نقتطع بصمت: اللصق الذي يتجاوز الحد يُرفض بزر معطّل ورسالة.
  const appendFits = rows.length + parsed.rows.length <= INFATH_MAX_AUCTIONS;
  const replaceFits = parsed.rows.length <= INFATH_MAX_AUCTIONS;
  const applyPaste = (mode: "append" | "replace") => {
    if (mode === "append" ? !appendFits : !replaceFits) return;
    const incoming = parsed.rows.map(inputToDraft);
    setRows((current) => (mode === "replace" ? incoming : [...current, ...incoming]));
    setDirty(true);
    setPasteOpen(false);
    setPasteText("");
  };

  const [returnOpen, setReturnOpen] = useState(false);
  const [returnNote, setReturnNote] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);

  const status = detail?.status ?? "draft";
  const busy = save.isPending || action.isPending;
  const canSubmit = !dirty && rows.length > 0 && (status === "draft" || status === "returned");
  const canApproveNow = canApprove && !dirty && rows.length > 0 && status !== "approved";

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-[1500px] space-y-5 px-4 pb-10 sm:px-6" dir="rtl">
        <DashboardPageHeader
          icon={Gavel}
          title="مزادات إنفاذ"
          description="جدول المزادات العقارية الأسبوعي لصفحة sabq.org/infath. إنفاذ يُدخل المزادات ونتائجها ويرسلها، ومحرر سبق يعتمدها فتظهر للقراء. كل حفظ واعتماد يُقيَّد في السجل."
          actions={
            <>
              <Button variant="outline" size="sm" asChild>
                <a href="/infath" target="_blank" rel="noreferrer"><ExternalLink className="me-1.5 h-4 w-4" />الصفحة العامة</a>
              </Button>
              <Button size="sm" onClick={() => { setNewWeek(weekChoices.includes(nextSunday) ? nextSunday : weekChoices[0] ?? nextSunday); setNewOpen(true); }}>
                <Plus className="me-1.5 h-4 w-4" />أسبوع جديد
              </Button>
            </>
          }
        />

        {weeksQuery.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : !weeks.length ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-muted-foreground">
            <p className="mb-4">لا أسابيع بعد. ابدأ بإنشاء أسبوع (من الأحد إلى السبت) ثم أضف مزاداته.</p>
            <Button onClick={() => setNewOpen(true)}><Plus className="me-1.5 h-4 w-4" />أسبوع جديد</Button>
          </div>
        ) : (
          <>
            {/* الأسبوع والحالة والإجراءات */}
            <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4">
              <Select value={selectedId ?? undefined} onValueChange={(id) => {
                if (dirty && !window.confirm("لديك تعديلات غير محفوظة. تجاهلها والانتقال؟")) return;
                setSelectedId(id);
              }}>
                <SelectTrigger className="w-[280px]" aria-label="الأسبوع"><SelectValue placeholder="اختر الأسبوع" /></SelectTrigger>
                <SelectContent>
                  {weeks.map((w) => (
                    <SelectItem key={w.id} value={w.id}>{formatWeekRange(w.weekStart)} · {weekStatusLabel(w.status)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {detail && (
                <>
                  <span className={cn("rounded-full px-3 py-1 text-sm font-medium", STATUS_TONE[status])} data-testid="infath-week-status">
                    {dirty ? "تعديلات غير محفوظة" : weekStatusLabel(status)}
                  </span>
                  {detail.publishedAt && status !== "approved" && (
                    <span className="text-sm text-muted-foreground">المنشور الآن: نسخة {stampText(detail.approvedAt)}</span>
                  )}
                  <div className="ms-auto flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <a href={`/infath?preview=${detail.id}`} target="_blank" rel="noreferrer"><Eye className="me-1.5 h-4 w-4" />معاينة</a>
                    </Button>
                    <Button size="sm" variant={dirty ? "default" : "outline"} disabled={!dirty || busy} onClick={() => save.mutate()}>
                      <Save className="me-1.5 h-4 w-4" />حفظ
                    </Button>
                    {!canApprove && (
                      <Button size="sm" disabled={!canSubmit || busy} onClick={() => action.mutate({ kind: "submit" })}>
                        <Send className="me-1.5 h-4 w-4" />إرسال لاعتماد سبق
                      </Button>
                    )}
                    {canApprove && status === "pending" && (
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => setReturnOpen(true)}>
                        <Undo2 className="me-1.5 h-4 w-4" />إعادة بملاحظة
                      </Button>
                    )}
                    {canApprove && (
                      <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800" disabled={!canApproveNow || busy}
                        onClick={() => {
                          if (window.confirm(`اعتماد ${formatWeekRange(detail.weekStart)} ونشره على sabq.org/infath؟`)) action.mutate({ kind: "approve" });
                        }}>
                        <CheckCircle2 className="me-1.5 h-4 w-4" />اعتماد ونشر
                      </Button>
                    )}
                  </div>
                </>
              )}
            </section>

            {detail?.status === "returned" && detail.reviewNote && (
              <div className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-800" role="status">
                <b className="font-semibold">ملاحظة سبق: </b>{detail.reviewNote}
              </div>
            )}
            {detail?.status === "pending" && (
              <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900" role="status">
                أُرسل الأسبوع {detail.submittedByName ? `من ${detail.submittedByName} ` : ""}{stampText(detail.submittedAt)} وينتظر اعتماد محرر سبق. أي حفظ جديد يعيده مسودة.
              </div>
            )}

            {detailQuery.isLoading || !detail || !summary ? (
              <Skeleton className="h-96 w-full" />
            ) : (
              <>
                {/* ملخص الأسبوع كما سيظهر */}
                <section className="flex flex-wrap gap-x-8 gap-y-2 px-1 text-sm">
                  <span><b className="text-lg tabular-nums">{summary.auctions}</b> مزاد</span>
                  <span><b className="text-lg tabular-nums">{summary.assets}</b> أصل معروض</span>
                  <span><b className="text-lg tabular-nums">{summary.regions}</b> منطقة</span>
                  <span><b className="text-lg tabular-nums">{summary.held}</b> مزاد أقيم</span>
                  <span>المبيعات <b className="text-lg tabular-nums">{formatSar(summary.soldValue)}</b></span>
                  {summary.sellThrough !== null && <span>نسبة البيع <b className="text-lg tabular-nums">{summary.sellThrough}%</b></span>}
                </section>

                {/* الجدول */}
                <section className="overflow-hidden rounded-2xl border border-border bg-card">
                  <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
                    <h2 className="text-base font-semibold">مزادات {formatWeekRange(detail.weekStart)}</h2>
                    <span className="text-sm text-muted-foreground">({rows.length} / {INFATH_MAX_AUCTIONS})</span>
                    <div className="ms-auto flex gap-2">
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => setPasteOpen(true)}><ClipboardPaste className="me-1.5 h-4 w-4" />لصق من Excel</Button>
                      <Button size="sm" variant="outline" onClick={addRow} disabled={busy || rows.length >= INFATH_MAX_AUCTIONS}><Plus className="me-1.5 h-4 w-4" />مزاد</Button>
                    </div>
                  </div>
                  {!rows.length ? (
                    <p className="p-10 text-center text-muted-foreground">لا مزادات في هذا الأسبوع بعد. أضف مزادًا أو الصق الجدول من Excel.</p>
                  ) : (
                    <fieldset disabled={busy} className="min-w-0 overflow-x-auto" aria-busy={busy}>
                      <table className="w-full min-w-[1320px] text-sm">
                        <thead className="bg-slate-50 text-xs text-muted-foreground">
                          <tr>
                            {["اليوم", "الوقت", "المدينة", "المنطقة", "نوع الأصل", "الفئة", "الأصول", "الصيغة", "رابط المزاد", "الحالة", "المبيعة", "القيمة (ريال)", ""].map((h) => (
                              <th key={h} className="px-2 py-2 text-start font-medium">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row) => {
                            const held = row.resultStatus === "held";
                            const value = numOrNull(row.soldValue);
                            return (
                              <tr key={row.id} className="border-t border-border align-top">
                                <td className="w-[150px] px-2 py-1.5">
                                  <select className={cell} value={row.date} aria-label="اليوم" onChange={(e) => update(row.id, { date: e.target.value })}>
                                    {weekDates(detail.weekStart).map((d, i) => <option key={d} value={d}>{INFATH_DAY_NAMES[i]} {Number(d.slice(8))}</option>)}
                                  </select>
                                </td>
                                <td className="w-[120px] px-2 py-1.5"><input type="time" dir="ltr" className={cell} value={row.time} aria-label="الوقت" onChange={(e) => update(row.id, { time: e.target.value })} /></td>
                                <td className="w-[130px] px-2 py-1.5"><input className={cell} value={row.city} aria-label="المدينة" onChange={(e) => update(row.id, { city: e.target.value })} /></td>
                                <td className="w-[140px] px-2 py-1.5">
                                  <select className={cell} value={row.region} aria-label="المنطقة" onChange={(e) => update(row.id, { region: e.target.value as DraftRow["region"] })}>
                                    {INFATH_REGIONS.map((r) => <option key={r.id} value={r.id}>{r.ar}</option>)}
                                  </select>
                                </td>
                                <td className="w-[150px] px-2 py-1.5"><input className={cell} value={row.assetType} placeholder="أراضٍ سكنية" aria-label="نوع الأصل" onChange={(e) => update(row.id, { assetType: e.target.value })} /></td>
                                <td className="w-[100px] px-2 py-1.5">
                                  <select className={cell} value={row.category} aria-label="الفئة" onChange={(e) => update(row.id, { category: e.target.value as DraftRow["category"] })}>
                                    {INFATH_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.ar}</option>)}
                                  </select>
                                </td>
                                <td className="w-[80px] px-2 py-1.5"><input className={cell} inputMode="numeric" dir="ltr" value={row.assetsCount} aria-label="عدد الأصول" onChange={(e) => update(row.id, { assetsCount: e.target.value })} /></td>
                                <td className="w-[140px] px-2 py-1.5">
                                  <select className={cell} value={row.format} aria-label="الصيغة" onChange={(e) => update(row.id, { format: e.target.value as DraftRow["format"] })}>
                                    {INFATH_FORMATS.map((f) => <option key={f.id} value={f.id}>{f.ar}</option>)}
                                  </select>
                                </td>
                                <td className="w-[180px] px-2 py-1.5"><input className={cell} dir="ltr" value={row.url} placeholder="https://" aria-label="رابط المزاد" onChange={(e) => update(row.id, { url: e.target.value })} /></td>
                                <td className="w-[100px] px-2 py-1.5">
                                  <select className={cell} value={row.resultStatus} aria-label="الحالة" onChange={(e) => {
                                    const next = e.target.value as DraftRow["resultStatus"];
                                    update(row.id, next === "held" ? { resultStatus: next } : { resultStatus: next, assetsSold: "", soldValue: "" });
                                  }}>
                                    {INFATH_RESULT_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.ar}</option>)}
                                  </select>
                                </td>
                                <td className="w-[80px] px-2 py-1.5"><input className={cn(cell, !held && "opacity-40")} disabled={!held} inputMode="numeric" dir="ltr" value={row.assetsSold} aria-label="الأصول المبيعة" onChange={(e) => update(row.id, { assetsSold: e.target.value })} /></td>
                                <td className="w-[150px] px-2 py-1.5">
                                  <input className={cn(cell, !held && "opacity-40")} disabled={!held} inputMode="decimal" dir="ltr" value={row.soldValue} aria-label="قيمة المبيعات بالريال" onChange={(e) => update(row.id, { soldValue: e.target.value })} />
                                  {held && value != null && value > 0 && <span className="mt-0.5 block text-[11px] text-muted-foreground">{formatSar(value)}</span>}
                                </td>
                                <td className="w-[44px] px-1 py-1.5">
                                  <Button size="icon" variant="ghost" aria-label="حذف الصف" onClick={() => { setRows((c) => c.filter((r) => r.id !== row.id)); setDirty(true); }}>
                                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                                  </Button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </fieldset>
                  )}
                </section>

                {/* السجل */}
                <section className="rounded-2xl border border-border bg-card">
                  <button type="button" className="flex w-full items-center gap-2 p-4 text-start text-sm font-semibold" onClick={() => setHistoryOpen((v) => !v)} aria-expanded={historyOpen}>
                    <History className="h-4 w-4" />سجل التغييرات ({detail.changes.length})
                  </button>
                  {historyOpen && (
                    <ul className="divide-y divide-border border-t border-border text-sm">
                      {detail.changes.map((c) => (
                        <li key={c.id} className="flex flex-wrap gap-x-3 px-4 py-2.5">
                          <span className="tabular-nums text-muted-foreground" dir="ltr">{stampText(c.createdAt)}</span>
                          <span className="font-medium">{c.actorName ?? "—"}</span>
                          <Badge variant="outline">{ACTION_LABELS[c.action] ?? c.action}</Badge>
                          {c.note && <span className="text-muted-foreground">«{c.note}»</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </>
            )}
          </>
        )}
      </div>

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>أسبوع جديد</DialogTitle>
            <DialogDescription>الأسبوع من الأحد إلى السبت. يبدأ مسودة ولا يظهر للقراء حتى يُعتمد.</DialogDescription>
          </DialogHeader>
          {weekChoices.length ? (
            <Select value={newWeek} onValueChange={setNewWeek}>
              <SelectTrigger aria-label="الأسبوع"><SelectValue /></SelectTrigger>
              <SelectContent>
                {weekChoices.map((w) => <SelectItem key={w} value={w}>{formatWeekRange(w)}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-sm text-muted-foreground">الأسابيع القريبة كلها موجودة في القائمة.</p>
          )}
          <DialogFooter>
            <Button disabled={!weekChoices.includes(newWeek) || create.isPending} onClick={() => create.mutate(newWeek)}>إنشاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pasteOpen} onOpenChange={setPasteOpen}>
        <DialogContent dir="rtl" className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>لصق المزادات من Excel</DialogTitle>
            <DialogDescription>
              انسخ الصفوف من Excel والصقها هنا بهذا الترتيب: {INFATH_PASTE_COLUMNS.join("، ")}. صف العناوين يُتخطى تلقائيًا. التاريخ مثل 25/10/2026 والوقت مثل 4:00 م أو 16:00.
            </DialogDescription>
          </DialogHeader>
          <Textarea rows={10} dir="rtl" value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder={INFATH_PASTE_COLUMNS.join("\t")} />
          {pasteText.trim() && (
            <div className="space-y-1 text-sm">
              {!appendFits && (
                <p className="font-medium text-rose-700">
                  {replaceFits
                    ? `الإضافة تتجاوز حد ${INFATH_MAX_AUCTIONS} مزادًا في الأسبوع (في الجدول ${rows.length}). احذف صفوفًا أو استبدل الجدول.`
                    : `اللصق فيه ${parsed.rows.length} صفًا وهو أكثر من حد ${INFATH_MAX_AUCTIONS} مزادًا في الأسبوع.`}
                </p>
              )}
              <p className="font-medium">فُهم {parsed.rows.length} صفًا{parsed.errors.length ? ` وتعذّر ${parsed.errors.length}` : ""}.</p>
              {parsed.errors.slice(0, 8).map((e) => <p key={e} className="text-rose-700">{e}</p>)}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" disabled={!parsed.rows.length || !replaceFits} onClick={() => applyPaste("replace")}>استبدال الجدول</Button>
            <Button disabled={!parsed.rows.length || !appendFits} onClick={() => applyPaste("append")}>إضافة {parsed.rows.length} صفًا</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={returnOpen} onOpenChange={setReturnOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>إعادة الأسبوع لإنفاذ</DialogTitle>
            <DialogDescription>اكتب ما يحتاج تعديلًا. تظهر الملاحظة لحساب إنفاذ أعلى الجدول.</DialogDescription>
          </DialogHeader>
          <Textarea rows={4} value={returnNote} onChange={(e) => setReturnNote(e.target.value)} placeholder="مثال: قيمة مبيعات مزاد الدمام يوم الأربعاء تبدو ناقصة صفرًا." />
          <DialogFooter>
            <Button disabled={returnNote.trim().length < 3 || action.isPending} onClick={() => action.mutate({ kind: "return", note: returnNote.trim() })}>إعادة</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
