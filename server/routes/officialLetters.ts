// ----------------------------------------------------------------------------
// الخطابات الرسمية — مسارات /api/official-letters/*
//
// البوابة: staff_profiles.view للعرض، staff_profiles.manage للإصدار والإلغاء
// (يملكهما admin عبر superuser shortcut ودور الموارد البشرية).
// مسار التحقق العام بلا مصادقة ويعرض الحد الأدنى من البيانات.
//
// لا استيراد db هنا (ADR-001) — كل البيانات عبر officialLetterService.
// ----------------------------------------------------------------------------

import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { isAuthenticated } from "../auth";
import { getUserPermissions } from "../rbac";
import {
  OFFICIAL_LETTER_TYPES,
  OFFICIAL_LETTER_TYPE_LIST,
  isOfficialLetterType,
  isValidLetterReference,
  type OfficialLetterType,
} from "@shared/officialLetters";
import {
  approveLetterRequest,
  getLetterPdf,
  getLetterReadiness,
  issueLetter,
  listLetterRequests,
  listLetters,
  rejectLetterRequest,
  requestSelfLetter,
  resolveLetterSubject,
  revokeLetter,
  verifyLetterByReference,
} from "../services/officialLetterService";

const router = Router();

function currentUserId(req: Request): string | null {
  return (req.user as { id?: string } | undefined)?.id ?? null;
}

function requirePermission(code: string) {
  return async (req: Request, res: Response, next: () => void) => {
    const userId = currentUserId(req);
    if (!userId) return res.status(401).json({ message: "غير مصرح" });
    const perms = await getUserPermissions(userId);
    if (perms.includes(code) || perms.includes("*")) return next();
    return res.status(403).json({ message: "لا تملك صلاحية إدارة الخطابات الرسمية" });
  };
}

const issueSchema = z.object({
  subjectUserId: z.string().min(1, "المنسوب مطلوب"),
  letterType: z.enum(OFFICIAL_LETTER_TYPES),
  recipientEntity: z.string().trim().max(200).optional().nullable(),
  purposeNote: z.string().trim().max(600).optional().nullable(),
  ticketId: z.string().uuid().optional().nullable(),
});

const requestSchema = z.object({
  letterType: z.enum(OFFICIAL_LETTER_TYPES),
  recipientEntity: z.string().trim().max(200).optional().nullable(),
  note: z.string().trim().max(600).optional().nullable(),
});

// ────────────────────────────────────────────────────────────────────
// عام — التحقق من صحة خطاب (يُسجَّل قبل بوابة المصادقة)
// ────────────────────────────────────────────────────────────────────

const verifyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "محاولات كثيرة، حاول بعد قليل" },
  validate: { xForwardedForHeader: false, ip: false, keyGeneratorIpFallback: false },
});

router.get(
  "/api/official-letters/verify/:code",
  verifyLimiter,
  async (req: Request, res: Response) => {
    try {
      const code = String(req.params.code || "").trim().toUpperCase();
      if (!isValidLetterReference(code)) {
        return res.status(404).json({ found: false, message: "رقم مرجعي غير صحيح" });
      }
      const letter = await verifyLetterByReference(code);
      if (!letter) return res.status(404).json({ found: false, message: "لا يوجد خطاب بهذا الرقم" });
      res.set("Cache-Control", "private, no-store");
      return res.json({ found: true, letter });
    } catch (error) {
      console.error("[officialLetters] verify failed:", error);
      return res.status(500).json({ found: false, message: "تعذر التحقق من الخطاب" });
    }
  },
);

// ────────────────────────────────────────────────────────────────────
// ما بعد هذه النقطة يتطلب جلسة
// ────────────────────────────────────────────────────────────────────

router.use("/api/official-letters", isAuthenticated);

router.get("/api/official-letters/types", async (_req: Request, res: Response) => {
  res.json({ types: OFFICIAL_LETTER_TYPE_LIST });
});

/** خطاباتي — لكل منسوب أن يرى ويحمّل خطاباته. */
router.get("/api/official-letters/mine", async (req: Request, res: Response) => {
  try {
    const userId = currentUserId(req)!;
    res.json({ letters: await listLetters({ subjectUserId: userId }) });
  } catch (error) {
    console.error("[officialLetters] mine failed:", error);
    res.status(500).json({ message: "تعذر جلب خطاباتك" });
  }
});

/**
 * جاهزية بياناتي لإصدار خطاب — يستدعيها المنسوب قبل إرسال الطلب
 * ليعرف الحقول الناقصة وأثرها بدل أن يكتشفها بعد وصول الخطاب.
 */
router.get("/api/official-letters/my-readiness", async (req: Request, res: Response) => {
  try {
    const userId = currentUserId(req)!;
    const raw = typeof req.query.letterType === "string" ? req.query.letterType : "";
    const letterType: OfficialLetterType = isOfficialLetterType(raw) ? raw : "media_license";
    res.json(await getLetterReadiness(userId, letterType));
  } catch (error) {
    console.error("[officialLetters] readiness failed:", error);
    res.status(500).json({ message: "تعذر فحص بياناتك" });
  }
});

/** طلباتي. */
router.get("/api/official-letters/requests/mine", async (req: Request, res: Response) => {
  try {
    const userId = currentUserId(req)!;
    res.json({ requests: await listLetterRequests({ requesterUserId: userId }) });
  } catch (error) {
    console.error("[officialLetters] my requests failed:", error);
    res.status(500).json({ message: "تعذر جلب طلباتك" });
  }
});

/** طلب شهادة من المنسوب — يُصدر فوراً عند اكتمال البيانات (بلا انتظار HR). */
router.post("/api/official-letters/requests", async (req: Request, res: Response) => {
  try {
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "بيانات غير صحيحة" });
    }
    const userId = currentUserId(req)!;
    const result = await requestSelfLetter({
      requesterUserId: userId,
      letterType: parsed.data.letterType as OfficialLetterType,
      recipientEntity: parsed.data.recipientEntity ?? null,
      note: parsed.data.note ?? null,
    });
    res.status(201).json({
      ok: true,
      issued: true,
      letter: {
        id: result.letter.id,
        referenceCode: result.letter.referenceCode,
        issuedAt: result.letter.issuedAt,
      },
    });
  } catch (error: any) {
    const msg = error?.message || "تعذر إصدار الشهادة";
    const code = /سارية|أكمل|غير كافية|الاسم/.test(msg) ? 409 : 500;
    if (code === 500) console.error("[officialLetters] self issue failed:", error);
    res.status(code).json({ message: msg });
  }
});

// ────────────────────────────────────────────────────────────────────
// إداري
// ────────────────────────────────────────────────────────────────────

router.get(
  "/api/official-letters",
  requirePermission("staff_profiles.view"),
  async (req: Request, res: Response) => {
    try {
      const subjectUserId =
        typeof req.query.subjectUserId === "string" ? req.query.subjectUserId : undefined;
      res.json({ letters: await listLetters({ subjectUserId }) });
    } catch (error) {
      console.error("[officialLetters] list failed:", error);
      res.status(500).json({ message: "تعذر جلب الخطابات" });
    }
  },
);

/** بيانات المنسوب المرشّحة للطباعة + الحقول الناقصة (للمعاينة قبل الإصدار). */
router.get(
  "/api/official-letters/subjects/:userId",
  requirePermission("staff_profiles.manage"),
  async (req: Request, res: Response) => {
    try {
      const actorId = currentUserId(req)!;
      const perms = await getUserPermissions(actorId);
      const canSeeNationalId =
        perms.includes("staff_documents.view") || perms.includes("*");

      const resolved = await resolveLetterSubject(req.params.userId, {
        includeNationalId: canSeeNationalId,
      });
      if (!resolved) {
        return res.status(404).json({ message: "تعذر تكوين بيانات المنسوب" });
      }

      const { subject, gaps } = resolved;
      res.json({
        subject: {
          ...subject,
          // لا يُعاد رقم الهوية كاملاً للواجهة — يكفي علم توفره
          nationalId: undefined,
          hasNationalId: Boolean(subject.nationalId),
        },
        gaps,
      });
    } catch (error) {
      console.error("[officialLetters] subject failed:", error);
      res.status(500).json({ message: "تعذر جلب بيانات المنسوب" });
    }
  },
);

router.post(
  "/api/official-letters",
  requirePermission("staff_profiles.manage"),
  async (req: Request, res: Response) => {
    try {
      const parsed = issueSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "بيانات غير صحيحة" });
      }
      const actorId = currentUserId(req)!;
      const letter = await issueLetter({
        subjectUserId: parsed.data.subjectUserId,
        letterType: parsed.data.letterType as OfficialLetterType,
        recipientEntity: parsed.data.recipientEntity ?? null,
        purposeNote: parsed.data.purposeNote ?? null,
        source: parsed.data.ticketId ? "ticket" : "admin",
        ticketId: parsed.data.ticketId ?? null,
        issuedByUserId: actorId,
      });
      res.status(201).json({ ok: true, letter });
    } catch (error: any) {
      const msg = error?.message || "تعذر إصدار الخطاب";
      const badInput = /بيانات المنسوب|الاسم الكامل/.test(msg);
      if (!badInput) console.error("[officialLetters] issue failed:", error);
      res.status(badInput ? 400 : 500).json({ message: msg });
    }
  },
);

/** تنزيل الخطاب — للإدارة أو لصاحب الخطاب نفسه. */
router.get("/api/official-letters/:id/file.pdf", async (req: Request, res: Response) => {
  try {
    const actorId = currentUserId(req)!;
    const perms = await getUserPermissions(actorId);
    const isStaffViewer =
      perms.includes("staff_profiles.view") || perms.includes("*");

    const own = await listLetters({ subjectUserId: actorId });
    const isOwner = own.some((l) => l.id === req.params.id);
    if (!isStaffViewer && !isOwner) {
      return res.status(403).json({ message: "لا تملك صلاحية تحميل هذا الخطاب" });
    }

    const result = await getLetterPdf(req.params.id);
    if (!result) return res.status(404).json({ message: "الخطاب غير موجود" });

    if ("redirectUrl" in result) {
      return res.redirect(result.redirectUrl);
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${result.referenceCode}.pdf"`,
    );
    res.setHeader("Cache-Control", "private, no-store");
    return res.send(result.buffer);
  } catch (error) {
    console.error("[officialLetters] download failed:", error);
    res.status(500).json({ message: "تعذر تحميل الخطاب" });
  }
});

router.post(
  "/api/official-letters/:id/revoke",
  requirePermission("staff_profiles.manage"),
  async (req: Request, res: Response) => {
    try {
      const actorId = currentUserId(req)!;
      const reason = typeof req.body?.reason === "string" ? req.body.reason : "";
      const done = await revokeLetter(req.params.id, actorId, reason);
      if (!done) return res.status(400).json({ message: "الخطاب ملغى مسبقاً أو غير موجود" });
      res.json({ ok: true });
    } catch (error: any) {
      const msg = error?.message || "تعذر إلغاء الخطاب";
      const badInput = /سبب/.test(msg);
      if (!badInput) console.error("[officialLetters] revoke failed:", error);
      res.status(badInput ? 400 : 500).json({ message: msg });
    }
  },
);

router.get(
  "/api/official-letters/requests",
  requirePermission("staff_profiles.view"),
  async (req: Request, res: Response) => {
    try {
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      res.json({
        requests: await listLetterRequests({
          status: status as any,
        }),
      });
    } catch (error) {
      console.error("[officialLetters] list requests failed:", error);
      res.status(500).json({ message: "تعذر جلب الطلبات" });
    }
  },
);

router.post(
  "/api/official-letters/requests/:id/approve",
  requirePermission("staff_profiles.manage"),
  async (req: Request, res: Response) => {
    try {
      const actorId = currentUserId(req)!;
      const letter = await approveLetterRequest(req.params.id, actorId);
      res.json({ ok: true, letter });
    } catch (error: any) {
      const msg = error?.message || "تعذر اعتماد الطلب";
      const badInput = /غير موجود|مُعالج|بيانات المنسوب|الاسم الكامل/.test(msg);
      if (!badInput) console.error("[officialLetters] approve request failed:", error);
      res.status(badInput ? 400 : 500).json({ message: msg });
    }
  },
);

router.post(
  "/api/official-letters/requests/:id/reject",
  requirePermission("staff_profiles.manage"),
  async (req: Request, res: Response) => {
    try {
      const actorId = currentUserId(req)!;
      const note = typeof req.body?.note === "string" ? req.body.note : "";
      await rejectLetterRequest(req.params.id, actorId, note);
      res.json({ ok: true });
    } catch (error: any) {
      const msg = error?.message || "تعذر رفض الطلب";
      const badInput = /سبب|مُعالج/.test(msg);
      if (!badInput) console.error("[officialLetters] reject request failed:", error);
      res.status(badInput ? 400 : 500).json({ message: msg });
    }
  },
);

export default router;
