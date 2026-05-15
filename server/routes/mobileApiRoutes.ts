/**
 * Mobile App API Routes
 * 
 * Complete API endpoints for mobile apps including:
 * - Menu/Categories
 * - Article views tracking
 * - Push notifications
 * - Member authentication (login, register, activation, password reset)
 * - Member interests
 * - Member profile
 */

import { Router, Request, Response } from "express";
import { db, pool } from "../db";
import {
  categories,
  articles,
  pushDevices,
  pushCampaigns,
  pushCampaignEvents,
  users,
  userInterests,
  emailVerificationTokens,
  passwordResetTokens,
  appMemberSessions,
  tags,
  articleTags,
  gulfEvents,
  comments,
  insertCommentSchema,
  roles,
  userRoles,
} from "@shared/schema";
import { eq, sql, and, gt, gte, desc, or, ne, ilike, aliasedTable } from "drizzle-orm";

// Aliased users join target so we can pull both authorId (the staff member who
// entered the article) AND reporterId (the actual byline) in the same query.
// The byline shown to readers must always be the reporter when one is set.
const reporterUsers = aliasedTable(users, "reporter_user");
import { articleCardSelect } from "../selectHelpers";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { sendEmailNotification } from "../services/email";

const router = Router();

// ==========================================
// Helper: Send Mobile Activation Email
// ==========================================
async function sendMobileActivationEmail(email: string, code: string, firstName?: string): Promise<boolean> {
  try {
    const name = firstName || 'عزيزي العضو';
    
    const htmlContent = `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: 'Tajawal', Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 0; direction: rtl; }
          .container { max-width: 600px; margin: 40px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #1a73e8 0%, #0d47a1 100%); padding: 30px; text-align: center; }
          .header img { max-width: 180px; }
          .header h1 { color: white; margin: 15px 0 0 0; font-size: 24px; }
          .content { padding: 40px 30px; text-align: center; }
          .greeting { font-size: 20px; color: #333; margin-bottom: 20px; }
          .message { font-size: 16px; color: #666; line-height: 1.8; margin-bottom: 30px; }
          .code-box { background: #f8f9fa; border: 2px dashed #1a73e8; border-radius: 12px; padding: 20px; margin: 20px 0; }
          .code { font-size: 36px; font-weight: bold; color: #1a73e8; letter-spacing: 8px; font-family: monospace; }
          .note { font-size: 14px; color: #999; margin-top: 20px; }
          .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #999; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>صحيفة سبق الإلكترونية</h1>
          </div>
          <div class="content">
            <p class="greeting">مرحباً ${name}! 👋</p>
            <p class="message">
              شكراً لتسجيلك في تطبيق سبق.<br>
              لتفعيل حسابك، يرجى إدخال رمز التفعيل التالي:
            </p>
            <div class="code-box">
              <div class="code">${code}</div>
            </div>
            <p class="note">
              هذا الرمز صالح لمدة 24 ساعة فقط.<br>
              إذا لم تقم بطلب هذا الرمز، يرجى تجاهل هذه الرسالة.
            </p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} صحيفة سبق الإلكترونية - جميع الحقوق محفوظة</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const textContent = `
مرحباً ${name}!

شكراً لتسجيلك في تطبيق سبق.
لتفعيل حسابك، يرجى إدخال رمز التفعيل التالي:

${code}

هذا الرمز صالح لمدة 24 ساعة فقط.

صحيفة سبق الإلكترونية
    `;

    const result = await sendEmailNotification({
      to: email,
      subject: `رمز تفعيل حسابك في سبق: ${code}`,
      html: htmlContent,
      text: textContent,
    });

    console.log(`[Mobile API] Activation email sent to ${email}: ${result.success}`);
    return result.success;
  } catch (error) {
    console.error('[Mobile API] Failed to send activation email:', error);
    return false;
  }
}

// ==========================================
// Helper: Send Password Reset Email
// ==========================================
async function sendPasswordResetEmail(email: string, code: string): Promise<boolean> {
  try {
    const htmlContent = `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: 'Tajawal', Arial, sans-serif; background-color: #f5f5f5; margin: 0; padding: 0; direction: rtl; }
          .container { max-width: 600px; margin: 40px auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #e53935 0%, #c62828 100%); padding: 30px; text-align: center; }
          .header h1 { color: white; margin: 0; font-size: 24px; }
          .content { padding: 40px 30px; text-align: center; }
          .greeting { font-size: 20px; color: #333; margin-bottom: 20px; }
          .message { font-size: 16px; color: #666; line-height: 1.8; margin-bottom: 30px; }
          .code-box { background: #fff3f3; border: 2px dashed #e53935; border-radius: 12px; padding: 20px; margin: 20px 0; }
          .code { font-size: 36px; font-weight: bold; color: #e53935; letter-spacing: 8px; font-family: monospace; }
          .warning { font-size: 14px; color: #e53935; margin-top: 20px; font-weight: bold; }
          .note { font-size: 14px; color: #999; margin-top: 10px; }
          .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #999; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>استعادة كلمة المرور</h1>
          </div>
          <div class="content">
            <p class="greeting">مرحباً! 🔐</p>
            <p class="message">
              تلقينا طلباً لاستعادة كلمة المرور الخاصة بحسابك.<br>
              استخدم الرمز التالي لإعادة تعيين كلمة المرور:
            </p>
            <div class="code-box">
              <div class="code">${code}</div>
            </div>
            <p class="warning">
              هذا الرمز صالح لمدة 30 دقيقة فقط.
            </p>
            <p class="note">
              إذا لم تطلب استعادة كلمة المرور، يرجى تجاهل هذه الرسالة.<br>
              حسابك آمن ولم يتم إجراء أي تغييرات.
            </p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} صحيفة سبق الإلكترونية - جميع الحقوق محفوظة</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const textContent = `
مرحباً!

تلقينا طلباً لاستعادة كلمة المرور الخاصة بحسابك.
استخدم الرمز التالي لإعادة تعيين كلمة المرور:

${code}

هذا الرمز صالح لمدة 30 دقيقة فقط.

إذا لم تطلب استعادة كلمة المرور، يرجى تجاهل هذه الرسالة.

صحيفة سبق الإلكترونية
    `;

    const result = await sendEmailNotification({
      to: email,
      subject: `رمز استعادة كلمة المرور: ${code}`,
      html: htmlContent,
      text: textContent,
    });

    console.log(`[Mobile API] Password reset email sent to ${email}: ${result.success}`);
    return result.success;
  } catch (error) {
    console.error('[Mobile API] Failed to send password reset email:', error);
    return false;
  }
}

// ==========================================
// 1. Menu Groups (الأقسام)
// GET /api/v1/menu-groups
// ==========================================
router.get("/menu-groups", async (req: Request, res: Response) => {
  try {
    // Get all visible categories ordered by display order
    const allCategories = await db
      .select({
        id: categories.id,
        name: categories.nameAr,
        slug: categories.slug,
        color: categories.color,
        order: categories.displayOrder,
      })
      .from(categories)
      .where(eq(categories.status, "visible"))
      .orderBy(categories.displayOrder);

    // Format items with kebab-case fields matching legacy app structure
    const items = allCategories.map((cat, index) => {
      const baseId = 22545 + index;
      const collectionId = 89382 + index;
      const itemId = 32078 + index;
      
      return {
        "tag-name": null,
        "entity-properties": null,
        "collection-id": collectionId,
        "entity-slug": null,
        "item-id": itemId,
        "rank": baseId,
        "title": cat.name,
        "item-type": "section",
        "section-slug": cat.slug,
        "tag-slug": null,
        "id": baseId,
        "parent-id": null,
        "url": `https://sabq.org/${cat.slug}`,
        "entity-name": null,
        "collection-slug": cat.slug,
        "section-name": cat.name,
        "data": {
          "color": cat.color || "#FFFFFF"
        }
      };
    });

    // Response structure matching legacy app exactly
    const response = {
      "menu-groups": {
        "default": {
          "id": 2492,
          "slug": "default",
          "name": "default",
          "items": items
        }
      }
    };

    const body = JSON.stringify(response);
    res
      .status(200)
      .set({
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body).toString(),
        'Cache-Control': 'public, max-age=300, s-maxage=600, stale-while-revalidate=300',
      })
      .end(body);
  } catch (error) {
    console.error("[Mobile API] menu-groups error:", error);
    res.status(500).json({ error: "حدث خطأ في الخادم" });
  }
});

// ==========================================
// 2. Track Article View (تسجيل المشاهدة)
// POST /api/v1/articles/:id/view
// ==========================================
router.post("/articles/:id/view", async (req: Request, res: Response) => {
  try {
    const articleId = req.params.id;
    const { deviceId, platform = "ios", appVersion } = req.body;
    
    if (!articleId) {
      return res.status(400).json({ 
        success: false,
        message: "معرف المقال مطلوب" 
      });
    }

    // Check if article exists
    const [article] = await db
      .select({ id: articles.id })
      .from(articles)
      .where(eq(articles.id, articleId))
      .limit(1);

    if (!article) {
      return res.status(404).json({ 
        success: false,
        message: "المقال غير موجود" 
      });
    }

    // Increment views counter (same as web: 5-10 random boost)
    const boostOptions = [5, 6, 7, 8, 9, 10];
    const randomBoost = boostOptions[Math.floor(Math.random() * boostOptions.length)];
    await db.update(articles)
      .set({ views: sql`${articles.views} + ${randomBoost}` })
      .where(eq(articles.id, articleId));

    // Log for analytics (console only for anonymous users)
    console.log(`[Mobile API] View tracked: article=${articleId}, platform=${platform}, device=${deviceId || 'unknown'}, version=${appVersion || 'unknown'}`);

    res.json({ 
      success: true,
      message: "تم تسجيل المشاهدة"
    });
  } catch (error) {
    console.error("[Mobile API] article view error:", error);
    res.status(500).json({ 
      success: false,
      message: "فشل تسجيل المشاهدة" 
    });
  }
});

// ==========================================
// 3. Batch Track Views (تسجيل مشاهدات متعددة)
// POST /api/v1/articles/batch-view
// For offline sync
// ==========================================
router.post("/articles/batch-view", async (req: Request, res: Response) => {
  try {
    const { views, deviceId, platform = "ios", appVersion } = req.body;
    
    if (!views || !Array.isArray(views) || views.length === 0) {
      return res.status(400).json({ 
        success: false,
        message: "قائمة المشاهدات مطلوبة" 
      });
    }

    // Limit batch size
    const maxBatch = 50;
    const viewsToProcess = views.slice(0, maxBatch);
    
    const aggregatedViews = new Map<string, number>();
    const boostOptions = [5, 6, 7, 8, 9, 10];
    let invalidCount = 0;
    
    for (const view of viewsToProcess) {
      const articleId = view.articleId || view.article_id;
      if (articleId) {
        const boost = boostOptions[Math.floor(Math.random() * boostOptions.length)];
        aggregatedViews.set(articleId, (aggregatedViews.get(articleId) || 0) + boost);
      } else {
        invalidCount++;
      }
    }

    let successCount = 0;
    let failCount = invalidCount;

    if (aggregatedViews.size > 0) {
      try {
        const paramValues: any[] = [];
        const placeholders: string[] = [];
        let i = 0;
        for (const [id, totalBoost] of aggregatedViews) {
          placeholders.push(`($${i * 2 + 1}, $${i * 2 + 2}::integer)`);
          paramValues.push(id, totalBoost);
          i++;
        }
        
        await pool.query(
          `UPDATE articles AS a
           SET views = a.views + v.increment
           FROM (VALUES ${placeholders.join(',')}) AS v(id, increment)
           WHERE a.id = v.id`,
          paramValues
        );
        successCount = viewsToProcess.length - invalidCount;
        console.log(`[Mobile API] Batch view: bulk updated ${aggregatedViews.size} unique articles (${successCount} views)`);
      } catch (err) {
        failCount += viewsToProcess.length - invalidCount;
        console.error("[Mobile API] Batch view bulk update failed:", err);
      }
    }

    res.json({ 
      success: true,
      processed: successCount,
      failed: failCount,
      message: `تم تسجيل ${successCount} مشاهدة`
    });
  } catch (error) {
    console.error("[Mobile API] batch view error:", error);
    res.status(500).json({ 
      success: false,
      message: "فشل تسجيل المشاهدات" 
    });
  }
});

// ==========================================
// Push Notification Device Registration
// POST /api/v1/devices/register
// ==========================================
router.post("/devices/register", async (req: Request, res: Response) => {
  try {
    const { 
      deviceToken,
      token, // alias - التطبيق قد يرسل token بدلاً من deviceToken
      platform = "ios",
      tokenProvider: providedTokenProvider, // التطبيق قد يرسل tokenProvider
      deviceName,
      osVersion,
      appVersion,
      locale,
      language, // alias for locale (مبرمج التطبيقات يرسل language)
      timezone,
      userId 
    } = req.body;

    // Support both 'token' and 'deviceToken' field names
    const finalToken = deviceToken || token;

    // Support both 'language' and 'locale' field names
    const deviceLocale = language || locale || "ar";

    if (!finalToken) {
      return res.status(400).json({ 
        success: false, 
        message: "Device token is required" 
      });
    }

    // REJECT Expo tokens - only accept native FCM/APNs tokens
    if (finalToken.startsWith('ExponentPushToken[') || finalToken.startsWith('ExpoPushToken[')) {
      console.log(`[Mobile API] Rejected Expo token - please use native FCM token`);
      return res.status(400).json({
        success: false,
        message: "يجب استخدام FCM/APNs token وليس Expo token. الرجاء تحديث التطبيق."
      });
    }

    // Determine token provider: iOS uses APNs, Android uses FCM
    // Accept provided tokenProvider or determine from platform
    const tokenProvider = providedTokenProvider || (platform === 'ios' ? 'apns' : 'fcm');

    // Check if device already exists
    const [existing] = await db
      .select()
      .from(pushDevices)
      .where(eq(pushDevices.deviceToken, finalToken))
      .limit(1);

    if (existing) {
      // Update existing device
      await db
        .update(pushDevices)
        .set({
          userId: userId || existing.userId,
          tokenProvider,
          platform,
          deviceName,
          osVersion,
          appVersion,
          locale: deviceLocale,
          timezone,
          isActive: true,
          lastActiveAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(pushDevices.deviceToken, finalToken));

      console.log(`[Mobile API] Device updated: ${platform} (${tokenProvider}) ${existing.id}`);
      return res.json({ 
        success: true, 
        message: "Device updated",
        deviceId: existing.id
      });
    }

    // IMPORTANT: Deactivate old tokens for the same user/device before registering new one
    // This prevents duplicate notifications and ensures only the latest token is used
    if (userId) {
      // Deactivate all other tokens for this user on the same platform
      const deactivated = await db
        .update(pushDevices)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(
          eq(pushDevices.userId, userId),
          eq(pushDevices.platform, platform),
          sql`${pushDevices.deviceToken} != ${finalToken}`
        ))
        .returning({ id: pushDevices.id });
      
      if (deactivated.length > 0) {
        console.log(`[Mobile API] Deactivated ${deactivated.length} old tokens for user ${userId}`);
      }
    }

    // Create new device
    const [newDevice] = await db
      .insert(pushDevices)
      .values({
        deviceToken: finalToken,
        tokenProvider,
        userId,
        platform,
        deviceName,
        osVersion,
        appVersion,
        locale: deviceLocale,
        timezone,
      })
      .returning({ id: pushDevices.id });

    console.log(`[Mobile API] New device registered: ${platform} (${tokenProvider}) ${newDevice.id}`);

    res.json({ 
      success: true, 
      message: "Device registered",
      deviceId: newDevice.id
    });
  } catch (error) {
    console.error("[Mobile API] devices/register error:", error);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// ==========================================
// Push Notification Device Unregister
// DELETE /api/v1/devices/unregister
// ==========================================
router.delete("/devices/unregister", async (req: Request, res: Response) => {
  try {
    const { deviceToken } = req.body;

    if (!deviceToken) {
      return res.status(400).json({ 
        success: false, 
        message: "Device token is required" 
      });
    }

    // Soft delete - mark as inactive
    await db
      .update(pushDevices)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(pushDevices.deviceToken, deviceToken));

    res.json({ success: true, message: "Device unregistered" });
  } catch (error) {
    console.error("[Mobile API] devices/unregister error:", error);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// ==========================================
// Get Available Topics (Firebase manages subscriptions)
// GET /api/v1/topics
// المواضيع الثابتة - الاشتراك/إلغاء الاشتراك يتم في التطبيق عبر Firebase SDK
// ==========================================
router.get("/topics", async (_req: Request, res: Response) => {
  const topics = [
    { id: "all_users", name: "All Users", nameAr: "جميع المستخدمين", isDefault: true },
    { id: "breaking_news", name: "Breaking News", nameAr: "الأخبار العاجلة", isDefault: true },
    { id: "sports", name: "Sports", nameAr: "الرياضة", isDefault: false },
    { id: "politics", name: "Politics", nameAr: "السياسة", isDefault: false },
    { id: "economy", name: "Economy", nameAr: "الاقتصاد", isDefault: false },
    { id: "technology", name: "Technology", nameAr: "التقنية", isDefault: false },
  ];
  
  res.json({ 
    success: true, 
    topics,
    note: "Subscribe/unsubscribe via Firebase SDK in the app"
  });
});

// ==========================================
// Track Notification Event (opened, clicked, dismissed)
// POST /api/v1/notifications/event
// ==========================================
router.post("/notifications/event", async (req: Request, res: Response) => {
  try {
    const { 
      campaignId, 
      eventType, 
      deviceToken,
      apnsId,
      metadata 
    } = req.body;

    if (!campaignId || !eventType) {
      return res.status(400).json({ 
        success: false, 
        message: "campaignId and eventType are required" 
      });
    }

    // Valid event types
    const validEvents = ["delivered", "opened", "clicked", "dismissed"];
    if (!validEvents.includes(eventType)) {
      return res.status(400).json({ 
        success: false, 
        message: `Invalid eventType. Must be one of: ${validEvents.join(", ")}` 
      });
    }

    // Get device if token provided
    let deviceId = null;
    let userId = null;
    if (deviceToken) {
      const [device] = await db
        .select({ id: pushDevices.id, userId: pushDevices.userId })
        .from(pushDevices)
        .where(eq(pushDevices.deviceToken, deviceToken))
        .limit(1);
      
      if (device) {
        deviceId = device.id;
        userId = device.userId;
      }
    }

    // Record event
    await db.insert(pushCampaignEvents).values({
      campaignId,
      deviceId,
      userId,
      eventType,
      apnsId,
      metadata,
    });

    // Update campaign stats
    const updateField = 
      eventType === "delivered" ? "deliveredCount" :
      eventType === "opened" ? "openedCount" :
      eventType === "clicked" ? "clickedCount" : null;

    if (updateField) {
      await db
        .update(pushCampaigns)
        .set({ 
          [updateField]: sql`${pushCampaigns[updateField]} + 1`,
          updatedAt: new Date()
        })
        .where(eq(pushCampaigns.id, campaignId));
    }

    res.json({ success: true });
  } catch (error) {
    console.error("[Mobile API] notifications/event error:", error);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// ==========================================
// Check Device Registration Status
// GET /api/v1/devices/status
// ==========================================
router.get("/devices/status", async (req: Request, res: Response) => {
  try {
    const deviceToken = req.query.deviceToken as string;

    if (!deviceToken) {
      return res.status(400).json({ 
        success: false, 
        message: "deviceToken query parameter is required" 
      });
    }

    const [device] = await db
      .select({
        id: pushDevices.id,
        isActive: pushDevices.isActive,
        lastActiveAt: pushDevices.lastActiveAt,
        createdAt: pushDevices.createdAt,
      })
      .from(pushDevices)
      .where(eq(pushDevices.deviceToken, deviceToken))
      .limit(1);

    if (!device) {
      return res.json({ 
        success: true, 
        registered: false 
      });
    }

    res.json({ 
      success: true, 
      registered: true,
      isActive: device.isActive,
      deviceId: device.id,
      lastActiveAt: device.lastActiveAt,
      registeredAt: device.createdAt,
    });
  } catch (error) {
    console.error("[Mobile API] devices/status error:", error);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// ============================================================================
// نظام العضوية - MEMBERSHIP SYSTEM APIs (Using unified users table)
// ============================================================================

// Helper: Generate 6-digit verification code
function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Helper: Generate secure session token
function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Helper: Verify user session (returns userId)
async function verifyMemberSession(req: Request): Promise<{ userId: string } | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  
  const token = authHeader.substring(7);
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  
  const [session] = await db
    .select({ userId: appMemberSessions.memberId })
    .from(appMemberSessions)
    .where(and(
      eq(appMemberSessions.tokenHash, tokenHash),
      eq(appMemberSessions.isActive, true),
      gt(appMemberSessions.expiresAt, new Date())
    ))
    .limit(1);
  
  if (session) {
    await db.update(appMemberSessions)
      .set({ lastUsedAt: new Date() })
      .where(eq(appMemberSessions.tokenHash, tokenHash));
  }
  
  return session || null;
}

// ==========================================
// 1. تسجيل جديد - Register New User
// POST /api/v1/auth/register
// ==========================================
router.post("/auth/register", async (req: Request, res: Response) => {
  try {
    const { 
      email, 
      phone, 
      password, 
      firstName, 
      lastName, 
      gender,
      city,
      country,
      locale
    } = req.body;

    // Validate required fields
    if (!password || password.length < 6) {
      return res.status(400).json({ 
        success: false, 
        message: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" 
      });
    }

    if (!email) {
      return res.status(400).json({ 
        success: false, 
        message: "البريد الإلكتروني مطلوب" 
      });
    }

    // Check if email already exists
    const [existingEmail] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email.toLowerCase().trim()))
      .limit(1);
    
    if (existingEmail) {
      return res.status(409).json({ 
        success: false, 
        message: "البريد الإلكتروني مسجل مسبقاً" 
      });
    }

    // Check if phone already exists (if provided)
    if (phone) {
      const [existingPhone] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.phoneNumber, phone.trim()))
        .limit(1);
      
      if (existingPhone) {
        return res.status(409).json({ 
          success: false, 
          message: "رقم الجوال مسجل مسبقاً" 
        });
      }
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);
    const userId = crypto.randomUUID();

    // Create user with pending status
    await db.insert(users).values({
      id: userId,
      email: email.toLowerCase().trim(),
      passwordHash,
      firstName: firstName?.trim(),
      lastName: lastName?.trim(),
      phoneNumber: phone?.trim() || null,
      gender,
      city: city?.trim(),
      country: country || "SA",
      locale: locale || "ar",
      role: "reader",
      status: "pending",
      authProvider: "local",
      emailVerified: false,
    });

    // Generate verification token
    const verificationToken = generateVerificationCode();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await db.insert(emailVerificationTokens).values({
      userId,
      token: verificationToken,
      expiresAt,
    });

    // Send activation email
    const emailSent = await sendMobileActivationEmail(
      email.toLowerCase().trim(), 
      verificationToken, 
      firstName?.trim()
    );

    console.log(`[Mobile API] New user registered: ${userId}, email sent: ${emailSent}`);

    res.status(201).json({ 
      success: true, 
      message: emailSent 
        ? "تم إنشاء الحساب بنجاح. تم إرسال رمز التفعيل إلى بريدك الإلكتروني"
        : "تم إنشاء الحساب بنجاح. يرجى تفعيل الحساب",
      userId,
      emailSent,
    });
  } catch (error) {
    console.error("[Mobile API] auth/register error:", error);
    res.status(500).json({ success: false, message: "حدث خطأ في الخادم" });
  }
});

// ==========================================
// 2. تفعيل الحساب - Activate Account
// POST /api/v1/auth/activate
// ==========================================
router.post("/auth/activate", async (req: Request, res: Response) => {
  try {
    const { userId, email, code } = req.body;

    if (!code) {
      return res.status(400).json({ 
        success: false, 
        message: "رمز التفعيل مطلوب" 
      });
    }

    // Find user
    let user;
    if (userId) {
      [user] = await db
        .select({ id: users.id, status: users.status })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
    } else if (email) {
      [user] = await db
        .select({ id: users.id, status: users.status })
        .from(users)
        .where(eq(users.email, email.toLowerCase().trim()))
        .limit(1);
    }

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: "المستخدم غير موجود" 
      });
    }

    if (user.status === "active") {
      return res.status(400).json({ 
        success: false, 
        message: "الحساب مفعل مسبقاً" 
      });
    }

    // Find valid verification token
    const [verificationRecord] = await db
      .select()
      .from(emailVerificationTokens)
      .where(and(
        eq(emailVerificationTokens.userId, user.id),
        eq(emailVerificationTokens.token, code),
        eq(emailVerificationTokens.used, false),
        gt(emailVerificationTokens.expiresAt, new Date())
      ))
      .limit(1);

    if (!verificationRecord) {
      return res.status(400).json({ 
        success: false, 
        message: "رمز التفعيل غير صحيح أو منتهي الصلاحية" 
      });
    }

    // Activate user
    await db.update(users)
      .set({ 
        status: "active",
        emailVerified: true,
      })
      .where(eq(users.id, user.id));

    // Mark token as used
    await db.update(emailVerificationTokens)
      .set({ used: true })
      .where(eq(emailVerificationTokens.id, verificationRecord.id));

    console.log(`[Mobile API] User activated: ${user.id}`);

    res.json({ 
      success: true, 
      message: "تم تفعيل الحساب بنجاح" 
    });
  } catch (error) {
    console.error("[Mobile API] auth/activate error:", error);
    res.status(500).json({ success: false, message: "حدث خطأ في الخادم" });
  }
});

// ==========================================
// 3. إعادة إرسال رمز التفعيل - Resend Activation Code
// POST /api/v1/auth/resend-activation
// ==========================================
router.post("/auth/resend-activation", async (req: Request, res: Response) => {
  try {
    const { userId, email } = req.body;

    // Find user
    let user;
    if (userId) {
      [user] = await db
        .select({ id: users.id, status: users.status, email: users.email })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
    } else if (email) {
      [user] = await db
        .select({ id: users.id, status: users.status, email: users.email })
        .from(users)
        .where(eq(users.email, email.toLowerCase().trim()))
        .limit(1);
    }

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: "المستخدم غير موجود" 
      });
    }

    if (user.status === "active") {
      return res.status(400).json({ 
        success: false, 
        message: "الحساب مفعل مسبقاً" 
      });
    }

    // Invalidate old tokens
    await db.update(emailVerificationTokens)
      .set({ used: true })
      .where(eq(emailVerificationTokens.userId, user.id));

    // Generate new verification code
    const verificationCode = generateVerificationCode();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await db.insert(emailVerificationTokens).values({
      userId: user.id,
      token: verificationCode,
      expiresAt,
    });

    // Send activation email
    const emailSent = await sendMobileActivationEmail(
      user.email!, 
      verificationCode
    );

    console.log(`[Mobile API] Verification code resent for: ${user.id}, email sent: ${emailSent}`);

    res.json({ 
      success: true, 
      message: emailSent 
        ? "تم إرسال رمز التفعيل إلى بريدك الإلكتروني"
        : "تم إنشاء رمز التفعيل",
      emailSent,
    });
  } catch (error) {
    console.error("[Mobile API] auth/resend-activation error:", error);
    res.status(500).json({ success: false, message: "حدث خطأ في الخادم" });
  }
});

// ==========================================
// 4. تسجيل الدخول - Login
// POST /api/v1/auth/login
// ==========================================
router.post("/auth/login", async (req: Request, res: Response) => {
  try {
    const { 
      email, 
      phone, 
      password,
      deviceInfo 
    } = req.body;

    if (!password) {
      return res.status(400).json({ 
        success: false, 
        message: "كلمة المرور مطلوبة" 
      });
    }

    if (!email && !phone) {
      return res.status(400).json({ 
        success: false, 
        message: "البريد الإلكتروني أو رقم الجوال مطلوب" 
      });
    }

    // Find user
    let user;
    if (email) {
      [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, email.toLowerCase().trim()))
        .limit(1);
    } else {
      [user] = await db
        .select()
        .from(users)
        .where(eq(users.phoneNumber, phone.trim()))
        .limit(1);
    }

    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: "بيانات الدخول غير صحيحة" 
      });
    }

    // Check if banned
    if (user.status === "banned") {
      return res.status(403).json({ 
        success: false, 
        message: "الحساب محظور",
        reason: user.banReason 
      });
    }

    // Check if suspended
    if (user.status === "suspended") {
      return res.status(403).json({ 
        success: false, 
        message: "الحساب موقوف",
        reason: user.suspensionReason,
        suspendedUntil: user.suspendedUntil
      });
    }

    // Check if deleted
    if (user.status === "deleted") {
      return res.status(403).json({ 
        success: false, 
        message: "هذا الحساب محذوف" 
      });
    }

    // Check if pending activation
    if (user.status === "pending") {
      return res.status(403).json({ 
        success: false, 
        message: "الحساب غير مفعل. يرجى تفعيل الحساب أولاً",
        requiresActivation: true,
        userId: user.id
      });
    }

    // Verify password
    if (!user.passwordHash) {
      return res.status(401).json({ 
        success: false, 
        message: "بيانات الدخول غير صحيحة" 
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      return res.status(401).json({ 
        success: false, 
        message: "بيانات الدخول غير صحيحة" 
      });
    }

    // Generate session token
    const sessionToken = generateSessionToken();
    const tokenHash = crypto.createHash('sha256').update(sessionToken).digest('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    // Create session
    await db.insert(appMemberSessions).values({
      memberId: user.id,
      tokenHash,
      deviceInfo: deviceInfo || null,
      ipAddress: req.ip || null,
      expiresAt,
    });

    // Update last login
    await db.update(users)
      .set({ 
        lastLoginAt: new Date(),
        lastDeviceInfo: deviceInfo || null,
      })
      .where(eq(users.id, user.id));

    console.log(`[Mobile API] User logged in: ${user.id}`);

    // Return user data
    res.json({ 
      success: true, 
      message: "تم تسجيل الدخول بنجاح",
      token: sessionToken,
      expiresAt: expiresAt.toISOString(),
      user: {
        id: user.id,
        email: user.email,
        phone: user.phoneNumber,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImageUrl: user.profileImageUrl,
        gender: user.gender,
        city: user.city,
        country: user.country,
        locale: user.locale,
        emailVerified: user.emailVerified,
        phoneVerified: user.phoneVerified,
      }
    });
  } catch (error) {
    console.error("[Mobile API] auth/login error:", error);
    res.status(500).json({ success: false, message: "حدث خطأ في الخادم" });
  }
});

// ==========================================
// 5. تسجيل الخروج - Logout
// POST /api/v1/auth/logout
// ==========================================
router.post("/auth/logout", async (req: Request, res: Response) => {
  try {
    const session = await verifyMemberSession(req);
    
    if (!session) {
      return res.status(401).json({ 
        success: false, 
        message: "غير مصرح" 
      });
    }

    const authHeader = req.headers.authorization;
    const token = authHeader!.substring(7);
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // Deactivate session
    await db.update(appMemberSessions)
      .set({ isActive: false })
      .where(eq(appMemberSessions.tokenHash, tokenHash));

    res.json({ 
      success: true, 
      message: "تم تسجيل الخروج بنجاح" 
    });
  } catch (error) {
    console.error("[Mobile API] auth/logout error:", error);
    res.status(500).json({ success: false, message: "حدث خطأ في الخادم" });
  }
});

// ==========================================
// 6. تسجيل الخروج من جميع الأجهزة - Logout All Devices
// POST /api/v1/auth/logout-all
// ==========================================
router.post("/auth/logout-all", async (req: Request, res: Response) => {
  try {
    const session = await verifyMemberSession(req);
    
    if (!session) {
      return res.status(401).json({ 
        success: false, 
        message: "غير مصرح" 
      });
    }

    // Deactivate all sessions for this user
    await db.update(appMemberSessions)
      .set({ isActive: false })
      .where(eq(appMemberSessions.memberId, session.userId));

    res.json({ 
      success: true, 
      message: "تم تسجيل الخروج من جميع الأجهزة" 
    });
  } catch (error) {
    console.error("[Mobile API] auth/logout-all error:", error);
    res.status(500).json({ success: false, message: "حدث خطأ في الخادم" });
  }
});

// ==========================================
// 7. نسيت كلمة المرور - Forgot Password
// POST /api/v1/auth/forgot-password
// ==========================================
router.post("/auth/forgot-password", async (req: Request, res: Response) => {
  try {
    const { email, phone } = req.body;

    if (!email && !phone) {
      return res.status(400).json({ 
        success: false, 
        message: "البريد الإلكتروني أو رقم الجوال مطلوب" 
      });
    }

    // Find user
    let user;
    if (email) {
      [user] = await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(eq(users.email, email.toLowerCase().trim()))
        .limit(1);
    } else {
      [user] = await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(eq(users.phoneNumber, phone.trim()))
        .limit(1);
    }

    // Always return success to prevent enumeration attacks
    if (!user) {
      return res.json({ 
        success: true, 
        message: "إذا كان الحساب موجوداً، سيتم إرسال رمز استعادة كلمة المرور" 
      });
    }

    // Generate reset token
    const resetToken = generateVerificationCode();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    // Store reset token
    await db.insert(passwordResetTokens).values({
      userId: user.id,
      token: resetToken,
      expiresAt,
    });

    // Send password reset email
    const emailSent = await sendPasswordResetEmail(user.email!, resetToken);

    console.log(`[Mobile API] Password reset for ${user.id}, email sent: ${emailSent}`);

    res.json({ 
      success: true, 
      message: emailSent 
        ? "تم إرسال رمز استعادة كلمة المرور إلى بريدك الإلكتروني"
        : "تم إنشاء رمز استعادة كلمة المرور",
      emailSent,
      resetCode: resetToken, // Remove in production
      userId: user.id, // Remove in production
    });
  } catch (error) {
    console.error("[Mobile API] auth/forgot-password error:", error);
    res.status(500).json({ success: false, message: "حدث خطأ في الخادم" });
  }
});

// ==========================================
// 8. إعادة تعيين كلمة المرور - Reset Password
// POST /api/v1/auth/reset-password
// ==========================================
router.post("/auth/reset-password", async (req: Request, res: Response) => {
  try {
    const { userId, email, phone, code, newPassword } = req.body;

    if (!code) {
      return res.status(400).json({ 
        success: false, 
        message: "رمز الاستعادة مطلوب" 
      });
    }

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ 
        success: false, 
        message: "كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل" 
      });
    }

    // Find user
    let user;
    if (userId) {
      [user] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
    } else if (email) {
      [user] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email.toLowerCase().trim()))
        .limit(1);
    } else if (phone) {
      [user] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.phoneNumber, phone.trim()))
        .limit(1);
    }

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: "المستخدم غير موجود" 
      });
    }

    // Verify reset token
    const [resetRecord] = await db
      .select()
      .from(passwordResetTokens)
      .where(and(
        eq(passwordResetTokens.userId, user.id),
        eq(passwordResetTokens.token, code),
        eq(passwordResetTokens.used, false),
        gt(passwordResetTokens.expiresAt, new Date())
      ))
      .limit(1);

    if (!resetRecord) {
      return res.status(400).json({ 
        success: false, 
        message: "رمز الاستعادة غير صحيح أو منتهي الصلاحية" 
      });
    }

    // Update password
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await db.update(users)
      .set({ passwordHash })
      .where(eq(users.id, user.id));

    // Mark token as used
    await db.update(passwordResetTokens)
      .set({ used: true })
      .where(eq(passwordResetTokens.id, resetRecord.id));

    // Invalidate all sessions
    await db.update(appMemberSessions)
      .set({ isActive: false })
      .where(eq(appMemberSessions.memberId, user.id));

    console.log(`[Mobile API] Password reset for: ${user.id}`);

    res.json({ 
      success: true, 
      message: "تم تغيير كلمة المرور بنجاح. يرجى تسجيل الدخول" 
    });
  } catch (error) {
    console.error("[Mobile API] auth/reset-password error:", error);
    res.status(500).json({ success: false, message: "حدث خطأ في الخادم" });
  }
});

// ============================================================================
// الملف الشخصي - USER PROFILE APIs
// ============================================================================

// ==========================================
// 1. عرض الملف الشخصي - Get Profile
// GET /api/v1/members/profile
// ==========================================
router.get("/members/profile", async (req: Request, res: Response) => {
  try {
    const session = await verifyMemberSession(req);
    
    if (!session) {
      return res.status(401).json({ 
        success: false, 
        message: "غير مصرح" 
      });
    }

    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        phoneNumber: users.phoneNumber,
        firstName: users.firstName,
        lastName: users.lastName,
        profileImageUrl: users.profileImageUrl,
        gender: users.gender,
        birthDate: users.birthDate,
        city: users.city,
        country: users.country,
        locale: users.locale,
        emailVerified: users.emailVerified,
        phoneVerified: users.phoneVerified,
        createdAt: users.createdAt,
        // Legacy single-role column kept for compatibility. The iOS APIUser
        // decoder reads `role` as a fallback when no RBAC roles are returned.
        role: users.role,
        jobTitle: users.jobTitle,
      })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "المستخدم غير موجود"
      });
    }

    // RBAC roles — these are the authoritative roles assigned to the user
    // via the `user_roles` join table. iOS's `localizedRole` prefers any
    // non-reader role from this array over the legacy `users.role` column,
    // so an opinion author with RBAC role `opinion_author` will correctly
    // surface as "كاتب مقال رأي" instead of falling back to "قارئ".
    const rbacRoles = await db
      .select({ name: roles.name, nameAr: roles.nameAr })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, session.userId));

    // Get user interests
    const interests = await db
      .select({
        categoryId: userInterests.categoryId,
        categoryName: categories.nameAr,
        categorySlug: categories.slug,
        categoryColor: categories.color,
      })
      .from(userInterests)
      .leftJoin(categories, eq(userInterests.categoryId, categories.id))
      .where(eq(userInterests.userId, session.userId));

    res.json({
      success: true,
      user: {
        ...user,
        phone: user.phoneNumber,
        // `roles` is the array of role names (e.g. ["opinion_author"]) the
        // iOS decoder iterates over via `primaryRoleKey`. Including the
        // Arabic display name lets the decoder skip its own translation
        // table when the backend already has the canonical label.
        roles: rbacRoles.map((r) => ({ key: r.name, displayName: r.nameAr })),
        interests: interests.map(i => ({
          id: i.categoryId,
          name: i.categoryName,
          slug: i.categorySlug,
          color: i.categoryColor,
        }))
      }
    });
  } catch (error) {
    console.error("[Mobile API] members/profile error:", error);
    res.status(500).json({ success: false, message: "حدث خطأ في الخادم" });
  }
});

// ==========================================
// 2. تحديث الملف الشخصي - Update Profile
// PUT /api/v1/members/profile
// ==========================================
router.put("/members/profile", async (req: Request, res: Response) => {
  try {
    const session = await verifyMemberSession(req);
    
    if (!session) {
      return res.status(401).json({ 
        success: false, 
        message: "غير مصرح" 
      });
    }

    const { 
      firstName, 
      lastName, 
      profileImageUrl, 
      gender, 
      birthDate, 
      city,
      country,
      locale 
    } = req.body;

    await db.update(users)
      .set({
        firstName: firstName?.trim(),
        lastName: lastName?.trim(),
        profileImageUrl: profileImageUrl?.trim(),
        gender,
        birthDate: birthDate ? new Date(birthDate) : undefined,
        city: city?.trim(),
        country: country?.trim(),
        locale,
      })
      .where(eq(users.id, session.userId));

    res.json({ 
      success: true, 
      message: "تم تحديث الملف الشخصي بنجاح" 
    });
  } catch (error) {
    console.error("[Mobile API] members/profile update error:", error);
    res.status(500).json({ success: false, message: "حدث خطأ في الخادم" });
  }
});

// ==========================================
// 2.1 رفع الصورة الشخصية - Upload Profile Image
// POST /api/v1/members/profile/image
// ==========================================
router.post("/members/profile/image", async (req: Request, res: Response) => {
  try {
    const session = await verifyMemberSession(req);
    
    if (!session) {
      return res.status(401).json({ 
        success: false, 
        message: "غير مصرح - تسجيل الدخول مطلوب" 
      });
    }

    const { image } = req.body;

    if (!image) {
      return res.status(400).json({ 
        success: false, 
        message: "الصورة مطلوبة (base64)" 
      });
    }

    // Parse base64 image
    const matches = image.match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,(.+)$/);
    
    if (!matches) {
      return res.status(400).json({ 
        success: false, 
        message: "صيغة الصورة غير صحيحة. يجب أن تكون data:image/[type];base64,..." 
      });
    }

    const imageType = matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, 'base64');

    // Validate file size (max 5MB)
    if (buffer.length > 5 * 1024 * 1024) {
      return res.status(400).json({ 
        success: false, 
        message: "حجم الصورة يجب أن يكون أقل من 5 ميجابايت" 
      });
    }

    // Import object storage service
    const { ObjectStorageService } = await import("../objectStorage");
    const objectStorageService = new ObjectStorageService();
    
    // Generate unique filename
    const timestamp = Date.now();
    const filename = `profile-images/${session.userId}-${timestamp}.${imageType}`;
    
    // Upload to public storage
    const result = await objectStorageService.uploadFile(
      filename,
      buffer,
      `image/${imageType}`,
      "public"
    );

    // Create accessible URL
    const imageUrl = `/public-objects/${filename}`;

    // Update user profile with new image URL
    await db.update(users)
      .set({ profileImageUrl: imageUrl })
      .where(eq(users.id, session.userId));

    console.log(`[Mobile API] Profile image uploaded for ${session.userId}: ${imageUrl}`);

    res.json({ 
      success: true, 
      message: "تم رفع الصورة الشخصية بنجاح",
      imageUrl: imageUrl
    });
  } catch (error) {
    console.error("[Mobile API] members/profile/image upload error:", error);
    res.status(500).json({ success: false, message: "حدث خطأ في رفع الصورة" });
  }
});

// ==========================================
// 2.2 حذف الصورة الشخصية - Delete Profile Image
// DELETE /api/v1/members/profile/image
// ==========================================
router.delete("/members/profile/image", async (req: Request, res: Response) => {
  try {
    const session = await verifyMemberSession(req);
    
    if (!session) {
      return res.status(401).json({ 
        success: false, 
        message: "غير مصرح - تسجيل الدخول مطلوب" 
      });
    }

    // Remove profile image URL from user
    await db.update(users)
      .set({ profileImageUrl: null })
      .where(eq(users.id, session.userId));

    console.log(`[Mobile API] Profile image deleted for ${session.userId}`);

    res.json({ 
      success: true, 
      message: "تم حذف الصورة الشخصية بنجاح"
    });
  } catch (error) {
    console.error("[Mobile API] members/profile/image delete error:", error);
    res.status(500).json({ success: false, message: "حدث خطأ في حذف الصورة" });
  }
});

// ==========================================
// 3. تغيير كلمة المرور - Change Password
// POST /api/v1/members/change-password
// ==========================================
router.post("/members/change-password", async (req: Request, res: Response) => {
  try {
    const session = await verifyMemberSession(req);
    
    if (!session) {
      return res.status(401).json({ 
        success: false, 
        message: "غير مصرح" 
      });
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        success: false, 
        message: "كلمة المرور الحالية والجديدة مطلوبة" 
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ 
        success: false, 
        message: "كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل" 
      });
    }

    // Get user
    const [user] = await db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);

    if (!user?.passwordHash) {
      return res.status(401).json({ 
        success: false, 
        message: "كلمة المرور الحالية غير صحيحة" 
      });
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isPasswordValid) {
      return res.status(401).json({ 
        success: false, 
        message: "كلمة المرور الحالية غير صحيحة" 
      });
    }

    // Update password
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await db.update(users)
      .set({ passwordHash })
      .where(eq(users.id, session.userId));

    res.json({ 
      success: true, 
      message: "تم تغيير كلمة المرور بنجاح" 
    });
  } catch (error) {
    console.error("[Mobile API] members/change-password error:", error);
    res.status(500).json({ success: false, message: "حدث خطأ في الخادم" });
  }
});

// ============================================================================
// الاهتمامات - INTERESTS APIs
// ============================================================================

// ==========================================
// 1. قائمة الاهتمامات المتاحة - Get Available Interests
// GET /api/v1/interests
// ==========================================
router.get("/interests", async (req: Request, res: Response) => {
  try {
    // Get all visible categories as interests
    const allCategories = await db
      .select({
        id: categories.id,
        name: categories.nameAr,
        slug: categories.slug,
        color: categories.color,
        icon: categories.icon,
      })
      .from(categories)
      .where(eq(categories.status, "visible"))
      .orderBy(categories.displayOrder);

    res.json({ 
      success: true, 
      interests: allCategories 
    });
  } catch (error) {
    console.error("[Mobile API] interests error:", error);
    res.status(500).json({ success: false, message: "حدث خطأ في الخادم" });
  }
});

// ==========================================
// 2. اهتمامات المستخدم - Get User Interests
// GET /api/v1/members/interests
// ==========================================
router.get("/members/interests", async (req: Request, res: Response) => {
  try {
    const session = await verifyMemberSession(req);
    
    if (!session) {
      return res.status(401).json({ 
        success: false, 
        message: "غير مصرح" 
      });
    }

    const interests = await db
      .select({
        categoryId: userInterests.categoryId,
        categoryName: categories.nameAr,
        categorySlug: categories.slug,
        categoryColor: categories.color,
        weight: userInterests.weight,
      })
      .from(userInterests)
      .leftJoin(categories, eq(userInterests.categoryId, categories.id))
      .where(eq(userInterests.userId, session.userId))
      .orderBy(desc(userInterests.weight));

    res.json({ 
      success: true, 
      interests: interests.map(i => ({
        id: i.categoryId,
        name: i.categoryName,
        slug: i.categorySlug,
        color: i.categoryColor,
        weight: i.weight,
      }))
    });
  } catch (error) {
    console.error("[Mobile API] members/interests error:", error);
    res.status(500).json({ success: false, message: "حدث خطأ في الخادم" });
  }
});

// ==========================================
// 3. تحديث اهتمامات المستخدم - Update User Interests
// PUT/POST /api/v1/members/interests
// ==========================================
async function updateMemberInterests(req: Request, res: Response) {
  try {
    const session = await verifyMemberSession(req);
    
    if (!session) {
      return res.status(401).json({ 
        success: false, 
        message: "غير مصرح - تسجيل الدخول مطلوب" 
      });
    }

    // Support both interestIds and categoryIds for backwards compatibility
    const interestIds = req.body.interestIds || req.body.categoryIds;

    if (!Array.isArray(interestIds)) {
      return res.status(400).json({ 
        success: false, 
        message: "قائمة الاهتمامات مطلوبة (interestIds أو categoryIds)" 
      });
    }

    // Delete existing interests
    await db.delete(userInterests)
      .where(eq(userInterests.userId, session.userId));

    // Add new interests
    if (interestIds.length > 0) {
      const interestValues = interestIds.map((categoryId: string, index: number) => ({
        userId: session.userId,
        categoryId,
        weight: 1.0 - (index * 0.1), // Higher weight for earlier items
      }));

      await db.insert(userInterests).values(interestValues);
    }

    console.log(`[Mobile API] Updated interests for ${session.userId}: ${interestIds.length} interests`);

    res.json({ 
      success: true, 
      message: "تم تحديث الاهتمامات بنجاح",
      count: interestIds.length
    });
  } catch (error) {
    console.error("[Mobile API] members/interests update error:", error);
    res.status(500).json({ success: false, message: "حدث خطأ في الخادم" });
  }
}

// Register both PUT and POST for backwards compatibility
router.put("/members/interests", updateMemberInterests);
router.post("/members/interests", updateMemberInterests);

// ==========================================
// 4. إضافة اهتمام - Add Interest
// POST /api/v1/members/interests/add
// ==========================================
router.post("/members/interests/add", async (req: Request, res: Response) => {
  try {
    const session = await verifyMemberSession(req);
    
    if (!session) {
      return res.status(401).json({ 
        success: false, 
        message: "غير مصرح" 
      });
    }

    const { categoryId } = req.body;

    if (!categoryId) {
      return res.status(400).json({ 
        success: false, 
        message: "معرف الاهتمام مطلوب" 
      });
    }

    // Check if already exists
    const [existing] = await db
      .select()
      .from(userInterests)
      .where(and(
        eq(userInterests.userId, session.userId),
        eq(userInterests.categoryId, categoryId)
      ))
      .limit(1);

    if (existing) {
      return res.status(400).json({ 
        success: false, 
        message: "الاهتمام موجود مسبقاً" 
      });
    }

    await db.insert(userInterests).values({
      userId: session.userId,
      categoryId,
    });

    res.json({ 
      success: true, 
      message: "تم إضافة الاهتمام بنجاح" 
    });
  } catch (error) {
    console.error("[Mobile API] members/interests/add error:", error);
    res.status(500).json({ success: false, message: "حدث خطأ في الخادم" });
  }
});

// ==========================================
// 5. حذف اهتمام - Remove Interest
// DELETE /api/v1/members/interests/:categoryId
// ==========================================
router.delete("/members/interests/:categoryId", async (req: Request, res: Response) => {
  try {
    const session = await verifyMemberSession(req);
    
    if (!session) {
      return res.status(401).json({ 
        success: false, 
        message: "غير مصرح" 
      });
    }

    const { categoryId } = req.params;

    await db.delete(userInterests)
      .where(and(
        eq(userInterests.userId, session.userId),
        eq(userInterests.categoryId, categoryId)
      ));

    res.json({ 
      success: true, 
      message: "تم حذف الاهتمام بنجاح" 
    });
  } catch (error) {
    console.error("[Mobile API] members/interests/remove error:", error);
    res.status(500).json({ success: false, message: "حدث خطأ في الخادم" });
  }
});

// ==========================================
// تحديث FCM Token - Update FCM Token
// POST /api/v1/members/fcm-token
// ==========================================
router.post("/members/fcm-token", async (req: Request, res: Response) => {
  try {
    const session = await verifyMemberSession(req);
    
    if (!session) {
      return res.status(401).json({ 
        success: false, 
        message: "غير مصرح" 
      });
    }

    const { fcmToken, topics } = req.body;
    
    // الـ topics الافتراضية للاشتراك
    const defaultTopics = ['all_users'];
    const requestedTopics = topics || [];
    const allTopics = Array.from(new Set([...defaultTopics, ...requestedTopics]));

    await db.update(users)
      .set({ 
        fcmToken: fcmToken || null,
        fcmTopics: allTopics,
      })
      .where(eq(users.id, session.userId));
    
    // اشتراك الجهاز في الـ topics على FCM
    if (fcmToken) {
      const { subscribeToMultipleTopics } = await import('../services/fcmService');
      const subscribeResult = await subscribeToMultipleTopics(fcmToken, allTopics);
      console.log(`[Mobile API] FCM topic subscription for user ${session.userId}:`, subscribeResult);
    }

    res.json({ 
      success: true, 
      message: "تم تحديث إعدادات الإشعارات",
      subscribedTopics: allTopics
    });
  } catch (error) {
    console.error("[Mobile API] members/fcm-token error:", error);
    res.status(500).json({ success: false, message: "حدث خطأ في الخادم" });
  }
});

// ==========================================
// حذف الحساب - Delete Account (Soft Delete)
// DELETE /api/v1/members/account
// ==========================================
router.delete("/members/account", async (req: Request, res: Response) => {
  try {
    const session = await verifyMemberSession(req);
    
    if (!session) {
      return res.status(401).json({ 
        success: false, 
        message: "غير مصرح" 
      });
    }

    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ 
        success: false, 
        message: "كلمة المرور مطلوبة لتأكيد الحذف" 
      });
    }

    // Verify password
    const [user] = await db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);

    if (!user?.passwordHash) {
      return res.status(401).json({ 
        success: false, 
        message: "كلمة المرور غير صحيحة" 
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      return res.status(401).json({ 
        success: false, 
        message: "كلمة المرور غير صحيحة" 
      });
    }

    // Soft delete - set status to deleted and add deletedAt timestamp
    await db.update(users)
      .set({ 
        status: "deleted",
        deletedAt: new Date()
      })
      .where(eq(users.id, session.userId));

    // Invalidate all sessions
    await db.update(appMemberSessions)
      .set({ isActive: false })
      .where(eq(appMemberSessions.memberId, session.userId));

    console.log(`[Mobile API] User account deleted: ${session.userId}`);

    res.json({ 
      success: true, 
      message: "تم حذف الحساب بنجاح" 
    });
  } catch (error) {
    console.error("[Mobile API] members/account delete error:", error);
    res.status(500).json({ success: false, message: "حدث خطأ في الخادم" });
  }
});

// ==========================================
// اختبار APNs مباشر - Test APNs Direct
// GET /api/v1/members/push-notifications/test-apns/:deviceToken
// ==========================================
router.get("/members/push-notifications/test-apns/:deviceToken?", async (req: Request, res: Response) => {
  try {
    const { deviceToken } = req.params;
    
    // Import APNs service
    const { 
      sendPushNotification, 
      createCustomNotificationPayload,
      isApnsConfigured 
    } = await import("../services/apnsService");
    
    if (!isApnsConfigured()) {
      return res.json({
        success: false,
        error: "APNs not configured",
        config: {
          keyId: process.env.APNS_KEY_ID || "not set",
          teamId: process.env.APNS_TEAM_ID || "not set",
          bundleId: process.env.APNS_BUNDLE_ID || "not set",
          hasPrivateKey: !!process.env.APNS_KEY_P8,
          environment: process.env.APNS_ENVIRONMENT || "production (default)"
        }
      });
    }
    
    // Get device token from param or database
    let targetToken = deviceToken;
    
    if (!targetToken) {
      // Get most recent active iOS device
      const [device] = await db
        .select({ deviceToken: pushDevices.deviceToken })
        .from(pushDevices)
        .where(and(
          eq(pushDevices.platform, 'ios'),
          eq(pushDevices.isActive, true)
        ))
        .orderBy(desc(pushDevices.createdAt))
        .limit(1);
      
      if (!device) {
        return res.json({
          success: false,
          error: "No active iOS device found"
        });
      }
      
      targetToken = device.deviceToken;
    }
    
    // Create test payload
    const payload = createCustomNotificationPayload(
      "اختبار APNs ✅",
      `تم إرسال هذا الإشعار في ${new Date().toLocaleTimeString('ar-SA')}`,
      {
        sound: "default",
        badge: 1,
        type: "test"
      }
    );
    
    console.log(`[APNs Test] Sending test notification to ${targetToken.substring(0, 16)}...`);
    console.log(`[APNs Test] Payload:`, JSON.stringify(payload, null, 2));
    
    const result = await sendPushNotification(targetToken, payload);
    
    console.log(`[APNs Test] Result:`, result);
    
    res.json({
      success: result.success,
      token: targetToken.substring(0, 20) + "...",
      result: {
        statusCode: result.statusCode,
        apnsId: result.apnsId,
        reason: result.reason
      },
      payload,
      config: {
        keyId: process.env.APNS_KEY_ID,
        teamId: process.env.APNS_TEAM_ID,
        bundleId: process.env.APNS_BUNDLE_ID,
        environment: process.env.APNS_ENVIRONMENT || "production (default)"
      },
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error("[APNs Test] Error:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================================================
// iOS App Content Endpoints
// ==================================================

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function makeExcerpt(text: string, maxLen = 200): string {
  const plain = stripHtml(text);
  return plain.length > maxLen ? plain.slice(0, maxLen) + "…" : plain;
}

function estimateReadingMinutes(text: string): number {
  const words = stripHtml(text).split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
}

const BASE_URL = "https://sabq.org";

function formatArticleForMobile(row: any, baseUrl: string) {
  const article = row.article;
  // The byline shown to readers is the **reporter** chosen from the editor's
  // dropdown (`articles.reporterId`), NOT the staff member who entered the
  // article (`articles.authorId`, auto-set to req.user.id). Fall through to
  // author only when no reporter was selected, then to the generic newspaper
  // label as a last resort.
  const byline = row.reporter
    ? `${row.reporter.firstName || ""} ${row.reporter.lastName || ""}`.trim()
    : row.author
    ? `${row.author.firstName || ""} ${row.author.lastName || ""}`.trim()
    : "";
  return {
    id: article.id,
    title: article.title,
    subtitle: article.subtitle || null,
    slug: article.slug,
    body: stripHtml(article.content || ""),
    excerpt: article.excerpt || makeExcerpt(article.content || ""),
    // Dashboard-generated AI summary. iOS uses this for the "الموجز الذكي"
    // card; web reads `aiSummary` directly. Falls through to null when the
    // article hasn't been processed yet so the iOS card can fall back to
    // `excerpt` the same way the web does.
    ai_summary: article.aiSummary || null,
    section: row.category?.nameAr || "عام",
    section_id: row.category?.id || null,
    author: byline || "سبق",
    published_at: article.publishedAt?.toISOString() || null,
    updated_at: article.updatedAt?.toISOString() || null,
    image_url: article.imageUrl || article.thumbnailUrl || null,
    article_url: `${baseUrl}/article/${article.slug}`,
    is_breaking: article.newsType === "breaking",
    is_featured: article.isFeatured || false,
    reading_minutes: estimateReadingMinutes(article.content || ""),
    views_count: article.viewsCount || article.views || 0,
    shares_count: article.sharesCount || article.shares || 0,
  };
}

const memoryCache = new Map<string, { data: any; expiry: number }>();
function getCached(key: string) {
  const entry = memoryCache.get(key);
  if (entry && entry.expiry > Date.now()) return entry.data;
  memoryCache.delete(key);
  return null;
}
function setCache(key: string, data: any, ttlMs: number) {
  memoryCache.set(key, { data, expiry: Date.now() + ttlMs });
}

// GET /api/v1/articles (list)
router.get("/articles", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const offset = parseInt(req.query.offset as string) || 0;
    const section = req.query.section as string | undefined;
    const breaking = req.query.breaking as string | undefined;
    const featured = req.query.featured as string | undefined;
    const q = req.query.q as string | undefined;

    const conditions: any[] = [
      eq(articles.status, "published"),
      eq(articles.hideFromHomepage, false),
    ];

    if (section) conditions.push(eq(articles.categoryId, section));
    if (breaking === "true") conditions.push(eq(articles.newsType, "breaking"));
    if (featured === "true") conditions.push(eq(articles.isFeatured, true));
    if (q) conditions.push(ilike(articles.title, `%${q}%`));

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(articles)
      .where(and(...conditions));

    const total = Number(countResult?.count || 0);

    const results = await db
      .select({
        article: articleCardSelect,
        category: { nameAr: categories.nameAr, id: categories.id },
        author: {
          firstName: users.firstName,
          lastName: users.lastName,
        },
        reporter: {
          firstName: reporterUsers.firstName,
          lastName: reporterUsers.lastName,
        },
      })
      .from(articles)
      .leftJoin(categories, eq(articles.categoryId, categories.id))
      .leftJoin(users, eq(articles.authorId, users.id))
      .leftJoin(reporterUsers, eq(articles.reporterId, reporterUsers.id))
      .where(and(...conditions))
      .orderBy(desc(articles.publishedAt))
      .limit(limit)
      .offset(offset);

    res.json({
      articles: results.map((r) => formatArticleForMobile(r, BASE_URL)),
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    });
  } catch (error) {
    console.error("[Mobile API] GET /articles error:", error);
    res.status(500).json({
      error: { code: "SERVER_ERROR", message: "فشل في جلب المقالات", status: 500 },
    });
  }
});

// GET /api/v1/articles/:id (single article detail)
router.get("/articles/:id", async (req: Request, res: Response) => {
  try {
    const articleId = req.params.id;

    let condition;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;
    if (uuidRegex.test(articleId)) {
      condition = eq(articles.id, articleId);
    } else {
      condition = eq(articles.slug, articleId);
    }

    const articleRows = await db
      .select()
      .from(articles)
      .where(and(condition, eq(articles.status, "published")))
      .limit(1);

    if (!articleRows.length) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "المقالة غير موجودة", status: 404 },
      });
    }

    const articleRow = articleRows[0];

    let categoryNameAr: string | null = null;
    let categoryIdVal: string | null = null;
    if (articleRow.categoryId) {
      const [cat] = await db.select({ nameAr: categories.nameAr, id: categories.id }).from(categories).where(eq(categories.id, articleRow.categoryId)).limit(1);
      if (cat) { categoryNameAr = cat.nameAr; categoryIdVal = cat.id; }
    }

    let authorFirstName: string | null = null;
    let authorLastName: string | null = null;
    let authorProfileImage: string | null = null;
    if (articleRow.authorId) {
      const [author] = await db.select({ firstName: users.firstName, lastName: users.lastName, profileImageUrl: users.profileImageUrl }).from(users).where(eq(users.id, articleRow.authorId)).limit(1);
      if (author) { authorFirstName = author.firstName; authorLastName = author.lastName; authorProfileImage = author.profileImageUrl; }
    }

    // Reporter (`articles.reporterId`) is the byline picked from the dashboard
    // dropdown and takes priority over the author (the staff member who
    // entered the article into the system).
    let reporterFirstName: string | null = null;
    let reporterLastName: string | null = null;
    let reporterProfileImage: string | null = null;
    if (articleRow.reporterId) {
      const [reporter] = await db
        .select({ firstName: users.firstName, lastName: users.lastName, profileImageUrl: users.profileImageUrl })
        .from(users)
        .where(eq(users.id, articleRow.reporterId))
        .limit(1);
      if (reporter) {
        reporterFirstName = reporter.firstName;
        reporterLastName = reporter.lastName;
        reporterProfileImage = reporter.profileImageUrl;
      }
    }

    const articleTagsData = await db
      .select({ nameAr: tags.nameAr })
      .from(articleTags)
      .innerJoin(tags, eq(articleTags.tagId, tags.id))
      .where(eq(articleTags.articleId, articleRow.id));

    const tagsList = articleTagsData.map((t) => t.nameAr);

    let relatedResults: any[] = [];
    if (articleRow.categoryId) {
      relatedResults = await db
        .select({
          id: articles.id,
          title: articles.title,
          slug: articles.slug,
          imageUrl: articles.imageUrl,
          thumbnailUrl: articles.thumbnailUrl,
          publishedAt: articles.publishedAt,
          categoryName: categories.nameAr,
        })
        .from(articles)
        .leftJoin(categories, eq(articles.categoryId, categories.id))
        .where(
          and(
            eq(articles.status, "published"),
            eq(articles.hideFromHomepage, false),
            eq(articles.categoryId, articleRow.categoryId),
            ne(articles.id, articleRow.id)
          )
        )
        .orderBy(desc(articles.publishedAt))
        .limit(5);
    }

    const formattedResult = {
      article: articleRow,
      category: categoryNameAr ? { nameAr: categoryNameAr, id: categoryIdVal } : null,
      author: authorFirstName ? { firstName: authorFirstName, lastName: authorLastName } : null,
      reporter: reporterFirstName ? { firstName: reporterFirstName, lastName: reporterLastName } : null,
    };
    const formatted = formatArticleForMobile(formattedResult, BASE_URL);

    res.json({
      ...formatted,
      tags: tagsList,
      // `author_image` is the byline avatar. Prefer reporter's image for the
      // same reason `formatArticleForMobile` prefers the reporter's name.
      author_image: reporterProfileImage || authorProfileImage || null,
      album_images: articleRow.albumImages || [],
      related_articles: relatedResults.map((r) => ({
        id: r.id,
        title: r.title,
        image_url: r.imageUrl || r.thumbnailUrl || null,
        section: r.categoryName || "عام",
        slug: r.slug,
        published_at: r.publishedAt?.toISOString() || null,
      })),
    });
  } catch (error) {
    console.error("[Mobile API] GET /articles/:id error:", error);
    res.status(500).json({
      error: { code: "SERVER_ERROR", message: "فشل في جلب المقالة", status: 500 },
    });
  }
});

// GET /api/v1/sections
router.get("/sections", async (req: Request, res: Response) => {
  try {
    const cacheKey = "mobile:sections";
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const cats = await db
      .select({
        id: categories.id,
        name: categories.nameAr,
        nameEn: categories.nameEn,
        slug: categories.slug,
        displayOrder: categories.displayOrder,
      })
      .from(categories)
      .where(eq(categories.status, "visible"))
      .orderBy(categories.displayOrder);

    const sfSymbols: Record<string, string> = {
      "محليات": "building.2",
      "عالمية": "globe",
      "سياسة": "flag",
      "رياضة": "sportscourt",
      "اقتصاد": "chart.line.uptrend.xyaxis",
      "تقنية": "cpu",
      "حياتنا": "heart",
      "ثقافة": "book",
      "default": "newspaper",
    };

    const sectionCounts = await db
      .select({
        categoryId: articles.categoryId,
        count: sql<number>`count(*)`,
      })
      .from(articles)
      .where(and(eq(articles.status, "published"), eq(articles.hideFromHomepage, false)))
      .groupBy(articles.categoryId);

    const countMap = new Map(sectionCounts.map((c) => [c.categoryId, Number(c.count)]));

    const sections = cats.map((c) => ({
      id: c.id,
      name: c.name,
      name_en: c.nameEn,
      slug: c.slug,
      icon: sfSymbols[c.name] || sfSymbols.default,
      articles_count: countMap.get(c.id) || 0,
      display_order: c.displayOrder,
    }));

    const result = { sections };
    setCache(cacheKey, result, 5 * 60 * 1000);
    res.json(result);
  } catch (error) {
    console.error("[Mobile API] GET /sections error:", error);
    res.status(500).json({
      error: { code: "SERVER_ERROR", message: "فشل في جلب الأقسام", status: 500 },
    });
  }
});

// GET /api/v1/breaking
router.get("/breaking", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 30);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const results = await db
      .select({
        article: articleCardSelect,
        category: { nameAr: categories.nameAr, id: categories.id },
        author: { firstName: users.firstName, lastName: users.lastName },
        reporter: { firstName: reporterUsers.firstName, lastName: reporterUsers.lastName },
      })
      .from(articles)
      .leftJoin(categories, eq(articles.categoryId, categories.id))
      .leftJoin(users, eq(articles.authorId, users.id))
      .leftJoin(reporterUsers, eq(articles.reporterId, reporterUsers.id))
      .where(
        and(
          eq(articles.status, "published"),
          eq(articles.newsType, "breaking"),
          gte(articles.publishedAt, since)
        )
      )
      .orderBy(desc(articles.publishedAt))
      .limit(limit);

    res.json({
      articles: results.map((r) => formatArticleForMobile(r, BASE_URL)),
      count: results.length,
    });
  } catch (error) {
    console.error("[Mobile API] GET /breaking error:", error);
    res.status(500).json({
      error: { code: "SERVER_ERROR", message: "فشل في جلب الأخبار العاجلة", status: 500 },
    });
  }
});

// GET /api/v1/search
router.get("/search", async (req: Request, res: Response) => {
  try {
    const q = (req.query.q as string) || "";
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const offset = parseInt(req.query.offset as string) || 0;

    if (!q.trim()) {
      return res.json({ query: q, articles: [], total: 0, hasMore: false });
    }

    const conditions = [
      eq(articles.status, "published"),
      ilike(articles.title, `%${q}%`),
    ];

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(articles)
      .where(and(...conditions));

    const total = Number(countResult?.count || 0);

    const results = await db
      .select({
        article: articleCardSelect,
        category: { nameAr: categories.nameAr, id: categories.id },
        author: { firstName: users.firstName, lastName: users.lastName },
        reporter: { firstName: reporterUsers.firstName, lastName: reporterUsers.lastName },
      })
      .from(articles)
      .leftJoin(categories, eq(articles.categoryId, categories.id))
      .leftJoin(users, eq(articles.authorId, users.id))
      .leftJoin(reporterUsers, eq(articles.reporterId, reporterUsers.id))
      .where(and(...conditions))
      .orderBy(desc(articles.publishedAt))
      .limit(limit)
      .offset(offset);

    res.json({
      query: q,
      articles: results.map((r) => formatArticleForMobile(r, BASE_URL)),
      total,
      hasMore: offset + limit < total,
    });
  } catch (error) {
    console.error("[Mobile API] GET /search error:", error);
    res.status(500).json({
      error: { code: "SERVER_ERROR", message: "فشل في البحث", status: 500 },
    });
  }
});

// GET /api/v1/trending
router.get("/trending", async (req: Request, res: Response) => {
  try {
    const cacheKey = "mobile:trending";
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
    
    const topArticlesRaw = await db.execute(sql`
      SELECT a.*, c.name_ar AS category_name_ar, c.id AS category_id,
             u.first_name AS author_first_name, u.last_name AS author_last_name
      FROM articles a
      LEFT JOIN categories c ON a.category_id = c.id
      LEFT JOIN users u ON a.author_id = u.id
      WHERE a.status = 'published' AND a.hide_from_homepage = false
        AND a.published_at >= ${cutoff}
      ORDER BY a.views DESC NULLS LAST
      LIMIT 10
    `) as any;
    const topRows: any[] = topArticlesRaw?.rows || topArticlesRaw || [];

    const topArticles = topRows.map((r: any) => ({
      article: {
        id: r.id, title: r.title, subtitle: r.subtitle, slug: r.slug,
        content: r.content, excerpt: r.excerpt, imageUrl: r.image_url,
        thumbnailUrl: r.thumbnail_url, publishedAt: r.published_at ? new Date(r.published_at) : null,
        updatedAt: r.updated_at ? new Date(r.updated_at) : null, newsType: r.news_type,
        isFeatured: r.is_featured, viewsCount: r.views || 0, sharesCount: 0,
      },
      category: { nameAr: r.category_name_ar, id: r.category_id },
      author: { firstName: r.author_first_name, lastName: r.author_last_name },
    }));

    const topTagsRaw = await db.execute(sql`
      SELECT t.name_ar AS "nameAr", count(*) AS count
      FROM article_tags at2
      INNER JOIN tags t ON at2.tag_id = t.id
      INNER JOIN articles a ON at2.article_id = a.id
      WHERE a.status = 'published' AND a.published_at >= ${cutoff}
      GROUP BY t.name_ar
      ORDER BY count DESC
      LIMIT 10
    `) as any;
    const topTags: any[] = topTagsRaw?.rows || topTagsRaw || [];

    const result = {
      articles: topArticles.map((r: any) => formatArticleForMobile(r, BASE_URL)),
      tags: topTags.map((t: any) => t.nameAr),
    };
    setCache(cacheKey, result, 10 * 60 * 1000);
    res.json(result);
  } catch (error) {
    console.error("[Mobile API] GET /trending error:", error);
    res.status(500).json({
      error: { code: "SERVER_ERROR", message: "فشل في جلب الأكثر تداولاً", status: 500 },
    });
  }
});

const COUNTRY_MAP: Record<string, { name_ar: string; name_en: string }> = {
  saudi_arabia: { name_ar: "السعودية", name_en: "Saudi Arabia" },
  uae: { name_ar: "الإمارات", name_en: "UAE" },
  bahrain: { name_ar: "البحرين", name_en: "Bahrain" },
  kuwait: { name_ar: "الكويت", name_en: "Kuwait" },
  qatar: { name_ar: "قطر", name_en: "Qatar" },
  oman: { name_ar: "عُمان", name_en: "Oman" },
  yemen: { name_ar: "اليمن", name_en: "Yemen" },
};

const EVENT_TYPE_MAP: Record<string, { label_ar: string; label_en: string; severity: string }> = {
  drone_intercepted: { label_ar: "صد مسيّرة", label_en: "Drone Intercepted", severity: "success" },
  ballistic_intercepted: { label_ar: "صد صاروخ باليستي", label_en: "Ballistic Intercepted", severity: "success" },
  cruise_intercepted: { label_ar: "صد صاروخ كروز", label_en: "Cruise Intercepted", severity: "success" },
  ballistic_and_drone: { label_ar: "صد صاروخ باليستي ومسيّرة", label_en: "Ballistic & Drone Intercepted", severity: "success" },
  debris_fallen: { label_ar: "سقوط شظايا", label_en: "Debris Fallen", severity: "warning" },
  no_damage: { label_ar: "لا أضرار", label_en: "No Damage", severity: "info" },
  injuries: { label_ar: "إصابات", label_en: "Injuries", severity: "danger" },
  martyrdom: { label_ar: "استشهاد", label_en: "Martyrdom", severity: "critical" },
  official_statement: { label_ar: "بيان رسمي", label_en: "Official Statement", severity: "info" },
  official_comment: { label_ar: "تصريح مسؤول", label_en: "Official Comment", severity: "info" },
  military_action: { label_ar: "تحرك عسكري", label_en: "Military Action", severity: "danger" },
  international_condemnation: { label_ar: "إدانة دولية", label_en: "International Condemnation", severity: "info" },
};

const SOURCE_MAP: Record<string, { label_ar: string; label_en: string }> = {
  official_statement: { label_ar: "بيان رسمي", label_en: "Official Statement" },
  official_news_agency: { label_ar: "وكالة أنباء رسمية", label_en: "Official News Agency" },
  sabq_correspondent: { label_ar: "مراسل سبق", label_en: "Sabq Correspondent" },
  international_agencies: { label_ar: "وكالات دولية", label_en: "International Agencies" },
  informed_sources: { label_ar: "مصادر مطلعة", label_en: "Informed Sources" },
  other: { label_ar: "مصدر آخر", label_en: "Other" },
};

function formatGulfEvent(e: any) {
  return {
    id: e.id,
    content: e.content,
    country: e.country,
    country_name_ar: COUNTRY_MAP[e.country]?.name_ar || e.country,
    country_name_en: COUNTRY_MAP[e.country]?.name_en || e.country,
    event_type: e.eventType,
    event_type_label_ar: EVENT_TYPE_MAP[e.eventType]?.label_ar || e.eventType,
    event_type_label_en: EVENT_TYPE_MAP[e.eventType]?.label_en || e.eventType,
    severity: EVENT_TYPE_MAP[e.eventType]?.severity || "info",
    priority: e.priority,
    source_type: e.sourceType,
    source_type_label_ar: SOURCE_MAP[e.sourceType]?.label_ar || e.sourceType,
    source_type_label_en: SOURCE_MAP[e.sourceType]?.label_en || e.sourceType,
    source_name: e.sourceName,
    is_pinned: e.isPinned || false,
    is_update: e.isUpdate || false,
    parent_event_id: e.parentEventId || null,
    published_at: e.publishedAt?.toISOString() || null,
    edited_at: e.editedAt?.toISOString() || null,
    created_at: e.createdAt?.toISOString() || null,
  };
}

// GET /api/v1/live - Full live coverage feed with timeline, filters, and stats
router.get("/live", async (req: Request, res: Response) => {
  try {
    const { country, limit: qLimit, offset: qOffset, since } = req.query;
    const lim = Math.min(parseInt(qLimit as string) || 50, 200);
    const off = parseInt(qOffset as string) || 0;

    const conditions = [eq(gulfEvents.status, "published")];
    if (country && country !== "all") {
      conditions.push(eq(gulfEvents.country, country as string));
    }
    if (since) {
      const sinceDate = new Date(since as string);
      if (!isNaN(sinceDate.getTime())) {
        conditions.push(sql`${gulfEvents.publishedAt} > ${sinceDate}`);
      }
    }

    const [events, countResult, statsRows] = await Promise.all([
      db.select()
        .from(gulfEvents)
        .where(and(...conditions))
        .orderBy(desc(gulfEvents.isPinned), desc(gulfEvents.publishedAt))
        .limit(lim)
        .offset(off),
      db.select({ count: sql<number>`count(*)` })
        .from(gulfEvents)
        .where(and(...conditions)),
      db.select({
        country: gulfEvents.country,
        eventType: gulfEvents.eventType,
        count: sql<number>`count(*)`,
      })
        .from(gulfEvents)
        .where(eq(gulfEvents.status, "published"))
        .groupBy(gulfEvents.country, gulfEvents.eventType),
    ]);

    let totalAttacks = 0;
    let intercepted = 0;
    let injuries = 0;
    let martyrdom = 0;
    const byCountry: Record<string, number> = {};
    for (const row of statsRows) {
      const c = Number(row.count);
      totalAttacks += c;
      byCountry[row.country] = (byCountry[row.country] || 0) + c;
      if (["drone_intercepted", "ballistic_intercepted", "cruise_intercepted", "ballistic_and_drone"].includes(row.eventType)) intercepted += c;
      if (row.eventType === "injuries") injuries += c;
      if (row.eventType === "martyrdom") martyrdom += c;
    }

    const timelineMap = new Map<string, any[]>();
    const formatted = events.map(formatGulfEvent);
    for (const e of formatted) {
      if (!e.published_at) continue;
      const dateKey = new Date(e.published_at).toISOString().slice(0, 10);
      if (!timelineMap.has(dateKey)) timelineMap.set(dateKey, []);
      timelineMap.get(dateKey)!.push(e);
    }
    const timeline = Array.from(timelineMap.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, events]) => ({ date, events }));

    const countries = Object.entries(COUNTRY_MAP).map(([key, val]) => ({
      key,
      name_ar: val.name_ar,
      name_en: val.name_en,
      count: byCountry[key] || 0,
    }));

    res.json({
      title_ar: "البث الحي — الاعتداءات على دول الخليج",
      title_en: "Live Coverage — Attacks on Gulf States",
      is_live: true,
      stats: { total_events: totalAttacks, intercepted, injuries, martyrdom, by_country: byCountry },
      countries,
      event_types: Object.entries(EVENT_TYPE_MAP).map(([key, val]) => ({
        key,
        label_ar: val.label_ar,
        label_en: val.label_en,
        severity: val.severity,
      })),
      timeline,
      events: formatted,
      total: Number(countResult[0]?.count || 0),
      limit: lim,
      offset: off,
      has_more: off + lim < Number(countResult[0]?.count || 0),
    });
  } catch (error) {
    console.error("[Mobile API] GET /live error:", error);
    res.status(500).json({
      error: { code: "SERVER_ERROR", message: "فشل في جلب التغطيات المباشرة", status: 500 },
    });
  }
});

// GET /api/v1/live/stats - Summary statistics only (lightweight)
// IMPORTANT: Must be registered before /live/:id to avoid "stats" matching as :id
router.get("/live/stats", async (_req: Request, res: Response) => {
  try {
    const statsRows = await db.select({
      country: gulfEvents.country,
      eventType: gulfEvents.eventType,
      count: sql<number>`count(*)`,
    })
      .from(gulfEvents)
      .where(eq(gulfEvents.status, "published"))
      .groupBy(gulfEvents.country, gulfEvents.eventType);

    let totalAttacks = 0;
    let intercepted = 0;
    let droneIntercepted = 0;
    let ballisticIntercepted = 0;
    let cruiseIntercepted = 0;
    let debris = 0;
    let injuries = 0;
    let martyrdom = 0;
    const byCountry: Record<string, number> = {};

    for (const row of statsRows) {
      const c = Number(row.count);
      totalAttacks += c;
      byCountry[row.country] = (byCountry[row.country] || 0) + c;
      if (["drone_intercepted", "ballistic_intercepted", "cruise_intercepted", "ballistic_and_drone"].includes(row.eventType)) intercepted += c;
      if (row.eventType === "drone_intercepted") droneIntercepted += c;
      if (row.eventType === "ballistic_intercepted") ballisticIntercepted += c;
      if (row.eventType === "cruise_intercepted") cruiseIntercepted += c;
      if (row.eventType === "ballistic_and_drone") { ballisticIntercepted += c; droneIntercepted += c; }
      if (row.eventType === "debris_fallen") debris += c;
      if (row.eventType === "injuries") injuries += c;
      if (row.eventType === "martyrdom") martyrdom += c;
    }

    const [latestEvent] = await db.select()
      .from(gulfEvents)
      .where(eq(gulfEvents.status, "published"))
      .orderBy(desc(gulfEvents.publishedAt))
      .limit(1);

    res.json({
      total_events: totalAttacks,
      intercepted,
      drone_intercepted: droneIntercepted,
      ballistic_intercepted: ballisticIntercepted,
      cruise_intercepted: cruiseIntercepted,
      debris,
      injuries,
      martyrdom,
      by_country: byCountry,
      last_updated: latestEvent?.publishedAt?.toISOString() || null,
    });
  } catch (error) {
    console.error("[Mobile API] GET /live/stats error:", error);
    res.status(500).json({
      error: { code: "SERVER_ERROR", message: "فشل في جلب الإحصائيات", status: 500 },
    });
  }
});

// GET /api/v1/live/:id - Event detail with updates (child events)
router.get("/live/:id", async (req: Request, res: Response) => {
  try {
    const [event] = await db.select()
      .from(gulfEvents)
      .where(and(eq(gulfEvents.id, req.params.id), eq(gulfEvents.status, "published")))
      .limit(1);

    if (!event) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "الحدث غير موجود", status: 404 },
      });
    }

    const updates = await db.select()
      .from(gulfEvents)
      .where(and(eq(gulfEvents.parentEventId, event.id), eq(gulfEvents.status, "published")))
      .orderBy(desc(gulfEvents.publishedAt));

    res.json({
      event: formatGulfEvent(event),
      updates: updates.map(formatGulfEvent),
      updates_count: updates.length,
    });
  } catch (error) {
    console.error("[Mobile API] GET /live/:id error:", error);
    res.status(500).json({
      error: { code: "SERVER_ERROR", message: "فشل في جلب تفاصيل الحدث", status: 500 },
    });
  }
});

// PUT /api/v1/devices/:token/preferences
router.put("/devices/:token/preferences", async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const [device] = await db
      .select()
      .from(pushDevices)
      .where(eq(pushDevices.deviceToken, token))
      .limit(1);

    if (!device) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "الجهاز غير مسجل", status: 404 },
      });
    }

    await db
      .update(pushDevices)
      .set({ lastActiveAt: new Date(), updatedAt: new Date() })
      .where(eq(pushDevices.deviceToken, token));

    res.json({ success: true, message: "تم تحديث التفضيلات" });
  } catch (error) {
    console.error("[Mobile API] PUT /devices/:token/preferences error:", error);
    res.status(500).json({
      error: { code: "SERVER_ERROR", message: "فشل في تحديث التفضيلات", status: 500 },
    });
  }
});

// GET /api/v1/roles - List all available roles with Arabic/English labels
router.get("/roles", async (_req: Request, res: Response) => {
  try {
    const { ROLE_NAMES, ROLE_LABELS_AR, ROLE_LABELS_EN, ROLE_DESCRIPTIONS_AR } = await import("../../shared/rbac-constants");

    const roles = Object.values(ROLE_NAMES).map((key) => ({
      key,
      name_ar: (ROLE_LABELS_AR as Record<string, string>)[key] || key,
      name_en: (ROLE_LABELS_EN as Record<string, string>)[key] || key,
      description_ar: (ROLE_DESCRIPTIONS_AR as Record<string, string>)[key] || "",
    }));

    res.json({ roles });
  } catch (error) {
    console.error("[Mobile API] GET /roles error:", error);
    res.status(500).json({
      error: { code: "SERVER_ERROR", message: "فشل في جلب الأدوار", status: 500 },
    });
  }
});

// GET /api/v1/homepage (combined feed)
router.get("/homepage", async (req: Request, res: Response) => {
  try {
    const cacheKey = "mobile:homepage";
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const heroArticles = await db
      .select({
        article: articleCardSelect,
        category: { nameAr: categories.nameAr, id: categories.id },
        author: { firstName: users.firstName, lastName: users.lastName },
        reporter: { firstName: reporterUsers.firstName, lastName: reporterUsers.lastName },
      })
      .from(articles)
      .leftJoin(categories, eq(articles.categoryId, categories.id))
      .leftJoin(users, eq(articles.authorId, users.id))
      .leftJoin(reporterUsers, eq(articles.reporterId, reporterUsers.id))
      .where(
        and(
          eq(articles.status, "published"),
          eq(articles.hideFromHomepage, false),
          eq(articles.isFeatured, true)
        )
      )
      .orderBy(desc(articles.publishedAt))
      .limit(5);

    const latestArticles = await db
      .select({
        article: articleCardSelect,
        category: { nameAr: categories.nameAr, id: categories.id },
        author: { firstName: users.firstName, lastName: users.lastName },
        reporter: { firstName: reporterUsers.firstName, lastName: reporterUsers.lastName },
      })
      .from(articles)
      .leftJoin(categories, eq(articles.categoryId, categories.id))
      .leftJoin(users, eq(articles.authorId, users.id))
      .leftJoin(reporterUsers, eq(articles.reporterId, reporterUsers.id))
      .where(
        and(
          eq(articles.status, "published"),
          eq(articles.hideFromHomepage, false)
        )
      )
      .orderBy(desc(articles.publishedAt))
      .limit(20);

    const breakingArticles = await db
      .select({
        article: articleCardSelect,
        category: { nameAr: categories.nameAr, id: categories.id },
        author: { firstName: users.firstName, lastName: users.lastName },
        reporter: { firstName: reporterUsers.firstName, lastName: reporterUsers.lastName },
      })
      .from(articles)
      .leftJoin(categories, eq(articles.categoryId, categories.id))
      .leftJoin(users, eq(articles.authorId, users.id))
      .leftJoin(reporterUsers, eq(articles.reporterId, reporterUsers.id))
      .where(
        and(
          eq(articles.status, "published"),
          eq(articles.newsType, "breaking"),
          gte(articles.publishedAt, new Date(Date.now() - 24 * 60 * 60 * 1000))
        )
      )
      .orderBy(desc(articles.publishedAt))
      .limit(10);

    const result = {
      hero: heroArticles.map((r) => formatArticleForMobile(r, BASE_URL)),
      latest: latestArticles.map((r) => formatArticleForMobile(r, BASE_URL)),
      breaking: breakingArticles.map((r) => formatArticleForMobile(r, BASE_URL)),
    };
    setCache(cacheKey, result, 2 * 60 * 1000);
    res.json(result);
  } catch (error) {
    console.error("[Mobile API] GET /homepage error:", error);
    res.status(500).json({
      error: { code: "SERVER_ERROR", message: "فشل في جلب الصفحة الرئيسية", status: 500 },
    });
  }
});

// ============================================================================
// COMMENTS — v1 mobile endpoints
//
// Background: the existing public `/api/articles/:slug/comments` POST relies
// on Passport's session cookie via `isAuthenticated`. Mobile auth uses a
// separate Bearer token (`appMemberSessions` table) that Passport doesn't
// know about, so the existing route returns 401 for app users. These v1
// endpoints mirror the public surface but authenticate via
// `verifyMemberSession` and write to the same `comments` table.
// ============================================================================

router.get("/articles/:slug/comments", async (req: Request, res: Response) => {
  try {
    const slug = req.params.slug;
    const [article] = await db
      .select({ id: articles.id })
      .from(articles)
      .where(eq(articles.slug, slug))
      .limit(1);

    if (!article) {
      return res.status(404).json({ success: false, message: "Article not found" });
    }

    // Public view: approved comments only. Threading is one level deep —
    // top-level rows carry their replies inline, matching what the web's
    // `storage.getCommentsByArticle` produces.
    const rows = await db
      .select({
        comment: comments,
        user: {
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          profileImageUrl: users.profileImageUrl,
        },
      })
      .from(comments)
      .leftJoin(users, eq(comments.userId, users.id))
      .where(and(eq(comments.articleId, article.id), eq(comments.status, "approved")))
      .orderBy(comments.createdAt);

    type CommentNode = (typeof rows)[number]["comment"] & {
      user: (typeof rows)[number]["user"];
      replies: CommentNode[];
    };

    const nodes = new Map<string, CommentNode>();
    const topLevel: CommentNode[] = [];
    for (const r of rows) {
      nodes.set(r.comment.id, { ...r.comment, user: r.user, replies: [] });
    }
    for (const r of rows) {
      const node = nodes.get(r.comment.id)!;
      if (r.comment.parentId) {
        const parent = nodes.get(r.comment.parentId);
        if (parent) parent.replies.push(node);
        else topLevel.push(node);
      } else {
        topLevel.push(node);
      }
    }

    res.json(topLevel);
  } catch (error) {
    console.error("[Mobile API] GET /articles/:slug/comments error:", error);
    res.status(500).json({ success: false, message: "فشل في جلب التعليقات" });
  }
});

router.post("/articles/:slug/comments", async (req: Request, res: Response) => {
  try {
    const session = await verifyMemberSession(req);
    if (!session) {
      return res.status(401).json({ success: false, message: "غير مصرح" });
    }

    const slug = req.params.slug;
    const [article] = await db
      .select({ id: articles.id, slug: articles.slug, englishSlug: articles.englishSlug })
      .from(articles)
      .where(eq(articles.slug, slug))
      .limit(1);

    if (!article) {
      return res.status(404).json({ success: false, message: "Article not found" });
    }

    const parsed = insertCommentSchema.safeParse({
      ...req.body,
      articleId: article.id,
      userId: session.userId,
    });
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Invalid comment data" });
    }

    // Mirror the public route: pre-flight suspicious-words check forces a
    // "pending" hold so AI moderation can't accidentally auto-approve a known
    // bad pattern even if it scores "safe".
    const { checkTextForSuspiciousWords, incrementSuspiciousWordFlagCount } =
      await import("../utils/suspiciousWordsChecker");
    const suspiciousCheck = await checkTextForSuspiciousWords(parsed.data.content);
    const blockedBySuspiciousWords = suspiciousCheck.hasSuspiciousWords;

    const [created] = await db.insert(comments).values(parsed.data).returning();

    if (blockedBySuspiciousWords && suspiciousCheck.foundWords.length > 0) {
      const foundWordsStr = suspiciousCheck.foundWords.map((w) => w.word).join(", ");
      const wordIds = suspiciousCheck.foundWords.map((w) => w.wordId);
      await db
        .update(comments)
        .set({
          status: "pending",
          moderationReason: `يحتوي على كلمات مشبوهة: ${foundWordsStr}`,
        })
        .where(eq(comments.id, created.id));
      await incrementSuspiciousWordFlagCount(wordIds);
    }

    // Fire-and-forget AI moderation. The status the mobile client receives
    // here will be the initial DB default ("pending"); the AI job flips it to
    // approved/rejected within a few seconds and the next list refresh shows
    // the final state.
    const commentId = created.id;
    const commentContent = created.content;
    void (async () => {
      try {
        const { moderateComment, getStatusFromClassification } = await import(
          "../ai/commentModeration"
        );
        const moderationResult = await moderateComment(commentContent);
        const aiStatus = getStatusFromClassification(moderationResult.classification);
        const newStatus = blockedBySuspiciousWords ? "pending" : aiStatus;
        await db
          .update(comments)
          .set({
            aiModerationScore: moderationResult.score,
            aiClassification: moderationResult.classification,
            aiDetectedIssues: moderationResult.detected,
            aiModerationReason: moderationResult.reason,
            aiAnalyzedAt: new Date(),
            ...(newStatus !== "pending"
              ? {
                  status: newStatus,
                  moderatedAt: new Date(),
                  moderationReason:
                    moderationResult.classification === "safe"
                      ? "تم الاعتماد تلقائياً بواسطة الذكاء الاصطناعي"
                      : `تم الرفض تلقائياً - ${moderationResult.reason}`,
                }
              : {}),
          })
          .where(eq(comments.id, commentId));
      } catch (error) {
        console.error("[Mobile API] AI moderation failed:", error);
      }
    })();

    // Hydrate the user so the iOS decoder can fill `userName` / `userAvatar`
    // without a second round-trip.
    const [user] = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        profileImageUrl: users.profileImageUrl,
      })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);

    // Read the row back so the response reflects any sync status mutation
    // (suspicious-words hold) that happened after the initial insert.
    const [finalRow] = await db
      .select()
      .from(comments)
      .where(eq(comments.id, created.id))
      .limit(1);

    res.json({ ...finalRow, user, replies: [] });
  } catch (error) {
    console.error("[Mobile API] POST /articles/:slug/comments error:", error);
    res.status(500).json({ success: false, message: "فشل في إنشاء التعليق" });
  }
});

export default router;
