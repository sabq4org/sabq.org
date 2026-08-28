/**
 * بثّ SSE لقسم الاقتصاد: `GET /api/economy/stream`.
 * عند أي تغيّر يرصده samaWatchJob يُنشر حدث `economy:update` عبر sseConnectionManager
 * (محليًا + Redis pub/sub لبقية النسخ) فنحوّله هنا إلى إطار SSE لكل متصفح مفتوح.
 * لا يستورد db (ADR-001).
 */
import type { Express, Request, Response } from "express";
import { canAcceptExternalSse, memoryCache, sseConnectionManager, trackExternalSse } from "../../memoryCache";

export const ECONOMY_SSE_EVENT = "economy:update";
const HEARTBEAT_MS = 25_000;
const MAX_CLIENTS = 1_500;

export interface EconomyUpdatePayload {
  /** indicator | fx | report | news */
  kind: string;
  key: string;
  value?: number | null;
  valueText?: string | null;
  previous?: number | null;
  asOf?: string | null;
  at: string;
}

const clients = new Set<Response>();
let heartbeat: ReturnType<typeof setInterval> | null = null;
let unsubscribe: (() => void) | null = null;

export const ECONOMY_CACHE_PREFIX = "economy:";

/** ينشر التغيّر لكل النسخ ويُبطل كاش لقطات الاقتصاد. */
export function publishEconomyUpdate(payload: EconomyUpdatePayload): void {
  memoryCache.invalidateByPrefix(ECONOMY_CACHE_PREFIX);
  sseConnectionManager.broadcast({ type: ECONOMY_SSE_EVENT, ...payload });
}

function writeFrame(res: Response, event: string, data: unknown): boolean {
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    return true;
  } catch {
    return false;
  }
}

function ensureLoops(): void {
  if (!heartbeat) {
    heartbeat = setInterval(() => {
      for (const res of Array.from(clients)) {
        try { res.write(": hb\n\n"); } catch { drop(res); }
      }
    }, HEARTBEAT_MS);
  }
  if (!unsubscribe) {
    unsubscribe = sseConnectionManager.onBroadcast((data) => {
      if (data.type !== ECONOMY_SSE_EVENT) return;
      for (const res of Array.from(clients)) if (!writeFrame(res, "update", data)) drop(res);
    });
  }
}

function drop(res: Response): void {
  if (clients.delete(res)) trackExternalSse(-1);
  if (clients.size === 0) {
    if (heartbeat) { clearInterval(heartbeat); heartbeat = null; }
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  }
}

export function getEconomyStreamClientCount(): number {
  return clients.size;
}

export function registerEconomyStreamRoute(app: Express): void {
  app.get("/api/economy/stream", (req: Request, res: Response) => {
    if (clients.size >= MAX_CLIENTS || !canAcceptExternalSse()) {
      res.setHeader("Retry-After", "20");
      res.status(503).end();
      return;
    }
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();
    clients.add(res);
    trackExternalSse(1);
    ensureLoops();
    writeFrame(res, "hello", { at: new Date().toISOString(), clients: clients.size });
    req.on("close", () => drop(res));
  });
}
