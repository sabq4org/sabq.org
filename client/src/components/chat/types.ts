/**
 * Shared types for the realtime chat UI. Mirrors what the REST routes in
 * server/routes/chat.ts return — kept narrow on purpose.
 */
export interface ChatStaffUser {
  id: string;
  name: string;
  avatarUrl: string | null;
  role: string | null;
  online: boolean;
}

export interface ChatConversationSummary {
  id: string;
  otherUser: ChatStaffUser;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  hasUnread: boolean;
  createdAt: string;
}

export interface ChatAttachment {
  id: string;
  kind: string;
  url: string;
  thumbnailUrl: string | null;
  width: number | null;
  height: number | null;
  mimeType: string | null;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
  editedAt?: string | null;
  clientId?: string;
  attachments: ChatAttachment[];
  // UI-only flag set on optimistic appends; cleared once the server echoes back.
  pending?: boolean;
}
