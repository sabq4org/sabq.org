// ----------------------------------------------------------------------------
// سبق بلس — مسارات المعاينة الداخلية /api/plus-preview/*
//
// Admin-only simulation surface for the سبق بلس × ولاء ون experience.
// All data access lives in server/services/sabqPlusPreviewService.ts (ADR-001).
// ----------------------------------------------------------------------------

import { Router, type Request, type Response } from "express";
import { isAuthenticated } from "../auth";
import {
  getPlusCatalog,
  getPlusRedemptions,
  getPlusSummary,
  getVoucherPassData,
  isPlusPreviewAdmin,
  redeemPreviewReward,
  removePreviewRedemption,
} from "../services/sabqPlusPreviewService";

const router = Router();

async function requirePlusAdmin(req: Request, res: Response, next: () => void) {
  const user = req.user as { id: string; role?: string | null } | undefined;
  if (!user) {
    return res.status(401).json({ message: "غير مصرح" });
  }
  if (await isPlusPreviewAdmin(user)) return next();
  // 404 (not 403) so the preview surface doesn't reveal its existence.
  return res.status(404).json({ message: "غير موجود" });
}

router.use("/api/plus-preview", isAuthenticated, requirePlusAdmin);

router.get("/api/plus-preview/summary", async (req: Request, res: Response) => {
  try {
    res.json(await getPlusSummary((req.user as any).id));
  } catch (error) {
    console.error("[SabqPlusPreview] summary error:", error);
    res.status(500).json({ message: "تعذر جلب الملخص" });
  }
});

router.get("/api/plus-preview/catalog", async (req: Request, res: Response) => {
  try {
    res.json(await getPlusCatalog((req.user as any).id));
  } catch (error) {
    console.error("[SabqPlusPreview] catalog error:", error);
    res.status(500).json({ message: "تعذر جلب الكتالوج" });
  }
});

router.post("/api/plus-preview/redeem/:id", async (req: Request, res: Response) => {
  try {
    if (req.body?.termsAccepted !== true) {
      return res.status(400).json({ message: "يجب الموافقة على شروط الاستخدام وشروط ولاء ون قبل الاستبدال" });
    }
    const result = await redeemPreviewReward((req.user as any).id, req.params.id);
    if (!result.success) {
      const statusByCode: Record<string, number> = {
        NOT_FOUND: 404,
        INACTIVE: 404,
        EXPIRED: 410,
        OUT_OF_STOCK: 409,
        MAX_REDEMPTIONS: 409,
        INSUFFICIENT_POINTS: 402,
      };
      return res.status(statusByCode[result.code] ?? 400).json({ message: result.message });
    }
    res.json(result);
  } catch (error) {
    console.error("[SabqPlusPreview] redeem error:", error);
    res.status(500).json({ message: "تعذر إتمام الاستبدال" });
  }
});

// هذا المسار يُفتح بتنقل متصفح مباشر (نقرة <a>)، فأخطاؤه يجب أن تظهر
// صفحة عربية لطيفة تعيد للمعاينة — لا JSON خام في وجه المستخدم.
function walletErrorPage(message: string): string {
  return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>سبق بلس</title></head><body style="font-family:-apple-system,'SF Arabic','Segoe UI',Tahoma,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#F4F8FC;color:#13202E;text-align:center;padding:24px"><div><div style="font-size:44px">🎟️</div><h2 style="margin:12px 0 6px">تعذر إصدار البطاقة</h2><p style="color:#4A5A6B;max-width:42ch;margin:0 auto;line-height:1.7">${message}</p><a href="/plus-preview" style="display:inline-block;margin-top:18px;background:#1793E8;color:#fff;text-decoration:none;font-weight:700;border-radius:12px;padding:10px 22px">العودة إلى سبق بلس</a></div></body></html>`;
}

// بطاقة Apple Wallet للقسيمة (نمط Coupon، موقعة بشهادة الولاء الموجودة).
// GET كي يعمل التنزيل بنقرة مباشرة من متصفح الجوال.
router.get("/api/plus-preview/voucher/:redemptionId/wallet-pass", async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const voucher = await getVoucherPassData(user.id, req.params.redemptionId);
    if (!voucher) {
      return res.status(404).type("html").send(walletErrorPage("القسيمة غير موجودة أو لا تخص حسابك."));
    }

    const { passKitService } = await import("../lib/passkit/PassKitService");
    const passBuffer = await passKitService.generateCouponPass({
      userId: user.id,
      serialNumber: `SABQ-PLUS-${req.params.redemptionId.replace(/-/g, "").slice(0, 10).toUpperCase()}`,
      authToken: passKitService.generateAuthToken(),
      userName: `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email || "عضو سبق",
      userEmail: user.email ?? "",
      userRole: user.role ?? "reader",
      partnerName: voucher.partnerName,
      offer: voucher.offer,
      valueLabel: voucher.valueLabel,
      couponCode: voucher.couponCode,
      voucherExpiresAt: voucher.voucherExpiresAt,
    });

    res.set({
      "Content-Type": "application/vnd.apple.pkpass",
      "Content-Disposition": `attachment; filename="sabq-plus-voucher-${voucher.couponCode}.pkpass"`,
      "Content-Length": String(passBuffer.length),
      "Cache-Control": "private, no-store",
    });
    res.send(passBuffer);
  } catch (error: any) {
    console.error("[SabqPlusPreview] wallet-pass error:", error);
    res
      .status(400)
      .type("html")
      .send(walletErrorPage(error?.message ?? "تعذر إنشاء بطاقة المحفظة. حاول مرة أخرى."));
  }
});

router.get("/api/plus-preview/redemptions", async (req: Request, res: Response) => {
  try {
    res.json(await getPlusRedemptions((req.user as any).id));
  } catch (error) {
    console.error("[SabqPlusPreview] redemptions error:", error);
    res.status(500).json({ message: "تعذر جلب السجل" });
  }
});

// إزالة قسيمة معاينة: تُرجع النقاط وتُسقط السجل. لا تحذف بطاقة Wallet المُضافة
// على الجهاز — المستخدم يحذفها يدوياً من Apple Wallet (⋯ / i ← حذف البطاقة).
router.delete("/api/plus-preview/redemptions/:id", async (req: Request, res: Response) => {
  try {
    const result = await removePreviewRedemption((req.user as any).id, req.params.id);
    if (!result.success) {
      const status = result.code === "NOT_FOUND" ? 404 : 409;
      return res.status(status).json({ message: result.message });
    }
    res.json(result);
  } catch (error) {
    console.error("[SabqPlusPreview] remove redemption error:", error);
    res.status(500).json({ message: "تعذر إزالة القسيمة" });
  }
});

export default router;
