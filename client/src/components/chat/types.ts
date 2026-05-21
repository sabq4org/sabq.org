/**
 * Shared types for the realtime chat UI. Mirrors what the REST routes in
 * server/routes/chat.ts return — kept narrow on purpose.
 */
export type PresenceStatus = "available" | "busy" | "away" | "invisible";

export interface ChatStaffUser {
  id: string;
  name: string;
  avatarUrl: string | null;
  role: string | null;
  online: boolean;
  status: PresenceStatus; // user-chosen status, defaults to "available"
}

export interface ChatConversationSummary {
  id: string;
  otherUser: ChatStaffUser;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  hasUnread: boolean;
  // Used to render the partner's "read up to here" mark on my outgoing bubbles.
  // Iso timestamp of the partner's last `read` action — anything I sent before
  // this is considered read.
  partnerLastReadAt: string | null;
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
  // UI-only flag derived from conversation.partnerLastReadAt — true if my
  // outgoing message has been read by the recipient.
  readByOther?: boolean;
}
