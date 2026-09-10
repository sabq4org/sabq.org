import { claimCalendarTask, completeCalendarTask } from "../services/ifox/taskPersistence";
import { db } from "../db";
import { ifoxEditorialCalendar } from "@shared/schema";
import { and, eq, sql } from "drizzle-orm";
import { isLeader } from "../leaderElection";
import cron from "../leaderCron";
import { ifoxCalendarService, ifoxPreferencesService, ifoxQualityService } from "../services/ifox";
import { AIArticleGenerator } from "../services/aiArticleGenerator";
import { aiImageGenerator } from "../services/aiImageGenerator";
import { sendArticleNotification } from "../notificationService";
import { storage } from "../storage";
import { nanoid } from "nanoid";

/**
 * iFox Content Generator Job
 * معالج تلقائي لمهام توليد المحتوى المجدولة
 *
 * يعمل كل 15 دقيقة للتحقق من المهام المجدولة وتنفيذها.
 *
 * حوكمة النشر: قرار «نشر مباشر أم مسودة» يخضع لإعدادات ifox_ai_preferences
 * (autoPublishEnabled / enableQualityCheck / autoPublishThreshold / requireHumanReview)
 * عبر resolvePublishDecision أدناه — الافتراضي الآمن هو المسودة.
 */

let isProcessing = false;

// Process at most 10 tasks per run to prevent worker monopolization
// This protects the system even when there's a large backlog after downtime
const MAX_BATCH_SIZE = 10;

// Maximum retry attempts before moving task to 'failed' status
const MAX_RETRY_ATTEMPTS = 3;

type PublishDecision = {
  status: 'published' | 'draft';
  reason: string;
  qualityScore?: number;
};

/**
 * يحسم قرار النشر وفق إعدادات الحوكمة الفعّالة.
 *
 * القاعدة: النشر الآلي لا يحدث إلا إذا فعّله المشغّل صراحة، ولم يشترط
 * مراجعة بشرية، واجتاز المقال بوابة الجودة (عند تفعيلها) بعتبة النشر الآلي.
 * أي غموض أو تعذّر (لا إعدادات، فشل فحص الجودة) يهبط بأمان إلى مسودة.
 */
async function resolvePublishDecision(params: {
  taskId: string;
  title: string;
  content: string;
  keywords: string[];
}): Promise<PublishDecision> {
  let prefs;
  try {
    prefs = await ifoxPreferencesService.getActivePreferences();
  } catch (prefsError) {
    console.error(`[iFox Generator] ⚠️ Failed to load AI preferences, defaulting to draft:`, prefsError);
    return { status: 'draft', reason: 'preferences_unavailable' };
  }

  if (!prefs || prefs.autoPublishEnabled !== true) {
    return { status: 'draft', reason: 'auto_publish_disabled' };
  }

  if (prefs.requireHumanReview === true) {
    return { status: 'draft', reason: 'human_review_required' };
  }

  const qualityCheckEnabled = prefs.enableQualityCheck !== false;
  if (!qualityCheckEnabled) {
    return { status: 'published', reason: 'auto_publish_enabled_no_quality_check' };
  }

  try {
    const check = await ifoxQualityService.checkArticleQuality({
      taskId: params.taskId,
      title: params.title,
      content: params.content,
      keywords: params.keywords,
    });

    const score = check.overallScore ?? 0;
    const threshold = prefs.autoPublishThreshold ?? 90;

    if (score >= threshold) {
      return { status: 'published', reason: 'quality_gate_passed', qualityScore: score };
    }
    return { status: 'draft', reason: `quality_below_threshold (${score} < ${threshold})`, qualityScore: score };
  } catch (qualityError) {
    // الفشل نحو الإنسان: تعذّر الفحص لا يعني تجاوز البوابة
    console.error(`[iFox Generator] ⚠️ Quality check failed, defaulting to draft:`, qualityError);
    return { status: 'draft', reason: 'quality_check_failed' };
  }
}

export const processScheduledContentTasks = cron.schedule('4,19,34,49 * * * *', async () => {
  if (isProcessing) {
    return;
  }

  isProcessing = true;

  try {
    const now = new Date();
    await db.update(ifoxEditorialCalendar).set({ status: "failed", lastErrorReason: "توقف العامل قبل اكتمال المهمة؛ تحتاج مراجعة", updatedAt: now })
      .where(and(eq(ifoxEditorialCalendar.status, "in_progress"),
        sql`${ifoxEditorialCalendar.updatedAt} < (clock_timestamp() at time zone 'UTC') - interval '30 minutes'`));
    
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
      if (!isLeader()) break;
      let claimedAt: Date | undefined;
      try {
        const topicIdea = entry.topicIdea || 'محتوى جديد';
        console.log(`[iFox Generator] 🚀 Processing task: ${topicIdea}`);

        // Update status to processing
        // Use system user ID if creator is not available
        const userId = entry.createdBy || 'system';
        const claim = await claimCalendarTask(entry.id, userId);
        if (!claim) continue;
        claimedAt = claim.updatedAt;

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
        // STEP 4: Resolve publish decision (governance gate)
        // ========================================
        const decision = await resolvePublishDecision({
          taskId: entry.id,
          title: generatedArticle.title,
          content: generatedArticle.content,
          keywords,
        });
        console.log(
          `[iFox Generator] 🛂 Publish decision: ${decision.status} (${decision.reason})` +
          (decision.qualityScore !== undefined ? ` — quality ${decision.qualityScore}/100` : '')
        );

        // ========================================
        // STEP 5: Create Article in Database
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
          
          // Publishing status — governed by resolvePublishDecision above
          status: decision.status,
          publishedAt: decision.status === 'published' ? now : undefined,
          
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

        const createdArticle = await completeCalendarTask(entry.id, claimedAt!, userId,
          decision.status === "published", async tx => {
            if (!isLeader()) throw new Error("iFox task leadership lost");
            return storage.createArticle(articleData, tx);
          });

        // ========================================
        // STEP 6: Send Notifications
        // ========================================
        if (decision.status === 'published') {
          try {
            await sendArticleNotification(createdArticle, 'published');
            console.log(`[iFox Generator] 📢 Notification sent for published article`);
          } catch (notifError) {
            console.warn(`[iFox Generator] ⚠️ Failed to send notification (non-critical):`, notifError);
            // Non-critical - article is published, notification just failed
          }
        }

        console.log(`[iFox Generator] ✅ Task completed successfully: ${topicIdea}`);
        console.log(
          decision.status === 'published'
            ? `[iFox Generator] 📰 Article published: ${createdArticle.id} - "${createdArticle.title}"`
            : `[iFox Generator] 📝 Article saved as draft pending review: ${createdArticle.id} - "${createdArticle.title}"`
        );
      } catch (error) {
        if (!claimedAt) continue;
        const updateOwned = (values: Record<string, unknown>) => db.update(ifoxEditorialCalendar)
          .set({ ...values, updatedAt: new Date(), updatedBy: entry.createdBy || "system" })
          .where(and(eq(ifoxEditorialCalendar.id, entry.id), eq(ifoxEditorialCalendar.status, "in_progress"),
            eq(ifoxEditorialCalendar.updatedAt, claimedAt!)));
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[iFox Generator] ❌ Error processing task ${entry.id}:`, errorMessage);
        
        // Increment retry counter and check if we should give up
        const currentRetryCount = entry.retryCount || 0;
        const newRetryCount = currentRetryCount + 1;
        
        // Use system user ID for error handling if creator is not available
        
        if (newRetryCount >= MAX_RETRY_ATTEMPTS) {
          // Move to failed status after max retries
          console.error(`[iFox Generator] 💀 Task ${entry.id} failed after ${MAX_RETRY_ATTEMPTS} attempts, moving to 'failed' status`);
          try {
            await updateOwned({
              status: 'failed',
              retryCount: newRetryCount,
              lastErrorAt: new Date(),
              lastErrorReason: errorMessage,
            });
          } catch (updateError) {
            console.error(`[iFox Generator] ❌ Failed to update task to failed status:`, updateError);
          }
        } else {
          // Reset to planned for retry, but increment retry counter
          console.log(`[iFox Generator] 🔄 Task ${entry.id} will retry (attempt ${newRetryCount}/${MAX_RETRY_ATTEMPTS})`);
          try {
            await updateOwned({
              status: 'planned',
              retryCount: newRetryCount,
              lastErrorAt: new Date(),
              lastErrorReason: errorMessage,
            });
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
