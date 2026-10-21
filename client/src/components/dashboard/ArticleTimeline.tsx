// السجل الزمني للمادة: كل حدث من الإدخال إلى النشر أو الأرشفة، مع القيم قبل وبعد،
// والمقارنة والاسترجاع من نسخ article_versions. البيانات من /api/admin/articles/:id/history.
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  Plus,
  Pencil,
  Globe,
  EyeOff,
  CheckCircle,
  XCircle,
  Trash,
  RotateCcw,
  Clock,
  Archive,
  Undo2,
  History,
} from "lucide-react";
import {
  ARTICLE_IMAGE_SOURCE_LABELS,
  ARTICLE_STATUS_LABELS,
  ARTICLE_VERSION_FIELD_LABELS,
  type ArticleVersionField,
  type ContentMedia,
} from "@shared/articleHistory";
import { ArticleVersionCompare, type RestoreRequest } from "./ArticleVersionCompare";

interface ArticleTimelineProps {
  articleId: string;
  /** استرجاع النسخ لمن يملك articles.edit_any (أو الصلاحية الشاملة). */
  canRestore?: boolean;
}

interface FieldChange {
  field: ArticleVersionField;
  oldValue: unknown;
  newValue: unknown;
}

interface EventMetadata {
  changedFields?: string[];
  fields?: ArticleVersionField[];
  changes?: FieldChange[];
  autosave?: boolean;
  versionId?: string;
  versionNumber?: number;
  content?: {
    beforeWords: number;
    afterWords: number;
    textChanged?: boolean;
    mediaAdded?: ContentMedia[];
    mediaRemoved?: ContentMedia[];
  };
  restoredFromVersionNumber?: number;
  reason?: string;
  [key: string]: unknown;
}

interface ArticleEvent {
  id: string;
  eventType: string;
  summary: string;
  metadata: EventMetadata | null;
  createdAt: string;
  actorFirstName: string | null;
  actorLastName: string | null;
  actorAvatarUrl: string | null;
}

interface VersionSummary {
  id: string;
  versionNumber: number;
  action: string;
  changedFields: string[];
  reason: string | null;
  createdAt: string;
  wordCount: number;
  actorFirstName: string | null;
  actorLastName: string | null;
}

interface HistoryResponse {
  events: ArticleEvent[];
  versions: VersionSummary[];
  categories: Record<string, string>;
}

type FilterKey = "all" | "content" | "status" | "review";

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "الكل" },
  { key: "content", label: "تعديلات المحتوى" },
  { key: "status", label: "الحالة والنشر" },
  { key: "review", label: "المراجعة" },
];

const FILTER_EVENT_TYPES: Record<Exclude<FilterKey, "all">, Set<string>> = {
  content: new Set(["created", "updated", "restored"]),
  status: new Set(["published", "unpublished", "archived", "deleted"]),
  review: new Set(["approved", "rejected"]),
};

const EVENT_STYLE: Record<
  string,
  { icon: React.ComponentType<{ className?: string }>; label: string; tone: string }
> = {
  created: { icon: Plus, label: "إدخال", tone: "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200" },
  updated: { icon: Pencil, label: "تعديل", tone: "bg-indigo-100 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-200" },
  published: { icon: Globe, label: "نشر", tone: "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200" },
  unpublished: { icon: EyeOff, label: "إلغاء النشر", tone: "bg-slate-200 text-slate-900 dark:bg-slate-800 dark:text-slate-100" },
  archived: { icon: Archive, label: "أرشفة", tone: "bg-slate-200 text-slate-900 dark:bg-slate-800 dark:text-slate-100" },
  approved: { icon: CheckCircle, label: "اعتماد", tone: "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200" },
  rejected: { icon: XCircle, label: "رفض", tone: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200" },
  deleted: { icon: Trash, label: "حذف", tone: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200" },
  restored: { icon: RotateCcw, label: "استعادة", tone: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" },
};

function formatDateTime(dateString: string): string {
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(dateString));
}

function shortTime(dateString: string): string {
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { hour: "numeric", minute: "2-digit" }).format(new Date(dateString));
}

function actorName(first: string | null, last: string | null): string {
  if (!first && !last) return "النظام";
  return [first, last].filter(Boolean).join(" ");
}

function actorInitials(first: string | null, last: string | null): string {
  if (!first && !last) return "س";
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}` || "؟";
}

function eventLabel(event: ArticleEvent): string {
  const meta = event.metadata ?? {};
  if (event.eventType === "restored" && meta.restoredFromVersionNumber) return "استرجاع نسخة";
  if (event.eventType === "updated" && meta.autosave) return "حفظ تلقائي";
  return EVENT_STYLE[event.eventType]?.label ?? event.eventType;
}

function valueText(field: ArticleVersionField, value: unknown, categories: Record<string, string>): string {
  if (value === null || value === undefined || value === "") return "—";
  if (field === "categoryId") return categories[String(value)] ?? "تصنيف محذوف";
  if (field === "status") return ARTICLE_STATUS_LABELS[String(value)] ?? String(value);
  if (field === "keywords") return Array.isArray(value) && value.length ? value.join("، ") : "—";
  if (field === "imageSource") return ARTICLE_IMAGE_SOURCE_LABELS[String(value)] ?? String(value);
  return String(value);
}

function Thumb({ src, alt }: { src: string; alt: string }) {
  return (
    <a href={src} target="_blank" rel="noreferrer" className="block">
      <img src={src} alt={alt} className="h-16 w-28 rounded border object-cover" loading="lazy" />
    </a>
  );
}

/** صور قبل وبعد (الصورة الرئيسية أو الألبوم): ما حُذف بإطار أحمر وما أضيف بإطار أخضر. */
function ImageListRow({ label, before, after }: { label: string; before: string[]; after: string[] }) {
  const removed = before.filter((src) => !after.includes(src));
  const added = after.filter((src) => !before.includes(src));
  const groups = [
    { key: "removed", title: before.length === 1 && after.length <= 1 ? "قبل" : "حُذفت", items: removed, tone: "text-red-800 dark:text-red-300" },
    { key: "added", title: after.length === 1 && before.length <= 1 ? "بعد" : "أضيفت", items: added, tone: "text-green-800 dark:text-green-300" },
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[88px_minmax(0,1fr)] border-b last:border-b-0">
      <div className="bg-muted/50 px-3 py-1.5 text-xs font-semibold text-muted-foreground sm:p-3">{label}</div>
      <div className="flex flex-wrap items-start gap-4 p-3">
        {groups.map((group) => (
          <figure key={group.key} className="m-0 space-y-1">
            <figcaption className={cn("text-xs font-semibold", group.tone)}>{group.title}</figcaption>
            {group.items.length ? (
              <div className="flex flex-wrap gap-2">
                {group.items.map((src) => <Thumb key={src} src={src} alt={`${label} — ${group.title}`} />)}
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">بلا صورة</span>
            )}
          </figure>
        ))}
      </div>
    </div>
  );
}

function asList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string" && v !== "");
  return typeof value === "string" && value ? [value] : [];
}

function contentSummary(content: NonNullable<EventMetadata["content"]>): string {
  const words = `${content.beforeWords} ← ${content.afterWords} كلمة`;
  if (content.textChanged === false) return `النص لم يتغيّر (${content.afterWords} كلمة)، التغيير في التنسيق أو الوسائط`;
  return words;
}

function ChangeRow({ change, categories }: { change: FieldChange; categories: Record<string, string> }) {
  const label = ARTICLE_VERSION_FIELD_LABELS[change.field] ?? change.field;
  if (change.field === "albumImages") {
    return <ImageListRow label={label} before={asList(change.oldValue)} after={asList(change.newValue)} />;
  }
  if (change.field === "imageUrl") {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-[88px_minmax(0,1fr)] border-b last:border-b-0">
        <div className="bg-muted/50 px-3 py-1.5 text-xs font-semibold text-muted-foreground sm:p-3">{label}</div>
        <div className="flex flex-wrap items-center gap-3 p-3">
          {[change.oldValue, change.newValue].map((url, index) => (
            <figure key={index} className="m-0 space-y-1">
              <figcaption className={cn("text-xs font-semibold", index === 0 ? "text-red-800 dark:text-red-300" : "text-green-800 dark:text-green-300")}>
                {index === 0 ? "قبل" : "بعد"}
              </figcaption>
              {typeof url === "string" && url ? (
                <img src={url} alt={index === 0 ? "الصورة قبل" : "الصورة بعد"} className="h-16 w-28 rounded border object-cover" loading="lazy" />
              ) : (
                <span className="text-xs text-muted-foreground">بلا صورة</span>
              )}
            </figure>
          ))}
        </div>
      </div>
    );
  }
  const inline =
    change.field === "categoryId" || change.field === "status" || change.field === "newsType" || change.field === "imageSource";
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[88px_minmax(0,1fr)] border-b last:border-b-0">
      <div className="bg-muted/50 px-3 py-1.5 text-xs font-semibold text-muted-foreground sm:p-3">{label}</div>
      {inline ? (
        <div className="flex flex-wrap items-center gap-2 p-3 text-sm">
          <span className="rounded bg-red-100 px-1.5 text-red-900 line-through dark:bg-red-950 dark:text-red-200">
            {valueText(change.field, change.oldValue, categories)}
          </span>
          <span aria-hidden="true" className="text-muted-foreground">←</span>
          <span className="rounded bg-green-100 px-1.5 text-green-900 dark:bg-green-950 dark:text-green-200">
            {valueText(change.field, change.newValue, categories)}
          </span>
        </div>
      ) : (
        <div className="space-y-1.5 p-3 text-sm leading-7">
          <div className="flex gap-2">
            <span className="min-w-[2rem] text-xs font-semibold text-red-800 dark:text-red-300">قبل</span>
            <span className="text-red-900 dark:text-red-200">{valueText(change.field, change.oldValue, categories)}</span>
          </div>
          <div className="flex gap-2">
            <span className="min-w-[2rem] text-xs font-semibold text-green-800 dark:text-green-300">بعد</span>
            <span className="text-green-900 dark:text-green-200">{valueText(change.field, change.newValue, categories)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function TimelineSkeleton() {
  return (
    <div className="space-y-6" dir="rtl">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex gap-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

type TimelineItem =
  | { kind: "event"; event: ArticleEvent }
  | { kind: "autosaves"; events: ArticleEvent[] };

export function ArticleTimeline({ articleId, canRestore = false }: ArticleTimelineProps) {
  const { toast } = useToast();
  const [filter, setFilter] = useState<FilterKey>("all");
  const [openAutosaves, setOpenAutosaves] = useState<Set<string>>(new Set());
  const [compare, setCompare] = useState<{ versionId: string; field?: "content" | "title" } | null>(null);
  const [pendingRestore, setPendingRestore] = useState<(RestoreRequest & { title: string }) | null>(null);
  const [reason, setReason] = useState("");

  const history = useQuery<HistoryResponse>({
    queryKey: ["/api/admin/articles", articleId, "history"],
    queryFn: () => apiRequest(`/api/admin/articles/${articleId}/history`),
  });

  const restore = useMutation({
    mutationFn: (request: RestoreRequest) =>
      apiRequest(`/api/admin/articles/${articleId}/versions/${request.versionId}/restore`, {
        method: "POST",
        body: JSON.stringify({ fields: request.fields, reason: reason.trim() || undefined }),
      }),
    onSuccess: () => {
      toast({ title: "تم الاسترجاع", description: "يُعاد تحميل المحرر بالنسخة المسترجعة." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/articles", articleId] });
      // المحرر يحمل حالة النموذج محليًا؛ إعادة التحميل تضمن ظهور النسخة المسترجعة وتجديد القفل.
      setTimeout(() => window.location.reload(), 600);
    },
    onError: (error: Error) => {
      toast({ title: "تعذر الاسترجاع", description: error.message, variant: "destructive" });
    },
  });

  const data = history.data;
  const events = Array.isArray(data?.events) ? data!.events : [];
  const versions = Array.isArray(data?.versions) ? data!.versions : [];
  const categories = data?.categories ?? {};
  const latestVersion = versions[0];
  const previousVersion = versions[1];
  const baseline = versions.find((v) => v.action === "baseline");

  const items = useMemo<TimelineItem[]>(() => {
    const visible = filter === "all" ? events : events.filter((e) => FILTER_EVENT_TYPES[filter].has(e.eventType));
    const out: TimelineItem[] = [];
    for (const event of visible) {
      const isAutosave = event.eventType === "updated" && event.metadata?.autosave === true;
      const last = out[out.length - 1];
      if (isAutosave && last?.kind === "autosaves") last.events.push(event);
      else if (isAutosave) out.push({ kind: "autosaves", events: [event] });
      else out.push({ kind: "event", event });
    }
    return out;
  }, [events, filter]);

  const askRestore = (request: RestoreRequest, title: string) => {
    setReason("");
    setPendingRestore({ ...request, title });
  };

  if (history.isLoading) return <TimelineSkeleton />;
  if (history.isError) {
    return <p className="py-6 text-center text-sm text-destructive" dir="rtl">تعذر تحميل سجل المادة.</p>;
  }

  if (events.length === 0 && versions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground" dir="rtl" data-testid="timeline-empty-state">
        <Clock className="mb-4 h-12 w-12 opacity-50" />
        <p className="text-lg">لا توجد أحداث مسجلة</p>
        <p className="text-sm">سيظهر سجل التغييرات هنا</p>
      </div>
    );
  }

  const renderEvent = (event: ArticleEvent) => {
    const meta = event.metadata ?? {};
    const style = EVENT_STYLE[event.eventType] ?? { icon: Clock, label: event.eventType, tone: "bg-muted text-foreground" };
    const Icon = meta.autosave ? History : style.icon;
    const name = actorName(event.actorFirstName, event.actorLastName);
    const changes = Array.isArray(meta.changes) ? meta.changes : [];
    const fieldKeys = Array.isArray(meta.fields) ? meta.fields : [];
    const legacyLabels = !meta.fields && Array.isArray(meta.changedFields) ? meta.changedFields : [];
    const fieldLabels = fieldKeys.length ? fieldKeys.map((f) => ARTICLE_VERSION_FIELD_LABELS[f] ?? f) : legacyLabels;
    const contentChanged = fieldKeys.includes("content");
    const versionId = typeof meta.versionId === "string" ? meta.versionId : null;
    const isLatest = Boolean(versionId && latestVersion && versionId === latestVersion.id);
    const versionIndex = versionId ? versions.findIndex((v) => v.id === versionId) : -1;
    const priorVersion = versionIndex >= 0 ? versions[versionIndex + 1] : undefined;

    return (
      <div key={event.id} className="flex gap-3 border-b py-4 last:border-b-0" data-testid={`timeline-event-${event.id}`}>
        <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full sm:h-10 sm:w-10", style.tone)}>
          <Icon className="h-[18px] w-[18px]" />
        </div>
        <div className="min-w-0 flex-1 space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={cn("border-0 font-semibold", style.tone)} data-testid={`badge-${event.eventType}`}>
              {eventLabel(event)}
            </Badge>
            <span className="flex items-center gap-1.5">
              <Avatar className="h-6 w-6">
                {event.actorAvatarUrl && <AvatarImage src={event.actorAvatarUrl} alt={name} />}
                <AvatarFallback className="text-xs">{actorInitials(event.actorFirstName, event.actorLastName)}</AvatarFallback>
              </Avatar>
              <span className="text-sm font-semibold">{name}</span>
            </span>
            <span className="text-xs text-muted-foreground">
              {typeof meta.versionNumber === "number" ? `النسخة ${meta.versionNumber} · ` : ""}
              {formatDateTime(event.createdAt)}
            </span>
          </div>

          <p className="m-0 text-sm text-foreground/85">
            {event.summary}
            {fieldLabels.length > 0 && ` — ${fieldLabels.length === 1 ? "حقل" : `${fieldLabels.length} حقول`}: ${fieldLabels.join("، ")}`}
            {meta.reason ? ` — ${meta.reason}` : ""}
          </p>

          {(changes.length > 0 || contentChanged) && (
            <div className="overflow-hidden rounded-lg border">
              {changes.map((change) => (
                <ChangeRow key={change.field} change={change} categories={categories} />
              ))}
              {contentChanged && (
                <div className="grid grid-cols-1 sm:grid-cols-[88px_minmax(0,1fr)]">
                  <div className="bg-muted/50 px-3 py-1.5 text-xs font-semibold text-muted-foreground sm:p-3">المتن</div>
                  <div className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                    <div className="space-y-2">
                      <span className="text-foreground/85">{meta.content ? contentSummary(meta.content) : "تغيّر المتن"}</span>
                      {(["mediaAdded", "mediaRemoved"] as const).map((key) => {
                        const media = meta.content?.[key] ?? [];
                        if (!media.length) return null;
                        const added = key === "mediaAdded";
                        return (
                          <div key={key} className="space-y-1">
                            <div className={cn("text-xs font-semibold", added ? "text-green-800 dark:text-green-300" : "text-red-800 dark:text-red-300")}>
                              {added ? "أضيف داخل المتن" : "حُذف من المتن"}: {media.length} {media.length === 1 ? "عنصر" : "عناصر"}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {media.map((m) =>
                                m.kind === "image" ? (
                                  <Thumb key={m.src} src={m.src} alt={added ? "صورة أضيفت داخل المتن" : "صورة حُذفت من المتن"} />
                                ) : (
                                  <a key={m.src} href={m.src} target="_blank" rel="noreferrer" className="break-all text-xs text-primary underline">
                                    فيديو: {m.src}
                                  </a>
                                ),
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {versionId && (
                      <Button type="button" variant="ghost" size="sm" className="h-9 px-2 text-primary underline-offset-4 hover:underline" onClick={() => setCompare({ versionId, field: "content" })} data-testid={`button-compare-content-${event.id}`}>
                        مقارنة المتن قبل وبعد
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {versionId && (
            <div className="flex flex-wrap gap-2">
              {priorVersion && (
                <Button type="button" variant="outline" size="sm" className="h-10" onClick={() => setCompare({ versionId })} data-testid={`button-compare-${event.id}`}>
                  مقارنة
                </Button>
              )}
              {canRestore && isLatest && priorVersion && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-10 border-red-200 bg-red-50 text-red-800 hover:bg-red-100 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
                  onClick={() => askRestore({ versionId: priorVersion.id, versionNumber: priorVersion.versionNumber }, "التراجع عن هذا التعديل؟")}
                  data-testid={`button-undo-${event.id}`}
                >
                  التراجع عن هذا التعديل
                </Button>
              )}
              {canRestore && !isLatest && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-10"
                  onClick={() =>
                    askRestore(
                      { versionId, versionNumber: Number(meta.versionNumber) },
                      `استرجاع النسخة ${meta.versionNumber}${event.eventType === "created" ? " (الأصل)" : ""}؟`,
                    )
                  }
                  data-testid={`button-restore-${event.id}`}
                >
                  {event.eventType === "created" ? "استرجاع النسخة الأصلية" : "استرجاع هذه النسخة"}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div dir="rtl" className="space-y-3" data-testid="article-timeline">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
          {events.length} حدثًا · {versions.length} نسخة
        </span>
        {canRestore && latestVersion && previousVersion && (
          <Button
            type="button"
            variant="outline"
            className="h-11 gap-1.5"
            disabled={restore.isPending}
            onClick={() => askRestore({ versionId: previousVersion.id, versionNumber: previousVersion.versionNumber }, "التراجع عن آخر تعديل؟")}
            data-testid="button-undo-last"
          >
            <Undo2 className="h-4 w-4" />
            تراجع عن آخر تعديل
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="تصفية السجل">
        {FILTERS.map((f) => (
          <Button
            key={f.key}
            type="button"
            size="sm"
            variant={filter === f.key ? "default" : "outline"}
            className="h-9 rounded-full"
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
            data-testid={`button-timeline-filter-${f.key}`}
          >
            {f.label}
          </Button>
        ))}
      </div>

      <div>
        {items.map((item) => {
          if (item.kind === "event") return renderEvent(item.event);
          const key = item.events[0].id;
          const expanded = openAutosaves.has(key);
          const first = item.events[item.events.length - 1];
          const last = item.events[0];
          return (
            <div key={key} className="border-b py-3 last:border-b-0">
              <Button
                type="button"
                variant="outline"
                className="h-10 border-dashed text-sm font-normal"
                aria-expanded={expanded}
                onClick={() =>
                  setOpenAutosaves((prev) => {
                    const next = new Set(prev);
                    if (next.has(key)) next.delete(key);
                    else next.add(key);
                    return next;
                  })
                }
              >
                {item.events.length === 1
                  ? `حفظ تلقائي للمسودة ${shortTime(last.createdAt)}`
                  : `${item.events.length} حفظ تلقائي للمسودة بين ${shortTime(first.createdAt)} و${shortTime(last.createdAt)}`}
                {" — "}
                {expanded ? "إخفاء" : "عرض"}
              </Button>
              {expanded && <div className="mt-2 border-s-2 ps-3">{item.events.map(renderEvent)}</div>}
            </div>
          );
        })}

        {baseline && filter !== "status" && filter !== "review" && (
          <div className="flex gap-3 py-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
              <History className="h-[18px] w-[18px]" />
            </div>
            <div className="flex-1 space-y-2">
              <p className="m-0 text-sm font-semibold">
                النسخة {baseline.versionNumber}: أقدم نسخة محفوظة
                <span className="ms-2 text-xs font-normal text-muted-foreground">{formatDateTime(baseline.createdAt)}</span>
              </p>
              <p className="m-0 text-xs text-muted-foreground">
                حالة المادة قبل أول حفظ بعد تفعيل السجل الكامل · {baseline.wordCount} كلمة
              </p>
              {canRestore && baseline.id !== latestVersion?.id && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-10"
                  onClick={() => askRestore({ versionId: baseline.id, versionNumber: baseline.versionNumber }, `استرجاع النسخة ${baseline.versionNumber}؟`)}
                  data-testid="button-restore-baseline"
                >
                  استرجاع هذه النسخة
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      <ArticleVersionCompare
        articleId={articleId}
        versionId={compare?.versionId ?? null}
        open={Boolean(compare)}
        onOpenChange={(open) => !open && setCompare(null)}
        categories={categories}
        canRestore={canRestore}
        initialField={compare?.field ?? "content"}
        onRestore={(request) => {
          setCompare(null);
          askRestore(
            request,
            request.fields?.length
              ? `استرجاع ${request.fields.map((f) => ARTICLE_VERSION_FIELD_LABELS[f]).join("، ")} من النسخة ${request.versionNumber}؟`
              : `استرجاع النسخة ${request.versionNumber} كاملة؟`,
          );
        }}
      />

      <AlertDialog open={Boolean(pendingRestore)} onOpenChange={(open) => !open && setPendingRestore(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader className="text-right">
            <AlertDialogTitle>{pendingRestore?.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRestore?.fields?.length
                ? "يعود الحقل المختار إلى قيمته في تلك النسخة."
                : "يعود العنوان والعنوان الفرعي والموجز والمتن والتصنيف والصورة والكلمات المفتاحية إلى ما كانت عليه. الحالة والنشر لا يتغيران."}{" "}
              يُحفظ الوضع الحالي نسخةً في السجل فيمكن التراجع عن الاسترجاع. إذا كانت المادة منشورة يظهر التحديث للقراء فورًا،
              وأي تعديل غير محفوظ في المحرر سيُفقد.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="restore-reason">سبب الاسترجاع (يظهر في السجل فقط)</Label>
            <Input id="restore-reason" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} data-testid="input-restore-reason" />
          </div>
          <AlertDialogFooter className="gap-2 sm:justify-start">
            <AlertDialogAction
              disabled={restore.isPending}
              onClick={() => {
                if (!pendingRestore) return;
                restore.mutate({ versionId: pendingRestore.versionId, versionNumber: pendingRestore.versionNumber, fields: pendingRestore.fields });
                setPendingRestore(null);
              }}
              data-testid="button-confirm-restore"
            >
              استرجاع
            </AlertDialogAction>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
