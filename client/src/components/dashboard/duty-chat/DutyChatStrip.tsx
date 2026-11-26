// الشريط تحت بطاقة المناوبة: آخر رسالة لم تُقرأ أو «تنبيه» لم يُؤكَّد، وإلا آخر محادثة مع المناوب الآن.
import { attachmentLabel, type DutyChatConversation } from "@shared/dutyChat";
import { usePeerTyping } from "@/hooks/useDutyChat";
import { ChatAvatar, CheckIcon, Ticks, chatTime } from "./dutyChatUi";

export default function DutyChatStrip({ conversation, onOpen }: { conversation: DutyChatConversation; onOpen: () => void }) {
  const { peer, last, unread, pendingAcks } = conversation;
  const typing = usePeerTyping(peer.id);
  const incomingPending = unread > 0 || pendingAcks > 0;
  const fileLabel = attachmentLabel(last.attachment);

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex w-full items-center gap-3 rounded-[18px] bg-white px-4 py-3 text-start text-[#1B2B3A] hover:bg-[#F8FBFE] ${incomingPending ? "shadow-[0_0_0_2px_rgba(30,155,230,.22)]" : ""}`}
      aria-label={`محادثة مع ${peer.name}${unread ? `، ${unread} رسائل غير مقروءة` : ""}`}
    >
      <ChatAvatar initial={peer.initial} online={peer.online} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-2 text-[13px]">
          <strong>{peer.name}</strong>
          {typing ? <span className="text-[#1E9BE6]">يكتب الآن…</span> : null}
          {!last.mine && last.kind === "alert" ? (
            <span className="rounded-full bg-[#FFF1E0] px-2 text-[11px] font-semibold text-[#8A4B00]">تنبيه</span>
          ) : null}
          <bdi dir="ltr" className="text-[#55667A]">{chatTime(last.createdAt)}</bdi>
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-sm">
          {last.mine ? (
            <>
              <Ticks message={last} />
              <span className="text-[#55667A]">أنت:</span>
            </>
          ) : null}
          {fileLabel ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#E6F4FD] px-2 py-0.5 text-[12px] font-semibold text-[#0B6FA8]">
              <ClipIcon /> {fileLabel}
            </span>
          ) : null}
          {last.body ? <span className="truncate">{last.body}</span> : null}
        </span>
      </span>
      {last.mine && last.kind === "alert" && last.ackedAt ? (
        <span className="hidden shrink-0 items-center gap-1.5 rounded-full bg-[#E3F6EC] px-3 py-1 text-xs font-semibold text-[#13734E] sm:inline-flex">
          <CheckIcon /> استلم التنبيه <bdi dir="ltr">{chatTime(last.ackedAt)}</bdi>
        </span>
      ) : null}
      {last.mine && last.kind === "alert" && !last.ackedAt ? (
        <span className="hidden shrink-0 rounded-full bg-[#FFF1E0] px-3 py-1 text-xs font-semibold text-[#8A4B00] sm:inline-flex">لم يؤكد الاستلام</span>
      ) : null}
      {unread > 0 ? (
        <span dir="ltr" className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-[#1E9BE6] px-1.5 text-xs font-bold text-white">{unread}</span>
      ) : null}
      <span className="inline-flex h-9 shrink-0 items-center rounded-full bg-[#E6F4FD] px-4 text-[13px] font-semibold text-[#0B6FA8]">
        {incomingPending ? "ردّ" : "افتح"}
      </span>
    </button>
  );
}

function ClipIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}
