/**
 * علامة «قابل للمشاركة على الحافة» لقراءات عامة يكثر طلبها من التطبيقات.
 *
 * وسيط api.sabq.org (cloudflare-worker/public-api-burst-cache.js) لا يحفظ ردًا
 * إلا إذا أعلن الأصل `X-Sabq-Public-Cache: 1` مع Cache-Control عام موجب. هذه
 * المسارات كانت بلا Cache-Control فيصل كل طلب من التطبيق إلى Render، وRender
 * يحاسب على كل GB خارج (2026-10-22). الخطاف يُركَّب قبل المسارات في
 * server/index.ts ويضع العلامة مسبقًا فقط؛ المعالج يبقى حرًّا في استبدال
 * Cache-Control (no-store عند الخطأ مثلًا) فيمتنع الحفظ تلقائيًا.
 *
 * لا علامة لطلب يحمل هوية (Authorization أو x-session-id أو كوكي الجلسة)،
 * ولا لطلب «طازج» (no-cache أو _nc أو refresh) حتى يبقى عقد freshWindowCache.
 * max-age=0 حتى لا يتغير تخزين المتصفح أو التطبيق محليًا.
 *
 * لا استيراد لـ db هنا (ADR-001).
 */
import { Router, type NextFunction, type Request, type Response } from "express";

type PublicEdgeRoute = { match: (path: string) => boolean; ttl: number };

export const PUBLIC_EDGE_CACHE_ROUTES: readonly PublicEdgeRoute[] = [
  { match: (p) => p === "/api/v1/homepage", ttl: 15 },
  { match: (p) => p === "/api/v1/news/paginated", ttl: 15 },
  { match: (p) => p === "/api/v1/live", ttl: 15 },
  { match: (p) => p === "/api/v1/articles", ttl: 15 },
  { match: (p) => p === "/api/v1/sections", ttl: 300 },
  { match: (p) => p === "/api/v1/trending", ttl: 60 },
  { match: (p) => p === "/api/homepage", ttl: 60 },
  { match: (p) => p === "/api/categories", ttl: 60 },
  { match: (p) => p === "/api/sports/competitions", ttl: 300 },
  { match: (p) => p === "/api/opinion", ttl: 60 },
  { match: (p) => /^\/api\/opinion\/related\/category\/[^/]+$/.test(p), ttl: 60 },
  { match: (p) => p === "/api/stories", ttl: 60 },
  { match: (p) => p === "/api/muqtarab/topics/featured", ttl: 60 },
  { match: (p) => p === "/api/economy/snapshot", ttl: 60 },
];

function carriesIdentity(req: Request): boolean {
  if (req.headers.authorization) return true;
  if (req.headers["x-session-id"]) return true;
  return String(req.headers.cookie || "").includes("connect.sid");
}

function wantsFresh(req: Request): boolean {
  const cc = String(req.headers["cache-control"] || "").toLowerCase();
  if (cc.includes("no-cache") || cc.includes("no-store")) return true;
  return req.query._nc !== undefined || req.query._t !== undefined || req.query.refresh !== undefined;
}

export function publicEdgeCacheTtl(req: Request): number {
  if (req.method !== "GET") return 0;
  const route = PUBLIC_EDGE_CACHE_ROUTES.find(({ match }) => match(req.path));
  if (!route || carriesIdentity(req) || wantsFresh(req)) return 0;
  return route.ttl;
}

export function markPublicEdgeCache(req: Request, res: Response, next: NextFunction): void {
  const ttl = publicEdgeCacheTtl(req);
  if (ttl > 0) {
    res.set("Cache-Control", `public, max-age=0, s-maxage=${ttl}`);
    res.set("X-Sabq-Public-Cache", "1");
  }
  next();
}

const router = Router();
router.use(markPublicEdgeCache);

export default router;
