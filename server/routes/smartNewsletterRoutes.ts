/**
 * Smart Newsletter Routes with MailerLite Integration
 * مسارات النشرة الإخبارية الذكية مع تكامل MailerLite
 */

import { Express, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { db } from '../db';
import { eq, and, desc, sql } from 'drizzle-orm';
import { withStatementTimeout } from '../db';
import { 
  newsletterSubscriptions,
  userDynamicInterests,
  userAffinities,
  categories,
} from '@shared/schema';
import {
  getMailerLiteSubscriber,
  unsubscribeFromMailerLite,
  syncUserInterestsToMailerLite,
  isMailerLiteConfigured,
  getMailerLiteGroups,
} from '../services/mailerlite';
import {
  confirmNewsletterSubscription,
  createPendingNewsletterSubscription,
  retryNewsletterMailerLiteSync,
  syncConfirmedSubscription,
  hasConfirmedNewsletterMarker,
  newsletterSubscribeInputSchema,
} from '../services/newsletterSubscriptionService';
import { addEmailSuppression } from '../services/emailSuppressionService';
import { isAuthenticated } from '../auth';
import { requireRole } from '../rbac';
import { createMailerLiteWebhookHandler } from './mailerliteWebhookHandler';
import { cfKeyGenerator, cfValidate } from '../utils/rateLimiting';

/**
 * Resolve which subscription the caller is allowed to act on.
 *
 * SECURITY: these endpoints used to take a bare `email` from the request and
 * act on whoever owned it — so anyone could unsubscribe any reader, rewrite
 * their language/interests, or probe whether a given address is subscribed
 * (subscriber enumeration). An email address is an identifier, not a
 * credential.
 *
 * Two legitimate ways to prove you own a subscription:
 *  - the `token` carried by every unsubscribe/preferences link we mail out,
 *    which is the subscription row's own unguessable uuid
 *    (server/services/newsletterDeliveryQueue.ts sets `unsubscribeToken:
 *    subscriber.id`), or
 *  - being signed in as the owner of that address.
 *
 * Returns the subscription row, or a ready-to-send denial. The status route
 * may additionally receive an empty result after a verified owner is proved;
 * mutations never use that mode. The denial is deliberately uniform so it
 * cannot be used to test whether an address exists.
 */
type SubscriberResolution =
  | { ok: true; subscription: typeof newsletterSubscriptions.$inferSelect }
  | { ok: false; httpStatus: number; message: string };

type SubscriberResolutionWithEmptyOwner =
  | SubscriberResolution
  | { ok: true; subscription: null };

function resolveSubscriber(
  req: any,
  emailFromRequest?: string,
): Promise<SubscriberResolution>;
function resolveSubscriber(
  req: any,
  emailFromRequest: string | undefined,
  options: { allowMissingVerifiedOwner: true },
): Promise<SubscriberResolutionWithEmptyOwner>;
async function resolveSubscriber(
  req: any,
  emailFromRequest?: string,
  options?: { allowMissingVerifiedOwner?: boolean },
): Promise<SubscriberResolutionWithEmptyOwner> {
  const denied = {
    ok: false as const,
    httpStatus: 403,
    message: 'رابط غير صالح. استخدم رابط إلغاء الاشتراك من رسالة النشرة، أو سجّل الدخول.',
  };

  const bodyToken = typeof req.body?.token === 'string' ? req.body.token : null;
  const queryToken = typeof req.query?.token === 'string' ? req.query.token : null;
  const token = bodyToken ?? queryToken;

  if (token !== null) {
    const [row] = await db
      .select()
      .from(newsletterSubscriptions)
      .where(eq(newsletterSubscriptions.id, token))
      .limit(1);
    return row ? { ok: true, subscription: row } : denied;
  }

  const sessionEmail = typeof req.user?.email === 'string' ? req.user.email.trim().toLowerCase() : null;
  if (sessionEmail && req.user?.emailVerified === true) {
    // A signed-in reader may only act on their own address, whether or not
    // they also passed one in the body.
    if (emailFromRequest && emailFromRequest.trim().toLowerCase() !== sessionEmail) {
      return denied;
    }
    const [row] = await db
      .select()
      .from(newsletterSubscriptions)
      .where(sql`lower(${newsletterSubscriptions.email}) = ${sessionEmail}`)
      .limit(1);
    if (row) return { ok: true, subscription: row };
    return options?.allowMissingVerifiedOwner ? { ok: true, subscription: null } : denied;
  }

  return denied;
}

function setNoStore(res: Response): void {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
}

// Rate limiter for newsletter trigger (max 2 per minute)
const newsletterTriggerLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { success: false, message: 'تم تجاوز حد تشغيل النشرة. يرجى الانتظار دقيقة' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: cfKeyGenerator,
  validate: cfValidate,
});

const newsletterSubscribeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: true, pendingConfirmation: true, message: 'إذا كان العنوان مؤهلًا، ستصلك رسالة لتأكيد الاشتراك.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: cfKeyGenerator,
  validate: cfValidate,
});

const newsletterConfirmationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'محاولات تأكيد كثيرة، حاول لاحقًا.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: cfKeyGenerator,
  validate: cfValidate,
});

// Subscription request schema
const subscribeSchema = newsletterSubscribeInputSchema;

// Update subscription schema
const updateSubscriptionSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  language: z.enum(['ar', 'en', 'ur']).optional(),
  interests: z.array(z.string()).optional(),
  frequency: z.enum(['daily', 'weekly']).optional(),
});

export function registerSmartNewsletterRoutes(app: Express) {
  // =================================================================
  // SMART NEWSLETTER - MailerLite Integration Routes
  // =================================================================

  /**
   * POST /api/smart-newsletter/subscribe
   * Subscribe to smart newsletter with MailerLite sync
   */
  app.post('/api/smart-newsletter/subscribe', newsletterSubscribeLimiter, async (req: any, res) => {
    setNoStore(res);
    try {
      const data = subscribeSchema.parse(req.body);
      const ipAddress = req.headers['x-forwarded-for'] || req.connection?.remoteAddress;
      await createPendingNewsletterSubscription({
        email: data.email,
        frequency: data.frequency,
        source: data.source,
        language: data.language,
        consent: data.consent,
        interests: data.interests,
        userId: req.user?.id || null,
        ipAddress: typeof ipAddress === 'string' ? ipAddress : ipAddress?.[0] || null,
        userAgent: req.headers['user-agent'] || null,
      });

      // Keep this response uniform so the endpoint does not reveal subscriber
      // existence, terminal suppression, or current provider state.
      res.status(202).json({
        success: true,
        pendingConfirmation: true,
        message: 'إذا كان العنوان مؤهلًا، ستصلك رسالة لتأكيد الاشتراك.',
      });
    } catch (error: any) {
      console.error('Error in smart newsletter subscribe');
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          success: false,
          message: 'بيانات غير صحيحة',
          errors: error.errors 
        });
      }
      if (error.message?.includes('unique')) {
        return res.status(400).json({ 
          success: false,
          message: 'هذا البريد مشترك بالفعل' 
        });
      }
      res.status(500).json({ 
        success: false,
        message: 'حدث خطأ في الاشتراك، يرجى المحاولة لاحقاً' 
      });
    }
  });

  /**
   * POST /api/smart-newsletter/confirm
   * Activate a pending subscription only after the emailed token is proven.
   */
  app.post('/api/smart-newsletter/confirm', newsletterConfirmationLimiter, async (req: any, res) => {
    setNoStore(res);
    try {
      const token = z.string().regex(/^[a-f0-9]{64}$/i).parse(req.body?.token);
      const result = await confirmNewsletterSubscription(token);
      res.status(result.mailerlite?.success ? 200 : 202).json({
        success: true,
        confirmed: true,
        mailerliteSynced: result.mailerlite?.success ?? false,
      });
    } catch (error: any) {
      const code = error?.message;
      if (code === 'NEWSLETTER_CONFIRMATION_EXPIRED') {
        return res.status(410).json({ success: false, message: 'انتهت صلاحية رابط التأكيد.' });
      }
      if (code === 'NEWSLETTER_CONFIRMATION_SUPPRESSED' || code === 'NEWSLETTER_CONFIRMATION_PROVIDER_TERMINAL') {
        return res.status(409).json({ success: false, message: 'تعذر تأكيد هذا الاشتراك.' });
      }
      if (code === 'NEWSLETTER_CONFIRMATION_INVALID' || error instanceof z.ZodError) {
        return res.status(400).json({ success: false, message: 'رابط التأكيد غير صالح.' });
      }
      console.error('Error confirming newsletter subscription');
      return res.status(500).json({ success: false, message: 'تعذر تأكيد الاشتراك.' });
    }
  });

  app.post('/api/smart-newsletter/admin/retry-sync/:subscriptionId', isAuthenticated, requireRole('admin', 'super_admin'), async (req: any, res) => {
    setNoStore(res);
    try {
      const result = await retryNewsletterMailerLiteSync(req.params.subscriptionId);
      res.json({ success: Boolean(result?.success), mailerliteSynced: Boolean(result?.success) });
    } catch {
      console.error('Error retrying newsletter provider sync');
      res.status(500).json({ success: false, message: 'تعذر إعادة مزامنة الاشتراك.' });
    }
  });

  /**
   * GET /api/smart-newsletter/status/:email
   * Check subscription status
   */
  app.get('/api/smart-newsletter/status/:email', async (req: any, res) => {
    setNoStore(res);
    try {
      const { email } = req.params;

      // This answered "is <email> subscribed?" for any address, which is a
      // subscriber-enumeration oracle over the whole reader base. Require the
      // same proof of ownership as unsubscribe/update.
      const resolved = await resolveSubscriber(req, email, { allowMissingVerifiedOwner: true });
      if (!resolved.ok) {
        return res.status(resolved.httpStatus).json({
          success: false,
          message: resolved.message,
        });
      }
      const localSub = resolved.subscription;

      // A verified account may not have a local newsletter row yet. This is a
      // normal empty state for the preferences page, not an invalid link. The
      // ownership proof above is still required, and no provider lookup is
      // meaningful without a local subscription address.
      if (!localSub) {
        return res.json({
          success: true,
          subscribed: false,
          local: null,
          mailerlite: null,
        });
      }

      // Check MailerLite status — for the resolved subscription's own address.
      let mailerliteSub = null;
      if (isMailerLiteConfigured()) {
        const mlResult = await getMailerLiteSubscriber(localSub.email);
        if (mlResult.success && mlResult.data) {
          mailerliteSub = {
            status: mlResult.data.status,
            groups: mlResult.data.groups,
            fields: mlResult.data.fields,
          };
        }
      }

      res.json({
        success: true,
        subscribed: localSub?.status === 'active',
        local: localSub ? {
          status: localSub.status,
          language: localSub.language,
          preferences: localSub.preferences,
          subscribedAt: localSub.createdAt,
          confirmed: Boolean(localSub.verifiedAt && hasConfirmedNewsletterMarker(localSub)),
        } : null,
        mailerlite: mailerliteSub,
      });
    } catch (error) {
      console.error('Error checking newsletter status:', error);
      res.status(500).json({
        success: false,
        message: 'خطأ في التحقق من حالة الاشتراك',
      });
    }
  });

  /**
   * PUT /api/smart-newsletter/update
   * Update subscription preferences
   */
  app.put('/api/smart-newsletter/update', async (req: any, res) => {
    setNoStore(res);
    try {
      const { email, token: _token, ...updates } = req.body;

      // Same rule as unsubscribe: the address is not the credential.
      const resolved = await resolveSubscriber(req, email);
      if (!resolved.ok) {
        return res.status(resolved.httpStatus).json({
          success: false,
          message: resolved.message,
        });
      }
      const existing = resolved.subscription;
      if (existing.status !== 'active' || !existing.verifiedAt || !hasConfirmedNewsletterMarker(existing)) {
        return res.status(403).json({ success: false, message: 'رابط غير صالح.' });
      }
      const subscriberEmail = existing.email;

      const data = updateSubscriptionSchema.parse(updates);

      // Update local subscription
      const [updated] = await db
        .update(newsletterSubscriptions)
        .set({
          language: data.language || existing.language,
          preferences: {
            ...existing.preferences,
            frequency: data.frequency || existing.preferences?.frequency,
            categories: data.interests || existing.preferences?.categories,
          },
          updatedAt: new Date(),
        })
        .where(eq(newsletterSubscriptions.id, existing.id))
        .returning();

      const mailerlite = await syncConfirmedSubscription(updated);

      res.status(mailerlite?.success ? 200 : 202).json({
        success: true,
        mailerliteSynced: Boolean(mailerlite?.success),
        message: mailerlite?.success
          ? 'تم تحديث تفضيلاتك بنجاح'
          : 'حُفظ اختيارك، لكن تطبيقه على الرسائل لم يكتمل. أعد المحاولة لاحقًا.',
        subscription: {
          email: updated.email,
          language: updated.language,
          preferences: updated.preferences,
        },
      });
    } catch (error: any) {
      console.error('Error updating newsletter subscription:', error);
      res.status(500).json({
        success: false,
        message: 'خطأ في تحديث الاشتراك',
      });
    }
  });

  /**
   * POST /api/smart-newsletter/unsubscribe
   * Unsubscribe from newsletter
   */
  app.post('/api/smart-newsletter/unsubscribe', async (req: any, res) => {
    setNoStore(res);
    try {
      const { email, reason } = req.body;

      const resolved = await resolveSubscriber(req, email);
      if (!resolved.ok) {
        return res.status(resolved.httpStatus).json({
          success: false,
          message: resolved.message,
        });
      }
      const existing = resolved.subscription;
      // Everything downstream must act on the resolved row's address, never on
      // the one the caller typed.
      const subscriberEmail = existing.email;

      await db
        .update(newsletterSubscriptions)
        .set({
          status: 'unsubscribed',
          unsubscribedAt: new Date(),
          unsubscribeReason: reason || null,
          updatedAt: new Date(),
        })
        .where(eq(newsletterSubscriptions.id, existing.id));

      await addEmailSuppression(subscriberEmail, 'unsubscribe', 'newsletter_unsubscribe');

      let mailerliteSynced = false;
      let syncReason = 'MAILERLITE_NOT_CONFIGURED';
      if (isMailerLiteConfigured()) {
        const mlSub = await getMailerLiteSubscriber(subscriberEmail);
        const remoteResult = mlSub.success && mlSub.data
          ? await unsubscribeFromMailerLite(mlSub.data.id)
          : mlSub.notFound
            ? { success: true, error: undefined }
            : { success: false, error: 'MAILERLITE_UNSUBSCRIBE_SYNC_FAILED' };
        mailerliteSynced = remoteResult.success;
        syncReason = mailerliteSynced ? 'UNSUBSCRIBED' : 'UNSUBSCRIBE_SYNC_FAILED';
      }
      await db
        .update(newsletterSubscriptions)
        .set({
          metadata: {
            ...(existing.metadata && typeof existing.metadata === 'object' ? existing.metadata : {}),
            mailerliteSync: {
              status: mailerliteSynced ? 'synced' : 'error',
              reason: syncReason,
              attemptedAt: new Date().toISOString(),
            },
          },
          updatedAt: new Date(),
        })
        .where(eq(newsletterSubscriptions.id, existing.id));

      res.status(mailerliteSynced ? 200 : 202).json({
        success: true,
        mailerliteSynced,
        message: mailerliteSynced ? 'تم إلغاء اشتراكك.' : 'سُجل الإلغاء محليًا، لكن إيقاف الرسائل لدى مزود البريد لم يكتمل بعد.',
      });
    } catch (error) {
      console.error('Error unsubscribing from newsletter');
      res.status(500).json({
        success: false,
        message: 'خطأ في إلغاء الاشتراك',
      });
    }
  });

  /**
   * POST /api/webhooks/mailerlite
   * Handle MailerLite webhook events.
   * req.rawBody is populated by the verify callback on the global express.json()
   * middleware (server/index.ts), giving us the exact bytes MailerLite signed.
   */
  app.post('/api/webhooks/mailerlite', createMailerLiteWebhookHandler({ db, withStatementTimeout }));

  /**
   * POST /api/smart-newsletter/sync-interests
   * Sync user interests to MailerLite (called when behavior updates)
   */
  app.post('/api/smart-newsletter/sync-interests', async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'يجب تسجيل الدخول',
        });
      }

      // Get user email from subscription
      const [subscription] = await db
        .select()
        .from(newsletterSubscriptions)
        .where(eq(newsletterSubscriptions.userId, userId))
        .limit(1);

      if (!subscription) {
        return res.status(404).json({
          success: false,
          message: 'لم يتم العثور على اشتراك مرتبط بحسابك',
        });
      }

      // Get user dynamic interests
      const interests = await db
        .select({
          interestId: userDynamicInterests.interestId,
          interestName: userDynamicInterests.interestName,
          score: userDynamicInterests.score,
        })
        .from(userDynamicInterests)
        .where(and(
          eq(userDynamicInterests.userId, userId),
          eq(userDynamicInterests.interestType, 'category')
        ))
        .orderBy(desc(userDynamicInterests.score))
        .limit(10);

      // Determine persona
      const persona = await determineUserPersona(userId);

      // Sync to MailerLite
      if (isMailerLiteConfigured() && interests.length > 0) {
        const formattedInterests = interests.map(i => ({
          categoryId: i.interestId,
          categoryName: i.interestName || 'Unknown',
          score: i.score,
        }));

        await syncUserInterestsToMailerLite(subscription.email, formattedInterests, persona);
      }

      res.json({
        success: true,
        message: 'تم مزامنة اهتماماتك بنجاح',
        interests: interests.map(i => i.interestName),
        persona,
      });
    } catch (error) {
      console.error('Error syncing interests:', error);
      res.status(500).json({
        success: false,
        message: 'خطأ في مزامنة الاهتمامات',
      });
    }
  });

  /**
   * GET /api/smart-newsletter/groups
   * Get available MailerLite groups (admin only)
   */
  app.get('/api/smart-newsletter/groups', isAuthenticated, requireRole('admin', 'editor', 'super_admin'), async (req: any, res) => {
    try {
      if (!isMailerLiteConfigured()) {
        return res.status(503).json({
          success: false,
          message: 'MailerLite غير مُعدّ',
        });
      }

      const result = await getMailerLiteGroups();
      if (!result.success) {
        return res.status(500).json({
          success: false,
          message: result.error,
        });
      }

      res.json({
        success: true,
        groups: result.data,
      });
    } catch (error) {
      console.error('Error fetching MailerLite groups:', error);
      res.status(500).json({
        success: false,
        message: 'خطأ في جلب المجموعات',
      });
    }
  });

  /**
   * GET /api/smart-newsletter/categories
   * Get available categories for subscription interests
   */
  app.get('/api/smart-newsletter/categories', async (req: any, res) => {
    try {
      const activeCategories = await db
        .select({
          id: categories.id,
          nameAr: categories.nameAr,
          nameEn: categories.nameEn,
          slug: categories.slug,
          icon: categories.icon,
          color: categories.color,
        })
        .from(categories)
        .where(eq(categories.status, 'active'))
        .orderBy(categories.displayOrder);

      res.json({
        success: true,
        categories: activeCategories,
      });
    } catch (error) {
      console.error('Error fetching categories:', error);
      res.status(500).json({
        success: false,
        message: 'خطأ في جلب الأقسام',
      });
    }
  });

  /**
   * POST /api/smart-newsletter/trigger-real
   * Trigger real newsletter with actual articles to all subscribers
   */
  app.post('/api/smart-newsletter/trigger-real', isAuthenticated, requireRole('admin', 'super_admin'), newsletterTriggerLimiter, async (req: any, res) => {
    try {
      const { type } = req.body;
      const newsletterType = type || 'morning_brief';
      
      const { newsletterScheduler } = await import('../services/newsletterScheduler');
      
      console.log(`[Newsletter] Manually triggering ${newsletterType} newsletter...`);
      
      // Trigger the real newsletter
      await newsletterScheduler.triggerManual(newsletterType);
      
      res.json({
        success: true,
        message: `تم تشغيل إعداد مسودة النشرة ${newsletterType} للمراجعة؛ لم يُرسل بريد للمشتركين`,
      });
    } catch (error) {
      console.error('Error triggering newsletter:', error);
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'خطأ في تشغيل النشرة',
      });
    }
  });

  console.log('✅ Smart Newsletter routes registered');
}

/**
 * Determine user persona based on their reading behavior
 */
async function determineUserPersona(userId: string): Promise<string> {
  try {
    // Get user's top interests
    const interests = await db
      .select()
      .from(userDynamicInterests)
      .where(eq(userDynamicInterests.userId, userId))
      .orderBy(desc(userDynamicInterests.score))
      .limit(5);

    if (interests.length === 0) {
      return 'explorer'; // New user, exploring
    }

    // Get category names for top interests
    const topInterests = interests.slice(0, 3);
    
    // Determine persona based on interest patterns
    // This is a simplified version - can be expanded with more sophisticated logic
    const totalScore = interests.reduce((sum, i) => sum + (i.score || 0), 0);
    const topScore = topInterests[0]?.score || 0;
    const concentration = topScore / totalScore;

    if (concentration > 0.5) {
      return 'specialist'; // Focused on specific topics
    } else if (interests.length >= 4) {
      return 'generalist'; // Broad interests
    } else {
      return 'balanced'; // Mix of focused and broad
    }
  } catch (error) {
    console.error('Error determining persona:', error);
    return 'unknown';
  }
}
