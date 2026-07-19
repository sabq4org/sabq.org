/**
 * إدارة البطولات الرياضية (Sabq Sports 2.0) — /dashboard/sports-tournaments
 *
 * لوحة تحكم سجلّ البطولات الموحّد: إظهار/إخفاء لكل سطح (ويب/تطبيق) بمفاتيح
 * فورية، تغيير الحالة، ترتيب بالسحب، featured، وتعديل الموسم/التواريخ/الميزات —
 * يسري على الهب الجديد (/sports22) والتطبيقات خلال دقيقة بدون deploy.
 * أسفلها سجل التدقيق: من غيّر ماذا ومتى.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, getQueryFn, queryClient } from "@/lib/queryClient";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Anchor,
  CalendarRange,
  GripVertical,
  History,
  Loader2,
  Pencil,
  Star,
  Trophy,
} from "lucide-react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface AdminTournament {
  id: string;
  slug: string;
  apiFootballLeagueId: number | null;
  name: string;
  shortName: string | null;
  logo: string | null;
  kind: "anchor" | "seasonal";
  status: "hidden" | "upcoming" | "active" | "finished";
  visibleWeb: boolean;
  visibleApp: boolean;
  featured: boolean;
  sortOrder: number;
  season: number | null;
  startDate: string | null;
  endDate: string | null;
  theme: { primary?: string; accent?: string; dark?: string } | null;
  features: Record<string, boolean | string | undefined> | null;
}

interface AuditEntry {
  id: string;
  tournamentName: string | null;
  userId: string | null;
  action: string;
  changes: Record<string, { from: unknown; to: unknown }> | null;
  createdAt: string;
}

const STATUS_LABELS: Record<AdminTournament["status"], string> = {
  hidden: "مخفية",
  upcoming: "قادمة",
  active: "نشطة",
  finished: "منتهية",
};

const STATUS_BADGE: Record<AdminTournament["status"], string> = {
  hidden: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  upcoming: "bg-amber-100/90 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  active: "bg-emerald-100/90 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
  finished: "bg-sky-100/80 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300",
};

const FIELD_LABELS: Record<string, string> = {
  name: "الاسم",
  shortName: "الاسم المختصر",
  logo: "الشعار",
  kind: "النوع",
  status: "الحالة",
  visibleWeb: "الظهور في الويب",
  visibleApp: "الظهور في التطبيق",
  featured: "مميّزة",
  sortOrder: "الترتيب",
  season: "الموسم",
  startDate: "تاريخ البداية",
  endDate: "تاريخ النهاية",
  theme: "الهوية اللونية",
  features: "الميزات",
  order: "ترتيب البطولات",
};

const FEATURE_LABELS: Record<string, string> = {
  standings: "جدول الترتيب",
  bracket: "الشجرة الإقصائية",
  scorers: "الهدّافون",
  predictions: "التوقعات",
  teams: "الفرق",
  news: "أخبار البطولة",
};

function fmtValue(v: unknown): string {
  if (v === true) return "مفعّل";
  if (v === false) return "معطّل";
  if (v == null) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function isoToDateInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

/** صف بطولة قابل للسحب. */
function TournamentRow({
  t,
  onPatch,
  onEdit,
  pendingId,
}: {
  t: AdminTournament;
  onPatch: (id: string, patch: Record<string, unknown>) => void;
  onEdit: (t: AdminTournament) => void;
  pendingId: string | null;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: t.id,
    disabled: t.kind === "anchor",
  });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const pending = pendingId === t.id;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex flex-col gap-3 rounded-xl border border-sky-200/50 bg-gradient-to-l from-sky-50/35 via-card to-card p-3 shadow-sm transition-shadow hover:shadow-md dark:border-sky-900/35 dark:from-sky-950/15 sm:p-4 lg:flex-row lg:flex-wrap lg:items-center ${
        isDragging ? "opacity-70 shadow-lg ring-1 ring-[#1BADF8]/30" : ""
      }`}
      data-testid={`row-tournament-${t.slug}`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <button
          className={`shrink-0 touch-none text-muted-foreground ${
            t.kind === "anchor" ? "cursor-not-allowed opacity-30" : "cursor-grab"
          }`}
          {...attributes}
          {...listeners}
          aria-label="سحب لإعادة الترتيب"
        >
          <GripVertical className="h-4 w-4 sm:h-5 sm:w-5" />
        </button>

        {t.logo ? (
          <img src={t.logo} alt="" className="h-9 w-9 shrink-0 rounded-lg object-contain" />
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-100/80 dark:bg-sky-950/40">
            <Trophy className="h-4 w-4 text-sky-600 dark:text-sky-300" />
          </div>
        )}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-semibold">{t.name}</span>
            {t.kind === "anchor" && (
              <Badge variant="outline" className="gap-1 border-sky-300/70 bg-sky-50/70 text-sky-800 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-200">
                <Anchor className="h-3 w-3" /> أساس
              </Badge>
            )}
            {t.featured && (
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-label="مميّزة" />
            )}
          </div>
          <div className="text-xs text-muted-foreground tabular-nums" dir="ltr">
            {t.slug}
            {t.season ? ` · ${Number(t.season).toLocaleString("en-US")}` : ""}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 lg:gap-4">
        <Badge className={`${STATUS_BADGE[t.status]} border-0`}>{STATUS_LABELS[t.status]}</Badge>

        <Select
          value={t.status}
          onValueChange={(status) => onPatch(t.id, { status })}
          disabled={pending}
        >
          <SelectTrigger className="w-32" data-testid={`select-status-${t.slug}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(STATUS_LABELS) as AdminTournament["status"][]).map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2 rounded-lg border border-sky-100/70 bg-background/60 px-2.5 py-1.5 dark:border-sky-900/30">
          <Label className="text-xs text-muted-foreground">ويب</Label>
          <Switch
            checked={t.visibleWeb}
            disabled={pending}
            onCheckedChange={(v) => onPatch(t.id, { visibleWeb: v })}
            data-testid={`switch-web-${t.slug}`}
          />
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-sky-100/70 bg-background/60 px-2.5 py-1.5 dark:border-sky-900/30">
          <Label className="text-xs text-muted-foreground">تطبيق</Label>
          <Switch
            checked={t.visibleApp}
            disabled={pending}
            onCheckedChange={(v) => onPatch(t.id, { visibleApp: v })}
            data-testid={`switch-app-${t.slug}`}
          />
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-amber-100/70 bg-background/60 px-2.5 py-1.5 dark:border-amber-900/30">
          <Label className="text-xs text-muted-foreground">مميّزة</Label>
          <Switch
            checked={t.featured}
            disabled={pending}
            onCheckedChange={(v) => onPatch(t.id, { featured: v })}
          />
        </div>

        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onEdit(t)} aria-label="تعديل">
            <Pencil className="h-4 w-4" />
            <span className="hidden sm:inline">تعديل</span>
          </Button>
        )}
      </div>
    </div>
  );
}

export default function SportsTournamentsAdmin() {
  const { toast } = useToast();
  const [editing, setEditing] = useState<AdminTournament | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<{ tournaments: AdminTournament[] }>({
    queryKey: ["/api/admin/sports-tournaments"],
    queryFn: getQueryFn({ on401: "throw" }),
  });
  const tournaments = useMemo(() => data?.tournaments ?? [], [data]);

  const { data: auditData } = useQuery<{ entries: AuditEntry[] }>({
    queryKey: ["/api/admin/sports-tournaments/audit"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });
  const audit = auditData?.entries ?? [];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/sports-tournaments"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/sports-tournaments/audit"] });
    queryClient.invalidateQueries({ queryKey: ["/api/sports/tournaments"] });
  };

  const patchMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      setPendingId(id);
      return apiRequest(`/api/admin/sports-tournaments/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: () => invalidate(),
    onError: () =>
      toast({ title: "تعذّر حفظ التعديل", description: "أعد المحاولة.", variant: "destructive" }),
    onSettled: () => setPendingId(null),
  });

  const reorderMutation = useMutation({
    mutationFn: async (ids: string[]) =>
      apiRequest("/api/admin/sports-tournaments/reorder", {
        method: "POST",
        body: JSON.stringify({ ids }),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => invalidate(),
    onError: () => {
      toast({ title: "تعذّر حفظ الترتيب", variant: "destructive" });
      invalidate();
    },
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = tournaments.map((t) => t.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const next = arrayMove(ids, from, to);
    // تفاؤلي: حدّث الكاش فورًا ثم أرسل للخادم.
    queryClient.setQueryData(["/api/admin/sports-tournaments"], {
      tournaments: next
        .map((id) => tournaments.find((t) => t.id === id)!)
        .filter(Boolean),
    });
    reorderMutation.mutate(next);
  };

  const onPatch = (id: string, patch: Record<string, unknown>) =>
    patchMutation.mutate({ id, patch });

  // ---- نموذج التعديل ----
  const [form, setForm] = useState<Record<string, unknown>>({});
  const openEdit = (t: AdminTournament) => {
    setForm({
      shortName: t.shortName ?? "",
      season: t.season ?? "",
      startDate: isoToDateInput(t.startDate),
      endDate: isoToDateInput(t.endDate),
      themePrimary: t.theme?.primary ?? "",
      features: { ...(t.features ?? {}) },
    });
    setEditing(t);
  };

  const saveEdit = () => {
    if (!editing) return;
    const f = form as any;
    const patch: Record<string, unknown> = {
      shortName: String(f.shortName || "").trim() || null,
      season: f.season === "" ? null : Number(f.season),
      startDate: f.startDate ? new Date(f.startDate).toISOString() : null,
      endDate: f.endDate ? new Date(f.endDate).toISOString() : null,
      theme: f.themePrimary ? { ...(editing.theme ?? {}), primary: f.themePrimary } : editing.theme,
      features: f.features,
    };
    patchMutation.mutate({ id: editing.id, patch });
    setEditing(null);
  };

  return (
    <DashboardLayout>
      <div className="relative min-h-full overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_rgba(27,173,248,0.07),_transparent_55%),radial-gradient(ellipse_at_bottom_left,_rgba(16,185,129,0.045),_transparent_45%),linear-gradient(180deg,_rgba(240,249,255,0.55)_0%,_transparent_26%)] dark:bg-[radial-gradient(ellipse_at_top,_rgba(27,173,248,0.1),_transparent_50%),radial-gradient(ellipse_at_bottom_left,_rgba(16,185,129,0.05),_transparent_45%),linear-gradient(180deg,_rgba(8,47,73,0.22)_0%,_transparent_28%)]"
        />
        <div className="relative mx-auto max-w-[1600px] space-y-6 p-4 sm:p-6 lg:p-8" dir="rtl">
          <header className="relative overflow-hidden rounded-2xl border border-sky-200/60 bg-gradient-to-l from-sky-50/80 via-background to-emerald-50/40 p-5 shadow-sm dark:border-sky-900/40 dark:from-sky-950/30 dark:via-background dark:to-emerald-950/20 sm:p-6">
            <div aria-hidden className="pointer-events-none absolute -left-16 -top-20 h-44 w-44 rounded-full bg-[#1BADF8]/10 blur-3xl dark:bg-[#1BADF8]/15" />
            <div aria-hidden className="pointer-events-none absolute -bottom-16 -right-10 h-40 w-40 rounded-full bg-emerald-400/10 blur-3xl" />
            <div className="relative flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="rounded-xl bg-[#1BADF8]/15 p-2.5 text-[#078fd1] dark:text-[#45c0f5]">
                  <Trophy className="h-5 w-5 sm:h-6 sm:w-6" />
                </span>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">إدارة البطولات الرياضية</h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    التحكم بظهور البطولات في هَب الرياضة والتطبيقات — يسري خلال دقيقة بدون deploy.
                  </p>
                </div>
              </div>
              {!isLoading && (
                <Badge variant="outline" className="border-sky-200/80 bg-background/70 tabular-nums dark:border-sky-900/40">
                  {tournaments.length.toLocaleString("en-US")} بطولة
                </Badge>
              )}
            </div>
          </header>

          <Card className="rounded-2xl border-sky-200/55 bg-gradient-to-br from-sky-50/40 via-card to-card shadow-sm dark:border-sky-900/35 dark:from-sky-950/15">
            <CardHeader>
              <CardTitle className="text-base">البطولات</CardTitle>
              <CardDescription>
                دوري روشن أساسٌ دائم يظهر أولًا؛ البطولات الموسمية تُرتَّب بالسحب وتظهر عند
                تفعيل مفاتيحها. «مخفية» تزيل البطولة من الهب والتطبيق معًا.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoading && (
                <div className="flex items-center justify-center py-10 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              )}
              {Boolean(error) && (
                <p className="py-6 text-center text-sm text-destructive">
                  تعذّر جلب البطولات — تأكد من صلاحياتك ثم أعد المحاولة.
                </p>
              )}
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext
                  items={tournaments.map((t) => t.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2">
                    {tournaments.map((t) => (
                      <TournamentRow
                        key={t.id}
                        t={t}
                        onPatch={onPatch}
                        onEdit={openEdit}
                        pendingId={pendingId}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-emerald-200/55 bg-gradient-to-br from-emerald-50/40 via-card to-card shadow-sm dark:border-emerald-900/35 dark:from-emerald-950/15">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <span className="rounded-lg bg-emerald-100/80 p-1.5 dark:bg-emerald-950/40">
                  <History className="h-4 w-4 text-emerald-700 dark:text-emerald-300" />
                </span>
                سجل التغييرات
              </CardTitle>
              <CardDescription>
                من غيّر ماذا ومتى — آخر <span className="tabular-nums">50</span> تغييرًا.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {audit.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">لا تغييرات بعد.</p>
              ) : (
                <div className="space-y-3">
                  {audit.map((e) => (
                    <div key={e.id} className="rounded-xl border border-emerald-100/80 bg-background/70 p-3 text-sm dark:border-emerald-900/30">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">{e.tournamentName ?? "بطولة محذوفة"}</span>
                        <span className="text-xs tabular-nums text-muted-foreground" dir="ltr">
                          {new Date(e.createdAt).toLocaleString("en-US")}
                        </span>
                      </div>
                      <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                        {e.action === "reorder" ? (
                          <span>أعاد ترتيب البطولات</span>
                        ) : (
                          Object.entries(e.changes ?? {}).map(([k, c]) => (
                            <div key={k}>
                              {FIELD_LABELS[k] ?? k}: {fmtValue(c.from)} ← {fmtValue(c.to)}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Dialog open={Boolean(editing)} onOpenChange={(o) => !o && setEditing(null)}>
            <DialogContent dir="rtl" className="max-w-lg">
              <DialogHeader>
                <DialogTitle>تعديل: {editing?.name}</DialogTitle>
                <DialogDescription>الموسم والتواريخ والميزات المفعّلة في صفحة البطولة.</DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>الاسم المختصر</Label>
                  <Input
                    value={String((form as any).shortName ?? "")}
                    onChange={(e) => setForm((f) => ({ ...f, shortName: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>الموسم</Label>
                  <Input
                    type="number"
                    min={2000}
                    max={2100}
                    className="tabular-nums"
                    value={String((form as any).season ?? "")}
                    onChange={(e) => setForm((f) => ({ ...f, season: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1">
                    <CalendarRange className="h-3.5 w-3.5" /> البداية
                  </Label>
                  <Input
                    type="date"
                    className="tabular-nums"
                    value={String((form as any).startDate ?? "")}
                    onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1">
                    <CalendarRange className="h-3.5 w-3.5" /> النهاية
                  </Label>
                  <Input
                    type="date"
                    className="tabular-nums"
                    value={String((form as any).endDate ?? "")}
                    onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                  />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label>لون البطولة (اختياري — لمسة فوق هوية سبق)</Label>
                  <Input
                    dir="ltr"
                    placeholder="#4CBCFD"
                    value={String((form as any).themePrimary ?? "")}
                    onChange={(e) => setForm((f) => ({ ...f, themePrimary: e.target.value }))}
                  />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label>الميزات المفعّلة</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(FEATURE_LABELS).map(([key, label]) => {
                      const features = ((form as any).features ?? {}) as Record<string, unknown>;
                      return (
                        <label
                          key={key}
                          className="flex items-center justify-between rounded-xl border border-sky-100/80 bg-sky-50/30 p-2.5 text-sm dark:border-sky-900/30 dark:bg-sky-950/10"
                        >
                          <span>{label}</span>
                          <Switch
                            checked={Boolean(features[key])}
                            onCheckedChange={(v) =>
                              setForm((f) => ({
                                ...f,
                                features: { ...((f as any).features ?? {}), [key]: v },
                              }))
                            }
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
              <DialogFooter className="gap-2">
                <Button onClick={saveEdit} data-testid="button-save-tournament">
                  حفظ
                </Button>
                <Button variant="outline" onClick={() => setEditing(null)}>
                  إلغاء
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </DashboardLayout>
  );
}
