import { Router, Request, Response } from "express";
import sharp from "sharp";
import crypto from "crypto";
import { canAcceptExternalSse, trackExternalSse, CACHE_TTL, withSWR } from "./memoryCache";
import { db } from "./db";
import { pickTableColumns } from "./utils/sanitizeBody";
import { isUniqueViolation } from "./utils/pgError";
import { 
  adAccounts, 
  campaigns, 
  adGroups, 
  creatives,
  inventorySlots,
  adCreativePlacements,
  impressions,
  clicks,
  conversions,
  dailyStats,
  budgetHistory,
  aiRecommendations,
  auditLogs,
  insertAdAccountSchema,
  insertCampaignSchema,
  insertAdGroupSchema,
  insertCreativeSchema,
  insertInventorySlotSchema,
  insertAdCreativePlacementSchema
} from "@shared/schema";
import { eq, and, desc, sql, gte, lte, inArray, ne } from "drizzle-orm";
import type { 
  AdAccount, 
  Campaign, 
  AdGroup, 
  Creative,
  CampaignWithDetails
} from "@shared/schema";
import multer from "multer";
import { ObjectStorageService } from "./objectStorage";

const router = Router();

// ============================================
// DEVICE DETECTION HELPER
// ============================================
function detectDeviceType(userAgent: string | null | undefined): string {
  if (!userAgent) return "desktop";
  const ua = userAgent.toLowerCase();
  if (/mobile|android|iphone|ipod|blackberry|windows phone/i.test(ua)) return "mobile";
  if (/tablet|ipad/i.test(ua)) return "tablet";
  return "desktop";
}

// ============================================
// STORAGE CONFIGURATION
// ============================================

// Initialize Replit Object Storage
const objectStorage = new ObjectStorageService();

// Allowed file extensions for banners
const ALLOWED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
const ALLOWED_VIDEO_EXTENSIONS = ['.mp4', '.webm', '.avi', '.mov'];
const ALL_ALLOWED_EXTENSIONS = [...ALLOWED_IMAGE_EXTENSIONS, ...ALLOWED_VIDEO_EXTENSIONS];

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Get file extension
    const ext = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));
    
    // Map extensions to their actual MIME types
    const extensionMimeMap: Record<string, string[]> = {
      '.jpg': ['image/jpeg'],
      '.jpeg': ['image/jpeg'],
      '.png': ['image/png'],
      '.gif': ['image/gif'],
      '.webp': ['image/webp'],
      '.mp4': ['video/mp4'],
      '.webm': ['video/webm'],
      '.avi': ['video/avi', 'video/x-msvideo'],
      '.mov': ['video/quicktime']
    };
    
    // Check extension
    const isValidExtension = ALL_ALLOWED_EXTENSIONS.includes(ext);
    if (!isValidExtension) {
      return cb(new Error("نوع الملف غير مدعوم. الأنواع المسموحة: الصور (JPG, PNG, GIF, WEBP) والفيديو (MP4, WEBM, AVI, MOV)"));
    }
    
    // Check MIME type matches extension
    const expectedMimeTypes = extensionMimeMap[ext] || [];
    const isValidMimeType = expectedMimeTypes.includes(file.mimetype);
    
    if (isValidMimeType) {
      cb(null, true);
    } else {
      cb(new Error(`نوع الملف غير مطابق. الملف ${ext} يجب أن يكون من نوع: ${expectedMimeTypes.join(', ')}`));
    }
  }
});

// ============================================
// MIDDLEWARE - التحقق من الصلاحيات
// ============================================

// التحقق من أن المستخدم معلن أو مشرف
function requireAdvertiser(req: Request, res: Response, next: Function) {
  if (!req.isAuthenticated()) {
    console.log('[Ads Auth] Rejected - not authenticated:', { 
      path: req.path,
      sessionID: req.sessionID?.slice(0, 10) + '...'
    });
    return res.status(401).json({ error: "يجب تسجيل الدخول أولاً" });
  }
  
  const userRole = (req.user as any)?.role;
  const allowedRoles = ["advertiser", "admin", "superadmin", "editor", "reporter"];
  
  if (!allowedRoles.includes(userRole)) {
    console.log('[Ads Auth] Rejected - role not allowed:', { 
      path: req.path,
      role: userRole 
    });
    return res.status(403).json({ error: "ليس لديك صلاحية الوصول إلى نظام الإعلانات" });
  }

  next();
}

/**
 * Which campaigns may this caller see?
 *
 * `requireAdvertiser` admits advertiser, admin, superadmin, editor AND
 * reporter, and the analytics queries then read whatever campaign id they were
 * handed — so one advertiser could pull a competitor's spend, impressions and
 * conversion figures, and any reporter could read the whole book.
 *
 * Returns `{accountId: null}` for staff (unrestricted, which is the
 * dashboard's purpose), `{accountId}` for an advertiser, or null when the
 * caller owns no ad account — they own nothing, so they must see nothing.
 */
const STAFF_ADS_ROLES = ["admin", "superadmin", "editor"];

async function resolveAdsScope(req: Request): Promise<{ accountId: string | null } | null> {
  const role = (req.user as any)?.role;
  if (STAFF_ADS_ROLES.includes(role)) return { accountId: null };

  const userId = (req.user as any)?.id;
  if (!userId) return null;

  const [account] = await db
    .select({ id: adAccounts.id })
    .from(adAccounts)
    .where(eq(adAccounts.userId, userId))
    .limit(1);

  return account ? { accountId: account.id } : null;
}

/**
 * Express guard for every analytics route that takes a campaign id from the
 * client. Staff pass through; an advertiser may only name campaigns on their
 * own ad account. Reads `campaignId` / `campaignIds` from the query and
 * `campaignId` from the path, so it covers all shapes these routes use.
 */
async function requireCampaignScope(req: Request, res: Response, next: Function) {
  try {
    const scope = await resolveAdsScope(req);
    if (!scope) {
      return res.status(403).json({ error: "لا يوجد حساب معلن مرتبط بهذا المستخدم" });
    }
    // Staff: unrestricted.
    if (scope.accountId === null) return next();

    const raw = [
      req.params?.campaignId,
      req.query?.campaignId,
      ...(typeof req.query?.campaignIds === "string" ? req.query.campaignIds.split(",") : []),
    ].filter((v): v is string => typeof v === "string" && v.length > 0);

    if (raw.length === 0) {
      // No campaign named — the handler aggregates over "everything visible".
      // Pin that to the caller's account so the aggregate can't span the book.
      (req as any).adsScopeAccountId = scope.accountId;
      return next();
    }

    const owned = await db
      .select({ id: campaigns.id })
      .from(campaigns)
      .where(and(inArray(campaigns.id, raw), eq(campaigns.accountId, scope.accountId)));

    if (owned.length !== new Set(raw).size) {
      return res.status(403).json({ error: "لا تملك صلاحية الاطلاع على هذه الحملة" });
    }

    (req as any).adsScopeAccountId = scope.accountId;
    next();
  } catch (error) {
    console.error("[Ads Auth] campaign scope check failed:", error);
    res.status(500).json({ error: "تعذر التحقق من صلاحية الحملة" });
  }
}

// التحقق من أن المستخدم مشرف
function requireAdmin(req: Request, res: Response, next: Function) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "يجب تسجيل الدخول أولاً" });
  }
  
  const userRole = (req.user as any)?.role;
  const allowedRoles = ["admin", "superadmin"];
  
  if (!allowedRoles.includes(userRole)) {
    return res.status(403).json({ error: "يجب أن تكون مشرفاً للقيام بهذا الإجراء" });
  }
  
  next();
}

// ============================================
// AD ACCOUNTS - حسابات المعلنين
// ============================================

// إنشاء حساب معلن جديد
router.post("/accounts", requireAdvertiser, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    
    // التحقق من وجود حساب نشط للمستخدم
    const existingAccount = await db
      .select()
      .from(adAccounts)
      .where(and(
        eq(adAccounts.userId, userId),
        eq(adAccounts.status, "active")
      ))
      .limit(1);
    
    if (existingAccount.length > 0) {
      return res.status(400).json({ 
        error: "لديك حساب معلن نشط بالفعل" 
      });
    }
    
    // التحقق من البيانات
    const validation = insertAdAccountSchema.safeParse({
      ...req.body,
      userId
    });
    
    if (!validation.success) {
      return res.status(400).json({ 
        error: "بيانات غير صحيحة", 
        details: validation.error.errors 
      });
    }
    
    // إنشاء الحساب
    const [account] = await db
      .insert(adAccounts)
      .values(validation.data as typeof adAccounts.$inferInsert)
      .returning();
    
    // تسجيل في audit log
    await db.insert(auditLogs).values({
      userId,
      entityType: "ad_account",
      entityId: account.id,
      action: "create",
      changes: { after: account },
      ipAddress: req.ip,
      userAgent: req.get("user-agent")
    });
    
    res.json(account);
  } catch (error) {
    console.error("[Ads API] خطأ في إنشاء حساب المعلن:", error);
    res.status(500).json({ error: "حدث خطأ في إنشاء الحساب" });
  }
});

// الحصول على حساب المعلن الخاص بالمستخدم
router.get("/accounts/me", requireAdvertiser, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    
    const [account] = await db
      .select()
      .from(adAccounts)
      .where(eq(adAccounts.userId, userId))
      .limit(1);
    
    if (!account) {
      return res.status(404).json({ error: "لم يتم العثور على حساب معلن" });
    }
    
    res.json(account);
  } catch (error) {
    console.error("[Ads API] خطأ في جلب حساب المعلن:", error);
    res.status(500).json({ error: "حدث خطأ في جلب البيانات" });
  }
});

// ============================================
// CAMPAIGNS - الحملات الإعلانية
// ============================================

// إنشاء حملة جديدة
router.post("/campaigns", requireAdvertiser, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    
    // الحصول على حساب المعلن
    const [account] = await db
      .select()
      .from(adAccounts)
      .where(and(
        eq(adAccounts.userId, userId),
        eq(adAccounts.status, "active")
      ))
      .limit(1);
    
    if (!account) {
      return res.status(404).json({ 
        error: "يجب إنشاء حساب معلن أولاً" 
      });
    }
    
    // التحقق من البيانات
    const validation = insertCampaignSchema.safeParse({
      ...req.body,
      accountId: account.id,
      status: "draft" // دائماً تبدأ كمسودة
    });
    
    if (!validation.success) {
      return res.status(400).json({ 
        error: "بيانات غير صحيحة", 
        details: validation.error.errors 
      });
    }
    
    // التحقق من أن الميزانية الإجمالية أكبر من اليومية
    if (validation.data.totalBudget <= validation.data.dailyBudget) {
      return res.status(400).json({ 
        error: "الميزانية الإجمالية يجب أن تكون أكبر من الميزانية اليومية" 
      });
    }
    
    // إنشاء الحملة
    const [campaign] = await db
      .insert(campaigns)
      .values(validation.data)
      .returning();
    
    // تسجيل في audit log
    await db.insert(auditLogs).values({
      userId,
      entityType: "campaign",
      entityId: campaign.id,
      action: "create",
      changes: { after: campaign },
      ipAddress: req.ip,
      userAgent: req.get("user-agent")
    });
    
    res.json(campaign);
  } catch (error) {
    console.error("[Ads API] خطأ في إنشاء الحملة:", error);
    res.status(500).json({ error: "حدث خطأ في إنشاء الحملة" });
  }
});

// الحصول على جميع حملات المعلن
router.get("/campaigns", requireAdvertiser, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const userRole = (req.user as any).role;
    
    let query;
    
    // إذا كان مشرفاً، يرى جميع الحملات (عدا المحذوفة)
    if (["admin", "superadmin"].includes(userRole)) {
      query = db
        .select()
        .from(campaigns)
        .where(ne(campaigns.status, "completed"))
        .orderBy(desc(campaigns.createdAt));
    } else {
      // المعلن يرى حملاته فقط (عدا المحذوفة)
      const [account] = await db
        .select()
        .from(adAccounts)
        .where(eq(adAccounts.userId, userId))
        .limit(1);
      
      if (!account) {
        return res.json([]);
      }
      
      query = db
        .select()
        .from(campaigns)
        .where(and(
          eq(campaigns.accountId, account.id),
          ne(campaigns.status, "completed")
        ))
        .orderBy(desc(campaigns.createdAt));
    }
    
    const results = await query;
    
    // حساب الإحصائيات الحقيقية لكل حملة
    const campaignsWithStats = await Promise.all(
      results.map(async (campaign) => {
        const stats = await db
          .select({
            totalImpressions: sql<number>`COALESCE(COUNT(DISTINCT ${impressions.id}), 0)::int`,
            totalClicks: sql<number>`COALESCE(COUNT(DISTINCT CASE WHEN ${clicks.id} IS NOT NULL THEN ${clicks.id} END), 0)::int`,
          })
          .from(impressions)
          .leftJoin(clicks, eq(clicks.impressionId, impressions.id))
          .where(eq(impressions.campaignId, campaign.id));
        
        const totalImpressions = stats[0]?.totalImpressions || 0;
        const totalClicks = stats[0]?.totalClicks || 0;
        const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
        
        return {
          ...campaign,
          stats: {
            impressions: totalImpressions,
            clicks: totalClicks,
            ctr: parseFloat(ctr.toFixed(2))
          }
        };
      })
    );
    
    res.json(campaignsWithStats);
  } catch (error) {
    console.error("[Ads API] خطأ في جلب الحملات:", error);
    res.status(500).json({ error: "حدث خطأ في جلب البيانات" });
  }
});

// الحصول على تفاصيل حملة محددة
router.get("/campaigns/:id", requireAdvertiser, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const userRole = (req.user as any).role;
    const campaignId = req.params.id;
    
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);
    
    if (!campaign) {
      return res.status(404).json({ error: "الحملة غير موجودة" });
    }
    
    // التحقق من الصلاحية (المشرف يرى كل شيء، المعلن يرى حملاته فقط)
    if (!["admin", "superadmin"].includes(userRole)) {
      const [account] = await db
        .select()
        .from(adAccounts)
        .where(and(
          eq(adAccounts.userId, userId),
          eq(adAccounts.id, campaign.accountId)
        ))
        .limit(1);
      
      if (!account) {
        return res.status(403).json({ error: "ليس لديك صلاحية الوصول لهذه الحملة" });
      }
    }
    
    // جلب المجموعات الإعلانية
    const groups = await db
      .select()
      .from(adGroups)
      .where(eq(adGroups.campaignId, campaignId));
    
    // حساب الإحصائيات
    const stats = await db
      .select({
        totalImpressions: sql<number>`COUNT(DISTINCT ${impressions.id})::int`,
        totalClicks: sql<number>`COUNT(DISTINCT CASE WHEN ${clicks.id} IS NOT NULL THEN ${clicks.id} END)::int`,
        totalConversions: sql<number>`COUNT(DISTINCT CASE WHEN ${conversions.id} IS NOT NULL THEN ${conversions.id} END)::int`
      })
      .from(impressions)
      .leftJoin(clicks, eq(clicks.impressionId, impressions.id))
      .leftJoin(conversions, eq(conversions.clickId, clicks.id))
      .where(eq(impressions.campaignId, campaignId));
    
    const totalImpressions = stats[0]?.totalImpressions || 0;
    const totalClicks = stats[0]?.totalClicks || 0;
    const totalConversions = stats[0]?.totalConversions || 0;
    
    const ctr = totalImpressions > 0 
      ? (totalClicks / totalImpressions) * 100 
      : 0;
    const conversionRate = totalClicks > 0 
      ? (totalConversions / totalClicks) * 100 
      : 0;
    
    // جلب التوصيات
    const recommendations = await db
      .select()
      .from(aiRecommendations)
      .where(eq(aiRecommendations.campaignId, campaignId))
      .orderBy(desc(aiRecommendations.createdAt))
      .limit(5);
    
    const result: CampaignWithDetails = {
      ...campaign,
      adGroups: groups,
      stats: {
        totalImpressions,
        totalClicks,
        totalConversions,
        ctr,
        conversionRate
      },
      recommendations
    };
    
    res.json(result);
  } catch (error) {
    console.error("[Ads API] خطأ في جلب تفاصيل الحملة:", error);
    res.status(500).json({ error: "حدث خطأ في جلب البيانات" });
  }
});

// تحديث حملة
router.put("/campaigns/:id", requireAdvertiser, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const userRole = (req.user as any).role;
    const campaignId = req.params.id;
    
    // جلب الحملة الحالية
    const [existingCampaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);
    
    if (!existingCampaign) {
      return res.status(404).json({ error: "الحملة غير موجودة" });
    }
    
    // التحقق من الصلاحية
    if (!["admin", "superadmin"].includes(userRole)) {
      const [account] = await db
        .select()
        .from(adAccounts)
        .where(and(
          eq(adAccounts.userId, userId),
          eq(adAccounts.id, existingCampaign.accountId)
        ))
        .limit(1);
      
      if (!account) {
        return res.status(403).json({ error: "ليس لديك صلاحية تعديل هذه الحملة" });
      }
      
      // المعلن لا يمكنه تعديل الحملة بعد الموافقة عليها
      if (["active", "completed"].includes(existingCampaign.status)) {
        return res.status(403).json({ 
          error: "لا يمكن تعديل الحملة بعد الموافقة عليها أو إكمالها" 
        });
      }
    }
    
    // تحديث البيانات - whitelist الحقول المسموح بتحديثها فقط
    // CRITICAL: لا نسمح بتحديث accountId لمنع cascade delete
    const allowedFields: Partial<typeof campaigns.$inferInsert> = {};
    
    if (req.body.name !== undefined) allowedFields.name = req.body.name;
    if (req.body.objective !== undefined) allowedFields.objective = req.body.objective;
    if (req.body.totalBudget !== undefined) allowedFields.totalBudget = req.body.totalBudget;
    if (req.body.dailyBudget !== undefined) allowedFields.dailyBudget = req.body.dailyBudget;
    if (req.body.startDate !== undefined) allowedFields.startDate = new Date(req.body.startDate);
    if (req.body.endDate !== undefined) allowedFields.endDate = req.body.endDate ? new Date(req.body.endDate) : null;
    if (req.body.status !== undefined) allowedFields.status = req.body.status;
    if (req.body.bidAmount !== undefined) allowedFields.bidAmount = req.body.bidAmount;
    if (req.body.rejectionReason !== undefined) allowedFields.rejectionReason = req.body.rejectionReason;
    
    allowedFields.updatedAt = new Date();
    
    const [updatedCampaign] = await db
      .update(campaigns)
      .set(allowedFields)
      .where(eq(campaigns.id, campaignId))
      .returning();
    
    // تسجيل في audit log
    await db.insert(auditLogs).values({
      userId,
      entityType: "campaign",
      entityId: campaignId,
      action: "update",
      changes: {
        before: existingCampaign,
        after: updatedCampaign
      },
      ipAddress: req.ip,
      userAgent: req.get("user-agent")
    });
    
    res.json(updatedCampaign);
  } catch (error) {
    console.error("[Ads API] خطأ في تحديث الحملة:", error);
    res.status(500).json({ error: "حدث خطأ في تحديث الحملة" });
  }
});

// حذف حملة (soft delete)
router.delete("/campaigns/:id", requireAdvertiser, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const userRole = (req.user as any).role;
    const campaignId = req.params.id;
    
    // جلب الحملة
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);
    
    if (!campaign) {
      return res.status(404).json({ error: "الحملة غير موجودة" });
    }
    
    // التحقق من الصلاحية
    if (!["admin", "superadmin"].includes(userRole)) {
      const [account] = await db
        .select()
        .from(adAccounts)
        .where(and(
          eq(adAccounts.userId, userId),
          eq(adAccounts.id, campaign.accountId)
        ))
        .limit(1);
      
      if (!account) {
        return res.status(403).json({ error: "ليس لديك صلاحية حذف هذه الحملة" });
      }
    }
    
    // تعيين الحالة كـ completed بدلاً من الحذف الفعلي
    const [deletedCampaign] = await db
      .update(campaigns)
      .set({
        status: "completed",
        updatedAt: new Date()
      })
      .where(eq(campaigns.id, campaignId))
      .returning();
    
    // تسجيل في audit log
    await db.insert(auditLogs).values({
      userId,
      entityType: "campaign",
      entityId: campaignId,
      action: "delete",
      changes: {
        before: campaign,
        after: deletedCampaign
      },
      ipAddress: req.ip,
      userAgent: req.get("user-agent")
    });
    
    res.json({ message: "تم حذف الحملة بنجاح", campaign: deletedCampaign });
  } catch (error) {
    console.error("[Ads API] خطأ في حذف الحملة:", error);
    res.status(500).json({ error: "حدث خطأ في حذف الحملة" });
  }
});

// إرسال حملة للمراجعة
router.post("/campaigns/:id/submit", requireAdvertiser, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const campaignId = req.params.id;
    
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);
    
    if (!campaign) {
      return res.status(404).json({ error: "الحملة غير موجودة" });
    }
    
    // التحقق من الملكية
    const [account] = await db
      .select()
      .from(adAccounts)
      .where(and(
        eq(adAccounts.userId, userId),
        eq(adAccounts.id, campaign.accountId)
      ))
      .limit(1);
    
    if (!account) {
      return res.status(403).json({ error: "ليس لديك صلاحية على هذه الحملة" });
    }
    
    // التحقق من أن الحملة مسودة
    if (campaign.status !== "draft") {
      return res.status(400).json({ 
        error: "يمكن إرسال المسودات فقط للمراجعة" 
      });
    }
    
    // تحديث الحالة
    const [updatedCampaign] = await db
      .update(campaigns)
      .set({
        status: "pending_review",
        updatedAt: new Date()
      })
      .where(eq(campaigns.id, campaignId))
      .returning();
    
    // تسجيل في audit log
    await db.insert(auditLogs).values({
      userId,
      entityType: "campaign",
      entityId: campaignId,
      action: "submit",
      changes: {
        before: { status: campaign.status },
        after: { status: "pending_review" }
      },
      ipAddress: req.ip,
      userAgent: req.get("user-agent")
    });
    
    res.json(updatedCampaign);
  } catch (error) {
    console.error("[Ads API] خطأ في إرسال الحملة للمراجعة:", error);
    res.status(500).json({ error: "حدث خطأ في إرسال الحملة" });
  }
});

// ============================================================
// AD GROUPS MANAGEMENT - إدارة مجموعات الإعلانات
// ============================================================

// إنشاء مجموعة إعلانات جديدة
router.post("/ad-groups", requireAdvertiser, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const userRole = (req.user as any).role;
    
    const validation = insertAdGroupSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({ 
        error: "بيانات غير صحيحة", 
        details: validation.error.errors 
      });
    }
    
    // التحقق من أن الحملة موجودة وأن المستخدم لديه صلاحية
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, validation.data.campaignId))
      .limit(1);
    
    if (!campaign) {
      return res.status(404).json({ error: "الحملة غير موجودة" });
    }
    
    if (!["admin", "superadmin"].includes(userRole)) {
      const [account] = await db
        .select()
        .from(adAccounts)
        .where(and(
          eq(adAccounts.userId, userId),
          eq(adAccounts.id, campaign.accountId)
        ))
        .limit(1);
      
      if (!account) {
        return res.status(403).json({ error: "ليس لديك صلاحية على هذه الحملة" });
      }
    }
    
    const [adGroup] = await db
      .insert(adGroups)
      .values(validation.data)
      .returning();
    
    await db.insert(auditLogs).values({
      userId,
      entityType: "ad_group",
      entityId: adGroup.id,
      action: "create",
      changes: { after: adGroup },
      ipAddress: req.ip,
      userAgent: req.get("user-agent")
    });
    
    res.json(adGroup);
  } catch (error) {
    console.error("[Ads API] خطأ في إنشاء مجموعة الإعلانات:", error);
    res.status(500).json({ error: "حدث خطأ في إنشاء المجموعة" });
  }
});

// جلب جميع مجموعات الإعلانات لحملة معينة
router.get("/campaigns/:campaignId/ad-groups", requireAdvertiser, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const userRole = (req.user as any).role;
    const campaignId = req.params.campaignId;
    
    // التحقق من الصلاحية
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);
    
    if (!campaign) {
      return res.status(404).json({ error: "الحملة غير موجودة" });
    }
    
    if (!["admin", "superadmin"].includes(userRole)) {
      const [account] = await db
        .select()
        .from(adAccounts)
        .where(and(
          eq(adAccounts.userId, userId),
          eq(adAccounts.id, campaign.accountId)
        ))
        .limit(1);
      
      if (!account) {
        return res.status(403).json({ error: "ليس لديك صلاحية" });
      }
    }
    
    const groups = await db
      .select()
      .from(adGroups)
      .where(eq(adGroups.campaignId, campaignId))
      .orderBy(desc(adGroups.createdAt));
    
    res.json(groups);
  } catch (error) {
    console.error("[Ads API] خطأ في جلب المجموعات:", error);
    res.status(500).json({ error: "حدث خطأ في جلب البيانات" });
  }
});

// تحديث مجموعة إعلانات
router.put("/ad-groups/:id", requireAdvertiser, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const userRole = (req.user as any).role;
    const adGroupId = req.params.id;
    
    const [existingGroup] = await db
      .select()
      .from(adGroups)
      .where(eq(adGroups.id, adGroupId))
      .limit(1);
    
    if (!existingGroup) {
      return res.status(404).json({ error: "المجموعة غير موجودة" });
    }
    
    // التحقق من الصلاحية
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, existingGroup.campaignId))
      .limit(1);
    
    if (!["admin", "superadmin"].includes(userRole)) {
      const [account] = await db
        .select()
        .from(adAccounts)
        .where(and(
          eq(adAccounts.userId, userId),
          eq(adAccounts.id, campaign!.accountId)
        ))
        .limit(1);
      
      if (!account) {
        return res.status(403).json({ error: "ليس لديك صلاحية" });
      }
    }
    
    const [updatedGroup] = await db
      .update(adGroups)
      .set({
        ...pickTableColumns(adGroups, req.body),
        updatedAt: new Date()
      })
      .where(eq(adGroups.id, adGroupId))
      .returning();
    
    await db.insert(auditLogs).values({
      userId,
      entityType: "ad_group",
      entityId: adGroupId,
      action: "update",
      changes: {
        before: existingGroup,
        after: updatedGroup
      },
      ipAddress: req.ip,
      userAgent: req.get("user-agent")
    });
    
    res.json(updatedGroup);
  } catch (error) {
    console.error("[Ads API] خطأ في تحديث المجموعة:", error);
    res.status(500).json({ error: "حدث خطأ في التحديث" });
  }
});

// حذف مجموعة إعلانية
router.delete("/ad-groups/:id", requireAdvertiser, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const userRole = (req.user as any).role;
    const adGroupId = req.params.id;
    
    const [existingGroup] = await db
      .select()
      .from(adGroups)
      .where(eq(adGroups.id, adGroupId))
      .limit(1);
    
    if (!existingGroup) {
      return res.status(404).json({ error: "المجموعة غير موجودة" });
    }
    
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, existingGroup.campaignId))
      .limit(1);
    
    if (!["admin", "superadmin"].includes(userRole)) {
      const [account] = await db
        .select()
        .from(adAccounts)
        .where(and(
          eq(adAccounts.userId, userId),
          eq(adAccounts.id, campaign!.accountId)
        ))
        .limit(1);
      
      if (!account) {
        return res.status(403).json({ error: "ليس لديك صلاحية" });
      }
    }
    
    await db
      .delete(adGroups)
      .where(eq(adGroups.id, adGroupId));
    
    await db.insert(auditLogs).values({
      userId,
      entityType: "ad_group",
      entityId: adGroupId,
      action: "delete",
      changes: {
        before: existingGroup
      },
      ipAddress: req.ip,
      userAgent: req.get("user-agent")
    });
    
    res.json({ success: true, message: "تم حذف المجموعة بنجاح" });
  } catch (error) {
    console.error("[Ads API] خطأ في حذف المجموعة:", error);
    res.status(500).json({ error: "حدث خطأ في الحذف" });
  }
});

// ============================================================
// CREATIVES MANAGEMENT - إدارة الإعلانات الفردية
// ============================================================

// إنشاء إعلان جديد
router.post("/creatives", requireAdvertiser, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const userRole = (req.user as any).role;
    
    const validation = insertCreativeSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({ 
        error: "بيانات غير صحيحة", 
        details: validation.error.errors 
      });
    }
    
    // التحقق من أن المجموعة موجودة وأن المستخدم لديه صلاحية
    const [adGroup] = await db
      .select()
      .from(adGroups)
      .where(eq(adGroups.id, validation.data.adGroupId))
      .limit(1);
    
    if (!adGroup) {
      return res.status(404).json({ error: "مجموعة الإعلانات غير موجودة" });
    }
    
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, adGroup.campaignId))
      .limit(1);
    
    if (!["admin", "superadmin"].includes(userRole)) {
      const [account] = await db
        .select()
        .from(adAccounts)
        .where(and(
          eq(adAccounts.userId, userId),
          eq(adAccounts.id, campaign!.accountId)
        ))
        .limit(1);
      
      if (!account) {
        return res.status(403).json({ error: "ليس لديك صلاحية" });
      }
    }
    
    const [creative] = await db
      .insert(creatives)
      .values(validation.data)
      .returning();
    
    await db.insert(auditLogs).values({
      userId,
      entityType: "creative",
      entityId: creative.id,
      action: "create",
      changes: { after: creative },
      ipAddress: req.ip,
      userAgent: req.get("user-agent")
    });
    
    res.json(creative);
  } catch (error) {
    console.error("[Ads API] خطأ في إنشاء الإعلان:", error);
    res.status(500).json({ error: "حدث خطأ في إنشاء الإعلان" });
  }
});

// جلب جميع الإعلانات لمجموعة معينة
router.get("/ad-groups/:adGroupId/creatives", requireAdvertiser, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const userRole = (req.user as any).role;
    const adGroupId = req.params.adGroupId;
    
    // التحقق من الصلاحية
    const [adGroup] = await db
      .select()
      .from(adGroups)
      .where(eq(adGroups.id, adGroupId))
      .limit(1);
    
    if (!adGroup) {
      return res.status(404).json({ error: "المجموعة غير موجودة" });
    }
    
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, adGroup.campaignId))
      .limit(1);
    
    if (!["admin", "superadmin"].includes(userRole)) {
      const [account] = await db
        .select()
        .from(adAccounts)
        .where(and(
          eq(adAccounts.userId, userId),
          eq(adAccounts.id, campaign!.accountId)
        ))
        .limit(1);
      
      if (!account) {
        return res.status(403).json({ error: "ليس لديك صلاحية" });
      }
    }
    
    const allCreatives = await db
      .select()
      .from(creatives)
      .where(eq(creatives.adGroupId, adGroupId))
      .orderBy(desc(creatives.createdAt));
    
    res.json(allCreatives);
  } catch (error) {
    console.error("[Ads API] خطأ في جلب الإعلانات:", error);
    res.status(500).json({ error: "حدث خطأ في جلب البيانات" });
  }
});

// تحديث إعلان
router.put("/creatives/:id", requireAdvertiser, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const userRole = (req.user as any).role;
    const creativeId = req.params.id;
    
    const [existingCreative] = await db
      .select()
      .from(creatives)
      .where(eq(creatives.id, creativeId))
      .limit(1);
    
    if (!existingCreative) {
      return res.status(404).json({ error: "الإعلان غير موجود" });
    }
    
    // التحقق من الصلاحية
    const [adGroup] = await db
      .select()
      .from(adGroups)
      .where(eq(adGroups.id, existingCreative.adGroupId))
      .limit(1);
    
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, adGroup!.campaignId))
      .limit(1);
    
    if (!["admin", "superadmin"].includes(userRole)) {
      const [account] = await db
        .select()
        .from(adAccounts)
        .where(and(
          eq(adAccounts.userId, userId),
          eq(adAccounts.id, campaign!.accountId)
        ))
        .limit(1);
      
      if (!account) {
        return res.status(403).json({ error: "ليس لديك صلاحية" });
      }
    }
    
    const [updatedCreative] = await db
      .update(creatives)
      .set({
        ...pickTableColumns(creatives, req.body),
        updatedAt: new Date()
      })
      .where(eq(creatives.id, creativeId))
      .returning();
    
    await db.insert(auditLogs).values({
      userId,
      entityType: "creative",
      entityId: creativeId,
      action: "update",
      changes: {
        before: existingCreative,
        after: updatedCreative
      },
      ipAddress: req.ip,
      userAgent: req.get("user-agent")
    });
    
    res.json(updatedCreative);
  } catch (error) {
    console.error("[Ads API] خطأ في تحديث الإعلان:", error);
    res.status(500).json({ error: "حدث خطأ في التحديث" });
  }
});

// ============================================================
// ADMIN APPROVAL - موافقة الإدارة
// ============================================================

// موافقة على حملة (مشرف فقط)
router.post("/campaigns/:id/approve", requireAdmin, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const campaignId = req.params.id;
    
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);
    
    if (!campaign) {
      return res.status(404).json({ error: "الحملة غير موجودة" });
    }
    
    if (campaign.status !== "pending_review") {
      return res.status(400).json({ 
        error: "يمكن الموافقة على الحملات قيد المراجعة فقط" 
      });
    }
    
    const [updatedCampaign] = await db
      .update(campaigns)
      .set({
        status: "active",
        updatedAt: new Date()
      })
      .where(eq(campaigns.id, campaignId))
      .returning();
    
    await db.insert(auditLogs).values({
      userId,
      entityType: "campaign",
      entityId: campaignId,
      action: "approve",
      changes: {
        before: { status: campaign.status },
        after: { status: "active" }
      },
      ipAddress: req.ip,
      userAgent: req.get("user-agent")
    });
    
    res.json(updatedCampaign);
  } catch (error) {
    console.error("[Ads API] خطأ في الموافقة على الحملة:", error);
    res.status(500).json({ error: "حدث خطأ في الموافقة" });
  }
});

// رفض حملة (مشرف فقط)
router.post("/campaigns/:id/reject", requireAdmin, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const campaignId = req.params.id;
    const { reason } = req.body;
    
    if (!reason) {
      return res.status(400).json({ error: "يجب تقديم سبب الرفض" });
    }
    
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);
    
    if (!campaign) {
      return res.status(404).json({ error: "الحملة غير موجودة" });
    }
    
    if (campaign.status !== "pending_review") {
      return res.status(400).json({ 
        error: "يمكن رفض الحملات قيد المراجعة فقط" 
      });
    }
    
    const [updatedCampaign] = await db
      .update(campaigns)
      .set({
        status: "rejected",
        updatedAt: new Date()
      })
      .where(eq(campaigns.id, campaignId))
      .returning();
    
    await db.insert(auditLogs).values({
      userId,
      entityType: "campaign",
      entityId: campaignId,
      action: "reject",
      changes: {
        before: { status: campaign.status },
        after: { status: "rejected", reason }
      },
      ipAddress: req.ip,
      userAgent: req.get("user-agent")
    });
    
    res.json({ ...updatedCampaign, rejectionReason: reason });
  } catch (error) {
    console.error("[Ads API] خطأ في رفض الحملة:", error);
    res.status(500).json({ error: "حدث خطأ في الرفض" });
  }
});

// جلب جميع الحملات التي تحتاج مراجعة (مشرف فقط)
router.get("/pending-campaigns", requireAdmin, async (req, res) => {
  try {
    const pendingCampaigns = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.status, "pending_review"))
      .orderBy(desc(campaigns.createdAt));
    
    res.json(pendingCampaigns);
  } catch (error) {
    console.error("[Ads API] خطأ في جلب الحملات المعلقة:", error);
    res.status(500).json({ error: "حدث خطأ في جلب البيانات" });
  }
});

// ============================================================
// ADVANCED ANALYTICS - التحليلات المتقدمة
// ============================================================

// تحليلات الحملة التفصيلية
router.get("/campaigns/:id/analytics", requireAdvertiser, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const userRole = (req.user as any).role;
    const campaignId = req.params.id;
    const { startDate, endDate } = req.query;
    
    // التحقق من الصلاحية
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);
    
    if (!campaign) {
      return res.status(404).json({ error: "الحملة غير موجودة" });
    }
    
    if (!["admin", "superadmin"].includes(userRole)) {
      const [account] = await db
        .select()
        .from(adAccounts)
        .where(and(
          eq(adAccounts.userId, userId),
          eq(adAccounts.id, campaign.accountId)
        ))
        .limit(1);
      
      if (!account) {
        return res.status(403).json({ error: "ليس لديك صلاحية" });
      }
    }
    
    // جلب الإحصائيات اليومية
    let whereConditions = [eq(dailyStats.campaignId, campaignId)];
    
    if (startDate && endDate) {
      whereConditions.push(
        gte(dailyStats.date, new Date(startDate as string)),
        sql`${dailyStats.date} <= ${new Date(endDate as string)}`
      );
    }
    
    const stats = await db
      .select()
      .from(dailyStats)
      .where(and(...whereConditions))
      .orderBy(desc(dailyStats.date))
      .limit(30);
    
    // حساب المقاييس الإجمالية
    const totalImpressions = stats.reduce((sum, s) => sum + (s.impressions || 0), 0);
    const totalClicks = stats.reduce((sum, s) => sum + (s.clicks || 0), 0);
    const totalConversions = stats.reduce((sum, s) => sum + (s.conversions || 0), 0);
    const totalSpent = stats.reduce((sum, s) => sum + Number(s.spent || 0), 0);
    
    const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
    const avgCpc = totalClicks > 0 ? totalSpent / totalClicks : 0;
    const avgCpm = totalImpressions > 0 ? (totalSpent / totalImpressions) * 1000 : 0;
    const conversionRate = totalClicks > 0 ? (totalConversions / totalClicks) * 100 : 0;
    
    res.json({
      campaign: {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        objective: campaign.objective,
        totalBudget: campaign.totalBudget,
        dailyBudget: campaign.dailyBudget
      },
      metrics: {
        totalImpressions,
        totalClicks,
        totalConversions,
        totalSpent,
        avgCtr: Math.round(avgCtr * 100) / 100,
        avgCpc: Math.round(avgCpc * 100) / 100,
        avgCpm: Math.round(avgCpm * 100) / 100,
        conversionRate: Math.round(conversionRate * 100) / 100
      },
      dailyStats: stats,
      budgetUtilization: {
        spent: totalSpent,
        total: Number(campaign.totalBudget),
        percentage: Math.round((totalSpent / Number(campaign.totalBudget)) * 100)
      }
    });
  } catch (error) {
    console.error("[Ads API] خطأ في جلب التحليلات:", error);
    res.status(500).json({ error: "حدث خطأ في جلب التحليلات" });
  }
});

// تحليلات الإعلان الفردي
router.get("/creatives/:id/performance", requireAdvertiser, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const userRole = (req.user as any).role;
    const creativeId = req.params.id;
    
    const [creative] = await db
      .select()
      .from(creatives)
      .where(eq(creatives.id, creativeId))
      .limit(1);
    
    if (!creative) {
      return res.status(404).json({ error: "الإعلان غير موجود" });
    }
    
    // التحقق من الصلاحية
    const [adGroup] = await db
      .select()
      .from(adGroups)
      .where(eq(adGroups.id, creative.adGroupId))
      .limit(1);
    
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, adGroup!.campaignId))
      .limit(1);
    
    if (!["admin", "superadmin"].includes(userRole)) {
      const [account] = await db
        .select()
        .from(adAccounts)
        .where(and(
          eq(adAccounts.userId, userId),
          eq(adAccounts.id, campaign!.accountId)
        ))
        .limit(1);
      
      if (!account) {
        return res.status(403).json({ error: "ليس لديك صلاحية" });
      }
    }
    
    // جلب الأداء
    const performanceData = await db
      .select({
        impressionsCount: sql<number>`COUNT(DISTINCT ${impressions.id})::int`,
        clicksCount: sql<number>`COUNT(DISTINCT CASE WHEN ${clicks.id} IS NOT NULL THEN ${clicks.id} END)::int`,
        conversionsCount: sql<number>`COUNT(DISTINCT CASE WHEN ${conversions.id} IS NOT NULL THEN ${conversions.id} END)::int`
      })
      .from(impressions)
      .leftJoin(clicks, eq(clicks.impressionId, impressions.id))
      .leftJoin(conversions, eq(conversions.clickId, clicks.id))
      .where(eq(impressions.creativeId, creativeId));
    
    const perf = performanceData[0];
    const ctr = perf.impressionsCount > 0 
      ? (perf.clicksCount / perf.impressionsCount) * 100 
      : 0;
    
    res.json({
      creative: {
        id: creative.id,
        name: creative.name,
        type: creative.type,
        status: creative.status
      },
      performance: {
        impressions: perf.impressionsCount,
        clicks: perf.clicksCount,
        conversions: perf.conversionsCount,
        ctr: Math.round(ctr * 100) / 100
      }
    });
  } catch (error) {
    console.error("[Ads API] خطأ في جلب أداء الإعلان:", error);
    res.status(500).json({ error: "حدث خطأ في جلب البيانات" });
  }
});

// ============================================================
// AI RECOMMENDATIONS - التوصيات الذكية
// ============================================================

// جلب توصيات AI للحملة
router.get("/campaigns/:id/ai-recommendations", requireAdvertiser, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const userRole = (req.user as any).role;
    const campaignId = req.params.id;
    
    // التحقق من الصلاحية
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);
    
    if (!campaign) {
      return res.status(404).json({ error: "الحملة غير موجودة" });
    }
    
    if (!["admin", "superadmin"].includes(userRole)) {
      const [account] = await db
        .select()
        .from(adAccounts)
        .where(and(
          eq(adAccounts.userId, userId),
          eq(adAccounts.id, campaign.accountId)
        ))
        .limit(1);
      
      if (!account) {
        return res.status(403).json({ error: "ليس لديك صلاحية" });
      }
    }
    
    // جلب التوصيات الحالية من قاعدة البيانات
    const recommendations = await db
      .select()
      .from(aiRecommendations)
      .where(eq(aiRecommendations.campaignId, campaignId))
      .orderBy(desc(aiRecommendations.createdAt))
      .limit(10);
    
    // إذا لم توجد توصيات حديثة، إنشاء توصيات جديدة
    if (recommendations.length === 0 || 
        (recommendations[0] && new Date().getTime() - new Date(recommendations[0].createdAt).getTime() > 24 * 60 * 60 * 1000)) {
      
      // جلب إحصائيات الحملة
      const stats = await db
        .select({
          totalImpressions: sql<number>`COALESCE(SUM(${dailyStats.impressions}), 0)::int`,
          totalClicks: sql<number>`COALESCE(SUM(${dailyStats.clicks}), 0)::int`,
          totalSpent: sql<number>`COALESCE(SUM(${dailyStats.spent}), 0)::numeric`,
          avgCtr: sql<number>`CASE WHEN SUM(${dailyStats.impressions}) > 0 THEN (SUM(${dailyStats.clicks})::float / SUM(${dailyStats.impressions})::float * 100) ELSE 0 END`
        })
        .from(dailyStats)
        .where(eq(dailyStats.campaignId, campaignId));
      
      const campaignStats = stats[0];
      
      // إنشاء توصيات استناداً إلى الأداء
      const newRecommendations: typeof aiRecommendations.$inferInsert[] = [];
      
      // توصية 1: تحسين CTR إذا كان منخفضاً
      if (campaignStats.avgCtr < 1.0) {
        newRecommendations.push({
          campaignId,
          type: "optimization",
          message: "تحسين معدل النقر (CTR): معدل النقر الحالي أقل من المتوسط. قم بتحديث نص الإعلان والصور لجعلها أكثر جاذبية.",
          priority: "high",
          recommendation: {
            action: "optimize_ctr",
            currentValue: campaignStats.avgCtr,
            suggestedValue: 2.0,
            reason: "معدل النقر الحالي أقل من المتوسط",
            expectedImpact: "زيادة 25% في النقرات",
            implementationSteps: ["تحليل الإعلانات ذات الأداء الأفضل", "تحديث النصوص الإعلانية", "اختبار صور جديدة"]
          },
          confidence: 7500
        });
      }
      
      // توصية 2: تحسين الميزانية
      const budgetUsage = Number(campaignStats.totalSpent) / Number(campaign.totalBudget);
      if (budgetUsage > 0.8) {
        newRecommendations.push({
          campaignId,
          type: "budget",
          message: `زيادة الميزانية: تم إنفاق ${Math.round(budgetUsage * 100)}% من الميزانية. فكر في زيادة الميزانية للحفاظ على الزخم.`,
          priority: "medium",
          recommendation: {
            action: "increase_budget",
            currentValue: campaign.totalBudget,
            suggestedValue: Number(campaign.totalBudget) * 1.5,
            reason: `تم إنفاق ${Math.round(budgetUsage * 100)}% من الميزانية`,
            expectedImpact: "زيادة 20% في الوصول",
            implementationSteps: ["مراجعة أداء الحملة", "تحديد ميزانية إضافية", "تطبيق الزيادة"]
          },
          confidence: 8000
        });
      }
      
      // توصية 3: تحسين الاستهداف
      if (campaignStats.totalClicks > 100 && campaignStats.avgCtr < 2.0) {
        newRecommendations.push({
          campaignId,
          type: "targeting",
          message: "تحسين استهداف الجمهور: النتائج تشير إلى إمكانية تحسين الاستهداف. قم بمراجعة معايير الجمهور المستهدف.",
          priority: "medium",
          recommendation: {
            action: "refine_targeting",
            currentValue: campaignStats.avgCtr,
            suggestedValue: 3.0,
            reason: "معدل النقر يمكن تحسينه مع استهداف أفضل",
            expectedImpact: "زيادة 30% في معدل التحويل",
            implementationSteps: ["تحليل البيانات الديموغرافية", "تعديل معايير الاستهداف", "إنشاء جماهير مشابهة"]
          },
          confidence: 6500
        });
      }
      
      // حفظ التوصيات الجديدة
      if (newRecommendations.length > 0) {
        await db.insert(aiRecommendations).values(newRecommendations);
      }
      
      // جلب التوصيات المحدثة
      const updatedRecs = await db
        .select()
        .from(aiRecommendations)
        .where(eq(aiRecommendations.campaignId, campaignId))
        .orderBy(desc(aiRecommendations.createdAt))
        .limit(10);
      
      return res.json(updatedRecs);
    }
    
    res.json(recommendations);
  } catch (error) {
    console.error("[Ads API] خطأ في جلب توصيات AI:", error);
    res.status(500).json({ error: "حدث خطأ في جلب التوصيات" });
  }
});

// تطبيق توصية AI
router.post("/recommendations/:id/apply", requireAdvertiser, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const recommendationId = req.params.id;
    
    const [recommendation] = await db
      .select()
      .from(aiRecommendations)
      .where(eq(aiRecommendations.id, recommendationId))
      .limit(1);
    
    if (!recommendation) {
      return res.status(404).json({ error: "التوصية غير موجودة" });
    }
    
    // تحديث حالة التوصية
    const [updated] = await db
      .update(aiRecommendations)
      .set({
        isApplied: true,
        appliedAt: new Date(),
        appliedBy: userId
      })
      .where(eq(aiRecommendations.id, recommendationId))
      .returning();
    
    // تسجيل في audit log
    await db.insert(auditLogs).values({
      userId,
      entityType: "recommendation",
      entityId: recommendationId,
      action: "apply",
      changes: {
        before: { isApplied: recommendation.isApplied },
        after: { isApplied: true }
      },
      ipAddress: req.ip,
      userAgent: req.get("user-agent")
    });
    
    res.json(updated);
  } catch (error) {
    console.error("[Ads API] خطأ في تطبيق التوصية:", error);
    res.status(500).json({ error: "حدث خطأ في تطبيق التوصية" });
  }
});

// ============================================================
// RTB (REAL-TIME BIDDING) - المزاد الآني
// ============================================================

// RTB Endpoint - للاستخدام الداخلي فقط
router.post("/rtb/bid-request", async (req, res) => {
  try {
    const {
      slotId,
      userContext,
      pageContext
    } = req.body;
    
    // التحقق من وجود مساحة إعلانية
    const [slot] = await db
      .select()
      .from(inventorySlots)
      .where(and(
        eq(inventorySlots.id, slotId),
        eq(inventorySlots.isActive, true)
      ))
      .limit(1);
    
    if (!slot) {
      return res.status(404).json({ error: "مساحة الإعلان غير متاحة" });
    }
    
    // البحث عن الحملات النشطة المناسبة
    const activeCampaigns = await db
      .select()
      .from(campaigns)
      .where(and(
        eq(campaigns.status, "active"),
        sql`${campaigns.totalBudget} > (
          SELECT COALESCE(SUM(spent), 0) 
          FROM ${dailyStats} 
          WHERE campaign_id = ${campaigns.id}
        )`
      ))
      .limit(20);
    
    if (activeCampaigns.length === 0) {
      return res.status(204).send(); // No ads to show
    }
    
    // حساب نقاط المزايدة (bidding score) لكل حملة
    const bids = await Promise.all(
      activeCampaigns.map(async (campaign) => {
        // جلب الإعلانات النشطة للحملة
        const campaignAds = await db
          .select()
          .from(creatives)
          .innerJoin(adGroups, eq(adGroups.id, creatives.adGroupId))
          .where(and(
            eq(adGroups.campaignId, campaign.id),
            eq(creatives.status, "active")
          ))
          .limit(5);
        
        if (campaignAds.length === 0) return null;
        
        // حساب CTR المتوقع بناءً على الأداء السابق
        const perfStats = await db
          .select({
            avgCtr: sql<number>`CASE WHEN SUM(${dailyStats.impressions}) > 0 THEN (SUM(${dailyStats.clicks})::float / SUM(${dailyStats.impressions})::float) ELSE 0.01 END`
          })
          .from(dailyStats)
          .where(eq(dailyStats.campaignId, campaign.id));
        
        const predictedCtr = perfStats[0]?.avgCtr || 0.01;
        
        // حساب سعر المزايدة بناءً على نوع الهدف
        let bidAmount = 0;
        if (campaign.objective === "cpm") {
          bidAmount = Number(campaign.dailyBudget) / 1000; // CPM
        } else if (campaign.objective === "cpc") {
          bidAmount = Number(campaign.dailyBudget) * predictedCtr; // CPC * predicted CTR
        } else if (campaign.objective === "cpa") {
          bidAmount = Number(campaign.dailyBudget) * predictedCtr * 0.1; // CPA with conversion estimate
        }
        
        return {
          campaignId: campaign.id,
          creative: campaignAds[0].creatives,
          bidAmount,
          predictedCtr,
          score: bidAmount * predictedCtr * 100 // Combined score
        };
      })
    );
    
    // إزالة القيم الفارغة والترتيب حسب النقاط
    const validBids = bids
      .filter(bid => bid !== null)
      .sort((a, b) => b!.score - a!.score);
    
    if (validBids.length === 0) {
      return res.status(204).send();
    }
    
    // اختيار الفائز
    const winner = validBids[0];
    
    // تسجيل الظهور
    await db.insert(impressions).values({
      campaignId: winner!.campaignId,
      creativeId: winner!.creative.id,
      slotId: slotId,
      device: userContext?.deviceType || "desktop",
      country: userContext?.country || "SA",
      pageUrl: pageContext?.url || null,
      referrer: pageContext?.referrer || null,
      userAgent: req.get("user-agent") || null,
      ipAddress: req.ip || null
    });
    
    res.json({
      creative: winner!.creative,
      impressionCost: winner!.bidAmount
    });
  } catch (error) {
    console.error("[RTB] خطأ في معالجة طلب المزايدة:", error);
    res.status(500).json({ error: "حدث خطأ في المزايدة" });
  }
});

// ============================================================
// ADDITIONAL ENDPOINTS FOR CAMPAIGN DETAIL PAGE
// ============================================================

// Get ad groups by campaign ID (query param version)
router.get("/ad-groups", requireAdvertiser, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const userRole = (req.user as any).role;
    const campaignId = req.query.campaignId as string;
    
    if (!campaignId) {
      return res.status(400).json({ error: "يجب توفير معرف الحملة" });
    }
    
    // التحقق من الصلاحية
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);
    
    if (!campaign) {
      return res.status(404).json({ error: "الحملة غير موجودة" });
    }
    
    if (!["admin", "superadmin"].includes(userRole)) {
      const [account] = await db
        .select()
        .from(adAccounts)
        .where(and(
          eq(adAccounts.userId, userId),
          eq(adAccounts.id, campaign.accountId)
        ))
        .limit(1);
      
      if (!account) {
        return res.status(403).json({ error: "ليس لديك صلاحية" });
      }
    }
    
    // جلب المجموعات الإعلانية مع عدد الإعلانات
    const groups = await db
      .select({
        id: adGroups.id,
        campaignId: adGroups.campaignId,
        name: adGroups.name,
        status: adGroups.status,
        targetCountries: adGroups.targetCountries,
        targetDevices: adGroups.targetDevices,
        targetCategories: adGroups.targetCategories,
        targetKeywords: adGroups.targetKeywords,
        createdAt: adGroups.createdAt,
        updatedAt: adGroups.updatedAt,
      })
      .from(adGroups)
      .where(eq(adGroups.campaignId, campaignId))
      .orderBy(desc(adGroups.createdAt));
    
    // جلب عدد الإعلانات والإحصائيات لكل مجموعة
    const groupsWithStats = await Promise.all(
      groups.map(async (group) => {
        // عدد الإعلانات
        const creativesCount = await db
          .select({ count: sql<number>`COUNT(*)::int` })
          .from(creatives)
          .where(eq(creatives.adGroupId, group.id));
        
        // الإحصائيات
        const stats = await db
          .select({
            totalImpressions: sql<number>`COUNT(DISTINCT ${impressions.id})::int`,
            totalClicks: sql<number>`COUNT(DISTINCT CASE WHEN ${clicks.id} IS NOT NULL THEN ${clicks.id} END)::int`,
            totalConversions: sql<number>`COUNT(DISTINCT CASE WHEN ${conversions.id} IS NOT NULL THEN ${conversions.id} END)::int`
          })
          .from(impressions)
          .innerJoin(creatives, eq(impressions.creativeId, creatives.id))
          .leftJoin(clicks, eq(clicks.impressionId, impressions.id))
          .leftJoin(conversions, eq(conversions.clickId, clicks.id))
          .where(eq(creatives.adGroupId, group.id));
        
        const totalImpressions = stats[0]?.totalImpressions || 0;
        const totalClicks = stats[0]?.totalClicks || 0;
        const totalConversions = stats[0]?.totalConversions || 0;
        const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
        
        return {
          ...group,
          creativesCount: creativesCount[0]?.count || 0,
          stats: {
            impressions: totalImpressions,
            clicks: totalClicks,
            conversions: totalConversions,
            ctr: Math.round(ctr * 100) / 100
          }
        };
      })
    );
    
    res.json(groupsWithStats);
  } catch (error) {
    console.error("[Ads API] خطأ في جلب المجموعات:", error);
    res.status(500).json({ error: "حدث خطأ في جلب البيانات" });
  }
});

// Get budget history for a campaign
router.get("/budget/history", requireAdvertiser, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const userRole = (req.user as any).role;
    const campaignId = req.query.campaignId as string;
    
    if (!campaignId) {
      return res.status(400).json({ error: "يجب توفير معرف الحملة" });
    }
    
    // التحقق من الصلاحية
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);
    
    if (!campaign) {
      return res.status(404).json({ error: "الحملة غير موجودة" });
    }
    
    if (!["admin", "superadmin"].includes(userRole)) {
      const [account] = await db
        .select()
        .from(adAccounts)
        .where(and(
          eq(adAccounts.userId, userId),
          eq(adAccounts.id, campaign.accountId)
        ))
        .limit(1);
      
      if (!account) {
        return res.status(403).json({ error: "ليس لديك صلاحية" });
      }
    }
    
    // جلب سجل الميزانية
    const history = await db
      .select()
      .from(budgetHistory)
      .where(eq(budgetHistory.campaignId, campaignId))
      .orderBy(desc(budgetHistory.timestamp))
      .limit(50);
    
    res.json(history);
  } catch (error) {
    console.error("[Ads API] خطأ في جلب سجل الميزانية:", error);
    res.status(500).json({ error: "حدث خطأ في جلب البيانات" });
  }
});

// Get daily stats for a campaign
router.get("/campaigns/:id/daily-stats", requireAdvertiser, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const userRole = (req.user as any).role;
    const campaignId = req.params.id;
    const days = parseInt(req.query.days as string) || 7;
    
    // التحقق من الصلاحية
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);
    
    if (!campaign) {
      return res.status(404).json({ error: "الحملة غير موجودة" });
    }
    
    if (!["admin", "superadmin"].includes(userRole)) {
      const [account] = await db
        .select()
        .from(adAccounts)
        .where(and(
          eq(adAccounts.userId, userId),
          eq(adAccounts.id, campaign.accountId)
        ))
        .limit(1);
      
      if (!account) {
        return res.status(403).json({ error: "ليس لديك صلاحية" });
      }
    }
    
    // حساب تاريخ البداية
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    // جلب الإحصائيات اليومية
    const stats = await db
      .select()
      .from(dailyStats)
      .where(and(
        eq(dailyStats.campaignId, campaignId),
        gte(dailyStats.date, startDate)
      ))
      .orderBy(desc(dailyStats.date));
    
    res.json(stats);
  } catch (error) {
    console.error("[Ads API] خطأ في جلب الإحصائيات اليومية:", error);
    res.status(500).json({ error: "حدث خطأ في جلب البيانات" });
  }
});

// ============================================================
// INVENTORY SLOTS - إدارة أماكن الظهور
// ============================================================

// جلب جميع أماكن الظهور المتاحة
router.get("/inventory-slots", requireAdvertiser, async (req, res) => {
  try {
    const slots = await db
      .select()
      .from(inventorySlots)
      .where(eq(inventorySlots.isActive, true))
      .orderBy(inventorySlots.location, inventorySlots.size);
    
    res.json(slots);
  } catch (error) {
    console.error("[Ads API] خطأ في جلب أماكن الظهور:", error);
    res.status(500).json({ error: "حدث خطأ في جلب البيانات" });
  }
});

// إنشاء مكان ظهور جديد (للمعلنين والمشرفين)
router.post("/inventory-slots", requireAdvertiser, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    
    const validation = insertInventorySlotSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({ 
        error: "بيانات غير صحيحة", 
        details: validation.error.errors 
      });
    }
    
    const [slot] = await db
      .insert(inventorySlots)
      .values(validation.data)
      .returning();
    
    // تسجيل في audit log
    await db.insert(auditLogs).values({
      userId,
      entityType: "inventory_slot",
      entityId: slot.id,
      action: "create",
      changes: { after: slot },
      ipAddress: req.ip,
      userAgent: req.get("user-agent")
    });
    
    res.json(slot);
  } catch (error) {
    console.error("[Ads API] خطأ في إنشاء مكان الظهور:", error);
    res.status(500).json({ error: "حدث خطأ في الإنشاء" });
  }
});

// تحديث مكان ظهور (للمعلنين والمشرفين)
router.put("/inventory-slots/:id", requireAdvertiser, async (req, res) => {
  try {
    const slotId = req.params.id;
    const userId = (req.user as any).id;
    
    const [existingSlot] = await db
      .select()
      .from(inventorySlots)
      .where(eq(inventorySlots.id, slotId))
      .limit(1);
    
    if (!existingSlot) {
      return res.status(404).json({ error: "مكان الظهور غير موجود" });
    }
    
    const [updatedSlot] = await db
      .update(inventorySlots)
      .set({
        ...pickTableColumns(inventorySlots, req.body),
        updatedAt: new Date()
      })
      .where(eq(inventorySlots.id, slotId))
      .returning();
    
    // تسجيل في audit log
    await db.insert(auditLogs).values({
      userId,
      entityType: "inventory_slot",
      entityId: slotId,
      action: "update",
      changes: {
        before: existingSlot,
        after: updatedSlot
      },
      ipAddress: req.ip,
      userAgent: req.get("user-agent")
    });
    
    res.json(updatedSlot);
  } catch (error) {
    console.error("[Ads API] خطأ في تحديث مكان الظهور:", error);
    res.status(500).json({ error: "حدث خطأ في التحديث" });
  }
});

// حذف مكان ظهور (للمعلنين والمشرفين)
router.delete("/inventory-slots/:id", requireAdvertiser, async (req, res) => {
  try {
    const slotId = req.params.id;
    const userId = (req.user as any).id;
    
    const [existingSlot] = await db
      .select()
      .from(inventorySlots)
      .where(eq(inventorySlots.id, slotId))
      .limit(1);
    
    if (!existingSlot) {
      return res.status(404).json({ error: "مكان الظهور غير موجود" });
    }
    
    await db
      .delete(inventorySlots)
      .where(eq(inventorySlots.id, slotId));
    
    // تسجيل في audit log
    await db.insert(auditLogs).values({
      userId,
      entityType: "inventory_slot",
      entityId: slotId,
      action: "delete",
      changes: { before: existingSlot },
      ipAddress: req.ip,
      userAgent: req.get("user-agent")
    });
    
    res.json({ success: true, message: "تم حذف مكان الظهور بنجاح" });
  } catch (error) {
    console.error("[Ads API] خطأ في حذف مكان الظهور:", error);
    res.status(500).json({ error: "حدث خطأ في الحذف" });
  }
});

// ============================================================
// CREATIVES - الإعلانات
// ============================================================

// رفع ملف إعلاني (صورة أو فيديو)
router.post("/creatives/upload", requireAdvertiser, upload.single("file"), async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({ error: "لم يتم رفع أي ملف" });
    }
    
    // تحديد نوع الملف من الامتداد (قائمة بيضاء)
    const ext = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));
    const isImage = ALLOWED_IMAGE_EXTENSIONS.includes(ext);
    const isVideo = ALLOWED_VIDEO_EXTENSIONS.includes(ext);

    if (!isImage && !isVideo) {
      return res.status(400).json({ error: "نوع الملف غير مدعوم" });
    }

    // للصور: تحقّق فعلي من البايتات واشتقاق الامتداد/النوع من الصيغة المُتحقَّقة —
    // لا من الامتداد أو ترويسة MIME (audit #6, CWE-434).
    let safeExt = ext;
    let contentType = file.mimetype;
    if (isImage) {
      const RASTER: Record<string, string> = { jpeg: ".jpg", png: ".png", gif: ".gif", webp: ".webp" };
      try {
        const fmt = (await sharp(file.buffer).metadata()).format || "";
        if (!RASTER[fmt]) return res.status(400).json({ error: "الصورة غير صالحة" });
        safeExt = RASTER[fmt];
        contentType = `image/${fmt}`;
      } catch {
        return res.status(400).json({ error: "الصورة غير صالحة" });
      }
    }

    const fileType = isImage ? "image" : "video";

    // اسم عشوائي + امتداد آمن — لا نستخدم originalname (يمنع اجتياز المسار وامتدادًا مزوَّرًا).
    const safeName = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${safeExt}`;
    const relativePath = `ads/creatives/${userId}/${safeName}`;
    const result = await objectStorage.uploadFile(relativePath, file.buffer, contentType, "public");
    
    // استخدام proxy URL بدلاً من GCS URL المباشر لتجنب مشاكل الصلاحيات
    const proxyUrl = `/public-objects/${relativePath}`;
    
    console.log(`[Ads API] تم رفع ملف إعلاني: ${proxyUrl}`);
    
    res.json({
      url: proxyUrl,
      type: fileType,
      size: file.size,
      mimeType: file.mimetype,
      originalName: file.originalname
    });
  } catch (error) {
    console.error("[Ads API] خطأ في رفع الملف:", error);
    res.status(500).json({ error: "حدث خطأ في رفع الملف" });
  }
});

// إنشاء إعلان جديد
router.post("/creatives", requireAdvertiser, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const userRole = (req.user as any).role;
    
    // التحقق من وجود المجموعة الإعلانية
    const [adGroup] = await db
      .select()
      .from(adGroups)
      .where(eq(adGroups.id, req.body.adGroupId))
      .limit(1);
    
    if (!adGroup) {
      return res.status(404).json({ error: "المجموعة الإعلانية غير موجودة" });
    }
    
    // التحقق من الصلاحية
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, adGroup.campaignId))
      .limit(1);
    
    if (!campaign) {
      return res.status(404).json({ error: "الحملة غير موجودة" });
    }
    
    if (!["admin", "superadmin"].includes(userRole)) {
      const [account] = await db
        .select()
        .from(adAccounts)
        .where(and(
          eq(adAccounts.userId, userId),
          eq(adAccounts.id, campaign.accountId)
        ))
        .limit(1);
      
      if (!account) {
        return res.status(403).json({ error: "ليس لديك صلاحية" });
      }
    }
    
    // التحقق من البيانات
    const validation = insertCreativeSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({ 
        error: "بيانات غير صحيحة", 
        details: validation.error.errors 
      });
    }
    
    // إنشاء الإعلان
    const [creative] = await db
      .insert(creatives)
      .values({
        ...validation.data,
        status: "active"
      })
      .returning();
    
    // تسجيل في audit log
    await db.insert(auditLogs).values({
      userId,
      entityType: "creative",
      entityId: creative.id,
      action: "create",
      changes: { after: creative },
      ipAddress: req.ip,
      userAgent: req.get("user-agent")
    });
    
    console.log(`[Ads API] تم إنشاء إعلان جديد: ${creative.id}`);
    
    res.json(creative);
  } catch (error) {
    console.error("[Ads API] خطأ في إنشاء الإعلان:", error);
    res.status(500).json({ error: "حدث خطأ في إنشاء الإعلان" });
  }
});

// ============================================================
// CAMPAIGN CREATIVES - البنرات حسب الحملة
// ============================================================

// جلب جميع البنرات لحملة معينة
router.get("/campaigns/:campaignId/creatives", requireAdvertiser, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const userRole = (req.user as any).role;
    const campaignId = req.params.campaignId;
    
    // التحقق من الصلاحية
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);
    
    if (!campaign) {
      return res.status(404).json({ error: "الحملة غير موجودة" });
    }
    
    if (!["admin", "superadmin"].includes(userRole)) {
      const [account] = await db
        .select()
        .from(adAccounts)
        .where(and(
          eq(adAccounts.userId, userId),
          eq(adAccounts.id, campaign.accountId)
        ))
        .limit(1);
      
      if (!account) {
        return res.status(403).json({ error: "ليس لديك صلاحية" });
      }
    }
    
    // جلب جميع المجموعات الإعلانية للحملة
    const groups = await db
      .select()
      .from(adGroups)
      .where(eq(adGroups.campaignId, campaignId));
    
    if (groups.length === 0) {
      return res.json([]);
    }
    
    const groupIds = groups.map(g => g.id);
    
    // جلب جميع البنرات للمجموعات
    const allCreatives = await db
      .select()
      .from(creatives)
      .where(inArray(creatives.adGroupId, groupIds))
      .orderBy(desc(creatives.createdAt));
    
    res.json(allCreatives);
  } catch (error) {
    console.error("[Ads API] خطأ في جلب البنرات:", error);
    res.status(500).json({ error: "حدث خطأ في جلب البيانات" });
  }
});

// ============================================================
// DELETE CREATIVE - حذف بنر
// ============================================================

// حذف بنر إعلاني
router.delete("/creatives/:id", requireAdvertiser, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const userRole = (req.user as any).role;
    const creativeId = req.params.id;
    
    // التحقق من وجود البنر
    const [creative] = await db
      .select()
      .from(creatives)
      .where(eq(creatives.id, creativeId))
      .limit(1);
    
    if (!creative) {
      return res.status(404).json({ error: "البنر غير موجود" });
    }
    
    // التحقق من الصلاحية
    const [adGroup] = await db
      .select()
      .from(adGroups)
      .where(eq(adGroups.id, creative.adGroupId))
      .limit(1);
    
    if (!adGroup) {
      return res.status(404).json({ error: "المجموعة غير موجودة" });
    }
    
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, adGroup.campaignId))
      .limit(1);
    
    if (!["admin", "superadmin"].includes(userRole)) {
      const [account] = await db
        .select()
        .from(adAccounts)
        .where(and(
          eq(adAccounts.userId, userId),
          eq(adAccounts.id, campaign!.accountId)
        ))
        .limit(1);
      
      if (!account) {
        return res.status(403).json({ error: "ليس لديك صلاحية" });
      }
    }
    
    // حذف البنر
    await db
      .delete(creatives)
      .where(eq(creatives.id, creativeId));
    
    // تسجيل في audit log
    await db.insert(auditLogs).values({
      userId,
      entityType: "creative",
      entityId: creativeId,
      action: "delete",
      changes: { before: creative },
      ipAddress: req.ip,
      userAgent: req.get("user-agent")
    });
    
    res.json({ message: "تم حذف البنر بنجاح" });
  } catch (error) {
    console.error("[Ads API] خطأ في حذف البنر:", error);
    res.status(500).json({ error: "حدث خطأ في الحذف" });
  }
});

// ============================================================
// AD CREATIVE PLACEMENTS - ربط البنرات بأماكن العرض
// ============================================================

// GET /api/ads/campaigns/:campaignId/placements - List all placements for campaign
router.get("/campaigns/:campaignId/placements", requireAdvertiser, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const userRole = (req.user as any).role;
    const campaignId = req.params.campaignId;
    
    // التحقق من وجود الحملة
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);
    
    if (!campaign) {
      return res.status(404).json({ error: "الحملة غير موجودة" });
    }
    
    // التحقق من الصلاحية (المشرف يرى كل شيء، المعلن يرى حملاته فقط)
    if (!["admin", "superadmin"].includes(userRole)) {
      const [account] = await db
        .select()
        .from(adAccounts)
        .where(and(
          eq(adAccounts.userId, userId),
          eq(adAccounts.id, campaign.accountId)
        ))
        .limit(1);
      
      if (!account) {
        return res.status(403).json({ error: "ليس لديك صلاحية الوصول لهذه الحملة" });
      }
    }
    
    // جلب جميع Placements مع تفاصيل Creatives و InventorySlots
    const placements = await db
      .select({
        id: adCreativePlacements.id,
        campaignId: adCreativePlacements.campaignId,
        adGroupId: adCreativePlacements.adGroupId,
        creativeId: adCreativePlacements.creativeId,
        inventorySlotId: adCreativePlacements.inventorySlotId,
        priority: adCreativePlacements.priority,
        startDate: adCreativePlacements.startDate,
        endDate: adCreativePlacements.endDate,
        status: adCreativePlacements.status,
        createdAt: adCreativePlacements.createdAt,
        updatedAt: adCreativePlacements.updatedAt,
        creative: {
          id: creatives.id,
          name: creatives.name,
          type: creatives.type,
          content: creatives.content,
          size: creatives.size,
          status: creatives.status,
        },
        inventorySlot: {
          id: inventorySlots.id,
          name: inventorySlots.name,
          location: inventorySlots.location,
          size: inventorySlots.size,
          pageType: inventorySlots.pageType,
          isActive: inventorySlots.isActive,
        }
      })
      .from(adCreativePlacements)
      .innerJoin(creatives, eq(adCreativePlacements.creativeId, creatives.id))
      .innerJoin(inventorySlots, eq(adCreativePlacements.inventorySlotId, inventorySlots.id))
      .where(eq(adCreativePlacements.campaignId, campaignId))
      .orderBy(desc(adCreativePlacements.createdAt));
    
    res.json(placements);
  } catch (error) {
    console.error("[Ads API] خطأ في جلب placements:", error);
    res.status(500).json({ error: "حدث خطأ في جلب البيانات" });
  }
});

// POST /api/ads/campaigns/:campaignId/placements - Create placement
router.post("/campaigns/:campaignId/placements", requireAdvertiser, requireAdmin, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const campaignId = req.params.campaignId;
    
    // التحقق من وجود الحملة
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .limit(1);
    
    if (!campaign) {
      return res.status(404).json({ error: "الحملة غير موجودة" });
    }
    
    // التحقق من البيانات
    const validation = insertAdCreativePlacementSchema.safeParse({
      ...req.body,
      campaignId
    });
    
    if (!validation.success) {
      return res.status(400).json({ 
        error: "بيانات غير صحيحة", 
        details: validation.error.errors 
      });
    }
    
    const data = validation.data;
    
    // التحقق من وجود Creative
    const [creative] = await db
      .select()
      .from(creatives)
      .where(eq(creatives.id, data.creativeId))
      .limit(1);
    
    if (!creative) {
      return res.status(404).json({ error: "البنر غير موجود" });
    }
    
    // التحقق من وجود InventorySlot
    const [inventorySlot] = await db
      .select()
      .from(inventorySlots)
      .where(eq(inventorySlots.id, data.inventorySlotId))
      .limit(1);
    
    if (!inventorySlot) {
      return res.status(404).json({ error: "مكان العرض غير موجود" });
    }
    
    // Size compatibility check
    if (creative.size !== inventorySlot.size) {
      return res.status(400).json({ 
        error: `حجم البنر (${creative.size}) لا يتطابق مع حجم مكان العرض (${inventorySlot.size})`,
        details: {
          creativeSize: creative.size,
          inventorySlotSize: inventorySlot.size
        }
      });
    }
    
    // Check for overlapping date ranges manually
    const existingPlacements = await db
      .select()
      .from(adCreativePlacements)
      .where(and(
        eq(adCreativePlacements.creativeId, data.creativeId),
        eq(adCreativePlacements.inventorySlotId, data.inventorySlotId)
      ));
    
    // Check for actual date range overlap
    for (const existing of existingPlacements) {
      const newStart = new Date(data.startDate);
      const newEnd = data.endDate ? new Date(data.endDate) : null;
      const existingStart = new Date(existing.startDate);
      const existingEnd = existing.endDate ? new Date(existing.endDate) : null;
      
      // Two ranges overlap if: (start1 <= end2) AND (end1 >= start2)
      // Handle infinite ranges (no endDate)
      let overlaps = false;
      if (!newEnd || !existingEnd) {
        // If either range has no end date, they overlap if start dates conflict
        overlaps = true;
      } else {
        overlaps = (newStart <= existingEnd) && (newEnd >= existingStart);
      }
      
      if (overlaps) {
        return res.status(409).json({ 
          error: "يوجد تداخل في جدولة هذا البنر في نفس المكان" 
        });
      }
    }
    
    try {
      // إنشاء Placement
      const [placement] = await db
        .insert(adCreativePlacements)
        .values(data as typeof adCreativePlacements.$inferInsert)
        .returning();
      
      // تسجيل في audit log
      await db.insert(auditLogs).values({
        userId,
        entityType: "ad_creative_placement",
        entityId: placement.id,
        action: "create",
        changes: { after: placement },
        ipAddress: req.ip,
        userAgent: req.get("user-agent")
      });
      
      res.json(placement);
    } catch (error: any) {
      // Catch unique violation errors (PostgreSQL error code 23505)
      // Database-level EXCLUSION constraint prevents race conditions.
      // ملاحظة: Drizzle يلفّ خطأ PG، لذا نستخدم isUniqueViolation لفكّه.
      if (isUniqueViolation(error)) {
        return res.status(409).json({
          error: "يوجد تداخل في جدولة هذا البنر في نفس المكان"
        });
      }
      throw error; // Re-throw other errors
    }
  } catch (error) {
    console.error("[Ads API] خطأ في إنشاء placement:", error);
    res.status(500).json({ error: "حدث خطأ في إنشاء placement" });
  }
});

// PUT /api/ads/campaigns/:campaignId/placements/:placementId - Update placement
router.put("/campaigns/:campaignId/placements/:placementId", requireAdvertiser, requireAdmin, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const campaignId = req.params.campaignId;
    const placementId = req.params.placementId;
    
    // جلب Placement الحالي
    const [existingPlacement] = await db
      .select()
      .from(adCreativePlacements)
      .where(eq(adCreativePlacements.id, placementId))
      .limit(1);
    
    if (!existingPlacement) {
      return res.status(404).json({ error: "Placement غير موجود" });
    }
    
    // التحقق من الملكية (placement.campaignId === campaignId)
    if (existingPlacement.campaignId !== campaignId) {
      return res.status(403).json({ error: "Placement لا ينتمي لهذه الحملة" });
    }
    
    // التحقق من البيانات
    const validation = insertAdCreativePlacementSchema.safeParse({
      ...req.body,
      campaignId
    });
    
    if (!validation.success) {
      return res.status(400).json({ 
        error: "بيانات غير صحيحة", 
        details: validation.error.errors 
      });
    }
    
    const data = validation.data;
    
    // إذا تم تغيير Creative أو InventorySlot، التحقق من التطابق
    if (data.creativeId !== existingPlacement.creativeId || 
        data.inventorySlotId !== existingPlacement.inventorySlotId) {
      
      const [creative] = await db
        .select()
        .from(creatives)
        .where(eq(creatives.id, data.creativeId))
        .limit(1);
      
      if (!creative) {
        return res.status(404).json({ error: "البنر غير موجود" });
      }
      
      const [inventorySlot] = await db
        .select()
        .from(inventorySlots)
        .where(eq(inventorySlots.id, data.inventorySlotId))
        .limit(1);
      
      if (!inventorySlot) {
        return res.status(404).json({ error: "مكان العرض غير موجود" });
      }
      
      // Size compatibility check
      if (creative.size !== inventorySlot.size) {
        return res.status(400).json({ 
          error: `حجم البنر (${creative.size}) لا يتطابق مع حجم مكان العرض (${inventorySlot.size})`,
          details: {
            creativeSize: creative.size,
            inventorySlotSize: inventorySlot.size
          }
        });
      }
    }
    
    // Check for overlapping date ranges with OTHER placements (exclude current placement)
    const otherPlacements = await db
      .select()
      .from(adCreativePlacements)
      .where(and(
        eq(adCreativePlacements.creativeId, data.creativeId),
        eq(adCreativePlacements.inventorySlotId, data.inventorySlotId),
        sql`${adCreativePlacements.id} != ${placementId}` // Exclude current placement
      ));
    
    // Check for actual date range overlap with other placements
    for (const other of otherPlacements) {
      const newStart = new Date(data.startDate);
      const newEnd = data.endDate ? new Date(data.endDate) : null;
      const otherStart = new Date(other.startDate);
      const otherEnd = other.endDate ? new Date(other.endDate) : null;
      
      // Two ranges overlap if: (start1 <= end2) AND (end1 >= start2)
      // Handle infinite ranges (no endDate)
      let overlaps = false;
      if (!newEnd || !otherEnd) {
        // If either range has no end date, they overlap if start dates conflict
        overlaps = true;
      } else {
        overlaps = (newStart <= otherEnd) && (newEnd >= otherStart);
      }
      
      if (overlaps) {
        return res.status(409).json({ 
          error: "يوجد تداخل في جدولة هذا البنر في نفس المكان" 
        });
      }
    }
    
    try {
      // Use DELETE/INSERT pattern to avoid unique constraint conflicts
      // This approach ensures the unique index on (creativeId, inventorySlotId, startDate) works correctly
      await db.transaction(async (tx) => {
        // 1. Delete existing placement
        await tx
          .delete(adCreativePlacements)
          .where(eq(adCreativePlacements.id, placementId));
        
        // 2. Insert new placement with updated data (keep same ID for audit trail)
        await tx
          .insert(adCreativePlacements)
          .values({
            id: placementId, // Keep same ID
            ...data,
            updatedAt: new Date()
          } as typeof adCreativePlacements.$inferInsert);
      });
      
      // Get the updated placement
      const [updatedPlacement] = await db
        .select()
        .from(adCreativePlacements)
        .where(eq(adCreativePlacements.id, placementId))
        .limit(1);
      
      // تسجيل في audit log
      await db.insert(auditLogs).values({
        userId,
        entityType: "ad_creative_placement",
        entityId: placementId,
        action: "update",
        changes: {
          before: existingPlacement,
          after: updatedPlacement
        },
        ipAddress: req.ip,
        userAgent: req.get("user-agent")
      });
      
      res.json(updatedPlacement);
    } catch (error: any) {
      // Catch unique violation errors (PostgreSQL error code 23505)
      // Database-level EXCLUSION constraint prevents race conditions.
      // ملاحظة: Drizzle يلفّ خطأ PG، لذا نستخدم isUniqueViolation لفكّه.
      if (isUniqueViolation(error)) {
        return res.status(409).json({
          error: "يوجد تداخل في جدولة هذا البنر في نفس المكان"
        });
      }
      throw error; // Re-throw other errors
    }
  } catch (error) {
    console.error("[Ads API] خطأ في تحديث placement:", error);
    res.status(500).json({ error: "حدث خطأ في تحديث placement" });
  }
});

// DELETE /api/ads/campaigns/:campaignId/placements/:placementId - Delete placement
router.delete("/campaigns/:campaignId/placements/:placementId", requireAdvertiser, requireAdmin, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const campaignId = req.params.campaignId;
    const placementId = req.params.placementId;
    
    // جلب Placement
    const [placement] = await db
      .select()
      .from(adCreativePlacements)
      .where(eq(adCreativePlacements.id, placementId))
      .limit(1);
    
    if (!placement) {
      return res.status(404).json({ error: "Placement غير موجود" });
    }
    
    // التحقق من الملكية
    if (placement.campaignId !== campaignId) {
      return res.status(403).json({ error: "Placement لا ينتمي لهذه الحملة" });
    }
    
    // حذف Placement
    await db
      .delete(adCreativePlacements)
      .where(eq(adCreativePlacements.id, placementId));
    
    // تسجيل في audit log
    await db.insert(auditLogs).values({
      userId,
      entityType: "ad_creative_placement",
      entityId: placementId,
      action: "delete",
      changes: { before: placement },
      ipAddress: req.ip,
      userAgent: req.get("user-agent")
    });
    
    res.json({ message: "تم حذف placement بنجاح" });
  } catch (error) {
    console.error("[Ads API] خطأ في حذف placement:", error);
    res.status(500).json({ error: "حدث خطأ في حذف placement" });
  }
});

// GET /api/ads/creatives/:creativeId/placements - Find where creative is used
router.get("/creatives/:creativeId/placements", requireAdvertiser, async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const userRole = (req.user as any).role;
    const creativeId = req.params.creativeId;
    
    // التحقق من وجود Creative
    const [creative] = await db
      .select()
      .from(creatives)
      .where(eq(creatives.id, creativeId))
      .limit(1);
    
    if (!creative) {
      return res.status(404).json({ error: "البنر غير موجود" });
    }
    
    // التحقق من الصلاحية
    if (!["admin", "superadmin"].includes(userRole)) {
      // جلب AdGroup للـ Creative
      const [adGroup] = await db
        .select()
        .from(adGroups)
        .where(eq(adGroups.id, creative.adGroupId))
        .limit(1);
      
      if (!adGroup) {
        return res.status(404).json({ error: "المجموعة الإعلانية غير موجودة" });
      }
      
      // جلب Campaign
      const [campaign] = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, adGroup.campaignId))
        .limit(1);
      
      if (!campaign) {
        return res.status(404).json({ error: "الحملة غير موجودة" });
      }
      
      // التحقق من ملكية الحساب
      const [account] = await db
        .select()
        .from(adAccounts)
        .where(and(
          eq(adAccounts.userId, userId),
          eq(adAccounts.id, campaign.accountId)
        ))
        .limit(1);
      
      if (!account) {
        return res.status(403).json({ error: "ليس لديك صلاحية الوصول لهذا البنر" });
      }
    }
    
    // جلب جميع Placements لهذا Creative مع تفاصيل InventorySlots و Campaigns
    const placements = await db
      .select({
        id: adCreativePlacements.id,
        campaignId: adCreativePlacements.campaignId,
        adGroupId: adCreativePlacements.adGroupId,
        creativeId: adCreativePlacements.creativeId,
        inventorySlotId: adCreativePlacements.inventorySlotId,
        priority: adCreativePlacements.priority,
        startDate: adCreativePlacements.startDate,
        endDate: adCreativePlacements.endDate,
        status: adCreativePlacements.status,
        createdAt: adCreativePlacements.createdAt,
        updatedAt: adCreativePlacements.updatedAt,
        campaign: {
          id: campaigns.id,
          name: campaigns.name,
          status: campaigns.status,
        },
        inventorySlot: {
          id: inventorySlots.id,
          name: inventorySlots.name,
          location: inventorySlots.location,
          size: inventorySlots.size,
          pageType: inventorySlots.pageType,
          isActive: inventorySlots.isActive,
        }
      })
      .from(adCreativePlacements)
      .innerJoin(campaigns, eq(adCreativePlacements.campaignId, campaigns.id))
      .innerJoin(inventorySlots, eq(adCreativePlacements.inventorySlotId, inventorySlots.id))
      .where(eq(adCreativePlacements.creativeId, creativeId))
      .orderBy(desc(adCreativePlacements.createdAt));
    
    res.json(placements);
  } catch (error) {
    console.error("[Ads API] خطأ في جلب placements للبنر:", error);
    res.status(500).json({ error: "حدث خطأ في جلب البيانات" });
  }
});

// ============================================
// PUBLIC AD SERVING ENDPOINTS
// ============================================

// Get the set of slot locations that are worth requesting (PUBLIC - no auth)
// Lets clients skip both the ad fetch AND the reserved layout box for slots
// that have no chance of filling (no active inventory, no recent impressions).
// High-fill slots stay enabled so CLS stays at 0 there.
const ACTIVE_SLOTS_CACHE_KEY = "ads:active-slot-locations";
const ACTIVE_SLOTS_TTL_MS = CACHE_TTL.SHORT; // 2 دقيقة fresh + نافذة stale
const ACTIVE_SLOT_LOOKBACK_MS = 24 * 60 * 60 * 1000; // 24h fill-rate window

router.get("/slots/active", async (_req, res) => {
  res.set(
    "Cache-Control",
    "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
  );
  try {
    // سابقًا كان plain memoryCache بـ TTL 60s: عند انتهاء النافذة كانت كل
    // الطلبات المتزامنة تضرب الـ DB بـ query ثقيل (4-way join + distinct scan
    // على impressions لآخر 24h). معSWR: أول طلب يحسب، الباقي ينتظر أو يُخدم
    // من stale — حماية من thundering herd. نفس نمط /api/categories و
    // /api/breaking-ticker/active.
    const payload = await withSWR(
      ACTIVE_SLOTS_CACHE_KEY,
      ACTIVE_SLOTS_TTL_MS,
      ACTIVE_SLOTS_TTL_MS * 2,
      async () => {
        const now = new Date();
        const lookbackStart = new Date(now.getTime() - ACTIVE_SLOT_LOOKBACK_MS);

        // Slot locations with at least one currently-eligible placement.
        // Mirrors the eligibility filters used by GET /slot/:slotId so the
        // signal stays consistent with what that endpoint would actually serve.
        const eligiblePlacements = await db
          .selectDistinct({ location: inventorySlots.location })
          .from(adCreativePlacements)
          .innerJoin(creatives, eq(adCreativePlacements.creativeId, creatives.id))
          .innerJoin(campaigns, eq(adCreativePlacements.campaignId, campaigns.id))
          .innerJoin(
            inventorySlots,
            eq(adCreativePlacements.inventorySlotId, inventorySlots.id),
          )
          .where(
            and(
              eq(inventorySlots.isActive, true),
              eq(adCreativePlacements.status, "active"),
              eq(campaigns.status, "active"),
              eq(creatives.status, "active"),
              lte(adCreativePlacements.startDate, now),
              sql`(${adCreativePlacements.endDate} IS NULL OR ${adCreativePlacements.endDate} >= ${now})`,
              sql`${campaigns.spentBudget} < ${campaigns.totalBudget}`,
              sql`${campaigns.spentToday} < ${campaigns.dailyBudget}`,
            ),
          );

        // Slot locations that actually filled at least once in the last 24h.
        // Catches slots whose placement is momentarily paused but historically
        // serves; keeps them eligible so we don't oscillate.
        const recentlyFilled = await db
          .selectDistinct({ location: inventorySlots.location })
          .from(impressions)
          .innerJoin(inventorySlots, eq(impressions.slotId, inventorySlots.id))
          .where(gte(impressions.timestamp, lookbackStart));

        const slotSet = new Set<string>();
        for (const row of eligiblePlacements) {
          if (row.location) slotSet.add(row.location);
        }
        for (const row of recentlyFilled) {
          if (row.location) slotSet.add(row.location);
        }

        return {
          slotIds: Array.from(slotSet).sort(),
          generatedAt: now.toISOString(),
        };
      },
    );
    res.json(payload);
  } catch (error) {
    console.error("[Ads API] خطأ في جلب قائمة الأماكن النشطة:", error);
    // Fail open: return null so clients fall back to current behavior
    // (reserved box + per-slot request) instead of hiding every slot.
    res.status(200).json({ slotIds: null, generatedAt: new Date().toISOString() });
  }
});

// Get active ad for a specific inventory slot (PUBLIC - no auth required)
// Short CDN cache to reduce origin hits while keeping impression tracking accurate
router.get("/slot/:slotId", async (req, res) => {
  // Add CDN cache headers - short TTL since ads change frequently
  res.set('Cache-Control', 'public, max-age=0, s-maxage=10, stale-while-revalidate=30');
  try {
    const slotId = req.params.slotId;
    const deviceType = (req.query.deviceType as string) || "desktop"; // desktop, mobile, tablet
    const now = new Date();
    
    // Auto-reset daily impressions for campaigns where lastResetDate is not today
    // This ensures daily limits work even when background jobs are disabled (Autoscale)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    try {
      const resetResult = await db
        .update(campaigns)
        .set({
          spentToday: 0,
          lastResetDate: now,
          updatedAt: now,
        })
        .where(and(
          sql`${campaigns.lastResetDate} < ${todayStart}`,
          sql`${campaigns.spentToday} > 0`
        ));
      
      if (resetResult.rowCount && resetResult.rowCount > 0) {
        console.log(`[Ads] Auto-reset daily impressions for ${resetResult.rowCount} campaigns`);
      }
    } catch (resetError) {
      console.error("[Ads] Error auto-resetting daily impressions:", resetError);
      // Continue even if reset fails - this is a best-effort optimization
    }
    
    // Find ALL active placements for this slot (not just highest priority)
    // Filter by device type AND budget constraints
    const activePlacements = await db
      .select({
        placement: adCreativePlacements,
        creative: creatives,
        campaign: campaigns,
        slot: inventorySlots,
      })
      .from(adCreativePlacements)
      .innerJoin(creatives, eq(adCreativePlacements.creativeId, creatives.id))
      .innerJoin(campaigns, eq(adCreativePlacements.campaignId, campaigns.id))
      .innerJoin(inventorySlots, eq(adCreativePlacements.inventorySlotId, inventorySlots.id))
      .where(and(
        eq(inventorySlots.location, slotId),
        eq(inventorySlots.isActive, true),
        eq(adCreativePlacements.status, "active"),
        eq(campaigns.status, "active"),
        eq(creatives.status, "active"),
        lte(adCreativePlacements.startDate, now),
        sql`(${adCreativePlacements.endDate} IS NULL OR ${adCreativePlacements.endDate} >= ${now})`,
        // Device type filtering: show if slot is "all" OR matches the requested device type
        sql`(${inventorySlots.deviceType} = 'all' OR ${inventorySlots.deviceType} = ${deviceType})`,
        // Budget constraints: check total impressions and daily impressions
        sql`${campaigns.spentBudget} < ${campaigns.totalBudget}`, // Total impressions not exceeded
        sql`${campaigns.spentToday} < ${campaigns.dailyBudget}` // Daily impressions not exceeded
      ))
      .orderBy(desc(adCreativePlacements.priority));
    
    if (activePlacements.length === 0) {
      return res.status(204).send(); // No ad available
    }
    
    // Weighted selection: Higher priority = more impressions
    let selectedPlacement;
    const totalWeight = activePlacements.reduce((sum, p) => sum + p.placement.priority, 0);
    
    if (totalWeight <= 0) {
      // Fallback to random selection if all priorities are 0
      const randomIndex = Math.floor(Math.random() * activePlacements.length);
      selectedPlacement = activePlacements[randomIndex];
    } else {
      // Weighted random selection based on priority
      let random = Math.random() * totalWeight;
      selectedPlacement = activePlacements[0];
      
      for (const placement of activePlacements) {
        random -= placement.placement.priority;
        if (random <= 0) {
          selectedPlacement = placement;
          break;
        }
      }
    }
    
    const { placement, creative, campaign, slot } = selectedPlacement;
    
    // Create impression record
    const userAgentHeader = req.headers["user-agent"] || null;
    const detectedDevice = detectDeviceType(userAgentHeader);
    
    const [impression] = await db
      .insert(impressions)
      .values({
        creativeId: creative.id,
        campaignId: campaign.id,
        slotId: slot.id,
        userAgent: userAgentHeader,
        ipAddress: req.ip || null,
        pageUrl: req.headers.referer || null,
        referrer: req.headers.referer || null,
        device: detectedDevice,
        country: "SA",
      })
      .returning();
    
    // Return single ad
    res.json({
      creative: {
        id: creative.id,
        name: creative.name,
        type: creative.type,
        content: creative.content,
        size: creative.size,
        destinationUrl: creative.destinationUrl,
      },
      campaign: {
        id: campaign.id,
        name: campaign.name,
      },
      impressionId: impression.id,
    });
  } catch (error) {
    console.error("[Ads API] خطأ في جلب إعلان:", error);
    res.status(500).json({ error: "حدث خطأ في جلب الإعلان" });
  }
});

// Track impression view (PUBLIC)
router.post("/track/impression/:impressionId", async (req, res) => {
  try {
    const impressionId = req.params.impressionId;
    
    // Verify impression exists
    const [impression] = await db
      .select()
      .from(impressions)
      .where(eq(impressions.id, impressionId))
      .limit(1);
    
    if (!impression) {
      return res.status(404).json({ error: "Impression not found" });
    }
    
    // Update campaign impression counters
    await db
      .update(campaigns)
      .set({
        spentBudget: sql`${campaigns.spentBudget} + 1`,
        spentToday: sql`${campaigns.spentToday} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(campaigns.id, impression.campaignId));
    
    // Check if campaign has exceeded budget and auto-pause
    const [campaign] = await db
      .select({
        id: campaigns.id,
        spentBudget: campaigns.spentBudget,
        totalBudget: campaigns.totalBudget,
        spentToday: campaigns.spentToday,
        dailyBudget: campaigns.dailyBudget,
      })
      .from(campaigns)
      .where(eq(campaigns.id, impression.campaignId))
      .limit(1);
    
    if (campaign) {
      // Auto-pause if total budget exceeded
      if (campaign.spentBudget >= campaign.totalBudget) {
        await db
          .update(campaigns)
          .set({ 
            status: "paused",
            updatedAt: new Date(),
          })
          .where(eq(campaigns.id, campaign.id));
        
        console.log(`[Ads] Campaign ${campaign.id} auto-paused: total impressions budget exhausted (${campaign.spentBudget}/${campaign.totalBudget})`);
      }
      // Auto-pause if daily budget exceeded
      else if (campaign.spentToday >= campaign.dailyBudget) {
        console.log(`[Ads] Campaign ${campaign.id} reached daily limit (${campaign.spentToday}/${campaign.dailyBudget}). Will resume after daily reset.`);
      }
    }
    
    // Update daily stats
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Check if daily stats exist for this campaign and date
    const existingStats = await db
      .select({ id: dailyStats.id })
      .from(dailyStats)
      .where(and(
        eq(dailyStats.campaignId, impression.campaignId),
        gte(dailyStats.date, today),
        lte(dailyStats.date, tomorrow)
      ))
      .limit(1);
    
    if (existingStats.length > 0) {
      // Update existing stats
      await db
        .update(dailyStats)
        .set({
          impressions: sql`${dailyStats.impressions} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(dailyStats.id, existingStats[0].id));
    } else {
      // Insert new stats
      await db.insert(dailyStats).values({
        campaignId: impression.campaignId,
        date: today,
        impressions: 1,
        clicks: 0,
        conversions: 0,
        spent: 0,
      });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error("[Ads API] خطأ في تتبع المشاهدة:", error);
    res.status(500).json({ error: "حدث خطأ" });
  }
});

// Get ads for Lite Feed (PUBLIC - no auth required)
// Returns multiple ads for rotation in the swipe feed
router.get("/lite-feed", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 20);
    const now = new Date();
    
    // Find ALL active placements for lite-feed slot
    const activePlacements = await db
      .select({
        placement: adCreativePlacements,
        creative: creatives,
        campaign: campaigns,
        slot: inventorySlots,
      })
      .from(adCreativePlacements)
      .innerJoin(creatives, eq(adCreativePlacements.creativeId, creatives.id))
      .innerJoin(campaigns, eq(adCreativePlacements.campaignId, campaigns.id))
      .innerJoin(inventorySlots, eq(adCreativePlacements.inventorySlotId, inventorySlots.id))
      .where(and(
        eq(inventorySlots.location, "lite-feed"),
        eq(inventorySlots.isActive, true),
        eq(adCreativePlacements.status, "active"),
        eq(campaigns.status, "active"),
        eq(creatives.status, "active"),
        lte(adCreativePlacements.startDate, now),
        sql`(${adCreativePlacements.endDate} IS NULL OR ${adCreativePlacements.endDate} >= ${now})`,
        sql`${campaigns.spentBudget} < ${campaigns.totalBudget}`,
        sql`${campaigns.spentToday} < ${campaigns.dailyBudget}`
      ))
      .orderBy(desc(adCreativePlacements.priority))
      .limit(limit);
    
    if (activePlacements.length === 0) {
      return res.json({ ads: [], fallback: true });
    }
    
    // Create impression records and format ads
    const ads = await Promise.all(
      activePlacements.map(async ({ placement, creative, campaign, slot }) => {
        // Create impression record
        const [impression] = await db
          .insert(impressions)
          .values({
            creativeId: creative.id,
            campaignId: campaign.id,
            slotId: slot.id,
            userAgent: req.headers["user-agent"] || null,
            ipAddress: req.ip || null,
            pageUrl: "/lite",
            referrer: req.headers.referer || null,
          })
          .returning();
        
        return {
          id: `ad-${creative.id}`,
          imageUrl: creative.content || "",
          title: creative.title || creative.name,
          description: creative.description || "",
          ctaText: creative.callToAction || "اعرف المزيد",
          linkUrl: creative.destinationUrl || "#",
          advertiser: campaign.name,
          impressionId: impression.id,
        };
      })
    );
    
    res.json({ ads, fallback: false });
  } catch (error) {
    console.error("[Ads API] خطأ في جلب إعلانات Lite Feed:", error);
    res.json({ ads: [], fallback: true, error: "حدث خطأ في جلب الإعلانات" });
  }
});

// Track ad click (PUBLIC)
router.post("/track/click/:impressionId", async (req, res) => {
  try {
    const impressionId = req.params.impressionId;
    
    // Verify impression exists
    const [impression] = await db
      .select()
      .from(impressions)
      .where(eq(impressions.id, impressionId))
      .limit(1);
    
    if (!impression) {
      return res.status(404).json({ error: "Impression not found" });
    }
    
    // Create click record
    await db.insert(clicks).values({
      impressionId,
      creativeId: impression.creativeId,
      campaignId: impression.campaignId,
      slotId: impression.slotId,
      device: impression.device,
      country: impression.country,
      pageUrl: impression.pageUrl,
      referrer: impression.referrer,
      userAgent: impression.userAgent,
      ipAddress: impression.ipAddress
    });
    
    // Update daily stats
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Check if daily stats exist for this campaign and date
    const existingStats = await db
      .select({ id: dailyStats.id })
      .from(dailyStats)
      .where(and(
        eq(dailyStats.campaignId, impression.campaignId),
        gte(dailyStats.date, today),
        lte(dailyStats.date, tomorrow)
      ))
      .limit(1);
    
    if (existingStats.length > 0) {
      // Update existing stats
      await db
        .update(dailyStats)
        .set({
          clicks: sql`${dailyStats.clicks} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(dailyStats.id, existingStats[0].id));
    } else {
      // Insert new stats
      await db.insert(dailyStats).values({
        campaignId: impression.campaignId,
        date: today,
        impressions: 0,
        clicks: 1,
        conversions: 0,
        spent: 0,
      });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error("[Ads API] خطأ في تتبع النقرة:", error);
    res.status(500).json({ error: "حدث خطأ" });
  }
});

// ============================================
// ANALYTICS ENDPOINTS - إحصائيات الإعلانات
// ============================================

import { adsAnalyticsService } from "./services/adsAnalytics";

// نظرة عامة على الإحصائيات
router.get("/analytics/overview", requireAdvertiser, requireCampaignScope, async (req, res) => {
  try {
    const { campaignId, dateFrom, dateTo } = req.query;
    
    console.log("[Analytics Overview] Request params:", { campaignId, dateFrom, dateTo });
    
    const fromDate = dateFrom ? new Date(dateFrom as string) : undefined;
    const toDate = dateTo ? new Date(dateTo as string) : undefined;
    
    const stats = await adsAnalyticsService.getOverviewStats(
      campaignId as string | undefined,
      fromDate,
      toDate
    );
    
    console.log("[Analytics Overview] Result:", stats);
    
    res.json(stats);
  } catch (error) {
    console.error("[Analytics] خطأ في جلب الإحصائيات العامة:", error);
    res.status(500).json({ error: "حدث خطأ في جلب الإحصائيات" });
  }
});

// نظرة عامة مع المقارنة بالفترة السابقة - DIRECT QUERY FIX
router.get("/analytics/overview-comparison", requireAdvertiser, requireCampaignScope, async (req, res) => {
  try {
    const { campaignId, dateFrom, dateTo } = req.query;
    console.log("[OVERVIEW-COMPARISON V3] 🚀 Direct query fix - Request:", { campaignId, dateFrom, dateTo });
    
    const fromDate = dateFrom ? new Date(dateFrom as string) : undefined;
    const toDate = dateTo ? new Date(dateTo as string) : undefined;
    
    // Direct query for impressions
    let impQuery = db.select({ count: sql<number>`COUNT(*)::int` }).from(impressions);
    const impConditions = [];
    if (campaignId) impConditions.push(eq(impressions.campaignId, campaignId as string));
    if (fromDate) impConditions.push(gte(impressions.timestamp, fromDate));
    if (toDate) impConditions.push(lte(impressions.timestamp, toDate));
    const impResult = impConditions.length > 0 
      ? await impQuery.where(and(...impConditions))
      : await impQuery;
    
    // Direct query for clicks
    let clickQuery = db.select({ count: sql<number>`COUNT(*)::int` }).from(clicks);
    const clickConditions = [];
    if (campaignId) clickConditions.push(eq(clicks.campaignId, campaignId as string));
    if (fromDate) clickConditions.push(gte(clicks.timestamp, fromDate));
    if (toDate) clickConditions.push(lte(clicks.timestamp, toDate));
    const clickResult = clickConditions.length > 0
      ? await clickQuery.where(and(...clickConditions))
      : await clickQuery;
    
    // Direct query for conversions
    let convQuery = db.select({ count: sql<number>`COUNT(*)::int` }).from(conversions);
    const convConditions = [];
    if (campaignId) convConditions.push(eq(conversions.campaignId, campaignId as string));
    if (fromDate) convConditions.push(gte(conversions.timestamp, fromDate));
    if (toDate) convConditions.push(lte(conversions.timestamp, toDate));
    const convResult = convConditions.length > 0
      ? await convQuery.where(and(...convConditions))
      : await convQuery;
    
    const totalImpressions = Number(impResult[0]?.count) || 0;
    const totalClicks = Number(clickResult[0]?.count) || 0;
    const totalConversions = Number(convResult[0]?.count) || 0;
    
    console.log("[OVERVIEW-COMPARISON V3] 📊 Results:", { totalImpressions, totalClicks, totalConversions });
    
    const ctr = totalImpressions > 0 ? parseFloat(((totalClicks / totalImpressions) * 100).toFixed(2)) : 0;
    const cpc = 0;
    const cpm = 0;
    const spent = 0;
    const revenue = 0;
    
    // For previous period comparison (simplified)
    const previousPeriod = {
      impressions: 0,
      clicks: 0,
      conversions: 0,
      ctr: 0,
      cpc: 0,
      cpm: 0,
      spent: 0,
      revenue: 0,
    };
    
    const deltas = {
      impressions: 0,
      clicks: 0,
      conversions: 0,
      ctr: 0,
      cpc: 0,
      cpm: 0,
      spent: 0,
      revenue: 0,
    };
    
    res.json({
      impressions: totalImpressions,
      clicks: totalClicks,
      conversions: totalConversions,
      ctr,
      cpc,
      cpm,
      spent,
      revenue,
      previousPeriod,
      deltas,
    });
  } catch (error) {
    console.error("[Analytics] خطأ في جلب الإحصائيات مع المقارنة:", error);
    res.status(500).json({ error: "حدث خطأ في جلب الإحصائيات" });
  }
});

// بيانات السلسلة الزمنية
router.get("/analytics/timeseries", requireAdvertiser, requireCampaignScope, async (req, res) => {
  try {
    const { period = 'daily', campaignId, dateFrom, dateTo } = req.query;
    
    const fromDate = dateFrom ? new Date(dateFrom as string) : undefined;
    const toDate = dateTo ? new Date(dateTo as string) : undefined;
    
    const data = await adsAnalyticsService.getTimeSeriesData(
      period as 'daily' | 'weekly' | 'monthly',
      campaignId as string | undefined,
      fromDate,
      toDate
    );
    
    res.json(data);
  } catch (error) {
    console.error("[Analytics] خطأ في جلب البيانات الزمنية:", error);
    res.status(500).json({ error: "حدث خطأ في جلب البيانات" });
  }
});

// بيانات قمع التسويق
router.get("/analytics/funnel", requireAdvertiser, requireCampaignScope, async (req, res) => {
  try {
    const { campaignId, dateFrom, dateTo } = req.query;
    
    const fromDate = dateFrom ? new Date(dateFrom as string) : undefined;
    const toDate = dateTo ? new Date(dateTo as string) : undefined;
    
    const funnel = await adsAnalyticsService.getFunnelData(
      campaignId as string | undefined,
      fromDate,
      toDate
    );
    
    res.json(funnel);
  } catch (error) {
    console.error("[Analytics] خطأ في جلب بيانات قمع التسويق:", error);
    res.status(500).json({ error: "حدث خطأ في جلب البيانات" });
  }
});

// تحليل الجمهور
router.get("/analytics/audience", requireAdvertiser, requireCampaignScope, async (req, res) => {
  try {
    const { campaignId, dateFrom, dateTo } = req.query;
    
    const fromDate = dateFrom ? new Date(dateFrom as string) : undefined;
    const toDate = dateTo ? new Date(dateTo as string) : undefined;
    
    const audience = await adsAnalyticsService.getAudienceAnalytics(
      campaignId as string | undefined,
      fromDate,
      toDate
    );
    
    res.json(audience);
  } catch (error) {
    console.error("[Analytics] خطأ في تحليل الجمهور:", error);
    res.status(500).json({ error: "حدث خطأ في تحليل الجمهور" });
  }
});

// مقارنة الحملات
router.get("/analytics/campaigns/compare", requireAdvertiser, requireCampaignScope, async (req, res) => {
  try {
    const { campaignIds, dateFrom, dateTo } = req.query;
    
    const ids = campaignIds ? (campaignIds as string).split(',') : [];
    const fromDate = dateFrom ? new Date(dateFrom as string) : undefined;
    const toDate = dateTo ? new Date(dateTo as string) : undefined;
    
    const comparison = await adsAnalyticsService.getCampaignComparison(
      ids,
      fromDate,
      toDate
    );
    
    res.json(comparison);
  } catch (error) {
    console.error("[Analytics] خطأ في مقارنة الحملات:", error);
    res.status(500).json({ error: "حدث خطأ في المقارنة" });
  }
});

// مؤشرات الجودة
router.get("/analytics/quality/:campaignId", requireAdvertiser, requireCampaignScope, async (req, res) => {
  try {
    const { campaignId } = req.params;
    
    const quality = await adsAnalyticsService.getQualityMetrics(campaignId);
    
    res.json(quality);
  } catch (error) {
    console.error("[Analytics] خطأ في جلب مؤشرات الجودة:", error);
    res.status(500).json({ error: "حدث خطأ في جلب مؤشرات الجودة" });
  }
});

// قائمة الحملات مع الإحصائيات
router.get("/analytics/campaigns", requireAdvertiser, async (req, res) => {
  try {
    const { dateFrom, dateTo, status } = req.query;

    const fromDate = dateFrom ? new Date(dateFrom as string) : undefined;
    const toDate = dateTo ? new Date(dateTo as string) : undefined;

    // Scope to the caller's own account — this used to return every
    // advertiser's campaigns with their spend and performance figures.
    const scope = await resolveAdsScope(req);
    if (!scope) {
      return res.status(403).json({ error: "لا يوجد حساب معلن مرتبط بهذا المستخدم" });
    }

    const filters = [
      status ? eq(campaigns.status, status as string) : undefined,
      scope.accountId ? eq(campaigns.accountId, scope.accountId) : undefined,
    ].filter(Boolean) as any[];

    let campaignsQuery = db.select().from(campaigns);
    if (filters.length > 0) {
      campaignsQuery = campaignsQuery.where(and(...filters)) as any;
    }

    const allCampaigns = await campaignsQuery.orderBy(desc(campaigns.createdAt));
    
    // Get stats for each campaign
    const campaignStats = await Promise.all(
      allCampaigns.map(async (campaign) => {
        const stats = await adsAnalyticsService.getOverviewStats(
          campaign.id,
          fromDate,
          toDate
        );
        return {
          ...campaign,
          stats
        };
      })
    );
    
    res.json(campaignStats);
  } catch (error) {
    console.error("[Analytics] خطأ في جلب الحملات:", error);
    res.status(500).json({ error: "حدث خطأ في جلب الحملات" });
  }
});

// ============================================
// LIVE DATA - البيانات اللحظية
// ============================================

// Polling endpoint for live data (more reliable with auth)
router.get("/analytics/live-poll", requireAdvertiser, requireCampaignScope, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const stats = await db
      .select({
        impressions: sql<number>`COALESCE(COUNT(DISTINCT ${impressions.id}), 0)::int`,
        clicks: sql<number>`COALESCE(COUNT(DISTINCT ${clicks.id}), 0)::int`,
      })
      .from(impressions)
      .leftJoin(clicks, eq(clicks.impressionId, impressions.id))
      .where(gte(impressions.timestamp, today));
    
    res.json({
      impressions: stats[0]?.impressions || 0,
      clicks: stats[0]?.clicks || 0,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Live Poll] Error:', error);
    res.status(500).json({ error: "حدث خطأ في جلب البيانات اللحظية" });
  }
});

// Legacy SSE endpoint removed. Clients should use
// /api/ads/analytics/live-poll (already used by the dashboard) instead to
// avoid long-lived connections pinning Autoscale instances.
router.get("/analytics/live", requireAdvertiser, requireCampaignScope, async (_req, res) => {
  res.status(410).json({
    error: 'SSE stream disabled. Poll /api/ads/analytics/live-poll instead.',
  });
});

// تصدير التقارير (CSV)
router.get("/analytics/export/csv", requireAdvertiser, requireCampaignScope, async (req, res) => {
  try {
    const { campaignId, dateFrom, dateTo, type = 'overview' } = req.query;
    
    const fromDate = dateFrom ? new Date(dateFrom as string) : undefined;
    const toDate = dateTo ? new Date(dateTo as string) : undefined;
    
    let data: any;
    let filename: string;
    
    switch (type) {
      case 'timeseries':
        data = await adsAnalyticsService.getTimeSeriesData('daily', campaignId as string, fromDate, toDate);
        filename = 'ad-analytics-timeseries.csv';
        break;
      case 'audience':
        data = await adsAnalyticsService.getAudienceAnalytics(campaignId as string, fromDate, toDate);
        filename = 'ad-analytics-audience.csv';
        break;
      default:
        data = await adsAnalyticsService.getOverviewStats(campaignId as string, fromDate, toDate);
        filename = 'ad-analytics-overview.csv';
    }
    
    // Convert to CSV
    let csv = '';
    if (Array.isArray(data)) {
      if (data.length > 0) {
        csv = Object.keys(data[0]).join(',') + '\n';
        csv += data.map(row => Object.values(row).join(',')).join('\n');
      }
    } else {
      csv = Object.keys(data).join(',') + '\n';
      csv += Object.values(data).join(',');
    }
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('\uFEFF' + csv); // Add BOM for Arabic support
  } catch (error) {
    console.error("[Analytics] خطأ في تصدير التقرير:", error);
    res.status(500).json({ error: "حدث خطأ في التصدير" });
  }
});

export default router;
