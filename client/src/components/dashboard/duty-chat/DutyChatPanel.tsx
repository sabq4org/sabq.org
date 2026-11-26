// نافذة «محادثة المناوب» الجانبية: رسائل، مرفقات، «تنبيه» يطلب «استلمت»، وعلامات الصح.
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DUTY_CHAT_ALLOWED_MIME,
  DUTY_CHAT_MAX_ATTACHMENT_BYTES,
  appendMessage,
  type DutyChatEvent,
  type DutyChatKind,
  type DutyChatMessage,
  type DutyChatThreadResponse,
} from "@shared/dutyChat";
import { useAuth } from "@/hooks/useAuth";
import { DUTY_CHAT_INBOX_URL, dutyChatEvents, dutyChatThreadUrl, usePeerTyping } from "@/hooks/useDutyChat";
import { apiRequest, apiUrl } from "@/lib/queryClient";
import { ChatAvatar, CheckIcon, Ticks, chatDayKey, chatDayLabel, chatTime, lastSeenLabel } from "./dutyChatUi";

interface Props {
  peerId: string;
  peerName: string;
  /** سطر تحت الاسم، مثل وقت الوردية. */
  subtitle?: string | null;
  onClose: () => void;
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function AttachmentView({ m }: { m: DutyChatMessage }) {
  const a = m.attachment;
  if (!a) return null;
  const href = apiUrl(a.url);
  if (a.isImage) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl">
        <img src={href} alt={a.name} loading="lazy" className="max-h-64 w-full max-w-[280px] object-cover" />
      </a>
    );
  }
  return (
    <a href={`${href}?download=1`} className="flex items-center gap-2.5 rounded-xl bg-white px-2.5 py-2 text-[#1B2B3A] hover:bg-[#F8FBFE]">
      <span dir="ltr" className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-[#FDECEC] text-[11px] font-bold text-[#BF3038]">PDF</span>
      <span className="flex min-w-0 flex-col text-[13px]">
        <strong className="truncate font-semibold">{a.name}</strong>
        <span dir="ltr" className="text-right text-[#55667A]">{formatSize(a.size)}</span>
      </span>
    </a>
  );
}

export default function DutyChatPanel({ peerId, peerName, subtitle, onClose }: Props) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const threadKey = [dutyChatThreadUrl(peerId)];
  const { data, isLoading, isError } = useQuery<DutyChatThreadResponse>({
    queryKey: threadKey,
    queryFn: () => apiRequest<DutyChatThreadResponse>(dutyChatThreadUrl(peerId), { silent: true }),
    refetchInterval: 30_000,
    retry: 1,
  });
  const typing = usePeerTyping(peerId);
  const [draft, setDraft] = useState("");
  const [kind, setKind] = useState<DutyChatKind>("normal");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [older, setOlder] = useState<{ messages: DutyChatMessage[]; hasMore: boolean } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const lastTypingSent = useRef(0);
  const scrollBox = useRef<HTMLDivElement>(null);

  const refreshInbox = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [DUTY_CHAT_INBOX_URL, user?.id] });
  }, [queryClient, user?.id]);

  const markRead = useCallback(() => {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    apiRequest(`${dutyChatThreadUrl(peerId)}/read`, { method: "POST", body: "{}", silent: true })
      .then(refreshInbox)
      .catch(() => {});
  }, [peerId, refreshInbox]);

  // القراءة: عند الفتح، وعند كل رسالة جديدة منه والنافذة مفتوحة، وعند العودة للتبويب.
  useEffect(() => {
    markRead();
    const onEvent = (e: Event) => {
      const ev = (e as CustomEvent<DutyChatEvent>).detail;
      if (ev.type === "message" && !ev.message.mine && ev.message.senderId === peerId) markRead();
    };
    const onVisible = () => document.visibilityState === "visible" && markRead();
    dutyChatEvents.addEventListener("event", onEvent);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      dutyChatEvents.removeEventListener("event", onEvent);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [peerId, markRead]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const messages = [...(older?.messages ?? []), ...(data?.messages ?? [])];
  const hasMore = older ? older.hasMore : Boolean(data?.hasMore);
  const lastId = messages[messages.length - 1]?.id;

  useEffect(() => {
    const box = scrollBox.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [lastId, typing]);

  async function loadOlder() {
    const first = messages[0];
    if (!first) return;
    try {
      const res = await apiRequest<DutyChatThreadResponse>(
        `${dutyChatThreadUrl(peerId)}?before=${encodeURIComponent(first.createdAt)}`,
        { silent: true },
      );
      setOlder({ messages: [...res.messages, ...(older?.messages ?? [])], hasMore: res.hasMore });
    } catch {
      setError("تعذر تحميل الرسائل الأقدم");
    }
  }

  function onDraftChange(value: string) {
    setDraft(value);
    const now = Date.now();
    if (value.trim() && now - lastTypingSent.current > 3_000) {
      lastTypingSent.current = now;
      apiRequest(`${dutyChatThreadUrl(peerId)}/typing`, { method: "POST", body: "{}", silent: true }).catch(() => {});
    }
  }

  function onPickFile(f: File | null | undefined) {
    setError(null);
    if (!f) return;
    if (!(DUTY_CHAT_ALLOWED_MIME as readonly string[]).includes(f.type)) {
      setError("المرفق المسموح: صورة أو ملف PDF");
      return;
    }
    if (f.size > DUTY_CHAT_MAX_ATTACHMENT_BYTES) {
      setError("حجم المرفق يتجاوز 10 ميجابايت");
      return;
    }
    setFile(f);
  }

  async function send() {
    const body = draft.trim();
    if ((!body && !file) || sending) return;
    setSending(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("body", body);
      form.append("kind", kind);
      if (file) form.append("file", file);
      const res = await apiRequest<{ message: DutyChatMessage }>(`${dutyChatThreadUrl(peerId)}/messages`, {
        method: "POST",
        body: form,
        isFormData: true,
        timeoutMs: 60_000,
        silent: true,
      });
      queryClient.setQueryData<DutyChatThreadResponse>(threadKey, (old) =>
        old ? { ...old, messages: appendMessage(old.messages, res.message) } : old,
      );
      setDraft("");
      setFile(null);
      setKind("normal");
      refreshInbox();
    } catch (e) {
      setError((e as Error)?.message || "تعذر إرسال الرسالة");
    } finally {
      setSending(false);
    }
  }

  async function ack(id: string) {
    try {
      const res = await apiRequest<{ message: DutyChatMessage }>(`/api/duty-chat/messages/${id}/ack`, {
        method: "POST",
        body: "{}",
        silent: true,
      });
      queryClient.setQueryData<DutyChatThreadResponse>(threadKey, (old) =>
        old ? { ...old, messages: old.messages.map((m) => (m.id === id ? res.message : m)) } : old,
      );
      refreshInbox();
    } catch {
      setError("تعذر تأكيد الاستلام");
    }
  }

  const peer = data?.peer;
  const statusLine = typing ? (
    <span className="text-[13px] font-semibold text-[#1E9BE6]">يكتب الآن…</span>
  ) : peer?.online ? (
    <span className="text-[13px] text-[#13734E]">متصل الآن</span>
  ) : peer ? (
    <span className="text-[13px] text-[#55667A]">
      غير متصل · <bdi dir="ltr">{lastSeenLabel(peer.lastSeenAt).replace("آخر ظهور ", "")}</bdi> · تصله الرسالة على «مكتب سبق»
    </span>
  ) : null;

  return (
    <div className="fixed inset-0 z-[60] flex" dir="rtl" role="dialog" aria-modal="true" aria-label={`محادثة مع ${peerName}`}>
      <button type="button" aria-label="إغلاق المحادثة" onClick={onClose} className="hidden min-w-0 flex-1 cursor-default bg-[#F4F7FB]/60 backdrop-blur-[1px] sm:block" />
      <aside className="flex h-full w-full min-w-0 max-w-full flex-col bg-white text-[#1B2B3A] shadow-[0_0_40px_rgba(27,43,58,.10)] sm:w-[460px]" style={{ fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif" }}>
        <header className="flex items-center gap-3 border-b border-[#EEF2F6] px-4 py-3.5">
          <ChatAvatar initial={peer?.initial ?? peerName.slice(0, 1)} online={peer?.online} size={44} />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-base font-bold">
              {peer?.name ?? peerName}
              {subtitle ? <span className="text-[13px] font-normal text-[#55667A]"> · {subtitle}</span> : null}
            </span>
            {statusLine}
          </div>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F4F7FB] hover:bg-[#EAF1F8]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#55667A" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </header>

        <div ref={scrollBox} className="flex-1 overflow-y-auto bg-[#F7FAFD] px-4 py-4">
          <div className="flex flex-col gap-2.5">
            {hasMore ? (
              <button type="button" onClick={loadOlder} className="self-center rounded-full border border-[#DDE6EF] bg-white px-4 py-1.5 text-[13px] text-[#0B6FA8]">
                رسائل أقدم
              </button>
            ) : null}
            {isLoading ? <div className="self-center py-10 text-[13px] text-[#55667A]">جارٍ تحميل المحادثة…</div> : null}
            {isError ? <div className="self-center py-10 text-[13px] text-[#BF3038]">تعذر تحميل المحادثة</div> : null}
            {!isLoading && !isError && messages.length === 0 ? (
              <div className="self-center py-10 text-center text-[13px] leading-6 text-[#55667A]">
                لا رسائل بعد. اكتب تعليماتك، أو اختر «تنبيه» ليؤكد استلامه بزر «استلمت».
              </div>
            ) : null}

            {messages.map((m, i) => {
              const day = chatDayKey(m.createdAt);
              const showDay = i === 0 || chatDayKey(messages[i - 1].createdAt) !== day;
              const alert = m.kind === "alert";
              return (
                <Fragment key={m.id}>
                  {showDay ? (
                    <div className="self-center rounded-full border border-[#EEF2F6] bg-white px-3 py-0.5 text-xs text-[#55667A]">
                      <bdi dir="ltr">{chatDayLabel(m.createdAt)}</bdi>
                    </div>
                  ) : null}
                  {m.mine ? (
                    <div className="flex justify-end">
                      <div className="flex max-w-[80%] flex-col gap-1.5 rounded-[18px] rounded-bl-md bg-[#E6F4FD] px-3 py-2.5">
                        {alert ? (
                          <span className="self-start rounded-full bg-[#FFF1E0] px-2.5 py-px text-xs font-semibold text-[#8A4B00]">تنبيه · يطلب تأكيد الاستلام</span>
                        ) : null}
                        <AttachmentView m={m} />
                        {m.body ? <span className="whitespace-pre-wrap break-words text-[15px] leading-7">{m.body}</span> : null}
                        <span className="flex items-center justify-end gap-1.5 text-[11px] text-[#6B7C8F]">
                          {alert && m.ackedAt ? (
                            <span className="font-semibold text-[#13734E]">استلم <bdi dir="ltr">{chatTime(m.ackedAt)}</bdi> ·</span>
                          ) : null}
                          <bdi dir="ltr">{chatTime(m.createdAt)}</bdi>
                          <Ticks message={m} />
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-start">
                      <div className={`flex max-w-[82%] flex-col gap-1.5 rounded-[18px] rounded-br-md border bg-white px-3 py-2.5 ${alert ? "border-[#F5D9B5]" : "border-[#EEF2F6]"}`}>
                        {alert ? (
                          <span className="self-start rounded-full bg-[#FFF1E0] px-2.5 py-px text-xs font-semibold text-[#8A4B00]">تنبيه</span>
                        ) : null}
                        <AttachmentView m={m} />
                        {m.body ? <span className="whitespace-pre-wrap break-words text-[15px] leading-7">{m.body}</span> : null}
                        <span dir="ltr" className="text-left text-[11px] text-[#8A9AAC]">{chatTime(m.createdAt)}</span>
                        {alert && !m.ackedAt ? (
                          <button type="button" onClick={() => ack(m.id)} className="flex h-11 items-center justify-center gap-2 rounded-full bg-[#1E9BE6] text-sm font-semibold text-white">
                            <CheckIcon color="#FFFFFF" size={16} />
                            استلمت
                          </button>
                        ) : null}
                        {alert && m.ackedAt ? (
                          <span className="inline-flex items-center gap-1.5 self-start text-xs font-semibold text-[#13734E]">
                            <CheckIcon /> أكدت الاستلام <bdi dir="ltr">{chatTime(m.ackedAt)}</bdi>
                          </span>
                        ) : null}
                      </div>
                    </div>
                  )}
                </Fragment>
              );
            })}

            {typing ? (
              <div className="flex justify-start" aria-label="يكتب الآن">
                <div className="flex gap-1.5 rounded-[18px] border border-[#EEF2F6] bg-white px-4 py-3">
                  <span className="h-[7px] w-[7px] animate-pulse rounded-full bg-[#8A9AAC]" />
                  <span className="h-[7px] w-[7px] animate-pulse rounded-full bg-[#8A9AAC] [animation-delay:200ms]" />
                  <span className="h-[7px] w-[7px] animate-pulse rounded-full bg-[#8A9AAC] [animation-delay:400ms]" />
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <footer className="flex flex-col gap-2.5 border-t border-[#EEF2F6] px-3.5 pb-3.5 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-[#55667A]">نوع الرسالة</span>
            {(["normal", "alert"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                aria-pressed={kind === k}
                className={`h-8 rounded-full px-3.5 text-[13px] ${kind === k ? "bg-[#1E9BE6] font-semibold text-white" : "border border-[#DDE6EF] bg-white text-[#1B2B3A]"}`}
              >
                {k === "normal" ? "عادية" : "تنبيه يطلب «استلمت»"}
              </button>
            ))}
          </div>
          {file ? (
            <div className="flex items-center gap-2.5 rounded-xl bg-[#F4F7FB] px-2.5 py-2 text-[13px]">
              <span dir="ltr" className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-[#FDECEC] text-[10px] font-bold text-[#BF3038]">
                {file.type === "application/pdf" ? "PDF" : "IMG"}
              </span>
              <span className="min-w-0 flex-1 truncate">{file.name} <bdi dir="ltr" className="text-[#55667A]">· {formatSize(file.size)}</bdi></span>
              <button type="button" onClick={() => setFile(null)} aria-label="إزالة المرفق" className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#55667A" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
              </button>
            </div>
          ) : null}
          {error ? <div className="text-[13px] text-[#BF3038]" role="alert">{error}</div> : null}
          <div className="flex items-end gap-2">
            <input
              ref={fileInput}
              type="file"
              accept={DUTY_CHAT_ALLOWED_MIME.join(",")}
              className="hidden"
              onChange={(e) => {
                onPickFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <button type="button" onClick={() => fileInput.current?.click()} aria-label="إرفاق صورة أو PDF" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#F4F7FB] hover:bg-[#EAF1F8]">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0B6FA8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m21 11-8.6 8.6a5 5 0 0 1-7.1-7.1l8.6-8.6a3.3 3.3 0 0 1 4.7 4.7L10 17.2a1.7 1.7 0 0 1-2.4-2.4l8-8" /></svg>
            </button>
            <label htmlFor="duty-chat-input" className="sr-only">اكتب رسالة</label>
            <textarea
              id="duty-chat-input"
              rows={1}
              value={draft}
              onChange={(e) => onDraftChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder={`اكتب رسالة إلى ${peer?.name ?? peerName}…`}
              className="max-h-32 min-h-[44px] flex-1 resize-none rounded-[22px] border border-[#DDE6EF] bg-white px-4 py-2.5 text-[15px] leading-6 text-[#1B2B3A] outline-none focus:border-[#1E9BE6]"
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={sending || (!draft.trim() && !file)}
              aria-label="إرسال"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#1E9BE6] shadow-[0_6px_14px_rgba(30,155,230,.3)] disabled:opacity-50"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: "scaleX(-1)" }}><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4z" /></svg>
            </button>
          </div>
        </footer>
      </aside>
    </div>
  );
}
