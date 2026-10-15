import { useState, useEffect, type ComponentProps, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Edit, Star, Trash2, Send, Bell, Loader2, Languages, FilePenLine, HeartPulse, Share2, Zap, Archive, Undo2 } from "lucide-react";
import { BOT_DRAFT_READY_STATUS } from "@shared/botDrafts";
import { useBreakingToggle } from "@/components/admin/BreakingSwitch";
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
import { cn } from "@/lib/utils";

interface RowActionsProps {
  articleId: string;
  articleTitle?: string;
  status: string;
  onEdit: () => void;
  isFeatured: boolean;
  /** Triggers the parent's archive flow (red trash icon). The parent
   *  is expected to open a dialog that captures the reason and PATCHes
   *  the article to `status: "archived"` with `reviewNotes`. The reason
   *  is then delivered to the colleague via in-app push + email by the
   *  backend. */
  onDelete: () => void;
  /** Opens the parent's revision-request dialog (returns article to author as draft). */
  onRequestRevision?: () => void;
  /** يفتح نافذة «النشر على X» في الصفحة الأم (SocialPublishDialog). */
  onSocialPublish?: () => void;
  canEdit?: boolean;
  canDelete?: boolean;
  canFeature?: boolean;
  canPublish?: boolean;
  canSendNotification?: boolean;
  canTranslate?: boolean;
  canSocialPublish?: boolean;
  /** «wire»: شكل قائمة الأخبار الموحّد — أحادي اللون، ثلاث مجموعات، وزر البرق بدل عمود «عاجل». */
  variant?: "default" | "wire";
  isBreaking?: boolean;
  /** آخر إشعار خرج للخبر — نقطة خضراء على زر الجرس */
  notifiedAt?: string | null;
  /** آخر نشر على X — نقطة خضراء على زر X */
  socialPublishedAt?: string | null;
}

function ActionBtn({
  children,
  className,
  ...props
}: ComponentProps<typeof Button>) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn("h-7 w-7 sm:h-8 sm:w-8 rounded-lg transition-all hover:bg-muted shrink-0 text-muted-foreground hover:text-foreground", className)}
      {...props}
    >
      {children}
    </Button>
  );
}

function ActionsRow({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex items-center justify-center gap-0.5"
      role="group"
      aria-label="إجراءات المقال"
    >
      {children}
    </div>
  );
}

/** فاصل رأسي بين مجموعة التحرير (تعديل·تمييز·طلب تعديل·أرشفة)
 *  ومجموعة التوزيع (ترجمة·إنعاش·إشعار·X). */
function ActionsDivider() {
  return <span aria-hidden="true" className="h-4 w-px shrink-0 bg-border" />;
}

/** زر صف القائمة الموحّد: رمادي هادئ، ولون الحالة فقط حين تكون فعّالة. */
function WireBtn({
  children,
  className,
  done,
  ...props
}: ComponentProps<typeof Button> & { done?: boolean }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn("relative h-8 w-8 shrink-0 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground", className)}
      {...props}
    >
      {children}
      {done ? (
        <span
          aria-hidden="true"
          className="absolute left-1 top-1 h-1.5 w-1.5 rounded-full bg-emerald-500 ring-2 ring-card"
          data-testid="action-done-dot"
        />
      ) : null}
    </Button>
  );
}

function WireDivider() {
  return <span aria-hidden="true" className="mx-1 h-4 w-px shrink-0 bg-border" />;
}

export function RowActions({
  articleId,
  articleTitle,
  status,
  onEdit,
  isFeatured: initialIsFeatured,
  onDelete,
  onRequestRevision,
  onSocialPublish,
  canEdit = true,
  canDelete = true,
  canFeature = true,
  canPublish = true,
  canSendNotification = true,
  canTranslate = true,
  canSocialPublish = false,
  variant = "default",
  isBreaking: initialIsBreaking = false,
  notifiedAt = null,
  socialPublishedAt = null,
}: RowActionsProps) {
  const breaking = useBreakingToggle(articleId, initialIsBreaking);
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isFeatured, setIsFeatured] = useState(initialIsFeatured);
  const [notifyDialogOpen, setNotifyDialogOpen] = useState(false);
  const [isSendingNotification, setIsSendingNotification] = useState(false);
  const [translateDialogOpen, setTranslateDialogOpen] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [resurfaceDialogOpen, setResurfaceDialogOpen] = useState(false);
  const [isResurfacing, setIsResurfacing] = useState(false);

  useEffect(() => {
    setIsFeatured(initialIsFeatured);
  }, [initialIsFeatured]);

  const handleSendNotification = async () => {
    setIsSendingNotification(true);
    try {
      const data = await apiRequest<{ message?: string }>(`/api/admin/push/quick-send`, {
        method: "POST",
        body: JSON.stringify({ articleId }),
        headers: { "Content-Type": "application/json" },
      });

      toast({
        title: "بدأ الإرسال",
        description: data?.message || "جارٍ إرسال الإشعار للمستخدمين في الخلفية",
      });
      setNotifyDialogOpen(false);
    } catch (error: any) {
      toast({
        title: "خطأ",
        description: error.message || "فشل إرسال الإشعار",
        variant: "destructive",
      });
    } finally {
      setIsSendingNotification(false);
    }
  };

  const handleTranslateToEnglish = async () => {
    setIsTranslating(true);
    try {
      const data = await apiRequest<{ message: string; enArticleId: string; enArticleTitle: string }>(`/api/admin/articles/${articleId}/translate-to-english`, {
        method: "POST",
      });

      toast({
        title: "تمت الترجمة بنجاح",
        description: `تم نشر الخبر في النسخة الإنجليزية: "${data.enArticleTitle}"`,
      });
      setTranslateDialogOpen(false);
    } catch (error: any) {
      toast({
        title: "خطأ في الترجمة",
        description: error.message || "فشلت عملية الترجمة",
        variant: "destructive",
      });
    } finally {
      setIsTranslating(false);
    }
  };

  // «إنعاش»: يعيد الخبر لصدارة الموجز دون تغيير تاريخه أو مشاهداته أو رابطه
  const handleResurface = async () => {
    setIsResurfacing(true);
    try {
      await apiRequest(`/api/articles/${articleId}/resurface`, {
        method: "POST",
      });

      toast({
        title: "تم الإنعاش",
        description: "عاد الخبر إلى صدارة الموجز وبدأ دورة جديدة",
      });
      setResurfaceDialogOpen(false);
    } catch (error: any) {
      toast({
        title: "خطأ",
        description: error.message || "فشل إنعاش الخبر",
        variant: "destructive",
      });
    } finally {
      setIsResurfacing(false);
    }
  };

  const handleRevertToDraft = async () => {
    setIsLoading(true);
    try {
      await apiRequest(`/api/admin/articles/${articleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "draft" }),
      });
      queryClient.removeQueries({ queryKey: ["/api/admin/articles"] });
      queryClient.removeQueries({ queryKey: ["/api/admin/articles/metrics"] });
      await queryClient.refetchQueries({ queryKey: ["/api/admin/articles"] });
      await queryClient.refetchQueries({ queryKey: ["/api/admin/articles/metrics"] });
      toast({
        title: "أُعيدت مسودة",
        description: "عادت المادة إلى المسودات ويمكن للبوت تعديلها من جديد",
      });
    } catch (error: any) {
      toast({
        title: "تعذر الإرجاع",
        description: error.message || "لم تُرجع المادة إلى المسودة",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePublish = async () => {
    setIsLoading(true);
    try {
      await apiRequest(`/api/admin/articles/${articleId}/publish`, {
        method: "POST",
      });

      queryClient.removeQueries({ queryKey: ["/api/admin/articles"] });
      queryClient.removeQueries({ queryKey: ["/api/admin/articles/metrics"] });
      await queryClient.refetchQueries({ queryKey: ["/api/admin/articles"] });
      await queryClient.refetchQueries({ queryKey: ["/api/admin/articles/metrics"] });

      toast({
        title: "تم النشر",
        description: "تم نشر المقال بنجاح",
      });
    } catch (error: any) {
      toast({
        title: "خطأ",
        description: error.message || "فشل نشر المقال",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleFeature = async () => {
    const previousValue = isFeatured;

    // Optimistic update
    setIsFeatured(!isFeatured);
    setIsLoading(true);

    try {
      await apiRequest(`/api/admin/articles/${articleId}/feature`, {
        method: "POST",
        body: JSON.stringify({ featured: !previousValue }),
        headers: { "Content-Type": "application/json" },
      });

      queryClient.removeQueries({ queryKey: ["/api/admin/articles"] });
      await queryClient.refetchQueries({ queryKey: ["/api/admin/articles"] });

      toast({
        title: !previousValue ? "تم التمييز" : "تم إلغاء التمييز",
        description: !previousValue ? "تم تمييز المقال بنجاح" : "تم إلغاء تمييز المقال بنجاح",
      });
    } catch (error: any) {
      // Revert on error
      setIsFeatured(previousValue);

      toast({
        title: "خطأ",
        description: error.message || "فشل تحديث حالة التمييز",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // للمقالات المؤرشفة: تعديل - مميز - نشر
  if (status === "archived") {
    return (
      <ActionsRow>
        {canEdit && (
          <ActionBtn
            onClick={onEdit}
            disabled={isLoading}
            data-testid={`button-action-edit-${articleId}`}
            title="تعديل"
          >
            <Edit className="w-4 h-4" />
          </ActionBtn>
        )}
        {canFeature && (
          <ActionBtn
            onClick={handleFeature}
            disabled={isLoading}
            data-testid={`button-action-feature-${articleId}`}
            title={isFeatured ? "إلغاء التمييز" : "تمييز"}
          >
            <Star className={`w-4 h-4 ${isFeatured ? "text-yellow-500 fill-yellow-500" : ""}`} />
          </ActionBtn>
        )}
        {canPublish && (
          <ActionBtn
            onClick={handlePublish}
            disabled={isLoading}
            data-testid={`button-action-publish-${articleId}`}
            title="نشر"
          >
            <Send className="w-4 h-4" />
          </ActionBtn>
        )}
      </ActionsRow>
    );
  }

  // للمقالات النشطة: كل الإجراءات ظاهرة في سطر واحد بدون قائمة منسدلة،
  // مع فاصل رأسي بين مجموعة التحرير ومجموعة التوزيع/الذكاء.
  const hasEditGroup =
    canEdit || canFeature || !!onRequestRevision || canDelete;
  const hasDistributionGroup =
    status === "published" &&
    (canTranslate ||
      canPublish ||
      canSendNotification ||
      (canSocialPublish && !!onSocialPublish));

  const doneAt = (iso: string | null) => {
    if (!iso) return null;
    const date = new Date(iso);
    return Number.isNaN(date.getTime())
      ? null
      : date.toLocaleString("ar-SA-u-nu-latn", { timeZone: "Asia/Riyadh", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" });
  };
  const notifiedLabel = doneAt(notifiedAt);
  const socialLabel = doneAt(socialPublishedAt);
  const isPublished = status === "published";
  const isReadyToPublish = status === BOT_DRAFT_READY_STATUS;

  const wireRow = (
    <div className="flex items-center justify-end gap-0.5" role="group" aria-label="إجراءات المقال">
      {canEdit && (
        <WireBtn onClick={onEdit} disabled={isLoading} data-testid={`button-action-edit-${articleId}`} title="تعديل">
          <Edit className="h-4 w-4" />
        </WireBtn>
      )}
      {isReadyToPublish && canPublish && (
        <WireBtn
          onClick={handlePublish}
          disabled={isLoading}
          data-testid={`button-action-publish-${articleId}`}
          title="نشر"
          className="text-emerald-700 hover:text-emerald-800 dark:text-emerald-400"
        >
          <Send className="h-4 w-4" />
        </WireBtn>
      )}
      {isReadyToPublish && canEdit && (
        <WireBtn
          onClick={() => void handleRevertToDraft()}
          disabled={isLoading}
          data-testid={`button-action-revert-draft-${articleId}`}
          title="إرجاع لمسودة"
        >
          <Undo2 className="h-4 w-4" />
        </WireBtn>
      )}
      {canFeature && (
        <WireBtn
          onClick={handleFeature}
          disabled={isLoading}
          data-testid={`button-action-feature-${articleId}`}
          title={isFeatured ? "إلغاء التمييز" : "تمييز"}
          aria-pressed={isFeatured}
          className={isFeatured ? "text-amber-500 hover:text-amber-600" : undefined}
        >
          <Star className={cn("h-4 w-4", isFeatured && "fill-current")} />
        </WireBtn>
      )}
      {canPublish && (
        <WireBtn
          onClick={() => void breaking.toggle(!breaking.isBreaking)}
          disabled={breaking.isPending}
          data-testid={`switch-breaking-${articleId}`}
          title={breaking.isBreaking ? "إلغاء العاجل" : "عاجل"}
          aria-pressed={breaking.isBreaking}
          className={breaking.isBreaking ? "text-red-600 hover:text-red-700 dark:text-red-400" : undefined}
        >
          <Zap className={cn("h-4 w-4", breaking.isBreaking && "fill-current")} />
        </WireBtn>
      )}
      {isPublished && (canSocialPublish || canPublish || canSendNotification || canTranslate) && <WireDivider />}
      {isPublished && canSocialPublish && onSocialPublish && (
        <WireBtn
          onClick={onSocialPublish}
          disabled={isLoading}
          data-testid={`button-action-social-publish-${articleId}`}
          title={socialLabel ? `نُشر على X · ${socialLabel}` : "النشر على X"}
          done={!!socialLabel}
        >
          <Share2 className="h-4 w-4" />
        </WireBtn>
      )}
      {isPublished && canSendNotification && (
        <WireBtn
          onClick={() => setNotifyDialogOpen(true)}
          disabled={isLoading}
          data-testid={`button-action-notify-${articleId}`}
          title={notifiedLabel ? `أُرسل إشعار · ${notifiedLabel}` : "إرسال إشعار"}
          done={!!notifiedLabel}
        >
          <Bell className="h-4 w-4" />
        </WireBtn>
      )}
      {isPublished && canTranslate && (
        <WireBtn
          onClick={() => setTranslateDialogOpen(true)}
          disabled={isLoading || isTranslating}
          data-testid={`button-action-translate-${articleId}`}
          title="ترجم للإنجليزية"
        >
          {isTranslating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Languages className="h-4 w-4" />}
        </WireBtn>
      )}
      {isPublished && canPublish && (
        <WireBtn
          onClick={() => setResurfaceDialogOpen(true)}
          disabled={isLoading || isResurfacing}
          data-testid={`button-action-resurface-${articleId}`}
          title="إنعاش (عودة لصدارة الموجز)"
        >
          {isResurfacing ? <Loader2 className="h-4 w-4 animate-spin" /> : <HeartPulse className="h-4 w-4" />}
        </WireBtn>
      )}
      {(onRequestRevision || canDelete) && <WireDivider />}
      {onRequestRevision && (
        <WireBtn
          onClick={onRequestRevision}
          disabled={isLoading}
          data-testid={`button-action-revision-${articleId}`}
          title="طلب تعديل (مع ملاحظات)"
        >
          <FilePenLine className="h-4 w-4" />
        </WireBtn>
      )}
      {canDelete && (
        <WireBtn
          onClick={onDelete}
          disabled={isLoading}
          data-testid={`button-action-delete-${articleId}`}
          title="أرشفة (مع ذكر السبب)"
          className="hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
        >
          <Archive className="h-4 w-4" />
        </WireBtn>
      )}
    </div>
  );

  return (
    <>
      {variant === "wire" ? wireRow : (
      <ActionsRow>
        {canEdit && (
          <ActionBtn
            onClick={onEdit}
            disabled={isLoading}
            data-testid={`button-action-edit-${articleId}`}
            title="تعديل"
          >
            <Edit className="w-4 h-4" />
          </ActionBtn>
        )}
        {isReadyToPublish && canPublish && (
          <ActionBtn
            onClick={handlePublish}
            disabled={isLoading}
            data-testid={`button-action-publish-${articleId}`}
            title="نشر"
          >
            <Send className="w-4 h-4" />
          </ActionBtn>
        )}
        {isReadyToPublish && canEdit && (
          <ActionBtn
            onClick={() => void handleRevertToDraft()}
            disabled={isLoading}
            data-testid={`button-action-revert-draft-${articleId}`}
            title="إرجاع لمسودة"
          >
            <Undo2 className="w-4 h-4" />
          </ActionBtn>
        )}
        {canFeature && (
          <ActionBtn
            onClick={handleFeature}
            disabled={isLoading}
            data-testid={`button-action-feature-${articleId}`}
            title={isFeatured ? "إلغاء التمييز" : "تمييز"}
          >
            <Star className={`w-4 h-4 ${isFeatured ? "text-yellow-500 fill-yellow-500" : ""}`} />
          </ActionBtn>
        )}
        {onRequestRevision && (
          <ActionBtn
            onClick={onRequestRevision}
            disabled={isLoading}
            data-testid={`button-action-revision-${articleId}`}
            title="طلب تعديل (مع ملاحظات)"
          >
            <FilePenLine className="w-4 h-4 text-amber-600" />
          </ActionBtn>
        )}
        {canDelete && (
          <ActionBtn
            onClick={onDelete}
            disabled={isLoading}
            data-testid={`button-action-delete-${articleId}`}
            title="أرشفة (مع ذكر السبب)"
          >
            <Trash2 className="w-4 h-4 text-destructive" />
          </ActionBtn>
        )}
        {hasEditGroup && hasDistributionGroup && <ActionsDivider />}
        {canTranslate && status === "published" && (
          <ActionBtn
            onClick={() => setTranslateDialogOpen(true)}
            disabled={isLoading || isTranslating}
            data-testid={`button-action-translate-${articleId}`}
            title="ترجم للإنجليزية"
          >
            {isTranslating ? (
              <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
            ) : (
              <Languages className="w-4 h-4 text-emerald-500" />
            )}
          </ActionBtn>
        )}
        {canPublish && status === "published" && (
          <ActionBtn
            onClick={() => setResurfaceDialogOpen(true)}
            disabled={isLoading || isResurfacing}
            data-testid={`button-action-resurface-${articleId}`}
            title="إنعاش (عودة لصدارة الموجز)"
          >
            {isResurfacing ? (
              <Loader2 className="w-4 h-4 animate-spin text-rose-500" />
            ) : (
              <HeartPulse className="w-4 h-4 text-rose-500" />
            )}
          </ActionBtn>
        )}
        {canSendNotification && status === "published" && (
          <ActionBtn
            onClick={() => setNotifyDialogOpen(true)}
            disabled={isLoading}
            data-testid={`button-action-notify-${articleId}`}
            title="إرسال إشعار"
          >
            <Bell className="w-4 h-4 text-blue-500" />
          </ActionBtn>
        )}
        {canSocialPublish && onSocialPublish && status === "published" && (
          <ActionBtn
            onClick={onSocialPublish}
            disabled={isLoading}
            data-testid={`button-action-social-publish-${articleId}`}
            title="النشر على X"
          >
            <Share2 className="w-4 h-4 text-sky-600" />
          </ActionBtn>
        )}
      </ActionsRow>
      )}

      <AlertDialog open={translateDialogOpen} onOpenChange={setTranslateDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ترجمة الخبر للإنجليزية</AlertDialogTitle>
            <AlertDialogDescription className="text-right">
              سيتم ترجمة هذا الخبر بالذكاء الاصطناعي ونشره تلقائياً في لوحة تحكم سبق الإنجليزية والصفحة الرئيسية للنسخة الإنجليزية.
              {articleTitle && (
                <span className="block mt-2 font-medium text-foreground">
                  "{articleTitle}"
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel disabled={isTranslating}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleTranslateToEnglish}
              disabled={isTranslating}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {isTranslating ? (
                <>
                  <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                  جاري الترجمة...
                </>
              ) : (
                <>
                  <Languages className="w-4 h-4 ml-2" />
                  ترجم ونشر
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={resurfaceDialogOpen} onOpenChange={setResurfaceDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>إنعاش الخبر</AlertDialogTitle>
            <AlertDialogDescription className="text-right">
              سيعود الخبر إلى صدارة الموجز ويبدأ دورة عرض جديدة، دون أي تغيير في تاريخ نشره أو مشاهداته أو رابطه.
              {articleTitle && (
                <span className="block mt-2 font-medium text-foreground">
                  "{articleTitle}"
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel disabled={isResurfacing}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleResurface}
              disabled={isResurfacing}
              className="bg-rose-600 hover:bg-rose-700"
            >
              {isResurfacing ? (
                <>
                  <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                  جاري الإنعاش...
                </>
              ) : (
                <>
                  <HeartPulse className="w-4 h-4 ml-2" />
                  أنعش الخبر
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={notifyDialogOpen} onOpenChange={setNotifyDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>إرسال إشعار للمستخدمين</AlertDialogTitle>
            <AlertDialogDescription className="text-right">
              سيتم إرسال إشعار بهذا الخبر لجميع مستخدمي التطبيق.
              {articleTitle && (
                <span className="block mt-2 font-medium text-foreground">
                  "{articleTitle}"
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel disabled={isSendingNotification}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSendNotification}
              disabled={isSendingNotification}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isSendingNotification ? (
                <>
                  <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                  جاري الإرسال...
                </>
              ) : (
                <>
                  <Bell className="w-4 h-4 ml-2" />
                  إرسال الإشعار
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
