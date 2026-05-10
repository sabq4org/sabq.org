import { Router } from "express";
import { z } from "zod";
import { isAuthenticated } from "../../auth";
import { requireRole } from "../../rbac";
import {
  ifoxPreferencesService,
  ifoxTemplatesService,
  ifoxWorkflowsService,
  ifoxQualityService,
  ifoxStrategyService,
  ifoxCalendarService,
  ifoxPerformanceService,
  ifoxBudgetService,
} from "../../services/ifox";
import { 
  insertIfoxAiPreferencesSchema, 
  insertIfoxContentTemplateSchema, 
  insertIfoxWorkflowRuleSchema, 
  insertIfoxEditorialCalendarSchema 
} from "@shared/schema";

const router = Router();

/**
 * Helper function to normalize dates to ISO UTC strings
 * Converts all Date objects in an object to ISO 8601 UTC strings
 * This ensures consistent timezone handling across the frontend
 */
function normalizeDates<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (obj instanceof Date) {
    return obj.toISOString() as any;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => normalizeDates(item)) as any;
  }

  if (typeof obj === 'object') {
    const normalized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      normalized[key] = normalizeDates(value);
    }
    return normalized;
  }

  return obj;
}

// Middleware: All routes require authentication and editor+ role
router.use(isAuthenticated, requireRole("editor", "admin", "superadmin"));

// ==================== AI PREFERENCES ====================

/**
 * GET /api/ifox/ai-management/preferences
 * Get active AI preferences
 */
router.get("/preferences", async (req, res) => {
  try {
    const preferences = await ifoxPreferencesService.getActivePreferences();
    res.json(preferences || {});
  } catch (error) {
    console.error("Get preferences error:", error);
    res.status(500).json({ error: "Failed to get preferences" });
  }
});

/**
 * POST /api/ifox/ai-management/preferences
 * Update AI preferences
 */
router.post("/preferences", async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const data = insertIfoxAiPreferencesSchema.partial().parse(req.body);
    const preferences = await ifoxPreferencesService.savePreferences(data, userId);
    res.json(preferences);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Validation failed",
        details: error.errors
      });
    }
    console.error("Update preferences error:", error);
    res.status(500).json({ error: "Failed to update preferences" });
  }
});

/**
 * POST /api/ifox/ai-management/preferences/reset
 * Reset preferences to defaults
 */
router.post("/preferences/reset", async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const preferences = await ifoxPreferencesService.resetToDefaults(userId);
    res.json(preferences);
  } catch (error) {
    console.error("Reset preferences error:", error);
    res.status(500).json({ error: "Failed to reset preferences" });
  }
});

// ==================== IFOX CATEGORIES ====================

/**
 * GET /api/ifox/ai-management/categories
 * Get all iFox AI categories
 */
router.get("/categories", async (req, res) => {
  try {
    const { db } = await import("../../db");
    const { categories } = await import("@shared/schema");
    const { or, like, eq } = await import("drizzle-orm");
    
    const ifoxCategories = await db
      .select({
        id: categories.id,
        slug: categories.slug,
        name_ar: categories.nameAr,
        name_en: categories.nameEn,
        type: categories.type,
      })
      .from(categories)
      .where(
        or(
          eq(categories.slug, 'ifox-ai'),
          like(categories.slug, 'ai-%')
        )
      )
      .orderBy(categories.slug);
    
    res.json(ifoxCategories);
  } catch (error) {
    console.error("Get iFox categories error:", error);
    res.status(500).json({ error: "Failed to get iFox categories" });
  }
});

// ==================== CONTENT TEMPLATES ====================

/**
 * GET /api/ifox/ai-management/templates
 * List content templates with filters
 */
router.get("/templates", async (req, res) => {
  try {
    const { templateType, language, isActive, page, limit } = req.query;
    
    const filters = {
      templateType: templateType as string | undefined,
      language: language as string | undefined,
      isActive: isActive === "true" ? true : isActive === "false" ? false : undefined,
      page: page ? parseInt(page as string) : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
    };

    const templates = await ifoxTemplatesService.listTemplates(filters);
    res.json(templates);
  } catch (error) {
    console.error("List templates error:", error);
    res.status(500).json({ error: "Failed to list templates" });
  }
});

/**
 * POST /api/ifox/ai-management/templates
 * Create new template
 */
router.post("/templates", async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const data = insertIfoxContentTemplateSchema.parse({
      ...req.body,
      createdBy: userId,
    });

    const template = await ifoxTemplatesService.createTemplate(data);
    res.json(template);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Validation failed",
        details: error.errors
      });
    }
    console.error("Create template error:", error);
    res.status(500).json({ error: "Failed to create template" });
  }
});

/**
 * GET /api/ifox/ai-management/templates/:id
 * Get template by ID
 */
router.get("/templates/:id", async (req, res) => {
  try {
    const template = await ifoxTemplatesService.getTemplate(req.params.id);
    if (!template) {
      return res.status(404).json({ error: "Template not found" });
    }
    res.json(template);
  } catch (error) {
    console.error("Get template error:", error);
    res.status(500).json({ error: "Failed to get template" });
  }
});

/**
 * PATCH /api/ifox/ai-management/templates/:id
 * Update template
 */
router.patch("/templates/:id", async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const data = insertIfoxContentTemplateSchema.partial().parse(req.body);
    const template = await ifoxTemplatesService.updateTemplate(req.params.id, data, userId);
    res.json(template);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Validation failed",
        details: error.errors
      });
    }
    console.error("Update template error:", error);
    res.status(500).json({ error: "Failed to update template" });
  }
});

/**
 * DELETE /api/ifox/ai-management/templates/:id
 * Delete template
 */
router.delete("/templates/:id", async (req, res) => {
  try {
    await ifoxTemplatesService.deleteTemplate(req.params.id);
    res.json({ message: "Template deleted successfully" });
  } catch (error) {
    console.error("Delete template error:", error);
    res.status(500).json({ error: "Failed to delete template" });
  }
});

/**
 * POST /api/ifox/ai-management/templates/:id/use
 * Record template usage
 */
router.post("/templates/:id/use", async (req, res) => {
  try {
    await ifoxTemplatesService.recordTemplateUsage(req.params.id);
    res.json({ message: "Usage recorded" });
  } catch (error) {
    console.error("Record usage error:", error);
    res.status(500).json({ error: "Failed to record usage" });
  }
});

// ==================== WORKFLOW RULES ====================

/**
 * GET /api/ifox/ai-management/workflows
 * List workflow rules
 */
router.get("/workflows", async (req, res) => {
  try {
    const { ruleType, isActive, page, limit } = req.query;
    
    const filters = {
      ruleType: ruleType as string | undefined,
      isActive: isActive === "true" ? true : isActive === "false" ? false : undefined,
      page: page ? parseInt(page as string) : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
    };

    const rules = await ifoxWorkflowsService.listRules(filters);
    res.json(rules);
  } catch (error) {
    console.error("List rules error:", error);
    res.status(500).json({ error: "Failed to list rules" });
  }
});

/**
 * POST /api/ifox/ai-management/workflows
 * Create workflow rule
 */
router.post("/workflows", async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const data = insertIfoxWorkflowRuleSchema.parse({
      ...req.body,
      createdBy: userId,
    });

    const rule = await ifoxWorkflowsService.createRule(data);
    res.json(rule);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Validation failed",
        details: error.errors
      });
    }
    console.error("Create rule error:", error);
    res.status(500).json({ error: "Failed to create rule" });
  }
});

/**
 * GET /api/ifox/ai-management/workflows/:id
 * Get rule by ID
 */
router.get("/workflows/:id", async (req, res) => {
  try {
    const rule = await ifoxWorkflowsService.getRule(req.params.id);
    if (!rule) {
      return res.status(404).json({ error: "Rule not found" });
    }
    res.json(rule);
  } catch (error) {
    console.error("Get rule error:", error);
    res.status(500).json({ error: "Failed to get rule" });
  }
});

/**
 * PATCH /api/ifox/ai-management/workflows/:id
 * Update workflow rule
 */
router.patch("/workflows/:id", async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const data = insertIfoxWorkflowRuleSchema.partial().parse(req.body);
    const rule = await ifoxWorkflowsService.updateRule(req.params.id, data, userId);
    res.json(rule);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Validation failed",
        details: error.errors
      });
    }
    console.error("Update rule error:", error);
    res.status(500).json({ error: "Failed to update rule" });
  }
});

/**
 * DELETE /api/ifox/ai-management/workflows/:id
 * Delete workflow rule
 */
router.delete("/workflows/:id", async (req, res) => {
  try {
    await ifoxWorkflowsService.deleteRule(req.params.id);
    res.json({ message: "Rule deleted successfully" });
  } catch (error) {
    console.error("Delete rule error:", error);
    res.status(500).json({ error: "Failed to delete rule" });
  }
});

// ==================== QUALITY CHECKS ====================

/**
 * POST /api/ifox/ai-management/quality/check
 * Run quality check on content
 */
router.post("/quality/check", async (req, res) => {
  try {
    const { articleId, taskId, content, title, keywords } = req.body;

    if (!content || !title) {
      return res.status(400).json({ error: "Content and title are required" });
    }

    const qualityCheck = await ifoxQualityService.checkArticleQuality({
      articleId,
      taskId,
      content,
      title,
      keywords,
    });

    res.json(qualityCheck);
  } catch (error) {
    console.error("Quality check error:", error);
    res.status(500).json({ error: "Failed to perform quality check" });
  }
});

/**
 * GET /api/ifox/ai-management/quality/:id
 * Get quality check by ID
 */
router.get("/quality/:id", async (req, res) => {
  try {
    const check = await ifoxQualityService.getQualityCheck(req.params.id);
    if (!check) {
      return res.status(404).json({ error: "Quality check not found" });
    }
    res.json(check);
  } catch (error) {
    console.error("Get quality check error:", error);
    res.status(500).json({ error: "Failed to get quality check" });
  }
});

/**
 * GET /api/ifox/ai-management/quality
 * List quality checks
 */
router.get("/quality", async (req, res) => {
  try {
    const { articleId, taskId, passed, page, limit } = req.query;
    
    const filters = {
      articleId: articleId as string | undefined,
      taskId: taskId as string | undefined,
      passed: passed === "true" ? true : passed === "false" ? false : undefined,
      page: page ? parseInt(page as string) : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
    };

    const checks = await ifoxQualityService.listQualityChecks(filters);
    res.json(checks);
  } catch (error) {
    console.error("List quality checks error:", error);
    res.status(500).json({ error: "Failed to list quality checks" });
  }
});

/**
 * PATCH /api/ifox/ai-management/quality/:id/review
 * Update human review
 */
router.patch("/quality/:id/review", async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { humanReviewStatus, reviewNotes } = req.body;

    if (!humanReviewStatus || !["approved", "rejected"].includes(humanReviewStatus)) {
      return res.status(400).json({ error: "Invalid review status" });
    }

    const check = await ifoxQualityService.updateHumanReview(req.params.id, {
      humanReviewStatus,
      reviewedBy: userId,
      reviewNotes,
    });

    res.json(check);
  } catch (error) {
    console.error("Update review error:", error);
    res.status(500).json({ error: "Failed to update review" });
  }
});

// ==================== STRATEGY INSIGHTS ====================

/**
 * POST /api/ifox/ai-management/strategy/generate
 * Generate strategy insight
 */
router.post("/strategy/generate", async (req, res) => {
  try {
    const { insightType, context } = req.body;

    if (!insightType) {
      return res.status(400).json({ error: "Insight type is required" });
    }

    const validTypes = ["trending_topic", "content_gap", "timing_optimization", "audience_preference", "competitive_analysis"];
    if (!validTypes.includes(insightType)) {
      return res.status(400).json({ error: "Invalid insight type" });
    }

    const insight = await ifoxStrategyService.generateInsights({
      insightType,
      context,
    });

    res.json(insight);
  } catch (error) {
    console.error("Generate insight error:", error);
    res.status(500).json({ error: "Failed to generate insight" });
  }
});

/**
 * GET /api/ifox/ai-management/strategy
 * List strategy insights
 */
router.get("/strategy", async (req, res) => {
  try {
    const { insightType, status, priority, page, limit } = req.query;
    
    const filters = {
      insightType: insightType as string | undefined,
      status: status as string | undefined,
      priority: priority as string | undefined,
      page: page ? parseInt(page as string) : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
    };

    const insights = await ifoxStrategyService.listInsights(filters);
    res.json(insights);
  } catch (error) {
    console.error("List insights error:", error);
    res.status(500).json({ error: "Failed to list insights" });
  }
});

/**
 * GET /api/ifox/ai-management/strategy/:id
 * Get insight by ID
 */
router.get("/strategy/:id", async (req, res) => {
  try {
    const insight = await ifoxStrategyService.getInsight(req.params.id);
    if (!insight) {
      return res.status(404).json({ error: "Insight not found" });
    }
    res.json(insight);
  } catch (error) {
    console.error("Get insight error:", error);
    res.status(500).json({ error: "Failed to get insight" });
  }
});

/**
 * PATCH /api/ifox/ai-management/strategy/:id/status
 * Update insight status
 */
router.patch("/strategy/:id/status", async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { status } = req.body;

    if (!status || !["active", "implemented", "dismissed", "expired"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const insight = await ifoxStrategyService.updateInsightStatus(
      req.params.id,
      status,
      status === "implemented" ? userId : undefined
    );

    res.json(insight);
  } catch (error) {
    console.error("Update insight status error:", error);
    res.status(500).json({ error: "Failed to update insight status" });
  }
});

/**
 * DELETE /api/ifox/ai-management/strategy/:id
 * Delete insight
 */
router.delete("/strategy/:id", async (req, res) => {
  try {
    await ifoxStrategyService.deleteInsight(req.params.id);
    res.json({ message: "Insight deleted successfully" });
  } catch (error) {
    console.error("Delete insight error:", error);
    res.status(500).json({ error: "Failed to delete insight" });
  }
});

// ==================== EDITORIAL CALENDAR ====================

/**
 * GET /api/ifox/ai-management/calendar
 * List calendar entries
 */
router.get("/calendar", async (req, res) => {
  try {
    const { scheduledDateFrom, scheduledDateTo, status, assignmentType, page, limit } = req.query;
    
    const filters = {
      scheduledDateFrom: scheduledDateFrom ? new Date(scheduledDateFrom as string) : undefined,
      scheduledDateTo: scheduledDateTo ? new Date(scheduledDateTo as string) : undefined,
      status: status as string | undefined,
      assignmentType: assignmentType as string | undefined,
      page: page ? parseInt(page as string) : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
    };

    const entries = await ifoxCalendarService.listEntries(filters);
    res.json(normalizeDates(entries));
  } catch (error) {
    console.error("List calendar error:", error);
    res.status(500).json({ error: "Failed to list calendar entries" });
  }
});

/**
 * POST /api/ifox/ai-management/calendar
 * Create calendar entry
 */
router.post("/calendar", async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const data = insertIfoxEditorialCalendarSchema.parse({
      ...req.body,
      createdBy: userId,
      scheduledDate: typeof req.body.scheduledDate === 'string' 
        ? new Date(req.body.scheduledDate) 
        : req.body.scheduledDate,
    });

    const entry = await ifoxCalendarService.createEntry(data);
    res.json(normalizeDates(entry));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Validation failed",
        details: error.errors
      });
    }
    console.error("Create calendar entry error:", error);
    res.status(500).json({ error: "Failed to create calendar entry" });
  }
});

/**
 * GET /api/ifox/ai-management/calendar/:id
 * Get calendar entry by ID
 */
router.get("/calendar/:id", async (req, res) => {
  try {
    const entry = await ifoxCalendarService.getEntry(req.params.id);
    if (!entry) {
      return res.status(404).json({ error: "Calendar entry not found" });
    }
    res.json(normalizeDates(entry));
  } catch (error) {
    console.error("Get calendar entry error:", error);
    res.status(500).json({ error: "Failed to get calendar entry" });
  }
});

/**
 * PATCH /api/ifox/ai-management/calendar/:id
 * Update calendar entry
 */
router.patch("/calendar/:id", async (req, res) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const data = insertIfoxEditorialCalendarSchema.partial().parse({
      ...req.body,
      scheduledDate: req.body.scheduledDate && typeof req.body.scheduledDate === 'string'
        ? new Date(req.body.scheduledDate)
        : req.body.scheduledDate,
    });
    const entry = await ifoxCalendarService.updateEntry(req.params.id, data, userId);
    res.json(normalizeDates(entry));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Validation failed",
        details: error.errors
      });
    }
    console.error("Update calendar entry error:", error);
    res.status(500).json({ error: "Failed to update calendar entry" });
  }
});

/**
 * DELETE /api/ifox/ai-management/calendar/:id
 * Delete calendar entry
 */
router.delete("/calendar/:id", async (req, res) => {
  try {
    await ifoxCalendarService.deleteEntry(req.params.id);
    res.json({ message: "Calendar entry deleted successfully" });
  } catch (error) {
    console.error("Delete calendar entry error:", error);
    res.status(500).json({ error: "Failed to delete calendar entry" });
  }
});

/**
 * PATCH /api/ifox/ai-management/calendar/:id/complete
 * Mark entry as completed
 */
router.patch("/calendar/:id/complete", async (req, res) => {
  try {
    const { articleId } = req.body;

    if (!articleId) {
      return res.status(400).json({ error: "Article ID is required" });
    }

    const entry = await ifoxCalendarService.markAsCompleted(req.params.id, articleId);
    res.json(normalizeDates(entry));
  } catch (error) {
    console.error("Complete calendar entry error:", error);
    res.status(500).json({ error: "Failed to complete calendar entry" });
  }
});

// ==================== PERFORMANCE METRICS ====================

/**
 * POST /api/ifox/ai-management/performance/track
 * Track article performance
 */
router.post("/performance/track", async (req, res) => {
  try {
    const { articleId, ...data } = req.body;

    if (!articleId) {
      return res.status(400).json({ error: "Article ID is required" });
    }

    const metric = await ifoxPerformanceService.trackArticlePerformance(articleId, data);
    res.json(metric);
  } catch (error) {
    console.error("Track performance error:", error);
    res.status(500).json({ error: "Failed to track performance" });
  }
});

/**
 * GET /api/ifox/ai-management/performance/:articleId
 * Get performance metrics for article
 */
router.get("/performance/:articleId", async (req, res) => {
  try {
    const metric = await ifoxPerformanceService.getArticlePerformance(req.params.articleId);
    if (!metric) {
      return res.status(404).json({ error: "Performance metrics not found" });
    }
    res.json(metric);
  } catch (error) {
    console.error("Get performance error:", error);
    res.status(500).json({ error: "Failed to get performance" });
  }
});

/**
 * GET /api/ifox/ai-management/performance
 * List performance metrics
 */
router.get("/performance", async (req, res) => {
  try {
    const { isAiGenerated, publishedAtFrom, publishedAtTo, page, limit } = req.query;
    
    const filters = {
      isAiGenerated: isAiGenerated === "true" ? true : isAiGenerated === "false" ? false : undefined,
      publishedAtFrom: publishedAtFrom ? new Date(publishedAtFrom as string) : undefined,
      publishedAtTo: publishedAtTo ? new Date(publishedAtTo as string) : undefined,
      page: page ? parseInt(page as string) : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
    };

    const metrics = await ifoxPerformanceService.listPerformanceMetrics(filters);
    res.json(metrics);
  } catch (error) {
    console.error("List performance error:", error);
    res.status(500).json({ error: "Failed to list performance" });
  }
});

/**
 * GET /api/ifox/ai-management/metrics
 * Get aggregated performance analytics metrics
 */
router.get("/metrics", async (req, res) => {
  try {
    const { timeRange } = req.query;
    
    const validTimeRanges = ['today', 'week', 'month', 'all'];
    const range = timeRange && validTimeRanges.includes(timeRange as string)
      ? (timeRange as 'today' | 'week' | 'month' | 'all')
      : 'all';

    const metrics = await ifoxPerformanceService.getPerformanceMetrics(range);
    res.json(metrics);
  } catch (error) {
    console.error("Get metrics error:", error);
    res.status(500).json({ error: "Failed to get metrics" });
  }
});

// ==================== BUDGET TRACKING ====================

/**
 * GET /api/ifox/ai-management/budget/:period
 * Get current period budget (daily/weekly/monthly)
 */
router.get("/budget/:period", async (req, res) => {
  try {
    const { period } = req.params;

    if (!["daily", "weekly", "monthly"].includes(period)) {
      return res.status(400).json({ error: "Invalid period" });
    }

    const budget = await ifoxBudgetService.getCurrentPeriodBudget(period as "daily" | "weekly" | "monthly");
    res.json(budget);
  } catch (error) {
    console.error("Get budget error:", error);
    res.status(500).json({ error: "Failed to get budget" });
  }
});

/**
 * GET /api/ifox/ai-management/budget
 * List budget history
 */
router.get("/budget", async (req, res) => {
  try {
    const { period, startDate, endDate, page, limit } = req.query;
    
    const filters = {
      period: period as string | undefined,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      page: page ? parseInt(page as string) : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
    };

    const budgets = await ifoxBudgetService.listBudgetHistory(filters);
    res.json(budgets);
  } catch (error) {
    console.error("List budget error:", error);
    res.status(500).json({ error: "Failed to list budget history" });
  }
});

/**
 * POST /api/ifox/ai-management/budget/track
 * Track API usage
 */
router.post("/budget/track", async (req, res) => {
  try {
    const { provider, apiCalls, tokens, cost, period } = req.body;

    if (!provider || !apiCalls || !cost || !period) {
      return res.status(400).json({ error: "Provider, apiCalls, cost, and period are required" });
    }

    if (!["openai", "anthropic", "gemini", "visual-ai"].includes(provider)) {
      return res.status(400).json({ error: "Invalid provider" });
    }

    if (!["daily", "weekly", "monthly"].includes(period)) {
      return res.status(400).json({ error: "Invalid period" });
    }

    await ifoxBudgetService.trackApiUsage({
      provider,
      apiCalls,
      tokens,
      cost,
      period,
    });

    res.json({ message: "API usage tracked successfully" });
  } catch (error) {
    console.error("Track API usage error:", error);
    res.status(500).json({ error: "Failed to track API usage" });
  }
});

/**
 * GET /api/ifox/ai-management/budget/status
 * Check budget status (all periods)
 */
router.get("/budget/status", async (req, res) => {
  try {
    const status = await ifoxBudgetService.checkBudgetStatus();
    res.json(status);
  } catch (error) {
    console.error("Check budget status error:", error);
    res.status(500).json({ error: "Failed to check budget status" });
  }
});

export default router;
