import * as cron from 'node-cron';
import { log } from "../utils/logger";
import { db } from '../db';
import { eq, desc, gte, and, isNotNull, sql } from 'drizzle-orm';
import {
  articles,
  audioNewsletters,
  audioNewsletterArticles,
  users,
  notificationsInbox,
  type Article,
  type InsertAudioNewsletter,
  type NotificationInbox,
} from '@shared/schema';
import { nanoid } from 'nanoid';
import { sendEmailNotification } from './email';
import { subHours, format } from 'date-fns';
import { enqueueNewsletterDelivery } from './newsletterDeliveryQueue';

interface ScheduleConfig {
  type: 'morning_brief' | 'evening_digest' | 'weekly_roundup';
  title: string;
  description: string;
  articleCount: number;
  timeWindow: number; // hours to look back
  cronSchedule: string;
  enabled: boolean;
}

// Saudi Arabia timezone
const TIMEZONE = 'Asia/Riyadh';

// Schedule configurations
const SCHEDULES: ScheduleConfig[] = [
  {
    type: 'morning_brief',
    title: 'نشرة سبق الصباحية - {date}',
    description: 'أبرز أخبار اليوم لبداية يومك',
    articleCount: 5,
    timeWindow: 24, // Last 24 hours
    cronSchedule: '0 6 * * *', // 6:00 AM every day
    enabled: true
  },
  {
    type: 'evening_digest',
    title: 'نشرة سبق المسائية - {date}',
    description: 'ملخص أهم أحداث اليوم',
    articleCount: 5,
    timeWindow: 12, // Last 12 hours
    cronSchedule: '0 18 * * *', // 6:00 PM every day
    enabled: true
  },
  {
    type: 'weekly_roundup',
    title: 'النشرة الأسبوعية - أسبوع {week}',
    description: 'تحليل معمق لأبرز أحداث الأسبوع',
    articleCount: 10,
    timeWindow: 168, // Last 7 days
    cronSchedule: '0 10 * * 0', // 10:00 AM on Sundays
    enabled: false // Disabled - weekly newsletter removed
  }
];

// Global singleton guard to prevent multiple instances across hot-reloads
declare global {
  var _newsletterSchedulerStarted: boolean;
  var _newsletterExecutingJobs: Set<string>;
}

globalThis._newsletterSchedulerStarted = globalThis._newsletterSchedulerStarted || false;
globalThis._newsletterExecutingJobs = globalThis._newsletterExecutingJobs || new Set();

class NewsletterScheduler {
  private jobs: Map<string, cron.ScheduledTask> = new Map();
  private isRunning = false;
  private retryAttempts = new Map<string, number>();
  private maxRetries = 3;

  constructor() {
    log.info('[NewsletterScheduler] Initializing scheduler service');
  }

  /**
   * Start all scheduled jobs
   */
  public start() {
    // Check both local and global guards to prevent duplicate starts
    if (this.isRunning || globalThis._newsletterSchedulerStarted) {
      log.info('[NewsletterScheduler] Scheduler already running (global guard active)');
      return;
    }

    log.info('[NewsletterScheduler] Starting scheduled jobs');
    
    SCHEDULES.forEach(schedule => {
      if (schedule.enabled) {
        this.scheduleJob(schedule);
      }
    });

    this.isRunning = true;
    globalThis._newsletterSchedulerStarted = true;
    log.info(`[NewsletterScheduler] Started ${this.jobs.size} scheduled jobs`);
  }

  /**
   * Stop all scheduled jobs
   */
  public stop() {
    log.info('[NewsletterScheduler] Stopping all scheduled jobs');
    
    this.jobs.forEach((job, name) => {
      job.stop();
      log.info(`[NewsletterScheduler] Stopped job: ${name}`);
    });
    
    this.jobs.clear();
    this.isRunning = false;
  }

  /**
   * Schedule a single job
   */
  private scheduleJob(config: ScheduleConfig) {
    const jobName = `newsletter_${config.type}`;
    
    // Stop existing job if any
    if (this.jobs.has(jobName)) {
      this.jobs.get(jobName)!.stop();
    }

    // Create new scheduled job
    const job = cron.schedule(
      config.cronSchedule,
      async () => {
        await this.executeScheduledNewsletter(config);
      },
      {
        timezone: TIMEZONE
      }
    );

    this.jobs.set(jobName, job);
    log.info(`[NewsletterScheduler] Scheduled job: ${jobName} with cron: ${config.cronSchedule}`);
  }

  /**
   * Execute a scheduled newsletter generation
   */
  private async executeScheduledNewsletter(config: ScheduleConfig) {
    const jobId = `${config.type}_${Date.now()}`;
    log.info(`[NewsletterScheduler] Executing scheduled newsletter: ${jobId}`);

    // JOB LOCK: Prevent concurrent execution of the same job type
    const lockKey = `${config.type}_${format(new Date(), 'yyyy-MM-dd')}`;
    if (globalThis._newsletterExecutingJobs.has(lockKey)) {
      log.info(`[NewsletterScheduler] ⚠️ Job ${config.type} is already executing, skipping concurrent run`);
      return;
    }
    globalThis._newsletterExecutingJobs.add(lockKey);
    
    // 🔒 DATABASE ADVISORY LOCK: Prevent race condition across pods
    const lockHash = config.type.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) * 1000000 + parseInt(format(new Date(), 'yyyyMMdd'));
    let hasDbLock = false;
    
    const releaseLock = async () => {
      if (!hasDbLock) return;
      try {
        await db.execute(sql`SELECT pg_advisory_unlock(${lockHash})`);
        log.info(`[NewsletterScheduler] 🔓 Released DB lock for ${config.type}`);
        hasDbLock = false;
      } catch (e) {
        console.error(`[NewsletterScheduler] Failed to release lock:`, e);
      }
    };

    try {
      const lockResult = await db.execute(sql`SELECT pg_try_advisory_lock(${lockHash}) as locked`);
      hasDbLock = (lockResult.rows?.[0] as any)?.locked === true;
      
      if (!hasDbLock) {
        log.info(`[NewsletterScheduler] ⚠️ Could not acquire DB lock for ${config.type}, another pod is processing`);
        globalThis._newsletterExecutingJobs.delete(lockKey);
        return;
      }
      log.info(`[NewsletterScheduler] 🔒 Acquired DB lock for ${config.type} (hash: ${lockHash})`);

      // DUPLICATE PREVENTION: Check if newsletter was already sent today for this type
      const today = new Date();
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
      const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
      
      const existingToday = await db
        .select({ id: audioNewsletters.id })
        .from(audioNewsletters)
        .where(
          and(
            gte(audioNewsletters.createdAt, todayStart),
            sql`${audioNewsletters.createdAt} <= ${todayEnd}`,
            sql`${audioNewsletters.metadata}->>'scheduledType' = ${config.type}`
          )
        )
        .limit(1);
      
      if (existingToday.length > 0) {
        log.info(`[NewsletterScheduler] ⚠️ Newsletter ${config.type} already sent today (${existingToday[0].id}), skipping duplicate`);
        await releaseLock();
        globalThis._newsletterExecutingJobs.delete(lockKey);
        return;
      }
      
      log.info(`[NewsletterScheduler] ✅ No duplicate found for ${config.type} today, proceeding...`);

      // Fetch MORE articles than needed to allow per-subscriber personalization
      // Fetch 3x the required amount (or at least 15-20) for variety
      const articlesToFetch = Math.max(config.articleCount * 3, 20);
      const topArticles = await this.getTopArticles(articlesToFetch, config.timeWindow);
      
      if (topArticles.length === 0) {
        log.info(`[NewsletterScheduler] No articles found for ${config.type}, skipping`);
        return;
      }

      // Format title and description with current date
      const now = new Date();
      const dateStr = format(now, 'yyyy-MM-dd');
      const weekStr = format(now, 'ww/yyyy');
      
      const title = config.title
        .replace('{date}', dateStr)
        .replace('{week}', weekStr);
      
      // Get system user for automated newsletters
      const systemUser = await this.getSystemUser();
      
      // Create the newsletter record + its article selection.
      //
      // This used to go through audioNewsletterService, which also produced a
      // TTS audio file. The audio-newsletter feature was removed (2026-07-25);
      // the scheduled EMAIL newsletter kept its storage — the `audio_newsletters`
      // / `audio_newsletter_articles` tables are now simply where a scheduled
      // newsletter and its article selection live, and the delivery queue reads
      // the selection from there (newsletterDeliveryQueue.loadJobArticles).
      const slug = `${title
        .toLowerCase()
        .replace(/[\s\u0600-\u06FF]+/g, '-')
        .replace(/[^\w\-]+/g, '')
        .replace(/\-\-+/g, '-')
        .replace(/^-+|-+$/g, '') || 'newsletter'}-${now.getTime()}`;

      const [newsletter] = await db.insert(audioNewsletters).values({
        title,
        description: config.description,
        slug,
        generatedBy: systemUser.id,
        status: 'draft',
        publishedAt: null,
        // `template` records which schedule produced this; `metadata` has a
        // narrow declared shape (retry/recurrence only) so scheduling details
        // go in the real columns rather than being forced into the jsonb.
        template: config.type,
      }).returning();

      if (topArticles.length > 0) {
        await db.insert(audioNewsletterArticles).values(
          topArticles.map((a, index) => ({
            newsletterId: newsletter.id,
            articleId: a.id,
            order: index
          }))
        );
      }

      log.info(`[NewsletterScheduler] Created newsletter: ${newsletter.id}`);
      
      // التسليم لا يعمل داخل عملية الـ API. نسجل job دائمًا يلتقطه
      // newsletter-worker على دفعات قابلة للاستئناف ومن دون تكرار المستلمين المنجزين.
      const deliveryJob = await enqueueNewsletterDelivery({
        newsletterId: newsletter.id,
        newsletterType: config.type,
        title,
        description: config.description,
        articlesPerSubscriber: config.articleCount,
      });
      log.info(`[NewsletterScheduler] Queued delivery job ${deliveryJob.id}`);

      // Send notifications to admins
      await this.notifyAdmins(newsletter.id, config.type, 'success');
      
      // Reset retry counter on success
      this.retryAttempts.delete(config.type);
      
      await releaseLock();
      globalThis._newsletterExecutingJobs.delete(lockKey);
      log.info(`[NewsletterScheduler] Successfully prepared and queued ${config.type}`);
      
    } catch (error) {
      console.error(`[NewsletterScheduler] Error executing ${config.type}:`, error);
      await releaseLock().catch(() => {}); // Release lock on error
      
      // Handle retry logic
      const retryCount = this.retryAttempts.get(config.type) || 0;
      
      if (retryCount < this.maxRetries) {
        this.retryAttempts.set(config.type, retryCount + 1);
        
        // Retry after delay
        const retryDelay = Math.pow(2, retryCount) * 5 * 60 * 1000; // Exponential backoff: 5, 10, 20 minutes
        
        log.info(`[NewsletterScheduler] Retrying ${config.type} in ${retryDelay / 1000}s (attempt ${retryCount + 1}/${this.maxRetries})`);
        
        setTimeout(() => {
          this.executeScheduledNewsletter(config);
        }, retryDelay);
      } else {
        // Max retries reached, notify admins of failure
        await this.notifyAdmins('', config.type, 'failed', error as Error);
        this.retryAttempts.delete(config.type);
      }
    }
  }

  /**
   * Get top performing articles based on metrics
   * Uses adaptive time window to ensure enough articles for personalization
   */
  private async getTopArticles(limit: number, hoursBack: number): Promise<Article[]> {
    const startTime = subHours(new Date(), hoursBack);
    
    // First, try to get articles from the specified time window
    let topArticles = await db
      .select()
      .from(articles)
      .where(
        and(
          gte(articles.createdAt, startTime),
          eq(articles.status, 'published'),
          isNotNull(articles.content)
        )
      )
      .orderBy(desc(articles.createdAt))
      .limit(limit);

    // ADAPTIVE TIME WINDOW: If not enough articles, expand the search
    // This ensures we have enough variety for personalization
    if (topArticles.length < limit) {
      log.info(`[NewsletterScheduler] Only found ${topArticles.length} articles in ${hoursBack}h window, expanding search...`);
      
      // Expand to 7 days if needed
      const extendedStartTime = subHours(new Date(), 168); // 7 days
      topArticles = await db
        .select()
        .from(articles)
        .where(
          and(
            gte(articles.createdAt, extendedStartTime),
            eq(articles.status, 'published'),
            isNotNull(articles.content)
          )
        )
        .orderBy(desc(articles.createdAt))
        .limit(limit);
      
      log.info(`[NewsletterScheduler] Extended search found ${topArticles.length} articles`);
    }

    return topArticles;
  }


  /**
   * Get or create system user for automated operations
   */
  private async getSystemUser() {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, 'system@sabq.sa'))
      .limit(1);
    
    if (user) {
      return user;
    }

    // Create system user if not exists
    const [newUser] = await db
      .insert(users)
      .values({
        id: 'system-newsletter',
        email: 'system@sabq.sa',
        firstName: 'نظام',
        lastName: 'سبق',
        role: 'system',
        passwordHash: ''
      })
      .returning();
    
    return newUser;
  }

  /**
   * Send notifications to admin users
   */
  private async notifyAdmins(
    newsletterId: string,
    scheduleType: string,
    status: 'success' | 'failed',
    error?: Error
  ) {
    try {
      // Get all admin users
      const adminUsers = await db
        .select()
        .from(users)
        .where(eq(users.role, 'admin'));
      
      const notificationTitle = status === 'success'
        ? `تم إنشاء النشرة ${this.getScheduleTypeName(scheduleType)} بنجاح`
        : `فشل إنشاء النشرة ${this.getScheduleTypeName(scheduleType)}`;
      
      const notificationBody = status === 'success'
        ? `تم إنشاء وجدولة النشرة الصوتية تلقائياً`
        : `حدث خطأ أثناء إنشاء النشرة: ${error?.message || 'خطأ غير معروف'}`;
      
      // Create notifications for all admins
      const notificationPromises = adminUsers.map(admin =>
        db.insert(notificationsInbox).values({
          userId: admin.id,
          type: status === 'success' ? 'info' : 'alert',
          title: notificationTitle,
          body: notificationBody,
          metadata: {
            newsletterId,
            scheduleType,
            status,
            error: error?.message,
            timestamp: new Date().toISOString()
          }
        })
      );
      
      await Promise.all(notificationPromises);
      
      // Send email notifications to admins (if any transactional provider is configured)
      if (process.env.MAILERSEND_API_KEY || process.env.SENDGRID_API_KEY) {
        const frontendUrl = process.env.FRONTEND_URL || process.env.APP_URL || 'https://sabq.org';
        const emailPromises = adminUsers.map(admin =>
          sendEmailNotification({
            to: admin.email,
            subject: notificationTitle,
            text: notificationBody,
            html: `
              <div dir="rtl" style="font-family: Arial, sans-serif;">
                <h2>${notificationTitle}</h2>
                <p>${notificationBody}</p>
                ${status === 'success' && newsletterId ? `
                  <p>
                    <a href="${frontendUrl}/admin/audio-newsletters/${newsletterId}" 
                       style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
                      عرض النشرة
                    </a>
                  </p>
                ` : ''}
                <hr style="margin: 20px 0; border: none; border-top: 1px solid #ddd;">
                <p style="color: #666; font-size: 12px;">
                  هذا إشعار تلقائي من نظام سبق. التوقيت: ${format(new Date(), 'yyyy-MM-dd HH:mm:ss')}
                </p>
              </div>
            `
          })
        );
        
        await Promise.allSettled(emailPromises);
      }
      
    } catch (error) {
      console.error('[NewsletterScheduler] Error sending notifications:', error);
    }
  }

  /**
   * Get human-readable schedule type name
   */
  private getScheduleTypeName(type: string): string {
    switch (type) {
      case 'morning_brief':
        return 'الصباحية';
      case 'evening_digest':
        return 'المسائية';
      case 'weekly_roundup':
        return 'الأسبوعية';
      default:
        return type;
    }
  }

  /**
   * Manually trigger a scheduled newsletter (for testing)
   */
  public async triggerManual(scheduleType: string) {
    const config = SCHEDULES.find(s => s.type === scheduleType);
    
    if (!config) {
      throw new Error(`Schedule type ${scheduleType} not found`);
    }
    
    log.info(`[NewsletterScheduler] Manually triggering ${scheduleType}`);
    await this.executeScheduledNewsletter(config);
  }

  /**
   * Get scheduler status
   */
  public getStatus() {
    return {
      isRunning: this.isRunning,
      jobs: Array.from(this.jobs.entries()).map(([name, job]) => ({
        name,
        // @ts-ignore - accessing private property for status
        running: job._scheduler?.running || false
      })),
      schedules: SCHEDULES.map(s => ({
        ...s,
        nextRun: this.getNextRunTime(s.cronSchedule)
      })),
      retryQueue: Array.from(this.retryAttempts.entries()).map(([type, count]) => ({
        type,
        retryCount: count,
        maxRetries: this.maxRetries
      }))
    };
  }

  /**
   * Calculate next run time for a cron schedule
   */
  private getNextRunTime(cronSchedule: string): string {
    // This is a simplified implementation
    // For production, use a proper cron parser library
    const parts = cronSchedule.split(' ');
    const hour = parseInt(parts[1]);
    const minute = parseInt(parts[0]);
    
    const next = new Date();
    next.setHours(hour, minute, 0, 0);
    
    if (next < new Date()) {
      next.setDate(next.getDate() + 1);
    }
    
    return next.toISOString();
  }
}

// Export singleton instance
export const newsletterScheduler = new NewsletterScheduler();

// REMOVED auto-start from here - scheduler is now ONLY started from server/index.ts
// This prevents duplicate scheduler instances that were causing newsletters to be sent twice
