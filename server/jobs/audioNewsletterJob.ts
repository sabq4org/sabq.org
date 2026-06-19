import * as cron from 'node-cron';
import { db } from '../db';
import { eq, and, lte, or, isNull, desc, inArray } from 'drizzle-orm';
import { audioNewsletters, articles } from '@shared/schema';
import { audioNewsletterService } from '../services/audioNewsletterService';

// Queue for managing audio generation jobs
class AudioNewsletterJobQueue {
  private queue: Array<{
    newsletterId: string;
    priority: 'high' | 'normal' | 'low';
    addedAt: Date;
  }> = [];
  
  private processing = false;
  private maxConcurrent = 3;
  private activeJobs = 0;
  
  // Add job to queue
  addJob(newsletterId: string, priority: 'high' | 'normal' | 'low' = 'normal') {
    // Check if job already exists
    const exists = this.queue.some(job => job.newsletterId === newsletterId);
    if (exists) {
      return;
    }
    
    this.queue.push({
      newsletterId,
      priority,
      addedAt: new Date()
    });
    
    // Sort queue by priority and time
    this.queue.sort((a, b) => {
      const priorityOrder = { high: 0, normal: 1, low: 2 };
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      
      return a.addedAt.getTime() - b.addedAt.getTime();
    });
    
    // Process queue if not already processing
    if (!this.processing) {
      this.processQueue();
    }
  }
  
  // Process jobs in queue
  private async processQueue() {
    if (this.processing || this.activeJobs >= this.maxConcurrent) {
      return;
    }
    
    this.processing = true;
    
    while (this.queue.length > 0 && this.activeJobs < this.maxConcurrent) {
      const job = this.queue.shift();
      if (!job) break;
      
      this.activeJobs++;
      
      // Process job asynchronously
      audioNewsletterService.generateAudio(job.newsletterId, {
        priority: job.priority
      }).then(() => {
        console.log(`✅ Audio generation completed for newsletter ${job.newsletterId}`);
      }).catch(error => {
        console.error(`❌ Audio generation failed for newsletter ${job.newsletterId}:`, error);
      }).finally(() => {
        this.activeJobs--;
        
        // Continue processing if there are more jobs
        if (this.queue.length > 0) {
          this.processQueue();
        }
      });
    }
    
    this.processing = false;
  }
  
  // Get queue status
  getStatus() {
    return {
      queueLength: this.queue.length,
      activeJobs: this.activeJobs,
      maxConcurrent: this.maxConcurrent,
      jobs: this.queue.map(job => ({
        newsletterId: job.newsletterId,
        priority: job.priority,
        waitingTime: Date.now() - job.addedAt.getTime()
      }))
    };
  }
  
  // Clear queue
  clearQueue() {
    this.queue = [];
  }
  
  // Remove specific job from queue
  removeJob(newsletterId: string): boolean {
    const index = this.queue.findIndex(job => job.newsletterId === newsletterId);
    if (index !== -1) {
      this.queue.splice(index, 1);
      return true;
    }
    return false;
  }
}

// Global queue instance
export const audioNewsletterQueue = new AudioNewsletterJobQueue();

// Process scheduled newsletters
async function processScheduledNewsletters() {
  try {
    console.log('🔄 Checking for scheduled audio newsletters...');
    
    const now = new Date();
    
    // Find newsletters that are scheduled and ready to publish
    const scheduledNewsletters = await db.select()
      .from(audioNewsletters)
      .where(
        and(
          eq(audioNewsletters.status, 'scheduled'),
          lte(audioNewsletters.scheduledFor, now)
        )
      );
    
    console.log(`Found ${scheduledNewsletters.length} scheduled newsletters to process`);
    
    for (const newsletter of scheduledNewsletters) {
      // Update status to processing
      await db.update(audioNewsletters)
        .set({ 
          status: 'processing',
          updatedAt: new Date()
        })
        .where(eq(audioNewsletters.id, newsletter.id));
      
      // Add to queue with normal priority
      audioNewsletterQueue.addJob(newsletter.id, 'normal');
      
      // Handle recurring newsletters
      if (newsletter.metadata?.isRecurring && newsletter.metadata?.recurrencePattern) {
        await createNextRecurringNewsletter(newsletter);
      }
    }
  } catch (error) {
    console.error('Error processing scheduled newsletters:', error);
  }
}

// Create next recurring newsletter
async function createNextRecurringNewsletter(newsletter: any) {
  try {
    if (!newsletter.metadata?.recurrencePattern) {
      console.log('No recurrence pattern found for recurring newsletter');
      return;
    }
    
    const nextScheduledFor = calculateNextScheduledTime(newsletter.metadata.recurrencePattern);
    
    // Get articles for the new newsletter based on template
    const maxArticles = newsletter.metadata?.maxArticles || 10;
    const articleIds = await getArticlesForTemplate(
      newsletter.template || 'custom',
      maxArticles
    );
    
    if (articleIds.length === 0) {
      console.log('No articles available for recurring newsletter');
      return;
    }
    
    // Create new newsletter with recurring metadata
    await audioNewsletterService.createNewsletter({
      title: generateNewsletterTitle(newsletter.template || 'custom', nextScheduledFor),
      description: newsletter.description,
      template: newsletter.template,
      voiceId: newsletter.voiceId,
      voiceSettings: newsletter.voiceSettings,
      articleIds,
      generatedBy: newsletter.generatedBy,
      scheduledFor: nextScheduledFor,
      metadata: {
        isRecurring: true,
        recurrencePattern: newsletter.metadata.recurrencePattern,
        maxArticles: maxArticles
      }
    });
    
    console.log(`Created next recurring newsletter scheduled for ${nextScheduledFor}`);
  } catch (error) {
    console.error('Error creating recurring newsletter:', error);
  }
}

// Calculate next scheduled time
function calculateNextScheduledTime(schedule: any): Date {
  const now = new Date();
  const [hours, minutes] = schedule.time.split(':').map(Number);
  
  let nextDate = new Date();
  nextDate.setHours(hours, minutes, 0, 0);
  
  // Adjust for timezone if needed
  if (schedule.timezone && schedule.timezone !== 'UTC') {
    // Implement timezone conversion logic here
  }
  
  switch (schedule.type) {
    case 'daily':
      // If time has passed today, schedule for tomorrow
      if (nextDate <= now) {
        nextDate.setDate(nextDate.getDate() + 1);
      }
      break;
      
    case 'weekly':
      if (schedule.daysOfWeek && schedule.daysOfWeek.length > 0) {
        const currentDay = now.getDay();
        let daysToAdd = 0;
        let found = false;
        
        // Find next day of week
        for (let i = 1; i <= 7; i++) {
          const checkDay = (currentDay + i) % 7;
          if (schedule.daysOfWeek.includes(checkDay)) {
            daysToAdd = i;
            found = true;
            break;
          }
        }
        
        if (found) {
          nextDate.setDate(nextDate.getDate() + daysToAdd);
        } else {
          // Default to one week from now if no days specified
          nextDate.setDate(nextDate.getDate() + 7);
        }
      } else {
        // Default weekly schedule (same day next week)
        nextDate.setDate(nextDate.getDate() + 7);
      }
      break;
      
    case 'custom':
      // Implement custom scheduling logic based on metadata
      if (schedule.customInterval) {
        nextDate.setDate(nextDate.getDate() + schedule.customInterval);
      }
      break;
  }
  
  return nextDate;
}

// Generate newsletter title based on template and date
function generateNewsletterTitle(template: string, date: Date): string {
  const dateStr = date.toLocaleDateString('ar-SA-u-ca-gregory', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  
  const titles: Record<string, string> = {
    'morning_brief': `النشرة الصباحية - ${dateStr}`,
    'evening_digest': `النشرة المسائية - ${dateStr}`,
    'weekly_analysis': `التحليل الأسبوعي - ${dateStr}`,
    'tech_update': `نشرة التقنية - ${dateStr}`,
    'business_report': `التقرير الاقتصادي - ${dateStr}`,
    'sport_highlights': `النشرة الرياضية - ${dateStr}`,
    'breaking_news': `عاجل - ${dateStr}`,
    'custom': `نشرة سبق - ${dateStr}`
  };
  
  return titles[template] || `نشرة سبق - ${dateStr}`;
}

// Get articles for template
async function getArticlesForTemplate(
  template: string,
  maxArticles: number
): Promise<string[]> {
  // Get appropriate articles based on template
  let categoryFilters: string[] = [];
  let orderBy: any = { publishedAt: 'desc' };
  
  switch (template) {
    case 'morning_brief':
    case 'evening_digest':
      // Get latest articles from various categories
      categoryFilters = [];
      break;
      
    case 'tech_update':
      categoryFilters = ['technology', 'تقنية'];
      break;
      
    case 'business_report':
      categoryFilters = ['business', 'economy', 'اقتصاد', 'أعمال'];
      break;
      
    case 'sport_highlights':
      categoryFilters = ['sports', 'رياضة'];
      break;
      
    case 'breaking_news':
      // Get articles marked as breaking
      orderBy = { viewCount: 'desc' };
      break;
      
    case 'weekly_analysis':
      // Get most viewed articles of the week
      orderBy = { viewCount: 'desc' };
      break;
  }
  
  // Query articles (simplified query)
  let articlesQuery;
  if (categoryFilters.length > 0) {
    // For now, we'll just get the latest articles
    // Category filtering would need to be implemented based on your category structure
    articlesQuery = await db.select({ id: articles.id })
      .from(articles)
      .where(eq(articles.status, 'published'))
      .orderBy(desc(articles.publishedAt))
      .limit(maxArticles);
  } else {
    articlesQuery = await db.select({ id: articles.id })
      .from(articles)
      .where(eq(articles.status, 'published'))
      .orderBy(desc(articles.publishedAt))
      .limit(maxArticles);
  }
  
  return articlesQuery.map(article => article.id);
}

// Process failed jobs (retry mechanism)
async function processFailedJobs() {
  try {
    console.log('🔄 Checking for failed audio newsletters...');
    
    const failedNewsletters = await db.select()
      .from(audioNewsletters)
      .where(eq(audioNewsletters.status, 'failed'));
    
    console.log(`Found ${failedNewsletters.length} failed newsletters`);
    
    const maxRetries = 3;
    
    for (const newsletter of failedNewsletters) {
      const retryCount = newsletter.metadata?.retryCount || 0;
      
      if (retryCount < maxRetries) {
        console.log(`Retrying newsletter ${newsletter.id} (attempt ${retryCount + 1}/${maxRetries})`);
        
        // Update metadata with retry information
        await db.update(audioNewsletters)
          .set({
            metadata: {
              ...newsletter.metadata,
              retryCount: retryCount + 1,
              lastRetryAt: new Date().toISOString()
            },
            status: 'pending',
            updatedAt: new Date()
          })
          .where(eq(audioNewsletters.id, newsletter.id));
        
        // Add to queue with low priority
        audioNewsletterQueue.addJob(newsletter.id, 'low');
      } else {
        // Terminal state: move out of 'failed' so the next sweep stops
        // re-selecting (and re-logging) the same exhausted rows every run. The
        // old code left them as 'failed' forever, so a backlog of permanently
        // failed newsletters (116 in production) was re-queried + logged on
        // every 15-min run — pure waste. 'failed_permanent' is excluded from the
        // status='failed' query below; surface them in the dashboard if needed.
        console.log(`Newsletter ${newsletter.id} exceeded max retries (${maxRetries}) — marking failed_permanent`);
        await db.update(audioNewsletters)
          .set({
            status: 'failed_permanent',
            metadata: {
              ...newsletter.metadata,
              abandonedAt: new Date().toISOString(),
            },
            updatedAt: new Date(),
          })
          .where(eq(audioNewsletters.id, newsletter.id));
      }
    }
  } catch (error) {
    console.error('Error processing failed jobs:', error);
  }
}

// Clean up old completed jobs
async function cleanupOldJobs() {
  try {
    console.log('🧹 Cleaning up old audio newsletter jobs...');
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    // For now, we'll just log cleanup - actual deletion would depend on schema
    // This would be implemented once audioNewsletterListens table is available
    console.log(`Would clean up records older than ${thirtyDaysAgo.toISOString()}`);
    
    console.log('Cleanup completed');
  } catch (error) {
    console.error('Error cleaning up old jobs:', error);
  }
}

// Initialize cron jobs
export function initializeAudioNewsletterJobs() {
  console.log('📻 Initializing audio newsletter job scheduler...');
  
  const scheduledJob = cron.schedule(
    '*/10 * * * *', // Every 10 minutes
    processScheduledNewsletters,
    {
      timezone: 'Asia/Riyadh'
    }
  );
  
  // Retry failed jobs every 15 minutes
  const retryJob = cron.schedule(
    '*/15 * * * *', // Every 15 minutes
    processFailedJobs,
    {
      timezone: 'Asia/Riyadh'
    }
  );
  
  // Clean up old jobs daily at 3 AM
  const cleanupJob = cron.schedule(
    '0 3 * * *', // Daily at 3 AM
    cleanupOldJobs,
    {
      timezone: 'Asia/Riyadh'
    }
  );
  
  console.log('✅ Audio newsletter jobs initialized');
  
  // Process any pending scheduled newsletters on startup
  processScheduledNewsletters();
  
  return {
    scheduledJob,
    retryJob,
    cleanupJob,
    queue: audioNewsletterQueue
  };
}

// Export for use in other modules
export default {
  initializeAudioNewsletterJobs,
  audioNewsletterQueue
};