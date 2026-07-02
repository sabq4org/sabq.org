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
  hidden: "bg-muted text-muted-foreground",
  upcoming: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  finished: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
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
      className={`flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3 md:p-4 ${
        isDragging ? "opacity-70 shadow-lg" : ""
      }`}
      data-testid={`row-tournament-${t.slug}`}
    >
      <button
        className={`shrink-0 touch-none text-muted-foreground ${
          t.kind === "anchor" ? "cursor-not-allowed opacity-30" : "cursor-grab"
        }`}
        {...attributes}
        {...listeners}
        aria-label="سحب لإعادة الترتيب"
      >
        <GripVertical className="h-5 w-5" />
      </button>

      <div className="flex min-w-0 flex-1 items-center gap-3">
        {t.logo ? (
          <img src={t.logo} alt="" className="h-9 w-9 shrink-0 rounded-lg object-contain" />
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
            <Trophy className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold">{t.name}</span>
            {t.kind === "anchor" && (
              <Badge variant="outline" className="gap-1 border-primary/40 text-primary">
                <Anchor className="h-3 w-3" /> أساس
              </Badge>
            )}
            {t.featured && (
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-label="مميّزة" />
            )}
          </div>
          <div className="text-xs text-muted-foreground" dir="ltr">
            {t.slug}
            {t.season ? ` · ${t.season}` : ""}
          </div>
        </div>
      </div>

      <Badge className={`${STATUS_BADGE[t.status]} border-0`}>{STATUS_LABELS[t.status]}</Badge>

      <Select
        value={t.status}
        onValueChange={(status) => onPatch(t.id, { status })}
        disabled={pending}
      >
        <SelectTrigger className="w-28" data-testid={`select-status-${t.slug}`}>
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

      <div className="flex items-center gap-2">
        <Label className="text-xs text-muted-foreground">ويب</Label>
        <Switch
          checked={t.visibleWeb}
          disabled={pending}
          onCheckedChange={(v) => onPatch(t.id, { visibleWeb: v })}
          data-testid={`switch-web-${t.slug}`}
        />
      </div>
      <div className="flex items-center gap-2">
        <Label className="text-xs text-muted-foreground">تطبيق</Label>
        <Switch
          checked={t.visibleApp}
          disabled={pending}
          onCheckedChange={(v) => onPatch(t.id, { visibleApp: v })}
          data-testid={`switch-app-${t.slug}`}
        />
      </div>
      <div className="flex items-center gap-2">
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
        <Button variant="ghost" size="icon" onClick={() => onEdit(t)} aria-label="تعديل">
          <Pencil className="h-4 w-4" />
        </Button>
      )}
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
      <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-6" dir="rtl">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-3">
            <Trophy className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">إدارة البطولات الرياضية</h1>
            <p className="text-sm text-muted-foreground">
              التحكم بظهور البطولات في هَب الرياضة والتطبيقات — يسري خلال دقيقة بدون deploy.
            </p>
          </div>
        </div>

        <Card>
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

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4 text-muted-foreground" /> سجل التغييرات
            </CardTitle>
            <CardDescription>من غيّر ماذا ومتى — آخر 50 تغييرًا.</CardDescription>
          </CardHeader>
          <CardContent>
            {audit.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">لا تغييرات بعد.</p>
            ) : (
              <div className="space-y-3">
                {audit.map((e) => (
                  <div key={e.id} className="rounded-lg border bg-muted/30 p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{e.tournamentName ?? "بطولة محذوفة"}</span>
                      <span className="text-xs text-muted-foreground" dir="ltr">
                        {new Date(e.createdAt).toLocaleString("ar-SA")}
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
                        className="flex items-center justify-between rounded-lg border p-2.5 text-sm"
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
    </DashboardLayout>
  );
}
