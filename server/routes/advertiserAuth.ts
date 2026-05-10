import { Router, Request, Response } from "express";
import { db } from "../db";
import { eq, and, inArray } from "drizzle-orm";
import { advertiserProfiles, insertAdvertiserProfileSchema, nativeAds, nativeAdDailySpend } from "@shared/schema";
import bcrypt from "bcrypt";
import { z } from "zod";

const router = Router();

declare module 'express-session' {
  interface SessionData {
    advertiserId?: string;
  }
}

const loginSchema = z.object({
  email: z.string().email("البريد الإلكتروني غير صحيح"),
  password: z.string().min(1, "كلمة المرور مطلوبة"),
});

export function requireAdvertiserAuth(req: Request, res: Response, next: Function) {
  if (!req.session.advertiserId) {
    return res.status(401).json({ error: "يجب تسجيل الدخول" });
  }
  next();
}

router.post("/register", async (req: Request, res: Response) => {
  try {
    const validatedData = insertAdvertiserProfileSchema.parse(req.body);
    
    const existingUser = await db.query.advertiserProfiles.findFirst({
      where: eq(advertiserProfiles.email, validatedData.email.toLowerCase()),
    });
    
    if (existingUser) {
      return res.status(400).json({ error: "البريد الإلكتروني مستخدم بالفعل" });
    }
    
    const hashedPassword = await bcrypt.hash(validatedData.password, 12);
    
    const [newAdvertiser] = await db.insert(advertiserProfiles).values({
      ...validatedData,
      email: validatedData.email.toLowerCase(),
      password: hashedPassword,
    }).returning();
    
    // Regenerate session to prevent session fixation
    req.session.regenerate((err) => {
      if (err) {
        console.error("Error regenerating session:", err);
        return res.status(500).json({ error: "حدث خطأ أثناء التسجيل" });
      }
      req.session.advertiserId = newAdvertiser.id;
      const { password: _, ...safeAdvertiser } = newAdvertiser;
      res.status(201).json(safeAdvertiser);
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error("Error registering advertiser:", error);
    res.status(500).json({ error: "حدث خطأ أثناء التسجيل" });
  }
});

router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    
    const advertiser = await db.query.advertiserProfiles.findFirst({
      where: eq(advertiserProfiles.email, email.toLowerCase()),
    });
    
    if (!advertiser) {
      return res.status(401).json({ error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" });
    }
    
    if (!advertiser.isActive) {
      return res.status(403).json({ error: "الحساب معطل. يرجى التواصل مع الدعم" });
    }
    
    const isValidPassword = await bcrypt.compare(password, advertiser.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" });
    }
    
    // Regenerate session to prevent session fixation
    req.session.regenerate((err) => {
      if (err) {
        console.error("Error regenerating session:", err);
        return res.status(500).json({ error: "حدث خطأ أثناء تسجيل الدخول" });
      }
      req.session.advertiserId = advertiser.id;
      const { password: _, ...safeAdvertiser } = advertiser;
      res.json(safeAdvertiser);
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error("Error logging in advertiser:", error);
    res.status(500).json({ error: "حدث خطأ أثناء تسجيل الدخول" });
  }
});

router.post("/logout", (req: Request, res: Response) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Error destroying session:", err);
      return res.status(500).json({ error: "حدث خطأ أثناء تسجيل الخروج" });
    }
    res.clearCookie("connect.sid");
    res.json({ success: true });
  });
});

router.get("/me", requireAdvertiserAuth, async (req: Request, res: Response) => {
  try {
    const advertiser = await db.query.advertiserProfiles.findFirst({
      where: eq(advertiserProfiles.id, req.session.advertiserId!),
    });
    
    if (!advertiser) {
      req.session.advertiserId = undefined;
      return res.status(401).json({ error: "الحساب غير موجود" });
    }
    
    const { password: _, ...safeAdvertiser } = advertiser;
    res.json(safeAdvertiser);
  } catch (error) {
    console.error("Error getting advertiser profile:", error);
    res.status(500).json({ error: "حدث خطأ" });
  }
});

router.put("/profile", requireAdvertiserAuth, async (req: Request, res: Response) => {
  try {
    const updateSchema = z.object({
      name: z.string().min(2).optional(),
      phone: z.string().optional(),
      company: z.string().optional(),
      logo: z.string().optional(),
    });
    
    const validatedData = updateSchema.parse(req.body);
    
    const [updated] = await db.update(advertiserProfiles)
      .set({
        ...validatedData,
        updatedAt: new Date(),
      })
      .where(eq(advertiserProfiles.id, req.session.advertiserId!))
      .returning();
    
    const { password: _, ...safeAdvertiser } = updated;
    res.json(safeAdvertiser);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error("Error updating advertiser profile:", error);
    res.status(500).json({ error: "حدث خطأ أثناء التحديث" });
  }
});

router.get("/ads", requireAdvertiserAuth, async (req: Request, res: Response) => {
  try {
    const ads = await db.select()
      .from(nativeAds)
      .where(eq(nativeAds.advertiserId, req.session.advertiserId!))
      .orderBy(nativeAds.createdAt);
    
    // Get today's date in Saudi Arabia timezone (UTC+3)
    const now = new Date();
    const saudiOffset = 3 * 60 * 60 * 1000; // UTC+3 in milliseconds
    const saudiNow = new Date(now.getTime() + saudiOffset);
    const todayStr = saudiNow.toISOString().split('T')[0]; // YYYY-MM-DD
    
    // Get today's spend for this advertiser's ads only
    const adIds = ads.map(ad => ad.id);
    const todaySpendRecords = adIds.length > 0 
      ? await db.select()
          .from(nativeAdDailySpend)
          .where(and(
            eq(nativeAdDailySpend.spendDate, todayStr),
            inArray(nativeAdDailySpend.nativeAdId, adIds)
          ))
      : [];
    
    const todaySpendMap = new Map<string, number>();
    for (const record of todaySpendRecords) {
      todaySpendMap.set(record.nativeAdId, record.amountHalalas);
    }
    
    const adsToMarkExhausted: string[] = [];
    
    const adsWithStats = ads.map(ad => {
      const todaySpendHalalas = todaySpendMap.get(ad.id) || 0;
      const dailyBudgetHalalas = ad.dailyBudget || 0;
      const dailyBudgetUsagePercent = dailyBudgetHalalas > 0 
        ? Math.round((todaySpendHalalas / dailyBudgetHalalas) * 100)
        : 0;
      
      // Check if budget is exhausted but flag not set
      if (ad.dailyBudgetEnabled && dailyBudgetHalalas > 0 && todaySpendHalalas >= dailyBudgetHalalas && !ad.dailyBudgetExhaustedAt) {
        adsToMarkExhausted.push(ad.id);
      }
      
      return {
        ...ad,
        totalCost: (ad.clicks * (ad.costPerClick || 100)) / 100,
        todaySpendHalalas,
        dailyBudgetUsagePercent,
      };
    });
    
    // Set exhausted flag for ads that reached budget but weren't flagged
    if (adsToMarkExhausted.length > 0) {
      await db.update(nativeAds)
        .set({ dailyBudgetExhaustedAt: new Date(), updatedAt: new Date() })
        .where(inArray(nativeAds.id, adsToMarkExhausted));
    }
    
    res.json(adsWithStats);
  } catch (error) {
    console.error("Error getting advertiser ads:", error);
    res.status(500).json({ error: "حدث خطأ" });
  }
});

router.get("/stats", requireAdvertiserAuth, async (req: Request, res: Response) => {
  try {
    const ads = await db.select()
      .from(nativeAds)
      .where(eq(nativeAds.advertiserId, req.session.advertiserId!));
    
    const stats = {
      totalAds: ads.length,
      activeAds: ads.filter(a => a.status === "active").length,
      pendingAds: ads.filter(a => a.status === "pending_approval").length,
      totalImpressions: ads.reduce((sum, a) => sum + a.impressions, 0),
      totalClicks: ads.reduce((sum, a) => sum + a.clicks, 0),
      totalCost: ads.reduce((sum, a) => sum + (a.clicks * (a.costPerClick || 100)) / 100, 0),
      averageCTR: ads.length > 0 
        ? (ads.reduce((sum, a) => sum + (a.impressions > 0 ? (a.clicks / a.impressions) * 100 : 0), 0) / ads.length).toFixed(2)
        : "0.00",
    };
    
    res.json(stats);
  } catch (error) {
    console.error("Error getting advertiser stats:", error);
    res.status(500).json({ error: "حدث خطأ" });
  }
});

export default router;
