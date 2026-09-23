import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { nanoid } from "nanoid";
import { storage } from "../storage";
import { requireAuth } from "../rbac";
import {
  insertFocusReadingSessionSchema,
  updateFocusReadingSessionSchema,
  type FocusReadingSession,
} from "@shared/schema";
import { getRealIp as getTrustedRealIp } from "../utils/trustedProxyIp";

// Minimum focused seconds before a session can be marked as a "successful read"
const MIN_SUCCESSFUL_READ_SECONDS = 30;

interface AuthedRequest extends Request {
  user?: { id: string } & Record<string, unknown>;
}

function getRealIp(req: Request): string {
  return getTrustedRealIp(req);
}

const focusLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => getRealIp(req as Request),
  validate: { xForwardedForHeader: false, ip: false, keyGeneratorIpFallback: false },
});

const router: Router = Router();

// POST /api/focus-sessions - Create a new focus session (auth optional; logged-in users persist; guests stay on client)
router.post("/api/focus-sessions", focusLimiter, async (req: any, res: Response) => {
  try {
    const userId = req.user?.id || null;

    // Guests don't persist server-side. Frontend keeps them in localStorage only.
    if (!userId) {
      return res.status(204).end();
    }

    const data = insertFocusReadingSessionSchema.parse({
      userId,
      articleId: req.body.articleId,
      language: req.body.language || "ar",
      focusedSeconds: req.body.focusedSeconds ?? 0,
      completed: req.body.completed ?? false,
      articleTitle: req.body.articleTitle ?? null,
      articleImageUrl: req.body.articleImageUrl ?? null,
      articleSlug: req.body.articleSlug ?? null,
      categoryName: req.body.categoryName ?? null,
    });

    const session = await storage.createFocusReadingSession(data);
    res.status(201).json(session);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid input", issues: error.issues });
    }
    console.error("[Focus Sessions] create error:", error);
    res.status(500).json({ message: "Failed to create focus session" });
  }
});

// PATCH /api/focus-sessions/:id - Update progress / complete / generate share slug
router.patch("/api/focus-sessions/:id", focusLimiter, requireAuth, async (req: any, res: Response) => {
  try {
    const userId = req.user!.id;
    const id = req.params.id;

    const existing = await storage.getFocusReadingSession(id);
    if (!existing || existing.userId !== userId) {
      return res.status(404).json({ message: "Session not found" });
    }

    const updateSchema = updateFocusReadingSessionSchema.extend({
      generateShareSlug: z.boolean().optional(),
    });
    const parsed = updateSchema.parse(req.body);

    const updates: { completed?: boolean; endedAt?: Date; focusedSeconds?: number; shareSlug?: string } = {};
    let nextFocusedSeconds = existing.focusedSeconds;
    if (typeof parsed.focusedSeconds === "number") {
      nextFocusedSeconds = Math.max(existing.focusedSeconds, parsed.focusedSeconds);
      updates.focusedSeconds = nextFocusedSeconds;
    }
    if (parsed.endedAt) updates.endedAt = parsed.endedAt;
    // Only allow marking as "completed" once the successful-read threshold is met.
    if (typeof parsed.completed === "boolean") {
      updates.completed = parsed.completed && nextFocusedSeconds >= MIN_SUCCESSFUL_READ_SECONDS;
    }

    if (parsed.generateShareSlug && !existing.shareSlug) {
      // Try a few times to avoid unique collision (extremely unlikely with 12 chars)
      let slug = nanoid(12);
      for (let i = 0; i < 3; i++) {
        const dup = await storage.getFocusSessionByShareSlug(slug);
        if (!dup) break;
        slug = nanoid(12);
      }
      updates.shareSlug = slug;
    }

    const updated = await storage.updateFocusReadingSession(id, updates);
    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid input", issues: error.issues });
    }
    console.error("[Focus Sessions] update error:", error);
    res.status(500).json({ message: "Failed to update focus session" });
  }
});

// POST /api/focus-sessions/sync - Sync guest sessions from localStorage on login.
// Accepts up to 50 sessions per call (matches the guest-side cap). Each entry
// is best-effort inserted; we don't fail the request on a single bad row so the
// client can safely clear localStorage on a 200 response.
const syncEntrySchema = z.object({
  articleId: z.string().min(1),
  language: z.enum(["ar", "en", "ur"]).optional(),
  startedAt: z.coerce.date(),
  endedAt: z.coerce.date().optional(),
  focusedSeconds: z.number().int().min(0).max(24 * 60 * 60),
  completed: z.boolean().optional(),
  articleTitle: z.string().nullable().optional(),
  articleSlug: z.string().nullable().optional(),
  articleImageUrl: z.string().nullable().optional(),
  categoryName: z.string().nullable().optional(),
});

router.post(
  "/api/focus-sessions/sync",
  focusLimiter,
  requireAuth,
  async (req: any, res: Response) => {
    try {
      const userId = req.user!.id;
      const parsed = z.object({ sessions: z.array(syncEntrySchema).max(50) }).parse(req.body);

      let imported = 0;
      const errors: Array<{ index: number; message: string }> = [];

      for (let i = 0; i < parsed.sessions.length; i++) {
        const entry = parsed.sessions[i];
        try {
          const completed = (entry.completed ?? false) && entry.focusedSeconds >= MIN_SUCCESSFUL_READ_SECONDS;
          await storage.createFocusReadingSession({
            userId,
            articleId: entry.articleId,
            language: entry.language || "ar",
            focusedSeconds: entry.focusedSeconds,
            completed,
            endedAt: entry.endedAt ?? null,
            articleTitle: entry.articleTitle ?? null,
            articleImageUrl: entry.articleImageUrl ?? null,
            articleSlug: entry.articleSlug ?? null,
            categoryName: entry.categoryName ?? null,
            // Override the default startedAt so the synced session retains the
            // original timestamp from when the guest actually read.
            startedAt: entry.startedAt,
          } as Parameters<typeof storage.createFocusReadingSession>[0]);
          imported += 1;
        } catch (rowError) {
          errors.push({
            index: i,
            message: rowError instanceof Error ? rowError.message : "unknown",
          });
        }
      }

      res.json({ imported, total: parsed.sessions.length, errors });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input", issues: error.issues });
      }
      console.error("[Focus Sessions] sync error:", error);
      res.status(500).json({ message: "Failed to sync focus sessions" });
    }
  },
);

// GET /api/focus-sessions/share/:slug - Public landing page data (no auth)
router.get("/api/focus-sessions/share/:slug", async (req: Request, res: Response) => {
  try {
    const session = await storage.getFocusSessionByShareSlug(req.params.slug);
    if (!session) {
      return res.status(404).json({ message: "Session not found" });
    }
    // Public response - omit user_id for privacy
    const { userId: _userId, ...publicSession } = session;
    res.set("Cache-Control", "public, max-age=60");
    res.json(publicSession);
  } catch (error) {
    console.error("[Focus Sessions] share lookup error:", error);
    res.status(500).json({ message: "Failed to fetch session" });
  }
});

interface DailyAggregate {
  date: string;
  sessions: number;
  focusedSeconds: number;
  completed: number;
}

interface TopArticle {
  articleId: string;
  title: string | null;
  slug: string | null;
  sessions: number;
  focusedSeconds: number;
}

interface TopCategory {
  name: string;
  sessions: number;
  focusedSeconds: number;
}

interface LongestSession {
  id: string;
  articleId: string;
  articleTitle: string | null;
  articleSlug: string | null;
  focusedSeconds: number;
  startedAt: string;
}

interface WeekAggregate {
  range: { start: string; end: string };
  totalSessions: number;
  totalArticles: number;
  totalFocusedSeconds: number;
  totalCompleted: number;
  averageSessionSeconds: number;
  daily: DailyAggregate[];
  topArticles: TopArticle[];
  topCategory: TopCategory | null;
  longestSession: LongestSession | null;
}

function aggregateWeek(sessions: FocusReadingSession[], start: Date, end: Date): WeekAggregate {
  const dailyMap = new Map<string, DailyAggregate>();
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const key = d.toISOString().slice(0, 10);
    dailyMap.set(key, { date: key, sessions: 0, focusedSeconds: 0, completed: 0 });
  }

  let totalSeconds = 0;
  let totalCompleted = 0;
  const articleCounts = new Map<string, TopArticle>();
  const categoryCounts = new Map<string, TopCategory>();
  let longest: FocusReadingSession | null = null;

  for (const s of sessions) {
    const key = s.startedAt.toISOString().slice(0, 10);
    const day = dailyMap.get(key);
    if (day) {
      day.sessions += 1;
      day.focusedSeconds += s.focusedSeconds;
      if (s.completed) day.completed += 1;
    }
    totalSeconds += s.focusedSeconds;
    if (s.completed) totalCompleted += 1;
    const ac = articleCounts.get(s.articleId) || {
      articleId: s.articleId,
      title: s.articleTitle,
      slug: s.articleSlug,
      sessions: 0,
      focusedSeconds: 0,
    };
    ac.sessions += 1;
    ac.focusedSeconds += s.focusedSeconds;
    articleCounts.set(s.articleId, ac);

    const catName = (s.categoryName || "").trim();
    if (catName) {
      const cc = categoryCounts.get(catName) || { name: catName, sessions: 0, focusedSeconds: 0 };
      cc.sessions += 1;
      cc.focusedSeconds += s.focusedSeconds;
      categoryCounts.set(catName, cc);
    }

    if (!longest || s.focusedSeconds > longest.focusedSeconds) {
      longest = s;
    }
  }

  const topCategory = Array.from(categoryCounts.values())
    .sort((a, b) => b.focusedSeconds - a.focusedSeconds)[0] || null;

  const longestSession: LongestSession | null = longest
    ? {
        id: longest.id,
        articleId: longest.articleId,
        articleTitle: longest.articleTitle,
        articleSlug: longest.articleSlug,
        focusedSeconds: longest.focusedSeconds,
        startedAt: longest.startedAt.toISOString(),
      }
    : null;

  return {
    range: { start: start.toISOString(), end: end.toISOString() },
    totalSessions: sessions.length,
    totalArticles: articleCounts.size,
    totalFocusedSeconds: totalSeconds,
    totalCompleted,
    averageSessionSeconds: sessions.length ? Math.round(totalSeconds / sessions.length) : 0,
    daily: Array.from(dailyMap.values()),
    topArticles: Array.from(articleCounts.values())
      .sort((a, b) => b.focusedSeconds - a.focusedSeconds)
      .slice(0, 5),
    topCategory,
    longestSession,
  };
}

// GET /api/me/focus-sessions/weekly - Weekly aggregated report (current + previous week)
router.get("/api/me/focus-sessions/weekly", requireAuth, async (req: any, res: Response) => {
  try {
    const userId = req.user!.id;
    const now = new Date();

    // Current week: 7 days ending today (UTC)
    const currentEnd = new Date(now);
    currentEnd.setUTCHours(23, 59, 59, 999);
    const currentStart = new Date(currentEnd);
    currentStart.setUTCDate(currentStart.getUTCDate() - 6);
    currentStart.setUTCHours(0, 0, 0, 0);

    // Previous week: 7 days immediately before currentStart
    const previousEnd = new Date(currentStart);
    previousEnd.setUTCMilliseconds(previousEnd.getUTCMilliseconds() - 1);
    const previousStart = new Date(previousEnd);
    previousStart.setUTCDate(previousStart.getUTCDate() - 6);
    previousStart.setUTCHours(0, 0, 0, 0);

    const [currentSessions, previousSessions] = await Promise.all([
      storage.getUserFocusSessionsInRange(userId, currentStart, currentEnd),
      storage.getUserFocusSessionsInRange(userId, previousStart, previousEnd),
    ]);

    const current = aggregateWeek(currentSessions, currentStart, currentEnd);
    const previous = aggregateWeek(previousSessions, previousStart, previousEnd);

    res.set("Cache-Control", "private, no-store");
    // Top-level fields preserved for backward compatibility with the existing UI shape.
    res.json({
      ...current,
      current,
      previous,
    });
  } catch (error) {
    console.error("[Focus Sessions] weekly report error:", error);
    res.status(500).json({ message: "Failed to fetch weekly report" });
  }
});

export default router;
