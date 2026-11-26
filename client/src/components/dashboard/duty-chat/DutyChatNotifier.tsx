// مستمع «محادثة المناوب» الخفي في كل صفحات لوحة التحكم: لا يضيف شيئًا مرئيًا للصفحة.
// يفتح قناة البث فيُختم «وصلت» فور وصول الرسالة إلى الجهاز، ويعرض إشعار المتصفح
// إن لم يكن المستلم ينظر إلى الشريط في الرئيسية. الضغط على الإشعار يفتح الرئيسية والمحادثة.
import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import type { DutyChatEvent, DutyChatMessage } from "@shared/dutyChat";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/lib/queryClient";
import { dutyChatEvents, requestOpenDutyChat, useDutyChatInbox, useDutyChatStream } from "@/hooks/useDutyChat";

const HOME = "/dashboard";
const SEEN_PREFIX = "duty-chat-notified-";

function alreadyNotified(id: string): boolean {
  try {
    if (sessionStorage.getItem(SEEN_PREFIX + id)) return true;
    sessionStorage.setItem(SEEN_PREFIX + id, "1");
  } catch {
    /* التخزين غير متاح: قد يتكرر الإشعار عند إعادة التحميل فقط */
  }
  return false;
}

function DutyChatNotifierInner() {
  const [location, navigate] = useLocation();
  const inbox = useDutyChatInbox();
  const chatOn = inbox.isSuccess && Boolean(inbox.data);
  useDutyChatStream(chatOn);
  const locationRef = useRef(location);
  locationRef.current = location;

  useEffect(() => {
    if (!chatOn) return;
    const stripInView = () => locationRef.current === HOME && document.visibilityState === "visible";
    const show = (m: DutyChatMessage, senderName: string) => {
      if (stripInView()) return;
      if (typeof Notification === "undefined" || Notification.permission !== "granted") {
        // لا إشعار متصفح ولا شريط أمامه: نطلب إشعار «مكتب سبق» على جواله بدلًا منه.
        apiRequest(`/api/duty-chat/messages/${encodeURIComponent(m.id)}/push-fallback`, { method: "POST", body: "{}", silent: true }).catch(() => {});
        return;
      }
      if (alreadyNotified(m.id)) return;
      const title = m.kind === "alert" ? `تنبيه من ${senderName}` : `رسالة من ${senderName}`;
      const body = m.body || (m.attachment?.isImage ? "صورة" : m.attachment ? "مرفق PDF" : "");
      try {
        const n = new Notification(title, { body, tag: `duty-chat-${m.senderId}`, dir: "rtl", lang: "ar", requireInteraction: m.kind === "alert" });
        n.onclick = () => {
          window.focus();
          requestOpenDutyChat(m.senderId);
          if (locationRef.current !== HOME) navigate(HOME);
          n.close();
        };
      } catch {
        /* بعض متصفحات الجوال لا تسمح بالإشعار من الصفحة مباشرة */
      }
    };
    const nameOf = (peerId: string) =>
      inbox.data?.conversations.find((c) => c.peer.id === peerId)?.peer.name ?? "المسؤول";
    const onEvent = (e: Event) => {
      const ev = (e as CustomEvent<DutyChatEvent>).detail;
      if (ev.type === "message" && !ev.message.mine) show(ev.message, nameOf(ev.message.senderId));
    };
    dutyChatEvents.addEventListener("event", onEvent);
    return () => dutyChatEvents.removeEventListener("event", onEvent);
  }, [chatOn, inbox.data, navigate]);

  // رسائل وصلت والصفحة مغلقة: إشعار واحد لكل رسالة عند أول تحميل للوحة.
  useEffect(() => {
    if (!inbox.data || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (locationRef.current === HOME && document.visibilityState === "visible") return;
    for (const c of inbox.data.conversations) {
      if ((c.unread > 0 || c.pendingAcks > 0) && !c.last.mine && !alreadyNotified(c.last.id)) {
        try {
          const n = new Notification(c.last.kind === "alert" ? `تنبيه من ${c.peer.name}` : `رسالة من ${c.peer.name}`, {
            body: c.last.body || "مرفق",
            tag: `duty-chat-${c.peer.id}`,
            dir: "rtl",
            lang: "ar",
          });
          n.onclick = () => {
            window.focus();
            requestOpenDutyChat(c.peer.id);
            if (locationRef.current !== HOME) navigate(HOME);
            n.close();
          };
        } catch {
          /* لا إشعار في هذا المتصفح */
        }
      }
    }
  }, [inbox.data, navigate]);

  return null;
}

/** يعمل داخل لوحة التحكم فقط، ولمن سجّل دخوله. */
export default function DutyChatNotifier() {
  const [location] = useLocation();
  const { user } = useAuth();
  if (!user?.id || !location.startsWith(HOME)) return null;
  return <DutyChatNotifierInner />;
}
