import cron from "node-cron";
import { log } from "../utils/logger";
import { storage } from "../storage";
import { createNotification } from "../notificationEngine";
import { generateCalendarEventIdeas } from "../services/calendarAi";

/**
 * Calendar Cron Jobs - مهام تقويم سبق الدورية
 * 
 * يتضمن:
 * - توليد المسودات الذكية للأحداث المهمة
 * - إرسال التذكيرات المجدولة
 * - تحديث الأحداث القادمة (تخزين مؤقت)
 */

let isGeneratingDrafts = false;
let isProcessingReminders = false;

/**
 * مهمة دورية لتوليد المسودات الذكية
 * تعمل يوميًا في الساعة 2 صباحًا
 */
export const autoGenerateAiDrafts = cron.schedule('0 2 * * *', async () => {
  if (isGeneratingDrafts) {
    log.info("[CalendarJobs] ⏭️ Skipping AI draft generation - already running");
    return;
  }

  isGeneratingDrafts = true;
  log.info("[CalendarJobs] 🤖 Starting automatic AI draft generation...");

  try {
    // الحصول على الأحداث القادمة المهمة (30 يوم)
    const upcomingEvents = await storage.getUpcomingCalendarEvents(30);
    
    // تصفية الأحداث ذات الأهمية العالية (4 أو 5) والتي لا تحتوي على مسودة
    const highImportanceEvents = upcomingEvents.filter(e => 
      e.importance >= 4
    );

    log.info(`[CalendarJobs] 📊 Found ${highImportanceEvents.length} high-importance events without AI drafts`);

    let generatedCount = 0;
    let skippedCount = 0;

    for (const event of highImportanceEvents) {
      try {
        // التحقق من وجود مسودة
        const existingDraft = await storage.getCalendarAiDraft(event.id);
        
        if (existingDraft) {
          log.info(`[CalendarJobs] ⏭️ Skipping "${event.title}" - draft already exists`);
          skippedCount++;
          continue;
        }

        log.info(`[CalendarJobs] 🎯 Generating AI draft for: ${event.title}`);
        
        const aiDraft = await generateCalendarEventIdeas(
          event.title,
          event.description || '',
          event.type,
          event.dateStart
        );

        await storage.createCalendarAiDraft({
          eventId: event.id,
          editorialIdeas: aiDraft.editorialIdeas,
          headlines: aiDraft.headlines,
          infographicData: aiDraft.infographicData,
          socialMedia: aiDraft.socialMedia,
          seo: aiDraft.seo,
        } as any);

        generatedCount++;
        log.info(`[CalendarJobs] ✅ Draft generated for: ${event.title}`);

        // توقف قصير بين كل طلب لتجنب تجاوز حدود API
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.error(`[CalendarJobs] ❌ Error generating draft for ${event.title}:`, error);
      }
    }

    log.info(`[CalendarJobs] ✅ AI draft generation complete:`);
    log.info(`   - Generated: ${generatedCount}`);
    log.info(`   - Skipped: ${skippedCount}`);
  } catch (error) {
    console.error("[CalendarJobs] ❌ Error in AI draft generation job:", error);
  } finally {
    isGeneratingDrafts = false;
  }
}, {
  timezone: "Asia/Riyadh"
});

/**
 * مهمة دورية لإرسال التذكيرات
 * تعمل كل ساعة
 */
export const processReminders = cron.schedule('0 * * * *', async () => {
  if (isProcessingReminders) {
    log.info("[CalendarJobs] ⏭️ Skipping reminder processing - already running");
    return;
  }

  isProcessingReminders = true;
  log.info("[CalendarJobs] 🔔 Processing calendar reminders...");

  try {
    const now = new Date();
    const reminders = await storage.getRemindersToFire(now);

    log.info(`[CalendarJobs] 📊 Found ${reminders.length} reminders to process`);

    let sentCount = 0;
    let errorCount = 0;

    for (const reminder of reminders) {
      try {
        const event = reminder.event;
        
        // تحديد المستلمين بناءً على المهام المعينة
        const assignments = await storage.getCalendarAssignments({ eventId: event.id });
        
        const recipientIds = [
          ...new Set([
            event.createdById,
            ...assignments
              .filter(a => a.userId && a.status !== 'done')
              .map(a => a.userId!)
          ].filter(Boolean))
        ];

        log.info(`[CalendarJobs] 📧 Sending reminder for "${event.title}" to ${recipientIds.length} users`);

        // إرسال إشعارات لكل مستلم
        for (const userId of recipientIds) {
          try {
            const channels = [reminder.channel || 'IN_APP'];
            const reminderMessage = `حدث قادم في ${event.dateStart.toLocaleDateString('ar-SA-u-ca-gregory')}`;
            
            await createNotification({
              type: 'NEW_ARTICLE',
              data: {
                articleId: event.id,
                articleTitle: `تذكير: ${event.title} - ${reminderMessage}`,
                articleSlug: event.id,
                newsType: channels.join(','),
              },
            });

            sentCount++;
          } catch (notifError) {
            console.error(`[CalendarJobs] ❌ Error sending notification to user ${userId}:`, notifError);
            errorCount++;
          }
        }

        // تعطيل التذكير بعد الإرسال لتجنب التكرار
        await storage.updateCalendarReminder(reminder.id, { enabled: false });
        
        log.info(`[CalendarJobs] ✅ Reminder processed for: ${event.title}`);
      } catch (error) {
        console.error(`[CalendarJobs] ❌ Error processing reminder ${reminder.id}:`, error);
        errorCount++;
      }
    }

    log.info(`[CalendarJobs] ✅ Reminder processing complete:`);
    log.info(`   - Sent: ${sentCount}`);
    log.info(`   - Errors: ${errorCount}`);
  } catch (error) {
    console.error("[CalendarJobs] ❌ Error in reminder processing job:", error);
  } finally {
    isProcessingReminders = false;
  }
}, {
  timezone: "Asia/Riyadh"
});

/**
 * تخزين مؤقت للأحداث القادمة
 * Cache in-memory للأداء (يمكن استبداله بـ Redis)
 */
let upcomingEventsCache: any[] = [];
let cacheLastUpdated: Date | null = null;

async function refreshUpcomingEventsCache() {
  log.info("[CalendarJobs] 📦 Updating upcoming events cache...");

  try {
    const events = await storage.getUpcomingCalendarEvents(7);
    upcomingEventsCache = events;
    cacheLastUpdated = new Date();
    
    log.info(`[CalendarJobs] ✅ Cache updated with ${events.length} upcoming events`);
  } catch (error) {
    console.error("[CalendarJobs] ❌ Error updating cache:", error);
  }
}

export const updateUpcomingEventsCache = cron.schedule('*/15 * * * *', refreshUpcomingEventsCache, {
  timezone: "Asia/Riyadh"
});

/**
 * الحصول على الأحداث القادمة من الذاكرة المؤقتة
 */
export function getCachedUpcomingEvents() {
  return {
    events: upcomingEventsCache,
    lastUpdated: cacheLastUpdated
  };
}

/**
 * تهيئة وتشغيل جميع المهام الدورية
 */
export function startCalendarJobs() {
  log.info("[CalendarJobs] 🚀 Starting calendar cron jobs...");
  
  autoGenerateAiDrafts.start();
  processReminders.start();
  updateUpcomingEventsCache.start();
  
  // تحديث فوري للذاكرة المؤقتة عند البدء
  void refreshUpcomingEventsCache();
  
  log.info("[CalendarJobs] ✅ All calendar jobs started successfully");
  log.info("[CalendarJobs] 📅 Schedules:");
  log.info("   - AI Draft Generation: Daily at 2:00 AM");
  log.info("   - Reminder Processing: Every hour");
  log.info("   - Cache Update: Every 15 minutes");
}

/**
 * إيقاف جميع المهام الدورية
 */
export function stopCalendarJobs() {
  log.info("[CalendarJobs] 🛑 Stopping calendar cron jobs...");
  
  autoGenerateAiDrafts.stop();
  processReminders.stop();
  updateUpcomingEventsCache.stop();
  
  log.info("[CalendarJobs] ✅ All calendar jobs stopped");
}
