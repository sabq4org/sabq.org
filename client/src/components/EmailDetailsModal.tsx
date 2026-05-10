import { format } from "date-fns";
import { ar } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Badge } from "./ui/badge";
import { Separator } from "./ui/separator";
import { ScrollArea } from "./ui/scroll-area";
import { AlertCircle, CheckCircle, FileText, Paperclip } from "lucide-react";
import type { EmailWebhookLog } from "@shared/schema";
import DOMPurify from "isomorphic-dompurify";

interface EmailDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  log?: EmailWebhookLog | null;
}

export function EmailDetailsModal({
  open,
  onOpenChange,
  log,
}: EmailDetailsModalProps) {
  if (!log) return null;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "published":
        return (
          <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
            منشور
          </Badge>
        );
      case "drafted":
        return (
          <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">
            مسودة
          </Badge>
        );
      case "rejected":
        return (
          <Badge className="bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300">
            مرفوض
          </Badge>
        );
      case "failed":
        return (
          <Badge className="bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300">
            فشل
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            تفاصيل البريد الإلكتروني
          </DialogTitle>
          <DialogDescription>
            سجل البريد الوارد #{log.id.slice(0, 8)}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-120px)]">
          <div className="space-y-6 p-1">
            {/* Header Info */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground mb-1">من</p>
                <p className="font-medium">{log.fromEmail}</p>
                {log.fromName && (
                  <p className="text-sm text-muted-foreground">{log.fromName}</p>
                )}
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">الحالة</p>
                {getStatusBadge(log.status)}
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">تاريخ الاستلام</p>
                <p className="text-sm">
                  {format(new Date(log.receivedAt), "dd MMM yyyy HH:mm:ss", {
                    locale: ar,
                  })}
                </p>
              </div>
              {log.processedAt && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">تاريخ المعالجة</p>
                  <p className="text-sm">
                    {format(new Date(log.processedAt), "dd MMM yyyy HH:mm:ss", {
                      locale: ar,
                    })}
                  </p>
                </div>
              )}
            </div>

            <Separator />

            {/* Subject */}
            <div>
              <p className="text-sm text-muted-foreground mb-2">الموضوع</p>
              <p className="font-medium">{log.subject}</p>
            </div>

            {/* Email Body */}
            <div>
              <p className="text-sm text-muted-foreground mb-2">محتوى الرسالة</p>
              <div className="rounded-lg border p-4 bg-muted/50">
                {log.bodyHtml ? (
                  <div
                    className="prose prose-sm max-w-none dark:prose-invert"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(log.bodyHtml || '') }}
                  />
                ) : log.bodyText ? (
                  <pre className="whitespace-pre-wrap font-sans text-sm">
                    {log.bodyText}
                  </pre>
                ) : (
                  <p className="text-muted-foreground text-sm">لا يوجد محتوى</p>
                )}
              </div>
            </div>

            {/* Attachments */}
            {log.attachmentsCount > 0 && log.attachmentsData && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Paperclip className="h-4 w-4" />
                  <p className="text-sm text-muted-foreground">
                    المرفقات ({log.attachmentsCount})
                  </p>
                </div>
                <div className="space-y-2">
                  {log.attachmentsData.map((attachment, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex-1">
                        <p className="font-medium text-sm">{attachment.filename}</p>
                        <p className="text-xs text-muted-foreground">
                          {attachment.contentType} •{" "}
                          {(attachment.size / 1024).toFixed(2)} KB
                        </p>
                      </div>
                      {attachment.url && (
                        <a
                          href={attachment.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary text-sm hover:underline"
                        >
                          عرض
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* AI Analysis */}
            {log.aiAnalysis && (
              <div>
                <p className="text-sm text-muted-foreground mb-3">تحليل الذكاء الاصطناعي</p>
                <div className="space-y-3">
                  {log.aiAnalysis.contentQuality !== undefined && (
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <span className="text-sm">جودة المحتوى</span>
                      <Badge
                        variant="outline"
                        className={
                          log.aiAnalysis.contentQuality >= 70
                            ? "border-emerald-500 text-emerald-700"
                            : log.aiAnalysis.contentQuality >= 50
                            ? "border-amber-500 text-amber-700"
                            : "border-red-500 text-red-700"
                        }
                      >
                        {log.aiAnalysis.contentQuality}%
                      </Badge>
                    </div>
                  )}

                  {log.aiAnalysis.languageDetected && (
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <span className="text-sm">اللغة المكتشفة</span>
                      <span className="text-sm font-medium">
                        {log.aiAnalysis.languageDetected}
                      </span>
                    </div>
                  )}

                  {log.aiAnalysis.categoryPredicted && (
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <span className="text-sm">التصنيف المتوقع</span>
                      <span className="text-sm font-medium">
                        {log.aiAnalysis.categoryPredicted}
                      </span>
                    </div>
                  )}

                  {log.aiAnalysis.isNewsWorthy !== undefined && (
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <span className="text-sm">قيمة إخبارية</span>
                      {log.aiAnalysis.isNewsWorthy ? (
                        <CheckCircle className="h-5 w-5 text-emerald-500" />
                      ) : (
                        <AlertCircle className="h-5 w-5 text-red-500" />
                      )}
                    </div>
                  )}

                  {log.aiAnalysis.suggestedTitle && (
                    <div className="p-3 border rounded-lg">
                      <p className="text-sm text-muted-foreground mb-1">
                        العنوان المقترح
                      </p>
                      <p className="text-sm font-medium">
                        {log.aiAnalysis.suggestedTitle}
                      </p>
                    </div>
                  )}

                  {log.aiAnalysis.suggestedSummary && (
                    <div className="p-3 border rounded-lg">
                      <p className="text-sm text-muted-foreground mb-1">
                        الملخص المقترح
                      </p>
                      <p className="text-sm">{log.aiAnalysis.suggestedSummary}</p>
                    </div>
                  )}

                  {log.aiAnalysis.warnings && log.aiAnalysis.warnings.length > 0 && (
                    <div className="p-3 border border-amber-500 rounded-lg bg-amber-50 dark:bg-amber-950">
                      <p className="text-sm text-amber-700 dark:text-amber-300 mb-2 font-medium">
                        تحذيرات
                      </p>
                      <ul className="list-disc list-inside space-y-1">
                        {log.aiAnalysis.warnings.map((warning, index) => (
                          <li key={index} className="text-sm text-amber-700 dark:text-amber-300">
                            {warning}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {log.aiAnalysis.errors && log.aiAnalysis.errors.length > 0 && (
                    <div className="p-3 border border-red-500 rounded-lg bg-red-50 dark:bg-red-950">
                      <p className="text-sm text-red-700 dark:text-red-300 mb-2 font-medium">
                        أخطاء
                      </p>
                      <ul className="list-disc list-inside space-y-1">
                        {log.aiAnalysis.errors.map((error, index) => (
                          <li key={index} className="text-sm text-red-700 dark:text-red-300">
                            {error}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Processing Error */}
            {log.processingError && (
              <div className="p-4 border border-red-500 rounded-lg bg-red-50 dark:bg-red-950">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-red-700 dark:text-red-300 font-medium mb-1">
                      خطأ في المعالجة
                    </p>
                    <p className="text-sm text-red-700 dark:text-red-300">
                      {log.processingError}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Security Verification */}
            <div>
              <p className="text-sm text-muted-foreground mb-2">التحقق الأمني</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <span className="text-sm">المرسل موثوق</span>
                  {log.senderVerified ? (
                    <CheckCircle className="h-5 w-5 text-emerald-500" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-red-500" />
                  )}
                </div>
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <span className="text-sm">الرمز صحيح</span>
                  {log.tokenVerified ? (
                    <CheckCircle className="h-5 w-5 text-emerald-500" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-red-500" />
                  )}
                </div>
              </div>
            </div>

            {/* Rejection Reason */}
            {log.status === "rejected" && log.rejectionReason && (
              <div className="p-4 border border-red-500 rounded-lg bg-red-50 dark:bg-red-950">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-red-700 dark:text-red-300 font-medium mb-1">
                      سبب الرفض
                    </p>
                    <p className="text-sm text-red-700 dark:text-red-300">
                      {log.rejectionReason === "sender_not_trusted" && "المرسل غير مسجل في قائمة المرسلين الموثوقين"}
                      {log.rejectionReason === "sender_inactive" && "حساب المرسل معطّل أو غير نشط"}
                      {log.rejectionReason === "invalid_token" && "رمز التوثيق (Token) غير صحيح أو مفقود"}
                      {log.rejectionReason === "quality_too_low" && `جودة المحتوى (${log.aiAnalysis?.contentQuality || 0}/100) أقل من الحد الأدنى المطلوب - لا يتوافق مع معايير صبق الصحفية`}
                      {log.rejectionReason === "no_news_value" && "المحتوى ليس له قيمة إخبارية كافية"}
                      {!["sender_not_trusted", "sender_inactive", "invalid_token", "quality_too_low", "no_news_value"].includes(log.rejectionReason) && log.rejectionReason}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Article Link */}
            {log.articleId && (
              <div className="p-4 border border-emerald-500 rounded-lg bg-emerald-50 dark:bg-emerald-950">
                <p className="text-sm text-emerald-700 dark:text-emerald-300 mb-2">
                  تم إنشاء مقال بنجاح
                </p>
                <a
                  href={`/admin/articles/${log.articleId}`}
                  className="text-sm text-primary hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  عرض المقال
                </a>
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
