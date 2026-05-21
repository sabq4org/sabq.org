/**
 * Realtime chat WebSocket server.
 *
 * Mounted on the existing http.Server in server/index.ts via the "upgrade"
 * event for the path /ws/chat. We reuse the same session middleware that
 * Express uses, so a user logged in to the dashboard is authenticated on
 * the WebSocket with zero extra plumbing.
 *
 * The WS is push-only: clients SEND nothing of consequence (just an
 * occasional "ping" heartbeat). All message sending happens over REST in
 * server/routes/chat.ts — that route then publishes to chatBus, and this
 * file is what fans the event out to every interested socket.
 *
 * Per-user fan-out: a Map<userId, Set<WebSocket>> lets us push to all open
 * tabs a user has (laptop + phone, two browser windows, etc.). The REST
 * route specifies the recipientIds; we look them up here.
 */

import type { IncomingMessage, Server as HttpServer } from "http";
import type { Duplex } from "stream";
import { WebSocket, WebSocketServer } from "ws";
import { getSession } from "../auth";
import passport from "passport";
import { chatBus } from "./chatBus";

const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = 35_000;

interface AuthedWebSocket extends WebSocket {
  userId: string;
  isAlive: boolean;
  lastSeenAt: number;
}

const connectionsByUser = new Map<string, Set<AuthedWebSocket>>();

function addConnection(ws: AuthedWebSocket) {
  let set = connectionsByUser.get(ws.userId);
  if (!set) {
    set = new Set();
    connectionsByUser.set(ws.userId, set);
  }
  set.add(ws);
}

function removeConnection(ws: AuthedWebSocket) {
  const set = connectionsByUser.get(ws.userId);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) connectionsByUser.delete(ws.userId);
}

function pushToUser(userId: string, payload: unknown) {
  const set = connectionsByUser.get(userId);
  if (!set || set.size === 0) return;
  const data = JSON.stringify(payload);
  for (const ws of set) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(data);
      } catch {
        /* socket likely closing — ignore */
      }
    }
  }
}

export function isUserOnline(userId: string): boolean {
  const set = connectionsByUser.get(userId);
  return !!set && set.size > 0;
}

/**
 * Run the existing express-session + passport middleware on an upgrade
 * request just enough to populate req.user. We fake a minimal Response
 * because express-session writes Set-Cookie headers we don't actually want
 * on a WS handshake.
 */
function authenticateUpgrade(
  req: IncomingMessage,
): Promise<{ userId: string } | null> {
  return new Promise((resolve) => {
    const sessionMw = getSession();
    const passportInit = passport.initialize();
    const passportSession = passport.session();
    const fakeRes: any = {
      setHeader() {},
      getHeader() {},
      removeHeader() {},
      end() {},
      on() {},
      once() {},
      emit() {},
      writeHead() {},
      headersSent: false,
    };
    try {
      sessionMw(req as any, fakeRes, (err?: any) => {
        if (err) return resolve(null);
        passportInit(req as any, fakeRes, (err2?: any) => {
          if (err2) return resolve(null);
          passportSession(req as any, fakeRes, (err3?: any) => {
            if (err3) return resolve(null);
            const user = (req as any).user;
            if (user?.id) {
              resolve({ userId: user.id });
            } else {
              resolve(null);
            }
          });
        });
      });
    } catch {
      resolve(null);
    }
  });
}

export function attachChatWebSocketServer(server: HttpServer) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", async (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = req.url || "";
    if (!url.startsWith("/ws/chat")) {
      // Not ours — let other upgrade handlers (or the default) deal with it.
      return;
    }

    const origin = req.headers.origin || "(no-origin)";
    const hasCookie = !!req.headers.cookie;
    console.log(`[chat-ws] upgrade attempt origin=${origin} hasCookie=${hasCookie}`);

    const auth = await authenticateUpgrade(req);
    if (!auth) {
      console.warn(`[chat-ws] upgrade REJECTED (no auth) origin=${origin} hasCookie=${hasCookie}`);
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      const aws = ws as AuthedWebSocket;
      aws.userId = auth.userId;
      aws.isAlive = true;
      aws.lastSeenAt = Date.now();
      addConnection(aws);
      console.log(`[chat-ws] connected userId=${auth.userId} total=${connectionsByUser.size}`);

      aws.send(
        JSON.stringify({
          type: "ready",
          userId: auth.userId,
          serverTime: new Date().toISOString(),
        }),
      );

      aws.on("message", (raw) => {
        aws.isAlive = true;
        aws.lastSeenAt = Date.now();
        let parsed: any;
        try {
          parsed = JSON.parse(raw.toString());
        } catch {
          return;
        }
        if (parsed?.type === "ping") {
          try { aws.send(JSON.stringify({ type: "pong" })); } catch {}
        }
        // No other inbound message types in Phase 1. Send via REST.
      });

      aws.on("pong", () => {
        aws.isAlive = true;
        aws.lastSeenAt = Date.now();
      });

      aws.on("close", () => {
        removeConnection(aws);
        console.log(`[chat-ws] disconnected userId=${aws.userId} remaining=${connectionsByUser.size}`);
      });

      aws.on("error", (err) => {
        console.warn(`[chat-ws] socket error userId=${aws.userId} err=${(err as any)?.message || err}`);
        try { aws.terminate(); } catch {}
        removeConnection(aws);
      });
    });
  });

  // Liveness check: every 30s ping every socket; if a socket failed to
  // pong since the last interval, terminate it. This catches half-open
  // connections (laptop closed mid-call, NAT timeout, etc.).
  const heartbeat = setInterval(() => {
    const now = Date.now();
    for (const set of connectionsByUser.values()) {
      for (const ws of set) {
        if (!ws.isAlive || now - ws.lastSeenAt > HEARTBEAT_TIMEOUT_MS) {
          try { ws.terminate(); } catch {}
          continue;
        }
        ws.isAlive = false;
        try { ws.ping(); } catch {}
      }
    }
  }, HEARTBEAT_INTERVAL_MS);

  wss.on("close", () => clearInterval(heartbeat));

  // Bridge: turn chat events into WebSocket pushes.
  chatBus.subscribe((event) => {
    const envelope = {
      type: event.type,
      conversationId: event.conversationId,
      payload: event.payload,
    };
    for (const userId of event.recipientIds) {
      pushToUser(userId, envelope);
    }
  });

  console.log("[chat-ws] WebSocket server attached at /ws/chat");
  return wss;
}
