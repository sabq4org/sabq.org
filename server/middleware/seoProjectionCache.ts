import type { Request, RequestHandler, Response } from "express";
import { MemoryCache } from "../memoryCache";
import { getSeoCacheGeneration } from "../services/seoCacheInvalidation";

const MAX_ENTRIES = 300;
const TTL_MS = 60_000;
const cache = new MemoryCache(MAX_ENTRIES, "seoProjectionCache");
type Projection = { status: number; body: unknown; cacheControl: string };
type Flight = Promise<Projection>;
const inflight = new Map<string, Flight>();

function routeKey(req: Request, generation: number): string {
  const query = new URLSearchParams();
  for (const key of ["lang", "limit", "page"].filter(key => key in req.query)) {
    const value = req.query[key];
    if (Array.isArray(value)) value.forEach((v) => query.append(key, String(v)));
    else if (value != null) query.set(key, String(value));
  }
  return `seo:${generation}:${req.path}${query.toString() ? `?${query}` : ""}`;
}

function unavailable(res: Response): void {
  if (res.headersSent) return;
  res
    .status(503)
    .set({
      "Cache-Control": "private, no-store, no-cache, max-age=0",
      "CDN-Cache-Control": "no-store",
      "Retry-After": "60",
    })
    .json({ error: "seo_projection_temporarily_unavailable" });
}

function replay(res: Response, projection: Projection): void {
  res.set("Cache-Control", projection.cacheControl).status(projection.status).json(projection.body);
}

/**
 * Bounded cache/single-flight middleware for the public SEO projection routes.
 * Mount immediately before each route; it intentionally does not catch
 * arbitrary JSON endpoints or authenticated requests.
 */
export const seoProjectionCacheMiddleware: RequestHandler = (req, res, next) => {
  if (
    req.method !== "GET" ||
    !(/^\/api\/(?:articles|categories)\/[^/]+\/seo-bundle$/.test(req.path) || req.path === "/api/edge/home-bundle")
  ) {
    return next();
  }

  const generation = getSeoCacheGeneration();
  const key = routeKey(req, generation);
  const cached = cache.get<Projection>(key);
  if (cached) return replay(res, cached);

  const existing = inflight.get(key);
  if (existing) {
    void existing.then((projection) => {
      if (getSeoCacheGeneration() !== generation) return unavailable(res);
      replay(res, projection);
    }).catch(() => unavailable(res));
    return;
  }

  let settled = false;
  let resolveFlight!: (projection: Projection) => void;
  let rejectFlight!: (error: unknown) => void;
  const flight: Flight = new Promise<Projection>((resolve, reject) => {
    resolveFlight = resolve;
    rejectFlight = reject;
  });
  // A leader has no follower awaiting this promise. Always attach a rejection
  // handler so an invalidation cannot create an unhandled rejection.
  void flight.catch(() => undefined);
  inflight.set(key, flight);

  const originalJson = res.json.bind(res);
  const sendLeaderUnavailable = () => {
    if (res.headersSent) return;
    res
      .status(503)
      .set({
        "Cache-Control": "private, no-store, no-cache, max-age=0",
        "CDN-Cache-Control": "no-store",
        "Retry-After": "60",
      });
    originalJson({ error: "seo_projection_temporarily_unavailable" });
  };
  res.json = ((body: unknown) => {
    if (settled) return res;
    settled = true;
    const cacheControl = res.statusCode === 200 ? "public, max-age=0, s-maxage=60" : "private, no-store";
    res.set("Cache-Control", cacheControl);
    const projection = { status: res.statusCode, body, cacheControl };
    inflight.delete(key);
    if (getSeoCacheGeneration() !== generation) {
      rejectFlight(new Error("seo-projection-invalidated"));
      sendLeaderUnavailable();
      return res;
    }
    if (projection.status >= 200 && projection.status < 300) cache.set(key, projection, TTL_MS);
    resolveFlight(projection);
    return originalJson(body);
  }) as Response["json"];

  const release = () => {
    if (settled) return;
    settled = true;
    inflight.delete(key);
    rejectFlight(new Error("seo-projection-request-closed"));
  };
  res.once("close", release);
  res.once("finish", release);
  try {
    return next();
  } catch (error) {
    release();
    throw error;
  }
};
