import { Router, type Request, type Response } from "express";
import { z } from "zod";
import Redis from "ioredis";
import { requireAuth } from "../rbac";
import { isLeader } from "../leaderElection";

const router: Router = Router();

interface PresenceEntry {
  userId: string;
  userName: string;
  userAvatar: string | null;
  articleId: string | null;
  articleTitle: string;
  articleSummary: string;
  updatedAt: number;
}

const PRESENCE_TTL_MS = 35_000;
// Safety net: expire the canonical hash key entirely if no pod touches it for
// this long. Refreshed on every HSET so an active cluster keeps the key alive.
const PRESENCE_HASH_TTL_SEC = 300;
// Leader-only sweep interval over the canonical Redis hash. Removes entries
// older than PRESENCE_TTL_MS even if no pod currently knows about that user.
const LEADER_SWEEP_INTERVAL_MS = 60_000;
const presence = new Map<string, PresenceEntry>();

interface PublishedEvent {
  articleId: string;
  articleTitle: string;
  articleSlug: string | null;
  publisherName: string;
  publishedAt: string;
}

type SseClient = {
  id: number;
  res: Response;
};

let nextClientId = 1;
const clients = new Set<SseClient>();

// ---- Redis Pub/Sub + shared state for multi-instance sync ----
const CH_PRESENCE = "editor-presence:heartbeat";
const CH_LEAVE = "editor-presence:leave";
const CH_PUBLISHED = "editor-presence:published";
// Canonical shared state (Hash: field=userId, value=JSON entry).
// Used so a freshly-started pod (or a brand new SSE client) sees ALL editors
// across the cluster immediately, without waiting up to a full heartbeat
// interval for every editor to re-broadcast.
const KEY_PRESENCE_HASH = "editor-presence:state";

const POD_ID = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

let pubClient: Redis | null = null;
let subClient: Redis | null = null;
let stateClient: Redis | null = null;
let pubsubReady = false;
let stateReady = false;

function initPubSub() {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.warn("[EditorPresence] REDIS_URL not set — running in single-pod mode (no cross-instance sync)");
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
    pubClient = new Redis(url, opts);
    subClient = new Redis(url, opts);
    // Separate connection for regular commands (HSET/HGETALL/HDEL) since the
    // subscriber connection above is in subscribe-mode and can't issue them.
    stateClient = new Redis(url, opts);

    pubClient.on("error", (err) => {
      console.error("[EditorPresence] pub redis error:", err.message);
    });
    subClient.on("error", (err) => {
      console.error("[EditorPresence] sub redis error:", err.message);
    });
    stateClient.on("error", (err) => {
      console.error("[EditorPresence] state redis error:", err.message);
    });

    stateClient.on("ready", () => {
      stateReady = true;
      // Hydrate local map from canonical Redis state on (re)connect so this
      // pod immediately knows about editors connected to other pods.
      hydrateFromRedis().catch((e) => {
        console.error("[EditorPresence] hydrate failed:", e?.message || e);
      });
    });

    subClient.on("ready", () => {
      subClient?.subscribe(CH_PRESENCE, CH_LEAVE, CH_PUBLISHED, (err) => {
        if (err) {
          console.error("[EditorPresence] subscribe failed:", err.message);
          return;
        }
        pubsubReady = true;
        console.log("[EditorPresence] ✅ Redis pub/sub ready (pod:", POD_ID, ")");
      });
    });

    subClient.on("message", (channel, raw) => {
      try {
        const msg = JSON.parse(raw);
        if (msg.podId === POD_ID) return; // ignore our own echoes

        if (channel === CH_PRESENCE && msg.entry) {
          presence.set(msg.entry.userId, msg.entry as PresenceEntry);
          broadcastLocalPresence();
        } else if (channel === CH_LEAVE && msg.userId) {
          if (presence.delete(msg.userId)) broadcastLocalPresence();
        } else if (channel === CH_PUBLISHED && msg.event) {
          broadcastLocal("article_published", msg.event);
        }
      } catch (e: any) {
        console.error("[EditorPresence] pubsub msg parse error:", e?.message);
      }
    });
  } catch (e: any) {
    console.error("[EditorPresence] pub/sub init failed:", e?.message);
    pubClient = null;
    subClient = null;
    stateClient = null;
  }
}
initPubSub();

function publishRedis(channel: string, payload: Record<string, unknown>) {
  if (!pubClient || !pubsubReady) return;
  try {
    pubClient.publish(channel, JSON.stringify({ podId: POD_ID, ...payload })).catch(() => {});
  } catch {
    // ignore
  }
}

async function hydrateFromRedis() {
  if (!stateClient || !stateReady) return;
  const all = await stateClient.hgetall(KEY_PRESENCE_HASH);
  const now = Date.now();
  let changed = false;
  const stale: string[] = [];
  for (const [userId, raw] of Object.entries(all || {})) {
    try {
      const entry = JSON.parse(raw) as PresenceEntry;
      if (!entry || typeof entry.updatedAt !== "number") continue;
      if (now - entry.updatedAt > PRESENCE_TTL_MS) {
        stale.push(userId);
        continue;
      }
      const existing = presence.get(userId);
      if (!existing || existing.updatedAt < entry.updatedAt) {
        presence.set(userId, entry);
        changed = true;
      }
    } catch {
      stale.push(userId);
    }
  }
  if (stale.length) {
    try {
      await stateClient.hdel(KEY_PRESENCE_HASH, ...stale);
    } catch {
      // ignore
    }
  }
  if (changed) broadcastLocalPresence();
}

function setSharedState(entry: PresenceEntry) {
  if (!stateClient || !stateReady) return;
  try {
    stateClient.hset(KEY_PRESENCE_HASH, entry.userId, JSON.stringify(entry)).catch(() => {});
    // Refresh the safety-net TTL on the hash key so an entirely abandoned
    // cluster (every pod gone) eventually drops the key altogether.
    stateClient.expire(KEY_PRESENCE_HASH, PRESENCE_HASH_TTL_SEC).catch(() => {});
  } catch {
    // ignore
  }
}

function deleteSharedState(userId: string) {
  if (!stateClient || !stateReady) return;
  try {
    stateClient.hdel(KEY_PRESENCE_HASH, userId).catch(() => {});
  } catch {
    // ignore
  }
}

// ---- Local (per-pod) helpers ----
function cleanupStale() {
  const now = Date.now();
  let changed = false;
  const stale: string[] = [];
  for (const [key, entry] of presence) {
    if (now - entry.updatedAt > PRESENCE_TTL_MS) {
      presence.delete(key);
      stale.push(key);
      changed = true;
    }
  }
  if (stale.length && stateClient && stateReady) {
    try {
      stateClient.hdel(KEY_PRESENCE_HASH, ...stale).catch(() => {});
    } catch {
      // ignore
    }
  }
  return changed;
}

function presenceList(): PresenceEntry[] {
  return Array.from(presence.values()).sort((a, b) => b.updatedAt - a.updatedAt);
}

function broadcastLocal(event: string, data: unknown) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    try {
      client.res.write(payload);
    } catch {
      // ignore broken pipes; cleanup happens on close
    }
  }
}

function broadcastLocalPresence() {
  broadcastLocal("presence_update", { editors: presenceList() });
}

export function broadcastArticlePublished(event: PublishedEvent) {
  // Local pod clients
  broadcastLocal("article_published", event);
  // Other pods
  publishRedis(CH_PUBLISHED, { event });
}

setInterval(() => {
  if (cleanupStale()) {
    broadcastLocalPresence();
  }
}, 10_000).unref?.();

// Periodic re-hydration so any pod that misses a pub/sub message (e.g. brief
// disconnect) eventually reconciles with canonical state.
setInterval(() => {
  hydrateFromRedis().catch(() => {});
}, 30_000).unref?.();

// Leader-only sweep over the canonical Redis hash. Even if every pod that
// originally registered an entry has disappeared (deploy / crash) before it
// could HDEL, the leader will eventually delete the stale entries here so
// new pods don't have to rely on hydrate-then-prune to reach a clean state.
async function sweepSharedStateAsLeader() {
  if (!stateClient || !stateReady) return;
  try {
    const all = await stateClient.hgetall(KEY_PRESENCE_HASH);
    const now = Date.now();
    const stale: string[] = [];
    for (const [userId, raw] of Object.entries(all || {})) {
      try {
        const entry = JSON.parse(raw) as PresenceEntry;
        if (!entry || typeof entry.updatedAt !== "number") {
          stale.push(userId);
          continue;
        }
        if (now - entry.updatedAt > PRESENCE_TTL_MS) {
          stale.push(userId);
        }
      } catch {
        stale.push(userId);
      }
    }
    if (stale.length) {
      await stateClient.hdel(KEY_PRESENCE_HASH, ...stale);
      console.log(
        `[EditorPresence] 🧹 Leader sweep removed ${stale.length} stale presence entr${stale.length === 1 ? "y" : "ies"} from Redis`,
      );
    }
  } catch (e: any) {
    console.error("[EditorPresence] leader sweep failed:", e?.message || e);
  }
}

setInterval(() => {
  if (!isLeader()) return;
  sweepSharedStateAsLeader().catch(() => {});
}, LEADER_SWEEP_INTERVAL_MS).unref?.();

const heartbeatSchema = z.object({
  articleId: z.string().nullable().optional(),
  articleTitle: z.string().max(300).optional().default(""),
  articleSummary: z.string().max(400).optional().default(""),
});

router.post("/api/editor-presence/heartbeat", requireAuth, (req: Request, res: Response) => {
  const parsed = heartbeatSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid presence payload" });
  }

  const user: any = (req as any).user;
  if (!user?.id) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const userName =
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
    (user.displayName as string | undefined)?.trim() ||
    (typeof user.email === "string" ? user.email.split("@")[0] : "") ||
    "محرر";

  const entry: PresenceEntry = {
    userId: user.id,
    userName,
    userAvatar: user.profileImageUrl || null,
    articleId: parsed.data.articleId ?? null,
    articleTitle: (parsed.data.articleTitle || "").trim(),
    articleSummary: (parsed.data.articleSummary || "").trim(),
    updatedAt: Date.now(),
  };

  presence.set(user.id, entry);
  cleanupStale();
  broadcastLocalPresence();
  setSharedState(entry);
  publishRedis(CH_PRESENCE, { entry });
  res.json({ ok: true });
});

const leaveHandler = (req: Request, res: Response) => {
  const user: any = (req as any).user;
  if (!user?.id) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  if (presence.delete(user.id)) {
    broadcastLocalPresence();
  }
  deleteSharedState(user.id);
  publishRedis(CH_LEAVE, { userId: user.id });
  res.json({ ok: true });
};

router.delete("/api/editor-presence/leave", requireAuth, leaveHandler);
// sendBeacon on page unload can only POST, so accept both.
router.post("/api/editor-presence/leave", requireAuth, leaveHandler);

router.get("/api/editor-presence/stream", requireAuth, async (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const client: SseClient = { id: nextClientId++, res };
  clients.add(client);

  // Pull the canonical state from Redis before sending the first snapshot so
  // a brand new SSE consumer sees editors connected to OTHER pods straight
  // away (instead of waiting up to ~25s for their next heartbeat).
  try {
    await hydrateFromRedis();
  } catch {
    // ignore — we'll still send whatever local state we have
  }
  cleanupStale();
  res.write(`event: presence_update\ndata: ${JSON.stringify({ editors: presenceList() })}\n\n`);

  const ping = setInterval(() => {
    try {
      res.write(`: ping\n\n`);
    } catch {
      // will be cleaned up by close handler
    }
  }, 25_000);

  req.on("close", () => {
    clearInterval(ping);
    clients.delete(client);
  });
});

export default router;
