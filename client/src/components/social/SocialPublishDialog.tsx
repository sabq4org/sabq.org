// نافذة «النشر على X» — تُفتح من صف الخبر في إدارة المقالات.
// معاينة تقريبية، مصدر النص (عنوان/عنوان+رابط/مخصص/ذكاء)، عداد أحرف موزون،
// صورة (صورة الخبر / مكتبة الوسائط / رفع / بدون)، نشر فوري أو جدولة،
// وسجل منشورات الخبر مع إلغاء المجدول وإعادة محاولة الفاشل.
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarClock,
  ExternalLink,
  ImageOff,
  Loader2,
  RefreshCcw,
  Send,
  Sparkles,
  X as XIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth, hasPermission } from "@/hooks/useAuth";
import { validateXPostText, X_MAX_WEIGHTED_LENGTH } from "@shared/socialPostText";
import { MediaLibraryPicker } from "@/components/dashboard/MediaLibraryPicker";

interface SocialPublishDialogProps {
  articleId: string;
  articleTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ShareContext {
  articleId: string;
  title: string;
  url: string;
  imageUrl: string | null;
  excerpt: string | null;
}

interface SafeAccount {
  id: string;
  platform: string;
  handle: string | null;
  displayName: string | null;
  status: string;
}

interface SocialPostRow {
  id: string;
  status: string;
  text: string;
  scheduledAt: string | null;
  publishedAt: string | null;
  externalPostUrl: string | null;
  lastError: string | null;
  imageUrl: string | null;
}

type TextSource = "title" | "title_link" | "custom" | "ai";
type ImageChoice = "article" | "library" | "none";

const STATUS_BADGES: Record<string, { label: string; className: string }> = {
  draft: { label: "مسودة", className: "bg-muted text-muted-foreground" },
  scheduled: { label: "مجدول", className: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
  processing: { label: "جارٍ النشر", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
  published: { label: "منشور", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" },
  failed: { label: "فشل", className: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" },
  canceled: { label: "ملغي", className: "bg-muted text-muted-foreground" },
};

function toLocalDatetimeInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function SocialPublishDialog({
  articleId,
  articleTitle,
  open,
  onOpenChange,
}: SocialPublishDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();

  const canPublishNow = hasPermission(user, "social_publish.publish_now");
  const canSchedule = hasPermission(user, "social_publish.schedule");
  const canAiGenerate = hasPermission(user, "social_publish.ai_generate");
  const canManageScheduled = hasPermission(user, "social_publish.manage_scheduled");

  const [textSource, setTextSource] = useState<TextSource>("title_link");
  const [text, setText] = useState("");
  const [includeLink, setIncludeLink] = useState(true);
  const [imageChoice, setImageChoice] = useState<ImageChoice>("article");
  const [pickedImageUrl, setPickedImageUrl] = useState<string | null>(null);
  const [pickedFromUpload, setPickedFromUpload] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [scheduleMode, setScheduleMode] = useState(false);
  const [scheduledAtLocal, setScheduledAtLocal] = useState("");
  const [confirmPublishOpen, setConfirmPublishOpen] = useState(false);

  const timeZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Riyadh",
    [],
  );

  const { data: contextRaw, isLoading: contextLoading } = useQuery<ShareContext>({
    queryKey: [`/api/social-publishing/context/${articleId}`],
    enabled: open,
  });
  const context = contextRaw ?? null;

  const { data: accountsRaw } = useQuery<{ accounts: SafeAccount[]; oauthConfigured: boolean }>({
    queryKey: ["/api/social-publishing/accounts"],
    enabled: open,
  });
  const accounts = Array.isArray(accountsRaw?.accounts) ? accountsRaw!.accounts : [];
  const xAccount = accounts.find((a) => a.platform === "x" && a.status === "connected") ?? null;

  const postsQueryKey = [`/api/social-publishing/posts?articleId=${articleId}`];
  const { data: postsRaw } = useQuery<{ posts: SocialPostRow[] }>({
    queryKey: postsQueryKey,
    enabled: open,
  });
  const posts = Array.isArray(postsRaw?.posts) ? postsRaw!.posts : [];

  // تهيئة النص من العنوان عند فتح النافذة أو وصول السياق
  useEffect(() => {
    if (!open) return;
    if (context && (textSource === "title" || textSource === "title_link")) {
      setText(context.title);
      setIncludeLink(textSource === "title_link");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, context?.title, textSource]);

  useEffect(() => {
    if (!open) {
      setTextSource("title_link");
      setText("");
      setIncludeLink(true);
      setImageChoice("article");
      setPickedImageUrl(null);
      setPickedFromUpload(false);
      setScheduleMode(false);
      setScheduledAtLocal("");
    }
  }, [open]);

  const effectiveImage: { source: "article" | "upload" | "library" | "none"; url: string | null } =
    useMemo(() => {
      if (imageChoice === "none") return { source: "none", url: null };
      if (imageChoice === "article") {
        return context?.imageUrl
          ? { source: "article", url: context.imageUrl }
          : { source: "none", url: null };
      }
      return pickedImageUrl
        ? { source: pickedFromUpload ? "upload" : "library", url: pickedImageUrl }
        : { source: "none", url: null };
    }, [imageChoice, context?.imageUrl, pickedImageUrl, pickedFromUpload]);

  const linkForValidation = includeLink && context ? context.url : null;
  const validation = validateXPostText(text, linkForValidation);

  const suggestMutation = useMutation({
    mutationFn: async () =>
      apiRequest<{ post: string; hashtags: string[] }>(`/api/social-publishing/suggest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleId }),
      }),
    onSuccess: (data) => {
      const hashtags = Array.isArray(data.hashtags)
        ? data.hashtags.map((h) => `#${h.replace(/\s+/g, "_")}`).join(" ")
        : "";
      setText([data.post, hashtags].filter(Boolean).join("\n"));
      setTextSource("ai");
      toast({ title: "اقتراح جاهز", description: "راجع النص وعدّله قبل النشر" });
    },
    onError: (error: any) => {
      toast({
        title: "تعذر التوليد",
        description: error.message || "يمكنك كتابة النص يدوياً",
        variant: "destructive",
      });
    },
  });

  async function createDraft(): Promise<SocialPostRow> {
    return apiRequest<SocialPostRow>(`/api/social-publishing/posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        articleId,
        text,
        textSource,
        includeLink,
        imageSource: effectiveImage.source,
        imageUrl: effectiveImage.url,
      }),
    });
  }

  const publishNowMutation = useMutation({
    mutationFn: async () => {
      const draft = await createDraft();
      return apiRequest<{ post: SocialPostRow }>(
        `/api/social-publishing/posts/${draft.id}/publish`,
        { method: "POST" },
      );
    },
    onSuccess: (data) => {
      setConfirmPublishOpen(false);
      queryClient.invalidateQueries({ queryKey: postsQueryKey });
      toast({
        title: "نُشر على X",
        description: data.post.externalPostUrl || "تم النشر بنجاح",
      });
    },
    onError: (error: any) => {
      setConfirmPublishOpen(false);
      queryClient.invalidateQueries({ queryKey: postsQueryKey });
      toast({
        title: "فشل النشر",
        description: error.message || "راجع سجل المحاولات أدناه",
        variant: "destructive",
      });
    },
  });

  const scheduleMutation = useMutation({
    mutationFn: async () => {
      const when = new Date(scheduledAtLocal);
      const draft = await createDraft();
      return apiRequest<SocialPostRow>(`/api/social-publishing/posts/${draft.id}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledAt: when.toISOString() }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: postsQueryKey });
      setScheduleMode(false);
      toast({ title: "تمت الجدولة", description: "سيُنشر المنشور تلقائياً في الموعد" });
    },
    onError: (error: any) => {
      toast({ title: "تعذرت الجدولة", description: error.message || "حاول مجدداً", variant: "destructive" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (postId: string) =>
      apiRequest(`/api/social-publishing/posts/${postId}/cancel`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: postsQueryKey });
      toast({ title: "أُلغي المنشور المجدول" });
    },
    onError: (error: any) => {
      toast({ title: "تعذر الإلغاء", description: error.message, variant: "destructive" });
    },
  });

  const retryMutation = useMutation({
    mutationFn: async (postId: string) =>
      apiRequest<{ post: SocialPostRow }>(`/api/social-publishing/posts/${postId}/publish`, {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: postsQueryKey });
      toast({ title: "نُشر على X", description: "نجحت إعادة المحاولة" });
    },
    onError: (error: any) => {
      queryClient.invalidateQueries({ queryKey: postsQueryKey });
      toast({ title: "فشلت إعادة المحاولة", description: error.message, variant: "destructive" });
    },
  });

  const busy =
    publishNowMutation.isPending || scheduleMutation.isPending || suggestMutation.isPending;

  const scheduledDateValid = useMemo(() => {
    if (!scheduledAtLocal) return false;
    const when = new Date(scheduledAtLocal);
    return !Number.isNaN(when.getTime()) && when.getTime() > Date.now() + 60 * 1000;
  }, [scheduledAtLocal]);

  const composerDisabled = !xAccount || busy;

  const sourceButtons: Array<{ key: TextSource; label: string }> = [
    { key: "title", label: "عنوان الخبر" },
    { key: "title_link", label: "العنوان + الرابط" },
    { key: "custom", label: "نص مخصص" },
  ];

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
        {/* dvh لا vh — شريط أدوات سفاري الجوال يقتطع من vh؛ وعرض داخل الحواف مع حشوة أصغر للشاشات الصغيرة */}
        <DialogContent
          className="w-[calc(100vw-1.25rem)] max-w-2xl max-h-[86dvh] overflow-y-auto overflow-x-hidden scrollbar-hide rounded-lg p-4 sm:p-6"
          dir="rtl"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XIcon className="w-5 h-5" />
              النشر على X
            </DialogTitle>
            <DialogDescription className="text-right">
              {xAccount
                ? `سيُنشر عبر حساب @${xAccount.handle || "sabqorg"} — ${xAccount.displayName || ""}`
                : "لا يوجد حساب X مرتبط"}
            </DialogDescription>
          </DialogHeader>

          {!xAccount && (
            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm">
              <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-600 shrink-0" />
              <div>
                لا يوجد حساب X مرتبط أو أن ربطه انتهى. يلزم ربط الحساب من صفحة
                «النشر الاجتماعي» في لوحة التحكم قبل النشر.
              </div>
            </div>
          )}

          {contextLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* مصدر النص */}
              <div className="space-y-2">
                <Label>مصدر النص</Label>
                <div className="flex flex-wrap gap-2">
                  {sourceButtons.map((s) => (
                    <Button
                      key={s.key}
                      type="button"
                      size="sm"
                      variant={textSource === s.key ? "default" : "outline"}
                      disabled={composerDisabled}
                      onClick={() => {
                        setTextSource(s.key);
                        if (s.key === "title" || s.key === "title_link") {
                          setText(context?.title ?? articleTitle);
                          setIncludeLink(s.key === "title_link");
                        }
                      }}
                      data-testid={`button-text-source-${s.key}`}
                    >
                      {s.label}
                    </Button>
                  ))}
                  {canAiGenerate && (
                    <Button
                      type="button"
                      size="sm"
                      variant={textSource === "ai" ? "default" : "outline"}
                      disabled={composerDisabled}
                      onClick={() => suggestMutation.mutate()}
                      data-testid="button-text-source-ai"
                    >
                      {suggestMutation.isPending ? (
                        <Loader2 className="w-4 h-4 ml-1 animate-spin" />
                      ) : (
                        <Sparkles className="w-4 h-4 ml-1" />
                      )}
                      توليد اقتراح
                    </Button>
                  )}
                </div>
              </div>

              {/* النص */}
              <div className="space-y-1">
                <Textarea
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    if (textSource !== "ai") setTextSource("custom");
                  }}
                  rows={4}
                  disabled={composerDisabled}
                  placeholder="نص المنشور…"
                  data-testid="input-social-post-text"
                />
                <div className="flex items-center justify-between text-xs">
                  <span
                    className={
                      validation.remaining < 0
                        ? "text-destructive font-bold"
                        : validation.remaining < 20
                          ? "text-amber-600"
                          : "text-muted-foreground"
                    }
                    data-testid="text-char-counter"
                  >
                    {validation.weightedLength} / {X_MAX_WEIGHTED_LENGTH}
                    {validation.remaining < 0 && " — تجاوزت الحد"}
                  </span>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Switch
                      checked={includeLink}
                      disabled={composerDisabled}
                      onCheckedChange={(v) => setIncludeLink(v)}
                      data-testid="switch-include-link"
                    />
                    <span className="text-muted-foreground">إرفاق رابط الخبر (يُحسب 23 حرفاً)</span>
                  </label>
                </div>
                {includeLink && context && (
                  <div className="text-xs text-muted-foreground truncate" dir="ltr">
                    {context.url}
                  </div>
                )}
              </div>

              {/* الصورة */}
              <div className="space-y-2">
                <Label>الصورة</Label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={imageChoice === "article" ? "default" : "outline"}
                    disabled={composerDisabled || !context?.imageUrl}
                    onClick={() => setImageChoice("article")}
                    data-testid="button-image-article"
                  >
                    صورة الخبر
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={imageChoice === "library" ? "default" : "outline"}
                    disabled={composerDisabled}
                    onClick={() => setLibraryOpen(true)}
                    data-testid="button-image-library"
                  >
                    من المكتبة / رفع
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={imageChoice === "none" ? "default" : "outline"}
                    disabled={composerDisabled}
                    onClick={() => setImageChoice("none")}
                    data-testid="button-image-none"
                  >
                    <ImageOff className="w-4 h-4 ml-1" />
                    بلا صورة
                  </Button>
                </div>
                {imageChoice === "article" && !context?.imageUrl && (
                  <p className="text-xs text-muted-foreground">هذا الخبر بلا صورة رئيسية — سيُنشر بلا صورة.</p>
                )}
              </div>

              {/* معاينة تقريبية */}
              <div className="rounded-xl border p-3 space-y-2 bg-background">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center font-bold">
                    س
                  </div>
                  <div className="text-sm">
                    <div className="font-bold">{xAccount?.displayName || "صحيفة سبق"}</div>
                    <div className="text-muted-foreground" dir="ltr">
                      @{xAccount?.handle || "sabqorg"}
                    </div>
                  </div>
                  <Badge variant="outline" className="mr-auto text-[10px]">
                    معاينة تقريبية
                  </Badge>
                </div>
                <div className="whitespace-pre-wrap text-sm" dir="auto">
                  {text || "…"}
                </div>
                {includeLink && context && (
                  <div className="text-xs text-sky-600 truncate" dir="ltr">
                    {context.url}
                  </div>
                )}
                {effectiveImage.url && (
                  <img
                    src={effectiveImage.url}
                    alt="صورة المنشور"
                    className="rounded-lg max-h-56 w-full object-cover border"
                    loading="lazy"
                  />
                )}
              </div>

              {/* الجدولة */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Switch
                    checked={scheduleMode}
                    disabled={composerDisabled || !canSchedule}
                    onCheckedChange={setScheduleMode}
                    data-testid="switch-schedule-mode"
                  />
                  <span className="text-sm font-medium flex items-center gap-1">
                    <CalendarClock className="w-4 h-4" />
                    جدولة النشر
                  </span>
                </label>
                {scheduleMode && (
                  <div className="space-y-1">
                    <Input
                      type="datetime-local"
                      value={scheduledAtLocal}
                      min={toLocalDatetimeInputValue(new Date(Date.now() + 5 * 60 * 1000))}
                      onChange={(e) => setScheduledAtLocal(e.target.value)}
                      disabled={composerDisabled}
                      data-testid="input-scheduled-at"
                    />
                    <p className="text-xs text-muted-foreground">
                      المنطقة الزمنية: {timeZone} — يُحفظ الوقت بصيغة UTC ويُنفذ في موعده.
                    </p>
                    {scheduledAtLocal && !scheduledDateValid && (
                      <p className="text-xs text-destructive">اختر وقتاً مستقبلياً (بعد 5 دقائق على الأقل).</p>
                    )}
                  </div>
                )}
              </div>

              {/* الأزرار */}
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
                  إغلاق
                </Button>
                {scheduleMode ? (
                  <Button
                    onClick={() => scheduleMutation.mutate()}
                    disabled={
                      composerDisabled || !canSchedule || !validation.valid || !scheduledDateValid
                    }
                    data-testid="button-schedule-post"
                  >
                    {scheduleMutation.isPending ? (
                      <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                    ) : (
                      <CalendarClock className="w-4 h-4 ml-2" />
                    )}
                    جدولة المنشور
                  </Button>
                ) : (
                  <Button
                    onClick={() => setConfirmPublishOpen(true)}
                    disabled={composerDisabled || !canPublishNow || !validation.valid}
                    data-testid="button-publish-now"
                  >
                    {publishNowMutation.isPending ? (
                      <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4 ml-2" />
                    )}
                    نشر الآن
                  </Button>
                )}
              </div>

              {/* سجل منشورات الخبر */}
              {posts.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <Label>سجل النشر لهذا الخبر</Label>
                    {posts.map((p) => {
                      const badge = STATUS_BADGES[p.status] ?? STATUS_BADGES.draft;
                      return (
                        <div
                          key={p.id}
                          className="flex items-start gap-2 rounded-md border p-2 text-sm"
                          data-testid={`social-post-row-${p.id}`}
                        >
                          <Badge className={badge.className}>{badge.label}</Badge>
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="line-clamp-2 break-words">{p.text}</div>
                            {p.status === "scheduled" && p.scheduledAt && (
                              <div className="text-xs text-muted-foreground">
                                موعد النشر: {new Date(p.scheduledAt).toLocaleString("ar-SA")}
                              </div>
                            )}
                            {p.status === "failed" && p.lastError && (
                              <div className="text-xs text-destructive line-clamp-2 break-words">{p.lastError}</div>
                            )}
                            {p.externalPostUrl && (
                              <a
                                href={p.externalPostUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-sky-600 inline-flex items-center gap-1 max-w-full"
                                dir="ltr"
                              >
                                <ExternalLink className="w-3 h-3 shrink-0" />
                                <span className="truncate">{p.externalPostUrl}</span>
                              </a>
                            )}
                          </div>
                          {p.status === "scheduled" && canManageScheduled && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={cancelMutation.isPending}
                              onClick={() => cancelMutation.mutate(p.id)}
                              data-testid={`button-cancel-${p.id}`}
                            >
                              إلغاء
                            </Button>
                          )}
                          {p.status === "failed" && canPublishNow && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={retryMutation.isPending}
                              onClick={() => retryMutation.mutate(p.id)}
                              data-testid={`button-retry-${p.id}`}
                            >
                              <RefreshCcw className="w-3 h-3 ml-1" />
                              إعادة
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* اختيار صورة من المكتبة (يشمل تبويب الرفع من الجهاز) */}
      <MediaLibraryPicker
        isOpen={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        articleTitle={articleTitle}
        onSelect={(media: any) => {
          const url = media?.url;
          const isImage =
            (media?.mimeType || "").startsWith("image/") || media?.type === "image";
          if (!url || !isImage) {
            toast({ title: "اختر صورة", description: "الملف المختار ليس صورة", variant: "destructive" });
            return;
          }
          setPickedImageUrl(url);
          setPickedFromUpload(false);
          setImageChoice("library");
          setLibraryOpen(false);
        }}
      />

      {/* تأكيد النشر الفوري */}
      <AlertDialog open={confirmPublishOpen} onOpenChange={setConfirmPublishOpen}>
        <AlertDialogContent className="w-[calc(100vw-1.25rem)] max-w-md rounded-lg" dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد النشر على X</AlertDialogTitle>
            <AlertDialogDescription className="text-right">
              سيُنشر هذا المحتوى فوراً على حساب
              {" "}@{xAccount?.handle || "sabqorg"} العام. لا يمكن التراجع بعد النشر.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel disabled={publishNowMutation.isPending}>تراجع</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                publishNowMutation.mutate();
              }}
              disabled={publishNowMutation.isPending}
            >
              {publishNowMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                  جارٍ النشر…
                </>
              ) : (
                "نشر الآن"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
