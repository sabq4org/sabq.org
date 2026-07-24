import { Router, Request, Response, NextFunction } from "express";
import { db } from "../db";
import { eq, and, or, desc, gte, lte, isNull, sql, sum, inArray } from "drizzle-orm";
import { nativeAds, nativeAdImpressions, nativeAdClicks, nativeAdDailySpend, insertNativeAdSchema, categories } from "@shared/schema";
import { isUniqueViolation } from "../utils/pgError";
import { requireAuth, requireRole } from "../rbac";
import { z } from "zod";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import sharp from "sharp";
import rateLimit from "express-rate-limit";
import { cfKeyGenerator, cfValidate } from "../utils/rateLimiting";
import { objectStorageClient } from "../objectStorage";
import { setObjectAclPolicy } from "../objectAcl";

const router = Router();

// GCS bucket configuration for advertiser uploads
// Try OBJECT_STORAGE_BUCKET first, then extract from PUBLIC_OBJECT_SEARCH_PATHS
function getBucketId(): string {
  if (process.env.OBJECT_STORAGE_BUCKET) {
    return process.env.OBJECT_STORAGE_BUCKET;
  }
  // Extract bucket name from PUBLIC_OBJECT_SEARCH_PATHS (e.g., "/sabq-production-bucket/public" -> "sabq-production-bucket")
  const publicPaths = process.env.PUBLIC_OBJECT_SEARCH_PATHS || "";
  const firstPath = publicPaths.split(",")[0]?.trim();
  if (firstPath) {
    const parts = firstPath.split("/").filter(Boolean);
    if (parts.length > 0) {
      return parts[0];
    }
  }
  return "";
}
const GCS_BUCKET_ID = getBucketId();
const ADVERTISER_UPLOADS_PATH = "advertiser-ads";

// Log bucket configuration
console.log(`[NativeAds] GCS Bucket ID: ${GCS_BUCKET_ID || "(not configured)"}`);
console.log(`[NativeAds] PUBLIC_OBJECT_SEARCH_PATHS: ${process.env.PUBLIC_OBJECT_SEARCH_PATHS || "(not set)"}`);

// Fallback: Also maintain local uploads directory for development/testing
const uploadsBase = process.env.UPLOADS_DIR || (fs.existsSync("/home/runner/workspace/uploads") ? "/home/runner/workspace/uploads" : path.resolve(process.cwd(), "uploads"));
const uploadsDir = path.join(uploadsBase, "advertiser-ads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
console.log(`[NativeAds] Advertiser uploads directory: ${uploadsDir}`);

// Configure multer for advertiser uploads
const advertiserUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max for advertisers
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('نوع الملف غير مسموح. الأنواع المسموحة: JPEG, PNG, WEBP, GIF'));
    }
  },
});

function isAdminOrEditor(req: Request, res: Response, next: NextFunction) {
  requireRole("admin", "editor", "superadmin", "chief_editor")(req, res, next);
}

// The self-serve advertiser upload is intentionally public; bound abuse of the
// write endpoint by IP (audit #6 / CWE-306 mitigation).
const advertiserUploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: cfKeyGenerator,
  validate: cfValidate,
  message: { message: "محاولات رفع كثيرة جدًا. حاول لاحقًا." },
});

// sharp's raster formats mapped to a safe on-disk extension. Deriving the
// extension from the VERIFIED decoded format (not originalname) is the core of
// the CWE-434 fix — a .html/.svg with a spoofed image/* header cannot be stored
// with an executable extension.
const VERIFIED_IMAGE_EXT: Record<string, string> = {
  jpeg: "jpg", png: "png", webp: "webp", gif: "gif",
};

// Helper function to normalize legacy image URLs to working paths
function normalizeImageUrl(url: string | null): string {
  if (!url) return '';
  
  // Already a working path
  if (url.startsWith('/public-objects/') || url.startsWith('/api/media/proxy/') || url.startsWith('http')) {
    return url;
  }
  
  // Convert legacy local uploads path to GCS public-objects path
  // /uploads/advertiser-ads/filename.png -> /public-objects/advertiser-ads/filename.png
  if (url.startsWith('/uploads/advertiser-ads/')) {
    const filename = url.replace('/uploads/advertiser-ads/', '');
    return `/public-objects/advertiser-ads/${filename}`;
  }
  
  // Any other /uploads/ path
  if (url.startsWith('/uploads/')) {
    const relativePath = url.replace('/uploads/', '');
    return `/public-objects/${relativePath}`;
  }
  
  return url;
}

function getDeviceType(userAgent: string | undefined): string {
  if (!userAgent) return "unknown";
  const ua = userAgent.toLowerCase();
  if (/mobile|android|iphone|ipad|ipod|blackberry|windows phone/.test(ua)) {
    if (/tablet|ipad/.test(ua)) return "tablet";
    return "mobile";
  }
  return "desktop";
}

function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return ips.split(",")[0].trim();
  }
  return req.ip || req.socket.remoteAddress || "unknown";
}

// Weighted random shuffle - higher priority ads appear more often but with randomization
function weightedRandomShuffle<T extends { priority: number }>(items: T[]): T[] {
  if (items.length <= 1) return items;
  
  const result: T[] = [];
  const remaining = [...items];
  
  while (remaining.length > 0) {
    // Calculate total weight (priority squared for stronger weighting)
    const totalWeight = remaining.reduce((sum, item) => sum + Math.pow(item.priority + 1, 2), 0);
    
    // Pick random value
    let random = Math.random() * totalWeight;
    
    // Find the item
    let selectedIndex = 0;
    for (let i = 0; i < remaining.length; i++) {
      random -= Math.pow(remaining[i].priority + 1, 2);
      if (random <= 0) {
        selectedIndex = i;
        break;
      }
    }
    
    result.push(remaining[selectedIndex]);
    remaining.splice(selectedIndex, 1);
  }
  
  return result;
}

// Helper function to check and update daily spend for budget enforcement
// Uses atomic database operations to prevent race conditions
async function checkAndUpdateDailySpend(adId: string, eventType: 'impression' | 'click', costPerClick: number): Promise<{ allowed: boolean; dailySpend: number; dailyBudget: number }> {
  // Get today's date in Saudi Arabia timezone (UTC+3)
  const now = new Date();
  const saudiOffset = 3 * 60 * 60 * 1000; // UTC+3
  const saudiTime = new Date(now.getTime() + saudiOffset);
  const today = saudiTime.toISOString().split('T')[0]; // YYYY-MM-DD
  
  // Get the ad's daily budget
  const [ad] = await db.select().from(nativeAds).where(eq(nativeAds.id, adId)).limit(1);
  if (!ad || !ad.dailyBudgetEnabled || !ad.dailyBudget) {
    return { allowed: true, dailySpend: 0, dailyBudget: 0 };
  }
  
  // Check if budget is already exhausted for today (fast path)
  if (ad.dailyBudgetExhaustedAt) {
    const exhaustedSaudiTime = new Date(ad.dailyBudgetExhaustedAt.getTime() + saudiOffset);
    const exhaustedDate = exhaustedSaudiTime.toISOString().split('T')[0];
    if (exhaustedDate === today) {
      console.log(`[NativeAds] Budget already exhausted for ad ${adId} today`);
      return { allowed: false, dailySpend: ad.dailyBudget, dailyBudget: ad.dailyBudget };
    }
  }
  
  // Calculate cost for this event (only clicks cost money in CPC model)
  const eventCost = eventType === 'click' ? (costPerClick || 0) : 0;
  
  // ATOMIC: Check current spend and reject if already at/over budget BEFORE allowing
  const [currentSpend] = await db.select({ 
    amountHalalas: nativeAdDailySpend.amountHalalas 
  }).from(nativeAdDailySpend)
    .where(and(
      eq(nativeAdDailySpend.nativeAdId, adId),
      eq(nativeAdDailySpend.spendDate, today)
    )).limit(1);
  
  const currentAmount = currentSpend?.amountHalalas || 0;
  
  // STRICT CHECK: If already at or over budget, reject immediately
  if (currentAmount >= ad.dailyBudget) {
    console.log(`[NativeAds] Budget check failed for ad ${adId}: current ${currentAmount} >= limit ${ad.dailyBudget}`);
    // Ensure the exhausted flag is set
    await db.update(nativeAds)
      .set({ dailyBudgetExhaustedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(nativeAds.id, adId), isNull(nativeAds.dailyBudgetExhaustedAt)));
    return { allowed: false, dailySpend: currentAmount, dailyBudget: ad.dailyBudget };
  }
  
  // Check if this click would exceed budget
  const wouldExceed = (currentAmount + eventCost) > ad.dailyBudget;
  if (wouldExceed && eventType === 'click') {
    console.log(`[NativeAds] Click would exceed budget for ad ${adId}: ${currentAmount} + ${eventCost} > ${ad.dailyBudget}`);
    // Mark as capped before allowing this click
    await db.update(nativeAds)
      .set({ dailyBudgetExhaustedAt: new Date(), updatedAt: new Date() })
      .where(eq(nativeAds.id, adId));
    return { allowed: false, dailySpend: currentAmount, dailyBudget: ad.dailyBudget };
  }
  
  // Ensure spend record exists for today
  let [spendRecord] = await db.select().from(nativeAdDailySpend)
    .where(and(
      eq(nativeAdDailySpend.nativeAdId, adId),
      eq(nativeAdDailySpend.spendDate, today)
    )).limit(1);
  
  if (!spendRecord) {
    try {
      [spendRecord] = await db.insert(nativeAdDailySpend).values({
        nativeAdId: adId,
        spendDate: today,
      }).returning();
    } catch (e: any) {
      // Handle race condition on insert - record may have been created by another request.
      // Drizzle يلفّ خطأ PG، لذا نستخدم isUniqueViolation لفكّه.
      if (isUniqueViolation(e)) {
        [spendRecord] = await db.select().from(nativeAdDailySpend)
          .where(and(
            eq(nativeAdDailySpend.nativeAdId, adId),
            eq(nativeAdDailySpend.spendDate, today)
          )).limit(1);
      } else {
        throw e;
      }
    }
  }
  
  // ATOMIC UPDATE with conditional check: Only update if still under budget
  // This prevents race conditions where multiple clicks read the same amount
  if (eventType === 'click') {
    const result = await db.execute(sql`
      UPDATE ${nativeAdDailySpend}
      SET 
        clicks = clicks + 1,
        amount_halalas = amount_halalas + ${eventCost},
        updated_at = NOW()
      WHERE id = ${spendRecord.id}
        AND amount_halalas + ${eventCost} <= ${ad.dailyBudget}
      RETURNING amount_halalas
    `);
    
    // If no rows updated, budget was exceeded by another concurrent request
    if (!result.rows || result.rows.length === 0) {
      console.log(`[NativeAds] Atomic update failed for ad ${adId} - budget exceeded by concurrent request`);
      // Mark as capped
      await db.update(nativeAds)
        .set({ dailyBudgetExhaustedAt: new Date(), updatedAt: new Date() })
        .where(eq(nativeAds.id, adId));
      
      // Get current spend for response
      const [finalSpend] = await db.select({ amountHalalas: nativeAdDailySpend.amountHalalas })
        .from(nativeAdDailySpend)
        .where(eq(nativeAdDailySpend.id, spendRecord.id));
      
      return { allowed: false, dailySpend: finalSpend?.amountHalalas || 0, dailyBudget: ad.dailyBudget };
    }
    
    const newAmount = (result.rows[0] as any).amount_halalas;
    
    // Check if we've now hit/exceeded the budget after this click
    if (newAmount >= ad.dailyBudget) {
      console.log(`[NativeAds] Budget reached for ad ${adId}: ${newAmount} >= ${ad.dailyBudget}`);
      await db.update(nativeAdDailySpend)
        .set({ isCapped: true, cappedAt: new Date() })
        .where(eq(nativeAdDailySpend.id, spendRecord.id));
      
      await db.update(nativeAds)
        .set({ dailyBudgetExhaustedAt: new Date(), updatedAt: new Date() })
        .where(eq(nativeAds.id, adId));
    }
    
    return { allowed: true, dailySpend: newAmount, dailyBudget: ad.dailyBudget };
  } else {
    // Impressions don't cost money, but should still be blocked when budget is exhausted
    // This prevents capped ads from continuing to show
    if (currentAmount >= ad.dailyBudget) {
      console.log(`[NativeAds] Impression blocked for ad ${adId} - budget exhausted: ${currentAmount} >= ${ad.dailyBudget}`);
      // Ensure exhausted flag is set
      await db.update(nativeAds)
        .set({ dailyBudgetExhaustedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(nativeAds.id, adId), isNull(nativeAds.dailyBudgetExhaustedAt)));
      return { allowed: false, dailySpend: currentAmount, dailyBudget: ad.dailyBudget };
    }
    
    // Track impression
    await db.update(nativeAdDailySpend)
      .set({ 
        impressions: sql`${nativeAdDailySpend.impressions} + 1`,
        updatedAt: new Date() 
      })
      .where(eq(nativeAdDailySpend.id, spendRecord.id));
    
    return { allowed: true, dailySpend: currentAmount, dailyBudget: ad.dailyBudget };
  }
}

// Helper to get today's date in Saudi timezone for filtering
function getSaudiToday(): string {
  const now = new Date();
  const saudiOffset = 3 * 60 * 60 * 1000; // UTC+3
  const saudiTime = new Date(now.getTime() + saudiOffset);
  return saudiTime.toISOString().split('T')[0]; // YYYY-MM-DD
}

// Check if an ad's budget was exhausted today (Saudi time)
function isBudgetExhaustedToday(exhaustedAt: Date | null): boolean {
  if (!exhaustedAt) return false;
  const saudiOffset = 3 * 60 * 60 * 1000;
  const exhaustedSaudiTime = new Date(exhaustedAt.getTime() + saudiOffset);
  const exhaustedDate = exhaustedSaudiTime.toISOString().split('T')[0];
  return exhaustedDate === getSaudiToday();
}

// Helper to enrich a native ad with calculated metrics
interface EnrichedNativeAd {
  [key: string]: any;
  derivedStatus: string; // Computed status (expired/pending/active based on dates)
  todaySpendHalalas: number;
  dailyBudgetUsagePercent: number;
  totalSpentHalalas: number;
  remainingBudgetHalalas: number;
  ctr: number;
}

function enrichAdWithMetrics(
  ad: any, 
  todaySpendHalalas: number = 0
): EnrichedNativeAd {
  const dailyBudgetHalalas = ad.dailyBudget || 0;
  const dailyBudgetUsagePercent = dailyBudgetHalalas > 0 
    ? Math.round((todaySpendHalalas / dailyBudgetHalalas) * 100)
    : 0;
  
  // Calculate total spent (clicks * CPC) - use 0 if CPC not set
  const costPerClick = ad.costPerClick || 0;
  const totalSpentHalalas = (ad.clicks || 0) * costPerClick;
  const remainingBudgetHalalas = Math.max(0, (ad.totalBudget || 0) - totalSpentHalalas);
  
  // Calculate CTR (Click-Through Rate)
  const ctr = ad.impressions > 0 
    ? Math.round(((ad.clicks || 0) / ad.impressions) * 10000) / 100 
    : 0;
  
  // 🔄 Compute derived status based on actual dates (overrides stored status)
  // This ensures expired/pending ads don't show as "active" in the dashboard
  const now = new Date();
  let derivedStatus = ad.status;
  
  if (ad.status === 'active') {
    // Check if ad has expired (end date passed)
    if (ad.endDate && new Date(ad.endDate) < now) {
      derivedStatus = 'expired';
    }
    // Check if ad hasn't started yet
    else if (ad.startDate && new Date(ad.startDate) > now) {
      derivedStatus = 'pending';
    }
  }
  
  return {
    ...ad,
    derivedStatus, // Separate field for display (doesn't overwrite stored status)
    todaySpendHalalas,
    dailyBudgetUsagePercent,
    totalSpentHalalas,
    remainingBudgetHalalas,
    ctr,
  };
}

// Helper to get today's spend map for multiple ads
async function getTodaySpendMap(adIds: string[]): Promise<Map<string, number>> {
  const spendMap = new Map<string, number>();
  if (adIds.length === 0) return spendMap;
  
  const todayStr = getSaudiToday();
  const spendRecords = await db.select({
    nativeAdId: nativeAdDailySpend.nativeAdId,
    amountHalalas: nativeAdDailySpend.amountHalalas
  }).from(nativeAdDailySpend)
    .where(and(
      eq(nativeAdDailySpend.spendDate, todayStr),
      inArray(nativeAdDailySpend.nativeAdId, adIds)
    ));
  
  for (const record of spendRecords) {
    spendMap.set(record.nativeAdId, record.amountHalalas);
  }
  
  return spendMap;
}

router.get("/public", async (req: Request, res: Response) => {
  try {
    const { category, keyword, limit: limitParam } = req.query;
    const now = new Date();
    const maxLimit = Math.min(parseInt(limitParam as string) || 5, 6);

    let baseConditions = and(
      eq(nativeAds.status, "active"),
      lte(nativeAds.startDate, now),
      or(isNull(nativeAds.endDate), gte(nativeAds.endDate, now))
    );

    const deviceType = getDeviceType(req.headers["user-agent"]);
    if (deviceType !== "unknown") {
      baseConditions = and(
        baseConditions,
        or(
          eq(nativeAds.targetDevices, "all"),
          eq(nativeAds.targetDevices, deviceType)
        )
      );
    }

    let ads = await db
      .select()
      .from(nativeAds)
      .where(baseConditions)
      .orderBy(desc(nativeAds.priority), desc(nativeAds.createdAt))
      .limit(maxLimit * 2);

    if (category && typeof category === "string") {
      // Look up category by slug to get ID
      const [categoryRecord] = await db
        .select({ id: categories.id })
        .from(categories)
        .where(eq(categories.slug, category))
        .limit(1);
      
      const categoryId = categoryRecord?.id;
      
      ads = ads.filter(ad => 
        // Match by category ID or slug (for flexibility)
        ad.targetCategories?.includes(categoryId || category) || 
        ad.targetCategories?.includes(category) ||
        !ad.targetCategories?.length
      );
    }

    if (keyword && typeof keyword === "string") {
      const keywordLower = keyword.toLowerCase();
      ads = ads.filter(ad => 
        ad.targetKeywords?.some(k => k.toLowerCase().includes(keywordLower)) || 
        !ad.targetKeywords?.length
      );
    }

    // Filter out ads that have exceeded their daily budget today
    // Check both the exhausted flag AND actual spend vs budget
    const todayStr = getSaudiToday();
    const adIds = ads.map(a => a.id);
    
    // Get today's spend for filtering
    let spendMap = new Map<string, number>();
    if (adIds.length > 0) {
      const spendRecords = await db.select({
        nativeAdId: nativeAdDailySpend.nativeAdId,
        amountHalalas: nativeAdDailySpend.amountHalalas
      }).from(nativeAdDailySpend)
        .where(and(
          eq(nativeAdDailySpend.spendDate, todayStr),
          inArray(nativeAdDailySpend.nativeAdId, adIds)
        ));
      
      for (const record of spendRecords) {
        spendMap.set(record.nativeAdId, record.amountHalalas);
      }
    }
    
    ads = ads.filter(ad => {
      if (!ad.dailyBudgetEnabled || !ad.dailyBudget) return true;
      // Check both flag AND actual spend
      if (isBudgetExhaustedToday(ad.dailyBudgetExhaustedAt)) return false;
      const todaySpend = spendMap.get(ad.id) || 0;
      return todaySpend < ad.dailyBudget;
    });

    // Apply weighted random rotation based on priority
    const rotatedAds = weightedRandomShuffle(ads);

    const publicAds = rotatedAds.slice(0, maxLimit).map(ad => ({
      id: ad.id,
      title: ad.title,
      description: ad.description,
      imageUrl: normalizeImageUrl(ad.imageUrl),
      destinationUrl: ad.destinationUrl,
      callToAction: ad.callToAction,
      advertiserName: ad.advertiserName,
      advertiserLogo: normalizeImageUrl(ad.advertiserLogo),
      priority: ad.priority,
    }));

    res.json(publicAds);
  } catch (error) {
    console.error("[NativeAds] Error fetching public ads:", error);
    res.status(500).json({ message: "حدث خطأ أثناء جلب الإعلانات" });
  }
});

// Public image upload for self-serve advertisers (no auth required, rate-limited)
router.post("/upload", advertiserUploadLimiter, advertiserUpload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "لم يتم اختيار ملف" });
    }

    const file = req.file;

    // Authoritative content check: sharp only decodes genuine raster images, so
    // an HTML/SVG payload with a spoofed image/* Content-Type is rejected here,
    // and the extension + content-type come from the VERIFIED format — never
    // from attacker-controlled originalname (audit #6, CWE-434).
    let verifiedFormat: string;
    try {
      const meta = await sharp(file.buffer).metadata();
      verifiedFormat = meta.format || "";
    } catch {
      return res.status(400).json({ message: "الملف ليس صورة صالحة" });
    }
    const extension = VERIFIED_IMAGE_EXT[verifiedFormat];
    if (!extension) {
      return res.status(400).json({ message: "نوع الصورة غير مدعوم. المسموح: JPEG, PNG, WEBP, GIF" });
    }
    const verifiedContentType = `image/${verifiedFormat}`;

    const timestamp = Date.now();
    const randomId = crypto.randomBytes(6).toString("hex");
    const filename = `${timestamp}-${randomId}.${extension}`;

    // Try to upload to GCS for persistent storage
    if (GCS_BUCKET_ID) {
      try {
        const objectPath = `public/${ADVERTISER_UPLOADS_PATH}/${filename}`;
        const bucket = objectStorageClient.bucket(GCS_BUCKET_ID);
        const gcsFile = bucket.file(objectPath);

        await gcsFile.save(file.buffer, {
          contentType: verifiedContentType,
          metadata: {
            cacheControl: 'public, max-age=31536000',
          },
        });

        // Make the file publicly accessible
        await setObjectAclPolicy(gcsFile, {
          owner: 'system',
          visibility: 'public',
        });

        // Return proxy URL that works through our object storage proxy
        const publicUrl = `/public-objects/${ADVERTISER_UPLOADS_PATH}/${filename}`;
        
        console.log(`[NativeAds] Advertiser uploaded image to GCS: ${filename}`);
        
        return res.json({ 
          success: true,
          url: publicUrl,
          filename: filename
        });
      } catch (gcsError) {
        console.error("[NativeAds] GCS upload failed, falling back to local storage:", gcsError);
      }
    }

    // Fallback to local storage if GCS is not configured or fails
    const filePath = path.join(uploadsDir, filename);
    fs.writeFileSync(filePath, file.buffer);

    const publicUrl = `/uploads/advertiser-ads/${filename}`;
    
    console.log(`[NativeAds] Advertiser uploaded image locally: ${filename}`);
    
    res.json({ 
      success: true,
      url: publicUrl,
      filename: filename
    });
  } catch (error) {
    console.error("[NativeAds] Error uploading advertiser image:", error);
    res.status(500).json({ message: "فشل في رفع الصورة" });
  }
});

// Public endpoint for self-serve ad submission (no auth required)
const selfServeAdSchema = z.object({
  advertiserName: z.string().min(1, "اسم المعلن مطلوب"),
  advertiserEmail: z.string().email("البريد الإلكتروني غير صحيح"),
  advertiserPhone: z.string().min(1, "رقم الهاتف مطلوب"),
  advertiserCompany: z.string().optional(),
  advertiserId: z.string().optional(),
  title: z.string().min(1, "عنوان الإعلان مطلوب").max(100, "العنوان طويل جداً"),
  description: z.string().max(200, "الوصف طويل جداً").optional(),
  imageUrl: z.string().min(1, "صورة الإعلان مطلوبة"),
  destinationUrl: z.string().url("رابط الوجهة غير صحيح"),
  callToAction: z.string().max(30).optional(),
  targetCategories: z.array(z.string()).optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional().nullable(),
  dailyBudgetEnabled: z.boolean().optional().default(false),
  dailyBudget: z.number().optional(),
}).refine((data) => {
  // When dailyBudgetEnabled is true, dailyBudget must be provided and >= 1000 halalas (10 SAR)
  if (data.dailyBudgetEnabled && (!data.dailyBudget || data.dailyBudget < 1000)) {
    return false;
  }
  return true;
}, {
  message: "الميزانية اليومية مطلوبة عند تفعيل الحد اليومي (الحد الأدنى 10 ريال)",
  path: ["dailyBudget"],
});

// Track recent submissions to prevent duplicates (in-memory for simplicity)
const recentSubmissions = new Map<string, number>();
const SUBMISSION_COOLDOWN_MS = 30000; // 30 seconds

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now();
  const keysToDelete: string[] = [];
  recentSubmissions.forEach((timestamp, key) => {
    if (now - timestamp > SUBMISSION_COOLDOWN_MS) {
      keysToDelete.push(key);
    }
  });
  keysToDelete.forEach(key => recentSubmissions.delete(key));
}, 5 * 60 * 1000);

router.post("/submit", async (req: Request, res: Response) => {
  let submissionKey: string | null = null;
  
  try {
    console.log("[NativeAds] Received ad submission request");
    
    const validatedData = selfServeAdSchema.parse(req.body);
    
    // Create a unique key for this submission to detect duplicates
    submissionKey = `${validatedData.advertiserEmail}-${validatedData.title}-${validatedData.imageUrl}`;
    const lastSubmission = recentSubmissions.get(submissionKey);
    
    if (lastSubmission && Date.now() - lastSubmission < SUBMISSION_COOLDOWN_MS) {
      console.log(`[NativeAds] Duplicate submission detected within cooldown: ${submissionKey}`);
      return res.status(429).json({ 
        success: false,
        message: "تم استلام طلبك بالفعل. يرجى الانتظار قبل المحاولة مرة أخرى.",
        duplicate: true
      });
    }
    
    // Mark this submission as processing
    recentSubmissions.set(submissionKey, Date.now());
    
    // Validate advertiserId if provided - must match session or be from valid logged-in advertiser
    let advertiserId = validatedData.advertiserId || null;
    if (advertiserId && req.session.advertiserId !== advertiserId) {
      // Prevent spoofing - if advertiserId doesn't match session, ignore it
      advertiserId = null;
    }
    
    // Normalize dailyBudget to integer halalas (already in halalas from frontend)
    const normalizedDailyBudget = validatedData.dailyBudget 
      ? Math.round(validatedData.dailyBudget) 
      : null;
    
    const [newAd] = await db.insert(nativeAds).values({
      title: validatedData.title,
      description: validatedData.description || null,
      imageUrl: validatedData.imageUrl,
      destinationUrl: validatedData.destinationUrl,
      callToAction: validatedData.callToAction || "اقرأ المزيد",
      advertiserName: validatedData.advertiserName,
      advertiserEmail: validatedData.advertiserEmail,
      advertiserPhone: validatedData.advertiserPhone,
      advertiserCompany: validatedData.advertiserCompany || null,
      advertiserId: advertiserId,
      isSelfServe: true,
      targetCategories: validatedData.targetCategories || [],
      targetDevices: "all",
      startDate: validatedData.startDate,
      endDate: validatedData.endDate || null,
      priority: 5,
      status: "pending_approval",
      dailyBudgetEnabled: validatedData.dailyBudgetEnabled || false,
      dailyBudget: normalizedDailyBudget,
    }).returning();

    console.log(`[NativeAds] New self-serve ad submitted: ${newAd.id} by ${validatedData.advertiserEmail}`);

    res.status(201).json({ 
      success: true, 
      message: "تم استلام طلبك بنجاح! سيتم مراجعة إعلانك والتواصل معك قريباً.",
      adId: newAd.id 
    });
  } catch (error) {
    // Clear the submission key on error so user can retry
    if (submissionKey) {
      recentSubmissions.delete(submissionKey);
    }
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        message: "بيانات غير صحيحة", 
        errors: error.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
      });
    }
    console.error("[NativeAds] Error submitting self-serve ad:", error);
    res.status(500).json({ message: "حدث خطأ أثناء إرسال الطلب" });
  }
});

router.post("/:id/impression", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { articleId, sessionId } = req.body;
    const userId = (req as any).user?.id;
    const userAgent = req.headers["user-agent"];
    const deviceType = getDeviceType(userAgent);
    const ipAddress = getClientIp(req);

    const [ad] = await db.select().from(nativeAds).where(eq(nativeAds.id, id)).limit(1);
    if (!ad) {
      return res.status(404).json({ message: "الإعلان غير موجود" });
    }

    // Check daily budget (impressions don't cost money, but we still track them)
    const budgetCheck = await checkAndUpdateDailySpend(id, 'impression', ad.costPerClick || 0);
    if (!budgetCheck.allowed) {
      return res.status(429).json({ 
        message: "تم استنفاد الميزانية اليومية لهذا الإعلان",
        dailySpend: budgetCheck.dailySpend,
        dailyBudget: budgetCheck.dailyBudget
      });
    }

    // Only include articleId if it's a valid UUID (36 chars with hyphens)
    const validArticleId = articleId && typeof articleId === 'string' && 
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(articleId) 
      ? articleId : undefined;

    const [impression] = await db.insert(nativeAdImpressions).values({
      nativeAdId: id,
      articleId: validArticleId,
      userId,
      sessionId,
      deviceType,
      userAgent,
      ipAddress,
    }).returning();

    await db
      .update(nativeAds)
      .set({ 
        impressions: sql`${nativeAds.impressions} + 1`,
        updatedAt: new Date()
      })
      .where(eq(nativeAds.id, id));

    res.json({ success: true, impressionId: impression.id });
  } catch (error) {
    console.error("[NativeAds] Error tracking impression:", error);
    res.status(500).json({ message: "حدث خطأ أثناء تسجيل المشاهدة" });
  }
});

router.post("/:id/click", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { articleId, sessionId, impressionId } = req.body;
    const userId = (req as any).user?.id;
    const userAgent = req.headers["user-agent"];
    const deviceType = getDeviceType(userAgent);
    const ipAddress = getClientIp(req);

    const [ad] = await db.select().from(nativeAds).where(eq(nativeAds.id, id)).limit(1);
    if (!ad) {
      return res.status(404).json({ message: "الإعلان غير موجود" });
    }

    // Check daily budget before recording click (clicks cost money in CPC model)
    const budgetCheck = await checkAndUpdateDailySpend(id, 'click', ad.costPerClick || 0);
    if (!budgetCheck.allowed) {
      console.log(`[NativeAds] Budget exceeded for ad ${id}: spent ${budgetCheck.dailySpend} halalas of ${budgetCheck.dailyBudget} daily budget`);
      return res.status(429).json({ 
        message: "تم استنفاد الميزانية اليومية لهذا الإعلان",
        dailySpend: budgetCheck.dailySpend,
        dailyBudget: budgetCheck.dailyBudget
      });
    }

    // Only include articleId if it's a valid UUID
    const validArticleId = articleId && typeof articleId === 'string' && 
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(articleId) 
      ? articleId : undefined;

    await db.insert(nativeAdClicks).values({
      nativeAdId: id,
      impressionId,
      articleId: validArticleId,
      userId,
      sessionId,
      deviceType,
      userAgent,
      ipAddress,
    });

    await db
      .update(nativeAds)
      .set({ 
        clicks: sql`${nativeAds.clicks} + 1`,
        updatedAt: new Date()
      })
      .where(eq(nativeAds.id, id));

    res.json({ success: true, destinationUrl: ad.destinationUrl });
  } catch (error) {
    console.error("[NativeAds] Error tracking click:", error);
    res.status(500).json({ message: "حدث خطأ أثناء تسجيل النقرة" });
  }
});

router.get("/analytics", requireAuth, isAdminOrEditor, async (req: Request, res: Response) => {
  try {
    const { adId, startDate, endDate } = req.query;

    let query = db.select().from(nativeAds);

    if (adId && typeof adId === "string") {
      query = query.where(eq(nativeAds.id, adId)) as typeof query;
    }

    const ads = await query.orderBy(desc(nativeAds.createdAt));

    const analytics = await Promise.all(
      ads.map(async (ad) => {
        let impressionConditions = eq(nativeAdImpressions.nativeAdId, ad.id);
        let clickConditions = eq(nativeAdClicks.nativeAdId, ad.id);

        if (startDate && typeof startDate === "string") {
          const start = new Date(startDate);
          impressionConditions = and(impressionConditions, gte(nativeAdImpressions.createdAt, start)) as any;
          clickConditions = and(clickConditions, gte(nativeAdClicks.createdAt, start)) as any;
        }

        if (endDate && typeof endDate === "string") {
          const end = new Date(endDate);
          impressionConditions = and(impressionConditions, lte(nativeAdImpressions.createdAt, end)) as any;
          clickConditions = and(clickConditions, lte(nativeAdClicks.createdAt, end)) as any;
        }

        const impressionsData = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(nativeAdImpressions)
          .where(impressionConditions);

        const clicksData = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(nativeAdClicks)
          .where(clickConditions);

        const deviceBreakdown = await db
          .select({
            deviceType: nativeAdImpressions.deviceType,
            count: sql<number>`count(*)::int`,
          })
          .from(nativeAdImpressions)
          .where(impressionConditions)
          .groupBy(nativeAdImpressions.deviceType);

        const periodImpressions = impressionsData[0]?.count || 0;
        const periodClicks = clicksData[0]?.count || 0;
        const ctr = periodImpressions > 0 ? (periodClicks / periodImpressions) * 100 : 0;

        return {
          ad: {
            id: ad.id,
            title: ad.title,
            advertiserName: ad.advertiserName,
            status: ad.status,
            startDate: ad.startDate,
            endDate: ad.endDate,
          },
          totalImpressions: ad.impressions,
          totalClicks: ad.clicks,
          periodImpressions,
          periodClicks,
          ctr: Math.round(ctr * 100) / 100,
          deviceBreakdown,
          costPerClick: ad.costPerClick,
          estimatedSpend: periodClicks * (ad.costPerClick || 0),
        };
      })
    );

    // 🔄 Calculate truly active ads (not expired, not pending)
    const now = new Date();
    const trulyActiveAds = ads.filter(a => {
      if (a.status !== "active") return false;
      if (a.endDate && new Date(a.endDate) < now) return false;
      if (a.startDate && new Date(a.startDate) > now) return false;
      return true;
    });
    
    const summary = {
      totalAds: ads.length,
      activeAds: trulyActiveAds.length, // Use date-aware count
      totalImpressions: ads.reduce((sum, a) => sum + a.impressions, 0),
      totalClicks: ads.reduce((sum, a) => sum + a.clicks, 0),
      averageCtr: analytics.length > 0 
        ? Math.round((analytics.reduce((sum, a) => sum + a.ctr, 0) / analytics.length) * 100) / 100 
        : 0,
    };

    res.json({ analytics, summary });
  } catch (error) {
    console.error("[NativeAds] Error fetching analytics:", error);
    res.status(500).json({ message: "حدث خطأ أثناء جلب التحليلات" });
  }
});

router.get("/", requireAuth, isAdminOrEditor, async (req: Request, res: Response) => {
  try {
    const { status, page = "1", limit = "20" } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = Math.min(parseInt(limit as string), 100);
    const offset = (pageNum - 1) * limitNum;

    let query = db.select().from(nativeAds);

    if (status && typeof status === "string") {
      query = query.where(eq(nativeAds.status, status)) as typeof query;
    }

    const ads = await query
      .orderBy(desc(nativeAds.priority), desc(nativeAds.createdAt))
      .limit(limitNum)
      .offset(offset);

    // Get today's spend for all ads using helper
    const adIds = ads.map(a => a.id);
    const todaySpendMap = await getTodaySpendMap(adIds);
    
    // Enrich ads with all calculated metrics using helper
    const enrichedAds = ads.map(ad => 
      enrichAdWithMetrics(ad, todaySpendMap.get(ad.id) || 0)
    );

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(nativeAds);

    res.json({
      ads: enrichedAds,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: countResult?.count || 0,
        totalPages: Math.ceil((countResult?.count || 0) / limitNum),
      },
    });
  } catch (error) {
    console.error("[NativeAds] Error fetching ads:", error);
    res.status(500).json({ message: "حدث خطأ أثناء جلب الإعلانات" });
  }
});

router.get("/:id", requireAuth, isAdminOrEditor, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [ad] = await db.select().from(nativeAds).where(eq(nativeAds.id, id)).limit(1);

    if (!ad) {
      return res.status(404).json({ message: "الإعلان غير موجود" });
    }

    // Get today's spend and enrich with metrics
    const todaySpendMap = await getTodaySpendMap([id]);
    const enrichedAd = enrichAdWithMetrics(ad, todaySpendMap.get(id) || 0);

    res.json(enrichedAd);
  } catch (error) {
    console.error("[NativeAds] Error fetching ad:", error);
    res.status(500).json({ message: "حدث خطأ أثناء جلب الإعلان" });
  }
});

router.post("/", requireAuth, isAdminOrEditor, async (req: Request, res: Response) => {
  try {
    const validatedData = insertNativeAdSchema.parse(req.body);
    const userId = (req as any).user?.id;

    // Validate that dailyBudget doesn't exceed totalBudget
    if (validatedData.dailyBudget && validatedData.totalBudget && validatedData.dailyBudget > validatedData.totalBudget) {
      return res.status(400).json({ 
        message: "الميزانية اليومية لا يمكن أن تتجاوز الميزانية الإجمالية",
        field: "dailyBudget"
      });
    }

    // Auto-enable daily budget if dailyBudget is set
    const dailyBudgetEnabled = validatedData.dailyBudget && validatedData.dailyBudget > 0 ? true : false;

    const [newAd] = await db.insert(nativeAds).values({
      ...validatedData,
      dailyBudgetEnabled,
      createdBy: userId,
    }).returning();

    res.status(201).json(newAd);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        message: "بيانات غير صالحة", 
        errors: error.errors 
      });
    }
    console.error("[NativeAds] Error creating ad:", error);
    res.status(500).json({ message: "حدث خطأ أثناء إنشاء الإعلان" });
  }
});

// Advertiser endpoint to update their own ad's daily budget
router.patch("/my-ads/:id/budget", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const advertiserId = req.session.advertiserId;
    
    if (!advertiserId) {
      return res.status(401).json({ message: "يجب تسجيل الدخول كمعلن" });
    }
    
    const [existingAd] = await db.select().from(nativeAds)
      .where(and(
        eq(nativeAds.id, id),
        eq(nativeAds.advertiserId, advertiserId)
      )).limit(1);
    
    if (!existingAd) {
      return res.status(404).json({ message: "الإعلان غير موجود أو لا تملك صلاحية تعديله" });
    }
    
    // Calculate total spent from clicks (same calculation as frontend)
    // totalCost = clicks * costPerClick (in halalas)
    const totalSpentHalalas = existingAd.clicks * (existingAd.costPerClick || 100);
    const totalBudgetHalalas = existingAd.totalBudget || 0;
    const remainingBudgetHalalas = Math.max(0, totalBudgetHalalas - totalSpentHalalas);
    
    const budgetUpdateSchema = z.object({
      dailyBudgetEnabled: z.boolean(),
      dailyBudget: z.number().optional(),
    }).refine((data) => {
      if (data.dailyBudgetEnabled && (!data.dailyBudget || data.dailyBudget < 1000)) {
        return false;
      }
      return true;
    }, {
      message: "الميزانية اليومية مطلوبة عند تفعيل الحد اليومي (الحد الأدنى 10 ريال)",
      path: ["dailyBudget"],
    });
    
    const validatedData = budgetUpdateSchema.parse(req.body);
    
    // Normalize dailyBudget to integer halalas
    const normalizedDailyBudget = validatedData.dailyBudget 
      ? Math.round(validatedData.dailyBudget) 
      : null;
    
    // Validate daily budget does not exceed remaining budget (if total budget is set)
    if (validatedData.dailyBudgetEnabled && normalizedDailyBudget && totalBudgetHalalas > 0) {
      if (normalizedDailyBudget > remainingBudgetHalalas) {
        const remainingSAR = (remainingBudgetHalalas / 100).toFixed(2);
        return res.status(400).json({ 
          message: `الميزانية اليومية (${(normalizedDailyBudget / 100).toFixed(2)} ر.س) تتجاوز الميزانية المتبقية (${remainingSAR} ر.س)`,
          remainingBudget: remainingBudgetHalalas,
          remainingBudgetSAR: parseFloat(remainingSAR)
        });
      }
    }
    
    // Get today's spend to check if we should clear the exhausted flag
    // Use BOTH daily spend record AND calculated spend from clicks to be safe
    const todayStr = getSaudiToday();
    const [todaySpendRecord] = await db.select({ amountHalalas: nativeAdDailySpend.amountHalalas })
      .from(nativeAdDailySpend)
      .where(and(
        eq(nativeAdDailySpend.nativeAdId, id),
        eq(nativeAdDailySpend.spendDate, todayStr)
      )).limit(1);
    
    const spendFromRecord = todaySpendRecord?.amountHalalas || 0;
    // Also use the min of today's spend and total ad spend as a fallback
    // This handles cases where spend record doesn't exist or is stale
    const todaySpendHalalas = Math.max(spendFromRecord, 0);
    
    // Only clear exhaustion flag if new budget is STRICTLY higher than today's spend
    // This prevents re-enabling an ad that's already spent past the new limit
    const shouldClearExhausted = existingAd.dailyBudgetExhaustedAt && 
      validatedData.dailyBudgetEnabled && 
      normalizedDailyBudget &&
      normalizedDailyBudget > todaySpendHalalas;
    
    const [updatedAd] = await db
      .update(nativeAds)
      .set({
        dailyBudgetEnabled: validatedData.dailyBudgetEnabled,
        dailyBudget: normalizedDailyBudget,
        dailyBudgetExhaustedAt: shouldClearExhausted ? null : existingAd.dailyBudgetExhaustedAt,
        updatedAt: new Date(),
      })
      .where(eq(nativeAds.id, id))
      .returning();
    
    console.log(`[NativeAds] Advertiser ${advertiserId} updated budget for ad ${id}: ${normalizedDailyBudget} halalas, cleared exhausted: ${shouldClearExhausted}`);
    
    res.json({ 
      success: true, 
      ad: updatedAd,
      message: shouldClearExhausted 
        ? "تم رفع الميزانية اليومية وإعادة تفعيل الإعلان" 
        : "تم تحديث الميزانية اليومية بنجاح"
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        message: "بيانات غير صالحة", 
        errors: error.errors 
      });
    }
    console.error("[NativeAds] Error updating advertiser ad budget:", error);
    res.status(500).json({ message: "حدث خطأ أثناء تحديث الميزانية" });
  }
});

router.patch("/:id", requireAuth, isAdminOrEditor, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [existingAd] = await db.select().from(nativeAds).where(eq(nativeAds.id, id)).limit(1);
    if (!existingAd) {
      return res.status(404).json({ message: "الإعلان غير موجود" });
    }

    const updateSchema = insertNativeAdSchema.partial();
    const validatedData = updateSchema.parse(req.body);
    
    // Validate that dailyBudget doesn't exceed totalBudget
    const effectiveTotalBudget = validatedData.totalBudget ?? existingAd.totalBudget;
    const effectiveDailyBudget = (validatedData as any).dailyBudget ?? existingAd.dailyBudget;
    
    if (effectiveDailyBudget && effectiveTotalBudget && effectiveDailyBudget > effectiveTotalBudget) {
      return res.status(400).json({ 
        message: "الميزانية اليومية لا يمكن أن تتجاوز الميزانية الإجمالية",
        field: "dailyBudget"
      });
    }
    
    // If totalBudget is being reduced, check if dailyBudget needs adjustment
    let adjustedDailyBudget = existingAd.dailyBudget;
    let budgetAdjusted = false;
    let disableDailyBudget = false;
    
    if (validatedData.totalBudget !== undefined && validatedData.totalBudget !== null && existingAd.dailyBudgetEnabled && existingAd.dailyBudget) {
      const totalSpentHalalas = existingAd.clicks * (existingAd.costPerClick || 0);
      const newRemainingBudget = Math.max(0, validatedData.totalBudget - totalSpentHalalas);
      
      // If remaining budget is below minimum (10 SAR = 1000 halalas), disable daily budget
      if (newRemainingBudget < 1000) {
        disableDailyBudget = true;
        adjustedDailyBudget = null;
        budgetAdjusted = true;
        console.log(`[NativeAds] Disabling dailyBudget for ad ${id}: remaining ${newRemainingBudget} < 1000 minimum`);
      }
      // If daily budget exceeds new remaining, auto-adjust it
      else if (existingAd.dailyBudget > newRemainingBudget) {
        adjustedDailyBudget = newRemainingBudget;
        budgetAdjusted = true;
        console.log(`[NativeAds] Auto-adjusting dailyBudget for ad ${id}: ${existingAd.dailyBudget} -> ${adjustedDailyBudget}`);
      }
    }
    
    // Check if dailyBudget is being increased - need to clear exhausted flag
    let shouldClearExhausted = false;
    const newDailyBudget = (validatedData as any).dailyBudget;
    if (newDailyBudget !== undefined && existingAd.dailyBudgetExhaustedAt) {
      const todayStr = getSaudiToday();
      const [todaySpendRecord] = await db.select({ amountHalalas: nativeAdDailySpend.amountHalalas })
        .from(nativeAdDailySpend)
        .where(and(
          eq(nativeAdDailySpend.nativeAdId, id),
          eq(nativeAdDailySpend.spendDate, todayStr)
        )).limit(1);
      
      const todaySpendHalalas = todaySpendRecord?.amountHalalas || 0;
      shouldClearExhausted = newDailyBudget > todaySpendHalalas;
      if (shouldClearExhausted) {
        console.log(`[NativeAds] Admin raised dailyBudget for ad ${id}: ${existingAd.dailyBudget} -> ${newDailyBudget}, clearing exhausted flag`);
      }
    }

    // Auto-enable daily budget if being set/updated via admin
    const shouldEnableDailyBudget = newDailyBudget !== undefined && newDailyBudget > 0;
    
    // CRITICAL: Preserve isSelfServe from existing ad - admin should not change this flag
    // The frontend form doesn't include isSelfServe but schema defaults it to false
    const { isSelfServe: _ignored, ...safeValidatedData } = validatedData as any;
    
    const [updatedAd] = await db
      .update(nativeAds)
      .set({
        ...safeValidatedData,
        isSelfServe: existingAd.isSelfServe, // Always preserve existing value
        ...(budgetAdjusted && {
          dailyBudget: adjustedDailyBudget,
          dailyBudgetEnabled: !disableDailyBudget && existingAd.dailyBudgetEnabled,
        }),
        ...(shouldEnableDailyBudget && !budgetAdjusted && {
          dailyBudgetEnabled: true,
        }),
        ...(shouldClearExhausted && {
          dailyBudgetExhaustedAt: null,
        }),
        updatedAt: new Date(),
      })
      .where(eq(nativeAds.id, id))
      .returning();

    let adjustmentMessage = "";
    if (disableDailyBudget) {
      adjustmentMessage = "تم إلغاء تفعيل الميزانية اليومية لأن الميزانية المتبقية أقل من الحد الأدنى (10 ر.س)";
    } else if (budgetAdjusted) {
      adjustmentMessage = `تم تعديل الميزانية اليومية تلقائياً إلى ${(adjustedDailyBudget! / 100).toFixed(2)} ر.س لتتناسب مع الميزانية المتبقية`;
    }
    
    // Enrich with all calculated metrics using helper
    const todaySpendMap = await getTodaySpendMap([id]);
    const enrichedAd = enrichAdWithMetrics(updatedAd, todaySpendMap.get(id) || 0);

    res.json({
      ...enrichedAd,
      ...(budgetAdjusted && { 
        budgetAdjusted: true,
        message: adjustmentMessage
      })
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        message: "بيانات غير صالحة", 
        errors: error.errors 
      });
    }
    console.error("[NativeAds] Error updating ad:", error);
    res.status(500).json({ message: "حدث خطأ أثناء تحديث الإعلان" });
  }
});

router.delete("/:id", requireAuth, isAdminOrEditor, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [existingAd] = await db.select().from(nativeAds).where(eq(nativeAds.id, id)).limit(1);
    if (!existingAd) {
      return res.status(404).json({ message: "الإعلان غير موجود" });
    }

    await db.delete(nativeAds).where(eq(nativeAds.id, id));

    res.json({ success: true, message: "تم حذف الإعلان بنجاح" });
  } catch (error) {
    console.error("[NativeAds] Error deleting ad:", error);
    res.status(500).json({ message: "حدث خطأ أثناء حذف الإعلان" });
  }
});

export default router;
