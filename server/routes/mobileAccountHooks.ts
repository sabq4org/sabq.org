/**
 * خطافات تسبق مسارات حساب العضو في mobileApiRoutes.ts. ذلك الملف فوق سقف
 * max-lines فلا يُعدَّل؛ هذا الموجّه يُركَّب قبله في server/index.ts ثم
 * يمرّر الطلب إليه بـ next().
 *
 * DELETE /api/v1/members/account
 *   إن أرسل التطبيق `appleAuthorizationCode` (تفويض آبل جديد لحظة الحذف)
 *   نبادله ونتحقق أنه لصاحب الحساب، ثم نلغي الرمز لدى آبل بعد نجاح الحذف
 *   (بند أبل 5.1.1(v)). ونحذف قائمة الحظر الخاصة بالحساب. فشل آبل لا يوقف الحذف.
 *
 * PUT /api/v1/members/profile
 *   الاسم والنبذة يظهران بجوار التعليقات، فيمرّان بفلتر الكلمات المحظورة
 *   نفسه المطبّق على التعليقات (بند أبل 1.2).
 *
 * لا استيراد لـ db هنا (ADR-001).
 */
import { Router, type NextFunction, type Request, type Response } from "express";
import { verifyMemberBearer } from "../services/memberSessionService";
import {
  appleClientIds,
  getUserAppleId,
  prepareAppleRevocation,
  revokeAppleToken,
} from "../services/appleTokenRevocation";
import { removeBlocksByUser } from "../services/commentSafetyService";
import { checkTextForSuspiciousWords } from "../utils/suspiciousWordsChecker";

const router = Router();

router.delete("/members/account", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const session = await verifyMemberBearer(req);
    if (!session) return next();

    const code = typeof req.body?.appleAuthorizationCode === "string" ? req.body.appleAuthorizationCode : "";
    const requestedClient = typeof req.body?.appleClientId === "string" ? req.body.appleClientId : "";
    const allowed = appleClientIds();
    const clientID = allowed.includes(requestedClient) ? requestedClient : allowed[0];

    const prepared = code && clientID
      ? await prepareAppleRevocation({
          authorizationCode: code,
          clientID,
          expectedAppleId: await getUserAppleId(session.userId),
        })
      : null;

    res.on("finish", () => {
      if (res.statusCode < 200 || res.statusCode >= 300) return;
      // داخل then حتى لا يرمي خطأ متزامن من مستمع finish.
      void Promise.resolve()
        .then(() => removeBlocksByUser(session.userId))
        .catch((err) => console.warn("[AccountHooks] failed to clear blocks for deleted account:", err));
      if (prepared) {
        void Promise.resolve()
          .then(() => revokeAppleToken(prepared))
          .then((ok) => {
            if (ok) console.log("[AccountHooks] Apple token revoked for deleted account");
          })
          .catch((err) => console.warn("[AccountHooks] Apple revoke threw:", err));
      }
    });
  } catch (error) {
    console.warn("[AccountHooks] pre-delete hook failed, continuing:", error);
  }
  next();
});

const PROFILE_TEXT_FIELDS = ["firstName", "lastName", "name", "bio"] as const;

router.put("/members/profile", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body ?? {};
    const text = PROFILE_TEXT_FIELDS
      .map((key) => (typeof body[key] === "string" ? body[key].trim() : ""))
      .filter(Boolean)
      .join(" ");
    if (!text) return next();

    const check = await checkTextForSuspiciousWords(text);
    if (check.hasSuspiciousWords) {
      return res.status(400).json({
        success: false,
        code: "PROFILE_TEXT_REJECTED",
        message: "الاسم أو النبذة يحتويان كلمات غير مسموح بها، عدّلها ثم احفظ",
      });
    }
  } catch (error) {
    console.warn("[AccountHooks] profile text check failed, continuing:", error);
  }
  next();
});

export default router;
