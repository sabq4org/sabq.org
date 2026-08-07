// نافذة «تغريدة جديدة» — تأليف مستقل من صفحة النشر الاجتماعي بلا خبر:
// نص بعداد موزون، وسائط (حتى 4 صور من المكتبة/الرفع، أو فيديو واحد
// يُرفع مباشرة للتخزين ويمر عبر Publer)، ونشر فوري أو مجدول.
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarClock,
  Film,
  ImagePlus,
  Loader2,
  Send,
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
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient, getCsrfToken } from "@/lib/queryClient";
import { useAuth, hasPermission } from "@/hooks/useAuth";
import { validateXPostText, X_MAX_WEIGHTED_LENGTH } from "@shared/socialPostText";
import { MediaLibraryPicker } from "@/components/dashboard/MediaLibraryPicker";
import { ObjectUploader } from "@/components/ObjectUploader";

interface ComposeTweetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
  externalPostUrl: string | null;
}

const MAX_IMAGES = 4;
const MAX_VIDEO_BYTES = 512 * 1024 * 1024;

type MediaMode = "none" | "image" | "video";

function toLocalDatetimeInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function ComposeTweetDialog({ open, onOpenChange }: ComposeTweetDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const canPublishNow = hasPermission(user, "social_publish.publish_now");
  const canSchedule = hasPermission(user, "social_publish.schedule");

  const [text, setText] = useState("");
  const [mediaMode, setMediaMode] = useState<MediaMode>("none");
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [scheduleMode, setScheduleMode] = useState(false);
  const [scheduledAtLocal, setScheduledAtLocal] = useState("");
  const [confirmPublishOpen, setConfirmPublishOpen] = useState(false);

  const timeZone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Riyadh",
    [],
  );

  const { data: accountsRaw } = useQuery<{ accounts: SafeAccount[]; transport?: string }>({
    queryKey: ["/api/social-publishing/accounts"],
    enabled: open,
  });
  const accounts = Array.isArray(accountsRaw?.accounts) ? accountsRaw!.accounts : [];
  const xAccount = accounts.find((a) => a.platform === "x" && a.status === "connected") ?? null;
  const isPubler = accountsRaw?.transport === "publer";

  useEffect(() => {
    if (!open) {
      setText("");
      setMediaMode("none");
      setImageUrls([]);
      setVideoUrl(null);
      setScheduleMode(false);
      setScheduledAtLocal("");
    }
  }, [open]);

  const validation = validateXPostText(text, null);

  const effectiveMedia: { kind: MediaMode; urls: string[] } = useMemo(() => {
    if (mediaMode === "image" && imageUrls.length > 0) return { kind: "image", urls: imageUrls };
    if (mediaMode === "video" && videoUrl) return { kind: "video", urls: [videoUrl] };
    return { kind: "none", urls: [] };
  }, [mediaMode, imageUrls, videoUrl]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/social-publishing/posts"] });
    queryClient.invalidateQueries({ queryKey: ["/api/social-publishing/stats"] });
  };

  async function createDraft(): Promise<SocialPostRow> {
    return apiRequest<SocialPostRow>(`/api/social-publishing/posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        textSource: "custom",
        includeLink: false,
        imageSource: "none",
        imageUrl: null,
        mediaKind: effectiveMedia.kind,
        mediaUrls: effectiveMedia.urls,
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
      invalidate();
      toast({ title: "نُشر على X", description: data.post.externalPostUrl || "تم النشر بنجاح" });
      onOpenChange(false);
    },
    onError: (error: any) => {
      setConfirmPublishOpen(false);
      invalidate();
      toast({
        title: "فشل النشر",
        description: error.message || "راجع سجل المنشورات",
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
      invalidate();
      toast({ title: "تمت الجدولة", description: "ستُنشر التغريدة تلقائياً في الموعد" });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({ title: "تعذرت الجدولة", description: error.message || "حاول مجدداً", variant: "destructive" });
    },
  });

  const busy = publishNowMutation.isPending || scheduleMutation.isPending;
  const composerDisabled = !xAccount || busy;

  const scheduledDateValid = useMemo(() => {
    if (!scheduledAtLocal) return false;
    const when = new Date(scheduledAtLocal);
    return !Number.isNaN(when.getTime()) && when.getTime() > Date.now() + 60 * 1000;
  }, [scheduledAtLocal]);

  const mediaValid =
    effectiveMedia.kind === "none" ||
    (effectiveMedia.kind === "image" && effectiveMedia.urls.length >= 1) ||
    (effectiveMedia.kind === "video" && effectiveMedia.urls.length === 1);

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
        <DialogContent
          className="w-[calc(100vw-1.25rem)] max-w-xl max-h-[86dvh] overflow-y-auto overflow-x-hidden scrollbar-hide rounded-lg p-4 sm:p-6"
          dir="rtl"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XIcon className="w-5 h-5" />
              تغريدة جديدة
            </DialogTitle>
            <DialogDescription className="text-right">
              {xAccount
                ? `ستُنشر عبر حساب @${xAccount.handle || "sabqorg"} — بلا ارتباط بخبر`
                : "لا يوجد حساب X مرتبط"}
            </DialogDescription>
          </DialogHeader>

          {!xAccount && (
            <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm">
              <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-600 shrink-0" />
              <div>يلزم ربط حساب X من هذه الصفحة قبل النشر.</div>
            </div>
          )}

          <div className="space-y-4">
            {/* النص */}
            <div className="space-y-1">
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={5}
                disabled={composerDisabled}
                placeholder="ماذا يحدث؟"
                className="text-[15px] leading-relaxed"
                data-testid="input-compose-text"
              />
              <div
                className={`text-xs ${
                  validation.remaining < 0
                    ? "text-destructive font-bold"
                    : validation.remaining < 20
                      ? "text-amber-600"
                      : "text-muted-foreground"
                }`}
                data-testid="text-compose-counter"
              >
                {validation.weightedLength} / {X_MAX_WEIGHTED_LENGTH}
                {validation.remaining < 0 && " — تجاوزت الحد"}
              </div>
            </div>

            {/* الوسائط */}
            <div className="space-y-2">
              <Label>الوسائط</Label>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={mediaMode === "image" ? "default" : "outline"}
                  disabled={composerDisabled || imageUrls.length >= MAX_IMAGES}
                  onClick={() => {
                    setMediaMode("image");
                    setVideoUrl(null);
                    setLibraryOpen(true);
                  }}
                  data-testid="button-compose-add-image"
                >
                  <ImagePlus className="w-4 h-4 ml-1" />
                  {imageUrls.length > 0
                    ? `إضافة صورة (${imageUrls.length}/${MAX_IMAGES})`
                    : "صور (حتى 4)"}
                </Button>
                <ObjectUploader
                  maxNumberOfFiles={1}
                  maxFileSize={MAX_VIDEO_BYTES}
                  allowedFileTypes={[".mp4", ".mov", ".m4v"]}
                  onGetUploadParameters={async () => {
                    const csrfToken = getCsrfToken();
                    const response = await fetch("/api/social-publishing/media/upload-url", {
                      method: "POST",
                      credentials: "include",
                      headers: csrfToken ? { "X-CSRF-Token": csrfToken } : {},
                    });
                    if (!response.ok) throw new Error("تعذر إنشاء رابط الرفع");
                    const data = await response.json();
                    return { method: "PUT" as const, url: data.uploadURL };
                  }}
                  onComplete={(result: any) => {
                    const uploadedUrl: string | undefined = result.successful?.[0]?.uploadURL;
                    if (uploadedUrl) {
                      setVideoUrl(uploadedUrl.split("?")[0]);
                      setImageUrls([]);
                      setMediaMode("video");
                      toast({ title: "رُفع الفيديو", description: "سيُرفق مع التغريدة عند النشر" });
                    }
                  }}
                  size="sm"
                  variant={mediaMode === "video" ? "default" : "outline"}
                >
                  <Film className="w-4 h-4 ml-1" />
                  فيديو
                </ObjectUploader>
                {(imageUrls.length > 0 || videoUrl) && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground"
                    disabled={composerDisabled}
                    onClick={() => {
                      setMediaMode("none");
                      setImageUrls([]);
                      setVideoUrl(null);
                    }}
                    data-testid="button-compose-clear-media"
                  >
                    إزالة الوسائط
                  </Button>
                )}
              </div>
              {mediaMode === "video" && !isPubler && (
                <p className="text-xs text-amber-600">
                  نشر الفيديو متاح عبر وسيلة Publer فقط حالياً.
                </p>
              )}

              {/* معاينة الصور */}
              {imageUrls.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  {imageUrls.map((url, i) => (
                    <div key={`${url}-${i}`} className="relative group">
                      <img
                        src={url}
                        alt=""
                        className="rounded-lg h-28 w-full object-cover border"
                        loading="lazy"
                      />
                      <button
                        type="button"
                        onClick={() => setImageUrls((prev) => prev.filter((_, idx) => idx !== i))}
                        className="absolute top-1 left-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center"
                        title="إزالة"
                        data-testid={`button-remove-image-${i}`}
                      >
                        <XIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* معاينة الفيديو */}
              {videoUrl && (
                <video
                  src={videoUrl}
                  controls
                  preload="metadata"
                  className="rounded-lg max-h-56 w-full border bg-black"
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
                  data-testid="switch-compose-schedule"
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
                    data-testid="input-compose-scheduled-at"
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
                    composerDisabled || !canSchedule || !validation.valid || !mediaValid || !scheduledDateValid
                  }
                  data-testid="button-compose-schedule"
                >
                  {scheduleMutation.isPending ? (
                    <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                  ) : (
                    <CalendarClock className="w-4 h-4 ml-2" />
                  )}
                  جدولة التغريدة
                </Button>
              ) : (
                <Button
                  onClick={() => setConfirmPublishOpen(true)}
                  disabled={composerDisabled || !canPublishNow || !validation.valid || !mediaValid}
                  data-testid="button-compose-publish"
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
          </div>
        </DialogContent>
      </Dialog>

      {/* اختيار صورة من المكتبة (يشمل تبويب الرفع من الجهاز) */}
      <MediaLibraryPicker
        isOpen={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        onSelect={(media: any) => {
          const url = media?.url;
          const isImage =
            (media?.mimeType || "").startsWith("image/") || media?.type === "image";
          if (!url || !isImage) {
            toast({ title: "اختر صورة", description: "الملف المختار ليس صورة", variant: "destructive" });
            return;
          }
          setImageUrls((prev) =>
            prev.length >= MAX_IMAGES || prev.includes(url) ? prev : [...prev, url],
          );
          setVideoUrl(null);
          setMediaMode("image");
          setLibraryOpen(false);
        }}
      />

      {/* تأكيد النشر الفوري */}
      <AlertDialog open={confirmPublishOpen} onOpenChange={setConfirmPublishOpen}>
        <AlertDialogContent className="w-[calc(100vw-1.25rem)] max-w-md rounded-lg" dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد النشر على X</AlertDialogTitle>
            <AlertDialogDescription className="text-right">
              ستُنشر هذه التغريدة فوراً على حساب
              {" "}@{xAccount?.handle || "sabqorg"} العام
              {effectiveMedia.kind === "image" && ` مع ${effectiveMedia.urls.length} صورة`}
              {effectiveMedia.kind === "video" && " مع فيديو"}
              . لا يمكن التراجع بعد النشر.
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
