/**
 * مسارات محرّك الذكاء الرياضي — /api/sports/intel/*.
 *
 * كلها عامة (تُغذّي قسم /sports في الويب) عدا الموجز المخصّص الذي يتطلّب جلسة.
 * لا تستورد db (ADR-001): كل الوصول عبر خدمة sportsIntelligence. القراءة تعيد
 * لقطات مخزَّنة جاهزة (بلا انتظار LLM)؛ والمساعد المحادثي مخزَّن بمفتاح السؤال.
 */
import type { Express, Request, Response } from "express";
import { requireAuth } from "../rbac";
import { isSaudiLeagueConfigured, getCompetition } from "../services/saudiLeagueService";
import {
  askCopilot,
  buildDigest,
  getCompetitionTrends,
  getExplainedPrediction,
  getMatchInsight,
  getScene,
  isSportsIntelEnabled,
} from "../services/sportsIntelligence";
import type { SportsInsight } from "@shared/schema";

/** يقشّر صفّ اللقطة إلى الشكل الذي تستهلكه الواجهة. */
function toDto(row: SportsInsight) {
  return {
    id: row.id,
    scope: row.scope,
    kind: row.kind,
    importance: row.importance,
    competitionSlug: row.competitionSlug,
    headline: row.headline,
    body: row.body,
    entities: row.entities ?? null,
    createdAt: row.createdAt,
  };
}

export function registerSportsIntelRoutes(app: Express) {
  // حالة المحرّك — للواجهة كي تُظهِر/تُخفي أقسام الذكاء بسلاسة.
  app.get("/api/sports/intel/status", (_req: Request, res: Response) => {
    res.json({ configured: isSaudiLeagueConfigured(), enabled: isSportsIntelEnabled() });
  });

  // «المشهد الآن» — لقطات عامة مصنّفة بالأهمية (الخلاصة أولاً).
  app.get("/api/sports/intel/scene", async (_req: Request, res: Response) => {
    try {
      if (!isSaudiLeagueConfigured()) return res.json({ configured: false, cards: [] });
      const rows = await getScene();
      const summary = rows.find((r) => r.kind === "scene_summary");
      const cards = rows.filter((r) => r.kind === "scene").map(toDto);
      res.json({ configured: true, summary: summary ? toDto(summary) : null, cards });
    } catch (error) {
      console.error("[SportsIntel] scene failed:", error);
      res.status(500).json({ configured: true, cards: [], error: "scene_failed" });
    }
  });

  // قصص الموسم/الأنماط لبطولة.
  app.get("/api/sports/intel/competition/:slug", async (req: Request, res: Response) => {
    try {
      const slug = String(req.params.slug);
      if (!getCompetition(slug)) return res.status(404).json({ error: "unknown_competition" });
      if (!isSaudiLeagueConfigured()) return res.json({ configured: false, cards: [] });
      const rows = await getCompetitionTrends(slug);
      res.json({ configured: true, cards: rows.map(toDto) });
    } catch (error) {
      console.error("[SportsIntel] competition trends failed:", error);
      res.status(500).json({ cards: [], error: "trends_failed" });
    }
  });

  // بطاقة المباراة الذكية + التوقّع المفسّر (إن كانت مرتقبة).
  app.get("/api/sports/intel/match/:id", async (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id" });
      if (!isSaudiLeagueConfigured()) return res.json({ configured: false, card: null, prediction: null });
      const [card, prediction] = await Promise.all([
        getMatchInsight(id).catch(() => null),
        getExplainedPrediction(id).catch(() => null),
      ]);
      res.json({ configured: true, card, prediction });
    } catch (error) {
      console.error("[SportsIntel] match insight failed:", error);
      res.status(500).json({ card: null, prediction: null, error: "match_failed" });
    }
  });

  // الموجز الرياضي المخصّص — يتطلّب جلسة (متابعات المستخدم).
  app.get("/api/sports/intel/digest", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id as string | undefined;
      if (!userId) return res.status(401).json({ error: "unauthorized" });
      if (!isSaudiLeagueConfigured()) return res.json({ configured: false, digest: null });
      const digest = await buildDigest(userId);
      res.json({ configured: true, digest });
    } catch (error) {
      console.error("[SportsIntel] digest failed:", error);
      res.status(500).json({ digest: null, error: "digest_failed" });
    }
  });

  // المساعد الرياضي المحادثي (RAG) — يجيب من بياناتنا الحيّة.
  app.post("/api/sports/intel/ask", async (req: Request, res: Response) => {
    try {
      const question = String(req.body?.question ?? "").trim();
      if (!question) return res.status(400).json({ error: "empty_question" });
      if (question.length > 400) return res.status(400).json({ error: "question_too_long" });
      if (!isSaudiLeagueConfigured()) return res.json({ configured: false, answer: null });
      const result = await askCopilot(question);
      if (!result) return res.json({ configured: true, answer: null });
      res.json({ configured: true, ...result });
    } catch (error) {
      console.error("[SportsIntel] copilot failed:", error);
      res.status(500).json({ answer: null, error: "copilot_failed" });
    }
  });
}
