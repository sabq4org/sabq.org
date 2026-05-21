/**
 * In-process pub/sub for realtime chat events.
 *
 * The REST routes publish events here (message:new, message:read,
 * conversation:new). The WebSocket server subscribes and pushes them to the
 * connected sockets that belong to each conversation's two participants.
 *
 * Single-instance only for now. If the backend ever scales horizontally
 * (multiple Railway/Replit instances behind a load balancer), replace this
 * with Redis Pub/Sub — the public API (publish/subscribe) stays the same so
 * call sites don't change. Hook point: getRedisClient() in server/redis.ts.
 */
import { EventEmitter } from "events";

export type ChatEvent =
  | {
      type: "message:new";
      conversationId: string;
      recipientIds: string[]; // who should be notified (both participants normally)
      payload: {
        id: string;
        conversationId: string;
        senderId: string;
        body: string;
        createdAt: string;
        attachments: Array<{
          id: string;
          kind: string;
          url: string;
          thumbnailUrl: string | null;
          width: number | null;
          height: number | null;
          mimeType: string | null;
        }>;
      };
    }
  | {
      type: "conversation:new";
      conversationId: string;
      recipientIds: string[];
      payload: any;
    }
  | {
      type: "message:read";
      conversationId: string;
      recipientIds: string[];
      payload: {
        conversationId: string;
        readerId: string;
        readAt: string;
      };
    }
  | {
      type: "presence:update";
      conversationId: string; // unused for presence — present for type uniformity
      recipientIds: string[];
      payload: {
        userId: string;
        status: "available" | "busy" | "away" | "invisible";
        online: boolean;
      };
    }
  | {
      type: "typing";
      conversationId: string;
      recipientIds: string[];
      payload: {
        conversationId: string;
        userId: string;
        isTyping: boolean;
      };
    };

class ChatBus extends EventEmitter {
  publish(event: ChatEvent) {
    this.emit("event", event);
  }

  subscribe(handler: (event: ChatEvent) => void): () => void {
    this.on("event", handler);
    return () => this.off("event", handler);
  }
}

// Bumping default max listeners — each WS connection registers one.
const bus = new ChatBus();
bus.setMaxListeners(10000);

export const chatBus = bus;
