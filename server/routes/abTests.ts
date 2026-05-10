import type { Express } from "express";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { experimentVariants } from "@shared/schema";
import { insertExperimentSchema, insertExperimentVariantSchema } from "@shared/schema";
import { storage } from "../storage";
import { requireAuth, requireRole, logActivity } from "../rbac";

export function registerAbTestRoutes(app: Express) {
  // Helper: Get or generate session ID
  const getOrCreateSessionId = (req: any): string => {
    if (req.session?.id) {
      return req.session.id;
    }
    if (req.sessionID) {
      return req.sessionID;
    }
    return randomUUID();
  };

  // 1. EXPERIMENT MANAGEMENT (Protected with auth)

  // GET /api/ab-tests - List all experiments (with filters)
  app.get("/api/ab-tests", requireAuth, async (req: any, res) => {
    try {
      const { status, testType } = req.query;
      
      const experiments = await storage.getAllExperiments({
        status: status as string,
        testType: testType as string,
      });

      res.json(experiments);
    } catch (error) {
      console.error("Error fetching experiments:", error);
      res.status(500).json({ message: "فشل في جلب التجارب" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // POST /api/ab-tests - Create experiment (admin/editor only)
  app.post("/api/ab-tests", requireAuth, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user || !['admin', 'editor'].includes(user.role)) {
        return res.status(403).json({ message: "غير مصرح لك بإنشاء التجارب" });
      }

      // Validate request body
      const validatedData = insertExperimentSchema.parse({
        ...req.body,
        createdBy: req.user.id,
        status: 'draft', // Always start as draft
      });

      const experiment = await storage.createExperiment(validatedData);

      await logActivity({
        userId: req.user.id,
        action: 'ExperimentCreated',
        entityType: 'Experiment',
        entityId: experiment.id,
        newValue: { name: experiment.name },
      });

      res.status(201).json(experiment);
    } catch (error: any) {
      console.error("Error creating experiment:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: error.errors });
      }
      res.status(500).json({ message: "فشل في إنشاء التجربة" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // GET /api/ab-tests/:id - Get experiment by ID
  app.get("/api/ab-tests/:id", requireAuth, async (req: any, res) => {
    try {
      const experiment = await storage.getExperimentById(req.params.id);
      
      if (!experiment) {
        return res.status(404).json({ message: "التجربة غير موجودة" });
      }

      // Get variants as well
      const variants = await storage.getExperimentVariants(req.params.id);

      res.json({ ...experiment, variants });
    } catch (error) {
      console.error("Error fetching experiment:", error);
      res.status(500).json({ message: "فشل في جلب التجربة" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // PATCH /api/ab-tests/:id - Update experiment (admin/editor only)
  app.patch("/api/ab-tests/:id", requireAuth, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user || !['admin', 'editor'].includes(user.role)) {
        return res.status(403).json({ message: "غير مصرح لك بتعديل التجارب" });
      }

      const experiment = await storage.getExperimentById(req.params.id);
      if (!experiment) {
        return res.status(404).json({ message: "التجربة غير موجودة" });
      }

      // Cannot update running experiment (except to pause)
      if (experiment.status === 'running') {
        return res.status(400).json({ 
          message: "لا يمكن تعديل تجربة قيد التشغيل. يرجى إيقافها مؤقتاً أولاً" 
        });
      }

      const updatedExperiment = await storage.updateExperiment(req.params.id, req.body);

      await logActivity({
        userId: req.user.id,
        action: 'ExperimentUpdated',
        entityType: 'Experiment',
        entityId: updatedExperiment.id,
        newValue: req.body,
      });

      res.json(updatedExperiment);
    } catch (error) {
      console.error("Error updating experiment:", error);
      res.status(500).json({ message: "فشل في تحديث التجربة" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // DELETE /api/ab-tests/:id - Delete experiment (admin only)
  app.delete("/api/ab-tests/:id", requireAuth, requireRole("admin"), async (req: any, res) => {
    try {
      const experiment = await storage.getExperimentById(req.params.id);
      if (!experiment) {
        return res.status(404).json({ message: "التجربة غير موجودة" });
      }

      // Cannot delete running experiments
      if (experiment.status === 'running') {
        return res.status(400).json({ 
          message: "لا يمكن حذف تجربة قيد التشغيل. يرجى إيقافها أولاً" 
        });
      }

      await storage.deleteExperiment(req.params.id);

      await logActivity({
        userId: req.user.id,
        action: 'ExperimentDeleted',
        entityType: 'Experiment',
        entityId: req.params.id,
        oldValue: { name: experiment.name },
      });

      res.json({ success: true, message: "تم حذف التجربة بنجاح" });
    } catch (error) {
      console.error("Error deleting experiment:", error);
      res.status(500).json({ message: "فشل في حذف التجربة" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // POST /api/ab-tests/:id/start - Start experiment (admin/editor only)
  app.post("/api/ab-tests/:id/start", requireAuth, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user || !['admin', 'editor'].includes(user.role)) {
        return res.status(403).json({ message: "غير مصرح لك ببدء التجارب" });
      }

      const experiment = await storage.getExperimentById(req.params.id);
      if (!experiment) {
        return res.status(404).json({ message: "التجربة غير موجودة" });
      }

      if (experiment.status === 'running') {
        return res.status(400).json({ message: "التجربة قيد التشغيل بالفعل" });
      }

      // Validate: Must have at least 2 variants
      const variants = await storage.getExperimentVariants(req.params.id);
      if (variants.length < 2) {
        return res.status(400).json({ 
          message: "يجب أن تحتوي التجربة على نسختين على الأقل قبل البدء" 
        });
      }

      // Validate: Traffic allocation must equal 100%
      const totalAllocation = variants.reduce((sum, v) => sum + v.trafficAllocation, 0);
      if (totalAllocation !== 100) {
        return res.status(400).json({ 
          message: `نسبة توزيع الزيارات يجب أن تساوي 100% (حالياً: ${totalAllocation}%)` 
        });
      }

      const startedExperiment = await storage.startExperiment(req.params.id);

      await logActivity({
        userId: req.user.id,
        action: 'ExperimentStarted',
        entityType: 'Experiment',
        entityId: startedExperiment.id,
      });

      res.json(startedExperiment);
    } catch (error) {
      console.error("Error starting experiment:", error);
      res.status(500).json({ message: "فشل في بدء التجربة" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // POST /api/ab-tests/:id/pause - Pause experiment (admin/editor only)
  app.post("/api/ab-tests/:id/pause", requireAuth, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user || !['admin', 'editor'].includes(user.role)) {
        return res.status(403).json({ message: "غير مصرح لك بإيقاف التجارب" });
      }

      const experiment = await storage.getExperimentById(req.params.id);
      if (!experiment) {
        return res.status(404).json({ message: "التجربة غير موجودة" });
      }

      if (experiment.status !== 'running') {
        return res.status(400).json({ message: "التجربة ليست قيد التشغيل" });
      }

      const pausedExperiment = await storage.pauseExperiment(req.params.id);

      await logActivity({
        userId: req.user.id,
        action: 'ExperimentPaused',
        entityType: 'Experiment',
        entityId: pausedExperiment.id,
      });

      res.json(pausedExperiment);
    } catch (error) {
      console.error("Error pausing experiment:", error);
      res.status(500).json({ message: "فشل في إيقاف التجربة" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // POST /api/ab-tests/:id/complete - Complete experiment (admin/editor only)
  app.post("/api/ab-tests/:id/complete", requireAuth, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user || !['admin', 'editor'].includes(user.role)) {
        return res.status(403).json({ message: "غير مصرح لك بإكمال التجارب" });
      }

      const experiment = await storage.getExperimentById(req.params.id);
      if (!experiment) {
        return res.status(404).json({ message: "التجربة غير موجودة" });
      }

      const { winnerVariantId } = req.body;

      // Validate winner variant if provided
      if (winnerVariantId) {
        const variants = await storage.getExperimentVariants(req.params.id);
        const winnerExists = variants.some(v => v.id === winnerVariantId);
        if (!winnerExists) {
          return res.status(400).json({ message: "النسخة الفائزة غير موجودة في التجربة" });
        }
      }

      const completedExperiment = await storage.completeExperiment(req.params.id, winnerVariantId);

      await logActivity({
        userId: req.user.id,
        action: 'ExperimentCompleted',
        entityType: 'Experiment',
        entityId: completedExperiment.id,
        newValue: { winnerVariantId },
      });

      res.json(completedExperiment);
    } catch (error) {
      console.error("Error completing experiment:", error);
      res.status(500).json({ message: "فشل في إكمال التجربة" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // GET /api/ab-tests/:id/analytics - Get analytics
  app.get("/api/ab-tests/:id/analytics", requireAuth, async (req: any, res) => {
    try {
      // Readers can view analytics
      const analytics = await storage.getExperimentAnalytics(req.params.id);
      
      if (!analytics.experiment) {
        return res.status(404).json({ message: "التجربة غير موجودة" });
      }

      res.json(analytics);
    } catch (error) {
      console.error("Error fetching experiment analytics:", error);
      res.status(500).json({ message: "فشل في جلب تحليلات التجربة" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // 2. VARIANT MANAGEMENT (Protected with auth)

  // POST /api/ab-tests/:id/variants - Create variant (admin/editor only)
  app.post("/api/ab-tests/:id/variants", requireAuth, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user || !['admin', 'editor'].includes(user.role)) {
        return res.status(403).json({ message: "غير مصرح لك بإنشاء النسخ" });
      }

      const experiment = await storage.getExperimentById(req.params.id);
      if (!experiment) {
        return res.status(404).json({ message: "التجربة غير موجودة" });
      }

      // Cannot add variants to running experiment
      if (experiment.status === 'running') {
        return res.status(400).json({ 
          message: "لا يمكن إضافة نسخ لتجربة قيد التشغيل" 
        });
      }

      // Validate request body
      const validatedData = insertExperimentVariantSchema.parse({
        ...req.body,
        experimentId: req.params.id,
      });

      const variant = await storage.createExperimentVariant(validatedData);

      await logActivity({
        userId: req.user.id,
        action: 'VariantCreated',
        entityType: 'ExperimentVariant',
        entityId: variant.id,
        newValue: { experimentId: req.params.id, name: variant.name },
      });

      res.status(201).json(variant);
    } catch (error: any) {
      console.error("Error creating variant:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: error.errors });
      }
      res.status(500).json({ message: "فشل في إنشاء النسخة" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // GET /api/ab-tests/:id/variants - Get all variants
  app.get("/api/ab-tests/:id/variants", requireAuth, async (req: any, res) => {
    try {
      const variants = await storage.getExperimentVariants(req.params.id);
      res.json(variants);
    } catch (error) {
      console.error("Error fetching variants:", error);
      res.status(500).json({ message: "فشل في جلب النسخ" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // PATCH /api/ab-tests/variants/:variantId - Update variant (admin/editor only)
  app.patch("/api/ab-tests/variants/:variantId", requireAuth, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user || !['admin', 'editor'].includes(user.role)) {
        return res.status(403).json({ message: "غير مصرح لك بتعديل النسخ" });
      }

      // Get the variant first to check its experiment status
      const variants = await db
        .select()
        .from(experimentVariants)
        .where(eq(experimentVariants.id, req.params.variantId))
        .limit(1);

      if (variants.length === 0) {
        return res.status(404).json({ message: "النسخة غير موجودة" });
      }

      const variant = variants[0];
      const experiment = await storage.getExperimentById(variant.experimentId);

      if (experiment && experiment.status === 'running') {
        return res.status(400).json({ 
          message: "لا يمكن تعديل نسخ تجربة قيد التشغيل" 
        });
      }

      // Validate request body
      const validatedData = updateExperimentVariantSchema.parse(req.body);

      const updatedVariant = await storage.updateExperimentVariant(req.params.variantId, validatedData);

      await logActivity({
        userId: req.user.id,
        action: 'VariantUpdated',
        entityType: 'ExperimentVariant',
        entityId: updatedVariant.id,
      });

      res.json(updatedVariant);
    } catch (error: any) {
      console.error("Error updating variant:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: error.errors });
      }
      res.status(500).json({ message: "فشل في تحديث النسخة" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // DELETE /api/ab-tests/variants/:variantId - Delete variant (admin only)
  app.delete("/api/ab-tests/variants/:variantId", requireAuth, requireRole("admin"), async (req: any, res) => {
    try {
      // Get the variant first to check its experiment status
      const variants = await db
        .select()
        .from(experimentVariants)
        .where(eq(experimentVariants.id, req.params.variantId))
        .limit(1);

      if (variants.length === 0) {
        return res.status(404).json({ message: "النسخة غير موجودة" });
      }

      const variant = variants[0];
      const experiment = await storage.getExperimentById(variant.experimentId);

      if (experiment && experiment.status === 'running') {
        return res.status(400).json({ 
          message: "لا يمكن حذف نسخ من تجربة قيد التشغيل" 
        });
      }

      await storage.deleteExperimentVariant(req.params.variantId);

      await logActivity({
        userId: req.user.id,
        action: 'VariantDeleted',
        entityType: 'ExperimentVariant',
        entityId: req.params.variantId,
      });

      res.json({ success: true, message: "تم حذف النسخة بنجاح" });
    } catch (error) {
      console.error("Error deleting variant:", error);
      res.status(500).json({ message: "فشل في حذف النسخة" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // 3. TRACKING ENDPOINTS (Public - no auth required)

  // POST /api/ab-tests/track/exposure - Record exposure (visitor saw variant)
  app.post("/api/ab-tests/track/exposure", async (req: any, res) => {
    try {
      const { experimentId, variantId } = req.body;

      if (!experimentId || !variantId) {
        return res.status(400).json({ message: "experimentId و variantId مطلوبان" });
      }

      const sessionId = getOrCreateSessionId(req);
      const userId = req.user?.id || null;

      // Validate request body
      const validatedData = insertExperimentExposureSchema.parse({
        experimentId,
        variantId,
        userId,
        sessionId,
        userAgent: req.headers['user-agent'],
        referrer: req.headers['referer'] || req.headers['referrer'],
      });

      const exposure = await storage.recordExperimentExposure(validatedData);

      res.status(201).json({ success: true, exposureId: exposure.id });
    } catch (error: any) {
      console.error("Error recording exposure:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: error.errors });
      }
      res.status(500).json({ message: "فشل في تسجيل المشاهدة" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // POST /api/ab-tests/track/conversion - Record conversion (click/read/like)
  app.post("/api/ab-tests/track/conversion", async (req: any, res) => {
    try {
      const { experimentId, variantId, exposureId, conversionType, value, metadata } = req.body;

      if (!experimentId || !variantId || !exposureId || !conversionType) {
        return res.status(400).json({ 
          message: "experimentId, variantId, exposureId, و conversionType مطلوبة" 
        });
      }

      // Validate conversion type
      const validConversionTypes = ['click', 'read', 'like', 'share', 'comment', 'bookmark'];
      if (!validConversionTypes.includes(conversionType)) {
        return res.status(400).json({ 
          message: `نوع التحويل غير صالح. القيم المسموحة: ${validConversionTypes.join(', ')}` 
        });
      }

      // Validate request body
      const validatedData = insertExperimentConversionSchema.parse({
        experimentId,
        variantId,
        exposureId,
        conversionType,
        value: value || null,
        metadata: metadata || null,
      });

      const conversion = await storage.recordExperimentConversion(validatedData);

      res.status(201).json({ success: true, conversionId: conversion.id });
    } catch (error: any) {
      console.error("Error recording conversion:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: "بيانات غير صالحة", errors: error.errors });
      }
      res.status(500).json({ message: "فشل في تسجيل التحويل" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

  // GET /api/ab-tests/assign/:experimentId - Assign variant to user/session
  app.get("/api/ab-tests/assign/:experimentId", async (req: any, res) => {
    try {
      const sessionId = getOrCreateSessionId(req);
      const userId = req.user?.id || null;

      const variant = await storage.assignExperimentVariant(
        req.params.experimentId,
        userId || undefined,
        sessionId
      );

      if (!variant) {
        return res.status(404).json({ message: "التجربة غير موجودة أو غير نشطة" });
      }

      res.json({ 
        variant,
        sessionId, // Return sessionId so frontend can store it if needed
      });
    } catch (error) {
      console.error("Error assigning variant:", error);
      res.status(500).json({ message: "فشل في تعيين النسخة" });
    }
  });

  // News Analytics Endpoint - Smart statistics and insights

}
