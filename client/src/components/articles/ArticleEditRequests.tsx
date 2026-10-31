// «طلب تعديل» على الخبر: ليبل على صف الخبر، وشريحة تصفية، ونموذج الطلب عند
// المراسل، وشاشة المراجعة عند المحرر (قبل/بعد، الصور، اعتماد أو رفض مع سبب).

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Loader2, ImagePlus, X, Check, ExternalLink, FilePenLine } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { uploadNewsImage } from "@/lib/newsImageUpload";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { normalizeImageSrc } from "@/lib/cdnImage";
import { diffSequence } from "@shared/articleHistory";
import {
  EDIT_REQUEST_FIELD_LABELS,
  EDIT_REQUEST_LIMITS,
  normalizeParagraph,
  type EditRequestField,
  type EditRequestProposal,
} from "@shared/articleEditRequests";

const LIST_KEY = ["/api/article-edit-requests"] as const;

export interface EditRequestListItem {
  id: string;
  articleId: string;
  requesterId: string | null;
  requesterName: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  urgent: boolean;
  note: string;
  decisionNote: string | null;
  createdAt: string;
  decidedAt: string | null;
  articleTitle: string;
  articleStatus: string;
  articleImageUrl: string | null;
  articleThumbnailUrl: string | null;
  fields: EditRequestField[];
  label: string;
}

interface ListResponse {
  reviewer: boolean;
  requests: EditRequestListItem[];
}

function errorMessage(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : "";
  const match = raw.match(/^\d{3}:\s*(.*)$/s);
  const body = match ? match[1] : raw;
  try {
    const parsed = JSON.parse(body);
    if (parsed?.message) return parsed.message;
  } catch {
    /* نص عادي */
  }
  return body || fallback;
}

function invalidateEditRequests() {
  queryClient.invalidateQueries({ queryKey: LIST_KEY });
  queryClient.invalidateQueries({ queryKey: ["/api/admin/articles"] });
}

/** كل الطلبات الظاهرة للمستخدم، مجمّعة حسب الخبر. */
export function useArticleEditRequests(enabled: boolean, articleId?: string) {
  const query = useQuery<ListResponse | null>({
    queryKey: articleId ? [...LIST_KEY, { articleId }] : LIST_KEY,
    queryFn: async () => {
      try {
        const url = articleId ? `/api/article-edit-requests?articleId=${encodeURIComponent(articleId)}` : "/api/article-edit-requests";
        return await apiRequest<ListResponse>(url, { silent: true });
      } catch {
        return null; // قبل تفعيل الجدول أو بلا صلاحية: لا ليبل
      }
    },
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const requests = Array.isArray(query.data?.requests) ? query.data!.requests : [];
  const byArticle = useMemo(() => {
    const map = new Map<string, EditRequestListItem[]>();
    for (const item of requests) {
      const list = map.get(item.articleId) ?? [];
      list.push(item);
      map.set(item.articleId, list);
    }
    return map;
  }, [requests]);
  const pending = requests.filter((r) => r.status === "pending");
  return { requests, pending, byArticle, reviewer: query.data?.reviewer === true };
}

function PulseDot({ tone }: { tone: "amber" | "red" }) {
  return (
    <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
      <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 motion-reduce:animate-none", tone === "red" ? "bg-red-500" : "bg-amber-500")} />
      <span className={cn("relative inline-flex h-2 w-2 rounded-full", tone === "red" ? "bg-red-600" : "bg-amber-500")} />
    </span>
  );
}

/** الليبل اللافت على صف الخبر. يفتح المراجعة (أو حالة الطلب عند صاحبه). */
export function EditRequestLabel({
  items,
  onOpen,
  className,
}: {
  items: EditRequestListItem[] | undefined;
  onOpen: (requestId: string) => void;
  className?: string;
}) {
  if (!items?.length) return null;
  const pending = items.filter((i) => i.status === "pending");
  const item = pending.find((i) => i.urgent) ?? pending[0] ?? items[0];
  const isPending = item.status === "pending";
  const tone = !isPending
    ? item.status === "approved"
      ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
      : "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
    : item.urgent
      ? "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
      : "border-amber-400 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100";
  const text = !isPending
    ? item.status === "approved" ? "اعتُمد طلب التعديل" : "لم يُعتمد طلب التعديل"
    : `${item.urgent ? "طلب تعديل عاجل" : "طلب تعديل"} · ${item.label}${pending.length > 1 ? ` (${pending.length})` : ""}`;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen(item.id);
      }}
      className={cn("inline-flex min-h-8 max-w-full items-center gap-2 rounded-full border px-3 py-1 text-[13px] font-bold leading-5 transition hover:brightness-95", tone, className)}
      data-testid={`edit-request-label-${item.articleId}`}
    >
      {isPending ? <PulseDot tone={item.urgent ? "red" : "amber"} /> : item.status === "approved" ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <X className="h-3.5 w-3.5" aria-hidden="true" />}
      <span className="truncate">{text}</span>
    </button>
  );
}

/** شريحة «عليها طلب تعديل» فوق القائمة، وتحتها قائمة الطلبات المفتوحة عند تفعيلها. */
export function EditRequestsFilter({
  pending,
  onOpen,
}: {
  pending: EditRequestListItem[];
  onOpen: (requestId: string) => void;
}) {
  const [active, setActive] = useState(false);
  if (pending.length === 0) return null;
  const urgent = pending.some((p) => p.urgent);
  return (
    <div className="space-y-2" data-testid="edit-requests-filter">
      <button
        type="button"
        aria-pressed={active}
        onClick={() => setActive((v) => !v)}
        className={cn(
          "inline-flex min-h-9 items-center gap-2 rounded-full border px-4 text-sm font-bold transition",
          urgent ? "border-red-300 text-red-700 dark:text-red-200" : "border-amber-400 text-amber-900 dark:text-amber-100",
          active ? (urgent ? "bg-red-100 dark:bg-red-950/60" : "bg-amber-100 dark:bg-amber-950/60") : "bg-amber-50/70 dark:bg-amber-950/30",
        )}
      >
        <PulseDot tone={urgent ? "red" : "amber"} />
        عليها طلب تعديل · {pending.length}
      </button>
      {active && (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          {pending.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onOpen(item.id)}
              className="flex w-full items-center gap-3 border-b border-border/70 px-4 py-3 text-right last:border-b-0 hover:bg-muted/40"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-semibold text-foreground">{item.articleTitle}</div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                  {item.requesterName} · {item.articleStatus === "published" ? "منشور" : "مسودة"} · {new Date(item.createdAt).toLocaleString("ar-SA-u-nu-latn", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short", timeZone: "Asia/Riyadh" })}
                </div>
              </div>
              <EditRequestLabel items={[item]} onOpen={onOpen} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** زر «طلب تعديل» لصاحب الخبر. */
export function RequestEditButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn("inline-flex min-h-8 items-center gap-1.5 rounded-full bg-sky-50 px-3 text-[13px] font-semibold text-sky-800 transition hover:bg-sky-100 dark:bg-sky-950/50 dark:text-sky-200", className)}
    >
      <FilePenLine className="h-3.5 w-3.5" aria-hidden="true" />
      طلب تعديل
    </button>
  );
}

// ---------------- نموذج الطلب عند المراسل ----------------

interface ContextResponse {
  ok: true;
  article: { id: string; title: string; subtitle: string | null; status: string; articleType?: string | null; imageUrl: string | null; albumImages: string[] };
  paragraphs: string[];
  acceptsRequests: boolean;
  pendingRequestId: string | null;
}

async function uploadImage(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  form.append("entityType", "article-edit-request");
  const result = await uploadNewsImage<{ url: string }>(form);
  return result.url;
}

function Thumb({ src, alt, className }: { src: string | null | undefined; alt: string; className?: string }) {
  if (!src) return <div className={cn("flex items-center justify-center rounded-xl bg-muted text-xs text-muted-foreground", className)}>بلا صورة</div>;
  return <img src={normalizeImageSrc(src) ?? src} alt={alt} className={cn("rounded-xl object-cover", className)} loading="lazy" />;
}

export function RequestEditDialog({
  articleId,
  open,
  onOpenChange,
}: {
  articleId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const { data, isLoading, error } = useQuery<ContextResponse>({
    queryKey: ["/api/article-edit-requests/context", articleId],
    queryFn: () => apiRequest<ContextResponse>(`/api/article-edit-requests/context/${articleId}`),
    enabled: open && !!articleId,
    staleTime: 0,
  });
  // كاتب الرأي يرى «المقال» بدل «الخبر» في النموذج نفسه.
  const noun = data?.article?.articleType === "opinion" ? "المقال" : "الخبر";
  const [note, setNote] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [title, setTitle] = useState("");
  const [paragraphs, setParagraphs] = useState<string[]>([]);
  const [append, setAppend] = useState("");
  const [featured, setFeatured] = useState<string | null>(null);
  const [featuredAlt, setFeaturedAlt] = useState("");
  const [album, setAlbum] = useState<string[]>([]);
  const [uploading, setUploading] = useState<"featured" | "album" | null>(null);
  const [showText, setShowText] = useState(false);
  const featuredInput = useRef<HTMLInputElement>(null);
  const albumInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setNote("");
    setUrgent(false);
    setAppend("");
    setFeatured(null);
    setFeaturedAlt("");
    setAlbum([]);
    setShowText(false);
  }, [open, articleId]);
  useEffect(() => {
    if (!data) return;
    setTitle(data.article.title ?? "");
    setParagraphs(data.paragraphs);
  }, [data]);

  const contentEdits = data
    ? data.paragraphs
        .map((before, i) => ({ before, after: normalizeParagraph(paragraphs[i] ?? "") }))
        .filter((edit) => edit.before !== edit.after)
    : [];
  const proposed: EditRequestProposal = {
    ...(data && normalizeParagraph(title) && normalizeParagraph(title) !== normalizeParagraph(data.article.title) ? { title } : {}),
    ...(contentEdits.length ? { contentEdits } : {}),
    ...(append.trim() ? { appendParagraph: append } : {}),
    ...(featured ? { imageUrl: featured, ...(featuredAlt.trim() ? { imageAlt: featuredAlt } : {}) } : {}),
    ...(album.length ? { albumAdd: album } : {}),
  };
  const hasSomething = note.trim().length > 0 || Object.keys(proposed).length > 0;

  const submit = useMutation({
    mutationFn: () =>
      apiRequest("/api/article-edit-requests", {
        method: "POST",
        body: JSON.stringify({ articleId, urgent, note, proposed }),
      }),
    onSuccess: () => {
      toast({ title: "وصل طلبك للمحرر", description: "ستصلك النتيجة في التنبيهات." });
      invalidateEditRequests();
      onOpenChange(false);
    },
    onError: (e) => toast({ title: "تعذر إرسال الطلب", description: errorMessage(e, "حاول مرة أخرى"), variant: "destructive" }),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/article-edit-requests/${id}/cancel`, { method: "POST", body: "{}" }),
    onSuccess: () => {
      toast({ title: "أُلغي الطلب" });
      invalidateEditRequests();
      queryClient.invalidateQueries({ queryKey: ["/api/article-edit-requests/context", articleId] });
    },
    onError: (e) => toast({ title: "تعذر الإلغاء", description: errorMessage(e, ""), variant: "destructive" }),
  });

  async function onPick(kind: "featured" | "album", files: FileList | null) {
    if (!files?.length) return;
    setUploading(kind);
    try {
      if (kind === "featured") {
        setFeatured(await uploadImage(files[0]));
      } else {
        const urls: string[] = [];
        for (const file of Array.from(files).slice(0, EDIT_REQUEST_LIMITS.album - album.length)) urls.push(await uploadImage(file));
        setAlbum((prev) => [...prev, ...urls]);
      }
    } catch (e) {
      toast({ title: "تعذر رفع الصورة", description: errorMessage(e, ""), variant: "destructive" });
    } finally {
      setUploading(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-h-[92vh] max-w-2xl overflow-y-auto rounded-3xl">
        <DialogHeader className="text-right">
          <DialogTitle className="text-xl">طلب تعديل</DialogTitle>
          <DialogDescription>يصل الطلب للمحرر على {noun} نفسه، ولا يتغير شيء قبل اعتماده.</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : error || !data ? (
          <p className="py-6 text-center text-sm text-red-600">{errorMessage(error, "تعذر تحميل الخبر")}</p>
        ) : data.pendingRequestId ? (
          <div className="space-y-4 py-2">
            <p className="rounded-2xl bg-amber-50 p-4 text-sm leading-7 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">لديك طلب قيد المراجعة على هذا {noun}. انتظر قرار المحرر، أو ألغِ الطلب لإرسال طلب جديد.</p>
            <Button variant="outline" className="rounded-full" disabled={cancel.isPending} onClick={() => cancel.mutate(data.pendingRequestId!)}>
              {cancel.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}إلغاء طلبي
            </Button>
          </div>
        ) : !data.acceptsRequests ? (
          <p className="py-6 text-center text-sm text-muted-foreground">لا يمكن طلب تعديل خبر مؤرشف.</p>
        ) : (
          <div className="space-y-5">
            <div className="rounded-2xl bg-muted/50 px-4 py-3 text-[15px] font-semibold leading-7">{data.article.title}</div>

            <div className="space-y-1.5">
              <Label htmlFor="er-note">ملاحظتك للمحرر</Label>
              <Textarea id="er-note" value={note} maxLength={EDIT_REQUEST_LIMITS.note} onChange={(e) => setNote(e.target.value)} placeholder="مثال: الرقم الصحيح 14 وليس 12، والصورة من فعالية أخرى" className="min-h-[80px] rounded-2xl" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="er-title">العنوان</Label>
              <Input id="er-title" value={title} maxLength={EDIT_REQUEST_LIMITS.title} onChange={(e) => setTitle(e.target.value)} className="rounded-2xl" />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>النص</Label>
                <button type="button" className="text-sm font-semibold text-sky-700 dark:text-sky-300" onClick={() => setShowText((v) => !v)}>
                  {showText ? "إخفاء الفقرات" : `تعديل فقرة (${data.paragraphs.length})`}
                </button>
              </div>
              {contentEdits.length > 0 && !showText && <p className="text-xs text-emerald-700">عدّلت {contentEdits.length} فقرة</p>}
              {showText && (
                <div className="space-y-2">
                  {data.paragraphs.map((p, i) => (
                    <Textarea
                      key={i}
                      aria-label={`الفقرة ${i + 1}`}
                      value={paragraphs[i] ?? ""}
                      onChange={(e) => setParagraphs((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))}
                      className={cn("min-h-[64px] rounded-2xl text-[15px] leading-7", normalizeParagraph(paragraphs[i] ?? "") !== p && "border-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20")}
                    />
                  ))}
                  <Textarea aria-label="فقرة جديدة في النهاية" value={append} onChange={(e) => setAppend(e.target.value)} placeholder={`فقرة جديدة تُضاف في آخر ${noun} (اختياري)`} className="min-h-[56px] rounded-2xl" />
                  <p className="text-xs text-muted-foreground">امسح نص فقرة كاملة لتقترح حذفها.</p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>الصور</Label>
              <div className="flex flex-wrap gap-3">
                <div className="relative">
                  <Thumb src={featured ?? data.article.imageUrl} alt="الصورة البارزة" className="h-20 w-28" />
                  <span className={cn("absolute right-1.5 top-1.5 rounded-full px-2 text-[11px] font-bold", featured ? "bg-sky-500 text-white" : "bg-white/90 text-foreground")}>{featured ? "بارزة جديدة" : "البارزة الحالية"}</span>
                  {featured && (
                    <button type="button" aria-label="إلغاء الصورة البارزة الجديدة" onClick={() => setFeatured(null)} className="absolute -left-2 -top-2 rounded-full bg-white p-1 shadow"><X className="h-3.5 w-3.5" /></button>
                  )}
                </div>
                <button type="button" onClick={() => featuredInput.current?.click()} disabled={uploading !== null} className="flex h-20 w-28 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border text-xs text-muted-foreground hover:bg-muted/40">
                  {uploading === "featured" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                  استبدال البارزة
                </button>
                {(data.article.albumImages ?? []).map((url) => (
                  <div key={`current-${url}`} className="relative">
                    <Thumb src={url} alt={`صورة حالية في ${noun}`} className="h-20 w-28" />
                    <span className="absolute right-1.5 top-1.5 rounded-full bg-white/90 px-2 text-[11px] font-bold text-foreground">في {noun}</span>
                  </div>
                ))}
                {album.map((url) => (
                  <div key={url} className="relative">
                    <Thumb src={url} alt="صورة للألبوم" className="h-20 w-28" />
                    <button type="button" aria-label="حذف الصورة" onClick={() => setAlbum((prev) => prev.filter((u) => u !== url))} className="absolute -left-2 -top-2 rounded-full bg-white p-1 shadow"><X className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
                {album.length < EDIT_REQUEST_LIMITS.album && (
                  <button type="button" onClick={() => albumInput.current?.click()} disabled={uploading !== null} className="flex h-20 w-28 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border text-xs text-muted-foreground hover:bg-muted/40">
                    {uploading === "album" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                    إضافة صور
                  </button>
                )}
              </div>
              {featured && (
                <Input value={featuredAlt} onChange={(e) => setFeaturedAlt(e.target.value)} maxLength={EDIT_REQUEST_LIMITS.imageAlt} placeholder="وصف الصورة البارزة (اختياري)" className="rounded-2xl" aria-label="وصف الصورة البارزة" />
              )}
              <input ref={featuredInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { onPick("featured", e.target.files); e.target.value = ""; }} />
              <input ref={albumInput} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => { onPick("album", e.target.files); e.target.value = ""; }} />
            </div>

            <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
              <div>
                <Label htmlFor="er-urgent" className="text-[15px]">تصحيح عاجل</Label>
                <p className="text-xs text-muted-foreground">خطأ في اسم أو رقم: يظهر للمحرر بالأحمر أعلى القائمة</p>
              </div>
              <Switch id="er-urgent" checked={urgent} onCheckedChange={setUrgent} />
            </div>

            <Button className="h-12 w-full rounded-full text-base" disabled={!hasSomething || submit.isPending || uploading !== null} onClick={() => submit.mutate()}>
              {submit.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}أرسل للمحرر
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------- شاشة المراجعة عند المحرر ----------------

interface DetailResponse {
  ok: true;
  reviewer: boolean;
  request: {
    id: string;
    articleId: string;
    status: EditRequestListItem["status"];
    urgent: boolean;
    note: string;
    proposed: EditRequestProposal;
    baseSnapshot: { title?: string | null; subtitle?: string | null; imageUrl?: string | null } | null;
    appliedFields: string[] | null;
    decisionNote: string | null;
    createdAt: string;
    decidedAt: string | null;
    requesterName: string;
    decidedByName: string | null;
  };
  article: { id: string; title: string; subtitle: string | null; status: string; slug: string; imageUrl: string | null; albumImages: string[] };
  fields: EditRequestField[];
  contentEdits: Array<{ before: string; after: string; found: boolean }>;
}

function WordDiff({ before, after }: { before: string; after: string }) {
  const ops = diffSequence(before.split(" "), after.split(" "));
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="rounded-2xl border border-border bg-muted/30 p-3 text-[15px] leading-8">
        <div className="mb-1 text-xs text-muted-foreground">قبل</div>
        {ops.filter((o) => o.type !== "added").map((o, i) => (
          <span key={i} className={cn(o.type === "removed" && "rounded bg-red-100 px-0.5 text-red-700 line-through dark:bg-red-950/60 dark:text-red-300")}>{o.value} </span>
        ))}
      </div>
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-3 text-[15px] leading-8 dark:border-emerald-900 dark:bg-emerald-950/20">
        <div className="mb-1 text-xs text-emerald-700 dark:text-emerald-300">بعد</div>
        {after ? ops.filter((o) => o.type !== "removed").map((o, i) => (
          <span key={i} className={cn(o.type === "added" && "rounded bg-emerald-100 px-0.5 font-semibold text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200")}>{o.value} </span>
        )) : <span className="text-red-700">حذف الفقرة</span>}
      </div>
    </div>
  );
}

function ChangeCard({
  title,
  field,
  on,
  onToggle,
  canDecide,
  children,
}: {
  title: string;
  field: EditRequestField;
  on: boolean;
  onToggle: (field: EditRequestField) => void;
  canDecide: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("space-y-3 rounded-2xl border border-border bg-card p-4 transition-opacity", !on && "opacity-55")}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[15px] font-bold">{title}</h3>
        {canDecide && (
          <button
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(field)}
            className={cn("min-h-8 rounded-full px-3 text-[13px] font-semibold", on ? "bg-sky-500 text-white" : "bg-muted text-muted-foreground")}
          >
            {on ? "✓ يُطبَّق" : "لن يُطبَّق"}
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

export function ReviewEditRequestDialog({
  requestId,
  open,
  onOpenChange,
}: {
  requestId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const { data, isLoading, error, refetch } = useQuery<DetailResponse>({
    queryKey: ["/api/article-edit-requests/detail", requestId],
    queryFn: () => apiRequest<DetailResponse>(`/api/article-edit-requests/${requestId}`),
    enabled: open && !!requestId,
    staleTime: 0,
  });
  const [selected, setSelected] = useState<Set<EditRequestField>>(new Set());
  const [showLine, setShowLine] = useState(true);
  const [line, setLine] = useState("");
  const [regenerate, setRegenerate] = useState(true);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!data) return;
    setSelected(new Set(data.fields));
    setRejecting(false);
    setReason("");
    setShowLine(true);
    setLine(data.request.urgent ? "تحديث: تصحيح معلومة في الخبر" : "تحديث: إضافة معلومات وصور");
  }, [data]);

  const toggle = (field: EditRequestField) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });

  const done = (title: string) => {
    toast({ title });
    invalidateEditRequests();
    refetch();
  };
  const textSelected = selected.has("title") || selected.has("subtitle") || selected.has("content");
  const approve = useMutation({
    mutationFn: (manual: boolean) =>
      apiRequest<{ appliedFields: string[]; missingParagraphs: string[]; regenerating?: boolean }>(`/api/article-edit-requests/${requestId}/approve`, {
        method: "POST",
        body: JSON.stringify(manual ? { manual: true } : { fields: Array.from(selected), updateLine: showLine ? line : null, regenerate: textSelected && regenerate }),
      }),
    onSuccess: (result, manual) => {
      if (manual) return done("اعتُمد الطلب");
      const missing = result?.missingParagraphs?.length ?? 0;
      const base = missing ? `طُبّق الطلب، وتعذّر ${missing} فقرة تغيّرت بعده` : "طُبّق التعديل على الخبر نفسه";
      done(result?.regenerating ? `${base}. يُعاد توليد الموجز والسيو خلال دقيقة` : base);
    },
    onError: (e) => toast({ title: "تعذر الاعتماد", description: errorMessage(e, ""), variant: "destructive" }),
  });
  const reject = useMutation({
    mutationFn: () => apiRequest(`/api/article-edit-requests/${requestId}/reject`, { method: "POST", body: JSON.stringify({ reason }) }),
    onSuccess: () => done("رُفض الطلب ووصل السبب للمراسل"),
    onError: (e) => toast({ title: "تعذر الرفض", description: errorMessage(e, ""), variant: "destructive" }),
  });

  const req = data?.request;
  const p = req?.proposed ?? {};
  const canDecide = !!data?.reviewer && req?.status === "pending";
  const busy = approve.isPending || reject.isPending;
  const statusLine = req && req.status !== "pending"
    ? req.status === "approved"
      ? `اعتمده ${req.decidedByName ?? "المحرر"}${req.appliedFields?.length ? ` · طُبّق: ${req.appliedFields.map((f) => EDIT_REQUEST_FIELD_LABELS[f as EditRequestField] ?? f).join("، ")}` : ""}`
      : req.status === "rejected"
        ? `لم يُعتمد${req.decisionNote ? ` — السبب: ${req.decisionNote}` : ""}`
        : "أُلغي الطلب"
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-h-[94vh] max-w-4xl overflow-y-auto rounded-3xl">
        <DialogHeader className="text-right">
          <DialogTitle className="text-xl">مراجعة طلب تعديل</DialogTitle>
          <DialogDescription>{data ? data.article.title : "…"}</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : error || !data || !req ? (
          <p className="py-6 text-center text-sm text-red-600">{errorMessage(error, "تعذر تحميل الطلب")}</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {req.urgent && <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-700 dark:bg-red-950/50 dark:text-red-200">عاجل</span>}
              <span className="rounded-full bg-muted px-3 py-1 text-xs">{data.article.status === "published" ? "منشور" : "مسودة"}</span>
              <span className="text-sm text-muted-foreground">
                {req.requesterName} · {new Date(req.createdAt).toLocaleString("ar-SA-u-nu-latn", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short", timeZone: "Asia/Riyadh" })}
              </span>
              {data.article.status === "published" && (
                <a href={`/article/${data.article.slug}`} target="_blank" rel="noreferrer" className="mr-auto inline-flex items-center gap-1 text-sm font-semibold text-sky-700 dark:text-sky-300">
                  الخبر المنشور <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>

            {statusLine && (
              <div className={cn("rounded-2xl px-4 py-3 text-sm font-semibold", req.status === "approved" ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200" : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200")}>{statusLine}</div>
            )}

            {req.note && <div className="rounded-2xl bg-muted/50 p-4 text-[15px] leading-8">{req.note}</div>}

            {p.title && (
              <ChangeCard title="العنوان" field="title" on={selected.has("title")} onToggle={toggle} canDecide={canDecide}>
                <WordDiff before={normalizeParagraph(data.article.title ?? "")} after={normalizeParagraph(p.title)} />
              </ChangeCard>
            )}
            {p.subtitle && (
              <ChangeCard title="العنوان الفرعي" field="subtitle" on={selected.has("subtitle")} onToggle={toggle} canDecide={canDecide}>
                <WordDiff before={normalizeParagraph(data.article.subtitle ?? "")} after={normalizeParagraph(p.subtitle)} />
              </ChangeCard>
            )}
            {(data.contentEdits.length > 0 || p.appendParagraph) && (
              <ChangeCard title={`النص · ${data.contentEdits.length + (p.appendParagraph ? 1 : 0)} فقرة`} field="content" on={selected.has("content")} onToggle={toggle} canDecide={canDecide}>
                <div className="space-y-3">
                  {data.contentEdits.map((edit, i) => (
                    <div key={i} className="space-y-1">
                      {!edit.found && req.status === "pending" && <p className="text-xs font-semibold text-amber-700">هذه الفقرة تغيّرت بعد الطلب ولن تُطبَّق تلقائيًا</p>}
                      <WordDiff before={edit.before} after={edit.after} />
                    </div>
                  ))}
                  {p.appendParagraph && (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-3 text-[15px] leading-8 dark:border-emerald-900 dark:bg-emerald-950/20">
                      <div className="mb-1 text-xs text-emerald-700">فقرة جديدة في آخر الخبر</div>
                      {p.appendParagraph}
                    </div>
                  )}
                </div>
              </ChangeCard>
            )}
            {p.imageUrl && (
              <ChangeCard title="استبدال الصورة البارزة" field="imageUrl" on={selected.has("imageUrl")} onToggle={toggle} canDecide={canDecide}>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Thumb src={req.baseSnapshot?.imageUrl ?? data.article.imageUrl} alt="الصورة الحالية" className="aspect-[3/2] w-full" />
                    <p className="text-xs text-red-700">الحالية · تبقى في السجل ويمكن استرجاعها</p>
                  </div>
                  <div className="space-y-1">
                    <Thumb src={p.imageUrl} alt={p.imageAlt ?? "الصورة المقترحة"} className="aspect-[3/2] w-full ring-2 ring-sky-300" />
                    <p className="text-xs text-emerald-700">المقترحة{p.imageAlt ? ` · ${p.imageAlt}` : ""}</p>
                  </div>
                </div>
              </ChangeCard>
            )}
            {p.albumAdd?.length ? (
              <ChangeCard title={`إضافة ${p.albumAdd.length} صور للألبوم`} field="albumImages" on={selected.has("albumImages")} onToggle={toggle} canDecide={canDecide}>
                <div className="flex flex-wrap gap-2">
                  {p.albumAdd.map((url) => <Thumb key={url} src={url} alt="صورة جديدة للألبوم" className="h-24 w-32 ring-2 ring-dashed ring-sky-300" />)}
                </div>
              </ChangeCard>
            ) : null}

            {canDecide && !rejecting && (
              <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
                {data.article.status === "published" && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <Label htmlFor="er-line" className="text-[15px]">سطر «تحديث» للقارئ</Label>
                        <p className="text-xs text-muted-foreground">يظهر أسفل الخبر بتوقيت الرياض</p>
                      </div>
                      <Switch id="er-line" checked={showLine} onCheckedChange={setShowLine} />
                    </div>
                    {showLine && <Input value={line} onChange={(e) => setLine(e.target.value)} maxLength={EDIT_REQUEST_LIMITS.updateLine} className="rounded-2xl" aria-label="نص سطر التحديث" />}
                  </div>
                )}
                {textSelected && (
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <Label htmlFor="er-regen" className="text-[15px]">أعد توليد الموجز والسيو</Label>
                      <p className="text-xs text-muted-foreground">موجز جديد ووصف وكلمات مفتاحية من النص بعد التعديل</p>
                    </div>
                    <Switch id="er-regen" checked={regenerate} onCheckedChange={setRegenerate} />
                  </div>
                )}
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button className="h-11 flex-1 rounded-full" disabled={busy || selected.size === 0} onClick={() => approve.mutate(false)}>
                    {approve.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}اعتماد وتطبيق ({selected.size})
                  </Button>
                  <Button variant="secondary" className="h-11 rounded-full" asChild>
                    <a href={`/dashboard/articles/${data.article.id}/edit?editRequest=${req.id}`}>عدّل في المحرر ثم اعتمد</a>
                  </Button>
                  <Button variant="outline" className="h-11 rounded-full border-red-200 text-red-700 hover:bg-red-50" disabled={busy} onClick={() => setRejecting(true)}>رفض مع سبب</Button>
                </div>
              </div>
            )}

            {canDecide && rejecting && (
              <div className="space-y-3 rounded-2xl border border-red-200 bg-card p-4">
                <Label htmlFor="er-reason">سبب الرفض (يصل للمراسل)</Label>
                <div className="flex flex-wrap gap-2">
                  {["المعلومة غير موثّقة", "الصورة غير واضحة", "يحتاج خبرًا جديدًا"].map((r) => (
                    <button key={r} type="button" onClick={() => setReason(r)} className="rounded-full bg-muted px-3 py-1 text-sm hover:bg-muted/70">{r}</button>
                  ))}
                </div>
                <Textarea id="er-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={EDIT_REQUEST_LIMITS.rejectReason} className="min-h-[80px] rounded-2xl" />
                <div className="flex gap-2">
                  <Button variant="destructive" className="h-11 flex-1 rounded-full" disabled={busy || reason.trim().length < 3} onClick={() => reject.mutate()}>
                    {reject.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}أرسل الرفض
                  </Button>
                  <Button variant="ghost" className="h-11 rounded-full" onClick={() => setRejecting(false)}>تراجع</Button>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** شريط داخل المحرر: على هذا الخبر طلب تعديل مفتوح، مع اعتماده بعد التعديل اليدوي. */
export function ArticleEditRequestsBanner({ articleId, enabled }: { articleId: string | null | undefined; enabled: boolean }) {
  const { pending, reviewer } = useArticleEditRequests(enabled && !!articleId, articleId ?? undefined);
  const [openId, setOpenId] = useState<string | null>(null);
  const { toast } = useToast();
  const fromLink = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("editRequest") : null;
  const markDone = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/article-edit-requests/${id}/approve`, { method: "POST", body: JSON.stringify({ manual: true }) }),
    onSuccess: () => {
      toast({ title: "اعتُمد الطلب ووصل الإشعار للمراسل" });
      invalidateEditRequests();
    },
    onError: (e) => toast({ title: "تعذر الاعتماد", description: errorMessage(e, ""), variant: "destructive" }),
  });
  if (!reviewer || pending.length === 0) return null;
  const item = pending.find((p) => p.id === fromLink) ?? pending.find((p) => p.urgent) ?? pending[0];
  return (
    <div className={cn("mb-3 flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3", item.urgent ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40" : "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40")} data-testid="editor-edit-request-banner">
      <PulseDot tone={item.urgent ? "red" : "amber"} />
      <div className="min-w-0 flex-1 text-sm leading-6">
        <span className="font-bold">{item.urgent ? "طلب تعديل عاجل" : "طلب تعديل"} من {item.requesterName}</span>
        <span className="text-muted-foreground"> · {item.label}</span>
        {item.note && <div className="truncate text-muted-foreground">{item.note}</div>}
      </div>
      <Button size="sm" variant="secondary" className="rounded-full" onClick={() => setOpenId(item.id)}>عرض الطلب</Button>
      <Button size="sm" className="rounded-full" disabled={markDone.isPending} onClick={() => markDone.mutate(item.id)}>
        {markDone.isPending && <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin" />}عدّلتُ الخبر، اعتمد الطلب
      </Button>
      <ReviewEditRequestDialog requestId={openId} open={!!openId} onOpenChange={(o) => !o && setOpenId(null)} />
    </div>
  );
}
