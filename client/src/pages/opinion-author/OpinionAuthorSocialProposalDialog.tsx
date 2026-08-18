// نافذة إعداد مقترح منشور لمنصة X لكاتب الرأي.
// تتيح للكاتب إعداد مقترح لنص المنشور (من العنوان أو مخصص) لمقاله المنشور
// خلال نافذة الـ24 ساعة، مع تثبيت الرابط وصورة المقال، وإرسال المقترح لمراجعة فريق سبق.
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Image as ImageIcon,
  ImageOff,
  Info,
  Link2,
  Loader2,
  Lock,
  Send,
  Sparkles,
  X as XIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { validateXPostText, X_MAX_WEIGHTED_LENGTH } from "@shared/socialPostText";

interface OpinionAuthorSocialProposalDialogProps {
  articleId: string | null;
  articleTitle?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ProposalStatusResponse {
  eligible: boolean;
  reason?: "NOT_PUBLISHED" | "FUTURE_PUBLISHED" | "EXPIRED_24H" | "INVALID_DATE" | string;
  publishedAt: string | null;
  windowExpiresAt: string | null;
  remainingMs: number;
  article: {
    id: string;
    title: string;
    url: string;
    imageUrl: string | null;
  };
  existingProposal: {
    id: string;
    text: string;
    textSource: string;
    status: string;
    linkUrl: string | null;
    imageUrl: string | null;
    externalPostUrl?: string | null;
    lastError?: string | null;
    createdAt: string;
    publishedAt: string | null;
    scheduledAt: string | null;
  } | null;
}

type TextChoice = "title" | "custom";

export function OpinionAuthorSocialProposalDialog({
  articleId,
  articleTitle,
  open,
  onOpenChange,
}: OpinionAuthorSocialProposalDialogProps) {
  const { toast } = useToast();

  const [textChoice, setTextChoice] = useState<TextChoice>("title");
  const [customText, setCustomText] = useState("");

  const proposalQueryKey = [`/api/opinion-author/articles/${articleId}/social-proposal`];

  const { data: statusData, isLoading, error } = useQuery<ProposalStatusResponse>({
    queryKey: proposalQueryKey,
    enabled: Boolean(open && articleId),
    staleTime: 10 * 1000,
  });

  const article = statusData?.article;
  const existing = statusData?.existingProposal;
  const isEligible = statusData?.eligible ?? false;
  const isExpired = statusData?.reason === "EXPIRED_24H";

  // تهيئة النص عند فتح النافذة أو وصول البيانات
  useEffect(() => {
    if (!open) return;
    if (existing) {
      if (existing.textSource === "title") {
        setTextChoice("title");
        setCustomText(article?.title || articleTitle || "");
      } else {
        setTextChoice("custom");
        setCustomText(existing.text);
      }
    } else if (article?.title || articleTitle) {
      setTextChoice("title");
      setCustomText(article?.title || articleTitle || "");
    }
  }, [open, existing, article?.title, articleTitle]);

  const effectiveText = useMemo(() => {
    if (textChoice === "title") {
      return article?.title || articleTitle || "";
    }
    return customText;
  }, [textChoice, article?.title, articleTitle, customText]);

  const articleUrl = article?.url || "";
  const validation = useMemo(() => {
    return validateXPostText(effectiveText, articleUrl || null);
  }, [effectiveText, articleUrl]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!articleId) return;
      return apiRequest<{ success: boolean; post: unknown }>(
        `/api/opinion-author/articles/${articleId}/social-proposal`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: effectiveText.trim(),
            textSource: textChoice,
          }),
        },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: proposalQueryKey });
      queryClient.invalidateQueries({ queryKey: ["/api/opinion-author/workspace"] });
      queryClient.invalidateQueries({ queryKey: ["/api/opinion-author/analytics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/social-publishing/posts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/social-publishing/stats"] });
      toast({
        title: "تم إرسال المقترح بنجاح",
        description: "وصل مقترحك إلى فريق النشر الاجتماعي في سبق للمراجعة والاعتماد.",
      });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({
        title: "تعذر إرسال المقترح",
        description: err?.message || "حدث خطأ أثناء إرسال المقترح، يرجى المحاولة لاحقاً.",
        variant: "destructive",
      });
    },
  });

  const remainingHours = useMemo(() => {
    if (!statusData?.remainingMs || statusData.remainingMs <= 0) return 0;
    return Math.ceil(statusData.remainingMs / (1000 * 60 * 60));
  }, [statusData?.remainingMs]);

  const isBusy = isLoading || submitMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => !isBusy && onOpenChange(o)}>
      <DialogContent
        className="w-[calc(100vw-1.25rem)] max-w-xl max-h-[88dvh] overflow-y-auto overflow-x-hidden rounded-xl p-4 sm:p-6"
        dir="rtl"
      >
        <DialogHeader className="text-right">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <XIcon className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold sm:text-lg">
                اقتراح منشور لمنصة X
              </DialogTitle>
              <DialogDescription className="mt-1 text-xs sm:text-sm">
                أعد مقترح المنشور لمقالك ليراجعه ويعتمده فريق النشر في سبق.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex items-start gap-2.5 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <p className="leading-relaxed">
              {error instanceof Error ? error.message : "تعذر التحقق من حالة المقال."}
            </p>
          </div>
        ) : (
          <div className="space-y-4 py-1">
            {/* تنبيه نافذة الـ24 ساعة أو انتهاء المهلة */}
            {isEligible ? (
              <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-foreground sm:text-sm">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-primary shrink-0" />
                  <span>
                    متاح لتقديم المقترح خلال أول 24 ساعة من النشر.
                  </span>
                </div>
                {remainingHours > 0 && (
                  <Badge variant="outline" className="border-primary/30 bg-background font-semibold text-primary">
                    متبقٍ {remainingHours} {remainingHours === 1 ? "ساعة" : "ساعات"}
                  </Badge>
                )}
              </div>
            ) : isExpired ? (
              <div className="flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                <AlertCircle className="h-5 w-5 shrink-0 text-amber-600" />
                <div className="space-y-1">
                  <p className="font-semibold">انتهت مهلة الـ24 ساعة</p>
                  <p className="text-xs leading-relaxed opacity-90">
                    ميزة اقتراح المنشور متاحة خلال أول 24 ساعة فقط من وقت النشر الفعلي للمقال.
                  </p>
                  {existing && (
                    <p className="mt-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                      ✓ المقترح الذي أرسلته سابقاً محفوظ لدى فريق سبق.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                <Info className="h-5 w-5 shrink-0 text-amber-600" />
                <p className="leading-relaxed">
                  هذا المقال لم يُنشر فعلياً بعد، ولا تبدأ مهلة الـ24 ساعة إلا بعد النشر.
                </p>
              </div>
            )}

            {/* حالة المقترح السابق إن وُجد */}
            {existing && (
              <div className="rounded-xl border border-border bg-muted/40 p-3 text-xs sm:text-sm">
                {existing.status === "published" ? (
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      <span>تم نشر المقترح على منصة X بنجاح</span>
                    </div>
                    {existing.externalPostUrl && (
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1 border-emerald-500/30 text-xs text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300"
                      >
                        <a href={existing.externalPostUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-3 w-3" />
                          فتح التغريدة
                        </a>
                      </Button>
                    )}
                  </div>
                ) : existing.status === "scheduled" ? (
                  <div className="flex items-center gap-2 font-semibold text-amber-800 dark:text-amber-300">
                    <Clock className="h-4 w-4 text-amber-600" />
                    <span>
                      اعتمد فريق سبق المقترح وجُدول للنشر
                    </span>
                  </div>
                ) : existing.status === "canceled" ? (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 font-semibold text-foreground">
                      <AlertCircle className="h-4 w-4 text-destructive" />
                      <span>اعتذر فريق النشر عن تغريدة هذا المقترح</span>
                    </div>
                    {existing.lastError && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        ملاحظة المحرر: {existing.lastError}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 font-semibold text-foreground">
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                      <span>تم إرسال المقترح وهو قيد مراجعة فريق سبق</span>
                    </div>
                    {isEligible && (
                      <p className="text-xs text-muted-foreground">
                        يمكنك تعديل النص وإعادة الإرسال طالما المقال ضمن نافذة الـ24 ساعة.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* اختيار مصدر النص */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-foreground sm:text-sm">
                نص المنشور
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={textChoice === "title" ? "default" : "outline"}
                  size="sm"
                  className="h-9 justify-center text-xs font-medium"
                  disabled={!isEligible || isBusy}
                  onClick={() => {
                    setTextChoice("title");
                    setCustomText(article?.title || articleTitle || "");
                  }}
                  data-testid="button-text-choice-title"
                >
                  عنوان المقال
                </Button>
                <Button
                  type="button"
                  variant={textChoice === "custom" ? "default" : "outline"}
                  size="sm"
                  className="h-9 justify-center text-xs font-medium"
                  disabled={!isEligible || isBusy}
                  onClick={() => setTextChoice("custom")}
                  data-testid="button-text-choice-custom"
                >
                  نص مخصص
                </Button>
              </div>

              <div className="relative mt-2">
                <Textarea
                  value={textChoice === "title" ? (article?.title || articleTitle || "") : customText}
                  onChange={(e) => {
                    if (textChoice === "custom") {
                      setCustomText(e.target.value);
                    }
                  }}
                  readOnly={textChoice === "title" || !isEligible || isBusy}
                  rows={4}
                  placeholder="اكتب نص المنشور المقترح هنا..."
                  className={`min-h-24 resize-none text-sm leading-relaxed ${
                    textChoice === "title" ? "bg-muted/40 cursor-default" : ""
                  }`}
                  data-testid="textarea-proposal-text"
                />
              </div>

              {/* عداد الأحرف الموزون */}
              <div className="flex items-center justify-between text-xs">
                <span
                  className={
                    validation.valid
                      ? "text-muted-foreground"
                      : "font-semibold text-destructive"
                  }
                  dir="ltr"
                >
                  {validation.weightedLength} / {X_MAX_WEIGHTED_LENGTH}
                </span>
                {!validation.valid && (
                  <span className="text-destructive font-medium">
                    {validation.empty
                      ? "النص مطلوب"
                      : "النص يتجاوز الحد الأقصى المسموح لمنصة X"}
                  </span>
                )}
              </div>
            </div>

            {/* رابط المقال الثابت */}
            <div className="space-y-1.5 rounded-xl border border-border bg-muted/20 p-3">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Link2 className="h-3.5 w-3.5" />
                  رابط المقال المعتمد
                </Label>
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Lock className="h-3 w-3" /> ثابت غير قابل للتعديل
                </span>
              </div>
              <p
                className="font-mono text-xs text-foreground/80 break-all select-all"
                dir="ltr"
              >
                {articleUrl || "جاري توليد الرابط..."}
              </p>
            </div>

            {/* صورة المقال الثابتة */}
            <div className="space-y-1.5 rounded-xl border border-border bg-muted/20 p-3">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <ImageIcon className="h-3.5 w-3.5" />
                  صورة المقال المعتمدة
                </Label>
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Lock className="h-3 w-3" /> ثابتة من المقال
                </span>
              </div>
              {article?.imageUrl ? (
                <div className="mt-2 flex items-center gap-3">
                  <img
                    src={article.imageUrl}
                    alt={article.title || ""}
                    className="h-16 w-24 rounded-lg border border-border object-cover bg-muted"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    تُرفق الصورة البارزة المعتمدة للمقال تلقائياً بالمنشور.
                  </p>
                </div>
              ) : (
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <ImageOff className="h-4 w-4" />
                  <span>المقال لا يحتوي على صورة بارزة (سيُنشر بدون صورة).</span>
                </div>
              )}
            </div>

            {/* إشعار المسؤولية والتنظيم */}
            <p className="text-[11px] leading-5 text-muted-foreground">
              * ملاحظة: إرسال المقترح ينقله مباشرة إلى نظام النشر الاجتماعي لدى فريق سبق، حيث يقوم المحرر المسؤول بمراجعته وتدقيقه واعتماده للنشر وفق سياسة النشر المعتمدة.
            </p>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isBusy}
            onClick={() => onOpenChange(false)}
          >
            إلغاء
          </Button>
          <Button
            type="button"
            size="sm"
            className="gap-2"
            disabled={!isEligible || !validation.valid || isBusy}
            onClick={() => submitMutation.mutate()}
            data-testid="button-submit-social-proposal"
          >
            {submitMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> جاري الإرسال...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" /> إرسال للمراجعة
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
