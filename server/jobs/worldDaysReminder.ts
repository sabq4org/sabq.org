import cron from "node-cron";
import { storage } from "../storage";

const LOG_PREFIX = "[WorldDaysReminder]";

function calculateReminderDate(eventDate: Date, reminderType: string): Date {
  const reminderDate = new Date(eventDate);
  // Set to start of day (00:01) so reminders are due when the day begins
  reminderDate.setHours(0, 1, 0, 0);
  
  switch (reminderType) {
    case "week_before":
      reminderDate.setDate(reminderDate.getDate() - 7);
      break;
    case "day_before":
      reminderDate.setDate(reminderDate.getDate() - 1);
      break;
    case "same_day":
      // Keep the same date
      break;
  }
  
  return reminderDate;
}

function getStartOfDay(date: Date): Date {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  return startOfDay;
}

async function createRemindersForUpcomingDays() {
  try {
    console.log(`${LOG_PREFIX} Checking for upcoming world days...`);
    
    const upcomingDays = await storage.getUpcomingWorldDays(30);
    const today = getStartOfDay(new Date());
    
    for (const worldDay of upcomingDays) {
      const eventDate = new Date(worldDay.eventDate);
      eventDate.setHours(0, 0, 0, 0);
      
      const existingReminders = await storage.getWorldDayReminders(worldDay.id);
      const existingTypes = new Set(existingReminders.map(r => r.reminderType));
      
      // Create week_before reminder if not exists and reminder date is today or in the future
      if (!existingTypes.has("week_before")) {
        const weekBeforeDate = calculateReminderDate(eventDate, "week_before");
        if (weekBeforeDate >= today) {
          await storage.createWorldDayReminder({
            worldDayId: worldDay.id,
            reminderType: "week_before",
            scheduledFor: weekBeforeDate,
            status: "pending",
          });
          console.log(`${LOG_PREFIX} Created week_before reminder for ${worldDay.nameAr} (scheduled: ${weekBeforeDate.toISOString()})`);
        }
      }
      
      // Create day_before reminder if not exists and reminder date is today or in the future
      if (!existingTypes.has("day_before")) {
        const dayBeforeDate = calculateReminderDate(eventDate, "day_before");
        if (dayBeforeDate >= today) {
          await storage.createWorldDayReminder({
            worldDayId: worldDay.id,
            reminderType: "day_before",
            scheduledFor: dayBeforeDate,
            status: "pending",
          });
          console.log(`${LOG_PREFIX} Created day_before reminder for ${worldDay.nameAr} (scheduled: ${dayBeforeDate.toISOString()})`);
        }
      }
      
      // Create same_day reminder if not exists and reminder date is today or in the future
      if (!existingTypes.has("same_day")) {
        const sameDayDate = calculateReminderDate(eventDate, "same_day");
        if (sameDayDate >= today) {
          await storage.createWorldDayReminder({
            worldDayId: worldDay.id,
            reminderType: "same_day",
            scheduledFor: sameDayDate,
            status: "pending",
          });
          console.log(`${LOG_PREFIX} Created same_day reminder for ${worldDay.nameAr} (scheduled: ${sameDayDate.toISOString()})`);
        }
      }
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} Error creating reminders:`, error);
  }
}

async function processPendingReminders() {
  try {
    console.log(`${LOG_PREFIX} Processing pending reminders...`);
    
    const pendingReminders = await storage.getPendingReminders();
    console.log(`${LOG_PREFIX} Found ${pendingReminders.length} pending reminders`);
    
    for (const reminder of pendingReminders) {
      try {
        const worldDay = await storage.getWorldDayById(reminder.worldDayId);
        if (!worldDay) {
          console.warn(`${LOG_PREFIX} World day not found for reminder ${reminder.id}`);
          await storage.updateWorldDayReminderStatus(reminder.id, "failed", undefined, "World day not found");
          continue;
        }
        
        // Format date with Arabic month names and English numerals (Gregorian calendar)
        const eventDateObj = new Date(worldDay.eventDate);
        const months = [
          "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
          "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"
        ];
        const days = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
        const dayName = days[eventDateObj.getDay()];
        const dayNum = eventDateObj.getDate().toString().padStart(2, '0');
        const month = months[eventDateObj.getMonth()];
        const year = eventDateObj.getFullYear();
        const eventDateFormatted = `${dayName}، ${dayNum} ${month} ${year}`;
        
        let notificationTitle = "";
        let notificationMessage = "";
        
        switch (reminder.reminderType) {
          case "week_before":
            notificationTitle = "تذكير: يوم عالمي قادم";
            notificationMessage = `${worldDay.nameAr} بعد أسبوع (${eventDateFormatted})`;
            break;
          case "day_before":
            notificationTitle = "تذكير: يوم عالمي غداً";
            notificationMessage = `${worldDay.nameAr} غداً (${eventDateFormatted})`;
            break;
          case "same_day":
            notificationTitle = "اليوم هو يوم عالمي";
            notificationMessage = `اليوم هو ${worldDay.nameAr}`;
            break;
        }
        
        console.log(`${LOG_PREFIX} Reminder: ${notificationTitle} - ${notificationMessage}`);
        
        await storage.updateWorldDayReminderStatus(reminder.id, "sent", new Date());
        
        console.log(`${LOG_PREFIX} ✅ Processed reminder for ${worldDay.nameAr}`);
      } catch (error) {
        console.error(`${LOG_PREFIX} Error processing reminder ${reminder.id}:`, error);
        await storage.updateWorldDayReminderStatus(
          reminder.id, 
          "failed", 
          undefined, 
          error instanceof Error ? error.message : "Unknown error"
        );
      }
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} Error processing reminders:`, error);
  }
}

async function runWorldDaysReminderJob() {
  console.log(`${LOG_PREFIX} 🔄 Running world days reminder job...`);
  await createRemindersForUpcomingDays();
  await processPendingReminders();
  console.log(`${LOG_PREFIX} ✅ Job completed`);
}

export function startWorldDaysReminderJob() {
  console.log(`${LOG_PREFIX} 🚀 Starting world days reminder scheduler...`);
  
  cron.schedule("0 5 * * *", async () => {
    await runWorldDaysReminderJob();
  }, {
    timezone: "Asia/Riyadh"
  });
  
  console.log(`${LOG_PREFIX} ✅ Scheduler started (runs daily at 08:00 Saudi time / 05:00 UTC)`);
  
  setTimeout(async () => {
    console.log(`${LOG_PREFIX} 🔄 Running initial check on startup...`);
    await runWorldDaysReminderJob();
  }, 5000);
}
