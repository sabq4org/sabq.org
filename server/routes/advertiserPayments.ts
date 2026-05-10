import { Router, Request, Response, raw } from "express";
import { z } from "zod";
import crypto from "crypto";
import { db } from "../db";
import { 
  advertiserWallets, 
  advertiserPackages, 
  advertiserTransactions, 
  advertiserProfiles,
  nativeAds,
  paymentAlerts
} from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
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

async function getAdvertiserId(req: Request): Promise<string | null> {
  const session = (req as any).session;
  return session?.advertiserId || null;
}

async function getOrCreateWallet(advertiserId: string) {
  const [existing] = await db
    .select()
    .from(advertiserWallets)
    .where(eq(advertiserWallets.advertiserId, advertiserId))
    .limit(1);
  
  if (existing) return existing;
  
  const [wallet] = await db
    .insert(advertiserWallets)
    .values({ advertiserId })
    .returning();
  
  return wallet;
}

router.get("/packages", async (_req: Request, res: Response) => {
  try {
    const packages = await db
      .select()
      .from(advertiserPackages)
      .where(eq(advertiserPackages.isActive, true))
      .orderBy(advertiserPackages.sortOrder);
    
    if (packages.length === 0) {
      const defaultPackages = [
        { name: "Basic", nameAr: "باقة أساسية", priceHalalas: 5000, impressions: 1000, sortOrder: 1 },
        { name: "Medium", nameAr: "باقة متوسطة", priceHalalas: 20000, impressions: 5000, bonusImpressions: 500, sortOrder: 2 },
        { name: "Professional", nameAr: "باقة احترافية", priceHalalas: 50000, impressions: 15000, bonusImpressions: 2000, isFeatured: true, sortOrder: 3 },
      ];
      
      for (const pkg of defaultPackages) {
        await db.insert(advertiserPackages).values(pkg);
      }
      
      const newPackages = await db
        .select()
        .from(advertiserPackages)
        .where(eq(advertiserPackages.isActive, true))
        .orderBy(advertiserPackages.sortOrder);
      
      return res.json({ success: true, data: newPackages });
    }
    
    res.json({ success: true, data: packages });
  } catch (error: any) {
    console.error("[Advertiser Payments] Error fetching packages:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/wallet", async (req: Request, res: Response) => {
  try {
    const advertiserId = await getAdvertiserId(req);
    if (!advertiserId) {
      return res.status(401).json({ success: false, error: "غير مصرح" });
    }
    
    const wallet = await getOrCreateWallet(advertiserId);
    
    res.json({
      success: true,
      data: {
        ...wallet,
        balanceSAR: (wallet.balanceHalalas / 100).toFixed(2),
        totalDepositedSAR: (wallet.totalDepositedHalalas / 100).toFixed(2),
        totalSpentSAR: (wallet.totalSpentHalalas / 100).toFixed(2),
      },
    });
  } catch (error: any) {
    console.error("[Advertiser Payments] Error fetching wallet:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/transactions", async (req: Request, res: Response) => {
  try {
    const advertiserId = await getAdvertiserId(req);
    if (!advertiserId) {
      return res.status(401).json({ success: false, error: "غير مصرح" });
    }
    
    const transactions = await db
      .select()
      .from(advertiserTransactions)
      .where(eq(advertiserTransactions.advertiserId, advertiserId))
      .orderBy(desc(advertiserTransactions.createdAt))
      .limit(50);
    
    res.json({ success: true, data: transactions });
  } catch (error: any) {
    console.error("[Advertiser Payments] Error fetching transactions:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

const purchasePackageSchema = z.object({
  packageId: z.string(),
  adId: z.string().optional(),
});

router.post("/purchase-package", async (req: Request, res: Response) => {
  try {
    const advertiserId = await getAdvertiserId(req);
    if (!advertiserId) {
      return res.status(401).json({ success: false, error: "غير مصرح" });
    }
    
    const body = purchasePackageSchema.parse(req.body);
    
    const [advertiser] = await db
      .select()
      .from(advertiserProfiles)
      .where(eq(advertiserProfiles.id, advertiserId))
      .limit(1);
    
    if (!advertiser) {
      return res.status(404).json({ success: false, error: "المعلن غير موجود" });
    }
    
    const [pkg] = await db
      .select()
      .from(advertiserPackages)
      .where(and(
        eq(advertiserPackages.id, body.packageId),
        eq(advertiserPackages.isActive, true)
      ))
      .limit(1);
    
    if (!pkg) {
      return res.status(404).json({ success: false, error: "الباقة غير موجودة" });
    }
    
    const wallet = await getOrCreateWallet(advertiserId);
    
    const transactionId = crypto.randomUUID();
    
    const vatDetails = calculateVAT(pkg.priceHalalas);
    
    await db.insert(advertiserTransactions).values({
      id: transactionId,
      advertiserId,
      walletId: wallet.id,
      packageId: body.packageId,
      adId: body.adId || null,
      type: "deposit",
      amountHalalas: vatDetails.totalAmount,
      balanceBeforeHalalas: wallet.balanceHalalas,
      balanceAfterHalalas: wallet.balanceHalalas,
      description: `شراء ${pkg.nameAr} (شامل ضريبة القيمة المضافة 15%)`,
      status: "pending",
      metadata: {
        packageName: pkg.nameAr,
        impressions: pkg.impressions + pkg.bonusImpressions,
        baseAmount: vatDetails.baseAmount,
        vatAmount: vatDetails.vatAmount,
        vatRate: "15%",
      },
    });
    
    const baseUrl = process.env.FRONTEND_URL 
      || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null) 
      || "https://sabq.org";
    
    const redirectUrl = `${baseUrl}/advertise/payment/callback?transaction_id=${transactionId}`;
    const webhookUrl = `${baseUrl}/api/advertiser-payments/webhook`;
    
    const charge = await tapService.createCharge({
      amountHalalas: vatDetails.totalAmount,
      currency: "SAR",
      customer: {
        firstName: advertiser.name,
        email: advertiser.email,
        phone: advertiser.phone ? { countryCode: "966", number: advertiser.phone.replace(/^\+966/, "") } : undefined,
      },
      redirectUrl,
      postUrl: webhookUrl,
      description: `شراء باقة إعلانية: ${pkg.nameAr} (شامل ضريبة القيمة المضافة 15%)`,
      metadata: {
        transactionId,
        advertiserId,
        packageId: body.packageId,
        adId: body.adId || null,
        baseAmount: vatDetails.baseAmount,
        vatAmount: vatDetails.vatAmount,
        vatRate: "15%",
      },
    });
    
    console.log(`[Advertiser Payments] VAT calculated: base=${vatDetails.baseAmount}, vat=${vatDetails.vatAmount}, total=${vatDetails.totalAmount}`);
    
    await db.update(advertiserTransactions)
      .set({ chargeId: charge.id })
      .where(eq(advertiserTransactions.id, transactionId));
    
    console.log(`[Advertiser Payments] Charge created for advertiser ${advertiserId}, package ${body.packageId}`);
    
    res.json({
      success: true,
      data: {
        transactionId,
        chargeId: charge.id,
        paymentUrl: charge.transaction?.url,
        status: charge.status,
      },
    });
  } catch (error: any) {
    console.error("[Advertiser Payments] Error creating purchase:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/webhook", raw({ type: "application/json" }), async (req: Request, res: Response) => {
  try {
    const rawBody = req.body.toString("utf8");
    const hashstring = req.headers["hashstring"] as string || req.headers["hash"] as string;
    
    if (!tapService.verifyWebhookSignature(rawBody, hashstring || "")) {
      console.error("[Advertiser Payments] Invalid or missing webhook signature");
      return res.status(401).send("Unauthorized");
    }
    
    const payload = JSON.parse(rawBody);
    const chargeId = payload.id;
    
    console.log(`[Advertiser Payments] Webhook received for charge ${chargeId}`);
    
    const [transaction] = await db
      .select()
      .from(advertiserTransactions)
      .where(eq(advertiserTransactions.chargeId, chargeId))
      .limit(1);
    
    if (!transaction) {
      console.error(`[Advertiser Payments] Transaction not found for charge ${chargeId}`);
      return res.status(404).send("Transaction not found");
    }
    
    if (transaction.status === "completed") {
      console.log(`[Advertiser Payments] Transaction ${transaction.id} already completed`);
      return res.status(200).send("OK");
    }
    
    const verifiedCharge = await tapService.retrieveCharge(chargeId);
    const verifiedStatus = verifiedCharge.status;
    
    console.log(`[Advertiser Payments] Verified status from Tap API: ${verifiedStatus}`);
    
    if (tapService.isPaymentSuccessful(verifiedStatus)) {
      const [wallet] = await db
        .select()
        .from(advertiserWallets)
        .where(eq(advertiserWallets.id, transaction.walletId))
        .limit(1);
      
      if (!wallet) {
        console.error(`[Advertiser Payments] Wallet not found for transaction ${transaction.id}`);
        return res.status(404).send("Wallet not found");
      }
      
      const [pkg] = transaction.packageId ? await db
        .select()
        .from(advertiserPackages)
        .where(eq(advertiserPackages.id, transaction.packageId))
        .limit(1) : [null];
      
      const impressionsToAdd = pkg ? (pkg.impressions + pkg.bonusImpressions) : 0;
      const metadata = transaction.metadata as { baseAmount?: number; vatAmount?: number } | null;
      const creditAmount = metadata?.baseAmount || transaction.amountHalalas;
      const newBalance = wallet.balanceHalalas + creditAmount;
      
      await db.update(advertiserWallets)
        .set({
          balanceHalalas: newBalance,
          totalDepositedHalalas: wallet.totalDepositedHalalas + creditAmount,
          updatedAt: new Date(),
        })
        .where(eq(advertiserWallets.id, wallet.id));
      
      await db.update(advertiserTransactions)
        .set({
          status: "completed",
          balanceAfterHalalas: newBalance,
        })
        .where(eq(advertiserTransactions.id, transaction.id));
      
      if (transaction.adId) {
        const [ad] = await db
          .select()
          .from(nativeAds)
          .where(eq(nativeAds.id, transaction.adId))
          .limit(1);
        
        if (ad) {
          const newTotalBudget = (ad.totalBudget || 0) + creditAmount;
          await db.update(nativeAds)
            .set({
              totalBudget: newTotalBudget,
              updatedAt: new Date(),
            })
            .where(eq(nativeAds.id, transaction.adId));
          
          console.log(`[Advertiser Payments] Added ${creditAmount} halalas (base amount) to ad ${transaction.adId} budget`);
        }
      }
      
      console.log(`[Advertiser Payments] Transaction ${transaction.id} completed, added ${creditAmount} halalas (base, VAT=${metadata?.vatAmount || 0}) to wallet`);
    } else if (tapService.isPaymentFailed(verifiedStatus)) {
      await db.update(advertiserTransactions)
        .set({ status: "failed" })
        .where(eq(advertiserTransactions.id, transaction.id));
      
      console.log(`[Advertiser Payments] Transaction ${transaction.id} failed`);
      
      await createPaymentAlert(
        "advertiser",
        "failed_payment",
        "فشل عملية دفع معلن",
        `فشلت عملية الدفع للمعلن - Charge ID: ${chargeId}`,
        chargeId,
        {
          chargeId,
          transactionId: transaction.id,
          advertiserId: transaction.advertiserId,
          amount: transaction.amountHalalas,
          status: verifiedStatus,
        },
        "high"
      );
    }
    
    res.status(200).send("OK");
  } catch (error: any) {
    console.error("[Advertiser Payments] Webhook error:", error);
    res.status(500).send("Internal Server Error");
  }
});

router.get("/verify/:transactionId", async (req: Request, res: Response) => {
  try {
    const { transactionId } = req.params;
    
    const [transaction] = await db
      .select()
      .from(advertiserTransactions)
      .where(eq(advertiserTransactions.id, transactionId))
      .limit(1);
    
    if (!transaction) {
      return res.status(404).json({ success: false, error: "المعاملة غير موجودة" });
    }
    
    if (!transaction.chargeId) {
      return res.json({
        success: true,
        data: {
          transactionId: transaction.id,
          status: transaction.status,
          isSuccess: false,
          isFailed: true,
        },
      });
    }
    
    if (transaction.status === "completed") {
      return res.json({
        success: true,
        data: {
          transactionId: transaction.id,
          status: "completed",
          isSuccess: true,
          isFailed: false,
          statusArabic: "مكتمل",
        },
      });
    }
    
    const charge = await tapService.retrieveCharge(transaction.chargeId);
    
    if (tapService.isPaymentSuccessful(charge.status) && transaction.status !== "completed") {
      const [wallet] = await db
        .select()
        .from(advertiserWallets)
        .where(eq(advertiserWallets.id, transaction.walletId))
        .limit(1);
      
      if (wallet) {
        const metadata = transaction.metadata as { baseAmount?: number; vatAmount?: number } | null;
        const creditAmount = metadata?.baseAmount || transaction.amountHalalas;
        const newBalance = wallet.balanceHalalas + creditAmount;
        
        await db.update(advertiserWallets)
          .set({
            balanceHalalas: newBalance,
            totalDepositedHalalas: wallet.totalDepositedHalalas + creditAmount,
            updatedAt: new Date(),
          })
          .where(eq(advertiserWallets.id, wallet.id));
        
        await db.update(advertiserTransactions)
          .set({
            status: "completed",
            balanceAfterHalalas: newBalance,
          })
          .where(eq(advertiserTransactions.id, transaction.id));
        
        if (transaction.adId) {
          const [ad] = await db
            .select()
            .from(nativeAds)
            .where(eq(nativeAds.id, transaction.adId))
            .limit(1);
          
          if (ad) {
            await db.update(nativeAds)
              .set({
                totalBudget: (ad.totalBudget || 0) + creditAmount,
                updatedAt: new Date(),
              })
              .where(eq(nativeAds.id, transaction.adId));
          }
        }
      }
    } else if (tapService.isPaymentFailed(charge.status)) {
      await db.update(advertiserTransactions)
        .set({ status: "failed" })
        .where(eq(advertiserTransactions.id, transaction.id));
    }
    
    res.json({
      success: true,
      data: {
        transactionId: transaction.id,
        chargeId: charge.id,
        status: charge.status,
        isSuccess: tapService.isPaymentSuccessful(charge.status),
        isFailed: tapService.isPaymentFailed(charge.status),
        statusArabic: tapService.getPaymentStatusArabic(charge.status),
      },
    });
  } catch (error: any) {
    console.error("[Advertiser Payments] Error verifying transaction:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/transaction/:transactionId", async (req: Request, res: Response) => {
  try {
    const { transactionId } = req.params;
    
    const [transaction] = await db
      .select()
      .from(advertiserTransactions)
      .where(eq(advertiserTransactions.id, transactionId))
      .limit(1);
    
    if (!transaction) {
      return res.status(404).json({ success: false, error: "المعاملة غير موجودة" });
    }
    
    let packageInfo = null;
    if (transaction.packageId) {
      const [pkg] = await db
        .select()
        .from(advertiserPackages)
        .where(eq(advertiserPackages.id, transaction.packageId))
        .limit(1);
      packageInfo = pkg;
    }
    
    res.json({
      success: true,
      data: {
        ...transaction,
        amountSAR: (transaction.amountHalalas / 100).toFixed(2),
        statusArabic: transaction.status === "completed" ? "مكتمل" :
                      transaction.status === "failed" ? "فشل" : "قيد المعالجة",
        package: packageInfo,
      },
    });
  } catch (error: any) {
    console.error("[Advertiser Payments] Error getting transaction:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
