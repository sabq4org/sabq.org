/**
 * مسارات مركز الانتقالات المتكامل — /api/transfer-center/*
 *
 * تكمل /api/sports/transfers (المؤكّد السعودي عبر API-Football) ولا تمسّها:
 *   - rumours          إشاعات SportMonks (سعودي مُجمَّع بفرق روشن + عالمي)
 *   - global-confirmed المؤكّد العالمي من فيد SportMonks /transfers
 *   - story/:playerId  تسلسل قصة انتقال لاعب (تطوّر الاحتمال زمنيًّا)
 *   - overview         نبض السوق + صفقة اليوم + Hero + النوافذ + مقارنة الميركاتو
 *
 * البوابة الوحيدة توفّر المفاتيح: غيابها يرجّع 200 بـ configured:false
 * فتُخفي الواجهة الأقسام بسلاسة بدل أن تتعطّل. لا يستورد db (ADR-001).
 */
import type { Express, Request, Response } from "express";
import {
  getGlobalConfirmed,
  getMarketOverview,
  getRumourStory,
  getTransferRumours,
  isTransferRumoursConfigured,
} from "../services/transferCenterService";

export function registerTransferCenterRoutes(app: Express): void {
  // موجز الإشاعات — الفلترة (سعودي/عالمي، النوع، الدوري) تتم في الواجهة
  // لأن filters= عند المزوّد يُتجاهَل صامتًا (فخ مُثبَت).
  app.get("/api/transfer-center/rumours", async (_req: Request, res: Response) => {
    if (!isTransferRumoursConfigured()) {
      return res.json({ configured: false, rumours: [], leagues: [] });
    }
    try {
      const feed = await getTransferRumours();
      res.json({ configured: true, ...feed });
    } catch (error) {
      console.error("[TransferCenter] rumours failed:", error);
      res.json({ configured: false, rumours: [], leagues: [] });
    }
  });

  // المؤكّد العالمي (فيد SportMonks) — تبويب «عالمية › مؤكّدة».
  app.get("/api/transfer-center/global-confirmed", async (_req: Request, res: Response) => {
    if (!isTransferRumoursConfigured()) {
      return res.json({ configured: false, transfers: [] });
    }
    try {
      const transfers = await getGlobalConfirmed();
      res.json({ configured: true, transfers });
    } catch (error) {
      console.error("[TransferCenter] global-confirmed failed:", error);
      res.json({ configured: false, transfers: [] });
    }
  });

  // قصة انتقال لاعب — كل إشاعاته مرتّبة زمنيًّا مع تطوّر درجة الاحتمال.
  app.get("/api/transfer-center/story/:playerId", async (req: Request, res: Response) => {
    const playerId = Number.parseInt(String(req.params.playerId), 10);
    if (!Number.isFinite(playerId) || playerId <= 0) {
      return res.status(400).json({ configured: true, found: false, player: null, timeline: [] });
    }
    if (!isTransferRumoursConfigured()) {
      return res.json({ configured: false, found: false, player: null, timeline: [] });
    }
    try {
      const story = await getRumourStory(playerId);
      res.json({ configured: true, ...story });
    } catch (error) {
      console.error("[TransferCenter] story failed:", error);
      res.json({ configured: false, found: false, player: null, timeline: [] });
    }
  });

  // نظرة السوق — تُغذّي ودجت البوابة وقمة صفحة المركز.
  app.get("/api/transfer-center/overview", async (_req: Request, res: Response) => {
    // سابقًا لم يُضبط Cache-Control، فكان الـ edge لا يخزّن هذا الـ endpoint
    // رغم أنه يجمع ~42 استدعاءً خارجيًا (SportMonks + API-Football) عند cold
    // cache. الـ SWR الداخلي 30 دقيقة للإشاعات، فعلى الـ edge نمنح 15 دقيقة
    // مع stale-while-revalidate لنخفّف الضغط دون فقدان الحداثة.
    res.set("Cache-Control", "public, max-age=120, s-maxage=900, stale-while-revalidate=1800");
    try {
      const overview = await getMarketOverview();
      res.json({ configured: true, ...overview });
    } catch (error) {
      console.error("[TransferCenter] overview failed:", error);
      res.json({
        configured: false,
        rumoursConfigured: false,
        pulse: [],
        dealOfDay: null,
        hero: [],
        windows: null,
        comparison: null,
        clubBalance: [],
      });
    }
  });
}
