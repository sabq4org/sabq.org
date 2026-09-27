import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarDays,
  CalendarPlus,
  Check,
  CheckCircle2,
  ExternalLink,
  History,
  Hourglass,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { daysPhrase, diffIsoDays, formatGregorian, formatHijri, riyadhDateISO } from "@shared/mawaeed/dates";

/* ------------------------------------------------------------------ *
 * الأنواع
 * ------------------------------------------------------------------ */

type SeriesRow = { id: string; slug: string; titleAr: string; kind: string };
type Certainty = "confirmed" | "expected" | "unverified";
type OccurrenceStatus = "scheduled" | "cancelled" | "superseded";
type RegionGroup = "all" | "riyadh_most" | "western";

type OccurrenceRow = {
  id: string;
  seriesId: string;
  titleAr: string;
  startsOn: string;
  endsOn: string | null;
  sourceUrl: string;
  sourceTitle: string;
  certainty: Certainty;
  status: OccurrenceStatus;
  published: boolean;
  regionGroup: RegionGroup;
  hijriLabel: string | null;
  publicNote: string | null;
  ruleNote: string | null;
};
type ChangeRow = {
  id: string;
  action: string;
  actorName: string | null;
  createdAt: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};
type AdminPayload = { series: SeriesRow[]; occurrences: OccurrenceRow[]; changes: ChangeRow[] };

type FormState = {
  id: string | null;
  seriesId: string;
  titleAr: string;
  startsOn: string;
  endsOn: string;
  sourceUrl: string;
  sourceTitle: string;
  certainty: Certainty;
  status: OccurrenceStatus;
  published: boolean;
  regionGroup: RegionGroup;
  hijriLabel: string;
  publicNote: string;
  ruleNote: string;
};

const EMPTY: FormState = {
  id: null,
  seriesId: "",
  titleAr: "",
  startsOn: "",
  endsOn: "",
  sourceUrl: "",
  sourceTitle: "",
  certainty: "confirmed",
  status: "scheduled",
  published: false,
  regionGroup: "all",
  hijriLabel: "",
  publicNote: "",
  ruleNote: "",
};

/* ------------------------------------------------------------------ *
 * التسميات والرموز
 * ------------------------------------------------------------------ */

const CERTAINTY_LABELS: Record<Certainty, string> = {
  confirmed: "مؤكد",
  expected: "متوقع",
  unverified: "بانتظار التحقق",
};

const STATUS_LABELS: Record<OccurrenceStatus, string> = {
  scheduled: "مجدول",
  cancelled: "ملغى",
  superseded: "استُبدل",
};

const REGION_LABELS: Record<RegionGroup, string> = {
  all: "كل المناطق",
  riyadh_most: "الرياض ومعظم المناطق",
  western: "مكة والمدينة وجدة والطائف",
};

/** لون رفيع واحد لكل سلسلة، يبقى مقروءاً في الثيم الفاتح والداكن. */
const KIND_META: Record<string, { rail: string; dot: string }> = {
  school_holiday: { rail: "bg-sky-500/80 dark:bg-sky-400/70", dot: "bg-sky-500 dark:bg-sky-400" },
  salary: { rail: "bg-emerald-500/80 dark:bg-emerald-400/70", dot: "bg-emerald-500 dark:bg-emerald-400" },
  citizen_account: { rail: "bg-amber-500/80 dark:bg-amber-400/70", dot: "bg-amber-500 dark:bg-amber-400" },
  social_security: { rail: "bg-violet-500/80 dark:bg-violet-400/70", dot: "bg-violet-500 dark:bg-violet-400" },
  pension: { rail: "bg-orange-500/80 dark:bg-orange-400/70", dot: "bg-orange-500 dark:bg-orange-400" },
};

const FALLBACK_KIND = { rail: "bg-muted-foreground/50", dot: "bg-muted-foreground/60" };

type Tone = "ok" | "warn" | "muted" | "danger";

const TONE_CLASS: Record<Tone, string> = {
  ok: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  warn: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  muted: "border-border bg-muted/50 text-muted-foreground",
  danger: "border-destructive/30 bg-destructive/10 text-destructive",
};

function Chip({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <Badge
      variant="outline"
      className={cn("rounded-md border px-1.5 py-0 text-[11px] font-medium leading-5", TONE_CLASS[tone])}
    >
      {children}
    </Badge>
  );
}

/** شارات الحالة: ما يراه المحرر أولاً قبل القراءة. */
function statusChips(row: OccurrenceRow): { label: string; tone: Tone }[] {
  const chips: { label: string; tone: Tone }[] = [];
  if (row.status === "cancelled") chips.push({ label: "ملغى", tone: "danger" });
  else if (row.status === "superseded") chips.push({ label: "استُبدل", tone: "muted" });

  if (row.certainty === "unverified") chips.push({ label: CERTAINTY_LABELS.unverified, tone: "warn" });
  else if (row.certainty === "expected") chips.push({ label: CERTAINTY_LABELS.expected, tone: "warn" });
  else chips.push({ label: CERTAINTY_LABELS.confirmed, tone: "ok" });

  if (!row.published) chips.push({ label: "مخفي عن الجمهور", tone: "muted" });
  if (row.regionGroup !== "all") chips.push({ label: REGION_LABELS[row.regionGroup], tone: "muted" });
  return chips;
}

/* ------------------------------------------------------------------ *
 * حسابات التواريخ
 * ------------------------------------------------------------------ */

function countdownLabel(startsOn: string, today: string): { text: string; past: boolean } {
  const days = diffIsoDays(today, startsOn);
  if (days === 0) return { text: "اليوم", past: false };
  if (days > 0) return { text: daysPhrase(days, "اليوم"), past: false };
  return { text: `قبل ${daysPhrase(-days, "اليوم").replace(/^بعد /, "")}`, past: true };
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const minutes = Math.round((Date.now() - then) / 60_000);
  if (minutes < 1) return "الآن";
  if (minutes === 1) return "قبل دقيقة";
  if (minutes === 2) return "قبل دقيقتين";
  if (minutes < 60) return `قبل ${minutes} دقيقة`;
  const hours = Math.round(minutes / 60);
  if (hours === 1) return "قبل ساعة";
  if (hours === 2) return "قبل ساعتين";
  if (hours < 24) return `قبل ${hours} ساعة`;
  const days = Math.round(hours / 24);
  if (days === 1) return "قبل يوم";
  if (days === 2) return "قبل يومين";
  if (days < 30) return `قبل ${days} يوماً`;
  return formatGregorian(riyadhDateISO(new Date(iso))).label;
}

/* ------------------------------------------------------------------ *
 * فرق سجل التغييرات
 * ------------------------------------------------------------------ */

const FIELD_LABELS: Record<string, string> = {
  titleAr: "العنوان",
  startsOn: "يبدأ",
  endsOn: "ينتهي",
  sourceUrl: "رابط المصدر",
  sourceTitle: "اسم الجهة",
  certainty: "الحالة",
  status: "حالة السجل",
  published: "النشر",
  regionGroup: "النطاق",
  hijriLabel: "التاريخ الهجري",
  publicNote: "ملاحظة القارئ",
};

const ACTION_LABELS: Record<string, string> = {
  create: "أضاف موعداً",
  update: "حدّث موعداً",
  confirm: "أكّد موعداً",
};

function formatFieldValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (field === "certainty") return CERTAINTY_LABELS[value as Certainty] ?? String(value);
  if (field === "status") return STATUS_LABELS[value as OccurrenceStatus] ?? String(value);
  if (field === "regionGroup") return REGION_LABELS[value as RegionGroup] ?? String(value);
  if (field === "published") return value ? "منشور" : "مخفي";
  return String(value);
}

type DiffRow = { field: string; label: string; from: string; to: string };

function changeDiffs(change: ChangeRow): DiffRow[] {
  const before = (change.before ?? {}) as Record<string, unknown>;
  const after = (change.after ?? {}) as Record<string, unknown>;
  const isCreate = !change.before;
  return Object.keys(FIELD_LABELS)
    .filter((field) => {
      const a = before[field] ?? null;
      const b = after[field] ?? null;
      if (isCreate) return b !== null && b !== "" && field !== "published" && field !== "status";
      return JSON.stringify(a) !== JSON.stringify(b);
    })
    .map((field) => ({
      field,
      label: FIELD_LABELS[field],
      from: formatFieldValue(field, before[field]),
      to: formatFieldValue(field, after[field]),
    }));
}

/* ------------------------------------------------------------------ *
 * قطع صغيرة
 * ------------------------------------------------------------------ */

function Field({
  id,
  label,
  hint,
  children,
  className,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-[13px] font-medium leading-none text-foreground">
        {label}
      </label>
      {children}
      {hint ? <p className="text-[11px] leading-relaxed text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  helper,
  tone = "default",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  helper?: React.ReactNode;
  tone?: "default" | "warn";
}) {
  return (
    <Card className="rounded-xl border border-border/70 bg-card p-3 shadow-none sm:p-4">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
            tone === "warn" ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : "bg-primary/10 text-primary",
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <p className="text-[12px] font-medium text-muted-foreground sm:text-[13px]">{label}</p>
      </div>
      <p className="mt-2 text-xl font-bold tabular-nums leading-tight tracking-tight sm:text-2xl">{value}</p>
      {helper ? <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{helper}</div> : null}
    </Card>
  );
}

function SectionHeader({
  title,
  count,
  tone = "default",
  open,
  onToggle,
}: {
  title: string;
  count: number;
  tone?: "default" | "warn";
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={cn(
        "flex w-full items-center justify-between gap-3 px-4 py-2.5 text-start transition-colors hover:bg-muted/40",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        tone === "warn" && "bg-amber-500/[0.07]",
      )}
    >
      <span className="flex items-center gap-2">
        {tone === "warn" ? <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" /> : null}
        <span className="text-sm font-semibold text-foreground">{title}</span>
        <span className="rounded-md bg-muted px-1.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
          {count}
        </span>
      </span>
      <span className="text-[11px] text-muted-foreground">{open ? "طيّ" : "عرض"}</span>
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * الصفحة
 * ------------------------------------------------------------------ */

export default function MawaeedManagement() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [today] = useState(() => riyadhDateISO(new Date()));
  const [form, setForm] = useState<FormState>(EMPTY);
  const [editorOpen, setEditorOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [bucket, setBucket] = useState<"all" | "attention" | "upcoming" | "past">("all");
  const [seriesFilter, setSeriesFilter] = useState<string>("all");
  const [openSections, setOpenSections] = useState({ attention: true, upcoming: true, past: false });

  const { data, isLoading, isError, refetch } = useQuery<AdminPayload>({
    queryKey: ["/api/mawaeed/admin"],
    queryFn: () => apiRequest<AdminPayload>("/api/mawaeed/admin"),
  });

  const series = useMemo(() => (Array.isArray(data?.series) ? data.series : []), [data?.series]);
  const occurrences = useMemo(
    () => (Array.isArray(data?.occurrences) ? data.occurrences : []),
    [data?.occurrences],
  );
  const changes = useMemo(() => (Array.isArray(data?.changes) ? data.changes : []), [data?.changes]);

  const seriesById = useMemo(() => new Map(series.map((item) => [item.id, item])), [series]);

  /**
   * التقسيم بحسب وظيفة المحرر: ما يجب أن يتصرف عليه، ثم القادم، ثم الأرشيف.
   * موعد مستقبلي غير ظاهر للجمهور = مهمة معلّقة، لا صف في قائمة.
   */
  const buckets = useMemo(() => {
    const kindOf = (seriesId: string) => KIND_META[seriesById.get(seriesId)?.kind ?? ""] ?? FALLBACK_KIND;
    const titleOf = (seriesId: string) => seriesById.get(seriesId)?.titleAr ?? "";
    const bucketOf = (row: OccurrenceRow): "attention" | "upcoming" | "past" => {
      const isPublic = row.published && row.status === "scheduled" && row.certainty !== "unverified";
      if (row.startsOn >= today) return isPublic ? "upcoming" : "attention";
      return "past";
    };

    const counts = { all: occurrences.length, attention: 0, upcoming: 0, past: 0 };
    for (const row of occurrences) counts[bucketOf(row)] += 1;

    const needle = query.trim().toLocaleLowerCase("ar");
    const filtered = occurrences.filter((row) => {
      if (seriesFilter !== "all" && row.seriesId !== seriesFilter) return false;
      if (bucket !== "all" && bucketOf(row) !== bucket) return false;
      if (!needle) return true;
      const hay = [row.titleAr, row.sourceTitle, row.publicNote ?? "", titleOf(row.seriesId)]
        .join(" ")
        .toLocaleLowerCase("ar");
      return hay.includes(needle);
    });

    const asc = (a: OccurrenceRow, b: OccurrenceRow) => a.startsOn.localeCompare(b.startsOn);
    const grouped = {
      attention: filtered.filter((row) => bucketOf(row) === "attention").sort(asc),
      upcoming: filtered.filter((row) => bucketOf(row) === "upcoming").sort(asc),
      past: filtered.filter((row) => bucketOf(row) === "past").sort((a, b) => asc(b, a)),
    };

    // المؤشرات تظل على كامل البيانات، لا تتأثر بالبحث أو التصفية.
    let confirmed = 0;
    let expected = 0;
    let next: OccurrenceRow | null = null;
    for (const row of occurrences) {
      if (bucketOf(row) !== "upcoming") continue;
      if (row.certainty === "expected") expected += 1;
      else if (row.certainty === "confirmed") confirmed += 1;
      if (!next || row.startsOn < next.startsOn) next = row;
    }

    return {
      grouped,
      filtered,
      counts,
      stats: { confirmed, expected, attention: counts.attention, next },
      kindOf,
      titleOf,
    };
  }, [occurrences, seriesById, query, seriesFilter, bucket, today]);

  const { grouped, filtered, counts, stats, kindOf, titleOf } = buckets;

  /* ---------------- الحفظ ---------------- */

  const save = useMutation({
    mutationFn: async (body: FormState) => {
      const payload = {
        seriesId: body.seriesId,
        titleAr: body.titleAr,
        startsOn: body.startsOn,
        endsOn: body.endsOn || null,
        sourceUrl: body.sourceUrl,
        sourceTitle: body.sourceTitle,
        certainty: body.certainty,
        status: body.status,
        published: body.certainty === "unverified" ? false : body.published,
        regionGroup: body.regionGroup,
        hijriLabel: body.hijriLabel || null,
        publicNote: body.publicNote || null,
        ruleNote: body.ruleNote || null,
      };
      if (body.id) {
        return apiRequest(`/api/mawaeed/admin/occurrences/${body.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      }
      return apiRequest("/api/mawaeed/admin/occurrences", { method: "POST", body: JSON.stringify(payload) });
    },
    onSuccess: async (_result, variables) => {
      toast({
        title: variables.id ? "حُدّث الموعد" : "أُضيف الموعد",
        description: "سُجّل التغيير في السجل، وسيظهر للجمهور حسب حالة النشر.",
      });
      setEditorOpen(false);
      setForm(EMPTY);
      await queryClient.invalidateQueries({ queryKey: ["/api/mawaeed/admin"] });
    },
    onError: (error: unknown) => {
      toast({
        variant: "destructive",
        title: "لم يُحفظ الموعد",
        description: error instanceof Error ? error.message : "تحقق من التاريخ ورابط المصدر الرسمي.",
      });
    },
  });

  const confirm = useMutation({
    mutationFn: async (row: OccurrenceRow) =>
      apiRequest(`/api/mawaeed/admin/occurrences/${row.id}/confirm`, {
        method: "POST",
        body: JSON.stringify({ sourceUrl: row.sourceUrl, sourceTitle: row.sourceTitle }),
      }),
    onSuccess: async () => {
      toast({ title: "أصبح الموعد مؤكداً", description: "ظهر للزوار على صفحة /mawaeed." });
      await queryClient.invalidateQueries({ queryKey: ["/api/mawaeed/admin"] });
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "تعذّر التأكيد",
        description: "التأكيد يحتاج رابط مصدر رسمي واسم جهة.",
      });
    },
  });

  /* ---------------- التحرير ---------------- */

  function openNew(seriesId = "") {
    setForm({ ...EMPTY, seriesId });
    setEditorOpen(true);
  }

  function openEdit(row: OccurrenceRow) {
    setForm({
      id: row.id,
      seriesId: row.seriesId,
      titleAr: row.titleAr,
      startsOn: row.startsOn,
      endsOn: row.endsOn || "",
      sourceUrl: row.sourceUrl,
      sourceTitle: row.sourceTitle,
      certainty: row.certainty,
      status: row.status,
      published: row.published,
      regionGroup: row.regionGroup,
      hijriLabel: row.hijriLabel || "",
      publicNote: row.publicNote || "",
      ruleNote: row.ruleNote || "",
    });
    setEditorOpen(true);
  }

  const formValid = Boolean(
    form.seriesId && form.titleAr.trim() && form.startsOn && form.sourceUrl.trim() && form.sourceTitle.trim(),
  );

  /* ---------------- العرض ---------------- */

  function renderRow(row: OccurrenceRow) {
    const gregorian = formatGregorian(row.startsOn);
    const hijri = formatHijri(row.startsOn, row.hijriLabel);
    const countdown = countdownLabel(row.startsOn, today);
    const kind = kindOf(row.seriesId);
    const note = row.publicNote || row.ruleNote;

    return (
      <li key={row.id}>
        <div className="flex flex-wrap items-start gap-x-4 gap-y-3 px-4 py-3.5 transition-colors hover:bg-muted/30 sm:flex-nowrap">
          <span aria-hidden className={cn("mt-1 h-11 w-[3px] shrink-0 rounded-full", kind.rail)} />

          {/* كتلة التاريخ: العنصر البصري الأول في الصف */}
          <div className="w-[74px] shrink-0 text-center">
            <p className="text-[11px] leading-4 text-muted-foreground">{gregorian.weekday}</p>
            <p className="text-[22px] font-bold leading-7 tabular-nums text-foreground">{gregorian.day}</p>
            <p className="text-[11px] leading-4 text-muted-foreground">
              {gregorian.month} {gregorian.year}
            </p>
            <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground/80">{hijri}</p>
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-6 text-foreground">{row.titleAr}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", kind.dot)} />
                {titleOf(row.seriesId)}
              </span>
              {statusChips(row).map((chip) => (
                <Chip key={chip.label} tone={chip.tone}>
                  {chip.label}
                </Chip>
              ))}
            </div>
            {row.endsOn && row.endsOn !== row.startsOn ? (
              <p className="mt-1 text-[11px] text-muted-foreground">حتى {formatGregorian(row.endsOn).label}</p>
            ) : null}
            {note ? (
              <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{note}</p>
            ) : null}
          </div>

          <div className="flex w-full shrink-0 items-center justify-between gap-3 sm:w-auto sm:flex-col sm:items-end sm:justify-start">
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[12px] font-semibold tabular-nums",
                countdown.past ? "text-muted-foreground" : "text-primary",
              )}
            >
              {countdown.past ? <History className="h-3.5 w-3.5" /> : <Hourglass className="h-3.5 w-3.5" />}
              {countdown.text}
            </span>
            <div className="flex items-center gap-1">
              {row.certainty !== "confirmed" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1 px-2 text-[12px]"
                  disabled={confirm.isPending}
                  onClick={() => confirm.mutate(row)}
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  تأكيد
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 gap-1 px-2 text-[12px]"
                onClick={() => openEdit(row)}
              >
                <Pencil className="h-3.5 w-3.5" />
                تعديل
              </Button>
            </div>
          </div>
        </div>
      </li>
    );
  }

  function renderSection(
    key: "attention" | "upcoming" | "past",
    title: string,
    rows: OccurrenceRow[],
    tone: "default" | "warn" = "default",
    emptyLabel = "",
  ) {
    if (rows.length === 0 && key !== "attention") return null;
    const open = openSections[key];
    return (
      <section key={key}>
        <SectionHeader
          title={title}
          count={rows.length}
          tone={tone}
          open={open}
          onToggle={() => setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }))}
        />
        {open ? (
          rows.length > 0 ? (
            <ul className="divide-y divide-border/60 border-t border-border/60">{rows.map(renderRow)}</ul>
          ) : (
            <p className="border-t border-border/60 px-4 py-6 text-center text-[13px] text-muted-foreground">
              {emptyLabel || "لا شيء هنا."}
            </p>
          )
        ) : null}
      </section>
    );
  }

  const nothingMatches = filtered.length === 0 && occurrences.length > 0;

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-[1400px] space-y-5 px-4 pb-10 sm:px-6" dir="rtl">
        <DashboardPageHeader
          icon={CalendarDays}
          title="مواعيدك"
          description="مواعيد الرواتب وحساب المواطن والضمان والتقاعد وإجازات التقويم الدراسي. ما لا يُنشر لا يراه الزائر، وكل حفظ يُقيَّد في سجل التغييرات."
          actions={
            <>
              <Button variant="outline" size="sm" asChild>
                <a href="/mawaeed" target="_blank" rel="noreferrer">
                  <ExternalLink className="me-1.5 h-4 w-4" />
                  الصفحة العامة
                </a>
              </Button>
              <Button size="sm" onClick={() => openNew()} disabled={series.length === 0}>
                <Plus className="me-1.5 h-4 w-4" />
                موعد جديد
              </Button>
            </>
          }
        />

        {/* المؤشرات */}
        {isLoading ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[104px] rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard
              icon={Hourglass}
              label="الموعد القادم"
              value={stats.next ? countdownLabel(stats.next.startsOn, today).text : "—"}
              helper={
                stats.next ? (
                  <>
                    {stats.next.titleAr}
                    <br />
                    {formatGregorian(stats.next.startsOn).label}
                  </>
                ) : (
                  "لا موعد قادم منشور."
                )
              }
            />
            <MetricCard
              icon={CheckCircle2}
              label="مؤكدة ومنشورة"
              value={String(stats.confirmed)}
              helper="من المواعيد القادمة"
            />
            <MetricCard
              icon={Hourglass}
              label="مواعيد متوقعة"
              value={String(stats.expected)}
              helper="من المواعيد القادمة"
            />
            <MetricCard
              icon={AlertTriangle}
              label="تحتاج إجراء"
              value={String(stats.attention)}
              tone="warn"
              helper="قادمة وغير ظاهرة للجمهور"
            />
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* الشريط الزمني */}
          <div className="space-y-3">
            {/* شريط الأدوات */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="ابحث بعنوان الموعد أو الجهة…"
                  className="h-9 pe-9"
                  aria-label="بحث في المواعيد"
                />
              </div>
              <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border/70 bg-muted/30 p-1">
                {(
                  [
                    ["all", "الكل"],
                    ["attention", "تحتاج إجراء"],
                    ["upcoming", "قادمة"],
                    ["past", "منتهية"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setBucket(value)}
                    aria-pressed={bucket === value}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      bucket === value
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {label}
                    <span className="ms-1 tabular-nums opacity-60">{counts[value]}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* مرشّح الأقسام */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSeriesFilter("all")}
                aria-pressed={seriesFilter === "all"}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[12px] transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  seriesFilter === "all"
                    ? "border-primary/40 bg-primary/10 font-medium text-primary"
                    : "border-border/70 text-muted-foreground hover:text-foreground",
                )}
              >
                كل الأقسام
              </button>
              {series.map((item) => {
                const kind = KIND_META[item.kind] ?? FALLBACK_KIND;
                const active = seriesFilter === item.id;
                const count = occurrences.filter((row) => row.seriesId === item.id).length;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSeriesFilter(item.id)}
                    aria-pressed={active}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active
                        ? "border-primary/40 bg-primary/10 font-medium text-primary"
                        : "border-border/70 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", kind.dot)} />
                    {item.titleAr}
                    <span className="tabular-nums opacity-60">{count}</span>
                  </button>
                );
              })}
            </div>

            {/* السطح الواحد: أقسام مفصولة بخطوط شعرية، لا بطاقات متطابقة */}
            <Card className="overflow-hidden rounded-2xl border border-border bg-card shadow-none">
              {isLoading ? (
                <div className="space-y-3 p-4">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-14 rounded-lg" />
                  ))}
                </div>
              ) : isError ? (
                <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
                  <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                  <p className="text-sm text-muted-foreground">تعذّر تحميل المواعيد من الخادم.</p>
                  <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
                    إعادة المحاولة
                  </Button>
                </div>
              ) : occurrences.length === 0 ? (
                <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
                  <CalendarPlus className="h-6 w-6 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">لا مواعيد بعد. ابدأ بإضافة أول موعد.</p>
                  <Button type="button" size="sm" onClick={() => openNew()} disabled={series.length === 0}>
                    <Plus className="me-1.5 h-4 w-4" />
                    موعد جديد
                  </Button>
                </div>
              ) : nothingMatches ? (
                <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
                  <Search className="h-5 w-5 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">لا نتائج مطابقة للتصفية الحالية.</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setQuery("");
                      setBucket("all");
                      setSeriesFilter("all");
                    }}
                  >
                    مسح التصفية
                  </Button>
                </div>
              ) : (
                <div className="divide-y divide-border/60">
                  {renderSection(
                    "attention",
                    "تحتاج إجراء",
                    grouped.attention,
                    "warn",
                    "كل المواعيد القادمة منشورة ومؤكدة.",
                  )}
                  {renderSection("upcoming", "القادمة", grouped.upcoming)}
                  {renderSection("past", "المنتهية", grouped.past)}
                </div>
              )}
            </Card>
          </div>

          {/* سجل التغييرات */}
          <aside className="lg:sticky lg:top-4 lg:self-start">
            <Card className="overflow-hidden rounded-2xl border border-border bg-card shadow-none">
              <header className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
                <History className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">سجل التغييرات</h2>
                <span className="ms-auto text-[11px] text-muted-foreground">آخر {changes.length}</span>
              </header>
              {isLoading ? (
                <div className="space-y-3 p-4">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-12 rounded-lg" />
                  ))}
                </div>
              ) : changes.length === 0 ? (
                <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">
                  لا تغييرات بعد. كل حفظ أو تأكيد سيظهر هنا.
                </p>
              ) : (
                <ol className="max-h-[70vh] divide-y divide-border/60 overflow-y-auto">
                  {changes.map((change) => {
                    const diffs = changeDiffs(change);
                    const headline = (change.after?.titleAr as string | undefined) ?? "موعد";
                    return (
                      <li key={change.id} className="px-4 py-3">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="text-[13px] font-medium text-foreground">
                            {ACTION_LABELS[change.action] ?? change.action}
                          </p>
                          <time dateTime={change.createdAt} className="shrink-0 text-[11px] text-muted-foreground">
                            {relativeTime(change.createdAt)}
                          </time>
                        </div>
                        <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{headline}</p>
                        <p className="text-[11px] text-muted-foreground">{change.actorName || "النظام"}</p>
                        {diffs.length > 0 ? (
                          <ul className="mt-1.5 space-y-0.5">
                            {diffs.slice(0, 4).map((diff) => (
                              <li key={diff.field} className="text-[11px] leading-relaxed text-muted-foreground">
                                <span className="font-medium text-foreground/80">{diff.label}:</span>{" "}
                                {change.before ? (
                                  <>
                                    <span className="text-muted-foreground/70 line-through">{diff.from}</span>
                                    {" ← "}
                                  </>
                                ) : null}
                                <span className="text-foreground">{diff.to}</span>
                              </li>
                            ))}
                            {diffs.length > 4 ? (
                              <li className="text-[11px] text-muted-foreground">+{diffs.length - 4} حقول أخرى</li>
                            ) : null}
                          </ul>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              )}
            </Card>
          </aside>
        </div>
      </div>

      {/* المحرر في نافذة منفصلة حتى لا يزاحم البيانات */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="flex max-h-[92vh] max-w-2xl flex-col gap-0 overflow-hidden p-0" dir="rtl">
          <DialogHeader className="border-b border-border/60 px-6 pb-3 pt-5">
            <DialogTitle>{form.id ? "تعديل موعد" : "موعد جديد"}</DialogTitle>
            <DialogDescription>
              المصدر الرسمي إلزامي. الموعد «بانتظار التحقق» يبقى مخفياً عن الجمهور حتى تأكيده.
            </DialogDescription>
          </DialogHeader>

          <form
            id="mawaeed-form"
            className="flex-1 space-y-5 overflow-y-auto px-6 py-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!formValid) return;
              save.mutate(form);
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="mw-series" label="القسم">
                <Select
                  value={form.seriesId || undefined}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, seriesId: value }))}
                >
                  <SelectTrigger id="mw-series">
                    <SelectValue placeholder="اختر القسم" />
                  </SelectTrigger>
                  <SelectContent>
                    {series.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.titleAr}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field id="mw-title" label="عنوان الموعد">
                <Input
                  id="mw-title"
                  value={form.titleAr}
                  onChange={(event) => setForm((prev) => ({ ...prev, titleAr: event.target.value }))}
                  placeholder="مثال: راتب شهر محرم"
                  required
                />
              </Field>

              <Field id="mw-starts" label="يبدأ في">
                <Input
                  id="mw-starts"
                  type="date"
                  value={form.startsOn}
                  onChange={(event) => setForm((prev) => ({ ...prev, startsOn: event.target.value }))}
                  required
                />
              </Field>

              <Field id="mw-ends" label="ينتهي في" hint="اتركه فارغاً للمواعيد ذات اليوم الواحد.">
                <Input
                  id="mw-ends"
                  type="date"
                  value={form.endsOn}
                  onChange={(event) => setForm((prev) => ({ ...prev, endsOn: event.target.value }))}
                />
              </Field>
            </div>

            <div className="grid gap-3">
              <Field id="mw-source-url" label="رابط المصدر الرسمي">
                <Input
                  id="mw-source-url"
                  value={form.sourceUrl}
                  onChange={(event) => setForm((prev) => ({ ...prev, sourceUrl: event.target.value }))}
                  placeholder="https://…"
                  dir="ltr"
                  required
                />
              </Field>
              <Field id="mw-source-title" label="اسم الجهة">
                <Input
                  id="mw-source-title"
                  value={form.sourceTitle}
                  onChange={(event) => setForm((prev) => ({ ...prev, sourceTitle: event.target.value }))}
                  placeholder="مثال: وزارة المالية"
                  required
                />
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field id="mw-certainty" label="الحالة للقارئ">
                <Select
                  value={form.certainty}
                  onValueChange={(value) =>
                    setForm((prev) => ({
                      ...prev,
                      certainty: value as Certainty,
                      published: value === "unverified" ? false : prev.published,
                    }))
                  }
                >
                  <SelectTrigger id="mw-certainty">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="confirmed">مؤكد</SelectItem>
                    <SelectItem value="expected">متوقع (محسوب)</SelectItem>
                    <SelectItem value="unverified">بانتظار التحقق (مخفي)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field id="mw-region" label="النطاق">
                <Select
                  value={form.regionGroup}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, regionGroup: value as RegionGroup }))}
                >
                  <SelectTrigger id="mw-region">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل المناطق</SelectItem>
                    <SelectItem value="riyadh_most">الرياض ومعظم المناطق</SelectItem>
                    <SelectItem value="western">مكة والمدينة وجدة والطائف</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field id="mw-status" label="حالة السجل">
                <Select
                  value={form.status}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, status: value as OccurrenceStatus }))}
                >
                  <SelectTrigger id="mw-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="scheduled">مجدول</SelectItem>
                    <SelectItem value="cancelled">ملغى</SelectItem>
                    <SelectItem value="superseded">استُبدل</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="rounded-xl border border-border/70 bg-muted/25 p-3">
              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-primary"
                  checked={form.published}
                  disabled={form.certainty === "unverified"}
                  onChange={(event) => setForm((prev) => ({ ...prev, published: event.target.checked }))}
                />
                <span>
                  <span className="flex items-center gap-1.5 text-[13px] font-medium text-foreground">
                    {form.published ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : null}
                    منشور في الصفحة العامة
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
                    {form.certainty === "unverified"
                      ? "لا يمكن نشر موعد بانتظار التحقق."
                      : "عند الإلغاء يبقى الموعد في اللوحة ولا يراه الزائر."}
                  </span>
                </span>
              </label>
            </div>

            <div className="grid gap-3">
              <Field id="mw-hijri" label="التاريخ الهجري (اختياري)" hint="اتركه فارغاً ليُحسب تلقائياً بتقويم أم القرى.">
                <Input
                  id="mw-hijri"
                  value={form.hijriLabel}
                  onChange={(event) => setForm((prev) => ({ ...prev, hijriLabel: event.target.value }))}
                  placeholder="مثال: 12 ذو الحجة 1448هـ"
                />
              </Field>
              <Field id="mw-public-note" label="ملاحظة للقارئ">
                <Textarea
                  id="mw-public-note"
                  rows={2}
                  value={form.publicNote}
                  onChange={(event) => setForm((prev) => ({ ...prev, publicNote: event.target.value }))}
                />
              </Field>
              <Field id="mw-rule-note" label="ملاحظة داخلية" hint="لا تظهر للجمهور ولا تحرّك ختم آخر تحديث.">
                <Textarea
                  id="mw-rule-note"
                  rows={2}
                  value={form.ruleNote}
                  onChange={(event) => setForm((prev) => ({ ...prev, ruleNote: event.target.value }))}
                />
              </Field>
            </div>
          </form>

          <DialogFooter className="gap-2 border-t border-border/60 bg-muted/20 px-6 py-4 sm:justify-start sm:space-x-0">
            <Button type="submit" form="mawaeed-form" disabled={save.isPending || !formValid}>
              {save.isPending ? "جارٍ الحفظ…" : form.id ? "حفظ التعديل" : "إضافة الموعد"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEditorOpen(false)}>
              إلغاء
            </Button>
            {form.id ? (
              <Button type="button" variant="outline" onClick={() => setForm(EMPTY)}>
                تفريغ الحقول
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
