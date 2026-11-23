// دعوة خفيفة أعلى مساحة الكاتب لتعبئة «اهتماماتي ومقترحاتي» — تختفي بعد إرسال الرد،
// ولا تظهر عند أي خطأ (مثلاً قبل إنشاء الجدول على الإنتاج).

import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ArrowLeft, MessageSquareHeart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MY_WRITER_FEEDBACK_KEY, type MyWriterFeedbackResponse } from "./WriterFeedbackPage";

export function WriterFeedbackInvite() {
  const [, navigate] = useLocation();
  const { data } = useQuery<MyWriterFeedbackResponse | null>({
    queryKey: MY_WRITER_FEEDBACK_KEY,
    staleTime: 5 * 60_000,
    retry: false,
  });

  if (!data?.isWriter || data.feedback) return null;

  return (
    <div
      className="flex flex-col gap-2 rounded-xl border border-primary/25 bg-primary/5 p-3 sm:flex-row sm:items-center sm:justify-between"
      dir="rtl"
      data-testid="writer-feedback-invite"
    >
      <div className="flex items-start gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <MessageSquareHeart className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-bold">شاركنا اهتماماتك ومقترحاتك</p>
          <p className="text-xs text-muted-foreground">دقيقة واحدة تساعدنا على التواصل معك حسب تخصصك وتطوير تجربة الكتّاب.</p>
        </div>
      </div>
      <Button
        size="sm"
        className="shrink-0 gap-1.5"
        onClick={() => navigate("/dashboard/opinion-author/feedback")}
        data-testid="button-open-writer-feedback"
      >
        عبّئ النموذج
        <ArrowLeft className="h-4 w-4" />
      </Button>
    </div>
  );
}
