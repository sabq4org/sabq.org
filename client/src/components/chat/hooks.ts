/**
 * Hooks that wire chat REST + WebSocket events into the TanStack Query cache.
 *
 * The big idea: REST primes the cache; the WebSocket pushes mutations into
 * the same cache keys. No polling, no manual refetch — components just
 * useChatConversations() / useChatMessages() and get realtime updates.
 */
import { useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { chatSocket } from "@/lib/chatSocket";
import type { ChatConversationSummary, ChatMessage, ChatStaffUser } from "./types";

const CONVERSATIONS_KEY = ["/api/chat/conversations"] as const;
const MESSAGES_KEY = (conversationId: string) => [
  "/api/chat/conversations",
  conversationId,
  "messages",
] as const;

export function useChatConversations(options: { enabled?: boolean } = {}) {
  return useQuery<{ conversations: ChatConversationSummary[] }>({
    queryKey: CONVERSATIONS_KEY,
    queryFn: () => apiRequest("/api/chat/conversations"),
    enabled: options.enabled ?? true,
    staleTime: 30_000,
  });
}

export function useChatMessages(conversationId: string | null) {
  return useQuery<{ messages: ChatMessage[]; hasMore: boolean }>({
    queryKey: conversationId ? MESSAGES_KEY(conversationId) : ["chat", "messages", "none"],
    queryFn: () =>
      apiRequest(
        `/api/chat/conversations/${encodeURIComponent(conversationId!)}/messages?limit=50`,
      ),
    enabled: !!conversationId,
    staleTime: 10_000,
  });
}

export function useChatStaffSearch(query: string, options: { enabled?: boolean } = {}) {
  const q = query.trim();
  return useQuery<{ staff: ChatStaffUser[] }>({
    queryKey: ["/api/chat/staff", q],
    queryFn: () =>
      apiRequest(`/api/chat/staff${q ? `?q=${encodeURIComponent(q)}` : ""}`),
    enabled: options.enabled ?? true,
    staleTime: 30_000,
  });
}

/**
 * Sit on the WebSocket once and reflect every event into TanStack caches.
 * Mount this exactly ONCE per page (we do it in the chat page + floating
 * widget guards itself with the same trick).
 */
export function useChatRealtimeBridge(currentUserId: string | undefined) {
  const qc = useQueryClient();
  const userRef = useRef(currentUserId);
  useEffect(() => {
    userRef.current = currentUserId;
  }, [currentUserId]);

  useEffect(() => {
    if (!currentUserId) return;
    const unsubscribe = chatSocket.subscribe((event) => {
      if (event.type === "message:new") {
        const incoming = event.payload;
        const conversationId = event.conversationId;

        // 1) Splice into messages cache (dedupe by id AND clientId — the
        //    sender already has an optimistic copy with the same clientId).
        qc.setQueryData<{ messages: ChatMessage[]; hasMore: boolean } | undefined>(
          MESSAGES_KEY(conversationId),
          (old) => {
            if (!old) return old;
            const idx = old.messages.findIndex(
              (m) => m.id === incoming.id || (incoming.clientId && m.clientId === incoming.clientId),
            );
            if (idx >= 0) {
              const next = old.messages.slice();
              next[idx] = { ...incoming, pending: false };
              return { ...old, messages: next };
            }
            return { ...old, messages: [...old.messages, { ...incoming, pending: false }] };
          },
        );

        // 2) Update conversation summary (preview + unread).
        qc.setQueryData<{ conversations: ChatConversationSummary[] } | undefined>(
          CONVERSATIONS_KEY,
          (old) => {
            if (!old) return old;
            const me = userRef.current;
            const idx = old.conversations.findIndex((c) => c.id === conversationId);
            const previewBody =
              incoming.body
                || (incoming.attachments.length === 1
                  ? "📷 صورة"
                  : incoming.attachments.length > 1
                    ? `📷 ${incoming.attachments.length} صور`
                    : "");
            if (idx === -1) {
              // Unknown conversation — refetch list rather than guess.
              qc.invalidateQueries({ queryKey: CONVERSATIONS_KEY });
              return old;
            }
            const updated: ChatConversationSummary = {
              ...old.conversations[idx],
              lastMessagePreview: previewBody.slice(0, 160),
              lastMessageAt: incoming.createdAt,
              hasUnread: incoming.senderId !== me,
            };
            const rest = old.conversations.filter((_, i) => i !== idx);
            return { conversations: [updated, ...rest] };
          },
        );
      } else if (event.type === "message:read") {
        qc.setQueryData<{ conversations: ChatConversationSummary[] } | undefined>(
          CONVERSATIONS_KEY,
          (old) => {
            if (!old) return old;
            const idx = old.conversations.findIndex((c) => c.id === event.conversationId);
            if (idx === -1) return old;
            // For the *other* party, their read doesn't change my unread flag.
            // Phase 2 will surface ✓✓ here.
            return old;
          },
        );
      } else if (event.type === "conversation:new") {
        qc.invalidateQueries({ queryKey: CONVERSATIONS_KEY });
      }
    });
    return unsubscribe;
  }, [qc, currentUserId]);
}

/**
 * Convenience helper for components: prepend an optimistic message to the
 * cache while POST is in flight. Returns a "rollback" callback in case the
 * request fails.
 */
export function appendOptimisticMessage(message: ChatMessage) {
  queryClient.setQueryData<{ messages: ChatMessage[]; hasMore: boolean } | undefined>(
    MESSAGES_KEY(message.conversationId),
    (old) => {
      if (!old) return { messages: [message], hasMore: false };
      return { ...old, messages: [...old.messages, message] };
    },
  );
  return () => {
    queryClient.setQueryData<{ messages: ChatMessage[]; hasMore: boolean } | undefined>(
      MESSAGES_KEY(message.conversationId),
      (old) => {
        if (!old) return old;
        return {
          ...old,
          messages: old.messages.filter((m) => m.clientId !== message.clientId),
        };
      },
    );
  };
}

export function chatMessagesQueryKey(conversationId: string) {
  return MESSAGES_KEY(conversationId);
}

export function chatConversationsQueryKey() {
  return CONVERSATIONS_KEY;
}

/**
 * Total unread count across all conversations — drives the badge on the
 * sidebar item and the floating widget. Pass enabled=false for users who
 * don't have chat.use so we don't fire 403s from the homepage.
 */
export function useChatUnreadCount(enabled: boolean = true) {
  const { data } = useChatConversations({ enabled });
  return useMemo(() => {
    const list = Array.isArray(data?.conversations) ? data!.conversations : [];
    return list.filter((c) => c.hasUnread).length;
  }, [data]);
}
