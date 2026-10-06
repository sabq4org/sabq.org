import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useLocation, useRoute } from "wouter";
import { ArrowRight, ExternalLink, Film, ImagePlus, Loader2, Sparkles, X as XIcon } from "lucide-react";
import { usePublisherAccess } from "@/hooks/usePublisherAccess";
import { PublisherLayout } from "@/components/publisher/PublisherLayout";
import { TweetPreview } from "@/components/publisher/TweetPreview";
import { ObjectUploader } from "@/components/ObjectUploader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  options: Array<{ value: T; label: string; disabled?: boolean }>;
  onChange: (v: T) => void;
  testId: string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group">
      {options.map((o) => (
        <Button
          key={o.value}
          type="button"
          size="sm"
          variant={value === o.value ? "default" : "outline"}
          aria-pressed={value === o.value}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          data-testid={`${testId}-${o.value}`}
        >
          {o.label}
        </Button>
      ))}
    </div>
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

  return (
    <PublisherLayout>
      <div className="w-full space-y-5" dir="rtl">
        {back}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">
              نشر اجتماعي للخبر
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {direct
                ? "تغريدة على حساب صحيفة سبق في X، تنشرها وكالتكم مباشرة أو تجدولها."
                : "تغريدة على حساب صحيفة سبق في X، تصل لفريق النشر في سبق للموافقة."}
            </p>
          </div>
          {data.windowExpiresAt && canEdit ? (
            <Badge variant="outline">المهلة حتى {formatDateTime(data.windowExpiresAt)}</Badge>
          ) : null}
        </div>

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
            <Card>
              <CardContent className="space-y-5 pt-5">
                <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-2.5">
                  {data.article.imageUrl ? (
                    <img src={data.article.imageUrl} alt="" className="h-12 w-[72px] shrink-0 rounded-md object-cover" />
                  ) : null}
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-sm font-semibold">{title}</p>
                    {data.article.publishedAt ? (
                      <p className="text-xs text-muted-foreground">نُشر {formatDateTime(data.article.publishedAt)}</p>
                    ) : null}
                  </div>
                </div>

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

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label>النص</Label>
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
                  </div>
                  <Segmented
                    value={textSource}
                    onChange={chooseText}
                    testId="button-text-source"
                    options={[
                      { value: "title", label: "عنوان الخبر" },
                      { value: "custom", label: "نص مخصص" },
                      { value: "ai", label: "توليد نص" },
                    ]}
                  />
                  <Textarea
                    value={text}
                    readOnly={textSource === "title"}
                    onChange={(e) => (textSource === "ai" ? setAiText(e.target.value) : setCustomText(e.target.value))}
                    rows={4}
                    className={cn("text-[15px] leading-relaxed", textSource === "title" && "bg-muted/50 text-muted-foreground")}
                    placeholder={textSource === "ai" && suggest.isPending ? "يكتب سبق نصًا مقترحًا…" : undefined}
                    data-testid="input-social-text"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>
                      {textSource === "title"
                        ? "النص هو عنوان الخبر كما نُشر."
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
                        توليد من جديد ({remaining} متبقية اليوم)
                      </Button>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label>الصور والفيديو</Label>
                    <span className="text-xs text-muted-foreground">حتى 4 صور أو فيديو واحد</span>
                  </div>
                  <Segmented
                    value={media}
                    onChange={setMedia}
                    testId="button-media"
                    options={[
                      { value: "article", label: "صورة الخبر", disabled: !data.article.imageUrl },
                      { value: "images", label: "رفع صور" },
                      ...(data.videoSupported ? [{ value: "video" as const, label: "فيديو" }] : []),
                      { value: "none", label: "بلا وسائط" },
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
                </div>

                <div className="space-y-2">
                  <Label>رابط الخبر</Label>
                  <Segmented
                    value={includeLink ? "on" : "off"}
                    onChange={(v) => setIncludeLink(v === "on")}
                    testId="button-link"
                    options={[
                      { value: "on", label: "مدمج في التغريدة" },
                      { value: "off", label: "بدون رابط" },
                    ]}
                  />
                </div>

                <div className="space-y-2">
                  <Label>{direct ? "موعد النشر" : "موعد النشر المقترح"}</Label>
                  <Segmented
                    value={when}
                    onChange={setWhen}
                    testId="button-when"
                    options={[
                      { value: "asap", label: direct ? "الآن" : "بعد الموافقة مباشرة" },
                      { value: "at", label: "في موعد محدد" },
                    ]}
                  />
                  {when === "at" ? (
                    <Input
                      type="datetime-local"
                      value={whenLocal}
                      min={toLocalInput(new Date(Date.now() + 5 * 60_000))}
                      onChange={(e) => setWhenLocal(e.target.value)}
                      className="w-fit"
                      data-testid="input-social-when"
                    />
                  ) : null}
                  {when === "at" && whenLocal && !timeValid ? (
                    <p className="text-xs text-destructive">اختاروا موعدًا بعد دقائق من الآن على الأقل.</p>
                  ) : null}
                </div>

                <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
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
                      <Button disabled={!ready} onClick={() => save.mutate("schedule")} data-testid="button-social-schedule">
                        جدولة النشر
                      </Button>
                    ) : (
                      <Button disabled={!ready} onClick={() => setConfirmPublish(true)} data-testid="button-social-publish">
                        انشر الآن
                      </Button>
                    )
                  ) : (
                    <Button disabled={!ready} onClick={() => save.mutate("submit")} data-testid="button-social-submit">
                      {save.isPending ? <Loader2 className="ml-1 h-4 w-4 animate-spin" /> : null}
                      {pending ? "حفظ التعديل" : "أرسل للموافقة"}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            <div className="space-y-2 lg:sticky lg:top-4">
              <p className="text-xs text-muted-foreground">هكذا تظهر على X (محاكاة تقريبية)</p>
              <TweetPreview
                text={text}
                linkUrl={linkUrl}
                images={previewImages}
                videoUrl={media === "video" ? videoUrl : null}
                linkCardImage={data.article.imageUrl}
                handle={data.accountHandle}
              />
              {validation.overStandard ? (
                <p className="text-xs text-muted-foreground">النص أطول من 280 حرفًا، فيُنشر منشورًا طويلًا يظهر مطويًا.</p>
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
