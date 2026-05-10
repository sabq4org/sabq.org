import { useState, useRef } from "react";

/**
 * Hook للانتقال لرسالة محددة مع تأثير التمييز
 */
export function useMessageScroll() {
  const [targetMessageId, setTargetMessageId] = useState<string | null>(null);
  const messagesRef = useRef<Map<string, HTMLDivElement>>(new Map());
  
  const scrollToMessage = (messageId: string) => {
    const element = messagesRef.current.get(messageId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.classList.add('highlight-message');
      setTimeout(() => {
        element.classList.remove('highlight-message');
      }, 2000);
    }
    setTargetMessageId(messageId);
  };
  
  const registerMessage = (messageId: string, element: HTMLDivElement | null) => {
    if (element) {
      messagesRef.current.set(messageId, element);
    } else {
      messagesRef.current.delete(messageId);
    }
  };
  
  return { scrollToMessage, registerMessage, targetMessageId };
}
