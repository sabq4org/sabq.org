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

import { Router, Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { userHasAnyRole } from "../rbac";
import { invalidateAllUserSessions } from "../auth";
import { verifyToken, verifyBackupCode } from "../twoFactor";
import { createTwoFactorChallenge, resolveTwoFactorChallenge, consumeTwoFactorChallenge } from "../services/mobileTwoFactorChallenge";
import { recordFailure, isLockedOut, clearFailures } from "../services/authAttemptGuard";
import {
  canSelfAssignSchedule,
  getWriterDayLoads,
  getWriterScheduleBanner,
  selfAssignWriterSchedule,
} from "../services/opinionWritersService";
import {
  coachWriterIdea,
  generateWriterIdeas,
  getOpinionAuthorWorkspace,
  getWriterStyleProfile,
  reviewWriterArticle,
} from "../services/opinionAuthorWorkspaceService";
import { db, pool } from "../db";
import { log } from "../utils/logger";
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
  readingHistory,
  reactions,
  userLoyaltyEvents,
  userPointsTotal,
  bookmarks,
  socialFollows,
  articleDailyStats,
  contactMessages,
  contactMessageReplies,
  opinionTickets,
  opinionTicketMessages,
  canUserLogin,
} from "@shared/schema";
import { eq, sql, and, gt, gte, lt, desc, asc, or, ne, ilike, aliasedTable, inArray, isNull } from "drizzle-orm";

// Aliased users join target so we can pull both authorId (the staff member who
// entered the article) AND reporterId (the actual byline) in the same query.
// The byline shown to readers must always be the reporter when one is set.
const reporterUsers = aliasedTable(users, "reporter_user");
// Separate alias for the opinion author (articles.authorId) in the editor detail.
const authorUsers = aliasedTable(users, "author_user");
// Used when returning the sender of a reply to an admin contact message.
const contactReplyUsers = aliasedTable(users, "contact_reply_user");
import { articleCardSelect } from "../selectHelpers";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { cfKeyGenerator, cfValidate } from "../utils/rateLimiting";
import { validatePassword } from "../utils/passwordPolicy";
import { sendEmailNotification } from "../services/email";
import { cloudflareImagesService } from "../services/cloudflareImagesService";
import { newsImageStorageService } from "../services/newsImageStorageService";
import { summarizeText } from "../ai-content-tools";
import { generateSeoMetadata } from "../seo-generator";
import { summarizeArticle, generateSmartContent } from "../openai";
import { analyzeAndEditWithSabqStyle } from "../ai/contentAnalyzer";
import { classifyArticle } from "../ai-classifier";
import { generateAndUploadImage } from "../services/nanoBananaService";
import { autoGenerateImage } from "../services/autoImageGenerationService";
import { notifyArticleStakeholders } from "../services/editorialNotifications";
import { bufferArticleViewIncrement } from "../services/articleViewCounterService";
import { invalidateArticleWrite } from "../services/contentInvalidation";
import { notifySearchEngines } from "../indexNow";
import oauthMobileRouter from "./v1/oauthMobile";
import { isWorldCupConfigured } from "../services/worldCupService";
import {
  submitPrediction,
  getMyPredictions,
  getLeaderboard,
  getLeaderboardMeta as getWcLeaderboardMeta,
  getUpcomingPredictableMatches,
  getMatchPredictionsSummary,
} from "../services/wcPredictionsService";
import {
  getWcLongPredictions,
  submitWcLongPrediction,
  type WcLongKind,
} from "../services/wcLongPredictionsService";
import { isGcPredictionsEnabled } from "../services/gcFeatureFlags";
import {
  createMajlis as gcCreateMajlis,
  joinMajlis as gcJoinMajlis,
  leaveMajlis as gcLeaveMajlis,
  getMyMajalis as gcGetMyMajalis,
  getMajlisLeaderboard as gcGetMajlisLeaderboard,
} from "../services/gcMajlisService";
import {
  getMajlisChampionPicks as gcGetMajlisChampionPicks,
  getMajlisFantasy as gcGetMajlisFantasy,
  getMajlisHarvest as gcGetMajlisHarvest,
  getMajlisInvitePreview as gcGetMajlisInvitePreview,
  getMajlisMatchday as gcGetMajlisMatchday,
  getMajlisNotificationPreference as gcGetMajlisNotificationPreference,
  setMajlisNotificationPreference as gcSetMajlisNotificationPreference,
} from "../services/gcMajlisSocialService";
import {
  actOnMajlisDuel as gcActOnMajlisDuel,
  createMajlisDuel as gcCreateMajlisDuel,
  listMajlisDuels as gcListMajlisDuels,
} from "../services/gcDuelsService";
import {
  getFantasyPool as gcGetFantasyPool,
  getMyFantasy as gcGetMyFantasy,
  saveFantasySquad as gcSaveFantasySquad,
  getFantasyLeaderboard as gcGetFantasyLeaderboard,
  FANTASY_BUDGET as GC_FANTASY_BUDGET,
  FANTASY_SQUAD_SIZE as GC_FANTASY_SQUAD_SIZE,
} from "../services/gcFantasyService";
import { getMotmBoard as gcGetMotmBoard, voteMotm as gcVoteMotm } from "../services/gcMotmService";
import { resolveGenericDeviceRegistrationPolicy } from "../services/deviceRegistrationPolicy";

const router = Router();

// Mount OAuth mobile endpoints (POST /auth/google, /auth/apple)
router.use(oauthMobileRouter);

// ==========================================
// Mobile role payload helper
// ==========================================
//
// Build the role/roles/roleLabel/jobTitle bundle the iOS APIUser
// decoder expects, so /auth/login, /auth/register, AND /members/profile
// can ALL return it. Previously only /members/profile returned RBAC
// roles — the login response shipped a bare user object without `role`,
// `roles`, `roleLabel`, or `jobTitle`, which meant the freshly-logged-in
// iOS user saw "قارئ" until the async /members/profile call returned
// (and "قارئ" stayed permanently if that call ever failed transiently).
// Surfacing the full role bundle on login + register fixes the
// "writer shows as reader in the iOS app" bug.
//
// Returns the same shape used in the /members/profile response so the
// three endpoints stay in lockstep.
const MOBILE_ROLE_LABELS: Record<string, string> = {
  system_admin: "مدير النظام",
  admin: "مسؤول",
  editor: "محرر",
  editor_in_chief: "رئيس التحرير",
  senior_editor: "محرر أول",
  reporter: "مراسل",
  correspondent: "مراسل",
  journalist: "صحفي",
  writer: "كاتب",
  author: "كاتب",
  article_writer: "كاتب مقال",
  article_author: "كاتب مقال",
  opinion_author: "كاتب مقال رأي",
  columnist: "كاتب عمود",
  managing_editor: "مدير تحرير",
  editorial_manager: "مدير تحرير",
  content_manager: "مدير محتوى",
  comments_moderator: "مشرف تعليقات",
  moderator: "مشرف",
  media_manager: "مدير وسائط",
  publisher: "ناشر",
  photographer: "مصور",
  contributor: "مساهم",
  reader: "قارئ",
};

const normalizeRoleKey = (value?: string | null) =>
  value?.trim().toLowerCase().replace(/\s+/g, "_") || "";

async function buildUserRolePayload(userId: string, legacyRole?: string | null, jobTitle?: string | null) {
  const rbacRoles = await db
    .select({ name: roles.name, nameAr: roles.nameAr })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(userRoles.userId, userId));

  const nonReaderRbacRole = rbacRoles.find((r) => normalizeRoleKey(r.name) !== "reader");
  const legacyKey = normalizeRoleKey(legacyRole);
  const effectiveRoleKey = normalizeRoleKey(nonReaderRbacRole?.name) || legacyKey || "reader";
  const explicitRoleLabel =
    nonReaderRbacRole?.nameAr ||
    (jobTitle?.trim() ? jobTitle.trim() : null) ||
    MOBILE_ROLE_LABELS[effectiveRoleKey] ||
    legacyRole ||
    "قارئ";

  return {
    role: effectiveRoleKey,
    roleLabel: explicitRoleLabel,
    membershipLabel: explicitRoleLabel,
    roles: rbacRoles.map((r) => ({ key: r.name, displayName: r.nameAr })),
  };
}

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
    bufferArticleViewIncrement(articleId, randomBoost);

    // Per-view analytics line — very high frequency. Gate behind debug so it
    // no longer floods production logs (set LOG_VERBOSE=1 to re-enable).
    log.debug(`[Mobile API] View tracked: article=${articleId}, platform=${platform}, device=${deviceId || 'unknown'}, version=${appVersion || 'unknown'}`);

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
    const failCount = invalidCount;

    if (aggregatedViews.size > 0) {
      for (const [id, totalBoost] of aggregatedViews) {
        bufferArticleViewIncrement(id, totalBoost);
      }
      successCount = viewsToProcess.length - invalidCount;
      log.debug(`[Mobile API] Batch view buffered ${aggregatedViews.size} unique articles (${successCount} views)`);
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
      bundleId, // معرّف الحزمة (apns-topic) لتوجيه التطبيقات المتعددة
      installationId, // IDFV — يوحّد سبق وفارا على نفس الجهاز
    } = req.body;

    // userId from the public body is intentionally ignored. Ownership comes
    // exclusively from a valid mobile Bearer session below.
    const safeInstallationId =
      typeof installationId === "string" && installationId.length > 0 && installationId.length <= 128
        ? installationId
        : undefined;

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
    const session = await verifyMemberSession(req);
    const basePolicy = resolveGenericDeviceRegistrationPolicy({
      sessionUserId: session?.userId,
      untrustedBodyUserId: req.body?.userId,
      requestedBundleId: bundleId,
    });
    const effectiveUserId = basePolicy.effectiveUserId;
    const safeBundleId = basePolicy.safeBundleId;

    // Keep one active token per user/platform/app bundle. APNs tokens can
    // rotate across reinstalls or restores; if we leave the old rows active,
    // the same sports alert can fan out as duplicate banners on iOS.
    if (effectiveUserId && safeInstallationId) {
      // Token rotation belongs to one installation. Never deactivate another
      // phone merely because it serves the same user/platform/bundle.
      const deactivated = await db
        .update(pushDevices)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(
          eq(pushDevices.userId, effectiveUserId),
          eq(pushDevices.platform, platform),
          sql`${pushDevices.bundleId} IS NOT DISTINCT FROM ${safeBundleId ?? null}`,
          eq(pushDevices.installationId, safeInstallationId),
          sql`${pushDevices.deviceToken} != ${finalToken}`,
          eq(pushDevices.isActive, true)
        ))
        .returning({ id: pushDevices.id });

      if (deactivated.length > 0) {
        console.log(`[Mobile API] Deactivated ${deactivated.length} old tokens for user ${effectiveUserId}`);
      }
    }

    // Check if device already exists
    const [existing] = await db
      .select()
      .from(pushDevices)
      .where(eq(pushDevices.deviceToken, finalToken))
      .limit(1);

    if (existing) {
      const policy = resolveGenericDeviceRegistrationPolicy({
        sessionUserId: session?.userId,
        untrustedBodyUserId: req.body?.userId,
        requestedBundleId: bundleId,
        existingBundleId: existing.bundleId,
      });
      // Update existing device
      const updatePayload: Record<string, unknown> = {
          // Explicit null is privacy-critical on logout → guest transition.
          userId: policy.effectiveUserId,
          tokenProvider,
          platform,
          deviceName,
          osVersion,
          appVersion,
          locale: deviceLocale,
          timezone,
          ...(policy.bundleIdUpdate !== undefined ? { bundleId: policy.bundleIdUpdate } : {}),
          isActive: true,
          lastActiveAt: new Date(),
          updatedAt: new Date(),
      };
      try {
        await db
          .update(pushDevices)
          .set({
            ...updatePayload,
            ...(safeInstallationId ? { installationId: safeInstallationId } : {}),
          } as any)
          .where(eq(pushDevices.deviceToken, finalToken));
      } catch (err: any) {
        // عمود installation_id قد لا يكون مطبّقاً بعد — لا نكسر تسجيل التوكن.
        if (!/installation_id/i.test(String(err?.message ?? err))) throw err;
        console.warn("[Mobile API] devices/register: installation_id missing — updating without it");
        await db
          .update(pushDevices)
          .set(updatePayload as any)
          .where(eq(pushDevices.deviceToken, finalToken));
      }

      console.log(`[Mobile API] Device updated: ${platform} (${tokenProvider}) ${existing.id}`);
      return res.json({ 
        success: true, 
        message: "Device updated",
        deviceId: existing.id
      });
    }

    // Create new device
    const insertPayload = {
        deviceToken: finalToken,
        tokenProvider,
        userId: effectiveUserId,
        platform,
        deviceName,
        osVersion,
        appVersion,
        locale: deviceLocale,
        timezone,
        ...(safeBundleId ? { bundleId: safeBundleId } : {}),
    };
    let newDevice: { id: string };
    try {
      const [row] = await db
        .insert(pushDevices)
        .values({
          ...insertPayload,
          ...(safeInstallationId ? { installationId: safeInstallationId } : {}),
        } as any)
        .returning({ id: pushDevices.id });
      newDevice = row;
    } catch (err: any) {
      if (!/installation_id/i.test(String(err?.message ?? err))) throw err;
      console.warn("[Mobile API] devices/register: installation_id missing — inserting without it");
      const [row] = await db
        .insert(pushDevices)
        .values(insertPayload as any)
        .returning({ id: pushDevices.id });
      newDevice = row;
    }

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

// Brute-force limiter for the account-activation / email-verification endpoints
// (defined here so it precedes /auth/activate below; audit #4/#10).
const mobileActivationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: cfKeyGenerator,
  validate: cfValidate,
  message: { success: false, message: "محاولات كثيرة جدًا. حاول لاحقًا." },
});

// Helper: Generate 6-digit verification code.
// Uses a CSPRNG (crypto.randomInt) — Math.random is predictable/seedable and must
// never back a password-reset or email-verification code (security audit S-04:
// weak reset code). randomInt(100000, 1000000) is a uniform 6-digit value.
function generateVerificationCode(): string {
  return crypto.randomInt(100000, 1000000).toString();
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
  
  // SECURITY: the account's CURRENT status is part of session validity.
  //
  // This lookup used to touch `app_member_sessions` only, so banning, deleting
  // or demoting an account changed nothing for anyone already holding a mobile
  // token — they kept full /api/v1 access, including the admin endpoints, for
  // the remaining life of the session (up to 30 days). Moderation and
  // offboarding were effectively advisory on mobile.
  //
  // Joined into the same query — no extra round trip on a path that runs for
  // every mobile request — and the rule itself is reused from shared/schema.ts
  // rather than re-implemented, so temporary bans that have expired still work.
  const [session] = await db
    .select({
      userId: appMemberSessions.memberId,
      lastUsedAt: appMemberSessions.lastUsedAt,
      status: users.status,
      bannedUntil: users.bannedUntil,
      deletedAt: users.deletedAt,
    })
    .from(appMemberSessions)
    .innerJoin(users, eq(users.id, appMemberSessions.memberId))
    .where(and(
      eq(appMemberSessions.tokenHash, tokenHash),
      eq(appMemberSessions.isActive, true),
      gt(appMemberSessions.expiresAt, new Date())
    ))
    .limit(1);

  if (session && !canUserLogin(session as any)) {
    // Retire the token so the next request doesn't re-run this check, and so
    // the row stops looking live in the sessions dashboard.
    try {
      await db.update(appMemberSessions)
        .set({ isActive: false })
        .where(eq(appMemberSessions.tokenHash, tokenHash));
    } catch (err) {
      console.warn("[auth] failed to retire session for blocked account:", err);
    }
    return null;
  }

  if (session) {
    // خنق كتابة lastUsedAt — مرة كل 5 دقائق للجلسة بدل كتابة لكل طلب،
    // فاستطلاعات الموبايل المتكررة كانت تضغط كتابة دائمة على القاعدة.
    const LAST_USED_WRITE_THROTTLE_MS = 5 * 60 * 1000;
    const lastUsedMs = session.lastUsedAt?.getTime() ?? 0;
    if (Date.now() - lastUsedMs > LAST_USED_WRITE_THROTTLE_MS) {
      try {
        await db.update(appMemberSessions)
          .set({ lastUsedAt: new Date() })
          .where(eq(appMemberSessions.tokenHash, tokenHash));
      } catch (err) {
        console.warn("[auth] lastUsedAt update failed:", err);
      }
    }
    return { userId: session.userId };
  }

  return null;
}

/**
 * Resolve which newsletter subscription the caller owns.
 *
 * The newsletter endpoints used to take a bare `email` and act on whoever
 * owned it — cross-account unsubscription, and a subscriber-enumeration
 * oracle. An address identifies; it does not authenticate. Two accepted
 * proofs, mirroring the web routes:
 *   - `token`: the subscription row's own uuid, which is what the mailed
 *     unsubscribe link carries;
 *   - a valid member session, which may only act on its own address.
 */
async function resolveNewsletterSubscription(req: Request) {
  const { newsletterSubscriptions, users: usersTable } = await import("@shared/schema");

  const token = typeof (req.body as any)?.token === "string"
    ? (req.body as any).token
    : typeof req.query.token === "string"
      ? req.query.token
      : null;

  if (token) {
    const [row] = await db
      .select()
      .from(newsletterSubscriptions)
      .where(eq(newsletterSubscriptions.id, token))
      .limit(1);
    return row ?? null;
  }

  const session = await verifyMemberSession(req);
  if (!session) return null;

  const [member] = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, session.userId))
    .limit(1);
  if (!member?.email) return null;

  const [row] = await db
    .select()
    .from(newsletterSubscriptions)
    .where(eq(newsletterSubscriptions.email, member.email))
    .limit(1);
  return row ?? null;
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
      firstName: rawFirstName,
      lastName: rawLastName,
      name,
      gender,
      city,
      country,
      locale
    } = req.body;

    // iOS conversational signup sends a single `name` field — split it
    // here so the existing firstName/lastName persistence path works
    // without an iOS-side change. If both firstName/lastName were sent
    // (older clients), prefer those.
    let firstName: string | undefined = rawFirstName?.trim() || undefined;
    let lastName: string | undefined = rawLastName?.trim() || undefined;
    if (!firstName && !lastName && typeof name === "string" && name.trim()) {
      const parts = name.trim().split(/\s+/);
      firstName = parts[0];
      lastName = parts.length > 1 ? parts.slice(1).join(" ") : undefined;
    }

    // Validate required fields — السياسة الموحدة (8+ وقائمة الكلمات المسربة).
    const registerPwCheck = validatePassword(password);
    if (!registerPwCheck.ok) {
      return res.status(400).json({
        success: false,
        message: registerPwCheck.message
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

    // Check if phone already exists (if provided) — أي صيغة لنفس الرقم.
    let normalizedRegisterPhone: string | null = null;
    if (phone) {
      const { assertPhoneAvailable } = await import("../services/phoneAuth");
      const phoneCheck = await assertPhoneAvailable(phone);
      if (!phoneCheck.ok) {
        return res.status(409).json({
          success: false,
          message: phoneCheck.message,
        });
      }
      normalizedRegisterPhone = phoneCheck.e164;
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
      phoneNumber: normalizedRegisterPhone,
      gender,
      city: city?.trim(),
      country: country || "SA",
      locale: locale || "ar",
      role: "reader",
      // Auto-activate accounts created via the conversational signup so
      // the iOS client can drop the user straight into the app instead of
      // asking them to switch to Mail. Verification email is still sent
      // (best-effort below) so we have an audit trail of the email
      // belonging to the user, but it no longer gates login.
      status: "active",
      authProvider: "local",
      emailVerified: false,
    });

    // Generate verification token + send activation email (best-effort —
    // failures are logged but don't abort the flow now that status='active').
    const verificationToken = generateVerificationCode();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await db.insert(emailVerificationTokens).values({
      userId,
      token: verificationToken,
      expiresAt,
    });

    const emailSent = await sendMobileActivationEmail(
      email.toLowerCase().trim(),
      verificationToken,
      firstName?.trim()
    );

    // Issue a session token immediately so the iOS register flow can hand
    // the user a logged-in app without a follow-up login round-trip. Same
    // mechanism as `/api/v1/auth/login` — random token, SHA-256-stored on
    // `appMemberSessions`, 30-day expiry.
    const sessionToken = generateSessionToken();
    const tokenHash = crypto.createHash('sha256').update(sessionToken).digest('hex');
    const sessionExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await db.insert(appMemberSessions).values({
      memberId: userId,
      tokenHash,
      deviceInfo: null,
      ipAddress: req.ip || null,
      expiresAt: sessionExpiresAt,
    });

    console.log(`[Mobile API] New user registered + auto-activated: ${userId}, email sent: ${emailSent}`);

    // Mirror the /auth/login response shape so the iOS client sees the
    // same role bundle on register — fresh signups land on the "reader"
    // role, but using the helper keeps the contract identical and
    // future-proofs the response if onboarding ever assigns a writer
    // role at signup time.
    const rolePayload = await buildUserRolePayload(userId, "reader", null);

    res.status(201).json({
      success: true,
      message: "تم إنشاء الحساب بنجاح",
      userId,
      emailSent,
      // Token + expiry mirror the /auth/login shape so the iOS APIClient
      // can reuse its decoder + setAuthToken pipeline.
      token: sessionToken,
      expiresAt: sessionExpiresAt.toISOString(),
      user: {
        id: userId,
        email: email.toLowerCase().trim(),
        firstName: firstName?.trim() ?? null,
        lastName: lastName?.trim() ?? null,
        phone: phone?.trim() ?? null,
        gender: gender ?? null,
        city: city?.trim() ?? null,
        country: country || "SA",
        locale: locale || "ar",
        emailVerified: false,
        phoneVerified: false,
        ...rolePayload,
      },
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
router.post("/auth/activate", mobileActivationLimiter, async (req: Request, res: Response) => {
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
router.post("/auth/resend-activation", mobileActivationLimiter, async (req: Request, res: Response) => {
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
// Bound brute-force on the credential + 2FA endpoints. Keyed by client IP
// (Cloudflare-aware) — an anonymous mitigation until per-account lockout lands.
const mobileAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: cfKeyGenerator,
  validate: cfValidate,
  message: { success: false, message: "محاولات كثيرة جدًا. حاول لاحقًا." },
});

// Mint the real member session + canonical user payload. Shared by the no-2FA
// login path and the post-2FA verify path so both return an identical shape
// (the iOS APIUser decoder depends on it — see buildUserRolePayload).
async function issueMemberSessionResponse(
  req: Request,
  res: Response,
  user: typeof users.$inferSelect,
  deviceInfo: unknown,
) {
  const sessionToken = generateSessionToken();
  const tokenHash = crypto.createHash('sha256').update(sessionToken).digest('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  await db.insert(appMemberSessions).values({
    memberId: user.id,
    tokenHash,
    deviceInfo: deviceInfo || null,
    ipAddress: req.ip || null,
    expiresAt,
  });

  await db.update(users)
    .set({ lastLoginAt: new Date(), lastDeviceInfo: deviceInfo || null })
    .where(eq(users.id, user.id));

  console.log(`[Mobile API] User logged in: ${user.id}`);

  const rolePayload = await buildUserRolePayload(user.id, user.role, user.jobTitle);

  return res.json({
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
      bio: user.bio,
      jobTitle: user.jobTitle,
      department: user.department,
      verificationBadge: user.verificationBadge,
      hasPressCard: user.hasPressCard,
      ...rolePayload,
    },
  });
}

// POST /api/v1/auth/login
// ==========================================
router.post("/auth/login", mobileAuthLimiter, async (req: Request, res: Response) => {
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

    // Per-account lockout on password guessing (audit #4) — bounds brute-force
    // per ACCOUNT even if the IP rate-limiter is bypassed by spoofing client-IP
    // headers against a directly-reachable origin.
    if (await isLockedOut(`login:${user.id}`, 10)) {
      return res.status(429).json({ success: false, message: "محاولات كثيرة جدًا. حاول لاحقًا." });
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      await recordFailure(`login:${user.id}`);
      return res.status(401).json({
        success: false,
        message: "بيانات الدخول غير صحيحة"
      });
    }
    await clearFailures(`login:${user.id}`);

    // 2FA gate — a valid password ALONE must not mint a session when the account
    // has TOTP enabled (security audit S-01: the mobile flow skipped this check
    // entirely, so a leaked password bypassed 2FA on editor/admin accounts).
    // Hand back a short-lived, single-use challenge; the client completes login
    // via POST /auth/verify-2fa with the TOTP or a backup code.
    if (user.twoFactorEnabled) {
      const challengeToken = await createTwoFactorChallenge(user.id);
      return res.status(200).json({
        success: false,
        requires2FA: true,
        challengeToken,
        message: "يرجى إدخال رمز التحقق بخطوتين",
      });
    }

    return issueMemberSessionResponse(req, res, user, deviceInfo);
  } catch (error) {
    console.error("[Mobile API] auth/login error:", error);
    res.status(500).json({ success: false, message: "حدث خطأ في الخادم" });
  }
});

// ==========================================
// POST /api/v1/auth/verify-2fa
// Completes a login that returned requires2FA: exchanges the challenge token +
// a valid TOTP / backup code for a real member session. Mirrors the web
// /api/2fa/verify logic but for the token-based mobile flow.
// ==========================================
router.post("/auth/verify-2fa", mobileAuthLimiter, async (req: Request, res: Response) => {
  try {
    const { challengeToken, token, backupCode, deviceInfo } = req.body ?? {};

    if (!challengeToken) {
      return res.status(400).json({ success: false, message: "رمز الجلسة مطلوب" });
    }
    if (!token && !backupCode) {
      return res.status(400).json({ success: false, message: "رمز التحقق مطلوب" });
    }

    // Peek (do NOT consume yet) so a mistyped code can be retried without being
    // forced back to the password step — the mobileAuthLimiter + 5-min TTL bound
    // brute-force. The challenge is consumed only after a successful check.
    const userId = await resolveTwoFactorChallenge(challengeToken);
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "انتهت صلاحية جلسة التحقق. يرجى تسجيل الدخول من جديد",
      });
    }

    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user || !user.twoFactorEnabled) {
      return res.status(401).json({ success: false, message: "تعذّر التحقق" });
    }

    // Per-account lockout (audit #4): bound online TOTP/backup-code guessing per
    // account, not just per IP — an attacker holding the password can rotate IPs.
    if (await isLockedOut(`2fa:${userId}`, 10)) {
      return res.status(429).json({ success: false, message: "محاولات كثيرة جدًا. حاول لاحقًا." });
    }

    let isValid = false;
    let remainingBackupCodes: string[] | undefined;
    if (backupCode) {
      const result = verifyBackupCode(user.twoFactorBackupCodes || [], backupCode);
      isValid = result.valid;
      remainingBackupCodes = result.remainingCodes;
    } else {
      isValid = verifyToken(user.twoFactorSecret || "", token);
    }

    if (!isValid) {
      // Wrong code: keep the challenge alive for a retry, but count the failure.
      await recordFailure(`2fa:${userId}`);
      return res.status(401).json({ success: false, message: "رمز التحقق غير صحيح" });
    }

    // Success — burn the challenge (single-use), clear the failure counter, and
    // for a backup code persist the remaining set so it can't be reused.
    await consumeTwoFactorChallenge(challengeToken);
    await clearFailures(`2fa:${userId}`);
    if (backupCode && remainingBackupCodes) {
      await db.update(users)
        .set({ twoFactorBackupCodes: remainingBackupCodes })
        .where(eq(users.id, user.id));
    }

    return issueMemberSessionResponse(req, res, user, deviceInfo);
  } catch (error) {
    console.error("[Mobile API] auth/verify-2fa error:", error);
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
router.post("/auth/forgot-password", mobileAuthLimiter, async (req: Request, res: Response) => {
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
        .select({
          id: users.id,
          email: users.email,
          emailVerified: users.emailVerified,
          authProvider: users.authProvider,
        })
        .from(users)
        .where(sql`lower(${users.email}) = ${email.toLowerCase().trim()}`)
        .limit(1);
    } else {
      [user] = await db
        .select({
          id: users.id,
          email: users.email,
          emailVerified: users.emailVerified,
          authProvider: users.authProvider,
        })
        .from(users)
        .where(eq(users.phoneNumber, phone.trim()))
        .limit(1);
    }

    // استجابة واحدة لكل الفروع — لا كشف لوجود الحساب ولا لحالة بريده.
    const genericResponse = {
      success: true,
      message: "إذا كان الحساب موجوداً، سيتم إرسال رمز استعادة كلمة المرور",
      emailSent: true,
    };

    // لا إرسال إلى بريد اصطناعي/مفقود، ولا إلى بريد لم تُثبت ملكيته —
    // وإلا استطاع مالك صندوق البريد الاستيلاء على حساب جوال أدخل بريده خطأً.
    // حسابات authProvider=local بريدها هو هويتها التاريخية فتبقى قابلة للاستعادة.
    const { hasRealEmail } = await import("@shared/authEmail");
    const emailEligible =
      user &&
      hasRealEmail(user.email) &&
      (user.emailVerified || user.authProvider === "local");

    if (!user || !emailEligible) {
      return res.json(genericResponse);
    }

    // Generate reset token
    const resetToken = generateVerificationCode();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    // A new reset request invalidates older unused codes for the same user.
    await db.update(passwordResetTokens)
      .set({ used: true })
      .where(and(
        eq(passwordResetTokens.userId, user.id),
        eq(passwordResetTokens.used, false)
      ));

    // Store reset token
    await db.insert(passwordResetTokens).values({
      userId: user.id,
      token: resetToken,
      expiresAt,
    });

    // Send password reset email
    const emailSent = await sendPasswordResetEmail(user.email!, resetToken);

    console.log(`[Mobile API] Password reset for ${user.id}, email sent: ${emailSent}`);

    res.json(genericResponse);
  } catch (error) {
    console.error("[Mobile API] auth/forgot-password error:", error);
    res.status(500).json({ success: false, message: "حدث خطأ في الخادم" });
  }
});

// ==========================================
// 8. إعادة تعيين كلمة المرور - Reset Password
// POST /api/v1/auth/reset-password
// ==========================================
router.post("/auth/reset-password", mobileAuthLimiter, async (req: Request, res: Response) => {
  try {
    const { userId, email, phone, code, newPassword } = req.body;

    if (!code) {
      return res.status(400).json({ 
        success: false, 
        message: "رمز الاستعادة مطلوب" 
      });
    }

    // سياسة كلمة المرور الموحدة (server/utils/passwordPolicy) — كان هنا فحص
    // 6 أحرف يدوي يتجاوز الحد الأدنى المعتمد (8) وقائمة الكلمات المسربة.
    const resetPwCheck = validatePassword(newPassword);
    if (!resetPwCheck.ok) {
      return res.status(400).json({ success: false, message: resetPwCheck.message });
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
        .where(sql`lower(${users.email}) = ${email.toLowerCase().trim()}`)
        .limit(1);
    } else if (phone) {
      [user] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.phoneNumber, phone.trim()))
        .limit(1);
    }

    if (!user) {
      // نفس رسالة الرمز الخاطئ — 404 «المستخدم غير موجود» كانت كاشفًا لوجود الحسابات.
      return res.status(400).json({
        success: false,
        message: "رمز الاستعادة غير صحيح أو منتهي الصلاحية"
      });
    }

    // Per-account lockout on reset-code guessing — bounds the 6-digit space per
    // account regardless of source IP (audit #4).
    if (await isLockedOut(`reset:${user.id}`, 10)) {
      return res.status(429).json({ success: false, message: "محاولات كثيرة جدًا. حاول لاحقًا." });
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
      await recordFailure(`reset:${user.id}`);
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

    // Kill ALL sessions (web + mobile) so a stolen session can't survive the
    // reset — previously only mobile appMemberSessions were invalidated (audit #8).
    await invalidateAllUserSessions(user.id);
    await clearFailures(`reset:${user.id}`);

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
        bio: users.bio,
        // Legacy single-role column kept for compatibility. The iOS APIUser
        // decoder reads `role` as a fallback when no RBAC roles are returned.
        role: users.role,
        jobTitle: users.jobTitle,
        department: users.department,
        verificationBadge: users.verificationBadge,
        hasPressCard: users.hasPressCard,
        // Drives the "أكمل بياناتك" banner in Settings → defaults to false
        // for accounts created via Apple/Google so the OAuth user is invited
        // to fill in city/bio/gender + pick interests after first login.
        isProfileComplete: users.isProfileComplete,
        // The OAuth login endpoints set this to "apple" or "google" — iOS
        // shows different copy depending on the provider when present.
        authProvider: users.authProvider,
        // نُشتقّ منه hasPassword فقط (لا نُعيده) — يقرّر التطبيق هل يطلب كلمة
        // المرور عند حذف الحساب (Apple/الجوال بلا كلمة مرور).
        passwordHash: users.passwordHash,
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

    // Build the canonical role/roles/roleLabel/jobTitle bundle once via
    // the shared helper — same shape /auth/login and /auth/register now
    // ship, so the iOS APIUser decoder behaves identically across all
    // three endpoints.
    const rolePayload = await buildUserRolePayload(session.userId, user.role, user.jobTitle);

    // Diagnostic: log the resolved role payload so we can confirm a
    // particular user (e.g. malakalhazmi7@gmail.com) actually has the
    // expected RBAC mapping arriving from the backend. Fires on every profile
    // fetch — gate behind debug (set LOG_VERBOSE=1) to keep it for triage.
    log.debug(
      `[Mobile API] /members/profile role data — userId=${session.userId} email=${user.email} legacyRole=${user.role ?? "null"} resolvedRole=${rolePayload.role} rbacRoles=${JSON.stringify(rolePayload.roles)}`
    );

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

    // نستبعد passwordHash من الاستجابة ونُبقي إشارة hasPassword فقط.
    const { passwordHash, ...safeUser } = user;
    res.json({
      success: true,
      user: {
        ...safeUser,
        ...rolePayload,
        phone: user.phoneNumber,
        hasPassword: !!passwordHash,
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
      firstName: rawFirstName,
      lastName: rawLastName,
      name,
      email: rawEmail,
      profileImageUrl,
      gender,
      birthDate,
      bio,
      city,
      country,
      locale
    } = req.body;

    // Accept a single `name` (VARA / phone-signup clients) and split it
    // into firstName/lastName when the split fields weren't sent.
    let firstName: string | undefined =
      typeof rawFirstName === "string" ? rawFirstName.trim() || undefined : undefined;
    let lastName: string | undefined =
      typeof rawLastName === "string" ? rawLastName.trim() || undefined : undefined;
    if (!firstName && !lastName && typeof name === "string" && name.trim()) {
      const parts = name.trim().split(/\s+/);
      firstName = parts[0];
      lastName = parts.length > 1 ? parts.slice(1).join(" ") : undefined;
    }

    // Pull the current name so we know whether the lock applies. The
    // names are write-once: once a non-empty value exists in the row,
    // the column becomes readonly and any later edit is silently
    // ignored. Reasoning: an attacker who briefly takes over an account
    // could otherwise rename it to impersonate a different commenter,
    // turning the comments archive into a deniability laundromat.
    const [currentRow] = await db
      .select({
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
      })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);
    const firstNameLocked = !!currentRow?.firstName?.trim();
    const lastNameLocked = !!currentRow?.lastName?.trim();

    // Build the SET clause from ONLY the keys the client actually sent.
    // The previous implementation destructured every field from req.body,
    // so an iOS profile-edit that only changes `firstName` was effectively
    // sending `{firstName, lastName, profileImageUrl: undefined, gender:
    // undefined, ...}` and overwriting the rest of the columns with NULL.
    // After "save", the user's name became "مستخدم" and avatar disappeared.
    const updates: Record<string, unknown> = {};
    if (typeof firstName === "string" && !firstNameLocked) {
      updates.firstName = firstName.trim();
    }
    if (typeof lastName === "string" && !lastNameLocked) {
      updates.lastName = lastName.trim();
    }
    if (typeof profileImageUrl === "string") updates.profileImageUrl = profileImageUrl.trim();
    if (typeof gender === "string") updates.gender = gender;
    if (birthDate) updates.birthDate = new Date(birthDate);
    if (typeof bio === "string") updates.bio = bio.trim();
    if (typeof city === "string") updates.city = city.trim();
    if (typeof country === "string") updates.country = country.trim();
    if (typeof locale === "string") updates.locale = locale;

    // Allow replacing a synthetic phone email (p966…@phone.sabq.org) with a
    // real address. Real emails stay write-once here — change-email flows
    // that need verification live elsewhere.
    if (typeof rawEmail === "string" && rawEmail.trim()) {
      const { isSyntheticPhoneEmail } = await import("../services/phoneAuth");
      const nextEmail = rawEmail.trim().toLowerCase();
      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail);
      if (!emailOk) {
        return res.status(400).json({
          success: false,
          message: "صيغة البريد الإلكتروني غير صحيحة",
        });
      }
      if (isSyntheticPhoneEmail(nextEmail)) {
        return res.status(400).json({
          success: false,
          message: "أدخل بريداً إلكترونياً حقيقياً",
        });
      }
      const currentIsSynthetic = isSyntheticPhoneEmail(currentRow?.email);
      if (!currentIsSynthetic && currentRow?.email?.trim()) {
        // Already has a real email — ignore silently (same spirit as name lock).
      } else if (nextEmail !== currentRow?.email?.trim().toLowerCase()) {
        // فرادة غير حساسة لحالة الأحرف — تطابق فهرس users_email_lower_unique.
        const [taken] = await db
          .select({ id: users.id })
          .from(users)
          .where(sql`lower(${users.email}) = ${nextEmail}`)
          .limit(1);
        if (taken && taken.id !== session.userId) {
          return res.status(409).json({
            success: false,
            message: "هذا البريد مستخدم بالفعل",
          });
        }
        updates.email = nextEmail;
        updates.emailVerified = false;
      }
    }

    // الاسم الأول كافٍ لاكتمال الملف (حسابات الجوال). الاسم العائلي اختياري.
    const nextFirst = ((updates.firstName as string | undefined) ?? currentRow?.firstName ?? "").trim();
    if (nextFirst.length >= 2) {
      updates.isProfileComplete = true;
    }

    if (Object.keys(updates).length > 0) {
      await db.update(users).set(updates).where(eq(users.id, session.userId));
    }

    // بريد جديد (بديل الاصطناعي/المفقود) → أرسل رابط التحقق فورًا؛ يبقى
    // unverified حتى ينجح الرابط. الإرسال لا يعطّل حفظ الملف.
    if (typeof updates.email === "string" && updates.email) {
      const { sendVerificationEmail } = await import("../services/email");
      sendVerificationEmail(session.userId, updates.email).catch((err) =>
        console.error("[Mobile API] profile email verification send failed:", err),
      );
    }

    // Return the freshly-updated user row so the iOS APIClient can replace
    // `currentUser` in one round trip — the previous response was just
    // `{success, message}`, which the iOS decoder read as an empty APIUser
    // and propagated as a blank ("مستخدم" / "قارئ") account on screen.
    const [updated] = await db
      .select({
        id: users.id,
        email: users.email,
        phoneNumber: users.phoneNumber,
        firstName: users.firstName,
        lastName: users.lastName,
        profileImageUrl: users.profileImageUrl,
        gender: users.gender,
        birthDate: users.birthDate,
        bio: users.bio,
        city: users.city,
        country: users.country,
        locale: users.locale,
        emailVerified: users.emailVerified,
        phoneVerified: users.phoneVerified,
        isProfileComplete: users.isProfileComplete,
        authProvider: users.authProvider,
        role: users.role,
        jobTitle: users.jobTitle,
        department: users.department,
        verificationBadge: users.verificationBadge,
        hasPressCard: users.hasPressCard,
      })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);

    // One-time +50 loyalty bonus when the profile becomes complete
    // (first + last name + bio + city + gender). Fire-and-forget so
    // a loyalty hiccup never blocks the profile save. The cap+dedup
    // on PROFILE_COMPLETE prevents re-issuance on subsequent edits.
    import("../services/loyalty")
      .then((m) => m.awardProfileCompletionBonus(session.userId))
      .catch((err) => console.warn("[members/profile] bonus skipped:", err?.message));

    res.json({
      success: true,
      message: "تم تحديث الملف الشخصي بنجاح",
      user: updated ? { ...updated, phone: updated.phoneNumber } : null,
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

    // Upload to Cloudflare Images. CF is the canonical image backend
    // per [[cloudflare-images-canonical]] — the previous ObjectStorageService
    // path routed through the Replit sidecar (127.0.0.1:1106) and returned
    // ECONNREFUSED on Railway, surfacing as "حدث خطأ في رفع الصورة".
    if (!cloudflareImagesService.isCloudflareConfigured()) {
      return res.status(502).json({
        success: false,
        message: "خدمة رفع الصورة غير مهيأة حالياً. حاول لاحقاً."
      });
    }

    const timestamp = Date.now();
    const filename = `member-${session.userId}-${timestamp}.${imageType}`;
    const cfResult = await cloudflareImagesService.uploadToCloudflare(
      buffer,
      filename,
      { type: "member-avatar", userId: session.userId },
      `image/${imageType}`
    );

    if (!cfResult.success || !cfResult.deliveryUrl) {
      console.error("[Mobile API] CF Images avatar upload failed:", cfResult.error);
      return res.status(502).json({
        success: false,
        message: "تعذر رفع الصورة. حاول لاحقاً."
      });
    }

    const imageUrl = cfResult.deliveryUrl;

    // Update user profile with new image URL
    await db.update(users)
      .set({ profileImageUrl: imageUrl })
      .where(eq(users.id, session.userId));

    console.log(`[Mobile API] Profile image uploaded for ${session.userId}: ${imageUrl}`);

    // Hydrate and return the full user row so the iOS client can update
    // its cached APIUser without a follow-up GET /members/profile.
    const [updated] = await db
      .select({
        id: users.id,
        email: users.email,
        phoneNumber: users.phoneNumber,
        firstName: users.firstName,
        lastName: users.lastName,
        profileImageUrl: users.profileImageUrl,
        gender: users.gender,
        birthDate: users.birthDate,
        bio: users.bio,
        city: users.city,
        country: users.country,
        locale: users.locale,
        emailVerified: users.emailVerified,
        phoneVerified: users.phoneVerified,
        role: users.role,
        jobTitle: users.jobTitle,
        department: users.department,
      })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);

    res.json({
      success: true,
      message: "تم رفع الصورة الشخصية بنجاح",
      imageUrl: imageUrl,
      user: updated ? { ...updated, phone: updated.phoneNumber } : null,
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

    const changePwCheck = validatePassword(newPassword);
    if (!changePwCheck.ok) {
      return res.status(400).json({
        success: false,
        message: changePwCheck.message
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

    // Evict every OTHER session on a password change (audit #8), keeping the
    // caller's current bearer token so this device stays signed in.
    const authHeader = req.headers.authorization || "";
    const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const currentTokenHash = bearerToken
      ? crypto.createHash("sha256").update(bearerToken).digest("hex")
      : undefined;
    await invalidateAllUserSessions(session.userId, { exceptMobileTokenHash: currentTokenHash });

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
// حذف الحساب - Delete Account
// DELETE /api/v1/members/account
//
// Apple App Store guideline 5.1.1(v) requires apps that support
// account creation to also let users actually DELETE their data, not
// merely deactivate it. The previous version was a soft-delete only —
// users.status = 'deleted' but every other personal artefact stayed in
// the DB (push tokens kept receiving broadcasts, editorial history
// stayed, bookmarks lingered, avatar stayed on Cloudflare Images).
// This rewrite wipes the per-user rows in every user-scoped table and
// anonymises the row in `users` itself (kept as a tombstone so existing
// foreign keys from `articles` still resolve).
// ==========================================
router.delete("/members/account", async (req: Request, res: Response) => {
  try {
    const session = await verifyMemberSession(req);

    if (!session) {
      return res.status(401).json({
        success: false,
        message: "غير مصرح",
      });
    }

    const { password } = req.body;

    // (نلتقط أيضًا رابط صورة الملف لتنظيف Cloudflare لاحقًا.)
    const [user] = await db
      .select({
        passwordHash: users.passwordHash,
        profileImageUrl: users.profileImageUrl,
      })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "الحساب غير موجود",
      });
    }

    // المستخدمون بكلمة مرور: نتحقّق منها. أمّا حسابات Apple/الجوال (بلا passwordHash)
    // فالجلسة (Bearer) إثبات هوية كافٍ — إلزام كلمة مرور غير موجودة كان يمنعهم من
    // الحذف ويخالف بند أبل 5.1.1(v). المطلوب فقط أن يكون الحذف ممكنًا داخل التطبيق.
    if (user.passwordHash) {
      if (!password) {
        return res.status(400).json({
          success: false,
          message: "كلمة المرور مطلوبة لتأكيد الحذف",
        });
      }
      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
      if (!isPasswordValid) {
        return res.status(401).json({
          success: false,
          message: "كلمة المرور غير صحيحة",
        });
      }
    }

    const userId = session.userId;
    const anonEmail = `deleted-${userId}@anon.local`;

    // Wipe per-user data across the relevant tables, then anonymise
    // the users row. Each DELETE is wrapped in its own try so a
    // missing/optional table doesn't block the rest — App Store
    // compliance is about removing the user's personal footprint,
    // not about every secondary table being present.
    const wipeQueries: Array<{ label: string; query: ReturnType<typeof sql> }> = [
      { label: "push_devices",                 query: sql`DELETE FROM push_devices WHERE user_id = ${userId}` },
      { label: "editorial_notifications",      query: sql`DELETE FROM editorial_notifications WHERE user_id = ${userId}` },
      { label: "editorial_notification_prefs", query: sql`DELETE FROM editorial_notification_prefs WHERE user_id = ${userId}` },
      { label: "bookmarks",                    query: sql`DELETE FROM bookmarks WHERE user_id = ${userId}` },
      { label: "user_interests",               query: sql`DELETE FROM user_interests WHERE user_id = ${userId}` },
      { label: "reading_history",              query: sql`DELETE FROM reading_history WHERE user_id = ${userId}` },
      { label: "user_reading_history",         query: sql`DELETE FROM user_reading_history WHERE user_id = ${userId}` },
      { label: "reactions",                    query: sql`DELETE FROM reactions WHERE user_id = ${userId}` },
      { label: "user_preferences",             query: sql`DELETE FROM user_preferences WHERE user_id = ${userId}` },
      { label: "user_notification_prefs",      query: sql`DELETE FROM user_notification_prefs WHERE user_id = ${userId}` },
      { label: "user_segment_assignments",     query: sql`DELETE FROM user_segment_assignments WHERE user_id = ${userId}` },
      { label: "app_member_sessions",          query: sql`DELETE FROM app_member_sessions WHERE member_id = ${userId}` },
    ];

    for (const { label, query } of wipeQueries) {
      try {
        await db.execute(query);
      } catch (err: any) {
        console.warn(`[Account Delete] ${label} wipe skipped:`, err?.message || err);
      }
    }

    // Anonymise the users row itself. Personal identifiers go null /
    // generic; the row stays so `articles.author_id` / `reporter_id`
    // foreign keys still resolve historically.
    await db.execute(sql`
      UPDATE users
      SET email = ${anonEmail},
          password_hash = NULL,
          first_name = 'محذوف',
          last_name = '',
          first_name_en = 'Deleted',
          last_name_en = '',
          bio = NULL,
          phone_number = NULL,
          profile_image_url = NULL,
          google_id = NULL,
          apple_id = NULL,
          gender = NULL,
          birth_date = NULL,
          city = NULL,
          country = NULL,
          fcm_token = NULL,
          fcm_topics = '[]'::jsonb,
          last_device_info = NULL,
          two_factor_secret = NULL,
          two_factor_backup_codes = NULL,
          two_factor_enabled = false,
          status = 'deleted',
          deleted_at = NOW()
      WHERE id = ${userId}
    `);

    // Also kill web (Passport) sessions — the SQL above only cleared
    // app_member_sessions, leaving any web session alive (audit #8).
    await invalidateAllUserSessions(userId);

    console.log(`[Mobile API] Account hard-deleted (anonymised + cascaded): ${userId}`);

    // Best-effort: clean up the Cloudflare Images avatar so the file
    // doesn't sit on CF after the user's data has been wiped from our
    // DB. Runs after the destructive ops succeed so a CF outage doesn't
    // block the deletion the user actually asked for.
    if (user.profileImageUrl) {
      const imageId = cloudflareImagesService.extractImageId(user.profileImageUrl);
      if (imageId) {
        cloudflareImagesService.deleteImage(imageId).catch((err) => {
          console.warn(`[Account Delete] CF Images cleanup failed for ${imageId}:`, err);
        });
      }
    }

    res.json({
      success: true,
      message: "تم حذف الحساب بنجاح",
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

// Deploy marker (used to verify the latest mobileApiRoutes bundle is live
// on Railway — strings here surface via the `X-Mobile-Routes-Build` header
// added below). Bump the timestamp string whenever a deploy-correctness
// check is needed.
const MOBILE_ROUTES_BUILD = "2026-05-17T13:15Z+ai-image-flag";

router.use((_req, res, next) => {
  res.setHeader("X-Mobile-Routes-Build", MOBILE_ROUTES_BUILD);
  next();
});

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
    // Editorial focal point ({x, y} as percentages 0–100 from top-left)
    // — drives the .fill-mode crop on iOS so the subject of the hero
    // stays in frame on featured cards, story rails, and detail. The
    // articleCardSelect was already including imageFocalPoint in the
    // SQL projection, but this serializer used to drop it; the iOS
    // FocalCachedAsyncImage fell back to centre on every card. Pass
    // it through verbatim — iOS's decodeFocalPoint accepts both
    // camelCase and snake_case keys.
    image_focal_point: article.imageFocalPoint || null,
    // True when the hero (or thumbnail, when no hero exists) was
    // produced by the dashboard's AI image generator. iOS uses this
    // to overlay a "مولّدة بالذكاء الاصطناعي" badge on the image —
    // same convention as ImageWithCaption.tsx on the web.
    is_ai_generated_image: article.isAiGeneratedImage
      || (article.imageUrl == null && article.isAiGeneratedThumbnail)
      || false,
    ai_image_model: article.aiImageModel || null,
    article_url: `${baseUrl}/article/${article.slug}`,
    is_breaking: article.newsType === "breaking",
    is_featured: article.isFeatured || false,
    reading_minutes: estimateReadingMinutes(article.content || ""),
    views_count: article.viewsCount || article.views || 0,
    shares_count: article.sharesCount || article.shares || 0,
  };
}

import { memoryCache as sharedMemoryCache, withSWR, CACHE_TTL } from "../memoryCache";

function getCached(key: string) {
  return sharedMemoryCache.get(key);
}
function setCache(key: string, data: any, ttlMs: number) {
  sharedMemoryCache.set(key, data, ttlMs);
}

/**
 * True when the client explicitly asked for fresh data — i.e. a native
 * pull-to-refresh. The iOS/Android clients signal this with a
 * `Cache-Control: no-cache`/`no-store` header AND a cache-busting `_nc`
 * (or `_t`) query param on the refresh fetch. The server-side memoryCache
 * is keyed only by route (it ignores query strings), so without honouring
 * this signal a freshly published article stays invisible until the route
 * TTL expires — the user pulls 2-3 times and sees nothing. When this
 * returns true the caller skips the cache READ but still re-populates it,
 * so subsequent normal loads stay fast and current.
 */
function wantsFreshData(req: Request): boolean {
  const cc = String(req.headers["cache-control"] || "").toLowerCase();
  if (cc.includes("no-cache") || cc.includes("no-store")) return true;
  if (req.query._nc !== undefined || req.query.refresh !== undefined) return true;
  return false;
}

// GET /api/v1/articles (list)
router.get("/articles", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const page = parseInt(req.query.page as string) || 0;
    const offset = page > 0 ? (page - 1) * limit : (parseInt(req.query.offset as string) || 0);
    const section = req.query.section as string | undefined;
    const breaking = req.query.breaking as string | undefined;
    const featured = req.query.featured as string | undefined;
    const q = req.query.q as string | undefined;

    const conditions: any[] = [
      eq(articles.status, "published"),
      eq(articles.hideFromHomepage, false),
    ];

    if (section) {
      // iOS passes the category SLUG (e.g. "saudi", "sports"); some older
      // callers pass the UUID directly. Accept both: if the value looks
      // like a UUID, match `articles.categoryId` directly; otherwise
      // resolve the slug → category.id first. Falls back to an empty
      // result when the slug doesn't exist (rather than silently returning
      // unfiltered articles).
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;
      if (uuidRegex.test(section)) {
        conditions.push(eq(articles.categoryId, section));
      } else {
        const [cat] = await db
          .select({ id: categories.id })
          .from(categories)
          .where(eq(categories.slug, section))
          .limit(1);
        conditions.push(eq(articles.categoryId, cat?.id ?? "__no_match__"));
      }
    }
    if (breaking === "true") conditions.push(eq(articles.newsType, "breaking"));
    if (featured === "true") conditions.push(eq(articles.isFeatured, true));

    // بحث العنوان (q): كان `ilike + ORDER BY published_at + LIMIT` في استعلام
    // واحد — المخطط يمشي على فهرس التاريخ ويرشّح صفًا صفًا، فتستغرق الكلمات
    // النادرة ثواني (متوسط مقيس 5.1s). الحل: صفّ المرشحين أولًا بلا ترتيب
    // (يستعمل فهرس trgm عبر Bitmap Scan)، ثم رتّب الدفعة الصغيرة بالتاريخ.
    // سقف 1000 مرشح يكفي أعمق صفحات الموبايل (50 × 20 صفحة).
    const SEARCH_CANDIDATE_CAP = 1000;
    let searchIds: string[] | null = null;
    if (q) {
      const candidates = await db
        .select({ id: articles.id })
        .from(articles)
        .where(and(...conditions, ilike(articles.title, `%${q}%`)))
        .limit(SEARCH_CANDIDATE_CAP);
      searchIds = candidates.map((c) => c.id);
      if (searchIds.length === 0) {
        res.json({ articles: [], total: 0, limit, offset, hasMore: false });
        return;
      }
      conditions.push(inArray(articles.id, searchIds));
    }

    // العدّاد: عند البحث نعرف العدد من قائمة المرشحين نفسها (بسقفها) بدل
    // count(*) ثانٍ كان يكلف 2.7s لكل كتابة حرف في حقل البحث.
    let total: number;
    if (searchIds) {
      total = searchIds.length;
    } else {
      const [countResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(articles)
        .where(and(...conditions));
      total = Number(countResult?.count || 0);
    }

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

// GET /api/v1/news/paginated (homepage news feed — load-more)
//
// Compatibility alias for the iOS client's `fetchPaginatedNews(page:)`, which
// still targets the legacy `/news/paginated` path. The Android client already
// migrated to `/api/v1/articles`; iOS has not, so without this route every
// app launch floods the server with 404s. The response shape matches the
// `/articles` endpoint (decoded by iOS `APIPaginatedList<APIArticle>` via the
// `articles` key). The filter mirrors the web `/api/news/paginated`: published,
// shown on homepage, excluding opinion pieces and AI-sourced items.
router.get("/news/paginated", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const page = parseInt(req.query.page as string) || 0;
    const offset = page > 0 ? (page - 1) * limit : (parseInt(req.query.offset as string) || 0);

    const conditions = [
      eq(articles.status, "published"),
      eq(articles.hideFromHomepage, false),
      or(isNull(articles.articleType), ne(articles.articleType, "opinion")),
      or(isNull(articles.source), ne(articles.source, "ai")),
    ];

    // العدّاد الإجمالي ثابت عمليًا بين النشرات — كان يُنفَّذ count(*) على كل
    // طلب من كل جهاز iOS (~370 ألف مرة في 6 أيام، تدقيق 2026-07-25). نفس
    // مفتاح SWR المستخدم في ويب /api/news/paginated فيتشاركان النتيجة.
    const total = await withSWR(
      "news-paginated-total",
      CACHE_TTL.SHORT,
      CACHE_TTL.SHORT * 2,
      async () => {
        const [countResult] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(articles)
          .where(and(...conditions));
        return Number(countResult?.count || 0);
      },
    );

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
    console.error("[Mobile API] GET /news/paginated error:", error);
    res.status(500).json({
      error: { code: "SERVER_ERROR", message: "فشل في جلب الأخبار", status: 500 },
    });
  }
});

// GET /api/v1/articles/:id (single article detail)
router.get("/articles/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const articleId = req.params.id;

    // "my-revisions" has a dedicated handler registered later in this file.
    // Without this guard the :id matcher treats it as a slug, finds no
    // published article, and 404s (route shadowing). Fall through instead.
    if (articleId === "my-revisions") return next();

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

    // Trending = weighted engagement velocity across all platforms
    // (web + iOS). Previous formula was raw `views / hour-since-publish`,
    // which made every article in the window look basically tied (most
    // reads come in the first few hours) — so the rank ended up almost
    // chronological by publishedAt and the user kept seeing
    // "newest-first" instead of actual engagement.
    //
    // New score per article:
    //   raw views (iOS bumps articles.views via /v1/articles/:id/view)
    //   + likes ×3      (reactions, last 48h, type='like')
    //   + comments ×5   (approved only, last 48h)
    //   + completions ×2 (reading_history rows w/ completionRate >= 70,
    //                    last 48h — these are "actually finished" reads)
    // Divided by hours-since-publish (floored at 3h) so a 3-hour-old
    // article with strong engagement can beat a 36-hour-old one that
    // peaked early.
    const topArticlesRaw = await db.execute(sql`
      SELECT a.*, c.name_ar AS category_name_ar, c.id AS category_id,
             u.first_name AS author_first_name, u.last_name AS author_last_name
      FROM articles a
      LEFT JOIN categories c ON a.category_id = c.id
      LEFT JOIN users u ON a.author_id = u.id
      WHERE a.status = 'published' AND a.hide_from_homepage = false
        AND a.published_at >= ${cutoff}
      ORDER BY
        (
          COALESCE(a.views, 0)
          + (SELECT COUNT(*) FROM reactions WHERE article_id = a.id AND type = 'like' AND created_at >= NOW() - INTERVAL '48 hours') * 3
          + (SELECT COUNT(*) FROM comments WHERE article_id = a.id AND status = 'approved' AND created_at >= NOW() - INTERVAL '48 hours') * 5
          + (SELECT COUNT(*) FROM reading_history WHERE article_id = a.id AND completion_rate >= 70 AND read_at >= NOW() - INTERVAL '48 hours') * 2
        )::float
        / GREATEST(EXTRACT(EPOCH FROM (NOW() - a.published_at)) / 3600.0, 3)
        DESC
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

// GET /api/v1/authors/by-name?name=<full name>
//
// Lightweight author profile for the iOS "writer page". The mobile client
// only knows the byline string (the reporter row or, as fallback, the
// staff author row), so we resolve by concatenated first+last name in
// either the reporter (`reporter_id`) or author (`author_id`) slot.
//
// Response shape — designed to power a hero card + stats strip + top-
// categories chip row + recent-articles list in a single round trip:
//
//   {
//     author: { id, name, role, avatarUrl, bio, jobTitle, department,
//               joinedAt },
//     stats:  { articleCount, totalViews, totalLikes, weeksActive },
//     topCategories: [ { id, nameAr, count, color, icon } ... up to 3 ],
//     recentArticles: [ ...formatArticleForMobile ... up to 30 ]
//   }
router.get("/authors/by-name", async (req: Request, res: Response) => {
  try {
    const rawName = (req.query.name as string | undefined)?.trim();
    if (!rawName) {
      return res.status(400).json({
        error: { code: "INVALID_INPUT", message: "اسم الكاتب مطلوب", status: 400 },
      });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 30;
    const offset = (page - 1) * limit;

    const cacheKey = `mobile:author:${rawName.toLowerCase()}:p${page}:l${limit}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    // Find the user whose `first_name + ' ' + last_name` matches the
    // byline. The DB has duplicate user rows for some authors (e.g.
    // "صحيفة سبق" exists twice — one legacy account with 690K historical
    // articles that hasn't published since 2026-01, and one active
    // account that's actually used today). The previous `ORDER BY
    // published_count DESC` picked the legacy user → author page
    // showed Jan-2026 articles instead of today's news. We now rank by
    // `latest_published DESC` so the byline always resolves to the
    // user who's currently writing under that name. published_count
    // is the tie-breaker.
    const userRow = await db.execute(sql`
      SELECT u.id, u.first_name, u.last_name, u.profile_image_url, u.bio,
             u.job_title, u.department, u.created_at,
             COUNT(a.id) AS published_count,
             MAX(a.published_at) AS latest_published
      FROM users u
      LEFT JOIN articles a
        ON a.status = 'published'
        AND (a.author_id = u.id OR a.reporter_id = u.id)
      WHERE LOWER(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')))
            = LOWER(${rawName})
      GROUP BY u.id, u.first_name, u.last_name, u.profile_image_url, u.bio,
               u.job_title, u.department, u.created_at
      ORDER BY latest_published DESC NULLS LAST,
               published_count DESC,
               u.created_at ASC
      LIMIT 1
    `) as any;
    const author = (userRow?.rows || userRow || [])[0];

    if (!author) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "لم يتم العثور على الكاتب", status: 404 },
      });
    }

    // Run stats, categories, and articles queries in parallel — they
    // all depend only on author.id and were previously sequential (~3×
    // round-trip latency savings).
    const [statsRow, topCatsRows, recent] = await Promise.all([
      db.execute(sql`
        SELECT
          COUNT(DISTINCT a.id) AS article_count,
          COALESCE(SUM(a.views), 0) AS total_views,
          MIN(a.published_at) AS earliest_publish
        FROM articles a
        WHERE a.status = 'published'
          AND (a.reporter_id = ${author.id} OR a.author_id = ${author.id})
      `) as any,

      db.execute(sql`
        SELECT c.id, c.name_ar, c.color, c.icon, COUNT(*) AS count
        FROM articles a
        INNER JOIN categories c ON a.category_id = c.id
        WHERE a.status = 'published'
          AND (a.reporter_id = ${author.id} OR a.author_id = ${author.id})
        GROUP BY c.id, c.name_ar, c.color, c.icon
        ORDER BY count DESC
        LIMIT 3
      `) as any,

      db
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
            or(eq(articles.reporterId, author.id), eq(articles.authorId, author.id)),
          )
        )
        .orderBy(desc(articles.publishedAt))
        .limit(limit)
        .offset(offset),
    ]);

    const stats = (statsRow?.rows || statsRow || [])[0] || {};
    const topCategories = (topCatsRows?.rows || topCatsRows || []).map((r: any) => ({
      id: r.id,
      nameAr: r.name_ar,
      color: r.color,
      icon: r.icon,
      count: Number(r.count) || 0,
    }));

    const role = author.job_title || author.department || "كاتب في سبق";
    const fullName = [author.first_name, author.last_name].filter(Boolean).join(" ").trim();

    const result = {
      author: {
        id: author.id,
        name: fullName || rawName,
        role,
        avatarUrl: author.profile_image_url
          ? (String(author.profile_image_url).startsWith("http")
              ? author.profile_image_url
              : `${BASE_URL}${String(author.profile_image_url).startsWith("/") ? "" : "/"}${author.profile_image_url}`)
          : null,
        bio: author.bio || null,
        jobTitle: author.job_title || null,
        department: author.department || null,
        joinedAt: author.created_at?.toISOString?.() || author.created_at || null,
      },
      stats: {
        articleCount: Number(stats.article_count) || 0,
        totalViews: Number(stats.total_views) || 0,
        earliestPublish: stats.earliest_publish?.toISOString?.() || stats.earliest_publish || null,
      },
      topCategories,
      recentArticles: recent.map((r) => formatArticleForMobile(r, BASE_URL)),
    };

    setCache(cacheKey, result, 5 * 60 * 1000);
    res.json(result);
  } catch (error) {
    console.error("[Mobile API] GET /authors/by-name error:", error);
    res.status(500).json({
      error: { code: "SERVER_ERROR", message: "فشل في جلب بيانات الكاتب", status: 500 },
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
    if (!wantsFreshData(req)) {
      const cached = getCached(cacheKey);
      if (cached) return res.json(cached);
    }

    // Align hero selection/order with web (`getHeroArticles` / homepage-lite):
    // editors reorder via displayOrder; sorting by publishedAt alone made
    // pull-to-refresh look broken — fresh JSON, same carousel order.
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
          or(
            eq(articles.newsType, "breaking"),
            eq(articles.isFeatured, true)
          ),
          or(
            isNull(articles.articleType),
            ne(articles.articleType, "opinion"),
            eq(articles.isFeatured, true)
          ),
          or(
            isNull(articles.aiGenerated),
            eq(articles.aiGenerated, false),
            eq(articles.isFeatured, true)
          )
        )
      )
      .orderBy(
        desc(sql`GREATEST(COALESCE(${articles.displayOrder}, 0), EXTRACT(EPOCH FROM COALESCE(${articles.resurfacedAt}, ${articles.publishedAt})))`),
        desc(sql`COALESCE(${articles.resurfacedAt}, ${articles.publishedAt})`)
      )
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
      // «إنعاش»: صدارة الموجز بوقت الإنعاش دون تغيير تاريخ النشر الظاهر
      .orderBy(desc(sql`COALESCE(${articles.resurfacedAt}, ${articles.publishedAt})`))
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
      .orderBy(desc(sql`COALESCE(${articles.resurfacedAt}, ${articles.publishedAt})`))
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

    // Source: trust the client-declared platform but only if it's one
    // of the two mobile values we expect. Anything else (or missing)
    // falls back to "ios" — historically this route was iOS-only. The
    // admin dashboard surfaces this so moderators can see whether a
    // comment came from the web, iOS, or Android.
    const declaredPlatform = typeof req.body?.platform === "string" ? req.body.platform : "";
    const platform = declaredPlatform === "android" ? "android" : "ios";

    const parsed = insertCommentSchema.safeParse({
      ...req.body,
      articleId: article.id,
      userId: session.userId,
      platform,
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

    // Mirror the web route's branch (server/routes.ts:12910). Mobile
    // previously only flipped to "pending" regardless of the word's
    // configured `action`, so words admin-configured for auto-reject
    // still landed as pending and the AI moderation step couldn't fix
    // them. Reported 2026-05-24: banned phrases were getting published
    // because the mobile path bypassed the reject branch.
    if (blockedBySuspiciousWords && suspiciousCheck.foundWords.length > 0) {
      const foundWordsStr = suspiciousCheck.foundWords.map((w) => w.word).join(", ");
      const wordIds = suspiciousCheck.foundWords.map((w) => w.wordId);
      const autoReject = suspiciousCheck.shouldAutoReject;
      const rejectingWords = suspiciousCheck.foundWords
        .filter((w) => w.action === "reject")
        .map((w) => w.word);
      await db
        .update(comments)
        .set({
          status: autoReject ? "rejected" : "pending",
          moderatedAt: autoReject ? new Date() : undefined,
          moderationReason: autoReject
            ? `رُفض تلقائياً - كلمات محظورة: ${rejectingWords.join(", ")}`
            : `يحتوي على كلمات مشبوهة: ${foundWordsStr}`,
        })
        .where(eq(comments.id, created.id));
      await incrementSuspiciousWordFlagCount(wordIds);

      const { logSuspiciousWordMatches, notifyCommentRejected } = await import(
        "../services/commentInsightsService"
      );
      await logSuspiciousWordMatches(created.id, created.content, suspiciousCheck.foundWords, autoReject);
      if (autoReject) {
        await notifyCommentRejected({
          userId: session.userId,
          commentId: created.id,
          reason: `كلمات محظورة: ${rejectingWords.join(", ")}`,
        });
      }
    }

    // Fire-and-forget AI moderation + sentiment via the unified pipeline. The
    // status the mobile client receives here will be the initial DB default
    // ("pending"); the pipeline flips it to approved/rejected within a few
    // seconds and the next list refresh shows the final state.
    const commentId = created.id;
    const commentContent = created.content;
    void (async () => {
      try {
        const { runCommentModerationPipeline } = await import(
          "../services/commentInsightsService"
        );
        await runCommentModerationPipeline({
          commentId,
          content: commentContent,
          userId: session.userId,
          articleId: article.id,
          suspiciousHeld: blockedBySuspiciousWords && !suspiciousCheck.shouldAutoReject,
          suspiciousAutoRejected: blockedBySuspiciousWords && suspiciousCheck.shouldAutoReject,
          suspiciousWordsNote: suspiciousCheck.foundWords.length
            ? suspiciousCheck.foundWords.map((w) => w.word).join(", ")
            : undefined,
        });
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

// ==========================================
// POST /api/v1/contact
// Mobile contact form. Mirrors the web /api/contact handler exactly: same
// Zod schema, same `contactMessages` insert, same MailerSend notification.
// Lives under /api/v1/* so it is automatically exempt from CSRF (the web
// route is CSRF-gated and would 403 mobile clients that have no session
// cookie or `x-csrf-token` header).
// ==========================================
router.post("/contact", async (req: Request, res: Response) => {
  try {
    const { contactMessages } = await import("@shared/schema");
    const { z } = await import("zod");

    const contactSchema = z.object({
      name: z.string().min(2),
      phone: z.string().regex(/^\+966[0-9]{9}$/),
      email: z.string().email(),
      subject: z.enum(["استفسار عام", "شراكات إعلامية", "شكوى", "اقتراح", "أخرى"]),
      message: z.string().min(10),
      attachments: z.array(z.object({
        name: z.string(),
        size: z.number(),
        type: z.string(),
        url: z.string(),
      })).optional().default([]),
    });

    const validated = contactSchema.parse(req.body);

    const [newMessage] = await db
      .insert(contactMessages)
      .values({
        name: validated.name,
        phone: validated.phone,
        email: validated.email,
        subject: validated.subject,
        message: validated.message,
        attachments: validated.attachments as any,
        status: "pending",
      })
      .returning();

    // Email notification to info@sabq.org — best-effort, never fails the request.
    try {
      const attachmentsList = validated.attachments.length > 0
        ? `<div style="margin-top:16px;padding:12px;background:#f5f5f5;border-radius:8px;"><strong>المرفقات:</strong><ul style="margin:8px 0 0 0;padding-right:20px;">${validated.attachments.map(a => `<li><a href="https://sabq.org${a.url}">${a.name}</a></li>`).join("")}</ul></div>`
        : "";
      const html = `<div dir="rtl" style="font-family:Segoe UI,Tahoma,Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;"><div style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);padding:24px;border-radius:12px 12px 0 0;"><h1 style="color:#fff;margin:0;font-size:24px;">📩 رسالة جديدة من نموذج التواصل (تطبيق الجوال)</h1></div><div style="background:#fff;padding:24px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 12px 12px;"><table style="width:100%;border-collapse:collapse;"><tr><td style="padding:12px 0;border-bottom:1px solid #eee;color:#666;width:120px;"><strong>الاسم:</strong></td><td style="padding:12px 0;border-bottom:1px solid #eee;">${validated.name}</td></tr><tr><td style="padding:12px 0;border-bottom:1px solid #eee;color:#666;"><strong>البريد:</strong></td><td style="padding:12px 0;border-bottom:1px solid #eee;"><a href="mailto:${validated.email}">${validated.email}</a></td></tr><tr><td style="padding:12px 0;border-bottom:1px solid #eee;color:#666;"><strong>الهاتف:</strong></td><td style="padding:12px 0;border-bottom:1px solid #eee;" dir="ltr">${validated.phone}</td></tr><tr><td style="padding:12px 0;border-bottom:1px solid #eee;color:#666;"><strong>الموضوع:</strong></td><td style="padding:12px 0;border-bottom:1px solid #eee;">${validated.subject}</td></tr></table><div style="margin-top:20px;"><strong style="color:#666;">نص الرسالة:</strong><div style="margin-top:12px;padding:16px;background:#f8f9fa;border-radius:8px;border-right:4px solid #0d6efd;white-space:pre-wrap;">${validated.message}</div></div>${attachmentsList}<div style="margin-top:24px;padding-top:16px;border-top:1px solid #eee;text-align:center;color:#999;font-size:12px;"><a href="https://sabq.org/dashboard/contact-messages" style="color:#0d6efd;">عرض في لوحة التحكم</a></div></div></div>`;

      const result = await sendEmailNotification({
        to: "info@sabq.org",
        subject: `رسالة جديدة (تطبيق): ${validated.subject} - من ${validated.name}`,
        html,
      });
      if (!result.success) {
        throw new Error(result.error || "Failed to send contact notification");
      }
      console.log("[Mobile API] /contact email notification sent");
    } catch (emailError) {
      console.error("[Mobile API] /contact email notify failed:", emailError);
    }

    res.status(201).json({
      success: true,
      message: "تم استلام رسالتك بنجاح",
      id: newMessage.id,
    });
  } catch (error: any) {
    console.error("[Mobile API] /contact error:", error);
    if (error?.name === "ZodError") {
      return res.status(400).json({ success: false, message: "بيانات غير صالحة", errors: error.errors });
    }
    res.status(500).json({ success: false, message: "حدث خطأ أثناء حفظ الرسالة" });
  }
});

// ==========================================
// Newsletter (Smart Newsletter for mobile)
// ==========================================
// Three thin mobile endpoints that reuse the same `newsletterSubscriptions`
// table + MailerLite integration as `/api/smart-newsletter/*`. Lives under
// `/api/v1/*` so iOS bypasses the web's CSRF guard cleanly — same pattern
// as the /contact migration.
//
// We import the MailerLite helpers + welcome/unsubscribe emails dynamically
// inside each handler so a missing MAILERLITE_API_KEY at boot doesn't break
// module loading. Subscriptions still persist locally even when MailerLite
// is offline.

// POST /api/v1/newsletter/subscribe
router.post("/newsletter/subscribe", async (req: Request, res: Response) => {
  try {
    const { newsletterSubscriptions } = await import("@shared/schema");
    const { z } = await import("zod");

    const schema = z.object({
      email: z.string().email("البريد الإلكتروني غير صحيح"),
      firstName: z.string().optional(),
      language: z.enum(["ar", "en", "ur"]).default("ar"),
      interests: z.array(z.string()).optional(),
      source: z.string().optional(),
    });

    const data = schema.parse(req.body);

    // If a member session is attached, link the subscription to that user.
    const session = await verifyMemberSession(req);
    const userId = session?.userId ?? null;

    const [existing] = await db
      .select()
      .from(newsletterSubscriptions)
      .where(eq(newsletterSubscriptions.email, data.email))
      .limit(1);

    let subscription;
    if (existing) {
      if (existing.status === "active") {
        return res.status(409).json({
          success: false,
          alreadySubscribed: true,
          message: "هذا البريد مشترك بالفعل في النشرة. يمكنك إلغاء الاشتراك في أي وقت.",
          subscription: { email: existing.email, language: existing.language },
        });
      }
      [subscription] = await db
        .update(newsletterSubscriptions)
        .set({
          status: "active",
          language: data.language,
          userId: userId || existing.userId,
          preferences: {
            ...(existing.preferences as object || {}),
            categories: data.interests || [],
          },
          unsubscribedAt: null,
          unsubscribeReason: null,
          updatedAt: new Date(),
        })
        .where(eq(newsletterSubscriptions.id, existing.id))
        .returning();
    } else {
      const ipRaw = req.headers["x-forwarded-for"] || req.socket?.remoteAddress;
      const ipAddress = typeof ipRaw === "string" ? ipRaw : Array.isArray(ipRaw) ? ipRaw[0] : null;
      const userAgent = req.headers["user-agent"] || null;

      [subscription] = await db
        .insert(newsletterSubscriptions)
        .values({
          email: data.email,
          status: "active",
          language: data.language,
          userId,
          preferences: { frequency: "weekly", categories: data.interests || [] },
          ipAddress,
          userAgent,
          source: data.source || "mobile-app",
          verifiedAt: new Date(),
        })
        .returning();
    }

    // Best-effort MailerLite sync + welcome email. Never fail the response
    // on outbound issues — the local subscription is the source of truth.
    try {
      const { subscribeToMailerLite, isMailerLiteConfigured } = await import("../services/mailerlite");
      if (isMailerLiteConfigured()) {
        await subscribeToMailerLite({
          email: data.email,
          firstName: data.firstName,
          language: data.language,
          interests: data.interests,
          source: data.source || "mobile-app",
        });
      }
    } catch (e) {
      console.warn("[Mobile API] MailerLite sync failed:", e);
    }

    try {
      const { sendNewsletterWelcomeEmail } = await import("../services/email");
      await sendNewsletterWelcomeEmail({
        to: data.email,
        firstName: data.firstName,
        language: data.language,
        interests: data.interests,
      });
    } catch (e) {
      console.warn("[Mobile API] Welcome email failed:", e);
    }

    res.status(201).json({
      success: true,
      message: "أهلاً بك! 🎉 تم اشتراكك في النشرة الذكية بنجاح.",
      subscription: {
        id: subscription.id,
        email: subscription.email,
        language: subscription.language,
      },
    });
  } catch (error: any) {
    console.error("[Mobile API] /newsletter/subscribe error:", error);
    if (error?.name === "ZodError") {
      return res.status(400).json({ success: false, message: "بيانات غير صالحة", errors: error.errors });
    }
    res.status(500).json({ success: false, message: "تعذر الاشتراك حالياً. حاول لاحقاً." });
  }
});

// GET /api/v1/newsletter/status?email=...
router.get("/newsletter/status", async (req: Request, res: Response) => {
  try {
    // Answering "is <email> subscribed?" for any address is a subscriber
    // enumeration oracle over the whole reader base — same ownership proof as
    // unsubscribe.
    const sub = await resolveNewsletterSubscription(req);
    if (!sub) {
      return res.status(403).json({
        success: false,
        message: "غير مصرح بالاطلاع على حالة هذا الاشتراك",
      });
    }

    res.json({
      success: true,
      subscribed: sub.status === "active",
      status: sub.status || "none",
      language: sub.language || null,
    });
  } catch (error) {
    console.error("[Mobile API] /newsletter/status error:", error);
    res.status(500).json({ success: false, message: "خطأ في فحص الاشتراك" });
  }
});

// POST /api/v1/newsletter/unsubscribe
router.post("/newsletter/unsubscribe", async (req: Request, res: Response) => {
  try {
    const { newsletterSubscriptions } = await import("@shared/schema");
    const reason = typeof req.body?.reason === "string" ? req.body.reason : null;

    // SECURITY: the address used to be the only credential, so anyone could
    // unsubscribe any reader. Proof of ownership is either the token from the
    // mailed unsubscribe link (the subscription row's own uuid) or a valid
    // member session — and a session may only act on its own address.
    const existing = await resolveNewsletterSubscription(req);
    if (!existing) {
      return res.status(403).json({
        success: false,
        message: "رابط غير صالح. استخدم رابط إلغاء الاشتراك من رسالة النشرة، أو سجّل الدخول.",
      });
    }
    const email = existing.email;

    await db
      .update(newsletterSubscriptions)
      .set({
        status: "unsubscribed",
        unsubscribedAt: new Date(),
        unsubscribeReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(newsletterSubscriptions.id, existing.id));

    // MailerLite + confirmation email — best-effort.
    try {
      const { isMailerLiteConfigured, getMailerLiteSubscriber, unsubscribeFromMailerLite } = await import("../services/mailerlite");
      if (isMailerLiteConfigured()) {
        const mlSub = await getMailerLiteSubscriber(email);
        if (mlSub.success && mlSub.data) {
          await unsubscribeFromMailerLite(mlSub.data.id);
        }
      }
    } catch (e) {
      console.warn("[Mobile API] MailerLite unsubscribe failed:", e);
    }

    try {
      const { sendNewsletterUnsubscribeEmail } = await import("../services/email");
      await sendNewsletterUnsubscribeEmail({ to: email });
    } catch (e) {
      console.warn("[Mobile API] Unsubscribe email failed:", e);
    }

    res.json({
      success: true,
      message: "تم إلغاء اشتراكك. نأمل عودتك قريباً 👋",
    });
  } catch (error) {
    console.error("[Mobile API] /newsletter/unsubscribe error:", error);
    res.status(500).json({ success: false, message: "تعذر إلغاء الاشتراك حالياً" });
  }
});

/**
 * Convert plain text from the iOS TextEditor into HTML paragraph blocks
 * the dashboard editor can render correctly. Newline rules:
 *   - Two or more consecutive newlines → paragraph break (`<p>…</p>`)
 *   - A single newline inside a paragraph → soft break (`<br>`)
 *   - Empty paragraphs are skipped
 * Idempotent: if the input already contains block-level HTML
 * (`<p>`, `<div>`, headings, lists, blockquote, `<br>`) we return it
 * untouched so we never re-wrap editorial-team output.
 */
function toMobileArticleHTML(raw: string): string {
  const text = raw.trim();
  if (!text) return "";

  if (/<(p|div|h[1-6]|ul|ol|li|blockquote|br)\b/i.test(text)) {
    return text;
  }

  const escapeHTML = (s: string) =>
    s.replace(/&/g, "&amp;")
     .replace(/</g, "&lt;")
     .replace(/>/g, "&gt;")
     .replace(/"/g, "&quot;");

  return text
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => `<p>${escapeHTML(p).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

// ==========================================
// POST /api/v1/articles/submit
// Mobile content submission. Writers send opinion drafts, reporters send
// news drafts (multi-image). Both land in `articles` with status='draft'
// for the editorial team to review on the dashboard.
//
// Role-gated via the same RBAC tables surfaced in /members/profile:
//   Opinion (single hero image):  opinion_author, columnist, article_author,
//                                  writer, author
//   News (up to 10 images, first is hero, rest go into albumImages):
//                                  reporter, correspondent, journalist
//   Admin / editor roles can submit either by passing `kind`.
//
// Images come as base64 data URIs (same shape as /members/profile/image)
// and are uploaded to Cloudflare Images. The endpoint never re-encodes the
// image bytes — whatever the client uploaded is what CF Images stores, so
// quality is fully controlled by the iOS picker.
// ==========================================
router.post("/articles/submit", async (req: Request, res: Response) => {
  try {
    const session = await verifyMemberSession(req);
    if (!session) {
      return res.status(401).json({ success: false, message: "تسجيل الدخول مطلوب لإرسال المحتوى" });
    }

    const { articles, users: usersTable, userRoles: userRolesTable, roles: rolesTable } = await import("@shared/schema");
    const { z } = await import("zod");

    const schema = z.object({
      title: z.string().trim().min(3, "العنوان قصير جداً"),
      content: z.string().trim().min(20, "النص قصير جداً"),
      // base64 data URIs ("data:image/jpeg;base64,..."). Optional for the
      // writer flow because some opinion pieces ship without a hero image —
      // editorial picks one during review.
      images: z.array(z.string()).max(10).optional().default([]),
      // Optional override: lets admins/editors pick the article type.
      // For writer/reporter roles we derive it from their RBAC roles.
      kind: z.enum(["opinion", "news"]).optional(),
    });

    const data = schema.parse(req.body);

    // Load user (for fallback legacy `users.role`) + RBAC role names.
    const [user] = await db
      .select({
        id: usersTable.id,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        email: usersTable.email,
        legacyRole: usersTable.role,
      })
      .from(usersTable)
      .where(eq(usersTable.id, session.userId))
      .limit(1);

    if (!user) {
      return res.status(404).json({ success: false, message: "المستخدم غير موجود" });
    }

    const rbacRoles = await db
      .select({ name: rolesTable.name })
      .from(userRolesTable)
      .innerJoin(rolesTable, eq(userRolesTable.roleId, rolesTable.id))
      .where(eq(userRolesTable.userId, session.userId));

    const roleNames = new Set<string>([
      ...rbacRoles.map(r => (r.name || "").toLowerCase()),
      (user.legacyRole || "").toLowerCase(),
    ]);

    const WRITER_ROLES = new Set([
      "opinion_author",
      "columnist",
      "article_author",
      "article_writer",
      "writer",
      "author",
    ]);
    const REPORTER_ROLES = new Set([
      "reporter",
      "correspondent",
      "journalist",
    ]);
    const ADMIN_LIKE_ROLES = new Set([
      "admin",
      "system_admin",
      "superadmin",
      "editor",
      "editor_in_chief",
      "senior_editor",
      "managing_editor",
      "editorial_manager",
      "content_manager",
    ]);

    const isWriter = [...roleNames].some(r => WRITER_ROLES.has(r));
    const isReporter = [...roleNames].some(r => REPORTER_ROLES.has(r));
    const isAdminLike = [...roleNames].some(r => ADMIN_LIKE_ROLES.has(r));

    if (!isWriter && !isReporter && !isAdminLike) {
      return res.status(403).json({
        success: false,
        message: "صلاحية الإرسال متاحة للكتّاب والمراسلين فقط. تواصل معنا إذا تظن أن هذا خطأ.",
      });
    }

    // من ٣١ يوليو: كتّاب/مراسلون بلا ترخيص ساري لا يُرسلون من الموبايل
    if (isWriter || isReporter) {
      const { assertMediaLicenseAllowsSubmission } = await import(
        "../services/mediaLicenseService"
      );
      const licenseGate = await assertMediaLicenseAllowsSubmission(session.userId);
      if (!licenseGate.ok) {
        return res.status(403).json({
          success: false,
          message: licenseGate.message,
          code: licenseGate.code,
        });
      }
    }

    // Decide article kind. Explicit `kind` wins for admin-likes; otherwise
    // derive from role: writers always submit opinion, reporters always
    // submit news.
    let kind: "opinion" | "news";
    if (data.kind && isAdminLike) {
      kind = data.kind;
    } else if (isWriter) {
      kind = "opinion";
    } else if (isReporter) {
      kind = "news";
    } else {
      // admin without explicit kind — default to news
      kind = data.kind || "news";
    }

    // بوابة يوم النشر: كاتب الرأي لا يرسل مقالاً قبل اختيار يومه الأسبوعي.
    // الواجهة تعرض منتقي اليوم قبل الإرسال، لكن الخادم هو الحكم النهائي —
    // عميل معدَّل لا يستطيع تجاوزها. تخص دور opinion_author حصراً لأن نظام
    // الجدولة الأسبوعية مربوط به.
    if (
      kind === "opinion" &&
      roleNames.has("opinion_author") &&
      (await canSelfAssignSchedule(session.userId))
    ) {
      return res.status(409).json({
        success: false,
        code: "SCHEDULE_DAY_REQUIRED",
        message: "اختر يومك الأسبوعي للنشر أولاً، ثم أرسل مقالك.",
      });
    }

    // Image-count rules per the user request:
    //   Opinion: one hero image at most.
    //   News: multiple (first = hero, rest = album).
    const imagePayload = data.images.filter(s => typeof s === "string" && s.length > 0);
    if (kind === "opinion" && imagePayload.length > 1) {
      return res.status(400).json({
        success: false,
        message: "المقالات الرأي تدعم صورة واحدة فقط.",
      });
    }

    // Upload images to the canonical news-image service. We treat the order client-side as the
    // intended display order: index 0 → hero, the rest → albumImages[].
    //
    // Images are validated first (cheap, synchronous), then uploaded in
    // PARALLEL via Promise.all. The previous sequential await-in-loop made
    // total time = sum of every upload, which combined with the mobile
    // client's request timeout caused "انتهت مهلة الطلب" on multi-image
    // submissions. Parallel upload makes total time ≈ the slowest single
    // image instead of the sum.
    const uploadedUrls: string[] = [];
    if (imagePayload.length > 0) {
      if (!newsImageStorageService.isUploadAvailable()) {
        return res.status(502).json({ success: false, message: "خدمة رفع الصور غير مهيأة حالياً" });
      }

      // 1) Validate + decode every image up front so we fail fast with a
      //    precise error before spending time on any upload.
      const decoded: { buffer: Buffer; mimeType: string; ext: string }[] = [];
      for (let i = 0; i < imagePayload.length; i++) {
        const src = imagePayload[i];
        const matches = src.match(/^data:image\/(png|jpeg|jpg|webp|gif|heic|heif);base64,(.+)$/i);
        if (!matches) {
          return res.status(400).json({
            success: false,
            message: `صيغة الصورة ${i + 1} غير صحيحة`,
          });
        }
        const ext = matches[1].toLowerCase();
        const mimeType = `image/${ext === "heif" ? "heic" : ext}`;
        const buffer = Buffer.from(matches[2], "base64");

        // 20 MB per image cap keeps oversized payloads from reaching either
        // storage provider.
        if (buffer.length > 20 * 1024 * 1024) {
          return res.status(413).json({
            success: false,
            message: `حجم الصورة ${i + 1} كبير جداً (الحد الأقصى 20 ميجابايت)`,
          });
        }
        decoded.push({ buffer, mimeType, ext });
      }

      // 2) Upload all images concurrently, preserving original order.
      const batchStamp = Date.now();
      const results = await Promise.all(
        decoded.map((img, i) =>
          newsImageStorageService.upload({
            buffer: img.buffer,
            filename: `submission-${session.userId}-${batchStamp}-${i}.${img.ext}`,
            mimeType: img.mimeType,
            purpose: "mobile-article-submission",
            metadata: { userId: session.userId, slot: String(i), source: "mobile-app" },
            rolloutKey: `${session.userId}:${batchStamp}:${i}`,
          })
        )
      );

      // 3) Collect results in order; bail on the first failure.
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (!result.success || !result.deliveryUrl) {
          console.error("[Mobile API] /articles/submit image upload failed:", result.error);
          return res.status(502).json({
            success: false,
            message: `تعذر رفع الصورة ${i + 1}. حاول لاحقاً.`,
          });
        }
        uploadedUrls.push(result.deliveryUrl);
      }
    }

    const heroImage = uploadedUrls[0] || null;
    const albumImages = uploadedUrls.length > 1 ? uploadedUrls.slice(1) : [];

    // Slug generation mirrors the email-agent pattern: arabic-safe lowercase
    // + timestamp for uniqueness.
    const baseSlug = data.title
      .toLowerCase()
      .trim()
      .replace(/[\s_]+/g, "-")
      .replace(/[^؀-ۿa-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    const slug = `${baseSlug || "submission"}-${Date.now()}`;
    const { nanoid } = await import("nanoid");
    const englishSlug = nanoid(7);

    // The iOS TextEditor sends plain text with `\n` separating paragraphs.
    // The dashboard renders article content as HTML — if we store the raw
    // text the editor squashes everything into one paragraph. Convert
    // user input into proper `<p>...</p>` blocks (preserving single line
    // breaks as `<br>`) before storing. Idempotent: if the payload already
    // contains block-level HTML we pass it through untouched.
    const htmlContent = toMobileArticleHTML(data.content);
    const plainForExcerpt = data.content
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const articleData: any = {
      title: data.title.trim(),
      slug,
      englishSlug,
      content: htmlContent,
      // Editorial team enriches excerpt during review; we just store the
      // first 220 chars of the plain version as a starting point.
      excerpt: plainForExcerpt.slice(0, 220),
      authorId: session.userId,
      submitterId: session.userId,
      reporterId: kind === "news" ? session.userId : null,
      articleType: kind,
      newsType: "regular",
      status: "draft",
      // يطابق إرسال الويب وإعادة الإرسال بعد التعديل — بدونها تبقى حالة
      // الالتزام «لم يرسل» رغم وصول المسودة لغرفة الأخبار.
      reviewStatus: "pending_review",
      imageUrl: heroImage,
      albumImages,
      source: (() => {
        // Best-effort platform attribution from the User-Agent.
        const ua = (req.headers["user-agent"] || "").toString().toLowerCase();
        if (ua.includes("android") || ua.includes("okhttp") || ua.includes("retrofit")) return "android-app";
        return "ios-app";
      })(),
      sourceInfo: {
        channel: "mobile-app",
        platform: (() => {
          const ua = (req.headers["user-agent"] || "").toString().toLowerCase();
          if (ua.includes("android") || ua.includes("okhttp") || ua.includes("retrofit")) return "android";
          return "ios";
        })(),
        submittedBy: user.email || user.id,
      },
      sourceMetadata: {
        type: "mobile",
        platform: (() => {
          const ua = (req.headers["user-agent"] || "").toString().toLowerCase();
          if (ua.includes("android") || ua.includes("okhttp") || ua.includes("retrofit")) return "android";
          return "ios";
        })(),
        firstName: user.firstName || "",
        lastName: user.lastName || "",
      },
      hideFromHomepage: false,
      displayOrder: Math.floor(Date.now() / 1000),
      createdAt: new Date(),
    };

    const [created] = await db.insert(articles).values(articleData).returning();

    console.log(
      `[Mobile API] /articles/submit — ${kind} draft created by ${user.email || session.userId} ` +
      `(id=${created?.id}, images=${uploadedUrls.length})`
    );

    // Fire-and-forget AI enrichment: summary, bullets, SEO meta,
    // keywords, newsletter fields, suggested category, quality check.
    // Title + content are preserved verbatim. The route returns 201 to
    // the mobile client immediately; enrichment fills in the rest within
    // ~10-30 seconds and the dashboard reviewer sees the polished draft.
    if (created?.id) {
      void import("../services/mobileArticleEnrichment")
        .then(({ enrichArticleAsync }) => enrichArticleAsync(created.id))
        .catch((err) => {
          console.error(`[Mobile API] enrichment hook crashed for ${created.id}:`, err?.message || err);
        });
    }

    res.status(201).json({
      success: true,
      message: kind === "opinion"
        ? "تم استلام مقالتك بنجاح ✨ ستراجعها هيئة التحرير وسيصلك إشعار بالبريد عند النشر."
        : "وصل خبرك إلى غرفة الأخبار 📰 سيراجعه فريق التحرير وسيصلك إشعار بالبريد عند النشر أو الجدولة.",
      article: {
        id: created.id,
        title: created.title,
        slug: created.slug,
        kind,
        status: created.status,
        imagesUploaded: uploadedUrls.length,
      },
    });
  } catch (error: any) {
    console.error("[Mobile API] /articles/submit error:", error);
    if (error?.name === "ZodError") {
      return res.status(400).json({
        success: false,
        message: "بيانات غير صالحة",
        errors: error.errors,
      });
    }
    res.status(500).json({ success: false, message: "تعذر إرسال المحتوى. حاول لاحقاً." });
  }
});

// ==========================================
// Revision-requested articles for the signed-in writer / reporter.
//
// When an editor flips `review_status` to `needs_changes` on an article
// authored by the current user, the dashboard fires an editorial push
// (`needs_revision` type — see `editorialNotifications.ts`). On the web
// the author follows the link to the dashboard ArticleEditor to revise
// & resubmit. The mobile equivalent lives below — three endpoints power
// a "مقالات تنتظر التعديل" card in Settings + the deep-link
// `sabq://draft/<id>` handler:
//
//   GET  /api/v1/articles/my-revisions    → list with reviewNotes
//   GET  /api/v1/articles/:id/draft       → full editable payload
//   PUT  /api/v1/articles/:id/resubmit    → save + flip back to pending
// ==========================================

router.get("/articles/my-revisions", async (req: Request, res: Response) => {
  try {
    const session = await verifyMemberSession(req);
    if (!session) {
      return res.status(401).json({ success: false, message: "غير مصرح" });
    }

    // Use both authorId AND reporterId so reporters with a news byline
    // also see their own pieces — same logic as the dashboard's "my
    // articles" filter. status='draft' is the resting state for both
    // first-time submissions AND revision-requested articles, so the
    // discriminator is reviewStatus='needs_changes'.
    const rows = await db
      .select({
        id: articles.id,
        title: articles.title,
        imageUrl: articles.imageUrl,
        articleType: articles.articleType,
        reviewNotes: articles.reviewNotes,
        reviewedAt: articles.reviewedAt,
        updatedAt: articles.updatedAt,
        createdAt: articles.createdAt,
      })
      .from(articles)
      .where(
        and(
          eq(articles.reviewStatus, "needs_changes"),
          or(
            eq(articles.authorId, session.userId),
            eq(articles.reporterId, session.userId),
          ),
        ),
      )
      .orderBy(desc(articles.reviewedAt));

    res.json({
      success: true,
      count: rows.length,
      articles: rows.map((r) => ({
        id: r.id,
        title: r.title,
        imageUrl: r.imageUrl,
        kind: r.articleType === "opinion" ? "opinion" : "news",
        reviewNotes: r.reviewNotes || "",
        // Surface the moment the editor asked for changes so the UI can
        // show "منذ ساعتين" instead of the original draft creation date.
        requestedAt: (r.reviewedAt ?? r.updatedAt ?? r.createdAt)?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    console.error("[Mobile API] /articles/my-revisions error:", error);
    res.status(500).json({ success: false, message: "تعذر جلب المقالات" });
  }
});

router.get("/articles/:id/draft", async (req: Request, res: Response) => {
  try {
    const session = await verifyMemberSession(req);
    if (!session) {
      return res.status(401).json({ success: false, message: "غير مصرح" });
    }

    const articleId = req.params.id;
    const [article] = await db
      .select({
        id: articles.id,
        title: articles.title,
        content: articles.content,
        excerpt: articles.excerpt,
        imageUrl: articles.imageUrl,
        albumImages: articles.albumImages,
        articleType: articles.articleType,
        status: articles.status,
        reviewStatus: articles.reviewStatus,
        reviewNotes: articles.reviewNotes,
        reviewedAt: articles.reviewedAt,
        authorId: articles.authorId,
        reporterId: articles.reporterId,
        updatedAt: articles.updatedAt,
      })
      .from(articles)
      .where(eq(articles.id, articleId))
      .limit(1);

    if (!article) {
      return res.status(404).json({ success: false, message: "المقال غير موجود" });
    }

    // Ownership check — only the author or reporter on the byline can
    // pull the draft. Editors use the dashboard, not this endpoint.
    if (article.authorId !== session.userId && article.reporterId !== session.userId) {
      return res.status(403).json({ success: false, message: "ليس لديك صلاحية لتعديل هذا المقال" });
    }

    // Convert stored block HTML back to plain text that matches the
    // textarea the submission form uses. Strip tags AND decode HTML
    // entities — without the entity pass the writer sees raw
    // `&nbsp;` / `&amp;` literals in the form (reported 2026-05-20).
    const htmlToPlain = (raw: string): string => {
      const entityMap: Record<string, string> = {
        "&nbsp;": " ",
        "&amp;": "&",
        "&lt;": "<",
        "&gt;": ">",
        "&quot;": '"',
        "&#39;": "'",
        "&apos;": "'",
      };
      return raw
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>\s*<p>/gi, "\n\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&(nbsp|amp|lt|gt|quot|#39|apos);/g, (m) => entityMap[m] ?? m)
        // Catch numeric entities (e.g. &#8211; em-dash, &#1611; tatweel)
        .replace(/&#(\d+);/g, (_m, code: string) => {
          const n = parseInt(code, 10);
          return Number.isFinite(n) ? String.fromCharCode(n) : "";
        })
        .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex: string) => {
          const n = parseInt(hex, 16);
          return Number.isFinite(n) ? String.fromCharCode(n) : "";
        })
        .trim();
    };

    res.json({
      success: true,
      article: {
        id: article.id,
        title: article.title,
        // Convert stored block HTML back to a plain-text body that
        // matches the textarea the submission form uses. The
        // resubmit endpoint will re-wrap it via toMobileArticleHTML.
        body: htmlToPlain(article.content || ""),
        excerpt: article.excerpt || "",
        imageUrl: article.imageUrl,
        albumImages: article.albumImages || [],
        kind: article.articleType === "opinion" ? "opinion" : "news",
        reviewNotes: article.reviewNotes || "",
        requestedAt: (article.reviewedAt ?? article.updatedAt)?.toISOString() ?? null,
        // Surface the current review state so the client can short-circuit
        // to a "you already resubmitted, awaiting review" screen when the
        // user taps the same `needs_revision` notification twice. iOS keys
        // off this to avoid letting the writer submit two edits in a row.
        reviewStatus: article.reviewStatus,
        status: article.status,
      },
    });
  } catch (error) {
    console.error("[Mobile API] /articles/:id/draft error:", error);
    res.status(500).json({ success: false, message: "تعذر جلب المقال" });
  }
});

router.put("/articles/:id/resubmit", async (req: Request, res: Response) => {
  try {
    const session = await verifyMemberSession(req);
    if (!session) {
      return res.status(401).json({ success: false, message: "تسجيل الدخول مطلوب" });
    }

    const articleId = req.params.id;

    const { z } = await import("zod");
    const schema = z.object({
      title: z.string().trim().min(3, "العنوان قصير جداً"),
      content: z.string().trim().min(20, "النص قصير جداً"),
      // Optional new hero — only sent when the writer replaced the
      // existing image. If absent the stored imageUrl is preserved.
      heroImage: z.string().optional(),
      // Optional new album for news kind. Same semantics: omit to
      // keep what's already there.
      albumImages: z.array(z.string()).max(10).optional(),
    });
    const data = schema.parse(req.body);

    const [existing] = await db
      .select({
        id: articles.id,
        authorId: articles.authorId,
        reporterId: articles.reporterId,
        articleType: articles.articleType,
        reviewStatus: articles.reviewStatus,
        imageUrl: articles.imageUrl,
        albumImages: articles.albumImages,
      })
      .from(articles)
      .where(eq(articles.id, articleId))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ success: false, message: "المقال غير موجود" });
    }
    if (existing.authorId !== session.userId && existing.reporterId !== session.userId) {
      return res.status(403).json({ success: false, message: "ليس لديك صلاحية لتعديل هذا المقال" });
    }
    if (existing.reviewStatus !== "needs_changes") {
      return res.status(409).json({
        success: false,
        message: "هذا المقال ليس في حالة \"يحتاج تعديل\"",
      });
    }

    // Hero + album handling. New base64 images use the same canonical
    // R2-rollout service as /articles/submit; existing HTTPS URLs pass through.
    const uploadDataUrl = async (dataUrl: string, idHint: string): Promise<string | null> => {
      const m = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp|gif|heic|heif);base64,(.+)$/i);
      if (!m) return null;
      const mimeType = `image/${m[1].toLowerCase() === "heif" ? "heic" : m[1].toLowerCase()}`;
      const buffer = Buffer.from(m[2], "base64");
      const result = await newsImageStorageService.upload({
        buffer,
        filename: `${idHint}.${m[1]}`,
        mimeType,
        purpose: "mobile-article-revision",
        metadata: { source: "mobile-app", articleId },
        rolloutKey: `${session.userId}:${idHint}`,
      });
      return result.success && result.deliveryUrl ? result.deliveryUrl : null;
    };

    let heroImageUrl = existing.imageUrl;
    if (data.heroImage !== undefined) {
      if (data.heroImage.startsWith("data:")) {
        try {
          const url = await uploadDataUrl(
            data.heroImage,
            `mobile-revision-${articleId}-hero-${Date.now()}`,
          );
          if (url) heroImageUrl = url;
        } catch (err) {
          console.error("[Mobile API] /articles/:id/resubmit hero upload failed:", err);
        }
      } else if (data.heroImage.startsWith("http")) {
        heroImageUrl = data.heroImage;
      }
    }

    let albumUrls: string[] | null = null;
    if (data.albumImages !== undefined) {
      albumUrls = [];
      for (const img of data.albumImages) {
        if (img.startsWith("data:")) {
          try {
            const url = await uploadDataUrl(
              img,
              `mobile-revision-${articleId}-album-${Date.now()}-${albumUrls.length}`,
            );
            if (url) albumUrls.push(url);
          } catch (err) {
            console.error("[Mobile API] /articles/:id/resubmit album upload failed:", err);
          }
        } else if (img.startsWith("http")) {
          albumUrls.push(img);
        }
      }
    }

    const htmlContent = toMobileArticleHTML(data.content);
    const plainExcerpt = data.content
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 220);

    const updates: any = {
      title: data.title.trim(),
      content: htmlContent,
      excerpt: plainExcerpt,
      imageUrl: heroImageUrl,
      // Flip the review state so the editor sees this in their queue
      // again. `pending_review` matches the dashboard's existing filter
      // (ArticlesManagement.tsx) and triggers the standard editor
      // alert when the audit pipeline picks it up.
      reviewStatus: "pending_review",
      // PRESERVE reviewNotes + reviewedAt + reviewedBy — the dashboard
      // uses these (via `isResubmittedAfterRevision` in
      // client/src/lib/articleRevision.ts) to paint the amber
      // "resubmitted" stripe on the row, so editors can tell apart
      // brand-new drafts from drafts that came back after a revision
      // request. Wiping them made resubmissions look like first-time
      // submissions in the dashboard (reported 2026-05-20).
      //
      // Safe to keep: /articles/my-revisions filters on
      // reviewStatus='needs_changes' only, so the writer won't see
      // the same article in their revision queue twice — they're
      // out of the queue the moment reviewStatus flips here.
      updatedAt: new Date(),
    };
    if (albumUrls !== null) updates.albumImages = albumUrls;

    const [updated] = await db
      .update(articles)
      .set(updates)
      .where(eq(articles.id, articleId))
      .returning({
        id: articles.id,
        title: articles.title,
        slug: articles.slug,
        status: articles.status,
        reviewStatus: articles.reviewStatus,
        articleType: articles.articleType,
      });

    console.log(`[Mobile API] /articles/${articleId}/resubmit by ${session.userId}`);

    // Shape the response so the iOS `ArticleSubmissionResponse`
    // decoder doesn't need any optional gymnastics — `kind` is the
    // field the decoder requires alongside id/title/status. Without
    // it, the iOS client treated a successful save as a decode
    // failure and showed "تعذر إرسال التعديل" even though the row
    // had already been updated (reported 2026-05-20).
    res.json({
      success: true,
      message: "تم إرسال التعديل بنجاح. سيراجعه فريق التحرير قريباً.",
      article: {
        id: updated.id,
        title: updated.title,
        slug: updated.slug,
        kind: updated.articleType === "opinion" ? "opinion" : "news",
        status: updated.status,
      },
    });
  } catch (error: any) {
    console.error("[Mobile API] /articles/:id/resubmit error:", error);
    if (error?.name === "ZodError") {
      return res.status(400).json({
        success: false,
        message: "بيانات غير صالحة",
        errors: error.errors,
      });
    }
    res.status(500).json({ success: false, message: "تعذر إرسال التعديل. حاول لاحقاً." });
  }
});

// ==========================================
// GET /api/v1/insights/today
// Personal "knowledge journey" payload for the mobile home screen. Mirrors
// `/api/ai/insights/today` from `routes.ts` exactly (same shape) but
// authenticates via the mobile Bearer-token session — the web route lives
// behind the Passport session middleware and 401s for iOS callers per the
// [[sabq-ios-mobile-auth]] rule.
// ==========================================
router.get("/insights/today", async (req: Request, res: Response) => {
  try {
    const session = await verifyMemberSession(req);
    if (!session) {
      return res.status(401).json({ success: false, message: "تسجيل الدخول مطلوب" });
    }

    const { readingHistory, reactions } = await import("@shared/schema");

    const [user] = await db
      .select({ id: users.id, firstName: users.firstName, email: users.email })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);

    if (!user) {
      return res.status(404).json({ success: false, message: "المستخدم غير موجود" });
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    // 1. Reading history today
    const readingHistoryToday = await db
      .select({ articleId: readingHistory.articleId })
      .from(readingHistory)
      .where(and(
        eq(readingHistory.userId, session.userId),
        gte(readingHistory.readAt, startOfDay)
      ));
    const articlesReadToday = readingHistoryToday.length;
    const readingTimeMinutes = articlesReadToday * 3; // same 3-min-per-article estimate as web

    // 2. Likes today
    const likesToday = await db
      .select({ id: reactions.id })
      .from(reactions)
      .where(and(
        eq(reactions.userId, session.userId),
        eq(reactions.type, "like"),
        gte(reactions.createdAt, startOfDay)
      ));
    const likesCount = likesToday.length;

    // 3. Comments today
    const commentsToday = await db
      .select({ id: comments.id })
      .from(comments)
      .where(and(
        eq(comments.userId, session.userId),
        gte(comments.createdAt, startOfDay)
      ));
    const commentsCount = commentsToday.length;

    // 4. Top interests today (top 3 category names by frequency)
    const articleIds = readingHistoryToday.map(r => r.articleId).filter((v): v is string => !!v);
    let topInterests: string[] = [];
    if (articleIds.length > 0) {
      const articlesWithCategories = await db
        .select({ categoryId: articles.categoryId })
        .from(articles)
        .where(inArray(articles.id, articleIds));

      const frequency = new Map<string, number>();
      for (const row of articlesWithCategories) {
        if (row.categoryId) {
          frequency.set(row.categoryId, (frequency.get(row.categoryId) || 0) + 1);
        }
      }
      const topCategoryIds = Array.from(frequency.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([id]) => id);

      if (topCategoryIds.length > 0) {
        const categoryRows = await db
          .select({ id: categories.id, nameAr: categories.nameAr })
          .from(categories)
          .where(inArray(categories.id, topCategoryIds));

        topInterests = topCategoryIds
          .map(id => categoryRows.find(c => c.id === id)?.nameAr)
          .filter((n): n is string => !!n);
      }
    }

    // 5. Daily completion rate (goal = 3 articles, capped at 100)
    const DAILY_GOAL = 3;
    const completionRate = articlesReadToday > 0
      ? Math.min(100, Math.round((articlesReadToday / DAILY_GOAL) * 100))
      : 0;

    // 6. Encouragement phrase (same buckets as web)
    let aiPhrase = "ابدأ رحلتك المعرفية اليوم";
    if (articlesReadToday === 0) {
      aiPhrase = "لم تقرأ أي مقال بعد اليوم، ابدأ الآن";
    } else if (articlesReadToday <= 3) {
      aiPhrase = "بداية جيدة! استمر في القراءة";
    } else if (articlesReadToday <= 7) {
      aiPhrase = "ممتاز! ذكاؤك القرائي يرتفع يوماً بعد يوم";
    } else {
      aiPhrase = "رائع! أنت قارئ متميز اليوم";
    }

    // Compute the greeting word against Asia/Riyadh instead of the
    // server's local timezone — Railway runs in UTC, so `getHours()`
    // there returns 11 when it's 2 PM in Riyadh and the user used to
    // see "صباح الخير" for the entire local afternoon. Intl gives us a
    // tz-aware hour without pulling in a date lib.
    const riyadhHour = parseInt(
      new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        hour12: false,
        timeZone: "Asia/Riyadh",
      }).format(new Date()),
      10,
    );
    const greetingWord = riyadhHour < 12 ? "صباح الخير"
      : riyadhHour < 17 ? "نهارك سعيد"
      : riyadhHour < 21 ? "مساء الخير"
      : "ليلة سعيدة";
    const firstName = user.firstName || user.email?.split("@")[0] || "عزيزي";

    res.json({
      greeting: `${greetingWord} يا ${firstName}`,
      metrics: {
        readingTime: readingTimeMinutes,
        completionRate,
        likes: likesCount,
        comments: commentsCount,
        articlesRead: articlesReadToday,
      },
      topInterests,
      aiPhrase,
      quickSummary: articlesReadToday > 0
        ? `قرأت ${articlesReadToday} ${articlesReadToday === 1 ? "مقال" : "مقالات"} اليوم بإجمالي ${readingTimeMinutes} دقيقة.`
        : "لم تقرأ أي مقال اليوم بعد.",
    });
  } catch (error) {
    console.error("[Mobile API] /insights/today error:", error);
    res.status(500).json({ success: false, message: "تعذر جلب البيانات" });
  }
});

// ==========================================
// Unified Behavior Tracking (iOS → web parity)
// POST /api/v1/behavior/track
//
// One endpoint for every reader-side signal the iOS app can produce.
// Mirrors the web's reading_history + reactions writes so the same
// `/api/v1/insights/today` aggregator (and the trending opinion query)
// see iOS and web identically.
//
// Event types:
//   - `view`     fired on article open. Bumps articles.views (matches
//                the existing /articles/:id/view boost) and upserts a
//                reading_history seed row (readDuration = 0).
//   - `read`    fired on close / background / scroll-end. Updates the
//                same reading_history row with dwell + scroll +
//                completionRate. Pure UPDATE — does NOT bump views.
//   - `like`    inserts into reactions (idempotent on user+article).
//   - `unlike`  deletes the reaction row.
//
// All writes are scoped to the Bearer-token member. Anonymous iOS
// users (no token) get a 401 — they should still hit
// /articles/:id/view directly, which already works without auth.
// ==========================================
router.post("/behavior/track", async (req: Request, res: Response) => {
  try {
    const session = await verifyMemberSession(req);
    if (!session) {
      return res.status(401).json({ success: false, message: "تسجيل الدخول مطلوب" });
    }

    const { z } = await import("zod");
    const schema = z.object({
      articleId: z.string().min(1),
      eventType: z.enum(["view", "read", "like", "unlike"]),
      dwellSeconds: z.number().int().min(0).max(60 * 60 * 6).optional(),
      scrollDepth: z.number().int().min(0).max(100).optional(),
      completionRate: z.number().int().min(0).max(100).optional(),
      platform: z.enum(["ios", "android", "web"]).default("ios"),
    });

    const data = schema.parse(req.body);

    const [article] = await db
      .select({ id: articles.id })
      .from(articles)
      .where(eq(articles.id, data.articleId))
      .limit(1);
    if (!article) {
      return res.status(404).json({ success: false, message: "المقال غير موجود" });
    }

    if (data.eventType === "view") {
      // Bump global counter (random 5-10 boost — same shape as
      // /articles/:id/view so trending stays internally consistent).
      const boostOptions = [5, 6, 7, 8, 9, 10];
      const randomBoost = boostOptions[Math.floor(Math.random() * boostOptions.length)];
      bufferArticleViewIncrement(data.articleId, randomBoost);

      // Seed a reading_history row so insights/today and trending can
      // count this open. We do NOT upsert here — every open is a
      // separate session row (matches how the web's
      // /api/me/reading-history records dedup per timestamp).
      await db.insert(readingHistory).values({
        userId: session.userId,
        articleId: data.articleId,
        readDuration: 0,
        scrollDepth: 0,
        completionRate: 0,
        platform: data.platform,
        deviceType: "mobile",
      });

      return res.json({ success: true });
    }

    if (data.eventType === "read") {
      // Update the most recent reading_history row for this user+article.
      // If none exists (e.g. iOS missed firing `view`), insert a fresh
      // row so the stats don't drop the session.
      const [existing] = await db
        .select({ id: readingHistory.id })
        .from(readingHistory)
        .where(and(
          eq(readingHistory.userId, session.userId),
          eq(readingHistory.articleId, data.articleId),
        ))
        .orderBy(desc(readingHistory.readAt))
        .limit(1);

      const engagementScore = computeEngagementScore({
        dwellSeconds: data.dwellSeconds ?? 0,
        scrollDepth: data.scrollDepth ?? 0,
        completionRate: data.completionRate ?? 0,
      });

      if (existing) {
        await db.update(readingHistory)
          .set({
            readDuration: data.dwellSeconds ?? 0,
            scrollDepth: data.scrollDepth ?? 0,
            completionRate: data.completionRate ?? 0,
            engagementScore,
            platform: data.platform,
            deviceType: "mobile",
          })
          .where(eq(readingHistory.id, existing.id));
      } else {
        await db.insert(readingHistory).values({
          userId: session.userId,
          articleId: data.articleId,
          readDuration: data.dwellSeconds ?? 0,
          scrollDepth: data.scrollDepth ?? 0,
          completionRate: data.completionRate ?? 0,
          engagementScore,
          platform: data.platform,
          deviceType: "mobile",
        });
      }

      return res.json({ success: true });
    }

    if (data.eventType === "like" || data.eventType === "unlike") {
      const [existing] = await db
        .select({ id: reactions.id })
        .from(reactions)
        .where(and(
          eq(reactions.userId, session.userId),
          eq(reactions.articleId, data.articleId),
          eq(reactions.type, "like"),
        ))
        .limit(1);

      if (data.eventType === "like" && !existing) {
        await db.insert(reactions).values({
          userId: session.userId,
          articleId: data.articleId,
          type: "like",
        });
      } else if (data.eventType === "unlike" && existing) {
        await db.delete(reactions).where(eq(reactions.id, existing.id));
      }

      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(reactions)
        .where(and(
          eq(reactions.articleId, data.articleId),
          eq(reactions.type, "like"),
        ));

      return res.json({
        success: true,
        liked: data.eventType === "like",
        likesCount: Number(count) || 0,
      });
    }

    return res.json({ success: true });
  } catch (error: any) {
    if (error?.name === "ZodError") {
      return res.status(400).json({ success: false, message: "بيانات غير صحيحة", issues: error.issues });
    }
    console.error("[Mobile API] /behavior/track error:", error);
    res.status(500).json({ success: false, message: "تعذر تسجيل الحدث" });
  }
});

// Weighted score (0..1) used to power reading_history.engagementScore.
// Dwell saturates at 5 minutes (heuristic — past that signal is noise
// from leaving the screen open). Scroll + completion contribute the
// other two thirds. Same shape as the web `eventTrackingService.ts`
// boost rules so the two pipelines stay comparable.
function computeEngagementScore(input: {
  dwellSeconds: number;
  scrollDepth: number;
  completionRate: number;
}): number {
  const dwellNormalized = Math.min(1, input.dwellSeconds / 300);
  const scrollNormalized = Math.min(1, Math.max(0, input.scrollDepth) / 100);
  const completionNormalized = Math.min(1, Math.max(0, input.completionRate) / 100);
  const raw = dwellNormalized * 0.3 + scrollNormalized * 0.3 + completionNormalized * 0.4;
  return Math.round(raw * 1000) / 1000;
}

// ==========================================
// Like / Unlike an article from iOS
// POST /api/v1/articles/:id/react        — toggles like
// GET  /api/v1/articles/:id/react        — { liked, likesCount }
//
// Thin convenience wrappers around the reactions table. The same
// state can be set/read via /behavior/track but the dedicated routes
// keep ArticleDetailView's like-button logic tidy.
// ==========================================
router.get("/articles/:id/react", async (req: Request, res: Response) => {
  try {
    const session = await verifyMemberSession(req);
    const articleId = req.params.id;

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(reactions)
      .where(and(
        eq(reactions.articleId, articleId),
        eq(reactions.type, "like"),
      ));

    let liked = false;
    if (session) {
      const [own] = await db
        .select({ id: reactions.id })
        .from(reactions)
        .where(and(
          eq(reactions.userId, session.userId),
          eq(reactions.articleId, articleId),
          eq(reactions.type, "like"),
        ))
        .limit(1);
      liked = !!own;
    }

    res.json({ liked, likesCount: Number(count) || 0 });
  } catch (error) {
    console.error("[Mobile API] GET /articles/:id/react error:", error);
    res.status(500).json({ success: false, message: "تعذر جلب الحالة" });
  }
});

router.post("/articles/:id/react", async (req: Request, res: Response) => {
  try {
    const session = await verifyMemberSession(req);
    if (!session) {
      return res.status(401).json({ success: false, message: "تسجيل الدخول مطلوب" });
    }
    const articleId = req.params.id;

    const [article] = await db
      .select({ id: articles.id })
      .from(articles)
      .where(eq(articles.id, articleId))
      .limit(1);
    if (!article) {
      return res.status(404).json({ success: false, message: "المقال غير موجود" });
    }

    const [existing] = await db
      .select({ id: reactions.id })
      .from(reactions)
      .where(and(
        eq(reactions.userId, session.userId),
        eq(reactions.articleId, articleId),
        eq(reactions.type, "like"),
      ))
      .limit(1);

    let liked: boolean;
    if (existing) {
      await db.delete(reactions).where(eq(reactions.id, existing.id));
      liked = false;
    } else {
      await db.insert(reactions).values({
        userId: session.userId,
        articleId,
        type: "like",
      });
      liked = true;
    }

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(reactions)
      .where(and(
        eq(reactions.articleId, articleId),
        eq(reactions.type, "like"),
      ));

    res.json({ liked, likesCount: Number(count) || 0 });
  } catch (error) {
    console.error("[Mobile API] POST /articles/:id/react error:", error);
    res.status(500).json({ success: false, message: "تعذر تسجيل التفاعل" });
  }
});

// ==========================================
// APNs token registration (native iOS push)
// POST   /api/v1/members/push-token
// DELETE /api/v1/members/push-token
// ==========================================
// Native iOS calls these directly after `application:didRegister…`. We
// upsert into `pushDevices` keyed on `deviceToken` (unique) so the same
// device + user combination never produces duplicate rows. On logout the
// iOS app DELETEs by token so we stop targeting that device.
router.post("/members/push-token", async (req: Request, res: Response) => {
  try {
    const session = await verifyMemberSession(req);
    if (!session) {
      return res.status(401).json({ success: false, message: "تسجيل الدخول مطلوب" });
    }

    const { pushDevices } = await import("@shared/schema");
    const { z } = await import("zod");
    const schema = z.object({
      token: z.string().min(20),                  // APNs hex tokens are 64 chars
      provider: z.enum(["apns", "fcm"]).default("apns"),
      platform: z.enum(["ios", "android"]).default("ios"),
      deviceName: z.string().optional(),
      osVersion: z.string().optional(),
      appVersion: z.string().optional(),
      locale: z.string().optional(),
      timezone: z.string().optional(),
      bundleId: z.string().max(255).optional(),
      installationId: z.string().max(128).optional(),
    });
    const data = schema.parse(req.body);
    const safeBundleId = data.bundleId && data.bundleId.length > 0 ? data.bundleId : undefined;
    const safeInstallationId =
      data.installationId && data.installationId.length > 0 ? data.installationId : undefined;

    // Defensive truncation. The `push_devices.locale` column is varchar(10);
    // some iOS versions return a fully-qualified locale identifier like
    // "ar_SA@calendar=gregorian;numbers=latn" that overflows it. We only
    // need the language tag for routing — strip everything past `_` /  `@`.
    const safeLocale = (data.locale || "ar")
      .replace(/@.*/, "")
      .replace(/_.*$/, "")
      .slice(0, 10);

    const baseValues = {
      userId: session.userId,
      tokenProvider: data.provider,
      platform: data.platform,
      ...(safeBundleId ? { bundleId: safeBundleId } : {}),
      deviceName: data.deviceName,
      osVersion: data.osVersion,
      appVersion: data.appVersion,
      locale: safeLocale,
      timezone: data.timezone,
      isActive: true,
      lastActiveAt: new Date(),
      updatedAt: new Date(),
    };
    const baseWithInstall = {
      ...baseValues,
      ...(safeInstallationId ? { installationId: safeInstallationId } : {}),
    };

    // دوران token يخص تثبيتًا واحدًا، لا كل أجهزة المستخدم. عند غياب
    // installationId لا نخمّن: إبقاء الجهاز الثاني فعالًا أهم من تنظيف token
    // قديم، وسيتولى رد المزود غير الصالح تعطيله لاحقًا.
    const deactivated = safeInstallationId
      ? await db
          .update(pushDevices)
          .set({ isActive: false, updatedAt: new Date() })
          .where(and(
            eq(pushDevices.userId, session.userId),
            eq(pushDevices.platform, data.platform),
            sql`${pushDevices.bundleId} IS NOT DISTINCT FROM ${safeBundleId ?? null}`,
            eq(pushDevices.installationId, safeInstallationId),
            sql`${pushDevices.deviceToken} != ${data.token}`,
            eq(pushDevices.isActive, true)
          ))
          .returning({ id: pushDevices.id })
      : [];

    if (deactivated.length > 0) {
      console.log(`[Mobile API] /push-token deactivated ${deactivated.length} old tokens for user=${session.userId}`);
    }

    // upsert ذري على القيد الفريد device_token.
    //
    // كان الكود يقرأ الصف أولًا ثم يقرر UPDATE أو INSERT — وهذه نافذة سباق
    // حقيقية: تطبيق iOS يسجّل الرمز عند الإقلاع وعند العودة للمقدمة، فيصل
    // طلبان متزامنان يريان كلاهما «غير موجود» فيصطدم الثاني بـ
    // push_devices_device_token_key (لوق 2026-07-25 05:10). ON CONFLICT يزيل
    // النافذة كليًا ويوفّر ذهابًا وإيابًا إلى القاعدة في كل نداء.
    const persist = async (values: Record<string, unknown>) => {
      await db.insert(pushDevices)
        .values({ ...values, deviceToken: data.token } as any)
        .onConflictDoUpdate({
          target: pushDevices.deviceToken,
          set: values as any,
        });
    };

    try {
      await persist(baseWithInstall);
    } catch (err: any) {
      // الشرط القديم كان `/installation_id/i.test(err.message)` — ورسالة
      // DrizzleQueryError تحتوي **نص الاستعلام كاملًا**، وفيه اسم العمود
      // "installation_id". فأي خطأ على هذا الإدراج كان يطابق التعبير فتُعاد
      // المحاولة بلا داعٍ ويُطبع لوق مضلل «installation_id missing». الفحص
      // الصحيح على كود PostgreSQL: 42703 = undefined_column.
      const code = err?.cause?.code ?? err?.code;
      if (code !== "42703") throw err;
      console.warn("[Mobile API] /push-token: عمود installation_id غير موجود — الحفظ بدونه");
      await persist(baseValues);
    }

    console.log(`[Mobile API] /push-token registered (user=${session.userId} provider=${data.provider})`);
    res.json({ success: true, message: "تم تفعيل الإشعارات" });
  } catch (error: any) {
    console.error("[Mobile API] /push-token error:", error);
    if (error?.name === "ZodError") {
      return res.status(400).json({ success: false, message: "بيانات غير صالحة", errors: error.errors });
    }
    res.status(500).json({ success: false, message: "تعذر تسجيل الجهاز" });
  }
});

router.delete("/members/push-token", async (req: Request, res: Response) => {
  try {
    const session = await verifyMemberSession(req);
    if (!session) {
      return res.status(401).json({ success: false, message: "تسجيل الدخول مطلوب" });
    }

    const { pushDevices } = await import("@shared/schema");
    const token = typeof req.body?.token === "string" ? req.body.token : null;
    if (!token) {
      return res.status(400).json({ success: false, message: "device token مطلوب" });
    }

    await db.update(pushDevices)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(
        eq(pushDevices.deviceToken, token),
        eq(pushDevices.userId, session.userId),
      ));

    res.json({ success: true });
  } catch (error) {
    console.error("[Mobile API] DELETE /push-token error:", error);
    res.status(500).json({ success: false, message: "تعذر إلغاء تفعيل الجهاز" });
  }
});

// ==========================================
// Sports follows + match-event alert preferences (native apps)
// GET/POST/DELETE /api/v1/sports/follows
// GET/PUT        /api/v1/sports/alert-prefs
// ==========================================
// النسخة المعتمِدة على جلسة العضو (Bearer) من مسارات الويب /api/sports/follows
// (التي تتطلّب جلسة Passport). متابعة الفريق + تفضيلات أنواع أحداث الإشعار العامّة
// (انطلاق/أهداف/بطاقات/فار/نهاية) تُغذّي جوب التنبيهات الرياضية.
router.get("/sports/follows", async (req: Request, res: Response) => {
  try {
    const session = await verifyMemberSession(req);
    if (!session) return res.status(401).json({ success: false, message: "تسجيل الدخول مطلوب" });
    const { listFollows } = await import("../services/sportsFollowsService");
    const follows = await listFollows(session.userId);
    res.set("Cache-Control", "private, no-store");
    res.json({ success: true, follows });
  } catch (error) {
    console.error("[Mobile API] GET /sports/follows error:", error);
    res.status(502).json({ success: false, message: "تعذر جلب متابعاتك حاليًا" });
  }
});

router.post("/sports/follows", async (req: Request, res: Response) => {
  try {
    const session = await verifyMemberSession(req);
    if (!session) return res.status(401).json({ success: false, message: "تسجيل الدخول مطلوب" });
    const { addFollow, isValidFollowKind } = await import("../services/sportsFollowsService");
    const { kind, refId, refName, refLogo } = req.body ?? {};
    if (!isValidFollowKind(kind) || !refId || !refName) {
      return res.status(400).json({ success: false, message: "بيانات المتابعة غير مكتملة" });
    }
    const follow = await addFollow(session.userId, {
      kind,
      refId: String(refId),
      refName: String(refName),
      refLogo: refLogo ? String(refLogo) : null,
    });
    res.set("Cache-Control", "private, no-store");
    res.json({ success: true, follow });
  } catch (error) {
    console.error("[Mobile API] POST /sports/follows error:", error);
    res.status(502).json({ success: false, message: "تعذر حفظ المتابعة حاليًا" });
  }
});

router.delete("/sports/follows", async (req: Request, res: Response) => {
  try {
    const session = await verifyMemberSession(req);
    if (!session) return res.status(401).json({ success: false, message: "تسجيل الدخول مطلوب" });
    const { removeFollow, isValidFollowKind } = await import("../services/sportsFollowsService");
    const kind = (req.query.kind ?? req.body?.kind) as unknown;
    const refId = (req.query.refId ?? req.body?.refId) as unknown;
    if (!isValidFollowKind(kind) || !refId) {
      return res.status(400).json({ success: false, message: "بيانات إلغاء المتابعة غير مكتملة" });
    }
    await removeFollow(session.userId, kind, String(refId));
    res.set("Cache-Control", "private, no-store");
    res.json({ success: true });
  } catch (error) {
    console.error("[Mobile API] DELETE /sports/follows error:", error);
    res.status(502).json({ success: false, message: "تعذر إلغاء المتابعة حاليًا" });
  }
});

router.get("/sports/alert-prefs", async (req: Request, res: Response) => {
  try {
    const session = await verifyMemberSession(req);
    if (!session) return res.status(401).json({ success: false, message: "تسجيل الدخول مطلوب" });
    const { getPrefs } = await import("../services/sportsAlertPrefsService");
    const preferences = await getPrefs(session.userId);
    res.set("Cache-Control", "private, no-store");
    res.json({ success: true, preferences });
  } catch (error) {
    console.error("[Mobile API] GET /sports/alert-prefs error:", error);
    res.status(502).json({ success: false, message: "تعذر جلب تفضيلات الإشعارات" });
  }
});

router.put("/sports/alert-prefs", async (req: Request, res: Response) => {
  try {
    const session = await verifyMemberSession(req);
    if (!session) return res.status(401).json({ success: false, message: "تسجيل الدخول مطلوب" });
    const { upsertPrefs } = await import("../services/sportsAlertPrefsService");
    const body = req.body ?? {};
    const patch: Record<string, boolean> = {};
    for (const key of ["kickoff", "goals", "cards", "varReview", "fulltime", "transfersSaudi", "transfersGlobal", "smartSnaps"] as const) {
      if (typeof body[key] === "boolean") patch[key] = body[key];
    }
    const preferences = await upsertPrefs(session.userId, patch);
    res.set("Cache-Control", "private, no-store");
    res.json({ success: true, preferences });
  } catch (error) {
    console.error("[Mobile API] PUT /sports/alert-prefs error:", error);
    res.status(502).json({ success: false, message: "تعذر حفظ تفضيلات الإشعارات" });
  }
});

router.get("/sports/snaps", async (req: Request, res: Response) => {
  try {
    const session = await verifyMemberSession(req);
    if (!session) return res.status(401).json({ success: false, message: "تسجيل الدخول مطلوب" });
    const { isSportsSnapsEnabled } = await import("../services/sportsSnaps/config");
    if (!isSportsSnapsEnabled()) return res.status(404).json({ success: false, message: "غير متاح" });
    const { getCachedUserFeed, SNAPS_FEED_CACHE_TTL_MS } = await import("../services/sportsSnaps/feed");
    const snaps = await getCachedUserFeed(session.userId);
    // الخادم يكاش الخلاصة 30 ثانية (single-flight عبر withSWR)، فالترويسة
    // تعكس الواقع: كاش خاص قصير بنفس مدة TTL بدل no-store.
    res.set("Cache-Control", `private, max-age=${Math.floor(SNAPS_FEED_CACHE_TTL_MS / 1000)}`);
    res.json({ success: true, snaps });
  } catch (error) {
    console.error("[Mobile API] GET /sports/snaps error:", error);
    res.status(502).json({ success: false, message: "تعذر جلب اللقطات الذكية", snaps: [] });
  }
});

router.post("/sports/engagement", async (req: Request, res: Response) => {
  try {
    const session = await verifyMemberSession(req);
    if (!session) return res.status(401).json({ success: false, message: "تسجيل الدخول مطلوب" });
    const body = req.body ?? {};
    if (body.kind !== "match_view") {
      return res.status(400).json({ success: false, message: "نوع التفاعل غير مدعوم" });
    }
    const fixtureId = Number(body.fixtureId);
    if (!Number.isInteger(fixtureId) || fixtureId <= 0) {
      return res.status(400).json({ success: false, message: "معرّف المباراة غير صالح" });
    }
    const { recordMatchView } = await import("../services/sportsSnaps/engagement");
    await recordMatchView(session.userId, {
      fixtureId,
      homeId: body.homeId == null ? null : Number(body.homeId),
      awayId: body.awayId == null ? null : Number(body.awayId),
      competitionSlug: body.competitionSlug ? String(body.competitionSlug) : null,
    });
    res.set("Cache-Control", "private, no-store");
    res.json({ success: true });
  } catch (error) {
    console.error("[Mobile API] POST /sports/engagement error:", error);
    res.status(502).json({ success: false, message: "تعذر حفظ التفاعل" });
  }
});

// ==========================================
// محرّك الذكاء الرياضي (VARA Intelligence) — نظائر الموبايل.
//   GET  /api/v1/sports/intel/digest   الموجز المخصّص (جلسة العضو)
//   POST /api/v1/sports/intel/ask      المساعد المحادثي (عام)
// «المشهد/بطاقة المباراة/قصص الموسم» عامة تُقرأ مباشرة من /api/sports/intel/*
// (طرق GET بلا حماية CSRF)؛ الموجز يحتاج متابعات العضو، والمساعد POST فيلزم
// إعفاء CSRF المتوفّر لكل مسارات /api/v1/*.
// ==========================================
router.get("/sports/intel/digest", async (req: Request, res: Response) => {
  try {
    const session = await verifyMemberSession(req);
    if (!session) return res.status(401).json({ success: false, message: "تسجيل الدخول مطلوب" });
    const { isSaudiLeagueConfigured } = await import("../services/saudiLeagueService");
    const { buildDigest } = await import("../services/sportsIntelligence");
    if (!isSaudiLeagueConfigured()) return res.json({ success: true, configured: false, digest: null });
    const digest = await buildDigest(session.userId);
    res.set("Cache-Control", "private, no-store");
    res.json({ success: true, configured: true, digest });
  } catch (error) {
    console.error("[Mobile API] GET /sports/intel/digest error:", error);
    res.status(502).json({ success: false, message: "تعذّر تجهيز موجزك حاليًا" });
  }
});

router.post("/sports/intel/ask", async (req: Request, res: Response) => {
  try {
    const { isSaudiLeagueConfigured } = await import("../services/saudiLeagueService");
    const { askCopilot } = await import("../services/sportsIntelligence");
    const question = String(req.body?.question ?? "").trim();
    if (!question) return res.status(400).json({ success: false, message: "اكتب سؤالك أولاً" });
    if (question.length > 400) return res.status(400).json({ success: false, message: "السؤال طويل جدًا" });
    if (!isSaudiLeagueConfigured()) return res.json({ success: true, configured: false, answer: null });
    const result = await askCopilot(question);
    res.set("Cache-Control", "private, no-store");
    res.json({ success: true, configured: true, ...(result ?? { answer: null }) });
  } catch (error) {
    console.error("[Mobile API] POST /sports/intel/ask error:", error);
    res.status(502).json({ success: false, message: "تعذّر الإجابة حاليًا" });
  }
});

// توقّعات المباريات صارت حصريًا على المنصة المركزية /api/v1/predictions/*
// (predictionsMobile.ts) — مسارات sports_pool القديمة حُذفت في #938؛ لا
// تُعِد أي نظير لها هنا.

// ==========================================
// Live Activity push tokens (iOS lock-screen live match)
// POST /api/v1/live-activity/register   { fixtureId, token }
// POST /api/v1/live-activity/end        { token }
// PUT  /api/v1/live-activity/start-token { token, deviceId? }
// DELETE /api/v1/live-activity/start-token { token }
// ==========================================
// عام (لا يتطلب تسجيل دخول): النشاط المباشر قد يعمل لزائر غير مسجّل. نلتقط
// userId إن وُجدت جلسة فقط. التوكن هنا توكن ActivityKit (مختلف عن توكن الجهاز).
router.post("/live-activity/register", async (req: Request, res: Response) => {
  try {
    const { registerLiveActivityToken } = await import("../services/liveActivityService");
    const fixtureId = Number(req.body?.fixtureId);
    const token = typeof req.body?.token === "string" ? req.body.token : null;
    const bundleId =
      typeof req.body?.bundleId === "string" && req.body.bundleId.length > 0 && req.body.bundleId.length <= 255
        ? req.body.bundleId
        : null;
    if (!Number.isFinite(fixtureId) || !token || token.length < 20) {
      return res.status(400).json({ success: false, message: "fixtureId/token مطلوبان" });
    }
    if (token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken[")) {
      return res.status(400).json({ success: false, message: "توكن غير صالح" });
    }

    let userId: string | null = null;
    try {
      const session = await verifyMemberSession(req);
      userId = session?.userId ?? null;
    } catch { /* زائر */ }

    await registerLiveActivityToken(fixtureId, token, userId, bundleId);
    res.json({ success: true });
  } catch (error) {
    console.error("[Mobile API] /live-activity/register error:", error);
    res.status(500).json({ success: false, message: "تعذر تسجيل النشاط المباشر" });
  }
});

router.post("/live-activity/end", async (req: Request, res: Response) => {
  try {
    const { endLiveActivityToken } = await import("../services/liveActivityService");
    const token = typeof req.body?.token === "string" ? req.body.token : null;
    if (!token) {
      return res.status(400).json({ success: false, message: "token مطلوب" });
    }
    await endLiveActivityToken(token);
    res.json({ success: true });
  } catch (error) {
    console.error("[Mobile API] /live-activity/end error:", error);
    res.status(500).json({ success: false, message: "تعذر إنهاء النشاط المباشر" });
  }
});

router.put("/live-activity/start-token", async (req: Request, res: Response) => {
  try {
    const session = await verifyMemberSession(req);
    if (!session) {
      return res.status(401).json({ success: false, message: "تسجيل الدخول مطلوب" });
    }
    const token = typeof req.body?.token === "string" ? req.body.token.trim().toLowerCase() : "";
    const rawDeviceId = typeof req.body?.deviceId === "string" ? req.body.deviceId.trim() : "";
    const deviceId = rawDeviceId.length > 0 && rawDeviceId.length <= 255 ? rawDeviceId : null;
    // ActivityKit tokens are raw bytes represented as lowercase hexadecimal.
    if (!/^[0-9a-f]{40,512}$/.test(token)) {
      return res.status(400).json({ success: false, message: "توكن ActivityKit غير صالح" });
    }
    const { registerLiveActivityStartToken } = await import("../services/liveActivityStartService");
    await registerLiveActivityStartToken({
      userId: session.userId,
      pushToken: token,
      bundleId: process.env.APNS_SPORTS_BUNDLE_ID || "com.sabq.sports",
      deviceId,
    });
    res.json({ success: true });
  } catch (error) {
    console.error("[Mobile API] PUT /live-activity/start-token error:", error);
    res.status(500).json({ success: false, message: "تعذر تسجيل البدء التلقائي" });
  }
});

router.delete("/live-activity/start-token", async (req: Request, res: Response) => {
  try {
    const session = await verifyMemberSession(req);
    if (!session) {
      return res.status(401).json({ success: false, message: "تسجيل الدخول مطلوب" });
    }
    const token = typeof req.body?.token === "string" ? req.body.token.trim().toLowerCase() : "";
    if (!token) return res.status(400).json({ success: false, message: "token مطلوب" });
    const { deleteLiveActivityStartToken } = await import("../services/liveActivityStartService");
    await deleteLiveActivityStartToken(session.userId, token);
    res.json({ success: true });
  } catch (error) {
    console.error("[Mobile API] DELETE /live-activity/start-token error:", error);
    res.status(500).json({ success: false, message: "تعذر إيقاف البدء التلقائي" });
  }
});

// ==========================================
// Editorial notifications history + preferences
// GET    /api/v1/notifications                 — last 50 events for the user
// POST   /api/v1/notifications/:id/read        — mark a single entry read
// POST   /api/v1/notifications/read-all        — mark every unread row read
// GET    /api/v1/notifications/preferences     — current per-type toggles
// PUT    /api/v1/notifications/preferences     — update toggles
// GET    /api/v1/surveys/mine                  — دعوات الاستطلاع المفتوحة لبطاقة «بانتظارك»
// ==========================================
router.get("/surveys/mine", async (req: Request, res: Response) => {
  try {
    const session = await verifyMemberSession(req);
    if (!session) {
      return res.status(401).json({ success: false, message: "تسجيل الدخول مطلوب" });
    }
    const { getOpenInvitationsForUser } = await import("../services/surveyService");
    const items = await getOpenInvitationsForUser(session.userId);
    res.json({ success: true, items });
  } catch (error) {
    console.error("[Mobile API] GET /surveys/mine error:", error);
    res.status(500).json({ success: false, message: "تعذر جلب الاستطلاعات" });
  }
});

router.get("/notifications", async (req: Request, res: Response) => {
  try {
    const session = await verifyMemberSession(req);
    if (!session) {
      return res.status(401).json({ success: false, message: "تسجيل الدخول مطلوب" });
    }

    const { editorialNotifications } = await import("@shared/schema");
    const limit = Math.min(Number(req.query.limit) || 50, 100);

    const rows = await db
      .select()
      .from(editorialNotifications)
      .where(eq(editorialNotifications.userId, session.userId))
      .orderBy(desc(editorialNotifications.createdAt))
      .limit(limit);

    const unread = rows.filter(r => !r.readAt).length;
    res.json({ success: true, items: rows, unread });
  } catch (error) {
    console.error("[Mobile API] GET /notifications error:", error);
    res.status(500).json({ success: false, message: "تعذر جلب الإشعارات" });
  }
});

router.post("/notifications/:id/read", async (req: Request, res: Response) => {
  try {
    const session = await verifyMemberSession(req);
    if (!session) {
      return res.status(401).json({ success: false, message: "تسجيل الدخول مطلوب" });
    }

    const { editorialNotifications } = await import("@shared/schema");
    await db.update(editorialNotifications)
      .set({ readAt: new Date() })
      .where(and(
        eq(editorialNotifications.id, req.params.id),
        eq(editorialNotifications.userId, session.userId),
      ));

    res.json({ success: true });
  } catch (error) {
    console.error("[Mobile API] POST /notifications/:id/read error:", error);
    res.status(500).json({ success: false, message: "تعذر تحديث الإشعار" });
  }
});

router.post("/notifications/read-all", async (req: Request, res: Response) => {
  try {
    const session = await verifyMemberSession(req);
    if (!session) {
      return res.status(401).json({ success: false, message: "تسجيل الدخول مطلوب" });
    }

    const { editorialNotifications } = await import("@shared/schema");
    await db.execute(sql`
      UPDATE editorial_notifications
      SET read_at = NOW()
      WHERE user_id = ${session.userId} AND read_at IS NULL
    `);

    res.json({ success: true });
  } catch (error) {
    console.error("[Mobile API] read-all error:", error);
    res.status(500).json({ success: false, message: "تعذر تحديث الإشعارات" });
  }
});

// DELETE /api/v1/notifications/:id — remove a single editorial notification.
// Powers the swipe-to-delete row action in the iOS notifications screen.
// Scoped to the session user so one writer can't delete another's entries.
//
// Uses raw SQL via `db.execute(sql\`...\`)` to mirror the read-all
// handler above. The first version used the Drizzle query builder and
// the rows weren't actually being removed in production — switching to
// the same parameterised SQL pattern as `read-all` makes the DELETE
// reliable.
router.delete("/notifications/:id", async (req: Request, res: Response) => {
  try {
    const session = await verifyMemberSession(req);
    if (!session) {
      return res.status(401).json({ success: false, message: "تسجيل الدخول مطلوب" });
    }
    const id = req.params.id;
    if (!id) {
      return res.status(400).json({ success: false, message: "معرّف الإشعار مطلوب" });
    }
    const result = await db.execute(sql`
      DELETE FROM editorial_notifications
      WHERE id = ${id} AND user_id = ${session.userId}
    `);
    const affected = (result as any)?.rowCount ?? 0;
    res.json({ success: true, deleted: affected });
  } catch (error) {
    console.error("[Mobile API] DELETE /notifications/:id error:", error);
    res.status(500).json({ success: false, message: "تعذر حذف الإشعار" });
  }
});

// DELETE /api/v1/notifications — wipe every editorial notification for the
// session user. Backs the "مسح كل الإشعارات" footer button on iOS so
// writers don't accumulate months of history.
router.delete("/notifications", async (req: Request, res: Response) => {
  try {
    const session = await verifyMemberSession(req);
    if (!session) {
      return res.status(401).json({ success: false, message: "تسجيل الدخول مطلوب" });
    }
    const result = await db.execute(sql`
      DELETE FROM editorial_notifications
      WHERE user_id = ${session.userId}
    `);
    const affected = (result as any)?.rowCount ?? 0;
    res.json({ success: true, deleted: affected });
  } catch (error) {
    console.error("[Mobile API] DELETE /notifications error:", error);
    res.status(500).json({ success: false, message: "تعذر مسح الإشعارات" });
  }
});

router.get("/notifications/preferences", async (req: Request, res: Response) => {
  try {
    const session = await verifyMemberSession(req);
    if (!session) {
      return res.status(401).json({ success: false, message: "تسجيل الدخول مطلوب" });
    }

    const { editorialNotificationPrefs } = await import("@shared/schema");
    const [row] = await db
      .select()
      .from(editorialNotificationPrefs)
      .where(eq(editorialNotificationPrefs.userId, session.userId))
      .limit(1);

    res.json({
      success: true,
      preferences: {
        scheduledEnabled: row?.scheduledEnabled ?? true,
        publishedEnabled: row?.publishedEnabled ?? true,
        rejectedEnabled: row?.rejectedEnabled ?? true,
        revisionEnabled: row?.revisionEnabled ?? true,
      },
    });
  } catch (error) {
    console.error("[Mobile API] GET /notifications/preferences error:", error);
    res.status(500).json({ success: false, message: "تعذر جلب الإعدادات" });
  }
});

router.put("/notifications/preferences", async (req: Request, res: Response) => {
  try {
    const session = await verifyMemberSession(req);
    if (!session) {
      return res.status(401).json({ success: false, message: "تسجيل الدخول مطلوب" });
    }

    const { editorialNotificationPrefs } = await import("@shared/schema");
    const { z } = await import("zod");
    const data = z.object({
      scheduledEnabled: z.boolean().optional(),
      publishedEnabled: z.boolean().optional(),
      rejectedEnabled: z.boolean().optional(),
      revisionEnabled: z.boolean().optional(),
    }).parse(req.body);

    // Upsert — first call creates the row, subsequent calls update fields.
    const [existing] = await db
      .select()
      .from(editorialNotificationPrefs)
      .where(eq(editorialNotificationPrefs.userId, session.userId))
      .limit(1);

    if (existing) {
      await db.update(editorialNotificationPrefs)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(editorialNotificationPrefs.userId, session.userId));
    } else {
      await db.insert(editorialNotificationPrefs).values({
        userId: session.userId,
        scheduledEnabled: data.scheduledEnabled ?? true,
        publishedEnabled: data.publishedEnabled ?? true,
        rejectedEnabled: data.rejectedEnabled ?? true,
        revisionEnabled: data.revisionEnabled ?? true,
      });
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error("[Mobile API] PUT /notifications/preferences error:", error);
    if (error?.name === "ZodError") {
      return res.status(400).json({ success: false, message: "بيانات غير صالحة" });
    }
    res.status(500).json({ success: false, message: "تعذر تحديث الإعدادات" });
  }
});

// ==========================================
// APPLE WALLET — PRESS CARD (v1 mobile bearer surface)
// ==========================================
// The web equivalents at /api/wallet/press/* sit behind Passport
// sessions, which the iOS app never has. These mirror them under the
// bearer-authed /api/v1 root so the iOS press-card screen can call
// them directly. Authorization is unified: a user qualifies if their
// users.hasPressCard flag is true OR their role belongs to a small
// editorial set (reporter / opinion_author / editor / chief_editor /
// admin / system_admin / journalist / publisher) — the same set the
// PressPassBuilder.translateRole map knows about.

const PRESS_CARD_ELIGIBLE_ROLES = new Set([
  "reporter",
  "opinion_author",
  "editor",
  "chief_editor",
  "admin",
  "system_admin",
  "journalist",
  "publisher",
]);

async function loadPressCardUser(userId: string) {
  const { users } = await import("@shared/schema");
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      role: users.role,
      profileImageUrl: users.profileImageUrl,
      hasPressCard: users.hasPressCard,
      jobTitle: users.jobTitle,
      department: users.department,
      pressIdNumber: users.pressIdNumber,
      cardValidUntil: users.cardValidUntil,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row;
}

function isPressCardEligible(row: { role: string | null; hasPressCard: boolean | null }) {
  if (row.hasPressCard === true) return true;
  if (row.role && PRESS_CARD_ELIGIBLE_ROLES.has(row.role)) return true;
  return false;
}

// Mirror of PressPassBuilder.translateRole. Kept in sync by hand
// (the press card route exposes this label to iOS via
// /wallet/press/status so the activation-screen preview shows the
// EXACT string that will be printed on the .pkpass).
const PRESS_CARD_ROLE_LABELS: Record<string, string> = {
  admin: 'مدير',
  system_admin: 'مدير النظام',
  chief_editor: 'رئيس التحرير',
  editor: 'محرر',
  journalist: 'صحفي',
  reporter: 'مراسل',
  opinion_author: 'كاتب رأي',
  publisher: 'ناشر',
  reader: 'قارئ',
};

// Resolves the prominent role label for the press card. We prefer
// users.jobTitle when it's set because the editor can fill it with a
// precise, press-card-grade title ("كاتب مقال", "محرر اقتصادي") that
// always reads better than the system role. Fall through to the
// translated users.role only when jobTitle is empty. This stops the
// confusing "قارئ at top + كاتب مقال under the name" pairing the
// user flagged on 2026-05-19.
function pressCardRoleLabel(row: { role: string | null | undefined; jobTitle: string | null | undefined }): string {
  const jt = (row.jobTitle ?? '').trim();
  if (jt) return jt;
  const role = row.role;
  if (!role) return 'عضو سبق';
  return PRESS_CARD_ROLE_LABELS[role] || role;
}

// GET /api/v1/wallet/press/status
//   { authorized: boolean, hasPass: boolean, serialNumber?: string, issuedAt?: string }
router.get("/wallet/press/status", async (req: Request, res: Response) => {
  try {
    const session = await verifyMemberSession(req);
    if (!session) {
      return res.status(401).json({ success: false, message: "غير مسجل" });
    }
    const userRow = await loadPressCardUser(session.userId);
    if (!userRow) {
      return res.status(404).json({ success: false, message: "المستخدم غير موجود" });
    }
    if (!isPressCardEligible(userRow)) {
      return res.json({ success: true, authorized: false, hasPass: false });
    }
    const { storage } = await import("../storage");
    const pass = await storage.getWalletPassByUserAndType(session.userId, "press");
    return res.json({
      success: true,
      authorized: true,
      hasPass: !!pass,
      serialNumber: pass?.serialNumber ?? null,
      issuedAt: pass?.createdAt ?? null,
      // Same role label PressPassBuilder will burn onto the .pkpass.
      // iOS uses this so the activation-screen preview matches the
      // printed card exactly (no more local switch-statement drift).
      roleLabel: pressCardRoleLabel(userRow),
      jobTitle: userRow.jobTitle ?? null,
    });
  } catch (error) {
    console.error("[Mobile API] GET /wallet/press/status error:", error);
    res.status(500).json({ success: false, message: "تعذر فحص حالة البطاقة" });
  }
});

// POST /api/v1/wallet/press/issue
// Returns the .pkpass binary (Content-Type: application/vnd.apple.pkpass)
// so the iOS client can hand it to PKAddPassesViewController.
router.post("/wallet/press/issue", async (req: Request, res: Response) => {
  try {
    const session = await verifyMemberSession(req);
    if (!session) {
      return res.status(401).json({ success: false, message: "غير مسجل" });
    }
    const userRow = await loadPressCardUser(session.userId);
    if (!userRow) {
      return res.status(404).json({ success: false, message: "المستخدم غير موجود" });
    }
    if (!isPressCardEligible(userRow)) {
      return res.status(403).json({
        success: false,
        message: "غير مصرح لك بإصدار بطاقة صحفية. يرجى التواصل مع الإدارة.",
      });
    }

    const { storage } = await import("../storage");
    const { passKitService } = await import("../lib/passkit/PassKitService");

    const existingPass = await storage.getWalletPassByUserAndType(session.userId, "press");
    const serialNumber = existingPass?.serialNumber ?? passKitService.generateSerialNumber(session.userId, "press");
    const authToken = existingPass?.authenticationToken ?? passKitService.generateAuthToken();

    const userName = [userRow.firstName, userRow.lastName]
      .map((s) => (s ?? "").trim())
      .filter(Boolean)
      .join(" ") || userRow.email || "";

    const passData = {
      userId: userRow.id,
      serialNumber,
      authToken,
      userName,
      userEmail: userRow.email ?? "",
      userRole: userRow.role ?? "reader",
      profileImageUrl: userRow.profileImageUrl ?? undefined,
      jobTitle: userRow.jobTitle ?? undefined,
      department: userRow.department ?? undefined,
      pressIdNumber: userRow.pressIdNumber ?? undefined,
      validUntil: userRow.cardValidUntil ?? undefined,
    };

    const passBuffer = await passKitService.generatePressPass(passData);

    if (existingPass) {
      await storage.updateWalletPassTimestamp(existingPass.id);
    } else {
      await storage.createWalletPass({
        userId: userRow.id,
        passType: "press",
        passTypeIdentifier: process.env.APPLE_PRESS_PASS_TYPE_ID || "pass.life.sabq.presscard",
        serialNumber,
        authenticationToken: authToken,
      });
    }

    res.set({
      "Content-Type": "application/vnd.apple.pkpass",
      "Content-Disposition": `attachment; filename="sabq-press-card-${serialNumber}.pkpass"`,
      "Content-Length": passBuffer.length,
    });
    return res.send(passBuffer);
  } catch (error: any) {
    console.error("[Mobile API] POST /wallet/press/issue error:", error);
    res.status(400).json({
      success: false,
      message: error?.message || "تعذر إنشاء البطاقة.",
    });
  }
});

// ==========================================
// LOYALTY (Phase 2 / Phase 3 iOS surface)
// ==========================================
// All loyalty awarding from iOS funnels through awardPoints() in
// server/services/loyalty.ts — the same helper the web routes use,
// so daily caps, dedup, and rank-level write are uniform across
// platforms. The iOS bug noted earlier (writers don't earn points
// on iOS) was a missing endpoint, not a missing service.

// GET /api/v1/loyalty/me
// Returns the same shape as the web /api/loyalty/summary so the iOS
// "حسابي" tab can render the same component tree.
router.get("/loyalty/me", async (req: Request, res: Response) => {
  try {
    const session = await verifyMemberSession(req);
    if (!session) {
      return res.status(401).json({ success: false, message: "غير مسجل" });
    }
    const { userPointsTotal, userLoyaltyEvents } = await import("@shared/schema");
    const userId = session.userId;

    const [points] = await db
      .select()
      .from(userPointsTotal)
      .where(eq(userPointsTotal.userId, userId))
      .limit(1);

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [weekRow] = await db
      .select({ total: sql<number>`COALESCE(SUM(${userLoyaltyEvents.points}), 0)` })
      .from(userLoyaltyEvents)
      .where(and(eq(userLoyaltyEvents.userId, userId), gte(userLoyaltyEvents.createdAt, weekAgo)));
    const [monthRow] = await db
      .select({ total: sql<number>`COALESCE(SUM(${userLoyaltyEvents.points}), 0)` })
      .from(userLoyaltyEvents)
      .where(and(eq(userLoyaltyEvents.userId, userId), gte(userLoyaltyEvents.createdAt, monthAgo)));

    const recentDays = await db
      .select({ day: sql<string>`to_char(${userLoyaltyEvents.createdAt}, 'YYYY-MM-DD')` })
      .from(userLoyaltyEvents)
      .where(and(eq(userLoyaltyEvents.userId, userId), gte(userLoyaltyEvents.createdAt, monthAgo)))
      .groupBy(sql`to_char(${userLoyaltyEvents.createdAt}, 'YYYY-MM-DD')`)
      .orderBy(desc(sql`to_char(${userLoyaltyEvents.createdAt}, 'YYYY-MM-DD')`));
    const eventDays = new Set(recentDays.map((r) => r.day));
    let streak = 0;
    const cursor = new Date(now);
    while (eventDays.has(cursor.toISOString().slice(0, 10))) {
      streak++;
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }

    // Fire-and-forget DAILY_LOGIN award. The cap-of-1 + dedup window
    // ensures this is a no-op on every call after the first one each
    // day. Bonuses scale by streak (×1.5 at 7 days, ×1.75 at 14, ×2
    // at 30). We don't await it so the GET stays fast even if the
    // loyalty subsystem is briefly slow.
    import("../services/loyalty")
      .then((m) => m.awardDailyLogin(userId))
      .catch((err) => console.warn("[loyalty/me] daily-login skipped:", err?.message));

    res.json({
      success: true,
      points: points ?? null,
      weekPoints: Number(weekRow?.total ?? 0),
      monthPoints: Number(monthRow?.total ?? 0),
      streakDays: streak,
    });
  } catch (error) {
    console.error("[Mobile API] GET /loyalty/me error:", error);
    res.status(500).json({ success: false, message: "تعذر جلب البيانات" });
  }
});

// POST /api/v1/loyalty/events
// iOS batches loyalty events (READ_OPEN / READ_DEEP / LIKE / SHARE /
// COMMENT / NOTIFICATION_OPEN) and flushes every ~30s or on app
// background. The server-side daily cap and dedup in awardPoints()
// make this idempotent enough that the iOS queue can retry on
// network failure without producing duplicate points.
router.post("/loyalty/events", async (req: Request, res: Response) => {
  try {
    const session = await verifyMemberSession(req);
    if (!session) {
      return res.status(401).json({ success: false, message: "غير مسجل" });
    }
    const events = Array.isArray(req.body?.events) ? req.body.events : [];
    if (events.length === 0 || events.length > 100) {
      return res.status(400).json({ success: false, message: "عدد الأحداث غير صالح" });
    }

    const { awardPoints } = await import("../services/loyalty");
    const { LOYALTY_ACTIONS } = await import("@shared/loyalty");
    // Client-reportable engagement actions ONLY. Sports prediction wins,
    // account milestones, and admin adjustments are always granted
    // server-side; accepting their codes here would let a client mint
    // uncapped high-value points with arbitrary dedup sources.
    const validActions = new Set<string>([
      LOYALTY_ACTIONS.READ_OPEN,
      LOYALTY_ACTIONS.READ_DEEP,
      LOYALTY_ACTIONS.LIKE,
      LOYALTY_ACTIONS.SHARE,
      LOYALTY_ACTIONS.COMMENT,
      LOYALTY_ACTIONS.NOTIFICATION_OPEN,
    ]);

    const results = [] as Array<{ action: string; outcome: string; points?: number }>;
    for (const evt of events) {
      const action = String(evt?.action ?? "");
      if (!validActions.has(action as any)) {
        results.push({ action, outcome: "INVALID_ACTION" });
        continue;
      }
      const out = await awardPoints({
        userId: session.userId,
        action: action as any,
        source: typeof evt?.source === "string" ? evt.source : undefined,
        metadata: {
          articleId: typeof evt?.articleId === "string" ? evt.articleId : undefined,
          duration: typeof evt?.duration === "number" ? evt.duration : undefined,
          extraInfo: typeof evt?.extraInfo === "string" ? evt.extraInfo : undefined,
        },
      });
      if (out.awarded) {
        results.push({ action, outcome: "AWARDED", points: out.points });
      } else {
        results.push({ action, outcome: out.reason });
      }
    }

    res.json({ success: true, results });
  } catch (error) {
    console.error("[Mobile API] POST /loyalty/events error:", error);
    res.status(500).json({ success: false, message: "تعذر معالجة الأحداث" });
  }
});

// ============================================================================
// GET /api/v1/loyalty/history?page=N&limit=20
//
// Paginated event log for the signed-in member — drives a "تاريخ نقاطي"
// activity feed in the iOS profile and on the web profile page. Each row
// has the action label, points awarded, optional metadata, and the timestamp
// so the UI can render a grouped-by-day feed.
// ============================================================================

router.get("/loyalty/history", async (req: Request, res: Response) => {
  try {
    const session = await verifyMemberSession(req);
    if (!session) {
      return res.status(401).json({ success: false, message: "غير مسجل" });
    }

    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10) || 20));
    const offset = (page - 1) * limit;

    const rows = await db
      .select({
        id: userLoyaltyEvents.id,
        action: userLoyaltyEvents.action,
        points: userLoyaltyEvents.points,
        source: userLoyaltyEvents.source,
        metadata: userLoyaltyEvents.metadata,
        createdAt: userLoyaltyEvents.createdAt,
      })
      .from(userLoyaltyEvents)
      .where(eq(userLoyaltyEvents.userId, session.userId))
      .orderBy(desc(userLoyaltyEvents.createdAt))
      .limit(limit + 1)
      .offset(offset);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    // Hydrate article titles + slugs. Wrapped in its own try/catch so
    // a runtime hiccup (Drizzle inArray edge case, unexpected metadata
    // shape, secondary query latency) degrades to "history without
    // titles" instead of 500ing the whole endpoint. iOS still renders
    // the row's action + points + date when articleTitle is null.
    let articleById = new Map<string, { id: string; title: string; slug: string | null }>();
    try {
      // Only consider IDs shaped like a UUID or a short nanoid — the
      // articles.id column never holds anything else, and Arabic slugs
      // showing up here from older event payloads would be wasted in
      // the SELECT (no match) plus a risk of driver-encoding surprises.
      const idPattern = /^[A-Za-z0-9_-]{1,50}$/;
      const articleIds = Array.from(new Set(items
        .map((e) => {
          const metaId = (e.metadata as any)?.articleId;
          if (typeof metaId === "string" && idPattern.test(metaId)) return metaId;
          if (typeof e.source === "string" && idPattern.test(e.source)) return e.source;
          return null;
        })
        .filter((id): id is string => typeof id === "string")));
      if (articleIds.length > 0) {
        const articleMeta = await db
          .select({ id: articles.id, title: articles.title, slug: articles.slug })
          .from(articles)
          .where(inArray(articles.id, articleIds));
        articleById = new Map(articleMeta.map((a) => [a.id, a]));
      }
    } catch (hydrateErr) {
      console.error("[Mobile API] /loyalty/history article hydration failed:", hydrateErr);
    }

    res.json({
      success: true,
      items: items.map((e) => {
        const articleId = e.metadata?.articleId ?? (e.source && /^[0-9a-f-]{36}$/i.test(e.source) ? e.source : null);
        const article = articleId ? articleById.get(articleId) : null;
        return {
          id: e.id,
          action: e.action,
          points: e.points,
          source: e.source,
          metadata: e.metadata,
          createdAt: e.createdAt,
          articleTitle: article?.title ?? null,
          articleSlug: article?.slug ?? null,
        };
      }),
      page,
      limit,
      hasMore,
    });
  } catch (error) {
    console.error("[Mobile API] GET /loyalty/history error:", error);
    res.status(500).json({ success: false, message: "تعذر جلب السجل" });
  }
});

// ============================================================================
// GET /api/v1/loyalty/monthly
//
// Last 6 months of earned points, grouped per UTC month. Powers a small
// bar/line chart on the iOS LoyaltyAccount screen so the member sees their
// momentum over time, not just this week + this month totals.
// ============================================================================

router.get("/loyalty/monthly", async (req: Request, res: Response) => {
  try {
    const session = await verifyMemberSession(req);
    if (!session) {
      return res.status(401).json({ success: false, message: "غير مسجل" });
    }

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setUTCMonth(sixMonthsAgo.getUTCMonth() - 5);
    sixMonthsAgo.setUTCDate(1);
    sixMonthsAgo.setUTCHours(0, 0, 0, 0);

    const rows = await db
      .select({
        month: sql<string>`to_char(${userLoyaltyEvents.createdAt}, 'YYYY-MM')`,
        total: sql<number>`COALESCE(SUM(${userLoyaltyEvents.points}), 0)::int`,
        events: sql<number>`COUNT(*)::int`,
      })
      .from(userLoyaltyEvents)
      .where(
        and(
          eq(userLoyaltyEvents.userId, session.userId),
          gte(userLoyaltyEvents.createdAt, sixMonthsAgo),
        ),
      )
      .groupBy(sql`to_char(${userLoyaltyEvents.createdAt}, 'YYYY-MM')`)
      .orderBy(sql`to_char(${userLoyaltyEvents.createdAt}, 'YYYY-MM')`);

    // Fill in zero-months so the chart has a continuous 6-bucket axis.
    const months: { month: string; total: number; events: number }[] = [];
    const cursor = new Date(sixMonthsAgo);
    for (let i = 0; i < 6; i++) {
      const key = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`;
      const row = rows.find((r) => r.month === key);
      months.push({
        month: key,
        total: Number(row?.total ?? 0),
        events: Number(row?.events ?? 0),
      });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }

    res.json({ success: true, months });
  } catch (error) {
    console.error("[Mobile API] GET /loyalty/monthly error:", error);
    res.status(500).json({ success: false, message: "تعذر جلب البيانات الشهرية" });
  }
});

// ============================================================================
// GET /api/v1/loyalty/rewards
//
// Catalog of active rewards a member can redeem. Filters to is_active=true
// and (remaining_stock IS NULL OR remaining_stock > 0). Each row carries
// the user's current point balance so the UI can show
// affordability ("تحتاج XXX نقطة إضافية") without a second round-trip.
// ============================================================================

router.get("/loyalty/rewards", async (req: Request, res: Response) => {
  try {
    const session = await verifyMemberSession(req);
    if (!session) {
      return res.status(401).json({ success: false, message: "غير مسجل" });
    }

    const { loyaltyRewards, userPointsTotal, userRewardsHistory } = await import("@shared/schema");

    const [pointsRow] = await db
      .select({ totalPoints: userPointsTotal.totalPoints })
      .from(userPointsTotal)
      .where(eq(userPointsTotal.userId, session.userId))
      .limit(1);
    const balance = Number(pointsRow?.totalPoints ?? 0);

    const rewards = await db
      .select()
      .from(loyaltyRewards)
      .where(eq(loyaltyRewards.isActive, true))
      .orderBy(loyaltyRewards.pointsCost);

    // How many times this user already redeemed each reward — needed to
    // enforce `maxRedemptionsPerUser` on the client without a second
    // network call per row.
    const myRedemptions = await db
      .select({
        rewardId: userRewardsHistory.rewardId,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(userRewardsHistory)
      .where(eq(userRewardsHistory.userId, session.userId))
      .groupBy(userRewardsHistory.rewardId);
    const myCount = new Map(myRedemptions.map((r) => [r.rewardId, Number(r.count)]));

    res.json({
      success: true,
      balance,
      rewards: rewards
        .filter((r) => (r.rewardData as any)?.partnerApiData?.previewOnly !== true)
        .filter((r) => r.remainingStock === null || (r.remainingStock ?? 0) > 0)
        .map((r) => {
          const myRedeems = myCount.get(r.id) ?? 0;
          const overLimit = r.maxRedemptionsPerUser !== null
            && myRedeems >= (r.maxRedemptionsPerUser ?? Infinity);
          return {
            id: r.id,
            nameAr: r.nameAr,
            nameEn: r.nameEn,
            description: r.description,
            imageUrl: r.imageUrl,
            pointsCost: Number(r.pointsCost),
            rewardType: r.rewardType,
            partnerName: r.partnerName,
            remainingStock: r.remainingStock,
            expiresAt: r.expiresAt,
            myRedemptionCount: myRedeems,
            canRedeem: balance >= Number(r.pointsCost) && !overLimit,
            pointsShort: Math.max(0, Number(r.pointsCost) - balance),
            reasonBlocked: overLimit ? "MAX_PER_USER" : balance < Number(r.pointsCost) ? "INSUFFICIENT" : null,
          };
        }),
    });
  } catch (error) {
    console.error("[Mobile API] GET /loyalty/rewards error:", error);
    res.status(500).json({ success: false, message: "تعذر جلب المكافآت" });
  }
});

// ============================================================================
// POST /api/v1/loyalty/rewards/:id/redeem
//
// Burn `pointsCost` from the member's totalPoints atomically and create a
// `user_rewards_history` row with status='pending'. Backend post-processing
// (or a dashboard action) flips it to 'delivered' once the coupon is sent.
//
// Atomicity matters: a naive impl could double-spend if two parallel taps
// race. We use a transaction with a points-decrement guarded by the current
// balance, so the second attempt either sees the lower balance or fails.
// ============================================================================

router.post("/loyalty/rewards/:id/redeem", async (req: Request, res: Response) => {
  try {
    const session = await verifyMemberSession(req);
    if (!session) {
      return res.status(401).json({ success: false, message: "غير مسجل" });
    }
    const rewardId = req.params.id;

    // Single transactional implementation shared with the web route —
    // reward row lock + guarded balance/stock decrements live there.
    const { storage } = await import("../storage");
    const result = await storage.redeemReward({ userId: session.userId, rewardId });

    if (!result.success) {
      const statusByCode: Record<string, number> = {
        NOT_FOUND: 404,
        INACTIVE: 404,
        EXPIRED: 410,
        OUT_OF_STOCK: 409,
        MAX_REDEMPTIONS: 409,
        INSUFFICIENT_POINTS: 402,
      };
      const status = statusByCode[result.code ?? ""] ?? 400;
      return res.status(status).json({ success: false, message: result.message });
    }

    const history = result.redemption!;
    res.json({
      success: true,
      message: "تم استلام طلب الاستبدال بنجاح ✨",
      remainingBalance: result.remainingBalance,
      redemption: {
        id: history.id,
        rewardId,
        pointsSpent: history.pointsSpent,
        status: history.status,
        redeemedAt: history.redeemedAt,
      },
    });
  } catch (error) {
    console.error("[Mobile API] POST /loyalty/rewards/:id/redeem error:", error);
    res.status(500).json({ success: false, message: "تعذر إتمام الاستبدال" });
  }
});

// ============================================================================
// GET /api/v1/loyalty/redemptions/me
//
// The member's own redemption history — paired with /loyalty/rewards on
// the new "مكافآتي" tab in iOS. Status pivots from pending → delivered
// (admin action) → expired/cancelled.
// ============================================================================

router.get("/loyalty/redemptions/me", async (req: Request, res: Response) => {
  try {
    const session = await verifyMemberSession(req);
    if (!session) {
      return res.status(401).json({ success: false, message: "غير مسجل" });
    }
    const { userRewardsHistory } = await import("@shared/schema");
    const rows = await db
      .select()
      .from(userRewardsHistory)
      .where(eq(userRewardsHistory.userId, session.userId))
      .orderBy(desc(userRewardsHistory.redeemedAt))
      .limit(100);
    res.json({
      success: true,
      redemptions: rows.map((r) => ({
        id: r.id,
        rewardId: r.rewardId,
        pointsSpent: r.pointsSpent,
        status: r.status,
        rewardSnapshot: r.rewardSnapshot,
        deliveryData: r.deliveryData,
        redeemedAt: r.redeemedAt,
        deliveredAt: r.deliveredAt,
      })),
    });
  } catch (error) {
    console.error("[Mobile API] GET /loyalty/redemptions/me error:", error);
    res.status(500).json({ success: false, message: "تعذر جلب الاستبدالات" });
  }
});

// ==========================================
// سبق بلس — المعاينة الداخلية /api/v1/plus/* (مسؤول النظام فقط)
//
// مرآة موبايل لمسارات الويب /api/plus-preview/*: نفس خدمات
// sabqPlusPreviewService، لكن المصادقة بجلسة Bearer العضوية بدل
// كوكي الويب. غير المسؤول يرى 404 (لا 403) كي لا يُكشف وجود السطح —
// نفس سياسة الويب. الاستبدال حقيقي: خصم فعلي من محفظة العضو.
// ==========================================

async function verifyPlusAdminSession(req: Request): Promise<{ userId: string } | "unauthenticated" | "forbidden"> {
  const session = await verifyMemberSession(req);
  if (!session) return "unauthenticated";
  const { isPlusPreviewAdmin } = await import("../services/sabqPlusPreviewService");
  const [userRow] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);
  const ok = await isPlusPreviewAdmin({ id: session.userId, role: userRow?.role ?? null });
  return ok ? session : "forbidden";
}

function plusGateResponse(res: Response, gate: "unauthenticated" | "forbidden") {
  if (gate === "unauthenticated") {
    return res.status(401).json({ success: false, message: "غير مسجل" });
  }
  return res.status(404).json({ success: false, message: "غير موجود" });
}

router.get("/plus/summary", async (req: Request, res: Response) => {
  try {
    const gate = await verifyPlusAdminSession(req);
    if (typeof gate === "string") return plusGateResponse(res, gate);
    const { getPlusSummary } = await import("../services/sabqPlusPreviewService");
    const summary = await getPlusSummary(gate.userId);
    res.json({ success: true, ...summary });
  } catch (error) {
    console.error("[Mobile API] GET /plus/summary error:", error);
    res.status(500).json({ success: false, message: "تعذر جلب الملخص" });
  }
});

router.get("/plus/catalog", async (req: Request, res: Response) => {
  try {
    const gate = await verifyPlusAdminSession(req);
    if (typeof gate === "string") return plusGateResponse(res, gate);
    const { getPlusCatalog } = await import("../services/sabqPlusPreviewService");
    const catalog = await getPlusCatalog(gate.userId);
    res.json({ success: true, ...catalog });
  } catch (error) {
    console.error("[Mobile API] GET /plus/catalog error:", error);
    res.status(500).json({ success: false, message: "تعذر جلب الكتالوج" });
  }
});

router.post("/plus/redeem/:id", async (req: Request, res: Response) => {
  try {
    const gate = await verifyPlusAdminSession(req);
    if (typeof gate === "string") return plusGateResponse(res, gate);
    if (req.body?.termsAccepted !== true) {
      return res.status(400).json({
        success: false,
        message: "يجب الموافقة على شروط الاستخدام وشروط ولاء ون قبل الاستبدال",
      });
    }
    const { redeemPreviewReward } = await import("../services/sabqPlusPreviewService");
    const result = await redeemPreviewReward(gate.userId, req.params.id);
    if (!result.success) {
      const statusByCode: Record<string, number> = {
        NOT_FOUND: 404,
        INACTIVE: 404,
        EXPIRED: 410,
        OUT_OF_STOCK: 409,
        MAX_REDEMPTIONS: 409,
        INSUFFICIENT_POINTS: 402,
      };
      return res
        .status(statusByCode[result.code] ?? 400)
        .json({ success: false, message: result.message });
    }
    res.json({
      success: true,
      message: "تم الاستبدال بنجاح ✨",
      remainingBalance: result.remainingBalance,
      voucher: result.voucher,
    });
  } catch (error) {
    console.error("[Mobile API] POST /plus/redeem error:", error);
    res.status(500).json({ success: false, message: "تعذر إتمام الاستبدال" });
  }
});

router.get("/plus/redemptions", async (req: Request, res: Response) => {
  try {
    const gate = await verifyPlusAdminSession(req);
    if (typeof gate === "string") return plusGateResponse(res, gate);
    const { getPlusRedemptions } = await import("../services/sabqPlusPreviewService");
    const redemptions = await getPlusRedemptions(gate.userId);
    res.json({ success: true, redemptions });
  } catch (error) {
    console.error("[Mobile API] GET /plus/redemptions error:", error);
    res.status(500).json({ success: false, message: "تعذر جلب السجل" });
  }
});

router.delete("/plus/redemptions/:id", async (req: Request, res: Response) => {
  try {
    const gate = await verifyPlusAdminSession(req);
    if (typeof gate === "string") return plusGateResponse(res, gate);
    const { removePreviewRedemption } = await import("../services/sabqPlusPreviewService");
    const result = await removePreviewRedemption(gate.userId, req.params.id);
    if (!result.success) {
      const status = result.code === "NOT_FOUND" ? 404 : 409;
      return res.status(status).json({ success: false, message: result.message });
    }
    res.json({
      success: true,
      refundedPoints: result.refundedPoints,
      remainingBalance: result.remainingBalance,
    });
  } catch (error) {
    console.error("[Mobile API] DELETE /plus/redemptions error:", error);
    res.status(500).json({ success: false, message: "تعذر إزالة القسيمة" });
  }
});

// بطاقة Apple Wallet للقسيمة — نفس نمط /wallet/press/issue: بث .pkpass
// مباشرة؛ iOS ينزّلها بـ URLSession (مع الـ Bearer) ثم يعرضها عبر
// PKAddPassesViewController. الأخطاء JSON لا HTML (لا متصفح هنا).
router.get("/plus/voucher/:redemptionId/wallet-pass", async (req: Request, res: Response) => {
  try {
    const gate = await verifyPlusAdminSession(req);
    if (typeof gate === "string") return plusGateResponse(res, gate);
    const { getVoucherPassData } = await import("../services/sabqPlusPreviewService");
    const voucher = await getVoucherPassData(gate.userId, req.params.redemptionId);
    if (!voucher) {
      return res.status(404).json({ success: false, message: "القسيمة غير موجودة" });
    }

    const [me] = await db
      .select({ firstName: users.firstName, lastName: users.lastName, email: users.email, role: users.role })
      .from(users)
      .where(eq(users.id, gate.userId))
      .limit(1);

    const { passKitService } = await import("../lib/passkit/PassKitService");
    const passBuffer = await passKitService.generateCouponPass({
      userId: gate.userId,
      serialNumber: `SABQ-PLUS-${req.params.redemptionId.replace(/-/g, "").slice(0, 10).toUpperCase()}`,
      authToken: passKitService.generateAuthToken(),
      userName: `${me?.firstName || ""} ${me?.lastName || ""}`.trim() || me?.email || "عضو سبق",
      userEmail: me?.email ?? "",
      userRole: me?.role ?? "reader",
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
    console.error("[Mobile API] GET /plus/voucher wallet-pass error:", error);
    res.status(400).json({ success: false, message: error?.message ?? "تعذر إنشاء بطاقة المحفظة" });
  }
});

// ==========================================
// Bookmarks — server-synced per user
//
// Previously bookmarks were local-only on iOS (UserDefaults) and
// Android (DataStore). Deleting the app lost them; they didn't sync
// across platforms. These endpoints mirror the web's
// `/api/articles/:id/bookmark` + `/api/profile/bookmarks` but under
// the mobile Bearer-token auth so native apps can use them.
// ==========================================

router.get("/bookmarks", async (req: Request, res: Response) => {
  try {
    const session = await verifyMemberSession(req);
    if (!session) {
      return res.status(401).json({ success: false, message: "غير مسجل" });
    }
    const rows = await db
      .select({
        articleId: bookmarks.articleId,
        title: articles.title,
        slug: articles.slug,
        imageUrl: articles.imageUrl,
        categoryName: categories.nameAr,
        publishedAt: articles.publishedAt,
      })
      .from(bookmarks)
      .innerJoin(articles, eq(bookmarks.articleId, articles.id))
      .leftJoin(categories, eq(articles.categoryId, categories.id))
      .where(eq(bookmarks.userId, session.userId))
      .orderBy(desc(bookmarks.createdAt));

    res.json({
      success: true,
      articleIds: rows.map((r) => r.articleId),
      articles: rows.map((r) => ({
        id: r.articleId,
        title: r.title,
        slug: r.slug,
        imageUrl: r.imageUrl,
        categoryName: r.categoryName,
        publishedAt: r.publishedAt?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    console.error("[Mobile API] GET /bookmarks error:", error);
    res.status(500).json({ success: false, message: "تعذر جلب المحفوظات" });
  }
});

// يقبل بعض عملاء الموبايل الـslug بدل معرّف المقال (UUID)، فيفشل قيد المفتاح
// الأجنبي bookmarks_article_id_articles_id_fk. نحوّل أي مدخل (معرّف أو slug) إلى
// المعرّف الحقيقي قبل الكتابة، ونعيد المعرّف نفسه إن كان UUID صالحًا أصلًا.
async function resolveArticleId(idOrSlug: string): Promise<string | null> {
  const [row] = await db
    .select({ id: articles.id })
    .from(articles)
    .where(or(eq(articles.id, idOrSlug), eq(articles.slug, idOrSlug)))
    .limit(1);
  return row?.id ?? null;
}

router.post("/bookmarks/:articleId", async (req: Request, res: Response) => {
  try {
    const session = await verifyMemberSession(req);
    if (!session) {
      return res.status(401).json({ success: false, message: "غير مسجل" });
    }
    const articleId = await resolveArticleId(req.params.articleId);
    if (!articleId) {
      return res.status(404).json({ success: false, message: "المقال غير موجود" });
    }
    const [existing] = await db
      .select({ id: bookmarks.id })
      .from(bookmarks)
      .where(and(eq(bookmarks.articleId, articleId), eq(bookmarks.userId, session.userId)))
      .limit(1);
    if (!existing) {
      await db.insert(bookmarks).values({ articleId, userId: session.userId });
    }
    res.json({ success: true, isBookmarked: true });
  } catch (error) {
    console.error("[Mobile API] POST /bookmarks error:", error);
    res.status(500).json({ success: false, message: "تعذر حفظ المقال" });
  }
});

router.delete("/bookmarks/:articleId", async (req: Request, res: Response) => {
  try {
    const session = await verifyMemberSession(req);
    if (!session) {
      return res.status(401).json({ success: false, message: "غير مسجل" });
    }
    // نحذف بكلا القيمتين (المعرّف المُحوَّل والمدخل الخام) لتغطية أي محفوظات قديمة.
    const resolvedId = await resolveArticleId(req.params.articleId);
    const ids = [req.params.articleId, ...(resolvedId ? [resolvedId] : [])];
    await db
      .delete(bookmarks)
      .where(and(inArray(bookmarks.articleId, ids), eq(bookmarks.userId, session.userId)));
    res.json({ success: true, isBookmarked: false });
  } catch (error) {
    console.error("[Mobile API] DELETE /bookmarks error:", error);
    res.status(500).json({ success: false, message: "تعذر إزالة المحفوظة" });
  }
});

// ==========================================
// Admin Dashboard (platform admins only)
// ==========================================
//
// Real, mobile-session-backed admin surface for the in-app iOS dashboard.
// The web CMS endpoints (/api/admin/*) are Passport-session + RBAC gated and
// unreachable from the mobile Bearer token, so these thin wrappers re-expose
// the same data through `verifyMemberSession` + a strict platform-admin role
// check. Editors are intentionally excluded (matches the iOS `isPlatformAdmin`
// gate) — only admin / system_admin / superadmin.

const PLATFORM_ADMIN_ROLES = ["admin", "system_admin", "system.admin", "superadmin"];

/// Resolves the Bearer session AND confirms the member is a platform admin.
/// Checks both RBAC `user_roles` and the legacy `users.role` text column,
/// because some admins only carry the text-column signal (no user_roles row).
async function verifyAdminSession(req: Request): Promise<{ userId: string } | null> {
  const session = await verifyMemberSession(req);
  if (!session) return null;

  const roleRows = await db
    .select({ roleName: roles.name })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(userRoles.userId, session.userId));
  const roleNames = roleRows.map(r => r.roleName);

  const [u] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);
  if (u?.role) roleNames.push(u.role);

  const isAdmin = roleNames.some(r => PLATFORM_ADMIN_ROLES.includes(r));
  return isAdmin ? { userId: session.userId } : null;
}

/// The real editorial statuses on `articles.status`, matching the web CMS.
/// The iOS dashboard tabs map 1:1 to these — no `reviewStatus` mapping.
const ADMIN_ARTICLE_STATUSES = ["draft", "scheduled", "published", "archived"] as const;
type AdminArticleStatusValue = (typeof ADMIN_ARTICLE_STATUSES)[number];

function normalizeAdminStatus(raw: string): AdminArticleStatusValue {
  return (ADMIN_ARTICLE_STATUSES as readonly string[]).includes(raw)
    ? (raw as AdminArticleStatusValue)
    : "draft";
}

/// WHERE clause for a given status tab — a direct column match.
function articleStatusWhere(status: AdminArticleStatusValue) {
  return eq(articles.status, status);
}

const adminArticleColumns = {
  id: articles.id,
  title: articles.title,
  excerpt: articles.excerpt,
  content: articles.content,
  status: articles.status,
  reviewStatus: articles.reviewStatus,
  reviewNotes: articles.reviewNotes,
  views: articles.views,
  publishedAt: articles.publishedAt,
  scheduledAt: articles.scheduledAt,
  updatedAt: articles.updatedAt,
  authorFirst: users.firstName,
  authorLast: users.lastName,
  reporterFirst: reporterUsers.firstName,
  reporterLast: reporterUsers.lastName,
};

function mapAdminArticleRow(r: any) {
  const reporterName = [r.reporterFirst, r.reporterLast].filter(Boolean).join(" ").trim();
  const authorName = [r.authorFirst, r.authorLast].filter(Boolean).join(" ").trim();
  const updated = r.updatedAt ?? r.publishedAt ?? new Date();
  return {
    id: r.id,
    title: r.title || "",
    excerpt: r.excerpt || "",
    body: r.content || "",
    status: normalizeAdminStatus(r.status || "draft"),
    reviewStatus: r.reviewStatus || null,
    reviewNotes: r.reviewNotes || null,
    author: reporterName || authorName || "فريق سبق",
    views: r.views || 0,
    scheduledAt: r.scheduledAt ? (r.scheduledAt instanceof Date ? r.scheduledAt : new Date(r.scheduledAt)).toISOString() : null,
    updatedAt: (updated instanceof Date ? updated : new Date(updated)).toISOString(),
  };
}

/// Minimal row for the editorial notification fan-out (author/reporter push +
/// email). Selected fresh before each workflow action.
async function fetchArticleForNotify(id: string) {
  const [a] = await db
    .select({
      id: articles.id,
      title: articles.title,
      slug: articles.slug,
      englishSlug: articles.englishSlug,
      articleType: articles.articleType,
      scheduledAt: articles.scheduledAt,
      publishedAt: articles.publishedAt,
      authorId: articles.authorId,
      reporterId: articles.reporterId,
      submitterId: articles.submitterId,
      status: articles.status,
      reviewNotes: articles.reviewNotes,
      newsType: articles.newsType,
    })
    .from(articles)
    .where(eq(articles.id, id))
    .limit(1);
  return a || null;
}

/// SEO/indexing parity with the web publish flow: purge CDN + memory cache for
/// the article + homepage, and ping IndexNow (Bing/Yandex). Without this an
/// iOS-published article stays stale on the edge for up to ~1h and is
/// discovered later. Fire-and-forget; never blocks the response.
function triggerPublishSeo(
  article: { slug?: string | null; englishSlug?: string | null; newsType?: string | null },
  reason: string,
): void {
  try {
    invalidateArticleWrite(article as any, { reason });
  } catch (e) {
    console.error("[Mobile API] invalidateArticleWrite failed:", (e as any)?.message);
  }
  const target = article.englishSlug || article.slug;
  if (target) {
    notifySearchEngines(target).catch(() => {});
  }
}

/// Re-fetch a single article in the client shape (used by publish + edit so
/// the response carries the joined author name, which `.returning()` lacks).
async function fetchAdminArticleItem(id: string) {
  const [r] = await db
    .select(adminArticleColumns)
    .from(articles)
    .leftJoin(users, eq(articles.authorId, users.id))
    .leftJoin(reporterUsers, eq(articles.reporterId, reporterUsers.id))
    .where(eq(articles.id, id))
    .limit(1);
  return r ? mapAdminArticleRow(r) : null;
}

// Full editor payload — every field the iOS editor reads/writes, plus the
// joined category + reporter display names.
const adminArticleDetailColumns = {
  id: articles.id,
  title: articles.title,
  subtitle: articles.subtitle,
  excerpt: articles.excerpt,
  content: articles.content,
  slug: articles.slug,
  status: articles.status,
  articleType: articles.articleType,
  newsType: articles.newsType,
  categoryId: articles.categoryId,
  reporterId: articles.reporterId,
  isFeatured: articles.isFeatured,
  isReading: articles.isReading,
  hideFromHomepage: articles.hideFromHomepage,
  aiSummary: articles.aiSummary,
  imageUrl: articles.imageUrl,
  thumbnailUrl: articles.thumbnailUrl,
  seo: articles.seo,
  scheduledAt: articles.scheduledAt,
  publishedAt: articles.publishedAt,
  updatedAt: articles.updatedAt,
  views: articles.views,
  authorId: articles.authorId,
  categoryName: categories.nameAr,
  reporterFirst: reporterUsers.firstName,
  reporterLast: reporterUsers.lastName,
  authorFirst: authorUsers.firstName,
  authorLast: authorUsers.lastName,
};

function mapAdminArticleDetail(r: any) {
  const seo = (r.seo && typeof r.seo === "object") ? r.seo : {};
  const reporterName = [r.reporterFirst, r.reporterLast].filter(Boolean).join(" ").trim();
  const authorName = [r.authorFirst, r.authorLast].filter(Boolean).join(" ").trim();
  const toISO = (v: any) => (v ? (v instanceof Date ? v : new Date(v)).toISOString() : null);
  return {
    id: r.id,
    title: r.title || "",
    subtitle: r.subtitle || "",
    excerpt: r.excerpt || "",
    content: r.content || "",
    slug: r.slug || "",
    status: normalizeAdminStatus(r.status || "draft"),
    articleType: r.articleType || "news",
    newsType: r.newsType || "regular",
    categoryId: r.categoryId || null,
    categoryName: r.categoryName || null,
    reporterId: r.reporterId || null,
    reporterName: reporterName || null,
    authorId: r.authorId || null,
    authorName: authorName || null,
    isFeatured: !!r.isFeatured,
    isReading: !!r.isReading,
    hideFromHomepage: !!r.hideFromHomepage,
    aiSummary: r.aiSummary || "",
    imageUrl: r.imageUrl || "",
    thumbnailUrl: r.thumbnailUrl || "",
    seo: {
      metaTitle: seo.metaTitle || "",
      metaDescription: seo.metaDescription || "",
      keywords: Array.isArray(seo.keywords) ? seo.keywords : [],
    },
    scheduledAt: toISO(r.scheduledAt),
    publishedAt: toISO(r.publishedAt),
    updatedAt: toISO(r.updatedAt) || new Date().toISOString(),
    views: r.views || 0,
  };
}

async function fetchAdminArticleDetail(id: string) {
  const [r] = await db
    .select(adminArticleDetailColumns)
    .from(articles)
    .leftJoin(categories, eq(articles.categoryId, categories.id))
    .leftJoin(reporterUsers, eq(articles.reporterId, reporterUsers.id))
    .leftJoin(authorUsers, eq(articles.authorId, authorUsers.id))
    .where(eq(articles.id, id))
    .limit(1);
  return r ? mapAdminArticleDetail(r) : null;
}

// GET /api/v1/admin/dashboard/stats — real KPI snapshot
router.get("/admin/dashboard/stats", async (req: Request, res: Response) => {
  try {
    const admin = await verifyAdminSession(req);
    if (!admin) {
      return res.status(403).json({ success: false, message: "صلاحيات غير كافية" });
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [publishedTodayRow] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(articles)
      .where(and(eq(articles.status, "published"), gte(articles.publishedAt, todayStart)));

    const [totalViewsRow] = await db
      .select({ v: sql<number>`coalesce(sum(${articles.views}), 0)::int` })
      .from(articles)
      .where(eq(articles.status, "published"));

    const [draftsRow] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(articles)
      .where(articleStatusWhere("draft"));

    const [scheduledRow] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(articles)
      .where(articleStatusWhere("scheduled"));

    const [archivedRow] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(articles)
      .where(articleStatusWhere("archived"));

    res.json({
      success: true,
      publishedToday: publishedTodayRow?.c || 0,
      totalViews: totalViewsRow?.v || 0,
      draft: draftsRow?.c || 0,
      scheduled: scheduledRow?.c || 0,
      archived: archivedRow?.c || 0,
    });
  } catch (error) {
    console.error("[Mobile API] GET /admin/dashboard/stats error:", error);
    res.status(500).json({ success: false, message: "تعذر تحميل الإحصائيات" });
  }
});

// GET /api/v1/admin/dashboard/counts — ultra-light: just draft + scheduled
// counts (two indexed COUNTs). Powers the simplified 2-card overview without
// the heavy full-stats fan-out. Cached 30s.
router.get("/admin/dashboard/counts", async (req: Request, res: Response) => {
  try {
    const admin = await verifyAdminSession(req);
    if (!admin) {
      return res.status(403).json({ success: false, message: "صلاحيات غير كافية" });
    }
    const { memoryCache } = await import("../memoryCache");
    const cacheKey = "mobile:admin:counts";
    const cached = memoryCache.get<any>(cacheKey);
    if (cached) {
      return res.json(cached);
    }
    const [draftRow] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(articles)
      .where(articleStatusWhere("draft"));
    const [scheduledRow] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(articles)
      .where(articleStatusWhere("scheduled"));
    const payload = { success: true, draft: draftRow?.c || 0, scheduled: scheduledRow?.c || 0 };
    memoryCache.set(cacheKey, payload, 30000);
    res.json(payload);
  } catch (error) {
    console.error("[Mobile API] GET /admin/dashboard/counts error:", error);
    res.status(500).json({ success: false, message: "تعذر تحميل العدّادات" });
  }
});

// GET /api/v1/admin/dashboard/full-stats — بطاقات النظرة العامة (نفس مصدر الويب)
// Returns the subset of the web dashboard's KPI groups the iOS cards need.
router.get("/admin/dashboard/full-stats", async (req: Request, res: Response) => {
  try {
    const admin = await verifyAdminSession(req);
    if (!admin) {
      return res.status(403).json({ success: false, message: "صلاحيات غير كافية" });
    }
    // Shares SWR cache with web GET /api/admin/dashboard/stats (5m fresh / 15m stale).
    const { getCachedAdminDashboardStats } = await import("../services/adminDashboardStatsService");
    const s = await getCachedAdminDashboardStats();
    const payload = {
      success: true,
      articles: {
        total: s.articles.total, published: s.articles.published,
        draft: s.articles.draft, scheduled: s.articles.scheduled,
      },
      users: {
        total: s.users.total, active24h: s.users.active24h, newThisWeek: s.users.newThisWeek,
      },
      comments: {
        total: s.comments.total, pending: s.comments.pending, approved: s.comments.approved,
      },
      mediaLibrary: {
        totalFiles: s.mediaLibrary.totalFiles, totalSize: s.mediaLibrary.totalSize,
      },
      aiImages: { total: s.aiImages.total, thisWeek: s.aiImages.thisWeek },
      smartBlocks: { total: s.smartBlocks.total },
    };
    res.json(payload);
  } catch (error) {
    console.error("[Mobile API] GET /admin/dashboard/full-stats error:", error);
    res.status(500).json({ success: false, message: "تعذر تحميل الإحصائيات" });
  }
});

// GET /api/v1/admin/articles?status=draft|scheduled|published|archived&page=&limit=
// Paginated list for one status tab. Returns total/totalPages so the client
// can show a "load more" button.
router.get("/admin/articles", async (req: Request, res: Response) => {
  try {
    const admin = await verifyAdminSession(req);
    if (!admin) {
      return res.status(403).json({ success: false, message: "صلاحيات غير كافية" });
    }

    const status = normalizeAdminStatus(String(req.query.status || "draft"));
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const limit = Math.max(1, Math.min(50, parseInt(String(req.query.limit || "10"), 10) || 10));
    const offset = (page - 1) * limit;

    const [countRow] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(articles)
      .where(articleStatusWhere(status));
    const total = countRow?.c || 0;

    const rows = await db
      .select(adminArticleColumns)
      .from(articles)
      .leftJoin(users, eq(articles.authorId, users.id))
      .leftJoin(reporterUsers, eq(articles.reporterId, reporterUsers.id))
      .where(articleStatusWhere(status))
      .orderBy(desc(articles.updatedAt), desc(articles.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({
      success: true,
      items: rows.map(mapAdminArticleRow),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (error) {
    console.error("[Mobile API] GET /admin/articles error:", error);
    res.status(500).json({ success: false, message: "تعذر تحميل الأخبار" });
  }
});

// POST /api/v1/admin/articles — create a new article (خبر جديد / مقال رأي)
router.post("/admin/articles", async (req: Request, res: Response) => {
  try {
    const admin = await verifyAdminSession(req);
    if (!admin) {
      return res.status(403).json({ success: false, message: "صلاحيات غير كافية" });
    }
    const b = req.body || {};
    const title = typeof b.title === "string" ? b.title.trim() : "";
    if (!title) {
      return res.status(400).json({ success: false, message: "العنوان مطلوب" });
    }
    const articleType = b.articleType === "opinion" ? "opinion" : "news";

    // Arabic-friendly slug + timestamp (same shape as /articles/submit).
    const baseSlug = title
      .toLowerCase()
      .trim()
      .replace(/[\s_]+/g, "-")
      .replace(/[^؀-ۿa-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    const slug = `${baseSlug || "article"}-${Date.now()}`;

    // authorId: opinion → chosen author (or creator); news → creator.
    const authorId = (articleType === "opinion" && typeof b.opinionAuthorId === "string" && b.opinionAuthorId)
      ? b.opinionAuthorId
      : admin.userId;

    const status = (typeof b.status === "string" && (ADMIN_ARTICLE_STATUSES as readonly string[]).includes(b.status))
      ? b.status
      : "draft";

    const articleData: any = {
      title,
      content: typeof b.content === "string" ? b.content : "",
      excerpt: typeof b.excerpt === "string" ? b.excerpt : null,
      subtitle: typeof b.subtitle === "string" ? b.subtitle : null,
      slug,
      status,
      articleType,
      newsType: typeof b.newsType === "string" ? b.newsType : "regular",
      categoryId: typeof b.categoryId === "string" && b.categoryId ? b.categoryId : null,
      reporterId: articleType === "news" && typeof b.reporterId === "string" && b.reporterId ? b.reporterId : null,
      authorId,
      submitterId: admin.userId,
      isFeatured: typeof b.isFeatured === "boolean" ? b.isFeatured : false,
      isReading: typeof b.isReading === "boolean" ? b.isReading : false,
      hideFromHomepage: typeof b.hideFromHomepage === "boolean" ? b.hideFromHomepage : false,
      aiSummary: typeof b.aiSummary === "string" ? b.aiSummary : null,
      imageUrl: typeof b.imageUrl === "string" && b.imageUrl ? b.imageUrl : null,
    };
    if (b.seo && typeof b.seo === "object") {
      articleData.seo = {
        metaTitle: typeof b.seo.metaTitle === "string" ? b.seo.metaTitle : "",
        metaDescription: typeof b.seo.metaDescription === "string" ? b.seo.metaDescription : "",
        keywords: Array.isArray(b.seo.keywords) ? b.seo.keywords : [],
      };
    }
    if (status === "scheduled" && typeof b.scheduledAt === "string" && b.scheduledAt) {
      const d = new Date(b.scheduledAt);
      if (!isNaN(d.getTime())) articleData.scheduledAt = d;
    }
    if (status === "published") {
      articleData.publishedAt = new Date();
    }

    const { storage } = await import("../storage");
    const created = await storage.createArticle(articleData);

    // Bust the counts cache so the new draft/scheduled shows immediately.
    try {
      const { memoryCache } = await import("../memoryCache");
      memoryCache.delete("mobile:admin:counts");
    } catch {}

    // If created already published, match the web's SEO/indexing side-effects.
    if (created.status === "published") {
      triggerPublishSeo(created as any, "mobile-create-publish");
    }

    res.status(201).json({ success: true, id: created.id, item: await fetchAdminArticleItem(created.id) });
  } catch (error) {
    console.error("[Mobile API] POST /admin/articles error:", error);
    res.status(500).json({ success: false, message: "تعذّر إنشاء الخبر" });
  }
});

// GET /api/v1/admin/articles/:id — full article for the editor
router.get("/admin/articles/:id", async (req: Request, res: Response) => {
  try {
    const admin = await verifyAdminSession(req);
    if (!admin) {
      return res.status(403).json({ success: false, message: "صلاحيات غير كافية" });
    }
    const article = await fetchAdminArticleDetail(req.params.id);
    if (!article) {
      return res.status(404).json({ success: false, message: "الخبر غير موجود" });
    }
    res.json({ success: true, article });
  } catch (error) {
    console.error("[Mobile API] GET /admin/articles/:id error:", error);
    res.status(500).json({ success: false, message: "تعذر تحميل الخبر" });
  }
});

// POST /api/v1/admin/articles/:id/publish — real publish
router.post("/admin/articles/:id/publish", async (req: Request, res: Response) => {
  try {
    const admin = await verifyAdminSession(req);
    if (!admin) {
      return res.status(403).json({ success: false, message: "صلاحيات غير كافية" });
    }

    const id = req.params.id;
    const [existing] = await db
      .select({ id: articles.id, publishedAt: articles.publishedAt })
      .from(articles)
      .where(eq(articles.id, id))
      .limit(1);
    if (!existing) {
      return res.status(404).json({ success: false, message: "الخبر غير موجود" });
    }

    await db
      .update(articles)
      .set({
        status: "published",
        reviewStatus: "approved",
        publishedAt: existing.publishedAt ?? new Date(),
        reviewedBy: admin.userId,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(articles.id, id));

    // SEO/indexing parity with the web: purge edge cache + ping IndexNow.
    const forSeo = await fetchArticleForNotify(id);
    if (forSeo) triggerPublishSeo(forSeo, "mobile-publish");

    res.json({ success: true, item: await fetchAdminArticleItem(id) });
  } catch (error) {
    console.error("[Mobile API] POST /admin/articles/:id/publish error:", error);
    res.status(500).json({ success: false, message: "تعذر نشر الخبر" });
  }
});

// PATCH /api/v1/admin/articles/:id — real edit
router.patch("/admin/articles/:id", async (req: Request, res: Response) => {
  try {
    const admin = await verifyAdminSession(req);
    if (!admin) {
      return res.status(403).json({ success: false, message: "صلاحيات غير كافية" });
    }

    const id = req.params.id;
    const [existing] = await db
      .select({ id: articles.id, publishedAt: articles.publishedAt, seo: articles.seo })
      .from(articles)
      .where(eq(articles.id, id))
      .limit(1);
    if (!existing) {
      return res.status(404).json({ success: false, message: "الخبر غير موجود" });
    }

    const b = req.body || {};
    const updates: Record<string, any> = { updatedAt: new Date() };

    // Text fields
    if (typeof b.title === "string") updates.title = b.title;
    if (typeof b.subtitle === "string") updates.subtitle = b.subtitle;
    if (typeof b.excerpt === "string") updates.excerpt = b.excerpt;
    // `content` is the article HTML; accept legacy `body` alias too.
    if (typeof b.content === "string") updates.content = b.content;
    else if (typeof b.body === "string") updates.content = b.body;
    if (typeof b.slug === "string" && b.slug.trim()) updates.slug = b.slug.trim();
    if (typeof b.aiSummary === "string") updates.aiSummary = b.aiSummary;
    if (typeof b.imageUrl === "string") updates.imageUrl = b.imageUrl;

    // Relations (allow explicit null to clear)
    if (b.categoryId === null || typeof b.categoryId === "string") updates.categoryId = b.categoryId || null;
    if (b.reporterId === null || typeof b.reporterId === "string") updates.reporterId = b.reporterId || null;
    // Opinion author → articles.authorId (the editor sends authorId for opinion).
    if (b.authorId === null || typeof b.authorId === "string") updates.authorId = b.authorId || null;

    // Enums / flags
    if (typeof b.articleType === "string") updates.articleType = b.articleType;
    if (typeof b.newsType === "string") updates.newsType = b.newsType;
    if (typeof b.isFeatured === "boolean") {
      updates.isFeatured = b.isFeatured;
      // لوحة الويب تختم displayOrder بثواني يونكس لحظة التمييز وهو ما يرتب
      // الكروسيل — بدون الختم هنا يبقى صفرًا ويغرق المقال تحت كل المختومين
      updates.displayOrder = b.isFeatured ? Math.floor(Date.now() / 1000) : 0;
    }
    if (typeof b.isReading === "boolean") updates.isReading = b.isReading;
    if (typeof b.hideFromHomepage === "boolean") updates.hideFromHomepage = b.hideFromHomepage;

    // Scheduling
    if (b.scheduledAt === null) {
      updates.scheduledAt = null;
    } else if (typeof b.scheduledAt === "string" && b.scheduledAt) {
      const d = new Date(b.scheduledAt);
      if (!isNaN(d.getTime())) updates.scheduledAt = d;
    }

    // SEO (merge over existing jsonb so partial updates don't wipe fields)
    if (b.seo && typeof b.seo === "object") {
      const prev = (existing.seo && typeof existing.seo === "object") ? (existing.seo as any) : {};
      updates.seo = {
        ...prev,
        metaTitle: typeof b.seo.metaTitle === "string" ? b.seo.metaTitle : (prev.metaTitle ?? ""),
        metaDescription: typeof b.seo.metaDescription === "string" ? b.seo.metaDescription : (prev.metaDescription ?? ""),
        keywords: Array.isArray(b.seo.keywords) ? b.seo.keywords : (prev.keywords ?? []),
      };
    }

    // Status (the four real values)
    if (typeof b.status === "string" && (ADMIN_ARTICLE_STATUSES as readonly string[]).includes(b.status)) {
      updates.status = b.status;
      if (b.status === "published" && !existing.publishedAt) {
        updates.publishedAt = new Date();
      }
    }

    await db.update(articles).set(updates).where(eq(articles.id, id));

    // Editing/publishing a published article must purge the edge cache (+ ping)
    // so crawlers/readers see the change, matching the web PATCH flow.
    const forSeo = await fetchArticleForNotify(id);
    if (forSeo?.status === "published") triggerPublishSeo(forSeo, "mobile-edit");

    res.json({ success: true, item: await fetchAdminArticleItem(id), article: await fetchAdminArticleDetail(id) });
  } catch (error) {
    console.error("[Mobile API] PATCH /admin/articles/:id error:", error);
    res.status(500).json({ success: false, message: "تعذر حفظ التعديلات" });
  }
});

// ---- Admin AI tools (thin wrappers over existing services) ----

// POST /api/v1/admin/ai/summarize — الموجز الذكي
// Uses the SAME OpenAI service the web summary button uses (summarizeArticle),
// not the Anthropic summarizeText — the Anthropic key may be absent on Railway.
router.post("/admin/ai/summarize", async (req: Request, res: Response) => {
  try {
    const admin = await verifyAdminSession(req);
    if (!admin) {
      return res.status(403).json({ success: false, message: "صلاحيات غير كافية" });
    }
    const content = typeof req.body?.content === "string"
      ? req.body.content
      : (typeof req.body?.text === "string" ? req.body.text : "");
    if (content.trim().length < 20) {
      return res.status(400).json({ success: false, message: "النص قصير جداً للتلخيص" });
    }
    const summary = await summarizeArticle(content);
    res.json({ success: true, summary });
  } catch (error) {
    console.error("[Mobile API] POST /admin/ai/summarize error:", error);
    res.status(500).json({ success: false, message: "تعذّر توليد الموجز" });
  }
});

// POST /api/v1/admin/seo/generate — توليد SEO + الكلمات المفتاحية
router.post("/admin/seo/generate", async (req: Request, res: Response) => {
  try {
    const admin = await verifyAdminSession(req);
    if (!admin) {
      return res.status(403).json({ success: false, message: "صلاحيات غير كافية" });
    }
    const b = req.body || {};
    const title = typeof b.title === "string" ? b.title : "";
    const content = typeof b.content === "string" ? b.content : "";
    if (!title.trim() || content.trim().length < 20) {
      return res.status(400).json({ success: false, message: "العنوان والمحتوى مطلوبان" });
    }
    const result = await generateSeoMetadata(
      {
        id: typeof b.id === "string" ? b.id : "draft",
        title,
        content,
        excerpt: typeof b.excerpt === "string" ? b.excerpt : undefined,
      },
      "ar",
    );
    res.json({
      success: true,
      seo: {
        metaTitle: result.content.metaTitle || "",
        metaDescription: result.content.metaDescription || "",
        keywords: Array.isArray(result.content.keywords) ? result.content.keywords : [],
      },
    });
  } catch (error) {
    console.error("[Mobile API] POST /admin/seo/generate error:", error);
    res.status(500).json({ success: false, message: "تعذّر توليد SEO" });
  }
});

// POST /api/v1/admin/media/upload — رفع صورة خبر (base64 → التخزين المعتمد)
router.post("/admin/media/upload", async (req: Request, res: Response) => {
  try {
    const admin = await verifyAdminSession(req);
    if (!admin) {
      return res.status(403).json({ success: false, message: "صلاحيات غير كافية" });
    }
    const image = req.body?.image;
    if (typeof image !== "string" || !image) {
      return res.status(400).json({ success: false, message: "الصورة مطلوبة (base64)" });
    }
    const matches = image.match(/^data:image\/(png|jpeg|jpg|webp|gif|heic|heif);base64,(.+)$/i);
    if (!matches) {
      return res.status(400).json({ success: false, message: "صيغة الصورة غير صحيحة" });
    }
    const ext = matches[1].toLowerCase() === "jpg" ? "jpeg" : matches[1].toLowerCase();
    const buffer = Buffer.from(matches[2], "base64");
    if (buffer.length > 10 * 1024 * 1024) {
      return res.status(400).json({ success: false, message: "حجم الصورة يجب أن يكون أقل من 10 ميجابايت" });
    }
    if (!newsImageStorageService.isUploadAvailable()) {
      return res.status(502).json({ success: false, message: "خدمة رفع الصورة غير مهيأة حالياً" });
    }
    const filename = `admin-article-${admin.userId}-${Date.now()}.${ext}`;
    const imageResult = await newsImageStorageService.upload({
      buffer,
      filename,
      mimeType: `image/${ext}`,
      purpose: "mobile-article-admin",
      metadata: { userId: admin.userId, source: "mobile-admin" },
      rolloutKey: `${admin.userId}:${filename}`,
    });
    if (!imageResult.success || !imageResult.deliveryUrl) {
      console.error("[Mobile API] admin image upload failed:", imageResult.error);
      return res.status(502).json({ success: false, message: "تعذر رفع الصورة" });
    }
    res.json({ success: true, url: imageResult.deliveryUrl });
  } catch (error) {
    console.error("[Mobile API] POST /admin/media/upload error:", error);
    res.status(500).json({ success: false, message: "حدث خطأ في رفع الصورة" });
  }
});

// Categories for AI classification + name→id resolution.
async function fetchCategoriesForAI() {
  return await db
    .select({ id: categories.id, slug: categories.slug, nameAr: categories.nameAr, nameEn: categories.nameEn })
    .from(categories);
}

function resolveCategoryIdByName(cats: Array<{ id: string; nameAr: string | null; nameEn: string | null }>, name?: string | null): string | null {
  if (!name) return null;
  const n = name.trim();
  if (!n) return null;
  let m = cats.find(c => c.nameAr === n || c.nameEn === n);
  if (!m) m = cats.find(c => (c.nameAr && (n.includes(c.nameAr) || c.nameAr.includes(n))) || (c.nameEn && c.nameEn.toLowerCase() === n.toLowerCase()));
  return m?.id ?? null;
}

// POST /api/v1/admin/ai/generate-all — توليد ذكي شامل (يملأ الحقول، لا يغيّر النص)
router.post("/admin/ai/generate-all", async (req: Request, res: Response) => {
  try {
    const admin = await verifyAdminSession(req);
    if (!admin) {
      return res.status(403).json({ success: false, message: "صلاحيات غير كافية" });
    }
    const content = typeof req.body?.content === "string" ? req.body.content : "";
    if (content.trim().length < 100) {
      return res.status(400).json({ success: false, message: "يجب كتابة المحتوى أولاً (100 حرف على الأقل)" });
    }
    const sc = await generateSmartContent(content, "ar");
    const cats = await fetchCategoriesForAI();
    let categoryId: string | null = null;
    let categoryName: string | null = sc.suggestedCategory ?? null;
    try {
      const cls = await classifyArticle(sc.mainTitle || "خبر", content, cats as any);
      categoryId = cls.primaryCategory?.categoryId ?? null;
      categoryName = cls.primaryCategory?.categoryName ?? categoryName;
    } catch (e) {
      console.warn("[Mobile API] generate-all classify failed:", (e as any)?.message);
      categoryId = resolveCategoryIdByName(cats, categoryName);
    }
    res.json({
      success: true,
      result: {
        title: sc.mainTitle || "",
        subtitle: sc.subTitle || "",
        summary: sc.smartSummary || "",
        keywords: Array.isArray(sc.keywords) ? sc.keywords : [],
        seo: { metaTitle: sc.seo?.metaTitle || "", metaDescription: sc.seo?.metaDescription || "" },
        categoryId,
        categoryName,
      },
    });
  } catch (error) {
    console.error("[Mobile API] POST /admin/ai/generate-all error:", error);
    res.status(500).json({ success: false, message: "تعذّر التوليد الذكي الشامل" });
  }
});

// POST /api/v1/admin/ai/edit-and-generate — تحرير وتوليد شامل (يعيد صياغة النص + الحقول)
router.post("/admin/ai/edit-and-generate", async (req: Request, res: Response) => {
  try {
    const admin = await verifyAdminSession(req);
    if (!admin) {
      return res.status(403).json({ success: false, message: "صلاحيات غير كافية" });
    }
    const content = typeof req.body?.content === "string" ? req.body.content : "";
    if (content.trim().length < 100) {
      return res.status(400).json({ success: false, message: "يجب كتابة المحتوى أولاً (100 حرف على الأقل)" });
    }
    const cats = await fetchCategoriesForAI();
    const [edited, sc] = await Promise.all([
      analyzeAndEditWithSabqStyle(content, "ar", cats.map(c => ({ nameAr: c.nameAr || "", nameEn: c.nameEn || "" }))),
      generateSmartContent(content, "ar"),
    ]);
    const categoryId = resolveCategoryIdByName(cats, edited.detectedCategory);
    res.json({
      success: true,
      result: {
        content: edited.optimized?.content || content,
        title: sc.mainTitle || edited.optimized?.title || "",
        subtitle: sc.subTitle || "",
        summary: sc.smartSummary || "",
        keywords: (sc.keywords && sc.keywords.length ? sc.keywords : edited.optimized?.seoKeywords) || [],
        seo: { metaTitle: sc.seo?.metaTitle || "", metaDescription: sc.seo?.metaDescription || "" },
        categoryId,
        categoryName: edited.detectedCategory || null,
      },
    });
  } catch (error) {
    console.error("[Mobile API] POST /admin/ai/edit-and-generate error:", error);
    res.status(500).json({ success: false, message: "تعذّر التحرير والتوليد الشامل" });
  }
});

// POST /api/v1/admin/ai/proofread — تدقيق لغوي (مطابق لمنطق الويب /api/ai/proofread)
router.post("/admin/ai/proofread", async (req: Request, res: Response) => {
  try {
    const admin = await verifyAdminSession(req);
    if (!admin) {
      return res.status(403).json({ success: false, message: "صلاحيات غير كافية" });
    }
    const content = typeof req.body?.content === "string" ? req.body.content : "";
    const cleanText = content.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    if (cleanText.length < 10) {
      return res.json({ success: true, issues: [] });
    }
    const truncated = cleanText.length > 8000 ? cleanText.substring(0, 8000) : cleanText;

    const { default: OpenAI } = await import("openai");
    const openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const { withRetry } = await import("../openai");

    const response = await withRetry(
      () => openaiClient.chat.completions.create({
        model: "gpt-5.1",
        messages: [
          {
            role: "system",
            content: `أنت مدقق إملائي صارم للنصوص العربية الصحفية. مهمتك الوحيدة هي اكتشاف الأخطاء الإملائية الحقيقية فقط (حروف خاطئة، همزات، التاء المربوطة/المفتوحة، الألف المقصورة/الياء). ارفض رفضاً قاطعاً علامات التشكيل والترقيم والمسافات والنحو والأسلوب وأسماء الأعلام. إن كان الفرق مجرد تشكيل أو ترقيم أو مسافة فلا تُرجِعه. أعد JSON بهذا الشكل: { "issues": [ { "original": "الكلمة الخاطئة بدون تشكيل", "suggestion": "الكلمة الصحيحة بدون تشكيل", "type": "إملائي", "explanation": "سبب موجز" } ] }. إن لم تجد خطأً حقيقياً أعد { "issues": [] }`,
          },
          { role: "user", content: `دقّق هذا النص إملائياً فقط دون تعديل المعنى:\n\n${truncated}` },
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 2048,
      }),
      3,
      "AdminProofread",
    );

    const raw = response.choices?.[0]?.message?.content || '{"issues":[]}';
    let parsed: { issues: Array<{ original: string; suggestion: string; type?: string; explanation?: string }> } = { issues: [] };
    try { parsed = JSON.parse(raw); } catch { parsed = { issues: [] }; }

    const normalize = (t: string) =>
      t.replace(/[ً-ٰٟـ]/g, "")
        .replace(/[​-‏‪-‮﻿]/g, "")
        .replace(/[.,،;؛:!؟?\(\)\[\]"'«»“”]/g, "")
        .replace(/\s+/g, " ")
        .trim();

    const seen = new Set<string>();
    const issues = (Array.isArray(parsed.issues) ? parsed.issues : [])
      .filter(i => i && typeof i.original === "string" && typeof i.suggestion === "string")
      .filter(i => i.original.trim() !== i.suggestion.trim())
      .filter(i => normalize(i.original) !== normalize(i.suggestion))
      .filter(i => normalize(i.original).length >= 2)
      .filter(i => cleanText.includes(i.original))
      .filter(i => {
        const key = `${i.original}→${i.suggestion}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 50);

    res.json({ success: true, issues });
  } catch (error: any) {
    console.error("[Mobile API] POST /admin/ai/proofread error:", error?.message || error);
    const isRateLimit = error?.status === 429 || error?.message?.includes("429");
    res.status(isRateLimit ? 429 : 500).json({ success: false, message: isRateLimit ? "تم تجاوز حد الطلبات، حاول بعد قليل" : "تعذّر التدقيق اللغوي" });
  }
});

// POST /api/v1/admin/ai/image-generate — توليد الصور (nano-banana / Gemini → Cloudflare)
router.post("/admin/ai/image-generate", async (req: Request, res: Response) => {
  try {
    const admin = await verifyAdminSession(req);
    if (!admin) {
      return res.status(403).json({ success: false, message: "صلاحيات غير كافية" });
    }
    const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
    if (!prompt) {
      return res.status(400).json({ success: false, message: "وصف الصورة مطلوب" });
    }
    const allowedRatios = ["1:1", "16:9", "4:3", "9:16", "21:9", "3:4"];
    const allowedSizes = ["1K", "2K", "4K"];
    const aspectRatio = allowedRatios.includes(req.body?.aspectRatio) ? req.body.aspectRatio : "16:9";
    const imageSize = allowedSizes.includes(req.body?.imageSize) ? req.body.imageSize : "2K";

    // Optional text overlay (the "خبر مميز" template) + generation flags.
    const overlayText = typeof req.body?.overlayText === "string" && req.body.overlayText.trim()
      ? req.body.overlayText.trim()
      : undefined;
    const ov = req.body?.overlayOptions;
    const overlayOptions = (ov && typeof ov === "object")
      ? {
          fontSize: typeof ov.fontSize === "number" ? ov.fontSize : 72,
          fontColor: typeof ov.fontColor === "string" ? ov.fontColor : "#FFFFFF",
          backgroundColor: typeof ov.backgroundColor === "string" ? ov.backgroundColor : "rgba(0, 0, 0, 0.6)",
          position: ["center", "top", "bottom"].includes(ov.position) ? ov.position : "center",
        }
      : undefined;
    const enableThinking = req.body?.enableThinking !== false;
    const enableSearchGrounding = req.body?.enableSearchGrounding === true;

    const result = await generateAndUploadImage(
      { prompt, aspectRatio, imageSize, enableThinking, enableSearchGrounding, overlayText, overlayOptions },
      admin.userId,
    );
    if (!result.success || !result.imageUrl) {
      return res.status(502).json({ success: false, message: result.error || "تعذّر توليد الصورة (تحقق من تهيئة Gemini)" });
    }
    res.json({ success: true, imageUrl: result.imageUrl });
  } catch (error) {
    console.error("[Mobile API] POST /admin/ai/image-generate error:", error);
    res.status(500).json({ success: false, message: "تعذّر توليد الصورة" });
  }
});

// POST /api/v1/admin/auto-image/generate — توليد صورة بضغطة واحدة
// Uses the SAME service as the web's one-click AutoImageGenerator: reads the
// saved global settings (style/provider) and builds the prompt from content.
router.post("/admin/auto-image/generate", async (req: Request, res: Response) => {
  try {
    const admin = await verifyAdminSession(req);
    if (!admin) {
      return res.status(403).json({ success: false, message: "صلاحيات غير كافية" });
    }
    const b = req.body || {};
    const articleId = typeof b.articleId === "string" ? b.articleId : "";
    const title = typeof b.title === "string" ? b.title.trim() : "";
    if (!articleId || !title) {
      return res.status(400).json({ success: false, message: "الخبر والعنوان مطلوبان" });
    }
    const result = await autoGenerateImage(
      {
        articleId,
        title,
        content: typeof b.content === "string" ? b.content : undefined,
        excerpt: typeof b.excerpt === "string" ? b.excerpt : undefined,
        category: typeof b.category === "string" ? b.category : undefined,
        language: "ar",
        articleType: typeof b.articleType === "string" ? b.articleType : undefined,
        // Manual one-click → bypass the auto-enable / type / category / limit
        // gates, but still use the saved style + provider.
        forceGeneration: true,
      },
      admin.userId,
    );
    if (!result.success || !result.imageUrl) {
      return res.status(502).json({ success: false, message: result.message || "تعذّر توليد الصورة (تحقق من الإعدادات وتهيئة Gemini)" });
    }
    res.json({ success: true, imageUrl: result.imageUrl });
  } catch (error) {
    console.error("[Mobile API] POST /admin/auto-image/generate error:", error);
    res.status(500).json({ success: false, message: "تعذّر توليد الصورة" });
  }
});

// GET /api/v1/admin/users?role=reporter|opinion_author&query=&limit=
// Lists staff by role for the reporter / opinion-author pickers.
router.get("/admin/users", async (req: Request, res: Response) => {
  try {
    const admin = await verifyAdminSession(req);
    if (!admin) {
      return res.status(403).json({ success: false, message: "صلاحيات غير كافية" });
    }
    const role = String(req.query.role || "").trim();
    if (!["reporter", "opinion_author"].includes(role)) {
      return res.status(400).json({ success: false, message: "الدور غير مدعوم" });
    }
    const q = String(req.query.query || "").trim();
    const limit = Math.max(1, Math.min(200, parseInt(String(req.query.limit || "100"), 10) || 100));

    const conditions = [eq(roles.name, role)];
    if (q) {
      conditions.push(or(
        ilike(users.firstName, `%${q}%`),
        ilike(users.lastName, `%${q}%`),
        ilike(users.email, `%${q}%`),
      ) as any);
    }

    const rows = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        avatarUrl: users.profileImageUrl,
      })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .innerJoin(users, eq(userRoles.userId, users.id))
      .where(and(...conditions))
      .limit(limit);

    const items = rows.map(r => ({
      id: r.id,
      name: [r.firstName, r.lastName].filter(Boolean).join(" ").trim() || (r.email ?? "بدون اسم"),
      email: r.email ?? null,
      avatarUrl: r.avatarUrl ?? null,
    }));
    res.json({ success: true, items });
  } catch (error) {
    console.error("[Mobile API] GET /admin/users error:", error);
    res.status(500).json({ success: false, message: "تعذّر تحميل القائمة" });
  }
});

// ---- Admin editorial workflow (archive / request-revision / permanent delete) ----
//
// Mobile mirrors of the web CMS actions. Each fires the SAME
// `notifyArticleStakeholders` fan-out the web uses, so the author/reporter
// gets the identical push + email + deep link.

// POST /api/v1/admin/articles/:id/archive — "حذف" (أرشفة بسبب، soft delete)
router.post("/admin/articles/:id/archive", async (req: Request, res: Response) => {
  try {
    const admin = await verifyAdminSession(req);
    if (!admin) {
      return res.status(403).json({ success: false, message: "صلاحيات غير كافية" });
    }
    const reason = (req.body?.reviewNotes ?? "").toString().trim();
    if (reason.length < 5) {
      return res.status(400).json({ success: false, message: "سبب الأرشفة مطلوب (5 أحرف على الأقل)", field: "reviewNotes" });
    }
    const article = await fetchArticleForNotify(req.params.id);
    if (!article) {
      return res.status(404).json({ success: false, message: "الخبر غير موجود" });
    }

    await db
      .update(articles)
      .set({ status: "archived", reviewStatus: null, reviewNotes: reason, updatedAt: new Date() })
      .where(eq(articles.id, req.params.id));

    await notifyArticleStakeholders(article, "archived", reason, { excludeUserId: admin.userId });

    res.json({ success: true, item: await fetchAdminArticleItem(req.params.id) });
  } catch (error) {
    console.error("[Mobile API] POST /admin/articles/:id/archive error:", error);
    res.status(500).json({ success: false, message: "تعذّر أرشفة الخبر" });
  }
});

// POST /api/v1/admin/articles/:id/request-revision — طلب تعديل بملاحظات
router.post("/admin/articles/:id/request-revision", async (req: Request, res: Response) => {
  try {
    const admin = await verifyAdminSession(req);
    if (!admin) {
      return res.status(403).json({ success: false, message: "صلاحيات غير كافية" });
    }
    const notes = (req.body?.reviewNotes ?? "").toString().trim();
    if (notes.length < 5) {
      return res.status(400).json({ success: false, message: "الملاحظات مطلوبة (5 أحرف على الأقل)", field: "reviewNotes" });
    }
    const article = await fetchArticleForNotify(req.params.id);
    if (!article) {
      return res.status(404).json({ success: false, message: "الخبر غير موجود" });
    }

    await db
      .update(articles)
      .set({
        status: "draft",
        reviewStatus: "needs_changes",
        reviewedBy: admin.userId,
        reviewedAt: new Date(),
        reviewNotes: notes,
        updatedAt: new Date(),
      })
      .where(eq(articles.id, req.params.id));

    await notifyArticleStakeholders(article, "needs_revision", notes, { excludeUserId: admin.userId });

    res.json({ success: true, item: await fetchAdminArticleItem(req.params.id) });
  } catch (error) {
    console.error("[Mobile API] POST /admin/articles/:id/request-revision error:", error);
    res.status(500).json({ success: false, message: "تعذّر إرسال طلب التعديل" });
  }
});

// DELETE /api/v1/admin/articles/:id/permanent — حذف نهائي (للمؤرشفة فقط)
router.delete("/admin/articles/:id/permanent", async (req: Request, res: Response) => {
  try {
    const admin = await verifyAdminSession(req);
    if (!admin) {
      return res.status(403).json({ success: false, message: "صلاحيات غير كافية" });
    }
    const article = await fetchArticleForNotify(req.params.id);
    if (!article) {
      return res.status(404).json({ success: false, message: "الخبر غير موجود" });
    }
    if (article.status !== "archived") {
      return res.status(400).json({ success: false, message: "الحذف النهائي متاح فقط للأخبار المؤرشفة" });
    }
    const reason = (req.body?.deletionReason ?? "").toString().trim()
      || (article.reviewNotes ?? "").toString().trim()
      || "تم حذف المحتوى نهائياً من قبل فريق التحرير";

    await db.delete(articles).where(eq(articles.id, req.params.id));

    await notifyArticleStakeholders(article, "deleted", reason, { excludeUserId: admin.userId });

    res.json({ success: true });
  } catch (error) {
    console.error("[Mobile API] DELETE /admin/articles/:id/permanent error:", error);
    res.status(500).json({ success: false, message: "تعذّر حذف الخبر نهائياً" });
  }
});

// ==========================================
// Admin inbox — opinion tickets + contact messages
// ==========================================
// These are mobile-session counterparts to the web dashboard systems. They
// intentionally use the same strict `verifyAdminSession` guard as the rest
// of the iOS newsroom dashboard: only platform admins can access visitor
// contact data or writer/editorial conversations.

const ADMIN_CONTACT_STATUSES = ["pending", "read", "replied"] as const;
const ADMIN_TICKET_STATUSES = ["open", "answered", "closed"] as const;

function displayName(firstName?: string | null, lastName?: string | null): string | null {
  const name = [firstName, lastName].filter(Boolean).join(" ").trim();
  return name || null;
}

function escapeEmailHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// GET /api/v1/admin/contact-messages — paginated inbox with status/search filters.
router.get("/admin/contact-messages", async (req: Request, res: Response) => {
  try {
    const admin = await verifyAdminSession(req);
    if (!admin) return res.status(403).json({ success: false, message: "صلاحيات غير كافية" });

    const page = Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10) || 1);
    const limit = Math.max(1, Math.min(50, Number.parseInt(String(req.query.limit ?? "20"), 10) || 20));
    const status = String(req.query.status ?? "all");
    const search = String(req.query.search ?? "").trim().slice(0, 120);
    const conditions = [] as any[];

    if ((ADMIN_CONTACT_STATUSES as readonly string[]).includes(status)) {
      conditions.push(eq(contactMessages.status, status));
    }
    if (search) {
      const term = `%${search}%`;
      conditions.push(or(
        ilike(contactMessages.name, term),
        ilike(contactMessages.email, term),
        ilike(contactMessages.subject, term),
      ));
    }
    const where = conditions.length ? and(...conditions) : undefined;
    const [messages, counts] = await Promise.all([
      db.select().from(contactMessages).where(where).orderBy(desc(contactMessages.createdAt)).limit(limit).offset((page - 1) * limit),
      db.select({ count: sql<number>`count(*)::int` }).from(contactMessages).where(where),
    ]);
    const total = counts[0]?.count ?? 0;
    res.set("Cache-Control", "private, no-store");
    res.json({
      success: true,
      messages,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (error) {
    console.error("[Mobile API] GET /admin/contact-messages error:", error);
    res.status(500).json({ success: false, message: "تعذّر تحميل رسائل التواصل" });
  }
});

// GET /api/v1/admin/contact-messages/:id — detail plus every recorded reply.
// Opening a pending message marks it read, just as an inbox should, without
// changing messages that were already replied to.
router.get("/admin/contact-messages/:id", async (req: Request, res: Response) => {
  try {
    const admin = await verifyAdminSession(req);
    if (!admin) return res.status(403).json({ success: false, message: "صلاحيات غير كافية" });

    const [message] = await db.select().from(contactMessages)
      .where(eq(contactMessages.id, req.params.id)).limit(1);
    if (!message) return res.status(404).json({ success: false, message: "الرسالة غير موجودة" });

    if (message.status === "pending") {
      await db.update(contactMessages).set({ status: "read" }).where(eq(contactMessages.id, message.id));
      message.status = "read";
    }

    const replies = await db
      .select({
        id: contactMessageReplies.id,
        messageId: contactMessageReplies.messageId,
        replyText: contactMessageReplies.replyText,
        repliedBy: contactMessageReplies.repliedBy,
        createdAt: contactMessageReplies.createdAt,
        updatedAt: contactMessageReplies.updatedAt,
        isEdited: contactMessageReplies.isEdited,
        responderFirstName: contactReplyUsers.firstName,
        responderLastName: contactReplyUsers.lastName,
      })
      .from(contactMessageReplies)
      .leftJoin(contactReplyUsers, eq(contactMessageReplies.repliedBy, contactReplyUsers.id))
      .where(eq(contactMessageReplies.messageId, message.id))
      .orderBy(asc(contactMessageReplies.createdAt));

    res.set("Cache-Control", "private, no-store");
    res.json({
      success: true,
      message,
      replies: replies.map((reply) => ({
        ...reply,
        responderName: displayName(reply.responderFirstName, reply.responderLastName),
      })),
    });
  } catch (error) {
    console.error("[Mobile API] GET /admin/contact-messages/:id error:", error);
    res.status(500).json({ success: false, message: "تعذّر تحميل الرسالة" });
  }
});

// PATCH /api/v1/admin/contact-messages/:id — update inbox state.
router.patch("/admin/contact-messages/:id", async (req: Request, res: Response) => {
  try {
    const admin = await verifyAdminSession(req);
    if (!admin) return res.status(403).json({ success: false, message: "صلاحيات غير كافية" });
    const status = String(req.body?.status ?? "");
    if (!(ADMIN_CONTACT_STATUSES as readonly string[]).includes(status)) {
      return res.status(400).json({ success: false, message: "حالة الرسالة غير صالحة" });
    }

    const updates: Partial<typeof contactMessages.$inferInsert> = { status };
    if (status === "replied") {
      updates.repliedAt = new Date();
      updates.repliedBy = admin.userId;
    }
    const [message] = await db.update(contactMessages).set(updates)
      .where(eq(contactMessages.id, req.params.id)).returning();
    if (!message) return res.status(404).json({ success: false, message: "الرسالة غير موجودة" });
    res.json({ success: true, message: "تم تحديث حالة الرسالة", data: message });
  } catch (error) {
    console.error("[Mobile API] PATCH /admin/contact-messages/:id error:", error);
    res.status(500).json({ success: false, message: "تعذّر تحديث حالة الرسالة" });
  }
});

// POST /api/v1/admin/contact-messages/:id/reply — records the reply and sends
// it to the visitor. Email input is escaped before interpolation so a contact
// form submission can never alter the outgoing email markup.
router.post("/admin/contact-messages/:id/reply", async (req: Request, res: Response) => {
  try {
    const admin = await verifyAdminSession(req);
    if (!admin) return res.status(403).json({ success: false, message: "صلاحيات غير كافية" });
    const replyText = typeof req.body?.replyText === "string" ? req.body.replyText.trim() : "";
    if (!replyText || replyText.length > 10_000) {
      return res.status(400).json({ success: false, message: "نص الرد مطلوب ولا يتجاوز 10000 حرف" });
    }

    const [message] = await db.select().from(contactMessages)
      .where(eq(contactMessages.id, req.params.id)).limit(1);
    if (!message) return res.status(404).json({ success: false, message: "الرسالة غير موجودة" });

    const name = escapeEmailHtml(message.name);
    const subject = escapeEmailHtml(message.subject);
    const original = escapeEmailHtml(message.message);
    const reply = escapeEmailHtml(replyText);
    const emailResult = await sendEmailNotification({
      to: message.email,
      subject: `رد على رسالتك: ${message.subject}`,
      text: `مرحباً ${message.name}،\n\nشكراً لتواصلك معنا.\n\nرسالتك الأصلية:\n${message.message}\n\nردنا:\n${replyText}\n\nمع تحيات،\nصحيفة سبق الإلكترونية`,
      html: `<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.8"><h2>رد على رسالتك</h2><p>مرحباً ${name}،</p><p>شكراً لتواصلك معنا.</p><div style="padding:12px;background:#f5f5f5;border-radius:8px"><strong>موضوع رسالتك:</strong> ${subject}<br/>${original}</div><div style="margin-top:16px;padding:12px;background:#ecfdf5;border-right:4px solid #10b981;border-radius:8px"><strong>ردنا:</strong><br/>${reply}</div><p>صحيفة سبق الإلكترونية</p></div>`,
    });
    if (!emailResult.success) {
      console.error("[Mobile API] contact reply email failed:", emailResult.error);
      return res.status(502).json({ success: false, message: "تعذّر إرسال الرد بالبريد الإلكتروني" });
    }

    const now = new Date();
    const [createdReply] = await db.insert(contactMessageReplies).values({
      messageId: message.id,
      replyText,
      repliedBy: admin.userId,
    }).returning();
    const [updatedMessage] = await db.update(contactMessages).set({
      status: "replied",
      repliedAt: now,
      repliedBy: admin.userId,
      replyText,
    }).where(eq(contactMessages.id, message.id)).returning();

    res.status(201).json({ success: true, message: "تم إرسال الرد بنجاح", data: updatedMessage, reply: createdReply, emailSent: true });
  } catch (error) {
    console.error("[Mobile API] POST /admin/contact-messages/:id/reply error:", error);
    res.status(500).json({ success: false, message: "تعذّر إرسال الرد" });
  }
});

// GET /api/v1/admin/opinion-tickets — editorial ticket inbox.
router.get("/admin/opinion-tickets", async (req: Request, res: Response) => {
  try {
    const admin = await verifyAdminSession(req);
    if (!admin) return res.status(403).json({ success: false, message: "صلاحيات غير كافية" });

    const page = Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10) || 1);
    const limit = Math.max(1, Math.min(50, Number.parseInt(String(req.query.limit ?? "20"), 10) || 20));
    const status = String(req.query.status ?? "all");
    const search = String(req.query.search ?? "").trim().slice(0, 120);
    const conditions = [] as any[];
    if ((ADMIN_TICKET_STATUSES as readonly string[]).includes(status)) {
      conditions.push(eq(opinionTickets.status, status));
    }
    if (search) {
      const term = `%${search}%`;
      conditions.push(or(
        ilike(opinionTickets.title, term),
        ilike(users.firstName, term),
        ilike(users.lastName, term),
        ilike(users.email, term),
      ));
    }
    const where = conditions.length ? and(...conditions) : undefined;
    const [rows, counts] = await Promise.all([
      db.select({
        id: opinionTickets.id,
        writerId: opinionTickets.writerId,
        title: opinionTickets.title,
        status: opinionTickets.status,
        lastMessageAt: opinionTickets.lastMessageAt,
        lastReadByAdminAt: opinionTickets.lastReadByAdminAt,
        createdAt: opinionTickets.createdAt,
        updatedAt: opinionTickets.updatedAt,
        writerFirstName: users.firstName,
        writerLastName: users.lastName,
        writerEmail: users.email,
      }).from(opinionTickets).leftJoin(users, eq(opinionTickets.writerId, users.id))
        .where(where).orderBy(desc(opinionTickets.lastMessageAt)).limit(limit).offset((page - 1) * limit),
      db.select({ count: sql<number>`count(*)::int` }).from(opinionTickets)
        .leftJoin(users, eq(opinionTickets.writerId, users.id)).where(where),
    ]);
    const total = counts[0]?.count ?? 0;
    res.set("Cache-Control", "private, no-store");
    res.json({
      success: true,
      tickets: rows.map((ticket) => ({
        id: ticket.id,
        writerId: ticket.writerId,
        writerName: displayName(ticket.writerFirstName, ticket.writerLastName),
        writerEmail: ticket.writerEmail,
        title: ticket.title,
        status: ticket.status,
        lastMessageAt: ticket.lastMessageAt,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
        hasUnread: !ticket.lastReadByAdminAt || ticket.lastMessageAt > ticket.lastReadByAdminAt,
      })),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (error) {
    console.error("[Mobile API] GET /admin/opinion-tickets error:", error);
    res.status(500).json({ success: false, message: "تعذّر تحميل استفسارات الرأي" });
  }
});

// GET /api/v1/admin/opinion-tickets/:id — ticket thread and read marker.
router.get("/admin/opinion-tickets/:id", async (req: Request, res: Response) => {
  try {
    const admin = await verifyAdminSession(req);
    if (!admin) return res.status(403).json({ success: false, message: "صلاحيات غير كافية" });
    const [ticket] = await db.select({
      id: opinionTickets.id,
      writerId: opinionTickets.writerId,
      title: opinionTickets.title,
      status: opinionTickets.status,
      lastMessageAt: opinionTickets.lastMessageAt,
      createdAt: opinionTickets.createdAt,
      updatedAt: opinionTickets.updatedAt,
      writerFirstName: users.firstName,
      writerLastName: users.lastName,
      writerEmail: users.email,
    }).from(opinionTickets).leftJoin(users, eq(opinionTickets.writerId, users.id))
      .where(eq(opinionTickets.id, req.params.id)).limit(1);
    if (!ticket) return res.status(404).json({ success: false, message: "الاستفسار غير موجود" });

    const messages = await db.select({
      id: opinionTicketMessages.id,
      ticketId: opinionTicketMessages.ticketId,
      senderId: opinionTicketMessages.senderId,
      senderRole: opinionTicketMessages.senderRole,
      message: opinionTicketMessages.message,
      parentMessageId: opinionTicketMessages.parentMessageId,
      createdAt: opinionTicketMessages.createdAt,
      senderFirstName: users.firstName,
      senderLastName: users.lastName,
    }).from(opinionTicketMessages).leftJoin(users, eq(opinionTicketMessages.senderId, users.id))
      .where(eq(opinionTicketMessages.ticketId, ticket.id)).orderBy(asc(opinionTicketMessages.createdAt));
    await db.update(opinionTickets).set({ lastReadByAdminAt: new Date() }).where(eq(opinionTickets.id, ticket.id));

    res.set("Cache-Control", "private, no-store");
    res.json({
      success: true,
      ticket: {
        id: ticket.id,
        writerId: ticket.writerId,
        writerName: displayName(ticket.writerFirstName, ticket.writerLastName),
        writerEmail: ticket.writerEmail,
        title: ticket.title,
        status: ticket.status,
        lastMessageAt: ticket.lastMessageAt,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
      },
      messages: messages.map((message) => ({
        ...message,
        senderName: displayName(message.senderFirstName, message.senderLastName),
      })),
    });
  } catch (error) {
    console.error("[Mobile API] GET /admin/opinion-tickets/:id error:", error);
    res.status(500).json({ success: false, message: "تعذّر تحميل الاستفسار" });
  }
});

// POST /api/v1/admin/opinion-tickets/:id/messages — editorial reply.
router.post("/admin/opinion-tickets/:id/messages", async (req: Request, res: Response) => {
  try {
    const admin = await verifyAdminSession(req);
    if (!admin) return res.status(403).json({ success: false, message: "صلاحيات غير كافية" });
    const text = typeof req.body?.message === "string" ? req.body.message.trim() : "";
    if (!text || text.length > 10_000) {
      return res.status(400).json({ success: false, message: "نص الرد مطلوب ولا يتجاوز 10000 حرف" });
    }
    const [ticket] = await db.select().from(opinionTickets).where(eq(opinionTickets.id, req.params.id)).limit(1);
    if (!ticket) return res.status(404).json({ success: false, message: "الاستفسار غير موجود" });
    if (ticket.status === "closed") return res.status(400).json({ success: false, message: "تم إغلاق هذا الاستفسار" });

    const parentMessageId = typeof req.body?.parentMessageId === "string" ? req.body.parentMessageId : null;
    if (parentMessageId) {
      const [parent] = await db.select({ ticketId: opinionTicketMessages.ticketId }).from(opinionTicketMessages)
        .where(eq(opinionTicketMessages.id, parentMessageId)).limit(1);
      if (!parent || parent.ticketId !== ticket.id) {
        return res.status(400).json({ success: false, message: "مرجع الرد غير صالح" });
      }
    }

    const now = new Date();
    const [message] = await db.insert(opinionTicketMessages).values({
      ticketId: ticket.id,
      senderId: admin.userId,
      senderRole: "admin",
      message: text,
      parentMessageId,
    }).returning();
    await db.update(opinionTickets).set({
      lastMessageAt: now,
      lastReadByAdminAt: now,
      updatedAt: now,
      ...(ticket.status === "open" ? { status: "answered" } : {}),
    }).where(eq(opinionTickets.id, ticket.id));
    res.status(201).json({ success: true, message: "تم إرسال الرد بنجاح", data: message });
  } catch (error) {
    console.error("[Mobile API] POST /admin/opinion-tickets/:id/messages error:", error);
    res.status(500).json({ success: false, message: "تعذّر إرسال الرد" });
  }
});

// PATCH /api/v1/admin/opinion-tickets/:id/status — open / answered / closed.
router.patch("/admin/opinion-tickets/:id/status", async (req: Request, res: Response) => {
  try {
    const admin = await verifyAdminSession(req);
    if (!admin) return res.status(403).json({ success: false, message: "صلاحيات غير كافية" });
    const status = String(req.body?.status ?? "");
    if (!(ADMIN_TICKET_STATUSES as readonly string[]).includes(status)) {
      return res.status(400).json({ success: false, message: "حالة الاستفسار غير صالحة" });
    }
    const [ticket] = await db.update(opinionTickets).set({ status, updatedAt: new Date() })
      .where(eq(opinionTickets.id, req.params.id)).returning();
    if (!ticket) return res.status(404).json({ success: false, message: "الاستفسار غير موجود" });
    res.json({ success: true, ticket });
  } catch (error) {
    console.error("[Mobile API] PATCH /admin/opinion-tickets/:id/status error:", error);
    res.status(500).json({ success: false, message: "تعذّر تحديث حالة الاستفسار" });
  }
});

// ==========================================
// Contributor Dashboard Analytics (writer / reporter)
// GET /api/v1/contributor/analytics
// ==========================================
router.get("/contributor/analytics", async (req: Request, res: Response) => {
  try {
    const session = await verifyMemberSession(req);
    if (!session) {
      return res.status(401).json({ success: false, message: "غير مسجل" });
    }
    const userId = session.userId;

    // Determine role
    const userRolesResult = await db
      .select({ roleName: roles.name })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, userId));
    const roleNames = userRolesResult.map(r => r.roleName);

    const writerRoles = ["opinion_author", "columnist", "article_author", "article_writer", "writer", "author"];
    const reporterRoles = ["reporter", "correspondent", "journalist"];
    const isWriter = roleNames.some(r => writerRoles.includes(r));
    const isReporter = roleNames.some(r => reporterRoles.includes(r));

    if (!isWriter && !isReporter) {
      return res.status(403).json({ success: false, message: "هذه اللوحة خاصة بالكتّاب والمراسلين" });
    }

    // Fetch articles based on role.
    // أعمدة محددة فقط — select() الكامل كان يجلب نصوص المقالات وحقول SEO
    // لكل أرشيف الكاتب، وهو سبب بطء فتح لوحة الأداء في التطبيق.
    const isOpinionAuthor = roleNames.includes("opinion_author");
    const myArticles = await db
      .select({
        id: articles.id,
        title: articles.title,
        status: articles.status,
        reviewStatus: articles.reviewStatus,
        reviewNotes: articles.reviewNotes,
        views: articles.views,
        publishedAt: articles.publishedAt,
        createdAt: articles.createdAt,
        updatedAt: articles.updatedAt,
      })
      .from(articles)
      .where(
        isOpinionAuthor
          ? and(eq(articles.articleType, "opinion"), or(eq(articles.authorId, userId), eq(articles.submitterId, userId)))
          : or(eq(articles.authorId, userId), eq(articles.reporterId, userId), eq(articles.submitterId, userId)),
      );

    const articleIds = myArticles.map(a => a.id);

    const publishedCount = myArticles.filter(a => a.status === "published").length;
    const draftCount = myArticles.filter(a => a.status === "draft").length;
    const pendingCount = myArticles.filter(a => a.reviewStatus === "pending_review" || a.status === "pending").length;
    const needsChangesCount = myArticles.filter(a => a.reviewStatus === "needs_changes").length;
    const rejectedCount = myArticles.filter(a => a.status === "rejected").length;
    const totalViews = myArticles.reduce((sum, a) => sum + (a.views || 0), 0);

    if (articleIds.length === 0) {
      const [fc] = await db.select({ c: sql<number>`count(*)::int` }).from(socialFollows).where(eq(socialFollows.followingId, userId));
      return res.json({
        success: true,
        role: isWriter ? "writer" : "reporter",
        totalArticles: 0, publishedArticles: 0, draftArticles: 0,
        pendingArticles: 0, needsChangesArticles: 0, rejectedArticles: 0,
        totalViews: 0, totalLikes: 0, totalComments: 0, totalBookmarks: 0,
        dailyStats: [], bestArticleThisWeek: null,
        comparison: { viewsThisMonth: 0, viewsLastMonth: 0, likesThisMonth: 0, likesLastMonth: 0 },
        followers: { count: fc?.c || 0, dailyGrowth: [] },
        topArticles: [], featuredComment: null,
        publishingActivity: { lastPublishedAt: null, daysSinceLastPublished: null, thisWeekCount: 0, thisMonthCount: 0 },
        articles: [],
      });
    }

    const [likesResult, commentsResult, bookmarksResult] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(reactions)
        .where(and(inArray(reactions.articleId, articleIds), eq(reactions.type, "like"))),
      db.select({ count: sql<number>`count(*)::int` }).from(comments)
        .where(inArray(comments.articleId, articleIds)),
      db.select({ count: sql<number>`count(*)::int` }).from(bookmarks)
        .where(inArray(bookmarks.articleId, articleIds)),
    ]);

    // Daily stats
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split("T")[0];

    let dailyStatsRows: Array<{ date: string; views: number; likes: number; comments: number }> = [];
    let thisMonthStats = [{ views: 0, likes: 0 }];
    let lastMonthStats = [{ views: 0, likes: 0 }];

    try {
      dailyStatsRows = await db
        .select({
          date: articleDailyStats.date,
          views: sql<number>`sum(${articleDailyStats.views})::int`,
          likes: sql<number>`sum(${articleDailyStats.likes})::int`,
          comments: sql<number>`sum(${articleDailyStats.comments})::int`,
        })
        .from(articleDailyStats)
        .where(and(inArray(articleDailyStats.articleId, articleIds), gte(articleDailyStats.date, thirtyDaysAgoStr)))
        .groupBy(articleDailyStats.date)
        .orderBy(articleDailyStats.date);

      const now2 = new Date();
      const thisMonthStr = new Date(now2.getFullYear(), now2.getMonth(), 1).toISOString().split("T")[0];
      const lastMonthStr = new Date(now2.getFullYear(), now2.getMonth() - 1, 1).toISOString().split("T")[0];

      [thisMonthStats, lastMonthStats] = await Promise.all([
        db.select({ views: sql<number>`coalesce(sum(${articleDailyStats.views}),0)::int`, likes: sql<number>`coalesce(sum(${articleDailyStats.likes}),0)::int` })
          .from(articleDailyStats).where(and(inArray(articleDailyStats.articleId, articleIds), gte(articleDailyStats.date, thisMonthStr))),
        db.select({ views: sql<number>`coalesce(sum(${articleDailyStats.views}),0)::int`, likes: sql<number>`coalesce(sum(${articleDailyStats.likes}),0)::int` })
          .from(articleDailyStats).where(and(inArray(articleDailyStats.articleId, articleIds), gte(articleDailyStats.date, lastMonthStr), lt(articleDailyStats.date, thisMonthStr))),
      ]);
    } catch (e) { /* table may not exist yet */ }

    // Best article
    const bestThisWeek = myArticles
      .filter(a => a.status === "published")
      .sort((a, b) => (b.views || 0) - (a.views || 0))[0] || null;

    // Followers
    const [followerCountResult] = await db.select({ c: sql<number>`count(*)::int` }).from(socialFollows).where(eq(socialFollows.followingId, userId));
    const followerGrowth = await db
      .select({ date: sql<string>`date(${socialFollows.createdAt})`, count: sql<number>`count(*)::int` })
      .from(socialFollows)
      .where(and(eq(socialFollows.followingId, userId), gte(socialFollows.createdAt, thirtyDaysAgo)))
      .groupBy(sql`date(${socialFollows.createdAt})`)
      .orderBy(sql`date(${socialFollows.createdAt})`);

    // Per-article engagement
    const articleLikeCounts = await db.select({ articleId: reactions.articleId, c: sql<number>`count(*)::int` }).from(reactions)
      .where(and(inArray(reactions.articleId, articleIds), eq(reactions.type, "like"))).groupBy(reactions.articleId);
    const articleCommentCounts = await db.select({ articleId: comments.articleId, c: sql<number>`count(*)::int` }).from(comments)
      .where(inArray(comments.articleId, articleIds)).groupBy(comments.articleId);
    const articleBookmarkCounts = await db.select({ articleId: bookmarks.articleId, c: sql<number>`count(*)::int` }).from(bookmarks)
      .where(inArray(bookmarks.articleId, articleIds)).groupBy(bookmarks.articleId);

    const likesMap = Object.fromEntries(articleLikeCounts.map(r => [r.articleId, r.c]));
    const commentsMap = Object.fromEntries(articleCommentCounts.map(r => [r.articleId, r.c]));
    const bookmarksMap = Object.fromEntries(articleBookmarkCounts.map(r => [r.articleId, r.c]));

    const topArticles = myArticles
      .filter(a => a.status === "published")
      .map(a => ({
        id: a.id, title: a.title, views: a.views || 0,
        likes: likesMap[a.id] || 0, comments: commentsMap[a.id] || 0, bookmarks: bookmarksMap[a.id] || 0,
        publishedAt: a.publishedAt,
        engagement: (a.views || 0) + (likesMap[a.id] || 0) * 5 + (commentsMap[a.id] || 0) * 3,
      }))
      .sort((a, b) => b.engagement - a.engagement)
      .slice(0, 10)
      .map(({ engagement: _, ...rest }) => rest);

    // Featured comment
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    let featuredComment: { content: string; userName: string; articleTitle: string; articleId: string } | null = null;
    try {
      const rows = await db
        .select({
          content: comments.content,
          userName: sql<string>`coalesce(${users.firstName} || ' ' || ${users.lastName}, ${users.email}, 'قارئ')`,
          articleTitle: articles.title,
          articleId: comments.articleId,
        })
        .from(comments)
        .innerJoin(articles, eq(comments.articleId, articles.id))
        .innerJoin(users, eq(comments.userId, users.id))
        .where(and(inArray(comments.articleId, articleIds), eq(comments.status, "approved"), gte(comments.createdAt, sevenDaysAgo)))
        .orderBy(desc(comments.createdAt))
        .limit(1);
      if (rows[0]) featuredComment = rows[0];
    } catch (e) { /* ignore */ }

    // Publishing activity
    const publishedOnes = myArticles
      .filter(a => a.status === "published" && a.publishedAt)
      .sort((a, b) => new Date(b.publishedAt!).getTime() - new Date(a.publishedAt!).getTime());
    const lastPublished = publishedOnes[0]?.publishedAt || null;
    const now = new Date();
    const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay()); weekStart.setHours(0, 0, 0, 0);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const sortedArticles = [...myArticles].sort((a, b) => {
      const aN = a.reviewStatus === "needs_changes" ? 0 : 1;
      const bN = b.reviewStatus === "needs_changes" ? 0 : 1;
      if (aN !== bN) return aN - bN;
      return new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime();
    });

    res.json({
      success: true,
      role: isWriter ? "writer" : "reporter",
      totalArticles: myArticles.length,
      publishedArticles: publishedCount,
      draftArticles: draftCount,
      pendingArticles: pendingCount,
      needsChangesArticles: needsChangesCount,
      rejectedArticles: rejectedCount,
      totalViews,
      totalLikes: likesResult[0]?.count || 0,
      totalComments: commentsResult[0]?.count || 0,
      totalBookmarks: bookmarksResult[0]?.count || 0,
      dailyStats: dailyStatsRows.map(r => ({ date: r.date, views: r.views || 0, likes: r.likes || 0, comments: r.comments || 0 })),
      bestArticleThisWeek: bestThisWeek ? { id: bestThisWeek.id, title: bestThisWeek.title, views: bestThisWeek.views || 0 } : null,
      comparison: {
        viewsThisMonth: thisMonthStats[0]?.views || 0, viewsLastMonth: lastMonthStats[0]?.views || 0,
        likesThisMonth: thisMonthStats[0]?.likes || 0, likesLastMonth: lastMonthStats[0]?.likes || 0,
      },
      followers: { count: followerCountResult?.c || 0, dailyGrowth: followerGrowth.map(r => ({ date: r.date, count: r.count })) },
      topArticles,
      featuredComment,
      publishingActivity: {
        lastPublishedAt: lastPublished,
        daysSinceLastPublished: lastPublished ? Math.floor((Date.now() - new Date(lastPublished).getTime()) / 86400000) : null,
        thisWeekCount: publishedOnes.filter(a => new Date(a.publishedAt!) >= weekStart).length,
        thisMonthCount: publishedOnes.filter(a => new Date(a.publishedAt!) >= monthStart).length,
      },
      articles: sortedArticles.map(a => ({
        id: a.id, title: a.title, status: a.status,
        reviewStatus: a.reviewStatus, reviewNotes: a.reviewNotes,
        views: a.views, likes: likesMap[a.id] || 0, comments: commentsMap[a.id] || 0, bookmarks: bookmarksMap[a.id] || 0,
        publishedAt: a.publishedAt, createdAt: a.createdAt,
      })),
    });
  } catch (error) {
    console.error("[Mobile API] GET /contributor/analytics error:", error);
    res.status(500).json({ success: false, message: "فشل في جلب الإحصائيات" });
  }
});

// ==========================================
// GET /api/v1/contributor/schedule
// موعد كاتب الرأي الأسبوعي: البانر بحالاته، أو بيانات اختيار اليوم لمن لا يوم له
// ==========================================
router.get("/contributor/schedule", async (req: Request, res: Response) => {
  try {
    const session = await verifyMemberSession(req);
    if (!session) {
      return res.status(401).json({ success: false, message: "غير مسجل" });
    }
    const userId = session.userId;
    if (!(await userHasAnyRole(userId, ["opinion_author"]))) {
      return res.json({ success: true, banner: null, canChoose: false });
    }
    const banner = await getWriterScheduleBanner(userId);
    if (banner) {
      return res.json({ success: true, banner, canChoose: false });
    }
    const canChoose = await canSelfAssignSchedule(userId);
    res.json({
      success: true,
      banner: null,
      canChoose,
      dayLoads: canChoose ? await getWriterDayLoads() : [],
    });
  } catch (error) {
    console.error("[Mobile API] GET /contributor/schedule error:", error);
    res.status(500).json({ success: false, message: "تعذر جلب موعد النشر" });
  }
});

// ==========================================
// POST /api/v1/contributor/schedule
// الكاتب يختار يومه بنفسه — مرة واحدة فقط، والتغيير بعدها للإدارة
// ==========================================
router.post("/contributor/schedule", async (req: Request, res: Response) => {
  try {
    const session = await verifyMemberSession(req);
    if (!session) {
      return res.status(401).json({ success: false, message: "غير مسجل" });
    }
    const userId = session.userId;
    if (!(await userHasAnyRole(userId, ["opinion_author"]))) {
      return res.status(403).json({ success: false, message: "هذه الخاصية لكتّاب الرأي" });
    }
    const weekday = Number(req.body?.weekday);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      return res.status(400).json({ success: false, message: "اليوم المحدد غير صالح" });
    }
    const result = await selfAssignWriterSchedule(userId, weekday);
    if (!result.ok) {
      return res.status(result.status).json({ success: false, message: result.message });
    }
    res.json({ success: true, schedule: result.schedule });
  } catch (error) {
    console.error("[Mobile API] POST /contributor/schedule error:", error);
    res.status(500).json({ success: false, message: "تعذر حفظ اليوم المحدد" });
  }
});

// ==========================================
// Contributor Ranking
// GET /api/v1/contributor/ranking
// ==========================================
router.get("/contributor/ranking", async (req: Request, res: Response) => {
  try {
    const session = await verifyMemberSession(req);
    if (!session) return res.status(401).json({ success: false, message: "غير مسجل" });

    const monthStart = new Date();
    monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

    const allAuthors = await db
      .select({ authorId: articles.authorId, totalViews: sql<number>`coalesce(sum(${articles.views}),0)::int` })
      .from(articles)
      .where(and(eq(articles.status, "published"), gte(articles.publishedAt, monthStart)))
      .groupBy(articles.authorId)
      .orderBy(desc(sql`sum(${articles.views})`));

    const myIndex = allAuthors.findIndex(a => a.authorId === session.userId);
    const total = allAuthors.length || 1;
    const rank = myIndex >= 0 ? myIndex + 1 : null;

    res.json({
      success: true, rank, totalAuthors: total,
      percentile: rank ? Math.round(((total - rank) / total) * 100) : 0,
      myViews: myIndex >= 0 ? allAuthors[myIndex].totalViews : 0,
      isTopTen: rank !== null && rank <= 10,
    });
  } catch (error) {
    console.error("[Mobile API] GET /contributor/ranking error:", error);
    res.status(500).json({ success: false, message: "فشل في جلب الترتيب" });
  }
});

// ==========================================
// مساحة الكاتب في التطبيق — نظيرة /api/opinion-author/* بمصادقة جلسة العضو
// (verifyMemberSession) بدل Passport. تستهلك نفس opinionAuthorWorkspaceService
// فتبقى لوحة الويب والتطبيق متطابقتين. خاصة بدور opinion_author.
// ==========================================

async function requireOpinionAuthorSession(req: Request): Promise<{ userId: string } | null> {
  const session = await verifyMemberSession(req);
  if (!session) return null;
  if (!(await userHasAnyRole(session.userId, ["opinion_author"]))) return null;
  return session;
}

// حد لطلبات الذكاء الاصطناعي — تكلفتها حقيقية، بنفس سقف نسخة الويب (30/ربع ساعة)
const mobileWriterAiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: cfKeyGenerator,
  validate: cfValidate,
  message: { success: false, message: "أخذ المساعد استراحة قصيرة؛ حاول بعد دقائق" },
});

// GET /api/v1/contributor/workspace — المكتب، التتبع، نبض القراء، المتابعة، التقويم، موجز الشهر
router.get("/contributor/workspace", async (req: Request, res: Response) => {
  try {
    const session = await requireOpinionAuthorSession(req);
    if (!session) return res.status(403).json({ success: false, message: "هذه المساحة خاصة بكتّاب الرأي" });
    const workspace = await getOpinionAuthorWorkspace(session.userId);
    res.json({ success: true, ...workspace });
  } catch (error) {
    console.error("[Mobile API] GET /contributor/workspace error:", error);
    res.status(500).json({ success: false, message: "تعذر تجهيز مساحة الكاتب" });
  }
});

// GET /api/v1/contributor/ideas — ثلاث أفكار مقترحة (AI، عند الطلب فقط)
router.get("/contributor/ideas", mobileWriterAiLimiter, async (req: Request, res: Response) => {
  try {
    const session = await requireOpinionAuthorSession(req);
    if (!session) return res.status(403).json({ success: false, message: "هذه المساحة خاصة بكتّاب الرأي" });
    const result = await generateWriterIdeas(session.userId);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error("[Mobile API] GET /contributor/ideas error:", error);
    res.status(502).json({ success: false, message: "تعذر توليد الأفكار الآن" });
  }
});

// POST /api/v1/contributor/idea-coach — «تحدث مع فكرتك»
router.post("/contributor/idea-coach", mobileWriterAiLimiter, async (req: Request, res: Response) => {
  try {
    const session = await requireOpinionAuthorSession(req);
    if (!session) return res.status(403).json({ success: false, message: "هذه المساحة خاصة بكتّاب الرأي" });
    const idea = String(req.body?.idea || "").trim();
    if (idea.length < 12 || idea.length > 3000) {
      return res.status(400).json({ success: false, message: "اكتب فكرتك بتفصيل بسيط أولًا" });
    }
    const result = await coachWriterIdea(session.userId, idea);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error("[Mobile API] POST /contributor/idea-coach error:", error);
    res.status(502).json({ success: false, message: "تعذر تطوير الفكرة الآن" });
  }
});

// POST /api/v1/contributor/article-review — «قارئ سبق الأول» لمقال يملكه الكاتب
router.post("/contributor/article-review", mobileWriterAiLimiter, async (req: Request, res: Response) => {
  try {
    const session = await requireOpinionAuthorSession(req);
    if (!session) return res.status(403).json({ success: false, message: "هذه المساحة خاصة بكتّاب الرأي" });
    const articleId = String(req.body?.articleId || "").trim();
    if (!articleId) return res.status(400).json({ success: false, message: "بيانات المقال غير صالحة" });
    const result = await reviewWriterArticle(session.userId, articleId, {});
    res.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof Error && error.message === "ARTICLE_NOT_FOUND") {
      return res.status(404).json({ success: false, message: "المقال غير موجود أو لا تملكه" });
    }
    console.error("[Mobile API] POST /contributor/article-review error:", error);
    res.status(502).json({ success: false, message: "تعذرت مراجعة المقال الآن" });
  }
});

// GET /api/v1/contributor/style-profile — بصمة الكاتب الأسلوبية
router.get("/contributor/style-profile", mobileWriterAiLimiter, async (req: Request, res: Response) => {
  try {
    const session = await requireOpinionAuthorSession(req);
    if (!session) return res.status(403).json({ success: false, message: "هذه المساحة خاصة بكتّاب الرأي" });
    const result = await getWriterStyleProfile(session.userId);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error("[Mobile API] GET /contributor/style-profile error:", error);
    res.status(502).json({ success: false, message: "تعذر بناء ملف الأسلوب الآن" });
  }
});

// ==========================================
// مسابقة توقّعات كأس العالم — نسخة الموبايل (Bearer)
// ==========================================
//
// نظيرة /api/world-cup/predictions/* لكن بمصادقة جلسة العضو (verifyMemberSession)
// بدل Passport. تستهلك نفس wcPredictionsService فالنتائج/التسوية موحّدة بين
// الويب والتطبيق. القراءات العامة (leaderboard/match) متاحة بلا دخول؛ today
// تُرفق توقّع المستخدم متى كان مسجّلًا؛ POST/mine تتطلّب جلسة.

const WC_PRED_NOT_CONFIGURED = { configured: false, message: "مسابقة التوقّعات غير مفعّلة حاليًا" };

function wcPredGuard(res: Response): boolean {
  if (!isWorldCupConfigured()) {
    res.status(503).json(WC_PRED_NOT_CONFIGURED);
    return false;
  }
  return true;
}

// توقّعات البطولة طويلة المدى (البطل/الهدّاف) — خلف نفس علم الويب المستقل
// WC_LONG_PREDICTIONS_ENABLED (إطلاق ويب-أولًا متدرّج، انظر wcPredictions.ts).
function wcLongGuard(res: Response): boolean {
  if (!wcPredGuard(res)) return false;
  if (process.env.WC_LONG_PREDICTIONS_ENABLED !== "true") {
    res.status(503).json({ enabled: false, message: "توقّعات البطولة قيد الإطلاق" });
    return false;
  }
  return true;
}

router.get("/world-cup/predictions/today", async (req: Request, res: Response) => {
  if (!wcPredGuard(res)) return;
  try {
    const session = await verifyMemberSession(req);
    const matches = await getUpcomingPredictableMatches(session?.userId);
    res.set("Cache-Control", "private, no-store");
    res.json({ matches });
  } catch (error) {
    console.error("[Mobile WC Predictions] today error:", error);
    res.status(502).json({ message: "تعذر جلب مباريات اليوم حاليًا" });
  }
});

router.post("/world-cup/predictions", async (req: Request, res: Response) => {
  if (!wcPredGuard(res)) return;
  const session = await verifyMemberSession(req);
  if (!session) return res.status(401).json({ message: "يلزم تسجيل الدخول" });
  res.set("Cache-Control", "private, no-store");
  try {
    const fixtureId = Number(req.body?.fixtureId);
    const predHome = Number(req.body?.predHome);
    const predAway = Number(req.body?.predAway);
    if (!Number.isFinite(fixtureId)) {
      return res.status(400).json({ message: "معرّف مباراة غير صالح" });
    }
    const result = await submitPrediction(session.userId, fixtureId, predHome, predAway);
    if (!result.ok) {
      const map = {
        NOT_FOUND: { code: 404, message: "المباراة غير موجودة" },
        LOCKED: { code: 409, message: "أُغلق التوقّع — انطلقت المباراة" },
        INVALID: { code: 400, message: "نتيجة غير صالحة" },
        DRAW_NOT_ALLOWED: { code: 400, message: "لا يمكن توقع التعادل في خروج المغلوب — اختر فائزًا للمباراة" },
      } as const;
      const m = map[result.reason];
      return res.status(m.code).json({ message: m.message });
    }
    res.json({ prediction: result.prediction });
  } catch (error) {
    console.error("[Mobile WC Predictions] submit error:", error);
    res.status(500).json({ message: "تعذر حفظ التوقّع" });
  }
});

router.get("/world-cup/predictions/mine", async (req: Request, res: Response) => {
  if (!wcPredGuard(res)) return;
  const session = await verifyMemberSession(req);
  if (!session) return res.status(401).json({ message: "يلزم تسجيل الدخول" });
  res.set("Cache-Control", "private, no-store");
  try {
    res.json({ predictions: await getMyPredictions(session.userId) });
  } catch (error) {
    console.error("[Mobile WC Predictions] mine error:", error);
    res.status(502).json({ message: "تعذر جلب توقّعاتك حاليًا" });
  }
});

router.get("/world-cup/predictions/leaderboard", async (req: Request, res: Response) => {
  if (!wcPredGuard(res)) return;
  try {
    // مسؤولو النظام مخفيّون عن بقية الزوار (انظر wcPredictionsService.getLeaderboard) —
    // نحدّد صاحب الجلسة (إن وُجدت) ليبقى ظاهرًا لنفسه فقط، ولا نُخزّن الرد في
    // الكاش العام حين يكون مخصّصًا لمستخدم مسجَّل.
    const session = await verifyMemberSession(req);
    res.set(
      "Cache-Control",
      session ? "private, no-store" : "public, max-age=30, s-maxage=60, stale-while-revalidate=120",
    );
    // نفس عقد نقطة الويب: ?limit= (افتراضي 100، مقصوص 10..500) + العدد الكلي
    // + صف الزائر ورتبته الحقيقية حتى لو كان خارج الصفحة المعروضة.
    const limitRaw = Number(req.query?.limit);
    const limit =
      Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.max(Math.trunc(limitRaw), 10), 500) : 100;
    const [leaders, meta] = await Promise.all([
      getLeaderboard(limit, session?.userId),
      getWcLeaderboardMeta(session?.userId),
    ]);
    res.json({ leaders, total: meta.total, viewer: meta.viewer });
  } catch (error) {
    console.error("[Mobile WC Predictions] leaderboard error:", error);
    res.status(502).json({ message: "تعذر جلب المتصدّرين حاليًا" });
  }
});

router.get("/world-cup/predictions/match/:fixtureId", async (req: Request, res: Response) => {
  if (!wcPredGuard(res)) return;
  const fixtureId = Number(req.params.fixtureId);
  if (!Number.isFinite(fixtureId)) {
    return res.status(400).json({ message: "معرّف مباراة غير صالح" });
  }
  try {
    res.set("Cache-Control", "public, max-age=10, s-maxage=15, stale-while-revalidate=30");
    res.json(await getMatchPredictionsSummary(fixtureId));
  } catch (error) {
    console.error("[Mobile WC Predictions] match summary error:", error);
    res.status(502).json({ message: "تعذر جلب ملخص المباراة حاليًا" });
  }
});

// ── توقّعات البطولة طويلة المدى (البطل + الهدّاف) ─────────────────────────
// نظيرة /api/world-cup/predictions/long على الويب — نفس wcLongPredictionsService.

router.get("/world-cup/predictions/long", async (req: Request, res: Response) => {
  if (!wcLongGuard(res)) return;
  try {
    const session = await verifyMemberSession(req);
    res.set(
      "Cache-Control",
      session ? "private, no-store" : "public, max-age=30, s-maxage=60, stale-while-revalidate=120",
    );
    res.json(await getWcLongPredictions(session?.userId));
  } catch (error) {
    console.error("[Mobile WC Predictions] long error:", error);
    res.status(502).json({ message: "تعذر جلب توقّعات البطولة حاليًا" });
  }
});

router.post("/world-cup/predictions/long", async (req: Request, res: Response) => {
  if (!wcLongGuard(res)) return;
  const session = await verifyMemberSession(req);
  if (!session) return res.status(401).json({ message: "يلزم تسجيل الدخول" });
  res.set("Cache-Control", "private, no-store");
  try {
    const kind = String(req.body?.kind) as WcLongKind;
    const teamId = req.body?.teamId != null ? Number(req.body.teamId) : undefined;
    const playerId = req.body?.playerId != null ? Number(req.body.playerId) : undefined;
    const result = await submitWcLongPrediction(session.userId, kind, { teamId, playerId });
    if (!result.ok) {
      const map = {
        LOCKED: { code: 409, message: "أُغلق هذا التوقّع — تجاوزنا موعده في البطولة" },
        INVALID: { code: 400, message: "اختيار غير صالح" },
      } as const;
      const m = map[result.reason];
      return res.status(m.code).json({ message: m.message });
    }
    res.json({ ok: true });
  } catch (error) {
    console.error("[Mobile WC Predictions] long submit error:", error);
    res.status(500).json({ message: "تعذر حفظ التوقّع" });
  }
});

// ==========================================
// بوابة ميزات خليجي الاجتماعية — نفس علم GC_PREDICTIONS_ENABLED (من gcFeatureFlags)
const GC_PRED_NOT_CONFIGURED = {
  configured: false,
  message: "ميزات خليجي 27 غير مفعّلة حاليًا",
};

function gcPredGuard(res: Response): boolean {
  if (!isGcPredictionsEnabled()) {
    res.status(503).json(GC_PRED_NOT_CONFIGURED);
    return false;
  }
  return true;
}

// خليجي 27 — مرايا الموبايل: المجالس · الفانتازي · رجل المباراة (Bearer)
// ==========================================
// نظيرة مسارات الويب نفسها لكن بـ verifyMemberSession — الخدمات مشتركة.

const GC_MAJLIS_REASONS: Record<string, { code: number; message: string }> = {
  INVALID_NAME: { code: 400, message: "اسم المجلس بين حرفين و60 حرفًا" },
  INVALID_CODE: { code: 400, message: "رمز الدعوة غير صالح" },
  NOT_FOUND: { code: 404, message: "المجلس غير موجود — تأكد من الرمز" },
  NOT_MEMBER: { code: 403, message: "هذا المجلس لأعضائه فقط" },
  FULL: { code: 409, message: "اكتمل المجلس (50 عضوًا)" },
  LIMIT_OWNED: { code: 409, message: "بلغت حدّ 5 مجالس" },
  CODE_COLLISION: { code: 500, message: "تعذّر توليد رمز — حاول مجددًا" },
  ACTIVE_DUELS: { code: 409, message: "أنه تحديات المجلس النشطة قبل المغادرة أو الحذف" },
  INVALID_DATE: { code: 400, message: "صيغة التاريخ المطلوبة YYYY-MM-DD" },
  INVALID_STAKE: { code: 400, message: "الرهان من 10 إلى 100 نقطة وبمضاعفات 10" },
  SELF_CHALLENGE: { code: 400, message: "اختر عضوًا آخر للتحدي" },
  FIXTURE_NOT_FOUND: { code: 404, message: "المباراة غير موجودة" },
  TARGET_NOT_MEMBER: { code: 400, message: "العضو المختار ليس في هذا المجلس" },
  LOCKED: { code: 409, message: "أُغلق التحدي لانطلاق المباراة" },
  DAILY_CAP: { code: 409, message: "بلغت سقف الرهان اليومي (200 نقطة)" },
  INSUFFICIENT_POINTS: { code: 402, message: "رصيد نقاط الولاء غير كافٍ" },
  DUPLICATE: { code: 409, message: "يوجد تحدٍ بينكما لهذه المباراة" },
  NOT_ALLOWED: { code: 403, message: "لا تملك صلاحية تنفيذ هذا الإجراء" },
  INVALID_STATE: { code: 409, message: "حالة التحدي لا تسمح بهذا الإجراء" },
  EXPIRED: { code: 409, message: "انتهت مهلة التحدي وأُعيد الرهان" },
};

const mobileGcMajlisInviteLookupLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: cfKeyGenerator,
  validate: cfValidate,
  message: { message: "طلبات كثيرة لرموز الدعوة. حاول بعد دقيقة." },
});

const mobileGcMajlisJoinLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: cfKeyGenerator,
  validate: cfValidate,
  message: { message: "طلبات انضمام كثيرة. حاول بعد دقيقة." },
});

router.get("/gulf-cup/majlis/invite/:code", mobileGcMajlisInviteLookupLimiter, async (req: Request, res: Response) => {
  if (!gcPredGuard(res)) return;
  try {
    const result = await gcGetMajlisInvitePreview(String(req.params.code ?? ""));
    if (!result.ok) {
      const m = GC_MAJLIS_REASONS[result.reason] ?? { code: 500, message: "تعذّر جلب الدعوة" };
      return res.status(m.code).json({ message: m.message, reason: result.reason });
    }
    res.set("Cache-Control", "public, max-age=30, s-maxage=60, stale-while-revalidate=120");
    res.json(result.data);
  } catch (error) {
    console.error("[Mobile GC Majlis] invite preview error:", error);
    res.status(502).json({ message: "تعذّر جلب بطاقة الدعوة حاليًا" });
  }
});

router.post("/gulf-cup/majlis", async (req: Request, res: Response) => {
  if (!gcPredGuard(res)) return;
  const session = await verifyMemberSession(req);
  if (!session) return res.status(401).json({ message: "يلزم تسجيل الدخول" });
  res.set("Cache-Control", "private, no-store");
  try {
    const result = await gcCreateMajlis(session.userId, String(req.body?.name ?? ""));
    if (!result.ok) {
      const m = GC_MAJLIS_REASONS[result.reason] ?? { code: 500, message: "تعذّر إنشاء المجلس" };
      return res.status(m.code).json({ message: m.message });
    }
    res.status(201).json(result.data);
  } catch (error) {
    console.error("[Mobile GC Majlis] create error:", error);
    res.status(502).json({ message: "تعذّر إنشاء المجلس حاليًا" });
  }
});

router.post("/gulf-cup/majlis/join", mobileGcMajlisJoinLimiter, async (req: Request, res: Response) => {
  if (!gcPredGuard(res)) return;
  const session = await verifyMemberSession(req);
  if (!session) return res.status(401).json({ message: "يلزم تسجيل الدخول" });
  res.set("Cache-Control", "private, no-store");
  try {
    const result = await gcJoinMajlis(session.userId, String(req.body?.code ?? ""));
    if (!result.ok) {
      const m = GC_MAJLIS_REASONS[result.reason] ?? { code: 500, message: "تعذّر الانضمام" };
      return res.status(m.code).json({ message: m.message });
    }
    res.json(result.data);
  } catch (error) {
    console.error("[Mobile GC Majlis] join error:", error);
    res.status(502).json({ message: "تعذّر الانضمام حاليًا" });
  }
});

router.get("/gulf-cup/majlis/mine", async (req: Request, res: Response) => {
  if (!gcPredGuard(res)) return;
  const session = await verifyMemberSession(req);
  if (!session) return res.status(401).json({ message: "يلزم تسجيل الدخول" });
  res.set("Cache-Control", "private, no-store");
  try {
    res.json({ majalis: await gcGetMyMajalis(session.userId) });
  } catch (error) {
    console.error("[Mobile GC Majlis] mine error:", error);
    res.status(502).json({ message: "تعذّر جلب مجالسك حاليًا" });
  }
});

router.get("/gulf-cup/majlis/:id/leaderboard", async (req: Request, res: Response) => {
  if (!gcPredGuard(res)) return;
  const session = await verifyMemberSession(req);
  if (!session) return res.status(401).json({ message: "يلزم تسجيل الدخول" });
  res.set("Cache-Control", "private, no-store");
  try {
    const result = await gcGetMajlisLeaderboard(session.userId, String(req.params.id));
    if (!result.ok) {
      const m = GC_MAJLIS_REASONS[result.reason] ?? { code: 500, message: "تعذّر جلب الترتيب" };
      return res.status(m.code).json({ message: m.message });
    }
    res.json(result.data);
  } catch (error) {
    console.error("[Mobile GC Majlis] leaderboard error:", error);
    res.status(502).json({ message: "تعذّر جلب ترتيب المجلس حاليًا" });
  }
});

router.delete("/gulf-cup/majlis/:id", async (req: Request, res: Response) => {
  if (!gcPredGuard(res)) return;
  const session = await verifyMemberSession(req);
  if (!session) return res.status(401).json({ message: "يلزم تسجيل الدخول" });
  res.set("Cache-Control", "private, no-store");
  try {
    const result = await gcLeaveMajlis(session.userId, String(req.params.id));
    if (!result.ok) {
      const m = GC_MAJLIS_REASONS[result.reason] ?? { code: 500, message: "تعذّر تنفيذ الطلب" };
      return res.status(m.code).json({ message: m.message });
    }
    res.json(result.data);
  } catch (error) {
    console.error("[Mobile GC Majlis] leave error:", error);
    res.status(502).json({ message: "تعذّر تنفيذ الطلب حاليًا" });
  }
});

router.get("/gulf-cup/majlis/:id/matchday", async (req: Request, res: Response) => {
  if (!gcPredGuard(res)) return;
  const session = await verifyMemberSession(req);
  if (!session) return res.status(401).json({ message: "يلزم تسجيل الدخول" });
  res.set("Cache-Control", "private, no-store");
  try {
    const date = typeof req.query?.date === "string" ? req.query.date : undefined;
    const result = await gcGetMajlisMatchday(session.userId, String(req.params.id), date);
    if (!result.ok) {
      const m = GC_MAJLIS_REASONS[result.reason] ?? { code: 500, message: "تعذّر جلب يوم المجلس" };
      return res.status(m.code).json({ message: m.message, reason: result.reason });
    }
    res.json(result.data);
  } catch (error) {
    console.error("[Mobile GC Majlis] matchday error:", error);
    res.status(502).json({ message: "تعذّر جلب يوم المجلس حاليًا" });
  }
});

router.get("/gulf-cup/majlis/:id/fantasy", async (req: Request, res: Response) => {
  if (!gcPredGuard(res)) return;
  const session = await verifyMemberSession(req);
  if (!session) return res.status(401).json({ message: "يلزم تسجيل الدخول" });
  res.set("Cache-Control", "private, no-store");
  try {
    const result = await gcGetMajlisFantasy(session.userId, String(req.params.id));
    if (!result.ok) {
      const m = GC_MAJLIS_REASONS[result.reason] ?? { code: 500, message: "تعذّر جلب الفانتازي" };
      return res.status(m.code).json({ message: m.message, reason: result.reason });
    }
    res.json(result.data);
  } catch (error) {
    console.error("[Mobile GC Majlis] fantasy error:", error);
    res.status(502).json({ message: "تعذّر جلب فانتازي المجلس حاليًا" });
  }
});

router.get("/gulf-cup/majlis/:id/champion-picks", async (req: Request, res: Response) => {
  if (!gcPredGuard(res)) return;
  const session = await verifyMemberSession(req);
  if (!session) return res.status(401).json({ message: "يلزم تسجيل الدخول" });
  res.set("Cache-Control", "private, no-store");
  try {
    const result = await gcGetMajlisChampionPicks(session.userId, String(req.params.id));
    if (!result.ok) {
      const m = GC_MAJLIS_REASONS[result.reason] ?? { code: 500, message: "تعذّر جلب توقعات البطل" };
      return res.status(m.code).json({ message: m.message, reason: result.reason });
    }
    res.json(result.data);
  } catch (error) {
    console.error("[Mobile GC Majlis] champion picks error:", error);
    res.status(502).json({ message: "تعذّر جلب توقعات البطل حاليًا" });
  }
});

router.get("/gulf-cup/majlis/:id/harvest", async (req: Request, res: Response) => {
  if (!gcPredGuard(res)) return;
  const session = await verifyMemberSession(req);
  if (!session) return res.status(401).json({ message: "يلزم تسجيل الدخول" });
  res.set("Cache-Control", "private, no-store");
  try {
    const result = await gcGetMajlisHarvest(session.userId, String(req.params.id));
    if (!result.ok) {
      const m = GC_MAJLIS_REASONS[result.reason] ?? { code: 500, message: "تعذّر جلب الحصاد" };
      return res.status(m.code).json({ message: m.message, reason: result.reason });
    }
    res.json(result.data);
  } catch (error) {
    console.error("[Mobile GC Majlis] harvest error:", error);
    res.status(502).json({ message: "تعذّر جلب حصاد المجلس حاليًا" });
  }
});

router.get("/gulf-cup/majlis/:id/duels", async (req: Request, res: Response) => {
  if (!gcPredGuard(res)) return;
  const session = await verifyMemberSession(req);
  if (!session) return res.status(401).json({ message: "يلزم تسجيل الدخول" });
  res.set("Cache-Control", "private, no-store");
  try {
    const result = await gcListMajlisDuels(session.userId, String(req.params.id));
    if (!result.ok) {
      const m = GC_MAJLIS_REASONS[result.reason] ?? { code: 500, message: "تعذّر جلب التحديات" };
      return res.status(m.code).json({ message: m.message, reason: result.reason });
    }
    res.json(result.data);
  } catch (error) {
    console.error("[Mobile GC Majlis] duels list error:", error);
    res.status(502).json({ message: "تعذّر جلب تحديات المجلس حاليًا" });
  }
});

router.post("/gulf-cup/majlis/:id/duels", async (req: Request, res: Response) => {
  if (!gcPredGuard(res)) return;
  const session = await verifyMemberSession(req);
  if (!session) return res.status(401).json({ message: "يلزم تسجيل الدخول" });
  res.set("Cache-Control", "private, no-store");
  try {
    const result = await gcCreateMajlisDuel({
      challengerId: session.userId,
      majlisId: String(req.params.id),
      fixtureId: Number(req.body?.fixtureId),
      challengedUserId: String(req.body?.challengedUserId ?? ""),
      stake: Number(req.body?.stake),
    });
    if (!result.ok) {
      const m = GC_MAJLIS_REASONS[result.reason] ?? { code: 500, message: "تعذّر إنشاء التحدي" };
      return res.status(m.code).json({ message: m.message, reason: result.reason });
    }
    res.status(201).json({ duel: result.data });
  } catch (error) {
    console.error("[Mobile GC Majlis] duel create error:", error);
    res.status(502).json({ message: "تعذّر إنشاء التحدي حاليًا" });
  }
});

for (const action of ["accept", "decline", "cancel"] as const) {
  router.post(`/gulf-cup/majlis/duels/:duelId/${action}`, async (req: Request, res: Response) => {
    if (!gcPredGuard(res)) return;
    const session = await verifyMemberSession(req);
    if (!session) return res.status(401).json({ message: "يلزم تسجيل الدخول" });
    res.set("Cache-Control", "private, no-store");
    try {
      const result = await gcActOnMajlisDuel(session.userId, String(req.params.duelId), action);
      if (!result.ok) {
        const m = GC_MAJLIS_REASONS[result.reason] ?? { code: 500, message: "تعذّر تحديث التحدي" };
        return res.status(m.code).json({ message: m.message, reason: result.reason });
      }
      res.json({ duel: result.data });
    } catch (error) {
      console.error(`[Mobile GC Majlis] duel ${action} error:`, error);
      res.status(502).json({ message: "تعذّر تحديث التحدي حاليًا" });
    }
  });
}

router.get("/gulf-cup/majlis/notification-preference", async (req: Request, res: Response) => {
  if (!gcPredGuard(res)) return;
  const session = await verifyMemberSession(req);
  if (!session) return res.status(401).json({ message: "يلزم تسجيل الدخول" });
  res.set("Cache-Control", "private, no-store");
  try {
    res.json(await gcGetMajlisNotificationPreference(session.userId));
  } catch (error) {
    console.error("[Mobile GC Majlis] notification preference error:", error);
    res.status(502).json({ message: "تعذّر جلب إعداد الإشعارات" });
  }
});

router.put("/gulf-cup/majlis/notification-preference", async (req: Request, res: Response) => {
  if (!gcPredGuard(res)) return;
  const session = await verifyMemberSession(req);
  if (!session) return res.status(401).json({ message: "يلزم تسجيل الدخول" });
  res.set("Cache-Control", "private, no-store");
  if (typeof req.body?.enabled !== "boolean") return res.status(400).json({ message: "enabled يجب أن تكون boolean" });
  try {
    res.json(await gcSetMajlisNotificationPreference(session.userId, req.body.enabled));
  } catch (error) {
    console.error("[Mobile GC Majlis] notification preference update error:", error);
    res.status(502).json({ message: "تعذّر حفظ إعداد الإشعارات" });
  }
});

const GC_FANTASY_REASONS: Record<string, string> = {
  SIZE: `اختر ${GC_FANTASY_SQUAD_SIZE} لاعبين بالضبط`,
  DUPLICATE: "لا تكرّر اللاعب نفسه",
  CAPTAIN: "اختر قائدًا من ضمن تشكيلتك",
  POOL_EMPTY: "قائمة اللاعبين غير متاحة بعد",
  UNKNOWN_PLAYER: "أحد اللاعبين خارج قائمة البطولة",
  OVER_BUDGET: `تجاوزت الميزانية (${GC_FANTASY_BUDGET} نقطة)`,
};

router.get("/gulf-cup/fantasy/pool", async (_req: Request, res: Response) => {
  if (!gcPredGuard(res)) return;
  try {
    res.set("Cache-Control", "public, max-age=300, s-maxage=600, stale-while-revalidate=1200");
    res.json({
      budget: GC_FANTASY_BUDGET,
      squadSize: GC_FANTASY_SQUAD_SIZE,
      players: await gcGetFantasyPool(),
    });
  } catch (error) {
    console.error("[Mobile GC Fantasy] pool error:", error);
    res.status(502).json({ message: "تعذّر جلب قائمة اللاعبين حاليًا" });
  }
});

router.get("/gulf-cup/fantasy/mine", async (req: Request, res: Response) => {
  if (!gcPredGuard(res)) return;
  const session = await verifyMemberSession(req);
  if (!session) return res.status(401).json({ message: "يلزم تسجيل الدخول" });
  res.set("Cache-Control", "private, no-store");
  try {
    res.json({ squad: await gcGetMyFantasy(session.userId) });
  } catch (error) {
    console.error("[Mobile GC Fantasy] mine error:", error);
    res.status(502).json({ message: "تعذّر جلب تشكيلتك حاليًا" });
  }
});

router.post("/gulf-cup/fantasy", async (req: Request, res: Response) => {
  if (!gcPredGuard(res)) return;
  const session = await verifyMemberSession(req);
  if (!session) return res.status(401).json({ message: "يلزم تسجيل الدخول" });
  res.set("Cache-Control", "private, no-store");
  try {
    const result = await gcSaveFantasySquad(session.userId, req.body?.playerIds, req.body?.captainId);
    if (!result.ok) {
      return res
        .status(400)
        .json({ message: GC_FANTASY_REASONS[result.reason] ?? "تعذّر حفظ التشكيلة" });
    }
    res.json({ saved: true, spent: result.data.spent });
  } catch (error) {
    console.error("[Mobile GC Fantasy] save error:", error);
    res.status(502).json({ message: "تعذّر حفظ التشكيلة حاليًا" });
  }
});

router.get("/gulf-cup/fantasy/leaderboard", async (_req: Request, res: Response) => {
  if (!gcPredGuard(res)) return;
  try {
    res.set("Cache-Control", "public, max-age=300, s-maxage=600, stale-while-revalidate=1200");
    res.json({ leaders: await gcGetFantasyLeaderboard() });
  } catch (error) {
    console.error("[Mobile GC Fantasy] leaderboard error:", error);
    res.status(502).json({ message: "تعذّر جلب ترتيب الفانتازي حاليًا" });
  }
});

const GC_MOTM_REASONS: Record<string, { code: number; message: string }> = {
  INVALID_PLAYER: { code: 400, message: "اختر لاعبًا صالحًا" },
  NOT_FOUND: { code: 404, message: "المباراة غير موجودة" },
  TOO_EARLY: { code: 409, message: "التصويت يُفتح من الشوط الثاني" },
  NOT_STARTED: { code: 409, message: "التصويت يُفتح بعد انطلاق المباراة" },
  CLOSED: { code: 409, message: "أُغلق التصويت لهذه المباراة" },
};

router.get("/gulf-cup/motm/:fixtureId", async (req: Request, res: Response) => {
  if (!gcPredGuard(res)) return;
  const fixtureId = Number(req.params.fixtureId);
  if (!Number.isFinite(fixtureId) || fixtureId <= 0) {
    return res.status(400).json({ message: "معرّف مباراة غير صالح" });
  }
  try {
    const session = await verifyMemberSession(req);
    if (session) res.set("Cache-Control", "private, no-store");
    else res.set("Cache-Control", "public, max-age=15, s-maxage=30, stale-while-revalidate=60");
    res.json(await gcGetMotmBoard(fixtureId, session?.userId));
  } catch (error) {
    console.error("[Mobile GC MOTM] board error:", error);
    res.status(502).json({ message: "تعذّر جلب التصويت حاليًا" });
  }
});

router.post("/gulf-cup/motm/:fixtureId", async (req: Request, res: Response) => {
  if (!gcPredGuard(res)) return;
  const session = await verifyMemberSession(req);
  if (!session) return res.status(401).json({ message: "يلزم تسجيل الدخول" });
  const fixtureId = Number(req.params.fixtureId);
  if (!Number.isFinite(fixtureId) || fixtureId <= 0) {
    return res.status(400).json({ message: "معرّف مباراة غير صالح" });
  }
  res.set("Cache-Control", "private, no-store");
  try {
    const result = await gcVoteMotm(
      session.userId,
      fixtureId,
      String(req.body?.playerId ?? ""),
      String(req.body?.playerName ?? ""),
    );
    if (!result.ok) {
      const m = GC_MOTM_REASONS[result.reason] ?? { code: 500, message: "تعذّر حفظ الصوت" };
      return res.status(m.code).json({ message: m.message });
    }
    res.json({ saved: true });
  } catch (error) {
    console.error("[Mobile GC MOTM] vote error:", error);
    res.status(502).json({ message: "تعذّر حفظ الصوت حاليًا" });
  }
});

// ==========================================
// سجلّ البطولات الموحّد (Sabq Sports 2.0)
// GET /api/v1/sports/tournaments — البطولات المرئية للتطبيق (visibleApp)
// GET /api/v1/sports/hub         — payload مجمّع بطلب واحد: بطولات + مباريات
//                                  قادمة/نتائج + متصدّر/هدّاف + «مباشر الآن»
// نفس مصدر حقيقة الويب (sports_tournaments) — تغيير الداشبورد يسري خلال
// دقيقة بدون تحديث من الستور. لا تمسّ endpoints القائمة أعلاه إطلاقًا.
// ==========================================
router.get("/sports/tournaments", async (_req: Request, res: Response) => {
  try {
    const { listVisibleTournaments } = await import("../services/sportsTournamentsService");
    const tournaments = await listVisibleTournaments("app");
    res.set("Cache-Control", "public, max-age=30, s-maxage=60, stale-while-revalidate=120");
    res.json({ tournaments });
  } catch (error) {
    console.error("[Mobile Sports] tournaments error:", error);
    res.json({ tournaments: [] });
  }
});

router.get("/sports/hub", async (_req: Request, res: Response) => {
  try {
    const { getSportsHub } = await import("../services/sportsHubService");
    const hub = await getSportsHub("app");
    res.set("Cache-Control", "public, max-age=30, s-maxage=60, stale-while-revalidate=120");
    res.json(hub);
  } catch (error) {
    console.error("[Mobile Sports] hub error:", error);
    res.status(502).json({ message: "تعذر جلب هب الرياضة حاليًا" });
  }
});

export default router;
