import cron from "node-cron";
import { ifoxCalendarService } from "../services/ifox";
import { AIArticleGenerator } from "../services/aiArticleGenerator";
import { aiImageGenerator } from "../services/aiImageGenerator";
import { sendArticleNotification } from "../notificationService";
import { storage } from "../storage";
import { nanoid } from "nanoid";

/**
 * iFox Content Generator Job
 * معالج تلقائي لمهام توليد المحتوى المجدولة
 * 
 * يعمل كل 5 دقائق للتحقق من المهام المجدولة وتنفيذها
 */

let isProcessing = false;

// Process at most 10 tasks per run to prevent worker monopolization
// This protects the system even when there's a large backlog after downtime
const MAX_BATCH_SIZE = 10;

// Maximum retry attempts before moving task to 'failed' status
const MAX_RETRY_ATTEMPTS = 3;

export const processScheduledContentTasks = cron.schedule('4,19,34,49 * * * *', async () => {
  if (isProcessing) {
    return;
  }

  isProcessing = true;

  try {
    const now = new Date();
    
    // Get ALL scheduled tasks that are ready to run
    // Process all planned tasks with scheduledDate <= now (no age limit)
    // This ensures tasks are processed even after server restarts or prolonged downtime
    // Batch size limit protects against worker monopolization
    const entries = await ifoxCalendarService.listEntries({
      scheduledDateTo: now,
      status: 'planned',
    });

    if (!entries || entries.length === 0) {
      isProcessing = false;
      return;
    }

    // Limit batch size to prevent worker monopolization
    // Remaining tasks will be picked up in subsequent runs (every minute)
    const tasksToProcess = entries.slice(0, MAX_BATCH_SIZE);
    
    if (entries.length > MAX_BATCH_SIZE) {
      console.log(`[iFox Generator] ⚠️ Found ${entries.length} tasks, processing ${MAX_BATCH_SIZE} in this batch`);
      console.log(`[iFox Generator] ℹ️ Remaining ${entries.length - MAX_BATCH_SIZE} tasks will be processed in next run`);
    }

    console.log(`[iFox Generator] 🤖 Found ${tasksToProcess.length} tasks ready to process`);

    for (const entry of tasksToProcess) {
      try {
        const topicIdea = entry.topicIdea || 'محتوى جديد';
        console.log(`[iFox Generator] 🚀 Processing task: ${topicIdea}`);

        // Update status to processing
        // Use system user ID if creator is not available
        const userId = entry.createdBy || 'system';
        await ifoxCalendarService.updateEntry(entry.id, {
          status: 'in_progress',
        }, userId);

        // ========================================
        // STEP 1: Extract parameters from calendar entry
        // ========================================
        const articleTitle = entry.topicIdea || 'محتوى جديد';
        const contentType = (entry.plannedContentType || 'news') as 'news' | 'analysis' | 'report' | 'interview' | 'opinion';
        const keywords = Array.isArray(entry.keywords) ? entry.keywords : [];
        
        // Use categoryId from calendar entry, or default to ifox-ai
        const categoryId = entry.categoryId || '112b3ebd-ab7c-424c-a2d8-ee0287df5506';

        console.log(`[iFox Generator] 📝 Generating article: "${articleTitle}"`);
        console.log(`[iFox Generator] 📊 Category: ${categoryId}, Type: ${contentType}, Keywords: ${keywords.join(', ')}`);

        // ========================================
        // STEP 2: Generate AI Article Content
        // ========================================
        const aiGenerator = new AIArticleGenerator();
        let generatedArticle;
        
        try {
          generatedArticle = await aiGenerator.generateArticle({
            title: articleTitle,
            categoryId,
            locale: 'ar', // iFox is Arabic-first
            contentType,
            keywords,
            tone: 'neutral',
            length: 'medium',
          });
          
          console.log(`[iFox Generator] ✅ Article generated successfully`);
          console.log(`[iFox Generator] 📈 Tokens used: ${generatedArticle.tokensUsed}, Time: ${generatedArticle.generationTimeMs}ms`);
        } catch (aiError) {
          console.error(`[iFox Generator] ❌ Failed to generate article content:`, aiError);
          throw new Error(`AI article generation failed: ${aiError instanceof Error ? aiError.message : String(aiError)}`);
        }

        // ========================================
        // STEP 3: Generate AI Image (optional, graceful failure)
        // ========================================
        let featuredImageUrl: string | undefined;
        
        try {
          console.log(`[iFox Generator] 🎨 Generating featured image...`);
          const generatedImage = await aiImageGenerator.generateImageFromArticle(
            generatedArticle.title,
            generatedArticle.summary,
            categoryId,
            'ar'
          );
          
          featuredImageUrl = generatedImage.imageUrl;
          console.log(`[iFox Generator] ✅ Image generated successfully: ${featuredImageUrl}`);
        } catch (imageError) {
          console.warn(`[iFox Generator] ⚠️ Image generation failed (continuing without image):`, imageError);
          // Continue without image - non-critical failure
        }

        // ========================================
        // STEP 4: Create Article in Database
        // ========================================
        const now = new Date();
        
        // Generate slug from title (max 140 chars to leave room for nanoid suffix)
        const baseSlug = generatedArticle.title
          .toLowerCase()
          .replace(/[^\u0600-\u06FF\w\s-]/g, '') // Keep Arabic, alphanumeric, spaces, hyphens
          .trim()
          .replace(/\s+/g, '-') // Replace spaces with hyphens
          .substring(0, 140); // Max 140 chars (leaving 10 for suffix)
        
        const slug = baseSlug + '-' + nanoid(8); // Total max 150 chars
        
        // Build article data conforming STRICTLY to InsertArticle schema
        // InsertArticle schema omits: id, createdAt, updatedAt, views, aiGenerated, credibilityScore, credibilityAnalysis, credibilityLastUpdated, authorId
        // We explicitly add these backend-managed fields here and cast to bypass schema validation
        const SABQ_AI_AUTHOR_ID = 'bkIhDx7BM8quPu2W1tB6Z'; // "سبق AI" (sabqai@sabq.org)
        
        const articleData = {
          // Core article content
          title: generatedArticle.title,
          slug,
          content: generatedArticle.content,
          excerpt: generatedArticle.summary.substring(0, 200),
          aiSummary: generatedArticle.summary,
          locale: 'ar',
          
          // Category
          categoryId,
          
          // Author: Always use "سبق AI" for iFox articles
          authorId: SABQ_AI_AUTHOR_ID,
          
          // Article classification
          articleType: 'news' as const,
          newsType: 'regular' as const,
          publishType: 'instant' as const,
          
          // Publishing status
          status: 'published' as const,
          publishedAt: now,
          
          // CRITICAL: Mark as AI-generated to filter from Sabq main site
          aiGenerated: true,
          
          // Media
          imageUrl: featuredImageUrl,
          
          // SEO (required by schema)
          seo: {
            metaTitle: generatedArticle.title,
            metaDescription: generatedArticle.metaDescription,
            keywords: generatedArticle.seoKeywords,
          },
          
          // SEO metadata (required by schema) - only include supported fields
          seoMetadata: {
            status: 'generated' as const,
            generatedAt: now.toISOString(),
            generatedBy: 'system', // Required for generated content
          },
          
          // Source metadata (required by schema)
          sourceMetadata: {
            type: 'manual' as const,
          },
        } as any; // Cast to bypass InsertArticle schema (authorId + aiGenerated are excluded but required here)

        let createdArticle;
        try {
          createdArticle = await storage.createArticle(articleData);
          console.log(`[iFox Generator] ✅ Article created in database: ${createdArticle.id}`);
        } catch (dbError) {
          console.error(`[iFox Generator] ❌ Failed to create article in database:`, dbError);
          throw new Error(`Database error: ${dbError instanceof Error ? dbError.message : String(dbError)}`);
        }

        // ========================================
        // STEP 5: Link Article to Calendar Entry
        // ========================================
        try {
          await ifoxCalendarService.updateEntry(entry.id, {
            status: 'completed',
            articleId: createdArticle.id,
            actualPublishedAt: new Date(),
          }, userId);
          
          console.log(`[iFox Generator] ✅ Calendar entry updated with article link`);
        } catch (updateError) {
          console.error(`[iFox Generator] ⚠️ Failed to update calendar entry (article created successfully):`, updateError);
          // Non-critical - article is created, just the link failed
        }

        // ========================================
        // STEP 6: Send Notifications
        // ========================================
        if (articleData.status === 'published') {
          try {
            await sendArticleNotification(createdArticle, 'published');
            console.log(`[iFox Generator] 📢 Notification sent for published article`);
          } catch (notifError) {
            console.warn(`[iFox Generator] ⚠️ Failed to send notification (non-critical):`, notifError);
            // Non-critical - article is published, notification just failed
          }
        }

        console.log(`[iFox Generator] ✅ Task completed successfully: ${topicIdea}`);
        console.log(`[iFox Generator] 📰 Article published: ${createdArticle.id} - "${createdArticle.title}"`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[iFox Generator] ❌ Error processing task ${entry.id}:`, errorMessage);
        
        // Increment retry counter and check if we should give up
        const currentRetryCount = entry.retryCount || 0;
        const newRetryCount = currentRetryCount + 1;
        
        // Use system user ID for error handling if creator is not available
        const errorUserId = entry.createdBy || 'system';
        
        if (newRetryCount >= MAX_RETRY_ATTEMPTS) {
          // Move to failed status after max retries
          console.error(`[iFox Generator] 💀 Task ${entry.id} failed after ${MAX_RETRY_ATTEMPTS} attempts, moving to 'failed' status`);
          try {
            await ifoxCalendarService.updateEntry(entry.id, {
              status: 'failed',
              retryCount: newRetryCount,
              lastErrorAt: new Date(),
              lastErrorReason: errorMessage,
            }, errorUserId);
          } catch (updateError) {
            console.error(`[iFox Generator] ❌ Failed to update task to failed status:`, updateError);
          }
        } else {
          // Reset to planned for retry, but increment retry counter
          console.log(`[iFox Generator] 🔄 Task ${entry.id} will retry (attempt ${newRetryCount}/${MAX_RETRY_ATTEMPTS})`);
          try {
            await ifoxCalendarService.updateEntry(entry.id, {
              status: 'planned',
              retryCount: newRetryCount,
              lastErrorAt: new Date(),
              lastErrorReason: errorMessage,
            }, errorUserId);
          } catch (updateError) {
            console.error(`[iFox Generator] ❌ Failed to update task status:`, updateError);
          }
        }
      }
    }

    console.log(`[iFox Generator] ✅ Batch processing complete`);
  } catch (error) {
    console.error("[iFox Generator] ❌ Error in content generator job:", error);
  } finally {
    isProcessing = false;
  }
}, {
  timezone: "Asia/Riyadh"
});

/**
 * Start the iFox content generator job
 */
export function startIfoxContentGeneratorJob() {
  console.log("[iFox Generator] 🚀 Starting iFox content generator job...");
  processScheduledContentTasks.start();
  console.log("[iFox Generator] ✅ Job started (runs every 15 minutes)");
}

/**
 * Stop the iFox content generator job
 */
export function stopIfoxContentGeneratorJob() {
  console.log("[iFox Generator] 🛑 Stopping iFox content generator job...");
  processScheduledContentTasks.stop();
  console.log("[iFox Generator] ✅ Job stopped");
}
