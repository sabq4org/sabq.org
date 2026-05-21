/**
 * Singleton WebSocket client for the realtime chat.
 *
 * - Auto-connects on first subscribe(); auto-disconnects when listeners drop
 *   to zero (so the floating widget can mount/unmount without leaking
 *   connections).
 * - Exponential backoff reconnect (1s → 2s → 4s → 8s → 15s capped).
 * - Heartbeat ping every 25s; if no pong/event for 60s, force-reconnect.
 * - Uses VITE_API_URL when DIRECT mode is configured; otherwise falls back
 *   to the same origin as the page (works through Vercel rewrites only if
 *   the rewrite config forwards /ws/chat — for the experimental split
 *   topology, set VITE_API_URL to the Railway origin and the WS connects
 *   to wss://api.sabq.org/ws/chat).
 */

export type ChatMessageAttachmentPayload = {
  id: string;
  kind: string;
  url: string;
  thumbnailUrl: string | null;
  width: number | null;
  height: number | null;
  mimeType: string | null;
};

export type ChatMessagePayload = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
  clientId?: string;
  attachments: ChatMessageAttachmentPayload[];
};

export type ChatReadPayload = {
  conversationId: string;
  readerId: string;
  readAt: string;
};

export type ChatNewConversationPayload = {
  id: string;
  otherUserId: string;
};

export type ChatPresencePayload = {
  userId: string;
  status: "available" | "busy" | "away" | "invisible";
  online: boolean;
};

export type ChatTypingPayload = {
  conversationId: string;
  userId: string;
  isTyping: boolean;
};

export type ChatSocketEvent =
  | { type: "ready"; userId: string; serverTime: string }
  | { type: "message:new"; conversationId: string; payload: ChatMessagePayload }
  | { type: "message:read"; conversationId: string; payload: ChatReadPayload }
  | { type: "conversation:new"; conversationId: string; payload: ChatNewConversationPayload }
  | { type: "presence:update"; conversationId: string; payload: ChatPresencePayload }
  | { type: "typing"; conversationId: string; payload: ChatTypingPayload }
  | { type: "pong" };

type Listener = (event: ChatSocketEvent) => void;

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 15000];
const HEARTBEAT_INTERVAL_MS = 25_000;
const STALE_TIMEOUT_MS = 60_000;

class ChatSocketClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private reconnectAttempts = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private staleCheckTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSeenAt = 0;
  private closedByUs = false;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    if (this.listeners.size === 1) {
      this.connect();
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.disconnect();
      }
    };
  }

  send(message: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(message));
      } catch {
        /* socket closing — ignore */
      }
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private buildUrl(): string {
    // Vercel does NOT proxy WebSocket through rewrites — even though
    // vercel.json forwards /api/* to api.sabq.org, /ws/chat would 404 on
    // a same-origin connect attempt. So we always target the API origin
    // directly. Priority order:
    //   1. Explicit VITE_WS_URL (best — operator overrides everything)
    //   2. VITE_API_URL converted to wss://
    //   3. Hardcoded fallback for the two known production hosts
    //   4. Same-origin (works in local dev where Express serves both)
    const explicitWs = (import.meta.env.VITE_WS_URL || "").trim();
    if (explicitWs) {
      return explicitWs.replace(/\/+$/, "") + "/ws/chat";
    }

    const apiBase = (import.meta.env.VITE_API_URL || "").trim();
    if (apiBase) {
      return apiBase.replace(/^http/, "ws").replace(/\/+$/, "") + "/ws/chat";
    }

    if (typeof window !== "undefined") {
      const host = window.location.host;
      if (host === "sabq.org" || host === "www.sabq.org") {
        return "wss://api.sabq.org/ws/chat";
      }
      if (host === "sabq.news" || host === "www.sabq.news") {
        return "wss://api.sabq.news/ws/chat";
      }
    }

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}/ws/chat`;
  }

  private connect() {
    this.closedByUs = false;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    try {
      this.ws = new WebSocket(this.buildUrl());
    } catch (err) {
      console.error("[chat-ws] Failed to construct WebSocket:", err);
      this.scheduleReconnect();
      return;
    }
    this.lastSeenAt = Date.now();

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.lastSeenAt = Date.now();
      this.startHeartbeat();
    };

    this.ws.onmessage = (ev) => {
      this.lastSeenAt = Date.now();
      let parsed: ChatSocketEvent;
      try {
        parsed = JSON.parse(typeof ev.data === "string" ? ev.data : "");
      } catch {
        return;
      }
      if (parsed.type === "pong") return;
      for (const l of this.listeners) {
        try { l(parsed); } catch (err) { console.error("[chat-ws] listener error:", err); }
      }
    };

    this.ws.onclose = () => {
      this.stopHeartbeat();
      this.ws = null;
      if (!this.closedByUs && this.listeners.size > 0) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      // Silent — onclose handles the reconnect.
    };
  }

  private disconnect() {
    this.closedByUs = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
    this.reconnectAttempts = 0;
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const delay = RECONNECT_DELAYS[Math.min(this.reconnectAttempts, RECONNECT_DELAYS.length - 1)];
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.listeners.size > 0 && !this.closedByUs) {
        this.connect();
      }
    }, delay);
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.send({ type: "ping" });
    }, HEARTBEAT_INTERVAL_MS);
    this.staleCheckTimer = setInterval(() => {
      if (Date.now() - this.lastSeenAt > STALE_TIMEOUT_MS) {
        // Connection looks dead — force a reconnect.
        try { this.ws?.close(); } catch {}
      }
    }, 10_000);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.staleCheckTimer) {
      clearInterval(this.staleCheckTimer);
      this.staleCheckTimer = null;
    }
  }
}

export const chatSocket = new ChatSocketClient();
