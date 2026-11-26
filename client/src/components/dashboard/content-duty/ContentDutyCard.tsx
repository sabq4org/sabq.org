import { useEffect, useState } from "react";
import { Link } from "wouter";
import { pickStripConversations, type DutyChatConversation } from "@shared/dutyChat";
import type { ContentDutyCardEntry, ContentDutyCardResponse } from "@shared/contentDuty";
import { useContentDutyCard } from "@/hooks/useContentDuty";
import { formatRemaining, statusLabel, statusTone } from "@/lib/contentDuty";
import { DutyPulseRibbon } from "./DutyPulseRibbon";
import { useAuth } from "@/hooks/useAuth";
import { askDutyChatNotificationPermission, dutyChatEvents, takePendingDutyChat, useDutyChatInbox } from "@/hooks/useDutyChat";
import DutyChatStrip from "../duty-chat/DutyChatStrip";
import DutyChatPanel from "../duty-chat/DutyChatPanel";

const ROOM = "/dashboard/content-duty";

export function DutyRing({ pct, remaining, size = 84, label = "باقٍ" }: { pct: number; remaining: number; size?: number; label?: string }) {
  const r = 72;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 168 168" role="img" aria-label={`مضى ${pct}% من الوردية`}>
        <circle cx="84" cy="84" r={r} fill="none" stroke="#FFFFFF" strokeWidth={16} />
        <circle
          cx="84" cy="84" r={r} fill="none" stroke="#1E9BE6" strokeWidth={16} strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * c} ${c}`} transform="rotate(-90 84 84)"
        />
        <circle cx="84" cy="84" r={56} fill="#FFFFFF" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span dir="ltr" className="font-bold tabular-nums text-[#1E9BE6]" style={{ fontSize: Math.round(size / 4.6) }}>{formatRemaining(remaining)}</span>
        <span className="text-[10px] text-[#55667A]">{label}</span>
      </div>
    </div>
  );
}

function StatusPill({ entry }: { entry: Pick<ContentDutyCardEntry, "status"> }) {
  const tone = statusTone(entry.status);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ background: tone.bg, color: tone.fg }}>
      <span className="h-[7px] w-[7px] rounded-full" style={{ background: tone.dot }} />
      {statusLabel(entry.status)}
    </span>
  );
}

function Numbers({ data, entry }: { data: ContentDutyCardResponse; entry: ContentDutyCardEntry }) {
  if (!data.waiting) return null;
  const cells: Array<{ label: string; value: number | null; color: string }> = [
    { label: "نشر", value: entry.published, color: "#1B2B3A" },
    { label: "تنتظر", value: data.waiting.count, color: "#946000" },
    { label: "متأخرة", value: data.waiting.overdue, color: data.waiting.overdue > 0 ? "#BF3038" : "#13734E" },
  ];
  return (
    <div className="flex rounded-2xl bg-white/75">
      {cells.map((c, i) => (
        <div key={c.label} className={`flex w-[72px] flex-col gap-0.5 px-4 py-2.5 ${i > 0 ? "border-s border-[#EEF2F6]" : ""}`}>
          <span className="text-xs text-[#55667A]">{c.label}</span>
          <span dir="ltr" className="text-right text-[22px] font-bold tabular-nums" style={{ color: c.color }}>{c.value ?? "—"}</span>
        </div>
      ))}
    </div>
  );
}

/** صورة المناوب بجانب اسمه، وإلا أول حرف من اسمه (حين يكون لأحد المناوبين صورة). */
function DutyAvatar({ entry, size }: { entry: ContentDutyCardEntry; size: number }) {
  const [broken, setBroken] = useState(false);
  if (entry.avatarUrl && !broken) {
    return (
      <img
        src={entry.avatarUrl}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        onError={() => setBroken(true)}
        className="shrink-0 rounded-full border-2 border-white object-cover shadow-[0_1px_4px_rgba(27,43,58,.12)]"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-full border-2 border-white bg-[#D6EEFD] font-bold text-[#0B6FA8]"
      style={{ width: size, height: size, fontSize: Math.round(size / 2.4) }}
    >
      {entry.initial}
    </span>
  );
}

interface ChatTarget { id: string; name: string; subtitle: string | null }

function MessageButton({ name, onClick, fill = false }: { name: string; onClick: () => void; fill?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${fill ? "w-full justify-center " : ""}inline-flex h-11 items-center gap-2 rounded-full border border-[#CFE6F7] bg-white px-[18px] text-sm font-semibold text-[#0B6FA8] hover:bg-[#F8FBFE]`}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0B6FA8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
      </svg>
      راسل {name.split(" ")[0]}
    </button>
  );
}

export default function ContentDutyCard() {
  const { data, isLoading, isError } = useContentDutyCard();
  const { user } = useAuth();
  // «محادثة المناوب»: 403 لغير مديري المحتوى و503 قبل تنفيذ SQL، فلا شريط ولا زر.
  const inbox = useDutyChatInbox();
  const chatOn = inbox.isSuccess && Boolean(inbox.data);
  // قناة البث يفتحها DutyChatNotifier مرة واحدة لكل لوحة التحكم.
  const [chat, setChatState] = useState<ChatTarget | null>(null);
  const setChat = (t: ChatTarget | null) => {
    if (t) askDutyChatNotificationPermission();
    setChatState(t);
  };
  // الضغط على إشعار المتصفح يفتح المحادثة هنا.
  const conversations = inbox.data?.conversations;
  useEffect(() => {
    const openPeer = (peerId: string | null) => {
      if (!peerId) return;
      const c = conversations?.find((x) => x.peer.id === peerId);
      setChatState({ id: peerId, name: c?.peer.name ?? "", subtitle: null });
    };
    openPeer(takePendingDutyChat());
    const onOpen = (e: Event) => openPeer(takePendingDutyChat() ?? (e as CustomEvent<string>).detail);
    dutyChatEvents.addEventListener("open", onOpen);
    return () => dutyChatEvents.removeEventListener("open", onOpen);
  }, [conversations]);
  // قبل تنفيذ SQL أو عند الخطأ تختفي البطاقة ولا تزعج اللوحة.
  if (isError) return null;
  if (isLoading || !data) {
    return <div className="h-[132px] animate-pulse rounded-[22px] bg-[#EEF4FA] dark:bg-slate-800" aria-busy="true" aria-label="جار تحميل المناوبة" />;
  }

  const onDutyIds = data.onDuty.map((e) => e.userId).filter((id): id is string => Boolean(id));
  // شريط لكل مناوب تحت صفه، فلا تختفي رسالة أحدهما حين يناوب الاثنان معًا.
  const strips = chatOn && inbox.data
    ? pickStripConversations(inbox.data.conversations, onDutyIds, user?.id)
    : { byPeer: new Map<string, DutyChatConversation>(), extra: null };
  const subtitleFor = (peerId: string) => {
    const e = data.onDuty.find((x) => x.userId === peerId);
    return e ? `مناوب ${e.start} – ${e.end}` : null;
  };
  const stripFor = (conv: DutyChatConversation) => (
    <DutyChatStrip
      conversation={conv}
      onOpen={() => setChat({ id: conv.peer.id, name: conv.peer.name, subtitle: subtitleFor(conv.peer.id) })}
    />
  );
  const stripConv = strips.extra;
  const chatBits = (
    <>
      {stripConv ? stripFor(stripConv) : null}
      {chat ? <DutyChatPanel peerId={chat.id} peerName={chat.name} subtitle={chat.subtitle} onClose={() => setChat(null)} /> : null}
    </>
  );

  const shell = "rounded-[22px] border border-white bg-gradient-to-br from-[#E2F2FD] to-[#EEF1FE] p-4 text-[#1B2B3A] shadow-[0_2px_10px_rgba(27,43,58,.05)] sm:p-6";

  if (data.onDuty.length === 0) {
    return (
      <section aria-label="المناوبة الآن" className={shell} dir="rtl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-[13px] text-[#55667A]">المناوب الآن</span>
            <span className="text-lg font-bold text-[#BF3038]">لا مناوب الآن</span>
            {data.next ? (
              <span className="text-[13px] text-[#55667A]">
                أقرب وردية: {data.next.name} <bdi dir="ltr" className="tabular-nums">{data.next.start}</bdi> بتوقيت الرياض
              </span>
            ) : null}
          </div>
          <Link href={ROOM} className="inline-flex h-11 items-center rounded-full bg-[#1E9BE6] px-5 text-sm font-semibold text-white shadow-[0_6px_14px_rgba(30,155,230,.3)]">
            افتح غرفة المناوبة
          </Link>
        </div>
        {stripConv ? <div className="mt-4">{chatBits}</div> : chatBits}
      </section>
    );
  }

  const roomLink = (
    <Link href={ROOM} className="inline-flex h-11 shrink-0 items-center rounded-full bg-[#1E9BE6] px-5 text-sm font-semibold text-white shadow-[0_6px_14px_rgba(30,155,230,.3)]">
      افتح غرفة المناوبة
    </Link>
  );
  // أكثر من مناوب: الزر الخاص بالبطاقة كلها يصعد إلى رأسها، وكل صف بأعمدة ثابتة
  // (الحلقة، الاسم، العدادات، خانة «راسل») فتتحاذى العدادات والأزرار بين الصفوف.
  const multi = data.onDuty.length > 1;
  const showMessage = (entry: ContentDutyCardEntry) => chatOn && Boolean(entry.userId) && entry.userId !== user?.id;
  const anyMessage = data.onDuty.some(showMessage);
  // الصورة تظهر متى كان لأي مناوب صورة، ومن لا صورة له يظهر حرفه فتبقى الصفوف متحاذية.
  const showAvatars = data.onDuty.some((e) => Boolean(e.avatarUrl));

  return (
    <section aria-label="المناوبة الآن" className={`${shell} flex flex-col gap-4`} dir="rtl">
      {multi ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[15px] font-bold">
            المناوبون الآن <span className="font-semibold text-[#55667A]">· <bdi dir="ltr" className="tabular-nums">{data.onDuty.length}</bdi></span>
          </span>
          {roomLink}
        </div>
      ) : null}
      {data.onDuty.map((entry, idx) => (
        <div key={`${entry.name}-${idx}`} className={`flex flex-col gap-3 ${multi && idx > 0 ? "border-t border-white/80 pt-4" : ""}`}>
          <div className="flex flex-wrap items-center gap-4 sm:gap-5">
            <DutyRing pct={entry.elapsedPct} remaining={entry.remainingMin} size={multi ? 72 : 84} />
            {showAvatars ? <DutyAvatar entry={entry} size={multi ? 52 : 56} /> : null}
            <div className="flex min-w-[180px] flex-1 flex-col gap-1">
              <span className="text-[13px] text-[#55667A]">{idx === 0 ? "المناوب الآن" : "يناوب معه"}</span>
              <span className="flex flex-wrap items-center gap-2.5">
                <span className="text-xl font-bold">{entry.name}</span>
                <StatusPill entry={entry} />
              </span>
              <span className="text-[13px] text-[#55667A]">
                <bdi dir="ltr" className="tabular-nums">{entry.start} – {entry.end}</bdi> بتوقيت الرياض
                {entry.coveredName ? <> · بدل {entry.coveredName}</> : null}
                {idx === 0 && data.next ? <> · يستلم بعده {data.next.name}</> : null}
              </span>
            </div>
            <Numbers data={data} entry={entry} />
            {showMessage(entry) ? (
              <div className={multi ? "sm:w-[148px]" : undefined}>
                <MessageButton
                  fill={multi}
                  name={entry.name}
                  onClick={() => setChat({ id: entry.userId!, name: entry.name, subtitle: `مناوب ${entry.start} – ${entry.end}` })}
                />
              </div>
            ) : multi && anyMessage ? (
              // صف المستخدم نفسه بلا «راسل»: خانة فارغة بالعرض نفسه حتى لا تنزاح العدادات.
              <div className="hidden sm:block sm:w-[148px]" aria-hidden="true" />
            ) : null}
            {!multi ? roomLink : null}
          </div>
          {entry.cells ? (
            <DutyPulseRibbon compact cells={entry.cells} startMs={0} endMs={entry.cells.length * 300_000} label={`نبض وردية ${entry.name}`} />
          ) : null}
          {entry.userId && strips.byPeer.get(entry.userId) ? stripFor(strips.byPeer.get(entry.userId)!) : null}
        </div>
      ))}
      {chatBits}
      {data.alert ? (
        <Link
          href={`/dashboard/articles/${data.alert.articleId}/edit`}
          className="flex items-center gap-2.5 rounded-2xl bg-white px-4 py-3 text-sm text-[#1B2B3A] hover:bg-[#F8FBFE]"
        >
          <span className="h-2 w-2 shrink-0 rounded-full bg-[#E0393E]" />
          <span className="min-w-0 flex-1">
            <strong>
              {data.alert.breaking ? "عاجل ينتظر" : "مادة تنتظر"} <bdi dir="ltr" className="tabular-nums">{data.alert.waitMin}</bdi> دقيقة
              {data.alert.opened ? " (مفتوح الآن)" : " ولم يُفتح"}:
            </strong>{" "}
            {data.alert.title}
          </span>
          <span className="shrink-0 font-semibold text-[#0B6FA8]">افتحه</span>
        </Link>
      ) : null}
    </section>
  );
}
