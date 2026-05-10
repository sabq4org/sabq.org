import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { FileDown, Loader2 } from "lucide-react";
import { exportArticleToPdf, formatPdfFilename } from "@/lib/pdf/exportClient";

interface ExportPdfButtonProps {
  articleSlug: string;
  articleUrl: string;
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
}

/**
 * زر تصدير المقال إلى PDF
 * يتطلب وجود عنصر بمعرّف "article-pdf-content" في الصفحة
 */
export function ExportPdfButton({
  articleSlug,
  articleUrl,
  variant = "outline",
  size = "default",
  className,
}: ExportPdfButtonProps) {
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();

  const handleExport = async () => {
    try {
      setIsExporting(true);

      // التحقق من وجود العنصر
      const element = document.getElementById("article-pdf-content");
      if (!element) {
        throw new Error("عنصر الطباعة غير موجود");
      }

      // تنسيق اسم الملف
      const filename = formatPdfFilename(articleSlug);

      // عرض إشعار البدء
      toast({
        title: "جاري تجهيز الملف...",
        description: "سيتم تنزيل ملف PDF خلال لحظات",
      });

      // تصدير PDF
      await exportArticleToPdf({
        elementId: "article-pdf-content",
        filename,
        articleUrl,
      });

      // إشعار النجاح
      toast({
        title: "تم إنشاء ملف PDF بنجاح",
        description: `تم حفظ الملف: ${filename}`,
        variant: "default",
      });
    } catch (error) {
      console.error("خطأ في تصدير PDF:", error);
      
      toast({
        title: "تعذّر إنشاء PDF",
        description: error instanceof Error ? error.message : "حاول لاحقاً",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Button
      onClick={handleExport}
      disabled={isExporting}
      variant={variant}
      size={size}
      className={className}
      data-testid="button-export-pdf"
    >
      {isExporting ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin ml-2" />
          <span>جاري التجهيز...</span>
        </>
      ) : (
        <>
          <FileDown className="h-4 w-4 ml-2" />
          <span>تصدير PDF</span>
        </>
      )}
    </Button>
  );
}
