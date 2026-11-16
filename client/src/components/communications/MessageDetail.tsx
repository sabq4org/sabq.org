import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { inboxTime, stepsOf, type InboxItem, type TrackTone } from "./inboxModel";
import { PILL_PRIMARY, PILL_QUIET, StateChip } from "./commsUi";

const DOT_TONE: Record<TrackTone, string> = {
  done: "bg-[#E6F4FD] text-[#0B6FA8]",
  draft: "bg-[#FFF6E5] text-[#946000]",
  fail: "bg-[#FDECEC] text-[#BF3038]",
  active: "bg-[#E6F4FD] text-[#0B6FA8] animate-pulse",
  idle: "bg-[#F4F7FB] text-[#617183]",
};

interface MessageDetailProps {
  item: InboxItem;
  autoPublishOff?: boolean;
  reprocessing?: boolean;
  onReprocess?: (id: string) => void;
  onOpenOriginal?: () => void;
  onDelete?: () => void;
}

/** «مسار الرسالة»: أين وصلت الرسالة ولماذا توقفت، مع الفعل المناسب لحالتها. */
export function MessageDetail({ item, autoPublishOff, reprocessing, onReprocess, onOpenOriginal, onDelete }: MessageDetailProps) {
  const steps = stepsOf(item, autoPublishOff);
  const time = inboxTime(item.at);
  const when = time.secondary ? `${time.primary} ${time.secondary}` : `اليوم ${time.primary}`;
  const editorHref = item.articleId ? `/dashboard/articles/${item.articleId}/edit` : null;

  return (
    <div className="flex flex-col gap-5" data-testid={`message-detail-${item.id}`}>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2.5">
          <span className="text-[13px] text-[#55667A]">مسار الرسالة</span>
          <StateChip state={item.state} />
        </div>
        <h2 className="text-[19px] font-bold leading-[1.55] text-[#1B2B3A]">{item.title}</h2>
        <p className="text-[13px] text-[#55667A]">
          <span dir={item.channel === "whatsapp" ? "ltr" : undefined}>{item.sender}</span> · {item.channel === "whatsapp" ? "واتساب" : "البريد الذكي"} · {when}
        </p>
        {item.senderAddress && item.senderAddress !== item.sender && (
          <p dir="ltr" className="truncate text-right text-[13px] text-[#617183]">
            {item.senderAddress}
          </p>
        )}
      </div>

      <ol className="flex flex-col">
        {steps.map((step, index) => (
          <li key={step.n} className="flex items-stretch gap-3.5">
            <div className="flex w-7 shrink-0 flex-col items-center">
              <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold", DOT_TONE[step.tone])}>
                {step.n}
              </span>
              {index < steps.length - 1 && (
                <span className={cn("min-h-[22px] w-0.5 flex-1", step.tone === "done" ? "bg-[#CFE8F9]" : "bg-[#EEF2F6]")} />
              )}
            </div>
            <div className="flex min-w-0 flex-col gap-0.5 pb-[18px]">
              <span
                className={cn(
                  "text-[15px] font-semibold",
                  step.tone === "fail" ? "text-[#BF3038]" : step.tone === "idle" ? "text-[#617183]" : "text-[#1B2B3A]",
                )}
              >
                {step.title}
              </span>
              <span className="break-words text-[13px] leading-[1.6] text-[#55667A]">{step.note}</span>
            </div>
          </li>
        ))}
      </ol>

      {item.channel === "whatsapp" && !!item.whatsapp && (
        <div className="rounded-2xl bg-[#F4F7FB] px-4 py-3.5">
          <p className="mb-1 text-[13px] text-[#55667A]">نص الرسالة</p>
          <p className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-7 text-[#1B2B3A]">
            {(item.whatsapp as { message?: string | null }).message || "لا يوجد نص"}
          </p>
        </div>
      )}

      <dl className="flex flex-col gap-2 rounded-2xl bg-[#F4F7FB] px-4 py-3.5 text-[13px]">
        <div className="flex justify-between gap-2.5">
          <dt className="text-[#55667A]">المرفقات</dt>
          <dd className="font-semibold text-[#1B2B3A]">{item.attachments > 0 ? item.attachments : "لا يوجد"}</dd>
        </div>
        <div className="flex justify-between gap-2.5">
          <dt className="text-[#55667A]">جودة النص</dt>
          <dd className="font-semibold text-[#1B2B3A]">{item.quality !== null ? `${item.quality} من 100` : "لم تُقيَّم"}</dd>
        </div>
      </dl>

      <div className="flex flex-wrap gap-2.5">
        {item.canReprocess && onReprocess && (
          <button
            type="button"
            className={cn(PILL_PRIMARY, "h-[46px] flex-1 basis-44")}
            disabled={reprocessing}
            onClick={() => onReprocess(item.id)}
            data-testid={`button-reprocess-${item.id}`}
          >
            {reprocessing ? "جارٍ البدء…" : "أعد المعالجة"}
          </button>
        )}
        {editorHref && (
          <a
            href={editorHref}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(PILL_PRIMARY, "h-[46px] flex-1 basis-44")}
            data-testid={`link-article-${item.id}`}
          >
            {item.state === "draft" ? "فتح المسودة في المحرر" : "فتح الخبر في المحرر"}
          </a>
        )}
        {item.articleLink && (
          <a href={item.articleLink} target="_blank" rel="noopener noreferrer" className={cn(PILL_QUIET, "h-[46px]")}>
            الخبر في الموقع
          </a>
        )}
        {onOpenOriginal && (
          <button type="button" className={cn(PILL_QUIET, "h-[46px]")} onClick={onOpenOriginal} data-testid={`button-original-${item.id}`}>
            نص الرسالة الأصلي
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            className={cn(PILL_QUIET, "h-[46px] w-[46px] px-0 text-[#BF3038]")}
            onClick={onDelete}
            aria-label="حذف السجل"
            title="حذف السجل"
            data-testid={`button-delete-log-${item.id}`}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
