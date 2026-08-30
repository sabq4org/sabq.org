// مسارات الويب للمنصة المركزية للتوقعات — /api/predictions/* مع جلسات
// Passport. HTTP فقط (ADR-001): كل المنطق في خدمة النواة، والعقود في
// shared/predictions.ts — نفس معاني الحقول في مسارات الموبايل.

import { Router, type Request, type Response } from "express";
import { requireAuth } from "../rbac";
import {
  getCompetitionBySlug,
  getContest,
  getContestSettlement,
  getHomepagePromoFeed,
  getLeaderboard,
  getUserEntries,
  getUserLedger,
  getUserPoints,
  isPredictionCoreEnabled,
  listActiveCompetitions,
  listContests,
  PredictionError,
  upsertEntry,
  withdrawEntry,
} from "../services/predictions/predictionCoreService";
import { PREDICTION_ERROR_CODES } from "@shared/predictions";
import { parseLimit, paginationOrReject } from "../utils/pagination";

const router = Router();

function webUserId(req: Request): string | undefined {
  return req.isAuthenticated?.() && (req as any).user ? (req as any).user.id : undefined;
}

function handleError(res: Response, error: unknown): void {
  if (error instanceof PredictionError) {
    res.status(error.httpStatus).json({ error: error.code });
    return;
  }
  console.error("[Predictions Web]", error);
  res.status(500).json({ error: "INTERNAL_ERROR" });
}

function requireEnabled(res: Response): boolean {
  if (!isPredictionCoreEnabled()) {
    res.status(503).json({ error: PREDICTION_ERROR_CODES.COMPETITION_DISABLED });
    return false;
  }
  return true;
}

router.get("/api/predictions/competitions", async (req, res) => {
  if (!requireEnabled(res)) return;
  try {
    res.json({ competitions: await listActiveCompetitions(webUserId(req)) });
  } catch (error) {
    handleError(res, error);
  }
});

/** إعلانات نصية دوّارة تحت الأخبار البارزة — عامة، خفيفة، بلا جلسة. */
router.get("/api/predictions/promo-feed", async (req, res) => {
  if (!requireEnabled(res)) return;
  try {
    const pg = paginationOrReject({ query: req.query as Record<string, unknown>, path: req.path }, res, { defaultLimit: 8, maxLimit: 50 });
    if (!pg) return;
    const payload = await getHomepagePromoFeed(
      req.query.limit ? pg.limit : undefined,
    );
    res.setHeader("Cache-Control", "public, max-age=60, s-maxage=120, stale-while-revalidate=300");
    res.json(payload);
  } catch (error) {
    handleError(res, error);
  }
});

router.get("/api/predictions/competitions/:slug", async (req, res) => {
  if (!requireEnabled(res)) return;
  try {
    res.json(await getCompetitionBySlug(req.params.slug, webUserId(req)));
  } catch (error) {
    handleError(res, error);
  }
});

router.get("/api/predictions/contests", async (req, res) => {
  if (!requireEnabled(res)) return;
  try {
    const contests = await listContests({
      competitionSlug: typeof req.query.competition === "string" ? req.query.competition : undefined,
      status: typeof req.query.status === "string" ? req.query.status : undefined,
      contestType: typeof req.query.type === "string" ? req.query.type : undefined,
      userId: webUserId(req),
    });
    res.json({ contests });
  } catch (error) {
    handleError(res, error);
  }
});

router.get("/api/predictions/contests/:id", async (req, res) => {
  if (!requireEnabled(res)) return;
  try {
    res.json(await getContest(req.params.id, webUserId(req)));
  } catch (error) {
    handleError(res, error);
  }
});

router.put("/api/predictions/contests/:id/entry", requireAuth, async (req: any, res) => {
  try {
    const entry = await upsertEntry({
      contestId: req.params.id,
      userId: req.user.id,
      payload: req.body?.prediction,
      platform: "web",
    });
    res.json({ entry });
  } catch (error) {
    handleError(res, error);
  }
});

router.delete("/api/predictions/contests/:id/entry", requireAuth, async (req: any, res) => {
  try {
    await withdrawEntry(req.params.id, req.user.id);
    res.json({ withdrawn: true });
  } catch (error) {
    handleError(res, error);
  }
});

router.get("/api/predictions/me/points", requireAuth, async (req: any, res) => {
  try {
    const competition = typeof req.query.competition === "string" ? req.query.competition : undefined;
    res.json(await getUserPoints(req.user.id, competition));
  } catch (error) {
    handleError(res, error);
  }
});

router.get("/api/predictions/me/ledger", requireAuth, async (req: any, res) => {
  try {
    res.json(await getUserLedger(req.user.id, {
      competitionSlug: typeof req.query.competition === "string" ? req.query.competition : undefined,
      cursor: typeof req.query.cursor === "string" ? req.query.cursor : undefined,
      limit: req.query.limit ? parseLimit(req.query.limit, 20, 50) : undefined,
    }));
  } catch (error) {
    handleError(res, error);
  }
});

// «توقعاتي» — تاريخ توقعات المستخدم كاملًا مع النتائج والجوائز (لا يقتطع كتفاصيل البطولة)
router.get("/api/predictions/me/entries", requireAuth, async (req: any, res) => {
  try {
    res.json(await getUserEntries(req.user.id, {
      competitionSlug: typeof req.query.competition === "string" ? req.query.competition : undefined,
      cursor: typeof req.query.cursor === "string" ? req.query.cursor : undefined,
      limit: req.query.limit ? parseLimit(req.query.limit, 30, 100) : undefined,
    }));
  } catch (error) {
    handleError(res, error);
  }
});

router.get("/api/predictions/leaderboards", async (req, res) => {
  if (!requireEnabled(res)) return;
  try {
    const competitionSlug = typeof req.query.competition === "string" ? req.query.competition : "";
    if (!competitionSlug) {
      res.status(400).json({ error: PREDICTION_ERROR_CODES.CONTEST_NOT_FOUND });
      return;
    }
    const pg = paginationOrReject({ query: req.query as Record<string, unknown>, path: req.path }, res, { defaultLimit: 50, maxLimit: 100 });
    if (!pg) return;
    res.json(await getLeaderboard({
      competitionSlug,
      userId: webUserId(req),
      offset: pg.offset,
      limit: req.query.limit ? pg.limit : undefined,
    }));
  } catch (error) {
    handleError(res, error);
  }
});

router.get("/api/predictions/contests/:id/settlement", async (req, res) => {
  if (!requireEnabled(res)) return;
  try {
    res.json(await getContestSettlement(req.params.id, webUserId(req)));
  } catch (error) {
    handleError(res, error);
  }
});

export default router;
