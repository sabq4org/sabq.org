import { useEffect, useRef, useCallback } from "react";
import { useChatWebSocket } from "@/contexts/ChatWebSocketContext";

interface UseTypingIndicatorOptions {
  channelId?: string;
  debounceMs?: number;
}

export function useTypingIndicator({
  channelId,
  debounceMs = 3000,
}: UseTypingIndicatorOptions) {
  const { sendTypingStart, sendTypingStop } = useChatWebSocket();
  const typingTimeoutRef = useRef<NodeJS.Timeout>();
  const isTypingRef = useRef(false);

  const startTyping = useCallback(() => {
    if (!channelId) return;

    if (!isTypingRef.current) {
      isTypingRef.current = true;
      sendTypingStart(channelId);
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      if (isTypingRef.current) {
        isTypingRef.current = false;
        sendTypingStop(channelId);
      }
    }, debounceMs);
  }, [channelId, debounceMs, sendTypingStart, sendTypingStop]);

  const stopTyping = useCallback(() => {
    if (!channelId) return;

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    if (isTypingRef.current) {
      isTypingRef.current = false;
      sendTypingStop(channelId);
    }
  }, [channelId, sendTypingStop]);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      if (isTypingRef.current && channelId) {
        sendTypingStop(channelId);
      }
    };
  }, [channelId, sendTypingStop]);

  return {
    startTyping,
    stopTyping,
  };
}
