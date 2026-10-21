// مقارنة نسختين من المادة: المحذوف بالأحمر والمضاف بالأخضر، واسترجاع حقل أو نسخة كاملة.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ARTICLE_IMAGE_SOURCE_LABELS,
  ARTICLE_STATUS_LABELS,
  ARTICLE_VERSION_ACTION_LABELS,
  ARTICLE_VERSION_FIELD_LABELS,
  contentBlocks,
  diffContent,
  diffSequence,
  parseMediaBlock,
  parseStoredSnapshot,
  type ArticleRestorableField,
  type ArticleSnapshot,
  type ArticleVersionAction,
  type ParagraphDiff,
} from "@shared/articleHistory";

interface VersionRow {
  id: string;
  versionNumber: number;
  action: string;
  createdAt: string;
  snapshot?: Record<string, unknown>;
}

interface VersionPairResponse {
  version: VersionRow & { snapshot: Record<string, unknown> };
  compareTo: (VersionRow & { snapshot: Record<string, unknown> }) | null;
  versions: VersionRow[];
}

type CompareField = ArticleRestorableField;
const COMPARE_FIELDS: CompareField[] = ["title", "subtitle", "excerpt", "content", "categoryId", "imageUrl", "albumImages", "videoUrl", "keywords"];

export interface RestoreRequest {
  versionId: string;
  versionNumber: number;
  fields?: ArticleRestorableField[];
}

function shortTime(value: string): string {
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function versionLabel(row: VersionRow): string {
  const action = ARTICLE_VERSION_ACTION_LABELS[row.action as ArticleVersionAction] ?? row.action;
  return `النسخة ${row.versionNumber} — ${action}، ${shortTime(row.createdAt)}`;
}

function fieldText(snapshot: ArticleSnapshot, field: CompareField, categories: Record<string, string>): string {
  if (field === "categoryId") return snapshot.categoryId ? categories[snapshot.categoryId] ?? "تصنيف محذوف" : "بلا تصنيف";
  if (field === "keywords") return snapshot.keywords.join("، ");
  if (field === "albumImages") return (snapshot.albumImages ?? []).join("\n");
  if (field === "imageUrl") return `${snapshot.imageUrl ?? ""}|${snapshot.imageSource ?? ""}`;
  return (snapshot[field] as string | null) ?? "";
}

function imageSourceLabel(snapshot: ArticleSnapshot): string | null {
  if (!snapshot.imageUrl || !snapshot.imageSource) return null;
  return ARTICLE_IMAGE_SOURCE_LABELS[snapshot.imageSource] ?? null;
}

function MediaBlock({ block, tone }: { block: string; tone?: "removed" | "added" }) {
  const media = parseMediaBlock(block);
  if (!media) return null;
  const caption = tone === "removed" ? "حُذفت من المتن" : tone === "added" ? "أضيفت إلى المتن" : null;
  return (
    <figure
      className={cn(
        "m-0 space-y-1 rounded-md p-2",
        tone === "removed" && "bg-red-50 dark:bg-red-950/60",
        tone === "added" && "bg-green-50 dark:bg-green-950/60",
      )}
    >
      {caption && (
        <figcaption className={cn("text-xs font-bold", tone === "removed" ? "text-red-800 dark:text-red-300" : "text-green-800 dark:text-green-300")}>
          {media.kind === "image" ? "صورة" : "فيديو"} {caption}
        </figcaption>
      )}
      {media.kind === "image" ? (
        <img src={media.src} alt={caption ? `صورة ${caption}` : "صورة داخل المتن"} className={cn("max-h-48 rounded border", tone === "removed" && "opacity-60")} loading="lazy" />
      ) : (
        <a href={media.src} target="_blank" rel="noreferrer" className="break-all text-sm text-primary underline">فيديو: {media.src}</a>
      )}
    </figure>
  );
}

function WordRun({ words }: { words: ReturnType<typeof diffSequence<string>> }) {
  // الكلمات المتتالية من النوع نفسه تُعرض كتلة واحدة حتى تُقرأ الجملة المحذوفة أو المضافة متصلة.
  const runs: Array<{ type: string; text: string }> = [];
  for (const op of words) {
    const last = runs[runs.length - 1];
    if (last && last.type === op.type) last.text += ` ${op.value}`;
    else runs.push({ type: op.type, text: op.value });
  }
  return (
    <>
      {runs.map((run, index) => (
        <span key={index}>
          {run.type === "same" && run.text}
          {run.type === "removed" && (
            <del className="rounded bg-red-100 px-0.5 text-red-900 dark:bg-red-950 dark:text-red-200">{run.text}</del>
          )}
          {run.type === "added" && (
            <ins className="rounded bg-green-100 px-0.5 text-green-900 no-underline dark:bg-green-950 dark:text-green-200">{run.text}</ins>
          )}{" "}
        </span>
      ))}
    </>
  );
}

function ParagraphBlock({ part }: { part: ParagraphDiff }) {
  if (part.type !== "changed" && parseMediaBlock(part.text)) {
    return <MediaBlock block={part.text} tone={part.type === "same" ? undefined : part.type} />;
  }
  if (part.type === "same") return <p className="m-0">{part.text}</p>;
  if (part.type === "changed") return <p className="m-0"><WordRun words={part.words} /></p>;
  const removed = part.type === "removed";
  return (
    <div
      className={cn(
        "rounded-md px-3 py-2",
        removed ? "bg-red-50 text-red-900 dark:bg-red-950/60 dark:text-red-200" : "bg-green-50 text-green-900 dark:bg-green-950/60 dark:text-green-200",
      )}
    >
      <span className="block text-xs font-bold">{removed ? "فقرة محذوفة" : "فقرة مضافة"}</span>
      <span className={removed ? "line-through decoration-red-600" : undefined}>{part.text}</span>
    </div>
  );
}

export function ArticleVersionCompare({
  articleId,
  versionId,
  open,
  onOpenChange,
  categories,
  canRestore,
  onRestore,
  initialField = "content",
}: {
  articleId: string;
  versionId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Record<string, string>;
  canRestore: boolean;
  onRestore: (request: RestoreRequest) => void;
  initialField?: CompareField;
}) {
  const [toId, setToId] = useState<string | null>(null);
  const [fromId, setFromId] = useState<string | null>(null);
  const [field, setField] = useState<CompareField>(initialField);
  const [sideBySide, setSideBySide] = useState(false);
  const activeTo = toId ?? versionId;

  const pair = useQuery<VersionPairResponse>({
    queryKey: ["/api/admin/articles", articleId, "versions", activeTo, fromId ?? "previous"],
    enabled: open && Boolean(activeTo),
    queryFn: () =>
      apiRequest(
        `/api/admin/articles/${articleId}/versions/${activeTo}${fromId ? `?compareTo=${encodeURIComponent(fromId)}` : ""}`,
      ),
  });

  const data = pair.data;
  const after = data ? parseStoredSnapshot(data.version.snapshot) : null;
  const before = data?.compareTo ? parseStoredSnapshot(data.compareTo.snapshot) : null;
  const versions = Array.isArray(data?.versions) ? data!.versions : [];

  const contentDiff = useMemo(
    () => (after && field === "content" ? diffContent(before?.content ?? "", after.content) : []),
    [after?.content, before?.content, field],
  );

  const changedFields = useMemo(() => {
    if (!after) return new Set<CompareField>();
    return new Set(
      COMPARE_FIELDS.filter(
        (f) =>
          !before ||
          (before[f] !== undefined && after[f] !== undefined && fieldText(before, f, categories) !== fieldText(after, f, categories)),
      ),
    );
  }, [after, before, categories]);

  const close = (next: boolean) => {
    if (!next) {
      setToId(null);
      setFromId(null);
      setSideBySide(false);
      setField(initialField);
    }
    onOpenChange(next);
  };

  const older = data?.compareTo ?? null;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto" dir="rtl" data-testid="dialog-version-compare">
        <DialogHeader className="pr-10 text-right sm:text-right">
          <DialogTitle>مقارنة نسختين</DialogTitle>
          <DialogDescription>المحذوف بالأحمر والمضاف بالأخضر.</DialogDescription>
        </DialogHeader>

        {pair.isLoading || !data || !after ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Label htmlFor="compare-from">من</Label>
              <Select value={older?.id ?? ""} onValueChange={(value) => setFromId(value)}>
                <SelectTrigger id="compare-from" className="h-10 w-auto min-w-[220px]" data-testid="select-compare-from">
                  <SelectValue placeholder="لا توجد نسخة أقدم" />
                </SelectTrigger>
                <SelectContent>
                  {versions
                    .filter((row) => row.id !== data.version.id)
                    .map((row) => (
                      <SelectItem key={row.id} value={row.id}>{versionLabel(row)}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Label htmlFor="compare-to">إلى</Label>
              <Select value={data.version.id} onValueChange={(value) => { setToId(value); setFromId(null); }}>
                <SelectTrigger id="compare-to" className="h-10 w-auto min-w-[220px]" data-testid="select-compare-to">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {versions.map((row) => (
                    <SelectItem key={row.id} value={row.id}>{versionLabel(row)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-b pb-3">
              {COMPARE_FIELDS.map((f) => (
                <Button
                  key={f}
                  type="button"
                  size="sm"
                  variant={field === f ? "default" : "outline"}
                  className="rounded-full"
                  onClick={() => setField(f)}
                  data-testid={`button-compare-field-${f}`}
                >
                  {ARTICLE_VERSION_FIELD_LABELS[f]}
                  {changedFields.has(f) && before ? <span className="ms-1 h-1.5 w-1.5 rounded-full bg-amber-500" aria-label="تغيّر" /> : null}
                </Button>
              ))}
              {field === "content" && before && (
                <div className="ms-auto flex overflow-hidden rounded-md border" role="group" aria-label="طريقة العرض">
                  <Button type="button" size="sm" variant={sideBySide ? "ghost" : "secondary"} className="rounded-none" onClick={() => setSideBySide(false)}>دمج</Button>
                  <Button type="button" size="sm" variant={sideBySide ? "secondary" : "ghost"} className="rounded-none" onClick={() => setSideBySide(true)}>جنبًا إلى جنب</Button>
                </div>
              )}
            </div>

            {!before && (
              <p className="text-sm text-muted-foreground">هذه أقدم نسخة محفوظة، فلا توجد نسخة قبلها للمقارنة.</p>
            )}

            {field === "content" ? (
              sideBySide && before ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {[before, after].map((snap, index) => (
                    <div key={index} className="space-y-3 rounded-md border p-3 text-[15px] leading-8">
                      <p className="m-0 text-xs font-bold text-muted-foreground">{index === 0 ? `النسخة ${older?.versionNumber}` : `النسخة ${data.version.versionNumber}`}</p>
                      {contentBlocks(snap.content).map((block, i) =>
                        parseMediaBlock(block) ? <MediaBlock key={i} block={block} /> : <p key={i} className="m-0">{block}</p>,
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3 text-[16px] leading-8" data-testid="compare-content-diff">
                  {contentDiff.map((part, index) => <ParagraphBlock key={index} part={part} />)}
                </div>
              )
            ) : field === "imageUrl" ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {before && (
                  <figure className="m-0 space-y-1">
                    <figcaption className="text-xs font-bold text-red-800 dark:text-red-300">
                      قبل{imageSourceLabel(before) ? ` — ${imageSourceLabel(before)}` : ""}
                    </figcaption>
                    {before.imageUrl ? <img src={before.imageUrl} alt="الصورة قبل" className="w-full rounded-md border" /> : <p className="text-sm text-muted-foreground">بلا صورة</p>}
                  </figure>
                )}
                <figure className="m-0 space-y-1">
                  <figcaption className="text-xs font-bold text-green-800 dark:text-green-300">
                    بعد{imageSourceLabel(after) ? ` — ${imageSourceLabel(after)}` : ""}
                  </figcaption>
                  {after.imageUrl ? <img src={after.imageUrl} alt="الصورة بعد" className="w-full rounded-md border" /> : <p className="text-sm text-muted-foreground">بلا صورة</p>}
                </figure>
              </div>
            ) : field === "albumImages" ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {[...(before ? [{ snap: before, title: "قبل", tone: "text-red-800 dark:text-red-300" }] : []), { snap: after, title: "بعد", tone: "text-green-800 dark:text-green-300" }].map(
                  ({ snap, title, tone }) => (
                    <div key={title} className="space-y-1">
                      <p className={cn("m-0 text-xs font-bold", tone)}>{title}</p>
                      {snap.albumImages === undefined ? (
                        <p className="text-sm text-muted-foreground">غير مسجّل في هذه النسخة</p>
                      ) : snap.albumImages.length ? (
                        <div className="flex flex-wrap gap-2">
                          {snap.albumImages.map((src) => (
                            <img key={src} src={src} alt={`صورة ألبوم — ${title}`} className="h-20 w-32 rounded border object-cover" loading="lazy" />
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">بلا صور</p>
                      )}
                    </div>
                  ),
                )}
              </div>
            ) : (
              <div className="space-y-2 text-[15px] leading-8">
                {before && (
                  <div className="flex gap-3 rounded-md bg-red-50 px-3 py-2 text-red-900 dark:bg-red-950/60 dark:text-red-200">
                    <span className="min-w-[2.5rem] text-xs font-bold">قبل</span>
                    <span>{fieldText(before, field, categories) || "—"}</span>
                  </div>
                )}
                <div className="flex gap-3 rounded-md bg-green-50 px-3 py-2 text-green-900 dark:bg-green-950/60 dark:text-green-200">
                  <span className="min-w-[2.5rem] text-xs font-bold">بعد</span>
                  <span>{fieldText(after, field, categories) || "—"}</span>
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              حالة المادة في النسخة {data.version.versionNumber}: {ARTICLE_STATUS_LABELS[after.status] ?? after.status}
            </p>

            {canRestore && older && (
              <div className="flex flex-wrap items-center gap-2 border-t pt-4">
                <Button
                  type="button"
                  disabled={older.snapshot ? parseStoredSnapshot(older.snapshot)[field] === undefined : false}
                  onClick={() => onRestore({ versionId: older.id, versionNumber: older.versionNumber, fields: [field] })}
                  data-testid="button-restore-field"
                >
                  استرجاع {ARTICLE_VERSION_FIELD_LABELS[field]} فقط من النسخة {older.versionNumber}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onRestore({ versionId: older.id, versionNumber: older.versionNumber })}
                  data-testid="button-restore-version"
                >
                  استرجاع النسخة {older.versionNumber} كاملة
                </Button>
                <span className="text-xs text-muted-foreground">يُحفظ الوضع الحالي نسخةً جديدة أولًا، فيمكن التراجع عنه.</span>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
