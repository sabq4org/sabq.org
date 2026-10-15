// مسارات الموبايل للمنصة المركزية — /api/v1/predictions/* مع Bearer token
// (نفس جلسات app_member_sessions القائمة). نظائر وظيفية لمسارات الويب بنفس
// الخدمة ونفس معاني الحقول — iOS المرجع البصري وAndroid يطابقه.

import { Router, type Request, type Response } from "express";
import { verifyMemberBearer } from "../services/memberSessionService";
import {
  getCompetitionBySlug,
  getContest,
  getContestSettlement,
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
import { PREDICTION_ERROR_CODES, type SourcePlatform } from "@shared/predictions";
import { parseLimit, paginationOrReject } from "../utils/pagination";

const router = Router();

function handleError(res: Response, error: unknown): void {
  if (error instanceof PredictionError) {
    res.status(error.httpStatus).json({ error: error.code });
    return;
  }
  console.error("[Predictions Mobile]", error);
  res.status(500).json({ error: "INTERNAL_ERROR" });
}

function requireEnabled(res: Response): boolean {
  if (!isPredictionCoreEnabled()) {
    res.status(503).json({ error: PREDICTION_ERROR_CODES.COMPETITION_DISABLED });
    return false;
  }
  return true;
}

function platformOf(req: Request): SourcePlatform {
  const platform = String(req.headers["x-platform"] ?? "").toLowerCase();
  return platform === "android" ? "android" : "ios";
}

router.get("/api/v1/predictions/competitions", async (req, res) => {
  if (!requireEnabled(res)) return;
  try {
    const session = await verifyMemberBearer(req);
    res.json({ competitions: await listActiveCompetitions(session?.userId) });
  } catch (error) {
    handleError(res, error);
  }
});

router.get("/api/v1/predictions/competitions/:slug", async (req, res) => {
  if (!requireEnabled(res)) return;
  try {
    const session = await verifyMemberBearer(req);
    res.json(await getCompetitionBySlug(req.params.slug, session?.userId));
  } catch (error) {
    handleError(res, error);
  }
});

router.get("/api/v1/predictions/contests", async (req, res) => {
  if (!requireEnabled(res)) return;
  try {
    const session = await verifyMemberBearer(req);
    const contests = await listContests({
      competitionSlug: typeof req.query.competition === "string" ? req.query.competition : undefined,
      status: typeof req.query.status === "string" ? req.query.status : undefined,
      contestType: typeof req.query.type === "string" ? req.query.type : undefined,
      userId: session?.userId,
    });
    res.json({ contests });
  } catch (error) {
    handleError(res, error);
  }
});

router.get("/api/v1/predictions/contests/:id", async (req, res) => {
  if (!requireEnabled(res)) return;
  try {
    const session = await verifyMemberBearer(req);
    res.json(await getContest(req.params.id, session?.userId));
  } catch (error) {
    handleError(res, error);
  }
});

router.put("/api/v1/predictions/contests/:id/entry", async (req, res) => {
  try {
    const session = await verifyMemberBearer(req);
    if (!session) return res.status(401).json({ error: "UNAUTHORIZED" });
    const entry = await upsertEntry({
      contestId: req.params.id,
      userId: session.userId,
      payload: req.body?.prediction,
      platform: platformOf(req),
    });
    res.json({ entry });
  } catch (error) {
    handleError(res, error);
  }
});

router.delete("/api/v1/predictions/contests/:id/entry", async (req, res) => {
  try {
    const session = await verifyMemberBearer(req);
    if (!session) return res.status(401).json({ error: "UNAUTHORIZED" });
    await withdrawEntry(req.params.id, session.userId);
    res.json({ withdrawn: true });
  } catch (error) {
    handleError(res, error);
  }
});

router.get("/api/v1/predictions/me/points", async (req, res) => {
  try {
    const session = await verifyMemberBearer(req);
    if (!session) return res.status(401).json({ error: "UNAUTHORIZED" });
    const competition = typeof req.query.competition === "string" ? req.query.competition : undefined;
    res.json(await getUserPoints(session.userId, competition));
  } catch (error) {
    handleError(res, error);
  }
});

router.get("/api/v1/predictions/me/ledger", async (req, res) => {
  try {
    const session = await verifyMemberBearer(req);
    if (!session) return res.status(401).json({ error: "UNAUTHORIZED" });
    res.json(await getUserLedger(session.userId, {
      competitionSlug: typeof req.query.competition === "string" ? req.query.competition : undefined,
      cursor: typeof req.query.cursor === "string" ? req.query.cursor : undefined,
      limit: req.query.limit ? parseLimit(req.query.limit, 20, 50) : undefined,
    }));
  } catch (error) {
    handleError(res, error);
  }
});

// «توقعاتي» — نظير مسار الويب (PR #1413) الذي كان بلا مقابل موبايل
router.get("/api/v1/predictions/me/entries", async (req, res) => {
  try {
    const session = await verifyMemberBearer(req);
    if (!session) return res.status(401).json({ error: "UNAUTHORIZED" });
    res.json(await getUserEntries(session.userId, {
      competitionSlug: typeof req.query.competition === "string" ? req.query.competition : undefined,
      cursor: typeof req.query.cursor === "string" ? req.query.cursor : undefined,
      limit: req.query.limit ? parseLimit(req.query.limit, 30, 100) : undefined,
    }));
  } catch (error) {
    handleError(res, error);
  }
});

router.get("/api/v1/predictions/leaderboards", async (req, res) => {
  if (!requireEnabled(res)) return;
  try {
    const session = await verifyMemberBearer(req);
    const competitionSlug = typeof req.query.competition === "string" ? req.query.competition : "";
    if (!competitionSlug) {
      res.status(400).json({ error: PREDICTION_ERROR_CODES.CONTEST_NOT_FOUND });
      return;
    }
    const pg = paginationOrReject({ query: req.query as Record<string, unknown>, path: req.path }, res, { defaultLimit: 50, maxLimit: 100 });
    if (!pg) return;
    res.json(await getLeaderboard({
      competitionSlug,
      userId: session?.userId,
      offset: pg.offset,
      limit: req.query.limit ? pg.limit : undefined,
    }));
  } catch (error) {
    handleError(res, error);
  }
});

router.get("/api/v1/predictions/contests/:id/settlement", async (req, res) => {
  if (!requireEnabled(res)) return;
  try {
    const session = await verifyMemberBearer(req);
    res.json(await getContestSettlement(req.params.id, session?.userId));
  } catch (error) {
    handleError(res, error);
  }
});

export default router;
