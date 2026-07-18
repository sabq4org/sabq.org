/**
 * مسارات رادار الفجوات التحريرية — لوحة التحكم فقط.
 *
 * الصلاحيات تُحاكي مسار إحصاءات لوحة التحكم: العرض dashboard.view_stats،
 * والعمليات التحريرية (تعيين/مسودة/استبعاد) articles.create لأنها تُنشئ
 * مقالات ومهام. كل الرسائل بالعربية بأسلوب مسارات الرادار.
 */
import type { Express } from "express";
import { z } from "zod";
import { nanoid } from "nanoid";
import { requireAuth, requirePermission } from "../rbac";
import { PERMISSION_CODES } from "@shared/rbac-constants";
import { storage } from "../storage";
import { getItem } from "../services/radar/repo";
import { transformItem } from "../services/radar/transformer";
import { exportItemToArticle } from "../services/radar/exporter";
import { getEditorsForArticle } from "./editorPresence";
import {
  COVERAGE_GAP_STATUSES,
  coverageGapMatcherState,
  getCoverageGap,
  listCoverageGaps,
  refreshCoverageGaps,
  refreshCoverageGapsIfStale,
  updateCoverageGap,
} from "../services/coverageGapMatcher";

const canView = requirePermission(PERMISSION_CODES.DASHBOARD_VIEW_STATS);
const canWork = requirePermission(PERMISSION_CODES.ARTICLES_CREATE);

const listQuerySchema = z.object({
  status: z
    .string()
    .transform((value) => value.split(",").map((s) => s.trim()))
    .pipe(z.array(z.enum(COVERAGE_GAP_STATUSES)).min(1))
    .optional(),
});

const assignBodySchema = z.object({
  userId: z.string().trim().min(1).optional(),
  note: z.string().trim().max(1000).optional(),
  dueAt: z.coerce.date().optional(),
});

const dismissBodySchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export function registerCoverageGapRoutes(app: Express) {
  // ---------- قائمة الفجوات الحالية ----------
  app.get("/api/admin/dashboard/coverage-gaps", requireAuth, canView, async (req, res) => {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ message: "معاملات استعلام غير صالحة" });
    }
    try {
      // تحديث كسول عند قِدم البيانات (> دقيقتين) — لا يحجب الاستجابة
      refreshCoverageGapsIfStale();
      const gaps = await listCoverageGaps(parsed.data.status);
      const enriched = gaps.map((gap) => ({
        ...gap,
        // مَن يحرّر مسودة التغطية الآن (من خدمة حضور المحررين)
        activeEditors:
          gap.coveredByArticleId && (gap.status === "drafting" || gap.status === "scheduled")
            ? getEditorsForArticle(gap.coveredByArticleId)
            : [],
      }));
      res.json({ gaps: enriched, matcher: coverageGapMatcherState() });
    } catch (error) {
      console.error("[CoverageGap API] list failed:", error);
      res.status(500).json({ message: "تعذر جلب فجوات التغطية" });
    }
  });

  // ---------- تحديث يدوي — المسار الوحيد لتشغيل المطابقة منذ إيقاف التلقائي ----------
  app.post("/api/admin/coverage-gaps/refresh", requireAuth, canWork, async (_req, res) => {
    try {
      const summary = await refreshCoverageGaps("manual");
      if (!summary) {
        return res.status(409).json({ message: "تحديث آخر قيد التنفيذ — انتظر لحظات ثم أعد المحاولة" });
      }
      res.json({ summary, matcher: coverageGapMatcherState() });
    } catch (error) {
      console.error("[CoverageGap API] manual refresh failed:", error);
      res.status(500).json({ message: "تعذر تحديث فجوات التغطية" });
    }
  });

  // ---------- تعيين فجوة لمحرر — مهمة في التقويم التحريري ----------
  app.post("/api/admin/coverage-gaps/:id/assign", requireAuth, canWork, async (req: any, res) => {
    const parsed = assignBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ message: "بيانات التعيين غير صالحة", issues: parsed.error.issues });
    }
    try {
      const gap = await getCoverageGap(String(req.params.id));
      if (!gap) return res.status(404).json({ message: "الفجوة غير موجودة" });
      if (gap.status === "dismissed") {
        return res.status(409).json({ message: "الفجوة مستبعدة — لا يمكن تعيينها" });
      }

      const targetUserId = parsed.data.userId ?? req.user.id;
      const targetUser = await storage.getUser(targetUserId);
      if (!targetUser) return res.status(404).json({ message: "المستخدم المطلوب تعيينه غير موجود" });

      const item = await getItem(gap.radarItemId);
      const topicTitle = item?.translatedTitle || item?.originalTitle || "موضوع مرصود";
      const dueAt = parsed.data.dueAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000);

      // حدث تقويم داخلي + مهمة تغطية مرتبطة به (نفس نمط مسارات التقويم)
      const event = await storage.createCalendarEvent({
        title: `تغطية فجوة: ${topicTitle}`.substring(0, 500),
        slug: `coverage-gap-${nanoid(10)}`,
        dateStart: dueAt,
        type: "INTERNAL",
        importance: 3,
        tags: ["coverage-gap"],
        source: "coverage-gap-radar",
        description: (parsed.data.note || `فجوة تغطية مرصودة من الرادار الذكي: ${item?.link ?? ""}`).substring(0, 2000),
        createdById: req.user.id,
      } as any);

      const assignment = await storage.createCalendarAssignment({
        eventId: event.id,
        userId: targetUserId,
        role: "editor",
        status: "planned",
        notes: parsed.data.note ?? null,
        assignedBy: req.user.id,
      } as any);

      const updated = await updateCoverageGap(gap.id, { assignedTo: targetUserId });
      res.status(201).json({ gap: updated, assignmentId: assignment.id, eventId: event.id });
    } catch (error) {
      console.error("[CoverageGap API] assign failed:", error);
      res.status(500).json({ message: "تعذر تعيين الفجوة" });
    }
  });

  // ---------- إنشاء مسودة من مادة الرادار — يعيد استخدام خط الرادار كاملًا ----------
  app.post("/api/admin/coverage-gaps/:id/draft", requireAuth, canWork, async (req: any, res) => {
    try {
      const gap = await getCoverageGap(String(req.params.id));
      if (!gap) return res.status(404).json({ message: "الفجوة غير موجودة" });
      if (gap.status === "dismissed") {
        return res.status(409).json({ message: "الفجوة مستبعدة — لا يمكن إنشاء مسودة لها" });
      }
      if (gap.coveredByArticleId) {
        return res.json({ articleId: gap.coveredByArticleId });
      }

      let item = await getItem(gap.radarItemId);
      if (!item) return res.status(404).json({ message: "مادة الرادار غير موجودة" });

      // نفس مسار زر الرادار: تحويل تحريري (إن لزم) ثم تصدير إلى مقال
      if (!item.draft) {
        item = await transformItem(item);
      }
      const { articleId } = await exportItemToArticle(item.id, req.user.id);

      const updated = await updateCoverageGap(gap.id, {
        status: "drafting",
        coveredByArticleId: articleId,
      });
      res.json({ articleId, gap: updated });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === "RADAR_ITEM_NOT_FOUND") {
        return res.status(404).json({ message: "مادة الرادار غير موجودة" });
      }
      if (message === "RADAR_DRAFT_MISSING") {
        return res.status(409).json({ message: "تعذر توليد المسودة التحريرية — حاول مجددًا" });
      }
      console.error("[CoverageGap API] draft failed:", error);
      res.status(502).json({ message: "تعذر إنشاء المسودة من مادة الرادار — حاول مجددًا" });
    }
  });

  // ---------- استبعاد فجوة ----------
  app.post("/api/admin/coverage-gaps/:id/dismiss", requireAuth, canWork, async (req: any, res) => {
    const parsed = dismissBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ message: "بيانات الاستبعاد غير صالحة", issues: parsed.error.issues });
    }
    try {
      const gap = await getCoverageGap(String(req.params.id));
      if (!gap) return res.status(404).json({ message: "الفجوة غير موجودة" });
      if (gap.status === "dismissed") {
        return res.status(409).json({ message: "الفجوة مستبعدة مسبقًا" });
      }
      const updated = await updateCoverageGap(gap.id, {
        status: "dismissed",
        dismissedBy: req.user.id,
        dismissedAt: new Date(),
        dismissReason: parsed.data.reason ?? null,
      });
      res.json({ gap: updated });
    } catch (error) {
      console.error("[CoverageGap API] dismiss failed:", error);
      res.status(500).json({ message: "تعذر استبعاد الفجوة" });
    }
  });
}
