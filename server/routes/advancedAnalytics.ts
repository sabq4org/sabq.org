import { Router, Request, Response } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { storage } from "../storage";
import { requireAuth, requirePermission, requireAnyPermission } from "../rbac";

const router = Router();

const analyticsIngestionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  message: { message: "Too many analytics events, please slow down" },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => req.headers['cf-connecting-ip'] as string || (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown',
  validate: { xForwardedForHeader: false, ip: false, keyGeneratorIpFallback: false },
});

const sessionStartSchema = z.object({
  sessionId: z.string(),
  deviceType: z.string().optional(),
  platform: z.string().optional(),
  browser: z.string().optional(),
  screenWidth: z.number().optional(),
  screenHeight: z.number().optional(),
  referrerDomain: z.string().optional(),
  referrerUrl: z.string().optional(),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
  utmTerm: z.string().optional(),
  utmContent: z.string().optional(),
  landingPage: z.string().optional(),
  isNewVisitor: z.boolean().optional(),
  country: z.string().optional(),
  city: z.string().optional(),
  language: z.string().optional(),
});

const sessionEndSchema = z.object({
  sessionId: z.string(),
  exitPage: z.string().optional(),
  totalDurationMs: z.number().optional(),
  totalPagesViewed: z.number().optional(),
  totalArticlesRead: z.number().optional(),
});

const sectionEventSchema = z.object({
  sessionId: z.string().optional(),
  articleId: z.string(),
  sectionIndex: z.number(),
  sectionType: z.string().optional(),
  paragraphIndex: z.number().optional(),
  dwellTimeMs: z.number().optional(),
  scrollDepthStart: z.number().optional(),
  scrollDepthEnd: z.number().optional(),
  visibleTimeMs: z.number().optional(),
  heatScore: z.number().optional(),
  wasHighlighted: z.boolean().optional(),
  wasShared: z.boolean().optional(),
  interactionCount: z.number().optional(),
});

const batchSectionEventsSchema = z.object({
  events: z.array(sectionEventSchema),
});

const navigationEventSchema = z.object({
  sessionId: z.string(),
  fromPageType: z.string().optional(),
  fromPageId: z.string().optional(),
  fromArticleId: z.string().optional(),
  fromCategoryId: z.string().optional(),
  toPageType: z.string(),
  toPageId: z.string().optional(),
  toArticleId: z.string().optional(),
  toCategoryId: z.string().optional(),
  transitionType: z.string().optional(),
  dwellTimeOnFromMs: z.number().optional(),
  scrollDepthOnFrom: z.number().optional(),
});

const trafficSourceSchema = z.object({
  sessionId: z.string(),
  sourceType: z.string(),
  sourceMedium: z.string().optional(),
  sourceChannel: z.string().optional(),
  referrerDomain: z.string().optional(),
  referrerPath: z.string().optional(),
  searchKeyword: z.string().optional(),
  socialPlatform: z.string().optional(),
  campaignName: z.string().optional(),
  campaignSource: z.string().optional(),
  articleId: z.string().optional(),
});

router.post("/sessions/start", analyticsIngestionLimiter, async (req: any, res: Response) => {
  try {
    const data = sessionStartSchema.parse(req.body);
    const userId = req.user?.id;
    
    const session = await storage.createReadingSession({
      ...data,
      userId,
    });
    
    res.json({ success: true, sessionDbId: session.id });
  } catch (error) {
    console.error("Error starting session:", error);
    res.status(400).json({ message: "Failed to start session" });
  }
});

router.post("/sessions/end", analyticsIngestionLimiter, async (req: any, res: Response) => {
  try {
    const data = sessionEndSchema.parse(req.body);
    
    await storage.endReadingSession(data.sessionId, {
      exitPage: data.exitPage,
      totalDurationMs: data.totalDurationMs,
      totalPagesViewed: data.totalPagesViewed,
      totalArticlesRead: data.totalArticlesRead,
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error("Error ending session:", error);
    res.status(400).json({ message: "Failed to end session" });
  }
});

router.post("/sections", analyticsIngestionLimiter, async (req: any, res: Response) => {
  try {
    const data = sectionEventSchema.parse(req.body);
    const userId = req.user?.id;
    
    await storage.recordSectionAnalytic({
      ...data,
      userId,
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error("Error recording section event:", error);
    res.status(400).json({ message: "Failed to record section event" });
  }
});

router.post("/sections/batch", analyticsIngestionLimiter, async (req: any, res: Response) => {
  try {
    const data = batchSectionEventsSchema.parse(req.body);
    const userId = req.user?.id;
    
    await storage.recordBatchSectionAnalytics(
      data.events.map(e => ({ ...e, userId }))
    );
    
    res.json({ success: true, count: data.events.length });
  } catch (error) {
    console.error("Error recording batch section events:", error);
    res.status(400).json({ message: "Failed to record section events" });
  }
});

router.post("/navigation", analyticsIngestionLimiter, async (req: any, res: Response) => {
  try {
    const data = navigationEventSchema.parse(req.body);
    const userId = req.user?.id;
    
    await storage.recordNavigationPath({
      ...data,
      userId,
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error("Error recording navigation:", error);
    res.status(400).json({ message: "Failed to record navigation" });
  }
});

router.post("/traffic-source", analyticsIngestionLimiter, async (req: any, res: Response) => {
  try {
    const data = trafficSourceSchema.parse(req.body);
    
    await storage.recordTrafficSource(data);
    
    res.json({ success: true });
  } catch (error) {
    console.error("Error recording traffic source:", error);
    res.status(400).json({ message: "Failed to record traffic source" });
  }
});

router.get("/overview",
  requireAuth,
  requireAnyPermission("analytics.view", "articles.view"),
  async (req: any, res: Response) => {
    try {
      const range = (req.query.range as string) || "7d";
      const overview = await storage.getAdvancedAnalyticsOverview(range);
      res.json(overview);
    } catch (error) {
      console.error("Error fetching analytics overview:", error);
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  }
);

router.get("/heatmap/:articleId",
  requireAuth,
  requireAnyPermission("analytics.view", "articles.view"),
  async (req: any, res: Response) => {
    try {
      const { articleId } = req.params;
      const heatmap = await storage.getArticleHeatmap(articleId);
      res.json(heatmap);
    } catch (error) {
      console.error("Error fetching article heatmap:", error);
      res.status(500).json({ message: "Failed to fetch heatmap" });
    }
  }
);

router.get("/paths",
  requireAuth,
  requireAnyPermission("analytics.view", "articles.view"),
  async (req: any, res: Response) => {
    try {
      const range = (req.query.range as string) || "7d";
      const limit = parseInt(req.query.limit as string) || 50;
      const paths = await storage.getNavigationPaths(range, limit);
      res.json(paths);
    } catch (error) {
      console.error("Error fetching navigation paths:", error);
      res.status(500).json({ message: "Failed to fetch paths" });
    }
  }
);

router.get("/sources",
  requireAuth,
  requireAnyPermission("analytics.view", "articles.view"),
  async (req: any, res: Response) => {
    try {
      const range = (req.query.range as string) || "7d";
      const sources = await storage.getTrafficSourcesAnalytics(range);
      res.json(sources);
    } catch (error) {
      console.error("Error fetching traffic sources:", error);
      res.status(500).json({ message: "Failed to fetch sources" });
    }
  }
);

router.get("/peak-hours",
  requireAuth,
  requireAnyPermission("analytics.view", "articles.view"),
  async (req: any, res: Response) => {
    try {
      const range = (req.query.range as string) || "7d";
      const peakHours = await storage.getPeakHoursAnalytics(range);
      res.json(peakHours);
    } catch (error) {
      console.error("Error fetching peak hours:", error);
      res.status(500).json({ message: "Failed to fetch peak hours" });
    }
  }
);

router.get("/realtime",
  requireAuth,
  requireAnyPermission("analytics.view", "articles.view"),
  async (req: any, res: Response) => {
    try {
      const realtime = await storage.getRealTimeMetrics();
      res.json(realtime);
    } catch (error) {
      console.error("Error fetching realtime metrics:", error);
      res.status(500).json({ message: "Failed to fetch realtime metrics" });
    }
  }
);

router.get("/engagement-scores",
  requireAuth,
  requireAnyPermission("analytics.view", "articles.view"),
  async (req: any, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const sortBy = (req.query.sortBy as string) || "overallScore";
      const scores = await storage.getTopEngagementScores(limit, sortBy);
      res.json(scores);
    } catch (error) {
      console.error("Error fetching engagement scores:", error);
      res.status(500).json({ message: "Failed to fetch scores" });
    }
  }
);

router.get("/categories",
  requireAuth,
  requireAnyPermission("analytics.view", "articles.view"),
  async (req: any, res: Response) => {
    try {
      const range = (req.query.range as string) || "7d";
      const categories = await storage.getCategoryAnalytics(range);
      res.json(categories);
    } catch (error) {
      console.error("Error fetching category analytics:", error);
      res.status(500).json({ message: "Failed to fetch category analytics" });
    }
  }
);

router.get("/devices",
  requireAuth,
  requireAnyPermission("analytics.view", "articles.view"),
  async (req: any, res: Response) => {
    try {
      const range = (req.query.range as string) || "7d";
      const devices = await storage.getDeviceAnalytics(range);
      res.json(devices);
    } catch (error) {
      console.error("Error fetching device analytics:", error);
      res.status(500).json({ message: "Failed to fetch device analytics" });
    }
  }
);

router.get("/engagement/:articleId",
  requireAuth,
  requireAnyPermission("analytics.view", "articles.view"),
  async (req: any, res: Response) => {
    try {
      const { articleId } = req.params;
      const engagement = await storage.getArticleEngagementDetails(articleId);
      res.json(engagement);
    } catch (error) {
      console.error("Error fetching article engagement:", error);
      res.status(500).json({ message: "Failed to fetch engagement" });
    }
  }
);

router.post("/calculate-scores",
  requireAuth,
  requirePermission("analytics.manage"),
  async (req: any, res: Response) => {
    try {
      const articleId = req.body.articleId;
      if (articleId) {
        await storage.calculateArticleEngagementScore(articleId);
      } else {
        await storage.calculateAllEngagementScores();
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Error calculating engagement scores:", error);
      res.status(500).json({ message: "Failed to calculate scores" });
    }
  }
);

export default router;
