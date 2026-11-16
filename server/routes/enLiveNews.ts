// «Moment by Moment» الإنجليزية: GET /api/en/live/updates و GET /api/en/live/breaking.
// نظير server/routes/liveNews.ts بنفس الكاش: Cache-Control 30s/60s للتحديثات،
// و SWR في الذاكرة (15s طازج / 30s قديم) لمسار الاستطلاع الساخن بلا cursor.
import { Router } from "express";
import { cacheControl } from "../cacheMiddleware";
import { withSWR } from "../memoryCache";
import { paginationOrReject } from "../utils/pagination";
import { fetchEnLiveBreaking, fetchEnLiveUpdates } from "../services/enLiveNewsService";
import { parseEnLiveCategory, parseEnLiveCursor } from "../services/enLiveNewsFormat";

const router: Router = Router();

router.get("/api/en/live/updates", cacheControl({ maxAge: 30, staleWhileRevalidate: 60 }), async (req, res) => {
  try {
    const pg = paginationOrReject({ query: req.query as Record<string, unknown>, path: req.path }, res, { defaultLimit: 20, maxLimit: 20 });
    if (!pg) return;
    const cursor = parseEnLiveCursor(req.query.cursor);
    if (!cursor.ok) {
      res.status(400).json({ message: "Invalid cursor" });
      return;
    }
    const category = parseEnLiveCategory(req.query.category);
    if (!category.ok) {
      res.status(400).json({ message: "Invalid category" });
      return;
    }
    const filter = req.query.filter === "breaking" ? "breaking" : undefined;
    const opts = { limit: pg.limit, cursor: cursor.cursor, filter, categoryId: category.categoryId };

    // مفاتيح محدودة فقط في الكاش: بلا cursor وبلا تصنيف (كما في العربي).
    if (!opts.cursor && !opts.categoryId) {
      const payload = await withSWR(`en-live-updates:${filter || "all"}:${pg.limit}`, 15_000, 30_000, () =>
        fetchEnLiveUpdates(opts),
      );
      res.json(payload);
      return;
    }
    res.json(await fetchEnLiveUpdates(opts));
  } catch (error) {
    console.error("Error fetching English live updates:", error);
    res.status(500).json({ message: "Failed to fetch live updates" });
  }
});

router.get("/api/en/live/breaking", async (_req, res) => {
  try {
    res.json(await fetchEnLiveBreaking());
  } catch (error) {
    console.error("Error fetching English breaking news:", error);
    res.status(500).json({ message: "Failed to fetch breaking news" });
  }
});

export default router;
