// Audio news briefs (الأخبار الصوتية السريعة) — extracted verbatim from
// server/routes.ts on 2026-06-10 (Milestone-2 extraction #2, audit T2.2).
// ADR-001-compliant: storage-only data access.
import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, requireRole } from "../rbac";
import { insertAudioNewsBriefSchema } from "@shared/schema";

export function registerAudioBriefRoutes(app: Express) {
  // ============================================================
  // AUDIO NEWS BRIEFS ROUTES - الأخبار الصوتية السريعة
  // ============================================================

  // GET /api/audio-briefs/admin - List all briefs for admin (protected)
  app.get("/api/audio-briefs/admin",
    requireAuth,
    requireRole('admin'),
    async (req: any, res) => {
    try {
        const briefs = await storage.getAllAudioNewsBriefs();
        res.json(briefs);
      } catch (error: any) {
        console.error("Error fetching audio briefs:", error);
        res.status(500).json({ message: "فشل في جلب الأخبار الصوتية" });
      }
    }
  );

  // GET /api/audio-briefs/published - List published briefs (public)
  app.get("/api/audio-briefs/published", async (req: any, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 5;
      const briefs = await storage.getPublishedAudioNewsBriefs(limit);
      res.json(briefs);
    } catch (error: any) {
      console.error("Error fetching published briefs:", error);
      res.status(500).json({ message: "فشل في جلب الأخبار الصوتية المنشورة" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // GET /api/audio-briefs/:id - Get brief by ID (public)
  app.get("/api/audio-briefs/:id", async (req: any, res) => {
    try {
      const brief = await storage.getAudioNewsBriefById(req.params.id);
      if (!brief) {
        return res.status(404).json({ message: "الخبر غير موجود" });
      }
      res.json(brief);
    } catch (error: any) {
      console.error("Error fetching audio brief:", error);
      res.status(500).json({ message: "فشل في جلب الخبر الصوتي" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // POST /api/audio-briefs - Create new brief (admin only)
  app.post("/api/audio-briefs",
    requireAuth,
    requireRole('admin'),
    async (req: any, res) => {
    try {
        const validatedData = insertAudioNewsBriefSchema.parse({
          ...req.body,
          createdBy: req.user.id,
        });
        const brief = await storage.createAudioNewsBrief(validatedData as any);
        res.status(201).json(brief);
      } catch (error: any) {
        console.error("Error creating audio brief:", error);
        if (error.name === 'ZodError') {
          return res.status(400).json({ message: "بيانات غير صحيحة", errors: error.errors });
        }
        res.status(500).json({ message: "فشل في إنشاء الخبر الصوتي" });
      }
    }
  );

  // POST /api/audio-briefs/:id/generate - Generate audio (admin only)
  app.post("/api/audio-briefs/:id/generate",
    requireAuth,
    requireRole('admin'),
    async (req: any, res) => {
    try {
        const brief = await storage.getAudioNewsBriefById(req.params.id);
        if (!brief) {
          return res.status(404).json({ message: "الخبر غير موجود" });
        }

        const { jobQueue } = await import("../services/job-queue");

        const jobId = await jobQueue.add('generate-audio-brief', { 
          briefId: req.params.id,
          userId: req.user.id 
        });

      res.json({ 
          status: 'queued', 
          jobId, 
          message: 'جاري التوليد في الخلفية' 
        });
      } catch (error: any) {
        console.error("Error queueing audio brief generation:", error);
        res.status(500).json({ message: "فشل في بدء توليد الصوت" });
      }
    }
  );

  // GET /api/audio-briefs/jobs/:jobId - Get job status for audio brief generation
  app.get("/api/audio-briefs/jobs/:jobId",
    requireAuth,
    async (req: any, res) => {
    try {
        const { jobQueue } = await import("../services/job-queue");
        const job = await jobQueue.getStatus(req.params.jobId);
        
        if (!job) {
          return res.status(404).json({ message: 'الوظيفة غير موجودة' });
        }
        
        res.json(job);
      } catch (error: any) {
        console.error("Error fetching job status:", error);
        res.status(500).json({ message: "فشل في جلب حالة الوظيفة" });
      }
    }
  );

  // PUT /api/audio-briefs/:id - Update brief (admin only)
  app.put("/api/audio-briefs/:id",
    requireAuth,
    requireRole('admin'),
    async (req: any, res) => {
    try {
        const brief = await storage.updateAudioNewsBrief(req.params.id, req.body);
        res.json(brief);
      } catch (error: any) {
        console.error("Error updating audio brief:", error);
        res.status(500).json({ message: "فشل في تحديث الخبر الصوتي" });
      }
    }
  );

  // POST /api/audio-briefs/:id/publish - Publish brief (admin only)
  app.post("/api/audio-briefs/:id/publish",
    requireAuth,
    requireRole('admin'),
    async (req: any, res) => {
    try {
        const brief = await storage.getAudioNewsBriefById(req.params.id);
        
        if (!brief) {
          return res.status(404).json({ message: "الخبر الصوتي غير موجود" });
        }
        
        // CRITICAL: Check generation status before allowing publish
        if (brief.generationStatus !== 'completed') {
          return res.status(400).json({ 
            message: 'لا يمكن النشر - يجب إتمام توليد الصوت أولاً' 
          });
        }
        
        if (!brief.audioUrl) {
          return res.status(400).json({ 
            message: 'لا يمكن النشر - رابط الملف الصوتي غير موجود' 
          });
        }

        const published = await storage.publishAudioNewsBrief(req.params.id);
        res.json(published);
      } catch (error: any) {
        console.error("Error publishing audio brief:", error);
        res.status(500).json({ message: "فشل في نشر الخبر الصوتي" });
      }
    }
  );

  // DELETE /api/audio-briefs/:id - Delete brief (admin only)
  app.delete("/api/audio-briefs/:id",
    requireAuth,
    requireRole('admin'),
    async (req: any, res) => {
    try {
        await storage.deleteAudioNewsBrief(req.params.id);
        res.status(204).send();
      } catch (error: any) {
        console.error("Error deleting audio brief:", error);
        res.status(500).json({ message: "فشل في حذف الخبر الصوتي" });
      }
    }
  );


}
