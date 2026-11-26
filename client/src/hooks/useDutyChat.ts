// «محادثة المناوب»: صندوق المحادثات + قناة البث اللحظي (docs/systems/editorial/SYSTEM.md).
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  appendMessage,
  applyStatusEvent,
  type DutyChatEvent,
  type DutyChatInboxResponse,
  type DutyChatThreadResponse,
} from "@shared/dutyChat";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, apiUrl } from "@/lib/queryClient";

export const DUTY_CHAT_INBOX_URL = "/api/duty-chat/inbox";
export const dutyChatThreadUrl = (peerId: string) => `/api/duty-chat/thread/${encodeURIComponent(peerId)}`;

/** أحداث القناة لمن يحتاجها داخل الصفحة (النافذة المفتوحة، مؤشر الكتابة). */
export const dutyChatEvents = new EventTarget();

/**
 * طلب فتح محادثة بعينها (من إشعار المتصفح): يحفظه حتى تُحمَّل بطاقة المناوبة في الرئيسية فتفتحه.
 */
let pendingOpenPeer: string | null = null;
export function requestOpenDutyChat(peerId: string) {
  pendingOpenPeer = peerId;
  dutyChatEvents.dispatchEvent(new CustomEvent("open", { detail: peerId }));
}
export function takePendingDutyChat(): string | null {
  const id = pendingOpenPeer;
  pendingOpenPeer = null;
  return id;
}

/** يطلب إذن إشعارات المتصفح مرة واحدة، ضمن نقرة من المستخدم (شرط Safari). */
export function askDutyChatNotificationPermission() {
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      void Notification.requestPermission();
    }
  } catch {
    /* متصفح قديم بلا إشعارات */
  }
}

const typingUntil = new Map<string, number>();
const TYPING_SHOW_MS = 4_000;

export function useDutyChatInbox() {
  const { user } = useAuth();
  return useQuery<DutyChatInboxResponse>({
    queryKey: [DUTY_CHAT_INBOX_URL, user?.id],
    queryFn: () => apiRequest<DutyChatInboxResponse>(DUTY_CHAT_INBOX_URL, { silent: true }),
    enabled: Boolean(user?.id),
    staleTime: 20_000,
    // بعد 403/503 يتوقف الاستطلاع، فلا يكرر غير المؤهل طلبات في كل صفحة.
    refetchInterval: (q) => (q.state.status === "error" ? false : 60_000),
    // 403 (ليس مدير محتوى) و503 (قبل تنفيذ SQL): لا إعادة محاولة، ويختفي كل شيء.
    retry: false,
  });
}

/**
 * يفتح قناة البث مرة واحدة ما دامت المحادثة متاحة: يحدّث الصندوق والمحادثة المفتوحة،
 * ويختم «وصلت» على كل رسالة تصلني فورًا.
 */
export function useDutyChatStream(enabled: boolean) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  useEffect(() => {
    if (!enabled || !user?.id || typeof EventSource === "undefined") return;
    const es = new EventSource(apiUrl("/api/duty-chat/stream"), { withCredentials: true });
    const inboxKey = [DUTY_CHAT_INBOX_URL, user.id];

    const onEvent = (raw: MessageEvent) => {
      let ev: DutyChatEvent;
      try {
        ev = JSON.parse(raw.data) as DutyChatEvent;
      } catch {
        return;
      }
      if (ev.type === "message") {
        const m = ev.message;
        const peerId = m.mine ? m.recipientId : m.senderId;
        queryClient.setQueryData<DutyChatThreadResponse>([dutyChatThreadUrl(peerId)], (old) =>
          old ? { ...old, messages: appendMessage(old.messages, m) } : old,
        );
        if (!m.mine) {
          typingUntil.delete(peerId);
          apiRequest("/api/duty-chat/delivered", { method: "POST", body: "{}", silent: true }).catch(() => {});
        }
        queryClient.invalidateQueries({ queryKey: inboxKey });
      } else if (ev.type === "status") {
        queryClient.setQueryData<DutyChatThreadResponse>([dutyChatThreadUrl(ev.peerId)], (old) =>
          old ? { ...old, messages: applyStatusEvent(old.messages, ev) } : old,
        );
        queryClient.invalidateQueries({ queryKey: inboxKey });
      } else if (ev.type === "typing") {
        typingUntil.set(ev.peerId, Date.now() + TYPING_SHOW_MS);
      }
      dutyChatEvents.dispatchEvent(new CustomEvent("event", { detail: ev }));
    };

    es.addEventListener("message", onEvent as EventListener);
    es.addEventListener("status", onEvent as EventListener);
    es.addEventListener("typing", onEvent as EventListener);
    return () => es.close();
  }, [enabled, user?.id, queryClient]);
}

/** «يكتب الآن…» لزميل بعينه، يختفي بعد 4 ثوانٍ من آخر إشارة. */
export function usePeerTyping(peerId: string | null | undefined): boolean {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!peerId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const listener = (e: Event) => {
      const ev = (e as CustomEvent<DutyChatEvent>).detail;
      const from = ev.type === "typing" ? ev.peerId : ev.type === "message" && !ev.message.mine ? ev.message.senderId : null;
      if (from !== peerId) return;
      setTick((n) => n + 1);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setTick((n) => n + 1), TYPING_SHOW_MS + 50);
    };
    dutyChatEvents.addEventListener("event", listener);
    return () => {
      dutyChatEvents.removeEventListener("event", listener);
      if (timer) clearTimeout(timer);
    };
  }, [peerId]);
  return Boolean(peerId && (typingUntil.get(peerId) ?? 0) > Date.now());
}
