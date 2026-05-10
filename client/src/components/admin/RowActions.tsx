import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Edit, Star, Archive, Trash2, Send, Bell, Loader2, Languages } from "lucide-react";
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

interface RowActionsProps {
  articleId: string;
  articleTitle?: string;
  status: string;
  onEdit: () => void;
  isFeatured: boolean;
  onDelete: () => void;
  canEdit?: boolean;
  canDelete?: boolean;
  canFeature?: boolean;
  canArchive?: boolean;
  canPublish?: boolean;
  canSendNotification?: boolean;
  canTranslate?: boolean;
}

export function RowActions({ 
  articleId,
  articleTitle,
  status, 
  onEdit, 
  isFeatured: initialIsFeatured, 
  onDelete,
  canEdit = true,
  canDelete = true,
  canFeature = true,
  canArchive = true,
  canPublish = true,
  canSendNotification = true,
  canTranslate = true,
}: RowActionsProps) {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isFeatured, setIsFeatured] = useState(initialIsFeatured);
  const [notifyDialogOpen, setNotifyDialogOpen] = useState(false);
  const [isSendingNotification, setIsSendingNotification] = useState(false);
  const [translateDialogOpen, setTranslateDialogOpen] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);

  useEffect(() => {
    setIsFeatured(initialIsFeatured);
  }, [initialIsFeatured]);

  const handleSendNotification = async () => {
    setIsSendingNotification(true);
    try {
      await apiRequest(`/api/admin/push/quick-send`, {
        method: "POST",
        body: JSON.stringify({ articleId }),
        headers: { "Content-Type": "application/json" },
      });
      
      toast({
        title: "تم الإرسال",
        description: "تم إرسال الإشعار للمستخدمين بنجاح",
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

  const handleArchive = async () => {
    setIsLoading(true);
    try {
      await apiRequest(`/api/admin/articles/${articleId}/archive`, {
        method: "POST",
      });
      
      queryClient.removeQueries({ queryKey: ["/api/admin/articles"] });
      queryClient.removeQueries({ queryKey: ["/api/admin/articles/metrics"] });
      await queryClient.refetchQueries({ queryKey: ["/api/admin/articles"] });
      await queryClient.refetchQueries({ queryKey: ["/api/admin/articles/metrics"] });
      
      toast({
        title: "تم الأرشفة",
        description: "تم أرشفة المقال بنجاح",
      });
    } catch (error: any) {
      toast({
        title: "خطأ",
        description: error.message || "فشلت عملية الأرشفة",
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
      <div className="flex gap-1">
        {canEdit && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onEdit}
            disabled={isLoading}
            data-testid={`button-action-edit-${articleId}`}
            title="تعديل"
          >
            <Edit className="w-4 h-4" />
          </Button>
        )}
        {canFeature && (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleFeature}
            disabled={isLoading}
            data-testid={`button-action-feature-${articleId}`}
            title={isFeatured ? "إلغاء التمييز" : "تمييز"}
          >
            <Star className={`w-4 h-4 ${isFeatured ? 'text-yellow-500 fill-yellow-500' : ''}`} />
          </Button>
        )}
        {canPublish && (
          <Button
            variant="ghost"
            size="icon"
            onClick={handlePublish}
            disabled={isLoading}
            data-testid={`button-action-publish-${articleId}`}
            title="نشر"
          >
            <Send className="w-4 h-4" />
          </Button>
        )}
      </div>
    );
  }

  // للمقالات النشطة (منشور/مسودة/مجدول): تعديل - مميز - إشعار - أرشفة - حذف
  return (
    <>
      <div className="flex gap-1">
        {canEdit && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onEdit}
            disabled={isLoading}
            data-testid={`button-action-edit-${articleId}`}
            title="تعديل"
          >
            <Edit className="w-4 h-4" />
          </Button>
        )}
        {canFeature && (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleFeature}
            disabled={isLoading}
            data-testid={`button-action-feature-${articleId}`}
            title={isFeatured ? "إلغاء التمييز" : "تمييز"}
          >
            <Star className={`w-4 h-4 ${isFeatured ? 'text-yellow-500 fill-yellow-500' : ''}`} />
          </Button>
        )}
        {canTranslate && status === "published" && (
          <Button
            variant="ghost"
            size="icon"
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
          </Button>
        )}
        {canSendNotification && status === "published" && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setNotifyDialogOpen(true)}
            disabled={isLoading}
            data-testid={`button-action-notify-${articleId}`}
            title="إرسال إشعار"
          >
            <Bell className="w-4 h-4 text-blue-500" />
          </Button>
        )}
        {canArchive && (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleArchive}
            disabled={isLoading}
            data-testid={`button-action-archive-${articleId}`}
            title="أرشفة"
          >
            <Archive className="w-4 h-4" />
          </Button>
        )}
        {canDelete && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onDelete}
            disabled={isLoading}
            data-testid={`button-action-delete-${articleId}`}
            title="حذف"
          >
            <Trash2 className="w-4 h-4 text-destructive" />
          </Button>
        )}
      </div>

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
