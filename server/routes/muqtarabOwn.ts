/**
 * مُقترب — مسارات كاتب الزاوية (الخدمة الذاتية) + مراجعة الإدارة للمواضيع.
 *
 * كاتب الزاوية (دور angle_writer) يدير زاويته الخاصة فقط:
 *   GET   /api/muqtarab/my-angle                      زاويتي + إحصاءات الحالات
 *   GET   /api/muqtarab/my-angle/topics               كل مواضيع زاويتي (جميع الحالات)
 *   POST  /api/muqtarab/my-angle/topics               إنشاء موضوع (مسودة)
 *   PATCH /api/muqtarab/my-angle/topics/:id           تعديل (مسودة/بحاجة لتعديل فقط)
 *   POST  /api/muqtarab/my-angle/topics/:id/submit    إرسال للمراجعة (→ pending_review)
 *
 * الإدارة (صلاحية muqtarab.manage) تراجع المواضيع المُرسَلة:
 *   GET   /api/admin/muqtarab/review-queue            طابور المواضيع بانتظار المراجعة
 *   POST  /api/admin/muqtarab/topics/:id/approve      نشر (→ published)
 *   POST  /api/admin/muqtarab/topics/:id/return       إرجاع للتعديل (→ needs_revision)
 *
 * الحدّ الأمني الحقيقي هو الملكية: الزاوية عبر angles.managerUserId والموضوع
 * عبر topics.createdBy. الصلاحيات (muqtarab.own.*) لإظهار عناصر الواجهة فقط.
 *
 * إشعارات/إيميلات النشر والإرجاع تُضاف في المرحلة 5 (انظر علامات TODO).
 */

import { Router } from "express";
import { asc, desc, eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../db";
import { storage } from "../storage";
import {
  topics,
  angles,
  users,
  insertTopicSchema,
  updateTopicSchema,
  type Topic,
} from "@shared/schema";
import { requireAuth, requirePermission } from "../rbac";
import {
  notifyReviewersOfPendingTopic,
  notifyAuthorTopicPublished,
  notifyAuthorTopicReturned,
} from "../services/muqtarabNotifications";
import {
  sendTopicPublishedEmail,
  sendTopicReturnedEmail,
  buildTopicUrl,
  MUQTARAB_EDIT_URL,
} from "../services/muqtarabEmails";

const router = Router();

// الحقول التي يُسمح للكاتب بتعديلها في موضوعه (لا status/angleId/createdBy/حقول المراجعة)
const WRITER_EDITABLE_FIELDS = [
  "title",
  "excerpt",
  "content",
  "heroImageUrl",
  "attachments",
  "seoMeta",
] as const;

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^\w؀-ۿ-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "topic"
  );
}

/** أوّل زاوية يملكها المستخدم (managerUserId). الكاتب يملك زاوية واحدة عادةً. */
async function getOwnedAngle(userId: string) {
  const [angle] = await db
    .select()
    .from(angles)
    .where(eq(angles.managerUserId, userId))
    .orderBy(asc(angles.createdAt))
    .limit(1);
  return angle;
}

/** يتحقق أن الموضوع يخص الكاتب: أنشأه هو، وضمن زاوية يديرها هو. */
async function checkOwnership(
  topic: Topic,
  userId: string,
): Promise<{ ok: true } | { ok: false; code: number; message: string }> {
  if (topic.createdBy !== userId) {
    return { ok: false, code: 403, message: "لا تملك صلاحية على هذا الموضوع" };
  }
  const angle = await storage.getAngleById(topic.angleId);
  if (!angle || angle.managerUserId !== userId) {
    return { ok: false, code: 403, message: "هذا الموضوع ليس ضمن زاويتك" };
  }
  return { ok: true };
}

// ============================================================
// مسارات كاتب الزاوية
// ============================================================

router.get("/api/muqtarab/my-angle", requireAuth, async (req: any, res) => {
  try {
    const angle = await getOwnedAngle(req.user.id);
    if (!angle) return res.status(404).json({ message: "لا توجد زاوية مخصّصة لحسابك" });

    const rows = await db
      .select({ status: topics.status, count: sql<number>`count(*)` })
      .from(topics)
      .where(eq(topics.angleId, angle.id))
      .groupBy(topics.status);

    const stats = {
      draft: 0,
      pending_review: 0,
      published: 0,
      needs_revision: 0,
      archived: 0,
      total: 0,
    };
    for (const r of rows) {
      const c = Number(r.count);
      if (r.status in stats) (stats as any)[r.status] = c;
      stats.total += c;
    }

    res.json({ angle, stats });
  } catch (err) {
    console.error("[my-angle] GET error:", err);
    res.status(500).json({ message: "فشل في جلب الزاوية" });
  }
});

router.get("/api/muqtarab/my-angle/topics", requireAuth, async (req: any, res) => {
  try {
    const angle = await getOwnedAngle(req.user.id);
    if (!angle) return res.status(404).json({ message: "لا توجد زاوية مخصّصة لحسابك" });

    const list = await db
      .select()
      .from(topics)
      .where(eq(topics.angleId, angle.id))
      .orderBy(desc(topics.updatedAt));

    res.json({
      angle: { id: angle.id, nameAr: angle.nameAr, slug: angle.slug },
      topics: list,
    });
  } catch (err) {
    console.error("[my-angle] GET topics error:", err);
    res.status(500).json({ message: "فشل في جلب المواضيع" });
  }
});

router.post("/api/muqtarab/my-angle/topics", requireAuth, async (req: any, res) => {
  try {
    const angle = await getOwnedAngle(req.user.id);
    if (!angle) return res.status(404).json({ message: "لا توجد زاوية مخصّصة لحسابك" });

    const title = String(req.body?.title || "").trim();
    if (!title) return res.status(400).json({ message: "العنوان مطلوب" });

    const slug = `${slugify(title)}-${nanoid(6)}`;

    const parsed = insertTopicSchema.safeParse({
      angleId: angle.id,
      title,
      slug,
      excerpt: req.body?.excerpt,
      content: req.body?.content,
      heroImageUrl: req.body?.heroImageUrl,
      attachments: req.body?.attachments,
      seoMeta: req.body?.seoMeta,
      status: "draft", // الكاتب يبدأ دائماً بمسودة؛ النشر بيد الإدارة
      createdBy: req.user.id,
    });
    if (!parsed.success) {
      return res.status(400).json({ message: "بيانات غير صحيحة", errors: parsed.error.errors });
    }

    const topic = await storage.createTopic(parsed.data);
    res.status(201).json(topic);
  } catch (err) {
    console.error("[my-angle] POST topic error:", err);
    res.status(500).json({ message: "فشل في إنشاء الموضوع" });
  }
});

router.patch("/api/muqtarab/my-angle/topics/:id", requireAuth, async (req: any, res) => {
  try {
    const topic = await storage.getTopicById(req.params.id);
    if (!topic) return res.status(404).json({ message: "الموضوع غير موجود" });

    const own = await checkOwnership(topic, req.user.id);
    if (!own.ok) return res.status(own.code).json({ message: own.message });

    if (topic.status !== "draft" && topic.status !== "needs_revision") {
      return res
        .status(409)
        .json({ message: "لا يمكن تعديل الموضوع إلا في حالة مسودة أو بحاجة لتعديل" });
    }

    const whitelist: Record<string, unknown> = {};
    for (const k of WRITER_EDITABLE_FIELDS) {
      if (req.body && k in req.body) whitelist[k] = req.body[k];
    }

    const parsed = updateTopicSchema.safeParse({ ...whitelist, updatedBy: req.user.id });
    if (!parsed.success) {
      return res.status(400).json({ message: "بيانات غير صحيحة", errors: parsed.error.errors });
    }

    const updated = await storage.updateTopic(req.params.id, parsed.data);
    res.json(updated);
  } catch (err) {
    console.error("[my-angle] PATCH topic error:", err);
    res.status(500).json({ message: "فشل في تعديل الموضوع" });
  }
});

router.post("/api/muqtarab/my-angle/topics/:id/submit", requireAuth, async (req: any, res) => {
  try {
    const topic = await storage.getTopicById(req.params.id);
    if (!topic) return res.status(404).json({ message: "الموضوع غير موجود" });

    const own = await checkOwnership(topic, req.user.id);
    if (!own.ok) return res.status(own.code).json({ message: own.message });

    if (topic.status !== "draft" && topic.status !== "needs_revision") {
      return res
        .status(409)
        .json({ message: "لا يمكن إرسال هذا الموضوع للمراجعة في حالته الحالية" });
    }

    const [updated] = await db
      .update(topics)
      .set({
        status: "pending_review",
        submittedAt: new Date(),
        reviewNotes: null,
        updatedBy: req.user.id,
        updatedAt: new Date(),
      })
      .where(eq(topics.id, req.params.id))
      .returning();

    // إشعار المراجعين داخلياً (غير حاجب)
    void (async () => {
      const angle = await storage.getAngleById(topic.angleId);
      const authorName =
        [req.user.firstName, req.user.lastName].filter(Boolean).join(" ").trim() ||
        req.user.email ||
        "كاتب";
      await notifyReviewersOfPendingTopic({
        topicId: topic.id,
        topicTitle: topic.title,
        angleName: angle?.nameAr || "زاوية",
        authorName,
        excludeUserId: req.user.id,
      });
    })().catch((e) => console.error("[my-angle] submit notify error:", e));

    res.json(updated);
  } catch (err) {
    console.error("[my-angle] submit error:", err);
    res.status(500).json({ message: "فشل في إرسال الموضوع للمراجعة" });
  }
});

// ============================================================
// مسارات مراجعة الإدارة (muqtarab.manage)
// ============================================================

router.get(
  "/api/admin/muqtarab/review-queue",
  requirePermission("muqtarab.manage"),
  async (_req: any, res) => {
    try {
      const rows = await db
        .select({
          id: topics.id,
          title: topics.title,
          slug: topics.slug,
          status: topics.status,
          submittedAt: topics.submittedAt,
          createdAt: topics.createdAt,
          angleId: angles.id,
          angleName: angles.nameAr,
          angleSlug: angles.slug,
          authorId: users.id,
          authorFirst: users.firstName,
          authorLast: users.lastName,
          authorEmail: users.email,
        })
        .from(topics)
        .innerJoin(angles, eq(topics.angleId, angles.id))
        .leftJoin(users, eq(topics.createdBy, users.id))
        .where(eq(topics.status, "pending_review"))
        .orderBy(asc(topics.submittedAt));

      res.json(
        rows.map((r) => ({
          id: r.id,
          title: r.title,
          slug: r.slug,
          status: r.status,
          submittedAt: r.submittedAt,
          createdAt: r.createdAt,
          angle: { id: r.angleId, nameAr: r.angleName, slug: r.angleSlug },
          author: {
            id: r.authorId,
            name:
              [r.authorFirst, r.authorLast].filter(Boolean).join(" ").trim() ||
              r.authorEmail ||
              "—",
            email: r.authorEmail,
          },
        })),
      );
    } catch (err) {
      console.error("[review-queue] error:", err);
      res.status(500).json({ message: "فشل في جلب طابور المراجعة" });
    }
  },
);

router.post(
  "/api/admin/muqtarab/topics/:id/approve",
  requirePermission("muqtarab.manage"),
  async (req: any, res) => {
    try {
      const topic = await storage.getTopicById(req.params.id);
      if (!topic) return res.status(404).json({ message: "الموضوع غير موجود" });
      if (topic.status !== "pending_review") {
        return res.status(409).json({ message: "الموضوع ليس بانتظار المراجعة" });
      }

      const [updated] = await db
        .update(topics)
        .set({
          status: "published",
          publishedAt: new Date(),
          reviewedBy: req.user.id,
          reviewedAt: new Date(),
          reviewNotes: null,
          updatedBy: req.user.id,
          updatedAt: new Date(),
        })
        .where(eq(topics.id, req.params.id))
        .returning();

      // إشعار + بريد الكاتب (غير حاجب)
      void (async () => {
        const angle = await storage.getAngleById(topic.angleId);
        const [author] = await db
          .select({ email: users.email, firstName: users.firstName })
          .from(users)
          .where(eq(users.id, topic.createdBy))
          .limit(1);
        await notifyAuthorTopicPublished({
          userId: topic.createdBy,
          topicId: topic.id,
          topicTitle: topic.title,
          angleName: angle?.nameAr || "زاويتك",
        });
        if (author?.email) {
          await sendTopicPublishedEmail({
            toEmail: author.email,
            firstName: (author.firstName || "").trim() || "الكاتب",
            topicTitle: topic.title,
            angleName: angle?.nameAr || "زاويتك",
            topicUrl: angle ? buildTopicUrl(angle.slug, updated.slug) : MUQTARAB_EDIT_URL,
          });
        }
      })().catch((e) => console.error("[review approve] notify error:", e));

      res.json(updated);
    } catch (err) {
      console.error("[review approve] error:", err);
      res.status(500).json({ message: "فشل في نشر الموضوع" });
    }
  },
);

router.post(
  "/api/admin/muqtarab/topics/:id/return",
  requirePermission("muqtarab.manage"),
  async (req: any, res) => {
    try {
      const notes = String(req.body?.reviewNotes || "").trim();
      const topic = await storage.getTopicById(req.params.id);
      if (!topic) return res.status(404).json({ message: "الموضوع غير موجود" });
      if (topic.status !== "pending_review") {
        return res.status(409).json({ message: "الموضوع ليس بانتظار المراجعة" });
      }

      const [updated] = await db
        .update(topics)
        .set({
          status: "needs_revision",
          reviewNotes: notes || null,
          reviewedBy: req.user.id,
          reviewedAt: new Date(),
          updatedBy: req.user.id,
          updatedAt: new Date(),
        })
        .where(eq(topics.id, req.params.id))
        .returning();

      // إشعار + بريد الكاتب (غير حاجب)
      void (async () => {
        const [author] = await db
          .select({ email: users.email, firstName: users.firstName })
          .from(users)
          .where(eq(users.id, topic.createdBy))
          .limit(1);
        await notifyAuthorTopicReturned({
          userId: topic.createdBy,
          topicId: topic.id,
          topicTitle: topic.title,
        });
        if (author?.email) {
          await sendTopicReturnedEmail({
            toEmail: author.email,
            firstName: (author.firstName || "").trim() || "الكاتب",
            topicTitle: topic.title,
            reviewNotes: notes || null,
            editUrl: MUQTARAB_EDIT_URL,
          });
        }
      })().catch((e) => console.error("[review return] notify error:", e));

      res.json(updated);
    } catch (err) {
      console.error("[review return] error:", err);
      res.status(500).json({ message: "فشل في إرجاع الموضوع" });
    }
  },
);

export default router;
