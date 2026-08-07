import { useState, useEffect, type ComponentProps, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Edit, Star, Trash2, Send, Bell, Loader2, Languages, FilePenLine, HeartPulse, Share2 } from "lucide-react";
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
      className={cn("h-8 w-8 shrink-0", className)}
      {...props}
    >
      {children}
    </Button>
  );
}

function ActionsGrid({ children }: { children: ReactNode }) {
  return (
    <div
      className="grid w-[136px] grid-cols-4 gap-0.5 justify-items-center"
      role="group"
      aria-label="إجراءات المقال"
    >
      {children}
    </div>
  );
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
}: RowActionsProps) {
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
      <ActionsGrid>
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
      </ActionsGrid>
    );
  }

  // للمقالات النشطة: شبكة ظاهرة بدون قائمة منسدلة
  // صف أساسي: تعديل · تمييز · طلب تعديل · أرشفة
  // صف توزيع/ذكاء: ترجمة · إنعاش · إشعار · نشر على X
  return (
    <>
      <ActionsGrid>
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
      </ActionsGrid>

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
