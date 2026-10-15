import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useLocation, useRoute } from "wouter";
import { ArrowRight, Clock, ExternalLink, Film, ImagePlus, Loader2, Send, Share2, Sparkles, X as XIcon } from "lucide-react";
import { usePublisherAccess } from "@/hooks/usePublisherAccess";
import { PublisherLayout } from "@/components/publisher/PublisherLayout";
import { TweetPreview } from "@/components/publisher/TweetPreview";
import { PublisherPageHeader } from "@/components/publisher/PublisherPageHeader";
import { ObjectUploader } from "@/components/ObjectUploader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
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
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { validateXPostText, X_MAX_WEIGHTED_LENGTH } from "@shared/socialPostText";

type Mode = "off" | "approval" | "direct";
type State = "off" | "not_published" | "expired" | "open" | "pending" | "live";
type TextSource = "title" | "custom" | "ai";
type MediaChoice = "article" | "images" | "video" | "none";

interface PostView {
  id: string;
  status: string;
  text: string;
  textSource: string;
  includeLink: boolean;
  imageSource: string;
  mediaKind: string;
  mediaUrls: string[];
  requestedAt: string | null;
  scheduledAt: string | null;
  publishedAt: string | null;
  externalPostUrl: string | null;
  note: string | null;
}

interface SocialStatus {
  mode: Mode;
  state: State;
  allowedActions: Array<"submit" | "publish_now" | "schedule">;
  accountConnected: boolean;
  accountHandle: string;
  videoSupported: boolean;
  aiRemaining: number;
  windowExpiresAt: string | null;
  article: { id: string; title: string; url: string; imageUrl: string | null; publishedAt: string | null };
  post: PostView | null;
  livePost: PostView | null;
}

const MAX_IMAGES = 4;
const MAX_VIDEO_BYTES = 512 * 1024 * 1024;

function Segmented<T extends string>({
  value,
  options,
  onChange,
  testId,
}: {
  value: T;
  options: Array<{ value: T; label: string; disabled?: boolean; hint?: string }>;
  onChange: (v: T) => void;
  testId: string;
}) {
  return (
    <div className="inline-flex flex-wrap gap-0.5 rounded-xl bg-muted/70 p-1" role="group">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50",
            value === o.value ? "bg-card font-semibold text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
          data-testid={`${testId}-${o.value}`}
        >
          {o.label}
          {o.hint ? <span className="text-[11px] font-normal text-muted-foreground">{o.hint}</span> : null}
        </button>
      ))}
    </div>
  );
}

/** بطاقات اختيار بسطر شرح تحت كل خيار (للوسائط). */
function ChoiceCards<T extends string>({
  value,
  options,
  onChange,
  testId,
}: {
  value: T;
  options: Array<{ value: T; label: string; hint: string; disabled?: boolean }>;
  onChange: (v: T) => void;
  testId: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group">
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex flex-col items-start gap-0.5 rounded-xl border p-3 text-start transition-colors disabled:cursor-not-allowed disabled:opacity-50",
              on ? "border-primary bg-primary/5 ring-1 ring-inset ring-primary" : "border-border/70 bg-card hover:bg-muted/40",
            )}
            data-testid={`${testId}-${o.value}`}
          >
            <span className="text-sm font-semibold">{o.label}</span>
            <span className="text-[11.5px] text-muted-foreground">{o.hint}</span>
          </button>
        );
      })}
    </div>
  );
}

/** خطوة مرقّمة في نموذج التغريدة: الترتيب هنا ترتيب الكتابة فعلًا. */
function Step({ n, title, aside, children }: { n: number; title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="grid grid-cols-[28px_minmax(0,1fr)] gap-3 border-b border-border/60 px-4 py-4 last:border-b-0 sm:px-5">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{n}</span>
      <div className="min-w-0 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
          <h2 className="text-sm font-semibold">{title}</h2>
          {aside}
        </div>
        {children}
      </div>
    </section>
  );
}

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "بانتظار موافقة سبق",
  failed: "تعذر النشر، فريق سبق يتابع",
  scheduled: "مجدولة",
  processing: "قيد النشر",
  published: "نُشرت",
};

/** صفحة النشر الاجتماعي لخبر الوكالة: تجهيز التغريدة ومعاينتها ثم إرسالها. */
export default function PublisherSocialCompose() {
  usePublisherAccess();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [, params] = useRoute("/dashboard/publisher/articles/:id/social");
  const id = params?.id ?? "";
  const statusKey = [`/api/publisher/portal/articles/${id}/social`];

  const { data, isLoading, error } = useQuery<SocialStatus>({ queryKey: statusKey, enabled: !!id });

  const [textSource, setTextSource] = useState<TextSource>("title");
  const [customText, setCustomText] = useState("");
  const [aiText, setAiText] = useState("");
  const [media, setMedia] = useState<MediaChoice>("article");
  const [images, setImages] = useState<string[]>([]);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [includeLink, setIncludeLink] = useState(true);
  const [when, setWhen] = useState<"asap" | "at">("asap");
  const [whenLocal, setWhenLocal] = useState("");
  const [uploading, setUploading] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [aiRemaining, setAiRemaining] = useState<number | null>(null);
  const hydrated = useRef<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // تعبئة النموذج من التغريدة المعلقة مرة واحدة لكل خبر
  useEffect(() => {
    if (!data || hydrated.current === data.article.id) return;
    hydrated.current = data.article.id;
    setMedia(data.article.imageUrl ? "article" : "none");
    const p = data.state === "pending" ? data.post : null;
    if (!p) return;
    const source = (["title", "custom", "ai"].includes(p.textSource) ? p.textSource : "custom") as TextSource;
    setTextSource(source);
    if (source === "custom") setCustomText(p.text);
    if (source === "ai") setAiText(p.text);
    setIncludeLink(p.includeLink);
    if (p.mediaKind === "image") {
      setMedia("images");
      setImages(p.mediaUrls);
    } else if (p.mediaKind === "video") {
      setMedia("video");
      setVideoUrl(p.mediaUrls[0] ?? null);
    } else setMedia(p.imageSource === "article" ? "article" : "none");
    if (p.requestedAt) {
      setWhen("at");
      setWhenLocal(toLocalInput(new Date(p.requestedAt)));
    }
  }, [data]);

  const title = data?.article.title ?? "";
  const text = textSource === "title" ? title : textSource === "custom" ? customText : aiText;
  const linkUrl = includeLink ? data?.article.url ?? null : null;
  const validation = validateXPostText(text, linkUrl);
  const mediaUrls = media === "images" ? images : media === "video" && videoUrl ? [videoUrl] : [];
  const mediaReady = media === "images" ? images.length > 0 : media === "video" ? Boolean(videoUrl) : true;
  const requestedAt = when === "at" && whenLocal ? new Date(whenLocal) : null;
  const timeValid = when === "asap" || (requestedAt !== null && requestedAt.getTime() > Date.now() + 2 * 60_000);

  const suggest = useMutation({
    mutationFn: () =>
      apiRequest<{ text: string; remaining: number }>(`/api/publisher/portal/articles/${id}/social/suggest`, {
        method: "POST",
      }),
    onSuccess: (res) => {
      setAiText(res.text);
      setAiRemaining(res.remaining);
    },
    onError: (err: Error) => toast({ variant: "destructive", title: "تعذر توليد النص", description: err.message }),
  });

  const save = useMutation({
    mutationFn: (action: "submit" | "publish_now" | "schedule") =>
      apiRequest<{ outcome: string }>(`/api/publisher/portal/articles/${id}/social`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: text.trim(),
          textSource,
          includeLink,
          media,
          mediaUrls,
          requestedAt: requestedAt ? requestedAt.toISOString() : null,
          action,
        }),
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: statusKey });
      queryClient.invalidateQueries({ queryKey: ["/api/publisher/portal/social/posts"] });
      const messages: Record<string, string> = {
        submitted: "وصلت التغريدة لفريق سبق للموافقة، وسيصلكم إشعار بالقرار.",
        updated: "حُفظ التعديل، والتغريدة ما زالت بانتظار الموافقة.",
        published: "نُشرت التغريدة على حساب سبق.",
        scheduled: "جُدولت التغريدة في موعدها.",
      };
      toast({ title: "تم", description: messages[res.outcome] ?? "تم الحفظ" });
      if (res.outcome !== "updated") navigate("/dashboard/publisher/social");
    },
    onError: (err: Error) => toast({ variant: "destructive", title: "لم تُحفظ التغريدة", description: err.message }),
  });

  const withdraw = useMutation({
    mutationFn: (postId: string) =>
      apiRequest(`/api/publisher/portal/social/posts/${postId}/withdraw`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: statusKey });
      queryClient.invalidateQueries({ queryKey: ["/api/publisher/portal/social/posts"] });
      toast({ title: "سُحبت التغريدة" });
    },
    onError: (err: Error) => toast({ variant: "destructive", title: "تعذر السحب", description: err.message }),
  });

  const chooseText = (v: TextSource) => {
    setTextSource(v);
    if (v === "custom" && !customText) setCustomText(title);
    if (v === "ai" && !aiText && !suggest.isPending) suggest.mutate();
  };

  const uploadImages = async (files: FileList | null) => {
    if (!files?.length) return;
    const room = MAX_IMAGES - images.length;
    const picked = Array.from(files).slice(0, room);
    setUploading(true);
    try {
      for (const file of picked) {
        if (!file.type.startsWith("image/") || file.size > 10 * 1024 * 1024) {
          toast({ variant: "destructive", title: "صورة غير مقبولة", description: `${file.name}: صورة حتى 10 ميجابايت` });
          continue;
        }
        const form = new FormData();
        form.append("file", file);
        const uploaded = await apiRequest<{ url: string }>("/api/media/upload", {
          method: "POST",
          body: form,
          isFormData: true,
        });
        setImages((prev) => [...prev, uploaded.url].slice(0, MAX_IMAGES));
      }
    } catch (err) {
      toast({ variant: "destructive", title: "تعذر رفع الصورة", description: err instanceof Error ? err.message : "" });
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const previewImages = useMemo(
    () => (media === "images" ? images : media === "article" && data?.article.imageUrl ? [data.article.imageUrl] : []),
    [media, images, data?.article.imageUrl],
  );

  const back = (
    <Link href="/dashboard/publisher/articles">
      <Button variant="ghost" size="sm" className="gap-1.5">
        <ArrowRight className="h-4 w-4" />
        أخباري
      </Button>
    </Link>
  );

  if (isLoading) {
    return (
      <PublisherLayout>
        <Skeleton className="h-[520px] w-full rounded-xl" />
      </PublisherLayout>
    );
  }
  if (error || !data) {
    return (
      <PublisherLayout>
        <div className="space-y-4" dir="rtl">
          {back}
          <p className="text-muted-foreground">{error instanceof Error ? error.message : "الخبر غير موجود"}</p>
        </div>
      </PublisherLayout>
    );
  }

  const blocked: Partial<Record<State, string>> = {
    off: "النشر الاجتماعي غير مفعّل لوكالتكم. تواصلوا مع فريق سبق لتفعيله.",
    not_published: "يمكن طلب التغريدة بعد نشر الخبر في سبق.",
    expired: "انتهت مهلة 48 ساعة من نشر الخبر لطلب تغريدة له.",
  };
  const live = data.state === "live" ? data.livePost ?? data.post : null;
  const pending = data.state === "pending" ? data.post : null;
  const canEdit = data.state === "open" || data.state === "pending";
  const direct = data.mode === "direct";
  const busy = save.isPending || uploading;
  const ready = canEdit && data.accountConnected && validation.valid && mediaReady && timeValid && !busy;
  const remaining = aiRemaining ?? data.aiRemaining;
  const hoursLeft = data.windowExpiresAt
    ? (() => {
        const left = new Date(data.windowExpiresAt).getTime() - Date.now();
        return left > 0 ? Math.max(1, Math.ceil(left / 3600_000)) : null;
      })()
    : null;

  return (
    <PublisherLayout>
      <div className="w-full space-y-5" dir="rtl">
        <PublisherPageHeader
          icon={Share2}
          eyebrow="نشر اجتماعي"
          title="تغريدة للخبر على حساب سبق في X"
          description={
            <>
              {title}
              {data.article.publishedAt ? ` · نُشر ${formatDateTime(data.article.publishedAt)}` : ""}
            </>
          }
          actions={back}
        />

        {blocked[data.state] ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">{blocked[data.state]}</CardContent>
          </Card>
        ) : null}

        {live ? (
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-5">
              <div className="space-y-1">
                <Badge variant={live.status === "published" ? "default" : "secondary"}>
                  {STATUS_LABEL[live.status] ?? live.status}
                </Badge>
                <p className="text-sm">
                  {live.status === "published" && live.publishedAt
                    ? `نُشرت ${formatDateTime(live.publishedAt)}`
                    : live.scheduledAt
                      ? `تُنشر ${formatDateTime(live.scheduledAt)}`
                      : "لهذا الخبر تغريدة على حساب سبق."}
                </p>
              </div>
              {live.externalPostUrl ? (
                <a href={live.externalPostUrl} target="_blank" rel="noreferrer">
                  <Button variant="outline" className="gap-1.5">
                    <ExternalLink className="h-4 w-4" />
                    عرض على X
                  </Button>
                </a>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {canEdit ? (
          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <Card className="overflow-hidden border-border/60 shadow-sm">
              {pending || (data.post?.status === "canceled" && data.post.note && data.state === "open") || !data.accountConnected ? (
                <div className="space-y-2 border-b border-border/60 p-4 sm:px-5">
                  {pending ? (
                    <div className="rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-200">
                      {pending.status === "failed"
                        ? "تعذر نشر هذه التغريدة، وفريق سبق يتابعها. يمكنكم تعديلها أو سحبها."
                        : "التغريدة بانتظار موافقة فريق سبق. يمكنكم تعديلها أو سحبها قبل الموافقة."}
                    </div>
                  ) : null}
                  {data.post?.status === "canceled" && data.post.note && data.state === "open" ? (
                    <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                      <span className="font-semibold">ملاحظة سبق على التغريدة السابقة:</span> {data.post.note}
                    </div>
                  ) : null}
                  {!data.accountConnected ? (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                      حساب سبق في X غير مربوط حاليًا، فلا يمكن إرسال التغريدات. حاولوا لاحقًا.
                    </div>
                  ) : null}
                </div>
              ) : null}

              <Step
                n={1}
                title="نص التغريدة"
                aside={
                  <span
                    className={cn(
                      "text-xs tabular-nums text-muted-foreground",
                      validation.overStandard && "font-semibold text-amber-600",
                      !validation.valid && "font-semibold text-destructive",
                    )}
                    data-testid="text-social-counter"
                  >
                    {validation.weightedLength} / {X_MAX_WEIGHTED_LENGTH}
                  </span>
                }
              >
                <Segmented
                  value={textSource}
                  onChange={chooseText}
                  testId="button-text-source"
                  options={[
                    { value: "title", label: "عنوان الخبر" },
                    { value: "custom", label: "نص مخصص" },
                    { value: "ai", label: "اقترح نصًا", hint: `${remaining} متبقية اليوم` },
                  ]}
                />
                <Textarea
                  value={text}
                  readOnly={textSource === "title"}
                  onChange={(e) => (textSource === "ai" ? setAiText(e.target.value) : setCustomText(e.target.value))}
                  rows={4}
                  className={cn("rounded-xl text-[15px] leading-relaxed", textSource === "title" && "bg-muted/50 text-muted-foreground")}
                  placeholder={textSource === "ai" && suggest.isPending ? "يكتب سبق نصًا مقترحًا…" : undefined}
                  data-testid="input-social-text"
                />
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    {textSource === "title"
                      ? "يُنشر العنوان كما ظهر في سبق. اختاروا «نص مخصص» لتعديله."
                      : textSource === "custom"
                        ? "لا تضعوا الرابط داخل النص، يُضاف تلقائيًا."
                        : "نص مقترح من الخبر. عدّلوا عليه بحرية."}
                  </span>
                  {textSource === "ai" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 gap-1"
                      disabled={suggest.isPending || remaining <= 0}
                      onClick={() => suggest.mutate()}
                      data-testid="button-social-regenerate"
                    >
                      {suggest.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      اقترح من جديد
                    </Button>
                  ) : null}
                </div>
              </Step>

              <Step n={2} title="الصورة أو الفيديو" aside={<span className="text-xs text-muted-foreground">حتى 4 صور أو فيديو واحد</span>}>
                <ChoiceCards
                  value={media}
                  onChange={setMedia}
                  testId="button-media"
                  options={[
                    { value: "article", label: "صورة الخبر", hint: "كما نُشرت مع الخبر", disabled: !data.article.imageUrl },
                    { value: "images", label: "رفع صور", hint: "من 1 إلى 4" },
                    ...(data.videoSupported ? [{ value: "video" as const, label: "فيديو", hint: "ملف واحد" }] : []),
                    { value: "none", label: "بلا وسائط", hint: includeLink ? "بطاقة الرابط فقط" : "نص فقط" },
                  ]}
                />
                {media === "images" ? (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {images.map((url, i) => (
                      <div key={`${url}-${i}`} className="relative">
                        <img src={url} alt="" className="aspect-[16/10] w-full rounded-lg border object-cover" />
                        <button
                          type="button"
                          className="absolute left-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white"
                          onClick={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
                          title="إزالة"
                          data-testid={`button-remove-social-image-${i}`}
                        >
                          <XIcon className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    {images.length < MAX_IMAGES ? (
                      <button
                        type="button"
                        className="flex aspect-[16/10] flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-xs text-muted-foreground hover:bg-muted/50"
                        onClick={() => fileInput.current?.click()}
                        disabled={uploading}
                        data-testid="button-add-social-image"
                      >
                        {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
                        {uploading ? "يرفع…" : "إضافة صورة"}
                      </button>
                    ) : null}
                    <input
                      ref={fileInput}
                      type="file"
                      accept="image/*"
                      multiple
                      hidden
                      onChange={(e) => uploadImages(e.target.files)}
                    />
                  </div>
                ) : null}
                {media === "video" ? (
                  <div className="space-y-2">
                    {videoUrl ? (
                      <div className="flex items-center gap-2">
                        <video src={videoUrl} controls preload="metadata" className="max-h-48 rounded-lg border bg-black" />
                        <Button type="button" variant="ghost" size="sm" onClick={() => setVideoUrl(null)}>
                          إزالة
                        </Button>
                      </div>
                    ) : (
                      <ObjectUploader
                        maxNumberOfFiles={1}
                        maxFileSize={MAX_VIDEO_BYTES}
                        allowedFileTypes={[".mp4", ".mov", ".m4v"]}
                        onGetUploadParameters={async () => {
                          const res = await apiRequest<{ uploadURL: string }>(
                            "/api/publisher/portal/social/media/upload-url",
                            { method: "POST" },
                          );
                          return { method: "PUT" as const, url: res.uploadURL };
                        }}
                        onComplete={(result: any) => {
                          const uploaded: string | undefined = result.successful?.[0]?.uploadURL;
                          if (uploaded) setVideoUrl(uploaded.split("?")[0]);
                        }}
                        size="sm"
                      >
                        <Film className="ml-1 h-4 w-4" />
                        رفع فيديو
                      </ObjectUploader>
                    )}
                  </div>
                ) : null}
              </Step>

              <Step n={3} title="رابط الخبر">
                <Segmented
                  value={includeLink ? "on" : "off"}
                  onChange={(v) => setIncludeLink(v === "on")}
                  testId="button-link"
                  options={[
                    { value: "on", label: "مضمّن في التغريدة" },
                    { value: "off", label: "بدون رابط" },
                  ]}
                />
              </Step>

              <Step n={4} title={direct ? "متى تُنشر؟" : "متى تُنشر؟ (اقتراح)"}>
                <Segmented
                  value={when}
                  onChange={setWhen}
                  testId="button-when"
                  options={[
                    { value: "asap", label: direct ? "الآن" : "فور الموافقة" },
                    { value: "at", label: direct ? "في موعد محدد" : "في موعد أقترحه" },
                  ]}
                />
                {when === "at" ? (
                  <Input
                    type="datetime-local"
                    value={whenLocal}
                    min={toLocalInput(new Date(Date.now() + 5 * 60_000))}
                    onChange={(e) => setWhenLocal(e.target.value)}
                    className="w-fit rounded-xl"
                    data-testid="input-social-when"
                  />
                ) : null}
                {when === "at" && whenLocal && !timeValid ? (
                  <p className="text-xs text-destructive">اختاروا موعدًا بعد دقائق من الآن على الأقل.</p>
                ) : null}
                {!direct ? <p className="text-xs text-muted-foreground">الموعد اقتراح، وفريق سبق يثبّته عند الموافقة.</p> : null}
              </Step>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 bg-muted/40 px-4 py-3.5 sm:px-5">
                <span className="text-xs text-muted-foreground">التغريدة لا تُخصم من رصيد الباقة.</span>
                <div className="flex flex-wrap gap-2">
                  {pending ? (
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={withdraw.isPending}
                      onClick={() => withdraw.mutate(pending.id)}
                      data-testid="button-social-withdraw"
                    >
                      سحب الطلب
                    </Button>
                  ) : null}
                  {direct ? (
                    when === "at" ? (
                      <Button className="rounded-xl" disabled={!ready} onClick={() => save.mutate("schedule")} data-testid="button-social-schedule">
                        جدولة النشر
                      </Button>
                    ) : (
                      <Button className="rounded-xl" disabled={!ready} onClick={() => setConfirmPublish(true)} data-testid="button-social-publish">
                        انشر الآن
                      </Button>
                    )
                  ) : (
                    <Button className="gap-1.5 rounded-xl" disabled={!ready} onClick={() => save.mutate("submit")} data-testid="button-social-submit">
                      {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      {pending ? "حفظ التعديل" : "أرسل لفريق سبق"}
                    </Button>
                  )}
                </div>
              </div>
            </Card>

            <div className="space-y-3 lg:sticky lg:top-4">
              {data.windowExpiresAt ? (
                <div
                  className="flex items-center gap-2.5 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
                  data-testid="social-deadline"
                >
                  <Clock className="h-4 w-4 shrink-0" />
                  <span>
                    يمكن الطلب حتى <b className="tabular-nums">{formatDateTime(data.windowExpiresAt)}</b>
                    {hoursLeft !== null ? (
                      <>
                        {" "}
                        · باقي <b className="tabular-nums">{hoursLeft} ساعة</b>
                      </>
                    ) : null}
                  </span>
                </div>
              ) : null}
              <div className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
                <p className="border-b border-border/60 px-4 py-2.5 text-xs text-muted-foreground">هكذا تظهر على X (تقريبًا)</p>
                <div className="p-2">
                  <TweetPreview
                    text={text}
                    linkUrl={linkUrl}
                    images={previewImages}
                    videoUrl={media === "video" ? videoUrl : null}
                    linkCardImage={data.article.imageUrl}
                    handle={data.accountHandle}
                  />
                </div>
              </div>
              {validation.overStandard ? (
                <p className="text-xs text-muted-foreground">النص أطول من 280 حرفًا، فيُنشر منشورًا طويلًا يظهر مطويًا.</p>
              ) : null}
              {!direct ? (
                <div className="space-y-1.5 rounded-xl border border-border/60 bg-card px-4 py-3 text-xs text-muted-foreground shadow-sm">
                  <p className="text-sm font-semibold text-foreground">بعد الإرسال</p>
                  <ul className="list-disc space-y-1 ps-4">
                    <li>تصل إلى فريق سبق للموافقة، ويمكنكم تعديلها أو سحبها حتى ذلك الحين.</li>
                    <li>يصلكم إشعار عند نشرها أو رفضها، مع سبب الرفض إن وُجد.</li>
                  </ul>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <AlertDialog open={confirmPublish} onOpenChange={setConfirmPublish}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>نشر التغريدة الآن؟</AlertDialogTitle>
            <AlertDialogDescription>تُنشر فورًا على حساب صحيفة سبق في X ويراها المتابعون.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmPublish(false);
                save.mutate("publish_now");
              }}
            >
              انشر الآن
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PublisherLayout>
  );
}
