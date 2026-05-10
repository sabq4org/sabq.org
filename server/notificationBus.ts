// In-memory + Redis-backed event bus for Server-Sent Events (SSE)
// This allows real-time notifications to be pushed to connected clients
// regardless of which pod they're connected to in a multi-pod deployment.

import Redis from 'ioredis';

const NOTIFICATION_BUS_CHANNEL = 'notification-bus:emit';
const NOTIFICATION_BUS_POD_ID = `${process.pid}-${Date.now()}-${Math.random()
  .toString(36)
  .slice(2, 7)}`;

let _busPub: Redis | null = null;
let _busSub: Redis | null = null;
let _busPubReady = false;

type NotificationPayload = unknown;

interface NotificationBusEnvelope {
  podId: string;
  userId: string;
  notification: NotificationPayload;
}

function isNotificationBusEnvelope(value: unknown): value is NotificationBusEnvelope {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.podId === 'string' && typeof v.userId === 'string';
}

class NotificationBus {
  private listeners: Map<string, Set<Function>> = new Map();

  /**
   * Subscribe to notifications for a specific user
   */
  subscribe(userId: string, callback: Function) {
    if (!this.listeners.has(userId)) {
      this.listeners.set(userId, new Set());
    }
    this.listeners.get(userId)!.add(callback);
    console.log(`📡 User ${userId} subscribed to notification stream`);
  }

  /**
   * Unsubscribe from notifications
   */
  unsubscribe(userId: string, callback: Function) {
    const userListeners = this.listeners.get(userId);
    if (userListeners) {
      userListeners.delete(callback);
      if (userListeners.size === 0) {
        this.listeners.delete(userId);
      }
      console.log(`📡 User ${userId} unsubscribed from notification stream`);
    }
  }

  /**
   * Emit a notification to a specific user. Delivers locally **and** publishes
   * to Redis so other pods can deliver to their own subscribed clients.
   *
   * Note: `notification` is intentionally `unknown` because callers across the
   * codebase pass varied shapes; subscribers narrow the type at consumption.
   */
  emit(userId: string, notification: NotificationPayload) {
    this._deliverLocally(userId, notification);
    this._publishToRedis(userId, notification);
  }

  /** @internal — used by the Redis subscriber when a remote pod emits. */
  _deliverLocally(userId: string, notification: NotificationPayload) {
    const userListeners = this.listeners.get(userId);
    if (userListeners && userListeners.size > 0) {
      console.log(`📡 Broadcasting notification to ${userListeners.size} client(s) for user ${userId}`);
      userListeners.forEach(cb => {
        try {
          cb(notification);
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error);
          console.error(`Error broadcasting to client:`, msg);
        }
      });
    }
  }

  private _publishToRedis(userId: string, notification: NotificationPayload) {
    if (!_busPub || !_busPubReady) return;
    try {
      _busPub
        .publish(
          NOTIFICATION_BUS_CHANNEL,
          JSON.stringify({ podId: NOTIFICATION_BUS_POD_ID, userId, notification }),
        )
        .catch(() => {});
    } catch {
      // best-effort
    }
  }

  /**
   * Get count of active connections for a user
   */
  getConnectionCount(userId: string): number {
    return this.listeners.get(userId)?.size || 0;
  }

  /**
   * Get total active connections
   */
  getTotalConnections(): number {
    let total = 0;
    this.listeners.forEach(listeners => {
      total += listeners.size;
    });
    return total;
  }
}

export const notificationBus = new NotificationBus();

// Initialise the cross-pod publisher/subscriber. Mirrors the editorPresence /
// contentInvalidation pattern: separate connections, self-echo guard via
// NOTIFICATION_BUS_POD_ID, best-effort with REDIS_URL absent.
(function initNotificationBusPubSub() {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.warn(
      '[NotificationBus] REDIS_URL not set — running in single-pod mode (notifications will not cross instances)',
    );
    return;
  }
  try {
    const opts = {
      maxRetriesPerRequest: 3,
      retryStrategy(times: number) {
        if (times > 5) return null;
        return Math.min(times * 200, 2000);
      },
      enableReadyCheck: false,
      connectTimeout: 5000,
      lazyConnect: false,
    };
    _busPub = new Redis(url, opts);
    _busSub = new Redis(url, opts);

    _busPub.on('error', (err) => {
      console.error('[NotificationBus] pub redis error:', err.message);
    });
    _busSub.on('error', (err) => {
      console.error('[NotificationBus] sub redis error:', err.message);
    });

    _busPub.on('ready', () => {
      _busPubReady = true;
    });

    _busSub.on('ready', () => {
      _busSub?.subscribe(NOTIFICATION_BUS_CHANNEL, (err) => {
        if (err) {
          console.error('[NotificationBus] subscribe failed:', err.message);
          return;
        }
        console.log(
          '[NotificationBus] ✅ Redis pub/sub ready (pod:',
          NOTIFICATION_BUS_POD_ID,
          ')',
        );
      });
    });

    _busSub.on('message', (channel, raw) => {
      if (channel !== NOTIFICATION_BUS_CHANNEL) return;
      try {
        const parsed: unknown = JSON.parse(raw);
        if (!isNotificationBusEnvelope(parsed)) return;
        if (parsed.podId === NOTIFICATION_BUS_POD_ID) return; // ignore our own echoes
        notificationBus._deliverLocally(parsed.userId, parsed.notification);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[NotificationBus] pubsub msg parse error:', msg);
      }
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[NotificationBus] pub/sub init failed:', msg);
    _busPub = null;
    _busSub = null;
  }
})();
