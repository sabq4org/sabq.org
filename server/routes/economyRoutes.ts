/**
 * مسارات قسم الاقتصاد الحي — عامة (بلا مصادقة) لأنها بيانات رسمية منشورة.
 * لا تستورد db (ADR-001): كل الوصول عبر services/economy.
 */
import { Router, type Request, type Response, type Express } from "express";
import { memoryCache } from "../memoryCache";
import { getEconomySnapshotCached, getMonthlyStoryCached, getWeeklyStoryCached } from "../services/economy/economySnapshot";
import { ECONOMY_CACHE_PREFIX, registerEconomyStreamRoute } from "../services/economy/economyStream";
import { getObservationHistory, listReports } from "../services/economy/economyStore";
import { ECONOMY_INDICATOR_KEYS, fetchIndicatorSeries, type EconomyIndicatorKey } from "../services/sama/samaIndicators";
import { fetchFxHistory, fetchFxToday } from "../services/sama/samaFx";
import { getSamaWatchStatus, runSamaWatchCycle } from "../services/economy/samaWatch";
import { WATCH_SOURCES, type WatchSource } from "../services/economy/watchCadence";
import { isAuthenticated } from "../auth";
import { paginationOrReject } from "../utils/pagination";

const router = Router();

function publicCache(res: Response, seconds: number): void {
  res.setHeader("Cache-Control", `public, max-age=${seconds}, s-maxage=${seconds * 2}, stale-while-revalidate=${seconds * 5}`);
}

async function cached<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  const k = `${ECONOMY_CACHE_PREFIX}${key}`;
  const hit = memoryCache.get<T>(k);
  if (hit !== null && hit !== undefined) return hit;
  const v = await fetcher();
  memoryCache.set(k, v, ttlMs);
  return v;
}

router.get("/api/economy/snapshot", async (_req: Request, res: Response) => {
  try {
    const snap = await getEconomySnapshotCached();
    publicCache(res, 60);
    res.json(snap);
  } catch (e) {
    res.status(500).json({ message: "تعذّر جلب لقطة الاقتصاد", error: (e as Error).message });
  }
});

router.get("/api/economy/weekly-story", async (_req: Request, res: Response) => {
  try {
    const story = await getWeeklyStoryCached();
    if (!story) { res.status(404).json({ message: "لا يوجد تقرير أسبوعي بعد" }); return; }
    publicCache(res, 300);
    res.json(story);
  } catch (e) {
    res.status(500).json({ message: "تعذّر جلب قصة الأسبوع", error: (e as Error).message });
  }
});

router.get("/api/economy/monthly-story", async (_req: Request, res: Response) => {
  try {
    const story = await getMonthlyStoryCached();
    if (!story) { res.status(404).json({ message: "لا توجد نشرة شهرية بعد" }); return; }
    publicCache(res, 600);
    res.json(story);
  } catch (e) {
    res.status(500).json({ message: "تعذّر جلب قصة الشهر", error: (e as Error).message });
  }
});

router.get("/api/economy/series/:key", async (req: Request, res: Response) => {
  const key = req.params.key as EconomyIndicatorKey;
  if (!ECONOMY_INDICATOR_KEYS.includes(key)) { res.status(404).json({ message: "مؤشر غير معروف" }); return; }
  try {
    const points = await cached(`series:${key}`, 6 * 3600_000, () => fetchIndicatorSeries(key));
    publicCache(res, 3600);
    res.json({ key, points });
  } catch (e) {
    res.status(502).json({ message: "تعذّر جلب السلسلة من ساما", error: (e as Error).message });
  }
});

router.get("/api/economy/fx", async (_req: Request, res: Response) => {
  try {
    const rates = await cached("fx:all", 30 * 60_000, () => fetchFxToday());
    publicCache(res, 600);
    res.json({ asOf: rates[0]?.date ?? null, rates: rates.filter((r) => r.code !== "SAR") });
  } catch (e) {
    res.status(502).json({ message: "تعذّر جلب أسعار الصرف", error: (e as Error).message });
  }
});

router.get("/api/economy/fx/:code/history", async (req: Request, res: Response) => {
  const code = String(req.params.code).replace(/[^A-Za-z]/g, "").toUpperCase();
  const days = Math.min(3650, Math.max(7, Number(req.query.days) || 90));
  if (code.length !== 3) { res.status(400).json({ message: "رمز عملة غير صالح" }); return; }
  try {
    const points = await cached(`fx:hist:${code}:${days}`, 60 * 60_000, () => fetchFxHistory(code, days));
    publicCache(res, 1800);
    res.json({ code, points });
  } catch (e) {
    res.status(502).json({ message: "تعذّر جلب تاريخ العملة", error: (e as Error).message });
  }
});

router.get("/api/economy/reports/:kind", async (req: Request, res: Response) => {
  try {
    const pg = paginationOrReject({ query: req.query as Record<string, unknown>, path: req.path }, res, { defaultLimit: 12, maxLimit: 52 });
    if (!pg) return;
    const rows = await listReports(String(req.params.kind), pg.limit);
    publicCache(res, 300);
    res.json(rows.map((r) => ({ id: r.id, kind: r.kind, fileName: r.fileName, fileUrl: r.fileUrl, publishedAt: r.publishedAt, periodStart: r.periodStart, periodEnd: r.periodEnd })));
  } catch (e) {
    res.status(500).json({ message: "تعذّر جلب التقارير", error: (e as Error).message });
  }
});

router.get("/api/economy/observations/:source/:key", async (req: Request, res: Response) => {
  const source = String(req.params.source);
  if (!["sama_indicator", "sama_fx"].includes(source)) { res.status(404).json({ message: "مصدر غير معروف" }); return; }
  try {
    const rows = await getObservationHistory(source as "sama_indicator" | "sama_fx", String(req.params.key), 50);
    publicCache(res, 300);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ message: "تعذّر جلب السجل", error: (e as Error).message });
  }
});

// ---- إداري: حالة الرصد وتشغيل دورة يدويًا (للتجربة والتشخيص) ----
function requireStaff(req: Request, res: Response, next: () => void): void {
  const user = req.user as { role?: string | null } | undefined;
  const role = String(user?.role ?? "").toLowerCase();
  if (["admin", "superadmin", "system_admin", "system.admin", "editor", "chief_editor"].includes(role)) { next(); return; }
  res.status(403).json({ message: "غير مصرّح" });
}

router.get("/api/economy/admin/status", isAuthenticated, requireStaff, (_req: Request, res: Response) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.json(getSamaWatchStatus());
});

router.post("/api/economy/admin/refresh", isAuthenticated, requireStaff, async (req: Request, res: Response) => {
  res.setHeader("Cache-Control", "private, no-store");
  const requested = Array.isArray(req.body?.sources) ? (req.body.sources as string[]) : WATCH_SOURCES;
  const sources = requested.filter((s): s is WatchSource => (WATCH_SOURCES as string[]).includes(s));
  try {
    const r = await runSamaWatchCycle(new Date(), sources);
    res.json(r);
  } catch (e) {
    res.status(500).json({ message: "فشلت دورة الرصد", error: (e as Error).message });
  }
});

export function registerEconomyRoutes(app: Express): void {
  registerEconomyStreamRoute(app);
  app.use(router);
}
