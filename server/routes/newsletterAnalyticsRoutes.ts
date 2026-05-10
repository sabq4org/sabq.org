import { Router, Request, Response } from "express";
import { db } from "../db";
import { newsletterEmailCampaigns, newsletterEmailEvents, insertNewsletterEmailCampaignSchema } from "@shared/schema";
import { eq, desc, sql, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { requireAuth } from "../rbac";

const router = Router();

const TRANSPARENT_1X1_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

router.get("/campaigns", requireAuth, async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const campaigns = await db
      .select()
      .from(newsletterEmailCampaigns)
      .orderBy(desc(newsletterEmailCampaigns.createdAt))
      .limit(limit)
      .offset(offset);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(newsletterEmailCampaigns);

    res.json({
      campaigns,
      total: countResult?.count || 0,
      limit,
      offset,
    });
  } catch (error) {
    console.error("[Newsletter Analytics] Error fetching campaigns:", error);
    res.status(500).json({ message: "Failed to fetch campaigns" });
  }
});

router.get("/campaigns/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const campaign = await db.query.newsletterEmailCampaigns.findFirst({
      where: eq(newsletterEmailCampaigns.id, id),
      with: {
        events: {
          orderBy: [desc(newsletterEmailEvents.createdAt)],
          limit: 100,
        },
      },
    });

    if (!campaign) {
      return res.status(404).json({ message: "Campaign not found" });
    }

    const eventStats = await db
      .select({
        eventType: newsletterEmailEvents.eventType,
        count: sql<number>`count(*)::int`,
      })
      .from(newsletterEmailEvents)
      .where(eq(newsletterEmailEvents.campaignId, id))
      .groupBy(newsletterEmailEvents.eventType);

    res.json({
      ...campaign,
      eventStats: eventStats.reduce((acc, stat) => {
        acc[stat.eventType] = stat.count;
        return acc;
      }, {} as Record<string, number>),
    });
  } catch (error) {
    console.error("[Newsletter Analytics] Error fetching campaign:", error);
    res.status(500).json({ message: "Failed to fetch campaign" });
  }
});

router.get("/track/open/:trackingId", async (req: Request, res: Response) => {
  try {
    const { trackingId } = req.params;
    const parts = trackingId.split("_");
    const campaignId = parts[0];
    const emailHash = parts.slice(1).join("_");

    if (campaignId) {
      const ipAddress = (req.headers["x-forwarded-for"] as string)?.split(",")[0] || req.ip || null;
      const userAgent = req.headers["user-agent"] || null;

      await db.insert(newsletterEmailEvents).values({
        id: nanoid(),
        campaignId,
        email: emailHash || "unknown",
        eventType: "opened",
        ipAddress,
        userAgent,
        metadata: { trackingId },
      });

      await db
        .update(newsletterEmailCampaigns)
        .set({
          openCount: sql`${newsletterEmailCampaigns.openCount} + 1`,
        })
        .where(eq(newsletterEmailCampaigns.id, campaignId));
    }
  } catch (error) {
    console.error("[Newsletter Analytics] Error tracking open:", error);
  }

  res.set({
    "Content-Type": "image/gif",
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  });
  res.send(TRANSPARENT_1X1_GIF);
});

router.get("/track/click/:trackingId", async (req: Request, res: Response) => {
  try {
    const { trackingId } = req.params;
    const { url } = req.query;

    if (!url || typeof url !== "string") {
      return res.status(400).json({ message: "Missing redirect URL" });
    }

    const parts = trackingId.split("_");
    const campaignId = parts[0];
    const emailHash = parts.slice(1).join("_");

    if (campaignId) {
      const ipAddress = (req.headers["x-forwarded-for"] as string)?.split(",")[0] || req.ip || null;
      const userAgent = req.headers["user-agent"] || null;

      await db.insert(newsletterEmailEvents).values({
        id: nanoid(),
        campaignId,
        email: emailHash || "unknown",
        eventType: "clicked",
        linkUrl: url,
        ipAddress,
        userAgent,
        metadata: { trackingId, url },
      });

      await db
        .update(newsletterEmailCampaigns)
        .set({
          clickCount: sql`${newsletterEmailCampaigns.clickCount} + 1`,
        })
        .where(eq(newsletterEmailCampaigns.id, campaignId));
    }

    res.redirect(url);
  } catch (error) {
    console.error("[Newsletter Analytics] Error tracking click:", error);
    const url = req.query.url as string;
    if (url) {
      res.redirect(url);
    } else {
      res.status(500).json({ message: "Failed to track click" });
    }
  }
});

const createCampaignSchema = insertNewsletterEmailCampaignSchema.extend({
  id: z.string().optional(),
});

router.post("/campaigns", requireAuth, async (req: Request, res: Response) => {
  try {
    const data = createCampaignSchema.parse(req.body);

    const [campaign] = await db
      .insert(newsletterEmailCampaigns)
      .values({
        id: data.id || nanoid(),
        subject: data.subject,
        templateType: data.templateType,
        recipientCount: data.recipientCount || 0,
        status: data.status || "sending",
        sentAt: data.sentAt,
      })
      .returning();

    res.status(201).json(campaign);
  } catch (error) {
    console.error("[Newsletter Analytics] Error creating campaign:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid data", errors: error.errors });
    }
    res.status(500).json({ message: "Failed to create campaign" });
  }
});

const updateCampaignSchema = z.object({
  recipientCount: z.number().optional(),
  openCount: z.number().optional(),
  clickCount: z.number().optional(),
  status: z.enum(["sending", "sent", "failed"]).optional(),
  sentAt: z.string().datetime().optional(),
});

router.patch("/campaigns/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = updateCampaignSchema.parse(req.body);

    const existing = await db.query.newsletterEmailCampaigns.findFirst({
      where: eq(newsletterEmailCampaigns.id, id),
    });

    if (!existing) {
      return res.status(404).json({ message: "Campaign not found" });
    }

    const updateData: Partial<typeof newsletterEmailCampaigns.$inferInsert> = {};
    if (data.recipientCount !== undefined) updateData.recipientCount = data.recipientCount;
    if (data.openCount !== undefined) updateData.openCount = data.openCount;
    if (data.clickCount !== undefined) updateData.clickCount = data.clickCount;
    if (data.status) updateData.status = data.status;
    if (data.sentAt) updateData.sentAt = new Date(data.sentAt);

    const [updated] = await db
      .update(newsletterEmailCampaigns)
      .set(updateData)
      .where(eq(newsletterEmailCampaigns.id, id))
      .returning();

    res.json(updated);
  } catch (error) {
    console.error("[Newsletter Analytics] Error updating campaign:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid data", errors: error.errors });
    }
    res.status(500).json({ message: "Failed to update campaign" });
  }
});

export default router;
