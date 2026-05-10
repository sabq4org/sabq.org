import { Router, Request, Response, raw } from "express";
import { z } from "zod";
import crypto from "crypto";
import { db } from "../db";
import { articlePurchases, tapPayments, articles, paymentAlerts } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import * as tapService from "../services/tapPaymentService";

const VAT_RATE = 0.15;

function calculateVAT(baseAmountHalalas: number): {
  baseAmount: number;
  vatAmount: number;
  totalAmount: number;
} {
  const vatAmount = Math.round(baseAmountHalalas * VAT_RATE);
  return {
    baseAmount: baseAmountHalalas,
    vatAmount,
    totalAmount: baseAmountHalalas + vatAmount,
  };
}

async function createPaymentAlert(
  paymentType: "article" | "advertiser",
  alertType: string,
  title: string,
  message: string,
  referenceId?: string,
  metadata?: Record<string, any>,
  severity: "low" | "medium" | "high" | "critical" = "medium"
) {
  try {
    await db.insert(paymentAlerts).values({
      type: alertType,
      severity,
      paymentType,
      referenceId,
      title,
      message,
      metadata,
    });
    console.log(`[Payment Alert] Created alert: ${alertType} for ${referenceId}`);
  } catch (error) {
    console.error("[Payment Alert] Failed to create alert:", error);
  }
}

const router = Router();

const createChargeSchema = z.object({
  articleId: z.string(),
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().optional(),
  phone: z.object({
    countryCode: z.string(),
    number: z.string(),
  }).optional(),
});

router.post("/create-charge", async (req: Request, res: Response) => {
  try {
    const body = createChargeSchema.parse(req.body);
    const userId = (req as any).session?.user?.id || null;
    
    const [article] = await db
      .select({
        id: articles.id,
        title: articles.title,
        slug: articles.slug,
        isPaid: articles.isPaid,
        priceHalalas: articles.priceHalalas,
      })
      .from(articles)
      .where(eq(articles.id, body.articleId))
      .limit(1);
    
    if (!article) {
      return res.status(404).json({ success: false, error: "Article not found" });
    }
    
    if (!article.isPaid || !article.priceHalalas) {
      return res.status(400).json({ success: false, error: "Article is not paid content" });
    }
    
    if (userId) {
      const [existingPurchase] = await db
        .select()
        .from(articlePurchases)
        .where(and(
          eq(articlePurchases.articleId, body.articleId),
          eq(articlePurchases.userId, userId),
          eq(articlePurchases.status, "completed")
        ))
        .limit(1);
      
      if (existingPurchase) {
        return res.status(400).json({ 
          success: false, 
          error: "You have already purchased this article",
          alreadyPurchased: true
        });
      }
    }
    
    const accessToken = crypto.randomBytes(32).toString("hex");
    
    const vatDetails = calculateVAT(article.priceHalalas);
    
    const [purchase] = await db
      .insert(articlePurchases)
      .values({
        articleId: body.articleId,
        userId: userId,
        guestEmail: userId ? null : body.email,
        guestPhone: body.phone ? `+${body.phone.countryCode}${body.phone.number}` : null,
        priceHalalas: vatDetails.totalAmount,
        currency: "SAR",
        status: "pending",
        accessToken,
      })
      .returning();
    
    const baseUrl = process.env.FRONTEND_URL 
      || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null) 
      || "https://sabq.org";
    
    const redirectUrl = `${baseUrl}/payment/callback?purchase_id=${purchase.id}`;
    const webhookUrl = `${baseUrl}/api/payments/webhook`;
    
    const charge = await tapService.createCharge({
      amountHalalas: vatDetails.totalAmount,
      currency: "SAR",
      customer: {
        firstName: body.firstName,
        lastName: body.lastName,
        email: body.email,
        phone: body.phone,
      },
      redirectUrl,
      postUrl: webhookUrl,
      description: `شراء مقال: ${article.title} (شامل ضريبة القيمة المضافة 15%)`,
      metadata: {
        purchaseId: purchase.id,
        articleId: body.articleId,
        articleTitle: article.title,
        baseAmount: vatDetails.baseAmount,
        vatAmount: vatDetails.vatAmount,
        vatRate: "15%",
      },
    });
    
    await db.update(articlePurchases)
      .set({ chargeId: charge.id })
      .where(eq(articlePurchases.id, purchase.id));
    
    await db.insert(tapPayments).values({
      chargeId: charge.id,
      purchaseId: purchase.id,
      amountHalalas: vatDetails.totalAmount,
      currency: "SAR",
      status: charge.status,
      redirectUrl,
      transactionUrl: charge.transaction?.url,
      customerEmail: body.email,
      customerName: `${body.firstName} ${body.lastName || ""}`.trim(),
      customerPhone: body.phone ? `+${body.phone.countryCode}${body.phone.number}` : null,
    });
    
    console.log(`[Tap Payment] VAT calculated: base=${vatDetails.baseAmount}, vat=${vatDetails.vatAmount}, total=${vatDetails.totalAmount}`);
    
    console.log(`[Tap Payment] Charge created for article ${body.articleId}, purchase ${purchase.id}`);
    
    res.json({
      success: true,
      data: {
        purchaseId: purchase.id,
        chargeId: charge.id,
        paymentUrl: charge.transaction?.url,
        status: charge.status,
      },
    });
  } catch (error: any) {
    console.error("[Tap Payment] Error creating charge:", error);
    res.status(500).json({ 
      success: false, 
      error: error.message || "Failed to create payment" 
    });
  }
});

router.post("/webhook", raw({ type: "application/json" }), async (req: Request, res: Response) => {
  try {
    const rawBody = req.body.toString("utf8");
    const hashstring = req.headers["hashstring"] as string || req.headers["hash"] as string;
    
    if (!tapService.verifyWebhookSignature(rawBody, hashstring || "")) {
      console.error("[Tap Payment] Invalid or missing webhook signature");
      return res.status(401).send("Unauthorized");
    }
    
    const payload = JSON.parse(rawBody);
    const chargeId = payload.id;
    
    console.log(`[Tap Payment] Webhook received for charge ${chargeId}`);
    
    const [payment] = await db
      .select()
      .from(tapPayments)
      .where(eq(tapPayments.chargeId, chargeId))
      .limit(1);
    
    if (!payment) {
      console.error(`[Tap Payment] Payment not found for charge ${chargeId}`);
      return res.status(404).send("Payment not found");
    }
    
    const verifiedCharge = await tapService.retrieveCharge(chargeId);
    const verifiedStatus = verifiedCharge.status;
    
    console.log(`[Tap Payment] Verified status from Tap API: ${verifiedStatus}`);
    
    await db.update(tapPayments)
      .set({
        status: verifiedStatus,
        cardBrand: verifiedCharge.card?.brand || payload.card?.brand,
        cardLastFour: verifiedCharge.card?.last_four || payload.card?.last_four,
        gatewayResponse: verifiedCharge.response || payload.response,
        fullResponse: payload,
        webhookHashstring: hashstring,
        webhookReceivedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(tapPayments.id, payment.id));
    
    if (tapService.isPaymentSuccessful(verifiedStatus)) {
      const accessExpiresAt = new Date();
      accessExpiresAt.setDate(accessExpiresAt.getDate() + 7);
      
      await db.update(articlePurchases)
        .set({ 
          status: "completed",
          accessExpiresAt,
          updatedAt: new Date(),
        })
        .where(eq(articlePurchases.id, payment.purchaseId));
      
      console.log(`[Tap Payment] Purchase ${payment.purchaseId} marked as completed with 7-day access`);
    } else if (tapService.isPaymentFailed(verifiedStatus)) {
      await db.update(articlePurchases)
        .set({ 
          status: "failed",
          updatedAt: new Date(),
        })
        .where(eq(articlePurchases.id, payment.purchaseId));
      
      console.log(`[Tap Payment] Purchase ${payment.purchaseId} marked as failed`);
      
      await createPaymentAlert(
        "article",
        "failed_payment",
        "فشل عملية دفع مقال",
        `فشلت عملية الدفع للمقال - Charge ID: ${chargeId}`,
        chargeId,
        {
          chargeId,
          purchaseId: payment.purchaseId,
          amount: payment.amountHalalas,
          status: verifiedStatus,
          gatewayResponse: verifiedCharge.response,
        },
        "high"
      );
    }
    
    res.status(200).send("OK");
  } catch (error: any) {
    console.error("[Tap Payment] Webhook error:", error);
    res.status(500).send("Internal Server Error");
  }
});

router.get("/verify/:chargeId", async (req: Request, res: Response) => {
  try {
    const { chargeId } = req.params;
    
    const charge = await tapService.retrieveCharge(chargeId);
    
    const [payment] = await db
      .select()
      .from(tapPayments)
      .where(eq(tapPayments.chargeId, chargeId))
      .limit(1);
    
    if (payment && payment.status !== charge.status) {
      await db.update(tapPayments)
        .set({
          status: charge.status,
          cardBrand: charge.card?.brand,
          cardLastFour: charge.card?.last_four,
          gatewayResponse: charge.response,
          updatedAt: new Date(),
        })
        .where(eq(tapPayments.id, payment.id));
      
      if (tapService.isPaymentSuccessful(charge.status)) {
        const accessExpiresAt = new Date();
        accessExpiresAt.setDate(accessExpiresAt.getDate() + 7);
        
        await db.update(articlePurchases)
          .set({ status: "completed", accessExpiresAt, updatedAt: new Date() })
          .where(eq(articlePurchases.id, payment.purchaseId));
      } else if (tapService.isPaymentFailed(charge.status)) {
        await db.update(articlePurchases)
          .set({ status: "failed", updatedAt: new Date() })
          .where(eq(articlePurchases.id, payment.purchaseId));
      }
    }
    
    res.json({
      success: true,
      data: {
        chargeId: charge.id,
        status: charge.status,
        isSuccess: tapService.isPaymentSuccessful(charge.status),
        isFailed: tapService.isPaymentFailed(charge.status),
        statusArabic: tapService.getPaymentStatusArabic(charge.status),
      },
    });
  } catch (error: any) {
    console.error("[Tap Payment] Error verifying charge:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/check-purchase/:articleId", async (req: Request, res: Response) => {
  try {
    const { articleId } = req.params;
    const userId = (req as any).session?.user?.id;
    const accessToken = req.query.token as string;
    
    if (userId) {
      const [purchase] = await db
        .select()
        .from(articlePurchases)
        .where(and(
          eq(articlePurchases.articleId, articleId),
          eq(articlePurchases.userId, userId),
          eq(articlePurchases.status, "completed")
        ))
        .limit(1);
      
      if (purchase) {
        return res.json({
          success: true,
          data: { hasPurchased: true, purchaseId: purchase.id },
        });
      }
    }
    
    if (accessToken) {
      const [purchase] = await db
        .select()
        .from(articlePurchases)
        .where(and(
          eq(articlePurchases.articleId, articleId),
          eq(articlePurchases.accessToken, accessToken),
          eq(articlePurchases.status, "completed")
        ))
        .limit(1);
      
      if (purchase) {
        if (purchase.accessExpiresAt && new Date(purchase.accessExpiresAt) < new Date()) {
          return res.json({
            success: true,
            data: { hasPurchased: false, expired: true },
          });
        }
        
        return res.json({
          success: true,
          data: { hasPurchased: true, purchaseId: purchase.id },
        });
      }
    }
    
    return res.json({
      success: true,
      data: { hasPurchased: false },
    });
  } catch (error: any) {
    console.error("[Tap Payment] Error checking purchase:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/purchase/:purchaseId", async (req: Request, res: Response) => {
  try {
    const { purchaseId } = req.params;
    
    const [purchase] = await db
      .select({
        id: articlePurchases.id,
        articleId: articlePurchases.articleId,
        status: articlePurchases.status,
        priceHalalas: articlePurchases.priceHalalas,
        currency: articlePurchases.currency,
        chargeId: articlePurchases.chargeId,
        accessToken: articlePurchases.accessToken,
        createdAt: articlePurchases.createdAt,
      })
      .from(articlePurchases)
      .where(eq(articlePurchases.id, purchaseId))
      .limit(1);
    
    if (!purchase) {
      return res.status(404).json({ success: false, error: "Purchase not found" });
    }
    
    const [article] = await db
      .select({
        id: articles.id,
        title: articles.title,
        slug: articles.slug,
        imageUrl: articles.imageUrl,
      })
      .from(articles)
      .where(eq(articles.id, purchase.articleId))
      .limit(1);
    
    res.json({
      success: true,
      data: {
        ...purchase,
        article,
        priceSAR: tapService.formatPriceFromHalalas(purchase.priceHalalas),
        statusArabic: purchase.status === "completed" ? "مكتمل" : 
                      purchase.status === "failed" ? "فشل" : "قيد المعالجة",
      },
    });
  } catch (error: any) {
    console.error("[Tap Payment] Error getting purchase:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
